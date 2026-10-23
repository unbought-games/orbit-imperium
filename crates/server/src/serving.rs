//! Shared preparation, role-aware serving, and bounded process draining.
use crate::{config::ServeConfig, engine_executor::BoundedEngine, runtime};
use orbit_application::StoreError;
use orbit_storage_postgres::PgStore;
use orbit_transport_http::{HttpConfig, router_with_profiles};
use std::{
    error::Error,
    future::Future,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    sync::{Notify, watch},
    task::JoinHandle,
};
type ServeResult = Result<(), Box<dyn Error>>;

pub async fn serve(store: PgStore, serve: ServeConfig) -> ServeResult {
    let oidc = serve
        .oidc
        .clone()
        .map(unbought_auth::RelyingParty::new)
        .transpose()?;
    let metrics = Arc::new(crate::metrics::RuntimeMetrics::new());
    let store = store.with_observer(metrics.clone());
    let started = Instant::now();
    let bind = if serve.role.serves_api() {
        let addresses: Vec<_> = tokio::time::timeout(
            Duration::from_secs(3),
            tokio::net::lookup_host(serve.bind.as_str()),
        )
        .await??
        .collect();
        if addresses.is_empty() {
            return Err("ORBIT_BIND did not resolve to any listening addresses".into());
        }
        addresses
    } else {
        vec![]
    };
    let phase = Instant::now();
    store.migrate().await?;
    eprintln!("startup schema_ms={}", phase.elapsed().as_millis());
    let (mut guard,listener,metrics_listener,prepared)=tokio::time::timeout(Duration::from_secs(5),async {
        let guard=store.acquire_server_guard().await?;
        let phase=Instant::now();
        let prepared=crate::universe_serving::prepare(store, &serve).await
            .map_err(|e|format!("Startup refused: {e}"))?;
        eprintln!("startup configuration_ms={}",phase.elapsed().as_millis());
        let phase=Instant::now();prepared.store.check_serving_compatibility(serve.speed).await
            .map_err(|e|format!("Startup refused: incompatible schema/profile or conflicting ORBIT_SPEED; {e}"))?;
        eprintln!("startup compatibility_ms={}",phase.elapsed().as_millis());
        let listener=if serve.role.serves_api() {Some(tokio::net::TcpListener::bind(bind.as_slice()).await?)}else{None};
        let metrics_listener=if let Some(bind)=serve.metrics_bind {Some(tokio::net::TcpListener::bind(bind).await?)}else{None};
        Ok::<_,Box<dyn Error>>((guard,listener,metrics_listener,prepared))
    }).await.map_err(|_|"Startup refused: preparation exceeded 5 seconds; no readiness granted")??;
    let store = prepared.store;
    let (drain_tx, drain_rx) = watch::channel(false);
    let analytics =
        crate::analytics::Integration::from_env(store.clone(), oidc.clone(), serve.origin.clone())?;
    let _analytics_worker = analytics
        .as_ref()
        .map(|integration| BackgroundTask(tokio::spawn(integration.clone().run(drain_rx.clone()))));
    let wake = Arc::new(Notify::new());
    let scheduler = if serve.role.runs_worker() {
        Some(Scheduler(tokio::spawn(runtime::run(
            store.clone(),
            BoundedEngine::new(serve.cpu_parallelism)?.with_observer(metrics.clone()),
            wake.clone(),
            drain_rx.clone(),
            serve.max_in_flight,
            serve.drain_timeout,
        ))))
    } else {
        None
    };
    let _updates = serve.role.serves_api().then(|| {
        let store = store.clone();
        let drain = drain_rx.clone();
        BackgroundTask(tokio::spawn(async move {
            store.listen_updates(drain).await;
        }))
    });
    let server = if listener.is_some() || metrics_listener.is_some() {
        let private_store = store.clone();
        let private_metrics = metrics.clone();
        let private_drain = drain_rx.clone();
        let config = HttpConfig {
            origin: serve.origin,
            secure_cookies: serve.secure_cookies,
            assets: serve.assets,
            signup: prepared.signup,
            signup_per_minute: prepared.legacy_signup_per_minute,
            legacy_signup_enabled: prepared.legacy_enabled,
            login_per_minute: serve.login_per_minute,
            trusted_fly_proxies: serve.trusted_fly_proxies,
            wake: Some(wake),
            observer: Some(metrics),
        };
        Some(HttpTask(tokio::spawn(async move {
            let public = async move {
                if let Some(listener) = listener {
                    orbit_transport_http::serve(
                        listener,
                        {
                            let router = router_with_profiles(
                                store,
                                config,
                                drain_rx.clone(),
                                oidc,
                                serve.profiles,
                            );
                            if let Some(integration) = analytics {
                                router.merge(integration.router())
                            } else {
                                router.merge(crate::analytics::disabled_router())
                            }
                        },
                        wait_for_drain(drain_rx),
                    )
                    .await
                } else {
                    Ok(())
                }
            };
            let private = async move {
                if let Some(listener) = metrics_listener {
                    crate::metrics::serve(listener, private_store, private_metrics, private_drain)
                        .await
                } else {
                    Ok(())
                }
            };
            tokio::try_join!(public, private).map(|_| ())
        })))
    } else {
        None
    };
    eprintln!(
        "startup role={:?} serving_ms={}",
        serve.role,
        started.elapsed().as_millis()
    );
    supervise(
        server,
        scheduler,
        guard.monitor(),
        crate::shutdown(),
        drain_tx,
        serve.drain_timeout + Duration::from_secs(5),
    )
    .await
}
async fn wait_for_drain(mut drain: watch::Receiver<bool>) {
    while !*drain.borrow() {
        if drain.changed().await.is_err() {
            break;
        }
    }
}
struct Scheduler(JoinHandle<Result<(), StoreError>>);
impl Drop for Scheduler {
    fn drop(&mut self) {
        self.0.abort();
    }
}
struct HttpTask(JoinHandle<Result<(), std::io::Error>>);
impl Drop for HttpTask {
    fn drop(&mut self) {
        self.0.abort();
    }
}
async fn worker_result(
    worker: &mut Option<Scheduler>,
) -> Result<Result<(), StoreError>, tokio::task::JoinError> {
    match worker {
        Some(worker) => (&mut worker.0).await,
        None => std::future::pending().await,
    }
}
async fn http_result(
    server: &mut Option<HttpTask>,
) -> Result<Result<(), std::io::Error>, tokio::task::JoinError> {
    match server {
        Some(server) => (&mut server.0).await,
        None => std::future::pending().await,
    }
}
async fn supervise(
    mut server: Option<HttpTask>,
    mut scheduler: Option<Scheduler>,
    guard: impl Future<Output = Result<(), StoreError>>,
    shutdown: impl Future<Output = ()>,
    drain: watch::Sender<bool>,
    grace: Duration,
) -> ServeResult {
    tokio::pin!(guard);
    tokio::select! {
        _=shutdown=>{},
        result=http_result(&mut server)=>{server=None; result??;},
        result=worker_result(&mut scheduler)=>{result?.map_err(|e| format!("scheduler stopped: {e}"))?; return Err("scheduler stopped unexpectedly".into());},
        result=&mut guard=>{result.map_err(|e| format!("operator guard check failed: {e}"))?;return Err("operator guard monitor stopped unexpectedly".into());},
    }
    drain.send_replace(true);
    let finish = async {
        if server.is_some() {
            http_result(&mut server).await??;
        }
        if scheduler.is_some() {
            worker_result(&mut scheduler).await??;
        }
        Ok::<_, Box<dyn Error>>(())
    };
    tokio::select! {
        result=tokio::time::timeout(grace,finish)=>match result {
            Ok(result)=>result,
            Err(_)=>{eprintln!("shutdown grace expired; remaining tasks aborted and accepted work retained");Ok(())}
        },
        result=&mut guard=>{result.map_err(|e| format!("operator guard check failed: {e}"))?;Err("operator guard monitor stopped unexpectedly".into())}
    }
}

struct BackgroundTask(JoinHandle<()>);
impl Drop for BackgroundTask {
    fn drop(&mut self) {
        self.0.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn scheduler_exit_terminates_serving_instead_of_leaving_health_green() {
        let worker = Scheduler(tokio::spawn(async { Err(StoreError::UnsupportedState) }));
        let (drain, _) = watch::channel(false);
        assert!(
            supervise(
                None,
                Some(worker),
                std::future::pending(),
                std::future::pending(),
                drain,
                Duration::from_secs(1)
            )
            .await
            .is_err()
        );
    }
    #[tokio::test]
    async fn guard_loss_stops_api_only_and_combined_roles() {
        for combined in [false, true] {
            let http = HttpTask(tokio::spawn(std::future::pending()));
            let handle = http.0.abort_handle();
            let worker = combined.then(|| Scheduler(tokio::spawn(std::future::pending())));
            let (drain, _) = watch::channel(false);
            assert!(
                supervise(
                    Some(http),
                    worker,
                    async { Err(StoreError::Unavailable) },
                    std::future::pending(),
                    drain,
                    Duration::from_secs(1)
                )
                .await
                .is_err()
            );
            tokio::task::yield_now().await;
            assert!(handle.is_finished());
        }
    }
    #[tokio::test]
    async fn worker_only_shutdown_drains_without_a_public_http_listener() {
        let (drain, rx) = watch::channel(false);
        let worker = Scheduler(tokio::spawn(async move {
            wait_for_drain(rx).await;
            Ok(())
        }));
        assert!(
            supervise(
                None,
                Some(worker),
                std::future::pending(),
                async {},
                drain,
                Duration::from_secs(1)
            )
            .await
            .is_ok()
        );
    }
}

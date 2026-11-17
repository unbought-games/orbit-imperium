//! Shared preparation, role-aware serving, and bounded process draining.
use crate::{
    config::ServeConfig,
    engine_executor::BoundedEngine,
    logging::{failure, io_failure, task_failure},
    runtime,
};
use orbit_application::StoreError;
use orbit_storage_postgres::PgStore;
use orbit_transport_http::{Customization, HttpConfig, router_with_customization};
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

pub async fn serve(store: PgStore, mut serve: ServeConfig) -> ServeResult {
    let oidc = serve
        .oidc
        .clone()
        .map(unbought_auth::RelyingParty::new)
        .transpose()
        .map_err(|e| failure("oidc_configuration", "OidcConfigurationFailed", e))?;
    let announcements = match &serve.asset_store {
        Some(config) => Some(orbit_transport_http::announcement_router(Arc::new(
            orbit_storage_assets::announcements::AnnouncementStorage::connect(config)
                .await
                .map_err(|e| failure("announcement_storage", "AssetConnectionFailed", e))?,
        ))),
        None => None,
    };
    let customization = if let Some(config) = &serve.asset_store {
        let assets = config
            .connect()
            .await
            .map_err(|e| failure("cosmetic_storage", "AssetConnectionFailed", e))?;
        let mut customization = Customization::load(
            serve.cosmetic_policy,
            assets,
            serve.cosmetic_catalog.as_deref(),
        )
        .await
        .map_err(|e| failure("cosmetic_catalog", "CatalogLoadFailed", e))?;
        customization.media_limits = serve.media_limits;
        Some(customization)
    } else {
        None
    };
    let metrics = Arc::new(crate::metrics::RuntimeMetrics::new());
    let observer = Arc::new(orbit_transport_http::RequestTimingObserver(metrics.clone()));
    let store = store.with_observer(observer.clone());
    let started = Instant::now();
    let bind = if serve.role.serves_api() {
        let addresses: Vec<_> = tokio::time::timeout(
            Duration::from_secs(3),
            tokio::net::lookup_host(serve.bind.as_str()),
        )
        .await
        .map_err(|e| failure("bind_dns", "DnsTimeout", e))?
        .map_err(|e| io_failure("bind_dns", e))?
        .collect();
        if addresses.is_empty() {
            return Err(failure(
                "bind_dns",
                "NoListeningAddresses",
                "ORBIT_BIND did not resolve to any listening addresses",
            )
            .into());
        }
        addresses
    } else {
        vec![]
    };
    let phase = Instant::now();
    store
        .migrate()
        .await
        .map_err(|e| failure("schema", "MigrationFailed", e))?;
    orbit_application::orbit_log!(
        INFO,
        event = "startup_phase",
        stage = "schema",
        duration_ms = phase.elapsed().as_millis() as u64
    );
    let (mut guard, listener, metrics_listener, prepared) =
        tokio::time::timeout(Duration::from_secs(5), async {
            let guard = store
                .acquire_server_guard()
                .await
                .map_err(|e| failure("operator_guard", "GuardAcquisitionFailed", e))?;
            let phase = Instant::now();
            let prepared = crate::universe_serving::prepare(store, &serve)
                .await
                .map_err(|e| {
                    failure(
                        "universe_preparation",
                        "UniversePreparationFailed",
                        format!("Startup refused: {e}"),
                    )
                })?;
            orbit_application::orbit_log!(
                INFO,
                event = "startup_phase",
                stage = "configuration",
                duration_ms = phase.elapsed().as_millis() as u64
            );
            let phase = Instant::now();
            prepared
                .store
                .check_serving_compatibility(serve.speed)
                .await
                .map_err(|e| format!("Startup refused: {e}"))?;
            orbit_application::orbit_log!(
                INFO,
                event = "startup_phase",
                stage = "compatibility",
                duration_ms = phase.elapsed().as_millis() as u64
            );
            let listener = if serve.role.serves_api() {
                Some(
                    tokio::net::TcpListener::bind(bind.as_slice())
                        .await
                        .map_err(|e| io_failure("api_bind", e))?,
                )
            } else {
                None
            };
            let metrics_listener = if let Some(bind) = serve.metrics_bind {
                Some(
                    tokio::net::TcpListener::bind(bind)
                        .await
                        .map_err(|e| io_failure("metrics_bind", e))?,
                )
            } else {
                None
            };
            Ok::<_, Box<dyn Error>>((guard, listener, metrics_listener, prepared))
        })
        .await
        .map_err(|_| {
            failure(
                "startup_preparation",
                "PreparationTimeout",
                "Startup refused: preparation exceeded 5 seconds; no readiness granted",
            )
        })??;
    let store = prepared.store;
    let (drain_tx, drain_rx) = watch::channel(false);
    let analytics =
        crate::analytics::Integration::from_env(store.clone(), oidc.clone(), serve.origin.clone())
            .map_err(|e| failure("analytics_configuration", "AnalyticsConfigurationFailed", e))?;
    let rewards = crate::community_rewards::Integration::from_env(
        store.clone(),
        oidc.clone(),
        serve.origin.clone(),
        customization.as_ref(),
        serve.assets.clone(),
    )
    .map_err(|e| failure("rewards_configuration", "RewardsConfigurationFailed", e))?;
    if let Some(rewards) = &rewards {
        serve.profiles = serve
            .profiles
            .map(|profiles| profiles.with_rewards(rewards.observations.clone()));
    }
    let _ship_appearances = if serve.role.serves_api() {
        let renderer = crate::ship_appearances::configured_renderer()?;
        customization.clone().map(|customization| {
            BackgroundTask(tokio::spawn(crate::ship_appearances::run(
                store.clone(),
                customization,
                serve.profiles.clone(),
                renderer,
                drain_rx.clone(),
            )))
        })
    } else {
        None
    };
    let _rewards_worker = if serve.role.runs_worker() {
        rewards.as_ref().map(|integration| {
            BackgroundTask(tokio::spawn(integration.clone().run(drain_rx.clone())))
        })
    } else {
        None
    };
    let rewards_router = rewards
        .as_ref()
        .map_or_else(crate::community_rewards::disabled_router, |integration| {
            integration.router()
        });
    let _analytics_worker = analytics
        .as_ref()
        .map(|integration| BackgroundTask(tokio::spawn(integration.clone().run(drain_rx.clone()))));
    let _publications = serve.role.runs_worker().then(|| {
        BackgroundTask(tokio::spawn(crate::public_universe::run(
            store.clone(),
            metrics.clone(),
            drain_rx.clone(),
        )))
    });
    let wake = Arc::new(Notify::new());
    let scheduler = if serve.role.runs_worker() {
        Some(Scheduler(tokio::spawn(runtime::run(
            store.clone(),
            BoundedEngine::new(serve.cpu_parallelism)
                .map_err(|e| failure("engine_configuration", "InvalidCpuParallelism", e))?
                .with_observer(observer.clone()),
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
            account_url: serve.account_url,
            origin: serve.origin,
            assets: serve.assets,
            signup: prepared.signup,
            signup_per_minute: prepared.legacy_signup_per_minute,
            legacy_signup_enabled: prepared.legacy_enabled,
            login_per_minute: serve.login_per_minute,
            wake: Some(wake.clone()),
            observer: Some(observer),
        };
        #[cfg(feature = "test-support")]
        let lab_router = std::env::var("ORBIT_LAB_WAKE_TOKEN")
            .ok()
            .filter(|token| token.len() >= 32)
            .map(|token| crate::lab_support::router(wake, token, store.clone()));
        Some(HttpTask(tokio::spawn(async move {
            let public = async move {
                if let Some(listener) = listener {
                    orbit_transport_http::serve(
                        listener,
                        {
                            let router = router_with_customization(
                                store,
                                config,
                                drain_rx.clone(),
                                oidc,
                                serve.profiles,
                                customization.expect("API asset store prepared"),
                            )
                            .merge(announcements.expect("API announcement storage prepared"))
                            .merge(rewards_router);
                            #[cfg(feature = "test-support")]
                            let router = if let Some(lab) = lab_router {
                                router.merge(lab)
                            } else {
                                router
                            };
                            if let Some(integration) = analytics {
                                integration.instrument(router.merge(integration.router()))
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
    orbit_application::orbit_log!(
        INFO,
        event = "serve_ready",
        duration_ms = started.elapsed().as_millis() as u64
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
    let stopped: ServeResult = tokio::select! {
        _=shutdown=>Ok(()),
        result=http_result(&mut server)=>{server=None; result.map_err(|e| failure("http_task", "HttpTaskFailed", e).into()).and_then(|r| r.map_err(|e| io_failure("http_server", e).into()))},
        result=worker_result(&mut scheduler)=>{task_failure("scheduler", &result); Err(format!("scheduler stopped: {result:?}").into())},
        result=&mut guard=>{failure("operator_guard", "GuardMonitorStopped", ()); Err(format!("operator guard stopped: {result:?}").into())},
    };
    // Publish unready before cancelling tasks, including on guard loss. Never
    // gracefully continue uncertain writers after a retained fence fails.
    orbit_application::orbit_log!(INFO, event = "serve_draining", stage = "shutdown");
    drain.send_replace(true);
    stopped?;
    let finish = async {
        if server.is_some() {
            http_result(&mut server)
                .await
                .map_err(|e| failure("http_drain", "HttpTaskFailed", e))?
                .map_err(|e| io_failure("http_drain", e))?;
        }
        if scheduler.is_some() {
            let result = worker_result(&mut scheduler).await;
            if !matches!(result, Ok(Ok(()))) {
                task_failure("scheduler_drain", &result);
            }
            result??;
        }
        Ok::<_, Box<dyn Error>>(())
    };
    tokio::select! {
        result=tokio::time::timeout(grace,finish)=>match result {
            Ok(result)=>result,
            Err(_)=>{orbit_application::orbit_log!(WARN, event = "shutdown_grace_expired", outcome = "leases_recoverable");Ok(())}
        },
        result=&mut guard=>{failure("operator_guard_drain", "GuardMonitorStopped", ()); result.map_err(|e| format!("operator guard check failed: {e}"))?;Err("operator guard monitor stopped unexpectedly".into())}
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
            let (drain, readiness) = watch::channel(false);
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
            assert!(*readiness.borrow(), "fence failure must publish unready");
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

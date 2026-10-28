use orbit_application::{
    Claim, EngineExecutor, ExecutorMode, GameService, GameStore, RulesUpdateError, ScopedClaim,
    ScopedOrderStore, ServiceError, StepOutcome, StoreError,
};
use orbit_engine::{InputId, UniverseId};
use orbit_storage_postgres::PgStore;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
    time::Duration,
};
use tokio::{
    sync::{Notify, watch},
    task::JoinSet,
};
use uuid::Uuid;

#[derive(Clone)]
enum Attempt {
    Serial(Claim),
    Scoped(ScopedClaim),
}
impl Attempt {
    fn id(&self) -> InputId {
        match self {
            Self::Serial(c) => c.input.id,
            Self::Scoped(c) => c.input.id,
        }
    }
    async fn release(&self, store: &PgStore) -> Result<(), StoreError> {
        match self {
            Self::Serial(c) => store.release_serial(c).await,
            Self::Scoped(c) => store.release_scoped(c).await,
        }
    }
    async fn renew(&self, store: &PgStore) {
        match self {
            Self::Serial(c) => {
                let _ = store.renew_claim(c).await;
            }
            Self::Scoped(c) => {
                let _ = store.renew_scoped(c).await;
            }
        }
    }
}
enum Completed {
    Input(InputId, Result<StepOutcome, ServiceError>),
    Barrier(UniverseId, Result<bool, RulesUpdateError>),
}

pub async fn run<E: EngineExecutor + Clone + 'static>(
    store: PgStore,
    executor: E,
    wake: Arc<Notify>,
    mut drain: watch::Receiver<bool>,
    max_in_flight: usize,
    drain_timeout: Duration,
) -> Result<(), StoreError> {
    let mut universes = store.universes().await?;
    let mut refresh_worlds = tokio::time::Instant::now();
    let worker = Uuid::new_v4().into();
    let mut tasks = JoinSet::new();
    let mut active = BTreeMap::new();
    let mut barriers = BTreeSet::new();
    let mut cursor = 0;
    let _maintenance = start_retention(store.clone(), drain.clone());
    let result = async {
        while !*drain.borrow() {
            if refresh_worlds.elapsed() >= Duration::from_secs(1) { universes = store.universes().await?; refresh_worlds = tokio::time::Instant::now(); }
            let mut claimed_any = false;
            for _ in 0..universes.len() {
                if tasks.len() >= max_in_flight || *drain.borrow() { break; }
                let u = universes[cursor % universes.len()];
                cursor = cursor.wrapping_add(1);
                match attempt_claim(&store, u, worker).await {
                    Ok(Some(claim)) => {
                        claimed_any = true;
                        active.insert(claim.id(),claim.clone());
                        let store=store.clone(); let executor=executor.clone();
                        tasks.spawn(async move {
                            let service=GameService::new(store.clone());
                            let id=claim.id();
                            let renew=claim.clone();
                            let outcome=resolve_with_renewal(async {
                                match claim {
                                    Attempt::Serial(c)=>service.resolve_claim_with_executor(c,&executor).await,
                                    Attempt::Scoped(c)=>service.resolve_scoped_claim(c,&executor).await,
                                }
                            }, move || { let store=store.clone(); let claim=renew.clone(); async move { claim.renew(&store).await; } }).await;
                            Completed::Input(id,outcome)
                        });
                    }
                    Ok(None) => {
                        if !barriers.contains(&u) && tasks.len()<max_in_flight {
                            barriers.insert(u);
                            let store=store.clone();
                            tasks.spawn(async move { Completed::Barrier(u,store.process_runtime_barrier(u).await) });
                        }
                    }
                    Err(error)=>claim_failure(error)?,
                }
            }
            if claimed_any && tasks.len() < max_in_flight { continue; }
            tokio::select! {
                changed=drain.changed()=>{ if changed.is_err() || *drain.borrow() {break;} },
                done=tasks.join_next(), if !tasks.is_empty()=>{
                    let done=done.ok_or(StoreError::Unavailable)?.map_err(|_| StoreError::Unavailable)?;
                    let progressed=complete(done,&mut active,&mut barriers,&store).await?;
                    if !progressed {
                        tokio::select! { _=tokio::time::sleep(Duration::from_millis(100))=>{}, _=wake.notified()=>{}, _=drain.changed()=>{} }
                    }
                },
                _=wake.notified()=>{},
                _=tokio::time::sleep(Duration::from_millis(25)), if tasks.len()<max_in_flight=>{},
            }
        }
        Ok(())
    }.await;
    // Stop claiming first; task-local renewals remain alive throughout grace.
    let finished = tokio::time::timeout(drain_timeout, async {
        while let Some(done) = tasks.join_next().await {
            complete(
                done.map_err(|_| StoreError::Unavailable)?,
                &mut active,
                &mut barriers,
                &store,
            )
            .await?;
        }
        Ok::<_, StoreError>(())
    })
    .await;
    if !matches!(finished, Ok(Ok(()))) {
        tasks.abort_all();
        while tasks.join_next().await.is_some() {}
        // Cancellation can leave blocking CPU work running. Fences make its
        // result unusable even if it returns before this process exits.
        let release = async {
            for attempt in active.values() {
                match attempt.release(&store).await {
                    Ok(()) | Err(StoreError::StaleClaim) => {}
                    Err(error) => eprintln!("drain release {}: {error}", attempt.id()),
                }
            }
        };
        if tokio::time::timeout(Duration::from_secs(3), release)
            .await
            .is_err()
        {
            eprintln!("drain release timed out; durable leases remain recoverable after expiry");
        }
    }
    result
}
// The mode lookup shares the claim's failure handling: pool timeouts are transient.
async fn attempt_claim(
    store: &PgStore,
    u: UniverseId,
    worker: orbit_engine::WorkerId,
) -> Result<Option<Attempt>, StoreError> {
    Ok(match store.runtime_mode(u).await?.mode {
        ExecutorMode::Scoped => store.claim_scoped(u, worker).await?.map(Attempt::Scoped),
        _ => store.claim_next(u, worker).await?.map(Attempt::Serial),
    })
}
fn claim_failure(error: StoreError) -> Result<(), StoreError> {
    if matches!(error, StoreError::UnsupportedState) {
        return Err(error);
    }
    eprintln!("scheduler claim: {error}");
    Ok(())
}
async fn complete(
    done: Completed,
    active: &mut BTreeMap<InputId, Attempt>,
    barriers: &mut BTreeSet<UniverseId>,
    store: &PgStore,
) -> Result<bool, StoreError> {
    match done {
        Completed::Input(id, outcome) => {
            let claim = active.remove(&id);
            if matches!(
                &outcome,
                Ok(StepOutcome::Retry) | Err(ServiceError::Unavailable)
            ) {
                store.observe_event(orbit_application::RuntimeEvent::StorageRetry);
            }
            if let Err(error) = &outcome {
                eprintln!("scheduler input={id}: {error}");
            }
            let progressed = resolution_progress(outcome);
            if let Some(claim) = claim {
                let _ = claim.release(store).await;
            }
            progressed
        }
        Completed::Barrier(u, result) => {
            barriers.remove(&u);
            match result {
                Ok(progressed) => Ok(progressed),
                Err(RulesUpdateError::Store(StoreError::UnsupportedState)) => {
                    Err(StoreError::UnsupportedState)
                }
                Err(error) => {
                    eprintln!("rules activation {u}: {error}");
                    Ok(false)
                }
            }
        }
    }
}
// Retention uses at most one worker-pool connection and never occupies a claim
// or CPU slot. A busy single-slot engine therefore cannot be starved by cleanup.
fn start_retention(store: PgStore, mut drain: watch::Receiver<bool>) -> RenewalGuard {
    RenewalGuard(tokio::spawn(async move {
        loop {
            tokio::select! {_=tokio::time::sleep(Duration::from_secs(60))=>{},_=drain.changed()=>return}
            loop {
                let result = tokio::select! {result=store.prune_game_updates()=>result,_=drain.changed()=>return};
                match result {
                    Ok(1000) => {}
                    Ok(_) => break,
                    Err(error) => {
                        eprintln!("update retention: {error}");
                        store.observe_event(orbit_application::RuntimeEvent::StorageRetry);
                        break;
                    }
                }
                tokio::select! {_=tokio::time::sleep(Duration::from_millis(100))=>{},_=drain.changed()=>return}
            }
        }
    }))
}

fn resolution_progress(outcome: Result<StepOutcome, ServiceError>) -> Result<bool, StoreError> {
    match outcome {
        Ok(StepOutcome::Committed { .. }) => Ok(true),
        Ok(_) => Ok(false),
        Err(ServiceError::UnsupportedState) => Err(StoreError::UnsupportedState),
        Err(_) => Ok(false),
    }
}
struct RenewalGuard(tokio::task::JoinHandle<()>);
impl Drop for RenewalGuard {
    fn drop(&mut self) {
        self.0.abort();
    }
}
async fn resolve_with_renewal<T, F, R>(
    resolution: impl std::future::Future<Output = T>,
    mut renew: F,
) -> T
where
    F: FnMut() -> R + Send + 'static,
    R: std::future::Future<Output = ()> + Send + 'static,
{
    let _renewal = RenewalGuard(tokio::spawn(async move {
        let mut interval = tokio::time::interval_at(
            tokio::time::Instant::now() + Duration::from_secs(5),
            Duration::from_secs(5),
        );
        loop {
            interval.tick().await;
            renew().await;
        }
    }));
    resolution.await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transient_resolution_errors_keep_scheduler_alive_but_capability_errors_stop_it() {
        for error in [StoreError::Unavailable, StoreError::StaleClaim] {
            assert!(!resolution_progress(Err(error.into())).unwrap());
        }
        assert!(matches!(
            resolution_progress(Err(StoreError::UnsupportedState.into())),
            Err(StoreError::UnsupportedState)
        ));
        assert!(!resolution_progress(Ok(StepOutcome::Retry)).unwrap());
    }
    #[test]
    fn transient_claim_failures_keep_scheduler_alive_but_capability_errors_stop_it() {
        for error in [StoreError::Unavailable, StoreError::StaleClaim] {
            assert!(claim_failure(error).is_ok());
        }
        assert!(matches!(
            claim_failure(StoreError::UnsupportedState),
            Err(StoreError::UnsupportedState)
        ));
    }
    #[tokio::test(start_paused = true)]
    async fn gated_resolution_progresses_while_renewal_waits_for_its_lock() {
        let gate = Arc::new(tokio::sync::Mutex::new(()));
        let a = gate.clone();
        let b = gate.clone();
        let result = tokio::time::timeout(
            Duration::from_secs(8),
            resolve_with_renewal(
                async move {
                    let _held = a.lock().await;
                    tokio::time::sleep(Duration::from_secs(6)).await;
                    42
                },
                move || {
                    let gate = b.clone();
                    async move {
                        let _held = gate.lock().await;
                    }
                },
            ),
        )
        .await;
        assert_eq!(result, Ok(42));
        tokio::task::yield_now().await;
        assert!(gate.try_lock().is_ok());
    }
}

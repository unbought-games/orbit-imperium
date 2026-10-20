use crate::{StoreError, UniverseId};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, serde::Serialize)]
pub struct RuntimeStatus {
    pub oldest_pending_age_ms: Option<i64>,
    pub oldest_due_lag_ms: Option<i64>,
    pub blocked_scope_count: u64,
}
pub trait RuntimeStatusStore: Send + Sync {
    fn runtime_status(
        &self,
        universe: UniverseId,
    ) -> impl Future<Output = Result<RuntimeStatus, StoreError>> + Send;
}
#[derive(Clone, Copy)]
#[repr(usize)]
pub enum RuntimeStage {
    Admission,
    Read,
    Settlement,
    OrderingWait,
    OrderingHold,
    PoolWait,
    Engine,
    EngineQueue,
    DependencyWait,
    Delivery,
}
impl RuntimeStage {
    pub const ALL: [Self; 10] = [
        Self::Admission,
        Self::Read,
        Self::Settlement,
        Self::OrderingWait,
        Self::OrderingHold,
        Self::PoolWait,
        Self::Engine,
        Self::EngineQueue,
        Self::DependencyWait,
        Self::Delivery,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::Admission => "admission",
            Self::Read => "read",
            Self::Settlement => "settlement",
            Self::OrderingWait => "ordering_wait",
            Self::OrderingHold => "ordering_hold",
            Self::PoolWait => "pool_wait",
            Self::Engine => "engine",
            Self::EngineQueue => "engine_queue",
            Self::DependencyWait => "dependency_wait",
            Self::Delivery => "delivery",
        }
    }
}
#[derive(Clone, Copy)]
#[repr(usize)]
pub enum RuntimeEvent {
    ClaimRecovered,
    StaleCommit,
    StorageRetry,
    ScopeBlocked,
    Committed,
    HttpFailure,
    EngineStarted,
    EngineFinished,
}
impl RuntimeEvent {
    pub const ALL: [Self; 8] = [
        Self::ClaimRecovered,
        Self::StaleCommit,
        Self::StorageRetry,
        Self::ScopeBlocked,
        Self::Committed,
        Self::HttpFailure,
        Self::EngineStarted,
        Self::EngineFinished,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::ClaimRecovered => "claim_recovered",
            Self::StaleCommit => "stale_commit",
            Self::StorageRetry => "storage_retry",
            Self::ScopeBlocked => "scope_blocked",
            Self::Committed => "committed",
            Self::HttpFailure => "http_failure",
            Self::EngineStarted => "engine_started",
            Self::EngineFinished => "engine_finished",
        }
    }
}
pub trait RuntimeObserver: Send + Sync {
    fn duration(&self, stage: RuntimeStage, elapsed: Duration);
    fn event(&self, event: RuntimeEvent);
}
pub struct NoopRuntimeObserver;
impl RuntimeObserver for NoopRuntimeObserver {
    fn duration(&self, _: RuntimeStage, _: Duration) {}
    fn event(&self, _: RuntimeEvent) {}
}
pub struct RuntimeTimer {
    observer: Arc<dyn RuntimeObserver>,
    stage: RuntimeStage,
    started: Instant,
}
impl RuntimeTimer {
    pub fn new(observer: Arc<dyn RuntimeObserver>, stage: RuntimeStage) -> Self {
        Self {
            observer,
            stage,
            started: Instant::now(),
        }
    }
}
impl Drop for RuntimeTimer {
    fn drop(&mut self) {
        self.observer.duration(self.stage, self.started.elapsed());
    }
}

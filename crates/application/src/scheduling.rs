use crate::*;
use orbit_engine::{OrderKey, OrderedInput, ScopeKey};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug)]
pub struct ScopedClaim {
    pub input: OrderedInput,
    pub scopes: BTreeSet<ScopeKey>,
    pub owner: WorkerId,
    pub token: uuid::Uuid,
    pub scope_fences: BTreeMap<ScopeKey, i64>,
    pub mode_generation: i64,
    pub lease_until: i64,
}
impl ScopedClaim {
    pub fn key(&self) -> OrderKey {
        OrderKey {
            at_ms: self.input.at,
            phase: self.input.phase as u8,
            ordinal: self.input.sequence,
        }
    }
}
pub trait ScopedOrderStore: Send + Sync {
    fn claim_scoped(
        &self,
        universe: UniverseId,
        worker: WorkerId,
    ) -> impl Future<Output = Result<Option<ScopedClaim>, StoreError>> + Send;
    fn load_scoped(
        &self,
        claim: &ScopedClaim,
    ) -> impl Future<Output = Result<ClaimSnapshot, StoreError>> + Send;
    fn renew_scoped(
        &self,
        claim: &ScopedClaim,
    ) -> impl Future<Output = Result<ScopedClaim, StoreError>> + Send;
    fn fail_scoped(
        &self,
        claim: &ScopedClaim,
        error: &orbit_engine::InvariantError,
    ) -> impl Future<Output = Result<(), StoreError>> + Send;
    fn release_scoped(
        &self,
        claim: &ScopedClaim,
    ) -> impl Future<Output = Result<(), StoreError>> + Send;
}
pub trait ScopedGameStore: ScopedOrderStore {
    fn commit_scoped(
        &self,
        claim: &ScopedClaim,
        result: orbit_engine::TransitionResult,
    ) -> impl Future<Output = Result<CommitOutcome, StoreError>> + Send;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutorMode {
    Serial,
    PreparingScoped,
    Scoped,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct RuntimeCutover {
    pub mode: ExecutorMode,
    pub generation: i64,
}

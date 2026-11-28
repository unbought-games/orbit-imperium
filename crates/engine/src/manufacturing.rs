use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Commitment {
    pub profile_hash: Hash,
    pub terms_hash: Hash,
    pub paid: Resources,
    pub started_at: Timestamp,
    pub due_at: Timestamp,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LabContribution {
    pub body: BodyId,
    pub completed_level: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ResearchStatus {
    Active,
    Completed,
    Cancelled,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResearchOperation {
    pub id: OperationId,
    pub owner: PlayerId,
    pub host: BodyId,
    pub research: ResearchId,
    pub source_level: u32,
    pub target_level: u32,
    pub labs: Vec<LabContribution>,
    pub commitment: Commitment,
    pub status: ResearchStatus,
    pub generation: i64,
    pub revision: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BatchCommitment {
    pub profile_hash: Hash,
    pub terms_hash: Hash,
    pub paid: Resources,
    pub unit_cost: Resources,
    pub accepted_at: Timestamp,
    pub facility_levels: BTreeMap<Building, u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ManufacturingStatus {
    BodyAbandoned,
    BodyDestroyed,
    Active,
    Completed,
    Cancelled,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManufacturingBatch {
    pub id: OperationId,
    pub owner: PlayerId,
    pub body: BodyId,
    pub item: ManufacturedItem,
    pub quantity: i64,
    pub completed_prefix: i64,
    pub commitment: BatchCommitment,
    pub predecessor: Option<OperationId>,
    pub queue_sequence: i64,
    pub first_start_at: Timestamp,
    pub final_due_at: Timestamp,
    pub unit_duration_ms: DurationMs,
    pub next_due_at: Timestamp,
    pub status: ManufacturingStatus,
    pub generation: i64,
    pub revision: i64,
}

impl ManufacturingBatch {
    /// Stop short of any other event at the same instant, including hour/day
    /// score observations. Its phase and ordinal will be decided by the queue.
    pub fn consecutive_due_units(
        &self,
        claimed_at: Timestamp,
        next_input: Option<Timestamp>,
    ) -> i64 {
        let hour_end = self
            .next_due_at
            .saturating_add(3_599_999 - self.next_due_at.rem_euclid(3_600_000));
        let through = claimed_at
            .min(hour_end)
            .min(next_input.map_or(i64::MAX, |t| t.saturating_sub(1)));
        let elapsed = through.saturating_sub(self.next_due_at).max(0);
        (1 + elapsed / self.unit_duration_ms.max(1)).min(self.quantity - self.completed_prefix)
    }
}

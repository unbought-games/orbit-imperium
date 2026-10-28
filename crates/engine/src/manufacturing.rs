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

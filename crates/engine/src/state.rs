use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceCheckpoint {
    pub amounts: Resources,
    pub carry: Resources,
    pub at: Timestamp,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Body {
    /// Absent on unnamed planets and historical journals; never persist the fallback label.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub id: BodyId,
    pub universe: UniverseId,
    pub owner: PlayerId,
    pub kind: BodyKind,
    pub coordinates: Coordinates,
    pub fields: u32,
    pub max_temperature: i32,
    /// Protocol 1/2 capacity is authoritative (those profiles have no storage levels).
    /// For old progression journals this retains their wire shape and facts hash only;
    /// new progression facts leave it absent and always derive capacity from rules.
    #[serde(default, rename = "capacity", skip_serializing_if = "Option::is_none")]
    pub retained_capacity: Option<Resources>,
    pub checkpoint: ResourceCheckpoint,
    pub levels: BTreeMap<Building, u32>,
    pub revision: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Player {
    pub id: PlayerId,
    pub universe: UniverseId,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicDestination {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub id: BodyId,
    pub coordinates: Coordinates,
    pub kind: BodyKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConstructionStatus {
    BodyAbandoned,
    Active,
    Completed,
    Cancelled,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Construction {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progression: Option<ProgressionMaterial>,
    pub id: OperationId,
    pub body: BodyId,
    pub owner: PlayerId,
    pub building: Building,
    pub target_level: u32,
    pub paid: Resources,
    pub profile_hash: Hash,
    pub terms_hash: Hash,
    pub started_at: Timestamp,
    pub due_at: Timestamp,
    pub generation: i64,
    pub status: ConstructionStatus,
    pub revision: i64,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FactCoverage {
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    pub production_bodies: std::collections::BTreeSet<BodyId>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    pub research_operation_ids: std::collections::BTreeSet<OperationId>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    pub research_slot_players: std::collections::BTreeSet<PlayerId>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    pub owned_body_players: std::collections::BTreeSet<PlayerId>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    pub lab_construction_players: std::collections::BTreeSet<PlayerId>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    pub manufacturing_operation_ids: std::collections::BTreeSet<OperationId>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    pub manufacturing_bodies: std::collections::BTreeSet<BodyId>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    /// Legacy journal coverage; live loaders leave this empty.
    pub reservation_bodies: std::collections::BTreeSet<BodyId>,

    pub operations: std::collections::BTreeSet<OperationId>,
    pub fleet_ids: std::collections::BTreeSet<FleetId>,
    /// A covered body absent from `bodies` is proven absent, never an incomplete lookup.
    pub bodies: std::collections::BTreeSet<BodyId>,
    /// Complete active constructions for these bodies, plus covered historical IDs.
    pub construction_bodies: std::collections::BTreeSet<BodyId>,
    pub inventory_owners: std::collections::BTreeSet<(BodyId, PlayerId)>,
    pub research_players: std::collections::BTreeSet<PlayerId>,
    /// Complete active fleets for these owners, plus covered historical IDs.
    pub fleet_owners: std::collections::BTreeSet<PlayerId>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameState {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world: Option<WorldFacts>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub production_settings: BTreeMap<BodyId, ProductionSettingsRecord>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub research_operations: BTreeMap<OperationId, ResearchOperation>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub manufacturing_batches: BTreeMap<OperationId, ManufacturingBatch>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    /// Legacy journal data, retained for hash-stable decoding and historical application only.
    /// Live loaders and newly computed changes leave this empty.
    pub progression_reservations: BTreeMap<BodyId, ProgressionReservations>,

    pub fleets: BTreeMap<FleetId, Fleet>,
    pub reports: BTreeMap<ReportId, Report>,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub profile_hash: Hash,
    pub bodies: BTreeMap<BodyId, Body>,
    pub players: BTreeMap<PlayerId, Player>,
    pub inventories: Vec<InventoryStack>,
    pub research: BTreeMap<PlayerId, ResearchLevels>,
    pub constructions: BTreeMap<OperationId, Construction>,
    pub coverage: FactCoverage,
    pub collection_revisions: BTreeMap<String, i64>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChangeSet {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world: Option<WorldChanges>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub production_settings: Vec<ProductionSettingsRecord>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub research_operations: Vec<ResearchOperation>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub manufacturing_batches: Vec<ManufacturingBatch>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    /// Legacy journal data, retained for hash-stable decoding and historical application only.
    /// Live loaders and newly computed changes leave this empty.
    pub progression_reservations: Vec<ProgressionReservations>,

    pub fleets: Vec<Fleet>,
    pub inventories: Vec<InventoryStack>,
    pub research: Vec<ResearchLevels>,
    pub reports: Vec<Report>,
    pub input: InputId,
    pub profile_hash: Hash,
    pub expected_facts_hash: Hash,
    pub expected_collection_revisions: BTreeMap<String, i64>,
    pub bodies: Vec<Body>,
    pub constructions: Vec<Construction>,
    pub events: Vec<NewEvent>,
    pub cancelled_events: Vec<ScheduledEvent>,
    pub affected_viewers: std::collections::BTreeSet<PlayerId>,
}
impl ChangeSet {
    /// Starts an empty change bound to the execution input, rules, and loaded facts.
    pub(crate) fn new(state: &GameState, input: &OrderedInput, rules: &Ruleset) -> Self {
        Self {
            world: None,
            production_settings: vec![],
            research_operations: vec![],
            manufacturing_batches: vec![],
            progression_reservations: vec![],
            fleets: vec![],
            inventories: vec![],
            research: vec![],
            reports: vec![],
            input: input.id,
            profile_hash: rules.hash.clone(),
            expected_facts_hash: hash(state),
            expected_collection_revisions: state.collection_revisions.clone(),
            bodies: vec![],
            constructions: vec![],
            events: vec![],
            cancelled_events: vec![],
            affected_viewers: std::collections::BTreeSet::new(),
        }
    }
    pub fn apply_to(&self, state: &mut GameState) -> Result<(), InvariantError> {
        if hash(state) != self.expected_facts_hash
            || state.profile_hash != self.profile_hash
            || state.collection_revisions != self.expected_collection_revisions
        {
            return Err(InvariantError("stale transition facts".into()));
        }
        let previous_abandonments = state
            .world
            .as_ref()
            .map(|w| w.records.abandonments.clone())
            .unwrap_or_default();
        if let Some(w) = &self.world {
            state
                .world
                .as_mut()
                .ok_or_else(|| InvariantError("missing R3 state".into()))?
                .records = w.records.clone();
        }
        if let Some(w) = &self.world {
            for abandoned in w.records.abandonments.values() {
                if let Some(slot) = state.world.as_mut().and_then(|w| {
                    w.planet_slots
                        .iter_mut()
                        .find(|slot| slot.coordinates == abandoned.coordinates)
                }) {
                    if previous_abandonments.get(&abandoned.body) != Some(abandoned) {
                        slot.revision = slot
                            .revision
                            .checked_add(1)
                            .ok_or_else(|| InvariantError("slot revision exhausted".into()))?;
                    }
                    if !abandoned.released {
                        slot.occupant = Some(abandoned.body);
                    } else if slot.occupant == Some(abandoned.body) {
                        slot.occupant = None;
                    }
                }
                for body in &abandoned.losses {
                    state.bodies.remove(&body.id);
                    state.inventories.retain(|x| x.body != body.id);
                    state.production_settings.remove(&body.id);
                }
            }
        }
        for x in &self.production_settings {
            state.production_settings.insert(x.body, x.clone());
        }
        // Only historical ChangeSets contain these entries; current transitions never emit them.
        for x in &self.progression_reservations {
            state.progression_reservations.insert(x.body, x.clone());
        }
        for x in &self.research_operations {
            state.coverage.research_operation_ids.insert(x.id);
            state.research_operations.insert(x.id, x.clone());
        }
        for x in &self.manufacturing_batches {
            state.coverage.manufacturing_operation_ids.insert(x.id);
            state.manufacturing_batches.insert(x.id, x.clone());
        }
        for body in &self.bodies {
            if !state.bodies.contains_key(&body.id) {
                state.coverage.bodies.insert(body.id);
                state.coverage.production_bodies.insert(body.id);
                state.coverage.construction_bodies.insert(body.id);
                state.coverage.manufacturing_bodies.insert(body.id);
                state
                    .coverage
                    .inventory_owners
                    .insert((body.id, body.owner));
                for kind in ["production", "constructions", "manufacturing"] {
                    state
                        .collection_revisions
                        .insert(format!("{kind}:{}", body.id), 0);
                }
                state
                    .collection_revisions
                    .insert(format!("inventory:{}:{}", body.id, body.owner), 0);
                if let Some(w) = &mut state.world
                    && let Some(slot) = w
                        .planet_slots
                        .iter_mut()
                        .find(|slot| slot.coordinates == body.coordinates)
                {
                    slot.occupant = Some(body.id);
                    slot.revision = slot
                        .revision
                        .checked_add(1)
                        .ok_or_else(|| InvariantError("slot revision exhausted".into()))?;
                }
            }
            state.bodies.insert(body.id, body.clone());
        }
        for operation in &self.constructions {
            state.coverage.operations.insert(operation.id);
            state.constructions.insert(operation.id, operation.clone());
        }
        for fleet in &self.fleets {
            state.coverage.fleet_ids.insert(fleet.id);
            state.fleets.insert(fleet.id, fleet.clone());
        }
        for report in &self.reports {
            state.reports.insert(report.id, report.clone());
        }
        for ships in &self.inventories {
            if let Some(existing) = state
                .inventories
                .iter_mut()
                .find(|s| s.body == ships.body && s.owner == ships.owner && s.item == ships.item)
            {
                *existing = ships.clone()
            } else {
                state.inventories.push(ships.clone())
            }
        }
        state.inventories.sort_by_key(|s| (s.body, s.owner, s.item));
        for research in &self.research {
            state.research.insert(research.owner, research.clone());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransitionResult {
    Applied(Box<ChangeSet>),
    Rejected(GameError),
    InvalidState(InvariantError),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum FleetStatus {
    Outbound,
    Returning,
    Completed,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fleet {
    pub id: FleetId,
    pub owner: PlayerId,
    pub origin: BodyId,
    pub target: BodyId,
    pub target_owner: PlayerId,
    pub target_kind: BodyKind,
    pub ships: Vec<ShipStack>,
    pub payload: Resources,
    pub paid_fuel: i64,
    pub profile_hash: Hash,
    pub terms_hash: Hash,
    pub launched_at: Timestamp,
    pub duration: DurationMs,
    pub due_at: Timestamp,
    pub generation: i64,
    pub status: FleetStatus,
    pub revision: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReportKind {
    Delivered,
    DeliveryFailed,
    Recalled,
    Returned,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Report {
    pub id: ReportId,
    pub fleet: FleetId,
    pub kind: ReportKind,
    pub at: Timestamp,
    pub origin: BodyId,
    pub target: BodyId,
    pub cargo: Resources,
    pub recipients: std::collections::BTreeSet<PlayerId>,
}

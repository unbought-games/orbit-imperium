use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum Command {
    World {
        action: WorldAction,
    },
    SetProduction {
        body: BodyId,
        settings: ProductionSettings,
        #[serde(with = "decimal_wire")]
        expected_settings_revision: i64,
    },
    StartDemolition {
        body: BodyId,
        building: Building,
        expected_terms_hash: Hash,
    },
    StartResearch {
        host: BodyId,
        research: ResearchId,
        expected_terms_hash: Hash,
    },
    CancelResearch {
        operation: OperationId,
    },
    StartManufacture {
        body: BodyId,
        item: ManufacturedItem,
        #[serde(with = "decimal_wire")]
        quantity: i64,
        expected_terms_hash: Hash,
    },
    LaunchTransport {
        origin: BodyId,
        target: BodyId,
        ships: Vec<ShipStack>,
        cargo: Resources,
        speed_percent: u32,
        expected_terms_hash: Hash,
    },
    RecallFleet {
        fleet: FleetId,
    },
    StartUpgrade {
        body: BodyId,
        building: Building,
        expected_terms_hash: Hash,
    },
    CancelConstruction {
        operation: OperationId,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum QuoteRequest {
    Fleet {
        intent: FleetIntent,
    },
    Demolition {
        body: BodyId,
        building: Building,
    },
    Research {
        host: BodyId,
        research: ResearchId,
    },
    Manufacture {
        body: BodyId,
        item: ManufacturedItem,
        #[serde(with = "decimal_wire")]
        quantity: i64,
    },
    Transport {
        origin: BodyId,
        target: BodyId,
        ships: Vec<ShipStack>,
        cargo: Resources,
        speed_percent: u32,
    },
    Upgrade {
        body: BodyId,
        building: Building,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quote {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progression: Option<ProgressionMaterial>,
    pub fuel: i64,
    pub capacity: i64,
    pub maximum_payload: i64,
    pub profile_hash: Hash,
    pub terms_hash: Hash,
    pub cost: Resources,
    pub duration: DurationMs,
    pub target_level: Option<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum ScheduledEvent {
    FleetLegDue {
        fleet: FleetId,
        generation: i64,
        expected_leg: MissionLeg,
    },
    DebrisCleanupDue {
        field: OperationId,
        generation: i64,
    },
    ResearchDue {
        operation: OperationId,
        generation: i64,
    },
    ManufacturingDue {
        operation: OperationId,
        generation: i64,
        expected_prefix: i64,
    },
    TransportArrived {
        fleet: FleetId,
        generation: i64,
    },
    FleetReturned {
        fleet: FleetId,
        generation: i64,
    },
    ConstructionDue {
        operation: OperationId,
        generation: i64,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Input {
    Command(Command),
    Event(ScheduledEvent),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderedInput {
    pub schema_version: i32,
    pub id: InputId,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub actor: Actor,
    pub at: Timestamp,
    pub phase: i32,
    pub sequence: i64,
    pub protocol: i32,
    pub profile_hash: Hash,
    pub payload: Input,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewEvent {
    pub id: InputId,
    pub at: Timestamp,
    pub event: ScheduledEvent,
}

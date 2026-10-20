//! R3 mission facts and atomic replacements. Never serialized as a public view.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Mission {
    Transport,
    Harvest,
    Espionage,
    Attack,
    Deploy,
    Colonize,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum MissionDestination {
    Body {
        id: BodyId,
        expected_kind: BodyKind,
        expected_owner: PlayerId,
    },
    Debris {
        coordinates: Coordinates,
        field_identity: OperationId,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum DestinationSelection {
    BodyAt {
        coordinates: Coordinates,
        kind: BodyKind,
    },
    DebrisAt {
        coordinates: Coordinates,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManifestStack {
    pub owner: PlayerId,
    pub ship_type: ShipType,
    #[serde(with = "decimal_wire")]
    pub count: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FleetIntent {
    pub origin: BodyId,
    pub destination: MissionDestination,
    pub mission: Mission,
    pub ships: Vec<ManifestStack>,
    #[serde(with = "resource_strings")]
    pub cargo: Resources,
    pub speed_percent: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FleetTerms {
    pub intent: FleetIntent,
    pub profile_hash: Hash,
    pub distance: i64,
    pub speeds: Vec<(ShipType, String)>,
    pub duration_ms: i64,
    #[serde(with = "decimal_wire")]
    pub fuel: i64,
    #[serde(with = "decimal_wire")]
    pub capacity: i64,
    #[serde(with = "decimal_wire")]
    pub maximum_payload: i64,
    #[serde(with = "decimal_wire")]
    pub slot_limit: i64,
    pub terms_hash: Hash,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MissionLeg {
    Outbound,
    Returning,
    Returned,
    Destroyed,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MissionAuthorization {
    pub actor: PlayerId,
    pub target_owner: Option<PlayerId>,
    pub at: Timestamp,
    pub input: InputId,
    pub policy_hash: Hash,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MissionFleet {
    pub id: FleetId,
    pub owner: PlayerId,
    pub intent: FleetIntent,
    pub origin_coordinates: Coordinates,
    pub destination_coordinates: Coordinates,
    pub terms: FleetTerms,
    pub authorization: MissionAuthorization,
    pub ships: Vec<ShipStack>,
    pub cargo: Resources,
    pub launched_at: Timestamp,
    pub due_at: Timestamp,
    pub generation: i64,
    pub leg: MissionLeg,
    pub revision: i64,
}
impl MissionFleet {
    pub fn active(&self) -> bool {
        matches!(self.leg, MissionLeg::Outbound | MissionLeg::Returning)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum WorldAction {
    RecordForegroundPresence {
        body: Option<BodyId>,
        cause: PresenceCause,
        paired_command_id: Option<CommandId>,
    },
    LaunchFleet {
        intent: FleetIntent,
        expected_terms_hash: Hash,
    },
    RecallMission {
        fleet: FleetId,
    },
    MarkReportRead {
        report: ReportId,
    },
    SetReportHidden {
        report: ReportId,
        hidden: bool,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MissionReport {
    pub id: ReportId,
    pub event: InputId,
    pub kind: String,
    pub at: Timestamp,
    pub fleet: Option<FleetId>,
    pub rules_hash: Hash,
    pub payloads: BTreeMap<PlayerId, serde_json::Value>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecipientReportState {
    pub report: ReportId,
    pub recipient: PlayerId,
    pub read: bool,
    pub hidden: bool,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldRecords {
    pub policies: BTreeMap<PlayerId, PlayerPolicy>,
    pub activity: BTreeMap<BodyId, BodyActivity>,
    pub lots: Vec<AssetLot>,
    pub fleets: BTreeMap<FleetId, MissionFleet>,
    pub debris: BTreeMap<OperationId, DebrisField>,
    pub reports: BTreeMap<ReportId, MissionReport>,
    pub report_states: Vec<RecipientReportState>,
    pub presence: BTreeMap<InputId, PresenceLink>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldFacts {
    pub records: WorldRecords,
    pub secret: [u8; 32],
    pub covered_players: BTreeSet<PlayerId>,
    pub covered_coordinates: BTreeSet<(u32, u32, u32)>,
    pub covered_reports: BTreeSet<ReportId>,
    pub requested_pair: Option<PresenceLink>,
    pub revision: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldChanges {
    pub records: WorldRecords,
    pub score_deltas: Vec<ScoreLedgerDelta>,
    pub audits: Vec<serde_json::Value>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorldRules {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raiding: Option<String>,
    pub combat: CombatRules,
    pub detector: String,
    pub rng: String,
    pub protection: String,
    pub debris_cleanup: String,
    pub moons: bool,
}
impl WorldRules {
    pub fn validate(&self) -> Result<(), RulesError> {
        if self
            .raiding
            .as_ref()
            .is_some_and(|v| v != "oi-classic-five-pass-v1")
        {
            return Err(RulesError::InvalidReference);
        }
        if self.detector != "oi-counterespionage-reconstructed-v1"
            || self.rng != "oi-hmac-sha256-stream-v1"
            || self.protection != "exact-invested-5to1-5000-v1"
            || self.debris_cleanup != "monday-utc-existing-marker-v1"
            || self.moons
        {
            return Err(RulesError::InvalidReference);
        }
        if !self.combat.supported_policy() {
            return Err(RulesError::Unsupported);
        }
        self.combat.validate().map_err(|_| RulesError::Range)
    }
}
pub mod resource_strings {
    use super::*;
    #[derive(Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    struct R {
        #[serde(with = "decimal_wire")]
        metal: i64,
        #[serde(with = "decimal_wire")]
        crystal: i64,
        #[serde(with = "decimal_wire")]
        deuterium: i64,
    }
    pub fn serialize<S: serde::Serializer>(r: &Resources, s: S) -> Result<S::Ok, S::Error> {
        R {
            metal: r.metal,
            crystal: r.crystal,
            deuterium: r.deuterium,
        }
        .serialize(s)
    }
    pub fn deserialize<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Resources, D::Error> {
        let r = R::deserialize(d)?;
        Ok(Resources {
            metal: r.metal,
            crystal: r.crystal,
            deuterium: r.deuterium,
        })
    }
}
pub fn world_facts(s: &GameState) -> Result<&WorldFacts, InvariantError> {
    s.world
        .as_ref()
        .ok_or_else(|| InvariantError("missing mandatory R3 facts".into()))
}

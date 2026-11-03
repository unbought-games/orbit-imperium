//! Pure paid-scan eligibility and historical observation projection.
//! Callers must settle earlier events and provide complete, snapshot-consistent facts.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const PHALANX_PROFILE_V1: &str = "sensor-phalanx-v1";
pub const PHALANX_COST_V1: i64 = 5_000_000_000;

/// Current universe profiles have linear systems; no wraparound distance.
pub fn phalanx_in_range(
    topology: &UniverseProfile,
    source: Coordinates,
    target: Coordinates,
    level: u32,
) -> Result<bool, GameError> {
    topology.validate().map_err(|_| GameError::InvalidInput)?;
    if !topology.contains(source) || !topology.contains(target) {
        return Err(GameError::InvalidInput);
    }
    let range = u128::from(level)
        .checked_mul(u128::from(level))
        .and_then(|square| square.checked_sub(1));
    Ok(source.galaxy == target.galaxy
        && range.is_some_and(|range| u128::from(source.system.abs_diff(target.system)) <= range))
}

/// Bodies here are current active bodies, not tombstones or coordinate matches.
/// The loader proves their existence, owner policies and completed building levels.
/// Only source-local materialized resources count. No hostility/score predicate.
pub fn validate_phalanx_scan(
    actor: PlayerId,
    source: &Body,
    target: &Body,
    actor_policy: &PlayerPolicy,
    target_policy: &PlayerPolicy,
    topology: &UniverseProfile,
) -> Result<(), GameError> {
    if source.owner != actor {
        return Err(GameError::NotOwned);
    }
    if actor_policy.player != actor || target_policy.player != target.owner {
        return Err(GameError::PolicyUnavailable);
    }
    if actor_policy.vacation.is_active() {
        return Err(GameError::ActorVacation);
    }
    if matches!(
        actor_policy.lifecycle,
        PlayerLifecycle::DeletionDraining | PlayerLifecycle::Removed
    ) {
        return Err(GameError::ActorDraining);
    }
    if source.kind != BodyKind::Moon || target.kind != BodyKind::Planet {
        return Err(GameError::BodyKindNotAllowed);
    }
    if source.universe != target.universe || target_policy.lifecycle == PlayerLifecycle::Removed {
        return Err(GameError::NotFound);
    }
    if target.owner == actor {
        return Err(GameError::InvalidInput);
    }
    if target_policy.vacation.is_active() {
        return Err(GameError::TargetVacation);
    }
    let level = source
        .levels
        .get(&Building::SensorPhalanx)
        .copied()
        .unwrap_or(0);
    if level == 0 {
        return Err(GameError::UnavailableContent);
    }
    if !phalanx_in_range(topology, source.coordinates, target.coordinates, level)? {
        return Err(GameError::InvalidInput);
    }
    if source.checkpoint.amounts.deuterium < PHALANX_COST_V1 {
        return Err(GameError::InsufficientResources);
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PhalanxPublicOwner {
    pub id: PlayerId,
    pub name: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PhalanxEndpointKind {
    Planet,
    Moon,
    Debris,
    EmptyPosition,
}
/// Public identity only; never a body inventory, revision or private name.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PhalanxEndpoint {
    pub coordinates: Coordinates,
    pub kind: PhalanxEndpointKind,
    pub body: Option<BodyId>,
}
impl PhalanxEndpoint {
    fn planet(&self, target: BodyId) -> bool {
        self.kind == PhalanxEndpointKind::Planet && self.body == Some(target)
    }
    pub fn from_body(body: &Body) -> Self {
        Self {
            coordinates: body.coordinates,
            kind: match body.kind {
                BodyKind::Planet => PhalanxEndpointKind::Planet,
                BodyKind::Moon => PhalanxEndpointKind::Moon,
            },
            body: Some(body.id),
        }
    }
}
/// Authoritative endpoint bindings supplied by the loader, not stored visibility.
/// Currently original == effective. Future moon removal must explicitly supply
/// fallback bindings without changing return_reason or rebinding by coordinates.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PhalanxEndpoints {
    pub original_origin: PhalanxEndpoint,
    pub original_destination: PhalanxEndpoint,
    pub effective_origin: PhalanxEndpoint,
    pub effective_destination: PhalanxEndpoint,
}
/// Resolve current bindings. Empty colonization slots never bind to later occupants.
/// Missing bodies require a future lifecycle-aware loader, not a parent guess.
pub fn phalanx_endpoints(
    fleet: &MissionFleet,
    bodies: &BTreeMap<BodyId, Body>,
) -> Result<PhalanxEndpoints, InvariantError> {
    let origin = bodies
        .get(&fleet.intent.origin)
        .map(PhalanxEndpoint::from_body)
        .ok_or_else(|| InvariantError("missing phalanx origin binding".into()))?;
    phalanx_endpoints_from_origin(fleet, origin)
}
/// Identity-only origin lookup for scan loaders; no foreign economy is needed.
pub fn phalanx_endpoints_from_origin(
    fleet: &MissionFleet,
    origin: PhalanxEndpoint,
) -> Result<PhalanxEndpoints, InvariantError> {
    if origin.body != Some(fleet.intent.origin) || origin.coordinates != fleet.origin_coordinates {
        return Err(InvariantError("phalanx origin identity mismatch".into()));
    }
    let destination = match fleet.intent.destination {
        MissionDestination::Body {
            id, expected_kind, ..
        } => PhalanxEndpoint {
            coordinates: fleet.destination_coordinates,
            kind: match expected_kind {
                BodyKind::Planet => PhalanxEndpointKind::Planet,
                BodyKind::Moon => PhalanxEndpointKind::Moon,
            },
            body: Some(id),
        },
        MissionDestination::Debris { coordinates, .. } => PhalanxEndpoint {
            coordinates,
            kind: PhalanxEndpointKind::Debris,
            body: None,
        },
        MissionDestination::EmptyPosition { coordinates, .. } => PhalanxEndpoint {
            coordinates,
            kind: PhalanxEndpointKind::EmptyPosition,
            body: None,
        },
    };
    Ok(PhalanxEndpoints {
        original_origin: origin.clone(),
        effective_origin: origin,
        original_destination: destination.clone(),
        effective_destination: destination,
    })
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PhalanxPhase {
    Outbound,
    Holding,
    Returning,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "at")]
pub enum PhalanxDeadline {
    Arrival(Timestamp),
    Return(Timestamp),
    HoldEnd(Timestamp),
    Impact(Timestamp),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PhalanxShips {
    pub ship_type: ShipType,
    #[serde(with = "decimal_wire")]
    pub count: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum PhalanxObservationV1 {
    Fleet {
        owner: PhalanxPublicOwner,
        mission: Mission,
        phase: PhalanxPhase,
        endpoints: PhalanxEndpoints,
        ships: Vec<PhalanxShips>,
        deadline: PhalanxDeadline,
    },
    Missile {
        attacker: PhalanxPublicOwner,
        source: Coordinates,
        target: PhalanxEndpoint,
        #[serde(with = "decimal_wire")]
        count: i64,
        deadline: PhalanxDeadline,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "version", content = "report", deny_unknown_fields)]
pub enum PhalanxReport {
    V1(PhalanxReportV1),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PhalanxReportV1 {
    pub id: ReportId,
    pub at: Timestamp,
    pub source: PhalanxEndpoint,
    pub target: PhalanxEndpoint,
    #[serde(with = "decimal_wire")]
    pub cost: i64,
    pub rows: Vec<PhalanxObservationV1>,
}

/// One row per supplied fleet; destination takes precedence when O == T.
/// No observer/ownership/alliance context exists here to expand disclosure.
/// Call only after due-event ordering; deadlines are commitments, not predictions
/// of battle, interception or other future outcomes.
pub fn project_phalanx_fleet(
    target: BodyId,
    world: &WorldRecords,
    f: &MissionFleet,
    endpoints: &PhalanxEndpoints,
    owners: &BTreeMap<PlayerId, PhalanxPublicOwner>,
) -> Result<Option<PhalanxObservationV1>, InvariantError> {
    if !f.active() {
        return Ok(None);
    }
    validate_mission_return_reason(f)?;
    if f.intent.mission == Mission::Deploy && f.leg == MissionLeg::Returning {
        match f.return_reason {
            Some(MissionReturnReason::VoluntaryRecall) => return Ok(None),
            Some(MissionReturnReason::InvalidTarget) => {}
            _ => return Err(InvariantError("unclassified returning deployment".into())),
        }
    }
    let origin = endpoints.effective_origin.planet(target);
    let destination = endpoints.effective_destination.planet(target)
        && !matches!(f.intent.mission, Mission::Harvest | Mission::Colonize);
    let due = effective_fleet_due(world, f);
    let checked_deadline = |at, duration| {
        deadline(at, duration).map_err(|_| InvariantError("phalanx deadline overflow".into()))
    };
    let (phase, observed) = match f.leg {
        MissionLeg::Outbound if destination => {
            (PhalanxPhase::Outbound, PhalanxDeadline::Arrival(due))
        }
        MissionLeg::Outbound if origin && f.intent.mission != Mission::Deploy => {
            let hold = if f.intent.mission == Mission::Hold {
                f.terms
                    .holding
                    .as_ref()
                    .ok_or_else(|| InvariantError("missing hold terms".into()))?
                    .duration_ms
            } else {
                0
            };
            (
                PhalanxPhase::Outbound,
                PhalanxDeadline::Return(checked_deadline(
                    if hold == 0 {
                        due
                    } else {
                        checked_deadline(due, hold)?
                    },
                    f.terms.duration_ms,
                )?),
            )
        }
        MissionLeg::Holding if destination => {
            (PhalanxPhase::Holding, PhalanxDeadline::HoldEnd(due))
        }
        MissionLeg::Holding if origin => (
            PhalanxPhase::Holding,
            PhalanxDeadline::Return(checked_deadline(due, f.terms.duration_ms)?),
        ),
        MissionLeg::Returning if origin => (PhalanxPhase::Returning, PhalanxDeadline::Return(due)),
        _ => return Ok(None),
    };
    let owner = owners
        .get(&f.owner)
        .filter(|p| p.id == f.owner)
        .ok_or_else(|| InvariantError("missing public phalanx owner".into()))?
        .clone();
    let mut ships: Vec<_> = f
        .ships
        .iter()
        .map(|s| PhalanxShips {
            ship_type: s.ship_type,
            count: s.count,
        })
        .collect();
    ships.sort_by_key(|s| s.ship_type);
    Ok(Some(PhalanxObservationV1::Fleet {
        owner,
        mission: f.intent.mission,
        phase,
        endpoints: endpoints.clone(),
        ships,
        deadline: observed,
    }))
}

pub fn project_phalanx_missile(
    target: BodyId,
    flight: &MissileFlight,
    owners: &BTreeMap<PlayerId, PhalanxPublicOwner>,
) -> Result<Option<PhalanxObservationV1>, InvariantError> {
    if flight.status != MissileStatus::InFlight
        || flight.terms.intent.target.expected_kind != BodyKind::Planet
        || flight.terms.intent.target.id != target
    {
        return Ok(None);
    }
    let attacker = owners
        .get(&flight.owner)
        .filter(|p| p.id == flight.owner)
        .ok_or_else(|| InvariantError("missing public phalanx attacker".into()))?
        .clone();
    Ok(Some(PhalanxObservationV1::Missile {
        attacker,
        source: flight.terms.source_coordinates,
        target: PhalanxEndpoint {
            coordinates: flight.terms.target_coordinates,
            kind: PhalanxEndpointKind::Planet,
            body: Some(target),
        },
        count: flight.terms.intent.count,
        deadline: PhalanxDeadline::Impact(flight.due_at),
    }))
}

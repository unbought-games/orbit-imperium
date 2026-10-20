use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "kind", content = "key")]
pub enum ScopeKey {
    Player(PlayerId),
    Location(Coordinates),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct OrderKey {
    pub at_ms: i64,
    pub phase: u8,
    #[serde(with = "crate::decimal_wire")]
    pub ordinal: i64,
}

#[derive(Clone, Debug, Default)]
pub struct ScopeReferences {
    pub bodies: BTreeMap<BodyId, (PlayerId, Coordinates)>,
    pub fleets: BTreeMap<FleetId, (PlayerId, Option<PlayerId>, Coordinates, Coordinates)>,
    pub operations: BTreeMap<OperationId, PlayerId>,
    pub debris: BTreeMap<OperationId, Coordinates>,
    pub parents: BTreeMap<CommandId, BTreeSet<ScopeKey>>,
}
fn fleet_scopes(fleet: FleetId, refs: &ScopeReferences) -> Option<BTreeSet<ScopeKey>> {
    let (owner, target, origin, destination) = refs.fleets.get(&fleet)?;
    let mut scopes = BTreeSet::from([
        ScopeKey::Player(*owner),
        ScopeKey::Location(*origin),
        ScopeKey::Location(*destination),
    ]);
    scopes.extend(target.map(ScopeKey::Player));
    Some(scopes)
}
fn location(body: BodyId, refs: &ScopeReferences, scopes: &mut BTreeSet<ScopeKey>) {
    if let Some((_, coords)) = refs.bodies.get(&body) {
        scopes.insert(ScopeKey::Location(*coords));
    }
}
pub fn command_scopes(
    actor: PlayerId,
    command: &Command,
    refs: &ScopeReferences,
) -> Result<BTreeSet<ScopeKey>, GameError> {
    let mut scopes = BTreeSet::from([ScopeKey::Player(actor)]);
    match command {
        Command::World {
            action: WorldAction::LaunchFleet { intent, .. },
        } => {
            location(intent.origin, refs, &mut scopes);
            match &intent.destination {
                MissionDestination::Body {
                    id, expected_owner, ..
                } => {
                    scopes.insert(ScopeKey::Player(*expected_owner));
                    location(*id, refs, &mut scopes);
                }
                MissionDestination::Debris { coordinates, .. } => {
                    scopes.insert(ScopeKey::Location(*coordinates));
                }
            }
        }
        Command::LaunchTransport { origin, target, .. } => {
            location(*origin, refs, &mut scopes);
            location(*target, refs, &mut scopes);
            if let Some((owner, _)) = refs.bodies.get(target) {
                scopes.insert(ScopeKey::Player(*owner));
            }
        }
        Command::World {
            action: WorldAction::RecallMission { fleet },
        }
        | Command::RecallFleet { fleet } => {
            scopes.extend(fleet_scopes(*fleet, refs).unwrap_or_default());
            if let Some(parent) = refs.parents.get(&CommandId(fleet.0)) {
                scopes.extend(parent.iter().cloned());
            }
        }
        Command::CancelConstruction { operation } | Command::CancelResearch { operation } => {
            scopes.extend(
                refs.operations
                    .get(operation)
                    .copied()
                    .map(ScopeKey::Player),
            );
            if let Some(parent) = refs.parents.get(&CommandId(operation.0)) {
                scopes.extend(parent.iter().cloned());
            }
        }
        _ => {}
    }
    Ok(scopes)
}
pub fn event_scopes(
    event: &ScheduledEvent,
    refs: &ScopeReferences,
) -> Result<BTreeSet<ScopeKey>, InvariantError> {
    let scopes = match event {
        ScheduledEvent::FleetLegDue { fleet, .. }
        | ScheduledEvent::TransportArrived { fleet, .. }
        | ScheduledEvent::FleetReturned { fleet, .. } => fleet_scopes(*fleet, refs),
        ScheduledEvent::ConstructionDue { operation, .. }
        | ScheduledEvent::ResearchDue { operation, .. }
        | ScheduledEvent::ManufacturingDue { operation, .. } => refs
            .operations
            .get(operation)
            .map(|owner| BTreeSet::from([ScopeKey::Player(*owner)])),
        ScheduledEvent::DebrisCleanupDue { field, .. } => refs
            .debris
            .get(field)
            .map(|coords| BTreeSet::from([ScopeKey::Location(*coords)])),
    };
    scopes.ok_or_else(|| InvariantError("missing immutable scheduling reference".into()))
}
pub fn validate_successor_scopes(
    parent: &BTreeSet<ScopeKey>,
    successors: &BTreeSet<ScopeKey>,
) -> Result<(), InvariantError> {
    if successors.is_empty() || !successors.is_subset(parent) {
        return Err(InvariantError("successor escapes its causal scopes".into()));
    }
    Ok(())
}

use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GalaxyPosition {
    pub coordinates: Coordinates,
    pub body: Option<PublicBody>,
    pub debris: Option<PublicDebris>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub abandoned_until: Option<Timestamp>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PublicBody {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub id: BodyId,
    pub kind: BodyKind,
    pub owner: PlayerId,
    pub activity: PublicActivity,
    pub inactivity: Inactivity,
    pub vacation: bool,
    pub espionage_eligible: bool,
    #[serde(default)]
    pub attack_blocker: Option<GameError>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PublicDebris {
    pub field_identity: OperationId,
    pub metal: String,
    pub crystal: String,
    pub deuterium: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GalaxySystem {
    pub galaxy: u32,
    pub system: u32,
    pub positions: Vec<GalaxyPosition>,
    pub observed_at: Timestamp,
}
pub fn resolve_destination(
    s: &GameState,
    selection: DestinationSelection,
    r: &Ruleset,
) -> Result<MissionDestination, GameError> {
    let coords = match &selection {
        DestinationSelection::BodyAt { coordinates, .. }
        | DestinationSelection::EmptyPositionAt { coordinates }
        | DestinationSelection::DebrisAt { coordinates } => *coordinates,
    };
    if !r
        .artifact
        .universe
        .as_ref()
        .is_some_and(|u| u.contains(coords))
    {
        return Err(GameError::NotFound);
    }
    let w = world_facts(s).map_err(|_| GameError::InvalidInput)?;
    if !w
        .covered_coordinates
        .contains(&(coords.galaxy, coords.system, coords.position))
    {
        return Err(GameError::InvalidInput);
    }
    match selection {
        DestinationSelection::EmptyPositionAt { .. } => {
            if !r.colonization() {
                return Err(GameError::UnavailableContent);
            }
            let slot = planet_slot(s, coords).map_err(|_| GameError::PolicyUnavailable)?;
            if slot.occupant.is_some() {
                return Err(GameError::PositionOccupied);
            }
            Ok(MissionDestination::EmptyPosition {
                coordinates: coords,
                slot_revision: slot.revision,
            })
        }
        DestinationSelection::BodyAt { kind, .. } => s
            .bodies
            .values()
            .find(|b| b.coordinates == coords && b.kind == kind)
            .map(|b| MissionDestination::Body {
                id: b.id,
                expected_kind: b.kind,
                expected_owner: b.owner,
            })
            .ok_or(GameError::NotFound),
        DestinationSelection::DebrisAt { .. } => w
            .records
            .debris
            .values()
            .find(|f| f.coordinates == coords && f.marker_present)
            .map(|f| MissionDestination::Debris {
                coordinates: coords,
                field_identity: f.id,
            })
            .ok_or(GameError::NoHarvestTarget),
    }
}
pub fn galaxy_system(
    s: &GameState,
    viewer: PlayerId,
    galaxy: u32,
    system: u32,
    at: Timestamp,
    r: &Ruleset,
) -> Result<GalaxySystem, GameError> {
    let dimensions = r
        .artifact
        .universe
        .as_ref()
        .ok_or(GameError::UnavailableContent)?;
    if !dimensions.contains(Coordinates {
        galaxy,
        system,
        position: 1,
    }) {
        return Err(GameError::NotFound);
    }
    let w = world_facts(s).map_err(|_| GameError::InvalidInput)?;
    let mut positions = vec![];
    for position in 1..=dimensions.positions_per_system {
        let coordinates = Coordinates {
            galaxy,
            system,
            position,
        };
        if !w.covered_coordinates.contains(&(galaxy, system, position)) {
            return Err(GameError::InvalidInput);
        }
        let body = if let Some(b) = s.bodies.values().find(|b| b.coordinates == coordinates) {
            let p = w
                .records
                .policies
                .get(&b.owner)
                .ok_or(GameError::InvalidInput)?;
            Some(PublicBody {
                id: b.id,
                kind: b.kind,
                name: b.name.clone(),
                owner: b.owner,
                activity: public_activity(
                    w.records.activity.get(&b.id).map(|a| a.last_signal_at),
                    at,
                )
                .map_err(|_| GameError::InvalidInput)?,
                inactivity: inactivity(p.last_presence_at, at)
                    .map_err(|_| GameError::InvalidInput)?,
                vacation: p.vacation,
                attack_blocker: check_mission_eligibility(
                    s,
                    viewer,
                    Some(b.owner),
                    Mission::Attack,
                    at,
                    r,
                )
                .err(),
                espionage_eligible: b.owner != viewer
                    && check_mission_eligibility(
                        s,
                        viewer,
                        Some(b.owner),
                        Mission::Espionage,
                        at,
                        r,
                    )
                    .is_ok(),
            })
        } else {
            None
        };
        let debris = w
            .records
            .debris
            .values()
            .find(|f| {
                f.coordinates == coordinates
                    && f.marker_present
                    && f.total() >= 300 * i128::from(SCALE)
            })
            .map(|f| PublicDebris {
                field_identity: f.id,
                metal: (f.metal / SCALE).to_string(),
                crystal: (f.crystal / SCALE).to_string(),
                deuterium: (f.deuterium / SCALE).to_string(),
            });
        positions.push(GalaxyPosition {
            coordinates,
            body,
            debris,
            abandoned_until: w
                .records
                .abandonments
                .values()
                .find(|t| t.coordinates == coordinates && !t.released)
                .map(|t| t.release_at),
        });
    }
    Ok(GalaxySystem {
        galaxy,
        system,
        positions,
        observed_at: at,
    })
}

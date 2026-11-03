//! Exact pre-cause MissionFleet schema from cfe36bccf8d80c77ed2897cb3e2a0bcde74aeb6c,
//! renamed only. Old serde ignores new fields; old storage replaces complete JSON.
use orbit_engine::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LegacyMissionFleet {
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

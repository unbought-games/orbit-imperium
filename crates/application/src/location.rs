//! Deliberately public appearance projection for location link cards.
//! No activity, inventories, resources, credentials or membership grants.
use crate::{BodyId, PlayerId, UniverseId};
pub use orbit_engine::{BodyKind as LocationBodyKind, Coordinates as LocationCoordinates};
#[derive(Clone, Debug)]
pub struct LocationAppearance {
    pub universe: UniverseId,
    pub universe_name: String,
    pub coordinates: LocationCoordinates,
    pub body: Option<LocationBody>,
}
#[derive(Clone, Debug)]
pub struct LocationBody {
    pub id: BodyId,
    pub owner: PlayerId,
    pub kind: LocationBodyKind,
    pub name: Option<String>,
}

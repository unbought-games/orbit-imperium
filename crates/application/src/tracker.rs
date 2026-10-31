//! Narrow, public-information projection for external read-only trackers.
use crate::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrackerPlanet {
    pub id: BodyId,
    pub owner: PlayerId,
    pub name: Option<String>,
    pub coordinates: orbit_engine::Coordinates,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrackerSnapshot {
    pub schema_version: u32,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub sampled_at: i64,
    pub processing_pending: bool,
    pub players: Vec<RankingPlayer>,
    pub planets: Vec<TrackerPlanet>,
}

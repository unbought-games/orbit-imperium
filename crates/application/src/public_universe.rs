//! Independent, anonymous publication contracts. Only source observations are durable.
use crate::*;
use orbit_engine::{AssetLot, BodyId, Coordinates};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PublicFeed {
    Players,
    Planets,
}
impl PublicFeed {
    pub const ALL: [Self; 2] = [Self::Players, Self::Planets];
    pub fn name(self) -> &'static str {
        match self {
            Self::Players => "players",
            Self::Planets => "planets",
        }
    }
    pub fn period_ms(self) -> i64 {
        match self {
            Self::Players => 3_600_000,
            Self::Planets => 86_400_000,
        }
    }
    pub fn next_boundary(self, at: i64) -> i64 {
        (at.div_euclid(self.period_ms()) + 1) * self.period_ms()
    }
}
pub const PUBLICATION_ATTEMPTS: i32 = 4;
pub fn publication_retry_ms(attempt: i32, error: &StoreError) -> Option<i64> {
    if !matches!(error, StoreError::Unavailable | StoreError::SnapshotRetry) {
        return None;
    }
    match attempt {
        1 => Some(1000),
        2 => Some(5000),
        3 => Some(30_000),
        _ => None,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicFeedAlliance {
    pub id: uuid::Uuid,
    pub name: String,
    pub tag: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicPlayer {
    pub player_id: PlayerId,
    pub username: String,
    pub points: String,
    pub rank: u32,
    pub alliance: Option<PublicFeedAlliance>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicPlanet {
    pub planet_id: BodyId,
    pub name: Option<String>,
    pub coordinates: Coordinates,
    pub owner_player_id: PlayerId,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicPlayers {
    pub schema_version: u8,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub sampled_at: i64,
    pub next_refresh_at: i64,
    pub players: Vec<PublicPlayer>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicPlanets {
    pub schema_version: u8,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub sampled_at: i64,
    pub next_refresh_at: i64,
    pub planets: Vec<PublicPlanet>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum PublicUniverseResponse {
    Players(PublicPlayers),
    Planets(PublicPlanets),
}

/// Historical facts at a publication boundary, never authoritative gameplay state.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum PublicSource {
    Players {
        names: PublicPlayerNames,
        lots: Vec<AssetLot>,
        alliances: Vec<AllianceRankingObservation>,
    },
    Planets {
        planets: Vec<PublicPlanet>,
    },
}
#[derive(Clone, Debug)]
pub struct PublicObservation {
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub boundary: i64,
    pub sampled_at: i64,
    pub source: PublicSource,
}
impl PublicObservation {
    pub fn project(self) -> Result<PublicUniverseResponse, ServiceError> {
        let Self {
            universe,
            epoch,
            boundary,
            sampled_at,
            source,
        } = self;
        Ok(match source {
            PublicSource::Players {
                names,
                lots,
                alliances,
            } => {
                let affiliations: BTreeMap<_, _> = alliances
                    .iter()
                    .flat_map(|a| a.members.iter().map(move |p| (*p, &a.alliance)))
                    .collect();
                let players = rank_players(names, lots)?
                    .into_iter()
                    .map(|p| PublicPlayer {
                        player_id: p.player,
                        username: p.username,
                        points: p.points,
                        rank: p.rank,
                        alliance: affiliations.get(&p.player).map(|a| PublicFeedAlliance {
                            id: a.id,
                            name: a.name.clone(),
                            tag: a.tag.clone(),
                        }),
                    })
                    .collect();
                PublicUniverseResponse::Players(PublicPlayers {
                    schema_version: 1,
                    universe,
                    epoch,
                    sampled_at,
                    next_refresh_at: PublicFeed::Players.next_boundary(boundary),
                    players,
                })
            }
            PublicSource::Planets { planets } => PublicUniverseResponse::Planets(PublicPlanets {
                schema_version: 1,
                universe,
                epoch,
                sampled_at,
                next_refresh_at: PublicFeed::Planets.next_boundary(boundary),
                planets,
            }),
        })
    }
}
impl<S: GameStore> GameService<S> {
    pub async fn public_universe(
        &self,
        universe: UniverseId,
        feed: PublicFeed,
    ) -> Result<PublicUniverseResponse, ServiceError> {
        self.store
            .public_observation(universe, feed)
            .await?
            .project()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn utc_boundaries_and_bounded_transient_retries() {
        assert_eq!(PublicFeed::Players.next_boundary(3_599_999), 3_600_000);
        assert_eq!(PublicFeed::Players.next_boundary(3_600_000), 7_200_000);
        assert_eq!(PublicFeed::Planets.next_boundary(86_399_999), 86_400_000);
        assert_eq!(PublicFeed::Planets.next_boundary(86_400_000), 172_800_000);
        for (attempt, delay) in [
            (1, Some(1000)),
            (2, Some(5000)),
            (3, Some(30_000)),
            (4, None),
        ] {
            assert_eq!(
                publication_retry_ms(attempt, &StoreError::Unavailable),
                delay
            );
            assert_eq!(
                publication_retry_ms(attempt, &StoreError::SnapshotRetry),
                delay
            );
            assert_eq!(
                publication_retry_ms(attempt, &StoreError::CorruptData),
                None
            );
        }
    }
}

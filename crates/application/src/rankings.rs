use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

const MICRO_PER_POINT: i128 = 1_000_000_000;

pub struct RankingFacts {
    pub roster: RankingRoster,
    pub sampled_at: i64,
    pub processing_pending: bool,
    pub baseline: Option<(i64, DailyStandings)>,
}

pub struct ScoredPlayer {
    pub username: String,
    pub score_micro: i64,
}

pub struct RankingRoster {
    pub players: BTreeMap<PlayerId, ScoredPlayer>,
    pub alliances: BTreeMap<Uuid, AllianceRankingObservation>,
}

pub struct AllianceRankingObservation {
    pub alliance: AllianceIdentity,
    pub members: Vec<PlayerId>,
}

/// Exact closing values and the ranks observed together. Day, epoch and sample
/// time live on the containing snapshot row. A wide value supports alliance sums.
#[derive(Serialize, Deserialize)]
pub struct ClosingStanding<Id> {
    pub id: Id,
    pub score_micro: i128,
    pub rank: u32,
}

#[derive(Serialize, Deserialize)]
pub struct DailyStandings {
    pub players: Vec<ClosingStanding<PlayerId>>,
    pub alliances: Vec<ClosingStanding<Uuid>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RankingAlliance {
    pub alliance: AllianceIdentity,
    pub member_count: u32,
    pub points: String,
    pub average_points: String,
    pub rank: u32,
    pub previous_rank: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RankingPlayer {
    pub player: PlayerId,
    pub username: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alliance: Option<AllianceIdentity>,
    pub points: String,
    pub rank: u32,
    pub previous_rank: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Rankings {
    pub binding: Binding,
    pub request_id: uuid::Uuid,
    pub sampled_at: i64,
    pub processing_pending: bool,
    pub players: Vec<RankingPlayer>,
    pub baseline_at: Option<i64>,
    pub alliances: Vec<RankingAlliance>,
    pub alliance_baseline_at: Option<i64>,
}

impl<S: GameStore> GameService<S> {
    pub async fn rankings(&self, p: Principal, c: QueryContext) -> Result<Rankings, ServiceError> {
        Self::principal(p, c.binding)?;
        self.store.bot_observe(c.binding).await?;
        let facts = self.store.ranking_facts(c.binding).await?;
        let baseline_at = facts.baseline.as_ref().map(|(at, _)| *at);
        let baseline = facts.baseline.as_ref().map(|(_, b)| b);
        let players = facts.roster.player_rows(baseline)?;
        let alliances = facts.roster.alliance_rows(baseline)?;
        Ok(Rankings {
            binding: c.binding,
            request_id: c.request_id,
            sampled_at: facts.sampled_at,
            processing_pending: facts.processing_pending,
            players,
            baseline_at,
            alliances,
            alliance_baseline_at: baseline_at,
        })
    }
}

/// Equal displayed whole points share rank. UUID order stabilizes ties.
fn rank<Id: Ord>(mut values: Vec<(Id, i128)>) -> Result<Vec<ClosingStanding<Id>>, ServiceError> {
    values.sort_by(|a, b| {
        (b.1 / MICRO_PER_POINT)
            .cmp(&(a.1 / MICRO_PER_POINT))
            .then(a.0.cmp(&b.0))
    });
    let mut previous = None;
    let mut rank = 0;
    values
        .into_iter()
        .enumerate()
        .map(|(i, (id, score_micro))| {
            if score_micro < 0 {
                return Err(ServiceError::InvariantFailure);
            }
            let points = score_micro / MICRO_PER_POINT;
            if previous != Some(points) {
                rank = u32::try_from(i + 1).map_err(|_| ServiceError::InvariantFailure)?;
                previous = Some(points);
            }
            Ok(ClosingStanding {
                id,
                score_micro,
                rank,
            })
        })
        .collect()
}

impl RankingRoster {
    pub fn standings(&self) -> Result<DailyStandings, ServiceError> {
        Ok(DailyStandings {
            players: self.player_standings()?,
            alliances: self.alliance_standings()?,
        })
    }

    fn player_standings(&self) -> Result<Vec<ClosingStanding<PlayerId>>, ServiceError> {
        rank(
            self.players
                .iter()
                .map(|(id, p)| (*id, i128::from(p.score_micro)))
                .collect(),
        )
    }

    fn alliance_standings(&self) -> Result<Vec<ClosingStanding<Uuid>>, ServiceError> {
        let mut members = BTreeSet::new();
        let mut totals = Vec::with_capacity(self.alliances.len());
        for (&id, alliance) in &self.alliances {
            let mut total = 0_i128;
            for member in &alliance.members {
                if !members.insert(*member) {
                    return Err(ServiceError::InvariantFailure);
                }
                let player = self
                    .players
                    .get(member)
                    .ok_or(ServiceError::InvariantFailure)?;
                total += i128::from(player.score_micro);
            }
            totals.push((id, total));
        }
        rank(totals)
    }

    pub fn player_rows(
        &self,
        baseline: Option<&DailyStandings>,
    ) -> Result<Vec<RankingPlayer>, ServiceError> {
        let previous_players: BTreeMap<_, _> = baseline
            .into_iter()
            .flat_map(|b| &b.players)
            .map(|p| (p.id, p.rank))
            .collect();
        let affiliations: BTreeMap<_, _> = self
            .alliances
            .values()
            .flat_map(|a| a.members.iter().map(|p| (*p, &a.alliance)))
            .collect();
        Ok(self
            .player_standings()?
            .into_iter()
            .map(|p| RankingPlayer {
                player: p.id,
                username: self.players[&p.id].username.clone(),
                alliance: affiliations.get(&p.id).map(|a| (*a).clone()),
                points: (p.score_micro / MICRO_PER_POINT).to_string(),
                rank: p.rank,
                previous_rank: previous_players.get(&p.id).copied(),
            })
            .collect())
    }

    pub fn alliance_rows(
        &self,
        baseline: Option<&DailyStandings>,
    ) -> Result<Vec<RankingAlliance>, ServiceError> {
        let previous_alliances: BTreeMap<_, _> = baseline
            .into_iter()
            .flat_map(|b| &b.alliances)
            .map(|a| (a.id, a.rank))
            .collect();
        self.alliance_standings()?
            .into_iter()
            .map(|a| {
                let identity = &self.alliances[&a.id];
                let member_count = u32::try_from(identity.members.len())
                    .map_err(|_| ServiceError::InvariantFailure)?;
                Ok(RankingAlliance {
                    alliance: identity.alliance.clone(),
                    member_count,
                    points: (a.score_micro / MICRO_PER_POINT).to_string(),
                    average_points: (a.score_micro
                        / i128::from(member_count.max(1))
                        / MICRO_PER_POINT)
                        .to_string(),
                    rank: a.rank,
                    previous_rank: previous_alliances.get(&a.id).copied(),
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn player(n: u128) -> PlayerId {
        PlayerId(Uuid::from_u128(n))
    }
    fn roster(values: &[(u128, i64)], alliances: &[(u128, &[u128])]) -> RankingRoster {
        RankingRoster {
            players: values
                .iter()
                .map(|&(n, v)| {
                    (
                        player(n),
                        ScoredPlayer {
                            username: format!("Pilot {n}"),
                            score_micro: v,
                        },
                    )
                })
                .collect(),
            alliances: alliances
                .iter()
                .map(|&(n, members)| {
                    let id = Uuid::from_u128(n);
                    (
                        id,
                        AllianceRankingObservation {
                            alliance: AllianceIdentity {
                                id,
                                universe: UniverseId(Uuid::from_u128(100)),
                                name: format!("Alliance {n}"),
                                tag: format!("A{n}"),
                                visual_identity: None,
                            },
                            members: members.iter().copied().map(player).collect(),
                        },
                    )
                })
                .collect(),
        }
    }

    #[test]
    fn ties_on_displayed_points_use_uuid_order_and_skip_shared_ranks() {
        let current = roster(
            &[
                (4, 0),
                (3, 999_999_999),
                (2, 1_900_000_000),
                (1, 1_200_000_000),
            ],
            &[],
        );
        let rows = current.player_rows(None).unwrap();
        assert_eq!(
            rows.iter()
                .map(|r| (r.player, r.points.as_str(), r.rank, r.previous_rank))
                .collect::<Vec<_>>(),
            [
                (player(1), "1", 1, None),
                (player(2), "1", 1, None),
                (player(3), "0", 3, None),
                (player(4), "0", 3, None)
            ]
        );
    }

    #[test]
    fn alliance_sums_exact_values_before_rounding_and_exceeds_i64_safely() {
        let current = roster(
            &[
                (1, 600_000_000),
                (2, 600_000_000),
                (3, i64::MAX),
                (4, i64::MAX),
            ],
            &[(1, &[1, 2]), (2, &[3, 4]), (3, &[])],
        );
        let rows = current.alliance_rows(None).unwrap();
        assert_eq!(
            rows.iter()
                .map(|r| (
                    r.points.as_str(),
                    r.average_points.as_str(),
                    r.rank,
                    r.member_count
                ))
                .collect::<Vec<_>>(),
            [
                ("18446744073", "9223372036", 1, 2),
                ("1", "0", 2, 2),
                ("0", "0", 3, 0)
            ]
        );
        let standings = current.standings().unwrap();
        let decoded: DailyStandings =
            serde_json::from_slice(&serde_json::to_vec(&standings).unwrap()).unwrap();
        assert_eq!(decoded.alliances[0].score_micro, 2 * i128::from(i64::MAX));
    }

    #[test]
    fn movement_joins_observed_ids_through_departures_and_membership_changes() {
        let previous = roster(
            &[(1, 3_000_000_000), (2, 2_000_000_000), (3, 1_000_000_000)],
            &[(10, &[1]), (20, &[2]), (30, &[3])],
        )
        .standings()
        .unwrap();
        let current = roster(
            &[(2, 1_000_000_000), (3, 2_000_000_000), (4, 0)],
            &[(30, &[2, 3]), (40, &[4])],
        );
        let players = current.player_rows(Some(&previous)).unwrap();
        let alliances = current.alliance_rows(Some(&previous)).unwrap();
        assert_eq!(
            players
                .iter()
                .map(|r| (r.player, r.rank, r.previous_rank))
                .collect::<Vec<_>>(),
            [
                (player(3), 1, Some(3)),
                (player(2), 2, Some(2)),
                (player(4), 3, None)
            ]
        );
        assert_eq!(
            alliances
                .iter()
                .map(|a| (a.alliance.id.as_u128(), a.rank, a.previous_rank))
                .collect::<Vec<_>>(),
            [(30, 1, Some(3)), (40, 2, None)]
        );
    }

    #[test]
    fn duplicate_memberships_and_invalid_values_never_publish_partial_standings() {
        assert!(
            roster(&[(1, 10)], &[(1, &[1]), (2, &[1])])
                .standings()
                .is_err()
        );
        assert!(roster(&[(1, 10)], &[(1, &[1, 1])]).standings().is_err());
        assert!(roster(&[(1, -1)], &[]).standings().is_err());
        assert!(roster(&[], &[(1, &[1])]).standings().is_err());
        assert!(roster(&[], &[]).standings().unwrap().players.is_empty());
    }
}

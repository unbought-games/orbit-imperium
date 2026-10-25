use crate::*;
use orbit_engine::{AssetLot, value_completed_assets};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Private source facts from one committed database snapshot.
pub struct RankingFacts {
    pub names: PublicPlayerNames,
    pub lots: Vec<AssetLot>,
    pub sampled_at: i64,
    pub processing_pending: bool,
    pub baseline: Option<RankingObservation>,
}

/// Historical source facts, never persisted scores, ranks or deltas.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RankingObservation {
    pub sampled_at: i64,
    pub players: Vec<PlayerId>,
    pub lots: Vec<AssetLot>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RankingPlayer {
    pub player: PlayerId,
    pub username: String,
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
}

impl<S: GameStore> GameService<S> {
    pub async fn rankings(&self, p: Principal, c: QueryContext) -> Result<Rankings, ServiceError> {
        Self::principal(p, c.binding)?;
        let facts = self.store.ranking_facts(c.binding).await?;
        let baseline_at = facts.baseline.as_ref().map(|b| b.sampled_at);
        let players = rank_with_baseline(facts.names, facts.lots, facts.baseline)?;
        Ok(Rankings {
            binding: c.binding,
            request_id: c.request_id,
            sampled_at: facts.sampled_at,
            processing_pending: facts.processing_pending,
            players,
            baseline_at,
        })
    }
}

pub fn rank_with_baseline(
    names: PublicPlayerNames,
    lots: Vec<AssetLot>,
    baseline: Option<RankingObservation>,
) -> Result<Vec<RankingPlayer>, ServiceError> {
    let previous = match baseline {
        Some(b) => rank_players(
            b.players.into_iter().map(|p| (p, String::new())).collect(),
            b.lots,
        )?,
        None => vec![],
    };
    let ranks: BTreeMap<_, _> = previous.into_iter().map(|p| (p.player, p.rank)).collect();
    let mut players = rank_players(names, lots)?;
    for player in &mut players {
        player.previous_rank = ranks.get(&player.player).copied();
    }
    Ok(players)
}

/// Sum exact paid values before flooring. Ranking compares displayed points;
/// UUID order only makes ties deterministic, it does not break shared ranks.
pub fn rank_players(
    names: PublicPlayerNames,
    lots: Vec<AssetLot>,
) -> Result<Vec<RankingPlayer>, ServiceError> {
    let mut by_owner: BTreeMap<PlayerId, Vec<AssetLot>> = BTreeMap::new();
    for lot in lots {
        by_owner.entry(lot.owner).or_default().push(lot);
    }
    let mut values = names
        .into_iter()
        .map(|(player, username)| {
            let value =
                value_completed_assets(by_owner.get(&player).map_or(&[], Vec::as_slice), player)
                    .map_err(|_| ServiceError::InvariantFailure)?;
            Ok((player, username, value / 1_000_000_000))
        })
        .collect::<Result<Vec<_>, ServiceError>>()?;
    values.sort_by(|a, b| b.2.cmp(&a.2).then(a.0.cmp(&b.0)));
    let mut previous = None;
    let mut rank = 0;
    values
        .into_iter()
        .enumerate()
        .map(|(i, (player, username, points))| {
            if previous != Some(points) {
                rank = u32::try_from(i + 1).map_err(|_| ServiceError::InvariantFailure)?;
                previous = Some(points);
            }
            Ok(RankingPlayer {
                player,
                username,
                points: points.to_string(),
                rank,
                previous_rank: None,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_engine::*;
    fn player(n: u128) -> PlayerId {
        PlayerId(uuid::Uuid::from_u128(n))
    }
    fn lot(owner: u128, value: i64) -> AssetLot {
        AssetLot {
            id: OperationId(uuid::Uuid::from_u128(owner)),
            owner: player(owner),
            item: CatalogKey::Ship(ShipType::SmallCargo),
            level: None,
            location: AssetLocation::Player,
            quantity: 1,
            unit_value_micro: value,
            rules_hash: Hash("a".repeat(64)),
            source_operation: OperationId(uuid::Uuid::from_u128(owner)),
            acquired_at: 1000,
            acquired_sequence: 1,
        }
    }
    #[test]
    fn sums_before_flooring_ties_on_whole_points_and_retains_zero_players() {
        let names = (1..=4)
            .map(|n| (player(n), format!("Player {n}")))
            .collect();
        let rows = rank_players(
            names,
            vec![
                lot(1, 600_000_000),
                lot(1, 600_000_000),
                lot(2, 1_900_000_000),
                lot(3, 999_999_999),
                lot(99, 900_000_000_000),
            ],
        )
        .unwrap();
        assert_eq!(
            rows.iter()
                .map(|p| (p.player, p.points.as_str(), p.rank))
                .collect::<Vec<_>>(),
            vec![
                (player(1), "1", 1),
                (player(2), "1", 1),
                (player(3), "0", 3),
                (player(4), "0", 3)
            ]
        );
    }
    #[test]
    fn movement_uses_global_shared_ranks_and_distinguishes_new_and_missing_history() {
        let names: PublicPlayerNames = (1..=5).map(|n| (player(n), format!("Pilot {n}"))).collect();
        // Historical ranks: 1=1, 2=2, 3=2, 4=4, departed player 6=5.
        let baseline = RankingObservation {
            sampled_at: 1000,
            players: [1, 2, 3, 4, 6].map(player).into(),
            lots: vec![
                lot(1, 5_000_000_000),
                lot(2, 3_000_000_000),
                lot(3, 3_000_000_000),
                lot(4, 1_000_000_000),
            ],
        };
        let lots = vec![
            lot(1, 2_000_000_000),
            lot(2, 4_000_000_000),
            lot(3, 2_000_000_000),
            lot(4, 1_000_000_000),
        ];
        let rows = rank_with_baseline(names.clone(), lots.clone(), Some(baseline)).unwrap();
        assert_eq!(
            rows.iter()
                .map(|p| (p.player, p.rank, p.previous_rank))
                .collect::<Vec<_>>(),
            vec![
                (player(2), 1, Some(2)), // gain
                (player(1), 2, Some(1)), // loss
                (player(3), 2, Some(2)), // unchanged tied rank
                (player(4), 4, Some(4)), // skipped shared rank
                (player(5), 5, None),    // new zero-point player
            ]
        );
        assert!(
            rank_with_baseline(names, lots, None)
                .unwrap()
                .iter()
                .all(|p| p.previous_rank.is_none())
        );
    }

    #[test]
    fn location_does_not_affect_value_and_large_values_remain_exact() {
        let mut flying = lot(1, 600_000_000);
        flying.location = AssetLocation::Fleet(FleetId(uuid::Uuid::from_u128(9)));
        let rows = rank_players(
            [(player(1), "Pilot".into()), (player(2), "Large".into())].into(),
            vec![flying, lot(1, 600_000_000), lot(2, i64::MAX)],
        )
        .unwrap();
        assert_eq!(rows[0].points, "9223372036");
        assert_eq!(rows[1].points, "1");
        assert_eq!(rows[1].rank, 2);
    }
    #[test]
    fn rejects_corrupt_values_and_overflow_without_publishing_partial_ranks() {
        for lots in [vec![lot(1, -1)], vec![lot(1, i64::MAX), lot(1, 1)]] {
            assert!(rank_players([(player(1), "Pilot".into())].into(), lots).is_err());
        }
        assert!(rank_players(Default::default(), vec![]).unwrap().is_empty());
    }
}

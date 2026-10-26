use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::AssetLot;

impl PgStore {
    pub(crate) async fn read_rankings(&self, b: Binding) -> Result<RankingFacts, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        crate::bots::observe(&mut tx, b).await?;
        if crate::facts::rules(&mut tx, b.universe).await?.protocol() != 4 {
            return Err(StoreError::UnsupportedProtocol);
        }
        let names: Vec<(uuid::Uuid, String)> = sqlx::query_as(
            "SELECT p.id,a.name FROM players p JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.id JOIN accounts a ON a.id=m.account WHERE p.universe=$1 ORDER BY p.id",
        ).bind(b.universe.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        let (lots, alliances) = source_facts(&mut tx, b.universe, b.epoch).await?;
        let sampled_at = now(&mut tx).await?;
        let day = sampled_at.div_euclid(86_400_000);
        let baseline = baseline(&mut tx, b.universe, b.epoch, day).await?;
        let recorded: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM ranking_observations WHERE universe=$1 AND epoch=$2 AND day=$3)",
        ).bind(b.universe.0).bind(b.epoch.0).bind(day)
            .fetch_one(&mut *tx).await.map_err(db_error)?;
        // Do not claim queued completions are reflected, or expose their times,
        // owners, inventory, or the universe's private revision.
        let processing_pending: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM pending_inputs WHERE universe=$1 AND at_ms<=$2)",
        )
        .bind(b.universe.0)
        .bind(sampled_at)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let result = RankingFacts {
            names: names
                .into_iter()
                .map(|(id, name)| (PlayerId(id), name))
                .collect(),
            lots,
            alliances,
            sampled_at,
            processing_pending,
            baseline,
        };
        tx.commit().await.map_err(db_error)?;
        if !recorded {
            // Separate from the read-only game snapshot: record the exact source
            // observation, with a unique daily key arbitrating concurrent readers.
            let observation = RankingObservation {
                sampled_at,
                players: result.names.keys().copied().collect(),
                lots: result.lots.clone(),
                alliances: Some(result.alliances.clone()),
            };
            let mut history = self.begin_tx(self.read_pool()?).await?;
            sqlx::query("INSERT INTO ranking_observations(universe,epoch,day,observation) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING")
                .bind(b.universe.0).bind(b.epoch.0).bind(day)
                .bind(serde_json::to_value(observation).map_err(|_| StoreError::CorruptData)?)
                .execute(&mut *history).await.map_err(db_error)?;
            sqlx::query("DELETE FROM ranking_observations WHERE universe=$1 AND day<$2")
                .bind(b.universe.0)
                .bind(day - 1)
                .execute(&mut *history)
                .await
                .map_err(db_error)?;
            history.commit().await.map_err(db_error)?;
        }
        Ok(result)
    }
}

/// Derive public summary scores in the caller's repeatable-read snapshot. This
/// never returns membership facts or writes observations; summaries and rankings
/// use the same valuation and history rules.
pub(crate) async fn alliance_scores_in_snapshot(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
) -> Result<std::collections::BTreeMap<uuid::Uuid, AllianceScore>, StoreError> {
    let (lots, alliances) = source_facts(tx, universe, epoch).await?;
    let day = now(tx).await?.div_euclid(86_400_000);
    let baseline = baseline(tx, universe, epoch, day).await?;
    let baseline_at = alliance_baseline_at(baseline.as_ref());
    let rows = rank_alliances_with_baseline(&alliances, &lots, baseline.as_ref())
        .map_err(|_| StoreError::CorruptData)?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.alliance.id,
                AllianceScore {
                    rank: u64::from(row.rank),
                    points: row.points,
                    average_points: row.average_points,
                    previous_rank: row.previous_rank.map(u64::from),
                    baseline_at,
                },
            )
        })
        .collect())
}

async fn baseline(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
    day: i64,
) -> Result<Option<RankingObservation>, StoreError> {
    let observation: Option<serde_json::Value> = sqlx::query_scalar(
        "SELECT observation FROM ranking_observations WHERE universe=$1 AND epoch=$2 AND day=$3",
    )
    .bind(universe.0)
    .bind(epoch.0)
    .bind(day - 1)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    observation.map(decode::<RankingObservation>).transpose()
}

async fn source_facts(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
) -> Result<(Vec<AssetLot>, Vec<AllianceRankingObservation>), StoreError> {
    let lots: Vec<serde_json::Value> =
        sqlx::query_scalar("SELECT data FROM asset_lots WHERE universe=$1 ORDER BY key")
            .bind(universe.0)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?;
    let alliances: Vec<(uuid::Uuid, String, String, Vec<uuid::Uuid>)> = sqlx::query_as(
        "SELECT a.id,a.name,a.tag,COALESCE(array_agg(m.player ORDER BY m.player) FILTER (WHERE m.player IS NOT NULL),ARRAY[]::uuid[]) FROM alliances a LEFT JOIN alliance_memberships m ON m.universe=a.universe AND m.epoch=a.epoch AND m.alliance=a.id WHERE a.universe=$1 AND a.epoch=$2 GROUP BY a.id,a.name,a.tag ORDER BY a.id",
    ).bind(universe.0).bind(epoch.0).fetch_all(&mut **tx).await.map_err(db_error)?;
    Ok((
        lots.into_iter()
            .map(decode::<AssetLot>)
            .collect::<Result<_, _>>()?,
        alliances
            .into_iter()
            .map(|(id, name, tag, members)| AllianceRankingObservation {
                alliance: AllianceIdentity {
                    id,
                    universe,
                    name,
                    tag,
                },
                members: members.into_iter().map(PlayerId).collect(),
            })
            .collect(),
    ))
}

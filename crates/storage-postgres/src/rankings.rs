use crate::{ordering::*, *};
use orbit_application::*;
use sqlx::types::Json;
use std::collections::BTreeMap;
use uuid::Uuid;

const UTC_DAY_MS: i64 = 86_400_000;

impl PgStore {
    pub(crate) async fn read_rankings(&self, b: Binding) -> Result<RankingFacts, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        crate::bots::observe(&mut tx, b).await?;
        if crate::facts::rules(&mut tx, b.universe).await?.protocol() != 4 {
            return Err(StoreError::UnsupportedProtocol);
        }
        let sampled_at = now(&mut tx).await?;
        let mut roster = score_roster(&mut tx, b.universe, b.epoch)
            .await?
            .ok_or(StoreError::Unavailable)?;
        let baseline = baseline(&mut tx, b.universe, b.epoch, sampled_at).await?;
        let processing_pending: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM pending_inputs WHERE universe=$1 AND at_ms<=$2)",
        )
        .bind(b.universe.0)
        .bind(sampled_at)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let visuals: Vec<(Uuid,Json<AllianceVisualIdentity>)>=sqlx::query_as("SELECT p.alliance,p.identity FROM alliance_presentation p JOIN alliances a ON a.id=p.alliance WHERE a.universe=$1 AND a.epoch=$2 AND p.schema_version=1").bind(b.universe.0).bind(b.epoch.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        for alliance in roster.alliances.values_mut() {
            alliance.alliance.visual_identity = Some(Default::default());
        }
        for (id, visual) in visuals {
            if let Some(a) = roster.alliances.get_mut(&id) {
                a.alliance.visual_identity = Some(visual.0);
            }
        }
        Ok(RankingFacts {
            roster,
            sampled_at,
            processing_pending,
            baseline,
        })
    }

    /// Sample both standings from one committed view. Concurrent operators and workers
    /// race only at the unique publication key; the first successful insert wins.
    pub async fn capture_ranking_snapshot(&self, universe: UniverseId) -> Result<bool, StoreError> {
        let mut read = crate::snapshots::begin(self, self.worker_pool()?).await?;
        let sampled_at = now(&mut read).await?;
        let day = sampled_at.div_euclid(UTC_DAY_MS);
        let epoch = Epoch(
            sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
                .bind(universe.0)
                .fetch_optional(&mut *read)
                .await
                .map_err(db_error)?
                .ok_or(StoreError::NotFound)?,
        );
        if crate::facts::rules(&mut read, universe).await?.protocol() != 4 {
            return Err(StoreError::UnsupportedProtocol);
        }
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ranking_daily_snapshots WHERE universe=$1 AND epoch=$2 AND day=$3)")
            .bind(universe.0).bind(epoch.0).bind(day).fetch_one(&mut *read).await.map_err(db_error)?;
        if exists {
            read.commit().await.map_err(db_error)?;
            return Ok(false);
        }
        let roster = score_roster(&mut read, universe, epoch)
            .await?
            .ok_or(StoreError::Unavailable)?;
        read.commit().await.map_err(db_error)?;
        let standings = roster.standings().map_err(|_| StoreError::CorruptData)?;

        let mut write = self.begin_tx(self.worker_pool()?).await?;
        let current_epoch: Option<Uuid> =
            sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1 FOR SHARE")
                .bind(universe.0)
                .fetch_optional(&mut *write)
                .await
                .map_err(db_error)?;
        if current_epoch != Some(epoch.0) {
            return Err(StoreError::EpochChanged);
        }
        let inserted = sqlx::query("INSERT INTO ranking_daily_snapshots(universe,epoch,day,sampled_at,standings) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING")
            .bind(universe.0).bind(epoch.0).bind(day).bind(sampled_at).bind(Json(&standings))
            .execute(&mut *write).await.map_err(db_error)?.rows_affected() == 1;
        if inserted {
            // Retain the latest two captures even when a whole UTC day was missed.
            sqlx::query("DELETE FROM ranking_daily_snapshots WHERE universe=$1 AND (epoch<>$2 OR day < (SELECT day FROM ranking_daily_snapshots WHERE universe=$1 AND epoch=$2 ORDER BY day DESC OFFSET 1 LIMIT 1))")
                .bind(universe.0).bind(epoch.0).execute(&mut *write).await.map_err(db_error)?;
        }
        write.commit().await.map_err(db_error)?;
        Ok(inserted)
    }
}

pub(crate) async fn alliance_scores_in_snapshot(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
) -> Result<BTreeMap<Uuid, AllianceScore>, StoreError> {
    let Some(roster) = score_roster(tx, universe, epoch).await? else {
        // Ranking enrichment is optional while the universe is being backfilled.
        return Ok(BTreeMap::new());
    };
    let sampled_at = now(tx).await?;
    let baseline = baseline(tx, universe, epoch, sampled_at).await?;
    let baseline_at = baseline.as_ref().map(|(at, _)| *at);
    let alliances = roster
        .alliance_rows(baseline.as_ref().map(|(_, b)| b))
        .map_err(|_| StoreError::CorruptData)?;
    Ok(alliances
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
    u: UniverseId,
    epoch: Epoch,
    at: i64,
) -> Result<Option<(i64, DailyStandings)>, StoreError> {
    let row:Option<(i64,Json<DailyStandings>)>=sqlx::query_as("SELECT sampled_at,standings FROM ranking_daily_snapshots WHERE universe=$1 AND epoch=$2 AND day<$3 ORDER BY day DESC LIMIT 1")
        .bind(u.0).bind(epoch.0).bind(at.div_euclid(UTC_DAY_MS)).fetch_optional(&mut **tx).await.map_err(db_error)?;
    Ok(row.map(|(at, Json(standings))| (at, standings)))
}

/// None means at least one current member still lacks a score. Zero is a valid score.
pub(crate) async fn score_roster(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
) -> Result<Option<RankingRoster>, StoreError> {
    let rows:Vec<(Uuid,String,Option<i64>)> = sqlx::query_as("SELECT p.id,a.name,p.current_score_micro FROM players p JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.id JOIN accounts a ON a.id=m.account WHERE p.universe=$1")
        .bind(universe.0).fetch_all(&mut **tx).await.map_err(db_error)?;
    let mut players = BTreeMap::new();
    for (id, username, score) in rows {
        let Some(score_micro) = score else {
            return Ok(None);
        };
        players.insert(
            PlayerId(id),
            ScoredPlayer {
                username,
                score_micro,
            },
        );
    }
    let alliances: Vec<(Uuid, String, String, Vec<Uuid>)> = sqlx::query_as(
        "SELECT a.id,a.name,a.tag,COALESCE(array_agg(m.player ORDER BY m.player) FILTER (WHERE m.player IS NOT NULL),ARRAY[]::uuid[]) FROM alliances a LEFT JOIN alliance_memberships m ON m.universe=a.universe AND m.epoch=a.epoch AND m.alliance=a.id WHERE a.universe=$1 AND a.epoch=$2 GROUP BY a.id,a.name,a.tag",
    ).bind(universe.0).bind(epoch.0).fetch_all(&mut **tx).await.map_err(db_error)?;
    let alliances = alliances
        .into_iter()
        .map(|(id, name, tag, members)| {
            (
                id,
                AllianceRankingObservation {
                    alliance: AllianceIdentity {
                        id,
                        universe,
                        name,
                        tag,
                        visual_identity: None,
                    },
                    members: members.into_iter().map(PlayerId).collect(),
                },
            )
        })
        .collect();
    Ok(Some(RankingRoster { players, alliances }))
}

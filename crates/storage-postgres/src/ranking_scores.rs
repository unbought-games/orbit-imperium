use crate::{PgStore, StoreError, db_error, ordering::Tx};
use orbit_engine::{AssetLot, PlayerId, UniverseId, value_completed_assets_by_owner};
use std::collections::BTreeSet;
use uuid::Uuid;

/// The normal inventory commit already holds complete resulting lots for its
/// covered players. Include owners who lost their last lot with a zero value.
pub(crate) async fn save_current_scores(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    owners: &BTreeSet<PlayerId>,
    lots: &[AssetLot],
) -> Result<(), StoreError> {
    let totals = value_completed_assets_by_owner(lots).map_err(|_| StoreError::CorruptData)?;
    let (players, scores): (Vec<_>, Vec<_>) = owners
        .iter()
        .map(|owner| (owner.0, totals.get(owner).copied().unwrap_or_default()))
        .unzip();
    sqlx::query(
        "UPDATE players p SET current_score_micro=s.score
         FROM unnest($2::uuid[], $3::bigint[]) s(player,score)
         WHERE p.universe=$1 AND p.id=s.player AND p.current_score_micro IS DISTINCT FROM s.score",
    )
    .bind(universe.0)
    .bind(players)
    .bind(scores)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}

impl PgStore {
    /// Initialize at most `limit` players from committed paid-value lots.
    /// Return the number examined, including concurrent writers that won the
    /// race. Zero means a scan observed no remaining uninitialized members.
    pub async fn backfill_ranking_scores(
        &self,
        universe: UniverseId,
        limit: i64,
    ) -> Result<u64, StoreError> {
        if !(1..=1000).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_tx(&self.pool).await?;
        sqlx::query("SELECT id FROM universes WHERE id=$1 FOR KEY SHARE")
            .bind(universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        let rows: Vec<(Uuid, Option<i64>)> = sqlx::query_as(
            "WITH missing AS MATERIALIZED (
               SELECT p.id FROM players p JOIN universe_memberships m
                 ON m.universe=p.universe AND m.player=p.id
               WHERE p.universe=$1 AND p.current_score_micro IS NULL ORDER BY p.id LIMIT $2
             )
             SELECT m.id, (
               SELECT CASE WHEN count(*) FILTER (WHERE (
                        jsonb_typeof(data->'quantity')='number' AND (data->>'quantity')::bigint>=0
                    AND jsonb_typeof(data->'unit_value_micro')='number' AND (data->>'unit_value_micro')::bigint>=0
                  ) IS NOT TRUE)>0 THEN NULL
                  ELSE COALESCE(sum((data->>'quantity')::bigint::numeric * (data->>'unit_value_micro')::bigint),0)::bigint END
               FROM asset_lots WHERE universe=$1 AND data->>'owner'=m.id::text
             ) FROM missing m ORDER BY m.id",
        )
        .bind(universe.0)
        .bind(limit)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| match e.as_database_error().and_then(|db| db.code()).as_deref() {
            Some("22P02" | "22003") => StoreError::CorruptData,
            _ => db_error(e),
        })?;
        let examined = rows.len() as u64;
        let mut players = Vec::with_capacity(rows.len());
        let mut scores = Vec::with_capacity(rows.len());
        for (player, score) in rows {
            players.push(player);
            scores.push(score.ok_or(StoreError::CorruptData)?);
        }
        // READ COMMITTED rechecks this predicate after waiting for a live
        // inventory writer. Its newer absolute score must always win.
        sqlx::query(
            "UPDATE players p SET current_score_micro=s.score
             FROM unnest($2::uuid[], $3::bigint[]) s(player,score)
             WHERE p.universe=$1 AND p.id=s.player AND p.current_score_micro IS NULL",
        )
        .bind(universe.0)
        .bind(players)
        .bind(scores)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(examined)
    }
}

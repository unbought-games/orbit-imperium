use crate::{PgStore, StoreError, db_error, ordering::Tx};
use orbit_engine::{
    CatalogHolding, CatalogKey, PlayerId, UniverseId, catalog_asset_value,
    value_completed_assets_by_owner,
};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

/// Publish complete resulting holdings, including an owner who lost their last asset.
pub(crate) async fn save_current_scores(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    owners: &BTreeSet<PlayerId>,
    lots: &[CatalogHolding],
) -> Result<(), StoreError> {
    let totals = value_completed_assets_by_owner(lots).map_err(|_| StoreError::CorruptData)?;
    save_scores(tx, universe, owners, &totals).await
}
pub(crate) async fn save_scores(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    owners: &BTreeSet<PlayerId>,
    totals: &BTreeMap<PlayerId, i64>,
) -> Result<(), StoreError> {
    if owners.is_empty() {
        return Ok(());
    }
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
    /// Both the coordinated migrator and serving startup complete any retained
    /// migration markers before advertising readiness. Batches are restartable.
    pub(crate) async fn finish_catalog_score_upgrades(&self) -> Result<(), StoreError> {
        let universes: Vec<Uuid> =
            sqlx::query_scalar("SELECT universe FROM catalog_score_upgrades ORDER BY universe")
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
        for universe in universes {
            while self
                .backfill_ranking_scores(UniverseId(universe), 32)
                .await?
                > 0
            {}
            sqlx::query("DELETE FROM catalog_score_upgrades WHERE universe=$1")
                .bind(universe)
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
        }
        Ok(())
    }

    /// Initialize at most `limit` players from the active catalog and committed asset quantities.
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
        sqlx::query("SELECT id FROM universes WHERE id=$1 FOR SHARE")
            .bind(universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        let players: Vec<Uuid> = sqlx::query_scalar(
            "SELECT p.id FROM players p JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.id
             WHERE p.universe=$1 AND p.current_score_micro IS NULL ORDER BY p.id LIMIT $2",
        ).bind(universe.0).bind(limit).fetch_all(&mut *tx).await.map_err(db_error)?;
        let examined = players.len() as u64;
        if players.is_empty() {
            tx.commit().await.map_err(db_error)?;
            return Ok(0);
        }
        let rules = crate::facts::rules(&mut tx, universe).await?;
        // Use a single statement snapshot across all four authoritative collections:
        // a concurrently launched or returned ship must appear exactly once.
        let rows: Vec<(Uuid,serde_json::Value,Option<i64>,i64)> = sqlx::query_as(
            "SELECT b.owner, jsonb_build_object('kind','Building','id',l.building), l.level, 1::bigint FROM bodies b
             JOIN building_levels l ON l.body=b.id WHERE b.universe=$1 AND b.owner=ANY($2) AND l.level>0
             UNION ALL SELECT owner,jsonb_build_object('kind','Research','id',research),level,1::bigint
             FROM research_levels WHERE owner=ANY($2) AND level>0
             UNION ALL SELECT owner,item,NULL,count FROM inventories WHERE owner=ANY($2) AND count<>0
             UNION ALL SELECT f.owner,jsonb_build_object('kind','Ship','id',ship->>'ship_type'),NULL,(ship->>'count')::bigint
             FROM mission_fleets f CROSS JOIN LATERAL jsonb_array_elements(f.data->'ships') ship
             WHERE f.universe=$1 AND f.owner=ANY($2) AND f.data->>'leg' IN ('Outbound','Returning','Holding')",
        ).bind(universe.0).bind(&players).fetch_all(&mut *tx).await.map_err(db_error)?;
        let mut totals = BTreeMap::<Uuid, i64>::new();
        for (owner, item, level, count) in rows {
            let item: CatalogKey = crate::ordering::decode(item)?;
            if count < 0 {
                return Err(StoreError::CorruptData);
            }
            let mut add = |level| -> Result<(), StoreError> {
                let price = catalog_asset_value(&rules, item, level)
                    .map_err(|_| StoreError::CorruptData)?;
                let total = totals.entry(owner).or_default();
                *total = price
                    .checked_mul(count)
                    .and_then(|value| total.checked_add(value))
                    .ok_or(StoreError::CorruptData)?;
                Ok(())
            };
            if let Some(level) = level {
                for increment in 1..=u32::try_from(level).map_err(|_| StoreError::CorruptData)? {
                    add(Some(increment))?;
                }
            } else {
                add(None)?;
            }
        }
        let scores: Vec<_> = players
            .iter()
            .map(|id| totals.get(id).copied().unwrap_or(0))
            .collect();
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

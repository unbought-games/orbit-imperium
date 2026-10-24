use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::AssetLot;

impl PgStore {
    pub(crate) async fn read_rankings(&self, b: Binding) -> Result<RankingFacts, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        if crate::facts::rules(&mut tx, b.universe).await?.protocol() != 4 {
            return Err(StoreError::UnsupportedProtocol);
        }
        let names: Vec<(uuid::Uuid, String)> = sqlx::query_as(
            "SELECT p.id,a.name FROM players p JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.id JOIN accounts a ON a.id=m.account WHERE p.universe=$1 ORDER BY p.id",
        ).bind(b.universe.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        let lots: Vec<serde_json::Value> =
            sqlx::query_scalar("SELECT data FROM asset_lots WHERE universe=$1 ORDER BY key")
                .bind(b.universe.0)
                .fetch_all(&mut *tx)
                .await
                .map_err(db_error)?;
        let sampled_at = now(&mut tx).await?;
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
            lots: lots
                .into_iter()
                .map(decode::<AssetLot>)
                .collect::<Result<_, _>>()?,
            sampled_at,
            processing_pending,
        };
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
}

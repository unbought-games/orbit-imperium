//! Short admission coordination, independent of execution claims and fact-row locks.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use std::collections::BTreeSet;

pub(crate) fn sequence_name(u: UniverseId) -> String {
    format!("orbit_order_{}", u.0.simple())
}
pub(crate) fn scope_keys(scopes: &BTreeSet<ScopeKey>) -> Vec<String> {
    let mut keys: Vec<_> = scopes
        .iter()
        .map(|s| serde_json::to_string(s).expect("scope key"))
        .collect();
    keys.sort();
    keys
}
pub(crate) async fn is_scoped(tx: &mut Tx<'_>, u: UniverseId) -> Result<bool, StoreError> {
    sqlx::query_scalar("SELECT executor_mode='scoped' FROM universe_runtime WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
}
impl PgStore {
    pub async fn admit_scoped(&self, pair: ForegroundAction) -> Result<BoundReceipt, StoreError> {
        self.admit_pair(pair).await
    }
    pub async fn admit_presence_scoped(
        &self,
        order: CommandEnvelopeV4,
    ) -> Result<BoundReceipt, StoreError> {
        <Self as GameStore>::bound_presence4(self, order).await
    }

    /// Legacy locks use universe -> runtime order. Never take a runtime shared lock
    /// and then wait for a legacy universe gate: its owner may need to update runtime.
    pub(crate) async fn begin_admission(
        &self,
        u: UniverseId,
    ) -> Result<(Tx<'_>, bool), StoreError> {
        loop {
            let mut tx = self.begin_tx(self.admission_pool()?).await?;
            let scoped = is_scoped(&mut tx, u).await?;
            if !scoped {
                gate(&mut tx, u).await?;
            }
            let actual: bool = sqlx::query_scalar(
                "SELECT executor_mode='scoped' FROM universe_runtime WHERE universe=$1 FOR SHARE",
            )
            .bind(u.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
            if actual != scoped {
                tx.rollback().await.map_err(db_error)?;
                continue;
            }
            return Ok((tx, scoped));
        }
    }
}
pub(crate) async fn existing_command(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
    epoch: Epoch,
    id: CommandId,
    intent: &Hash,
) -> Result<Option<Receipt>, StoreError> {
    let row = sqlx::query("SELECT intent_hash,receipt FROM commands WHERE universe=$1 AND actor=$2 AND command_id=$3 AND epoch=$4")
        .bind(u.0).bind(player.0).bind(id.0).bind(epoch.0).fetch_optional(&mut **tx).await.map_err(db_error)?;
    row.map(|row| {
        if row.try_get::<String, _>("intent_hash").map_err(db_error)? != intent.0 {
            return Err(StoreError::Conflict);
        }
        decode(row.try_get("receipt").map_err(db_error)?)
    })
    .transpose()
}
pub(crate) async fn existing_pair(
    tx: &mut Tx<'_>,
    pair: &ForegroundAction,
) -> Result<Option<BoundReceipt>, StoreError> {
    let b = pair.gameplay.binding;
    let rows=sqlx::query("SELECT command_id,intent_hash,receipt FROM commands WHERE universe=$1 AND epoch=$2 AND actor=$3 AND command_id=ANY($4)")
        .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(vec![pair.presence.command_id.0,pair.gameplay.command_id.0]).fetch_all(&mut **tx).await.map_err(db_error)?;
    if rows.is_empty() {
        return Ok(None);
    }
    let intent = hash(pair);
    if rows.len() != 2
        || rows
            .iter()
            .any(|r| r.get::<String, _>("intent_hash") != intent.0)
    {
        return Err(StoreError::Conflict);
    }
    let row = rows
        .iter()
        .find(|r| r.get::<uuid::Uuid, _>("command_id") == pair.gameplay.command_id.0)
        .ok_or(StoreError::CorruptData)?;
    let mut result = BoundReceipt::new(b, decode(row.try_get("receipt").map_err(db_error)?)?);
    result.protocol = 4;
    Ok(Some(result))
}
pub(crate) async fn ensure_scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    scopes: &BTreeSet<ScopeKey>,
) -> Result<Vec<String>, StoreError> {
    let keys = scope_keys(scopes);
    if keys.is_empty() {
        return Err(StoreError::CorruptData);
    }
    for key in &keys {
        sqlx::query(
            "INSERT INTO execution_scopes(universe,key) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(u.0)
        .bind(key)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    }
    Ok(keys)
}
pub(crate) async fn stamp(
    tx: &mut Tx<'_>,
    u: UniverseId,
    scopes: &BTreeSet<ScopeKey>,
    observer: std::sync::Arc<dyn RuntimeObserver>,
) -> Result<(i64, RuntimeTimer), StoreError> {
    let waiting = std::time::Instant::now();
    let keys = ensure_scopes(tx, u, scopes).await?;
    let rows = sqlx::query("SELECT frontier FROM execution_scopes WHERE universe=$1 AND key=ANY($2) ORDER BY key FOR NO KEY UPDATE")
        .bind(u.0).bind(&keys).fetch_all(&mut **tx).await.map_err(db_error)?;
    observer.duration(RuntimeStage::OrderingWait, waiting.elapsed());
    let held = RuntimeTimer::new(observer, RuntimeStage::OrderingHold);
    if rows.len() != keys.len() {
        return Err(StoreError::CorruptData);
    }
    let global: i64 =
        sqlx::query_scalar("SELECT ordering_floor FROM universe_runtime WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
    let mut at = now(tx).await?.max(global);
    for row in rows {
        at = at.max(row.try_get("frontier").map_err(db_error)?);
    }
    sqlx::query("UPDATE execution_scopes SET frontier=$3 WHERE universe=$1 AND key=ANY($2)")
        .bind(u.0)
        .bind(keys)
        .bind(at)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok((at, held))
}
pub(crate) async fn register(
    tx: &mut Tx<'_>,
    input: &OrderedInput,
    scopes: &BTreeSet<ScopeKey>,
) -> Result<(), StoreError> {
    for key in ensure_scopes(tx, input.universe, scopes).await? {
        sqlx::query("INSERT INTO input_scopes(universe,input_id,scope_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
            .bind(input.universe.0).bind(input.id.0).bind(key).execute(&mut **tx).await.map_err(db_error)?;
    }
    Ok(())
}

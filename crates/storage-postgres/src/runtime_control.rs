//! Explicit, restartable operator cutover. No world traversal on serving startup.
use crate::{ordering::*, *};
use orbit_application::*;
use sqlx::Row;

pub(crate) fn cutover(row: &sqlx::postgres::PgRow) -> Result<RuntimeCutover, StoreError> {
    let mode = match row
        .try_get::<String, _>("executor_mode")
        .map_err(db_error)?
        .as_str()
    {
        "serial" => ExecutorMode::Serial,
        "preparing" => ExecutorMode::PreparingScoped,
        "scoped" => ExecutorMode::Scoped,
        _ => return Err(StoreError::UnsupportedState),
    };
    Ok(RuntimeCutover {
        mode,
        generation: row.try_get("mode_generation").map_err(db_error)?,
    })
}
impl PgStore {
    pub async fn runtime_mode(&self, u: UniverseId) -> Result<RuntimeCutover, StoreError> {
        let row = sqlx::query(
            "SELECT executor_mode,mode_generation FROM universe_runtime WHERE universe=$1",
        )
        .bind(u.0)
        .fetch_one(&self.pool)
        .await
        .map_err(db_error)?;
        cutover(&row)
    }
    pub async fn prepare_scoped_runtime(
        &self,
        u: UniverseId,
        batch_size: u32,
    ) -> Result<RuntimeCutover, StoreError> {
        if !(1..=1000).contains(&batch_size) {
            return Err(StoreError::Conflict);
        }
        loop {
            let mut tx = self.begin_tx(&self.pool).await?;
            gate(&mut tx, u).await?;
            let status = cutover(&runtime(&mut tx, u).await?)?;
            if status.mode == ExecutorMode::Scoped {
                return Ok(status);
            }
            sqlx::query("UPDATE universe_runtime SET executor_mode='preparing' WHERE universe=$1 AND executor_mode='serial'")
                .bind(u.0).execute(&mut *tx).await.map_err(db_error)?;
            let pending: Vec<serde_json::Value> = sqlx::query_scalar("SELECT input FROM pending_inputs p WHERE p.universe=$1 AND NOT EXISTS(SELECT 1 FROM input_scopes s WHERE s.universe=p.universe AND s.input_id=p.input_id) ORDER BY at_ms,phase,sequence LIMIT $2")
                .bind(u.0).bind(i64::from(batch_size)).fetch_all(&mut *tx).await.map_err(db_error)?;
            let finished = pending.len() < batch_size as usize;
            for value in pending {
                let input = ordered_input(value)?;
                let scopes = crate::scoped_facts::select(&mut tx, u, input.actor, &input.payload)
                    .await?
                    .scopes();
                crate::admission::register(&mut tx, &input, &scopes).await?;
            }
            tx.commit().await.map_err(db_error)?;
            if finished {
                return Ok(RuntimeCutover {
                    mode: ExecutorMode::PreparingScoped,
                    ..status
                });
            }
            tokio::task::yield_now().await;
        }
    }
    /// Conflict means preparation is incomplete or a live serial attempt must finish.
    /// The operator can retry without retaining a gate while waiting.
    pub async fn activate_scoped_runtime(
        &self,
        u: UniverseId,
    ) -> Result<RuntimeCutover, StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        gate(&mut tx, u).await?;
        let row = sqlx::query("SELECT * FROM universe_runtime WHERE universe=$1 FOR UPDATE")
            .bind(u.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
        let status = cutover(&row)?;
        if status.mode == ExecutorMode::Scoped {
            return Ok(status);
        }
        if row
            .try_get::<Option<String>, _>("blocked")
            .map_err(db_error)?
            .is_some()
        {
            return Err(StoreError::CorruptData);
        }
        let clock = now(&mut tx).await?;
        let at = clock.max(row.try_get("frontier").map_err(db_error)?);
        let missing: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pending_inputs p WHERE p.universe=$1 AND NOT EXISTS(SELECT 1 FROM input_scopes s WHERE s.universe=p.universe AND s.input_id=p.input_id))")
            .bind(u.0).fetch_one(&mut *tx).await.map_err(db_error)?;
        if status.mode != ExecutorMode::PreparingScoped
            || missing
            || row
                .try_get::<Option<i64>, _>("lease_until")
                .map_err(db_error)?
                .is_some_and(|until| until > clock)
        {
            return Err(StoreError::Conflict);
        }
        let name = crate::admission::sequence_name(u);
        sqlx::query(&format!("CREATE SEQUENCE IF NOT EXISTS {name} CACHE 1"))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let next = row
            .try_get::<i64, _>("next_sequence")
            .map_err(db_error)?
            .max(
                row.try_get::<i64, _>("cursor")
                    .map_err(db_error)?
                    .checked_add(1)
                    .ok_or(StoreError::CorruptData)?,
            );
        // Retained sequence after an intentional development reset may already be ahead.
        let saved: i64 = sqlx::query_scalar(&format!("SELECT last_value FROM {name}"))
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("SELECT setval($1::regclass,$2,false)")
            .bind(name)
            .bind(next.max(saved.checked_add(1).ok_or(StoreError::CorruptData)?))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let generation: i64 = sqlx::query_scalar("UPDATE universe_runtime SET executor_mode='scoped',mode_generation=mode_generation+1,ordering_floor=greatest(ordering_floor,$2),fence=fence+1,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL WHERE universe=$1 RETURNING mode_generation")
            .bind(u.0).bind(at).fetch_one(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(RuntimeCutover {
            mode: ExecutorMode::Scoped,
            generation,
        })
    }
}

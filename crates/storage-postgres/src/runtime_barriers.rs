//! Durable global boundaries. Only enrollment and another boundary share this gate.
use crate::{
    ordering::*,
    rules_update::{Boundary, active, publish},
    *,
};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use uuid::Uuid;

pub(crate) async fn enrollment_gate(tx: &mut Tx<'_>, u: UniverseId) -> Result<(), StoreError> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,901324))")
        .bind(u.to_string())
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
impl PgStore {
    pub(crate) async fn apply_scoped_rules(
        &self,
        u: UniverseId,
        expected: i64,
        next: &Ruleset,
    ) -> Result<RulesApplyOutcome, RulesUpdateError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        enrollment_gate(&mut tx, u).await?;
        let runtime = sqlx::query("SELECT executor_mode,ordering_floor FROM universe_runtime WHERE universe=$1 FOR UPDATE")
            .bind(u.0).fetch_one(&mut *tx).await.map_err(db_error)?;
        if runtime
            .try_get::<String, _>("executor_mode")
            .map_err(db_error)?
            != "scoped"
        {
            return Err(StoreError::Conflict.into());
        }
        let current = active(&mut tx, u).await?;
        if current.rules.hash == next.hash {
            return Ok(RulesApplyOutcome::AlreadyActive {
                profile_hash: next.hash.clone(),
                revision: current.revision,
            });
        }
        if current.revision != expected {
            return Err(RulesUpdateError::Stale {
                expected_revision: expected,
                actual_revision: current.revision,
            });
        }
        validate_rules_update(&current.rules, next)?;
        let pending = sqlx::query("SELECT id,expected_revision,rules FROM runtime_barriers WHERE universe=$1 AND NOT done")
            .bind(u.0).fetch_optional(&mut *tx).await.map_err(db_error)?;
        let id = if let Some(pending) = pending {
            let rules: Ruleset = decode_supported(pending.try_get("rules").map_err(db_error)?)?;
            if rules != *next
                || pending
                    .try_get::<i64, _>("expected_revision")
                    .map_err(db_error)?
                    != expected
            {
                return Err(RulesUpdateError::Busy);
            }
            pending.try_get::<Uuid, _>("id").map_err(db_error)?
        } else {
            let frontier: i64 = sqlx::query_scalar(
                "SELECT coalesce(max(frontier),0) FROM execution_scopes WHERE universe=$1",
            )
            .bind(u.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
            let at = now(&mut tx)
                .await?
                .max(frontier)
                .max(runtime.try_get("ordering_floor").map_err(db_error)?);
            let sequence = next_sequence(&mut tx, u).await?;
            let id = Uuid::new_v4();
            sqlx::query("INSERT INTO runtime_barriers(universe,id,at_ms,sequence,expected_revision,rules) VALUES($1,$2,$3,$4,$5,$6)")
                .bind(u.0).bind(id).bind(at).bind(sequence).bind(expected).bind(sqlx::types::Json(next)).execute(&mut *tx).await.map_err(db_error)?;
            sqlx::query("UPDATE universe_runtime SET ordering_floor=$2 WHERE universe=$1")
                .bind(u.0)
                .bind(at)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            id
        };
        tx.commit().await.map_err(db_error)?;
        self.process_runtime_barrier(u).await?;
        let outcome: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT outcome FROM runtime_barriers WHERE id=$1")
                .bind(id)
                .fetch_one(&self.pool)
                .await
                .map_err(db_error)?;
        match outcome {
            Some(value) => Ok(decode(value)?),
            None => Err(RulesUpdateError::Pending { id }),
        }
    }
    /// Row ownership lasts through one atomic transaction; process death rolls back
    /// both facts and completion, leaving the same durable boundary for a peer.
    pub async fn process_runtime_barrier(&self, u: UniverseId) -> Result<bool, RulesUpdateError> {
        let mut tx = self.begin_tx(self.worker_pool()?).await?;
        let locked: bool =
            sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,901324))")
                .bind(u.to_string())
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        if !locked {
            return Ok(false);
        }
        let Some(row) = sqlx::query(
            "SELECT * FROM runtime_barriers WHERE universe=$1 AND NOT done FOR UPDATE SKIP LOCKED",
        )
        .bind(u.0)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?
        else {
            return Ok(false);
        };
        let at: i64 = row.try_get("at_ms").map_err(db_error)?;
        let sequence: i64 = row.try_get("sequence").map_err(db_error)?;
        let prior: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pending_inputs WHERE universe=$1 AND (at_ms,phase,sequence)<($2,1,$3))")
            .bind(u.0).bind(at).bind(sequence).fetch_one(&mut *tx).await.map_err(db_error)?;
        if prior || now(&mut tx).await? < at {
            return Ok(false);
        }
        let next: Ruleset = decode_supported(row.try_get("rules").map_err(db_error)?)?;
        next.validate()?;
        let current = active(&mut tx, u).await?;
        if current.revision
            != row
                .try_get::<i64, _>("expected_revision")
                .map_err(db_error)?
        {
            return Err(StoreError::CorruptData.into());
        }
        let delta = validate_rules_update(&current.rules, &next)?;
        let epoch: Uuid = sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
            .bind(u.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
        let outcome = publish(
            &mut tx,
            Boundary {
                universe: u,
                epoch: Epoch(epoch),
                current: &current,
                next: &next,
                delta: &delta,
                at,
                sequence,
            },
        )
        .await?;
        sqlx::query("UPDATE runtime_barriers SET done=true,outcome=$2 WHERE id=$1")
            .bind(row.try_get::<Uuid, _>("id").map_err(db_error)?)
            .bind(sqlx::types::Json(outcome))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
}

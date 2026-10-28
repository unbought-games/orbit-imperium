//! Operational observations from scheduling indexes, never gameplay traversal.
use crate::{ordering::*, *};
use orbit_application::*;
use sqlx::Row;
impl RuntimeStatusStore for PgStore {
    async fn runtime_status(&self, u: UniverseId) -> Result<RuntimeStatus, StoreError> {
        let mut tx = self.begin_unlocked(&self.pool).await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("SET LOCAL statement_timeout='1500ms'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let clock = now(&mut tx).await?;
        let row=sqlx::query("SELECT
            (SELECT min(at_ms) FROM commands WHERE universe=$1 AND NOT done AND at_ms<=$2) AS command_at,
            (SELECT min(at_ms) FROM scheduled_events WHERE universe=$1 AND NOT done AND NOT cancelled AND at_ms<=$2) AS event_at,
            (SELECT count(*) FROM execution_scopes WHERE universe=$1 AND blocked IS NOT NULL) + CASE WHEN blocked IS NOT NULL THEN 1 ELSE 0 END AS blocked_count
            FROM universe_runtime WHERE universe=$1")
            .bind(u.0).bind(clock).fetch_one(&mut *tx).await.map_err(db_error)?;
        let command: Option<i64> = row.try_get("command_at").map_err(db_error)?;
        let event: Option<i64> = row.try_get("event_at").map_err(db_error)?;
        let age = |at: i64| clock.saturating_sub(at).max(0);
        let status = RuntimeStatus {
            oldest_pending_age_ms: command.into_iter().chain(event).min().map(age),
            oldest_due_lag_ms: event.map(age),
            blocked_scope_count: row
                .try_get::<i64, _>("blocked_count")
                .map_err(db_error)?
                .try_into()
                .map_err(|_| StoreError::CorruptData)?,
        };
        tx.commit().await.map_err(db_error)?;
        Ok(status)
    }
}

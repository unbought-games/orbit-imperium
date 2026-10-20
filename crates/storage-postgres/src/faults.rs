//! Compiled only into disposable test builds; no HTTP route or production setting enables this.
use crate::*;
use sqlx::Row;
impl PgStore {
    pub(crate) async fn test_input_fault(
        &self,
        stage: &str,
        i: &orbit_engine::OrderedInput,
    ) -> Result<(), StoreError> {
        use orbit_engine::*;
        if i.protocol != 4 {
            return Ok(());
        }
        let kind = match &i.payload {
            Input::Command(Command::World { action }) => match action {
                WorldAction::RecordForegroundPresence { .. } => "Presence",
                WorldAction::LaunchFleet { .. } => "LaunchFleet",
                WorldAction::RecallMission { .. } => "RecallMission",
                _ => "ReportMetadata",
            },
            Input::Event(ScheduledEvent::FleetLegDue { expected_leg, .. }) => {
                if *expected_leg == MissionLeg::Outbound {
                    "Arrival"
                } else {
                    "Return"
                }
            }
            Input::Event(ScheduledEvent::DebrisCleanupDue { .. }) => "DebrisCleanup",
            _ => "Progression",
        };
        self.test_fault(&format!("{stage}:{kind}")).await
    }

    pub(crate) async fn test_fault(&self, stage: &str) -> Result<(), StoreError> {
        let exists: bool = sqlx::query_scalar("SELECT to_regclass('orbit_test_fault') IS NOT NULL")
            .fetch_one(&self.pool)
            .await
            .map_err(db_error)?;
        if !exists {
            return Ok(());
        }
        let mut tx = self.begin_tx(&self.pool).await?;
        let row =
            sqlx::query("SELECT mode FROM orbit_test_fault WHERE stage=$1 AND enabled FOR UPDATE")
                .bind(stage)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?;
        let Some(row) = row else { return Ok(()) };
        let mode: String = row.try_get("mode").map_err(db_error)?;
        sqlx::query("UPDATE orbit_test_fault SET enabled=false,seen=seen+1 WHERE stage=$1")
            .bind(stage)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        match mode.as_str() {
            "error" => Err(StoreError::Unavailable),
            "pause" => {
                let mut connection = self.pool.acquire().await.map_err(db_error)?;
                sqlx::query("SELECT pg_advisory_lock(901322)")
                    .execute(&mut *connection)
                    .await
                    .map_err(db_error)?;
                sqlx::query("SELECT pg_advisory_unlock(901322)")
                    .execute(&mut *connection)
                    .await
                    .map_err(db_error)?;
                Ok(())
            }
            _ => Err(StoreError::CorruptData),
        }
    }
}

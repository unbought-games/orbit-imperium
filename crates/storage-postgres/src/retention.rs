//! Each batch commits independently. The caller can stop between any two and
//! multiple workers may run maintenance against the same database.
use crate::{
    PgStore, db_error,
    ordering::{Tx, now},
};
use orbit_application::{StoreError, UniverseId};
use std::{collections::BTreeMap, sync::Mutex};
use uuid::Uuid;

type ScanKey = (UniverseId, &'static str);
type Position = (String, Uuid);
type Batch = (i64, i64, Option<String>, Option<Uuid>);

/// A continuation only avoids revisiting a protected prefix. Losing it during
/// restart repeats eligibility checks; it never establishes permission to delete.
#[derive(Default)]
pub(crate) struct ScanPositions(Mutex<BTreeMap<ScanKey, Position>>);

impl ScanPositions {
    fn start(&self, key: ScanKey) -> Position {
        self.0
            .lock()
            .unwrap()
            .get(&key)
            .cloned()
            .unwrap_or_else(|| ("-infinity".to_string(), Uuid::nil()))
    }

    fn completed(&self, key: ScanKey, batch: &Batch) {
        // A full deletion batch can leave eligible rows inside this window.
        if batch.0 == 128 {
            return;
        }
        let mut positions = self.0.lock().unwrap();
        if let (Some(stamp), Some(id)) = (&batch.2, batch.3) {
            positions.insert(key, (stamp.clone(), id));
        } else {
            positions.remove(&key);
        }
    }
}

impl PgStore {
    pub(crate) async fn retention_transaction(&self) -> Result<Tx<'static>, StoreError> {
        let mut tx = self.begin_unlocked(self.worker_pool()?).await?;
        for setting in [
            "SET LOCAL statement_timeout='1s'",
            "SET LOCAL lock_timeout='100ms'",
        ] {
            sqlx::query(setting)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        crate::pools::world_edit_gate(&mut tx, false).await?;
        Ok(tx)
    }

    /// One pass through the existing maintenance loop. No history is eligible
    /// before the shared legacy deadline plus the one-hour safety margin.
    pub async fn prune_terminal_history(&self) -> Result<(), StoreError> {
        let mut result = Ok(());
        for universe in self.universes().await? {
            // A hot receipt or a timed-out plan must not prevent maintenance
            // of independent inputs, other worlds or acknowledged delivery.
            result = result.and(self.prune_commands(universe).await);
            result = result.and(self.prune_events(universe).await);
        }
        result.and(self.prune_activity().await)
    }

    async fn prune_activity(&self) -> Result<(), StoreError> {
        let mut tx = self.retention_transaction().await?;
        if let Some((at, _)) = retention_clock(&mut tx).await? {
            let sample = sqlx::query_as(include_str!("retention/activity.sql"))
                .bind(at)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
            tx.commit().await.map_err(db_error)?;
            self.observer
                .retention(None, "activity", sample, sample.0 == 128);
        }
        Ok(())
    }

    async fn prune_commands(&self, u: UniverseId) -> Result<(), StoreError> {
        let mut tx = self.retention_transaction().await?;
        // An admission may have stamped an earlier logical time and still be
        // waiting to count rows or resolve its parent. Yield to that admission.
        let ready: Option<bool> = sqlx::query_scalar(
            "SELECT true FROM universe_runtime WHERE universe=$1 FOR NO KEY UPDATE SKIP LOCKED",
        )
        .bind(u.0)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?;
        if ready.is_some()
            && let Some((at, cutoff)) = retention_clock(&mut tx).await?
        {
            let key = (u, "commands");
            let (stamp, id) = self.retention_positions.start(key);
            let sample: Batch = sqlx::query_as(include_str!("retention/commands.sql"))
                .bind(u.0)
                .bind(at)
                .bind(cutoff)
                .bind(stamp)
                .bind(id)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
            tx.commit().await.map_err(db_error)?;
            self.retention_positions.completed(key, &sample);
            self.observer.retention(
                Some(u),
                "commands",
                (sample.0, sample.1),
                sample.0 == 128 || sample.2.is_some(),
            );
        }
        Ok(())
    }

    async fn prune_events(&self, u: UniverseId) -> Result<(), StoreError> {
        let mut tx = self.retention_transaction().await?;
        if let Some((at, _)) = retention_clock(&mut tx).await? {
            let key = (u, "events");
            let (stamp, id) = self.retention_positions.start(key);
            let sample: Batch = sqlx::query_as(include_str!("retention/events.sql"))
                .bind(u.0)
                .bind(at)
                .bind(stamp)
                .bind(id)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
            tx.commit().await.map_err(db_error)?;
            self.retention_positions.completed(key, &sample);
            self.observer.retention(
                Some(u),
                "events",
                (sample.0, sample.1),
                sample.0 == 128 || sample.2.is_some(),
            );
        }
        Ok(())
    }
}

async fn retention_clock(tx: &mut Tx<'_>) -> Result<Option<(i64, i64)>, StoreError> {
    let at = now(tx).await?;
    let cutoff: i64 =
        sqlx::query_scalar("SELECT legacy_until_ms FROM command_admission_cutover WHERE singleton")
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
    Ok((at.saturating_sub(3_600_000) >= cutoff).then_some((at, cutoff)))
}

//! Committed read snapshots remain available while ordered work is pending.
use crate::{ordering::*, *};
use orbit_application::{ReadSnapshot, ResolvedPosition, ScopeProgress, SnapshotProgress};
use orbit_engine::UniverseId;
use orbit_engine::{PlayerId, ScopeKey};
use sqlx::Row;

pub(crate) async fn wrap<T>(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
    facts: T,
) -> Result<ReadSnapshot<T>, StoreError> {
    let next_unresolved: Option<i64> = sqlx::query_scalar(
        "SELECT min(at_ms) FROM commands WHERE universe=$1 AND actor=$2 AND NOT done",
    )
    .bind(u.0)
    .bind(player.0)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    let sampled_at = now(tx).await?;
    let projection_limit = boundary(tx, u, player)
        .await?
        .filter(|at| *at <= sampled_at);
    let position=sqlx::query("SELECT CASE WHEN r.executor_mode='scoped' AND v.changed_at_generation=r.mode_generation THEN v.changed_at ELSE NULL END AS changed_at,v.revision,r.executor_mode<>'serial' AS command_references FROM viewer_heads v JOIN universe_runtime r ON r.universe=v.universe WHERE v.universe=$1 AND v.player=$2")
        .bind(u.0).bind(player.0).fetch_optional(&mut **tx).await.map_err(db_error)?;
    let command_references = position
        .as_ref()
        .map(|row| row.try_get("command_references").map_err(db_error))
        .transpose()?
        .unwrap_or(false);
    let resolved = position
        .map(|row| -> Result<Option<ResolvedPosition>, StoreError> {
            let at: Option<i64> = row.try_get("changed_at").map_err(db_error)?;
            Ok(at.map(|at_ms| ResolvedPosition {
                at_ms,
                viewer_revision: row.get::<i64, _>("revision").to_string(),
            }))
        })
        .transpose()?
        .flatten();
    Ok(ReadSnapshot {
        facts,
        progress: SnapshotProgress {
            sampled_at,
            scopes: vec![ScopeProgress {
                scope: ScopeKey::Player(player),
                resolved,
                next_unresolved,
            }],
            minimum_revision_pending: false,
            projection_limit,
            command_references,
        },
    })
}

pub(crate) async fn begin(store: &PgStore, pool: &sqlx::PgPool) -> Result<Tx<'static>, StoreError> {
    let mut tx = store.begin_tx(pool).await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    Ok(tx)
}

pub(crate) async fn universe(
    tx: &mut Tx<'_>,
    u: UniverseId,
) -> Result<sqlx::postgres::PgRow, StoreError> {
    sqlx::query("SELECT epoch,profile_hash,speed FROM universes WHERE id=$1")
        .bind(u.0)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)
}

/// Projection may reach an unresolved input's instant, but must not assume its effects.
/// Inspect ordering metadata only: a bad pending payload cannot invalidate committed facts.
pub(crate) async fn safe_time(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
) -> Result<i64, StoreError> {
    let rt = runtime(tx, u).await?;
    let mut floor: i64 = rt.try_get("ordering_floor").map_err(db_error)?;
    if rt.try_get::<String, _>("executor_mode").map_err(db_error)? != "scoped" {
        floor = floor.max(rt.try_get("frontier").map_err(db_error)?);
    } else {
        let key = serde_json::to_string(&ScopeKey::Player(player)).expect("scope key");
        let local: Option<i64> = sqlx::query_scalar(
            "SELECT frontier FROM execution_scopes WHERE universe=$1 AND key=$2",
        )
        .bind(u.0)
        .bind(key)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?;
        floor = floor.max(local.unwrap_or(0));
    }
    let clock = now(tx).await?.max(floor);
    Ok(boundary(tx, u, player)
        .await?
        .map_or(clock, |at| clock.min(at)))
}

async fn boundary(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
) -> Result<Option<i64>, StoreError> {
    if crate::admission::is_scoped(tx, u).await? {
        let key = serde_json::to_string(&ScopeKey::Player(player)).expect("scope key");
        // Join each pending table directly: through the pending_inputs view the
        // planner hashes every pending input in the universe for one scope.
        sqlx::query_scalar("SELECT min(at_ms) FROM (
            SELECT c.at_ms FROM input_scopes s JOIN commands c ON c.universe=s.universe AND c.input_id=s.input_id AND NOT c.done WHERE s.universe=$1 AND s.scope_key=$2
            UNION ALL SELECT e.at_ms FROM input_scopes s JOIN scheduled_events e ON e.universe=s.universe AND e.id=s.input_id AND NOT e.done AND NOT e.cancelled WHERE s.universe=$1 AND s.scope_key=$2
            UNION ALL SELECT at_ms FROM runtime_barriers WHERE universe=$1 AND NOT done) pending")
            .bind(u.0).bind(key).fetch_one(&mut **tx).await.map_err(db_error)
    } else {
        sqlx::query_scalar("SELECT min(at_ms) FROM pending_inputs WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)
    }
}

/// Quotes/public time-dependent labels are estimates from a committed snapshot,
/// not a claim that every participant has advanced to the same logical position.
/// After parallel execution begins, a common old horizon could precede another
/// participant's checkpoint. Evaluate estimates at the sample clock instead.
pub(crate) async fn estimate_time(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
) -> Result<i64, StoreError> {
    if crate::admission::is_scoped(tx, u).await? {
        now(tx).await
    } else {
        safe_time(tx, u, player).await
    }
}

impl PgStore {
    pub async fn snapshot_progress(
        &self,
        binding: orbit_application::Binding,
        minimum_revision: Option<i64>,
    ) -> Result<SnapshotProgress, StoreError> {
        if minimum_revision.is_some_and(|revision| revision < 0) {
            return Err(StoreError::Conflict);
        }
        let mut tx = begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, binding).await?;
        let mut progress = wrap(&mut tx, binding.universe, binding.player, ())
            .await?
            .progress;
        if let Some(minimum) = minimum_revision {
            let revision: i64 = sqlx::query_scalar(
                "SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2",
            )
            .bind(binding.universe.0)
            .bind(binding.player.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
            progress.minimum_revision_pending = revision < minimum;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(progress)
    }
}

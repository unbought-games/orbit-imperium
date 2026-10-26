//! Bounded compatibility checks. Never load gameplay collections or take their locks here.
use crate::{PgStore, StoreError, db_error};
use orbit_engine::*;
use sqlx::Row;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum StartupError {
    #[error("incompatible schema; retain the database and inspect migration history")]
    Schema,
    #[error("universe {0}: conflicting startup configuration")]
    Configuration(UniverseId),
    #[error("universe {0}: this binary does not support the active rules")]
    Unsupported(UniverseId),
    #[error("universe {0}: missing or invalid required {1}; no repair applied")]
    Invalid(UniverseId, &'static str),
    #[error("universe {0}: resolution is blocked; inspect the persisted diagnostic")]
    Blocked(UniverseId),
    #[error("startup storage unavailable or timed out")]
    Unavailable,
}
impl StartupError {
    pub(crate) fn store_error(self) -> StoreError {
        match self {
            Self::Schema => StoreError::IncompatibleSchema,
            Self::Configuration(_) => StoreError::Conflict,
            Self::Unsupported(_) => StoreError::UnsupportedState,
            Self::Invalid(..) | Self::Blocked(_) => StoreError::CorruptData,
            Self::Unavailable => StoreError::Unavailable,
        }
    }
}
impl From<StoreError> for StartupError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::IncompatibleSchema => Self::Schema,
            _ => Self::Unavailable,
        }
    }
}

pub struct ServerGuard {
    connection: sqlx::pool::PoolConnection<sqlx::Postgres>,
}
impl ServerGuard {
    /// A failed retained session means reset protection is lost: the process must stop.
    pub async fn check(&mut self) -> Result<(), StoreError> {
        tokio::time::timeout(
            Duration::from_secs(1),
            sqlx::query("SELECT 1").execute(&mut *self.connection),
        )
        .await
        .map_err(|_| StoreError::Unavailable)?
        .map_err(db_error)?;
        Ok(())
    }
    pub async fn monitor(&mut self) -> Result<(), StoreError> {
        loop {
            self.check().await?;
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }
}
impl Drop for ServerGuard {
    fn drop(&mut self) {
        self.connection.close_on_drop();
    }
}
impl PgStore {
    /// Bridge overrides compare only worlds that have not activated DB policy.
    pub async fn check_legacy_speed(&self, speed: i32) -> Result<(), StartupError> {
        let mismatch: Option<uuid::Uuid> = tokio::time::timeout(Duration::from_secs(2),
            sqlx::query_scalar("SELECT id FROM universes u WHERE NOT EXISTS(SELECT 1 FROM universe_policies_v2 p WHERE p.universe=u.id) AND (u.speed<>$1 OR $1 NOT BETWEEN 1 AND 100) ORDER BY id LIMIT 1")
                .bind(speed).fetch_optional(&self.pool)).await.map_err(|_| StartupError::Unavailable)?.map_err(db_error)?;
        if let Some(id) = mismatch {
            return Err(StartupError::Configuration(UniverseId(id)));
        }
        Ok(())
    }
    pub async fn acquire_server_guard(&self) -> Result<ServerGuard, StoreError> {
        let mut connection = self.acquire_pool(&self.pool).await?;
        connection.close_on_drop();
        let locked: bool = tokio::time::timeout(
            Duration::from_secs(1),
            sqlx::query_scalar("SELECT pg_try_advisory_lock_shared(901321)")
                .fetch_one(&mut *connection),
        )
        .await
        .map_err(|_| StoreError::Unavailable)?
        .map_err(db_error)?;
        if !locked {
            return Err(StoreError::Unavailable);
        }
        Ok(ServerGuard { connection })
    }
    pub async fn server_guard(&self, speed: i32) -> Result<ServerGuard, StoreError> {
        self.server_guard_config(Some(speed)).await
    }
    pub async fn server_guard_config(&self, speed: Option<i32>) -> Result<ServerGuard, StoreError> {
        let guard = self.acquire_server_guard().await?;
        self.check_startup(speed)
            .await
            .map_err(StartupError::store_error)?;
        Ok(guard)
    }
    /// Scope-local diagnostics do not revoke API readiness. Structural and active
    /// vocabulary checks retain their bounded startup semantics.
    pub async fn check_serving_compatibility(
        &self,
        speed: Option<i32>,
    ) -> Result<(), StartupError> {
        self.check_startup(speed).await
    }
    pub async fn check_startup(&self, speed: Option<i32>) -> Result<(), StartupError> {
        tokio::time::timeout(Duration::from_secs(2), self.check_startup_inner(speed))
            .await
            .map_err(|_| StartupError::Unavailable)?
    }
    async fn check_startup_inner(&self, speed: Option<i32>) -> Result<(), StartupError> {
        self.check_migrations().await?;
        let mut tx = self.begin_tx(&self.pool).await?;
        for setting in [
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
            "SET LOCAL statement_timeout='1500ms'",
            "SET LOCAL lock_timeout='250ms'",
        ] {
            sqlx::query(setting)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        check_metadata(&mut tx, None, speed, false).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
}
pub(crate) async fn check_metadata(
    tx: &mut crate::ordering::Tx<'_>,
    universe: Option<UniverseId>,
    speed: Option<i32>,
    allow_blocked: bool,
) -> Result<(), StartupError> {
    // Deliberately project only scalar bootstrap data, never its growing manifest.
    let rows = sqlx::query("SELECT u.id,u.epoch,u.speed,u.started_at,u.profile_hash,u.rules_revision,r.profile,
            rt.universe AS runtime_id,rt.frontier,rt.next_sequence,rt.cursor,rt.fence,rt.blocked,
            rt.executor_mode,rt.mode_generation,rt.ordering_floor,
            EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('orbit_order_'||replace(u.id::text,'-','')) AND c.relkind='S') AS has_order_sequence,
            num_nonnulls(rt.claim_input,rt.claim_owner,rt.claim_token,rt.lease_until) AS claim_fields,
            rt.lease_until,w.revision AS world_revision,octet_length(b.secret) AS secret_length
            FROM universes u LEFT JOIN rulesets r ON r.hash=u.profile_hash
            LEFT JOIN universe_runtime rt ON rt.universe=u.id
            LEFT JOIN world_heads w ON w.universe=u.id
            LEFT JOIN mvp_bootstraps b ON b.universe=u.id WHERE ($1::uuid IS NULL OR u.id=$1) ORDER BY u.id")
            .bind(universe.map(|u| u.0)).fetch_all(&mut **tx).await.map_err(db_error)?;
    if rows.is_empty()
        && let Some(u) = universe
    {
        return Err(StartupError::Invalid(u, "universe identity"));
    }
    for row in rows {
        validate_metadata(&row, speed, allow_blocked)?;
    }
    Ok(())
}
fn validate_metadata(
    row: &sqlx::postgres::PgRow,
    speed: Option<i32>,
    allow_blocked: bool,
) -> Result<(), StartupError> {
    let u = UniverseId(row.try_get("id").map_err(db_error)?);
    let invalid = |what| StartupError::Invalid(u, what);
    let saved_speed: i32 = row.try_get("speed").map_err(db_error)?;
    if speed.is_some_and(|s| !(1..=100).contains(&s) || s != saved_speed) {
        return Err(StartupError::Configuration(u));
    }
    let profile: Option<serde_json::Value> = row.try_get("profile").map_err(db_error)?;
    let rules = crate::facts::decode_rules(profile.ok_or_else(|| invalid("active rules"))?)
        .map_err(|e| match e {
            StoreError::UnsupportedState => StartupError::Unsupported(u),
            _ => invalid("active rules"),
        })?;
    if row.try_get::<String, _>("profile_hash").map_err(db_error)? != rules.hash.0
        || saved_speed != rules.speed
    {
        return Err(invalid("active rules binding"));
    }
    if u.0.is_nil()
        || row
            .try_get::<uuid::Uuid, _>("epoch")
            .map_err(db_error)?
            .is_nil()
        || !(0..=MAX_WIRE_MS).contains(&row.try_get::<i64, _>("started_at").map_err(db_error)?)
        || row.try_get::<i64, _>("rules_revision").map_err(db_error)? < 0
    {
        return Err(invalid("universe identity"));
    }
    if row
        .try_get::<Option<uuid::Uuid>, _>("runtime_id")
        .map_err(db_error)?
        .is_none()
    {
        return Err(invalid("runtime"));
    }
    let mode: String = row.try_get("executor_mode").map_err(db_error)?;
    if !matches!(mode.as_str(), "serial" | "preparing" | "scoped") {
        return Err(StartupError::Unsupported(u));
    }
    if row.try_get::<i64, _>("mode_generation").map_err(db_error)? < 0
        || !(0..=MAX_WIRE_MS).contains(&row.try_get::<i64, _>("ordering_floor").map_err(db_error)?)
        || (mode == "scoped"
            && !row
                .try_get::<bool, _>("has_order_sequence")
                .map_err(db_error)?)
    {
        return Err(invalid("executor mode authority"));
    }
    let claim_fields: i32 = row.try_get("claim_fields").map_err(db_error)?;
    if !(0..=MAX_WIRE_MS).contains(&row.try_get::<i64, _>("frontier").map_err(db_error)?)
        || row.try_get::<i64, _>("next_sequence").map_err(db_error)? < 1
        || row.try_get::<i64, _>("cursor").map_err(db_error)? < 0
        || row.try_get::<i64, _>("fence").map_err(db_error)? < 0
        || !matches!(claim_fields, 0 | 4)
        || row
            .try_get::<Option<i64>, _>("lease_until")
            .map_err(db_error)?
            .is_some_and(|t| !(0..=MAX_WIRE_MS).contains(&t))
    {
        return Err(invalid("runtime control fields"));
    }
    if !allow_blocked
        && row
            .try_get::<Option<String>, _>("blocked")
            .map_err(db_error)?
            .is_some()
    {
        return Err(StartupError::Blocked(u));
    }
    if rules.world()
        && mode != "scoped"
        && !row
            .try_get::<Option<i64>, _>("world_revision")
            .map_err(db_error)?
            .is_some_and(|r| r >= 0)
    {
        return Err(invalid("world head"));
    }
    if rules.artifact.universe.is_some()
        && row
            .try_get::<Option<i32>, _>("secret_length")
            .map_err(db_error)?
            != Some(32)
    {
        return Err(invalid("bootstrap secret"));
    }
    Ok(())
}

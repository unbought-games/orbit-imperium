mod alliance_identity;
mod alliances;
mod colonization;
mod rankings;
mod report_sharing;
use orbit_application::StoreError;
use sqlx::{PgPool, postgres::PgPoolOptions};
mod enrollment;
mod universe_config;
pub use universe_config::UniverseConfigChange;
mod pools;
pub use pools::{PoolLimits, PoolSnapshot};
mod migrations;
pub use migrations::MigrationError;
mod analytics;
mod identity;
mod oidc;
mod seed;
#[derive(Clone)]
pub struct PgStore {
    pool: PgPool,
    workloads: pools::WorkloadPools,
    admission_limit: i64,
    legacy_universe_config: bool,
    scan_cursors: std::sync::Arc<scoped_ordering::ScanCursors>,
    observer: std::sync::Arc<dyn orbit_application::RuntimeObserver>,
    update_hub: std::sync::Arc<update_signals::UpdateHub>,
}
impl PgStore {
    pub async fn connect(url: &str) -> Result<Self, StoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(std::time::Duration::from_secs(3))
            .connect(url)
            .await
            .map_err(db_error)?;
        Ok(Self {
            workloads: pools::WorkloadPools::shared(
                &pool,
                PgPoolOptions::new()
                    .max_connections(2)
                    .acquire_timeout(std::time::Duration::from_secs(3))
                    .connect_lazy(url)
                    .map_err(db_error)?,
            ),
            pool,
            admission_limit: 60,
            legacy_universe_config: false,
            update_hub: Default::default(),
            scan_cursors: Default::default(),
            observer: std::sync::Arc::new(orbit_application::NoopRuntimeObserver),
        })
    }
}
fn db_error(error: sqlx::Error) -> StoreError {
    if let sqlx::Error::Database(ref db) = error
        && db.code().as_deref() == Some("PON01")
    {
        return StoreError::UniverseNamesExhausted;
    }

    if matches!(
        &error,
        sqlx::Error::Decode(_)
            | sqlx::Error::ColumnDecode { .. }
            | sqlx::Error::ColumnNotFound(_)
            | sqlx::Error::TypeNotFound { .. }
            | sqlx::Error::RowNotFound
    ) {
        return StoreError::CorruptData;
    }
    if let sqlx::Error::Database(ref db) = error
        && matches!(db.code().as_deref(), Some("42P01" | "42703"))
    {
        return StoreError::IncompatibleSchema;
    }

    if let sqlx::Error::Database(ref db) = error
        && db.is_unique_violation()
    {
        return StoreError::Conflict;
    }
    if let sqlx::Error::Database(ref db) = error {
        eprintln!("database constraint: {}", db.constraint().unwrap_or("none"));
    }
    // SQL diagnostics belong in operator logging; never propagate SQL/values to clients.
    eprintln!(
        "database operation failed: {} ({})",
        error
            .as_database_error()
            .map(|e| e.code().map(|c| c.into_owned()).unwrap_or_default())
            .unwrap_or_else(|| "connection".into()),
        connection_diagnostic(&error)
    );
    StoreError::Unavailable
}
// Keep arbitrary driver messages (which can contain credentials or SQL values) out of logs.
fn connection_diagnostic(error: &sqlx::Error) -> &'static str {
    match error {
        sqlx::Error::PoolTimedOut => {
            "connection pool timed out; check database host/port reachability and pool capacity; for local Docker check the published port with docker compose port db 5432"
        }
        sqlx::Error::Io(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => {
            "connection refused; check that PostgreSQL is running and its port is published"
        }
        sqlx::Error::Io(_) => "database connection I/O failed",
        sqlx::Error::Tls(_) => "database TLS negotiation failed; check TLS configuration",
        sqlx::Error::Configuration(_) => "invalid database connection configuration",
        sqlx::Error::Protocol(_) => "database protocol error",
        sqlx::Error::PoolClosed => "database connection pool is closed",
        sqlx::Error::Database(db) if db.code().as_deref() == Some("28P01") => {
            "password authentication failed; check DATABASE_URL and the database role password; existing PostgreSQL volumes retain their original password"
        }
        _ => "database request failed",
    }
}
mod admission;
mod progression_state;
mod runtime_barriers;
mod runtime_control;
mod runtime_status;
mod scope_references;
mod scoped_commit;
mod scoped_facts;
mod scoped_ordering;
mod snapshots;
mod update_signals;
mod updates;
mod views;
mod world;

mod startup;
pub use startup::{ServerGuard, StartupError};
mod audit;
pub use audit::AuditError;

mod commit;
mod facts;
mod ordering;

impl PgStore {
    pub async fn universes(&self) -> Result<Vec<orbit_engine::UniverseId>, StoreError> {
        Ok(
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM universes ORDER BY id")
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?
                .into_iter()
                .map(Into::into)
                .collect(),
        )
    }
}
mod entities;
#[cfg(feature = "test-support")]
mod faults;

impl PgStore {
    pub fn with_admission_limit(mut self, limit: i64) -> Result<Self, StoreError> {
        if !(1..=10000).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        self.admission_limit = limit;
        Ok(self)
    }
}

#[cfg(test)]
mod diagnostic_tests {
    use super::*;

    #[test]
    fn connection_failures_have_actionable_diagnostics() {
        let timeout = connection_diagnostic(&sqlx::Error::PoolTimedOut);
        assert!(timeout.contains("host/port"));
        let refused = connection_diagnostic(&sqlx::Error::Io(std::io::Error::from(
            std::io::ErrorKind::ConnectionRefused,
        )));
        assert!(refused.contains("connection refused"));
    }

    #[test]
    fn diagnostics_do_not_include_raw_connection_errors() {
        for error in [
            sqlx::Error::Protocol("private connection details".into()),
            sqlx::Error::Configuration("private connection details".into()),
            sqlx::Error::Io(std::io::Error::other("private connection details")),
        ] {
            assert!(!connection_diagnostic(&error).contains("private connection details"));
        }
    }
}

mod progression;

mod binding;

mod bootstrap;
#[cfg(feature = "test-support")]
pub use bootstrap::MvpAccount;

mod rules_update;

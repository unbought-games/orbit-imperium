//! Schema preparation is separate from world creation and never uses the operator lock.
use crate::{PgStore, StoreError};
use sqlx::{
    PgConnection, Row,
    migrate::{Migrate, MigrateError, Migrator},
};

static MIGRATIONS: Migrator = sqlx::migrate!("./migrations");

// The future-release bundle is compile-time test infrastructure, never a runtime option.
#[cfg(feature = "migration-upgrade-test")]
static UPGRADE_MIGRATIONS: std::sync::LazyLock<Migrator> = std::sync::LazyLock::new(|| {
    use sqlx::migrate::{Migration, MigrationType};
    let mut migrations = MIGRATIONS.migrations.to_vec();
    migrations.push(Migration::new(
        migrations.last().expect("baseline migration").version + 1,
        "compatible test probe".into(),
        MigrationType::Simple,
        include_str!("../tests/fixtures/migrations/0002_compatible_probe.sql").into(),
        false,
    ));
    Migrator {
        migrations: migrations.into(),
        ..Migrator::DEFAULT
    }
});

fn active_migrations() -> &'static Migrator {
    #[cfg(feature = "migration-upgrade-test")]
    {
        &UPGRADE_MIGRATIONS
    }
    #[cfg(not(feature = "migration-upgrade-test"))]
    {
        &MIGRATIONS
    }
}

/// Safe operator diagnostics. Neither Debug nor Display carries driver messages or credentials.
#[derive(Debug, thiserror::Error)]
#[error("database migration: {0}")]
pub struct MigrationError(String);

fn error(message: impl Into<String>) -> MigrationError {
    MigrationError(message.into())
}

fn database_error(source: sqlx::Error) -> MigrationError {
    if source
        .as_database_error()
        .and_then(|error| error.constraint())
        == Some("orbit_runtime_online_indexes")
    {
        return error(
            "retained runtime indexes are missing or invalid; keep existing servers running, execute scripts/prepare-runtime-indexes.sql outside a transaction, verify index validity, then retry startup",
        );
    }
    match source.as_database_error().and_then(|e| e.code()) {
        Some(code) => error(format!(
            "database operation failed (SQLSTATE {code}); check database permissions and schema"
        )),
        None => error(
            "database connection or query failed; check connectivity and database configuration",
        ),
    }
}

fn migration_error(source: MigrateError) -> MigrationError {
    match source {
        MigrateError::VersionMismatch(n) => error(format!(
            "checksum mismatch for migration {n}; restore its published SQL"
        )),
        MigrateError::ExecuteMigration(e, n) => {
            error(format!("migration {n} failed: {}", database_error(e)))
        }
        MigrateError::Execute(e) => database_error(e),
        MigrateError::Dirty(n) => error(format!(
            "migration {n} has failed history; inspect the database before retrying"
        )),
        _ => error("invalid migration history or bundle; inspect the applied migrations"),
    }
}

impl PgStore {
    pub async fn migrate(&self) -> Result<(), MigrationError> {
        self.run_migrations(active_migrations()).await
    }

    #[cfg(feature = "test-support")]
    pub async fn migrate_with_for_test(&self, migrator: &Migrator) -> Result<(), MigrationError> {
        self.run_migrations(migrator).await
    }

    async fn run_migrations(&self, source: &Migrator) -> Result<(), MigrationError> {
        tokio::time::timeout(
            std::time::Duration::from_secs(10),
            self.run_migrations_inner(source),
        )
        .await
        .map_err(|_| {
            error("schema preparation timed out; no readiness granted; inspect migration history")
        })?
    }

    async fn run_migrations_inner(&self, source: &Migrator) -> Result<(), MigrationError> {
        validate_bundle(source)?;
        let mut connection = self.pool.acquire().await.map_err(database_error)?;
        // A session advisory lock must never return to the pool, even when this future is cancelled.
        connection.close_on_drop();
        sqlx::query("SET search_path = public")
            .execute(&mut *connection)
            .await
            .map_err(database_error)?;
        // PostgreSQL otherwise notices a dead client only after a blocked query finishes.
        sqlx::query("SET client_connection_check_interval = '1s'")
            .execute(&mut *connection)
            .await
            .map_err(database_error)?;
        for setting in [
            "SET statement_timeout='5s'",
            "SET lock_timeout='1s'",
            "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
        ] {
            sqlx::query(setting)
                .execute(&mut *connection)
                .await
                .map_err(database_error)?;
        }
        let complete = check_history(&mut connection, source, false).await?;
        sqlx::query("COMMIT")
            .execute(&mut *connection)
            .await
            .map_err(database_error)?;
        if complete {
            connection.close().await.map_err(database_error)?;
            return Ok(());
        }
        // Migration coordination may take longer than a DDL lock wait. Keep it
        // bounded by the statement limit and the enclosing preparation deadline.
        sqlx::query("SET lock_timeout='5s'")
            .execute(&mut *connection)
            .await
            .map_err(database_error)?;
        connection.lock().await.map_err(migration_error)?;
        sqlx::query("SET lock_timeout='1s'")
            .execute(&mut *connection)
            .await
            .map_err(database_error)?;
        check_history(&mut connection, source, false).await?;
        let runner = Migrator {
            migrations: source.migrations.clone(),
            ignore_missing: true, // Only a valid later tail is allowed by check_history.
            locking: false, // The SQLx lock is already held across preflight on this connection.
            no_tx: false,
        };
        runner
            .run_direct(&mut *connection)
            .await
            .map_err(migration_error)?;
        connection.unlock().await.map_err(migration_error)?;
        connection.close().await.map_err(database_error)?;
        Ok(())
    }

    pub(crate) async fn check_migrations(&self) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await.map_err(crate::db_error)?;
        for setting in [
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
            "SET LOCAL statement_timeout='1500ms'",
            "SET LOCAL lock_timeout='250ms'",
        ] {
            sqlx::query(setting)
                .execute(&mut *tx)
                .await
                .map_err(crate::db_error)?;
        }
        check_history(&mut tx, active_migrations(), true)
            .await
            .map_err(|_| StoreError::IncompatibleSchema)?;
        tx.commit().await.map_err(crate::db_error)
    }
}

fn validate_bundle(source: &Migrator) -> Result<(), MigrationError> {
    let mut previous = 0;
    for migration in source.iter() {
        if migration.version <= previous
            || migration.no_tx
            || migration.migration_type.is_down_migration()
        {
            return Err(error(
                "migration bundle must contain increasing transactional up migrations",
            ));
        }
        if previous == 0 && migration.version != 1 {
            return Err(error("migration bundle must begin with baseline 1"));
        }
        previous = migration.version;
    }
    if previous == 0 {
        return Err(error("migration bundle is empty"));
    }
    Ok(())
}

async fn check_history(
    conn: &mut PgConnection,
    source: &Migrator,
    complete: bool,
) -> Result<bool, MigrationError> {
    let legacy: bool = sqlx::query_scalar("SELECT to_regclass('public.schema_meta') IS NOT NULL")
        .fetch_one(&mut *conn)
        .await
        .map_err(database_error)?;
    if legacy {
        return Err(error(
            "legacy schema detected; explicitly create a fresh database for this release (no data was changed)",
        ));
    }
    let ledger: Option<i64> = sqlx::query_scalar("SELECT c.oid::bigint FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_sqlx_migrations' AND c.relkind='r'")
        .fetch_optional(&mut *conn).await.map_err(database_error)?;
    let rows = if let Some(oid) = ledger {
        validate_ledger(conn, oid).await?;
        sqlx::query(
            "SELECT version, success, checksum FROM public._sqlx_migrations ORDER BY version",
        )
        .fetch_all(&mut *conn)
        .await
        .map_err(database_error)?
    } else {
        vec![]
    };
    if rows.is_empty() {
        if complete {
            return Err(error("required baseline migration is missing"));
        }
        ensure_empty(conn, ledger).await?;
        return Ok(false);
    }
    let maximum = source
        .iter()
        .last()
        .ok_or_else(|| error("migration bundle is empty"))?
        .version;
    let mut applied = std::collections::BTreeMap::new();
    for row in rows {
        let version: i64 = row.try_get("version").map_err(database_error)?;
        let success: bool = row.try_get("success").map_err(database_error)?;
        let checksum: Vec<u8> = row.try_get("checksum").map_err(database_error)?;
        if !success || version < 1 || applied.insert(version, checksum).is_some() {
            return Err(error(format!(
                "invalid or failed migration history at {version}"
            )));
        }
        if version <= maximum && !source.iter().any(|m| m.version == version) {
            return Err(error(format!(
                "unknown migration {version} inside this binary's history"
            )));
        }
    }
    let latest = *applied.keys().last().expect("nonempty history");
    let mut ready = true;
    for migration in source.iter() {
        match applied.get(&migration.version) {
            Some(checksum) if checksum.as_slice() == migration.checksum.as_ref() => {}
            Some(_) => {
                return Err(error(format!(
                    "checksum mismatch for migration {}",
                    migration.version
                )));
            }
            None if complete || migration.version < latest => {
                return Err(error(format!(
                    "missing required migration {} in history",
                    migration.version
                )));
            }
            None => ready = false,
        }
    }
    Ok(ready)
}

async fn validate_ledger(conn: &mut PgConnection, oid: i64) -> Result<(), MigrationError> {
    let columns: Vec<(String,String,bool)> = sqlx::query_as("SELECT attname::text, format_type(atttypid,atttypmod), attnotnull FROM pg_attribute WHERE attrelid=$1::bigint::oid AND attnum>0 AND NOT attisdropped ORDER BY attnum")
        .bind(oid).fetch_all(&mut *conn).await.map_err(database_error)?;
    let expected = [
        ("version", "bigint"),
        ("description", "text"),
        ("installed_on", "timestamp with time zone"),
        ("success", "boolean"),
        ("checksum", "bytea"),
        ("execution_time", "bigint"),
    ];
    if columns.len() != expected.len()
        || columns
            .iter()
            .zip(expected)
            .any(|((name, ty, required), (en, et))| name != en || ty != et || !required)
    {
        return Err(error("malformed SQLx migration ledger"));
    }
    let primary: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=$1::bigint::oid AND contype='p' AND conkey=ARRAY[1]::smallint[])")
        .bind(oid).fetch_one(&mut *conn).await.map_err(database_error)?;
    if !primary {
        return Err(error("migration ledger must have its version primary key"));
    }
    Ok(())
}

async fn ensure_empty(conn: &mut PgConnection, ledger: Option<i64>) -> Result<(), MigrationError> {
    let oid = ledger.unwrap_or(0);
    // Managed hosts may install extensions in public before the application.
    // Exempt their members and internal implementation objects (row/array
    // types, indexes), but not ordinary user objects that depend on them.
    let occupied: bool = sqlx::query_scalar(
        r#"WITH RECURSIVE extension_objects(classid, objid) AS (
            SELECT classid, objid FROM pg_depend
            WHERE refclassid='pg_extension'::regclass AND deptype='e'
            UNION
            SELECT d.classid, d.objid FROM pg_depend d
            JOIN extension_objects e ON d.refclassid=e.classid AND d.refobjid=e.objid
            WHERE d.deptype IN ('i', 'a')
        )
        SELECT EXISTS(
            SELECT 1 FROM pg_class c
            WHERE c.relnamespace='public'::regnamespace
              AND c.oid<>$1::bigint::oid
              AND c.oid NOT IN (SELECT indexrelid FROM pg_index WHERE indrelid=$1::bigint::oid)
              AND NOT EXISTS (SELECT 1 FROM extension_objects e WHERE e.classid='pg_class'::regclass AND e.objid=c.oid)
        ) OR EXISTS(
            SELECT 1 FROM pg_type t
            WHERE t.typnamespace='public'::regnamespace
              AND (t.typrelid=0 OR t.typrelid<>$1::bigint::oid)
              AND (t.typelem=0 OR t.typelem<>COALESCE((SELECT reltype FROM pg_class WHERE oid=$1::bigint::oid),0))
              AND NOT EXISTS (SELECT 1 FROM extension_objects e WHERE e.classid='pg_type'::regclass AND e.objid=t.oid)
        )"#,
    )
        .bind(oid).fetch_one(&mut *conn).await.map_err(database_error)?;
    if occupied {
        return Err(error(
            "unmanaged schema detected; use an empty database (no data was changed)",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_migration_bundle_has_unique_increasing_versions() {
        validate_bundle(&MIGRATIONS).expect("the shipped migration bundle must be valid");
    }
}

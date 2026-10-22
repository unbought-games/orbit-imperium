//! These tests catch schema preparation that skips the ledger, changes retained data,
//! accepts incompatible history, or leaks the migration lock. Run serially on a disposable DB.
use orbit_storage_postgres::PgStore;
use sqlx::{PgPool, Row};

async fn fresh() -> (PgStore, PgPool) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&pool)
        .await
        .unwrap();
    (PgStore::connect(&url).await.unwrap(), pool)
}

#[tokio::test]
async fn provider_extension_objects_do_not_block_initial_migrations() {
    let (store, pool) = fresh().await;
    // Managed PostgreSQL installs monitoring views in public before the game
    // creates any tables. Their row/array types are internal dependencies.
    sqlx::raw_sql("CREATE EXTENSION pg_stat_statements WITH SCHEMA public; CREATE EXTENSION hstore WITH SCHEMA public")
        .execute(&pool).await.unwrap();
    let before: i64 =
        sqlx::query_scalar("SELECT 'public.pg_stat_statements'::regclass::oid::bigint")
            .fetch_one(&pool)
            .await
            .unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let after: i64 =
        sqlx::query_scalar("SELECT 'public.pg_stat_statements'::regclass::oid::bigint")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(before, after, "provider monitoring view must be preserved");
    let value: String = sqlx::query_scalar("SELECT ('key=>value'::hstore)->'key'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(value, "value");
}

#[tokio::test]
async fn provider_extensions_do_not_hide_unmanaged_objects() {
    for sql in [
        "CREATE TABLE unrelated (value integer)",
        "CREATE TYPE unrelated AS ENUM ('kept')",
        "CREATE VIEW unrelated AS SELECT 1 AS value",
        "CREATE VIEW unrelated AS SELECT * FROM pg_stat_statements",
    ] {
        let (store, pool) = fresh().await;
        sqlx::raw_sql("CREATE EXTENSION pg_stat_statements WITH SCHEMA public")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(sql).execute(&pool).await.unwrap();
        assert!(
            store
                .migrate()
                .await
                .unwrap_err()
                .to_string()
                .contains("unmanaged")
        );
        assert!(
            sqlx::query_scalar::<_, Option<String>>("SELECT to_regclass('_sqlx_migrations')::text")
                .fetch_one(&pool)
                .await
                .unwrap()
                .is_none()
        );
    }
}

#[tokio::test]
async fn baseline_is_complete_unseeded_and_repeatable() {
    let (store, pool) = fresh().await;
    store.migrate().await.unwrap();
    let ledger: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('public._sqlx_migrations')::text")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(
        ledger.is_some(),
        "schema preparation must record SQLx migration history"
    );
    let tables: i64 = sqlx::query_scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('accounts','manufacturing_batches','mission_fleets','world_evidence')")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(tables, 4);
    let accounts: i64 = sqlx::query_scalar("SELECT count(*) FROM accounts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(accounts, 0);
    store.migrate().await.unwrap();
    let rows = sqlx::query("SELECT version, checksum FROM _sqlx_migrations ORDER BY version")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(rows.len(), sqlx::migrate!("./migrations").iter().count());
    assert_eq!(rows[0].get::<i64, _>("version"), 1);
}

fn bundle(sql: &[(i64, &str)]) -> sqlx::migrate::Migrator {
    use sqlx::migrate::{Migration, MigrationType, Migrator};
    let mut migrations = vec![Migration::new(
        1,
        "baseline".into(),
        MigrationType::Simple,
        include_str!("../migrations/0001_fresh.sql").into(),
        false,
    )];
    // The fixture uses the exact baseline bytes once the production migration exists.
    migrations.extend(sql.iter().map(|(n, text)| {
        Migration::new(
            *n,
            "fixture".into(),
            MigrationType::Simple,
            (*text).to_owned().into(),
            false,
        )
    }));
    Migrator {
        migrations: migrations.into(),
        ..Migrator::DEFAULT
    }
}

#[tokio::test]
async fn compatible_tail_retains_data_and_checks_known_checksums() {
    let (store, pool) = fresh().await;
    let older = bundle(&[]);
    let newer = bundle(&[(
        2,
        "CREATE TABLE upgrade_probe (value integer); INSERT INTO upgrade_probe VALUES (42);",
    )]);
    store.migrate_with_for_test(&older).await.unwrap();
    sqlx::query(
        "INSERT INTO accounts VALUES ('00000000-0000-4000-8000-000000000001', 'kept', 'hash')",
    )
    .execute(&pool)
    .await
    .unwrap();
    store.migrate_with_for_test(&newer).await.unwrap();
    store.migrate_with_for_test(&older).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT name FROM accounts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "kept"
    );
    assert_eq!(
        sqlx::query_scalar::<_, i32>("SELECT value FROM upgrade_probe")
            .fetch_one(&pool)
            .await
            .unwrap(),
        42
    );
    sqlx::query("UPDATE _sqlx_migrations SET checksum = '\\x00' WHERE version=1")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .migrate_with_for_test(&older)
            .await
            .unwrap_err()
            .to_string()
            .contains("checksum")
    );
}

#[tokio::test]
async fn failed_transaction_rolls_back_and_retries_identical_sql() {
    let (store, pool) = fresh().await;
    let migrations = bundle(&[
        (2, "CREATE TABLE upgrade_probe (value integer)"),
        (
            3,
            "CREATE TABLE must_rollback (value integer); INSERT INTO must_rollback SELECT value FROM failure_control",
        ),
    ]);
    assert!(store.migrate_with_for_test(&migrations).await.is_err());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT max(version) FROM _sqlx_migrations")
            .fetch_one(&pool)
            .await
            .unwrap(),
        2
    );
    assert!(
        sqlx::query_scalar::<_, Option<String>>("SELECT to_regclass('must_rollback')::text")
            .fetch_one(&pool)
            .await
            .unwrap()
            .is_none()
    );
    sqlx::raw_sql(
        "CREATE TABLE failure_control (value integer); INSERT INTO failure_control VALUES (17)",
    )
    .execute(&pool)
    .await
    .unwrap();
    store.migrate_with_for_test(&migrations).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i32>("SELECT value FROM must_rollback")
            .fetch_one(&pool)
            .await
            .unwrap(),
        17
    );
}

#[tokio::test]
async fn legacy_and_unmanaged_schemas_are_not_adopted_or_modified() {
    let snapshots = [
        include_str!("../schema/001_current.sql"),
        include_str!("../schema/002_current.sql"),
        include_str!("../schema/003_current.sql"),
        include_str!("../schema/004_current.sql"),
        include_str!("../schema/005_current.sql"),
    ];
    for (index, sql) in snapshots.iter().enumerate() {
        let (store, pool) = fresh().await;
        sqlx::raw_sql(sql).execute(&pool).await.unwrap();
        let before: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            store
                .migrate()
                .await
                .unwrap_err()
                .to_string()
                .contains("legacy")
        );
        assert_eq!(
            sqlx::query_scalar::<_, i32>("SELECT version FROM schema_meta")
                .fetch_one(&pool)
                .await
                .unwrap(),
            index as i32 + 1
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace"
            )
            .fetch_one(&pool)
            .await
            .unwrap(),
            before
        );
    }
    for sql in [
        "CREATE TABLE unrelated (value integer)",
        "CREATE TYPE unrelated AS ENUM ('kept')",
        "CREATE VIEW unrelated AS SELECT 1 AS value",
    ] {
        let (store, pool) = fresh().await;
        sqlx::raw_sql(sql).execute(&pool).await.unwrap();
        assert!(store.migrate().await.is_err());
        assert!(
            sqlx::query_scalar::<_, Option<String>>("SELECT to_regclass('_sqlx_migrations')::text")
                .fetch_one(&pool)
                .await
                .unwrap()
                .is_none()
        );
    }
}

#[tokio::test]
async fn invalid_histories_are_rejected_and_empty_ledger_is_recoverable() {
    use sqlx::migrate::Migrate;
    let (store, pool) = fresh().await;
    let mut conn = pool.acquire().await.unwrap();
    conn.ensure_migrations_table().await.unwrap();
    drop(conn);
    store.migrate_with_for_test(&bundle(&[])).await.unwrap();
    let newer = bundle(&[
        (2, "CREATE TABLE step_two (value integer)"),
        (3, "CREATE TABLE step_three (value integer)"),
    ]);
    // Readiness and migrations must not silently recreate a missing earlier history entry.
    sqlx::query("UPDATE _sqlx_migrations SET version=3")
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.migrate_with_for_test(&newer).await.is_err());
    sqlx::query("UPDATE _sqlx_migrations SET version=1, success=false")
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.migrate().await.is_err());
    sqlx::query("UPDATE _sqlx_migrations SET success=true")
        .execute(&pool)
        .await
        .unwrap();
    let mut no_tx = bundle(&[(2, "SELECT 1")]);
    no_tx.migrations.to_mut()[1].no_tx = true;
    assert!(store.migrate_with_for_test(&no_tx).await.is_err());
    let (store, pool) = fresh().await;
    sqlx::raw_sql("CREATE TABLE _sqlx_migrations(version text)")
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.migrate().await.is_err());
    assert!(
        sqlx::query_scalar::<_, Option<String>>("SELECT to_regclass('accounts')::text")
            .fetch_one(&pool)
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn concurrent_starters_apply_once_and_aborted_lock_holder_releases_connection() {
    use sqlx::migrate::Migrate;
    use std::time::Duration;
    let (store, pool) = fresh().await;
    let (a, b, c) = tokio::join!(store.migrate(), store.migrate(), store.migrate());
    a.unwrap();
    b.unwrap();
    c.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM _sqlx_migrations")
            .fetch_one(&pool)
            .await
            .unwrap(),
        sqlx::migrate!("./migrations").iter().count() as i64
    );
    let mut gate = pool.acquire().await.unwrap();
    sqlx::query("SELECT pg_advisory_lock(901324)")
        .execute(&mut *gate)
        .await
        .unwrap();
    let clone = store.clone();
    let waiter = tokio::spawn(async move {
        clone.migrate_with_for_test(&future_bundle("CREATE TABLE cancelled_probe (value integer); SELECT pg_advisory_xact_lock(901324)")).await
    });
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let waiting: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=901324 AND NOT granted)").fetch_one(&pool).await.unwrap();
            if waiting { break; }
            tokio::task::yield_now().await;
        }
    }).await.unwrap();
    waiter.abort();
    let _ = waiter.await;
    tokio::time::timeout(Duration::from_secs(5), store.migrate())
        .await
        .unwrap()
        .unwrap();
    assert!(
        sqlx::query_scalar::<_, Option<String>>("SELECT to_regclass('cancelled_probe')::text")
            .fetch_one(&pool)
            .await
            .unwrap()
            .is_none()
    );
    sqlx::query("SELECT pg_advisory_unlock(901324)")
        .execute(&mut *gate)
        .await
        .unwrap();
    gate.lock().await.unwrap();
    gate.unlock().await.unwrap();
}

#[tokio::test]
async fn readiness_accepts_later_migrations_without_taking_migration_lock() {
    use orbit_application::GameStore;
    use sqlx::migrate::Migrate;
    use std::time::Duration;
    let (store, pool) = fresh().await;
    assert!(store.ready().await.is_err());
    store.migrate().await.unwrap();
    let mut gate = pool.acquire().await.unwrap();
    gate.lock().await.unwrap();
    // Restarting an already prepared schema must not wait for a migrator.
    tokio::time::timeout(Duration::from_millis(500), store.migrate())
        .await
        .expect("current schema startup waited for migration lock")
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), store.ready())
        .await
        .unwrap()
        .unwrap();
    gate.unlock().await.unwrap();
    store
        .migrate_with_for_test(&future_bundle(include_str!(
            "fixtures/migrations/0002_compatible_probe.sql"
        )))
        .await
        .unwrap();
    store.ready().await.unwrap();
    sqlx::query("DELETE FROM _sqlx_migrations WHERE version=1")
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.ready().await.is_err());
}

fn future_bundle(sql: &str) -> sqlx::migrate::Migrator {
    use sqlx::migrate::{Migration, MigrationType, Migrator};
    let mut migrations = sqlx::migrate!("./migrations").migrations.to_vec();
    migrations.push(Migration::new(
        migrations.last().unwrap().version + 1,
        "future fixture".into(),
        MigrationType::Simple,
        sql.to_owned().into(),
        false,
    ));
    Migrator {
        migrations: migrations.into(),
        ..Migrator::DEFAULT
    }
}

async fn current_state_rows(store: &PgStore, pool: &PgPool) {
    store.migrate_with_for_test(&bundle(&[])).await.unwrap();
    sqlx::raw_sql(r#"
        INSERT INTO rulesets VALUES ('profile','test','{}');
        INSERT INTO universes VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',true,1,1000,'profile');
        INSERT INTO players VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001');
        INSERT INTO bodies VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Planet',1,1,1,100,10,'{}','{}',1000,0);
        INSERT INTO mission_fleets SELECT universe,gen_random_uuid(),id,'{"leg":"Outbound","terms":{"paid":"kept"}}' FROM players;
        INSERT INTO research_operations SELECT gen_random_uuid(),universe,owner,id,'{"status":"Active","revision":7,"commitment":{"paid":"kept"}}' FROM bodies;
        INSERT INTO manufacturing_batches SELECT gen_random_uuid(),universe,owner,id,1,'{"status":"Active","revision":9,"commitment":{"paid":"kept"}}' FROM bodies;
    "#).execute(pool).await.unwrap();
}

#[tokio::test]
async fn baseline_enforces_authoritative_json_and_indexes_activity() {
    let (store, pool) = fresh().await;
    current_state_rows(&store, &pool).await;
    let capacity: i64 = sqlx::query_scalar("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='bodies' AND column_name='capacity'").fetch_one(&pool).await.unwrap();
    assert_eq!(capacity, 0);
    let reservations: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('progression_reservations')::text")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(reservations.is_none());
    sqlx::query("INSERT INTO legacy_body_capacities SELECT id, '{\"metal\":123,\"crystal\":456,\"deuterium\":789}' FROM bodies").execute(&pool).await.unwrap();
    let mirrors: i64 = sqlx::query_scalar("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND ((table_name='mission_fleets' AND column_name='active') OR (table_name IN ('research_operations','manufacturing_batches') AND column_name IN ('status','revision')))").fetch_one(&pool).await.unwrap();
    assert_eq!(
        mirrors, 0,
        "current state must have one writable representation"
    );
    // Missing/unknown discriminators must fail at write time, not disappear from a partial load.
    for (table, key, value) in [
        ("mission_fleets", "leg", "Unknown"),
        ("research_operations", "status", "Unknown"),
        ("manufacturing_batches", "status", "Cancelled"),
    ] {
        assert!(
            sqlx::query(&format!("UPDATE {table} SET data=data - $1"))
                .bind(key)
                .execute(&pool)
                .await
                .is_err()
        );
        assert!(
            sqlx::query(&format!(
                "UPDATE {table} SET data=jsonb_set(data,ARRAY[$1],to_jsonb($2::text))"
            ))
            .bind(key)
            .bind(value)
            .execute(&pool)
            .await
            .is_err()
        );
    }
    for table in ["research_operations", "manufacturing_batches"] {
        for value in [
            serde_json::Value::Null,
            serde_json::json!(-1),
            serde_json::json!(1.5),
            serde_json::json!("1"),
        ] {
            assert!(
                sqlx::query(&format!(
                    "UPDATE {table} SET data=jsonb_set(data,'{{revision}}',$1)"
                ))
                .bind(value)
                .execute(&pool)
                .await
                .is_err()
            );
        }
        assert!(
            sqlx::query(&format!("UPDATE {table} SET data=data-'revision'"))
                .execute(&pool)
                .await
                .is_err()
        );
        let old: i64 =
            sqlx::query_scalar(&format!("SELECT (data->>'revision')::bigint FROM {table}"))
                .fetch_one(&pool)
                .await
                .unwrap();
        // A successful CAS consumes the token; reusing it must not update the row.
        let update = format!(
            "UPDATE {table} SET data=jsonb_set(data,'{{revision}}',to_jsonb($1::bigint)) WHERE (data->>'revision')::bigint=$2"
        );
        assert_eq!(
            sqlx::query(&update)
                .bind(old + 1)
                .bind(old)
                .execute(&pool)
                .await
                .unwrap()
                .rows_affected(),
            1
        );
        assert_eq!(
            sqlx::query(&update)
                .bind(old + 2)
                .bind(old)
                .execute(&pool)
                .await
                .unwrap()
                .rows_affected(),
            0
        );
    }
    assert!(sqlx::query("INSERT INTO research_operations SELECT gen_random_uuid(),universe,owner,body,data FROM research_operations").execute(&pool).await.is_err(), "one active research operation is still enforced");
    sqlx::query("INSERT INTO mission_fleets SELECT universe,gen_random_uuid(),owner,jsonb_set(data,'{leg}','\"Returned\"') FROM mission_fleets CROSS JOIN generate_series(1,1000)").execute(&pool).await.unwrap();
    sqlx::query("ANALYZE mission_fleets")
        .execute(&pool)
        .await
        .unwrap();
    // Force eligibility for the small progression fixtures. This checks index compatibility,
    // not a production cost estimate; the fleet fixture includes terminal history.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL enable_seqscan=off")
        .execute(&mut *tx)
        .await
        .unwrap();
    for (query, index) in [
        (
            "SELECT data FROM mission_fleets WHERE universe='00000000-0000-0000-0000-000000000001' AND ((data->>'leg') IN ('Outbound','Returning') OR id='00000000-0000-0000-0000-000000000099') ORDER BY id",
            "mission_active",
        ),
        (
            "SELECT data FROM research_operations WHERE owner='00000000-0000-0000-0000-000000000003' AND data->>'status'='Active'",
            "one_active_research",
        ),
        (
            "SELECT data FROM manufacturing_batches WHERE body='00000000-0000-0000-0000-000000000004' AND data->>'status'='Active' ORDER BY queue_sequence",
            "active_manufacturing",
        ),
    ] {
        let plan: serde_json::Value = sqlx::query_scalar(&format!("EXPLAIN (FORMAT JSON) {query}"))
            .fetch_one(&mut *tx)
            .await
            .unwrap();
        assert!(plan.to_string().contains(index), "expected {index}: {plan}");
    }
}

#[tokio::test]
async fn pending_migrator_waits_for_peer_then_rechecks_history() {
    use std::time::Duration;
    let (store, pool) = fresh().await;
    store.migrate().await.unwrap();
    let sql = "CREATE TABLE slow_startup_probe (value integer); SELECT pg_sleep(1.5)";
    let first_store = store.clone();
    let first =
        tokio::spawn(async move { first_store.migrate_with_for_test(&future_bundle(sql)).await });
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let sleeping: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep' AND query LIKE '%slow_startup_probe%')")
                .fetch_one(&pool).await.unwrap();
            if sleeping { break; }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    }).await.unwrap();
    let second = store.migrate_with_for_test(&future_bundle(sql)).await;
    first.await.unwrap().unwrap();
    second.expect("coordination wait incorrectly inherited the one-second DDL lock timeout");
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM _sqlx_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        count,
        sqlx::migrate!("./migrations").iter().count() as i64 + 1
    );
}

#[tokio::test]
async fn retained_runtime_indexes_require_online_preparation_before_migration() {
    let (store, pool) = fresh().await;
    let all = sqlx::migrate!("./migrations");
    let older = sqlx::migrate::Migrator {
        migrations: all
            .migrations
            .iter()
            .take(2)
            .cloned()
            .collect::<Vec<_>>()
            .into(),
        ..sqlx::migrate::Migrator::DEFAULT
    };
    store.migrate_with_for_test(&older).await.unwrap();
    sqlx::raw_sql("INSERT INTO rulesets VALUES('fixture','fixture','{}'); INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true,1,0,'fixture'); INSERT INTO asset_lots VALUES('00000000-0000-4000-8000-000000000001','retained','{\"marker\":\"kept\"}')").execute(&pool).await.unwrap();
    let error = store.migrate().await.unwrap_err();
    assert!(
        error.to_string().contains("prepare-runtime-indexes.sql"),
        "online preparation failure must tell the operator how to proceed: {error}"
    );
    for statement in include_str!("../../../scripts/prepare-runtime-indexes.sql").split(';') {
        if !statement.trim().is_empty() {
            sqlx::query(statement).execute(&pool).await.unwrap();
        }
    }
    store.migrate().await.unwrap();
    let retained: serde_json::Value =
        sqlx::query_scalar("SELECT data FROM asset_lots WHERE key='retained'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(retained, serde_json::json!({"marker":"kept"}));
    store.migrate().await.unwrap();
}

// Catch owner/coordinate predicates being served by scans of unrelated players.
// Buffers bound work, not wall-clock speed; the planner remains free to choose scans.
#[tokio::test]
async fn player_lookups_are_selective_and_keep_explicit_terminal_operations() {
    let (store, pool) = fresh().await;
    let all = sqlx::migrate!("./migrations");
    let older = sqlx::migrate::Migrator {
        migrations: all
            .migrations
            .iter()
            .filter(|m| m.version <= 5)
            .cloned()
            .collect::<Vec<_>>()
            .into(),
        ..sqlx::migrate::Migrator::DEFAULT
    };
    store.migrate_with_for_test(&older).await.unwrap();
    sqlx::raw_sql(include_str!("fixtures/player_lookup.sql"))
        .execute(&pool)
        .await
        .unwrap();
    // Upgrade populated tables directly and allow an already-applied migration to restart.
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let progression = include_str!("../src/progression_state.rs");
    let world = include_str!("../src/world.rs");
    let query = |source: &str, prefix: &str| {
        source
            .split('"')
            .find(|s| s.starts_with(prefix))
            .unwrap()
            .to_owned()
    };
    let u: uuid::Uuid = sqlx::query_scalar("SELECT md5('u1')::uuid")
        .fetch_one(&pool)
        .await
        .unwrap();
    let p: uuid::Uuid = sqlx::query_scalar("SELECT md5('p42')::uuid")
        .fetch_one(&pool)
        .await
        .unwrap();
    let explicit: Vec<uuid::Uuid> = sqlx::query_scalar(
        "SELECT md5(x)::uuid FROM unnest(ARRAY['m10042','m42','m11042','absent']) x",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let mut tx = pool.begin().await.unwrap();
    for mode in ["force_custom_plan", "force_generic_plan"] {
        sqlx::query(&format!("SET LOCAL plan_cache_mode={mode}"))
            .execute(&mut *tx)
            .await
            .unwrap();
        for (table, expected) in [("manufacturing_batches", 6), ("constructions", 1)] {
            let q = query(progression, &format!("SELECT * FROM {table} WHERE"));
            let rows = sqlx::query(&q)
                .bind(u)
                .bind(p)
                .bind(&explicit)
                .fetch_all(&mut *tx)
                .await
                .unwrap();
            assert_eq!(
                rows.len(),
                expected,
                "{table}: expected owner-active rows; manufacturing also includes one explicit terminal ID without duplicates or other-universe rows"
            );
            let plan: serde_json::Value =
                sqlx::query_scalar(&format!("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) {q}"))
                    .bind(u)
                    .bind(p)
                    .bind(&explicit)
                    .fetch_one(&mut *tx)
                    .await
                    .unwrap();
            assert_selective(
                &plan,
                if table == "constructions" { 20 } else { 100 },
                table,
            );
        }
        let q = query(world, "SELECT data FROM debris_fields WHERE");
        let coordinates = vec![serde_json::json!({"galaxy":1,"system":42,"position":1})];
        let plan: serde_json::Value =
            sqlx::query_scalar(&format!("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) {q}"))
                .bind(u)
                .bind(&coordinates)
                .fetch_one(&mut *tx)
                .await
                .unwrap();
        assert_selective(&plan, 20, "debris");
        let q = query(world, "SELECT count(*) FROM commands WHERE");
        let count: i64 = sqlx::query_scalar(&q)
            .bind(u)
            .bind(p)
            .bind(18000_i64)
            .fetch_one(&mut *tx)
            .await
            .unwrap();
        assert_eq!(
            count, 1,
            "completed commands must count toward the admission limit"
        );
        let plan: serde_json::Value =
            sqlx::query_scalar(&format!("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) {q}"))
                .bind(u)
                .bind(p)
                .bind(18000_i64)
                .fetch_one(&mut *tx)
                .await
                .unwrap();
        assert_selective(&plan, 40, "recent commands");
        // A parameterized all-world branch prevents a selective generic mission plan.
        if mode == "force_custom_plan" {
            let q = query(
                world,
                "SELECT data FROM mission_fleets WHERE universe=$1 AND ((",
            );
            let plan: serde_json::Value =
                sqlx::query_scalar(&format!("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) {q}"))
                    .bind(u)
                    .bind(None::<uuid::Uuid>)
                    .bind(false)
                    .bind(vec![p])
                    .bind(p.to_string())
                    .bind(&coordinates)
                    .fetch_one(&mut *tx)
                    .await
                    .unwrap();
            assert_selective(&plan, 100, "missions");
        }
    }
}

fn assert_selective(plan: &serde_json::Value, maximum: u64, label: &str) {
    let root = &plan[0]["Plan"];
    let blocks =
        root["Shared Hit Blocks"].as_u64().unwrap() + root["Shared Read Blocks"].as_u64().unwrap();
    assert!(
        blocks < maximum,
        "{label} touched {blocks} buffers, expected fewer than {maximum}: {plan}"
    );
}

#[tokio::test]
async fn account_membership_lookup_is_selective() {
    let (store, pool) = fresh().await;
    store.migrate().await.unwrap();
    sqlx::raw_sql("INSERT INTO rulesets VALUES ('lookup','lookup','{}');
        INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash)
        SELECT md5('u'||g)::uuid,md5('e'||g)::uuid,true,1,0,'lookup' FROM generate_series(1,2) g;
        INSERT INTO accounts SELECT md5('a'||g)::uuid,'account'||g,'hash' FROM generate_series(1,5000) g;
        INSERT INTO universe_memberships(universe,account,player) SELECT md5('u'||(1+g%2))::uuid,md5('a'||g)::uuid,md5('p'||g)::uuid FROM generate_series(1,5000) g;
        ANALYZE")
        .execute(&pool)
        .await
        .unwrap();
    let identity = include_str!("../src/identity.rs");
    let q = identity
        .split('"')
        .find(|s| s.starts_with("SELECT universe,player,u.name FROM universe_memberships"))
        .unwrap();
    let account: uuid::Uuid = sqlx::query_scalar("SELECT md5('a42')::uuid")
        .fetch_one(&pool)
        .await
        .unwrap();
    let plan: serde_json::Value =
        sqlx::query_scalar(&format!("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) {q}"))
            .bind(account)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_selective(&plan, 10, "memberships by account");
}

#[tokio::test]
async fn membership_join_upgrade_preserves_unknowns_and_old_writers() {
    let (store, pool) = fresh().await;
    // The exact retained deployment schema, not a current schema with a dropped column.
    let older = sqlx::migrate::Migrator {
        migrations: sqlx::migrate!("./migrations")
            .iter()
            .filter(|m| m.version <= 10)
            .cloned()
            .collect::<Vec<_>>()
            .into(),
        ..sqlx::migrate::Migrator::DEFAULT
    };
    store.migrate_with_for_test(&older).await.unwrap();
    sqlx::raw_sql(r#"
        INSERT INTO rulesets VALUES ('profile','test','{}');
        INSERT INTO universes VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',false,1,1000,'profile');
        INSERT INTO accounts VALUES ('00000000-0000-0000-0000-000000000003','retained','hash');
        INSERT INTO players VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001');
        INSERT INTO universe_memberships(universe,account,player) SELECT universe,'00000000-0000-0000-0000-000000000003',id FROM players;
    "#).execute(&pool).await.unwrap();
    let before: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(m) FROM universe_memberships m")
            .fetch_one(&pool)
            .await
            .unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    // Previous binaries accept the compatible tail and still read/write their columns.
    store.migrate_with_for_test(&older).await.unwrap();
    let after: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(m) - 'joined_at_ms' FROM universe_memberships m")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(before, after);
    assert_eq!(
        sqlx::query_scalar::<_, Option<i64>>("SELECT joined_at_ms FROM universe_memberships")
            .fetch_one(&pool)
            .await
            .unwrap(),
        None
    );
    sqlx::raw_sql(r#"
        INSERT INTO accounts VALUES ('00000000-0000-0000-0000-000000000005','old-writer','hash');
        INSERT INTO players VALUES ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001');
        INSERT INTO universe_memberships(universe,account,player) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006');
    "#).execute(&pool).await.unwrap();
    let rows: Vec<(uuid::Uuid, uuid::Uuid)> = sqlx::query_as(
        "SELECT universe,player FROM universe_memberships WHERE account=$1 ORDER BY universe",
    )
    .bind(uuid::Uuid::from_u128(5))
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        rows,
        vec![(uuid::Uuid::from_u128(1), uuid::Uuid::from_u128(6))]
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM universe_memberships WHERE joined_at_ms IS NULL"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        2
    );
    let error = sqlx::query("UPDATE universe_memberships SET joined_at_ms=-1")
        .execute(&pool)
        .await
        .unwrap_err();
    assert_eq!(
        error.as_database_error().unwrap().code().as_deref(),
        Some("23514")
    );
    // Zero is a valid known timestamp; NULL remains distinct from zero.
    sqlx::query("UPDATE universe_memberships SET joined_at_ms=0 WHERE account=$1")
        .bind(uuid::Uuid::from_u128(5))
        .execute(&pool)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, Option<i64>>(
            "SELECT joined_at_ms FROM universe_memberships WHERE account=$1"
        )
        .bind(uuid::Uuid::from_u128(5))
        .fetch_one(&pool)
        .await
        .unwrap(),
        Some(0)
    );
}

#[tokio::test]
async fn colony_schema_preserves_old_rows_and_old_writer_slot_creation() {
    let (store, pool) = fresh().await;
    let older = sqlx::migrate::Migrator {
        migrations: sqlx::migrate!("./migrations")
            .iter()
            .filter(|m| m.version < 13)
            .cloned()
            .collect::<Vec<_>>()
            .into(),
        ..sqlx::migrate::Migrator::DEFAULT
    };
    store.migrate_with_for_test(&older).await.unwrap();
    sqlx::raw_sql(r#"
        INSERT INTO rulesets VALUES ('profile','test','{}');
        INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',false,1,1000,'profile');
        INSERT INTO players VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001');
        INSERT INTO bodies VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Planet',1,1,8,163,40,'{}','{}',1000,0);
        INSERT INTO mission_fleets VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003','{"leg":"Returning"}');
    "#).execute(&pool).await.unwrap();
    let before: serde_json::Value = sqlx::query_scalar("SELECT to_jsonb(b) FROM bodies b")
        .fetch_one(&pool)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store.migrate_with_for_test(&older).await.unwrap();
    let after: serde_json::Value = sqlx::query_scalar("SELECT to_jsonb(b) FROM bodies b")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, after);
    let heads: i64 = sqlx::query_scalar("SELECT count(*) FROM planet_slot_revisions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(heads, 0, "startup performs no population backfill");
    sqlx::raw_sql("INSERT INTO bodies SELECT '00000000-0000-0000-0000-000000000006',universe,owner,kind,galaxy,system,9,fields,max_temperature,amounts,carry,checkpoint_at,revision FROM bodies").execute(&pool).await.unwrap();
    let revision: i64 =
        sqlx::query_scalar("SELECT revision FROM planet_slot_revisions WHERE position=9")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(revision, 1);
    sqlx::query("UPDATE bodies SET amounts='{}',revision=revision+1 WHERE position=9")
        .execute(&pool)
        .await
        .unwrap();
    let revision: i64 =
        sqlx::query_scalar("SELECT revision FROM planet_slot_revisions WHERE position=9")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        revision, 1,
        "private changes never change public slot token"
    );
    for leg in ["Colonized", "Deployed"] {
        sqlx::query("UPDATE mission_fleets SET data=jsonb_build_object('leg',$1::text)")
            .bind(leg)
            .execute(&pool)
            .await
            .unwrap();
    }
    assert!(
        sqlx::query("UPDATE mission_fleets SET data='{}'")
            .execute(&pool)
            .await
            .is_err()
    );
}

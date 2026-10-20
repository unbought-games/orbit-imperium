use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use uuid::Uuid;

#[tokio::test]
async fn atomic_five_player_bootstrap_rerun_and_restart() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("player{}", i + 1),
        password: Uuid::new_v4().to_string(),
    });
    let secret = [17; 32];
    let invalid = std::array::from_fn(|_| MvpAccount {
        name: "duplicate".into(),
        password: "disposable-test-password".into(),
    });
    assert!(
        store
            .bootstrap_mvp(u, 1000, &invalid, &secret)
            .await
            .is_err()
    );
    assert!(
        store
            .bootstrap_mvp(u, -1, &accounts, &secret)
            .await
            .is_err()
    );
    assert!(store.universes().await.unwrap().is_empty());
    store
        .bootstrap_mvp(u, 1000, &accounts, &secret)
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let counts:(i64,i64,i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM accounts),(SELECT count(*) FROM universe_memberships),(SELECT count(*) FROM bodies),(SELECT count(DISTINCT (galaxy,system,position)) FROM bodies)").fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (5, 5, 5, 5));
    let identity = SessionService::new(store.clone());
    let service = GameService::new(store.clone());
    let mut bindings = Vec::new();
    for account in &accounts {
        let login = identity
            .login(&account.name, &account.password, None)
            .await
            .unwrap();
        assert_eq!(login.session.memberships.len(), 1);
        let b = service
            .current_binding(login.session.account, u, Uuid::new_v4())
            .await
            .unwrap()
            .binding;
        let v = service
            .bound_view(
                Principal {
                    account: b.account,
                    player: b.player,
                    universe: u,
                },
                QueryContext {
                    binding: b,
                    request_id: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        assert_eq!(v.view.speed, 10);
        assert_eq!(v.view.bodies.len(), 1);
        let body = &v.view.bodies[0];
        assert_eq!(
            (
                &body.amounts.metal,
                &body.amounts.crystal,
                &body.amounts.deuterium
            ),
            (&"1000000000".into(), &"1000000000".into(), &"0".into())
        );
        assert!(body.levels.values().all(|l| *l == 0));
        assert!(body.inventories.is_empty());
        assert!(v.view.research.iter().all(|r| r.level == 0));
        assert!(v.view.fleets.is_empty());
        assert!(v.view.constructions.is_empty());
        assert_eq!(body.fields, 163);
        assert_eq!(body.coordinates.galaxy, 1);
        assert!((1..=5).contains(&body.coordinates.system));
        assert!((4..=12).contains(&body.coordinates.position));
        bindings.push(b);
    }
    // Rerunning setup must preserve an existing player's original balance.
    sqlx::query("UPDATE bodies SET amounts=$2 WHERE owner=$1")
        .bind(bindings[0].player.0)
        .bind(serde_json::json!({"metal":500000000,"crystal":500000000,"deuterium":0}))
        .execute(&pool)
        .await
        .unwrap();
    let before: serde_json::Value =
        sqlx::query_scalar("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bodies b")
            .fetch_one(&pool)
            .await
            .unwrap();
    let alternate = std::array::from_fn(|i| MvpAccount {
        name: accounts[i].name.clone(),
        password: Uuid::new_v4().to_string(),
    });
    let (a, b) = tokio::join!(
        store.bootstrap_mvp(u, 5000, &alternate, &secret),
        store.bootstrap_mvp(u, 9000, &accounts, &secret)
    );
    a.unwrap();
    b.unwrap();
    let after: serde_json::Value =
        sqlx::query_scalar("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bodies b")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(before, after);
    assert!(
        identity
            .login(&accounts[0].name, &accounts[0].password, None)
            .await
            .is_ok()
    );
    assert!(
        identity
            .login(&accounts[0].name, &alternate[0].password, None)
            .await
            .is_err()
    );
    assert!(
        store
            .bootstrap_mvp(u, 1000, &accounts, &[18; 32])
            .await
            .is_err()
    );
    sqlx::query("UPDATE universes SET speed=1 WHERE id=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .bootstrap_mvp(u, 1000, &accounts, &secret)
            .await
            .is_err()
    );
    sqlx::query("UPDATE universes SET speed=10 WHERE id=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    let reopened = PgStore::connect(&url).await.unwrap();
    let guard = reopened.server_guard_config(None).await.unwrap();
    drop(guard);
    assert!(reopened.server_guard_config(Some(1)).await.is_err());
    let b = service
        .current_binding(bindings[0].account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    assert_eq!(b, bindings[0]);
    // A different universe colliding on account names must leave no partial world.
    assert!(
        store
            .bootstrap_mvp(UniverseId(Uuid::new_v4()), 1000, &accounts, &secret)
            .await
            .is_err()
    );
    assert_eq!(store.universes().await.unwrap(), vec![u]);
    // Inject a database failure after identities and body allocation, inside the transaction.
    sqlx::raw_sql("CREATE FUNCTION fail_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER fail_bootstrap BEFORE INSERT ON building_levels FOR EACH ROW EXECUTE FUNCTION fail_bootstrap();").execute(&pool).await.unwrap();
    let other = std::array::from_fn(|i| MvpAccount {
        name: format!("other{i}"),
        password: Uuid::new_v4().to_string(),
    });
    assert!(
        store
            .bootstrap_mvp(UniverseId(Uuid::new_v4()), 1000, &other, &secret)
            .await
            .is_err()
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM accounts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        5
    );
    assert_eq!(store.universes().await.unwrap(), vec![u]);
    sqlx::raw_sql(
        "DROP TRIGGER fail_bootstrap ON building_levels; DROP FUNCTION fail_bootstrap();",
    )
    .execute(&pool)
    .await
    .unwrap();
}

// Reintroducing the startup audit or an existing-world provisioning gate must fail this test.
#[tokio::test]
async fn restart_checks_metadata_without_gameplay_locks_or_reads() {
    use orbit_engine::UniverseOptions;
    use std::time::Duration;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    store
        .ensure_signup_universe(Some(u), UniverseOptions::default(), None)
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM universes WHERE id=$1 FOR UPDATE")
        .bind(u.0)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::raw_sql("LOCK TABLE players, bodies, inventories, commands, scheduled_events, asset_lots, transition_journal IN ACCESS EXCLUSIVE MODE").execute(&mut *tx).await.unwrap();
    let result = tokio::time::timeout(Duration::from_millis(500), async {
        let guard = store.server_guard_config(None).await?;
        store
            .ensure_signup_universe(Some(u), UniverseOptions::default(), None)
            .await?;
        store.ready().await?;
        Ok::<_, StoreError>(guard)
    })
    .await;
    tx.rollback().await.unwrap();
    drop(
        result
            .expect("startup waited for gameplay data/locks")
            .unwrap(),
    );
}

#[tokio::test]
async fn empty_world_missing_required_state_refuses_readiness_without_repair() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    store
        .ensure_signup_universe(Some(u), Default::default(), None)
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    for table in ["world_heads", "universe_runtime", "mvp_bootstraps"] {
        let mut tx = pool.begin().await.unwrap();
        let saved: serde_json::Value = sqlx::query_scalar(&format!(
            "SELECT to_jsonb(t) FROM {table} t WHERE universe=$1"
        ))
        .bind(u.0)
        .fetch_one(&mut *tx)
        .await
        .unwrap();
        sqlx::query(&format!("DELETE FROM {table} WHERE universe=$1"))
            .bind(u.0)
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.commit().await.unwrap();
        let ready = store.ready().await;
        let guard = store.server_guard_config(None).await;
        let remaining: i64 =
            sqlx::query_scalar(&format!("SELECT count(*) FROM {table} WHERE universe=$1"))
                .bind(u.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        sqlx::query(&format!(
            "INSERT INTO {table} SELECT * FROM jsonb_populate_record(NULL::{table}, $1)"
        ))
        .bind(saved)
        .execute(&pool)
        .await
        .unwrap();
        assert!(ready.is_err(), "{table} missing must refuse readiness");
        assert!(guard.is_err(), "{table} missing must refuse startup");
        assert_eq!(remaining, 0, "restart must not repair {table}");
    }
    store.prepare_scoped_runtime(u, 10).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    sqlx::query("DELETE FROM world_heads WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    drop(
        store
            .server_guard_config(None)
            .await
            .expect("scoped runtime has no global world head"),
    );
    let sequence = format!("orbit_order_{}", u.0.simple());
    sqlx::query(&format!("DROP SEQUENCE {sequence}"))
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store.ready().await.is_err(),
        "missing scoped ordinal authority must fail readiness"
    );
    sqlx::query(&format!("CREATE SEQUENCE {sequence}"))
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn explicit_audit_finds_latent_corruption_without_gameplay_lock_or_repair() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let policy = store
        .ensure_signup_universe(Some(u), Default::default(), None)
        .await
        .unwrap();
    let session = store
        .register(Registration {
            name: Uuid::new_v4().to_string(),
            password_hash: "!fixture-only".into(),
            policy,
            digest: Uuid::new_v4().to_string(),
            csrf: "fixture".into(),
            previous: None,
        })
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM universes WHERE id=$1 FOR UPDATE")
        .bind(u.0)
        .execute(&mut *tx)
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(1), store.audit_universe(u))
        .await
        .expect("audit took gameplay gate")
        .unwrap();
    tx.rollback().await.unwrap();
    sqlx::query("DELETE FROM collection_heads WHERE universe=$1 AND kind='production'")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    // Readiness is a compatibility check; consuming corrupt facts and explicit audit fail closed.
    store.ready().await.unwrap();
    assert!(store.audit_universe(u).await.is_err());
    assert!(
        store
            .load_view(Actor::Player(session.memberships[0].player), u)
            .await
            .is_err()
    );
    let remaining: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM collection_heads WHERE universe=$1 AND kind='production'",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(remaining, 0);
}

#[tokio::test]
async fn audit_does_not_certify_unexamined_legacy_gameplay() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("audit-legacy-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp(u, 1000, &accounts, &[45; 32])
        .await
        .unwrap();
    assert!(
        store.audit_universe(u).await.is_err(),
        "legacy gameplay was not audited"
    );
}

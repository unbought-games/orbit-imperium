use orbit_application::*;
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;

async fn fresh() -> (PgStore, PgPool) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&pool)
        .await
        .unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    (store, pool)
}

async fn facts(pool: &PgPool) -> serde_json::Value {
    sqlx::query_scalar("SELECT jsonb_build_object('worlds',(SELECT jsonb_agg(to_jsonb(u)) FROM universes u),'bootstrap',(SELECT jsonb_agg(to_jsonb(b)) FROM mvp_bootstraps b),'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM universe_policies_v2 p),'audit',(SELECT jsonb_agg(to_jsonb(a)) FROM universe_policy_changes a),'accounts',(SELECT jsonb_agg(to_jsonb(a)) FROM accounts a),'bodies',(SELECT jsonb_agg(to_jsonb(b)) FROM bodies b))")
        .fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn concurrent_default_setup_creates_one_world_and_reuses_its_identity() {
    let (store, pool) = fresh().await;
    let request = UniverseSetup::default();
    let (a, b) = tokio::join!(
        store.setup_universe(&request),
        store.setup_universe(&request)
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_eq!(a.universe, b.universe);
    assert_ne!(a.status, b.status);
    assert!([a.status, b.status].contains(&"created"));
    assert!([a.status, b.status].contains(&"already_initialized"));
    assert_eq!(a.configuration.immutable, UniverseImmutable::default());
    assert_eq!(a.configuration.policy, UniversePolicy::default());
    assert_eq!(a.name, "Andromeda");
    let rules = store.load_rules(a.universe).await.unwrap();
    for key in [
        orbit_engine::CatalogKey::Ship(orbit_engine::ShipType::LargeCargo),
        orbit_engine::CatalogKey::Ship(orbit_engine::ShipType::SolarSatellite),
        orbit_engine::CatalogKey::Defense(orbit_engine::DefenseId::HeavyLaser),
        orbit_engine::CatalogKey::Defense(orbit_engine::DefenseId::GaussCannon),
    ] {
        assert!(
            rules
                .artifact
                .catalog
                .iter()
                .any(|entry| entry.key == key && entry.enabled)
        );
    }
    assert!(
        RulesService::new(store.clone())
            .prepare_upgrade(a.universe)
            .await
            .unwrap()
            .diff
            .changes
            .is_empty()
    );
    let before = facts(&pool).await;
    store.migrate().await.unwrap();
    assert_eq!(
        store.setup_universe(&request).await.unwrap().status,
        "already_initialized"
    );
    assert_eq!(facts(&pool).await, before);
}

#[tokio::test]
async fn retries_preserve_players_secrets_rules_and_live_policy_and_reject_conflicts() {
    let (store, pool) = fresh().await;
    let request = UniverseSetup {
        universe: Some(Uuid::new_v4().into()),
        name: Some("Friends".into()),
        speed: Some(3),
        ..Default::default()
    };
    let result = store.setup_universe(&request).await.unwrap();
    let universe = result.universe;
    assert_eq!(result.name, "Friends");
    assert_eq!(result.configuration.immutable.speed, 3);
    store
        .register(Registration {
            name: "friend".into(),
            password_hash: "fixture".into(),
            policy: SignupPolicy {
                universe,
                max_players: 100,
            },
            digest: "setup-test-session".into(),
            csrf: "csrf".into(),
            previous: None,
        })
        .await
        .unwrap();
    let mut config = result.configuration;
    config.policy.signup_enabled = false;
    config.policy.max_players = Some(10);
    store.apply_universe_config(&config).await.unwrap();
    let before = facts(&pool).await;
    let retried = store.setup_universe(&request).await.unwrap();
    assert_eq!(retried.configuration.base_revision, 1);
    assert!(!retried.configuration.policy.signup_enabled);
    assert_eq!(
        store
            .setup_universe(&UniverseSetup::default())
            .await
            .unwrap()
            .universe,
        universe
    );
    for request in [
        UniverseSetup {
            speed: Some(5),
            ..Default::default()
        },
        UniverseSetup {
            name: Some("Other".into()),
            ..Default::default()
        },
        UniverseSetup {
            galaxies: Some(2),
            ..Default::default()
        },
        UniverseSetup {
            signup_enabled: Some(true),
            ..Default::default()
        },
        UniverseSetup {
            max_players: Some(11),
            ..Default::default()
        },
        UniverseSetup {
            signup_per_minute: Some(6),
            ..Default::default()
        },
        UniverseSetup {
            commands_per_minute: Some(61),
            ..Default::default()
        },
    ] {
        assert!(
            store
                .setup_universe(&request)
                .await
                .unwrap_err()
                .contains("conflicts")
        );
    }
    assert_eq!(facts(&pool).await, before);
    assert!(
        store
            .lookup_session("setup-test-session")
            .await
            .unwrap()
            .is_some()
    );
}

#[tokio::test]
async fn selection_is_explicit_with_multiple_worlds_and_never_creates_an_extra_world() {
    let (store, pool) = fresh().await;
    let first = store
        .setup_universe(&UniverseSetup::default())
        .await
        .unwrap();
    let second = UniverseSetup {
        universe: Some(Uuid::new_v4().into()),
        ..Default::default()
    };
    assert!(
        store
            .setup_universe(&second)
            .await
            .unwrap_err()
            .contains("nonempty")
    );
    store
        .create_universe(&second.creation(second.universe.unwrap()))
        .await
        .unwrap();
    let before = facts(&pool).await;
    assert!(
        store
            .setup_universe(&UniverseSetup::default())
            .await
            .unwrap_err()
            .contains("multiple")
    );
    let explicit = UniverseSetup {
        universe: Some(first.universe),
        ..Default::default()
    };
    assert_eq!(
        store.setup_universe(&explicit).await.unwrap().universe,
        first.universe
    );
    assert_eq!(facts(&pool).await, before);
    // Simulate a retained world predating policy initialization, including its audit FK.
    sqlx::query("DELETE FROM universe_policy_changes WHERE universe=$1")
        .bind(first.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM universe_policies_v2 WHERE universe=$1")
        .bind(first.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .setup_universe(&explicit)
            .await
            .unwrap_err()
            .contains("bridge")
    );
}

#[tokio::test]
async fn failed_naming_rolls_back_the_entire_world_and_can_be_retried() {
    let (store, pool) = fresh().await;
    sqlx::raw_sql("CREATE FUNCTION reject_setup_name() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_setup_name BEFORE UPDATE OF name ON universes FOR EACH ROW EXECUTE FUNCTION reject_setup_name()")
        .execute(&pool).await.unwrap();
    let request = UniverseSetup {
        name: Some("Friends".into()),
        ..Default::default()
    };
    assert!(store.setup_universe(&request).await.is_err());
    let counts: (i64,i64,i64,i64,i64) = sqlx::query_as("SELECT (SELECT count(*) FROM universes),(SELECT count(*) FROM universe_policies_v2),(SELECT count(*) FROM universe_policy_changes),(SELECT count(*) FROM mvp_bootstraps),(SELECT count(*) FROM world_heads)")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (0, 0, 0, 0, 0));
    sqlx::query("DROP TRIGGER reject_setup_name ON universes")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        store.setup_universe(&request).await.unwrap().name,
        "Friends"
    );
}

#[tokio::test]
async fn ordinary_world_access_is_independent_of_the_universe_name_lock() {
    let (store, pool) = fresh().await;
    let world = store
        .setup_universe(&UniverseSetup::default())
        .await
        .unwrap();
    let mut name_allocator = pool.begin().await.unwrap();
    // This is the existing bigint key used by assign_universe_name(). It must
    // not overlap the new shared editor gate used by ordinary transactions.
    sqlx::query("SELECT pg_advisory_xact_lock(901330)")
        .execute(&mut *name_allocator)
        .await
        .unwrap();
    let summary = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        store.universe_summary(world.universe),
    )
    .await
    .expect("ordinary world access must not wait for name allocation")
    .unwrap();
    assert_eq!(summary.universe, world.universe);
    assert_eq!(summary.name, world.name);
    name_allocator.rollback().await.unwrap();
}

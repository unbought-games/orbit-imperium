use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;

async fn create(store: &PgStore) -> UniverseId {
    let universe = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe,
            immutable: UniverseImmutable::default(),
            policy: UniversePolicy::default(),
        })
        .await
        .unwrap();
    universe
}

async fn speed_cutover(scoped: bool) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let u = create(&store).await;
    let other = create(&store).await;
    let other_rules = store.load_rules(other).await.unwrap();
    let auth = SessionService::new(store.clone())
        .signup(
            &format!("speed{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 900,
            },
            None,
        )
        .await
        .unwrap();
    let binding = GameService::new(store.clone())
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    if scoped {
        store.prepare_scoped_runtime(u, 1).await.unwrap();
        store.activate_scoped_runtime(u).await.unwrap();
    }
    let policy_before = store.universe_config(u).await.unwrap();
    let service = RulesService::new(store.clone());
    let before = service.export(u).await.unwrap();
    assert_eq!(before.speed, 5);
    let mut next = before.clone();
    next.speed = 3;
    store.set_test_time(3_601_000).await.unwrap();

    // Fail after resources, canonical speed and hash have been staged. Every
    // effect must roll back together; scoped mode retains its retryable barrier.
    sqlx::raw_sql("CREATE FUNCTION fail_speed_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test speed activation failure'; END $$; CREATE TRIGGER fail_speed_activation BEFORE INSERT ON rules_activations FOR EACH ROW EXECUTE FUNCTION fail_speed_activation();")
        .execute(&pool).await.unwrap();
    assert!(service.apply(&next).await.is_err());
    sqlx::raw_sql("DROP TRIGGER fail_speed_activation ON rules_activations; DROP FUNCTION fail_speed_activation();")
        .execute(&pool).await.unwrap();
    assert_eq!(service.export(u).await.unwrap().speed, 5);
    assert_eq!(store.universe_config(u).await.unwrap().immutable.speed, 5);
    let checkpoint: (i64, serde_json::Value) =
        sqlx::query_as("SELECT checkpoint_at,amounts FROM bodies WHERE owner=$1")
            .bind(binding.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(checkpoint.0, 1000);
    assert_eq!(checkpoint.1["metal"], 1000 * SCALE);
    drop(store.server_guard_config(None).await.unwrap());

    let applied = service.apply(&next).await.unwrap();
    assert!(matches!(
        applied,
        RulesApplyOutcome::Applied {
            revision: 1,
            effective_at: 3_601_000,
            ..
        }
    ));
    let current = store.load_rules(u).await.unwrap();
    assert_eq!(current.speed, 3);
    assert_eq!(current.artifact, before.artifact.clone());
    let checkpoint: (i64, serde_json::Value) =
        sqlx::query_as("SELECT checkpoint_at,amounts FROM bodies WHERE owner=$1")
            .bind(binding.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(checkpoint.0, 3_601_000);
    assert_eq!(checkpoint.1["metal"], 1150 * SCALE, "first hour uses 5×");
    assert_eq!(checkpoint.1["crystal"], 1075 * SCALE);
    assert!(matches!(
        service.apply(&next).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { revision: 1, .. }
    ));
    assert!(matches!(
        service.apply(&before).await,
        Err(RulesUpdateError::Stale { .. })
    ));
    let activation: (String, String, i64) = sqlx::query_as(
        "SELECT previous_hash,next_hash,effective_at FROM rules_activations WHERE universe=$1",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        activation.0,
        Ruleset::from_artifact(before.artifact.clone(), 5)
            .unwrap()
            .hash
            .0
    );
    assert_eq!(activation.1, current.hash.0);
    assert_eq!(activation.2, 3_601_000);
    let policy_after = store.universe_config(u).await.unwrap();
    assert_eq!(policy_after.immutable.speed, 3);
    assert_eq!(policy_after.policy, policy_before.policy);
    assert_eq!(policy_after.base_revision, policy_before.base_revision);
    assert!(
        store
            .apply_universe_config(&policy_before)
            .await
            .unwrap_err()
            .contains("immutable.speed")
    );

    let restarted = PgStore::connect(&url).await.unwrap();
    drop(restarted.server_guard_config(None).await.unwrap());
    restarted.set_test_time(7_201_000).await.unwrap();
    let (snapshot, _) = restarted.bound_world(binding).await.unwrap().facts;
    let body = snapshot
        .state
        .bodies
        .values()
        .find(|b| b.owner == binding.player)
        .unwrap();
    let settled = settle_economy(body, 7_201_000, &snapshot.rules).unwrap();
    assert_eq!(settled.amounts.metal, 1240 * SCALE, "second hour uses 3×");
    assert_eq!(settled.amounts.crystal, 1120 * SCALE);
    assert_eq!(snapshot.state.epoch, binding.epoch);
    assert_eq!(restarted.load_rules(other).await.unwrap(), other_rules);
    restarted.audit_universe(u).await.unwrap();
    pool.close().await;
}

#[tokio::test]
async fn serial_speed_cutover_is_atomic_and_survives_restart() {
    speed_cutover(false).await;
}

#[tokio::test]
async fn scoped_speed_cutover_is_atomic_and_survives_restart() {
    speed_cutover(true).await;
}

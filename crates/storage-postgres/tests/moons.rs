use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::json;
use uuid::Uuid;

// Regression: creation used to pass through colony persistence, could overwrite
// the planet slot, and had no atomic owned-body membership/report delivery.
#[tokio::test]
async fn simultaneous_battles_create_one_moon_with_atomic_restart_and_view_delivery() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let now = 1_790_000_000_000;
    store.set_test_time(now).await.unwrap();
    let document: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"moon-attacker","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"moon-owner","password":"password","planet":"1:1:9"},
        {"op":"set","user":"moon-attacker","planet":"1:1:8","ships":{"EspionageProbe":4000}},
        {"op":"set","user":"moon-owner","planet":"1:1:9","defenses":{"RocketLauncher":2000}},
        {"op":"attack","user":"moon-attacker","from":"1:1:8","planet":"1:1:9","ships":{"EspionageProbe":2000},"arrives_in":"1s"},
        {"op":"attack","user":"moon-attacker","from":"1:1:8","planet":"1:1:9","ships":{"EspionageProbe":2000},"arrives_in":"1s"}
    ]})).unwrap();
    store
        .apply_world_scenario(u, &document, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    assert!(
        store
            .load_rules(u)
            .await
            .unwrap()
            .artifact
            .world
            .as_ref()
            .unwrap()
            .moons
    );
    let game = GameService::new(store.clone());
    let auth = SessionService::new(store.clone())
        .login("moon-owner", "password", None)
        .await
        .unwrap();
    let binding = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let principal = Principal {
        account: binding.account,
        player: binding.player,
        universe: u,
    };
    let context = || QueryContext {
        binding,
        request_id: Uuid::new_v4(),
    };
    let before = game.world_view(principal, context()).await.unwrap();
    let parent = before.progression.bodies[0].id;
    let input: serde_json::Value = sqlx::query_scalar("SELECT input FROM scheduled_events WHERE universe=$1 AND NOT done ORDER BY at_ms,sequence LIMIT 1")
        .bind(u.0).fetch_one(&pool).await.unwrap();
    let input: OrderedInput = serde_json::from_value(input).unwrap();
    // Fix the mechanism fixture using its known independent creation stream.
    let secret = (0..=255u8)
        .map(|b| [b; 32])
        .find(|secret| {
            RandomStream::new(secret, u, binding.epoch, input.id, "moon-create")
                .unwrap()
                .uniform_u64(100)
                .unwrap()
                < 6
        })
        .unwrap();
    sqlx::query("UPDATE mvp_bootstraps SET secret=$2 WHERE universe=$1")
        .bind(u.0)
        .bind(secret.as_slice())
        .execute(&pool)
        .await
        .unwrap();
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    store.set_test_time(now + 1000).await.unwrap();
    let claim = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(claim.input.id, input.id);
    // Same location cannot be independently claimed while its first battle owns it.
    assert!(
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .is_none()
    );
    let snapshot = store.load_scoped(&claim).await.unwrap();
    let result = transition(&snapshot.state, &claim.input, &snapshot.rules);
    let TransitionResult::Applied(ref changes) = result else {
        panic!("{result:?}")
    };
    let moon = changes
        .bodies
        .iter()
        .find(|b| b.kind == BodyKind::Moon)
        .unwrap()
        .id;
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text NOT NULL,enabled boolean NOT NULL,seen bigint NOT NULL DEFAULT 0); INSERT INTO orbit_test_fault VALUES('after_writes','error',true,0)").execute(&pool).await.unwrap();
    assert!(matches!(
        store.commit_scoped(&claim, result.clone()).await,
        Err(StoreError::Unavailable)
    ));
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM bodies WHERE universe=$1 AND kind='Moon'")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0, "a failed transaction must not publish a moon");
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM mission_reports WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "a failed transaction must not publish reports");
    let reopened = PgStore::connect(&url).await.unwrap();
    let reloaded = reopened.load_scoped(&claim).await.unwrap();
    assert_eq!(
        hash(&result),
        hash(&transition(&reloaded.state, &claim.input, &reloaded.rules))
    );
    sqlx::raw_sql("DELETE FROM orbit_test_fault; INSERT INTO orbit_test_fault VALUES('after_commit','error',true,0)").execute(&pool).await.unwrap();
    assert!(matches!(
        reopened.commit_scoped(&claim, result.clone()).await,
        Err(StoreError::Unavailable)
    ));
    assert!(matches!(
        reopened.commit_scoped(&claim, result).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    sqlx::query("DROP TABLE orbit_test_fault")
        .execute(&pool)
        .await
        .unwrap();
    let second = reopened
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = reopened.load_scoped(&second).await.unwrap();
    assert!(snapshot.state.bodies.contains_key(&moon));
    let result = transition(&snapshot.state, &second.input, &snapshot.rules);
    let TransitionResult::Applied(ref changes) = result else {
        panic!("{result:?}")
    };
    assert!(
        !changes
            .world
            .as_ref()
            .unwrap()
            .audits
            .iter()
            .any(|a| a["kind"] == "MoonCreation")
    );
    reopened.commit_scoped(&second, result).await.unwrap();
    let restored = GameService::new(reopened.clone());
    let view = restored.world_view(principal, context()).await.unwrap();
    assert!(view.has_unread_reports);
    assert_ne!(
        view.progression.viewer_revision,
        before.progression.viewer_revision
    );
    assert_eq!(view.progression.bodies.len(), 2);
    assert_eq!(view.progression.bodies[0].id, parent);
    let m = &view.progression.bodies[1];
    assert_eq!(m.id, moon);
    assert_eq!(m.moon.as_ref().unwrap().parent, parent);
    assert!(m.diameter_km.is_some());
    assert!(m.max_temperature.is_none());
    assert!(m.silo.is_none());
    assert_eq!(m.amounts.metal, "0");
    assert_eq!(m.fields, 1);
    assert_eq!(m.fields_used, 0);
    let galaxy = restored
        .world_query(
            principal,
            WorldQuery {
                context: context(),
                query: WorldQueryKind::Galaxy {
                    galaxy: 1,
                    system: 1,
                },
            },
        )
        .await
        .unwrap();
    assert_eq!(
        galaxy.data["positions"][8]["body"]["id"],
        parent.to_string()
    );
    assert_eq!(galaxy.data["positions"][8]["moon"]["id"], moon.to_string());
    assert_eq!(galaxy.data["positions"][8]["debris"]["crystal"], "1200000");
    let notices: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM mission_reports WHERE universe=$1 AND kind='MoonCreated'",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(notices, 1);
    reopened.set_test_time(now + 86_400_000).await.unwrap();
    let later = restored.world_view(principal, context()).await.unwrap();
    let m = later
        .progression
        .bodies
        .iter()
        .find(|b| b.id == moon)
        .unwrap();
    assert_eq!(m.amounts.metal, "0");
    assert_eq!(m.amounts.crystal, "0");
    assert_eq!(m.amounts.deuterium, "0");
    reopened.audit_universe(u).await.unwrap();
}

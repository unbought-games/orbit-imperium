use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::{Value, json};
use uuid::Uuid;
fn document(edits: Value) -> WorldScenario {
    serde_json::from_value(json!({"version":1,"edits":edits})).unwrap()
}
async fn fresh() -> (PgStore, sqlx::PgPool) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&pool)
        .await
        .unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1_790_000_000_000).await.unwrap();
    (store, pool)
}
async fn world(store: &PgStore) -> UniverseId {
    let u = UniverseId(Uuid::new_v4());
    let doc: WorldScenario =
        serde_json::from_str(include_str!("../../../scenarios/playground.json")).unwrap();
    store
        .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    u
}

#[tokio::test]
async fn automatic_bot_batches_grow_existing_neighborhoods_without_rewriting_homes_or_rules() {
    let (store, pool) = fresh().await;
    let u = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe: u,
            immutable: UniverseImmutable {
                galaxies: 5,
                systems_per_galaxy: 100,
                ..Default::default()
            },
            policy: UniversePolicy::default(),
        })
        .await
        .unwrap();
    let rules_before = store.load_rules(u).await.unwrap();
    sqlx::query("UPDATE mvp_bootstraps SET secret=$2 WHERE universe=$1")
        .bind(u.0)
        .bind(&[7u8; 32][..])
        .execute(&pool)
        .await
        .unwrap();
    let original: Vec<_> = (0..20)
        .map(|n| {
            json!({
                "op":"add-bot", "user":format!("original-{n}"),
                "planet":format!("1:{}:{}", 40+n/5, 4+n%5),
            })
        })
        .collect();
    store
        .apply_world_scenario(
            u,
            &document(json!(original)),
            ScenarioMode::Patch,
            Uuid::new_v4(),
        )
        .await
        .unwrap();
    let before: Vec<(Uuid, i32, i32, i32, i32)> = sqlx::query_as(
        "SELECT id,galaxy,system,position,max_temperature FROM bodies WHERE universe=$1 ORDER BY id",
    ).bind(u.0).fetch_all(&pool).await.unwrap();
    let batch: Vec<_> = (0..40)
        .map(|n| json!({"op":"add-bot", "user":format!("arrival-{n}")}))
        .collect();
    let operation = Uuid::new_v4();
    let patch = document(json!(batch));
    let result = store
        .apply_world_scenario(u, &patch, ScenarioMode::Patch, operation)
        .await
        .unwrap();
    assert_eq!(
        result,
        store
            .apply_world_scenario(u, &patch, ScenarioMode::Patch, operation)
            .await
            .unwrap()
    );
    let after: Vec<(Uuid, i32, i32, i32, i32)> = sqlx::query_as(
        "SELECT id,galaxy,system,position,max_temperature FROM bodies WHERE universe=$1 ORDER BY id",
    ).bind(u.0).fetch_all(&pool).await.unwrap();
    assert_eq!(after.len(), 60);
    assert!(before.iter().all(|body| after.contains(body)));
    assert!(after.iter().all(|body| body.1 == 1));
    let span =
        after.iter().map(|b| b.2).max().unwrap() - after.iter().map(|b| b.2).min().unwrap() + 1;
    assert!((24..=30).contains(&span), "span {span}");
    assert_eq!(store.load_rules(u).await.unwrap(), rules_before);
    // Restart-style inspection validates the mixed historical and new creation facts.
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    reopened.inspect_world(u, None, None).await.unwrap();
}

#[tokio::test]
async fn explicit_homeworld_overrides_work_after_galaxy_one_fills() {
    let (store, pool) = fresh().await;
    let u = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe: u,
            immutable: UniverseImmutable {
                galaxies: 2,
                systems_per_galaxy: 1,
                ..Default::default()
            },
            policy: UniversePolicy::default(),
        })
        .await
        .unwrap();
    let homes: Vec<_> = (4..=12).map(|position| json!({
        "op":"add-bot", "user":format!("full-{position}"), "planet":format!("1:1:{position}")
    })).collect();
    store
        .apply_world_scenario(
            u,
            &document(json!(homes)),
            ScenarioMode::Patch,
            Uuid::new_v4(),
        )
        .await
        .unwrap();
    let automatic = document(json!([{"op":"add-bot", "user":"automatic-full"}]));
    assert!(
        store
            .apply_world_scenario(u, &automatic, ScenarioMode::Patch, Uuid::new_v4())
            .await
            .is_err()
    );
    let explicit = document(json!([
        {"op":"add-player", "user":"explicit-home", "password":"password", "planet":"2:1:4"},
        {"op":"add-bot", "user":"near-home", "from":"2:1:4"}
    ]));
    store
        .apply_world_scenario(u, &explicit, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    let locations: Vec<(i32, i32, i32)> = sqlx::query_as(
        "SELECT galaxy,system,position FROM bodies WHERE universe=$1 ORDER BY galaxy,system,position",
    ).bind(u.0).fetch_all(&pool).await.unwrap();
    let expected: Vec<_> = (4..=12)
        .map(|p| (1, 1, p))
        .chain([(2, 1, 4), (2, 1, 5)])
        .collect();
    assert_eq!(locations, expected);
    assert!(
        store
            .find_credentials("automatic-full")
            .await
            .unwrap()
            .is_none()
    );
    let occupied = document(json!([{"op":"add-bot", "user":"collision", "planet":"2:1:4"}]));
    assert!(
        store
            .apply_world_scenario(u, &occupied, ScenarioMode::Patch, Uuid::new_v4())
            .await
            .is_err()
    );
    assert!(store.find_credentials("collision").await.unwrap().is_none());
}

#[tokio::test]
async fn rich_playground_is_playable_atomic_and_retryable() {
    let (store, pool) = fresh().await;
    let u = world(&store).await;
    let login = SessionService::new(store.clone())
        .login("user", "password", None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let initial = game
        .initial_game(&login.session, Uuid::new_v4())
        .await
        .unwrap()
        .unwrap();
    let binding = initial.candidate.binding;
    let facts = store.bound_world(binding).await.unwrap();
    // Generated delivery examples must be readable through the same contract
    // as real deliveries. UUID origins previously broke the entire HUD inbox.
    let reports: Vec<sqlx::types::Json<MissionReport>> = sqlx::query_scalar(
        "SELECT data FROM mission_reports WHERE universe=$1 AND kind='Delivered'",
    )
    .bind(u.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    let deliveries: Vec<_> = reports
        .iter()
        .flat_map(|report| report.payloads.values())
        .collect();
    assert!(!deliveries.is_empty());
    for payload in deliveries {
        for field in ["origin", "target"] {
            serde_json::from_value::<Coordinates>(payload[field].clone()).unwrap();
        }
        for field in ["sender", "recipient"] {
            serde_json::from_value::<PlayerId>(payload[field].clone()).unwrap();
        }
        assert_eq!(report_preview(payload)["origin"], payload["origin"]);
        assert_eq!(report_preview(payload)["cargo"], payload["cargo"]);
    }
    assert_eq!(
        facts
            .facts
            .0
            .state
            .bodies
            .values()
            .filter(|b| b.owner == binding.player)
            .count(),
        8
    );
    let bots: i64 = sqlx::query_scalar("SELECT count(*) FROM bot_participation")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(bots, 16);
    let before = store.inspect_world(u, Some("user"), None).await.unwrap();
    let bad = document(
        json!([{"op":"set","user":"user","planet":"1:50:8","ships":{"cruiser":1001}},{"op":"set","user":"rival","research":{"notaresearch":1}}]),
    );
    assert!(
        store
            .apply_world_scenario(u, &bad, ScenarioMode::Patch, Uuid::new_v4())
            .await
            .unwrap_err()
            .to_string()
            .contains("edits[1]")
    );
    assert_eq!(
        before,
        store.inspect_world(u, Some("user"), None).await.unwrap()
    );
    let patch = document(
        json!([{"op":"give","user":"user","planet":"1:50:8","ships":{"cRuIsEr":10}},{"op":"set","user":"rival","research":{"COMPUTERTECHNOLOGY":12}}]),
    );
    let id = Uuid::new_v4();
    let result = store
        .apply_world_scenario(u, &patch, ScenarioMode::Patch, id)
        .await
        .unwrap();
    assert_eq!(
        result,
        store
            .apply_world_scenario(u, &patch, ScenarioMode::Patch, id)
            .await
            .unwrap()
    );
    let facts = store.bound_world(binding).await.unwrap();
    let state = &facts.facts.0.state;
    let home = state
        .bodies
        .values()
        .find(|b| b.coordinates.system == 50 && b.coordinates.position == 8)
        .unwrap();
    assert_eq!(
        state
            .inventories
            .iter()
            .find(|x| x.body == home.id && x.item == ManufacturedItem::Ship(ShipType::Cruiser))
            .unwrap()
            .count,
        30
    );
    validate_completed_assets(state).unwrap();
    let mixed = document(
        json!([{"op":"set","user":"user","planet":"1:53:8","buildings":{"metalmine":13},"ships":{"lightfighter":0,"smallcargo":101}}]),
    );
    store
        .apply_world_scenario(u, &mixed, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    let mut lots = store
        .bound_world(binding)
        .await
        .unwrap()
        .facts
        .0
        .state
        .world
        .unwrap()
        .records
        .lots;
    combine_asset_quantities(&mut lots).unwrap();
    let wrong =
        document(json!([{"op":"set","user":"rival","planet":"1:50:8","ships":{"cruiser":5}}]));
    assert!(
        store
            .apply_world_scenario(u, &wrong, ScenarioMode::Patch, Uuid::new_v4())
            .await
            .is_err()
    );
}
#[tokio::test]
async fn queue_controls_and_scoped_edits_preserve_world_invariants() {
    let (store, _) = fresh().await;
    let u = world(&store).await;
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    for planet in ["1:50:8", "1:51:8", "1:52:8"] {
        store
            .apply_world_scenario(
                u,
                &document(json!([{"op":"finish","planet":planet}])),
                ScenarioMode::Patch,
                Uuid::new_v4(),
            )
            .await
            .unwrap();
    }
    let auth = SessionService::new(store.clone())
        .login("user", "password", None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let view = store.bound_world(binding).await.unwrap();
    validate_completed_assets(&view.facts.0.state).unwrap();
    let doc = document(
        json!([{"op":"queue","planet":"1:50:8","ships":{"cruiser":5},"arrives_in":"1m"},{"op":"clear","planet":"1:50:8"}]),
    );
    store
        .apply_world_scenario(u, &doc, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    game.initial_game(&auth.session, Uuid::new_v4())
        .await
        .unwrap();
    let spy = document(json!([{"op":"spy","planet":"1:49:4","from":"1:50:8","arrives_in":"1s"}]));
    store
        .apply_world_scenario(u, &spy, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    store.set_test_time(1_790_000_001_500).await.unwrap();
    assert!(matches!(
        game.step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
            .await
            .unwrap(),
        StepOutcome::Committed { .. }
    ));
}
#[tokio::test]
async fn replacement_is_atomic_and_preserves_other_universes() {
    let (store, pool) = fresh().await;
    let u = world(&store).await;
    let other = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseSetup::default().creation(other))
        .await
        .unwrap();
    let invalid = document(
        json!([{"op":"add-player","user":"user","planet":"1:50:8"},{"op":"set","planet":"1:50:8","buildings":{"MetalMine":1000}}]),
    );
    assert!(
        store
            .apply_world_scenario(u, &invalid, ScenarioMode::Replace, Uuid::new_v4())
            .await
            .is_err()
    );
    assert_eq!(
        store.inspect_world(u, Some("user"), None).await.unwrap()["planets"]
            .as_array()
            .unwrap()
            .len(),
        8
    );
    let doc: WorldScenario =
        serde_json::from_str(include_str!("../../../scenarios/playground.json")).unwrap();
    store
        .apply_world_scenario(u, &doc, ScenarioMode::Replace, Uuid::new_v4())
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM universes WHERE id=$1")
        .bind(other.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    SessionService::new(store)
        .login("user", "password", None)
        .await
        .unwrap();
}

#[tokio::test]
async fn editable_export_round_trips_planets_valuation_and_activity() {
    let (store, pool) = fresh().await;
    let u = world(&store).await;
    store.set_test_time(1_790_000_030_000).await.unwrap();
    let due_before:Vec<i64>=sqlx::query_scalar("SELECT (data->>'next_due_at')::bigint FROM manufacturing_batches WHERE universe=$1 AND data->>'status'='Active' ORDER BY queue_sequence").bind(u.0).fetch_all(&pool).await.unwrap();
    let debris = document(json!([
        {"op":"debris", "planet":"1:1:7", "resources":{"metal":100,"crystal":200,"deuterium":300}},
        {"op":"debris", "planet":"1:1:8", "resources":{"deuterium":500}}
    ]));
    store
        .apply_world_scenario(u, &debris, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    let saved = store.export_world_scenario(u).await.unwrap();
    for (coord, amount) in [("1:1:7", 300), ("1:1:8", 500)] {
        let field = saved
            .edits
            .iter()
            .find(|e| e.op == "debris" && e.planet.as_deref() == Some(coord))
            .unwrap();
        assert_eq!(field.resources["deuterium"], amount);
    }
    let serialized = serde_json::to_string(&saved).unwrap();
    assert!(!serialized.contains("password_hash"));
    assert!(!serialized.contains("\"password\""));
    assert!(saved.edits.iter().any(|e| e.op == "report"));
    assert!(saved.edits.iter().any(|e| e.op == "message"));
    assert!(saved.edits.iter().any(|e| e.op == "queue"));
    assert!(saved.edits.iter().any(|e| e.op == "alliance"));
    let before:Vec<(String,i64,i32)>=sqlx::query_as("SELECT galaxy||':'||system||':'||position,fields,max_temperature FROM bodies WHERE universe=$1 ORDER BY galaxy,system,position").bind(u.0).fetch_all(&pool).await.unwrap();
    let value_before: i64 = sqlx::query_scalar(
        "SELECT sum(current_score_micro)::bigint FROM players WHERE universe=$1",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    store
        .apply_world_scenario(u, &saved, ScenarioMode::Replace, Uuid::new_v4())
        .await
        .unwrap();
    let restored = store.export_world_scenario(u).await.unwrap();
    for original in saved.edits.iter().filter(|e| e.op == "debris") {
        let field = restored
            .edits
            .iter()
            .find(|e| e.op == "debris" && e.planet == original.planet)
            .unwrap();
        assert_eq!(field.resources, original.resources);
    }
    let after:Vec<(String,i64,i32)>=sqlx::query_as("SELECT galaxy||':'||system||':'||position,fields,max_temperature FROM bodies WHERE universe=$1 ORDER BY galaxy,system,position").bind(u.0).fetch_all(&pool).await.unwrap();
    assert_eq!(before, after);
    let due_after:Vec<i64>=sqlx::query_scalar("SELECT (data->>'next_due_at')::bigint FROM manufacturing_batches WHERE universe=$1 AND data->>'status'='Active' ORDER BY queue_sequence").bind(u.0).fetch_all(&pool).await.unwrap();
    assert_eq!(due_before, due_after);
    let value_after: i64 = sqlx::query_scalar(
        "SELECT sum(current_score_micro)::bigint FROM players WHERE universe=$1",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(value_before, value_after);
    let auth = SessionService::new(store.clone())
        .login("user", "password", None)
        .await
        .unwrap();
    GameService::new(store)
        .initial_game(&auth.session, Uuid::new_v4())
        .await
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn concurrent_multi_user_edits_publish_normal_updates() {
    let (store, pool) = fresh().await;
    let u = UniverseId(Uuid::new_v4());
    let initial = document(
        json!([{"op":"add-player","user":"alice","password":"password","planet":"1:1:8"},{"op":"add-player","user":"bob","password":"password","planet":"1:2:8"}]),
    );
    store
        .apply_world_scenario(u, &initial, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let auth = SessionService::new(store.clone())
        .login("alice", "password", None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let page = store.read_updates(binding, None, 128).await.unwrap();
    let cursor = page.items[0].cursor.clone();
    let a = document(
        json!([{"op":"give","planet":"1:1:8","resources":{"METAL":100}},{"op":"set","user":"bob","research":{"astrophysics":3}}]),
    );
    let b = document(
        json!([{"op":"give","user":"alice","all_planets":true,"resources":{"metal":200}}]),
    );
    let (first, second) = tokio::join!(
        store.apply_world_scenario(u, &a, ScenarioMode::Patch, Uuid::new_v4()),
        store.apply_world_scenario(u, &b, ScenarioMode::Patch, Uuid::new_v4())
    );
    first.unwrap();
    second.unwrap();
    let metal:i64=sqlx::query_scalar("SELECT (amounts->>'metal')::bigint FROM bodies WHERE universe=$1 AND galaxy=1 AND system=1 AND position=8").bind(u.0).fetch_one(&pool).await.unwrap();
    assert_eq!(metal, 1300 * SCALE);
    let updates = store
        .read_updates(binding, cursor.as_deref(), 128)
        .await
        .unwrap();
    assert!(
        updates
            .items
            .iter()
            .any(|u| matches!(u.event, StreamEvent::Invalidate { .. }))
    );
    let revision_before: i64 =
        sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
            .bind(u.0)
            .bind(binding.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let message =
        document(json!([{"op":"message","user":"alice","from":"bob","text":"new intelligence"}]));
    store
        .apply_world_scenario(u, &message, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    let revision_after: i64 =
        sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
            .bind(u.0)
            .bind(binding.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(revision_after > revision_before);
    let preserved = store.inspect_world(u, Some("bob"), None).await.unwrap();
    assert_eq!(preserved["players"][0]["research"]["Astrophysics"], 3);
}

#[tokio::test]
async fn mission_user_selects_sender_for_cross_user_batches() {
    let (store, pool) = fresh().await;
    let u = UniverseId(Uuid::new_v4());
    let setup = document(json!([
        {"op":"add-player","user":"alice","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"bob","password":"password","planet":"1:2:8"},
        {"op":"set","user":"alice","planet":"1:1:8","ships":{"lightfighter":3,"espionageprobe":3,"smallcargo":3}}
    ]));
    store
        .apply_world_scenario(u, &setup, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    for op in ["attack", "spy", "transport"] {
        let wrong = document(
            json!([{"op":op,"user":"bob","from":"1:1:8","planet":"1:2:8","arrives_in":"30s"}]),
        );
        let error = store
            .apply_world_scenario(u, &wrong, ScenarioMode::Patch, Uuid::new_v4())
            .await
            .unwrap_err();
        assert!(
            error
                .to_string()
                .contains("origin planet 1:1:8 does not belong"),
            "{error}"
        );
    }
    let fleet_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM mission_fleets WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        fleet_count, 0,
        "wrong-origin user must not launch any fleet"
    );
    let missions = document(json!([
        {"op":"attack","user":"alice","from":"1:1:8","planet":"1:2:8","arrives_in":"30s"},
        {"op":"spy","user":"alice","from":"1:1:8","planet":"1:2:8","arrives_in":"30s"},
        {"op":"transport","user":"alice","from":"1:1:8","planet":"1:2:8","arrives_in":"30s","resources":{"metal":10}}
    ]));
    store
        .apply_world_scenario(u, &missions, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    let fleets:Vec<(String,String,String)>=sqlx::query_as("SELECT sender.name,target.name,f.data->'intent'->>'mission' FROM mission_fleets f JOIN universe_memberships sm ON sm.universe=f.universe AND sm.player=f.owner JOIN accounts sender ON sender.id=sm.account JOIN universe_memberships tm ON tm.universe=f.universe AND tm.player=(f.data->'intent'->'destination'->>'expected_owner')::uuid JOIN accounts target ON target.id=tm.account WHERE f.universe=$1 ORDER BY f.data->'intent'->>'mission'").bind(u.0).fetch_all(&pool).await.unwrap();
    assert_eq!(
        fleets,
        vec![
            ("alice".into(), "bob".into(), "Attack".into()),
            ("alice".into(), "bob".into(), "Espionage".into()),
            ("alice".into(), "bob".into(), "Transport".into())
        ]
    );
}

#[tokio::test]
async fn mission_hashes_and_timing_work_with_defaults_and_overrides() {
    let (store, pool) = fresh().await;
    let u = UniverseId(Uuid::new_v4());
    let setup = document(json!([
        {"op":"add-player","user":"alice","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"bob","password":"password","planet":"1:2:8"},
        {"op":"set","user":"alice","planet":"1:1:8","ships":{"lightfighter":5,"espionageprobe":5,"smallcargo":5}}
    ]));
    store
        .apply_world_scenario(u, &setup, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let auth = SessionService::new(store.clone())
        .login("alice", "password", None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let rules = store.load_rules(u).await.unwrap();
    let mut seen = std::collections::BTreeSet::new();
    for timing in [
        json!({}),
        json!({"arrives_in":"30s"}),
        json!({"travel_time":"45s"}),
        json!({"arrives_in":"20s","travel_time":"60s"}),
    ] {
        let edits = ["attack", "spy", "transport"].map(|op| {
            let mut edit = json!({"op":op,"user":"alice","from":"1:1:8","planet":"1:2:8"});
            edit.as_object_mut()
                .unwrap()
                .extend(timing.as_object().unwrap().clone());
            edit
        });
        store
            .apply_world_scenario(
                u,
                &document(json!(edits)),
                ScenarioMode::Patch,
                Uuid::new_v4(),
            )
            .await
            .unwrap();
        let snapshot = store.bound_world(binding).await.unwrap();
        let state = &snapshot.facts.0.state;
        validate_completed_assets(state).unwrap();
        let fleets: Vec<sqlx::types::Json<MissionFleet>> =
            sqlx::query_scalar("SELECT data FROM mission_fleets WHERE universe=$1")
                .bind(u.0)
                .fetch_all(&pool)
                .await
                .unwrap();
        let new = fleets
            .iter()
            .filter(|f| !seen.contains(&f.id))
            .collect::<Vec<_>>();
        assert_eq!(new.len(), 3);
        for f in new {
            let ordinary = fleet_terms(
                &f.intent,
                f.origin_coordinates,
                f.destination_coordinates,
                &state.research[&binding.player],
                &rules,
            )
            .unwrap();
            let duration = timing
                .get("travel_time")
                .or_else(|| timing.get("arrives_in"))
                .map(|v| orbit_engine::world_edit::duration_ms(v.as_str().unwrap()).unwrap())
                .unwrap_or(ordinary.duration_ms);
            let remaining = timing
                .get("arrives_in")
                .map(|v| orbit_engine::world_edit::duration_ms(v.as_str().unwrap()).unwrap())
                .unwrap_or(duration);
            assert_eq!(f.terms.duration_ms, duration);
            assert_eq!(f.due_at - f.launched_at, remaining);
            assert!(!f.terms.terms_hash.0.is_empty());
        }
        seen.extend(fleets.into_iter().map(|f| f.id));
    }
    assert_eq!(seen.len(), 12);
}

#[tokio::test]
async fn ordinary_demolition_survives_scenario_export_replace_and_completion() {
    let (store, pool) = fresh().await;
    let u = UniverseId(Uuid::new_v4());
    let setup = document(json!([
        {"op":"add-player","user":"alice","password":"password","planet":"1:1:8"},
        {"op":"set","user":"alice","planet":"1:1:8","buildings":{"metalmine":5,"solarplant":10},"resources":{"metal":100000,"crystal":100000,"deuterium":100000}}
    ]));
    store
        .apply_world_scenario(u, &setup, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let auth = SessionService::new(store.clone())
        .login("alice", "password", None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let state = store.bound_world(binding).await.unwrap().facts.0.state;
    let body = *state.bodies.keys().next().unwrap();
    let rules = store.load_rules(u).await.unwrap();
    let q = quote(
        &state,
        Actor::Player(binding.player),
        &QuoteRequest::Demolition {
            body,
            building: Building::MetalMine,
        },
        1_790_000_000_000,
        &rules,
    )
    .unwrap();
    let gameplay = CommandEnvelopeV4 {
        protocol: 4,
        binding,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::StartDemolition {
            body,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash.clone(),
        }),
    };
    let presence = CommandEnvelopeV4 {
        protocol: 4,
        binding,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: Some(body),
                cause: PresenceCause::GameplayGesture,
                paired_command_id: Some(gameplay.command_id),
            },
        }),
    };
    game.world_submit(
        Principal {
            account: binding.account,
            player: binding.player,
            universe: u,
        },
        ForegroundAction { presence, gameplay },
    )
    .await
    .unwrap();
    loop {
        match game.step(u, WorkerId(Uuid::new_v4())).await.unwrap() {
            StepOutcome::Idle => break,
            StepOutcome::Committed { .. } => {}
            other => panic!("demolition admission did not commit: {other:?}"),
        }
    }
    let (before, paid, due): (
        sqlx::types::Json<ProgressionMaterial>,
        sqlx::types::Json<Resources>,
        i64,
    ) = sqlx::query_as(
        "SELECT progression,paid,due_at FROM constructions WHERE universe=$1 AND status='Active'",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(matches!(
        before.0,
        ProgressionMaterial::Building {
            action: BuildingAction::Demolition,
            source_level: 5,
            target_level: 4,
            ..
        }
    ));
    let exported = store.export_world_scenario(u).await.unwrap();
    let recipe: WorldScenario =
        serde_json::from_slice(&serde_json::to_vec(&exported).unwrap()).unwrap();
    let queued = recipe.edits.iter().find(|e| e.op == "queue").unwrap();
    assert_eq!(queued.buildings.get("metalmine"), Some(&4));
    store
        .apply_world_scenario(u, &recipe, ScenarioMode::Replace, Uuid::new_v4())
        .await
        .unwrap();
    let (restored, restored_paid, restored_due): (
        sqlx::types::Json<ProgressionMaterial>,
        sqlx::types::Json<Resources>,
        i64,
    ) = sqlx::query_as(
        "SELECT progression,paid,due_at FROM constructions WHERE universe=$1 AND status='Active'",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(matches!(
        restored.0,
        ProgressionMaterial::Building {
            action: BuildingAction::Demolition,
            source_level: 5,
            target_level: 4,
            ..
        }
    ));
    assert_eq!(restored_paid.0, paid.0);
    assert_eq!(restored_due, due);
    store
        .apply_world_scenario(
            u,
            &document(json!([{"op":"finish","planet":"1:1:8"}])),
            ScenarioMode::Patch,
            Uuid::new_v4(),
        )
        .await
        .unwrap();
    let level:i64=sqlx::query_scalar("SELECT l.level FROM building_levels l JOIN bodies b ON b.id=l.body WHERE b.universe=$1 AND l.building='MetalMine'").bind(u.0).fetch_one(&pool).await.unwrap();
    assert_eq!(level, 4);
    let auth = SessionService::new(store.clone())
        .login("alice", "password", None)
        .await
        .unwrap();
    let binding = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    validate_completed_assets(&store.bound_world(binding).await.unwrap().facts.0.state).unwrap();
}

#[tokio::test]
async fn terraformer_expanded_planet_round_trips_original_fields_and_completed_levels() {
    let (store, pool) = fresh().await;
    let u = world(&store).await;
    let planet: (String, i64) = sqlx::query_as("SELECT galaxy||':'||system||':'||position,fields FROM bodies WHERE universe=$1 AND kind='Planet' AND fields=163 ORDER BY id LIMIT 1").bind(u.0).fetch_one(&pool).await.unwrap();
    store
        .apply_world_scenario(
            u,
            &document(json!([{"op":"clear","planet":planet.0}])),
            ScenarioMode::Patch,
            Uuid::new_v4(),
        )
        .await
        .unwrap();
    let edit = document(json!([{"op":"set","planet":planet.0,"buildings":{
        "MetalMine":30,"CrystalMine":30,"DeuteriumSynthesizer":30,"SolarPlant":30,
        "ResearchLab":25,"RoboticsFactory":10,"Shipyard":14,"NaniteFactory":1,"Terraformer":2,
        "MetalStorage":0,"CrystalStorage":0,"DeuteriumTank":0,"FusionReactor":0,"MissileSilo":0
    }}]));
    // Use a homeworld (163 base fields); its 172 completed levels fit only because
    // Terraformer contributes ten derived fields.
    assert_eq!(planet.1, 163);
    store
        .apply_world_scenario(u, &edit, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    let saved = store.export_world_scenario(u).await.unwrap();
    let base_before: i64 = sqlx::query_scalar(
        "SELECT fields FROM bodies WHERE universe=$1 AND galaxy||':'||system||':'||position=$2",
    )
    .bind(u.0)
    .bind(&planet.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(base_before, 163);
    store
        .apply_world_scenario(u, &saved, ScenarioMode::Replace, Uuid::new_v4())
        .await
        .unwrap();
    let base_after: i64 = sqlx::query_scalar(
        "SELECT fields FROM bodies WHERE universe=$1 AND galaxy||':'||system||':'||position=$2",
    )
    .bind(u.0)
    .bind(&planet.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(base_after, 163);
    let inspected = store.inspect_world(u, None, Some(&planet.0)).await.unwrap();
    assert_eq!(inspected["planets"][0]["fields"], 173);
    assert_eq!(inspected["planets"][0]["base_fields"], 163);
    let restored = store.export_world_scenario(u).await.unwrap();
    let level = restored
        .edits
        .iter()
        .find(|e| e.planet.as_ref() == Some(&planet.0) && e.buildings.contains_key("Terraformer"))
        .unwrap()
        .buildings["Terraformer"];
    assert_eq!(level, 2);
    let overflow = document(json!([{"op":"set","planet":planet.0,"buildings":{"Shipyard":16}}]));
    let error = store
        .apply_world_scenario(u, &overflow, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap_err();
    assert!(
        error.to_string().contains("buildings use 174 fields"),
        "{error}"
    );
}

// Regression: both gameplay and operator-created research must persist the same
// remote lab selection, including after process restart and scenario restoration.
#[tokio::test]
async fn research_network_uses_remote_labs_in_both_runtimes_and_operator_imports() {
    for scoped in [false, true] {
        let (store, pool) = fresh().await;
        let u = UniverseId(Uuid::new_v4());
        store.apply_world_scenario(u, &document(json!([
            {"op":"add-player","user":"alice","password":"password","planet":"1:1:8"},
            {"op":"set","user":"alice","research":{"astrophysics":1,"computertechnology":8,"energytechnology":5,"shieldingtechnology":5,"hyperspacetechnology":8,"intergalacticresearchnetwork":1}},
            {"op":"set","user":"alice","planet":"1:1:8","buildings":{"researchlab":10},"resources":{"metal":10000000,"crystal":10000000,"deuterium":10000000}},
            {"op":"add-planet","user":"alice","planet":"1:2:8"},
            {"op":"set","user":"alice","planet":"1:2:8","buildings":{"researchlab":12}}
        ])), ScenarioMode::Create, Uuid::new_v4()).await.unwrap();
        if scoped {
            store.prepare_scoped_runtime(u, 1).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        let auth = SessionService::new(store.clone())
            .login("alice", "password", None)
            .await
            .unwrap();
        let game = GameService::new(store.clone());
        let binding = game
            .current_binding(auth.session.account, u, Uuid::new_v4())
            .await
            .unwrap()
            .binding;
        let snapshot = store.bound_world(binding).await.unwrap().facts.0;
        let origin = snapshot
            .state
            .bodies
            .values()
            .find(|b| b.coordinates.system == 1)
            .unwrap()
            .id;
        let remote = snapshot
            .state
            .bodies
            .values()
            .find(|b| b.coordinates.system == 2)
            .unwrap()
            .id;
        let research = ResearchId::IntergalacticResearchNetwork;
        let options = inspect_progression(
            &snapshot.state,
            Actor::Player(binding.player),
            &QuoteRequest::Research {
                host: origin,
                research,
            },
            snapshot.at,
            &snapshot.rules,
        )
        .unwrap();
        assert!(options.blockers.is_empty());
        assert!(
            matches!(options.terms.as_ref().unwrap(), ProgressionMaterial::Research { effective_lab: 22, labs, .. } if labs.len() == 2)
        );
        let id = CommandId(Uuid::new_v4());
        store
            .bound_admit4(ForegroundAction {
                gameplay: CommandEnvelopeV4 {
                    protocol: 4,
                    binding,
                    command_id: id,
                    command: CommandDto3::Progression(Command::StartResearch {
                        host: origin,
                        research,
                        expected_terms_hash: options.terms_hash.unwrap(),
                    }),
                },
                presence: CommandEnvelopeV4 {
                    protocol: 4,
                    binding,
                    command_id: CommandId(Uuid::new_v4()),
                    command: CommandDto3::Progression(Command::World {
                        action: WorldAction::RecordForegroundPresence {
                            body: Some(origin),
                            cause: PresenceCause::GameplayGesture,
                            paired_command_id: Some(id),
                        },
                    }),
                },
            })
            .await
            .unwrap();
        async fn drain(store: &PgStore, u: UniverseId, scoped: bool) {
            let game = GameService::new(store.clone());
            loop {
                let result = if scoped {
                    game.step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
                        .await
                        .unwrap()
                } else {
                    game.step(u, WorkerId(Uuid::new_v4())).await.unwrap()
                };
                match result {
                    StepOutcome::Idle => break,
                    StepOutcome::Committed { .. } => {}
                    other => panic!("{other:?}"),
                }
            }
        }
        drain(&store, u, scoped).await;
        let active = store.bound_world(binding).await.unwrap().facts.0;
        let op = active
            .state
            .research_operations
            .values()
            .find(|op| op.status == ResearchStatus::Active)
            .unwrap()
            .clone();
        assert_eq!(
            op.labs,
            vec![
                LabContribution {
                    body: origin,
                    completed_level: 10
                },
                LabContribution {
                    body: remote,
                    completed_level: 12
                }
            ]
        );
        assert_eq!(
            active.state.bodies[&remote].checkpoint.amounts,
            snapshot.state.bodies[&remote].checkpoint.amounts
        );
        assert_eq!(
            op.commitment.due_at - op.commitment.started_at,
            options.terms.unwrap().duration()
        );
        let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        restarted.set_test_time(op.commitment.due_at).await.unwrap();
        drain(&restarted, u, scoped).await;
        assert_eq!(
            restarted
                .bound_world(binding)
                .await
                .unwrap()
                .facts
                .0
                .state
                .research[&binding.player]
                .levels[&research],
            2
        );
        restarted.audit_universe(u).await.unwrap();
        // Operator work uses the same selector and retains paid timing on export.
        restarted.apply_world_scenario(u, &document(json!([
            {"op":"queue","user":"alice","planet":"1:1:8","research":{"intergalacticresearchnetwork":3}}
        ])), ScenarioMode::Patch, Uuid::new_v4()).await.unwrap();
        let queued: sqlx::types::Json<ResearchOperation> = sqlx::query_scalar(
            "SELECT data FROM research_operations WHERE universe=$1 AND data->>'status'='Active'",
        )
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(queued.labs, op.labs);
        let exported = restarted.export_world_scenario(u).await.unwrap();
        let recipe: WorldScenario =
            serde_json::from_slice(&serde_json::to_vec(&exported).unwrap()).unwrap();
        restarted
            .apply_world_scenario(u, &recipe, ScenarioMode::Replace, Uuid::new_v4())
            .await
            .unwrap();
        let restored: sqlx::types::Json<ResearchOperation> = sqlx::query_scalar(
            "SELECT data FROM research_operations WHERE universe=$1 AND data->>'status'='Active'",
        )
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            restored
                .labs
                .iter()
                .map(|lab| lab.completed_level)
                .collect::<Vec<_>>(),
            vec![10, 12]
        );
        assert_eq!(restored.commitment.due_at, queued.commitment.due_at);
        assert_eq!(restored.commitment.paid, queued.commitment.paid);
        restarted.audit_universe(u).await.unwrap();
    }
}

/// A live inventory commit can race a retained player's initial score calculation.
/// Both the writer and the online backfill must publish the exact catalog value.
#[tokio::test]
async fn current_scores_follow_inventory_and_a_backfill_cannot_overwrite_a_newer_commit() {
    let (store, pool) = fresh().await;
    let u = UniverseId(Uuid::new_v4());
    let setup = document(json!([
        {"op":"add-player","user":"alice","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"bob","password":"password","planet":"1:2:8"},
        {"op":"set","user":"alice","planet":"1:1:8","ships":{"smallcargo":2}}
    ]));
    store
        .apply_world_scenario(u, &setup, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let players: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT p.id,p.current_score_micro FROM players p JOIN bodies b ON b.owner=p.id
         WHERE p.universe=$1 ORDER BY b.system",
    )
    .bind(u.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    let alice = players[0].0;
    assert_eq!((players[0].1, players[1].1), (8_000 * SCALE, 0));
    // Simulate rows from before the migration, including a member without lots.
    sqlx::query("UPDATE players SET current_score_micro=NULL WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(store.backfill_ranking_scores(u, 1).await.unwrap(), 1);
    assert_eq!(store.backfill_ranking_scores(u, 1).await.unwrap(), 1);
    assert_eq!(store.backfill_ranking_scores(u, 1).await.unwrap(), 0);
    let after: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT p.id,p.current_score_micro FROM players p JOIN bodies b ON b.owner=p.id
         WHERE p.universe=$1 ORDER BY b.system",
    )
    .bind(u.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(after, players);

    sqlx::query("UPDATE players SET current_score_micro=NULL WHERE id=$1")
        .bind(alice)
        .execute(&pool)
        .await
        .unwrap();
    let mut writer = pool.begin().await.unwrap();
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *writer)
        .await
        .unwrap();
    sqlx::query("UPDATE inventories SET count=3 WHERE owner=$1")
        .bind(alice)
        .execute(&mut *writer)
        .await
        .unwrap();
    sqlx::query("UPDATE players SET current_score_micro=$2 WHERE id=$1")
        .bind(alice)
        .bind(12_000 * SCALE)
        .execute(&mut *writer)
        .await
        .unwrap();
    let background = store.clone();
    let backfill = tokio::spawn(async move { background.backfill_ranking_scores(u, 1).await });
    // Wait for the stale calculation to reach the row held by the real SQL
    // writer, then release it. There is no timing assumption in this schedule.
    loop {
        let waiting: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)))",
        )
        .bind(pid)
        .fetch_one(&pool)
        .await
        .unwrap();
        if waiting {
            break;
        }
        assert!(
            !backfill.is_finished(),
            "backfill did not reach the locked score"
        );
        tokio::task::yield_now().await;
    }
    writer.commit().await.unwrap();
    assert_eq!(backfill.await.unwrap().unwrap(), 1);
    let won: i64 = sqlx::query_scalar("SELECT current_score_micro FROM players WHERE id=$1")
        .bind(alice)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(won, 12_000 * SCALE);

    let remove =
        document(json!([{"op":"set","user":"alice","planet":"1:1:8","ships":{"smallcargo":0}}]));
    store
        .apply_world_scenario(u, &remove, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    let empty: i64 = sqlx::query_scalar("SELECT current_score_micro FROM players WHERE id=$1")
        .bind(alice)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(empty, 0);
    let give =
        document(json!([{"op":"give","user":"alice","planet":"1:1:8","ships":{"smallcargo":1}}]));
    store
        .apply_world_scenario(u, &give, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();

    // Unrepresentable inventory quantities must stop the batch, rather than erasing
    // an invalid contribution or publishing a plausible zero score.
    sqlx::query("UPDATE inventories SET count=9223372036854775807 WHERE owner=$1")
        .bind(alice)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE players SET current_score_micro=NULL WHERE id=$1")
        .bind(alice)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store.backfill_ranking_scores(u, 1).await,
        Err(StoreError::CorruptData)
    ));
    assert!(matches!(
        store
            .backfill_ranking_scores(UniverseId(Uuid::new_v4()), 1)
            .await,
        Err(StoreError::NotFound)
    ));
}

#[tokio::test]
async fn deliberate_reprice_updates_live_scores_for_ships_at_home_and_in_flight() {
    let (store, pool) = fresh().await;
    let universe = UniverseId(Uuid::new_v4());
    let setup = document(json!([
        {"op":"add-player","user":"pilot","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"neighbor","password":"password","planet":"1:2:8"},
        {"op":"set","user":"pilot","planet":"1:1:8","ships":{"smallcargo":5}},
        {"op":"transport","from":"1:1:8","planet":"1:2:8","ships":{"smallcargo":2},"arrives_in":"3m"}
    ]));
    store
        .apply_world_scenario(universe, &setup, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let score = || {
        sqlx::query_scalar::<_,i64>("SELECT current_score_micro FROM players WHERE id=(SELECT owner FROM mission_fleets WHERE universe=$1)")
        .bind(universe.0).fetch_one(&pool)
    };
    assert_eq!(score().await.unwrap(), 20_000 * SCALE);
    let service = RulesService::new(store.clone());
    let mut next = service.export(universe).await.unwrap();
    let item = ManufacturedItem::Ship(ShipType::SmallCargo);
    next.artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .iter_mut()
        .find(|u| u.item == item)
        .unwrap()
        .cost
        .metal = 3_000;
    if let Some(unit) = next
        .artifact
        .world
        .as_mut()
        .and_then(|w| w.combat.units.iter_mut().find(|u| u.item == item))
    {
        unit.cost[0] = 3_000;
    }
    let fleet = || {
        sqlx::query_scalar::<_, Value>("SELECT data FROM mission_fleets WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
    };
    let before = fleet().await.unwrap();
    assert!(matches!(
        service.apply(&next).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    assert_eq!(score().await.unwrap(), 25_000 * SCALE);
    assert_eq!(fleet().await.unwrap(), before);
    assert_eq!(store.backfill_ranking_scores(universe, 1).await.unwrap(), 0);
}

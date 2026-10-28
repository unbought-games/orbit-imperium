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
    validate_asset_lineage(state).unwrap();
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
    normalize_asset_lots(&mut lots).unwrap();
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
    validate_asset_lineage(&view.facts.0.state).unwrap();
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
    let saved = store.export_world_scenario(u).await.unwrap();
    let serialized = serde_json::to_string(&saved).unwrap();
    assert!(!serialized.contains("password_hash"));
    assert!(!serialized.contains("\"password\""));
    assert!(saved.edits.iter().any(|e| e.op == "report"));
    assert!(saved.edits.iter().any(|e| e.op == "message"));
    assert!(saved.edits.iter().any(|e| e.op == "queue"));
    assert!(saved.edits.iter().any(|e| e.op == "alliance"));
    let before:Vec<(String,i64,i32)>=sqlx::query_as("SELECT galaxy||':'||system||':'||position,fields,max_temperature FROM bodies WHERE universe=$1 ORDER BY galaxy,system,position").bind(u.0).fetch_all(&pool).await.unwrap();
    let value_before:i64=sqlx::query_scalar("SELECT sum((data->>'quantity')::bigint*(data->>'unit_value_micro')::bigint)::bigint FROM asset_lots WHERE universe=$1").bind(u.0).fetch_one(&pool).await.unwrap();
    store
        .apply_world_scenario(u, &saved, ScenarioMode::Replace, Uuid::new_v4())
        .await
        .unwrap();
    let after:Vec<(String,i64,i32)>=sqlx::query_as("SELECT galaxy||':'||system||':'||position,fields,max_temperature FROM bodies WHERE universe=$1 ORDER BY galaxy,system,position").bind(u.0).fetch_all(&pool).await.unwrap();
    assert_eq!(before, after);
    let due_after:Vec<i64>=sqlx::query_scalar("SELECT (data->>'next_due_at')::bigint FROM manufacturing_batches WHERE universe=$1 AND data->>'status'='Active' ORDER BY queue_sequence").bind(u.0).fetch_all(&pool).await.unwrap();
    assert_eq!(due_before, due_after);
    let value_after:i64=sqlx::query_scalar("SELECT sum((data->>'quantity')::bigint*(data->>'unit_value_micro')::bigint)::bigint FROM asset_lots WHERE universe=$1").bind(u.0).fetch_one(&pool).await.unwrap();
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
        validate_asset_lineage(state).unwrap();
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
            expected_terms_hash: q.terms_hash,
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
    validate_asset_lineage(&store.bound_world(binding).await.unwrap().facts.0.state).unwrap();
}

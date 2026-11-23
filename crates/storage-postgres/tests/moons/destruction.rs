use super::*;

const AT: i64 = 1_790_000_000_000;

async fn launch(store: &PgStore, binding: Binding, intent: FleetIntent) -> i64 {
    let result = GameService::new(store.clone())
        .world_query(
            Principal {
                account: binding.account,
                player: binding.player,
                universe: binding.universe,
            },
            WorldQuery {
                context: QueryContext {
                    binding,
                    request_id: Uuid::new_v4(),
                },
                query: WorldQueryKind::FleetQuote {
                    intent: intent.clone(),
                },
            },
        )
        .await
        .unwrap()
        .facts;
    let due = result.sampled_at + result.data["duration_ms"].as_i64().unwrap();
    gameplay::command(
        store,
        binding,
        Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: serde_json::from_value(result.data["terms_hash"].clone())
                    .unwrap(),
            },
        },
    )
    .await;
    due
}

#[tokio::test]
async fn destruction_retires_paid_lunar_jobs_before_their_deadlines_without_touching_parent_assets()
{
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(AT).await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let mut scenario: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"siege-attacker","password":"password","planet":"1:1:8"},
        {"op":"set","user":"siege-attacker","planet":"1:1:8","ships":{"Dreadnought":101},"research":{"ComputerTechnology":2},"resources":{"deuterium":100000}},
        {"op":"add-player","user":"lunar-builder","password":"password","planet":"1:1:9"},
        {"op":"set","user":"lunar-builder","planet":"1:1:9","ships":{"Dreadnought":101},"resources":{"metal":10000000,"crystal":10000000,"deuterium":10000000}}
    ]})).unwrap();
    scenario.rules =
        Some(standard_signup_rules(UniverseProfile::signup(2, 100).unwrap(), 100).unwrap());
    store
        .apply_world_scenario(u, &scenario, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let (attacker, origin) = player(&store, u, "siege-attacker", &pool).await;
    let (defender, parent) = player(&store, u, "lunar-builder", &pool).await;
    let moon = seed_moon(&pool, defender, parent, AT).await;
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    for building in [
        Building::LunarBase,
        Building::RoboticsFactory,
        Building::RoboticsFactory,
        Building::LunarBase,
        Building::Shipyard,
    ] {
        gameplay::complete(
            &store,
            defender,
            QuoteRequest::Upgrade {
                body: moon,
                building,
            },
        )
        .await;
    }
    let parent_ships = sqlx::query_scalar::<_, i64>(
        "SELECT count FROM inventories WHERE body=$1 AND item->>'id'='Dreadnought'",
    )
    .bind(parent.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(parent_ships, 101);
    let intent = FleetIntent {
        cargo_fill: None,
        origin,
        mission: Mission::DestroyMoon,
        destination: MissionDestination::Body {
            id: moon,
            expected_kind: BodyKind::Moon,
            expected_owner: defender.player,
        },
        ships: vec![ManifestStack {
            owner: attacker.player,
            ship_type: ShipType::Dreadnought,
            count: 100,
        }],
        cargo: Resources::default(),
        speed_percent: 100,
        hold_hours: None,
        attack_group: None,
    };
    // 8100km at 100 surviving ships gives exactly 100% destruction, independent of fleet loss.
    let hit_at = launch(&store, attacker, intent.clone()).await;
    let mut follow = intent;
    follow.mission = Mission::Attack;
    follow.ships[0].count = 1;
    follow.speed_percent = 10;
    let later = launch(&store, attacker, follow).await;
    assert!(hit_at < later);
    store.set_test_time(hit_at - 1).await.unwrap();
    let item = ManufacturedItem::Defense(DefenseId::RocketLauncher);
    for request in [
        QuoteRequest::Upgrade {
            body: moon,
            building: Building::LunarBase,
        },
        QuoteRequest::Manufacture {
            body: moon,
            item,
            quantity: 2,
        },
    ] {
        let (snapshot, _) = store.bound_world(defender).await.unwrap().facts;
        let q = inspect_progression(
            &snapshot.state,
            Actor::Player(defender.player),
            &request,
            snapshot.at,
            &snapshot.rules,
        )
        .unwrap();
        assert!(q.blockers.is_empty(), "{:?}", q.blockers);
        let hash = q.terms_hash.unwrap();
        let command = match request {
            QuoteRequest::Upgrade { body, building } => Command::StartUpgrade {
                body,
                building,
                expected_terms_hash: hash,
            },
            QuoteRequest::Manufacture {
                body,
                item,
                quantity,
            } => Command::StartManufacture {
                body,
                item,
                quantity,
                expected_terms_hash: hash,
            },
            _ => unreachable!(),
        };
        gameplay::command(&store, defender, command).await;
    }
    let (before, _) = store.bound_world(defender).await.unwrap().facts;
    let build = before
        .state
        .constructions
        .values()
        .find(|work| work.body == moon && work.status == ConstructionStatus::Active)
        .unwrap();
    let batch = before
        .state
        .manufacturing_batches
        .values()
        .find(|work| work.body == moon && work.status == ManufacturingStatus::Active)
        .unwrap();
    assert!(hit_at < build.due_at && hit_at < batch.final_due_at);
    store.set_test_time(hit_at).await.unwrap();
    gameplay::drain(&store, u).await;
    assert!(
        store
            .export_world_scenario(u)
            .await
            .unwrap_err()
            .to_string()
            .contains("destroyed moon")
    );
    let reopened = PgStore::connect(&url).await.unwrap();
    reopened
        .set_test_time(build.due_at.max(batch.final_due_at).max(later))
        .await
        .unwrap();
    gameplay::drain(&reopened, u).await;
    let status: String = sqlx::query_scalar("SELECT status FROM constructions WHERE id=$1")
        .bind(build.id.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "BodyDestroyed");
    let historical: sqlx::types::Json<ManufacturingBatch> =
        sqlx::query_scalar("SELECT data FROM manufacturing_batches WHERE id=$1")
            .bind(batch.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(historical.status, ManufacturingStatus::BodyDestroyed);
    assert_eq!(historical.completed_prefix, 0);
    assert_eq!(historical.commitment, batch.commitment);
    let assets: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM bodies WHERE id=$1) OR EXISTS(SELECT 1 FROM inventories WHERE body=$1) OR EXISTS(SELECT 1 FROM asset_lots WHERE universe=$2 AND data->'location'->>'Body'=$1::uuid::text)")
        .bind(moon.0).bind(u.0).fetch_one(&pool).await.unwrap();
    assert!(!assets);
    let (after, _) = reopened.bound_world(defender).await.unwrap().facts;
    validate_asset_lineage(&after.state).unwrap();
    assert_eq!(
        after
            .state
            .inventories
            .iter()
            .find(|v| v.body == parent && v.item == ManufacturedItem::Ship(ShipType::Dreadnought))
            .unwrap()
            .count,
        parent_ships
    );
}

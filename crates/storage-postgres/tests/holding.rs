use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::json;
use uuid::Uuid;
async fn drain(store: &PgStore, u: UniverseId, scoped: bool) {
    let game = GameService::new(store.clone());
    for _ in 0..100 {
        let result = if scoped {
            game.step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap()
        } else {
            game.step(u, WorkerId(Uuid::new_v4())).await.unwrap()
        };
        if matches!(result, StepOutcome::Idle) {
            return;
        }
    }
    panic!("missile fixture did not drain")
}
fn pair(binding: Binding, body: BodyId, command: Command) -> ForegroundAction {
    let id = CommandId(Uuid::new_v4());
    ForegroundAction {
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding,
            command_id: id,
            command: CommandDto3::Progression(command),
        },
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(body),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(id),
                },
            }),
        },
    }
}
async fn binding(store: &PgStore, user: &str) -> Binding {
    let login = SessionService::new(store.clone())
        .login(user, "password", None)
        .await
        .unwrap();
    GameService::new(store.clone())
        .initial_game(&login.session, Uuid::new_v4())
        .await
        .unwrap()
        .unwrap()
        .candidate
        .binding
}
#[tokio::test]
async fn migrated_vacation_projects_current_rates_without_persisting_old_checkpoints() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let start = 1_790_000_000_000;
    store.set_test_time(start).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let user = format!("migrating-{}", Uuid::new_v4());
    let document: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":user,"password":"password","planet":"1:50:8"},
        {"op":"set","user":user,"planet":"1:50:8","buildings":{"MetalMine":1,"CrystalMine":1,"SolarPlant":2,"FusionReactor":1,"Shipyard":1},"research":{"EnergyTechnology":3},"resources":{"metal":0,"crystal":10000,"deuterium":10000}}
    ]})).unwrap();
    store
        .apply_world_scenario(u, &document, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let b = binding(&store, &user).await;
    let (initial, _) = store.bound_world(b).await.unwrap().facts;
    let origin = initial
        .state
        .bodies
        .values()
        .find(|body| body.owner == b.player)
        .unwrap()
        .id;
    let item = ManufacturedItem::Ship(ShipType::SolarSatellite);
    let quote = inspect_progression(
        &initial.state,
        Actor::Player(b.player),
        &QuoteRequest::Manufacture {
            body: origin,
            item,
            quantity: 2,
        },
        initial.at,
        &initial.rules,
    )
    .unwrap();
    assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
    store
        .bound_admit4(pair(
            b,
            origin,
            Command::StartManufacture {
                body: origin,
                item,
                quantity: 2,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        ))
        .await
        .unwrap();
    drain(&store, u, false).await;
    let (working, _) = store.bound_world(b).await.unwrap().facts;
    let finish = working
        .state
        .manufacturing_batches
        .values()
        .find(|batch| batch.owner == b.player && batch.status == ManufacturingStatus::Active)
        .unwrap()
        .final_due_at;
    store.set_test_time(finish).await.unwrap();
    drain(&store, u, false).await;
    let stocks: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[{"op":"set","user":user,"planet":"1:50:8","resources":{"metal":0,"crystal":0,"deuterium":10000}}]})).unwrap();
    store
        .apply_world_scenario(u, &stocks, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap();
    let (source, _) = store.bound_world(b).await.unwrap().facts;
    let body = source
        .state
        .bodies
        .values()
        .find(|body| body.owner == b.player)
        .unwrap()
        .clone();
    assert!(
        body_economy(&source.state, &body, &source.rules)
            .unwrap()
            .fuel
            > 0
    );
    assert!(
        body_economy(&source.state, &body, &source.rules)
            .unwrap()
            .energy
            .supply
            > 0
    );
    assert_eq!(
        solar_satellite_count(&source.state, &body, &source.rules).unwrap(),
        2
    );
    let entered_at = source.at + 3_600_000;
    let before_entry = settle_production(&source.state, &body, entered_at, &source.rules).unwrap();
    // Reproduce migration's interval-only write, deliberately retaining the old checkpoint.
    let interval = VacationState::Active {
        entered_at,
        policy_hash: source.rules.hash.clone(),
    };
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{vacation}',$2) WHERE id=$1")
        .bind(b.player.0)
        .bind(sqlx::types::Json(interval))
        .execute(&pool)
        .await
        .unwrap();
    let observed_at = entered_at + 3_600_000;
    store.set_test_time(observed_at).await.unwrap();
    let view = GameService::new(store.clone())
        .world_view(
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
        .unwrap()
        .facts;
    assert!(view.vacation.active);
    assert_eq!(view.progression.as_of_ms, observed_at);
    let projected = view
        .progression
        .bodies
        .iter()
        .find(|p| p.id == body.id)
        .unwrap();
    let production = view
        .progression
        .progression
        .production
        .iter()
        .find(|p| p.body == body.id)
        .unwrap();
    let base_metal = source.rules.artifact.base_income[0] * i64::from(source.rules.speed) * SCALE;
    let base_crystal = source.rules.artifact.base_income[1] * i64::from(source.rules.speed) * SCALE;
    assert_eq!(production.gross_per_hour.metal, base_metal.to_string());
    assert_eq!(production.gross_per_hour.crystal, base_crystal.to_string());
    assert_eq!(production.fuel_deuterium_per_hour, "0");
    assert_eq!(production.energy_supply, "0");
    assert_eq!(production.energy_demand, "0");
    assert_eq!(
        production.solar_satellite.as_ref().unwrap().energy_supply,
        "0"
    );
    assert_eq!(
        production.fusion_reactor.as_ref().unwrap().energy_supply,
        "0"
    );
    assert_eq!(projected.energy.supply, "0");
    assert_eq!(
        projected.amounts.metal,
        (before_entry.amounts.metal + base_metal).to_string()
    );
    assert_eq!(
        projected.amounts.crystal,
        (before_entry.amounts.crystal + base_crystal).to_string()
    );
    assert_eq!(
        projected.amounts.deuterium,
        before_entry.amounts.deuterium.to_string()
    );
    assert_eq!(
        production.settings,
        source.state.production_settings[&body.id].settings
    );
    let (after, _) = store.bound_world(b).await.unwrap().facts;
    assert_eq!(after.state.bodies[&body.id].checkpoint, body.checkpoint);
    assert_eq!(after.state.bodies[&body.id].revision, body.revision);
}

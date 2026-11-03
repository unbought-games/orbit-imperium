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
    let mut document: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"moon-attacker","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"moon-owner","password":"password","planet":"1:1:9"},
        {"op":"set","user":"moon-attacker","planet":"1:1:8","ships":{"EspionageProbe":4000,"SmallCargo":3},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}},
        {"op":"set","user":"moon-owner","planet":"1:1:9","buildings":{"AllianceDepot":1},"defenses":{"RocketLauncher":2000},"ships":{"SmallCargo":3},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}},
        {"op":"attack","user":"moon-attacker","from":"1:1:8","planet":"1:1:9","ships":{"EspionageProbe":2000},"arrives_in":"1s"},
        {"op":"attack","user":"moon-attacker","from":"1:1:8","planet":"1:1:9","ships":{"EspionageProbe":2000},"arrives_in":"1s"}
    ]})).unwrap();
    document.rules = Some(prior_lunar_rules());
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
    // Keep the large staged journey futures off the enclosing test future.
    // Nesting them inline overflows the Linux test thread's stack in debug builds.
    Box::pin(exercise_moon_fleets(
        &reopened,
        binding,
        parent,
        moon,
        now + 86_400_001,
    ))
    .await;
    Box::pin(exercise_lunar_base(&reopened, &pool, binding, parent, moon)).await;
    Box::pin(exercise_lunar_industry(&reopened, binding, parent, moon)).await;
    reopened.audit_universe(u).await.unwrap();
}

fn fleet_pair(binding: Binding, body: BodyId, action: WorldAction) -> ForegroundAction {
    let id = CommandId(Uuid::new_v4());
    ForegroundAction {
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding,
            command_id: id,
            command: CommandDto3::Progression(Command::World { action }),
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
async fn drain_fleets(store: &PgStore, universe: UniverseId) {
    let game = GameService::new(store.clone());
    for _ in 0..100 {
        if matches!(
            game.step_scoped(universe, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap(),
            StepOutcome::Idle
        ) {
            return;
        }
    }
    panic!("moon fleet fixture did not drain");
}
async fn quoted_launch(store: &PgStore, binding: Binding, intent: FleetIntent) -> ForegroundAction {
    let snap = store
        .bound_world_query(
            binding,
            WorldQueryKind::FleetQuote {
                intent: intent.clone(),
            },
        )
        .await
        .unwrap()
        .facts
        .0;
    let q = quote_fleet(&snap.state, binding.player, &intent, snap.at, &snap.rules).unwrap();
    fleet_pair(
        binding,
        intent.origin,
        WorldAction::LaunchFleet {
            intent,
            expected_terms_hash: q.terms_hash.clone(),
        },
    )
}
async fn exercise_moon_fleets(
    store: &PgStore,
    binding: Binding,
    parent: BodyId,
    moon: BodyId,
    at: i64,
) {
    store.set_test_time(at).await.unwrap();
    let deploy = FleetIntent {
        origin: parent,
        destination: MissionDestination::Body {
            id: moon,
            expected_kind: BodyKind::Moon,
            expected_owner: binding.player,
        },
        mission: Mission::Deploy,
        ships: vec![ManifestStack {
            owner: binding.player,
            ship_type: ShipType::SmallCargo,
            count: 1,
        }],
        cargo: Resources::from_values([1000 * SCALE, 0, 1000 * SCALE]),
        speed_percent: 100,
        attack_group: None,
        hold_hours: None,
    };
    let order = quoted_launch(store, binding, deploy).await;
    store.bound_admit4(order.clone()).await.unwrap();
    store.bound_admit4(order).await.unwrap();
    drain_fleets(store, binding.universe).await;
    let before = store.bound_world(binding).await.unwrap().facts.0;
    let fleet = before
        .state
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .find(|f| f.intent.mission == Mission::Deploy)
        .unwrap();
    let arrival = fleet.due_at;
    store.set_test_time(arrival).await.unwrap();
    drain_fleets(store, binding.universe).await;
    let state = store.bound_world(binding).await.unwrap().facts.0.state;
    assert_eq!(state.bodies[&moon].checkpoint.amounts.metal, 1000 * SCALE);
    let stationed = |s: &GameState| {
        s.inventories
            .iter()
            .filter(|x| x.body == moon && x.item == ManufacturedItem::Ship(ShipType::SmallCargo))
            .map(|x| x.count)
            .sum::<i64>()
    };
    assert_eq!(stationed(&state), 1);
    let transport = FleetIntent {
        origin: moon,
        destination: MissionDestination::Body {
            id: parent,
            expected_kind: BodyKind::Planet,
            expected_owner: binding.player,
        },
        mission: Mission::Transport,
        ships: vec![ManifestStack {
            owner: binding.player,
            ship_type: ShipType::SmallCargo,
            count: 1,
        }],
        cargo: Resources::from_values([100 * SCALE, 0, 0]),
        speed_percent: 100,
        attack_group: None,
        hold_hours: None,
    };
    let first = quoted_launch(store, binding, transport.clone()).await;
    let second = quoted_launch(store, binding, transport).await;
    let (one, two) = tokio::join!(store.bound_admit4(first), store.bound_admit4(second));
    one.unwrap();
    two.unwrap();
    drain_fleets(store, binding.universe).await;
    let snapshot = store.bound_world(binding).await.unwrap().facts.0;
    assert_eq!(stationed(&snapshot.state), 0);
    let active: Vec<_> = snapshot
        .state
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .filter(|f| f.intent.origin == moon && f.active())
        .collect();
    assert_eq!(active.len(), 1, "the same lunar ship cannot launch twice");
    let arriving = active[0].due_at;
    let returning = arriving + active[0].terms.duration_ms;
    store.set_test_time(arriving).await.unwrap();
    drain_fleets(store, binding.universe).await;
    store.set_test_time(returning).await.unwrap();
    drain_fleets(store, binding.universe).await;
    drain_fleets(store, binding.universe).await;
    let state = store.bound_world(binding).await.unwrap().facts.0.state;
    assert_eq!(stationed(&state), 1);
    assert_eq!(state.bodies[&moon].checkpoint.amounts.metal, 900 * SCALE);
    assert!(
        !state
            .world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .any(|f| f.intent.origin == moon && f.active())
    );
    validate_asset_lineage(&state).unwrap();
    Box::pin(exercise_lunar_holding(store, binding, parent, moon)).await;
}

async fn exercise_lunar_holding(store: &PgStore, host: Binding, parent: BodyId, moon: BodyId) {
    let login = SessionService::new(store.clone())
        .login("moon-attacker", "password", None)
        .await
        .unwrap();
    let visitor = GameService::new(store.clone())
        .current_binding(login.session.account, host.universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let context = |binding| QueryContext {
        binding,
        request_id: Uuid::new_v4(),
    };
    store
        .social_command(SocialCommandRequest {
            context: context(visitor),
            command_id: Uuid::new_v4(),
            action: SocialAction::RequestFriend {
                player: host.player,
            },
        })
        .await
        .unwrap();
    let request = store
        .social_query(SocialQueryRequest {
            context: context(host),
            query: SocialQuery::Contacts {
                kind: ContactKind::Requests,
                cursor: None,
                limit: 20,
            },
        })
        .await
        .unwrap()
        .contacts[0]
        .request
        .unwrap();
    store
        .social_command(SocialCommandRequest {
            context: context(host),
            command_id: Uuid::new_v4(),
            action: SocialAction::AcceptFriend {
                player: visitor.player,
                request,
            },
        })
        .await
        .unwrap();
    let snap = store.bound_world(visitor).await.unwrap().facts.0;
    let origin = snap
        .state
        .bodies
        .values()
        .find(|b| b.owner == visitor.player && b.kind == BodyKind::Planet)
        .unwrap()
        .id;
    let intent = FleetIntent {
        origin,
        destination: MissionDestination::Body {
            id: moon,
            expected_kind: BodyKind::Moon,
            expected_owner: host.player,
        },
        mission: Mission::Hold,
        ships: vec![ManifestStack {
            owner: visitor.player,
            ship_type: ShipType::SmallCargo,
            count: 1,
        }],
        cargo: Resources::default(),
        speed_percent: 100,
        attack_group: None,
        hold_hours: Some(1),
    };
    let order = quoted_launch(store, visitor, intent).await;
    store.bound_admit4(order).await.unwrap();
    drain_fleets(store, host.universe).await;
    let snap = store.bound_world(visitor).await.unwrap().facts.0;
    let fleet = snap
        .state
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .find(|f| f.intent.mission == Mission::Hold)
        .unwrap()
        .clone();
    store.set_test_time(fleet.due_at).await.unwrap();
    drain_fleets(store, host.universe).await;
    let intent = DepotSupplyIntent {
        source_planet: parent,
        fleet: fleet.id,
        deuterium: 1000 * SCALE,
    };
    let snap = store
        .bound_world_query(
            host,
            WorldQueryKind::DepotSupplyQuote {
                intent: intent.clone(),
            },
        )
        .await
        .unwrap()
        .facts
        .0;
    assert!(held_at(
        &snap.state.world.as_ref().unwrap().records.fleets[&fleet.id],
        moon
    ));
    let q = quote_depot_supply(&snap.state, host.player, &intent, snap.at, &snap.rules).unwrap();
    let lunar_stock = snap.state.bodies[&moon].checkpoint.amounts;
    let parent_stock = settle_production(
        &snap.state,
        &snap.state.bodies[&parent],
        snap.at,
        &snap.rules,
    )
    .unwrap()
    .amounts;
    let order = fleet_pair(
        host,
        parent,
        WorldAction::SupplyHoldingFleet {
            intent,
            expected_terms_hash: q.terms_hash.clone(),
        },
    );
    store.bound_admit4(order.clone()).await.unwrap();
    store.bound_admit4(order).await.unwrap();
    drain_fleets(store, host.universe).await;
    let after = store.bound_world(host).await.unwrap().facts.0.state;
    assert_eq!(after.bodies[&moon].checkpoint.amounts, lunar_stock);
    assert_eq!(
        after.bodies[&parent].checkpoint.amounts.deuterium,
        parent_stock.deuterium - 1000 * SCALE
    );
    assert_eq!(
        after.world.as_ref().unwrap().records.fleets[&fleet.id].due_at,
        q.departure_at
    );
    assert_eq!(
        depot_budget(
            1,
            parent,
            snap.at,
            &after.world.as_ref().unwrap().records.depot_supplies
        )
        .unwrap()
        .0,
        9000 * SCALE
    );
}

// Regression: scoped construction must load a real moon, reserve its only field,
// and persist completion/cancellation without rewriting genesis or parent state.
async fn exercise_lunar_base(
    store: &PgStore,
    pool: &sqlx::PgPool,
    binding: Binding,
    parent: BodyId,
    moon: BodyId,
) {
    let before_upgrade = store.bound_world(binding).await.unwrap().facts.0;
    assert!(
        !before_upgrade.state.bodies[&moon]
            .levels
            .contains_key(&Building::LunarBase)
    );
    let rules = RulesService::new(store.clone());
    let preview = Box::pin(rules.prepare_upgrade(binding.universe))
        .await
        .unwrap();
    assert_eq!(
        preview.diff.initialize.add_buildings,
        vec![Building::LunarBase]
    );
    Box::pin(rules.apply(&preview.document)).await.unwrap();
    let upgraded = store.bound_world(binding).await.unwrap().facts.0;
    assert_eq!(upgraded.state.bodies[&moon].levels[&Building::LunarBase], 0);
    assert_eq!(
        upgraded.state.world.as_ref().unwrap().records.moons,
        before_upgrade.state.world.as_ref().unwrap().records.moons
    );
    sqlx::query("UPDATE bodies SET amounts=$2,revision=revision+1 WHERE id=$1")
        .bind(moon.0)
        .bind(sqlx::types::Json(Resources::all(1_000_000 * SCALE)))
        .execute(pool)
        .await
        .unwrap();
    let request = QuoteRequest::Upgrade {
        body: moon,
        building: Building::LunarBase,
    };
    let snapshot = store.bound_world(binding).await.unwrap().facts.0;
    let parent_before = snapshot.state.bodies[&parent].clone();
    let initial = snapshot.state.bodies[&moon].checkpoint.amounts;
    for cancel in [true, false] {
        let snapshot = store.bound_world(binding).await.unwrap().facts.0;
        let quote = inspect_progression(
            &snapshot.state,
            Actor::Player(binding.player),
            &request,
            snapshot.at,
            &snapshot.rules,
        )
        .unwrap();
        assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
        let start = Command::StartUpgrade {
            body: moon,
            building: Building::LunarBase,
            expected_terms_hash: quote.terms_hash.unwrap(),
        };
        let competing = lunar_construction_pair(binding, moon, start.clone());
        let pair = lunar_construction_pair(binding, moon, start);
        let duplicate = pair.clone();
        store.bound_admit4(pair).await.unwrap();
        store.bound_admit4(duplicate).await.unwrap();
        store.bound_admit4(competing).await.unwrap();
        drain_fleets(store, binding.universe).await;
        let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        let pending = reopened.bound_world(binding).await.unwrap().facts.0;
        assert_eq!(pending.state.bodies[&parent], parent_before);
        assert_eq!(
            pending.state.bodies[&moon].checkpoint.amounts,
            Resources::from_values([980000, 960000, 980000].map(|n| n * SCALE))
        );
        assert_eq!(
            body_field_capacity(&pending.state.bodies[&moon], &pending.rules).unwrap(),
            1
        );
        assert_eq!(reserved_fields(&pending.state, moon).unwrap(), 1);
        let active: Vec<_> = pending
            .state
            .constructions
            .values()
            .filter(|c| c.body == moon && c.status == ConstructionStatus::Active)
            .collect();
        assert_eq!(active.len(), 1);
        let operation = active[0].id;
        let due = active[0].due_at;
        if cancel {
            store
                .bound_admit4(lunar_construction_pair(
                    binding,
                    moon,
                    Command::CancelConstruction { operation },
                ))
                .await
                .unwrap();
            drain_fleets(store, binding.universe).await;
            let cancelled = store.bound_world(binding).await.unwrap().facts.0;
            assert_eq!(cancelled.state.bodies[&moon].checkpoint.amounts, initial);
            assert_eq!(reserved_fields(&cancelled.state, moon).unwrap(), 0);
        } else {
            store.set_test_time(due).await.unwrap();
            drain_fleets(store, binding.universe).await;
            let principal = Principal {
                account: binding.account,
                player: binding.player,
                universe: binding.universe,
            };
            let view = GameService::new(reopened)
                .world_view(
                    principal,
                    QueryContext {
                        binding,
                        request_id: Uuid::new_v4(),
                    },
                )
                .await
                .unwrap();
            let moon_view = view
                .progression
                .bodies
                .iter()
                .find(|b| b.id == moon)
                .unwrap();
            assert_eq!(moon_view.fields, 4);
            assert_eq!(moon_view.fields_used, 1);
            assert_eq!(moon_view.fields_reserved, 0);
            let completed = store.bound_world(binding).await.unwrap().facts.0;
            assert_eq!(completed.state.bodies[&moon].fields, 1);
            assert_eq!(
                completed.state.bodies[&moon].levels[&Building::LunarBase],
                1
            );
            validate_moons(&completed.state).unwrap();
        }
    }
}
fn lunar_construction_pair(binding: Binding, moon: BodyId, command: Command) -> ForegroundAction {
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
                    body: Some(moon),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(id),
                },
            }),
        },
    }
}

fn prior_lunar_rules() -> Ruleset {
    let current = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 1).unwrap();
    let mut old = current.artifact.clone();
    for entry in old
        .catalog
        .iter_mut()
        .filter(|e| e.enabled && e.key != CatalogKey::Building(Building::LunarBase))
    {
        entry.body_kinds = [BodyKind::Planet].into();
    }
    old.buildings.remove(&Building::LunarBase);
    old.catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Building(Building::LunarBase))
        .unwrap()
        .enabled = false;
    Ruleset::from_artifact(old, 1).unwrap()
}

// Regression: enabling lunar catalog rows must reach the same durable queues,
// receipts and inventories as planetary work, without borrowing parent assets.
async fn exercise_lunar_industry(store: &PgStore, binding: Binding, parent: BodyId, moon: BodyId) {
    for building in [
        Building::RoboticsFactory,
        Building::RoboticsFactory,
        Building::LunarBase,
        Building::Shipyard,
        Building::Shipyard,
    ] {
        let before = store.bound_world(binding).await.unwrap().facts.0;
        let parent_before = before.state.bodies[&parent].clone();
        let request = QuoteRequest::Upgrade {
            body: moon,
            building,
        };
        let quote = inspect_progression(
            &before.state,
            Actor::Player(binding.player),
            &request,
            before.at,
            &before.rules,
        )
        .unwrap();
        assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
        let command = Command::StartUpgrade {
            body: moon,
            building,
            expected_terms_hash: quote.terms_hash.unwrap(),
        };
        store
            .bound_admit4(lunar_construction_pair(binding, moon, command))
            .await
            .unwrap();
        drain_fleets(store, binding.universe).await;
        let started = store.bound_world(binding).await.unwrap().facts.0;
        assert_eq!(started.state.bodies[&parent], parent_before);
        let due = started
            .state
            .constructions
            .values()
            .find(|c| c.body == moon && c.status == ConstructionStatus::Active)
            .unwrap()
            .due_at;
        store.set_test_time(due).await.unwrap();
        drain_fleets(store, binding.universe).await;
    }
    let before = store.bound_world(binding).await.unwrap().facts.0;
    let parent_before = before.state.bodies[&parent].clone();
    let initial = before.state.bodies[&moon].checkpoint.amounts;
    let mut total = Resources::default();
    for item in [
        ManufacturedItem::Ship(ShipType::SolarSatellite),
        ManufacturedItem::Defense(DefenseId::RocketLauncher),
    ] {
        let before = store.bound_world(binding).await.unwrap().facts.0;
        let quote = inspect_progression(
            &before.state,
            Actor::Player(binding.player),
            &QuoteRequest::Manufacture {
                body: moon,
                item,
                quantity: 2,
            },
            before.at,
            &before.rules,
        )
        .unwrap();
        assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
        let paid = quote.terms.unwrap().paid();
        total = Resources::from_values(std::array::from_fn(|i| {
            total.values()[i] + paid.values()[i]
        }));
        let pair = lunar_construction_pair(
            binding,
            moon,
            Command::StartManufacture {
                body: moon,
                item,
                quantity: 2,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        );
        store.bound_admit4(pair.clone()).await.unwrap();
        store.bound_admit4(pair).await.unwrap();
        drain_fleets(store, binding.universe).await;
    }
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let pending = reopened.bound_world(binding).await.unwrap().facts.0;
    assert_eq!(pending.state.bodies[&parent], parent_before);
    assert_eq!(
        pending.state.bodies[&moon].checkpoint.amounts,
        Resources::from_values(std::array::from_fn(
            |i| initial.values()[i] - total.values()[i]
        ))
    );
    let queue: Vec<_> = pending
        .state
        .manufacturing_batches
        .values()
        .filter(|b| b.body == moon && b.status == ManufacturingStatus::Active)
        .collect();
    assert_eq!(
        queue.len(),
        2,
        "duplicate commands must not charge or append twice"
    );
    let end = queue.iter().map(|b| b.final_due_at).max().unwrap();
    let locked = inspect_progression(
        &pending.state,
        Actor::Player(binding.player),
        &QuoteRequest::Demolition {
            body: moon,
            building: Building::Shipyard,
        },
        pending.at,
        &pending.rules,
    )
    .unwrap();
    assert!(
        locked
            .blockers
            .iter()
            .any(|b| b.code == GameError::YardLocked)
    );
    reopened.set_test_time(end).await.unwrap();
    drain_fleets(&reopened, binding.universe).await;
    let completed = reopened.bound_world(binding).await.unwrap().facts.0;
    for item in [
        ManufacturedItem::Ship(ShipType::SolarSatellite),
        ManufacturedItem::Defense(DefenseId::RocketLauncher),
    ] {
        assert_eq!(
            completed
                .state
                .inventories
                .iter()
                .find(|s| s.body == moon && s.item == item)
                .unwrap()
                .count,
            2
        );
    }
    assert_eq!(
        completed.state.bodies[&moon].checkpoint.amounts,
        pending.state.bodies[&moon].checkpoint.amounts
    );
    assert_eq!(completed.state.bodies[&parent], parent_before);
    assert_eq!(
        energy_stats(&completed.state.bodies[&moon], &completed.rules)
            .unwrap()
            .supply,
        0
    );
    assert_eq!(
        body_production_rates(
            &completed.state,
            &completed.state.bodies[&moon],
            &completed.rules
        )
        .unwrap(),
        Resources::default()
    );
    let view = GameService::new(reopened)
        .world_view(
            Principal {
                account: binding.account,
                player: binding.player,
                universe: binding.universe,
            },
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    let lunar = view
        .progression
        .bodies
        .iter()
        .find(|b| b.id == moon)
        .unwrap();
    assert_eq!((lunar.fields_used, lunar.fields), (6, 7));
}

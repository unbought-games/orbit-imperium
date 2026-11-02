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
async fn social(store: &PgStore, b: Binding, action: SocialAction) -> SocialCommandResult {
    store
        .social_command(SocialCommandRequest {
            context: QueryContext {
                binding: b,
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            action,
        })
        .await
        .unwrap()
}
async fn launch(
    store: &PgStore,
    b: Binding,
    origin: BodyId,
    host: Binding,
    target: BodyId,
    mission: Mission,
    scoped: bool,
) -> MissionFleet {
    let intent = FleetIntent {
        attack_group: None,
        hold_hours: (mission == Mission::Hold).then_some(1),
        origin,
        destination: MissionDestination::Body {
            id: target,
            expected_kind: BodyKind::Planet,
            expected_owner: host.player,
        },
        mission,
        ships: vec![ManifestStack {
            owner: b.player,
            ship_type: ShipType::SmallCargo,
            count: 1,
        }],
        cargo: Resources {
            metal: 100 * SCALE,
            ..Default::default()
        },
        speed_percent: if mission == Mission::Attack { 10 } else { 100 },
    };
    let (snap, _) = store
        .bound_world_query(
            b,
            WorldQueryKind::FleetQuote {
                intent: intent.clone(),
            },
        )
        .await
        .unwrap()
        .facts;
    let quote = quote_fleet(&snap.state, b.player, &intent, snap.at, &snap.rules).unwrap();
    let order = pair(
        b,
        origin,
        Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: quote.terms_hash.clone(),
            },
        },
    );
    store.bound_admit4(order).await.unwrap();
    drain(store, b.universe, scoped).await;
    store
        .bound_world(b)
        .await
        .unwrap()
        .facts
        .0
        .state
        .world
        .unwrap()
        .records
        .fleets
        .values()
        .find(|f| f.owner == b.player && f.intent.mission == mission)
        .unwrap()
        .clone()
}
#[tokio::test]
async fn holding_supply_combat_scope_growth_and_durable_retries_in_both_runtimes() {
    for scoped in [false, true] {
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
            .execute(&pool)
            .await
            .unwrap();
        let store = PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        let at = 1_790_000_000_000;
        store.set_test_time(at).await.unwrap();
        let u = UniverseId(Uuid::new_v4());
        let doc: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
            {"op":"add-player","user":"visitor","password":"password","planet":"1:50:8"},
            {"op":"add-player","user":"host","password":"password","planet":"1:51:8"},
            {"op":"add-player","user":"attacker","password":"password","planet":"1:52:8"},
            {"op":"set","user":"visitor","planet":"1:50:8","research":{"ComputerTechnology":4},"ships":{"SmallCargo":10},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}},
            {"op":"set","user":"host","planet":"1:51:8","buildings":{"AllianceDepot":1},"ships":{"Battleship":10},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}},
            {"op":"set","user":"attacker","planet":"1:52:8","research":{"ComputerTechnology":4},"ships":{"SmallCargo":200},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}}
        ]})).unwrap();
        store
            .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
            .await
            .unwrap();
        let a = binding(&store, "visitor").await;
        let h = binding(&store, "host").await;
        let enemy = binding(&store, "attacker").await;
        social(&store, a, SocialAction::RequestFriend { player: h.player }).await;
        social(
            &store,
            h,
            SocialAction::AcceptFriend {
                player: a.player,
                request: store
                    .social_query(SocialQueryRequest {
                        context: QueryContext {
                            binding: h,
                            request_id: Uuid::new_v4(),
                        },
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
                    .unwrap(),
            },
        )
        .await;
        if scoped {
            store.prepare_scoped_runtime(u, 100).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        let body = |snap: ReadSnapshot<(QuoteSnapshot, i64)>, owner| {
            snap.facts
                .0
                .state
                .bodies
                .values()
                .find(|b| b.owner == owner)
                .unwrap()
                .id
        };
        let origin = body(store.bound_world(a).await.unwrap(), a.player);
        let target = body(store.bound_world(h).await.unwrap(), h.player);
        let enemy_origin = body(store.bound_world(enemy).await.unwrap(), enemy.player);
        // Schedule the hostile arrival before the defender even launches.
        let attack = launch(
            &store,
            enemy,
            enemy_origin,
            h,
            target,
            Mission::Attack,
            scoped,
        )
        .await;
        let fleet = launch(&store, a, origin, h, target, Mission::Hold, scoped).await;
        assert!(fleet.due_at < attack.due_at);
        store.set_test_time(fleet.due_at).await.unwrap();
        drain(&store, u, scoped).await;
        let game = GameService::new(store.clone());
        // Ordinary host work sees read-only held commitments, without acquiring
        // visitor economy/policy scopes that this action neither reads nor mutates.
        let (host_snapshot, _) = store.bound_world(h).await.unwrap().facts;
        let settings = &host_snapshot.state.production_settings[&target];
        let mut changed_settings = settings.settings.clone();
        changed_settings.metal_mine = 50;
        let order = pair(
            h,
            target,
            Command::SetProduction {
                body: target,
                settings: changed_settings.clone(),
                expected_settings_revision: settings.revision,
            },
        );
        let order_id = order.gameplay.command_id;
        store.bound_admit4(order).await.unwrap();
        if scoped {
            let presence = game
                .step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap();
            assert!(matches!(presence, StepOutcome::Committed { .. }));
            let claim = store
                .claim_scoped(u, WorkerId(Uuid::new_v4()))
                .await
                .unwrap()
                .unwrap();
            let input_id: Uuid = sqlx::query_scalar(
                "SELECT input_id FROM commands WHERE universe=$1 AND actor=$2 AND command_id=$3",
            )
            .bind(u.0)
            .bind(h.player.0)
            .bind(order_id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(claim.input.id.0, input_id);
            let snapshot = store.load_scoped(&claim).await.unwrap();
            let facts = world_facts(&snapshot.state).unwrap();
            assert!(facts.records.fleets.contains_key(&fleet.id));
            assert!(!facts.covered_players.contains(&a.player));
            assert!(!facts.records.policies.contains_key(&a.player));
            assert!(
                vacation_view(&snapshot.state, h.player)
                    .unwrap()
                    .blockers
                    .iter()
                    .any(|b| b.kind == VacationBlockerKind::HostedFleet)
            );
            validate_asset_lineage(&snapshot.state).unwrap();
            assert!(matches!(
                game.resolve_scoped_claim(claim, &InlineEngine)
                    .await
                    .unwrap(),
                StepOutcome::Committed { .. }
            ));
        } else {
            drain(&store, u, scoped).await;
        }
        assert!(matches!(
            store.bound_receipt(h, order_id).await.unwrap().status,
            ReceiptStatus::Committed { .. }
        ));
        let (after_work, _) = store.bound_world(h).await.unwrap().facts;
        assert_eq!(
            after_work.state.production_settings[&target].settings,
            changed_settings
        );
        let held = &after_work.state.world.as_ref().unwrap().records.fleets[&fleet.id];
        assert_eq!(held.leg, MissionLeg::Holding);
        assert_eq!(held.ships, fleet.ships);
        assert_eq!(held.cargo, fleet.cargo);
        // Lifecycle commands declare the full participant scopes and reject entry.
        let mut enter = pair(
            h,
            target,
            Command::World {
                action: WorldAction::EnterVacation,
            },
        );
        if let CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence { body, .. },
        }) = &mut enter.presence.command
        {
            *body = None;
        }
        let enter_id = enter.gameplay.command_id;
        store.bound_admit4(enter).await.unwrap();
        drain(&store, u, scoped).await;
        assert!(matches!(
            store.bound_receipt(h, enter_id).await.unwrap().status,
            ReceiptStatus::Rejected {
                code: GameError::VacationBlocked
            }
        ));
        let view = game
            .world_view(
                Principal {
                    account: h.account,
                    player: h.player,
                    universe: u,
                },
                QueryContext {
                    binding: h,
                    request_id: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        assert_eq!(view.holdings.len(), 1);
        assert!(view.holdings[0].can_supply);
        let public = serde_json::to_value(&view.holdings[0]).unwrap();
        assert!(public.get("cargo").is_none() && public.get("research").is_none());
        let request = DepotSupplyIntent {
            source_planet: target,
            fleet: fleet.id,
            deuterium: 7000 * SCALE,
        };
        let (snap, _) = store
            .bound_world_query(
                h,
                WorldQueryKind::DepotSupplyQuote {
                    intent: request.clone(),
                },
            )
            .await
            .unwrap()
            .facts;
        let q = quote_depot_supply(&snap.state, h.player, &request, snap.at, &snap.rules).unwrap();
        let first = pair(
            h,
            target,
            Command::World {
                action: WorldAction::SupplyHoldingFleet {
                    intent: request.clone(),
                    expected_terms_hash: q.terms_hash.clone(),
                },
            },
        );
        let second = pair(
            h,
            target,
            Command::World {
                action: WorldAction::SupplyHoldingFleet {
                    intent: request,
                    expected_terms_hash: q.terms_hash.clone(),
                },
            },
        );
        let (one, two) = tokio::join!(
            store.bound_admit4(first.clone()),
            store.bound_admit4(second.clone())
        );
        one.unwrap();
        two.unwrap();
        drain(&store, u, scoped).await;
        let principal = Principal {
            account: h.account,
            player: h.player,
            universe: u,
        };
        let receipts = [
            game.bound_receipt(principal, h, first.gameplay.command_id)
                .await
                .unwrap(),
            game.bound_receipt(principal, h, second.gameplay.command_id)
                .await
                .unwrap(),
        ];
        assert_eq!(
            receipts
                .iter()
                .filter(|r| matches!(r.status, ReceiptStatus::Committed { .. }))
                .count(),
            1
        );
        assert_eq!(
            receipts
                .iter()
                .filter(|r| matches!(
                    r.status,
                    ReceiptStatus::Rejected {
                        code: GameError::DepotBudgetExceeded
                    }
                ))
                .count(),
            1
        );
        store.bound_admit4(first).await.unwrap();
        store.bound_admit4(second).await.unwrap();
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM depot_supplies WHERE universe=$1")
                .bind(u.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
        let restarted = PgStore::connect(&url).await.unwrap();
        let held = restarted
            .bound_world(a)
            .await
            .unwrap()
            .facts
            .0
            .state
            .world
            .unwrap()
            .records
            .fleets[&fleet.id]
            .clone();
        assert_eq!(held.due_at, q.departure_at);
        assert!(
            restarted
                .export_world_scenario(u)
                .await
                .unwrap_err()
                .to_string()
                .contains("Depot supply budget")
        );
        store.set_test_time(attack.due_at).await.unwrap();
        drain(&restarted, u, scoped).await;
        let reports: Vec<serde_json::Value> = sqlx::query_scalar(
            "SELECT data FROM mission_reports WHERE universe=$1 AND kind='Combat'",
        )
        .bind(u.0)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(reports.len(), 1);
        let report: MissionReport = serde_json::from_value(reports[0].clone()).unwrap();
        assert!(report.payloads.contains_key(&a.player));
        assert_eq!(
            report.payloads[&a.player]["participants"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
        // Current friendship is required for another supply but never revokes paid time.
        social(&restarted, h, SocialAction::Block { player: a.player }).await;
        let current = restarted
            .bound_world(a)
            .await
            .unwrap()
            .facts
            .0
            .state
            .world
            .unwrap()
            .records
            .fleets[&fleet.id]
            .clone();
        assert_eq!(current.due_at, q.departure_at);
        let recall = pair(
            a,
            origin,
            Command::World {
                action: WorldAction::RecallMission { fleet: fleet.id },
            },
        );
        restarted.bound_admit4(recall).await.unwrap();
        drain(&restarted, u, scoped).await;
        let returning = restarted
            .bound_world(a)
            .await
            .unwrap()
            .facts
            .0
            .state
            .world
            .unwrap()
            .records
            .fleets[&fleet.id]
            .clone();
        assert_eq!(returning.leg, MissionLeg::Returning);
        assert_eq!(returning.due_at, attack.due_at + fleet.terms.duration_ms);
        store.set_test_time(returning.due_at).await.unwrap();
        drain(&restarted, u, scoped).await;
        assert!(
            restarted
                .bound_world(a)
                .await
                .unwrap()
                .facts
                .0
                .state
                .world
                .unwrap()
                .records
                .fleets
                .values()
                .all(|f| !f.active())
        );
    }
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

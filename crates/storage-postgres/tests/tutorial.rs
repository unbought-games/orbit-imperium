//! Regressions: signup enrollment, cleanup scopes and authenticated tutorial mutations.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::json;
use uuid::Uuid;
enum Work {
    Serial(Claim),
    Scoped(ScopedClaim),
}
impl Work {
    fn input(&self) -> &OrderedInput {
        match self {
            Self::Serial(c) => &c.input,
            Self::Scoped(c) => &c.input,
        }
    }
    async fn load(&self, store: &PgStore) -> ClaimSnapshot {
        match self {
            Self::Serial(c) => store.load_claim(c).await.unwrap(),
            Self::Scoped(c) => store.load_scoped(c).await.unwrap(),
        }
    }
    async fn commit(
        &self,
        store: &PgStore,
        result: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        match self {
            Self::Serial(c) => store.commit_claim(c, result).await,
            Self::Scoped(c) => store.commit_scoped(c, result).await,
        }
    }
}
async fn claim(store: &PgStore, u: UniverseId, scoped: bool) -> Option<Work> {
    if scoped {
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .map(Work::Scoped)
    } else {
        store
            .claim_next(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .map(Work::Serial)
    }
}
async fn drain(store: &PgStore, u: UniverseId, scoped: bool) {
    for _ in 0..50 {
        let Some(c) = claim(store, u, scoped).await else {
            return;
        };
        let f = c.load(store).await;
        let result = transition(&f.state, c.input(), &f.rules);
        assert!(matches!(result, TransitionResult::Applied(_)), "{result:?}");
        assert!(matches!(
            c.commit(store, result).await.unwrap(),
            CommitOutcome::Committed { .. }
        ));
    }
    panic!("unexpected unbounded objective work");
}

fn principal(b: Binding) -> Principal {
    Principal {
        account: b.account,
        player: b.player,
        universe: b.universe,
    }
}
async fn submit(store: &PgStore, b: Binding, body: Option<BodyId>, command: Command) {
    let game = GameService::new(store.clone());
    let gameplay = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(command),
    };
    let presence = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body,
                cause: PresenceCause::GameplayGesture,
                paired_command_id: Some(gameplay.command_id),
            },
        }),
    };
    game.world_submit(principal(b), ForegroundAction { presence, gameplay })
        .await
        .unwrap();
}
async fn start(store: &PgStore, b: Binding, body: BodyId, q: QuoteRequest, scoped: bool) {
    let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
    let quote = quote(
        &snapshot.state,
        Actor::Player(b.player),
        &q,
        snapshot.at,
        &snapshot.rules,
    )
    .unwrap();
    let command = match q {
        QuoteRequest::Upgrade { building, .. } => Command::StartUpgrade {
            body,
            building,
            expected_terms_hash: quote.terms_hash,
        },
        QuoteRequest::Research { research, .. } => Command::StartResearch {
            host: body,
            research,
            expected_terms_hash: quote.terms_hash,
        },
        QuoteRequest::Manufacture { item, quantity, .. } => Command::StartManufacture {
            body,
            item,
            quantity,
            expected_terms_hash: quote.terms_hash,
        },
        _ => panic!("unsupported fixture request"),
    };
    submit(store, b, Some(body), command).await;
    drain(store, b.universe, scoped).await;
}

/// Explicit integration experiment: prove fresh signup can fund the authored
/// opening through actual PgStore-loaded facts, paid commands and scheduled events.
/// Kept out of routine CI because its purpose is authored balance measurement.
#[tokio::test]
#[ignore]
async fn signup_economy_experiment() {
    for speed in [2, 3] {
        for guided in [true, false] {
            Box::pin(run_signup_economy_case(speed, guided, false)).await;
        }
    }
}

/// Explicit perturbation: spend ordinary resources on unnecessary early storage
/// before Robotics, then earn the same opening and fund its continuation.
#[tokio::test]
#[ignore]
async fn signup_early_storage_experiment() {
    for speed in [2, 3] {
        Box::pin(run_signup_economy_case(speed, true, true)).await;
    }
}

async fn run_signup_economy_case(speed: i32, guided: bool, early_storage: bool) {
    let started = std::time::Instant::now();
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let mut now = 1000;
    store.set_test_time(now).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let target_name = format!("peer-{}", Uuid::new_v4());
    let rules = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), speed).unwrap();
    let doc:WorldScenario=serde_json::from_value(json!({"version":1,"rules":rules,"edits":[
        {"op":"add-player","user":target_name,"password":"password","planet":"1:50:8"},
        {"op":"set","user":target_name,"planet":"1:50:8","buildings":{"MetalMine":8,"CrystalMine":6,"SolarPlant":9},"resources":{"metal":6000,"crystal":3000,"deuterium":1000}}
    ]})).unwrap();
    store
        .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let auth = SessionService::new(store.clone())
        .signup(
            &format!("learner-{}", Uuid::new_v4()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 100,
            },
            None,
        )
        .await
        .unwrap();
    let b = store
        .current_binding(auth.session.account, u)
        .await
        .unwrap()
        .0;
    let initial = store.bound_world(b).await.unwrap().facts.0;
    let home = initial.state.world.as_ref().unwrap().homeworlds[&b.player];
    let initial_view = tutorial_view(&initial.state, &initial.rules, b.player, initial.at).unwrap();
    assert_eq!(
        initial_view
            .recommended_objectives
            .first()
            .map(String::as_str),
        Some("solar-1")
    );
    let initial_stock = initial.state.bodies[&home].checkpoint.amounts;
    assert_eq!(
        initial_stock,
        Resources::from_values([1000 * SCALE, 1000 * SCALE, 0])
    );
    assert!(initial.state.bodies[&home].levels.values().all(|n| *n == 0));
    assert!(
        initial
            .state
            .inventories
            .iter()
            .all(|s| s.owner != b.player || s.count == 0)
    );
    assert!(
        initial.state.research[&b.player]
            .levels
            .values()
            .all(|n| *n == 0)
    );
    // Repeated presentation choices preserve the actual economy and earned facts.
    for beginner in [false, true, guided] {
        submit(
            &store,
            b,
            None,
            Command::World {
                action: WorldAction::SetTutorialPresentation { beginner },
            },
        )
        .await;
        drain(&store, u, false).await;
        let after = store.bound_world(b).await.unwrap().facts.0.state;
        assert_eq!(after.bodies, initial.state.bodies);
        assert_eq!(
            after.world.as_ref().unwrap().records.objective_runs,
            initial.state.world.as_ref().unwrap().records.objective_runs
        );
        assert!(
            after
                .world
                .as_ref()
                .unwrap()
                .records
                .mission_sites
                .is_empty()
        );
    }
    // Ordinary independent targets need not be orbital. Record actual target
    // distance and fuel rather than changing travel rules to fit a deadline.
    let target: Uuid =
        sqlx::query_scalar("SELECT id FROM bodies WHERE universe=$1 AND owner<>$2 LIMIT 1")
            .bind(u.0)
            .bind(b.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let target_owner: Uuid = sqlx::query_scalar("SELECT owner FROM bodies WHERE id=$1")
        .bind(target)
        .fetch_one(&pool)
        .await
        .unwrap();
    let mut operations: Vec<serde_json::Value> = vec![];
    let mut completed_at = None;
    let mut receipt_count = 0;
    loop {
        let snapshot = store.bound_world(b).await.unwrap().facts.0;
        let s = &snapshot.state;
        let run = tutorial_run(s, b.player).unwrap();
        let w = s.world.as_ref().unwrap();
        if run.receipts.contains_key("reinvest") && completed_at.is_none() {
            completed_at = Some(now);
            receipt_count = run.receipts.len();
        }
        if let Some(completed_ms) = completed_at
            && s.bodies[&home].levels[&Building::MetalMine] >= 10
        {
            assert_eq!(run.receipts.len(), receipt_count);
            assert_eq!(receipt_count, tutorial_program().objectives.len());
            if guided {
                assert_eq!(w.records.mission_sites.len(), 2);
                assert!(
                    w.records
                        .mission_sites
                        .values()
                        .all(|site| site.retired() && site.active_references().is_empty())
                );
            } else {
                assert!(w.records.mission_sites.is_empty());
            }
            let grants = run.receipts.values().fold([0i64; 3], |mut total, r| {
                for (i, n) in r.resources.values().iter().enumerate() {
                    total[i] += n;
                }
                total
            });
            let retained: Vec<serde_json::Value> = sqlx::query_scalar(
                "SELECT data FROM mission_fleets WHERE universe=$1 AND owner=$2",
            )
            .bind(u.0)
            .bind(b.player.0)
            .fetch_all(&pool)
            .await
            .unwrap();
            let flights: Vec<MissionFleet> = retained
                .into_iter()
                .map(|v| serde_json::from_value(v).unwrap())
                .collect();
            let loot = flights
                .iter()
                .filter(|f| f.leg == MissionLeg::Returned)
                .filter_map(|f| f.raid.as_ref())
                .fold([0i64; 3], |mut total, r| {
                    for (i, n) in r.loot.values().iter().enumerate() {
                        total[i] += n;
                    }
                    total
                });
            assert!(loot.iter().sum::<i64>() > 0);
            if early_storage {
                assert_eq!(receipt_count, tutorial_program().objectives.len());
                assert_eq!(
                    run.receipts
                        .keys()
                        .cloned()
                        .collect::<std::collections::BTreeSet<_>>(),
                    tutorial_program()
                        .objectives
                        .into_iter()
                        .map(|d| d.id)
                        .collect(),
                );
                assert_eq!(grants, [25700 * SCALE, 16550 * SCALE, 5500 * SCALE]);
                assert_eq!(s.bodies[&home].levels[&Building::MetalStorage], 1);
                assert_eq!(flights.len(), 2);
                assert!(flights.iter().all(|f| {
                    f.leg == MissionLeg::Returned
                        && f.raid
                            .as_ref()
                            .is_some_and(|r| r.loot.values().iter().sum::<i64>() > 0)
                }));
                let storage: Vec<_> = operations
                    .iter()
                    .filter(|op| op["progression"]["request"]["building"] == "MetalStorage")
                    .collect();
                assert_eq!(storage.len(), 1);
                assert_eq!(storage[0]["progression"]["terms"]["source_level"], 0);
                assert_eq!(storage[0]["progression"]["terms"]["target_level"], 1);
                assert_eq!(
                    storage[0]["progression"]["terms"]["paid"],
                    json!({"metal":(1000 * SCALE).to_string(),"crystal":"0","deuterium":"0"})
                );
                let paid = operations.iter().fold([0i64; 3], |mut total, op| {
                    if let Some(progression) = op.get("progression") {
                        for (i, resource) in ["metal", "crystal", "deuterium"].iter().enumerate() {
                            total[i] += progression["terms"]["paid"][resource]
                                .as_str()
                                .unwrap()
                                .parse::<i64>()
                                .unwrap();
                        }
                    } else {
                        total[2] += op["fleet_terms"]["fuel"]
                            .as_str()
                            .unwrap()
                            .parse::<i64>()
                            .unwrap();
                    }
                    total
                });
                assert_eq!(paid, [25295 * SCALE, 10333 * SCALE, 3302 * SCALE]);
                assert_eq!(operations.len(), 42);
            }
            let repeated = store.bound_world(b).await.unwrap().facts.0.state;
            assert_eq!(
                tutorial_run(&repeated, b.player).unwrap().receipts,
                run.receipts
            );
            let result = json!({"speed":speed,"guided":guided,"early_storage":early_storage,"initial_stock":initial_stock,"completed_ms":completed_ms-1000,"continued_ms":now-1000,"final_stock":s.bodies[&home].checkpoint.amounts,"grants":grants,"loot":loot,"receipts":run.receipts,"flights":flights,"initial_view":initial_view,"final_view":tutorial_view(s,&snapshot.rules,b.player,now).unwrap(),"operations":operations,"wall_seconds":started.elapsed().as_secs_f64()});
            let directory = std::path::Path::new(if early_storage {
                "/tmp/orbit-chat6-balance-d2d8"
            } else {
                "/tmp/orbit-chat4-d2d8"
            });
            std::fs::create_dir_all(directory).unwrap();
            let file = directory.join(format!(
                "balance-{speed}-{}.json",
                if early_storage {
                    "guided-early-metal-storage"
                } else if guided {
                    "guided"
                } else {
                    "independent"
                }
            ));
            std::fs::write(&file, serde_json::to_vec_pretty(&result).unwrap()).unwrap();
            println!(
                "BALANCE speed={speed} guided={guided} early_storage={early_storage} completed={}m continued={}m output={} wall={}s",
                result["completed_ms"].as_i64().unwrap() as f64 / 60000.0,
                result["continued_ms"].as_i64().unwrap() as f64 / 60000.0,
                file.display(),
                started.elapsed().as_secs_f64()
            );
            break;
        }
        assert!(
            now < 1000 + 48 * 60 * 60 * 1000,
            "opening stalled: {:?}",
            operations.last()
        );
        if can_review_production(s, b.player) && !run.receipts.contains_key("production-settings") {
            submit(
                &store,
                b,
                None,
                Command::World {
                    action: WorldAction::ReviewProductionSettings,
                },
            )
            .await;
            drain(&store, u, false).await;
            continue;
        }
        let mut candidates = vec![];
        let levels = &s.bodies[&home].levels;
        let storage_due = early_storage
            && levels[&Building::MetalMine] >= 4
            && levels[&Building::CrystalMine] >= 3
            && levels[&Building::DeuteriumSynthesizer] >= 2
            && levels[&Building::MetalStorage] == 0;
        if storage_due {
            assert_eq!(levels[&Building::RoboticsFactory], 0);
            candidates.push(QuoteRequest::Upgrade {
                body: home,
                building: Building::MetalStorage,
            });
        } else if run.receipts.contains_key("haul") {
            candidates.push(QuoteRequest::Upgrade {
                body: home,
                building: Building::MetalMine,
            });
        } else if let Some((building, _)) = tutorial_build_plan()
            .into_iter()
            .find(|(building, level)| s.bodies[&home].levels[building] < *level)
        {
            candidates.push(QuoteRequest::Upgrade {
                body: home,
                building,
            });
        }
        for (research, level) in [
            (ResearchId::EnergyTechnology, 1),
            (ResearchId::CombustionDrive, 2),
        ] {
            if s.research[&b.player].levels[&research] < level {
                candidates.push(QuoteRequest::Research {
                    host: home,
                    research,
                });
                break;
            }
        }
        for (id, ship) in [
            ("fighter", ShipType::LightFighter),
            ("cargo", ShipType::SmallCargo),
        ] {
            if !run.receipts.contains_key(id)
                && !s.manufacturing_batches.values().any(|batch| {
                    batch.owner == b.player
                        && batch.completed_prefix < batch.quantity
                        && batch.item == ManufacturedItem::Ship(ship)
                })
            {
                candidates.push(QuoteRequest::Manufacture {
                    body: home,
                    item: ManufacturedItem::Ship(ship),
                    quantity: 1,
                });
            }
        }
        let ready = candidates.into_iter().find(|q| {
            inspect_progression(s, Actor::Player(b.player), q, now, &snapshot.rules)
                .unwrap()
                .blockers
                .is_empty()
        });
        if let Some(q) = ready {
            let inspection =
                inspect_progression(s, Actor::Player(b.player), &q, now, &snapshot.rules).unwrap();
            operations.push(json!({"at_ms":now,"progression":inspection,"balance":s.bodies[&home].checkpoint.amounts}));
            start(&store, b, home, q, false).await;
            continue;
        }
        let first = run.receipts.contains_key("fighter") && !run.receipts.contains_key("contact");
        let second = run.receipts.contains_key("contact")
            && run.receipts.contains_key("cargo")
            && !run.receipts.contains_key("haul");
        if (first || second)
            && !w
                .records
                .fleets
                .values()
                .any(|f| f.owner == b.player && f.active())
        {
            let destination = if guided {
                let id = tutorial_site_key(u, b.epoch, b.player, second).id();
                let site = &w.records.mission_sites[&id];
                MissionDestination::Site {
                    selection: SiteSelection {
                        id,
                        expected_revision: site.revision(),
                    },
                }
            } else {
                MissionDestination::Body {
                    id: BodyId(target),
                    expected_kind: BodyKind::Planet,
                    expected_owner: PlayerId(target_owner),
                }
            };
            let mut ships = vec![ManifestStack {
                owner: b.player,
                ship_type: ShipType::LightFighter,
                count: 1,
            }];
            if second {
                ships.push(ManifestStack {
                    owner: b.player,
                    ship_type: ShipType::SmallCargo,
                    count: 1,
                });
            }
            let intent = FleetIntent {
                origin: home,
                destination,
                mission: Mission::Attack,
                ships,
                cargo: Resources::default(),
                speed_percent: 100,
                attack_group: None,
                hold_hours: None,
            };
            let facts = store
                .bound_world_query(
                    b,
                    WorldQueryKind::FleetQuote {
                        intent: intent.clone(),
                    },
                )
                .await
                .unwrap()
                .facts
                .0;
            let terms = quote_fleet(&facts.state, b.player, &intent, now, &facts.rules).unwrap();
            operations.push(json!({"at_ms":now,"fleet_terms":terms}));
            submit(
                &store,
                b,
                Some(home),
                Command::World {
                    action: WorldAction::LaunchFleet {
                        intent,
                        expected_terms_hash: terms.terms_hash.clone(),
                    },
                },
            )
            .await;
            drain(&store, u, false).await;
            continue;
        }
        let due: Option<i64> =
            sqlx::query_scalar("SELECT min(at_ms) FROM pending_inputs WHERE universe=$1")
                .bind(u.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        now = due.unwrap_or(now + 60_000);
        store.set_test_time(now).await.unwrap();
        drain(&store, u, false).await;
    }
}

/// Regression: a scoped fresh signup's already seeded inactivity event must
/// include post-enrollment tutorial/homeworld dependencies without a later action.
#[tokio::test]
async fn idle_signup_cleanup_loads_its_original_enrollment_scopes() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe: u,
            immutable: UniverseImmutable::default(),
            policy: UniversePolicy::default(),
        })
        .await
        .unwrap();
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    let auth = SessionService::new(store.clone())
        .signup(
            &format!("idle-{}", Uuid::new_v4()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 100,
            },
            None,
        )
        .await
        .unwrap();
    let b = store
        .current_binding(auth.session.account, u)
        .await
        .unwrap()
        .0;
    let scope = serde_json::to_string(&ScopeKey::Site(
        tutorial_site_key(u, b.epoch, b.player, false).id(),
    ))
    .unwrap();
    let covered:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM input_scopes s JOIN scheduled_events e ON e.id=s.input_id WHERE s.universe=$1 AND e.event->>'type'='EmpireDeletionDue' AND s.scope_key=$2)").bind(u.0).bind(scope).fetch_one(&pool).await.unwrap();
    assert!(covered);
    // No foreground query/action occurs between signup and either scheduled check.
    for _ in 0..2 {
        let due: i64 =
            sqlx::query_scalar("SELECT min(at_ms) FROM pending_inputs WHERE universe=$1")
                .bind(u.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        store.set_test_time(due).await.unwrap();
        drain(&store, u, true).await;
    }
    let lifecycle: String = sqlx::query_scalar(
        "SELECT data->>'lifecycle' FROM player_policies WHERE universe=$1 AND id=$2",
    )
    .bind(u.0)
    .bind(b.player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(lifecycle, "Removed");
    let receipts: serde_json::Value = sqlx::query_scalar(
        "SELECT data->'receipts' FROM objective_runs WHERE universe=$1 AND beneficiary=$2",
    )
    .bind(u.0)
    .bind(b.player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(receipts.as_object().unwrap().is_empty());
}

/// Regression: reviewing controls pays once without changing allocations or prior receipts.
#[tokio::test]
async fn production_review_preserves_history_and_pays_once() {
    {
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let store = PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        store.set_test_time(1000).await.unwrap();
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let u = UniverseId(Uuid::new_v4());
        let username = format!("review-{}", Uuid::new_v4());
        let rules = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 3).unwrap();
        let doc: WorldScenario = serde_json::from_value(json!({"version":1,"rules":rules,"edits":[
            {"op":"add-player","user":username,"password":"password","planet":"1:50:8"},
            {"op":"set","user":username,"planet":"1:50:8","buildings":{"MetalMine":2,"CrystalMine":2,"SolarPlant":2},"resources":{"metal":1000,"crystal":1000,"deuterium":0}}
        ]})).unwrap();
        store
            .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
            .await
            .unwrap();
        let auth = SessionService::new(store.clone())
            .login(&username, "password", None)
            .await
            .unwrap();
        let b = store
            .current_binding(auth.session.account, u)
            .await
            .unwrap()
            .0;
        let snapshot = store.bound_world(b).await.unwrap().facts.0;
        let home = snapshot.state.world.as_ref().unwrap().homeworlds[&b.player];
        store.prepare_scoped_runtime(u, 100).await.unwrap();
        store.activate_scoped_runtime(u).await.unwrap();
        start(
            &store,
            b,
            home,
            QuoteRequest::Upgrade {
                body: home,
                building: Building::MetalMine,
            },
            true,
        )
        .await;
        let due:i64 = sqlx::query_scalar("SELECT min(at_ms) FROM scheduled_events WHERE universe=$1 AND event->>'type'='ConstructionDue' AND NOT done").bind(u.0).fetch_one(&pool).await.unwrap();
        store.set_test_time(due).await.unwrap();
        drain(&store, u, true).await;
        let before = store.bound_world(b).await.unwrap().facts.0;
        let receipts = tutorial_run(&before.state, b.player)
            .unwrap()
            .receipts
            .clone();
        assert!(!receipts.is_empty());
        let stock = before.state.bodies[&home].checkpoint.amounts;
        let allocations = before.state.production_settings.clone();
        let upgraded = store.bound_world(b).await.unwrap().facts.0;
        let run = tutorial_run(&upgraded.state, b.player).unwrap();
        assert_eq!(run.receipts, receipts);
        assert_eq!(upgraded.state.bodies[&home].checkpoint.amounts, stock);
        let view = tutorial_view(&upgraded.state, &upgraded.rules, b.player, upgraded.at).unwrap();
        let review = view.chapters[0]
            .objectives
            .iter()
            .find(|o| o.id == "production-settings")
            .unwrap();
        assert!(!review.completed);
        assert_eq!(review.reward.metal, "200000000");
        assert_eq!(view.recommended_objectives[0], "production-settings");
        for _ in 0..2 {
            submit(
                &store,
                b,
                None,
                Command::World {
                    action: WorldAction::ReviewProductionSettings,
                },
            )
            .await;
            drain(&store, u, true).await;
        }
        let after = store.bound_world(b).await.unwrap().facts.0;
        let run = tutorial_run(&after.state, b.player).unwrap();
        assert_eq!(run.receipts.len(), receipts.len() + 1);
        for (id, receipt) in receipts {
            assert_eq!(run.receipts[&id], receipt);
        }
        assert_eq!(
            after.state.bodies[&home].checkpoint.amounts,
            Resources {
                metal: stock.metal + 200 * SCALE,
                crystal: stock.crystal + 100 * SCALE,
                deuterium: stock.deuterium
            }
        );
        assert_eq!(after.state.production_settings, allocations);
        let paid = run.receipts.clone();
        let restored = store.bound_world(b).await.unwrap().facts.0;
        assert_eq!(
            tutorial_run(&restored.state, b.player).unwrap().receipts,
            paid
        );
    }
}

/// Regression: 0039's real JSON set ordering must support retained-world writes,
/// not merely deserialize or pass schema/readiness checks.
#[tokio::test]
async fn migrated_objective_sets_commit_after_encoding_repair() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let migration = include_str!("../migrations/0039_onboarding.sql");
    let program: serde_json::Value =
        serde_json::from_str(migration.split("$program$").nth(1).unwrap()).unwrap();
    let typed: ObjectiveProgram = serde_json::from_value(program.clone()).unwrap();
    assert_ne!(program, serde_json::to_value(&typed).unwrap());
    for scoped in [false, true] {
        store.set_test_time(1000).await.unwrap();
        let u = UniverseId(Uuid::new_v4());
        let username = format!("migrated-{}", Uuid::new_v4());
        let rules = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 3).unwrap();
        let doc: WorldScenario = serde_json::from_value(json!({"version":1,"rules":rules,"edits":[
            {"op":"add-player","user":username,"password":"password","planet":"1:50:8"},
            {"op":"set","user":username,"planet":"1:50:8","buildings":{"SolarPlant":2}}
        ]}))
        .unwrap();
        store
            .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
            .await
            .unwrap();
        let auth = SessionService::new(store.clone())
            .login(&username, "password", None)
            .await
            .unwrap();
        let b = store
            .current_binding(auth.session.account, u)
            .await
            .unwrap()
            .0;
        if scoped {
            store.prepare_scoped_runtime(u, 100).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        // Recreate the exact published migration's program representation.
        sqlx::query(
            "UPDATE objective_runs SET data=jsonb_set(data,'{program}',$2) WHERE universe=$1",
        )
        .bind(u.0)
        .bind(&program)
        .execute(&pool)
        .await
        .unwrap();
        let before: serde_json::Value =
            sqlx::query_scalar("SELECT data FROM objective_runs WHERE universe=$1")
                .bind(u.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        store.set_test_time(2000).await.unwrap();
        submit(
            &store,
            b,
            None,
            Command::World {
                action: WorldAction::ReviewProductionSettings,
            },
        )
        .await;
        // Presence commits first; the objective-changing input retries forever.
        let c = loop {
            let c = claim(&store, u, scoped).await.unwrap();
            let f = c.load(&store).await;
            let outcome = c
                .commit(&store, transition(&f.state, c.input(), &f.rules))
                .await
                .unwrap();
            match outcome {
                CommitOutcome::Committed { .. } => continue,
                CommitOutcome::Conflict => break c,
                other => panic!("unexpected result {other:?}"),
            }
        };
        let original_input = c.input().clone();
        sqlx::raw_sql(include_str!(
            "../migrations/0040_objective_set_encoding.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        let repaired: serde_json::Value =
            sqlx::query_scalar("SELECT data FROM objective_runs WHERE universe=$1")
                .bind(u.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            serde_json::from_value::<ObjectiveRun>(before).unwrap(),
            serde_json::from_value::<ObjectiveRun>(repaired.clone()).unwrap()
        );
        assert_eq!(
            repaired,
            serde_json::to_value(serde_json::from_value::<ObjectiveRun>(repaired.clone()).unwrap())
                .unwrap()
        );
        assert_eq!(
            sqlx::raw_sql(include_str!(
                "../migrations/0040_objective_set_encoding.sql"
            ))
            .execute(&pool)
            .await
            .unwrap()
            .rows_affected(),
            0
        );
        let f = c.load(&store).await;
        assert!(matches!(
            c.commit(&store, transition(&f.state, c.input(), &f.rules))
                .await
                .unwrap(),
            CommitOutcome::Committed { .. }
        ));
        assert_eq!(*c.input(), original_input);
        let after = store.bound_world(b).await.unwrap().facts.0;
        let run = tutorial_run(&after.state, b.player).unwrap();
        assert_eq!(run.receipts.len(), 1);
        assert!(run.receipts.contains_key("production-settings"));
        let committed_input: serde_json::Value =
            sqlx::query_scalar("SELECT input FROM transition_journal WHERE input_id=$1")
                .bind(original_input.id.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            serde_json::from_value::<OrderedInput>(committed_input).unwrap(),
            original_input
        );
    }
}

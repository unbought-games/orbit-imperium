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
async fn missiles_manufacture_launch_intercept_restart_and_audit_in_both_runtimes() {
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
        let doc:WorldScenario=serde_json::from_value(json!({"version":1,"edits":[
      {"op":"add-player","user":"shooter","password":"password","planet":"1:50:8"},
      {"op":"add-player","user":"defender","password":"password","planet":"1:51:8"},
      {"op":"set","user":"shooter","planet":"1:50:8","buildings":{"MissileSilo":4,"Shipyard":1},"research":{"ImpulseDrive":5},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}},
      {"op":"set","user":"defender","planet":"1:51:8","buildings":{"MissileSilo":4,"Shipyard":1},"research":{"ImpulseDrive":5},"missiles":{"AntiBallisticMissile":4},"defenses":{"RocketLauncher":500}}
    ]})).unwrap();
        store
            .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
            .await
            .unwrap();
        let a = binding(&store, "shooter").await;
        let d = binding(&store, "defender").await;
        if scoped {
            store.prepare_scoped_runtime(u, 100).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        let (snap, _) = store.bound_world(a).await.unwrap().facts;
        let b = snap
            .state
            .bodies
            .values()
            .find(|b| b.owner == a.player)
            .unwrap()
            .id;
        let target = store
            .bound_world(d)
            .await
            .unwrap()
            .facts
            .0
            .state
            .bodies
            .values()
            .find(|b| b.owner == d.player)
            .unwrap()
            .id;
        let request = QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Missile(MissileId::InterplanetaryMissile),
            quantity: 10,
        };
        let q = inspect_progression(
            &snap.state,
            Actor::Player(a.player),
            &request,
            at,
            &snap.rules,
        )
        .unwrap();
        assert!(q.blockers.is_empty());
        let order = pair(
            a,
            b,
            Command::StartManufacture {
                body: b,
                item: ManufacturedItem::Missile(MissileId::InterplanetaryMissile),
                quantity: 10,
                expected_terms_hash: q.terms_hash.unwrap(),
            },
        );
        store.bound_admit4(order).await.unwrap();
        drain(&store, u, scoped).await;
        let (snap, _) = store.bound_world(a).await.unwrap().facts;
        let batch = snap.state.manufacturing_batches.values().next().unwrap();
        let completed_at = batch.final_due_at;
        store.set_test_time(completed_at).await.unwrap();
        drain(&store, u, scoped).await;
        let game = GameService::new(store.clone());
        let principal = Principal {
            account: a.account,
            player: a.player,
            universe: u,
        };
        let intent = MissileIntent {
            origin: b,
            target: MissileTarget {
                id: target,
                expected_owner: d.player,
                expected_kind: BodyKind::Planet,
            },
            count: 8,
            primary: Some(DefenseId::RocketLauncher),
        };
        let query = WorldQuery {
            context: QueryContext {
                binding: a,
                request_id: Uuid::new_v4(),
            },
            query: WorldQueryKind::MissileQuote {
                intent: intent.clone(),
            },
        };
        let q: MissileTerms = serde_json::from_value(
            game.world_query(principal, query)
                .await
                .unwrap()
                .data
                .clone(),
        )
        .unwrap();
        let launch = pair(
            a,
            b,
            Command::World {
                action: WorldAction::LaunchMissiles {
                    intent,
                    expected_terms_hash: q.terms_hash,
                },
            },
        );
        let receipt = store.bound_admit4(launch.clone()).await.unwrap();
        store.bound_admit4(launch.clone()).await.unwrap();
        drain(&store, u, scoped).await;
        let receipt2 = game
            .bound_receipt(principal, a, launch.gameplay.command_id)
            .await
            .unwrap();
        assert!(
            matches!(receipt2.status, ReceiptStatus::Committed { .. }),
            "{receipt:?} {receipt2:?}"
        );
        let (snap, _) = store.bound_world(a).await.unwrap().facts;
        let f = snap
            .state
            .world
            .as_ref()
            .unwrap()
            .records
            .missiles
            .values()
            .next()
            .unwrap()
            .clone();
        let defender_view = game
            .world_view(
                Principal {
                    account: d.account,
                    player: d.player,
                    universe: u,
                },
                QueryContext {
                    binding: d,
                    request_id: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        assert_eq!(defender_view.missiles.len(), 1);
        assert!(!defender_view.missiles[0].outgoing);
        assert_eq!(defender_view.missiles[0].count, "8");
        let wire = serde_json::to_string(&defender_view.missiles).unwrap();
        assert!(!wire.contains("primary"));
        assert!(!wire.contains("weapons"));
        let rules = RulesService::new(store.clone());
        let mut update = rules.export(u).await.unwrap();
        update.speed = 3;
        match rules.apply(&update).await {
            Ok(_) => {}
            Err(RulesUpdateError::Pending { .. }) if scoped => {
                assert!(store.process_runtime_barrier(u).await.unwrap());
            }
            x => panic!("{x:?}"),
        }
        let restarted = PgStore::connect(&url).await.unwrap();
        restarted.set_test_time(f.due_at).await.unwrap();
        drain(&restarted, u, scoped).await;
        let rows: Vec<serde_json::Value> = sqlx::query_scalar(
            "SELECT data FROM mission_reports WHERE universe=$1 AND kind='MissileImpact'",
        )
        .bind(u.0)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(rows.len(), 1);
        let report: MissionReport = serde_json::from_value(rows[0].clone()).unwrap();
        assert_eq!(report.payloads[&a.player]["intercepted"], "4");
        assert_eq!(
            report.payloads[&a.player]["destroyed"]["RocketLauncher"],
            "240"
        );
        assert!(
            report.payloads[&a.player]
                .get("interceptors_remaining")
                .is_none()
        );
        assert_eq!(report.payloads[&d.player]["interceptors_remaining"], "0");
        store.bound_admit4(launch).await.unwrap();
        drain(&restarted, u, scoped).await;
        let n: i64 = sqlx::query_scalar("SELECT count(*) FROM missile_flights WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 1);
        let view = GameService::new(restarted.clone())
            .world_view(
                principal,
                QueryContext {
                    binding: a,
                    request_id: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        assert!(view.missiles.is_empty());
        assert_eq!(
            view.progression
                .bodies
                .iter()
                .find(|x| x.id == b)
                .unwrap()
                .silo
                .as_ref()
                .unwrap()
                .occupied,
            4
        );
        let export = restarted.export_world_scenario(u).await.unwrap();
        assert!(export.edits.iter().any(|e| !e.missiles.is_empty()));
        restarted.audit_universe(u).await.unwrap();
    }
}

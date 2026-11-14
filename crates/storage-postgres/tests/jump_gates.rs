//! Atomic transfer/recovery and normal rules activation on real PostgreSQL.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;
const AT: i64 = 1_790_000_000_000;
struct Fixture {
    store: PgStore,
    pool: PgPool,
    u: UniverseId,
    b: Binding,
    moons: Vec<BodyId>,
    rules: Ruleset,
}
fn principal(b: Binding) -> Principal {
    Principal {
        account: b.account,
        player: b.player,
        universe: b.universe,
    }
}
fn context(b: Binding) -> QueryContext {
    QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    }
}
async fn setup(scoped: bool) -> Fixture {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&pool)
        .await
        .unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(AT).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let scenario: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"jumper","password":"password","planet":"1:1:8"},
        {"op":"set","user":"jumper","research":{"astrophysics":1}},
        {"op":"set","user":"jumper","planet":"1:1:8","ships":{"SmallCargo":20}},
        {"op":"add-planet","user":"jumper","planet":"1:2:8"}
    ]}))
    .unwrap();
    store
        .apply_world_scenario(u, &scenario, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let login = SessionService::new(store.clone())
        .login("jumper", "password", None)
        .await
        .unwrap();
    let b = GameService::new(store.clone())
        .current_binding(login.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let rules = store.load_rules(u).await.unwrap();
    let parents: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM bodies WHERE owner=$1 ORDER BY system")
            .bind(b.player.0)
            .fetch_all(&pool)
            .await
            .unwrap();
    let mut moons = vec![];
    for parent in parents {
        let input = InputId(Uuid::new_v4());
        let moon = BodyId(derived_id(input, "moon:0"));
        sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,revision) SELECT $2,universe,owner,'Moon',galaxy,system,position,1,0,$3,carry,checkpoint_at,0 FROM bodies WHERE id=$1")
            .bind(parent).bind(moon.0).bind(sqlx::types::Json(Resources::default())).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO building_levels(body,building,level) SELECT $2,building,CASE WHEN building='JumpGate' THEN 1 ELSE 0 END FROM building_levels WHERE body=$1").bind(parent).bind(moon.0).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO production_settings(body,revision,data) SELECT $2,0,jsonb_set(jsonb_set(data,'{body}',to_jsonb($2::text)),'{revision}','0') FROM production_settings WHERE body=$1").bind(parent).bind(moon.0).execute(&pool).await.unwrap();
        for kind in [
            "production".to_owned(),
            "constructions".into(),
            "manufacturing".into(),
            format!("inventory:{}", b.player),
        ] {
            sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
                .bind(u.0)
                .bind(kind)
                .bind(moon.0)
                .execute(&pool)
                .await
                .unwrap();
        }
        let genesis = MoonGenesis {
            body: moon,
            parent: BodyId(parent),
            diameter_km: 8366,
            created_at: AT,
            input,
            profile: MOON_PROFILE.into(),
        };
        sqlx::query("INSERT INTO moon_genesis(universe,id,parent,data) VALUES($1,$2,$3,$4)")
            .bind(u.0)
            .bind(moon.0)
            .bind(parent)
            .bind(sqlx::types::Json(genesis))
            .execute(&pool)
            .await
            .unwrap();
        // Move the prepared ships and their exact acquisition lots to the source moon.
        sqlx::query("UPDATE inventories SET body=$2 WHERE body=$1")
            .bind(parent)
            .bind(moon.0)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE asset_lots SET data=jsonb_set(data,'{location,Body}',to_jsonb($2::text)) WHERE universe=$3 AND data->'location'->>'Body'=$1 AND data->'item'->>'kind'='Ship'")
            .bind(parent.to_string()).bind(moon.0).bind(u.0).execute(&pool).await.unwrap();
        let lot = AssetLot {
            id: OperationId(Uuid::new_v4()),
            owner: b.player,
            item: CatalogKey::Building(Building::JumpGate),
            level: Some(1),
            location: AssetLocation::Body(moon),
            quantity: 1,
            unit_value_micro: 8_000_000 * SCALE,
            rules_hash: rules.hash.clone(),
            source_operation: OperationId(input.0),
            acquired_at: AT,
            acquired_sequence: 0,
        };
        sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
            .bind(u.0)
            .bind(lot.id.to_string())
            .bind(sqlx::types::Json(lot))
            .execute(&pool)
            .await
            .unwrap();
        moons.push(moon);
    }
    if scoped {
        store.prepare_scoped_runtime(u, 100).await.unwrap();
        store.activate_scoped_runtime(u).await.unwrap();
    }
    Fixture {
        store,
        pool,
        u,
        b,
        moons,
        rules,
    }
}
fn intent(f: &Fixture, reverse: bool) -> JumpIntent {
    JumpIntent {
        source: f.moons[usize::from(reverse)],
        destination: f.moons[usize::from(!reverse)],
        ships: vec![ManifestStack {
            owner: f.b.player,
            ship_type: ShipType::SmallCargo,
            count: 7,
        }],
    }
}
async fn quote(f: &Fixture, intent: JumpIntent) -> JumpQuote {
    let result = GameService::new(f.store.clone())
        .world_query(
            principal(f.b),
            WorldQuery {
                context: context(f.b),
                query: WorldQueryKind::JumpQuote { intent },
            },
        )
        .await
        .unwrap();
    serde_json::from_value(result.facts.data).unwrap()
}
fn action(f: &Fixture, q: JumpQuote) -> ForegroundAction {
    let id = CommandId(Uuid::new_v4());
    let source = q.intent.source;
    ForegroundAction {
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding: f.b,
            command_id: id,
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::JumpShips {
                    intent: q.intent,
                    expected_terms_hash: q.terms_hash,
                },
            }),
        },
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding: f.b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(source),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(id),
                },
            }),
        },
    }
}
async fn drain(f: &Fixture, scoped: bool) {
    let game = GameService::new(f.store.clone());
    for _ in 0..30 {
        let result = if scoped {
            game.step_scoped(f.u, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
        } else {
            game.step(f.u, WorkerId(Uuid::new_v4())).await
        }
        .unwrap();
        if matches!(result, StepOutcome::Idle) {
            return;
        }
    }
    panic!("fixture did not drain");
}
async fn receipt(f: &Fixture, p: &ForegroundAction) -> BoundReceipt {
    GameService::new(f.store.clone())
        .bound_receipt(principal(f.b), f.b, p.gameplay.command_id)
        .await
        .unwrap()
}
async fn counts(f: &Fixture) -> Vec<i64> {
    let mut counts = vec![];
    for b in &f.moons {
        counts.push(sqlx::query_scalar("SELECT COALESCE(sum(count),0)::bigint FROM inventories WHERE body=$1 AND item->>'kind'='Ship' AND item->>'id'='SmallCargo'").bind(b.0).fetch_one(&f.pool).await.unwrap());
    }
    counts
}
#[tokio::test]
async fn serial_and_scoped_competing_jumps_conserve_ships_and_recover_original_receipt_after_restart()
 {
    for scoped in [false, true] {
        let mut f = setup(scoped).await;
        let q = quote(&f, intent(&f, false)).await;
        let first = action(&f, q.clone());
        let second = action(&f, q);
        let game = GameService::new(f.store.clone());
        let (a, b) = tokio::join!(
            game.world_submit(principal(f.b), first.clone()),
            game.world_submit(principal(f.b), second.clone())
        );
        a.unwrap();
        b.unwrap();
        drain(&f, scoped).await;
        let receipts = [receipt(&f, &first).await, receipt(&f, &second).await];
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
                        code: GameError::GateCooling
                    }
                ))
                .count(),
            1
        );
        assert_eq!(counts(&f).await, vec![13, 7]);
        let uses: Vec<GateUse> = sqlx::query_scalar::<_, serde_json::Value>(
            "SELECT data FROM jump_gate_uses ORDER BY body",
        )
        .fetch_all(&f.pool)
        .await
        .unwrap()
        .into_iter()
        .map(|v| serde_json::from_value(v).unwrap())
        .collect();
        assert_eq!(uses.len(), 2);
        assert_eq!(uses[0].input, uses[1].input);
        let no_flights: i64 = sqlx::query_scalar("SELECT count(*) FROM mission_fleets")
            .fetch_one(&f.pool)
            .await
            .unwrap();
        assert_eq!(no_flights, 0);
        let successful = if matches!(receipts[0].status, ReceiptStatus::Committed { .. }) {
            &first
        } else {
            &second
        };
        let original = receipt(&f, successful).await;
        f.store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        GameService::new(f.store.clone())
            .world_submit(principal(f.b), successful.clone())
            .await
            .unwrap();
        drain(&f, scoped).await;
        assert_eq!(
            serde_json::to_value(receipt(&f, successful).await).unwrap(),
            serde_json::to_value(original).unwrap()
        );
        assert_eq!(counts(&f).await, vec![13, 7]);
        let ready = uses[0].ready_at().unwrap();
        f.store.set_test_time(ready - 1).await.unwrap();
        assert!(matches!(
            GameService::new(f.store.clone())
                .world_query(
                    principal(f.b),
                    WorldQuery {
                        context: context(f.b),
                        query: WorldQueryKind::JumpQuote {
                            intent: intent(&f, true)
                        }
                    }
                )
                .await,
            Err(ServiceError::GameRejected(GameError::GateCooling))
        ));
        f.store.set_test_time(ready).await.unwrap();
        let reverse = action(&f, quote(&f, intent(&f, true)).await);
        GameService::new(f.store.clone())
            .world_submit(principal(f.b), reverse.clone())
            .await
            .unwrap();
        drain(&f, scoped).await;
        assert!(matches!(
            receipt(&f, &reverse).await.status,
            ReceiptStatus::Committed { .. }
        ));
        assert_eq!(counts(&f).await, vec![20, 0]);
        // Projection is reconstructed from durable facts after reconnecting.
        let snapshot = GameService::new(f.store.clone())
            .world_view(principal(f.b), context(f.b))
            .await
            .unwrap();
        for body in snapshot
            .facts
            .progression
            .bodies
            .iter()
            .filter(|b| b.kind == BodyKind::Moon)
        {
            assert_eq!(
                body.jump_gate.as_ref().unwrap().ready_at,
                ready + jump_cooldown(&f.rules).unwrap()
            );
        }
    }
}
#[tokio::test]
async fn ordinary_rules_deactivation_blocks_new_commands_but_preserves_cooldowns_and_receipts() {
    let f = setup(false).await;
    let command = action(&f, quote(&f, intent(&f, false)).await);
    let service = RulesService::new(f.store.clone());
    let enabled = service.export(f.u).await.unwrap();
    let mut disabled = enabled.clone();
    disabled.artifact.world.as_mut().unwrap().jump_gates = None;
    let mut activation = service.export(f.u).await.unwrap();
    activation.artifact = disabled.artifact.clone();
    service.apply(&activation).await.unwrap();
    let game = GameService::new(f.store.clone());
    assert!(
        game.world_submit(principal(f.b), command.clone())
            .await
            .is_err()
    );
    let admitted: i64 = sqlx::query_scalar("SELECT count(*) FROM commands WHERE command_id=$1")
        .bind(command.gameplay.command_id.0)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert_eq!(admitted, 0);
    let mut activation = service.export(f.u).await.unwrap();
    activation.artifact = enabled.artifact.clone();
    service.apply(&activation).await.unwrap();
    game.world_submit(principal(f.b), command.clone())
        .await
        .unwrap();
    drain(&f, false).await;
    assert!(matches!(
        receipt(&f, &command).await.status,
        ReceiptStatus::Committed { .. }
    ));
    let mut activation = service.export(f.u).await.unwrap();
    activation.artifact = disabled.artifact.clone();
    service.apply(&activation).await.unwrap();
    game.world_submit(principal(f.b), command.clone())
        .await
        .unwrap();
    assert_eq!(counts(&f).await, vec![13, 7]);
    let gates: i64 = sqlx::query_scalar("SELECT count(*) FROM jump_gate_uses")
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert_eq!(gates, 2);
    let mut activation = service.export(f.u).await.unwrap();
    activation.artifact = enabled.artifact.clone();
    service.apply(&activation).await.unwrap();
    assert!(matches!(
        game.world_query(
            principal(f.b),
            WorldQuery {
                context: context(f.b),
                query: WorldQueryKind::JumpQuote {
                    intent: intent(&f, true)
                }
            }
        )
        .await,
        Err(ServiceError::GameRejected(GameError::GateCooling))
    ));
}

#[tokio::test]
async fn jump_and_launch_use_one_inventory_and_never_commit_partial_cooldowns() {
    for jump_first in [false, true] {
        let f = setup(true).await;
        sqlx::query("UPDATE bodies SET amounts=$2 WHERE id=$1")
            .bind(f.moons[0].0)
            .bind(sqlx::types::Json(Resources {
                deuterium: 5_000_000 * SCALE,
                ..Default::default()
            }))
            .execute(&f.pool)
            .await
            .unwrap();
        let game = GameService::new(f.store.clone());
        let q = quote(&f, intent(&f, false)).await;
        let jump = action(&f, q.clone());
        let mut launch = action(&f, q);
        let fleet = FleetIntent {
            origin: f.moons[0],
            destination: MissionDestination::Body {
                id: f.moons[1],
                expected_kind: BodyKind::Moon,
                expected_owner: f.b.player,
            },
            mission: Mission::Transport,
            ships: vec![ManifestStack {
                owner: f.b.player,
                ship_type: ShipType::SmallCargo,
                count: 20,
            }],
            cargo: Resources::default(),
            speed_percent: 100,
            attack_group: None,
            hold_hours: None,
        };
        let quoted = game
            .world_query(
                principal(f.b),
                WorldQuery {
                    context: context(f.b),
                    query: WorldQueryKind::FleetQuote {
                        intent: fleet.clone(),
                    },
                },
            )
            .await
            .unwrap();
        launch.gameplay.command = CommandDto3::Progression(Command::World {
            action: WorldAction::LaunchFleet {
                intent: fleet,
                expected_terms_hash: serde_json::from_value(
                    quoted.facts.data["terms_hash"].clone(),
                )
                .unwrap(),
            },
        });
        let (first, second) = if jump_first {
            (&jump, &launch)
        } else {
            (&launch, &jump)
        };
        game.world_submit(principal(f.b), first.clone())
            .await
            .unwrap();
        game.world_submit(principal(f.b), second.clone())
            .await
            .unwrap();
        drain(&f, true).await;
        assert!(matches!(
            receipt(&f, first).await.status,
            ReceiptStatus::Committed { .. }
        ));
        assert!(matches!(
            receipt(&f, second).await.status,
            ReceiptStatus::Rejected {
                code: GameError::InsufficientShips
            }
        ));
        let gate_count: i64 = sqlx::query_scalar("SELECT count(*) FROM jump_gate_uses")
            .fetch_one(&f.pool)
            .await
            .unwrap();
        assert_eq!(gate_count, if jump_first { 2 } else { 0 });
        assert_eq!(
            counts(&f).await,
            if jump_first { vec![13, 7] } else { vec![0, 0] }
        );
    }
}

#[tokio::test]
async fn parent_abandonment_removes_only_that_moons_gate_commitment() {
    let f = setup(true).await;
    let game = GameService::new(f.store.clone());
    let q = quote(&f, intent(&f, false)).await;
    let jump = action(&f, q.clone());
    game.world_submit(principal(f.b), jump).await.unwrap();
    drain(&f, true).await;
    let parent = BodyId(
        sqlx::query_scalar("SELECT parent FROM moon_genesis WHERE id=$1")
            .bind(f.moons[1].0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
    );
    let quote = game
        .world_query(
            principal(f.b),
            WorldQuery {
                context: context(f.b),
                query: WorldQueryKind::AbandonmentQuote { body: parent },
            },
        )
        .await
        .unwrap();
    let mut abandon = action(&f, q);
    if let CommandDto3::Progression(Command::World {
        action: WorldAction::RecordForegroundPresence { body, .. },
    }) = &mut abandon.presence.command
    {
        *body = Some(parent);
    }
    abandon.gameplay.command = CommandDto3::Progression(Command::World {
        action: WorldAction::AbandonPlanet {
            body: parent,
            expected_terms_hash: serde_json::from_value(quote.facts.data["terms_hash"].clone())
                .unwrap(),
        },
    });
    game.world_submit(principal(f.b), abandon.clone())
        .await
        .unwrap();
    drain(&f, true).await;
    assert!(matches!(
        receipt(&f, &abandon).await.status,
        ReceiptStatus::Committed { .. }
    ));
    let bodies: Vec<Uuid> = sqlx::query_scalar("SELECT body FROM jump_gate_uses")
        .fetch_all(&f.pool)
        .await
        .unwrap();
    assert_eq!(bodies, vec![f.moons[0].0]);
}

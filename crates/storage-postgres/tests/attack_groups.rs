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
fn pair(binding: Binding, body: Option<BodyId>, command: Command) -> ForegroundAction {
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
                    body,
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
async fn order(
    store: &PgStore,
    b: Binding,
    body: Option<BodyId>,
    action: WorldAction,
    scoped: bool,
) -> BoundReceipt {
    let p = pair(b, body, Command::World { action });
    let first = store.bound_admit4(p.clone()).await.unwrap();
    drain(store, b.universe, scoped).await;
    let retry = store.bound_admit4(p).await.unwrap();
    assert_eq!(first.command_id, retry.command_id);
    assert!(
        matches!(retry.status, ReceiptStatus::Committed { .. }),
        "{retry:?}"
    );
    retry
}
async fn launch(
    store: &PgStore,
    b: Binding,
    origin: BodyId,
    destination: (Binding, BodyId),
    group: Option<OperationId>,
    speed: u32,
    scoped: bool,
) -> MissionFleet {
    let (host, target) = destination;
    let intent = FleetIntent {
        attack_group: group,
        hold_hours: None,
        origin,
        destination: MissionDestination::Body {
            id: target,
            expected_kind: BodyKind::Planet,
            expected_owner: host.player,
        },
        mission: Mission::Attack,
        ships: vec![ManifestStack {
            owner: b.player,
            ship_type: ShipType::Cruiser,
            count: 10,
        }],
        cargo: Resources::default(),
        speed_percent: speed,
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
    let q = quote_fleet(&snap.state, b.player, &intent, snap.at, &snap.rules).unwrap();
    order(
        store,
        b,
        Some(origin),
        WorldAction::LaunchFleet {
            intent,
            expected_terms_hash: q.terms_hash.clone(),
        },
        scoped,
    )
    .await;
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
        .into_values()
        .filter(|f| f.owner == b.player && f.intent.attack_group == group)
        .max_by_key(|f| f.launched_at)
        .unwrap()
}
#[tokio::test]
async fn invited_group_join_restart_battle_reports_and_returns_in_both_runtimes() {
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
        let mut edits = vec![];
        for (name, coords) in [
            ("lead", "1:50:8"),
            ("joiner", "1:50:9"),
            ("host", "1:51:8"),
            ("guard", "1:51:9"),
        ] {
            edits
                .push(json!({"op":"add-player","user":name,"password":"password","planet":coords}));
            edits.push(json!({"op":"set","user":name,"planet":coords,"research":{"ComputerTechnology":4,"WeaponsTechnology":if name=="joiner" {7} else {3}},"buildings":{"MetalStorage":if name=="host" {8} else {0}},"ships":{"Cruiser":if name=="host" {0} else {20}},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}}));
        }
        let doc: WorldScenario =
            serde_json::from_value(json!({"version":1,"edits":edits})).unwrap();
        store
            .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
            .await
            .unwrap();
        let a = binding(&store, "lead").await;
        let b = binding(&store, "joiner").await;
        let h = binding(&store, "host").await;
        let guard = binding(&store, "guard").await;
        let mut bodies = vec![];
        for player in [a, b, h, guard] {
            bodies.push(
                store
                    .bound_world(player)
                    .await
                    .unwrap()
                    .facts
                    .0
                    .state
                    .bodies
                    .values()
                    .find(|body| body.owner == player.player)
                    .unwrap()
                    .id,
            );
        }
        if scoped {
            store.prepare_scoped_runtime(u, 100).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        let first = launch(&store, a, bodies[0], (h, bodies[2]), None, 10, scoped).await;
        order(
            &store,
            a,
            None,
            WorldAction::CreateAttackGroup { fleet: first.id },
            scoped,
        )
        .await;
        let group = *store
            .bound_world(a)
            .await
            .unwrap()
            .facts
            .0
            .state
            .world
            .unwrap()
            .records
            .attack_groups
            .keys()
            .next()
            .unwrap();
        order(
            &store,
            a,
            None,
            WorldAction::InviteAttackGroup {
                group,
                player: b.player,
            },
            scoped,
        )
        .await;
        store.set_test_time(at + 1000).await.unwrap();
        let second = launch(
            &store,
            b,
            bodies[1],
            (h, bodies[2]),
            Some(group),
            100,
            scoped,
        )
        .await;
        assert!(second.due_at < first.due_at);
        // Revoking the invitation stops future joins but preserves committed membership.
        order(
            &store,
            a,
            None,
            WorldAction::RevokeAttackGroupInvitation {
                group,
                player: b.player,
            },
            scoped,
        )
        .await;
        // A later allied defender extends the already scheduled group's scopes.
        let social = |binding, action| SocialCommandRequest {
            context: QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            action,
        };
        store
            .social_command(social(
                guard,
                SocialAction::RequestFriend { player: h.player },
            ))
            .await
            .unwrap();
        let request = store
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
            .unwrap();
        store
            .social_command(social(
                h,
                SocialAction::AcceptFriend {
                    player: guard.player,
                    request,
                },
            ))
            .await
            .unwrap();
        let hold = FleetIntent {
            attack_group: None,
            hold_hours: Some(16),
            origin: bodies[3],
            destination: MissionDestination::Body {
                id: bodies[2],
                expected_kind: BodyKind::Planet,
                expected_owner: h.player,
            },
            mission: Mission::Hold,
            // One defender is defeated in the first round and cannot damage an
            // attacker enough to trigger an explosion. Keep the exact pooled
            // cargo assertion below independent of random target selection.
            ships: vec![ManifestStack {
                owner: guard.player,
                ship_type: ShipType::Cruiser,
                count: 1,
            }],
            cargo: Resources::default(),
            speed_percent: 100,
        };
        let (snap, _) = store
            .bound_world_query(
                guard,
                WorldQueryKind::FleetQuote {
                    intent: hold.clone(),
                },
            )
            .await
            .unwrap()
            .facts;
        let q = quote_fleet(&snap.state, guard.player, &hold, snap.at, &snap.rules).unwrap();
        order(
            &store,
            guard,
            Some(bodies[3]),
            WorldAction::LaunchFleet {
                intent: hold,
                expected_terms_hash: q.terms_hash.clone(),
            },
            scoped,
        )
        .await;
        store.audit_universe(u).await.unwrap();
        let reopened = PgStore::connect(&url).await.unwrap();
        let snapshot = reopened.bound_world(a).await.unwrap().facts.0;
        let g = &snapshot.state.world.as_ref().unwrap().records.attack_groups[&group];
        assert_eq!(g.members.len(), 2);
        let due = g.arrival_at;
        reopened.set_test_time(due).await.unwrap();
        drain(&reopened, u, scoped).await;
        let snapshot = reopened.bound_world(a).await.unwrap().facts.0;
        assert_eq!(
            snapshot
                .state
                .world
                .as_ref()
                .unwrap()
                .records
                .attack_groups
                .get(&group),
            None,
            "resolved groups leave live projections"
        );
        let reports: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM mission_reports WHERE universe=$1 AND kind='Combat'",
        )
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(reports, 1);
        let recipients:i64=sqlx::query_scalar("SELECT count(*) FROM mission_report_recipients p JOIN mission_reports r ON r.id=p.report WHERE r.universe=$1 AND r.kind='Combat'").bind(u.0).fetch_one(&pool).await.unwrap();
        assert_eq!(recipients, 4);
        let payload: serde_json::Value = sqlx::query_scalar(
            "SELECT data FROM mission_reports WHERE universe=$1 AND kind='Combat'",
        )
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
        let defender = &payload["payloads"][h.player.to_string()];
        assert_eq!(
            defender["participants"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|p| p["side"] == "Attacker")
                .count(),
            2
        );
        assert_eq!(
            defender["participants"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|p| p["side"] == "Defender")
                .count(),
            2
        );
        assert_eq!(defender["outcome"], "AttackerVictory");
        let participants = defender["participants"].as_array().unwrap();
        for (owner, level) in [(a.player, 3), (b.player, 7)] {
            assert_eq!(
                participants
                    .iter()
                    .find(|p| p["owner"] == owner.to_string())
                    .unwrap()["technology"][0],
                level
            );
        }
        let amount = |value: &serde_json::Value, key: &str| {
            value[key].as_str().unwrap().parse::<i64>().unwrap()
        };
        let mut loot_total = 0;
        for key in ["metal", "crystal", "deuterium"] {
            let pooled = amount(&defender["loot"], key);
            let allocated = [a.player, b.player]
                .iter()
                .map(|owner| {
                    amount(
                        &payload["payloads"][owner.to_string()]["own_returns"][0]["loot"],
                        key,
                    )
                })
                .sum::<i64>();
            assert_eq!(pooled, allocated);
            loot_total += pooled;
        }
        assert_eq!(loot_total, 16_000 * SCALE);
        reopened.audit_universe(u).await.unwrap();
        reopened
            .set_test_time(due + first.terms.duration_ms.max(second.terms.duration_ms))
            .await
            .unwrap();
        drain(&reopened, u, scoped).await;
        let active:i64=sqlx::query_scalar("SELECT count(*) FROM mission_fleets WHERE universe=$1 AND data->>'leg' IN ('Outbound','Returning')").bind(u.0).fetch_one(&pool).await.unwrap();
        assert_eq!(active, 0);
        drop(reopened);
        drop(store);
        pool.close().await;
    }
}

#[tokio::test]
async fn returned_recalls_remain_loadable_for_later_joins_and_group_visibility() {
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
        let universe = UniverseId(Uuid::new_v4());
        let mut edits = vec![];
        for (user, planet) in [
            ("leader", "1:50:8"),
            ("member", "1:50:9"),
            ("target", "1:51:8"),
        ] {
            edits
                .push(json!({"op":"add-player","user":user,"password":"password","planet":planet}));
            edits.push(json!({"op":"set","user":user,"planet":planet,"research":{"ComputerTechnology":4},"ships":{"Cruiser":20},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}}));
        }
        let scenario: WorldScenario =
            serde_json::from_value(json!({"version":1,"edits":edits})).unwrap();
        store
            .apply_world_scenario(universe, &scenario, ScenarioMode::Create, Uuid::new_v4())
            .await
            .unwrap();
        let leader = binding(&store, "leader").await;
        let member = binding(&store, "member").await;
        let target = binding(&store, "target").await;
        let mut bodies = vec![];
        for binding in [leader, member, target] {
            let snapshot = store.bound_world(binding).await.unwrap();
            bodies.push(
                snapshot
                    .facts
                    .0
                    .state
                    .bodies
                    .values()
                    .find(|body| body.owner == binding.player)
                    .unwrap()
                    .id,
            );
        }
        if scoped {
            store.prepare_scoped_runtime(universe, 100).await.unwrap();
            store.activate_scoped_runtime(universe).await.unwrap();
        }
        let initiator = launch(
            &store,
            leader,
            bodies[0],
            (target, bodies[2]),
            None,
            10,
            scoped,
        )
        .await;
        assert!(initiator.due_at > at + 10000);
        order(
            &store,
            leader,
            None,
            WorldAction::CreateAttackGroup {
                fleet: initiator.id,
            },
            scoped,
        )
        .await;
        let group = *store
            .bound_world(leader)
            .await
            .unwrap()
            .facts
            .0
            .state
            .world
            .unwrap()
            .records
            .attack_groups
            .keys()
            .next()
            .unwrap();
        order(
            &store,
            leader,
            None,
            WorldAction::InviteAttackGroup {
                group,
                player: member.player,
            },
            scoped,
        )
        .await;
        store.set_test_time(at + 1000).await.unwrap();
        let recalled = launch(
            &store,
            member,
            bodies[1],
            (target, bodies[2]),
            Some(group),
            100,
            scoped,
        )
        .await;
        store.set_test_time(at + 2000).await.unwrap();
        order(
            &store,
            member,
            Some(bodies[1]),
            WorldAction::RecallMission { fleet: recalled.id },
            scoped,
        )
        .await;
        store.set_test_time(at + 3000).await.unwrap();
        drain(&store, universe, scoped).await;
        let reopened = PgStore::connect(&url).await.unwrap();
        let snapshot = reopened.bound_world(member).await.unwrap().facts.0;
        let records = &snapshot.state.world.as_ref().unwrap().records;
        assert_eq!(records.fleets[&recalled.id].leg, MissionLeg::Returned);
        assert!(group_open(
            records,
            &records.attack_groups[&group],
            snapshot.at
        ));
        reopened.audit_universe(universe).await.unwrap();
        reopened.set_test_time(at + 4000).await.unwrap();
        let continuing = launch(
            &reopened,
            member,
            bodies[1],
            (target, bodies[2]),
            Some(group),
            100,
            scoped,
        )
        .await;
        assert_ne!(continuing.id, recalled.id);
        reopened.set_test_time(at + 5000).await.unwrap();
        order(
            &reopened,
            leader,
            Some(bodies[0]),
            WorldAction::RecallMission {
                fleet: initiator.id,
            },
            scoped,
        )
        .await;
        reopened.set_test_time(at + 10000).await.unwrap();
        drain(&reopened, universe, scoped).await;
        let after_return = PgStore::connect(&url).await.unwrap();
        let snapshot = after_return.bound_world(member).await.unwrap().facts.0;
        let records = &snapshot.state.world.as_ref().unwrap().records;
        assert_eq!(records.fleets[&initiator.id].leg, MissionLeg::Returned);
        assert_eq!(records.fleets[&recalled.id].leg, MissionLeg::Returned);
        assert_eq!(
            group_members(records, &records.attack_groups[&group]).count(),
            1
        );
        let arrival = records.attack_groups[&group].arrival_at;
        assert_eq!(arrival, initiator.due_at);
        let mut another = continuing.intent.clone();
        another.ships[0].count = 1;
        let quote_snapshot = after_return
            .bound_world_query(
                member,
                WorldQueryKind::FleetQuote {
                    intent: another.clone(),
                },
            )
            .await
            .unwrap()
            .facts
            .0;
        assert_eq!(
            quote_fleet(
                &quote_snapshot.state,
                member.player,
                &another,
                quote_snapshot.at,
                &quote_snapshot.rules
            ),
            Err(GameError::AttackGroupClosed)
        );
        let game = GameService::new(after_return.clone());
        for viewer in [leader, member] {
            let view = game
                .world_view(
                    Principal {
                        account: viewer.account,
                        player: viewer.player,
                        universe,
                    },
                    QueryContext {
                        binding: viewer,
                        request_id: Uuid::new_v4(),
                    },
                )
                .await
                .unwrap();
            let visible = view.attack_groups.iter().find(|g| g.id == group).unwrap();
            assert!(!visible.joining_open && !visible.can_join);
            assert_eq!(visible.members.len(), 1);
            assert_eq!(visible.members[0].owner, member.player);
        }
        after_return.audit_universe(universe).await.unwrap();
        after_return.set_test_time(arrival).await.unwrap();
        drain(&after_return, universe, scoped).await;
        let resolved: i64 = sqlx::query_scalar(
            "SELECT (data->>'resolved_at')::bigint FROM attack_groups WHERE universe=$1 AND id=$2",
        )
        .bind(universe.0)
        .bind(group.0)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(resolved, arrival);
        let battles: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM mission_reports WHERE universe=$1 AND kind='Combat'",
        )
        .bind(universe.0)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(battles, 1);
        after_return.audit_universe(universe).await.unwrap();
        pool.close().await;
    }
}

#[tokio::test]
async fn empire_deletion_preserves_foreign_group_members_and_closes_empty_groups() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    for remove_joiner in [false, true] {
        let at = 1_790_000_000_000;
        store.set_test_time(at).await.unwrap();
        let u = UniverseId(Uuid::new_v4());
        let names = [
            format!("delete-lead-{u}"),
            format!("delete-join-{u}"),
            format!("delete-target-{u}"),
        ];
        let mut edits = vec![];
        for (name, coords) in names.iter().zip(["1:50:8", "1:50:9", "1:51:8"]) {
            edits
                .push(json!({"op":"add-player","user":name,"password":"password","planet":coords}));
            edits.push(json!({"op":"set","user":name,"planet":coords,"research":{"ComputerTechnology":4},"ships":{"Cruiser":20},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}}));
        }
        let doc: WorldScenario =
            serde_json::from_value(json!({"version":1,"edits":edits})).unwrap();
        store
            .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
            .await
            .unwrap();
        let a = binding(&store, &names[0]).await;
        let b = binding(&store, &names[1]).await;
        let target = binding(&store, &names[2]).await;
        let mut bodies = vec![];
        for player in [a, b, target] {
            bodies.push(
                store
                    .bound_world(player)
                    .await
                    .unwrap()
                    .facts
                    .0
                    .state
                    .bodies
                    .values()
                    .find(|body| body.owner == player.player)
                    .unwrap()
                    .id,
            );
        }
        store.prepare_scoped_runtime(u, 100).await.unwrap();
        store.activate_scoped_runtime(u).await.unwrap();
        order(&store, a, None, WorldAction::RequestEmpireDeletion, true).await;
        if remove_joiner {
            order(&store, b, None, WorldAction::RequestEmpireDeletion, true).await;
        }
        let cutoff = at + DELETION_GRACE_MS;
        store.set_test_time(cutoff - 1000).await.unwrap();
        let first = launch(&store, a, bodies[0], (target, bodies[2]), None, 10, true).await;
        order(
            &store,
            a,
            None,
            WorldAction::CreateAttackGroup { fleet: first.id },
            true,
        )
        .await;
        let group = *store
            .bound_world(a)
            .await
            .unwrap()
            .facts
            .0
            .state
            .world
            .unwrap()
            .records
            .attack_groups
            .keys()
            .next()
            .unwrap();
        order(
            &store,
            a,
            None,
            WorldAction::InviteAttackGroup {
                group,
                player: b.player,
            },
            true,
        )
        .await;
        let second = launch(
            &store,
            b,
            bodies[1],
            (target, bodies[2]),
            Some(group),
            10,
            true,
        )
        .await;
        let records = store
            .bound_world(a)
            .await
            .unwrap()
            .facts
            .0
            .state
            .world
            .unwrap()
            .records;
        let arrival = records.attack_groups[&group].arrival_at;
        assert!(arrival > cutoff);
        store.set_test_time(cutoff).await.unwrap();
        drain(&store, u, true).await;
        store.audit_universe(u).await.unwrap();
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let group_after: sqlx::types::Json<AttackGroup> =
            sqlx::query_scalar("SELECT data FROM attack_groups WHERE id=$1")
                .bind(group.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        let removed: sqlx::types::Json<MissionFleet> =
            sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
                .bind(first.id.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(removed.leg, MissionLeg::Destroyed);
        assert!(removed.ships.is_empty());
        assert_eq!(group_after.arrival_at, arrival);
        assert_eq!(group_after.resolved_at.is_some(), remove_joiner);
        if !remove_joiner {
            let surviving: sqlx::types::Json<MissionFleet> =
                sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
                    .bind(second.id.0)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(surviving.0, second);
            assert!(!group_after.invited.contains(&a.player));
        }
        store.set_test_time(arrival).await.unwrap();
        drain(&store, u, true).await;
        store.audit_universe(u).await.unwrap();
        let terminal: sqlx::types::Json<AttackGroup> =
            sqlx::query_scalar("SELECT data FROM attack_groups WHERE id=$1")
                .bind(group.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(terminal.resolved_at.is_some());
        pool.close().await;
    }
}

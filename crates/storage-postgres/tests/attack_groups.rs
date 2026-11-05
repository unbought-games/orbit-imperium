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

// Keep this assertion's SQL/command futures separate from the group journey.
// The fixed clock and null presence body isolate a presentation command from
// production settlement, so every economic and accepted-flight row must match.
async fn assert_presentation_preserves_flight(
    store: &PgStore,
    pool: &sqlx::PgPool,
    b: Binding,
    fleet: &MissionFleet,
    scoped: bool,
) {
    async fn snapshot(pool: &sqlx::PgPool, u: UniverseId) -> serde_json::Value {
        sqlx::query_scalar(
            "SELECT jsonb_build_object(
                'bodies', (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bodies b WHERE universe=$1),
                'lots', (SELECT jsonb_agg(to_jsonb(l) ORDER BY key) FROM asset_lots l WHERE universe=$1),
                'objectives', (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM objective_runs r WHERE universe=$1),
                'sites', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM mission_sites s WHERE universe=$1),
                'fleets', (SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM mission_fleets f WHERE universe=$1)
            )",
        )
        .bind(u.0)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    assert_eq!(fleet.leg, MissionLeg::Outbound);
    let before = snapshot(pool, b.universe).await;
    for beginner in [true, false] {
        order(
            store,
            b,
            None,
            WorldAction::SetTutorialPresentation { beginner },
            scoped,
        )
        .await;
        let saved: bool = sqlx::query_scalar(
            "SELECT (data->>'beginner')::boolean FROM tutorial_preferences WHERE universe=$1 AND epoch=$2 AND player=$3",
        )
        .bind(b.universe.0)
        .bind(b.epoch.0)
        .bind(b.player.0)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(saved, beginner, "the presentation command must execute");
        assert_eq!(snapshot(pool, b.universe).await, before);
        let retained: serde_json::Value =
            sqlx::query_scalar("SELECT data FROM mission_fleets WHERE universe=$1 AND id=$2")
                .bind(b.universe.0)
                .bind(fleet.id.0)
                .fetch_one(pool)
                .await
                .unwrap();
        assert_eq!(
            serde_json::from_value::<MissionFleet>(retained).unwrap(),
            *fleet
        );
    }
}

// The ordinary fleet query excludes terminal legs. An unresolved group must
// nevertheless load every retained member, including a terminal initiator.
async fn assert_terminal_group_member_loaded(
    store: &PgStore,
    viewer: Binding,
    group: OperationId,
    terminal: FleetId,
) {
    let state = store.bound_world(viewer).await.unwrap().facts.0.state;
    let records = &state.world.as_ref().unwrap().records;
    assert!(records.attack_groups[&group].members.contains(&terminal));
    assert_eq!(records.fleets[&terminal].leg, MissionLeg::Destroyed);
    assert!(!records.fleets[&terminal].active());
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
            Box::pin(assert_terminal_group_member_loaded(
                &store, b, group, first.id,
            ))
            .await;
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

// Narrow storage fixtures deliberately stop before combat, restart or return.
// They retain dependency and presentation protection from the removed oversized
// combined journey without reintroducing that journey under a different name.
struct PendingFlight {
    store: PgStore,
    pool: sqlx::PgPool,
    actor: Binding,
    invitee: Binding,
    invitee_home: Coordinates,
    fleet: MissionFleet,
}
async fn pending_flight() -> PendingFlight {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1_790_000_000_000).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let names = [
        format!("pending-lead-{u}"),
        format!("pending-invite-{u}"),
        format!("pending-target-{u}"),
    ];
    let mut edits = vec![];
    for (name, coords) in names.iter().zip(["1:50:8", "1:50:9", "1:51:8"]) {
        edits.push(json!({"op":"add-player","user":name,"password":"password","planet":coords}));
        edits.push(json!({"op":"set","user":name,"planet":coords,"research":{"ComputerTechnology":4},"ships":{"Cruiser":20},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}}));
    }
    let doc: WorldScenario = serde_json::from_value(json!({"version":1,"edits":edits})).unwrap();
    store
        .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let actor = binding(&store, &names[0]).await;
    let invitee = binding(&store, &names[1]).await;
    let target = binding(&store, &names[2]).await;
    let mut homes = vec![];
    for b in [actor, invitee, target] {
        let state = store.bound_world(b).await.unwrap().facts.0.state;
        homes.push(state.world.as_ref().unwrap().homeworlds[&b.player]);
    }
    let invitee_home = store
        .bound_world(invitee)
        .await
        .unwrap()
        .facts
        .0
        .state
        .bodies[&homes[1]]
        .coordinates;
    store.activate_tutorial(u, true).await.unwrap();
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    let fleet = launch(&store, actor, homes[0], (target, homes[2]), None, 10, true).await;
    PendingFlight {
        store,
        pool,
        actor,
        invitee,
        invitee_home,
        fleet,
    }
}

/// Regression: merely inviting an enrolled player extends the original pending
/// event; a later join/reschedule must not be necessary to make its claim valid.
#[tokio::test]
async fn pending_invitation_declares_homeworld_before_any_join() {
    let f = Box::pin(pending_flight()).await;
    order(
        &f.store,
        f.actor,
        None,
        WorldAction::CreateAttackGroup { fleet: f.fleet.id },
        true,
    )
    .await;
    let (event, group): (Uuid, String) = sqlx::query_as("SELECT id,event->>'group' FROM scheduled_events WHERE universe=$1 AND event->>'type'='AttackGroupDue' AND NOT done AND NOT cancelled")
        .bind(f.actor.universe.0).fetch_one(&f.pool).await.unwrap();
    order(
        &f.store,
        f.actor,
        None,
        WorldAction::InviteAttackGroup {
            group: OperationId(Uuid::parse_str(&group).unwrap()),
            player: f.invitee.player,
        },
        true,
    )
    .await;
    for scope in [
        ScopeKey::Location(f.invitee_home),
        ScopeKey::Site(
            tutorial_site_key(f.actor.universe, f.invitee.epoch, f.invitee.player, false).id(),
        ),
        ScopeKey::Site(
            tutorial_site_key(f.actor.universe, f.invitee.epoch, f.invitee.player, true).id(),
        ),
    ] {
        let declared: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM scheduled_events e JOIN input_scopes s ON s.universe=e.universe AND s.input_id=e.id WHERE e.id=$1 AND NOT e.done AND NOT e.cancelled AND s.scope_key=$2)")
            .bind(event).bind(serde_json::to_string(&scope).unwrap()).fetch_one(&f.pool).await.unwrap();
        assert!(declared, "late invite omitted {scope:?}");
    }
}

/// Regression: presentation changes execute without touching an accepted real
/// outbound fleet, resource balances, reward evidence or site issuance.
#[tokio::test]
async fn presentation_commands_preserve_pending_flight_and_economy() {
    let f = Box::pin(pending_flight()).await;
    Box::pin(assert_presentation_preserves_flight(
        &f.store, &f.pool, f.actor, &f.fleet, true,
    ))
    .await;
}

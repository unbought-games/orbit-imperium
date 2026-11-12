//! Paid observation, membership fencing and deployment regressions. No live service.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;
const AT: i64 = 1_790_000_000_000;
struct Fixture {
    store: PgStore,
    pool: PgPool,
    u: UniverseId,
    b: Binding,
    other: Binding,
    moon: BodyId,
    target: BodyId,
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
async fn binding(store: &PgStore, user: &str, u: UniverseId) -> Binding {
    let login = SessionService::new(store.clone())
        .login(user, "password", None)
        .await
        .unwrap();
    GameService::new(store.clone())
        .current_binding(login.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding
}
async fn setup(scoped: bool, fuel: i64) -> Fixture {
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
    let scenario:WorldScenario=serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"scanner","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"target","password":"password","planet":"1:1:9"},
        {"op":"add-player","user":"remote","password":"password","planet":"1:2:8"},
        {"op":"set","user":"remote","planet":"1:2:8","ships":{"SmallCargo":8}},
        {"op":"transport","from":"1:2:8","planet":"1:1:9","ships":{"SmallCargo":1},"arrives_in":"1h"}
    ]})).unwrap();
    store
        .apply_world_scenario(u, &scenario, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let b = binding(&store, "scanner", u).await;
    let other = binding(&store, "target", u).await;
    let parent: Uuid = sqlx::query_scalar("SELECT id FROM bodies WHERE owner=$1")
        .bind(b.player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let target = BodyId(
        sqlx::query_scalar("SELECT id FROM bodies WHERE owner=$1")
            .bind(other.player.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
    );
    // Activate custom fixture rules through the same operator prepare/apply path.
    // Moon/asset fabrication below is fixture data, not an activation bypass.
    // Standard content now enables scans; explicitly establish the pre-activation
    // state so all callers still exercise an actual rules publication.
    let service = RulesService::new(store.clone());
    let mut disabled = service.export(u).await.unwrap();
    disabled.artifact.world.as_mut().unwrap().phalanx = None;
    service.apply(&disabled).await.unwrap();
    let old = store.load_rules(u).await.unwrap();
    let mut artifact = old.artifact.clone();
    artifact.world.as_mut().unwrap().phalanx = Some(PHALANX_PROFILE_V1.into());
    artifact.buildings.insert(
        Building::SensorPhalanx,
        BuildingRule {
            base: [20000, 40000, 20000],
            growth: [2, 1],
        },
    );
    let rules = Ruleset::from_artifact(artifact, old.speed).unwrap();
    if scoped {
        store.prepare_scoped_runtime(u, 100).await.unwrap();
        store.activate_scoped_runtime(u).await.unwrap();
    }
    let mut document = service.export(u).await.unwrap();
    document.artifact = rules.artifact.clone();
    service.diff(&document).await.unwrap();
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    let input = InputId(Uuid::new_v4());
    let moon = BodyId(derived_id(input, "moon:0"));
    sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,revision) SELECT $2,universe,owner,'Moon',galaxy,system,position,1,0,$3,carry,checkpoint_at,0 FROM bodies WHERE id=$1")
        .bind(parent).bind(moon.0).bind(sqlx::types::Json(Resources {deuterium:fuel,..Default::default()})).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO building_levels(body,building,level) SELECT $2,building,CASE WHEN building='SensorPhalanx' THEN 1 ELSE 0 END FROM building_levels WHERE body=$1").bind(parent).bind(moon.0).execute(&pool).await.unwrap();
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
    let lot = AssetLot {
        id: OperationId(Uuid::new_v4()),
        owner: b.player,
        item: CatalogKey::Building(Building::SensorPhalanx),
        level: Some(1),
        location: AssetLocation::Body(moon),
        quantity: 1,
        unit_value_micro: 80000 * SCALE,
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
    Fixture {
        store,
        pool,
        u,
        b,
        other,
        moon,
        target,
        rules,
    }
}
fn action(b: Binding, body: BodyId, action: WorldAction) -> ForegroundAction {
    let id = CommandId(Uuid::new_v4());
    ForegroundAction {
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: id,
            command: CommandDto3::Progression(Command::World { action }),
        },
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
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
fn scan(f: &Fixture) -> ForegroundAction {
    action(
        f.b,
        f.moon,
        WorldAction::ScanPlanet {
            source_moon: f.moon,
            target_planet: f.target,
        },
    )
}
async fn drain(f: &Fixture, scoped: bool) {
    let game = GameService::new(f.store.clone());
    for _ in 0..30 {
        let step = if scoped {
            game.step_scoped(f.u, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
        } else {
            game.step(f.u, WorkerId(Uuid::new_v4())).await
        }
        .unwrap();
        if matches!(step, StepOutcome::Idle) {
            return;
        }
    }
    panic!("fixture did not drain")
}
async fn fuel(f: &Fixture) -> i64 {
    sqlx::query_scalar("SELECT (amounts->>'deuterium')::bigint FROM bodies WHERE id=$1")
        .bind(f.moon.0)
        .fetch_one(&f.pool)
        .await
        .unwrap()
}
async fn receipt(f: &Fixture, p: &ForegroundAction) -> BoundReceipt {
    GameService::new(f.store.clone())
        .bound_receipt(principal(f.b), f.b, p.gameplay.command_id)
        .await
        .unwrap()
}
fn report(receipt: &BoundReceipt) -> ReportId {
    let ReceiptStatus::Committed { result_ids, .. } = &receipt.status else {
        panic!("{receipt:?}")
    };
    assert_eq!(result_ids.len(), 1);
    ReportId(Uuid::parse_str(&result_ids[0]).unwrap())
}
#[tokio::test]
async fn serial_and_scoped_paid_scan_dedup_recovery_and_recipient_history() {
    for scoped in [false, true] {
        let f = setup(scoped, 9999 * SCALE).await;
        let first = scan(&f);
        let second = scan(&f);
        let game = GameService::new(f.store.clone());
        let before: i64 =
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(f.u.0)
                .bind(f.other.player.0)
                .fetch_one(&f.pool)
                .await
                .unwrap();
        let (a, b) = tokio::join!(
            game.world_submit(principal(f.b), first.clone()),
            game.world_submit(principal(f.b), second.clone())
        );
        a.unwrap();
        b.unwrap();
        drain(&f, scoped).await;
        let receipts = [receipt(&f, &first).await, receipt(&f, &second).await];
        let committed = receipts
            .iter()
            .find(|r| matches!(r.status, ReceiptStatus::Committed { .. }))
            .unwrap();
        assert_eq!(
            receipts
                .iter()
                .filter(|r| matches!(
                    r.status,
                    ReceiptStatus::Rejected {
                        code: GameError::InsufficientResources
                    }
                ))
                .count(),
            1
        );
        assert_eq!(fuel(&f).await, 4999 * SCALE);
        let id = report(committed);
        let detail = game
            .report4(principal(f.b), context(f.b), id)
            .await
            .unwrap();
        let payload = detail.data.payload.clone();
        assert_eq!(
            payload["observation"]["report"]["rows"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            payload["observation"]["report"]["rows"][0]["owner"]["name"],
            "remote"
        );
        assert!(
            detail.data.player_names.is_empty(),
            "historical names are not refreshed"
        );
        assert!(!shareable_report(&payload));
        assert!(matches!(
            game.report4(principal(f.other), context(f.other), id).await,
            Err(ServiceError::NotFound)
        ));
        let mut stale = f.b;
        stale.epoch = Epoch(Uuid::new_v4());
        assert!(
            game.report4(principal(stale), context(stale), id)
                .await
                .is_err()
        );
        let after: i64 =
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(f.u.0)
                .bind(f.other.player.0)
                .fetch_one(&f.pool)
                .await
                .unwrap();
        assert_eq!(before, after);
        let winner = if committed.command_id == first.gameplay.command_id {
            &first
        } else {
            &second
        };
        let duplicate = game
            .world_submit(principal(f.b), winner.clone())
            .await
            .unwrap();
        assert_eq!(duplicate.status, committed.status);
        assert_eq!(fuel(&f).await, 4999 * SCALE);
        sqlx::query("UPDATE accounts SET name='renamed-remote' WHERE name='remote'")
            .execute(&f.pool)
            .await
            .unwrap();
        f.store.set_test_time(AT + 7_200_000).await.unwrap();
        drain(&f, scoped).await;
        let restarted = GameService::new(
            PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
                .await
                .unwrap(),
        );
        assert_eq!(
            restarted
                .report4(principal(f.b), context(f.b), id)
                .await
                .unwrap()
                .data
                .payload,
            payload
        );
        assert_eq!(receipt(&f, winner).await.status, committed.status);
    }
}

#[tokio::test]
async fn membership_revalidation_and_atomic_fault_recovery_do_not_duplicate_observations() {
    let f = setup(true, 10000 * SCALE).await;
    let pair = scan(&f);
    let game = GameService::new(f.store.clone());
    game.world_submit(principal(f.b), pair.clone())
        .await
        .unwrap();
    game.step_scoped(f.u, WorkerId(Uuid::new_v4()), &InlineEngine)
        .await
        .unwrap(); // paired presence
    let claim = f
        .store
        .claim_scoped(f.u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        claim.input.payload,
        Input::Command(Command::World {
            action: WorldAction::ScanPlanet { .. }
        })
    ));
    let snapshot = f.store.load_scoped(&claim).await.unwrap();
    let result = transition(&snapshot.state, &claim.input, &snapshot.rules);
    assert!(matches!(result, TransitionResult::Applied(_)), "{result:?}");
    let mut fleet: MissionFleet = serde_json::from_value(
        sqlx::query_scalar("SELECT data FROM mission_fleets LIMIT 1")
            .fetch_one(&f.pool)
            .await
            .unwrap(),
    )
    .unwrap();
    fleet.id = FleetId(Uuid::new_v4());
    sqlx::query("INSERT INTO mission_fleets(universe,id,owner,data) VALUES($1,$2,$3,$4)")
        .bind(f.u.0)
        .bind(fleet.id.0)
        .bind(fleet.owner.0)
        .bind(sqlx::types::Json(&fleet))
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        f.store.commit_scoped(&claim, result).await.unwrap(),
        CommitOutcome::Conflict
    );
    assert_eq!(fuel(&f).await, 10000 * SCALE);
    let snapshot = f.store.load_scoped(&claim).await.unwrap();
    let result = transition(&snapshot.state, &claim.input, &snapshot.rules);
    sqlx::query("DELETE FROM mission_fleets WHERE id=$1")
        .bind(fleet.id.0)
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        f.store.commit_scoped(&claim, result).await.unwrap(),
        CommitOutcome::Conflict
    );
    let snapshot = f.store.load_scoped(&claim).await.unwrap();
    let result = transition(&snapshot.state, &claim.input, &snapshot.rules);
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer); INSERT INTO orbit_test_fault VALUES('after_writes','error',true,0),('after_commit','error',false,0)").execute(&f.pool).await.unwrap();
    assert!(f.store.commit_scoped(&claim, result.clone()).await.is_err());
    assert_eq!(fuel(&f).await, 10000 * SCALE);
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM mission_reports WHERE kind='Phalanx'")
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    sqlx::query("UPDATE orbit_test_fault SET enabled=true WHERE stage='after_commit'")
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(f.store.commit_scoped(&claim, result.clone()).await.is_err());
    assert_eq!(fuel(&f).await, 5000 * SCALE);
    assert!(matches!(
        f.store.commit_scoped(&claim, result).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert_eq!(fuel(&f).await, 5000 * SCALE);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM mission_reports WHERE kind='Phalanx'")
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        1
    );
    report(&receipt(&f, &pair).await);
}

#[tokio::test]
async fn unknown_hidden_deploy_returns_reject_whole_scan_and_hidden_matches_empty() {
    let f = setup(true, 15000 * SCALE).await;
    let mut fleet: MissionFleet = serde_json::from_value(
        sqlx::query_scalar("SELECT data FROM mission_fleets LIMIT 1")
            .fetch_one(&f.pool)
            .await
            .unwrap(),
    )
    .unwrap();
    fleet.intent.mission = Mission::Deploy;
    let mut terms = (*fleet.terms).clone();
    terms.intent = fleet.intent.clone();
    fleet.terms = terms.seal();
    fleet.leg = MissionLeg::Returning;
    fleet.return_reason = None;
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(fleet.id.0)
        .bind(sqlx::types::Json(&fleet))
        .execute(&f.pool)
        .await
        .unwrap();
    let game = GameService::new(f.store.clone());
    let rejected = scan(&f);
    game.world_submit(principal(f.b), rejected.clone())
        .await
        .unwrap();
    drain(&f, true).await;
    assert_eq!(
        receipt(&f, &rejected).await.status,
        ReceiptStatus::Rejected {
            code: GameError::UnavailableContent
        }
    );
    assert_eq!(fuel(&f).await, 15000 * SCALE);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM mission_reports WHERE kind='Phalanx'")
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        0
    );
    fleet.return_reason = Some(MissionReturnReason::VoluntaryRecall);
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(fleet.id.0)
        .bind(sqlx::types::Json(&fleet))
        .execute(&f.pool)
        .await
        .unwrap();
    let hidden = scan(&f);
    game.world_submit(principal(f.b), hidden.clone())
        .await
        .unwrap();
    drain(&f, true).await;
    let a = game
        .report4(
            principal(f.b),
            context(f.b),
            report(&receipt(&f, &hidden).await),
        )
        .await
        .unwrap()
        .data
        .payload
        .clone();
    sqlx::query("DELETE FROM mission_fleets WHERE id=$1")
        .bind(fleet.id.0)
        .execute(&f.pool)
        .await
        .unwrap();
    let empty = scan(&f);
    game.world_submit(principal(f.b), empty.clone())
        .await
        .unwrap();
    drain(&f, true).await;
    let mut b = game
        .report4(
            principal(f.b),
            context(f.b),
            report(&receipt(&f, &empty).await),
        )
        .await
        .unwrap()
        .data
        .payload
        .clone();
    b["observation"]["report"]["id"] = a["observation"]["report"]["id"].clone();
    assert_eq!(a, b);
    assert_eq!(fuel(&f).await, 5000 * SCALE);
}

async fn disable(f: &Fixture) -> RulesDocument {
    let service = RulesService::new(f.store.clone());
    let mut doc = service.export(f.u).await.unwrap();
    doc.artifact.world.as_mut().unwrap().phalanx = None;
    service.apply(&doc).await.unwrap();
    let mut activation = service.export(f.u).await.unwrap();
    activation.artifact.world.as_mut().unwrap().phalanx = Some(PHALANX_PROFILE_V1.into());
    activation
}
async fn deployment_recall(f: &Fixture) -> (MissionFleet, ForegroundAction) {
    let mut fleet: MissionFleet = serde_json::from_value(
        sqlx::query_scalar("SELECT data FROM mission_fleets WHERE universe=$1 LIMIT 1")
            .bind(f.u.0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
    )
    .unwrap();
    fleet.intent.mission = Mission::Deploy;
    let mut terms = (*fleet.terms).clone();
    terms.intent = fleet.intent.clone();
    fleet.terms = terms.seal();
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(fleet.id.0)
        .bind(sqlx::types::Json(&fleet))
        .execute(&f.pool)
        .await
        .unwrap();
    f.store.set_test_time(AT + 1000).await.unwrap();
    let owner = binding(&f.store, "remote", f.u).await;
    let pair = action(
        owner,
        fleet.intent.origin,
        WorldAction::RecallMission { fleet: fleet.id },
    );
    GameService::new(f.store.clone())
        .world_submit(principal(owner), pair.clone())
        .await
        .unwrap();
    (fleet, pair)
}
async fn erase_return_cause(f: &Fixture, id: FleetId) -> MissionFleet {
    // The exact field loss of a legacy full-record writer while disabled.
    let data: Value = sqlx::query_scalar(
        "UPDATE mission_fleets SET data=data-'return_reason' WHERE id=$1 RETURNING data",
    )
    .bind(id.0)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    let fleet: MissionFleet = serde_json::from_value(data).unwrap();
    assert_eq!(fleet.leg, MissionLeg::Returning);
    assert!(fleet.return_reason.is_none());
    fleet
}
#[tokio::test]
async fn serial_and_scoped_activation_succeeds_after_unknown_returns_settle_naturally() {
    for scoped in [false, true] {
        let f = setup(scoped, 10000 * SCALE).await;
        let doc = disable(&f).await;
        let service = RulesService::new(f.store.clone());
        service.diff(&doc).await.unwrap();
        let (original, _) = deployment_recall(&f).await;
        drain(&f, scoped).await;
        let unknown = erase_return_cause(&f, original.id).await;
        f.store.migrate().await.unwrap();
        assert!(matches!(
            service.apply(&doc).await,
            Err(RulesUpdateError::PhalanxActivationBlocked(
                PhalanxReadinessError::UnknownDeploymentReturn
            ))
        ));
        assert!(!phalanx_enabled(&f.store.load_rules(f.u).await.unwrap()));
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT count(*) FROM runtime_barriers WHERE universe=$1 AND NOT done"
            )
            .bind(f.u.0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
            0
        );
        assert!(matches!(
            GameService::new(f.store.clone())
                .world_submit(principal(f.b), scan(&f))
                .await,
            Err(ServiceError::GameRejected(GameError::UnavailableContent))
        ));
        f.store.set_test_time(unknown.due_at).await.unwrap();
        drain(&f, scoped).await;
        let terminal: MissionFleet = serde_json::from_value(
            sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
                .bind(original.id.0)
                .fetch_one(&f.pool)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(terminal.leg, MissionLeg::Returned);
        assert_eq!(terminal.due_at, unknown.due_at);
        assert_eq!(terminal.terms, original.terms);
        assert!(terminal.return_reason.is_none());
        assert!(matches!(
            service.apply(&doc).await.unwrap(),
            RulesApplyOutcome::Applied { .. }
        ));
        assert!(matches!(
            service.apply(&doc).await.unwrap(),
            RulesApplyOutcome::AlreadyActive { .. }
        ));
        let pair = scan(&f);
        GameService::new(f.store.clone())
            .world_submit(principal(f.b), pair.clone())
            .await
            .unwrap();
        drain(&f, scoped).await;
        report(&receipt(&f, &pair).await);
        assert_eq!(fuel(&f).await, 5000 * SCALE);
    }
}
#[tokio::test]
async fn serial_and_scoped_activation_reject_stale_preparation_without_overwriting_rules() {
    for scoped in [false, true] {
        let f = setup(scoped, 10000 * SCALE).await;
        let doc = disable(&f).await;
        let service = RulesService::new(f.store.clone());
        service.diff(&doc).await.unwrap();
        let mut competing = service.export(f.u).await.unwrap();
        competing
            .artifact
            .world
            .as_mut()
            .unwrap()
            .beginner_protection_multiplier += 1;
        service.apply(&competing).await.unwrap();
        assert!(matches!(
            service.apply(&doc).await,
            Err(RulesUpdateError::Stale { .. })
        ));
        assert!(!phalanx_enabled(&f.store.load_rules(f.u).await.unwrap()));
    }
}
#[tokio::test]
async fn scoped_publication_rechecks_returns_and_retires_rejected_barrier_for_natural_settlement() {
    let f = setup(true, 10000 * SCALE).await;
    let doc = disable(&f).await;
    let service = RulesService::new(f.store.clone());
    service.diff(&doc).await.unwrap();
    let (original, _) = deployment_recall(&f).await;
    let id = match service.apply(&doc).await {
        Err(RulesUpdateError::Pending { id }) => id,
        other => panic!("{other:?}"),
    };
    drain(&f, true).await;
    let unknown = erase_return_cause(&f, original.id).await;
    assert!(f.store.process_runtime_barrier(f.u).await.unwrap());
    let outcome: Value =
        sqlx::query_scalar("SELECT outcome FROM runtime_barriers WHERE id=$1 AND done")
            .bind(id)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!(
        outcome,
        json!({"status":"PhalanxRejected","reason":"UnknownDeploymentReturn"})
    );
    assert!(!phalanx_enabled(&f.store.load_rules(f.u).await.unwrap()));
    assert!(matches!(
        service.apply(&doc).await,
        Err(RulesUpdateError::PhalanxActivationBlocked(
            PhalanxReadinessError::UnknownDeploymentReturn
        ))
    ));
    f.store.set_test_time(unknown.due_at).await.unwrap();
    drain(&f, true).await;
    assert!(matches!(
        service.apply(&doc).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
}

#[tokio::test]
async fn http_scan_is_explicit_paid_post_with_csrf_and_free_authorized_report_reads() {
    use http_body_util::BodyExt;
    use orbit_transport_http::{
        HttpConfig, router,
        test_http::{Body as HttpBody, Request},
    };
    use tower::ServiceExt;
    let f = setup(true, 10000 * SCALE).await;
    let app = router(
        f.store.clone(),
        HttpConfig {
            account_url: None,
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: true,
            origin: "https://game.test".into(),
            assets: "missing-assets".into(),
            login_per_minute: 30,
            wake: None,
            observer: None,
        },
    );
    let response = app
        .clone()
        .oneshot(
            Request::post("/api/v1/session")
                .header("content-type", "application/json")
                .header("origin", "https://game.test")
                .body(HttpBody::from(
                    json!({"name":"scanner","password":"password"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .to_owned();
    let session: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let path = format!("/api/v4/universes/{}/commands", f.u);
    let pair = scan(&f);
    let denied = app
        .clone()
        .oneshot(
            Request::post(&path)
                .header("content-type", "application/json")
                .header("origin", "https://game.test")
                .header("cookie", &cookie)
                .body(HttpBody::from(serde_json::to_vec(&pair).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), 403);
    assert_eq!(fuel(&f).await, 10000 * SCALE);
    let get = app
        .clone()
        .oneshot(
            Request::get(&path)
                .header("cookie", &cookie)
                .body(HttpBody::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get.status(), 405);
    let post = |path: String, value: Value| {
        Request::post(path)
            .header("content-type", "application/json")
            .header("origin", "https://game.test")
            .header("cookie", &cookie)
            .header("x-csrf-token", session["csrf"].as_str().unwrap())
            .body(HttpBody::from(value.to_string()))
            .unwrap()
    };
    let response = app
        .clone()
        .oneshot(post(path.clone(), serde_json::to_value(&pair).unwrap()))
        .await
        .unwrap();
    assert!(response.status().is_success());
    assert_eq!(response.headers()["cache-control"], "no-store");
    drain(&f, true).await;
    let id = report(&receipt(&f, &pair).await);
    assert_eq!(fuel(&f).await, 5000 * SCALE);
    for _ in 0..2 {
        let response = app
            .clone()
            .oneshot(post(
                format!("/api/v4/universes/{}/reports/{id}", f.u),
                serde_json::to_value(context(f.b)).unwrap(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let detail: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(detail["data"]["payload"]["kind"], "Phalanx");
    }
    assert_eq!(fuel(&f).await, 5000 * SCALE);
    let response = app
        .clone()
        .oneshot(post(path, serde_json::to_value(&pair).unwrap()))
        .await
        .unwrap();
    assert!(response.status().is_success());
    assert_eq!(fuel(&f).await, 5000 * SCALE);
    let mut wrong = f.b;
    wrong.universe = UniverseId(Uuid::new_v4());
    let response = app
        .oneshot(post(
            format!("/api/v4/universes/{}/reports/{id}", f.u),
            serde_json::to_value(context(wrong)).unwrap(),
        ))
        .await
        .unwrap();
    assert!(!response.status().is_success());
}

#[tokio::test]
async fn recall_and_same_time_due_arrival_are_ordered_before_or_after_the_paid_observation() {
    for recall in [true, false] {
        let f = setup(true, 15000 * SCALE).await;
        let game = GameService::new(f.store.clone());
        let fleet: MissionFleet = serde_json::from_value(
            sqlx::query_scalar("SELECT data FROM mission_fleets LIMIT 1")
                .fetch_one(&f.pool)
                .await
                .unwrap(),
        )
        .unwrap();
        let first = scan(&f);
        game.world_submit(principal(f.b), first.clone())
            .await
            .unwrap();
        drain(&f, true).await;
        let rows = game
            .report4(
                principal(f.b),
                context(f.b),
                report(&receipt(&f, &first).await),
            )
            .await
            .unwrap()
            .data
            .payload["observation"]["report"]["rows"]
            .clone();
        assert_eq!(rows.as_array().unwrap().len(), 1);
        if recall {
            let remote = binding(&f.store, "remote", f.u).await;
            let recall = action(
                remote,
                fleet.intent.origin,
                WorldAction::RecallMission { fleet: fleet.id },
            );
            game.world_submit(principal(remote), recall).await.unwrap();
        } else {
            f.store.set_test_time(fleet.due_at).await.unwrap();
        }
        let second = scan(&f);
        game.world_submit(principal(f.b), second.clone())
            .await
            .unwrap();
        drain(&f, true).await;
        let rows = game
            .report4(
                principal(f.b),
                context(f.b),
                report(&receipt(&f, &second).await),
            )
            .await
            .unwrap()
            .data
            .payload["observation"]["report"]["rows"]
            .clone();
        assert_eq!(rows, json!([]));
        assert_eq!(fuel(&f).await, 5000 * SCALE);
    }
}

#[tokio::test]
async fn endpoint_loader_observes_group_initiator_delays_hold_extensions_and_separate_missiles() {
    use std::collections::BTreeSet;
    let f = setup(true, 20000 * SCALE).await;
    let game = GameService::new(f.store.clone());
    let original: MissionFleet = serde_json::from_value(
        sqlx::query_scalar("SELECT data FROM mission_fleets LIMIT 1")
            .fetch_one(&f.pool)
            .await
            .unwrap(),
    )
    .unwrap();
    let mut attack = original.clone();
    attack.intent.mission = Mission::Attack;
    let mut terms = (*attack.terms).clone();
    terms.intent = attack.intent.clone();
    attack.terms = terms.seal();
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(attack.id.0)
        .bind(sqlx::types::Json(&attack))
        .execute(&f.pool)
        .await
        .unwrap();
    // Group initiators have no intent.attack_group: membership lookup must find it.
    assert!(attack.intent.attack_group.is_none());
    let mut group = AttackGroup {
        id: OperationId(Uuid::new_v4()),
        initiator: attack.id,
        members: BTreeSet::from([attack.id]),
        invited: BTreeSet::from([attack.owner]),
        arrival_at: attack.due_at + 2000,
        generation: 0,
        revision: 0,
        resolved_at: None,
    };
    sqlx::query("INSERT INTO attack_groups(universe,id,data) VALUES($1,$2,$3)")
        .bind(f.u.0)
        .bind(group.id.0)
        .bind(sqlx::types::Json(&group))
        .execute(&f.pool)
        .await
        .unwrap();
    let mut hold = original.clone();
    hold.id = FleetId(Uuid::new_v4());
    hold.intent.mission = Mission::Hold;
    hold.leg = MissionLeg::Holding;
    hold.due_at += 4000;
    let mut terms = (*hold.terms).clone();
    terms.intent = hold.intent.clone();
    hold.terms = terms.seal();
    sqlx::query("INSERT INTO mission_fleets(universe,id,owner,data) VALUES($1,$2,$3,$4)")
        .bind(f.u.0)
        .bind(hold.id.0)
        .bind(hold.owner.0)
        .bind(sqlx::types::Json(&hold))
        .execute(&f.pool)
        .await
        .unwrap();
    let missile = MissileFlight {
        id: OperationId(Uuid::new_v4()),
        owner: original.owner,
        terms: MissileTermsData {
            intent: MissileIntent {
                origin: original.intent.origin,
                target: MissileTarget {
                    id: f.target,
                    expected_kind: BodyKind::Planet,
                    expected_owner: f.other.player,
                },
                count: 7,
                primary: Some(DefenseId::RocketLauncher),
            },
            source_coordinates: original.origin_coordinates,
            target_coordinates: original.destination_coordinates,
            interceptor_body: f.target,
            distance: 1,
            range: 2,
            duration_ms: 10000,
            weapons: 3,
            speed: f.rules.speed,
            rules: missile_rules(&f.rules).unwrap().clone(),
            profile_hash: f.rules.hash.clone(),
            terms_hash: Hash(String::new()),
        }
        .seal(),
        launched_at: AT,
        due_at: AT + 10000,
        generation: 0,
        status: MissileStatus::InFlight,
    };
    sqlx::query("INSERT INTO missile_flights(universe,id,owner,data) VALUES($1,$2,$3,$4)")
        .bind(f.u.0)
        .bind(missile.id.0)
        .bind(missile.owner.0)
        .bind(sqlx::types::Json(&missile))
        .execute(&f.pool)
        .await
        .unwrap();
    let pair = scan(&f);
    game.world_submit(principal(f.b), pair.clone())
        .await
        .unwrap();
    game.step_scoped(f.u, WorkerId(Uuid::new_v4()), &InlineEngine)
        .await
        .unwrap();
    let claim = f
        .store
        .claim_scoped(f.u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = f.store.load_scoped(&claim).await.unwrap();
    let result = transition(&snapshot.state, &claim.input, &snapshot.rules);
    group.arrival_at += 3000;
    group.revision += 1;
    hold.due_at += 6000;
    hold.revision += 1;
    sqlx::query("UPDATE attack_groups SET data=$2 WHERE id=$1")
        .bind(group.id.0)
        .bind(sqlx::types::Json(&group))
        .execute(&f.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(hold.id.0)
        .bind(sqlx::types::Json(&hold))
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        f.store.commit_scoped(&claim, result).await.unwrap(),
        CommitOutcome::Conflict
    );
    let snapshot = f.store.load_scoped(&claim).await.unwrap();
    let result = transition(&snapshot.state, &claim.input, &snapshot.rules);
    assert!(matches!(result, TransitionResult::Applied(_)), "{result:?}");
    f.store.commit_scoped(&claim, result).await.unwrap();
    let detail = game
        .report4(
            principal(f.b),
            context(f.b),
            report(&receipt(&f, &pair).await),
        )
        .await
        .unwrap();
    let rows = detail.data.payload["observation"]["report"]["rows"]
        .as_array()
        .unwrap();
    assert_eq!(rows.len(), 3);
    assert!(
        rows.iter()
            .any(|r| r["deadline"] == json!({"kind":"Arrival","at":group.arrival_at}))
    );
    assert!(
        rows.iter()
            .any(|r| r["deadline"] == json!({"kind":"HoldEnd","at":hold.due_at}))
    );
    assert!(rows.iter().any(|r| r["kind"] == "Missile"
        && r["count"] == "7"
        && r["deadline"] == json!({"kind":"Impact","at":missile.due_at})));
    // A missile becoming terminal invalidates a tentative scan too.
    let next = scan(&f);
    game.world_submit(principal(f.b), next.clone())
        .await
        .unwrap();
    game.step_scoped(f.u, WorkerId(Uuid::new_v4()), &InlineEngine)
        .await
        .unwrap();
    let claim = f
        .store
        .claim_scoped(f.u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = f.store.load_scoped(&claim).await.unwrap();
    let result = transition(&snapshot.state, &claim.input, &snapshot.rules);
    sqlx::query(
        "UPDATE missile_flights SET data=jsonb_set(data,'{status}','\"Impacted\"') WHERE id=$1",
    )
    .bind(missile.id.0)
    .execute(&f.pool)
    .await
    .unwrap();
    assert_eq!(
        f.store.commit_scoped(&claim, result).await.unwrap(),
        CommitOutcome::Conflict
    );
}

#[tokio::test]
async fn scan_candidate_indexes_do_not_read_unrelated_universe_traffic() {
    let f = setup(false, 10000 * SCALE).await;
    sqlx::query("INSERT INTO mission_fleets(universe,id,owner,data) SELECT universe,md5('phalanx-unrelated-'||g)::uuid,owner,jsonb_set(jsonb_set(jsonb_set(data,'{id}',to_jsonb(md5('phalanx-unrelated-'||g)::uuid::text)),'{intent,origin}',to_jsonb(md5('other-origin-'||g)::uuid::text)),'{intent,destination,id}',to_jsonb(md5('other-target-'||g)::uuid::text)) FROM mission_fleets CROSS JOIN generate_series(1,10000) g WHERE universe=$1").bind(f.u.0).execute(&f.pool).await.unwrap();
    sqlx::query("ANALYZE mission_fleets")
        .execute(&f.pool)
        .await
        .unwrap();
    let source = include_str!("../src/phalanx.rs");
    let query = source
        .split('"')
        .find(|s| {
            s.starts_with("SELECT data FROM mission_fleets WHERE universe=$1 AND ")
                && s.contains("origin")
        })
        .unwrap();
    let rows: Vec<Value> = sqlx::query_scalar(query)
        .bind(f.u.0)
        .bind(f.target.to_string())
        .fetch_all(&f.pool)
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
    let plan: Value = sqlx::query_scalar(&format!("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) {query}"))
        .bind(f.u.0)
        .bind(f.target.to_string())
        .fetch_one(&f.pool)
        .await
        .unwrap();
    let buffers = plan[0]["Plan"]["Shared Hit Blocks"].as_u64().unwrap()
        + plan[0]["Plan"]["Shared Read Blocks"].as_u64().unwrap();
    assert!(
        buffers < 100,
        "scan read {buffers} buffers for one of 10001 candidates: {plan}"
    );
}

#[tokio::test]
async fn pending_deactivation_fences_new_scan_admission_but_preserves_prior_claim_and_receipt() {
    let f = setup(true, 10000 * SCALE).await;
    let game = GameService::new(f.store.clone());
    let pair = scan(&f);
    game.world_submit(principal(f.b), pair.clone())
        .await
        .unwrap();
    game.step_scoped(f.u, WorkerId(Uuid::new_v4()), &InlineEngine)
        .await
        .unwrap();
    let claim = f
        .store
        .claim_scoped(f.u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = f.store.load_scoped(&claim).await.unwrap();
    let result = transition(&snapshot.state, &claim.input, &snapshot.rules);
    let current = f.store.current_rules(f.u).await.unwrap();
    let mut artifact = current.rules.artifact.clone();
    artifact.world.as_mut().unwrap().phalanx = None;
    let disabled = Ruleset::from_artifact(artifact, current.rules.speed).unwrap();
    assert!(matches!(
        f.store.apply_rules(f.u, current.revision, &disabled).await,
        Err(RulesUpdateError::Pending { .. })
    ));
    assert!(matches!(
        game.world_submit(principal(f.b), scan(&f)).await,
        Err(ServiceError::GameRejected(GameError::UnavailableContent))
    ));
    assert!(matches!(
        game.world_submit(principal(f.b), pair.clone())
            .await
            .unwrap()
            .status,
        ReceiptStatus::Pending
    ));
    f.store.commit_scoped(&claim, result).await.unwrap();
    assert_eq!(fuel(&f).await, 5000 * SCALE);
    assert!(f.store.process_runtime_barrier(f.u).await.unwrap());
    assert!(!phalanx_enabled(&f.store.load_rules(f.u).await.unwrap()));
    let committed = receipt(&f, &pair).await;
    report(&committed);
    assert_eq!(
        game.world_submit(principal(f.b), pair)
            .await
            .unwrap()
            .status,
        committed.status
    );
}

#[tokio::test]
async fn same_time_missile_impact_settles_before_scan_without_a_missile_row_or_target_scan_signal()
{
    let f = setup(false, 10000 * SCALE).await;
    let game = GameService::new(f.store.clone());
    let original: MissionFleet = serde_json::from_value(
        sqlx::query_scalar("SELECT data FROM mission_fleets LIMIT 1")
            .fetch_one(&f.pool)
            .await
            .unwrap(),
    )
    .unwrap();
    let missile = MissileFlight {
        id: OperationId(Uuid::new_v4()),
        owner: original.owner,
        terms: MissileTermsData {
            intent: MissileIntent {
                origin: original.intent.origin,
                target: MissileTarget {
                    id: f.target,
                    expected_kind: BodyKind::Planet,
                    expected_owner: f.other.player,
                },
                count: 7,
                primary: Some(DefenseId::RocketLauncher),
            },
            source_coordinates: original.origin_coordinates,
            target_coordinates: original.destination_coordinates,
            interceptor_body: f.target,
            distance: 1,
            range: 2,
            duration_ms: 10000,
            weapons: 3,
            speed: f.rules.speed,
            rules: missile_rules(&f.rules).unwrap().clone(),
            profile_hash: f.rules.hash.clone(),
            terms_hash: Hash(String::new()),
        }
        .seal(),
        launched_at: AT,
        due_at: AT + 10000,
        generation: 0,
        status: MissileStatus::InFlight,
    };

    sqlx::query("INSERT INTO missile_flights(universe,id,owner,data) VALUES($1,$2,$3,$4)")
        .bind(f.u.0)
        .bind(missile.id.0)
        .bind(missile.owner.0)
        .bind(sqlx::types::Json(&missile))
        .execute(&f.pool)
        .await
        .unwrap();
    let sequence:i64=sqlx::query_scalar("UPDATE universe_runtime SET next_sequence=next_sequence+1 WHERE universe=$1 RETURNING next_sequence-1").bind(f.u.0).fetch_one(&f.pool).await.unwrap();
    let event = ScheduledEvent::MissileImpact {
        flight: missile.id,
        generation: 0,
    };
    let input = OrderedInput {
        schema_version: 4,
        id: InputId(Uuid::new_v4()),
        universe: f.u,
        epoch: f.b.epoch,
        actor: Actor::Scheduler,
        at: missile.due_at,
        phase: 0,
        sequence,
        protocol: 4,
        profile_hash: f.rules.hash.clone(),
        payload: Input::Event(event.clone()),
    };
    sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event) VALUES($1,$2,$3,$4,$5,$6)").bind(input.id.0).bind(f.u.0).bind(input.at).bind(sequence).bind(sqlx::types::Json(&input)).bind(sqlx::types::Json(event)).execute(&f.pool).await.unwrap();
    let before = scan(&f);
    game.world_submit(principal(f.b), before.clone())
        .await
        .unwrap();
    drain(&f, false).await;
    let detail = game
        .report4(
            principal(f.b),
            context(f.b),
            report(&receipt(&f, &before).await),
        )
        .await
        .unwrap();
    assert_eq!(
        detail.data.payload["observation"]["report"]["rows"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    f.store.set_test_time(missile.due_at).await.unwrap();
    let after = scan(&f);
    game.world_submit(principal(f.b), after.clone())
        .await
        .unwrap();
    drain(&f, false).await;
    let detail = game
        .report4(
            principal(f.b),
            context(f.b),
            report(&receipt(&f, &after).await),
        )
        .await
        .unwrap();
    let rows = detail.data.payload["observation"]["report"]["rows"]
        .as_array()
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["kind"], "Fleet");
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT data->>'status' FROM missile_flights WHERE id=$1")
            .bind(missile.id.0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        "Impacted"
    );
    assert_eq!(fuel(&f).await, 0);
}

#[tokio::test]
async fn enabled_scenario_fresh_create_export_and_replace_preserve_rules_and_assets() {
    let f = setup(false, 10000 * SCALE).await;
    // Moon export is deliberately unsupported. A planet-only world exercises
    // enabled-rule round trips without changing that existing format boundary.
    let u = UniverseId(Uuid::new_v4());
    let mut document:WorldScenario=serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"phalanx-roundtrip","password":"password","planet":"1:3:8"},
        {"op":"set","user":"phalanx-roundtrip","planet":"1:3:8","ships":{"SmallCargo":3},"resources":{"metal":1234}}
    ]})).unwrap();
    document.rules = Some(f.rules.clone());
    f.store
        .apply_world_scenario(u, &document, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    assert!(phalanx_enabled(&f.store.load_rules(u).await.unwrap()));
    let saved = f.store.export_world_scenario(u).await.unwrap();
    assert!(phalanx_enabled(saved.rules.as_ref().unwrap()));
    f.store
        .apply_world_scenario(u, &saved, ScenarioMode::Replace, Uuid::new_v4())
        .await
        .unwrap();
    let restored = f.store.export_world_scenario(u).await.unwrap();
    assert_eq!(saved.rules, restored.rules);
    assert_eq!(
        serde_json::to_value(saved.edits).unwrap(),
        serde_json::to_value(restored.edits).unwrap()
    );
}

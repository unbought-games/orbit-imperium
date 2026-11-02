use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use sqlx::PgPool;
use uuid::Uuid;

struct Fixture {
    store: PgStore,
    pool: PgPool,
    binding: Binding,
    others: Vec<PlayerId>,
    auth: LoginResult,
}
impl Fixture {
    async fn new() -> Self {
        Self::with_scoped_runtime(true).await
    }
    async fn with_scoped_runtime(scoped: bool) -> Self {
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let store = PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        store.set_test_time(1000).await.unwrap();
        let u = UniverseId(Uuid::new_v4());
        let accounts = std::array::from_fn(|i| MvpAccount {
            name: format!("delete-{}-{i}", Uuid::new_v4()),
            password: Uuid::new_v4().to_string(),
        });
        store
            .bootstrap_mvp_raids(u, 1000, &accounts, &[49; 32])
            .await
            .unwrap();
        let auth = SessionService::new(store.clone())
            .login(&accounts[0].name, &accounts[0].password, None)
            .await
            .unwrap();
        let binding = store
            .current_binding(auth.session.account, u)
            .await
            .unwrap()
            .0;
        if scoped {
            store.prepare_scoped_runtime(u, 100).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        let pool = PgPool::connect(&url).await.unwrap();
        let others: Vec<Uuid> =
            sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 AND id<>$2 ORDER BY id")
                .bind(u.0)
                .bind(binding.player.0)
                .fetch_all(&pool)
                .await
                .unwrap();
        Self {
            store,
            pool,
            binding,
            others: others.into_iter().map(PlayerId).collect(),
            auth,
        }
    }
    async fn settle(&self) {
        let game = GameService::new(self.store.clone());
        for _ in 0..30 {
            let result = game
                .step_scoped(
                    self.binding.universe,
                    WorkerId(Uuid::new_v4()),
                    &InlineEngine,
                )
                .await
                .unwrap();
            assert!(!matches!(result, StepOutcome::Blocked { .. }), "{result:?}");
            if matches!(result, StepOutcome::Idle) {
                return;
            }
        }
        panic!("unexpected deletion backlog");
    }
    fn pair(&self, action: WorldAction) -> ForegroundAction {
        let id = CommandId(Uuid::new_v4());
        let b = self.binding;
        ForegroundAction {
            presence: CommandEnvelopeV4 {
                protocol: 4,
                binding: b,
                command_id: CommandId(Uuid::new_v4()),
                command: CommandDto3::Progression(Command::World {
                    action: WorldAction::RecordForegroundPresence {
                        body: None,
                        cause: PresenceCause::GameplayGesture,
                        paired_command_id: Some(id),
                    },
                }),
            },
            gameplay: CommandEnvelopeV4 {
                protocol: 4,
                binding: b,
                command_id: id,
                command: CommandDto3::Progression(Command::World { action }),
            },
        }
    }
    async fn command(&self, action: WorldAction) -> BoundReceipt {
        let pair = self.pair(action);
        let b = self.binding;
        let id = pair.gameplay.command_id;
        self.store.bound_admit4(pair.clone()).await.unwrap();
        self.settle().await;
        let receipt = self.store.bound_receipt(b, id).await.unwrap();
        let retry = self.store.bound_admit4(pair).await.unwrap();
        assert_eq!(
            serde_json::to_value(&receipt).unwrap(),
            serde_json::to_value(&retry).unwrap()
        );
        receipt
    }
}

#[tokio::test]
async fn explicit_deletion_cancellation_restart_and_account_preservation() {
    let f = Fixture::new().await;
    let b = f.binding;
    let other_universe = f
        .store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions::default(),
            Some(5),
        )
        .await
        .unwrap()
        .universe;
    f.store
        .enroll_oidc(
            b.account,
            SignupPolicy {
                universe: other_universe,
                max_players: 5,
            },
        )
        .await
        .unwrap();
    let other_binding = f
        .store
        .current_binding(b.account, other_universe)
        .await
        .unwrap()
        .0;
    let requested = f.command(WorldAction::RequestEmpireDeletion).await;
    assert!(
        matches!(requested.status, ReceiptStatus::Committed { .. }),
        "{requested:?}"
    );
    let (snap, _) = f.store.bound_world(b).await.unwrap().facts;
    let previous_home = snap.state.bodies.values().next().unwrap().clone();
    let due = snap.state.world.unwrap().records.policies[&b.player]
        .deletion_deadline()
        .unwrap()
        .unwrap();
    assert_eq!(due, 1000 + DELETION_GRACE_MS);
    f.store.set_test_time(due - 1).await.unwrap();
    let cancelled = f.command(WorldAction::CancelEmpireDeletion).await;
    assert!(
        matches!(cancelled.status, ReceiptStatus::Committed { .. }),
        "{cancelled:?}"
    );
    f.store.set_test_time(due).await.unwrap();
    f.settle().await;
    assert!(f.store.bound_world(b).await.is_ok());
    f.command(WorldAction::RequestEmpireDeletion).await;
    let due = due + DELETION_GRACE_MS;
    f.store.set_test_time(due).await.unwrap();
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    reopened.ensure_empire_cleanup().await.unwrap();
    GameService::new(reopened)
        .step_scoped(b.universe, WorkerId(Uuid::new_v4()), &InlineEngine)
        .await
        .unwrap();
    f.settle().await;
    assert!(matches!(
        f.store.current_binding(b.account, b.universe).await,
        Err(StoreError::NotFound)
    ));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM bodies WHERE owner=$1")
            .bind(b.player.0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM accounts WHERE id=$1")
            .bind(b.account.0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM universe_memberships WHERE universe=$1")
            .bind(b.universe.0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        4
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>(
            "SELECT data->>'lifecycle' FROM player_policies WHERE id=$1"
        )
        .bind(b.player.0)
        .fetch_one(&f.pool)
        .await
        .unwrap(),
        "Removed"
    );
    f.store.audit_universe(b.universe).await.unwrap();
    assert_eq!(
        f.store
            .current_binding(b.account, other_universe)
            .await
            .unwrap()
            .0,
        other_binding
    );
    f.store
        .enroll_oidc(
            b.account,
            SignupPolicy {
                universe: b.universe,
                max_players: 5,
            },
        )
        .await
        .unwrap();
    let replacement = f
        .store
        .current_binding(b.account, b.universe)
        .await
        .unwrap()
        .0;
    assert_ne!(replacement.player, b.player);
    assert_eq!(replacement.account, b.account);
    let (rejoined, _) = f.store.bound_world(replacement).await.unwrap().facts;
    let new_home = rejoined.state.bodies.values().next().unwrap();
    assert_ne!(new_home.id, previous_home.id);
    assert_eq!(new_home.coordinates, previous_home.coordinates);
    assert!(f.store.bound_world(b).await.is_err());
    f.store.audit_universe(b.universe).await.unwrap();
}

#[tokio::test]
async fn automatic_cleanup_respects_vacation_and_foreground_return() {
    let f = Fixture::new().await;
    let b = f.binding;
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{vacation}','true') WHERE id=$1")
        .bind(f.others[0].0)
        .execute(&f.pool)
        .await
        .unwrap();
    f.store.set_test_time(1000 + 28 * DAY_MS).await.unwrap();
    // A real foreground gesture cancels derived inactivity deletion.
    f.command(WorldAction::CancelEmpireDeletion).await;
    f.store
        .set_test_time(1000 + INACTIVITY_DELETION_MS)
        .await
        .unwrap();
    f.settle().await;
    let remaining: Vec<Uuid> = sqlx::query_scalar(
        "SELECT player FROM universe_memberships WHERE universe=$1 ORDER BY player",
    )
    .bind(b.universe.0)
    .fetch_all(&f.pool)
    .await
    .unwrap();
    assert_eq!(remaining.len(), 2);
    assert!(remaining.contains(&b.player.0));
    assert!(remaining.contains(&f.others[0].0));
    f.store.audit_universe(b.universe).await.unwrap();
}

async fn alliance_action(
    f: &Fixture,
    b: Binding,
    action: AllianceAction,
    revision: Option<u64>,
) -> AllianceCommandResult {
    f.store
        .alliance_command(AllianceCommandRequest {
            context: QueryContext {
                binding: b,
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            expected_revision: revision,
            action,
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn leader_cleanup_transfers_atomically_and_preserves_conversations() {
    let f = Fixture::new().await;
    let b = f.binding;
    let a = alliance_action(
        &f,
        b,
        AllianceAction::Create {
            name: "Removal Alliance".into(),
            tag: "RMA".into(),
        },
        None,
    )
    .await
    .alliance
    .unwrap();
    alliance_action(
        &f,
        b,
        AllianceAction::Update {
            alliance: a,
            name: "Removal Alliance".into(),
            tag: "RMA".into(),
            public_text: String::new(),
            recruitment: AllianceRecruitment::Open,
        },
        Some(1),
    )
    .await;
    let account: Uuid =
        sqlx::query_scalar("SELECT account FROM universe_memberships WHERE player=$1")
            .bind(f.others[0].0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    let successor = Binding {
        player: f.others[0],
        account: AccountId(account),
        ..b
    };
    alliance_action(&f, successor, AllianceAction::Join { alliance: a }, None).await;
    let third_account: Uuid =
        sqlx::query_scalar("SELECT account FROM universe_memberships WHERE player=$1")
            .bind(f.others[1].0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    let third = Binding {
        player: f.others[1],
        account: AccountId(third_account),
        ..b
    };
    alliance_action(&f, third, AllianceAction::Join { alliance: a }, None).await;
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{last_presence_at}',to_jsonb($2::bigint)) WHERE id=$1")
        .bind(third.player.0).bind(34*DAY_MS+1000).execute(&f.pool).await.unwrap();
    let successor_cursor = f
        .store
        .read_updates(successor, None, 128)
        .await
        .unwrap()
        .items[0]
        .cursor
        .clone()
        .unwrap();
    let rejected = f.command(WorldAction::RequestEmpireDeletion).await;
    assert!(matches!(
        rejected.status,
        ReceiptStatus::Rejected {
            code: GameError::AllianceLeader
        }
    ));
    let low = b.player.min(successor.player);
    let high = b.player.max(successor.player);
    let conversation = Uuid::new_v4();
    sqlx::query("INSERT INTO conversations(id,universe,epoch,player_low,player_high,created_at) VALUES($1,$2,$3,$4,$5,1000)").bind(conversation).bind(b.universe.0).bind(b.epoch.0).bind(low.0).bind(high.0).execute(&f.pool).await.unwrap();
    sqlx::query("INSERT INTO conversation_messages(id,conversation,sequence,sender,body,sent_at) VALUES($1,$2,1,$3,'Retained message',1000)").bind(Uuid::new_v4()).bind(conversation).bind(b.player.0).execute(&f.pool).await.unwrap();
    sqlx::query("INSERT INTO player_blocks(universe,epoch,blocker,blocked,created_at) VALUES($1,$2,$3,$4,1000)").bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(successor.player.0).execute(&f.pool).await.unwrap();
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{last_presence_at}',to_jsonb($2::bigint)) WHERE id=$1").bind(successor.player.0).bind(34*DAY_MS+1000).execute(&f.pool).await.unwrap();
    f.store
        .set_test_time(INACTIVITY_DELETION_MS + 1000)
        .await
        .unwrap();
    f.settle().await;
    assert_eq!(
        sqlx::query_scalar::<_, Uuid>("SELECT leader FROM alliances WHERE id=$1")
            .bind(a)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        successor.player.0
    );
    let promoted_updates = f
        .store
        .read_updates(successor, Some(&successor_cursor), 128)
        .await
        .unwrap();
    assert_eq!(promoted_updates.items.len(), 1);
    assert!(
        matches!(&promoted_updates.items[0].event, StreamEvent::Invalidate { minimum_viewer_revision } if minimum_viewer_revision == "1")
    );
    assert_eq!(
        f.store
            .bound_world(successor)
            .await
            .unwrap()
            .facts
            .0
            .state
            .world
            .unwrap()
            .records
            .policies[&successor.player]
            .last_presence_at,
        34 * DAY_MS + 1000
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM conversation_messages WHERE conversation=$1"
        )
        .bind(conversation)
        .fetch_one(&f.pool)
        .await
        .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM player_blocks WHERE universe=$1")
            .bind(b.universe.0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        0
    );
    f.store.audit_universe(b.universe).await.unwrap();
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{last_presence_at}',to_jsonb($2::bigint)) WHERE id=$1")
        .bind(third.player.0).bind(68*DAY_MS+1000).execute(&f.pool).await.unwrap();
    f.store.set_test_time(69 * DAY_MS + 1000).await.unwrap();
    f.settle().await;
    assert_eq!(
        sqlx::query_scalar::<_, Uuid>("SELECT leader FROM alliances WHERE id=$1")
            .bind(a)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        third.player.0
    );
    f.store.audit_universe(b.universe).await.unwrap();
}

#[tokio::test]
async fn http_requires_recent_signin_and_retries_do_not_require_new_authentication() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let f = Fixture::new().await;
    let b = f.binding;
    let config = orbit_transport_http::HttpConfig {
        origin: "https://game.test".into(),
        assets: "missing".into(),
        login_per_minute: 30,
        signup: None,
        signup_per_minute: 5,
        legacy_signup_enabled: true,
        wake: None,
        observer: None,
    };
    let (_tx, rx) = tokio::sync::watch::channel(false);
    let app = orbit_transport_http::router_with_profiles(f.store.clone(), config, rx, None, None);
    let pair = f.pair(WorldAction::RequestEmpireDeletion);
    let request = || {
        Request::builder()
            .method("POST")
            .uri(format!("/api/v4/universes/{}/commands", b.universe))
            .header("origin", "https://game.test")
            .header("content-type", "application/json")
            .header("cookie", format!("orbit_session={}", f.auth.token))
            .header("x-csrf-token", &f.auth.session.csrf)
            .body(Body::from(serde_json::to_vec(&pair).unwrap()))
            .unwrap()
    };
    sqlx::query("UPDATE sessions SET authenticated_at=0 WHERE account=$1")
        .bind(b.account.0)
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        app.clone().oneshot(request()).await.unwrap().status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM commands WHERE universe=$1")
            .bind(b.universe.0)
            .fetch_one(&f.pool)
            .await
            .unwrap(),
        0
    );
    sqlx::query("UPDATE sessions SET authenticated_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE account=$1").bind(b.account.0).execute(&f.pool).await.unwrap();
    assert_eq!(
        app.clone().oneshot(request()).await.unwrap().status(),
        StatusCode::ACCEPTED
    );
    f.settle().await;
    sqlx::query("UPDATE sessions SET authenticated_at=0 WHERE account=$1")
        .bind(b.account.0)
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        app.oneshot(request()).await.unwrap().status(),
        StatusCode::ACCEPTED
    );
    let p: serde_json::Value = sqlx::query_scalar("SELECT data FROM player_policies WHERE id=$1")
        .bind(b.player.0)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert_eq!(p["deletion_requested_at"], 1000);
}

#[tokio::test]
async fn signup_is_recent_authentication_but_rolling_renewal_is_not() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let policy = store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions::default(),
            Some(5),
        )
        .await
        .unwrap();
    let auth = SessionService::new(store.clone())
        .signup(
            &format!("fresh-{}", Uuid::new_v4()),
            "password",
            policy,
            None,
        )
        .await
        .unwrap();
    let digest = token_digest(&auth.token);
    assert!(store.recent_authentication(&digest).await.unwrap());
    let pool = PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    sqlx::query("UPDATE sessions SET authenticated_at=0 WHERE digest=$1")
        .bind(&digest)
        .execute(&pool)
        .await
        .unwrap();
    store.renew_session(&digest, None).await.unwrap();
    assert!(!store.recent_authentication(&digest).await.unwrap());
}

#[tokio::test]
async fn local_account_can_enroll_through_http_only_in_its_configured_universe() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let f = Fixture::new().await;
    let policy = f
        .store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions::default(),
            Some(5),
        )
        .await
        .unwrap();
    let config = orbit_transport_http::HttpConfig {
        origin: "https://game.test".into(),
        assets: "missing".into(),
        login_per_minute: 30,
        signup: Some(policy),
        signup_per_minute: 5,
        legacy_signup_enabled: true,
        wake: None,
        observer: None,
    };
    let (_tx, rx) = tokio::sync::watch::channel(false);
    let app = orbit_transport_http::router_with_profiles(f.store.clone(), config, rx, None, None);
    let request = |universe: UniverseId| {
        Request::builder()
            .method("POST")
            .uri("/api/auth/enroll")
            .header("origin", "https://game.test")
            .header("content-type", "application/json")
            .header("cookie", format!("orbit_session={}", f.auth.token))
            .header("x-csrf-token", &f.auth.session.csrf)
            .body(Body::from(
                serde_json::json!({"universe":universe}).to_string(),
            ))
            .unwrap()
    };
    assert_eq!(
        app.clone()
            .oneshot(request(policy.universe))
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    let joined = f
        .store
        .current_binding(f.binding.account, policy.universe)
        .await
        .unwrap()
        .0;
    assert_eq!(joined.account, f.binding.account);
    assert_eq!(
        app.clone()
            .oneshot(request(policy.universe))
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        f.store
            .current_binding(f.binding.account, policy.universe)
            .await
            .unwrap()
            .0,
        joined
    );
    assert_eq!(
        app.oneshot(request(f.binding.universe))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn vacation_entry_exit_replay_and_cleanup_share_one_policy_and_timer() {
    let f = Fixture::new().await;
    let b = f.binding;
    let entered = f.command(WorldAction::EnterVacation).await;
    assert!(
        matches!(entered.status, ReceiptStatus::Committed { .. }),
        "{entered:?}"
    );
    let (snapshot, _) = f.store.bound_world(b).await.unwrap().facts;
    let policy = &snapshot.state.world.as_ref().unwrap().records.policies[&b.player];
    let entered_at = policy.vacation.entered_at().unwrap();
    assert_eq!(policy.deletion_deadline().unwrap(), None);
    f.store
        .set_test_time(entered_at + VACATION_MINIMUM_MS - 1)
        .await
        .unwrap();
    let early = f.command(WorldAction::ExitVacation).await;
    assert!(
        matches!(
            early.status,
            ReceiptStatus::Rejected {
                code: GameError::VacationMinimum
            }
        ),
        "{early:?}"
    );
    let return_at = entered_at + 100 * DAY_MS;
    f.store.set_test_time(return_at).await.unwrap();
    f.settle().await;
    assert!(f.store.current_binding(b.account, b.universe).await.is_ok());
    let exited = f.command(WorldAction::ExitVacation).await;
    assert!(
        matches!(exited.status, ReceiptStatus::Committed { .. }),
        "{exited:?}"
    );
    let (snapshot, _) = f.store.bound_world(b).await.unwrap().facts;
    let p = &snapshot.state.world.as_ref().unwrap().records.policies[&b.player];
    assert!(!p.vacation.is_active());
    assert_eq!(p.last_presence_at, return_at);
    assert_eq!(
        p.deletion_deadline().unwrap(),
        Some(return_at + INACTIVITY_DELETION_MS)
    );
    let checks: Vec<i64> = sqlx::query_scalar("SELECT at_ms FROM scheduled_events WHERE universe=$1 AND event->>'type'='EmpireDeletionDue' AND event->>'player'=$2 AND NOT done AND NOT cancelled")
        .bind(b.universe.0).bind(b.player.to_string()).fetch_all(&f.pool).await.unwrap();
    assert_eq!(checks, vec![return_at + INACTIVITY_WARNING_MS]);
    f.store
        .set_test_time(return_at + INACTIVITY_WARNING_MS)
        .await
        .unwrap();
    f.settle().await;
    let (snapshot, _) = f.store.bound_world(b).await.unwrap().facts;
    assert_eq!(
        snapshot.state.world.as_ref().unwrap().records.policies[&b.player]
            .deletion_status(return_at + INACTIVITY_WARNING_MS)
            .unwrap()
            .unwrap()
            .reason,
        EmpireDeletionReason::Inactivity
    );
    f.store
        .set_test_time(return_at + INACTIVITY_DELETION_MS)
        .await
        .unwrap();
    f.settle().await;
    assert!(matches!(
        f.store.current_binding(b.account, b.universe).await,
        Err(StoreError::NotFound)
    ));
    f.store.audit_universe(b.universe).await.unwrap();
}

#[tokio::test]
async fn explicit_deletion_still_finalizes_during_vacation() {
    let f = Fixture::new().await;
    assert!(matches!(
        f.command(WorldAction::EnterVacation).await.status,
        ReceiptStatus::Committed { .. }
    ));
    assert!(matches!(
        f.command(WorldAction::RequestEmpireDeletion).await.status,
        ReceiptStatus::Committed { .. }
    ));
    let (snapshot, _) = f.store.bound_world(f.binding).await.unwrap().facts;
    let p = &snapshot.state.world.as_ref().unwrap().records.policies[&f.binding.player];
    assert!(p.vacation.is_active());
    let due = p.deletion_deadline().unwrap().unwrap();
    f.store.set_test_time(due).await.unwrap();
    f.settle().await;
    assert!(matches!(
        f.store
            .current_binding(f.binding.account, f.binding.universe)
            .await,
        Err(StoreError::NotFound)
    ));
    f.store.audit_universe(f.binding.universe).await.unwrap();
}

#[tokio::test]
async fn vacation_http_uses_normal_auth_and_returns_private_status() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let f = Fixture::new().await;
    let b = f.binding;
    let app = orbit_transport_http::router(
        f.store.clone(),
        orbit_transport_http::HttpConfig {
            origin: "https://game.test".into(),
            assets: "missing".into(),
            login_per_minute: 30,
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: true,
            wake: None,
            observer: None,
        },
    );
    let pair = f.pair(WorldAction::EnterVacation);
    let request = |authenticated| {
        let mut builder = Request::builder()
            .method("POST")
            .uri(format!("/api/v4/universes/{}/commands", b.universe))
            .header("origin", "https://game.test")
            .header("content-type", "application/json");
        if authenticated {
            builder = builder
                .header("cookie", format!("orbit_session={}", f.auth.token))
                .header("x-csrf-token", &f.auth.session.csrf);
        }
        builder
            .body(Body::from(serde_json::to_vec(&pair).unwrap()))
            .unwrap()
    };
    assert_eq!(
        app.clone().oneshot(request(false)).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        app.clone().oneshot(request(true)).await.unwrap().status(),
        StatusCode::ACCEPTED
    );
    f.settle().await;
    let receipt = f
        .store
        .bound_receipt(b, pair.gameplay.command_id)
        .await
        .unwrap();
    assert!(
        matches!(receipt.status, ReceiptStatus::Committed { .. }),
        "{receipt:?}"
    );
    let context = QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    };
    let view = GameService::new(f.store.clone())
        .world_view(
            Principal {
                account: b.account,
                player: b.player,
                universe: b.universe,
            },
            context,
        )
        .await
        .unwrap();
    assert!(view.facts.vacation.active);
    assert_eq!(
        view.facts.vacation.earliest_exit_at,
        Some(1000 + VACATION_MINIMUM_MS)
    );
}

#[tokio::test]
async fn vacation_and_launch_at_same_time_have_one_serialized_winner() {
    for vacation_first in [true, false] {
        let f = Fixture::new().await;
        let b = f.binding;
        let origin: Uuid = sqlx::query_scalar(
            "SELECT id FROM bodies WHERE universe=$1 AND owner=$2 ORDER BY id LIMIT 1",
        )
        .bind(b.universe.0)
        .bind(b.player.0)
        .fetch_one(&f.pool)
        .await
        .unwrap();
        let target: (Uuid, Uuid) = sqlx::query_as(
            "SELECT id,owner FROM bodies WHERE universe=$1 AND owner<>$2 ORDER BY id LIMIT 1",
        )
        .bind(b.universe.0)
        .bind(b.player.0)
        .fetch_one(&f.pool)
        .await
        .unwrap();
        let name: String = sqlx::query_scalar("SELECT name FROM accounts WHERE id=$1")
            .bind(b.account.0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
        let scenario: WorldScenario = serde_json::from_value(serde_json::json!({"version":1,"edits":[{
            "op":"set","user":name,"all_planets":true,"ships":{"SmallCargo":1},"resources":{"deuterium":100000},"research":{"CombustionDrive":2}
        }]})).unwrap();
        f.store
            .apply_world_scenario(b.universe, &scenario, ScenarioMode::Patch, Uuid::new_v4())
            .await
            .unwrap();
        let intent = FleetIntent {
            attack_group: None,
            hold_hours: None,
            origin: BodyId(origin),
            destination: MissionDestination::Body {
                id: BodyId(target.0),
                expected_kind: BodyKind::Planet,
                expected_owner: PlayerId(target.1),
            },
            mission: Mission::Transport,
            ships: vec![ManifestStack {
                owner: b.player,
                ship_type: ShipType::SmallCargo,
                count: 1,
            }],
            cargo: Resources::default(),
            speed_percent: 100,
        };
        let (snapshot, _) = f
            .store
            .bound_world_query(
                b,
                WorldQueryKind::FleetQuote {
                    intent: intent.clone(),
                },
            )
            .await
            .unwrap()
            .facts;
        let q = quote_fleet(
            &snapshot.state,
            b.player,
            &intent,
            snapshot.at,
            &snapshot.rules,
        )
        .unwrap();
        let mut launch = f.pair(WorldAction::LaunchFleet {
            intent,
            expected_terms_hash: q.terms_hash.clone(),
        });
        if let CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence { body, .. },
        }) = &mut launch.presence.command
        {
            *body = Some(BodyId(origin));
        }
        let vacation = f.pair(WorldAction::EnterVacation);
        let ordered = if vacation_first {
            [vacation.clone(), launch.clone()]
        } else {
            [launch.clone(), vacation.clone()]
        };
        // Admit both at one controlled time before executing either gameplay input.
        for pair in ordered {
            f.store.bound_admit4(pair).await.unwrap();
        }
        f.settle().await;
        let entered = f
            .store
            .bound_receipt(b, vacation.gameplay.command_id)
            .await
            .unwrap();
        let launched = f
            .store
            .bound_receipt(b, launch.gameplay.command_id)
            .await
            .unwrap();
        if vacation_first {
            assert!(matches!(entered.status, ReceiptStatus::Committed { .. }));
            assert!(matches!(
                launched.status,
                ReceiptStatus::Rejected {
                    code: GameError::ActorVacation
                }
            ));
        } else {
            assert!(matches!(launched.status, ReceiptStatus::Committed { .. }));
            assert!(matches!(
                entered.status,
                ReceiptStatus::Rejected {
                    code: GameError::VacationBlocked
                }
            ));
        }
        f.store.audit_universe(b.universe).await.unwrap();
    }
}

#[tokio::test]
async fn vacation_migration_preserves_old_flags_and_source_settings() {
    let f = Fixture::new().await;
    let b = f.binding;
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{vacation}','true'::jsonb) WHERE universe=$1 AND id=$2")
        .bind(b.universe.0).bind(b.player.0).execute(&f.pool).await.unwrap();
    let before: Vec<serde_json::Value> =
        sqlx::query_scalar("SELECT p.data FROM production_settings p JOIN bodies b ON b.id=p.body WHERE b.universe=$1 ORDER BY p.body")
            .bind(b.universe.0)
            .fetch_all(&f.pool)
            .await
            .unwrap();
    sqlx::raw_sql(include_str!("../migrations/0031_vacation.sql"))
        .execute(&f.pool)
        .await
        .unwrap();
    let data: serde_json::Value =
        sqlx::query_scalar("SELECT data FROM player_policies WHERE universe=$1 AND id=$2")
            .bind(b.universe.0)
            .bind(b.player.0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    let policy: PlayerPolicy = serde_json::from_value(data).unwrap();
    assert!(policy.vacation.is_active());
    assert!(policy.vacation.entered_at().unwrap() > 1000);
    assert_eq!(
        policy.vacation.earliest_exit_at().unwrap(),
        policy
            .vacation
            .entered_at()
            .map(|at| at + VACATION_MINIMUM_MS)
    );
    assert_eq!(
        before,
        sqlx::query_scalar::<_, serde_json::Value>(
            "SELECT p.data FROM production_settings p JOIN bodies b ON b.id=p.body WHERE b.universe=$1 ORDER BY p.body"
        )
        .bind(b.universe.0)
        .fetch_all(&f.pool)
        .await
        .unwrap()
    );
}

async fn operator_vacation_edit(f: &Fixture, edit: serde_json::Value, operation: Uuid) {
    let name: String = sqlx::query_scalar("SELECT name FROM accounts WHERE id=$1")
        .bind(f.binding.account.0)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    let mut edit = edit;
    edit["op"] = serde_json::json!("set");
    edit["user"] = serde_json::json!(name);
    let document: WorldScenario =
        serde_json::from_value(serde_json::json!({"version":1,"edits":[edit]})).unwrap();
    f.store
        .apply_world_scenario(
            f.binding.universe,
            &document,
            ScenarioMode::Patch,
            operation,
        )
        .await
        .unwrap();
}

async fn live_cleanup_times(f: &Fixture) -> Vec<i64> {
    sqlx::query_scalar("SELECT at_ms FROM scheduled_events WHERE universe=$1 AND event->>'type'='EmpireDeletionDue' AND event->>'player'=$2 AND NOT done AND NOT cancelled ORDER BY at_ms")
        .bind(f.binding.universe.0).bind(f.binding.player.to_string()).fetch_all(&f.pool).await.unwrap()
}

#[tokio::test]
async fn operator_vacation_exit_with_explicit_activity_reschedules_cleanup() {
    let f = Fixture::new().await;
    f.command(WorldAction::EnterVacation).await;
    let returned_at = 100 * DAY_MS + 1000;
    f.store.set_test_time(returned_at).await.unwrap();
    f.settle().await;
    let edit = serde_json::json!({"vacation":false,"activity":"active"});
    let operation = Uuid::new_v4();
    operator_vacation_edit(&f, edit.clone(), operation).await;
    let (snapshot, _) = f.store.bound_world(f.binding).await.unwrap().facts;
    let p = &snapshot.state.world.as_ref().unwrap().records.policies[&f.binding.player];
    assert!(!p.vacation.is_active());
    assert_eq!(p.last_presence_at, returned_at);
    assert_eq!(
        p.deletion_deadline().unwrap(),
        Some(returned_at + INACTIVITY_DELETION_MS)
    );
    assert_eq!(
        live_cleanup_times(&f).await,
        vec![returned_at + INACTIVITY_WARNING_MS]
    );
    operator_vacation_edit(&f, edit, operation).await;
    assert_eq!(
        live_cleanup_times(&f).await,
        vec![returned_at + INACTIVITY_WARNING_MS]
    );
    f.store
        .set_test_time(returned_at + INACTIVITY_WARNING_MS)
        .await
        .unwrap();
    f.settle().await;
    assert_eq!(
        live_cleanup_times(&f).await,
        vec![returned_at + INACTIVITY_DELETION_MS]
    );
    f.store.audit_universe(f.binding.universe).await.unwrap();
}

#[tokio::test]
async fn operator_combined_vacation_body_edits_persist_and_retry_without_duplicate_changes() {
    let f = Fixture::new().await;
    let (snapshot, _) = f.store.bound_world(f.binding).await.unwrap().facts;
    let original = snapshot
        .state
        .bodies
        .values()
        .find(|b| b.owner == f.binding.player)
        .unwrap()
        .clone();
    let operation = Uuid::new_v4();
    let edit = serde_json::json!({"vacation":true,"all_planets":true,"resources":{"metal":42},"buildings":{"MetalMine":1}});
    operator_vacation_edit(&f, edit.clone(), operation).await;
    let (snapshot, _) = f.store.bound_world(f.binding).await.unwrap().facts;
    let body = &snapshot.state.bodies[&original.id];
    assert_eq!(body.checkpoint.amounts.metal, 42 * SCALE);
    assert_eq!(body.levels[&Building::MetalMine], 1);
    assert!(body.revision > original.revision);
    let committed = body.clone();
    assert!(
        snapshot.state.world.as_ref().unwrap().records.policies[&f.binding.player]
            .vacation
            .is_active()
    );
    operator_vacation_edit(&f, edit, operation).await;
    let (snapshot, _) = f.store.bound_world(f.binding).await.unwrap().facts;
    assert_eq!(snapshot.state.bodies[&original.id], committed);
    f.store.audit_universe(f.binding.universe).await.unwrap();
}

#[tokio::test]
async fn operator_vacation_exit_preserves_explicit_deletion_and_explicit_presence_age() {
    let f = Fixture::new().await;
    f.command(WorldAction::EnterVacation).await;
    f.command(WorldAction::RequestEmpireDeletion).await;
    let at = DAY_MS + 1000;
    f.store.set_test_time(at).await.unwrap();
    operator_vacation_edit(
        &f,
        serde_json::json!({"vacation":false,"activity":"active","presence_age_ms":100}),
        Uuid::new_v4(),
    )
    .await;
    let (snapshot, _) = f.store.bound_world(f.binding).await.unwrap().facts;
    let p = &snapshot.state.world.as_ref().unwrap().records.policies[&f.binding.player];
    assert_eq!(p.last_presence_at, at - 100);
    assert_eq!(p.deletion_requested_at, Some(1000));
    assert_eq!(
        p.deletion_deadline().unwrap(),
        Some(1000 + DELETION_GRACE_MS)
    );
    assert_eq!(live_cleanup_times(&f).await, vec![1000 + DELETION_GRACE_MS]);
    f.store.audit_universe(f.binding.universe).await.unwrap();
}

#[tokio::test]
async fn operator_vacation_flag_alone_does_not_fabricate_foreground_presence() {
    let f = Fixture::new().await;
    f.command(WorldAction::EnterVacation).await;
    let at = 100 * DAY_MS + 1000;
    f.store.set_test_time(at).await.unwrap();
    f.settle().await;
    operator_vacation_edit(&f, serde_json::json!({"vacation":false}), Uuid::new_v4()).await;
    let (snapshot, _) = f.store.bound_world(f.binding).await.unwrap().facts;
    let p = &snapshot.state.world.as_ref().unwrap().records.policies[&f.binding.player];
    assert_eq!(p.last_presence_at, 1000);
    assert_eq!(
        p.deletion_deadline().unwrap(),
        Some(1000 + INACTIVITY_DELETION_MS)
    );
    assert_eq!(live_cleanup_times(&f).await, vec![at + 1]);
    f.store.set_test_time(at + 1).await.unwrap();
    f.settle().await;
    assert!(matches!(
        f.store
            .current_binding(f.binding.account, f.binding.universe)
            .await,
        Err(StoreError::NotFound)
    ));
}

#[tokio::test]
async fn retained_world_cleanup_uses_worker_pool_and_is_idempotent() {
    for scoped in [false, true] {
        retained_world_cleanup(scoped).await;
    }
}

async fn retained_world_cleanup(scoped: bool) {
    let f = Fixture::with_scoped_runtime(scoped).await;
    let u = f.binding.universe;
    // Simulate an existing world created before deletion checks were introduced.
    sqlx::query(
        "DELETE FROM scheduled_events WHERE universe=$1 AND event->>'type'='EmpireDeletionDue'",
    )
    .bind(u.0)
    .execute(&f.pool)
    .await
    .unwrap();
    let worker = PgStore::connect_with_limits(
        &std::env::var("TEST_DATABASE_URL").unwrap(),
        orbit_storage_postgres::PoolLimits {
            admission: 0,
            reads: 0,
            worker: 2,
            control: 2,
            refresh: 0,
        },
    )
    .await
    .unwrap();
    worker.ensure_empire_cleanup().await.unwrap();
    let checks: Vec<(Uuid, i64, i64)> = sqlx::query_as("SELECT id,at_ms,sequence FROM scheduled_events WHERE universe=$1 AND event->>'type'='EmpireDeletionDue' AND NOT done AND NOT cancelled ORDER BY id")
        .bind(u.0).fetch_all(&f.pool).await.unwrap();
    assert_eq!(checks.len(), f.others.len() + 1);
    assert!(checks.iter().all(|(_, at, _)| *at > 1000));
    worker.ensure_empire_cleanup().await.unwrap();
    let repeated: Vec<(Uuid, i64, i64)> = sqlx::query_as("SELECT id,at_ms,sequence FROM scheduled_events WHERE universe=$1 AND event->>'type'='EmpireDeletionDue' AND NOT done AND NOT cancelled ORDER BY id")
        .bind(u.0).fetch_all(&f.pool).await.unwrap();
    assert_eq!(checks, repeated);
    let memberships: i64 =
        sqlx::query_scalar("SELECT count(*) FROM universe_memberships WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!(memberships, checks.len() as i64);
}

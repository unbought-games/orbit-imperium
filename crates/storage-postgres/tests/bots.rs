use orbit_application::*;
use orbit_engine::{WorkerId, WorldAction};
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;

async fn setup(limit: u32) -> (PgStore, PgPool, UniverseId) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(12 * 3_600_000).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe: u,
            immutable: UniverseImmutable::default(),
            policy: UniversePolicy {
                bots: BotPolicy {
                    version: 1,
                    enabled: true,
                    max_active: 3,
                    action_units_per_24h: Some(limit),
                },
                ..Default::default()
            },
        })
        .await
        .unwrap();
    (store, PgPool::connect(&url).await.unwrap(), u)
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
fn command(b: Binding) -> CommandEnvelopeV4 {
    CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: None,
                cause: orbit_engine::PresenceCause::GameplayGesture,
                paired_command_id: None,
            },
        }),
    }
}
fn galaxy(b: Binding) -> WorldQuery {
    WorldQuery {
        context: context(b),
        query: WorldQueryKind::Galaxy {
            galaxy: 1,
            system: 1,
        },
    }
}
fn denied<T: std::fmt::Debug>(result: Result<T, ServiceError>, code: BotDenialCode) {
    assert!(
        matches!(&result,Err(ServiceError::BotDenied(d)) if d.code==code),
        "{result:?}"
    );
}
async fn drain(store: &PgStore, u: UniverseId) {
    let game = GameService::new(store.clone());
    for _ in 0..100 {
        if matches!(
            game.step(u, WorkerId(Uuid::new_v4())).await.unwrap(),
            StepOutcome::Idle
        ) {
            return;
        }
    }
    panic!("drain");
}

#[tokio::test]
async fn identity_tokens_admission_and_policy() {
    let (store, pool, u) = setup(5).await;
    let b = store.create_bot(u, "automaton", 0).await.unwrap();
    let token = store.issue_bot_token(u, b.player).await.unwrap();
    let session = store
        .authenticate_machine(&token_digest(&token))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(session.memberships.len(), 1);
    assert_eq!(session.memberships[0].universe, u);
    assert_eq!(
        store.player_identities(u, vec![b.player]).await.unwrap()[0].kind,
        PlayerKind::Bot
    );
    assert!(store.find_credentials("automaton").await.unwrap().is_none());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions WHERE account=$1")
            .bind(b.account.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    let mut ceiling = store.universe_config(u).await.unwrap();
    ceiling.policy.max_players = Some(1);
    store.apply_universe_config(&ceiling).await.unwrap();
    assert!(matches!(
        store.create_bot(u, "blocked-by-ceiling", 0).await,
        Err(StoreError::UniverseFull)
    ));
    let mut ceiling = store.universe_config(u).await.unwrap();
    ceiling.policy.max_players = None;
    store.apply_universe_config(&ceiling).await.unwrap();
    let (other, third) = tokio::join!(
        store.create_bot(u, "second", 0),
        store.create_bot(u, "third", 0)
    );
    let other = other.unwrap();
    third.unwrap();
    assert!(
        matches!(store.create_bot(u,"fourth",0).await,Err(StoreError::BotDenied(d)) if d.code==BotDenialCode::BotCapacityReached)
    );
    let before = store.current_binding(b.account, u).await.unwrap().0;
    store.mark_bot(u, b.player, 0).await.unwrap();
    assert!(store.mark_bot(u, b.player, 1).await.is_err());
    store.revoke_bot_tokens(u, b.player).await.unwrap();
    assert!(
        store
            .authenticate_machine(&token_digest(&token))
            .await
            .unwrap()
            .is_none()
    );
    let rotated = store.issue_bot_token(u, b.player).await.unwrap();
    assert!(
        store
            .authenticate_machine(&token_digest(&rotated))
            .await
            .unwrap()
            .is_some()
    );
    assert_eq!(store.current_binding(b.account, u).await.unwrap().0, before);
    let mut policy = store.universe_config(u).await.unwrap();
    policy.policy.bots.max_active = 1;
    store.apply_universe_config(&policy).await.unwrap();
    assert!(
        store
            .apply_universe_config(&UniverseConfigDocument {
                policy: UniversePolicy {
                    bots: BotPolicy::default(),
                    ..policy.policy.clone()
                },
                ..policy.clone()
            })
            .await
            .is_err()
    );
    assert_eq!(
        store.bot_status(principal(other)).await.unwrap().state,
        "retired"
    );
    assert_eq!(
        store.bot_status(principal(b)).await.unwrap().state,
        "active"
    );
}
#[tokio::test]
async fn rolling_budget_replay_sleep_retirement_and_concurrency() {
    let (store, pool, u) = setup(2).await;
    let b = store.create_bot(u, "metered", 0).await.unwrap();
    let game = GameService::new(store.clone());
    let q = galaxy(b);
    let original = game.world_query(principal(b), q.clone()).await.unwrap();
    assert_eq!(
        serde_json::to_value(game.world_query(principal(b), q.clone()).await.unwrap()).unwrap(),
        serde_json::to_value(&original).unwrap()
    );
    let mut changed = q.clone();
    changed.query = WorldQueryKind::Galaxy {
        galaxy: 1,
        system: 2,
    };
    assert!(matches!(
        game.world_query(principal(b), changed).await,
        Err(ServiceError::Conflict)
    ));
    let (a, c) = tokio::join!(
        game.world_query(principal(b), galaxy(b)),
        game.world_query(principal(b), galaxy(b))
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(c.is_ok()), 1);
    assert_eq!(
        store.bot_status(principal(b)).await.unwrap().allowance_used,
        2
    );
    denied(
        game.world_query(principal(b), galaxy(b)).await,
        BotDenialCode::BotBudgetExhausted,
    );
    game.world_view(principal(b), context(b)).await.unwrap();
    // Sleep includes its exact start and excludes its end. Midnight gives no refill.
    store.set_test_time(BOT_DAY_MS).await.unwrap();
    denied(
        game.world_query(principal(b), q.clone()).await,
        BotDenialCode::BotSleeping,
    );
    denied(
        game.world_view(principal(b), context(b)).await,
        BotDenialCode::BotSleeping,
    );
    game.bound_settings(principal(b), context(b)).await.unwrap();
    store.set_test_time(BOT_DAY_MS + BOT_REST_MS).await.unwrap();
    denied(
        game.world_query(principal(b), galaxy(b)).await,
        BotDenialCode::BotBudgetExhausted,
    );
    store
        .set_test_time(BOT_DAY_MS + 12 * 3_600_000 - 1)
        .await
        .unwrap();
    assert_eq!(
        store
            .bot_status(principal(b))
            .await
            .unwrap()
            .allowance_available,
        0
    );
    store
        .set_test_time(BOT_DAY_MS + 12 * 3_600_000)
        .await
        .unwrap();
    assert_eq!(
        store
            .bot_status(principal(b))
            .await
            .unwrap()
            .allowance_available,
        2
    );
    let e = command(b);
    game.world_presence(principal(b), e.clone()).await.unwrap();
    drain(&store, u).await;
    let receipt = game
        .bound_receipt(principal(b), b, e.command_id)
        .await
        .unwrap();
    store
        .retire_bot(principal(b), "test retirement")
        .await
        .unwrap();
    store
        .retire_bot(principal(b), "changed retry reason")
        .await
        .unwrap();
    assert_eq!(
        store
            .bot_status(principal(b))
            .await
            .unwrap()
            .retirement_reason
            .as_deref(),
        Some("test retirement")
    );
    assert_eq!(
        serde_json::to_value(game.world_presence(principal(b), e).await.unwrap()).unwrap(),
        serde_json::to_value(receipt).unwrap()
    );
    denied(
        game.world_presence(principal(b), command(b)).await,
        BotDenialCode::BotRetired,
    );
    denied(
        game.world_view(principal(b), context(b)).await,
        BotDenialCode::BotRetired,
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM bot_retirements WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
}
#[tokio::test]
async fn bearer_http_scope_csrf_and_marked_cookie_enforcement() {
    use http_body_util::BodyExt;
    use orbit_transport_http::{
        HttpConfig, router,
        test_http::{Body, Request},
    };
    use tower::ServiceExt;
    let (store, _, u) = setup(2).await;
    let human = SessionService::new(store.clone())
        .signup(
            "migrating",
            "test-password",
            SignupPolicy {
                universe: u,
                max_players: 99,
            },
            None,
        )
        .await
        .unwrap();
    let b = store
        .current_binding(human.session.account, u)
        .await
        .unwrap()
        .0;
    store.mark_bot(u, b.player, 0).await.unwrap();
    let token = store.issue_bot_token(u, b.player).await.unwrap();
    let app = router(
        store.clone(),
        HttpConfig {
            origin: "https://game.test".into(),
            assets: "missing".into(),
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: true,
            login_per_minute: 30,
            wake: None,
            observer: None,
        },
    );
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("/api/v4/universes/{u}/bot-status"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("/api/v4/universes/{}/bot-status", Uuid::new_v4()))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    let stream = app
        .clone()
        .oneshot(
            Request::get(format!("/api/v4/universes/{u}/updates?epoch={}", b.epoch))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(stream.status(), 200);
    store.set_test_time(BOT_DAY_MS).await.unwrap();
    tokio::time::timeout(
        std::time::Duration::from_secs(3),
        stream.into_body().collect(),
    )
    .await
    .expect("sleep closes existing stream")
    .unwrap();
    let public = format!("/api/v4/universes/{u}/alliances/{}", Uuid::new_v4());
    let inactive = app
        .clone()
        .oneshot(
            Request::get(&public)
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(inactive.status(), 403);
    let anonymous = app
        .clone()
        .oneshot(Request::get(public).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 404);
    assert!(!game_catalog(&store, b).await.catalog.is_empty());
    for bearer in [false, true] {
        let mut req = Request::post(format!("/api/v4/universes/{u}/overview"))
            .header("content-type", "application/json");
        if bearer {
            req = req.header("authorization", format!("Bearer {token}"));
        } else {
            req = req
                .header("cookie", format!("orbit_session={}", human.token))
                .header("origin", "https://game.test")
                .header("x-csrf-token", &human.session.csrf);
        }
        let response = app
            .clone()
            .oneshot(
                req.body(Body::from(serde_json::to_vec(&context(b)).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 403);
        let data: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(data["code"], "BotSleeping");
    }
    let response = app
        .clone()
        .oneshot(
            Request::post(format!("/api/v4/universes/{u}/bot-retire"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(r#"{"reason":"finished"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 204);
    store.revoke_bot_tokens(u, b.player).await.unwrap();
    let response = app
        .oneshot(
            Request::get(format!("/api/v4/universes/{u}/bot-status"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 401);
}

#[tokio::test]
async fn machine_growth_and_cancellation_use_ordinary_body_participation() {
    let (store, pool, u) = setup(10).await;
    let b = store.create_bot(u, "builder", 0).await.unwrap();
    let game = GameService::new(store.clone());
    let body = BodyId(
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM bodies WHERE owner=$1")
            .bind(b.player.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
    );
    let quote = game
        .progression_options(
            principal(b),
            context(b),
            QuoteRequestDto3::Progression(QuoteRequest::Upgrade {
                body,
                building: orbit_engine::Building::MetalMine,
            }),
        )
        .await
        .unwrap()
        .facts
        .inspection;
    let e = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::StartUpgrade {
            body,
            building: orbit_engine::Building::MetalMine,
            expected_terms_hash: quote.terms_hash.unwrap(),
        }),
    };
    let (a, c) = tokio::join!(
        game.machine_submit(principal(b), e.clone()),
        game.machine_submit(principal(b), e.clone())
    );
    assert!(a.is_ok(), "{a:?}");
    assert!(c.is_ok(), "{c:?}");
    drain(&store, u).await;
    assert!(matches!(
        game.bound_receipt(principal(b), b, e.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    assert_eq!(
        store.bot_status(principal(b)).await.unwrap().allowance_used,
        1
    );
    let operation = orbit_engine::OperationId(
        sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM constructions WHERE owner=$1 AND status='Active'",
        )
        .bind(b.player.0)
        .fetch_one(&pool)
        .await
        .unwrap(),
    );
    let cancel = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::CancelConstruction { operation }),
    };
    game.machine_submit(principal(b), cancel.clone())
        .await
        .unwrap();
    drain(&store, u).await;
    assert!(matches!(
        game.bound_receipt(principal(b), b, cancel.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    let rejected = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::StartUpgrade {
            body,
            building: orbit_engine::Building::MetalMine,
            expected_terms_hash: Hash("0".repeat(64)),
        }),
    };
    game.machine_submit(principal(b), rejected.clone())
        .await
        .unwrap();
    drain(&store, u).await;
    assert!(matches!(
        game.bound_receipt(principal(b), b, rejected.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Rejected { .. }
    ));
    assert_eq!(
        store.bot_status(principal(b)).await.unwrap().allowance_used,
        3
    );
    store
        .retire_bot_player(u, b.player, "completed")
        .await
        .unwrap();
    game.machine_submit(principal(b), e).await.unwrap();
    game.machine_submit(principal(b), cancel).await.unwrap();
    game.machine_submit(principal(b), rejected).await.unwrap();
    assert_eq!(
        store.bot_status(principal(b)).await.unwrap().allowance_used,
        3
    );
}

#[tokio::test]
async fn tactical_negative_results_social_replay_and_lowered_allowance() {
    use serde_json::json;
    let (store, _, u) = setup(3).await;
    let b = store.create_bot(u, "social", 0).await.unwrap();
    let game = GameService::new(store.clone());
    let q = WorldQuery {
        context: context(b),
        query: WorldQueryKind::ResolveDestination {
            selection: orbit_engine::DestinationSelection::BodyAt {
                coordinates: orbit_engine::Coordinates {
                    galaxy: 1,
                    system: 100,
                    position: 1,
                },
                kind: orbit_engine::BodyKind::Planet,
            },
        },
    };
    assert!(matches!(
        game.world_query(principal(b), q.clone()).await,
        Err(ServiceError::GameRejected(
            orbit_engine::GameError::NotFound
        ))
    ));
    assert!(matches!(
        game.world_query(principal(b), q).await,
        Err(ServiceError::GameRejected(
            orbit_engine::GameError::NotFound
        ))
    ));
    assert_eq!(
        store.bot_status(principal(b)).await.unwrap().allowance_used,
        1
    );
    store.set_test_time(12 * 3_600_000 + 60_000).await.unwrap();
    let social:AllianceCommandRequest=serde_json::from_value(json!({"context":context(b),"command_id":Uuid::new_v4(),"expected_revision":null,"action":{"type":"Create","name":"Machine Federation","tag":"BOT"}})).unwrap();
    let first = game
        .alliance_command(principal(b), social.clone())
        .await
        .unwrap();
    let retry = game
        .alliance_command(principal(b), social.clone())
        .await
        .unwrap();
    assert_eq!(first.alliance, retry.alliance);
    let mut policy = store.universe_config(u).await.unwrap();
    policy.policy.bots.action_units_per_24h = Some(1);
    store.apply_universe_config(&policy).await.unwrap();
    let status = store.bot_status(principal(b)).await.unwrap();
    assert_eq!(status.allowance_used, 2);
    assert_eq!(
        status.next_eligible_at,
        Some(BOT_DAY_MS + 12 * 3_600_000 + 60_000)
    );
    let mut policy = store.universe_config(u).await.unwrap();
    policy.policy.bots.enabled = false;
    store.apply_universe_config(&policy).await.unwrap();
    denied(
        game.world_view(principal(b), context(b)).await,
        BotDenialCode::BotsDisabled,
    );
    game.alliance_command(principal(b), social).await.unwrap();
    assert!(
        matches!(store.create_bot(u,"disabled",0).await,Err(StoreError::BotDenied(d)) if d.code==BotDenialCode::BotsDisabled)
    );
    game.bound_settings(principal(b), context(b)).await.unwrap();
}

async fn game_catalog(store: &PgStore, b: Binding) -> BoundCatalog {
    GameService::new(store.clone())
        .bound_catalog(principal(b), context(b))
        .await
        .unwrap()
}

#[tokio::test]
async fn scoped_replicas_share_last_unit_and_retirement_preserves_admitted_work() {
    let (store, pool, u) = setup(1).await;
    let b = store.create_bot(u, "scoped", 0).await.unwrap();
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    let replica = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let other = GameService::new(replica);
    let body = BodyId(
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM bodies WHERE owner=$1")
            .bind(b.player.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
    );
    let envelope = |name: &str| CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RenamePlanet {
                body,
                name: name.into(),
            },
        }),
    };
    let (a, c) = (envelope("First"), envelope("Second"));
    let (ar, cr) = tokio::join!(
        game.machine_submit(principal(b), a.clone()),
        other.machine_submit(principal(b), c.clone())
    );
    let accepted = match (ar, cr) {
        (Ok(_), Err(ServiceError::BotDenied(d))) if d.code == BotDenialCode::BotBudgetExhausted => {
            a
        }
        (Err(ServiceError::BotDenied(d)), Ok(_)) if d.code == BotDenialCode::BotBudgetExhausted => {
            c
        }
        result => panic!("{result:?}"),
    };
    store
        .retire_bot_player(u, b.player, "retire with admitted work")
        .await
        .unwrap();
    let mut idle = false;
    for _ in 0..20 {
        if matches!(
            game.step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap(),
            StepOutcome::Idle
        ) {
            idle = true;
            break;
        }
    }
    assert!(idle);
    assert!(matches!(
        game.bound_receipt(principal(b), b, accepted.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    other.machine_submit(principal(b), accepted).await.unwrap();
    assert_eq!(
        store.bot_status(principal(b)).await.unwrap().allowance_used,
        1
    );
}

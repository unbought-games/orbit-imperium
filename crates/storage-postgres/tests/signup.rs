use orbit_application::*;
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;

// Catches the fixed-five startup assumption and any account/planet grant outside the transaction.
#[tokio::test]
async fn empty_start_signup_concurrency_capacity_and_restart() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    // Delay the first creator beyond ordinary metadata lock waits. Both starters
    // must wait, recheck selection, and converge on the same default world.
    let mut creation = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(901323)")
        .execute(&mut *creation)
        .await
        .unwrap();
    let (a, b, ()) = tokio::join!(
        store.ensure_signup_universe(
            None,
            orbit_engine::UniverseOptions {
                systems_per_galaxy: Some(5),
                ..Default::default()
            },
            None
        ),
        store.ensure_signup_universe(
            None,
            orbit_engine::UniverseOptions {
                systems_per_galaxy: Some(5),
                ..Default::default()
            },
            None
        ),
        async {
            tokio::time::timeout(std::time::Duration::from_secs(2), async {
                loop {
                    let waiting: i64 = sqlx::query_scalar("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND l.objid=901323 AND NOT l.granted")
                        .fetch_one(&pool).await.unwrap();
                    if waiting == 2 { break; }
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                }
            }).await.unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            creation.commit().await.unwrap();
        }
    );
    let u = a.unwrap().universe;
    assert_eq!(b.unwrap().universe, u);
    let at: i64 = sqlx::query_scalar("SELECT frontier FROM universe_runtime WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    store.set_test_time(at).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM accounts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    drop(store.server_guard_config(None).await.unwrap());
    let auth = SessionService::new(store.clone());
    let policy = SignupPolicy {
        universe: u,
        max_players: 10,
    };
    let password = "simple-password";
    for (name, password) in [("", "p"), ("   ", "p"), ("new", ""), ("bad\nname", "p")] {
        assert!(matches!(
            auth.signup(name, password, policy, None).await,
            Err(ServiceError::Malformed)
        ));
    }
    let first = auth
        .signup("  ALPHA  ", password, policy, None)
        .await
        .unwrap();
    assert_eq!(first.session.memberships.len(), 1);
    let first_player = first.session.memberships[0].player;
    assert_eq!(
        sqlx::query_scalar::<_, Option<i64>>(
            "SELECT joined_at_ms FROM universe_memberships WHERE player=$1"
        )
        .bind(first_player.0)
        .fetch_one(&pool)
        .await
        .unwrap(),
        Some(at)
    );
    let amounts: serde_json::Value =
        sqlx::query_scalar("SELECT amounts FROM bodies WHERE owner=$1")
            .bind(first_player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        amounts,
        serde_json::json!({"metal":1000000000,"crystal":1000000000,"deuterium":0})
    );
    // Model a player enrolled before the starter balance changed. Login, other
    // signups, and server startup must never replenish that existing account.
    sqlx::query("UPDATE bodies SET amounts=$2 WHERE owner=$1")
        .bind(first_player.0)
        .bind(serde_json::json!({"metal":500000000,"crystal":500000000,"deuterium":0}))
        .execute(&pool)
        .await
        .unwrap();
    assert!(auth.login("alpha", password, None).await.is_ok());
    assert!(matches!(
        auth.signup("Alpha", password, policy, None).await,
        Err(ServiceError::Conflict)
    ));
    for i in 1..9 {
        auth.signup(&format!("player{i}"), password, policy, None)
            .await
            .unwrap();
    }
    let (a, b) = tokio::join!(
        auth.signup("last-a", password, policy, None),
        auth.signup("last-b", password, policy, None)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(matches!(
        a.err().or(b.err()),
        Some(ServiceError::UniverseFull)
    ));
    let counts: (i64,i64,i64,i64) = sqlx::query_as("SELECT (SELECT count(*) FROM accounts), (SELECT count(*) FROM players), (SELECT count(*) FROM bodies), (SELECT count(DISTINCT (galaxy,system,position)) FROM bodies)").fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (10, 10, 10, 10));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(DISTINCT system) FROM bodies")
            .fetch_one(&pool)
            .await
            .unwrap(),
        3
    );
    let amounts: Vec<serde_json::Value> =
        sqlx::query_scalar("SELECT amounts FROM bodies WHERE owner<>$1")
            .bind(first_player.0)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(amounts.len(), 9);
    for balance in amounts {
        assert_eq!(
            balance,
            serde_json::json!({"metal":1000000000,"crystal":1000000000,"deuterium":0})
        );
    }
    let reopened = PgStore::connect(&url).await.unwrap();
    assert_eq!(
        reopened
            .ensure_signup_universe(None, Default::default(), None)
            .await
            .unwrap()
            .universe,
        u
    );
    drop(reopened.server_guard_config(None).await.unwrap());
    assert_eq!(
        SessionService::new(reopened.clone())
            .authenticate(&first.token)
            .await
            .unwrap()
            .account,
        first.session.account
    );
    let service = GameService::new(reopened);
    let binding = service
        .current_binding(first.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let view = service
        .bound_view(
            Principal {
                account: binding.account,
                player: binding.player,
                universe: u,
            },
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    assert_eq!(view.view.bodies.len(), 1);
    assert_eq!(view.view.bodies[0].amounts.metal, "500000000");
    assert_eq!(view.view.bodies[0].amounts.crystal, "500000000");
    assert_eq!(view.view.bodies[0].amounts.deuterium, "0");
    // A worker's covered facts exclude the new player; signup need not wait.
    store
        .admit(
            Actor::Player(binding.player),
            u,
            CommandEnvelope {
                command_id: Uuid::new_v4().into(),
                epoch: binding.epoch,
                protocol: 4,
                command: orbit_engine::Command::World {
                    action: orbit_engine::WorldAction::RecordForegroundPresence {
                        body: None,
                        cause: orbit_engine::PresenceCause::AccountVisit,
                        paired_command_id: None,
                    },
                },
            },
        )
        .await
        .unwrap();
    let claim = store
        .claim_next(u, Uuid::new_v4().into())
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_claim(&claim).await.unwrap();
    let enrolled = auth
        .signup(
            "busy",
            password,
            SignupPolicy {
                universe: u,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    assert!(store.find_credentials("busy").await.unwrap().is_some());
    assert!(matches!(
        store
            .commit_claim(
                &claim,
                orbit_engine::transition(&facts.state, &claim.input, &facts.rules)
            )
            .await
            .unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let retained: i64 = sqlx::query_scalar("SELECT count(*) FROM bodies WHERE owner=$1")
        .bind(enrolled.session.memberships[0].player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(retained, 1);
    // Failure halfway through enrollment must not strand an account or consume a planet slot.
    sqlx::raw_sql("CREATE FUNCTION fail_signup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER fail_signup BEFORE INSERT ON building_levels FOR EACH ROW EXECUTE FUNCTION fail_signup();").execute(&pool).await.unwrap();
    let more = SignupPolicy {
        universe: u,
        max_players: 45,
    };
    assert!(auth.signup("rollback", password, more, None).await.is_err());
    assert!(store.find_credentials("rollback").await.unwrap().is_none());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM universe_memberships WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        11
    );
    sqlx::raw_sql("DROP TRIGGER fail_signup ON building_levels; DROP FUNCTION fail_signup();")
        .execute(&pool)
        .await
        .unwrap();
    let next = auth
        .signup("rollback", password, more, Some(&first.token))
        .await
        .unwrap();
    assert!(auth.authenticate(&first.token).await.is_err());
    assert!(auth.authenticate(&next.token).await.is_ok());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM accounts")
            .fetch_one(&pool)
            .await
            .unwrap(),
        12
    );
}

#[tokio::test]
async fn signup_http_origin_cookie_disabled_and_rate_limit() {
    use http_body_util::BodyExt;
    use orbit_transport_http::{
        HttpConfig, router,
        test_http::{Body, Request},
    };
    use tower::ServiceExt;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = store
        .ensure_signup_universe(Some(Uuid::new_v4().into()), Default::default(), None)
        .await
        .unwrap()
        .universe;
    let config = HttpConfig {
        origin: "https://game.example".into(),
        secure_cookies: true,
        assets: "missing".into(),
        login_per_minute: 30,
        signup: Some(SignupPolicy {
            universe: u,
            max_players: 2,
        }),
        signup_per_minute: 2,
        legacy_signup_enabled: true,
        trusted_fly_proxies: vec![],
        wake: None,
        observer: None,
    };
    let app = router(store.clone(), config.clone());
    let send = |origin: &str, name: &str| {
        Request::builder()
            .uri("/api/v1/registration")
            .method("POST")
            .header("Origin", origin)
            .header("Content-Type", "application/json")
            .body(Body::from(
                serde_json::json!({"name":name,"password":"p"}).to_string(),
            ))
            .unwrap()
    };
    assert_eq!(
        app.clone()
            .oneshot(send("https://evil.example", "http-user"))
            .await
            .unwrap()
            .status(),
        403
    );
    let response = app
        .clone()
        .oneshot(send("https://game.example", "http-user"))
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .to_owned();
    assert!(
        cookie.contains("HttpOnly") && cookie.contains("Secure") && cookie.contains("SameSite=Lax")
    );
    assert_eq!(response.headers()["cache-control"], "no-store");
    let body: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["memberships"][0]["universe"], u.0.to_string());
    assert_eq!(
        app.clone()
            .oneshot(send("https://game.example", "HTTP-USER"))
            .await
            .unwrap()
            .status(),
        409
    );
    let limited = app
        .clone()
        .oneshot(send("https://game.example", "other-user"))
        .await
        .unwrap();
    assert_eq!(limited.status(), 429);
    assert!(limited.headers().contains_key("retry-after"));
    let closed = router(
        store,
        HttpConfig {
            signup: None,
            ..config
        },
    );
    assert_eq!(
        closed
            .clone()
            .oneshot(send("https://game.example", "closed-user"))
            .await
            .unwrap()
            .status(),
        403
    );
    let current = closed
        .oneshot(
            Request::builder()
                .uri("/api/v1/session")
                .header("Cookie", cookie.split(';').next().unwrap())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(current.status(), 200);
}

#[path = "signup/universe_config.rs"]
mod universe_config;

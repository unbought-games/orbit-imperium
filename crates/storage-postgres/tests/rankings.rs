use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use orbit_transport_http::{HttpConfig, router_with_profiles};
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

async fn request(
    app: &Router,
    binding: Binding,
    cookie: &str,
    csrf: Option<&str>,
) -> (StatusCode, Value) {
    let mut request = Request::post(format!("/api/v4/universes/{}/rankings", binding.universe))
        .header("content-type", "application/json")
        .header("origin", "https://game.test")
        .header("cookie", cookie);
    if let Some(csrf) = csrf {
        request = request.header("x-csrf-token", csrf);
    }
    let response = app
        .clone()
        .oneshot(
            request
                .body(Body::from(
                    json!({"binding":binding,"request_id":Uuid::new_v4()}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    if status == StatusCode::OK {
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    (
        status,
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap(),
    )
}

#[tokio::test]
async fn rankings_use_committed_assets_and_current_memberships_with_bound_private_reads() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-rankings");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("ranking-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[79; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(login.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let principal = Principal {
        account: binding.account,
        player: binding.player,
        universe,
    };
    let context = || QueryContext {
        binding,
        request_id: Uuid::new_v4(),
    };
    let before = game.rankings(principal, context()).await.unwrap();
    assert_eq!(before.players.len(), accounts.len());
    assert!(!before.processing_pending);
    let own = before
        .players
        .iter()
        .find(|p| p.player == binding.player)
        .unwrap();
    let view = game.world_view(principal, context()).await.unwrap();
    assert_eq!(
        own.points,
        (view.missions.score_value_micro.parse::<i64>().unwrap() / 1_000_000_000).to_string()
    );
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let foreign_u = UniverseId(Uuid::new_v4());
    let policy = store
        .ensure_signup_universe(Some(foreign_u), Default::default(), Some(10))
        .await
        .unwrap();
    store.enroll_oidc(binding.account, policy).await.unwrap();
    let foreign = game
        .current_binding(binding.account, foreign_u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    assert!(
        !game
            .rankings(principal, context())
            .await
            .unwrap()
            .players
            .iter()
            .any(|p| p.player == foreign.player)
    );

    // Read-only requests must not admit commands, mutate activity, or write totals.
    let commands: i64 = sqlx::query_scalar("SELECT count(*) FROM commands WHERE universe=$1")
        .bind(universe.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let config = HttpConfig {
        origin: "https://game.test".into(),
        secure_cookies: true,
        assets: "missing".into(),
        login_per_minute: 30,
        signup: None,
        signup_per_minute: 5,
        legacy_signup_enabled: true,
        trusted_fly_proxies: vec![],
        wake: None,
        observer: None,
    };
    let (_tx, rx) = tokio::sync::watch::channel(false);
    let app = router_with_profiles(store.clone(), config, rx, None, None);
    let cookie = format!("orbit_session={}", login.token);
    let csrf = Some(login.session.csrf.as_str());
    assert_eq!(
        request(&app, binding, "", csrf).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&app, binding, &cookie, None).await.0,
        StatusCode::FORBIDDEN
    );
    let other = before
        .players
        .iter()
        .find(|p| p.player != binding.player)
        .unwrap()
        .player;
    assert_ne!(
        request(
            &app,
            Binding {
                player: other,
                ..binding
            },
            &cookie,
            csrf
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_ne!(
        request(
            &app,
            Binding {
                epoch: Epoch(Uuid::new_v4()),
                ..binding
            },
            &cookie,
            csrf
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, public) = request(&app, binding, &cookie, csrf).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(public.as_object().unwrap().len(), 5);
    for row in public["players"].as_array().unwrap() {
        assert_eq!(row.as_object().unwrap().len(), 4);
        for field in ["player", "username", "points", "rank"] {
            assert!(row.get(field).is_some());
        }
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM commands WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        commands
    );

    // The rankings profile source permits only current universe members and is bounded.
    let visible = game
        .visible_profile_players(
            principal,
            PlayerProfilesQuery {
                context: context(),
                source: ProfileSource::Rankings {
                    players: vec![other, foreign.player, PlayerId(Uuid::new_v4())],
                },
            },
        )
        .await
        .unwrap();
    assert!(visible.contains(&other));
    assert!(!visible.contains(&foreign.player));
    assert_eq!(visible.len(), 2);
    assert!(
        game.visible_profile_players(
            principal,
            PlayerProfilesQuery {
                context: context(),
                source: ProfileSource::Rankings {
                    players: vec![other; 51]
                }
            }
        )
        .await
        .is_err()
    );

    // Uncommitted valuation changes are invisible; later refresh sees the whole commit.
    let mut tx = pool.begin().await.unwrap();
    let lot = orbit_engine::AssetLot {
        id: orbit_engine::OperationId(Uuid::new_v4()),
        owner: binding.player,
        item: orbit_engine::CatalogKey::Ship(orbit_engine::ShipType::SmallCargo),
        level: None,
        location: orbit_engine::AssetLocation::Player,
        quantity: 2,
        unit_value_micro: 3_000_000_000,
        rules_hash: orbit_engine::Ruleset::mvp_fleets().unwrap().hash,
        source_operation: orbit_engine::OperationId(Uuid::new_v4()),
        acquired_at: 2000,
        acquired_sequence: 1,
    };
    sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
        .bind(universe.0)
        .bind(lot.id.to_string())
        .bind(sqlx::types::Json(&lot))
        .execute(&mut *tx)
        .await
        .unwrap();
    let during = game.rankings(principal, context()).await.unwrap();
    assert_eq!(
        during
            .players
            .iter()
            .find(|p| p.player == binding.player)
            .unwrap()
            .points,
        own.points
    );
    tx.commit().await.unwrap();
    store.set_test_time(2000).await.unwrap();
    let after = game.rankings(principal, context()).await.unwrap();
    assert_eq!(after.sampled_at, 2000);
    assert_eq!(
        after
            .players
            .iter()
            .find(|p| p.player == binding.player)
            .unwrap()
            .points,
        "6"
    );
    assert_eq!(own.points, "0");
    let event = Uuid::new_v4();
    sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event) VALUES($1,$2,2000,999,'{}','{}')").bind(event).bind(universe.0).execute(&pool).await.unwrap();
    assert!(
        game.rankings(principal, context())
            .await
            .unwrap()
            .processing_pending
    );
    sqlx::query("UPDATE scheduled_events SET cancelled=true WHERE id=$1")
        .bind(event)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        !game
            .rankings(principal, context())
            .await
            .unwrap()
            .processing_pending
    );
    sqlx::query("DELETE FROM universe_memberships WHERE universe=$1 AND player=$2")
        .bind(universe.0)
        .bind(other.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        !game
            .rankings(principal, context())
            .await
            .unwrap()
            .players
            .iter()
            .any(|p| p.player == other)
    );
    pool.close().await;
}

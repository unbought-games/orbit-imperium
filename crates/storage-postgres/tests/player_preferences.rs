//! Regression: preferences survive reconnects without crossing player/universe bindings.
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn saved_probe_count_is_private_persistent_and_scoped_to_the_full_membership() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("preferences-{}-{i}", Uuid::new_v4()),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[93; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let other = SessionService::new(store.clone())
        .login(&accounts[1].name, &accounts[1].password, None)
        .await
        .unwrap();
    let a = store
        .current_binding(login.session.account, universe)
        .await
        .unwrap()
        .0;
    let b = store
        .current_binding(other.session.account, universe)
        .await
        .unwrap()
        .0;
    let app = orbit_transport_http::router(
        store.clone(),
        orbit_transport_http::HttpConfig {
            origin: "http://localhost".into(),
            assets: "/absent".into(),
            login_per_minute: 100,
            signup: None,
            signup_per_minute: 100,
            legacy_signup_enabled: false,
            wake: None,
            observer: None,
        },
    );
    let uri = format!("/api/v1/universes/{universe}/player-preferences");
    for (binding, count, csrf, origin, authenticated, expected) in [
        (a, None, true, true, true, StatusCode::OK),
        (a, Some("0"), true, true, true, StatusCode::BAD_REQUEST),
        (a, Some("1.5"), true, true, true, StatusCode::BAD_REQUEST),
        (a, Some("7"), false, true, true, StatusCode::FORBIDDEN),
        (a, Some("7"), true, false, true, StatusCode::FORBIDDEN),
        (a, Some("7"), true, true, false, StatusCode::UNAUTHORIZED),
        (b, Some("7"), true, true, true, StatusCode::NOT_FOUND),
        (
            Binding {
                epoch: Epoch(Uuid::new_v4()),
                ..a
            },
            Some("7"),
            true,
            true,
            true,
            StatusCode::NOT_FOUND,
        ),
        (
            Binding {
                universe: UniverseId(Uuid::new_v4()),
                ..a
            },
            Some("7"),
            true,
            true,
            true,
            StatusCode::NOT_FOUND,
        ),
        (
            a,
            Some("9007199254740993"),
            true,
            true,
            true,
            StatusCode::OK,
        ),
    ] {
        let mut q = json!({"context": {"binding": binding, "request_id": Uuid::new_v4()}});
        if let Some(count) = count {
            q["preferences"] = json!({"galaxy_probe_count": count});
        }
        let mut req = Request::builder()
            .uri(&uri)
            .method("POST")
            .header("content-type", "application/json");
        if authenticated {
            req = req.header("cookie", format!("orbit_session={}", login.token));
        }
        if csrf {
            req = req.header("x-csrf-token", &login.session.csrf);
        }
        if origin {
            req = req.header("origin", "http://localhost");
        }
        let response = app
            .clone()
            .oneshot(req.body(Body::from(q.to_string())).unwrap())
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            expected,
            "count={count:?}, csrf={csrf}, origin={origin}, authenticated={authenticated}"
        );
        if expected == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body: Value =
                serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                    .unwrap();
            assert_eq!(
                body["preferences"]["galaxy_probe_count"],
                count.unwrap_or("1")
            );
            assert_eq!(body["request_id"], q["context"]["request_id"]);
        }
    }
    // A new storage connection represents a fresh device/session read.
    let reconnected = PgStore::connect(&url).await.unwrap();
    assert_eq!(
        reconnected
            .player_preferences(a, None)
            .await
            .unwrap()
            .galaxy_probe_count,
        "9007199254740993"
    );
    assert_eq!(
        reconnected
            .player_preferences(b, None)
            .await
            .unwrap()
            .galaxy_probe_count,
        "1"
    );
    // A second membership for the same account starts independently at one.
    let second = UniverseId(Uuid::new_v4());
    let second_accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("other-{}-{i}", Uuid::new_v4()),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(second, 1000, &second_accounts, &[94; 32])
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("UPDATE universe_memberships SET account=$1 WHERE universe=$2 AND player=(SELECT player FROM universe_memberships WHERE universe=$2 ORDER BY player LIMIT 1)")
        .bind(login.session.account.0).bind(second.0).execute(&pool).await.unwrap();
    let second_binding = store
        .current_binding(login.session.account, second)
        .await
        .unwrap()
        .0;
    assert_eq!(
        store
            .player_preferences(second_binding, None)
            .await
            .unwrap()
            .galaxy_probe_count,
        "1"
    );
    assert_eq!(
        store
            .player_preferences(a, None)
            .await
            .unwrap()
            .galaxy_probe_count,
        "9007199254740993"
    );
}

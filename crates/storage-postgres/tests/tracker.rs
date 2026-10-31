use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use orbit_transport_http::{HttpConfig, router};
use serde_json::Value;
use tower::ServiceExt;
use uuid::Uuid;

async fn get(app: &Router, u: UniverseId, token: Option<&str>) -> (StatusCode, Value) {
    let mut req = Request::get(format!("/api/v4/universes/{u}/tracker"));
    if let Some(token) = token {
        req = req.header("authorization", format!("Bearer {token}"));
    }
    let res = app
        .clone()
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = res.status();
    if status == StatusCode::OK {
        assert_eq!(res.headers()["cache-control"], "no-store");
    }
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}
#[tokio::test]
async fn tracker_is_scoped_read_only_and_revocable() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-tracker");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("tracker-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1000, &accounts, &[79; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let config = HttpConfig {
        origin: "https://game.test".into(),
        assets: "missing".into(),
        login_per_minute: 100,
        signup: None,
        signup_per_minute: 100,
        legacy_signup_enabled: false,
        wake: None,
        observer: None,
    };
    let app = router(store.clone(), config);
    let token = store.issue_tracker_token(u).await.unwrap();
    assert_eq!(get(&app, u, None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(
        get(&app, u, Some("orbit_tracker_invalid")).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get(&app, UniverseId(Uuid::new_v4()), Some(&token)).await.0,
        StatusCode::UNAUTHORIZED
    );
    let (status, body) = get(&app, u, Some(&token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["schema_version"], 1);
    assert_eq!(body["players"].as_array().unwrap().len(), accounts.len());
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let expected: i64 =
        sqlx::query_scalar("SELECT count(*) FROM bodies WHERE universe=$1 AND kind='Planet'")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(body["planets"].as_array().unwrap().len(), expected as usize);
    for planet in body["planets"].as_array().unwrap() {
        assert_eq!(planet.as_object().unwrap().len(), 4);
        assert!(planet["coordinates"]["galaxy"].is_u64());
    }
    let text = body.to_string();
    for private in [
        "amounts",
        "asset_lots",
        "password",
        "csrf",
        "technologies",
        "inventory",
    ] {
        assert!(!text.contains(private));
    }
    // A tracker token never becomes an authenticated player/bot session.
    assert!(
        store
            .authenticate_machine(&token_digest(&token))
            .await
            .unwrap()
            .is_none()
    );
    let rejected = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/api/v4/universes/{u}/binding?request_id={}",
                Uuid::new_v4()
            ))
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rejected.status(), StatusCode::UNAUTHORIZED);
    let histories: i64 =
        sqlx::query_scalar("SELECT count(*) FROM ranking_observations WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(histories, 0);
    store.revoke_tracker_tokens(u).await.unwrap();
    assert_eq!(get(&app, u, Some(&token)).await.0, StatusCode::UNAUTHORIZED);
    let fresh = store.issue_tracker_token(u).await.unwrap();
    sqlx::query("UPDATE universes SET epoch=$2 WHERE id=$1")
        .bind(u.0)
        .bind(Uuid::new_v4())
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(get(&app, u, Some(&fresh)).await.0, StatusCode::UNAUTHORIZED);
    pool.close().await;
}

use orbit_storage_postgres::PgStore;
use orbit_transport_http::{
    HttpConfig, router,
    test_http::{Body, ConnectInfo, Request},
};
use tower::ServiceExt;
use uuid::Uuid;
#[tokio::test]
async fn one_source_cannot_exhaust_another_sources_login_budget() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store
        .seed(Uuid::new_v4().into(), 1000000, 1, &passwords)
        .await
        .unwrap();
    let app = router(
        store,
        HttpConfig {
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: true,
            origin: "https://game.test".into(),
            assets: "absent".into(),
            login_per_minute: 3,
            trusted_fly_proxies: Vec::new(),
            wake: None,
            observer: None,
        },
    );
    for index in 0..4 {
        let request = Request::post("/api/v1/session")
            .extension(ConnectInfo(
                "203.0.113.1:1234".parse::<std::net::SocketAddr>().unwrap(),
            ))
            .header("origin", "https://game.test")
            .header("content-type", "application/json")
            .header("x-forwarded-for", format!("198.51.100.{}", index))
            .header("fly-client-ip", format!("198.51.100.{}", index))
            .body(Body::from(
                serde_json::json!({"name":format!("unknown-{index}"),"password":"wrong"})
                    .to_string(),
            ))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        if index < 3 {
            assert_eq!(response.status(), 401)
        } else {
            assert_eq!(response.status(), 429);
            assert!(response.headers().get("retry-after").is_some())
        }
    }
    let response = app
        .oneshot(
            Request::post("/api/v1/session")
                .extension(ConnectInfo(
                    "203.0.113.2:4321".parse::<std::net::SocketAddr>().unwrap(),
                ))
                .header("origin", "https://game.test")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"name":"beta","password":passwords[1]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
}

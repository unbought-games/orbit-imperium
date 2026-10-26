use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::PgStore;
use orbit_transport_http::{
    HttpConfig, router,
    test_http::{Body, Request},
};
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn bootstrap_authentication_privacy_and_legacy_compatibility() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store
        .seed(u.into(), 1_000_000, 1, &passwords)
        .await
        .unwrap();
    let assets = std::env::temp_dir().join(format!("orbit-bootstrap-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&assets).unwrap();
    std::fs::write(
        assets.join("index.html"),
        include_str!("../../../apps/web/index.html"),
    )
    .unwrap();
    let app = router(
        store.clone(),
        HttpConfig {
            origin: "https://game.test".into(),
            assets: assets.to_string_lossy().into_owned(),
            login_per_minute: 30,
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: true,
            trusted_fly_proxies: vec![],
            wake: None,
            observer: None,
        },
    );
    for cookie in ["", "orbit_session=invalid"] {
        let r = app
            .clone()
            .oneshot(
                Request::get("/api/v1/bootstrap")
                    .header("cookie", cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 200);
        assert_eq!(r.headers()["cache-control"], "private, no-store");
        assert_eq!(r.headers()["vary"], "Cookie");
        let j: serde_json::Value =
            serde_json::from_slice(&r.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(j["result"]["status"], "anonymous");
    }
    let mut accounts = vec![];
    for (i, name) in ["alpha", "beta"].into_iter().enumerate() {
        let r = app
            .clone()
            .oneshot(
                Request::post("/api/v1/session?bootstrap=true")
                    .header("origin", "https://game.test")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({"name":name,"password":passwords[i]}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 200);
        let cookie = r.headers()["set-cookie"].to_str().unwrap().to_owned();
        assert!(cookie.contains("HttpOnly; SameSite=Lax"));
        let bytes = r.into_body().collect().await.unwrap().to_bytes();
        let j: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(j["result"]["status"], "authenticated");
        assert_eq!(j["result"]["game"]["status"], "ready");
        let session = &j["result"]["session"];
        assert_eq!(
            j["result"]["game"]["snapshot"]["view"]["binding"]["account"],
            session["account"]
        );
        accounts.push(session["account"].clone());
        assert!(!String::from_utf8_lossy(&bytes).contains(&passwords[i]));
        let r = app
            .clone()
            .oneshot(
                Request::get("/api/v1/session")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let legacy: serde_json::Value =
            serde_json::from_slice(&r.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(legacy["account"], session["account"]);
        assert!(legacy.get("result").is_none());
        let document = app
            .clone()
            .oneshot(
                Request::get("/u/test/overview")
                    .header("cookie", &cookie)
                    .header("range", "bytes=0-1")
                    .header("if-none-match", "*")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(document.status(), 200);
        assert_eq!(document.headers()["vary"], "Cookie");
        assert_eq!(document.headers()["cache-control"], "private, no-store");
        let html = String::from_utf8(
            document
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        let payload = html
            .split("<script id=\"orbit-bootstrap\" type=\"application/json\">")
            .nth(1)
            .unwrap()
            .split("</script>")
            .next()
            .unwrap();
        let embedded: serde_json::Value = serde_json::from_str(payload).unwrap();
        assert_eq!(embedded["result"]["session"]["account"], session["account"]);
        let token = cookie
            .split(';')
            .next()
            .unwrap()
            .strip_prefix("orbit_session=")
            .unwrap();
        SessionService::new(store.clone())
            .logout(token)
            .await
            .unwrap();
        let r = app
            .clone()
            .oneshot(
                Request::get("/api/v1/bootstrap")
                    .header("cookie", cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let j: serde_json::Value =
            serde_json::from_slice(&r.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(j["result"]["status"], "anonymous");
    }
    assert_ne!(accounts[0], accounts[1]);
    // Concurrent document requests must not share a personalized payload.
    let sessions = SessionService::new(store.clone());
    let alpha = sessions.login("alpha", &passwords[0], None).await.unwrap();
    let beta = sessions.login("beta", &passwords[1], None).await.unwrap();
    let document = |token: &str| {
        Request::get("/")
            .header("cookie", format!("orbit_session={token}"))
            .body(Body::empty())
            .unwrap()
    };
    let (a, b) = tokio::join!(
        app.clone().oneshot(document(&alpha.token)),
        app.clone().oneshot(document(&beta.token))
    );
    for (response, own, other) in [
        (a, alpha.session.account, beta.session.account),
        (b, beta.session.account, alpha.session.account),
    ] {
        let response = response.unwrap();
        assert_eq!(response.status(), 200);
        let html = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(html.contains(&own.to_string()));
        assert!(!html.contains(&other.to_string()));
    }
    std::fs::remove_dir_all(assets).unwrap();
}

#[tokio::test]
async fn bootstrap_signup_and_expiry_keep_auth_outcomes_distinct() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = store
        .ensure_signup_universe(Some(Uuid::new_v4().into()), Default::default(), None)
        .await
        .unwrap()
        .universe;
    let config = HttpConfig {
        origin: "https://game.test".into(),
        assets: "missing".into(),
        login_per_minute: 30,
        signup: Some(SignupPolicy {
            universe: u,
            max_players: 10,
        }),
        signup_per_minute: 10,
        legacy_signup_enabled: true,
        trusted_fly_proxies: vec![],
        wake: None,
        observer: None,
    };
    let app = router(store.clone(), config);
    let request = |origin: &str| {
        Request::post("/api/v1/registration?bootstrap=true")
            .header("origin", origin)
            .header("content-type", "application/json")
            .body(Body::from(r#"{"name":"bootstrap-new","password":"p"}"#))
            .unwrap()
    };
    assert_eq!(
        app.clone()
            .oneshot(request("https://other.test"))
            .await
            .unwrap()
            .status(),
        403
    );
    let response = app
        .clone()
        .oneshot(request("https://game.test"))
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .to_owned();
    let data: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(data["result"]["game"]["status"], "ready");
    assert_eq!(data["result"]["game"]["snapshot"]["view"]["protocol"], 4);
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let account = Uuid::parse_str(data["result"]["session"]["account"].as_str().unwrap()).unwrap();
    sqlx::query("DELETE FROM universe_memberships WHERE account=$1")
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    let get = || {
        Request::get("/api/v1/bootstrap")
            .header("cookie", &cookie)
            .body(Body::empty())
            .unwrap()
    };
    let response = app.clone().oneshot(get()).await.unwrap();
    let data: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(data["result"]["game"]["status"], "no_membership");
    sqlx::query("UPDATE sessions SET expires_at=0 WHERE account=$1")
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    let response = app.oneshot(get()).await.unwrap();
    let data: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(data["result"]["status"], "anonymous");
}

use axum::{
    Json, Router,
    body::Body,
    http::{HeaderMap, Request, StatusCode},
    routing::post,
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use orbit_transport_http::{AccountProfiles, HttpConfig, router_with_profiles};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tower::ServiceExt;
use uuid::Uuid;

async fn request(
    app: &Router,
    universe: UniverseId,
    binding: Binding,
    cookie: &str,
    csrf: Option<&str>,
    source: Value,
) -> (StatusCode, Value) {
    let mut req = Request::post(format!("/api/v1/universes/{universe}/player-profiles"))
        .header("content-type", "application/json")
        .header("origin", "https://game.test")
        .header("cookie", cookie);
    if let Some(csrf) = csrf {
        req = req.header("x-csrf-token", csrf);
    }
    let response = app
        .clone()
        .oneshot(
            req.body(Body::from(
                json!({"context":{"binding":binding,"request_id":Uuid::new_v4()},"source":source})
                    .to_string(),
            ))
            .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    (status, value)
}

#[tokio::test]
async fn public_profiles_are_view_scoped_private_and_independent_of_other_players_sessions() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-player_profiles");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("profiles-{i}-{}", Uuid::new_v4().simple()),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[71; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let binding = GameService::new(store.clone())
        .current_binding(login.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let rows:Vec<(Uuid,Uuid,String)>=sqlx::query_as("SELECT a.id,m.player,a.name FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1 ORDER BY a.name").bind(universe.0).fetch_all(&pool).await.unwrap();
    let other = rows.iter().find(|r| r.1 != binding.player.0).unwrap().1;
    let calls = Arc::new(Mutex::new(Vec::<Vec<String>>::new()));
    let fail = Arc::new(AtomicBool::new(false));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let issuer = format!("{base}/api/auth");
    let mock=Router::new().route("/api/game-profiles/v1/batch",post({
        let calls=calls.clone();let issuer=issuer.clone();let fail=fail.clone();
        move |headers:HeaderMap,Json(body):Json<Value>| {let calls=calls.clone();let issuer=issuer.clone();let fail=fail.clone();async move {
            assert_eq!(headers["authorization"],"Bearer fixture-profile-secret");
            let subjects:Vec<String>=serde_json::from_value(body["subjects"].clone()).unwrap();
            assert!(subjects.len()<=100);calls.lock().unwrap().push(subjects.clone());
            if fail.load(Ordering::SeqCst) {return (StatusCode::SERVICE_UNAVAILABLE,Json(json!({"code":"Unavailable"})));}
            let now=unbought_auth::now();
            (StatusCode::OK,Json(json!({"issuer":issuer,"observed_at":now,"profiles":subjects.into_iter().map(|subject|json!({"subject":subject,"username":format!("Public-{subject}"),"supporter_tier":2,"expires_at":now+300})).collect::<Vec<_>>()})))
        }}
    }));
    let task = tokio::spawn(async move { axum::serve(listener, mock).await.unwrap() });
    for (account, player, _) in &rows {
        sqlx::query("INSERT INTO oidc_identity(issuer,subject,account) VALUES($1,$2,$3)")
            .bind(&issuer)
            .bind(format!("s-{player}"))
            .bind(account)
            .execute(&pool)
            .await
            .unwrap();
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM oidc_session")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0,
        "public profiles need no other-player tokens"
    );
    assert!(
        store
            .player_identities(UniverseId(Uuid::new_v4()), vec![PlayerId(other)])
            .await
            .unwrap()
            .is_empty()
    );
    let config = HttpConfig {
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
    let build = || {
        router_with_profiles(
            store.clone(),
            config.clone(),
            rx.clone(),
            None,
            Some(AccountProfiles::new(&base, &issuer, "fixture-profile-secret").unwrap()),
        )
    };
    let app = build();
    let cookie = format!("orbit_session={}", login.token);
    let csrf = Some(login.session.csrf.as_str());
    let source = json!({"type":"SelfAccount"});
    assert_eq!(
        request(&app, universe, binding, "", csrf, source.clone())
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&app, universe, binding, &cookie, None, source.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let mut wrong = binding;
    wrong.player = PlayerId(other);
    assert_eq!(
        request(&app, universe, wrong, &cookie, csrf, source.clone())
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &app,
            UniverseId(Uuid::new_v4()),
            binding,
            &cookie,
            csrf,
            source.clone()
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &app,
            universe,
            binding,
            &cookie,
            csrf,
            json!({"type":"Players","subjects":["guessed"]})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert!(calls.lock().unwrap().is_empty());
    let (status, own) = request(&app, universe, binding, &cookie, csrf, source.clone()).await;
    assert_eq!(status, StatusCode::OK, "{own}");
    assert_eq!(own["players"].as_array().unwrap().len(), 1);
    assert_eq!(own["players"][0]["supporter_tier"], 2);
    let (galaxy, system): (i32, i32) =
        sqlx::query_as("SELECT galaxy,system FROM bodies WHERE owner=$1 LIMIT 1")
            .bind(other)
            .fetch_one(&pool)
            .await
            .unwrap();
    let source = json!({"type":"Galaxy","galaxy":galaxy,"system":system});
    let (status, view) = request(&app, universe, binding, &cookie, csrf, source.clone()).await;
    assert_eq!(status, StatusCode::OK, "{view}");
    assert!(
        view["players"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["player"] == other.to_string()
                && p["username"] == format!("Public-s-{other}")
                && p["supporter_tier"] == 2)
    );
    for player in view["players"].as_array().unwrap() {
        for field in [
            "subject",
            "issuer",
            "email",
            "access_token",
            "refresh_token",
        ] {
            assert!(player.get(field).is_none());
        }
    }
    let count = calls.lock().unwrap().len();
    assert_eq!(
        request(&app, universe, binding, &cookie, csrf, source.clone())
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        calls.lock().unwrap().len(),
        count,
        "repeat view must use the source snapshot cache"
    );
    let (status, _) = request(
        &app,
        universe,
        binding,
        &cookie,
        csrf,
        json!({"type":"Report","report":Uuid::new_v4()}),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(
        calls.lock().unwrap().len(),
        count,
        "private/missing reports must not reach Accounts"
    );
    // The same immutable report has different recipient payloads. Only the
    // viewer's revealed player identities may enter profile lookup.
    let hidden = rows
        .iter()
        .find(|r| r.1 != binding.player.0 && r.1 != other)
        .unwrap()
        .1;
    let report_id = orbit_engine::ReportId(Uuid::new_v4());
    let report = orbit_engine::MissionReport {
        id: report_id,
        event: orbit_engine::InputId(Uuid::new_v4()),
        kind: "SpyContact".into(),
        at: 1000,
        fleet: None,
        rules_hash: orbit_engine::Ruleset::mvp_fleets().unwrap().hash,
        payloads: std::collections::BTreeMap::from([
            (
                binding.player,
                json!({"kind":"SpyContact","sender":other,"origin":{"galaxy":1,"system":1,"position":1},"target":{"galaxy":1,"system":1,"position":2},"at":1000,"probability_ppm":0,"detected":false}),
            ),
            (
                PlayerId(other),
                json!({"kind":"SpyContact","sender":hidden}),
            ),
        ]),
    };
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,'SpyContact',1000,$4)").bind(universe.0).bind(report_id.0).bind(report.event.0).bind(sqlx::types::Json(&report)).execute(&pool).await.unwrap();
    for player in [binding.player.0, other] {
        sqlx::query("INSERT INTO mission_report_recipients(report,recipient,created_revision) VALUES($1,$2,1)").bind(report_id.0).bind(player).execute(&pool).await.unwrap();
    }
    let report_source = json!({"type":"Report","report":report_id});
    let (status, visible) = request(
        &app,
        universe,
        binding,
        &cookie,
        csrf,
        report_source.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{visible}");
    let visible: std::collections::BTreeSet<_> = visible["players"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["player"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        visible,
        std::collections::BTreeSet::from([binding.player.to_string(), other.to_string()])
    );
    sqlx::query("DELETE FROM mission_report_recipients WHERE report=$1 AND recipient=$2")
        .bind(report_id.0)
        .bind(binding.player.0)
        .execute(&pool)
        .await
        .unwrap();
    let calls_before = calls.lock().unwrap().len();
    assert_eq!(
        request(&app, universe, binding, &cookie, csrf, report_source)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(calls.lock().unwrap().len(), calls_before);
    fail.store(true, Ordering::SeqCst);
    let (status, fallback) = request(&build(), universe, binding, &cookie, csrf, source).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "Accounts failure cannot block game identity rendering"
    );
    assert!(
        fallback["players"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p.get("supporter_tier").is_none())
    );
    assert!(
        fallback["players"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["username"] == accounts[0].name)
    );
    task.abort();
    let _ = task.await;
}

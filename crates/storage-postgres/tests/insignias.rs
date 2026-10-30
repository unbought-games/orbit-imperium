use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use orbit_transport_http::{Customization, HttpConfig, router_with_customization};
use serde_json::{Value, json};
use sha2::Digest;
use tower::ServiceExt;
use uuid::Uuid;

async fn call(
    app: &Router,
    b: Binding,
    login: &LoginResult,
    csrf: bool,
    endpoint: &str,
    fields: Value,
) -> (StatusCode, Value) {
    let mut request = Request::post(format!("/api/v1/universes/{}/{endpoint}", b.universe))
        .header("origin", "https://game.test")
        .header("cookie", format!("orbit_session={}", login.token))
        .header("content-type", "application/json");
    if endpoint == "player-profiles" {
        request = request.header("x-orbit-insignia", "1");
    }
    if csrf {
        request = request.header("x-csrf-token", &login.session.csrf);
    }
    let mut body = fields;
    body["context"] = json!({"binding":b,"request_id":Uuid::new_v4()});
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    assert_eq!(response.headers()["cache-control"], "no-store");
    (
        status,
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap(),
    )
}
#[tokio::test]
async fn insignia_library_storage_access_and_public_identity_work_together() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-insignias");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("insignia-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[81; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let session = SessionService::new(store.clone());
    let login = session
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let other = session
        .login(&accounts[1].name, &accounts[1].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let b = game
        .current_binding(login.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let other_b = game
        .current_binding(other.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let directory = std::env::temp_dir().join(format!("orbit-insignias-{}", Uuid::new_v4()));
    let config = orbit_storage_assets::AssetConfig::Files {
        directory: directory.to_string_lossy().into(),
    };
    let customization = Customization {
        policy: CosmeticPolicy::Unrestricted,
        assets: config.connect().await.unwrap(),
    };
    customization.publish().await.unwrap();
    customization.publish().await.unwrap();
    let (_drain, drain) = tokio::sync::watch::channel(false);
    let app = router_with_customization(
        store.clone(),
        HttpConfig {
            origin: "https://game.test".into(),
            assets: "apps/web/dist".into(),
            login_per_minute: 30,
            signup: None,
            signup_per_minute: 30,
            legacy_signup_enabled: false,
            wake: None,
            observer: None,
        },
        drain,
        None,
        None,
        customization.clone(),
    );
    let load = json!({"action":{"type":"Load"}});
    assert_eq!(
        call(&app, b, &login, false, "insignias", load.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, b, &other, true, "insignias", load.clone())
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let stale = Binding {
        epoch: Epoch(Uuid::new_v4()),
        ..b
    };
    assert_eq!(
        call(&app, stale, &login, true, "insignias", load.clone())
            .await
            .0,
        StatusCode::CONFLICT
    );
    let (status, initial) = call(&app, b, &login, true, "insignias", load).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(initial["catalog"].as_array().unwrap().len(), 4);
    assert!(
        initial["catalog"]
            .as_array()
            .unwrap()
            .iter()
            .all(|s| s["access"] == "available")
    );
    let asset = initial["catalog"][0]["asset_url"].as_str().unwrap();
    let image = app
        .clone()
        .oneshot(Request::get(asset).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(image.status(), StatusCode::OK);
    assert_eq!(image.headers()["content-type"], "image/svg+xml");
    assert!(
        image.headers()["cache-control"]
            .to_str()
            .unwrap()
            .contains("immutable")
    );
    assert!(
        image
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .starts_with(b"<svg")
    );
    let older=b"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"><path d=\"M0 0h1v1H0Z\"/></svg>";
    let hash = hex::encode(sha2::Sha256::digest(older));
    let key = format!("insignias/v1/future-symbol/{hash}.svg");
    customization
        .assets
        .write(&key, older.to_vec())
        .await
        .unwrap();
    let media_url = format!("/api/media/insignias/future-symbol/{hash}.svg");
    let response = app
        .clone()
        .oneshot(Request::get(&media_url).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::OK,
        "immutable media from another release remains readable"
    );
    customization
        .assets
        .write(&key, b"corrupt".to_vec())
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(Request::get(&media_url).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let mut design = InsigniaDesign {
        id: Uuid::new_v4(),
        name: "Roman stars".into(),
        recipe: InsigniaRecipe {
            symbol: "laurel".into(),
            ..Default::default()
        },
        revision: 0,
    };
    let save = json!({"action":{"type":"Save","design":design,"equip":true}});
    assert_eq!(
        call(&app, b, &login, true, "insignias", save.clone())
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, b, &login, true, "insignias", save).await.0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(
            &app,
            other_b,
            &other,
            true,
            "insignias",
            json!({"action":{"type":"Equip","design_id":design.id}})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let fresh = PgStore::connect(&url).await.unwrap();
    let library = fresh.insignia_library(b).await.unwrap();
    assert_eq!(library.equipped, Some(design.id));
    assert_eq!(library.designs[0].revision, 1);
    assert!(
        fresh
            .insignia_library(other_b)
            .await
            .unwrap()
            .designs
            .is_empty()
    );
    let profile = call(
        &app,
        b,
        &login,
        true,
        "player-profiles",
        json!({"source":{"type":"SelfAccount"}}),
    )
    .await
    .1;
    assert_eq!(
        profile["players"][0]["insignia"]["recipe"]["symbol"],
        "laurel"
    );
    assert!(
        profile["players"][0].get("supporter_tier").is_none(),
        "unrestricted is not a supporter badge"
    );
    let public = call(
        &app,
        other_b,
        &other,
        true,
        "player-profiles",
        json!({"source":{"type":"Rankings","players":[b.player]}}),
    )
    .await;
    assert_eq!(public.0, StatusCode::OK);
    let seen = public.1["players"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["player"] == b.player.0.to_string())
        .unwrap();
    assert_eq!(
        seen["insignia"]["recipe"]["symbol"], "laurel",
        "another authorized player sees the equipped identity"
    );
    let legacy_request = Request::post(format!("/api/v1/universes/{}/player-profiles",b.universe))
        .header("origin","https://game.test").header("cookie",format!("orbit_session={}",login.token))
        .header("x-csrf-token",&login.session.csrf).header("content-type","application/json")
        .body(Body::from(json!({"context":{"binding":b,"request_id":Uuid::new_v4()},"source":{"type":"SelfAccount"}}).to_string())).unwrap();
    let legacy = app.clone().oneshot(legacy_request).await.unwrap();
    assert_eq!(legacy.status(), StatusCode::OK);
    let legacy: Value =
        serde_json::from_slice(&legacy.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(
        legacy["players"][0].get("insignia").is_none(),
        "old strict-schema clients must retain their original shape"
    );
    let now = unbought_auth::now();
    let expired = SupporterEvidence {
        known: true,
        active: true,
        expires_at: now - 1,
    };
    let no_support = SupporterEvidence {
        known: true,
        active: false,
        expires_at: now + 60,
    };
    let active = SupporterEvidence {
        known: true,
        active: true,
        expires_at: now + 60,
    };
    design.revision = 1;
    let action = || InsigniaAction::Save {
        design: design.clone(),
        equip: true,
    };
    assert!(matches!(
        fresh
            .change_insignia(b, action(), CosmeticPolicy::Supporter, expired)
            .await,
        Err(ServiceError::Unavailable)
    ));
    assert!(matches!(
        fresh
            .change_insignia(b, action(), CosmeticPolicy::Supporter, no_support)
            .await,
        Err(ServiceError::Forbidden)
    ));
    assert_eq!(
        fresh.insignia_library(b).await.unwrap().designs[0]
            .recipe
            .symbol,
        "laurel"
    );
    fresh
        .change_insignia(b, action(), CosmeticPolicy::Supporter, active)
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    // Exercise the actual Accounts client, including the distinction between a
    // successful non-supporter observation and an upstream outage.
    let mode = std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0));
    let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let issuer = format!("{base}/api/auth");
    let mock = Router::new().route("/api/game-profiles/v1/batch", axum::routing::post({
        let mode = mode.clone(); let calls = calls.clone(); let issuer = issuer.clone();
        move || { let mode=mode.clone(); let calls=calls.clone(); let issuer=issuer.clone(); async move {
            use std::sync::atomic::Ordering::SeqCst;
            calls.fetch_add(1, SeqCst);
            if mode.load(SeqCst) == 2 { return (StatusCode::SERVICE_UNAVAILABLE, axum::Json(json!({"code":"Unavailable"}))); }
            let now=unbought_auth::now();
            let mut profile=json!({"subject":"insignia-owner","username":"Aurelia","expires_at":now+60});
            if mode.load(SeqCst)==0 { profile["supporter_tier"]=json!(1); }
            (StatusCode::OK, axum::Json(json!({"issuer":issuer,"observed_at":now,"profiles":[profile]})))
        }}
    }));
    let task = tokio::spawn(async move { axum::serve(listener, mock).await.unwrap() });
    sqlx::query("INSERT INTO oidc_identity(issuer,subject,account) VALUES($1,'insignia-owner',$2)")
        .bind(&issuer)
        .bind(b.account.0)
        .execute(&pool)
        .await
        .unwrap();
    let build = |policy| {
        let (_, drain) = tokio::sync::watch::channel(false);
        router_with_customization(
            fresh.clone(),
            HttpConfig {
                origin: "https://game.test".into(),
                assets: "apps/web/dist".into(),
                login_per_minute: 30,
                signup: None,
                signup_per_minute: 30,
                legacy_signup_enabled: false,
                wake: None,
                observer: None,
            },
            drain,
            None,
            Some(
                orbit_transport_http::AccountProfiles::new(&base, &issuer, "fixture-secret")
                    .unwrap(),
            ),
            Customization {
                policy,
                ..customization.clone()
            },
        )
    };
    for (value, expected, status) in [
        (0, "available", StatusCode::OK),
        (1, "supporter_required", StatusCode::FORBIDDEN),
        (2, "unavailable", StatusCode::SERVICE_UNAVAILABLE),
    ] {
        mode.store(value, std::sync::atomic::Ordering::SeqCst);
        let app = build(CosmeticPolicy::Supporter);
        let loaded = call(
            &app,
            b,
            &login,
            true,
            "insignias",
            json!({"action":{"type":"Load"}}),
        )
        .await
        .1;
        assert_eq!(loaded["catalog"][3]["access"], expected);
        assert_eq!(
            loaded["library"]["designs"][0]["recipe"]["symbol"],
            "laurel"
        );
        assert_eq!(
            loaded["appearance"]["recipe"]["symbol"],
            if value == 0 { "laurel" } else { "compass" }
        );
        assert_eq!(
            call(
                &app,
                b,
                &login,
                true,
                "insignias",
                json!({"action":{"type":"Equip","design_id":design.id}})
            )
            .await
            .0,
            status
        );
    }
    let before_calls = calls.load(std::sync::atomic::Ordering::SeqCst);
    let local = build(CosmeticPolicy::Unrestricted);
    assert_eq!(
        call(
            &local,
            b,
            &login,
            true,
            "insignias",
            json!({"action":{"type":"Load"}})
        )
        .await
        .1["catalog"][3]["access"],
        "available"
    );
    assert_eq!(
        calls.load(std::sync::atomic::Ordering::SeqCst),
        before_calls,
        "unrestricted cosmetics must not call Accounts"
    );
    sqlx::query("INSERT INTO insignia_grants(account,symbol,reason) VALUES($1,'laurel','fixture permanent unlock')").bind(b.account.0).execute(&pool).await.unwrap();
    fresh
        .change_insignia(
            b,
            InsigniaAction::Equip {
                design_id: Some(design.id),
            },
            CosmeticPolicy::Supporter,
            expired,
        )
        .await
        .unwrap();
    let library = fresh.insignia_library(b).await.unwrap();
    assert_eq!(library.permanent_symbols, vec!["laurel"]);
    // The same account owns one collection but each universe equips separately.
    let second = Binding {
        account: b.account,
        universe: UniverseId(Uuid::new_v4()),
        player: PlayerId(Uuid::new_v4()),
        epoch: Epoch(Uuid::new_v4()),
    };
    sqlx::query("INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash,name) SELECT $1,$2,development,speed,started_at,profile_hash,'Insignia second universe' FROM universes WHERE id=$3")
        .bind(second.universe.0).bind(second.epoch.0).bind(b.universe.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO players(id,universe) VALUES($1,$2)")
        .bind(second.player.0)
        .bind(second.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO universe_memberships(universe,account,player) VALUES($1,$2,$3)")
        .bind(second.universe.0)
        .bind(second.account.0)
        .bind(second.player.0)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        fresh.insignia_library(second).await.unwrap().designs[0].id,
        design.id
    );
    assert!(
        fresh
            .insignia_library(second)
            .await
            .unwrap()
            .equipped
            .is_none()
    );
    fresh
        .change_insignia(
            second,
            InsigniaAction::Equip {
                design_id: Some(design.id),
            },
            CosmeticPolicy::Supporter,
            expired,
        )
        .await
        .unwrap();
    assert_eq!(
        fresh.insignia_library(b).await.unwrap().equipped,
        Some(design.id)
    );
    let permanent = build(CosmeticPolicy::Supporter);
    assert_eq!(
        call(
            &permanent,
            b,
            &login,
            true,
            "insignias",
            json!({"action":{"type":"Equip","design_id":design.id}})
        )
        .await
        .0,
        StatusCode::OK
    );
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    let before = fresh.bound_world(b).await.unwrap().facts.0.state;
    fresh
        .change_insignia(
            b,
            InsigniaAction::Delete {
                design_id: design.id,
            },
            CosmeticPolicy::Supporter,
            expired,
        )
        .await
        .unwrap();
    assert!(fresh.insignia_library(b).await.unwrap().equipped.is_none());
    assert!(
        fresh
            .insignia_library(second)
            .await
            .unwrap()
            .equipped
            .is_none()
    );
    assert!(fresh.insignia_library(b).await.unwrap().designs.is_empty());
    let after = fresh.bound_world(b).await.unwrap().facts.0.state;
    assert_eq!(
        serde_json::to_value(before).unwrap(),
        serde_json::to_value(after).unwrap(),
        "cosmetics never change simulation state"
    );
    sqlx::query("INSERT INTO insignia_designs(account,id,name,recipe,revision) SELECT $1,md5('insignia-limit-'||i)::uuid,'Limit '||i,$2,1 FROM generate_series(1,32) i")
        .bind(b.account.0).bind(sqlx::types::Json(InsigniaRecipe::default())).execute(&pool).await.unwrap();
    let extra = InsigniaDesign {
        id: Uuid::new_v4(),
        name: "One too many".into(),
        recipe: Default::default(),
        revision: 0,
    };
    assert!(matches!(
        fresh
            .change_insignia(
                b,
                InsigniaAction::Save {
                    design: extra,
                    equip: true
                },
                CosmeticPolicy::Unrestricted,
                Default::default()
            )
            .await,
        Err(ServiceError::Conflict)
    ));
    tokio::fs::remove_dir_all(directory).await.unwrap();
    pool.close().await;
}

use http_body_util::BodyExt;
use orbit_application::*;
use orbit_engine::Building;
use orbit_storage_postgres::PgStore;
use orbit_transport_http::{
    HttpConfig, router,
    test_http::{Body, Request},
};
use tower::ServiceExt;
use uuid::Uuid;
#[tokio::test]
async fn negative_http_inputs_foreign_operations_and_hidden_revisions() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4().into();
    let pw = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1_000_000, 1, &pw).await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let sessions = SessionService::new(store.clone());
    let alpha = sessions.login("alpha", &pw[0], None).await.unwrap();
    let beta = sessions.login("beta", &pw[1], None).await.unwrap();
    let a = Actor::Player(alpha.session.memberships[0].player);
    let b = Actor::Player(beta.session.memberships[0].player);
    let game = GameService::new(store.clone());
    let av = game.view(a, u).await.unwrap();
    let bv = game.view(b, u).await.unwrap();
    let app = router(
        store.clone(),
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
    let path = format!("/api/v2/universes/{u}/commands");
    let template = serde_json::json!({"command_id":Uuid::new_v4(),"binding":{"account":alpha.session.account,"player":av.player,"universe":u,"epoch":av.epoch},"protocol":2,"command":{"type":"LaunchTransport","origin":av.bodies[0].id,"target":bv.bodies[0].id,"ships":[{"owner":av.player,"ship_type":"SmallCargo","count":"2"}],"cargo":{"metal":"0","crystal":"0","deuterium":"0"},"speed_percent":100,"expected_terms_hash":"a".repeat(64)}});
    let mut invalid = Vec::new();
    for amount in [
        serde_json::json!("-1"),
        serde_json::json!("1.5"),
        serde_json::json!("1"),
        serde_json::json!("01"),
        serde_json::json!(1),
        serde_json::json!("9223372036854775808"),
    ] {
        let mut payload = template.clone();
        payload["command"]["cargo"]["metal"] = amount;
        invalid.push(payload)
    }
    let mut invalid_speed = template.clone();
    invalid_speed["command"]["speed_percent"] = serde_json::json!(15);
    invalid.push(invalid_speed);
    let mut duplicate = template.clone();
    duplicate["command"]["ships"]
        .as_array_mut()
        .unwrap()
        .push(template["command"]["ships"][0].clone());
    invalid.push(duplicate);
    let mut unknown = template.clone();
    unknown["command"]["type"] = serde_json::json!("InstantBuild");
    invalid.push(unknown);
    let mut forged = template.clone();
    forged["actor"] = serde_json::json!(bv.player);
    invalid.push(forged);
    for payload in invalid {
        let response = app
            .clone()
            .oneshot(
                Request::post(&path)
                    .header("content-type", "application/json")
                    .header("origin", "https://game.test")
                    .header("cookie", format!("orbit_session={}", alpha.token))
                    .header("x-csrf-token", &alpha.session.csrf)
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 400);
        assert_eq!(
            response.headers()["content-type"],
            "application/problem+json"
        );
        let body: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["code"], "Malformed");
    }
    let mut quote = template["command"].clone();
    quote["type"] = serde_json::json!("Transport");
    quote["speed_percent"] = serde_json::json!(15);
    quote.as_object_mut().unwrap().remove("expected_terms_hash");
    let invalid_quote=app.clone().oneshot(Request::post(format!("/api/v2/universes/{u}/quotes")).header("content-type","application/json").header("origin","https://game.test").header("cookie",format!("orbit_session={}",alpha.token)).header("x-csrf-token",&alpha.session.csrf).body(Body::from(serde_json::json!({"context":{"binding":template["binding"],"request_id":Uuid::new_v4()},"request":quote}).to_string())).unwrap()).await.unwrap();
    assert_eq!(invalid_quote.status(), 400);
    let oversized = app
        .clone()
        .oneshot(
            Request::post(&path)
                .header("content-type", "application/json")
                .body(Body::from(" ".repeat(17000)))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(oversized.status(), 413);
    let q = game
        .quote(
            b,
            u,
            QuoteRequest::Upgrade {
                body: bv.bodies[0].id,
                building: Building::MetalMine,
            },
        )
        .await
        .unwrap();
    let command = CommandEnvelope {
        command_id: Uuid::new_v4().into(),
        epoch: bv.epoch,
        protocol: 2,
        command: Command::StartUpgrade {
            body: bv.bodies[0].id,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash,
        },
    };
    game.submit(b, u, command.clone()).await.unwrap();
    game.step(u, Uuid::new_v4().into()).await.unwrap();
    assert!(game.receipt(a, u, command.command_id).await.is_err());
    assert_eq!(
        serde_json::to_value(game.view(a, u).await.unwrap()).unwrap(),
        serde_json::to_value(&av).unwrap()
    );
    let receipt = game.receipt(b, u, command.command_id).await.unwrap();
    let ReceiptStatus::Committed { result_ids, .. } = receipt.status else {
        panic!("upgrade rejected")
    };
    let foreign = CommandEnvelope {
        command_id: Uuid::new_v4().into(),
        epoch: av.epoch,
        protocol: 2,
        command: Command::CancelConstruction {
            operation: Uuid::parse_str(&result_ids[0]).unwrap().into(),
        },
    };
    game.submit(a, u, foreign.clone()).await.unwrap();
    game.step(u, Uuid::new_v4().into()).await.unwrap();
    assert!(matches!(
        game.receipt(a, u, foreign.command_id).await.unwrap().status,
        ReceiptStatus::Rejected {
            code: GameError::NotOwned
        }
    ));
    let mut changed = command.clone();
    changed.command = Command::CancelConstruction {
        operation: Uuid::new_v4().into(),
    };
    assert!(matches!(
        game.submit(b, u, changed).await,
        Err(ServiceError::Conflict)
    ));
    assert!(
        game.quote(
            a,
            Uuid::new_v4().into(),
            QuoteRequest::Upgrade {
                body: av.bodies[0].id,
                building: Building::MetalMine
            }
        )
        .await
        .is_err()
    );
}

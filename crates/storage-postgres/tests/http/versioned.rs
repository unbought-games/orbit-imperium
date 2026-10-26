use super::*;
use axum::response::Response;
use orbit_storage_postgres::MvpAccount;
use serde_json::{Value, json};

async fn private_json(response: Response, status: u16) -> Value {
    assert_eq!(response.status(), status);
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert_eq!(
        response.headers()["content-type"],
        if status >= 400 {
            "application/problem+json"
        } else {
            "application/json"
        }
    );
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}

#[tokio::test]
async fn versioned_binding_authorization_queries_and_response_contracts() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let wake = Arc::new(tokio::sync::Notify::new());
    let app = router(
        store.clone(),
        HttpConfig {
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: false,
            origin: "https://game.test".into(),
            assets: "missing-assets".into(),
            login_per_minute: 30,
            wake: Some(wake.clone()),
            observer: None,
        },
    );
    let mut foreign_universes = vec![UniverseId(Uuid::new_v4())];
    for protocol in 2..=4 {
        let u = UniverseId(Uuid::new_v4());
        let accounts = std::array::from_fn(|i| MvpAccount {
            name: format!("http-v{protocol}-{i}"),
            password: Uuid::new_v4().to_string(),
        });
        match protocol {
            2 => {
                store
                    .bootstrap_mvp(u, 1_000_000, &accounts, &[31; 32])
                    .await
            }
            3 => {
                store
                    .bootstrap_mvp_progression(u, 1_000_000, &accounts, &[31; 32])
                    .await
            }
            4 => {
                store
                    .bootstrap_mvp_fleets(u, 1_000_000, &accounts, &[31; 32])
                    .await
            }
            _ => unreachable!(),
        }
        .unwrap();
        let auth = SessionService::new(store.clone())
            .login(&accounts[0].name, &accounts[0].password, None)
            .await
            .unwrap();
        let cookie = format!("orbit_session={}", auth.token);
        let base = format!("/api/v{protocol}/universes/{}", u.0);
        let request_id = Uuid::new_v4();
        let discovery = format!("binding?request_id={request_id}");
        let candidate = private_json(
            app.clone()
                .oneshot(
                    Request::get(format!("{base}/{discovery}"))
                        .header("cookie", &cookie)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap(),
            200,
        )
        .await;
        assert_eq!(candidate["request_id"], request_id.to_string());
        assert_eq!(candidate["protocol"], protocol);
        let binding: Binding = serde_json::from_value(candidate["binding"].clone()).unwrap();
        let command = Uuid::new_v4();
        let receipt = format!("commands/{command}?epoch={}", binding.epoch.0);

        // Query rejections are handled after authentication, and remain private JSON errors.
        for suffix in [
            "binding".to_string(),
            "binding?request_id=invalid".to_string(),
            format!("{discovery}&extra=1"),
            format!("{discovery}&request_id={request_id}"),
            format!("commands/{command}"),
            format!("commands/{command}?epoch=invalid"),
            format!("{receipt}&extra=1"),
            format!("{receipt}&epoch={}", binding.epoch.0),
        ] {
            for authenticated in [false, true] {
                let mut request = Request::get(format!("{base}/{suffix}"));
                if authenticated {
                    request = request.header("cookie", &cookie);
                }
                let problem = private_json(
                    app.clone()
                        .oneshot(request.body(Body::empty()).unwrap())
                        .await
                        .unwrap(),
                    if authenticated { 400 } else { 401 },
                )
                .await;
                assert_eq!(
                    problem["code"],
                    if authenticated {
                        "Malformed"
                    } else {
                        "Unauthenticated"
                    }
                );
            }
        }

        // Every route version gates on membership before disclosing the universe protocol.
        for route_version in 2..=4 {
            for universe in std::iter::once(u).chain(foreign_universes.iter().copied()) {
                for suffix in [&discovery, &receipt] {
                    let status = if universe != u {
                        404
                    } else if route_version != protocol {
                        426
                    } else if suffix == &receipt {
                        404
                    } else {
                        200
                    };
                    let body = private_json(
                        app.clone()
                            .oneshot(
                                Request::get(format!(
                                    "/api/v{route_version}/universes/{}/{suffix}",
                                    universe.0
                                ))
                                .header("cookie", &cookie)
                                .body(Body::empty())
                                .unwrap(),
                            )
                            .await
                            .unwrap(),
                        status,
                    )
                    .await;
                    if status != 200 {
                        assert_eq!(
                            body["code"],
                            if status == 426 {
                                "UnsupportedProtocol"
                            } else {
                                "NotFound"
                            }
                        );
                    }
                }
            }
        }

        for route in ["overview", "settings"] {
            let context = json!({"binding": binding, "request_id": request_id});
            // Even with a mismatched path binding and protocol, authentication and CSRF win.
            let mut invalid_context = context.clone();
            invalid_context["binding"]["universe"] = json!(Uuid::new_v4());
            let wrong_version = if protocol == 4 { 2 } else { protocol + 1 };
            for (authenticated, origin, csrf, status) in [
                (false, "https://game.test", "csrf", 401),
                (true, "https://wrong.test", auth.session.csrf.as_str(), 403),
                (true, "https://game.test", "wrong-csrf", 403),
            ] {
                let mut request =
                    Request::post(format!("/api/v{wrong_version}/universes/{}/{route}", u.0))
                        .header("content-type", "application/json")
                        .header("origin", origin)
                        .header("x-csrf-token", csrf);
                if authenticated {
                    request = request.header("cookie", &cookie);
                }
                let body = private_json(
                    app.clone()
                        .oneshot(
                            request
                                .body(Body::from(invalid_context.to_string()))
                                .unwrap(),
                        )
                        .await
                        .unwrap(),
                    status,
                )
                .await;
                assert_eq!(
                    body["code"],
                    if status == 401 {
                        "Unauthenticated"
                    } else {
                        "Forbidden"
                    }
                );
            }
            for field in ["universe", "account", "player"] {
                let mut forged = context.clone();
                forged["binding"][field] = json!(Uuid::new_v4());
                let body = private_json(
                    app.clone()
                        .oneshot(
                            Request::post(format!("{base}/{route}"))
                                .header("content-type", "application/json")
                                .header("cookie", &cookie)
                                .header("origin", "https://game.test")
                                .header("x-csrf-token", &auth.session.csrf)
                                .body(Body::from(forged.to_string()))
                                .unwrap(),
                        )
                        .await
                        .unwrap(),
                    404,
                )
                .await;
                assert_eq!(body["code"], "NotFound");
            }
            for metadata in [false, true] {
                let mut request = Request::post(format!("{base}/{route}"))
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .header("origin", "https://game.test")
                    .header("x-csrf-token", &auth.session.csrf);
                if metadata {
                    request = request
                        .header("x-orbit-view-metadata", "1")
                        .header("x-orbit-minimum-revision", "999999");
                }
                let body = private_json(
                    app.clone()
                        .oneshot(request.body(Body::from(context.to_string())).unwrap())
                        .await
                        .unwrap(),
                    200,
                )
                .await;
                assert_eq!(body["binding"], candidate["binding"]);
                assert_eq!(body["request_id"], request_id.to_string());
                if route == "overview" {
                    assert_eq!(body["protocol"], protocol);
                    assert_eq!(body["sampled_at"], 1_000_000);
                    if metadata {
                        assert_eq!(body["progress"]["minimum_revision_pending"], true);
                    } else {
                        assert!(body.get("progress").is_none());
                    }
                } else {
                    assert!(body.get("progress").is_none());
                }
            }
        }

        if protocol == 4 {
            let simulation = json!({
                "context": {"binding": binding, "request_id": request_id},
                "inputs": {
                    "attacker": {"technology": [2, 3, 4], "units": [{"item": {"kind": "Ship", "id": "LightFighter"}, "count": 5}]},
                    "defender": {"technology": [0, 0, 0], "units": []},
                    "observed_resources": {"metal": "1000000000", "crystal": "1000000000", "deuterium": "1000000000"}
                }
            });
            for (variant, status) in [
                ("valid", 200),
                ("unobserved", 200),
                ("anonymous", 401),
                ("csrf", 403),
                ("player", 404),
                ("epoch", 409),
                ("large", 400),
                ("unknown", 400),
                ("target", 400),
                ("stock", 400),
            ] {
                let mut query = simulation.clone();
                match variant {
                    "unobserved" => {
                        query["inputs"]
                            .as_object_mut()
                            .unwrap()
                            .remove("observed_resources");
                    }
                    "player" | "epoch" => {
                        query["context"]["binding"][variant] = json!(Uuid::new_v4())
                    }
                    "large" => query["inputs"]["attacker"]["units"][0]["count"] = json!(2001),
                    "unknown" => query["inputs"]["defender"]["technology"][0] = Value::Null,
                    "target" => query["target"] = json!(Uuid::new_v4()),
                    "stock" => query["inputs"]["observed_resources"]["metal"] = json!("-1"),
                    _ => {}
                }
                let mut request = Request::post(format!("{base}/combat-simulation"))
                    .header("content-type", "application/json")
                    .header("origin", "https://game.test")
                    .header(
                        "x-csrf-token",
                        if variant == "csrf" {
                            "wrong"
                        } else {
                            &auth.session.csrf
                        },
                    );
                if variant != "anonymous" {
                    request = request.header("cookie", &cookie);
                }
                let result = private_json(
                    app.clone()
                        .oneshot(request.body(Body::from(query.to_string())).unwrap())
                        .await
                        .unwrap(),
                    status,
                )
                .await;
                if variant == "valid" || variant == "unobserved" {
                    assert_eq!(result["loot_rules_enabled"], false);
                    assert_eq!(result["binding"], candidate["binding"]);
                    assert_eq!(result["request_id"], request_id.to_string());
                    let samples = result["samples"].as_array().unwrap();
                    assert_eq!(samples.len(), 10);
                    for sample in samples {
                        assert_eq!(sample["outcome"], "AttackerVictory");
                        assert_eq!(sample["attacker"][0]["count"], 5);
                        assert_eq!(sample["defender"], json!([]));
                        assert_eq!(sample["surviving_cargo_capacity"], "250000000");
                        assert!(sample["estimated_loot"].is_null());
                    }
                    assert!(result.get("target").is_none());
                }
            }
        }

        // Accepted commands and receipts retain JSON privacy and wake the worker only on admission.
        assert!(
            tokio::time::timeout(std::time::Duration::ZERO, wake.notified())
                .await
                .is_err()
        );
        let command_id = Uuid::new_v4();
        let gameplay = json!({
            "protocol": protocol, "binding": binding, "command_id": command_id,
            "command": {"type": "CancelConstruction", "operation": Uuid::new_v4()}
        });
        let envelope = if protocol == 4 {
            json!({"gameplay": gameplay, "presence": {
                "protocol": 4, "binding": binding, "command_id": Uuid::new_v4(),
                "command": {"type": "World", "action": {
                    "type": "RecordForegroundPresence", "body": null,
                    "cause": "GameplayGesture", "paired_command_id": command_id
                }}
            }})
        } else {
            gameplay
        };
        let admitted = private_json(
            app.clone()
                .oneshot(
                    Request::post(format!("{base}/commands"))
                        .header("content-type", "application/json")
                        .header("cookie", &cookie)
                        .header("origin", "https://game.test")
                        .header("x-csrf-token", &auth.session.csrf)
                        .body(Body::from(envelope.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap(),
            202,
        )
        .await;
        assert_eq!(admitted["command_id"], command_id.to_string());
        tokio::time::timeout(std::time::Duration::ZERO, wake.notified())
            .await
            .unwrap();
        let receipt_url = format!("{base}/commands/{command_id}?epoch={}", binding.epoch.0);
        let own_receipt = private_json(
            app.clone()
                .oneshot(
                    Request::get(&receipt_url)
                        .header("cookie", &cookie)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap(),
            200,
        )
        .await;
        assert_eq!(own_receipt, admitted);
        let other = SessionService::new(store.clone())
            .login(&accounts[1].name, &accounts[1].password, None)
            .await
            .unwrap();
        let hidden = private_json(
            app.clone()
                .oneshot(
                    Request::get(&receipt_url)
                        .header("cookie", format!("orbit_session={}", other.token))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap(),
            404,
        )
        .await;
        assert_eq!(hidden["code"], "NotFound");
        assert!(
            tokio::time::timeout(std::time::Duration::ZERO, wake.notified())
                .await
                .is_err()
        );
        foreign_universes.push(u);
    }
}

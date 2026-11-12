//! Explicit cross-service acceptance. The private manifest is supplied by the
//! companion Accounts disposable real-provider fixture; never print its contents.
use super::*;
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_transport_http::{
    HttpConfig, router_with_auth,
    test_http::{Body, Request},
};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

#[derive(Default)]
struct Timings(Mutex<Vec<serde_json::Value>>);
impl RuntimeObserver for Timings {
    fn duration(&self, _: RuntimeStage, _: std::time::Duration) {}
    fn event(&self, _: RuntimeEvent) {}
    fn bootstrap(&self, outcome: BootstrapOutcome) {
        self.0
            .lock()
            .unwrap()
            .push(serde_json::json!({"bootstrap_outcome": outcome.name()}));
    }
    fn auth_duration(&self, phase: AuthPhase, outcome: AuthOutcome, elapsed: std::time::Duration) {
        self.0.lock().unwrap().push(serde_json::json!({
            "phase": phase.name(), "outcome": outcome.name(), "microseconds": elapsed.as_micros()
        }));
    }
}
async fn stats(client: &reqwest::Client, fixture: &serde_json::Value) -> serde_json::Value {
    client
        .get(fixture["stats_endpoint"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap()
}
async fn bootstrap(app: &axum::Router, cookie: &str) -> serde_json::Value {
    let response = app
        .clone()
        .oneshot(
            Request::get("/api/v1/bootstrap")
                .header("cookie", format!("orbit_session={cookie}"))
                .header("x-orbit-auth-metadata", "1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}
async fn expire_claim(pool: &sqlx::PgPool, digest: &str) {
    sqlx::query("UPDATE oidc_session SET payload=jsonb_set(payload,'{rotation_deadline_ms}','0') WHERE digest=$1")
        .bind(digest).execute(pool).await.unwrap();
}

#[tokio::test]
#[ignore = "requires a private disposable Accounts real-provider fixture; use make test-oidc-provider"]
async fn real_provider_commit_cutpoints_never_replay() {
    let manifest =
        std::env::var("ORBIT_OIDC_PROVIDER_FIXTURE").expect("private fixture manifest required");
    let fixture: serde_json::Value =
        serde_json::from_slice(&std::fs::read(manifest).unwrap()).unwrap();
    let issuer = fixture["issuer"].as_str().unwrap();
    assert!(
        issuer.starts_with("http://127.0.0.1:"),
        "only the disposable loopback provider is allowed"
    );
    let config: unbought_auth::Configuration = serde_json::from_value(fixture.clone()).unwrap();
    let rp = unbought_auth::RelyingParty::new(config.clone()).unwrap();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap();
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-oidc-provider");
    let observer = Arc::new(Timings::default());
    let store = refresh_store(&url).await.with_observer(observer.clone());
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let (_keep_running, drain) = tokio::sync::watch::channel(false);
    let app = router_with_auth(
        store.clone(),
        HttpConfig {
            account_url: None,
            origin: "https://game.test".into(),
            assets: "missing-assets".into(),
            login_per_minute: 30,
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: false,
            wake: None,
            observer: Some(observer.clone()),
        },
        drain,
        Some(unbought_auth::RelyingParty::new(config.clone()).unwrap()),
    );
    let mut digests = vec![];
    let mut cookies = vec![];
    for session in fixture["sessions"].as_array().unwrap().iter().take(6) {
        let mut tokens: unbought_auth::Tokens =
            serde_json::from_value(session["tokens"].clone()).unwrap();
        // Cross a real identity-expiry boundary in the retained Orbit payload;
        // the provider grant remains live and must issue a verified replacement.
        tokens.identity.expires_at = unbought_auth::now() - 1;
        let cookie = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let digest = orbit_application::token_digest(&cookie);
        cookies.push(cookie);
        store
            .complete_oidc_login(tokens, &digest, "csrf", None)
            .await
            .unwrap();
        digests.push(digest);
    }
    assert_eq!(digests.len(), 6, "fixture needs six independent grants");
    let before = stats(&client, &fixture).await;
    // Actual provider commit followed by a destroyed TCP response.
    let endpoint = format!(
        "{}?fixture_drop_response=1",
        fixture["token_endpoint"].as_str().unwrap()
    );
    let http = client.clone();
    let confidential = config.clone();
    let result = store
        .revalidate_oidc_for_test(
            &digests[0],
            issuer,
            &config.client_id,
            move |tokens| async move {
                let response = http
                    .post(endpoint)
                    .basic_auth(&confidential.client_id, Some(&confidential.client_secret))
                    .form(&[
                        ("grant_type", "refresh_token"),
                        ("refresh_token", tokens.refresh_token.as_deref().unwrap()),
                    ])
                    .send()
                    .await;
                assert!(
                    response.is_err(),
                    "fixture must destroy the response after committing; status={:?}",
                    response.as_ref().ok().map(|r| r.status())
                );
                Err(unbought_auth::Error::Unavailable)
            },
        )
        .await;
    assert!(matches!(result, Err(StoreError::Conflict)));
    let dropped = stats(&client, &fixture).await;
    assert_eq!(
        dropped["refresh_successes"].as_u64().unwrap(),
        before["refresh_successes"].as_u64().unwrap() + 1
    );
    assert_eq!(
        dropped["dropped_responses"].as_u64().unwrap(),
        before["dropped_responses"].as_u64().unwrap() + 1
    );
    let unavailable = bootstrap(&app, &cookies[0]).await;
    assert_eq!(unavailable["result"]["status"], "unavailable");
    assert!(unavailable["result"].get("authentication").is_none());
    expire_claim(&pool, &digests[0]).await;
    for _ in 0..3 {
        assert!(matches!(
            store.revalidate_oidc(&digests[0], &rp).await,
            Err(StoreError::Conflict)
        ));
    }
    assert_eq!(
        stats(&client, &fixture).await["refresh_requests"],
        dropped["refresh_requests"]
    );
    // The same user's independent grant and an unrelated user's grant remain
    // usable through the real library, including verification of provider JWTs.
    for digest in [&digests[1], &digests[2]] {
        let prior = store.oidc_session_metadata(digest).await.unwrap().unwrap();
        let identity = store.revalidate_oidc(digest, &rp).await.unwrap();
        let current = store.oidc_session_metadata(digest).await.unwrap().unwrap();
        assert!(identity.expires_at > unbought_auth::now());
        assert_eq!(current.identity_valid_until, identity.expires_at);
        assert_ne!(current.refresh_generation, prior.refresh_generation);
        store.revalidate_oidc(digest, &rp).await.unwrap();
        assert_eq!(
            store
                .oidc_session_metadata(digest)
                .await
                .unwrap()
                .unwrap()
                .refresh_generation,
            current.refresh_generation
        );
    }
    // Consumer cancellation after verified provider rotation, before persistence.
    let (entered, started) = tokio::sync::oneshot::channel();
    let running = {
        let store = store.clone();
        let digest = digests[3].clone();
        let config = config.clone();
        tokio::spawn(async move {
            let rp = unbought_auth::RelyingParty::new(config.clone()).unwrap();
            store
                .revalidate_oidc_for_test(
                    &digest,
                    &config.issuer,
                    &config.client_id,
                    |tokens| async move {
                        let fresh = rp.revalidate(&tokens).await.unwrap();
                        entered.send(()).unwrap();
                        std::future::pending::<()>().await;
                        Ok(fresh)
                    },
                )
                .await
        })
    };
    started.await.unwrap();
    running.abort();
    assert!(running.await.unwrap_err().is_cancelled());
    expire_claim(&pool, &digests[3]).await;
    let cancelled = stats(&client, &fixture).await;
    assert!(matches!(
        store.revalidate_oidc(&digests[3], &rp).await,
        Err(StoreError::Conflict)
    ));
    assert_eq!(
        stats(&client, &fixture).await["refresh_requests"],
        cancelled["refresh_requests"]
    );
    // PostgreSQL rejects COMMIT after the real rotated response has been verified.
    sqlx::raw_sql("CREATE FUNCTION fail_provider_rotation_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.payload ? 'rotation_claim_id' AND NEW.payload ? 'refresh_token' THEN RAISE EXCEPTION 'controlled rotation commit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER fail_provider_rotation_commit AFTER UPDATE ON oidc_session DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_provider_rotation_commit();")
        .execute(&pool).await.unwrap();
    assert!(matches!(
        store.revalidate_oidc(&digests[4], &rp).await,
        Err(StoreError::Unavailable)
    ));
    sqlx::raw_sql("DROP TRIGGER fail_provider_rotation_commit ON oidc_session; DROP FUNCTION fail_provider_rotation_commit();").execute(&pool).await.unwrap();
    expire_claim(&pool, &digests[4]).await;
    let failed_commit = stats(&client, &fixture).await;
    for _ in 0..3 {
        assert!(matches!(
            store.revalidate_oidc(&digests[4], &rp).await,
            Err(StoreError::Conflict)
        ));
    }
    assert_eq!(
        stats(&client, &fixture).await["refresh_requests"],
        failed_commit["refresh_requests"]
    );
    let previous = store
        .oidc_session_metadata(&digests[5])
        .await
        .unwrap()
        .unwrap();
    let normal = bootstrap(&app, &cookies[5]).await;
    assert_eq!(normal["result"]["status"], "authenticated");
    let metadata = &normal["result"]["authentication"];
    assert!(metadata["identity_valid_until"].as_i64().unwrap() > unbought_auth::now());
    assert_ne!(
        metadata["refresh_generation"].as_str().unwrap(),
        previous.refresh_generation
    );
    assert_eq!(
        bootstrap(&app, &cookies[5]).await["result"]["authentication"],
        *metadata
    );
    assert_eq!(
        bootstrap(&app, &cookies[0]).await["result"]["status"],
        "anonymous"
    );
    let evidence = serde_json::json!({
        "contract":"real provider commit followed by TCP response loss, consumer cancellation and local commit rejection; no old-token retry; same-user and unrelated grants preserved",
        "provider_before": before, "provider_after": stats(&client, &fixture).await,
        "phase_timings": *observer.0.lock().unwrap(),
    });
    if let Ok(path) = std::env::var("ORBIT_AUTH_EVIDENCE") {
        std::fs::write(path, serde_json::to_vec_pretty(&evidence).unwrap()).unwrap();
    }
    println!("{}", evidence);
}

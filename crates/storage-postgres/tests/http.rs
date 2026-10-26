use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
#[derive(Default)]
struct HttpObservations {
    reads: AtomicU64,
    failures: AtomicU64,
}
impl orbit_application::RuntimeObserver for HttpObservations {
    fn duration(&self, stage: orbit_application::RuntimeStage, _: std::time::Duration) {
        if matches!(stage, orbit_application::RuntimeStage::Read) {
            self.reads.fetch_add(1, Ordering::Relaxed);
        }
    }
    fn event(&self, event: orbit_application::RuntimeEvent) {
        if matches!(event, orbit_application::RuntimeEvent::HttpFailure) {
            self.failures.fetch_add(1, Ordering::Relaxed);
        }
    }
}
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::PgStore;
use orbit_transport_http::test_http::{Body, Request};
use orbit_transport_http::{HttpConfig, router};
use tower::ServiceExt;
use uuid::Uuid;
#[tokio::test]
async fn real_http_origin_csrf_cookie_and_privacy() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4();
    let pw = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u.into(), 1_000_000, 1, &pw).await.unwrap();
    let observations = Arc::new(HttpObservations::default());
    let config = HttpConfig {
        signup: None,
        signup_per_minute: 5,
        legacy_signup_enabled: true,
        origin: "https://game.test".into(),
        assets: "missing-assets".into(),
        login_per_minute: 30,
        wake: None,
        observer: Some(observations.clone()),
    };
    let app = router(store.clone(), config.clone());
    let login = serde_json::json!({"name":"alpha","password":pw[0]}).to_string();
    let response = app
        .clone()
        .oneshot(
            Request::post("/api/v1/session")
                .header("content-type", "application/json")
                .body(Body::from(login.clone()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    let response = app
        .clone()
        .oneshot(
            Request::post("/api/v1/session")
                .header("content-type", "application/json")
                .header("origin", "https://game.test")
                .body(Body::from(login))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .to_owned();
    assert!(cookie.contains("HttpOnly; SameSite=Lax"));
    assert!(cookie.contains("Secure"));
    let session: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let old = app
        .clone()
        .oneshot(
            Request::get(format!("/api/v1/universes/{u}/overview"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(old.status(), 426);
    let candidate = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/api/v2/universes/{u}/binding?request_id={}",
                Uuid::new_v4()
            ))
            .header("cookie", &cookie)
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(candidate.status(), 200);
    let candidate: serde_json::Value =
        serde_json::from_slice(&candidate.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let stream_url = format!(
        "/api/v4/universes/{u}/updates?epoch={}",
        candidate["binding"]["epoch"].as_str().unwrap()
    );
    let stream = app
        .clone()
        .oneshot(
            Request::get(&stream_url)
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(stream.status(), 200);
    assert_eq!(stream.headers()["content-type"], "text/event-stream");
    let mut stream_body = stream.into_body();
    let frame = tokio::time::timeout(std::time::Duration::from_secs(1), stream_body.frame())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let bytes = frame.into_data().unwrap();
    let event = std::str::from_utf8(&bytes).unwrap();
    assert!(event.contains("game-update") && event.contains("Reset"));
    let forbidden = app
        .clone()
        .oneshot(
            Request::get(&stream_url)
                .header("cookie", &cookie)
                .header("origin", "https://other.test")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(forbidden.status(), 403);
    let initial_data = event
        .lines()
        .find_map(|line| {
            line.strip_prefix("data: ")
                .or_else(|| line.strip_prefix("data:"))
        })
        .unwrap();
    let initial: GameUpdate = serde_json::from_str(initial_data).unwrap();
    let (stop_listener, listener_drain) = tokio::sync::watch::channel(false);
    let listening = store.clone();
    let listener = tokio::spawn(async move {
        listening.listen_updates(listener_drain).await;
    });
    let replica = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let binding: Binding = serde_json::from_value(candidate["binding"].clone()).unwrap();
    let command_id = CommandId(Uuid::new_v4());
    replica
        .admit(
            Actor::Player(binding.player),
            binding.universe,
            CommandEnvelope {
                command_id,
                epoch: binding.epoch,
                protocol: 2,
                command: orbit_engine::Command::CancelConstruction {
                    operation: Uuid::new_v4().into(),
                },
            },
        )
        .await
        .unwrap();
    GameService::new(replica)
        .step(binding.universe, Uuid::new_v4().into())
        .await
        .unwrap();
    let delivered = tokio::time::timeout(std::time::Duration::from_secs(2), stream_body.frame())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
        .into_data()
        .unwrap();
    assert!(
        std::str::from_utf8(&delivered)
            .unwrap()
            .contains(&command_id.to_string()),
        "another store's commit wakes this API's stream through PostgreSQL"
    );
    let replay = app
        .clone()
        .oneshot(
            Request::get(&stream_url)
                .header("cookie", &cookie)
                .header("last-event-id", initial.cursor.unwrap())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let mut replay_body = replay.into_body();
    let replayed = tokio::time::timeout(std::time::Duration::from_secs(1), replay_body.frame())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
        .into_data()
        .unwrap();
    assert_eq!(delivered, replayed);
    drop(replay_body);
    let (drain, drained) = tokio::sync::watch::channel(false);
    let replacement = orbit_transport_http::router_with_drain(store.clone(), config, drained);
    let response = replacement
        .oneshot(
            Request::get(&stream_url)
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let mut draining_body = response.into_body();
    draining_body.frame().await.unwrap().unwrap();
    drain.send_replace(true);
    assert!(
        tokio::time::timeout(std::time::Duration::from_secs(1), draining_body.frame())
            .await
            .unwrap()
            .is_none(),
        "API draining closes idle streams"
    );

    let response = app
        .clone()
        .oneshot(
            Request::post(format!("/api/v2/universes/{u}/overview"))
                .header("cookie", &cookie)
                .header("origin", "https://game.test")
                .header("x-csrf-token", session["csrf"].as_str().unwrap())
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"binding":candidate["binding"],"request_id":Uuid::new_v4()})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let view: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(view["binding"], candidate["binding"]);
    assert_eq!(view["protocol"], 2);
    assert_eq!(view["bodies"].as_array().unwrap().len(), 1);
    assert_eq!(view["destinations"].as_array().unwrap().len(), 2);
    assert!(view.get("progress").is_none());
    let response = app
        .clone()
        .oneshot(
            Request::post(format!("/api/v2/universes/{u}/overview"))
                .header("cookie", &cookie)
                .header("origin", "https://game.test")
                .header("x-csrf-token", session["csrf"].as_str().unwrap())
                .header("content-type", "application/json")
                .header("x-orbit-view-metadata", "1")
                .header("x-orbit-minimum-revision", "999999")
                .body(Body::from(
                    serde_json::json!({"binding":candidate["binding"],"request_id":Uuid::new_v4()})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let pending: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(pending["progress"]["minimum_revision_pending"], true);
    assert_eq!(pending["progress"]["command_references"], false);
    store
        .prepare_scoped_runtime(binding.universe, 128)
        .await
        .unwrap();
    assert!(
        store
            .snapshot_progress(binding, None)
            .await
            .unwrap()
            .command_references
    );
    assert_eq!(pending["progress"]["scopes"].as_array().unwrap().len(), 1);
    let response = app
        .clone()
        .oneshot(
            Request::delete("/api/v1/session")
                .header("cookie", &cookie)
                .header("origin", "https://game.test")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    let response = app
        .clone()
        .oneshot(
            Request::delete("/api/v1/session")
                .header("cookie", &cookie)
                .header("origin", "https://game.test")
                .header("x-csrf-token", session["csrf"].as_str().unwrap())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 204);
    assert!(
        tokio::time::timeout(std::time::Duration::from_secs(2), stream_body.frame())
            .await
            .unwrap()
            .is_none(),
        "logout closes existing streams before another private batch"
    );
    stop_listener.send_replace(true);
    listener.await.unwrap();

    let response = app
        .oneshot(
            Request::get("/api/v1/session")
                .header("cookie", cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 401);
    assert!(observations.reads.load(Ordering::Relaxed) > 0);
    assert_eq!(
        observations.failures.load(Ordering::Relaxed),
        0,
        "normal pending reads and durable admission do not produce service failures"
    );
}

#[path = "http/versioned.rs"]
mod versioned;

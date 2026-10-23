use super::*;
use axum::{body::Body, http::Request};
use orbit_engine::{InvariantError, Ruleset, TransitionResult};
use std::sync::Mutex as StdMutex;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};
use tower::ServiceExt;

// Hold each real session operation at its storage boundary. Dropping the release
// senders also unblocks the workers, so a failed assertion cannot hang shutdown.
#[derive(Clone)]
struct GatedStore {
    hold_policy: bool,
    oidc_status: Arc<StdMutex<u16>>,
    memberships: Arc<StdMutex<Vec<Membership>>>,
    entered: mpsc::UnboundedSender<&'static str>,
    login: Arc<StdMutex<Option<oneshot::Receiver<()>>>>,
    signup: Arc<StdMutex<Option<oneshot::Receiver<()>>>>,
    policy: Arc<StdMutex<Result<Option<UniversePolicy>, ()>>>,
}

impl GatedStore {
    async fn wait(&self, operation: &'static str) {
        let gate = match operation {
            "login" => &self.login,
            "signup" => &self.signup,
            _ => unreachable!(),
        };
        let release = gate.lock().unwrap().take();
        if let Some(release) = release {
            self.entered.send(operation).unwrap();
            let _ = release.await;
        }
    }
}

impl IdentityStore for GatedStore {
    async fn universe_summaries(&self) -> Result<Vec<UniverseSummary>, StoreError> {
        if *self.oidc_status.lock().unwrap() == 503 {
            Err(StoreError::Unavailable)
        } else {
            Ok(vec![])
        }
    }
    async fn consume_oidc_login(
        &self,
        _: &str,
        _: &str,
        _: &str,
        _: &str,
        _: i64,
    ) -> Result<Option<unbought_auth::LoginTransaction>, StoreError> {
        if *self.oidc_status.lock().unwrap() == 503 {
            Err(StoreError::Unavailable)
        } else {
            Ok(None)
        }
    }

    async fn revalidate_oidc(
        &self,
        _: &str,
        _: &unbought_auth::RelyingParty,
    ) -> Result<unbought_auth::Identity, StoreError> {
        match *self.oidc_status.lock().unwrap() {
            503 => return Err(StoreError::Unavailable),
            401 => return Err(StoreError::Conflict),
            _ => {}
        }
        Ok(unbought_auth::Identity {
            issuer: "https://accounts.test/api/auth".into(),
            subject: "subject".into(),
            username: "player".into(),
            email_verified: false,
            supporter_tier: None,
            session_id: "session".into(),
            issued_at: 0,
            expires_at: i64::MAX,
        })
    }
    async fn enroll_oidc(&self, _: AccountId, policy: SignupPolicy) -> Result<(), StoreError> {
        self.entered.send("enroll").unwrap();
        self.memberships.lock().unwrap().push(Membership {
            universe_name: "Andromeda".into(),
            universe: policy.universe,
            player: uuid::Uuid::new_v4().into(),
        });
        Ok(())
    }

    async fn universe_policy(&self, _: UniverseId) -> Result<Option<UniversePolicy>, StoreError> {
        if self.hold_policy {
            std::future::pending::<()>().await;
        }
        self.policy
            .lock()
            .unwrap()
            .clone()
            .map_err(|_| StoreError::Unavailable)
    }
    async fn find_credentials(&self, _: &str) -> Result<Option<Credentials>, StoreError> {
        self.wait("login").await;
        Err(StoreError::Unavailable)
    }

    async fn register(
        &self,
        registration: Registration,
    ) -> Result<AuthenticatedSession, StoreError> {
        self.wait("signup").await;
        Ok(AuthenticatedSession {
            account: uuid::Uuid::nil().into(),
            csrf: registration.csrf,
            expires_at: 28800,
            memberships: Vec::new(),
        })
    }

    async fn create_session(
        &self,
        _: AccountId,
        _: &str,
        _: &str,
        _: Option<String>,
    ) -> Result<AuthenticatedSession, StoreError> {
        unreachable!("login fails before session creation")
    }

    async fn lookup_session(&self, _: &str) -> Result<Option<AuthenticatedSession>, StoreError> {
        Ok(Some(AuthenticatedSession {
            account: uuid::Uuid::nil().into(),
            csrf: "csrf".into(),
            expires_at: 28800,
            memberships: self.memberships.lock().unwrap().clone(),
        }))
    }

    async fn renew_session(
        &self,
        _: &str,
        _: Option<&unbought_auth::RelyingParty>,
    ) -> Result<i64, StoreError> {
        self.entered.send("renew").unwrap();
        match *self.oidc_status.lock().unwrap() {
            503 => Err(StoreError::Unavailable),
            401 => Err(StoreError::Conflict),
            _ => Ok((unbought_auth::now() + i64::from(SESSION_IDLE_SECONDS)) * 1000),
        }
    }
    async fn revoke_session(&self, _: &str) -> Result<(), StoreError> {
        unreachable!("these tests do not log out")
    }
}

// The router requires both ports, but authentication must never call GameStore.
impl GameStore for GatedStore {
    async fn admit(
        &self,
        _: Actor,
        _: UniverseId,
        _: CommandEnvelope,
    ) -> Result<Receipt, StoreError> {
        unreachable!()
    }
    async fn receipt(&self, _: Actor, _: UniverseId, _: CommandId) -> Result<Receipt, StoreError> {
        unreachable!()
    }
    async fn claim_next(&self, _: UniverseId, _: WorkerId) -> Result<Option<Claim>, StoreError> {
        unreachable!()
    }
    async fn load_claim(&self, _: &Claim) -> Result<ClaimSnapshot, StoreError> {
        unreachable!()
    }
    async fn renew_claim(&self, _: &Claim) -> Result<Claim, StoreError> {
        unreachable!()
    }
    async fn commit_claim(
        &self,
        _: &Claim,
        _: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        unreachable!()
    }
    async fn fail_claim(&self, _: &Claim, _: &InvariantError) -> Result<(), StoreError> {
        unreachable!()
    }
    async fn load_quote(
        &self,
        _: Actor,
        _: UniverseId,
        _: &QuoteRequest,
    ) -> Result<QuoteSnapshot, StoreError> {
        unreachable!()
    }
    async fn load_rules(&self, _: UniverseId) -> Result<Ruleset, StoreError> {
        unreachable!()
    }
    async fn ready(&self) -> Result<(), StoreError> {
        unreachable!()
    }
    async fn load_view(&self, _: Actor, _: UniverseId) -> Result<ViewerSnapshot, StoreError> {
        unreachable!()
    }
}

fn request(path: &str) -> Request<Body> {
    Request::post(path)
        .header(header::ORIGIN, "https://game.test")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"name":"player","password":"password"}"#))
        .unwrap()
}

async fn bounded<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::time::timeout(Duration::from_secs(10), future)
        .await
        .expect("auth worker should make progress")
}

#[tokio::test]
async fn cancelled_login_and_signup_keep_the_shared_worker_limit_until_completion() {
    let (entered, mut started) = mpsc::unbounded_channel();
    let (release_login, login_gate) = oneshot::channel();
    let (release_signup, signup_gate) = oneshot::channel();
    let app = router(
        GatedStore {
            hold_policy: false,
            oidc_status: Arc::default(),
            memberships: Arc::default(),
            entered,
            login: Arc::new(StdMutex::new(Some(login_gate))),
            signup: Arc::new(StdMutex::new(Some(signup_gate))),
            policy: Arc::new(StdMutex::new(Ok(None))),
        },
        HttpConfig {
            origin: "https://game.test".into(),
            secure_cookies: true,
            assets: "absent".into(),
            login_per_minute: 100,
            signup: Some(SignupPolicy {
                universe: uuid::Uuid::nil().into(),
                max_players: 10,
            }),
            signup_per_minute: 100,
            legacy_signup_enabled: true,
            trusted_fly_proxies: Vec::new(),
            wake: None,
            observer: None,
        },
    );
    let mut login = tokio::spawn(app.clone().oneshot(request("/api/v1/session")));
    assert_eq!(bounded(started.recv()).await, Some("login"));
    let mut signup = tokio::spawn(app.clone().oneshot(request("/api/v1/registration")));
    assert_eq!(bounded(started.recv()).await, Some("signup"));

    for cancelled in [false, true] {
        if cancelled {
            login.abort();
            signup.abort();
            // Await cancellation so the request futures have actually dropped.
            assert!(bounded(&mut login).await.unwrap_err().is_cancelled());
            assert!(bounded(&mut signup).await.unwrap_err().is_cancelled());
        }
        for path in ["/api/v1/session", "/api/v1/registration"] {
            let response = bounded(app.clone().oneshot(request(path))).await.unwrap();
            assert_eq!(
                response.status(),
                StatusCode::TOO_MANY_REQUESTS,
                "{path}, cancelled={cancelled}"
            );
            assert_eq!(response.headers()[header::RETRY_AFTER], "1");
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        }
    }
    release_login.send(()).unwrap();
    release_signup.send(()).unwrap();
}

impl UpdateStore for GatedStore {
    fn watch_updates(&self, _: Binding) -> Result<Box<dyn UpdateWatcher>, StoreError> {
        unreachable!()
    }
    async fn read_updates(
        &self,
        _: Binding,
        _: Option<&str>,
        _: u32,
    ) -> Result<UpdatePage, StoreError> {
        unreachable!()
    }
}

#[tokio::test]
async fn registration_observes_policy_changes_and_fails_closed_without_restart() {
    let (entered, _started) = mpsc::unbounded_channel();
    let policy = Arc::new(StdMutex::new(Ok(Some(UniversePolicy::default()))));
    let store = GatedStore {
        hold_policy: false,
        oidc_status: Arc::default(),
        memberships: Arc::default(),
        entered,
        login: Arc::new(StdMutex::new(None)),
        signup: Arc::new(StdMutex::new(None)),
        policy: policy.clone(),
    };
    let app = router(
        store,
        HttpConfig {
            origin: "https://game.test".into(),
            secure_cookies: true,
            assets: "absent".into(),
            login_per_minute: 30,
            signup: Some(SignupPolicy {
                universe: uuid::Uuid::nil().into(),
                max_players: 10,
            }),
            signup_per_minute: 100,
            legacy_signup_enabled: true,
            trusted_fly_proxies: vec![],
            wake: None,
            observer: None,
        },
    );
    for enabled in [true, false, true] {
        *policy.lock().unwrap() = Ok(Some(UniversePolicy {
            signup_enabled: enabled,
            ..Default::default()
        }));
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/v1/registration")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 65536)
            .await
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
            serde_json::json!({"enabled":enabled})
        );
        if !enabled {
            assert_eq!(
                app.clone()
                    .oneshot(request("/api/v1/registration"))
                    .await
                    .unwrap()
                    .status(),
                StatusCode::FORBIDDEN
            );
        }
    }
    *policy.lock().unwrap() = Ok(Some(UniversePolicy {
        signup_per_minute: 1,
        ..Default::default()
    }));
    assert_eq!(
        app.clone()
            .oneshot(request("/api/v1/registration"))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    assert_eq!(
        app.clone()
            .oneshot(request("/api/v1/registration"))
            .await
            .unwrap()
            .status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    *policy.lock().unwrap() = Ok(Some(UniversePolicy {
        signup_per_minute: 2,
        ..Default::default()
    }));
    assert_eq!(
        app.clone()
            .oneshot(request("/api/v1/registration"))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    assert_eq!(
        app.clone()
            .oneshot(request("/api/v1/registration"))
            .await
            .unwrap()
            .status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    *policy.lock().unwrap() = Err(());
    assert_eq!(
        app.clone()
            .oneshot(
                Request::get("/api/v1/registration")
                    .body(Body::empty())
                    .unwrap()
            )
            .await
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        app.clone()
            .oneshot(request("/api/v1/registration"))
            .await
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let response = app
        .oneshot(
            Request::get("/api/v1/bootstrap")
                .header(header::COOKIE, format!("orbit_session={}", "a".repeat(64)))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body = axum::body::to_bytes(response.into_body(), 65536)
        .await
        .unwrap();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["signup_enabled"], false);
    assert_eq!(value["result"]["status"], "authenticated");
}

#[tokio::test(start_paused = true)]
async fn blocked_policy_reads_are_bounded_for_registration_and_signup() {
    let (entered, _receiver) = mpsc::unbounded_channel();
    let store = GatedStore {
        hold_policy: true,
        oidc_status: Arc::default(),
        memberships: Arc::default(),
        entered,
        login: Arc::new(StdMutex::new(None)),
        signup: Arc::new(StdMutex::new(None)),
        policy: Arc::new(StdMutex::new(Ok(None))),
    };
    let app = router(
        store,
        HttpConfig {
            origin: "https://game.test".into(),
            secure_cookies: true,
            assets: "absent".into(),
            login_per_minute: 30,
            signup: Some(SignupPolicy {
                universe: uuid::Uuid::nil().into(),
                max_players: 10,
            }),
            signup_per_minute: 5,
            legacy_signup_enabled: true,
            trusted_fly_proxies: vec![],
            wake: None,
            observer: None,
        },
    );
    for req in [
        Request::get("/api/v1/registration")
            .body(Body::empty())
            .unwrap(),
        request("/api/v1/registration"),
    ] {
        let response = tokio::time::timeout(Duration::from_secs(4), app.clone().oneshot(req))
            .await
            .expect("policy read must terminate before four seconds")
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }
}

#[tokio::test]
async fn oidc_enrollment_obeys_live_policy_and_retries_after_admissions_close() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let provider = tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new().fallback(|| async { StatusCode::SERVICE_UNAVAILABLE }),
        )
        .await
        .unwrap();
    });
    let (entered, mut calls) = mpsc::unbounded_channel();
    let policy = Arc::new(StdMutex::new(Ok(Some(UniversePolicy {
        signup_per_minute: 1,
        ..Default::default()
    }))));
    let oidc_status = Arc::new(StdMutex::new(0));
    let app = build_router(
        GatedStore {
            hold_policy: false,
            oidc_status: oidc_status.clone(),
            memberships: Arc::default(),
            entered,
            login: Arc::default(),
            signup: Arc::default(),
            policy: policy.clone(),
        },
        HttpConfig {
            origin: "https://game.test".into(),
            secure_cookies: true,
            assets: "absent".into(),
            login_per_minute: 30,
            signup: None,
            signup_per_minute: 100,
            legacy_signup_enabled: false,
            trusted_fly_proxies: vec![],
            wake: None,
            observer: None,
        },
        None,
        Some(
            unbought_auth::RelyingParty::new(unbought_auth::Configuration {
                issuer: issuer.clone(),
                client_id: "orbit".into(),
                client_secret: "test".into(),
                redirect_uri: "https://game.test/api/auth/callback".into(),
            })
            .unwrap(),
        ),
    );
    for status in [503, 0] {
        *oidc_status.lock().unwrap() = status;
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/auth/config")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if status == 503 {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::OK
            }
        );
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        let response = app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/api/auth/callback?code=code&state=state&iss={}",
                    issuer
                ))
                .header(header::COOKIE, "orbit_oidc=browser")
                .body(Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if status == 503 {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::UNAUTHORIZED
            }
        );
    }
    let response = app
        .clone()
        .oneshot(Request::get("/api/auth/login").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    for path in [
        "https://evil.example",
        "//evil.example",
        "/%09/evil.example",
        "/%0a/evil.example",
        "/%5c/evil.example",
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/api/auth/login?return_to={path}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::UNAUTHORIZED,
            "unsafe path {path} must fail before contacting the unavailable provider"
        );
    }
    provider.abort();
    // A provider/storage outage denies mutations but must not turn a valid
    // session into anonymous state. The same cookie works after recovery.
    let read = |path| {
        Request::get(path)
            .header(header::COOKIE, format!("orbit_session={}", "a".repeat(64)))
            .body(Body::empty())
            .unwrap()
    };
    for (status, expected, bootstrap_status) in [
        (503, StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
        (0, StatusCode::OK, "authenticated"),
        (401, StatusCode::UNAUTHORIZED, "anonymous"),
        (0, StatusCode::OK, "authenticated"),
    ] {
        *oidc_status.lock().unwrap() = status;
        let response = app.clone().oneshot(read("/api/v1/session")).await.unwrap();
        assert_eq!(response.status(), expected);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
        let response = app
            .clone()
            .oneshot(read("/api/v1/bootstrap"))
            .await
            .unwrap();
        let body = axum::body::to_bytes(response.into_body(), 65536)
            .await
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap()["result"]["status"],
            bootstrap_status
        );
    }
    let joined = uuid::Uuid::new_v4();
    let other = uuid::Uuid::new_v4();
    let request = |universe| {
        Request::post("/api/auth/enroll")
            .header(header::ORIGIN, "https://game.test")
            .header(header::COOKIE, format!("orbit_session={}", "a".repeat(64)))
            .header("x-csrf-token", "csrf")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::json!({"universe":universe}).to_string(),
            ))
            .unwrap()
    };
    *oidc_status.lock().unwrap() = 503;
    assert_eq!(
        app.clone().oneshot(request(joined)).await.unwrap().status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert!(calls.try_recv().is_err(), "outages must deny mutations");
    *oidc_status.lock().unwrap() = 0;
    assert_eq!(
        app.clone().oneshot(request(joined)).await.unwrap().status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(calls.try_recv().unwrap(), "enroll");
    let limited = app.clone().oneshot(request(other)).await.unwrap();
    assert_eq!(limited.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(limited.headers().contains_key(header::RETRY_AFTER));
    assert_eq!(limited.headers()[header::CACHE_CONTROL], "no-store");
    *policy.lock().unwrap() = Ok(Some(UniversePolicy {
        signup_enabled: false,
        signup_per_minute: 1,
        ..Default::default()
    }));
    assert_eq!(
        app.clone().oneshot(request(joined)).await.unwrap().status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.clone().oneshot(request(other)).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    assert!(
        calls.try_recv().is_err(),
        "retries and denied requests must not enroll"
    );
    *policy.lock().unwrap() = Ok(Some(UniversePolicy {
        signup_per_minute: 2,
        ..Default::default()
    }));
    let mut missing_csrf = request(other);
    missing_csrf.headers_mut().remove("x-csrf-token");
    assert_eq!(
        app.clone().oneshot(missing_csrf).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.oneshot(request(other)).await.unwrap().status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(calls.try_recv().unwrap(), "enroll");
}

#[tokio::test]
async fn activity_renewal_requires_origin_csrf_and_cookie_and_only_sets_cookie_on_success() {
    let (entered, mut calls) = mpsc::unbounded_channel();
    let status = Arc::new(StdMutex::new(0));
    let app = router(
        GatedStore {
            hold_policy: false,
            oidc_status: status.clone(),
            memberships: Arc::default(),
            entered,
            login: Arc::default(),
            signup: Arc::default(),
            policy: Arc::new(StdMutex::new(Ok(None))),
        },
        HttpConfig {
            origin: "https://game.test".into(),
            secure_cookies: true,
            assets: "absent".into(),
            login_per_minute: 100,
            signup: None,
            signup_per_minute: 100,
            legacy_signup_enabled: false,
            trusted_fly_proxies: Vec::new(),
            wake: None,
            observer: None,
        },
    );
    for (origin, csrf, cookie, expected) in [
        ("https://evil.test", "csrf", true, StatusCode::FORBIDDEN),
        ("https://game.test", "wrong", true, StatusCode::FORBIDDEN),
        ("https://game.test", "csrf", false, StatusCode::UNAUTHORIZED),
    ] {
        let mut request = Request::post("/api/v1/session/renew")
            .header(header::ORIGIN, origin)
            .header("x-csrf-token", csrf);
        if cookie {
            request = request.header(header::COOKIE, format!("orbit_session={}", "a".repeat(64)));
        }
        let response = app
            .clone()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
        assert!(calls.try_recv().is_err());
    }
    for (provider, expected) in [
        (503, StatusCode::SERVICE_UNAVAILABLE),
        (401, StatusCode::UNAUTHORIZED),
        (0, StatusCode::NO_CONTENT),
    ] {
        *status.lock().unwrap() = provider;
        let response = app
            .clone()
            .oneshot(
                Request::post("/api/v1/session/renew")
                    .header(header::ORIGIN, "https://game.test")
                    .header("x-csrf-token", "csrf")
                    .header(header::COOKIE, format!("orbit_session={}", "a".repeat(64)))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        assert_eq!(calls.try_recv().unwrap(), "renew");
        if provider == 0 {
            let cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
            assert!(cookie.contains("Max-Age=2592000"));
            assert!(cookie.contains("HttpOnly; SameSite=Lax"));
            assert!(cookie.ends_with("; Secure"));
        } else {
            assert!(!response.headers().contains_key(header::SET_COOKIE));
        }
    }
}

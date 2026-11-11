use super::*;
use axum::extract::Query;
use std::{future::Future, time::Duration};
use tokio::time::{Instant as Deadline, timeout_at};
const BUDGET: Duration = Duration::from_secs(5);

#[derive(Default, Deserialize)]
pub(super) struct BootstrapQuery {
    #[serde(default)]
    pub bootstrap: bool,
}

#[cfg(test)]
async fn assemble<A, G, F>(signup_enabled: bool, auth: A, game: G, deadline: Deadline) -> Bootstrap
where
    A: Future<Output = Result<AuthenticatedSession, ServiceError>>,
    G: FnOnce(AuthenticatedSession) -> F,
    F: Future<Output = Result<Option<InitialGameSnapshot>, ServiceError>>,
{
    assemble_observed(
        signup_enabled,
        async { auth.await.map(|session| (session, None)) },
        game,
        deadline,
        std::sync::Arc::new(NoopRuntimeObserver),
    )
    .await
}

async fn assemble_observed<A, G, F>(
    signup_enabled: bool,
    auth: A,
    game: G,
    deadline: Deadline,
    observer: std::sync::Arc<dyn RuntimeObserver>,
) -> Bootstrap
where
    A: Future<Output = Result<(AuthenticatedSession, Option<OidcSessionMetadata>), ServiceError>>,
    G: FnOnce(AuthenticatedSession) -> F,
    F: Future<Output = Result<Option<InitialGameSnapshot>, ServiceError>>,
{
    let auth_result = {
        let mut timer = AuthTimer::new(observer.clone(), AuthPhase::BootstrapAuth);
        let result = timeout_at(deadline, auth).await;
        timer.finish(match &result {
            Ok(Ok(_)) => AuthOutcome::Success,
            Ok(Err(ServiceError::Unauthenticated)) => AuthOutcome::SigninRequired,
            Ok(Err(ServiceError::SessionRefreshing(_))) => AuthOutcome::Refreshing,
            _ => AuthOutcome::Unavailable,
        });
        result
    };
    let result = match auth_result {
        Ok(Ok((session, authentication))) => {
            let mut timer = AuthTimer::new(observer.clone(), AuthPhase::BootstrapGame);
            let game = match timeout_at(deadline, game(session.clone())).await {
                Ok(Ok(Some(snapshot))) => BootstrapGame::Ready {
                    snapshot: Box::new(snapshot),
                },
                Ok(Ok(None)) => BootstrapGame::NoMembership,
                other => BootstrapGame::Unavailable {
                    code: match other {
                        Ok(Err(ServiceError::NotFound | ServiceError::Forbidden)) => {
                            BootstrapError::MembershipUnavailable
                        }
                        Ok(Err(ServiceError::UnsupportedProtocol)) => {
                            BootstrapError::UnsupportedProtocol
                        }
                        _ => BootstrapError::Unavailable,
                    },
                },
            };
            timer.finish(if matches!(game, BootstrapGame::Unavailable { .. }) {
                AuthOutcome::Unavailable
            } else {
                AuthOutcome::Success
            });
            BootstrapResult::Authenticated {
                session,
                authentication,
                game,
            }
        }
        Ok(Err(ServiceError::Unauthenticated)) => BootstrapResult::Anonymous,
        _ => BootstrapResult::Unavailable {
            code: BootstrapError::Unavailable,
        },
    };
    observer.bootstrap(match &result {
        BootstrapResult::Anonymous => BootstrapOutcome::Anonymous,
        BootstrapResult::Unavailable { .. } => BootstrapOutcome::AuthUnavailable,
        BootstrapResult::Authenticated {
            game: BootstrapGame::Unavailable { .. },
            ..
        } => BootstrapOutcome::GameUnavailable,
        BootstrapResult::Authenticated { .. } => BootstrapOutcome::Authenticated,
    });
    Bootstrap {
        version: 1,
        signup_enabled,
        result,
    }
}
// Ordered game reads may be briefly unavailable while admitted work drains.
// The caller's single deadline bounds all retries, including their backoff.
async fn read_game_when_available<F, G>(
    mut read: G,
) -> Result<Option<InitialGameSnapshot>, ServiceError>
where
    G: FnMut() -> F,
    F: Future<Output = Result<Option<InitialGameSnapshot>, ServiceError>>,
{
    let mut delay = Duration::from_millis(50);
    loop {
        match read().await {
            Err(ServiceError::Unavailable) => {
                tokio::time::sleep(delay).await;
                delay = (delay * 2).min(Duration::from_millis(500));
            }
            result => return result,
        }
    }
}
// Observer metadata must not turn an already authenticated game response into
// an auth failure. Missing opted-in metadata is a separate observer health signal.
async fn attach_metadata<F>(bootstrap: &mut Bootstrap, metadata: F, deadline: Deadline)
where
    F: Future<Output = Result<Option<OidcSessionMetadata>, StoreError>>,
{
    if let BootstrapResult::Authenticated { authentication, .. } = &mut bootstrap.result {
        *authentication = timeout_at(deadline, metadata)
            .await
            .ok()
            .and_then(Result::ok)
            .flatten();
    }
}

pub(super) async fn prepare_bootstrap<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
) -> Bootstrap {
    let deadline = Deadline::now() + BUDGET;
    let (mut result, enabled) = tokio::join!(
        assemble_observed(
            false,
            async {
                authenticate(s, h, false)
                    .await
                    .map(|session| (session, None))
                    .map_err(|e| e.0)
            },
            |session| async move {
                if s.oidc.is_some() {
                    let _ = s.updates.capture_community_history(session.account).await;
                }
                read_game_when_available(|| s.game.initial_game(&session, uuid::Uuid::new_v4()))
                    .await
            },
            deadline,
            s.config
                .observer
                .clone()
                .unwrap_or_else(|| std::sync::Arc::new(NoopRuntimeObserver)),
        ),
        signup_config::enabled(s)
    );
    result.signup_enabled = enabled;
    if s.oidc.is_some()
        && !h.contains_key(header::AUTHORIZATION)
        && h.get("x-orbit-auth-metadata").and_then(|h| h.to_str().ok()) == Some("1")
        && let Some(token) = token(h)
    {
        attach_metadata(
            &mut result,
            s.updates.oidc_session_metadata(&token_digest(token)),
            deadline,
        )
        .await;
    }
    result
}
pub(super) async fn prepare_authenticated_bootstrap<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    session: AuthenticatedSession,
) -> Bootstrap {
    let (mut result, enabled) = tokio::join!(
        assemble_observed(
            false,
            async { Ok((session, None)) },
            |session| async move {
                if s.oidc.is_some() {
                    let _ = s.updates.capture_community_history(session.account).await;
                }
                read_game_when_available(|| s.game.initial_game(&session, uuid::Uuid::new_v4()))
                    .await
            },
            Deadline::now() + BUDGET,
            s.config
                .observer
                .clone()
                .unwrap_or_else(|| std::sync::Arc::new(NoopRuntimeObserver)),
        ),
        signup_config::enabled(s)
    );
    result.signup_enabled = enabled;
    result
}
pub(super) fn private_response(headers: &HeaderMap, value: impl serde::Serialize) -> Response {
    let mut value = match serde_json::to_value(value) {
        Ok(value) => value,
        Err(_) => return Problem(ServiceError::InvariantFailure).into_response(),
    };
    if headers
        .get("x-orbit-auth-metadata")
        .and_then(|h| h.to_str().ok())
        != Some("1")
        && let Some(result) = value
            .get_mut("result")
            .and_then(|value| value.as_object_mut())
    {
        result.remove("authentication");
    }
    if headers
        .get("x-orbit-view-metadata")
        .and_then(|h| h.to_str().ok())
        != Some("1")
        && let Some(view) = value
            .pointer_mut("/result/game/snapshot/view")
            .and_then(|v| v.as_object_mut())
    {
        view.remove("progress");
    }
    (
        [
            (header::CACHE_CONTROL, "private, no-store"),
            (header::VARY, "Cookie"),
        ],
        Json(value),
    )
        .into_response()
}
pub(super) async fn get<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
) -> Response {
    private_response(&h, prepare_bootstrap(&s, &h).await)
}
pub(super) fn query(
    q: Result<Query<BootstrapQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<bool, Problem> {
    q.map(|Query(q)| q.bootstrap)
        .map_err(|_| ServiceError::Malformed.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::future::pending;
    #[derive(Default)]
    struct Observer(std::sync::Mutex<Vec<&'static str>>);
    impl RuntimeObserver for Observer {
        fn duration(&self, _: RuntimeStage, _: Duration) {}
        fn event(&self, _: RuntimeEvent) {}
        fn bootstrap(&self, outcome: BootstrapOutcome) {
            self.0.lock().unwrap().push(outcome.name());
        }
    }
    #[tokio::test]
    async fn unavailable_http_200_is_observed_as_auth_failure() {
        let observer = std::sync::Arc::new(Observer::default());
        let bootstrap = assemble_observed(
            false,
            async { Err(ServiceError::Unavailable) },
            |_| async { Ok(None) },
            Deadline::now() + BUDGET,
            observer.clone(),
        )
        .await;
        let response = private_response(&HeaderMap::new(), bootstrap);
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 65536)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["result"]["status"], "unavailable");
        assert_eq!(*observer.0.lock().unwrap(), vec!["auth_unavailable"]);
    }
    #[tokio::test]
    async fn refreshing_bootstrap_keeps_failure_semantics_and_records_contention() {
        #[derive(Default)]
        struct AuthObserver(std::sync::Mutex<Vec<(&'static str, &'static str)>>);
        impl RuntimeObserver for AuthObserver {
            fn duration(&self, _: RuntimeStage, _: Duration) {}
            fn event(&self, _: RuntimeEvent) {}
            fn auth_duration(&self, phase: AuthPhase, outcome: AuthOutcome, _: Duration) {
                self.0.lock().unwrap().push((phase.name(), outcome.name()));
            }
        }
        let observer = std::sync::Arc::new(AuthObserver::default());
        let bootstrap = assemble_observed(
            false,
            async { Err(ServiceError::SessionRefreshing(1000)) },
            |_| async { panic!("refresh contention cannot load game state") },
            Deadline::now() + BUDGET,
            observer.clone(),
        )
        .await;
        assert!(matches!(
            bootstrap.result,
            BootstrapResult::Unavailable { .. }
        ));
        assert_eq!(
            *observer.0.lock().unwrap(),
            vec![("bootstrap_auth", "refreshing")]
        );
    }
    #[tokio::test(start_paused = true)]
    async fn optional_metadata_failure_or_timeout_preserves_authenticated_bootstrap() {
        for slow in [false, true] {
            let mut bootstrap = assemble(
                false,
                async { Ok(session()) },
                |_| async { Ok(None) },
                Deadline::now() + BUDGET,
            )
            .await;
            attach_metadata(
                &mut bootstrap,
                async {
                    if slow {
                        std::future::pending::<()>().await;
                    }
                    Err(StoreError::Unavailable)
                },
                Deadline::now() + Duration::from_millis(2),
            )
            .await;
            assert!(matches!(
                bootstrap.result,
                BootstrapResult::Authenticated {
                    authentication: None,
                    game: BootstrapGame::NoMembership,
                    ..
                }
            ));
        }
        let mut bootstrap = assemble(
            false,
            async { Err(ServiceError::Unauthenticated) },
            |_| async { Ok(None) },
            Deadline::now() + BUDGET,
        )
        .await;
        attach_metadata(
            &mut bootstrap,
            async { panic!("anonymous callers cannot load observer metadata") },
            Deadline::now() + BUDGET,
        )
        .await;
        assert!(matches!(bootstrap.result, BootstrapResult::Anonymous));
    }
    #[tokio::test]
    async fn identity_expiry_metadata_requires_opt_in_and_excludes_credentials() {
        for enabled in [false, true] {
            let mut headers = HeaderMap::new();
            if enabled {
                headers.insert("x-orbit-auth-metadata", "1".parse().unwrap());
            }
            let bootstrap = assemble_observed(
                false,
                async {
                    Ok((
                        session(),
                        Some(OidcSessionMetadata {
                            identity_valid_until: 123,
                            refresh_generation: "opaque-generation".into(),
                        }),
                    ))
                },
                |_| async { Ok(None) },
                Deadline::now() + BUDGET,
                std::sync::Arc::new(NoopRuntimeObserver),
            )
            .await;
            let body =
                axum::body::to_bytes(private_response(&headers, bootstrap).into_body(), 65536)
                    .await
                    .unwrap();
            let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
            let metadata = value["result"].get("authentication");
            assert_eq!(metadata.is_some(), enabled);
            if let Some(metadata) = metadata {
                assert_eq!(metadata.as_object().unwrap().len(), 2);
                assert_eq!(metadata["identity_valid_until"], 123);
                assert_eq!(metadata["refresh_generation"], "opaque-generation");
            }
        }
    }
    #[tokio::test]
    async fn json_bootstrap_progress_requires_opt_in() {
        for metadata in [false, true] {
            let mut headers = HeaderMap::new();
            if metadata {
                headers.insert("x-orbit-view-metadata", "1".parse().unwrap());
            }
            let response = private_response(
                &headers,
                serde_json::json!({
                    "result": { "game": { "snapshot": { "view": {
                        "protocol": 4, "progress": { "sampled_at": 1000 }
                    } } } }
                }),
            );
            let body = axum::body::to_bytes(response.into_body(), 65536)
                .await
                .unwrap();
            let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
            let view = &value["result"]["game"]["snapshot"]["view"];
            assert_eq!(view["protocol"], 4);
            assert_eq!(view.get("progress").is_some(), metadata);
            if metadata {
                assert_eq!(view["progress"]["sampled_at"], 1000);
            }
        }
    }
    fn session() -> AuthenticatedSession {
        AuthenticatedSession {
            account: AccountId(uuid::Uuid::nil()),
            csrf: "csrf".into(),
            expires_at: 1000,
            memberships: vec![],
        }
    }
    #[tokio::test]
    async fn auth_timeout_is_unavailable_and_game_timeout_retains_session() {
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(2);
        let b = assemble(
            true,
            pending::<Result<AuthenticatedSession, ServiceError>>(),
            |_| async { Ok(None) },
            deadline,
        )
        .await;
        assert!(matches!(b.result, BootstrapResult::Unavailable { .. }));
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(2);
        let b = assemble(
            true,
            async { Ok(session()) },
            |_| pending::<Result<Option<InitialGameSnapshot>, ServiceError>>(),
            deadline,
        )
        .await;
        assert!(matches!(
            b.result,
            BootstrapResult::Authenticated {
                game: BootstrapGame::Unavailable { .. },
                ..
            }
        ));
    }
    #[tokio::test]
    async fn only_conclusive_auth_failure_is_anonymous() {
        for (error, anonymous) in [
            (ServiceError::Unauthenticated, true),
            (ServiceError::Unavailable, false),
        ] {
            let b = assemble(
                false,
                async { Err(error) },
                |_| async { Ok(None) },
                tokio::time::Instant::now() + BUDGET,
            )
            .await;
            assert_eq!(matches!(b.result, BootstrapResult::Anonymous), anonymous);
        }
        let b = assemble(
            false,
            async { Ok(session()) },
            |_| async { Ok(None) },
            tokio::time::Instant::now() + BUDGET,
        )
        .await;
        assert!(matches!(
            b.result,
            BootstrapResult::Authenticated {
                game: BootstrapGame::NoMembership,
                ..
            }
        ));
    }
    #[tokio::test]
    async fn pending_game_reads_can_catch_up_before_the_bootstrap_deadline() {
        let mut calls = 0;
        let result = read_game_when_available(|| {
            calls += 1;
            std::future::ready(if calls == 1 {
                Err(ServiceError::Unavailable)
            } else {
                Ok(None)
            })
        })
        .await;
        assert!(result.unwrap().is_none());
        assert_eq!(calls, 2);
        let mut corrupt_calls = 0;
        let result = read_game_when_available(|| {
            corrupt_calls += 1;
            std::future::ready(Err(ServiceError::InvariantFailure))
        })
        .await;
        assert!(matches!(result, Err(ServiceError::InvariantFailure)));
        assert_eq!(corrupt_calls, 1);
        let result = assemble(
            false,
            async { Ok(session()) },
            |_| read_game_when_available(|| std::future::ready(Err(ServiceError::Unavailable))),
            Deadline::now() + Duration::from_millis(2),
        )
        .await;
        assert!(matches!(
            result.result,
            BootstrapResult::Authenticated {
                game: BootstrapGame::Unavailable { .. },
                ..
            }
        ));
    }
}

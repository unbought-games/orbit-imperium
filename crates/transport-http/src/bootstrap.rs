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

async fn assemble<A, G, F>(signup_enabled: bool, auth: A, game: G, deadline: Deadline) -> Bootstrap
where
    A: Future<Output = Result<AuthenticatedSession, ServiceError>>,
    G: FnOnce(AuthenticatedSession) -> F,
    F: Future<Output = Result<Option<InitialGameSnapshot>, ServiceError>>,
{
    let result = match timeout_at(deadline, auth).await {
        Ok(Ok(session)) => {
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
            BootstrapResult::Authenticated { session, game }
        }
        Ok(Err(ServiceError::Unauthenticated)) => BootstrapResult::Anonymous,
        _ => BootstrapResult::Unavailable {
            code: BootstrapError::Unavailable,
        },
    };
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
pub(super) async fn prepare_bootstrap<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
) -> Bootstrap {
    let (mut result, enabled) = tokio::join!(
        assemble(
            false,
            async { authenticate(s, h, false).await.map_err(|e| e.0) },
            |session| async move {
                read_game_when_available(|| s.game.initial_game(&session, uuid::Uuid::new_v4()))
                    .await
            },
            Deadline::now() + BUDGET,
        ),
        signup_config::enabled(s)
    );
    result.signup_enabled = enabled;
    result
}
pub(super) async fn prepare_authenticated_bootstrap<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    session: AuthenticatedSession,
) -> Bootstrap {
    let (mut result, enabled) = tokio::join!(
        assemble(
            false,
            async { Ok(session) },
            |session| async move {
                read_game_when_available(|| s.game.initial_game(&session, uuid::Uuid::new_v4()))
                    .await
            },
            Deadline::now() + BUDGET,
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

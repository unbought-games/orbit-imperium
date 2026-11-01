//! Official account entry is derived from server configuration, never request headers.
use super::*;

pub(super) fn is_hosted(origin: &str, issuer: Option<&str>) -> bool {
    origin == "https://orbitimperium.com"
        && issuer == Some("https://accounts.unbought.games/api/auth")
}

pub(super) fn enabled<S>(s: &HttpState<S>) -> bool {
    is_hosted(
        &s.config.origin,
        s.oidc.as_ref().map(|rp| rp.configuration().issuer.as_str()),
    )
}

pub(super) fn universe<S>(s: &HttpState<S>) -> Option<UniverseId> {
    enabled(s)
        .then(|| s.config.signup.map(|policy| policy.universe))
        .flatten()
}

pub(super) fn return_path(universe: Option<UniverseId>) -> String {
    universe.map_or_else(|| "/".into(), |id| format!("/join/{}", id.0))
}

// begin() has already created and stored state, nonce, PKCE and the return path.
// The only added provider parameter chooses Accounts' existing registration UI.
pub(super) fn authorization_url(url: String, hosted: bool, signup: bool) -> String {
    if hosted && signup {
        format!("{url}&prompt=create")
    } else {
        url
    }
}

/// Called only with the return path recovered from a verified, consumed OIDC
/// transaction. A public GET of the recovery page never creates a membership.
pub(super) async fn finish_entry<F, E>(
    path: String,
    universe: Option<UniverseId>,
    enroll: E,
) -> String
where
    E: FnOnce(UniverseId) -> F,
    F: std::future::Future<Output = Result<Response, Problem>>,
{
    let Some(universe) = universe else {
        return path;
    };
    if path != return_path(Some(universe)) {
        return path;
    }
    match enroll(universe).await {
        Ok(response) if response.status().is_success() => "/".into(),
        // Authentication succeeded. Keep its session and offer an explicit retry.
        _ => path,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_official_origin_and_issuer_enable_hosted_entry() {
        for origin in ["https://orbitimperium.com", "https://community.example"] {
            for issuer in [
                None,
                Some("https://accounts.unbought.games/api/auth"),
                Some("https://identity.example"),
            ] {
                assert_eq!(
                    is_hosted(origin, issuer),
                    origin == "https://orbitimperium.com"
                        && issuer == Some("https://accounts.unbought.games/api/auth")
                );
            }
        }
    }

    #[test]
    fn registration_preserves_the_authorization_transaction_and_is_hosted_only() {
        let url = "https://accounts.unbought.games/api/auth/oauth2/authorize?state=state&nonce=nonce&code_challenge=pkce&redirect_uri=https%3A%2F%2Forbitimperium.com%2Fapi%2Fauth%2Fcallback";
        for hosted in [false, true] {
            for signup in [false, true] {
                assert_eq!(
                    authorization_url(url.into(), hosted, signup),
                    if hosted && signup {
                        format!("{url}&prompt=create")
                    } else {
                        url.into()
                    }
                );
            }
        }
    }

    #[test]
    fn the_configured_universe_is_carried_in_the_stored_return_path() {
        let id = UniverseId(uuid::Uuid::from_u128(7));
        assert_eq!(return_path(Some(id)), format!("/join/{}", id.0));
        assert_eq!(return_path(None), "/");
    }

    #[tokio::test]
    async fn callback_enrollment_preserves_the_authenticated_recovery_path_on_failure() {
        let universe = UniverseId(uuid::Uuid::from_u128(7));
        let path = return_path(Some(universe));
        for status in [
            StatusCode::NO_CONTENT,
            StatusCode::FORBIDDEN,
            StatusCode::TOO_MANY_REQUESTS,
            StatusCode::SERVICE_UNAVAILABLE,
        ] {
            let destination = finish_entry(path.clone(), Some(universe), |actual| async move {
                assert_eq!(actual, universe);
                Ok(status.into_response())
            })
            .await;
            assert_eq!(destination, if status.is_success() { "/" } else { &path });
        }
        assert_eq!(
            finish_entry(path.clone(), Some(universe), |_| async {
                Err(ServiceError::Unavailable.into())
            })
            .await,
            path
        );
    }

    #[tokio::test]
    async fn callback_does_not_enroll_for_deep_links_community_servers_or_a_changed_binding() {
        let universe = UniverseId(uuid::Uuid::from_u128(7));
        for (path, configured) in [
            ("/u/andromeda/overview".into(), Some(universe)),
            ("/".into(), Some(universe)),
            (return_path(Some(universe)), None),
            (
                return_path(Some(universe)),
                Some(UniverseId(uuid::Uuid::from_u128(8))),
            ),
        ] {
            assert_eq!(
                finish_entry(path.clone(), configured, |_| async {
                    panic!("must not enroll")
                })
                .await,
                path
            );
        }
    }
}

use super::*;
use crate::bound_api::no_store_json;

pub(super) async fn snapshot<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
) -> Result<Response, Problem> {
    let token = tracker_bearer(&h).ok_or(ServiceError::Unauthenticated)?;
    let snapshot = s
        .updates
        .tracker_snapshot(UniverseId(id), &token_digest(token))
        .await
        .map_err(ServiceError::from)?
        .ok_or(ServiceError::Unauthenticated)?;
    Ok(no_store_json(snapshot))
}

// No cookie fallback and no shared player-authentication path: this credential
// can read this projection only, never commands, reports or player inventories.
fn tracker_bearer(h: &HeaderMap) -> Option<&str> {
    h.get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .filter(|s| s.starts_with("orbit_tracker_") && s.len() > 14 && s.len() <= 256)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tracker_credentials_require_their_own_bearer_namespace() {
        let mut h = HeaderMap::new();
        h.insert(header::COOKIE, "orbit_session=secret".parse().unwrap());
        assert!(tracker_bearer(&h).is_none());
        for value in [
            "Bearer bot-token",
            "Basic orbit_tracker_secret",
            "Bearer orbit_tracker_",
            "Bearer ",
        ] {
            h.insert(header::AUTHORIZATION, value.parse().unwrap());
            assert!(tracker_bearer(&h).is_none());
        }
        h.insert(
            header::AUTHORIZATION,
            "Bearer orbit_tracker_secret".parse().unwrap(),
        );
        assert_eq!(tracker_bearer(&h), Some("orbit_tracker_secret"));
    }
}

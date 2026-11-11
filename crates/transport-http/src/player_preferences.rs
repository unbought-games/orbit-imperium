use super::*;

pub(super) async fn handle<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    headers: HeaderMap,
    Path(universe): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<PlayerPreferencesRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &headers, true).await?;
    let b = q.context.binding;
    bound_api::path_binding(UniverseId(universe), b)?;
    let principal = bound_api::principal(&session, UniverseId(universe))?;
    if principal.account != b.account || principal.player != b.player {
        return Err(ServiceError::NotFound.into());
    }
    if q.preferences.as_ref().is_some_and(|p| !p.valid()) {
        return Err(ServiceError::Malformed.into());
    }
    let preferences = s
        .updates
        .player_preferences(b, q.preferences)
        .await
        .map_err(ServiceError::from)?;
    Ok(bound_api::no_store_json(PlayerPreferencesResponse {
        binding: b,
        request_id: q.context.request_id,
        preferences,
    }))
}

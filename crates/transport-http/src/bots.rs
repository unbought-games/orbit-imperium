use super::bound_api::{no_store_json, path_binding, principal};
use super::*;
pub(super) async fn status<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, false).await?;
    Ok(no_store_json(
        s.updates
            .bot_status(principal(&session, UniverseId(id))?)
            .await
            .map_err(ServiceError::from)?,
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Retirement {
    reason: String,
}
pub(super) async fn retire<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<Retirement>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    s.updates
        .retire_bot(principal(&session, UniverseId(id))?, &q.reason)
        .await
        .map_err(ServiceError::from)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}
pub(super) async fn commands<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<CommandEnvelopeV4>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    let p = principal(&session, u)?;
    path_binding(u, q.binding)?;
    s.updates.bot_status(p).await.map_err(ServiceError::from)?;
    s.game.require_protocol(p.account, u, 4).await?;
    let receipt = s.game.machine_submit(p, q).await?;
    if let Some(wake) = &s.config.wake {
        wake.notify_one();
    }
    Ok((StatusCode::ACCEPTED, no_store_json(receipt)).into_response())
}

/// Anonymous public information stays public. Supplied valid identity still obeys
/// participation policy; invalid bearer auth never falls back to anonymous access.
pub(super) async fn public_access<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
    u: Option<UniverseId>,
) -> Result<(), Problem> {
    let bearer = h.contains_key(header::AUTHORIZATION);
    if !bearer && token(h).is_none() {
        return Ok(());
    }
    let session = match authenticate(s, h, false).await {
        Ok(session) => session,
        Err(Problem(ServiceError::Unauthenticated)) if !bearer => return Ok(()),
        Err(error) => return Err(error),
    };
    for member in &session.memberships {
        if !bearer && u.is_some_and(|u| u != member.universe) {
            continue;
        }
        let binding = s
            .game
            .current_binding(session.account, member.universe, uuid::Uuid::new_v4())
            .await?
            .binding;
        s.updates
            .bot_observe(binding)
            .await
            .map_err(ServiceError::from)?;
    }
    Ok(())
}
pub(super) async fn public_report_access<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
    id: uuid::Uuid,
) -> Result<(), Problem> {
    if !h.contains_key(header::AUTHORIZATION) && token(h).is_none() {
        return Ok(());
    }
    let universe = s
        .updates
        .shared_report_universe(id)
        .await
        .map_err(ServiceError::from)?;
    public_access(s, h, universe).await
}

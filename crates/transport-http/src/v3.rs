use super::bound_api::{Discovery, ReceiptQuery, no_store_json, path_binding, principal};
use super::*;
use axum::extract::Query;

pub(super) async fn binding<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    q: Result<Query<Discovery>, axum::extract::rejection::QueryRejection>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, false).await?;
    let Query(q) = q.map_err(|_| ServiceError::Malformed)?;
    s.game
        .require_protocol(session.account, UniverseId(id), 3)
        .await?;
    Ok(no_store_json(
        s.game
            .current_binding(session.account, UniverseId(id), q.request_id)
            .await?,
    ))
}
pub(super) async fn overview<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 3).await?;
    path_binding(u, c.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game.progression_view(principal(&session, u)?, c).await?,
    ))
}
pub(super) async fn quotes<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<QuoteQuery3>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 3).await?;
    path_binding(u, q.context.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game
            .progression_quote(principal(&session, u)?, q.context, q.request)
            .await?,
    ))
}
pub(super) async fn commands<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(e): ApiJson<CommandEnvelopeV3>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 3).await?;
    path_binding(u, e.binding)?;
    let r = s
        .game
        .progression_submit(principal(&session, u)?, e)
        .await?;
    if let Some(wake) = &s.config.wake {
        wake.notify_one();
    }
    Ok((StatusCode::ACCEPTED, no_store_json(r)).into_response())
}
pub(super) async fn receipt<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path((id, command)): Path<(uuid::Uuid, uuid::Uuid)>,
    q: Result<Query<ReceiptQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, false).await?;
    let Query(q) = q.map_err(|_| ServiceError::Malformed)?;
    s.game
        .require_protocol(session.account, UniverseId(id), 3)
        .await?;
    let p = principal(&session, UniverseId(id))?;
    Ok(no_store_json(
        s.game
            .bound_receipt(
                p,
                Binding {
                    account: p.account,
                    player: p.player,
                    universe: p.universe,
                    epoch: q.epoch,
                },
                CommandId(command),
            )
            .await?,
    ))
}

pub(super) async fn settings<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 3).await?;
    path_binding(u, c.binding)?;
    Ok(no_store_json(
        s.game.bound_settings(principal(&session, u)?, c).await?,
    ))
}
pub(super) async fn options<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<QuoteQuery3>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 3).await?;
    path_binding(u, q.context.binding)?;
    if matches!(q.request.clone().domain()?, QuoteRequest::Transport { .. }) {
        return Err(ServiceError::Malformed.into());
    }
    Ok(super::snapshot_response(
        &h,
        s.game
            .progression_options(principal(&session, u)?, q.context, q.request)
            .await?,
    ))
}

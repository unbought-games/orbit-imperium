use super::bound_api::{Discovery, ReceiptQuery, no_store_json, path_binding, principal};
use super::*;
use axum::extract::Query;
use axum::http::HeaderValue;

pub(super) async fn binding<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    q: Result<Query<Discovery>, axum::extract::rejection::QueryRejection>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, false).await?;
    let Query(q) = q.map_err(|_| ServiceError::Malformed)?;
    s.game
        .require_protocol(session.account, UniverseId(id), 4)
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
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, c.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game.world_view(principal(&session, u)?, c).await?,
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
    s.game.require_protocol(session.account, u, 4).await?;
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
    ApiJson(e): ApiJson<ForegroundAction>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, e.gameplay.binding)?;
    let r = s.game.world_submit(principal(&session, u)?, e).await?;
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
        .require_protocol(session.account, UniverseId(id), 4)
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
    s.game.require_protocol(session.account, u, 4).await?;
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
    s.game.require_protocol(session.account, u, 4).await?;
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

pub(super) async fn query<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<WorldQuery>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game.world_query(principal(&session, u)?, q).await?,
    ))
}
pub(super) async fn reports<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<ReportsQuery4>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game.reports4(principal(&session, u)?, q).await?,
    ))
}
pub(super) async fn report<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path((id, report)): Path<(uuid::Uuid, uuid::Uuid)>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, c.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game
            .report4(principal(&session, u)?, c, ReportId(report))
            .await?,
    ))
}

pub(super) async fn presence<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(e): ApiJson<CommandEnvelopeV4>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, e.binding)?;
    let r = s.game.world_presence(principal(&session, u)?, e).await?;
    if let Some(wake) = &s.config.wake {
        wake.notify_one();
    }
    Ok((StatusCode::ACCEPTED, no_store_json(r)).into_response())
}

pub(super) async fn rankings<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, c.binding)?;
    Ok(no_store_json(
        s.game.rankings(principal(&session, u)?, c).await?,
    ))
}

pub(super) async fn report_share<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path((id, report)): Path<(uuid::Uuid, uuid::Uuid)>,
    ApiJson(q): ApiJson<ReportShareRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    Ok(no_store_json(
        s.game
            .report_share(principal(&session, u)?, ReportId(report), q)
            .await?,
    ))
}
pub(super) async fn shared_report<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    Path(token): Path<uuid::Uuid>,
    h: HeaderMap,
) -> Result<Response, Problem> {
    super::bots::public_report_access(&s, &h, token).await?;
    let mut response = no_store_json(s.game.shared_report(token).await?);
    response.headers_mut().insert(
        "x-robots-tag",
        HeaderValue::from_static("noindex, nofollow, noarchive"),
    );
    response
        .headers_mut()
        .insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    Ok(response)
}

pub(super) async fn catalog<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    path_binding(u, c.binding)?;
    s.game.require_protocol(session.account, u, 4).await?;
    Ok(no_store_json(
        s.game.bound_catalog(principal(&session, u)?, c).await?,
    ))
}

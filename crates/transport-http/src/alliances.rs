use super::bound_api::{no_store_json, path_binding, principal};
use super::*;
use axum::extract::Query;

pub(super) async fn query<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<AllianceQueryRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    path_binding(u, q.context.binding)?;
    s.game.require_protocol(session.account, u, 4).await?;
    Ok(no_store_json(
        s.game.alliance_query(principal(&session, u)?, q).await?,
    ))
}
pub(super) async fn command<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<AllianceCommandRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    path_binding(u, q.context.binding)?;
    s.game.require_protocol(session.account, u, 4).await?;
    Ok(no_store_json(
        s.game.alliance_command(principal(&session, u)?, q).await?,
    ))
}
pub(super) async fn public<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path((universe, id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Response, Problem> {
    super::bots::public_access(&s, &h, Some(UniverseId(universe))).await?;
    let source = login_source(peer.map(|Extension(ConnectInfo(address))| address));
    if let Err(retry) = s.alliance_public_budget.lock().await.admit(
        source,
        &source.to_string(),
        120,
        Instant::now(),
    ) {
        return Ok(rate_limited(retry));
    }
    let mut response = no_store_json(s.game.public_alliance(UniverseId(universe), id).await?);
    response
        .headers_mut()
        .insert("x-robots-tag", "noindex".parse().expect("static header"));
    Ok(response)
}

pub(super) async fn public_budget<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    universe: UniverseId,
) -> Option<Response> {
    if let Err(problem) = super::bots::public_access(s, h, Some(universe)).await {
        return Some(problem.into_response());
    }
    let source = login_source(peer.map(|Extension(ConnectInfo(address))| address));
    s.alliance_public_budget
        .lock()
        .await
        .admit(source, &source.to_string(), 120, Instant::now())
        .err()
        .map(rate_limited)
}
pub(super) async fn directory<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path(universe): Path<uuid::Uuid>,
    Query(query): Query<RecruitmentSearch>,
) -> Result<Response, Problem> {
    if let Some(response) = public_budget(&s, &h, peer, UniverseId(universe)).await {
        return Ok(response);
    }
    Ok(no_store_json(
        s.game
            .recruitment_directory(UniverseId(universe), query)
            .await?,
    ))
}
pub(super) async fn invitation<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path((universe, token)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Response, Problem> {
    if let Some(response) = public_budget(&s, &h, peer, UniverseId(universe)).await {
        return Ok(response);
    }
    Ok(no_store_json(
        s.game
            .alliance_invitation(UniverseId(universe), token)
            .await?,
    ))
}

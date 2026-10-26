use super::bound_api::{no_store_json, path_binding, principal};
use super::*;

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

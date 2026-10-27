use super::bound_api::{no_store_json, path_binding, principal};
use super::*;

pub(super) async fn query<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<SocialQueryRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    path_binding(u, q.context.binding)?;
    s.game.require_protocol(session.account, u, 4).await?;
    Ok(no_store_json(
        s.game.social_query(principal(&session, u)?, q).await?,
    ))
}
pub(super) async fn command<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<SocialCommandRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    path_binding(u, q.context.binding)?;
    s.game.require_protocol(session.account, u, 4).await?;
    Ok(no_store_json(
        s.game.social_command(principal(&session, u)?, q).await?,
    ))
}

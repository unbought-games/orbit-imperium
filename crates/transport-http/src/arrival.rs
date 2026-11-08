use super::*;

pub(super) async fn handle<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<ArrivalRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    bound_api::path_binding(u, q.context.binding)?;
    let state = s.game.arrival(bound_api::principal(&session, u)?, q).await?;
    Ok(bound_api::no_store_json(state))
}

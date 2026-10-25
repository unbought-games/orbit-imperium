use super::bound_api::{no_store_json, path_binding, principal};
use super::*;
use std::sync::LazyLock;
// Bound CPU work, including after a disconnected client. Never queue unlimited simulations.
static SLOTS: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(2)));
pub(super) async fn simulate<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<SimulationQuery>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    let permit = SLOTS
        .clone()
        .try_acquire_owned()
        .map_err(|_| ServiceError::RateLimited)?;
    let job = s
        .game
        .prepare_simulation(principal(&session, u)?, q)
        .await?;
    let mut seed = [0; 32];
    seed[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    seed[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    let result = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        job.run(seed)
    })
    .await
    .map_err(|_| ServiceError::Unavailable)??;
    Ok(no_store_json(result))
}

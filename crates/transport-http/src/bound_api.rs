//! Plumbing shared by the explicit versioned HTTP handlers.
use super::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Discovery {
    pub(super) request_id: uuid::Uuid,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ReceiptQuery {
    pub(super) epoch: Epoch,
}
pub(super) fn principal(
    session: &AuthenticatedSession,
    u: UniverseId,
) -> Result<Principal, Problem> {
    let Actor::Player(player) = player_for(session, u)? else {
        return Err(ServiceError::NotFound.into());
    };
    Ok(Principal {
        account: session.account,
        player,
        universe: u,
    })
}
pub(super) fn path_binding(u: UniverseId, b: Binding) -> Result<(), Problem> {
    if u != b.universe {
        return Err(ServiceError::NotFound.into());
    }
    Ok(())
}
pub(super) fn no_store_json<T: serde::Serialize>(value: T) -> Response {
    ([(header::CACHE_CONTROL, "no-store")], Json(value)).into_response()
}

//! Admission policy applies only to new memberships; successful retries are free.
use super::*;

pub(super) async fn enroll<S: IdentityStore>(
    s: &HttpState<S>,
    session: AuthenticatedSession,
    universe: UniverseId,
    source: IpAddr,
) -> Result<Response, Problem> {
    if session.memberships.iter().any(|m| m.universe == universe) {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    let policy = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        s.updates.universe_policy(universe),
    )
    .await
    .map_err(|_| ServiceError::Unavailable)?
    .map_err(ServiceError::from)?
    .ok_or(ServiceError::Forbidden)?;
    if !policy.signup_enabled {
        return Err(ServiceError::Forbidden.into());
    }
    if let Err(retry) = s.signup_budget.lock().await.admit(
        source,
        &session.account.0.to_string(),
        policy.signup_per_minute,
        Instant::now(),
    ) {
        return Ok(rate_limited(retry));
    }
    // Storage rechecks the current admission policy atomically with enrollment.
    s.updates
        .enroll_oidc(
            session.account,
            SignupPolicy {
                universe,
                max_players: policy.max_players.unwrap_or(u32::MAX),
            },
        )
        .await
        .map_err(ServiceError::from)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

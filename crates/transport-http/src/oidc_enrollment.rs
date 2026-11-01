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
    let (policy, per_minute) = if s.oidc.is_none() {
        signup_config::resolve(s)
            .await
            .map_err(ServiceError::from)?
            .filter(|(policy, _)| policy.universe == universe)
            .ok_or(ServiceError::Forbidden)?
    } else {
        let current = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            s.updates.universe_policy(universe),
        )
        .await
        .map_err(|_| ServiceError::Unavailable)?
        .map_err(ServiceError::from)?
        .ok_or(ServiceError::Forbidden)?;
        if !current.signup_enabled {
            return Err(ServiceError::Forbidden.into());
        }
        (
            SignupPolicy {
                universe,
                max_players: current.max_players.unwrap_or(u32::MAX),
            },
            current.signup_per_minute,
        )
    };
    if let Err(retry) = s.signup_budget.lock().await.admit(
        source,
        &session.account.0.to_string(),
        per_minute,
        Instant::now(),
    ) {
        return Ok(rate_limited(retry));
    }
    // Storage rechecks the current admission policy atomically with enrollment.
    s.updates
        .enroll_oidc(session.account, policy)
        .await
        .map_err(ServiceError::from)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

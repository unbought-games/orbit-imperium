//! Resolve signup policy on each request; never retain database policy in HTTP state.
use super::*;

pub(super) async fn resolve<S: IdentityStore>(
    s: &HttpState<S>,
) -> Result<Option<(SignupPolicy, u32)>, StoreError> {
    let Some(binding) = s.config.signup else {
        return Ok(None);
    };
    match tokio::time::timeout(
        std::time::Duration::from_secs(3),
        s.updates.universe_policy(binding.universe),
    )
    .await
    .map_err(|_| StoreError::Unavailable)?
    .map_err(|_| StoreError::Unavailable)?
    {
        Some(policy) if policy.signup_enabled => Ok(Some((
            SignupPolicy {
                universe: binding.universe,
                // The storage transaction derives geometric capacity and rechecks
                // the current policy. This request carries no authoritative ceiling.
                max_players: policy.max_players.unwrap_or(u32::MAX),
            },
            policy.signup_per_minute,
        ))),
        Some(_) => Ok(None),
        // Only legacy bridge/fixture adapters may return no persisted policy.
        None if s.config.legacy_signup_enabled => Ok(Some((binding, s.config.signup_per_minute))),
        None => Ok(None),
    }
}

pub(super) async fn enabled<S: IdentityStore>(s: &HttpState<S>) -> bool {
    matches!(
        tokio::time::timeout(std::time::Duration::from_secs(5), resolve(s)).await,
        Ok(Ok(Some(_)))
    )
}

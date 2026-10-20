//! Resolve deployment binding and bridge compatibility without changing active policies.
use crate::config::{ServeConfig, SignupConfig};
use orbit_application::{SignupPolicy, UniverseId};
use orbit_storage_postgres::PgStore;

pub struct PreparedUniverses {
    pub store: PgStore,
    pub signup: Option<SignupPolicy>,
    pub legacy_enabled: bool,
    pub legacy_signup_per_minute: u32,
}
fn binding(ids: &[UniverseId], requested: Option<UniverseId>) -> Result<UniverseId, String> {
    match requested {
        Some(id) if ids.contains(&id) => Ok(id),
        Some(_) => {
            Err("ORBIT_UNIVERSE_ID must name an existing universe; use universe list".into())
        }
        None => match ids {
            [id] => Ok(*id),
            [] => Err("no universes exist; run db-init then universe create before serving".into()),
            _ => Err(
                "multiple universes exist; set ORBIT_UNIVERSE_ID for this API's signup route"
                    .into(),
            ),
        },
    }
}
fn legacy_limit(config: &ServeConfig) -> Result<i64, String> {
    let value = config
        .legacy_env
        .get("ORBIT_COMMANDS_PER_MINUTE")
        .map(String::as_str)
        .unwrap_or("60");
    let limit = value
        .parse::<i64>()
        .map_err(|_| "ORBIT_COMMANDS_PER_MINUTE must be an integer from 1 through 10000")?;
    if !(1..=10_000).contains(&limit) {
        return Err("ORBIT_COMMANDS_PER_MINUTE must be an integer from 1 through 10000".into());
    }
    Ok(limit)
}
pub async fn prepare(
    mut store: PgStore,
    config: &ServeConfig,
) -> Result<PreparedUniverses, String> {
    if config.fixture {
        store = store
            .with_legacy_universe_config(legacy_limit(config)?)
            .map_err(|e| e.to_string())?;
        return Ok(PreparedUniverses {
            store,
            signup: None,
            legacy_enabled: false,
            legacy_signup_per_minute: 5,
        });
    }
    let mut ids = store.universes().await.map_err(|e| e.to_string())?;
    let mut legacy_enabled = false;
    let mut legacy_signup_per_minute = 5;
    let signup = if cfg!(feature = "universe-config-bridge") {
        store = store
            .with_legacy_universe_config(60)
            .map_err(|e| e.to_string())?;
        // Only an unactivated world can consume legacy environment values.
        let mut has_legacy = ids.is_empty();
        for id in &ids {
            if store
                .has_universe_policy(*id)
                .await
                .map_err(|e| e.to_string())?
            {
                store.universe_config(*id).await?;
            } else {
                has_legacy = true;
            }
        }
        if has_legacy {
            store = store
                .with_legacy_universe_config(legacy_limit(config)?)
                .map_err(|e| e.to_string())?;
            let speed = config
                .legacy_env
                .get("ORBIT_SPEED")
                .map(|s| orbit_engine::parse_speed(s))
                .transpose()
                .map_err(|e| format!("ORBIT_SPEED: {e}"))?;
            if ids.is_empty() {
                if speed.is_some_and(|s| s != 10) {
                    return Err("legacy bridge bootstrap requires ORBIT_SPEED=10; use acknowledged universe create for new configurable worlds".into());
                }
                let legacy = SignupConfig::parse(|key| config.legacy_env.get(key).cloned())?;
                let created = store
                    .ensure_signup_universe(
                        config.signup.universe,
                        legacy.topology,
                        legacy.max_players,
                    )
                    .await
                    .map_err(|e| format!("legacy bootstrap: {e}"))?;
                ids.push(created.universe);
            }
            if let Some(speed) = speed {
                store
                    .check_legacy_speed(speed)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        } else if !config.legacy_env.is_empty() {
            eprintln!(
                "Deprecated universe environment variables ignored: database policies are authoritative; remove these variables before deploying the final release."
            );
        }
        if config.role.serves_api() {
            let id = binding(&ids, config.signup.universe)?;
            if store
                .has_universe_policy(id)
                .await
                .map_err(|e| e.to_string())?
            {
                // Binding only. Every API request reloads policy; enrollment
                // derives and enforces the current ceiling inside its transaction.
                Some(SignupPolicy {
                    universe: id,
                    max_players: u32::MAX,
                })
            } else {
                let legacy = SignupConfig::parse(|key| config.legacy_env.get(key).cloned())?;
                legacy_enabled = legacy.enabled;
                legacy_signup_per_minute = legacy.per_minute;
                Some(
                    store
                        .ensure_signup_universe(Some(id), legacy.topology, legacy.max_players)
                        .await
                        .map_err(|e| format!("legacy signup configuration: {e}"))?,
                )
            }
        } else {
            None
        }
    } else {
        store.require_universe_policies().await?;
        if config.role.serves_api() {
            Some(SignupPolicy {
                universe: binding(&ids, config.signup.universe)?,
                max_players: u32::MAX,
            })
        } else {
            None
        }
    };
    Ok(PreparedUniverses {
        store,
        signup,
        legacy_enabled,
        legacy_signup_per_minute,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signup_routing_never_implicitly_creates_or_picks_a_universe() {
        let a = uuid::Uuid::new_v4().into();
        let b = uuid::Uuid::new_v4().into();
        assert_eq!(binding(&[a], None).unwrap(), a);
        assert_eq!(binding(&[a, b], Some(b)).unwrap(), b);
        assert!(binding(&[a, b], None).is_err());
        assert!(binding(&[a], Some(b)).is_err());
        assert!(binding(&[], None).unwrap_err().contains("universe create"));
    }
}

use orbit_engine::{UniverseId, UniverseOptions, parse_speed};
use std::net::IpAddr;
use uuid::Uuid;

fn local_http_origin(origin: &str) -> bool {
    let Some(authority) = origin.strip_prefix("http://") else {
        return false;
    };
    if let Some(port) = authority.strip_prefix("localhost:") {
        return port.parse::<u16>().is_ok_and(|port| port > 0);
    }
    authority
        .parse::<std::net::SocketAddr>()
        .is_ok_and(|address| {
            address.port() > 0
                && match address.ip() {
                    IpAddr::V4(ip) => ip.is_loopback() || ip.is_private(),
                    IpAddr::V6(ip) => ip.is_loopback() || ip.is_unique_local(),
                }
        })
}

#[cfg(all(test, not(feature = "universe-config-bridge")))]
mod universe_config_tests {
    use super::*;

    #[test]
    fn profile_credentials_are_optional_scoped_to_oidc_and_unused_on_workers() {
        assert!(ServeConfig::parse(|_| None).unwrap().profiles.is_none());
        assert!(
            ServeConfig::parse(
                |k| (k == "ORBIT_ACCOUNTS_PROFILE_CREDENTIAL").then(|| "secret".into())
            )
            .is_err()
        );
        assert!(
            ServeConfig::parse(
                |k| (k == "ORBIT_ACCOUNTS_API_URL").then(|| "https://accounts.test".into())
            )
            .is_err()
        );
        let parse = |base: &str| {
            ServeConfig::parse(|k| match k {
                "ORBIT_AUTH_MODE" => Some("oidc".into()),
                "ORBIT_OIDC_ISSUER" => Some("https://accounts.unbought.games/api/auth".into()),
                "ORBIT_OIDC_CLIENT_ID" => Some("orbit".into()),
                "ORBIT_OIDC_CLIENT_SECRET" => Some("oauth-secret".into()),
                "ORBIT_ACCOUNTS_PROFILE_CREDENTIAL" => Some("profile-secret".into()),
                "ORBIT_ACCOUNTS_API_URL" => Some(base.into()),
                _ => None,
            })
        };
        assert!(
            parse("https://accounts.unbought.games")
                .unwrap()
                .profiles
                .is_some()
        );
        assert!(parse("http://remote.test").is_err());
        assert!(
            ServeConfig::parse(|k| match k {
                "ORBIT_ROLE" => Some("worker".into()),
                "ORBIT_ACCOUNTS_PROFILE_CREDENTIAL" => Some("unused".into()),
                _ => None,
            })
            .unwrap()
            .profiles
            .is_none()
        );
    }

    #[test]
    fn final_server_rejects_every_retired_universe_variable() {
        for key in [
            "ORBIT_SPEED",
            "ORBIT_GALAXIES",
            "ORBIT_SYSTEMS_PER_GALAXY",
            "ORBIT_POSITIONS_PER_SYSTEM",
            "ORBIT_MAX_PLAYERS",
            "ORBIT_SIGNUP_ENABLED",
            "ORBIT_SIGNUP_PER_MINUTE",
            "ORBIT_COMMANDS_PER_MINUTE",
        ] {
            let error = ServeConfig::parse(|k| (k == key).then(|| "1".into()))
                .err()
                .unwrap_or_else(|| panic!("accepted retired variable {key}"));
            assert!(error.contains(key) && error.contains("universe"), "{error}");
        }
    }

    #[test]
    fn worker_ignores_unused_http_and_signup_binding_settings() {
        let result = ServeConfig::parse(|key| match key {
            "ORBIT_ROLE" => Some("worker".into()),
            "ORBIT_UNIVERSE_ID" => Some("not-a-uuid".into()),
            "ORBIT_LOGIN_PER_MINUTE" => Some("not-a-number".into()),
            "ORBIT_LOCAL_INSECURE" => Some("1".into()),
            "ORBIT_ORIGIN" => Some("https://game.example".into()),
            _ => None,
        });
        assert!(result.is_ok(), "{}", result.err().unwrap());
    }
}

/// Serve-only settings, parsed without DNS, database, or listener effects.
/// Universe policy is database-owned; legacy fields are only for bridge/fixture startup.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeRole {
    Api,
    Worker,
    Combined,
}
impl RuntimeRole {
    pub fn serves_api(self) -> bool {
        self != Self::Worker
    }
    pub fn runs_worker(self) -> bool {
        self != Self::Api
    }
}
pub struct ServeConfig {
    pub profiles: Option<orbit_transport_http::AccountProfiles>,
    pub oidc: Option<unbought_auth::Configuration>,
    pub role: RuntimeRole,
    pub metrics_bind: Option<std::net::SocketAddr>,
    pub pools: orbit_storage_postgres::PoolLimits,
    pub max_in_flight: usize,
    pub cpu_parallelism: usize,
    pub drain_timeout: std::time::Duration,
    pub speed: Option<i32>,
    pub legacy_env: std::collections::BTreeMap<String, String>,
    pub signup: SignupConfig,
    pub fixture: bool,
    pub bind: String,
    pub origin: String,
    pub secure_cookies: bool,
    pub assets: String,
    pub login_per_minute: u32,
}

impl ServeConfig {
    pub fn parse(get: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let metrics_bind = get("ORBIT_METRICS_BIND")
            .map(|value| {
                value.parse::<std::net::SocketAddr>().map_err(|_| {
                    "ORBIT_METRICS_BIND must be a numeric IP address and port".to_string()
                })
            })
            .transpose()?;
        let role = match get("ORBIT_ROLE").as_deref().unwrap_or("combined") {
            "api" => RuntimeRole::Api,
            "worker" => RuntimeRole::Worker,
            "combined" => RuntimeRole::Combined,
            _ => return Err("ORBIT_ROLE must be api, worker, or combined".into()),
        };
        let number = |key: &str, default: u32, minimum: u32, maximum: u32| -> Result<u32, String> {
            let text = get(key).unwrap_or_else(|| default.to_string());
            let n: u32 = text
                .parse()
                .map_err(|_| format!("{key} must be an integer"))?;
            if !(minimum..=maximum).contains(&n) || n.to_string() != text {
                return Err(format!("{key} must be between {minimum} and {maximum}"));
            }
            Ok(n)
        };
        let api = role.serves_api();
        let get = |key: &str| {
            if !api
                && matches!(
                    key,
                    "ORBIT_UNIVERSE_ID"
                        | "ORBIT_LOGIN_PER_MINUTE"
                        | "ORBIT_LOCAL_INSECURE"
                        | "ORBIT_ORIGIN"
                        | "ORBIT_BIND"
                        | "ORBIT_ASSETS"
                )
            {
                None
            } else {
                get(key)
            }
        };
        let worker = role.runs_worker();
        let pools = orbit_storage_postgres::PoolLimits {
            admission: number(
                "ORBIT_POOL_ADMISSION",
                if api { 8 } else { 0 },
                u32::from(api),
                if api { 128 } else { 0 },
            )?,
            reads: number(
                "ORBIT_POOL_READS",
                if api { 8 } else { 0 },
                u32::from(api),
                if api { 128 } else { 0 },
            )?,
            worker: number(
                "ORBIT_POOL_WORKER",
                if worker { 4 } else { 0 },
                u32::from(worker),
                if worker { 128 } else { 0 },
            )?,
            control: number("ORBIT_POOL_CONTROL", 4, if api { 3 } else { 2 }, 32)?,
            refresh: number(
                "ORBIT_POOL_REFRESH",
                if api { 2 } else { 0 },
                u32::from(api),
                if api { 128 } else { 0 },
            )?,
        };
        pools
            .validate()
            .map_err(|_| "total per-process database pool limit must be at most 256")?;
        let max_in_flight = number("ORBIT_MAX_IN_FLIGHT", 4, 1, 256)? as usize;
        let cpu_parallelism = number("ORBIT_CPU_WORKERS", 2, 1, 128)? as usize;
        let drain_timeout = std::time::Duration::from_millis(u64::from(number(
            "ORBIT_DRAIN_MS",
            25000,
            1,
            120000,
        )?));
        let fixture =
            cfg!(feature = "test-support") && get("ORBIT_TEST_SEEDED").is_some_and(|v| v == "1");
        if !cfg!(feature = "universe-config-bridge") && !fixture {
            for key in RETIRED_UNIVERSE_VARIABLES {
                if get(key).is_some() {
                    return Err(format!(
                        "{key} is retired: use orbit universe create or orbit universe config apply"
                    ));
                }
            }
        }
        let legacy_env = RETIRED_UNIVERSE_VARIABLES
            .iter()
            .filter_map(|key| get(key).map(|value| ((*key).to_string(), value)))
            .collect();
        let speed = if fixture {
            get("ORBIT_SPEED")
                .map(|s| parse_speed(&s))
                .transpose()
                .map_err(|e| e.to_string())?
        } else {
            None
        };
        let signup = SignupConfig::parse(|key| {
            if fixture || key == "ORBIT_UNIVERSE_ID" {
                get(key)
            } else {
                None
            }
        })?;
        // Preserve the address text: resolution is a separate startup effect.
        let bind = get("ORBIT_BIND").unwrap_or_else(|| "127.0.0.1:8080".into());
        let origin = get("ORBIT_ORIGIN").unwrap_or_else(|| "http://localhost:8080".into());
        let secure_cookies = !get("ORBIT_LOCAL_INSECURE").is_some_and(|v| v == "1");
        if !secure_cookies && !local_http_origin(&origin) {
            return Err(
                "insecure cookies require a loopback or private-network HTTP origin with a port"
                    .into(),
            );
        }
        let oidc = if role.serves_api() {
            match get("ORBIT_AUTH_MODE").as_deref().unwrap_or("local") {
                "local" => None,
                "oidc" => Some(unbought_auth::Configuration {
                    issuer: get("ORBIT_OIDC_ISSUER").ok_or("ORBIT_OIDC_ISSUER is required")?,
                    client_id: get("ORBIT_OIDC_CLIENT_ID")
                        .ok_or("ORBIT_OIDC_CLIENT_ID is required")?,
                    client_secret: get("ORBIT_OIDC_CLIENT_SECRET")
                        .ok_or("ORBIT_OIDC_CLIENT_SECRET is required")?,
                    redirect_uri: format!("{origin}/api/auth/callback"),
                }),
                _ => return Err("ORBIT_AUTH_MODE must be local or oidc".into()),
            }
        } else {
            None
        };
        if origin == "https://orbitimperium.com"
            && oidc.as_ref().map(|c| c.issuer.as_str())
                != Some("https://accounts.unbought.games/api/auth")
        {
            return Err("Official Orbit requires the Unbought issuer".into());
        }
        let profiles = if api {
            match get("ORBIT_ACCOUNTS_PROFILE_CREDENTIAL") {
                Some(credential) => {
                    let issuer = &oidc
                        .as_ref()
                        .ok_or("Public profiles require OIDC authentication")?
                        .issuer;
                    let base = get("ORBIT_ACCOUNTS_API_URL")
                        .unwrap_or_else(|| issuer.trim_end_matches("/api/auth").to_owned());
                    Some(
                        orbit_transport_http::AccountProfiles::new(&base, issuer, &credential)
                            .map_err(|_| "Invalid Accounts profile configuration")?,
                    )
                }
                None => {
                    if get("ORBIT_ACCOUNTS_API_URL").is_some() {
                        return Err(
                            "ORBIT_ACCOUNTS_API_URL requires ORBIT_ACCOUNTS_PROFILE_CREDENTIAL"
                                .into(),
                        );
                    }
                    None
                }
            }
        } else {
            None
        };
        Ok(Self {
            profiles,
            oidc,
            role,
            metrics_bind,
            pools,
            max_in_flight,
            cpu_parallelism,
            drain_timeout,
            speed,
            legacy_env,
            signup,
            fixture,
            bind,
            origin,
            secure_cookies,
            assets: get("ORBIT_ASSETS").unwrap_or_else(|| "apps/web/dist".into()),
            login_per_minute: get("ORBIT_LOGIN_PER_MINUTE")
                .unwrap_or_else(|| "30".into())
                .parse::<u32>()
                .map_err(|e| e.to_string())?,
        })
    }
}

pub const RETIRED_UNIVERSE_VARIABLES: &[&str] = &[
    "ORBIT_SPEED",
    "ORBIT_GALAXIES",
    "ORBIT_SYSTEMS_PER_GALAXY",
    "ORBIT_POSITIONS_PER_SYSTEM",
    "ORBIT_MAX_PLAYERS",
    "ORBIT_SIGNUP_ENABLED",
    "ORBIT_SIGNUP_PER_MINUTE",
    "ORBIT_COMMANDS_PER_MINUTE",
];

pub struct SignupConfig {
    pub enabled: bool,
    pub universe: Option<UniverseId>,
    pub max_players: Option<u32>,
    pub topology: UniverseOptions,
    pub per_minute: u32,
}
impl SignupConfig {
    pub fn parse(get: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let enabled = match get("ORBIT_SIGNUP_ENABLED").as_deref().unwrap_or("true") {
            "true" => true,
            "false" => false,
            _ => return Err("ORBIT_SIGNUP_ENABLED must be true or false".into()),
        };
        let number = |key: &str, default: u32, max: u32| -> Result<u32, String> {
            let text = get(key).unwrap_or_else(|| default.to_string());
            let n: u32 = text
                .parse()
                .map_err(|_| format!("{key} must be an integer from 1 to {max}"))?;
            if n == 0 || n > max || n.to_string() != text {
                return Err(format!("{key} must be an integer from 1 to {max}"));
            }
            Ok(n)
        };
        let universe = get("ORBIT_UNIVERSE_ID")
            .map(|s| {
                Uuid::parse_str(&s)
                    .ok()
                    .filter(|id| !id.is_nil())
                    .map(UniverseId)
                    .ok_or_else(|| "ORBIT_UNIVERSE_ID must be a non-nil UUID".to_owned())
            })
            .transpose()?;
        let optional = |key: &str, max| -> Result<Option<u32>, String> {
            get(key).map(|_| number(key, 1, max)).transpose()
        };
        let topology = UniverseOptions {
            galaxies: optional("ORBIT_GALAXIES", 100)?,
            systems_per_galaxy: optional("ORBIT_SYSTEMS_PER_GALAXY", 1000)?,
            positions_per_system: optional("ORBIT_POSITIONS_PER_SYSTEM", 15)?,
        };
        if topology.positions_per_system.is_some_and(|n| n != 15) {
            return Err("ORBIT_POSITIONS_PER_SYSTEM must be 15".into());
        }
        Ok(Self {
            enabled,
            universe,
            max_players: optional("ORBIT_MAX_PLAYERS", 900_000)?,
            topology,
            per_minute: number("ORBIT_SIGNUP_PER_MINUTE", 5, 10000)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_enable_signup_and_invalid_settings_fail_closed() {
        let defaults = SignupConfig::parse(|_| None).unwrap();
        assert!(defaults.enabled);
        assert_eq!(defaults.max_players, None);
        assert!(defaults.universe.is_none());
        for (key, value) in [
            ("ORBIT_SIGNUP_ENABLED", "yes"),
            ("ORBIT_MAX_PLAYERS", "0"),
            ("ORBIT_MAX_PLAYERS", "900001"),
            ("ORBIT_SIGNUP_PER_MINUTE", "0"),
            ("ORBIT_UNIVERSE_ID", "bad"),
            ("ORBIT_UNIVERSE_ID", "00000000-0000-0000-0000-000000000000"),
        ] {
            assert!(
                SignupConfig::parse(|k| (k == key).then(|| value.into())).is_err(),
                "{key}"
            );
        }
        let closed = SignupConfig::parse(|key| match key {
            "ORBIT_SIGNUP_ENABLED" => Some("false".into()),
            "ORBIT_MAX_PLAYERS" => Some("8".into()),
            _ => None,
        })
        .unwrap();
        assert!(!closed.enabled);
        assert_eq!(closed.max_players, Some(8));
    }
}

#[cfg(all(test, feature = "test-support"))]
mod serve_tests {
    use super::*;

    fn parse(values: &[(&str, &str)]) -> Result<ServeConfig, String> {
        ServeConfig::parse(|key| {
            if key == "ORBIT_TEST_SEEDED" && !values.iter().any(|(k, _)| *k == key) {
                return Some("1".into());
            }
            values
                .iter()
                .find(|(k, _)| *k == key)
                .map(|(_, v)| (*v).into())
        })
    }

    #[test]
    fn defaults_preserve_deployment_settings() {
        let config = parse(&[]).unwrap();
        assert_eq!(config.bind, "127.0.0.1:8080");
        assert_eq!(config.origin, "http://localhost:8080");
        assert_eq!(config.assets, "apps/web/dist");
        assert!(config.secure_cookies);
        assert_eq!(config.login_per_minute, 30);
        assert_eq!(config.speed, None);
        assert!(config.fixture);
        assert!(config.signup.enabled);
        assert_eq!(config.signup.universe, None);
        assert_eq!(config.signup.max_players, None);
        assert_eq!(config.signup.per_minute, 5);
    }

    #[test]
    fn overrides_preserve_unresolved_bind_and_signup_settings() {
        let config = parse(&[
            ("ORBIT_BIND", "unresolved.invalid:9090"),
            ("ORBIT_ORIGIN", "https://game.example"),
            ("ORBIT_ASSETS", "/srv/web"),
            ("ORBIT_LOGIN_PER_MINUTE", "12"),
            ("ORBIT_SPEED", "10"),
            ("ORBIT_SIGNUP_ENABLED", "false"),
            ("ORBIT_UNIVERSE_ID", "00000000-0000-4000-8000-000000000001"),
            ("ORBIT_MAX_PLAYERS", "8"),
            ("ORBIT_SIGNUP_PER_MINUTE", "10000"),
        ])
        .unwrap();
        assert_eq!(config.bind, "unresolved.invalid:9090");
        assert_eq!(config.origin, "https://game.example");
        assert_eq!(config.assets, "/srv/web");
        assert_eq!(config.login_per_minute, 12);
        assert_eq!(config.speed, Some(10));
        assert!(!config.signup.enabled);
        assert_eq!(
            config.signup.universe.unwrap().to_string(),
            "00000000-0000-4000-8000-000000000001"
        );
        assert_eq!(config.signup.max_players, Some(8));
        assert_eq!(config.signup.per_minute, 10000);
        // Binding syntax and resolution belong to the effectful startup stage.
        for bind in ["", "missing-port", "127.0.0.1:invalid"] {
            assert_eq!(parse(&[("ORBIT_BIND", bind)]).unwrap().bind, bind);
        }
    }

    #[test]
    fn topology_accepts_supported_bounds_and_rejects_invalid_values() {
        for (galaxies, systems) in [("1", "1"), ("100", "1000"), ("1", "100")] {
            assert!(
                parse(&[
                    ("ORBIT_GALAXIES", galaxies),
                    ("ORBIT_SYSTEMS_PER_GALAXY", systems),
                    ("ORBIT_POSITIONS_PER_SYSTEM", "15")
                ])
                .is_ok()
            );
        }
        for (key, value) in [
            ("ORBIT_GALAXIES", "0"),
            ("ORBIT_GALAXIES", "101"),
            ("ORBIT_SYSTEMS_PER_GALAXY", "0"),
            ("ORBIT_SYSTEMS_PER_GALAXY", "1001"),
            ("ORBIT_POSITIONS_PER_SYSTEM", "5"),
            ("ORBIT_POSITIONS_PER_SYSTEM", "16"),
            ("ORBIT_GALAXIES", "01"),
            ("ORBIT_GALAXIES", "-1"),
            ("ORBIT_GALAXIES", "1.5"),
            ("ORBIT_GALAXIES", ""),
        ] {
            let error = parse(&[(key, value)]).err().unwrap();
            assert!(error.contains(key), "{error}");
        }
        assert!(
            parse(&[
                ("ORBIT_SYSTEMS_PER_GALAXY", "100"),
                ("ORBIT_MAX_PLAYERS", "100")
            ])
            .is_ok()
        );
    }

    #[test]
    fn fixture_speed_values_remain_explicit_and_bounded() {
        for (speed, valid) in [
            ("1", true),
            ("10", true),
            ("100", true),
            ("0", false),
            ("101", false),
            ("01", false),
            ("+10", false),
            ("", false),
        ] {
            assert_eq!(parse(&[("ORBIT_SPEED", speed)]).is_ok(), valid);
        }
    }

    #[test]
    fn insecure_cookies_require_a_loopback_or_private_network_origin() {
        for (origin, allowed) in [
            ("http://localhost:8080", true),
            ("http://127.0.0.1:9090", true),
            ("http://localhost", false),
            ("http://[::1]:8080", true),
            ("http://192.168.50.48:5173", true),
            ("http://10.0.0.2:5173", true),
            ("http://172.16.0.2:5173", true),
            ("http://172.31.255.254:5173", true),
            ("http://[fd00::1]:5173", true),
            ("http://172.32.0.1:5173", false),
            ("http://8.8.8.8:5173", false),
            ("http://0.0.0.0:5173", false),
            ("http://[::]:5173", false),
            ("http://192.168.50.48", false),
            ("http://192.168.50.48:0", false),
            ("http://localhost:5173@evil.example", false),
            ("http://192.168.50.48:5173/path", false),
            ("http://192.168.50.48:5173?query", false),
            ("https://localhost:8080", false),
            ("http://localhost.example:8080", false),
            ("https://game.example", false),
            ("", false),
        ] {
            for flag in ["1", "0", "true", "", "01"] {
                let result = parse(&[("ORBIT_ORIGIN", origin), ("ORBIT_LOCAL_INSECURE", flag)]);
                assert_eq!(result.is_ok(), flag != "1" || allowed, "{origin}, {flag}");
                if let Ok(config) = result {
                    assert_eq!(config.secure_cookies, flag != "1");
                }
            }
        }
    }

    #[test]
    fn login_limits_keep_existing_unsigned_integer_parsing() {
        for (value, expected) in [
            ("0", 0),
            ("1", 1),
            ("+30", 30),
            ("030", 30),
            ("4294967295", u32::MAX),
        ] {
            assert_eq!(
                parse(&[("ORBIT_LOGIN_PER_MINUTE", value)])
                    .unwrap()
                    .login_per_minute,
                expected
            );
        }
        for value in ["", "-1", "1.5", " 30", "4294967296", "bad"] {
            assert!(
                parse(&[("ORBIT_LOGIN_PER_MINUTE", value)]).is_err(),
                "{value}"
            );
        }
    }

    #[test]
    fn invalid_signup_settings_are_rejected_even_for_fixtures() {
        for (key, value) in [
            ("ORBIT_SIGNUP_ENABLED", "1"),
            ("ORBIT_SIGNUP_ENABLED", "TRUE"),
            ("ORBIT_MAX_PLAYERS", "0"),
            ("ORBIT_MAX_PLAYERS", "900001"),
            ("ORBIT_MAX_PLAYERS", "08"),
            ("ORBIT_SIGNUP_PER_MINUTE", "0"),
            ("ORBIT_SIGNUP_PER_MINUTE", "10001"),
            ("ORBIT_SIGNUP_PER_MINUTE", "+5"),
            ("ORBIT_SIGNUP_PER_MINUTE", " 5"),
            ("ORBIT_UNIVERSE_ID", "bad"),
            ("ORBIT_UNIVERSE_ID", "00000000-0000-0000-0000-000000000000"),
        ] {
            {
                let flag = "1";
                let error = parse(&[(key, value), ("ORBIT_TEST_SEEDED", flag)])
                    .err()
                    .unwrap();
                assert!(error.contains(key), "{error}");
            }
        }
    }
}

#[cfg(test)]
mod runtime_tests {
    use super::*;
    #[test]
    fn runtime_roles_reserve_only_their_pools_and_reject_invalid_limits() {
        let config = |pairs: &[(&str, &str)]| {
            ServeConfig::parse(|key| {
                pairs
                    .iter()
                    .find(|(k, _)| *k == key)
                    .map(|(_, v)| v.to_string())
            })
        };
        assert!(
            config(&[("ORBIT_METRICS_BIND", "127.0.0.1:9091")])
                .unwrap()
                .metrics_bind
                .is_some()
        );
        assert!(config(&[("ORBIT_METRICS_BIND", "not-an-address")]).is_err());
        let combined = config(&[]).unwrap();
        assert_eq!(combined.role, RuntimeRole::Combined);
        assert!(combined.pools.control >= 2);
        assert!(
            combined.pools.admission > 0 && combined.pools.reads > 0 && combined.pools.worker > 0
        );
        let api = config(&[("ORBIT_ROLE", "api")]).unwrap();
        assert!(!api.role.runs_worker());
        assert_eq!(api.pools.worker, 0);
        assert_eq!(api.pools.refresh, 2);
        let worker = config(&[("ORBIT_ROLE", "worker")]).unwrap();
        assert!(!worker.role.serves_api());
        assert_eq!((worker.pools.admission, worker.pools.reads), (0, 0));
        assert_eq!(worker.pools.refresh, 0);
        for pairs in [
            vec![("ORBIT_POOL_REFRESH", "0")],
            vec![("ORBIT_ROLE", "worker"), ("ORBIT_POOL_REFRESH", "1")],
            vec![
                ("ORBIT_POOL_ADMISSION", "128"),
                ("ORBIT_POOL_READS", "120"),
                ("ORBIT_POOL_REFRESH", "4"),
            ],
            vec![("ORBIT_ROLE", "wrong")],
            vec![("ORBIT_POOL_CONTROL", "1")],
            vec![("ORBIT_ROLE", "api"), ("ORBIT_POOL_CONTROL", "2")],
            vec![("ORBIT_CPU_WORKERS", "0")],
            vec![("ORBIT_MAX_IN_FLIGHT", "0")],
            vec![("ORBIT_ROLE", "api"), ("ORBIT_POOL_WORKER", "1")],
        ] {
            assert!(config(&pairs).is_err());
        }
    }
}

#[cfg(all(test, feature = "universe-config-bridge"))]
mod bridge_tests {
    use super::*;
    #[test]
    fn legacy_values_are_not_parsed_until_missing_database_policy_is_known() {
        let config =
            ServeConfig::parse(|key| (key == "ORBIT_SPEED").then(|| "old-invalid-value".into()))
                .unwrap();
        assert_eq!(config.speed, None);
        assert_eq!(
            config.legacy_env.get("ORBIT_SPEED").unwrap(),
            "old-invalid-value"
        );
    }
}

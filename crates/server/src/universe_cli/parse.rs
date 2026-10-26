use super::*;
use uuid::Uuid;
const USAGE: &str =
    "use universe create|list|show|update, or universe config export|diff|apply --universe UUID";

pub fn parse(args: &[String], get: impl Fn(&str) -> Option<String>) -> Result<UniverseCli, String> {
    parse_for_mode(args, get, cfg!(feature = "universe-config-bridge"))
}
pub(super) fn parse_for_mode(
    args: &[String],
    get: impl Fn(&str) -> Option<String>,
    bridge: bool,
) -> Result<UniverseCli, String> {
    if args.get(1).map(String::as_str) != Some("universe") {
        return Err(USAGE.into());
    }
    let verb = args.get(2).ok_or(USAGE)?.as_str();
    let start = if verb == "config" { 4 } else { 3 };
    let action = if verb == "config" {
        args.get(3).ok_or(USAGE)?.as_str()
    } else {
        verb
    };
    let mut values = BTreeMap::new();
    let mut i = start;
    while i < args.len() {
        let key = &args[i];
        if !key.starts_with("--") || values.contains_key(key) {
            return Err(format!("unknown or duplicate option {key}"));
        }
        if key == "--acknowledge-bridge-rollout" {
            values.insert(key.clone(), "true".to_string());
            i += 1;
        } else {
            let value = args
                .get(i + 1)
                .filter(|v| !v.is_empty() && (key == "--name" || !v.starts_with("--")))
                .ok_or_else(|| format!("{key} requires a value"))?;
            values.insert(key.clone(), value.clone());
            i += 2;
        }
    }
    if verb == "create" {
        acknowledge(&mut values, bridge)?;
        let universe = values
            .remove("--universe")
            .map(|s| id(&s))
            .transpose()?
            .unwrap_or_else(|| Uuid::new_v4().into());
        let immutable = UniverseImmutable {
            speed: number(&mut values, "--speed", 5)? as i32,
            galaxies: number(&mut values, "--galaxies", 1)?,
            systems_per_galaxy: number(&mut values, "--systems-per-galaxy", 100)?,
            positions_per_system: number(&mut values, "--positions-per-system", 15)?,
        };
        let policy = UniversePolicy {
            signup_enabled: boolean(
                values
                    .remove("--signup-enabled")
                    .as_deref()
                    .unwrap_or("true"),
                "--signup-enabled",
            )?,
            max_players: values
                .remove("--max-players")
                .map(|s| integer(&s, "--max-players"))
                .transpose()?,
            signup_per_minute: number(&mut values, "--signup-per-minute", 5)?,
            commands_per_minute: number(&mut values, "--commands-per-minute", 60)?,
        };
        finish(values)?;
        let options = UniverseCreate {
            universe,
            immutable,
            policy,
        };
        options.validate()?;
        return Ok(UniverseCli::Create(options));
    }
    if verb == "list" {
        finish(values)?;
        return Ok(UniverseCli::List);
    }
    let universe = id(&values
        .remove("--universe")
        .ok_or("--universe is required")?)?;
    if verb == "update" {
        let name = values.remove("--name").ok_or("update requires --name")?;
        finish(values)?;
        let update = UniverseUpdate { universe, name };
        update.validate()?;
        return Ok(UniverseCli::Update(update));
    }
    if verb == "show" {
        finish(values)?;
        return Ok(UniverseCli::Show(universe));
    }
    if verb != "config" {
        return Err(USAGE.into());
    }
    if matches!(action, "import-env" | "initialize") && !bridge {
        return Err(format!(
            "{action} is available only in the universe-config-bridge build"
        ));
    }
    match action {
        "export" | "import-env" => {
            let out = values.remove("--out").ok_or("--out is required")?.into();
            finish(values)?;
            if action == "export" {
                return Ok(UniverseCli::Export { universe, out });
            }
            let mut sources = BTreeMap::new();
            let mut read = |env: &str, field: &str, default: &str| {
                let value = get(env);
                sources.insert(
                    field.into(),
                    if value.is_some() {
                        "environment".into()
                    } else {
                        "default".into()
                    },
                );
                value.unwrap_or_else(|| default.into())
            };
            let signup_enabled = boolean(
                &read("ORBIT_SIGNUP_ENABLED", "signup_enabled", "true"),
                "ORBIT_SIGNUP_ENABLED",
            )?;
            let max = read("ORBIT_MAX_PLAYERS", "max_players", "null");
            let max_players = if max == "null" && get("ORBIT_MAX_PLAYERS").is_none() {
                None
            } else {
                Some(integer(&max, "ORBIT_MAX_PLAYERS")?)
            };
            let signup_per_minute = integer(
                &read("ORBIT_SIGNUP_PER_MINUTE", "signup_per_minute", "5"),
                "ORBIT_SIGNUP_PER_MINUTE",
            )?;
            // The old command-limit parser accepted sign/leading zero formatting.
            let text = read("ORBIT_COMMANDS_PER_MINUTE", "commands_per_minute", "60");
            let commands_per_minute = text
                .parse::<u32>()
                .map_err(|_| "ORBIT_COMMANDS_PER_MINUTE must be an integer")?;
            let policy = UniversePolicy {
                signup_enabled,
                max_players,
                signup_per_minute,
                commands_per_minute,
            };
            // Topology-dependent capacity is validated against the saved universe at export.
            let bounds = UniverseImmutable {
                galaxies: 100,
                systems_per_galaxy: 1000,
                ..Default::default()
            };
            policy.validate(&bounds)?;
            Ok(UniverseCli::Import {
                universe,
                out,
                policy,
                sources,
            })
        }
        "diff" | "apply" | "initialize" => {
            if action == "initialize" {
                acknowledge(&mut values, true)?;
            }
            let file = values.remove("--file").ok_or("--file is required")?;
            finish(values)?;
            let bytes = std::fs::read(&file).map_err(|e| format!("cannot read {file}: {e}"))?;
            let document: UniverseConfigDocument = serde_json::from_slice(&bytes)
                .map_err(|e| format!("invalid universe document: {e}"))?;
            document.validate()?;
            if document.universe != universe {
                return Err("document universe must match --universe".into());
            }
            if action == "initialize" && document.base_revision != 0 {
                return Err("initialize requires base_revision=0".into());
            }
            Ok(match action {
                "diff" => UniverseCli::Diff(document),
                "apply" => UniverseCli::Apply(document),
                _ => UniverseCli::Initialize(document),
            })
        }
        _ => Err(USAGE.into()),
    }
}
fn acknowledge(values: &mut BTreeMap<String, String>, bridge: bool) -> Result<(), String> {
    if bridge && values.remove("--acknowledge-bridge-rollout").is_none() {
        return Err("--acknowledge-bridge-rollout is required after every pre-bridge process has been replaced".into());
    }
    Ok(())
}
pub(crate) fn finish(values: BTreeMap<String, String>) -> Result<(), String> {
    if let Some((key, _)) = values.first_key_value() {
        Err(format!("unknown option {key}"))
    } else {
        Ok(())
    }
}
pub(crate) fn id(s: &str) -> Result<UniverseId, String> {
    Uuid::parse_str(s)
        .ok()
        .filter(|v| !v.is_nil())
        .map(Into::into)
        .ok_or_else(|| "--universe must be a non-nil UUID".into())
}
pub(crate) fn integer(s: &str, key: &str) -> Result<u32, String> {
    let n = s
        .parse::<u32>()
        .map_err(|_| format!("{key} must be an unsigned integer"))?;
    if n.to_string() != s {
        return Err(format!("{key} must use canonical unsigned integer text"));
    }
    Ok(n)
}
fn number(values: &mut BTreeMap<String, String>, key: &str, default: u32) -> Result<u32, String> {
    values
        .remove(key)
        .map(|s| integer(&s, key))
        .transpose()
        .map(|v| v.unwrap_or(default))
}
pub(crate) fn boolean(s: &str, key: &str) -> Result<bool, String> {
    match s {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => Err(format!("{key} must be true or false")),
    }
}

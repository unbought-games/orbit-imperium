use crate::universe_cli::parse::{boolean, finish, id, integer};
use orbit_application::UniverseSetup;
use orbit_storage_postgres::PgStore;
use std::collections::BTreeMap;

pub const HELP: &str = "orbit setup [OPTIONS]
Apply database migrations and initialize the first universe. Requires DATABASE_URL.
Repeat safely: omitted options retain existing settings; explicit conflicts fail.
Prints JSON with status, universe UUID, name, and configuration.

  --name TEXT                 Universe name (default: automatic galaxy name)
  --speed INTEGER             Creation speed, 1–100 (default: 5)
  --universe UUID              Select identity; defaults to ORBIT_UNIVERSE_ID,
                              the sole existing universe, or a new UUID
  --galaxies INTEGER           Default: 1
  --systems-per-galaxy INTEGER Default: 100
  --positions-per-system 15    Exactly 15
  --signup-enabled true|false  Default: true
  --max-players INTEGER        Default: geometric capacity
  --signup-per-minute INTEGER  Default: 5
  --commands-per-minute INTEGER Default: 60

Use universe create for additional worlds, and universe update/config for edits.
Then run orbit serve. Restart existing workers after creating a universe.
Setup does not start the server, create the PostgreSQL database, or write credentials.";

pub fn parse(
    args: &[String],
    get: impl Fn(&str) -> Option<String>,
) -> Result<UniverseSetup, String> {
    if cfg!(feature = "universe-config-bridge") {
        return Err("setup requires the final release; use the acknowledged universe configuration bridge workflow for retained worlds".into());
    }
    let mut values = BTreeMap::new();
    let mut i = 2;
    while i < args.len() {
        let key = &args[i];
        if !key.starts_with("--") || values.contains_key(key) {
            return Err(format!(
                "unknown or duplicate option {key}; use setup --help"
            ));
        }
        let value = args
            .get(i + 1)
            .filter(|v| !v.is_empty() && (key == "--name" || !v.starts_with("--")))
            .ok_or_else(|| format!("{key} requires a value; use setup --help"))?;
        values.insert(key.clone(), value.clone());
        i += 2;
    }
    let explicit = values.remove("--universe").map(|v| id(&v)).transpose()?;
    let environment = get("ORBIT_UNIVERSE_ID").map(|v| id(&v)).transpose()?;
    if explicit.zip(environment).is_some_and(|(a, b)| a != b) {
        return Err("--universe conflicts with ORBIT_UNIVERSE_ID; select the same universe for setup and serve".into());
    }
    let mut number = |key| values.remove(key).map(|v| integer(&v, key)).transpose();
    let speed = number("--speed")?
        .map(|v| i32::try_from(v).map_err(|_| "--speed must be 1–100"))
        .transpose()?;
    let galaxies = number("--galaxies")?;
    let systems_per_galaxy = number("--systems-per-galaxy")?;
    let positions_per_system = number("--positions-per-system")?;
    let max_players = number("--max-players")?;
    let signup_per_minute = number("--signup-per-minute")?;
    let commands_per_minute = number("--commands-per-minute")?;
    let request = UniverseSetup {
        universe: explicit.or(environment),
        name: values.remove("--name"),
        speed,
        galaxies,
        systems_per_galaxy,
        positions_per_system,
        max_players,
        signup_per_minute,
        commands_per_minute,
        signup_enabled: values
            .remove("--signup-enabled")
            .map(|v| boolean(&v, "--signup-enabled"))
            .transpose()?,
    };
    finish(values)?;
    request.validate()?;
    Ok(request)
}

pub async fn run(store: &PgStore, request: UniverseSetup) -> Result<(), String> {
    store.migrate().await.map_err(|e| e.to_string())?;
    let mut guard = store
        .acquire_server_guard()
        .await
        .map_err(|e| e.to_string())?;
    tokio::select! {
        result = store.setup_universe(&request) => {
            let result = result?;
            println!("{}", serde_json::to_string_pretty(&result).map_err(|e| e.to_string())?);
            if result.status == "created" {
                eprintln!("Setup complete. Run orbit serve; restart any existing workers before routing signup traffic.");
            }
            Ok(())
        },
        result = guard.monitor() => result.map_err(|e| e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(words: &[&str]) -> Vec<String> {
        ["orbit", "setup"]
            .into_iter()
            .chain(words.iter().copied())
            .map(str::to_owned)
            .collect()
    }
    #[test]
    fn bridge_cannot_bypass_rollout_acknowledgement() {
        if cfg!(feature = "universe-config-bridge") {
            assert!(parse(&args(&[]), |_| None).unwrap_err().contains("bridge"));
        }
    }
    #[test]
    #[cfg(not(feature = "universe-config-bridge"))]
    fn setup_validates_options_and_preserves_omissions() {
        let request = parse(&args(&["--name", "Friends", "--speed", "3"]), |_| None).unwrap();
        assert_eq!(request.name.as_deref(), Some("Friends"));
        assert_eq!(request.speed, Some(3));
        assert!(request.universe.is_none());
        assert!(request.signup_enabled.is_none());
        for words in [
            vec!["--speed", "0"],
            vec!["--speed", "101"],
            vec!["--speed", "4294967295"],
            vec!["--speed", "3", "--speed", "3"],
            vec!["--speed"],
            vec!["--unknown", "x"],
            vec!["--universe", "00000000-0000-0000-0000-000000000000"],
            vec!["--name", " Friends"],
            vec!["--signup-enabled", "yes"],
            vec!["--max-players", "0"],
        ] {
            assert!(parse(&args(&words), |_| None).is_err(), "{words:?}");
        }
        let a = "00000000-0000-4000-8000-000000000001";
        let b = "00000000-0000-4000-8000-000000000002";
        assert_eq!(
            parse(&args(&[]), |_| Some(a.into())).unwrap().universe,
            Some(id(a).unwrap())
        );
        assert!(parse(&args(&["--universe", b]), |_| Some(a.into())).is_err());
    }
}

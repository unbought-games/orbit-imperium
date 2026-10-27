mod analytics;
mod audit_cli;
mod bots_cli;
mod config;
mod engine_executor;
#[cfg(feature = "test-support")]
mod lab_support;
mod metrics;
mod rules_cli;
mod runtime;
mod runtime_cli;
mod serving;
mod setup_cli;
mod universe_cli;
mod universe_serving;
#[cfg(feature = "test-support")]
use orbit_engine::parse_speed;
#[cfg(feature = "test-support")]
use orbit_engine::{MAX_WIRE_MS, UniverseId};
#[cfg(feature = "test-support")]
use orbit_storage_postgres::MvpAccount;
use orbit_storage_postgres::PgStore;
use std::{env, error::Error};
#[cfg(feature = "test-support")]
use uuid::Uuid;
fn main() -> Result<(), Box<dyn Error>> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let result = runtime.block_on(run_main());
    // Blocking engine jobs cannot be aborted. Durable fencing makes their late
    // results harmless; process exit must not wait indefinitely for their CPU.
    runtime.shutdown_timeout(std::time::Duration::from_secs(1));
    result
}
async fn run_main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() == 4 && args[1] == "rules" && args[2] == "upgrade" && args[3] == "--help" {
        println!("{}", rules_cli::UPGRADE_HELP);
        return Ok(());
    }
    if args.get(1).map(String::as_str) == Some("setup") && args.len() == 3 && args[2] == "--help" {
        println!("{}", setup_cli::HELP);
        return Ok(());
    }
    if args.get(1).map(String::as_str) == Some("bots")
        && args.get(2).map(String::as_str) == Some("--help")
    {
        println!("{}", bots_cli::HELP);
        return Ok(());
    }
    let selected = command(&args)?;
    let setup = (selected == "setup")
        .then(|| setup_cli::parse(&args, |key| env::var(key).ok()))
        .transpose()?;
    let universe_command = (selected == "universe")
        .then(|| universe_cli::parse(&args, |key| env::var(key).ok()))
        .transpose()?;
    // Validate serve configuration before opening a database connection.
    let serve_config = (selected == "serve")
        .then(|| config::ServeConfig::parse(|key| env::var(key).ok()))
        .transpose()?;
    let connection_started = std::time::Instant::now();
    let url = env::var("DATABASE_URL")?;
    let store = match serve_config.as_ref() {
        Some(config) => PgStore::connect_with_limits(&url, config.pools).await?,
        None => PgStore::connect(&url).await?,
    };
    eprintln!(
        "startup connection_ms={}",
        connection_started.elapsed().as_millis()
    );
    match selected {
        "bots" => bots_cli::run(&store, bots_cli::parse(&args)?).await?,
        "setup" => setup_cli::run(&store, setup.ok_or("missing setup options")?).await?,
        "universe" => {
            universe_cli::run(&store, universe_command.ok_or("missing universe command")?).await?
        }
        "runtime" => runtime_cli::run(&store, runtime_cli::parse(&args)?).await?,
        "audit" => audit_cli::run(&store, audit_cli::parse(&args)?).await?,
        "rules" => rules_cli::run_rules_cli(rules_cli::parse_rules_cli(&args)?, store).await?,
        "db-init" | "db-init-progression" | "db-init-fleets" | "db-init-raids" => {
            store.migrate().await?
        }
        #[cfg(feature = "test-support")]
        command @ ("mvp-bootstrap"
        | "mvp-progression-bootstrap"
        | "mvp-fleets-bootstrap"
        | "mvp-raids-bootstrap") => {
            // Validate optional creation knobs instead of silently ignoring conflicting settings.
            if let Ok(text) = env::var("ORBIT_SPEED")
                && parse_speed(&text)? != 10
            {
                return Err("MVP requires ORBIT_SPEED=10".into());
            }
            for (key, expected) in [
                ("ORBIT_GALAXIES", "1"),
                ("ORBIT_SYSTEMS_PER_GALAXY", "5"),
                ("ORBIT_POSITIONS_PER_SYSTEM", "15"),
            ] {
                if env::var(key).is_ok_and(|v| v != expected) {
                    return Err(format!("MVP requires {key}={expected}").into());
                }
            }
            let (universe, at) = creation(&args)?;
            let file = env::var("ORBIT_MVP_ACCOUNTS_FILE")?;
            let accounts: [MvpAccount; 5] = serde_json::from_slice(&std::fs::read(file)?)
                .map_err(|_| "accounts file must contain exactly five {name,password} objects")?;
            let seed: [u8; 32] = std::fs::read(env::var("ORBIT_MVP_SEED_FILE")?)?
                .try_into()
                .map_err(|_| "seed file must contain exactly 32 bytes")?;
            MvpAccount::validate_all(&accounts).map_err(
                |_| "accounts require five unique valid names and passwords of 12–1024 bytes",
            )?;
            store.migrate().await?;
            match command {
                "mvp-raids-bootstrap" => store.bootstrap_mvp_raids(universe, at, &accounts, &seed).await,
                "mvp-fleets-bootstrap" => store.bootstrap_mvp_fleets(universe, at, &accounts, &seed).await,
                "mvp-progression-bootstrap" => store.bootstrap_mvp_progression(universe, at, &accounts, &seed).await,
                _ => store.bootstrap_mvp(universe, at, &accounts, &seed).await,
            }.map_err(|_| "MVP bootstrap refused: check existing universe/seed/profile and stopped servers for fresh creation")?;
            println!(
                "MVP universe {universe}: bootstrap complete (existing matching world retained)"
            );
        }
        #[cfg(feature = "test-support")]
        command @ ("dev-seed" | "dev-reset") => {
            let (universe, at) = creation(&args)?;
            let file = env::var("ORBIT_SEED_PASSWORD_FILE")?;
            let text = std::fs::read_to_string(file)?;
            let passwords: Vec<_> = text.lines().map(str::to_owned).collect();
            let passwords: [String; 2] = passwords
                .try_into()
                .map_err(|_| "password file must contain two lines")?;
            let speed = parse_speed(&env::var("ORBIT_SPEED").unwrap_or_else(|_| "1".into()))?;
            if passwords.iter().any(|p| p.len() < 12) {
                return Err("seed passwords must be at least 12 bytes".into());
            }
            store.migrate().await?;
            if command == "dev-reset" {
                store.reset(universe, at, speed, &passwords).await?
            } else {
                store.seed(universe, at, speed, &passwords).await?
            }
        }
        "serve" => {
            serving::serve(store, serve_config.ok_or("missing serve configuration")?).await?
        }
        _ => {
            return Err(
                "commands: serve, db-init, db-init-progression, db-init-fleets (seed commands require a test-support build)".into(),
            );
        }
    }
    Ok(())
}
fn command(args: &[String]) -> Result<&str, Box<dyn Error>> {
    let name = args.get(1).map(String::as_str).unwrap_or("serve");
    match name {
        "bots" => { bots_cli::parse(args)?; Ok(name) },
        "universe" | "setup" => Ok(name),
        "runtime" => { runtime_cli::parse(args)?; Ok(name) },
        "rules" => { rules_cli::parse_rules_cli(args)?; Ok(name) },
        "audit" => { audit_cli::parse(args)?; Ok(name) },
        "serve" | "db-init" | "db-init-progression" | "db-init-fleets" | "db-init-raids" if args.len() <= 2 => Ok(name),
        "dev-seed" | "dev-reset" | "mvp-bootstrap" | "mvp-progression-bootstrap" | "mvp-fleets-bootstrap" | "mvp-raids-bootstrap"
            if cfg!(feature = "test-support") && args.len() == 6 && matches!((args[2].as_str(), args[4].as_str()), ("--universe", "--at") | ("--at", "--universe")) => Ok(name),
        _ => Err("invalid command/options: use setup --help, serve, db-init, or a seed/bootstrap command with exactly --universe UUID and --at MILLISECONDS".into()),
    }
}

#[cfg(feature = "test-support")]
fn creation(args: &[String]) -> Result<(UniverseId, i64), Box<dyn Error>> {
    let option = |name: &str| {
        args.windows(2)
            .find(|a| a[0] == name)
            .map(|a| a[1].as_str())
            .ok_or("missing creation option")
    };
    let universe = Uuid::parse_str(option("--universe")?)?;
    let at = option("--at")?.parse()?;
    if universe.is_nil() || !(0..=MAX_WIRE_MS).contains(&at) {
        return Err(
            "creation requires a non-nil universe UUID and supported nonnegative Unix milliseconds"
                .into(),
        );
    }
    Ok((universe.into(), at))
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("signal handler");
        tokio::select! {_=tokio::signal::ctrl_c()=>{},_=terminate.recv()=>{}}
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

#[cfg(all(test, feature = "test-support"))]
mod command_tests {
    use super::*;
    fn args(words: &[&str]) -> Vec<String> {
        words.iter().map(|s| (*s).into()).collect()
    }

    #[test]
    fn creation_options_are_exact_and_accept_either_order() {
        let id = "00000000-0000-4000-8000-000000000001";
        for words in [
            vec!["orbit", "dev-seed", "--at", "0", "--universe", id],
            vec![
                "orbit",
                "mvp-raids-bootstrap",
                "--universe",
                id,
                "--at",
                "0",
            ],
        ] {
            let values = args(&words);
            assert!(command(&values).is_ok());
            assert_eq!(creation(&values).unwrap().1, 0);
        }
        for words in [
            vec!["orbit", "serve", "--unknown"],
            vec!["orbit", "dev-seed", "--at", "0", "--at", "1"],
            vec!["orbit", "db-init", "--universe", id],
        ] {
            assert!(command(&args(&words)).is_err());
        }
        let values = args(&["orbit", "dev-seed", "--universe", id, "--at", "-1"]);
        assert!(creation(&values).is_err());
    }
}

#[cfg(test)]
mod rules_command_tests {
    use super::*;
    #[test]
    fn rules_commands_accept_exact_operator_forms() {
        for (action, flag) in [("export", "--out"), ("diff", "--file"), ("apply", "--file")] {
            let args: Vec<String> = [
                "orbit",
                "rules",
                action,
                "--universe",
                "00000000-0000-4000-8000-000000000001",
                flag,
                "rules.json",
            ]
            .into_iter()
            .map(str::to_owned)
            .collect();
            assert_eq!(command(&args).unwrap(), "rules");
        }
    }
}

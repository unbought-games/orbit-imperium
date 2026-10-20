//! Explicit bridge rollout controls; no implicit activation during serving startup.
use orbit_application::{ExecutorMode, GameStore, StoreError};
use orbit_engine::UniverseId;
use orbit_storage_postgres::PgStore;
use uuid::Uuid;

#[derive(Debug, PartialEq, Eq)]
pub struct RuntimeCli {
    pub universe: UniverseId,
    pub activate: bool,
}
pub fn parse(args: &[String]) -> Result<RuntimeCli, &'static str> {
    let usage = "use runtime prepare|activate --universe UUID; deploy the mode-aware bridge to every replica before activation";
    if args.len() != 5
        || args[1] != "runtime"
        || args[3] != "--universe"
        || !matches!(args[2].as_str(), "prepare" | "activate")
    {
        return Err(usage);
    }
    let universe = Uuid::parse_str(&args[4])
        .ok()
        .filter(|u| !u.is_nil())
        .ok_or(usage)?;
    Ok(RuntimeCli {
        universe: universe.into(),
        activate: args[2] == "activate",
    })
}
pub async fn run(store: &PgStore, command: RuntimeCli) -> Result<(), StoreError> {
    let mut guard = store.acquire_server_guard().await?;
    store.ready().await?;
    tokio::select! {
        result = execute(store, command) => result,
        result = guard.monitor() => result,
    }
}
async fn execute(store: &PgStore, command: RuntimeCli) -> Result<(), StoreError> {
    if command.activate {
        eprintln!(
            "waiting for complete preparation and the current serial attempt; all replicas must already support scoped execution"
        );
        loop {
            match store.activate_scoped_runtime(command.universe).await {
                Ok(result) => {
                    println!(
                        "{}",
                        serde_json::to_string(&result).expect("runtime status")
                    );
                    return Ok(());
                }
                Err(StoreError::Conflict) => {
                    if store.runtime_mode(command.universe).await?.mode == ExecutorMode::Serial {
                        return Err(StoreError::Conflict);
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
                Err(error) => return Err(error),
            }
        }
    }
    let result = store.prepare_scoped_runtime(command.universe, 256).await?;
    println!(
        "{}",
        serde_json::to_string(&result).expect("runtime status")
    );
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requires_exact_action_and_non_nil_universe() {
        let args = |words: &[&str]| words.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let id = "00000000-0000-4000-8000-000000000001";
        for action in ["prepare", "activate"] {
            assert_eq!(
                parse(&args(&["server", "runtime", action, "--universe", id]))
                    .unwrap()
                    .activate,
                action == "activate"
            );
        }
        for words in [
            vec!["server", "runtime"],
            vec!["server", "runtime", "activate", "--universe", "bad"],
            vec!["server", "runtime", "force", "--universe", id],
            vec!["server", "runtime", "prepare", "--universe", id, "--force"],
        ] {
            assert!(parse(&args(&words)).is_err());
        }
    }
}

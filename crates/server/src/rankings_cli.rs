use orbit_application::{GameStore, StoreError, UniverseId};
use orbit_storage_postgres::PgStore;
use uuid::Uuid;

pub const HELP: &str =
    "orbit rankings backfill --universe UUID\norbit rankings snapshot --universe UUID";

#[derive(Debug, PartialEq, Eq)]
pub enum Command {
    Backfill(UniverseId),
    Snapshot(UniverseId),
}

pub fn parse(args: &[String]) -> Result<Command, &'static str> {
    let [action, flag, id] = args else {
        return Err(HELP);
    };
    if flag != "--universe" {
        return Err(HELP);
    }
    let universe = Uuid::parse_str(id)
        .ok()
        .filter(|id| !id.is_nil())
        .map(UniverseId)
        .ok_or(HELP)?;
    match action.as_str() {
        "backfill" => Ok(Command::Backfill(universe)),
        "snapshot" => Ok(Command::Snapshot(universe)),
        _ => Err(HELP),
    }
}

pub async fn run(store: &PgStore, command: Command) -> Result<(), StoreError> {
    let mut guard = store.acquire_server_guard().await?;
    store.ready().await?;
    tokio::select! {
        result = execute(store, command) => result,
        result = guard.monitor() => result,
    }
}

async fn execute(store: &PgStore, command: Command) -> Result<(), StoreError> {
    match command {
        Command::Backfill(universe) => {
            let mut examined = 0;
            loop {
                let count = store.backfill_ranking_scores(universe, 32).await?;
                if count == 0 {
                    break;
                }
                examined += count;
                println!(
                    "Universe {universe}: examined {examined} missing player scores in this run"
                );
            }
            println!("Universe {universe}: score backfill complete ({examined} examined)");
        }
        Command::Snapshot(universe) => {
            let captured = store.capture_ranking_snapshot(universe).await?;
            let outcome = if captured {
                "captured"
            } else {
                "already captured"
            };
            println!("Universe {universe}: today's UTC ranking snapshot {outcome}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commands_require_one_explicit_universe_and_use_the_current_day() {
        let id = "00000000-0000-4000-8000-000000000001";
        let universe = UniverseId(Uuid::parse_str(id).unwrap());
        let parse_words =
            |words: &[&str]| parse(&words.iter().map(|w| w.to_string()).collect::<Vec<_>>());
        assert_eq!(
            parse_words(&["backfill", "--universe", id]),
            Ok(Command::Backfill(universe))
        );
        assert_eq!(
            parse_words(&["snapshot", "--universe", id]),
            Ok(Command::Snapshot(universe))
        );
        for words in [
            vec!["backfill"],
            vec![
                "snapshot",
                "--universe",
                "00000000-0000-0000-0000-000000000000",
            ],
            vec!["snapshot", "--universe", id, "--day", "yesterday"],
            vec!["replace", "--universe", id],
        ] {
            assert!(parse_words(&words).is_err());
        }
    }
}

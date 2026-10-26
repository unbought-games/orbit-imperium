use super::{RulesCli, apply_with_retry};
use crate::universe_cli::parse::id;
use orbit_application::{RulesService, RulesUpdateError};
use orbit_engine::{STANDARD_RULES_RELEASE, StandardRulesError, UniverseId};
use orbit_storage_postgres::PgStore;
use serde_json::{Value, json};

pub const HELP: &str = "orbit rules upgrade [--universe UUID] [--dry-run]
Activate the standard content bundled in this binary. Requires DATABASE_URL.
Deploy this image to every API, worker and operator process before activation.

  --dry-run         Read and validate the proposal; print its diff without writes
  --universe UUID   Select an existing universe; otherwise use ORBIT_UNIVERSE_ID
                    or the sole existing universe

No scripts, downloads, input files, or interactive prompts are required.
Custom values in owned content cause a conflict; unrelated settings are retained.
Prints JSON. Applied/AlreadyActive succeed; pending, busy, stale or conflicts fail.
A pending activation stays queued: rerun this command to observe completion.
Use rules export/diff/apply for deliberate custom changes.";

pub(super) fn parse(args: &[String]) -> Result<RulesCli, String> {
    let mut universe = None;
    let mut dry_run = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--dry-run" if !dry_run => {
                dry_run = true;
                i += 1;
            }
            "--universe" if universe.is_none() => {
                universe = Some(id(args.get(i + 1).ok_or("--universe requires a UUID")?)?);
                i += 2;
            }
            option => {
                return Err(format!(
                    "unknown or duplicate option {option}; use rules upgrade --help"
                ));
            }
        }
    }
    Ok(RulesCli::Upgrade { universe, dry_run })
}

fn selection(
    ids: &[UniverseId],
    requested: Option<UniverseId>,
    environment: Option<&str>,
) -> Result<UniverseId, String> {
    let environment = environment.map(id).transpose()?;
    if requested.zip(environment).is_some_and(|(a, b)| a != b) {
        return Err("--universe conflicts with ORBIT_UNIVERSE_ID".into());
    }
    match requested.or(environment) {
        Some(id) if ids.contains(&id) => Ok(id),
        Some(_) => Err("selected universe does not exist; use orbit universe list".into()),
        None => match ids {
            [id] => Ok(*id),
            [] => Err("no universes exist; run orbit setup first".into()),
            _ => {
                Err("multiple universes exist; specify --universe UUID or ORBIT_UNIVERSE_ID".into())
            }
        },
    }
}
fn print(value: Value) -> Result<(), String> {
    println!(
        "{}",
        serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?
    );
    Ok(())
}
fn report_error(universe: UniverseId, error: RulesUpdateError) -> Result<(), String> {
    let outcome = match &error {
        RulesUpdateError::StandardContent(StandardRulesError::Conflicts(conflicts)) => {
            json!({"status":"Conflict","conflicts":conflicts})
        }
        RulesUpdateError::Pending { id } => json!({"status":"Pending","activation_id":id}),
        RulesUpdateError::Busy => json!({"status":"Busy"}),
        RulesUpdateError::Stale {
            expected_revision,
            actual_revision,
        } => {
            json!({"status":"Stale","expected_revision":expected_revision,"actual_revision":actual_revision})
        }
        _ => json!({"status":"Rejected","reason":error.to_string()}),
    };
    print(json!({"universe":universe,"release":STANDARD_RULES_RELEASE,"outcome":outcome}))?;
    match error {
        RulesUpdateError::Pending { id } => Err(format!("activation {id} remains queued; rerun orbit rules upgrade --universe {universe} to observe completion")),
        RulesUpdateError::Stale { .. } => Err("rules changed while preparing the upgrade; inspect the latest rules and rerun the command".into()),
        RulesUpdateError::Busy => Err("upgrade not confirmed: earlier work or a different activation is pending; let workers process it and retry".into()),
        error => Err(error.to_string()),
    }
}

pub(super) async fn run(
    store: PgStore,
    requested: Option<UniverseId>,
    dry_run: bool,
) -> Result<(), String> {
    store.check_universe_config_schema().await?;
    let ids = store.universes().await.map_err(|e| e.to_string())?;
    let universe = selection(
        &ids,
        requested,
        std::env::var("ORBIT_UNIVERSE_ID").ok().as_deref(),
    )?;
    let mut guard = store
        .acquire_server_guard()
        .await
        .map_err(|e| e.to_string())?;
    tokio::select! {
        result = execute(store, universe, dry_run) => result,
        result = guard.monitor() => result.map_err(|e| e.to_string()),
    }
}

async fn execute(store: PgStore, universe: UniverseId, dry_run: bool) -> Result<(), String> {
    let service = RulesService::new(store);
    let plan = match service.prepare_upgrade(universe).await {
        Ok(plan) => plan,
        Err(error) => return report_error(universe, error),
    };
    if dry_run {
        return print(json!({
            "universe":universe,"release":plan.release,"base_revision":plan.document.base_revision,
            "status":if plan.diff.changes.is_empty() {"UpToDate"} else {"Ready"},"diff":plan.diff,
        }));
    }
    match apply_with_retry(&service, &plan.document).await {
        Ok(outcome) => print(json!({"universe":universe,"release":plan.release,"outcome":outcome})),
        Err(error) => report_error(universe, error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn options_are_exact_and_selection_never_guesses_among_worlds() {
        let a = id("00000000-0000-4000-8000-000000000001").unwrap();
        let b = id("00000000-0000-4000-8000-000000000002").unwrap();
        for words in [
            vec![],
            vec!["--dry-run"],
            vec![
                "--universe",
                "00000000-0000-4000-8000-000000000001",
                "--dry-run",
            ],
        ] {
            assert!(parse(&words.into_iter().map(str::to_owned).collect::<Vec<_>>()).is_ok());
        }
        for words in [
            vec!["--dry-run", "--dry-run"],
            vec!["--universe"],
            vec!["--out", "file.json"],
            vec!["--to", "0.4.0"],
            vec!["--universe", "00000000-0000-0000-0000-000000000000"],
        ] {
            assert!(parse(&words.into_iter().map(str::to_owned).collect::<Vec<_>>()).is_err());
        }
        assert_eq!(selection(&[a], None, None).unwrap(), a);
        assert_eq!(selection(&[a, b], Some(b), None).unwrap(), b);
        assert_eq!(selection(&[a, b], None, Some(&a.to_string())).unwrap(), a);
        assert!(selection(&[a, b], None, None).is_err());
        assert!(selection(&[], None, None).is_err());
        assert!(selection(&[a], Some(b), None).is_err());
        assert!(selection(&[a, b], Some(a), Some(&b.to_string())).is_err());
        assert!(selection(&[a], None, Some("bad")).is_err());
    }
}

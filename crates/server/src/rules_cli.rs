//! File-based operator interface; activation logic lives in application/storage.
use orbit_application::{
    RulesApplyOutcome, RulesDocument, RulesService, RulesStore, RulesUpdateError,
};
use orbit_engine::UniverseId;
use orbit_storage_postgres::PgStore;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    time::Duration,
};
use uuid::Uuid;
mod upgrade;
pub use upgrade::HELP as UPGRADE_HELP;

#[derive(Debug, PartialEq, Eq)]
pub enum RulesCli {
    Upgrade {
        universe: Option<UniverseId>,
        dry_run: bool,
    },
    Export {
        universe: UniverseId,
        out: PathBuf,
    },
    Diff {
        universe: UniverseId,
        file: PathBuf,
    },
    Apply {
        universe: UniverseId,
        file: PathBuf,
    },
}
pub fn parse_rules_cli(args: &[String]) -> Result<RulesCli, String> {
    if args.get(1).map(String::as_str) == Some("rules")
        && args.get(2).map(String::as_str) == Some("upgrade")
    {
        return upgrade::parse(&args[3..]);
    }
    let usage = "use rules export --universe UUID --out FILE, or rules diff|apply --universe UUID --file FILE";
    if args.len() != 7 || args[1] != "rules" {
        return Err(usage.into());
    }
    let mut options = BTreeMap::new();
    for pair in args[3..].as_chunks::<2>().0 {
        if pair[1].is_empty() || options.insert(pair[0].as_str(), pair[1].as_str()).is_some() {
            return Err(usage.into());
        }
    }
    let universe = UniverseId(
        Uuid::parse_str(options.remove("--universe").ok_or(usage)?)
            .map_err(|_| "invalid universe UUID")?,
    );
    if universe.0.is_nil() {
        return Err("universe UUID must not be nil".into());
    }
    let path = options
        .remove(if args[2] == "export" {
            "--out"
        } else {
            "--file"
        })
        .ok_or(usage)?;
    if !options.is_empty() {
        return Err(usage.into());
    }
    match args[2].as_str() {
        "export" => Ok(RulesCli::Export {
            universe,
            out: path.into(),
        }),
        "diff" => Ok(RulesCli::Diff {
            universe,
            file: path.into(),
        }),
        "apply" => Ok(RulesCli::Apply {
            universe,
            file: path.into(),
        }),
        _ => Err(usage.into()),
    }
}
fn document(file: &Path, universe: UniverseId) -> Result<RulesDocument, String> {
    let bytes = std::fs::read(file).map_err(|e| format!("cannot read {}: {e}", file.display()))?;
    let doc: RulesDocument =
        serde_json::from_slice(&bytes).map_err(|e| format!("invalid rules document: {e}"))?;
    if doc.universe != universe {
        return Err("document universe does not match --universe".into());
    }
    Ok(doc)
}
async fn apply_with_retry<S: RulesStore>(
    service: &RulesService<S>,
    doc: &RulesDocument,
) -> Result<RulesApplyOutcome, RulesUpdateError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    loop {
        match service.apply(doc).await {
            Err(RulesUpdateError::Busy | RulesUpdateError::Pending { .. })
                if tokio::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(250)).await
            }
            result => return result,
        }
    }
}
pub async fn run_rules_cli(command: RulesCli, store: PgStore) -> Result<(), String> {
    if let RulesCli::Upgrade { universe, dry_run } = command {
        return upgrade::run(store, universe, dry_run).await;
    }
    let service = RulesService::new(store);
    match command {
        RulesCli::Upgrade { .. } => unreachable!("handled before file-based commands"),
        RulesCli::Export { universe, out } => {
            let doc = service.export(universe).await.map_err(|e| e.to_string())?;
            let mut bytes = serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?;
            bytes.push(b'\n');
            std::fs::write(&out, bytes)
                .map_err(|e| format!("cannot write {}: {e}", out.display()))?;
            println!(
                "Exported universe {universe} rules revision {} to {}",
                doc.base_revision,
                out.display()
            );
        }
        RulesCli::Diff { universe, file } => {
            let diff = service
                .diff(&document(&file, universe)?)
                .await
                .map_err(|e| e.to_string())?;
            println!(
                "{}",
                serde_json::to_string_pretty(&diff).map_err(|e| e.to_string())?
            );
        }
        RulesCli::Apply { universe, file } => {
            let result=apply_with_retry(&service,&document(&file,universe)?).await.map_err(|e|match e {
                RulesUpdateError::Busy=>"No update applied: universe remained busy for 30 seconds; allow the running scheduler to catch up and retry".into(),
                e=>e.to_string(),
            })?;
            println!(
                "{}",
                serde_json::to_string_pretty(&result).map_err(|e| e.to_string())?
            );
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use orbit_application::ActiveRules;
    use orbit_engine::Ruleset;
    fn args(words: &[&str]) -> Vec<String> {
        words.iter().map(|x| (*x).into()).collect()
    }
    #[test]
    fn malformed_operator_options_are_rejected() {
        for words in [
            vec![
                "orbit",
                "rules",
                "apply",
                "--universe",
                "bad",
                "--file",
                "x",
            ],
            vec![
                "orbit",
                "rules",
                "apply",
                "--universe",
                "00000000-0000-4000-8000-000000000001",
                "--out",
                "x",
            ],
            vec!["orbit", "rules", "apply", "--file", "x", "--file", "y"],
            vec!["orbit", "rules", "apply"],
        ] {
            assert!(parse_rules_cli(&args(&words)).is_err());
        }
    }
    #[test]
    fn file_bound_to_another_universe_is_rejected() {
        let path = std::env::temp_dir().join(format!("rules-{}.json", Uuid::new_v4()));
        let r = Ruleset::mvp_raids().unwrap();
        let doc = RulesDocument {
            universe: UniverseId(Uuid::new_v4()),
            base_revision: 0,
            artifact: r.artifact.clone(),
            speed: 10,
        };
        std::fs::write(&path, serde_json::to_vec(&doc).unwrap()).unwrap();
        let result = document(&path, UniverseId(Uuid::new_v4()));
        std::fs::remove_file(path).unwrap();
        assert!(result.unwrap_err().contains("does not match"));
    }
    struct Busy;
    impl RulesStore for Busy {
        async fn current_rules(&self, _: UniverseId) -> Result<ActiveRules, RulesUpdateError> {
            Ok(ActiveRules {
                rules: Ruleset::mvp_raids().unwrap(),
                revision: 0,
            })
        }
        async fn apply_rules(
            &self,
            _: UniverseId,
            _: i64,
            _: &Ruleset,
        ) -> Result<RulesApplyOutcome, RulesUpdateError> {
            Err(RulesUpdateError::Busy)
        }
    }
    #[tokio::test(start_paused = true)]
    async fn persistent_busy_is_bounded_without_real_sleep() {
        let r = Ruleset::mvp_raids().unwrap();
        let doc = RulesDocument {
            universe: UniverseId(Uuid::new_v4()),
            base_revision: 0,
            artifact: r.artifact.clone(),
            speed: 10,
        };
        let start = tokio::time::Instant::now();
        assert!(matches!(
            apply_with_retry(&RulesService::new(Busy), &doc).await,
            Err(RulesUpdateError::Busy)
        ));
        assert_eq!(tokio::time::Instant::now() - start, Duration::from_secs(30));
    }
}

//! Operator input/output; validation and atomic changes belong to application/storage.
use orbit_application::*;
use orbit_storage_postgres::PgStore;
use std::{collections::BTreeMap, path::PathBuf};
mod parse;
pub use parse::parse;
#[cfg(test)]
use parse::parse_for_mode;
#[cfg(test)]
mod tests;

#[derive(Debug)]
pub enum UniverseCli {
    Create(UniverseCreate),
    List,
    Show(UniverseId),
    Export {
        universe: UniverseId,
        out: PathBuf,
    },
    Diff(UniverseConfigDocument),
    Apply(UniverseConfigDocument),
    Import {
        universe: UniverseId,
        out: PathBuf,
        policy: UniversePolicy,
        sources: BTreeMap<String, String>,
    },
    Initialize(UniverseConfigDocument),
}
fn print(value: impl serde::Serialize) -> Result<(), String> {
    println!(
        "{}",
        serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?
    );
    Ok(())
}
fn write(path: &std::path::Path, document: &UniverseConfigDocument) -> Result<(), String> {
    let mut bytes = serde_json::to_vec_pretty(document).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    std::fs::write(path, bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))
}
async fn summary(store: &PgStore, universe: UniverseId) -> Result<serde_json::Value, String> {
    let rules = store
        .current_rules(universe)
        .await
        .map_err(|e| e.to_string())?;
    if !store
        .has_universe_policy(universe)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(serde_json::json!({
            "universe":universe, "policy_status":"uninitialized",
            "immutable":store.universe_immutable(universe).await?,
            "rules_hash":rules.rules.hash, "rules_revision":rules.revision,
        }));
    }
    let config = store.universe_config(universe).await?;
    Ok(
        serde_json::json!({"universe":universe,"policy_status":"active",
        "configuration":config,"rules_hash":rules.rules.hash,
        "rules_revision":rules.revision,"effective_max_players":config.policy.effective_max_players(&config.immutable)}),
    )
}

pub async fn run(store: &PgStore, command: UniverseCli) -> Result<(), String> {
    let mut guard = store
        .acquire_server_guard()
        .await
        .map_err(|e| e.to_string())?;
    store.check_universe_config_schema().await.map_err(|e|
        format!("universe command refused: {e}; initialize an empty database with db-init, or inspect retained schema/profile compatibility"))?;
    tokio::select! {
        result = tokio::time::timeout(std::time::Duration::from_secs(30), execute(store, command)) =>
            result.map_err(|_| "universe command exceeded 30 seconds; inspect the selected universe before retrying".to_string())?,
        result = guard.monitor() => result.map_err(|e| e.to_string()),
    }
}
async fn execute(store: &PgStore, command: UniverseCli) -> Result<(), String> {
    match command {
        UniverseCli::Create(options) => {
            let config = store.create_universe(&options).await?;
            print(
                serde_json::json!({"status":"created","universe":config.universe,"configuration":config}),
            )?;
            eprintln!("Restart workers before routing signup traffic to the new universe.");
        }
        UniverseCli::List => {
            let mut values = Vec::new();
            for universe in store.universes().await.map_err(|e| e.to_string())? {
                values.push(summary(store, universe).await?);
            }
            print(values)?;
        }
        UniverseCli::Show(universe) => print(summary(store, universe).await?)?,
        UniverseCli::Export { universe, out } => {
            write(&out, &store.universe_config(universe).await?)?;
            print(serde_json::json!({"status":"exported","universe":universe,"file":out}))?;
        }
        UniverseCli::Diff(document) => {
            let current = store.universe_config(document.universe).await?;
            print(config_diff(&current, &document)?)?;
        }
        UniverseCli::Apply(document) => {
            let outcome = store.apply_universe_config(&document).await?;
            print(
                serde_json::json!({"status":if outcome.changed {"applied"} else {"already_active"},"configuration":outcome.document}),
            )?;
        }
        UniverseCli::Initialize(document) => {
            let outcome = store.initialize_universe_config(&document).await?;
            print(
                serde_json::json!({"status":if outcome.changed {"initialized"} else {"already_initialized"},"configuration":outcome.document}),
            )?;
        }
        UniverseCli::Import {
            universe,
            out,
            policy,
            sources,
        } => {
            let document = UniverseConfigDocument {
                version: UNIVERSE_CONFIG_VERSION,
                universe,
                base_revision: 0,
                immutable: store.universe_immutable(universe).await?,
                policy,
            };
            document.validate()?;
            write(&out, &document)?;
            print(
                serde_json::json!({"status":"review_required","universe":universe,"file":out,"sources":sources,
                "note":"Values reflect this process environment; verify them against every deployed replica before initialization."}),
            )?;
        }
    }
    Ok(())
}

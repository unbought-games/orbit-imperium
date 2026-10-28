use orbit_application::{ScenarioMode, UniverseId, WorldScenario};
use orbit_engine::world_edit::WorldEdit;
use orbit_storage_postgres::PgStore;
use std::{collections::BTreeMap, path::PathBuf};
use uuid::Uuid;
#[cfg(test)]
mod tests;
pub const HELP: &str = r#"orbit world COMMAND [--universe UUID] [--operation-id UUID]
Direct database world management. Uses DATABASE_URL; normal production builds supported.

  show [G:S:P] [--user USER]
  set|give resources|ships|defenses|building G:S:P ITEM=VALUE... [--user USER]
  set|give research USER ITEM=LEVEL...
  set ships|building|resources --user USER --all-planets ITEM=VALUE...
  set player USER [--activity active|inactive7|inactive28] [--vacation true|false]
  add player --user USER --password PASSWORD [--planet G:S:P]
  add planet --owner USER [--planet G:S:P] [--name TEXT]
  add bot --name USER [--planet G:S:P] [--near G:S:P] [--preset weak|strong]
  attack|spy|transport G:S:P --from G:S:P [SHIP=COUNT...] [--arrives-in 30s]
  queue G:S:P building|research|ships|defenses ITEM=VALUE [--arrives-in 30s]
  finish|clear queues G:S:P [--user USER]
  message USER --from USER --text TEXT
  report USER [--kind transport|espionage|combat] [RESOURCE=VALUE...]
  debris G:S:P metal=VALUE crystal=VALUE
  scenario apply FILE                  Apply an atomic JSON edit batch
  scenario load NAME_OR_FILE [--replace] Create or explicitly replace a world
  scenario save NAME_OR_FILE            Export an editable recipe (no credentials)

Planets use coordinates only; players use usernames. Catalog names are case-insensitive.
Set assigns absolute values; give adds. Output is JSON. --help never opens a database.
Scenarios without a path resolve inside scenarios/. Use --operation-id to retry an action.
"#;
#[derive(Debug)]
pub struct WorldCliCommand {
    pub universe: Option<UniverseId>,
    pub operation: Uuid,
    pub action: Action,
}
#[derive(Debug)]
pub enum Action {
    Help,
    Show {
        user: Option<String>,
        planet: Option<String>,
    },
    Apply {
        document: Box<WorldScenario>,
        mode: ScenarioMode,
    },
    Save(PathBuf),
}
fn path(name: &str) -> PathBuf {
    let p = PathBuf::from(name);
    if p.extension().is_some() || p.components().count() > 1 {
        p
    } else {
        PathBuf::from("scenarios").join(format!("{name}.json"))
    }
}
pub fn parse(args: &[String]) -> Result<WorldCliCommand, String> {
    let mut words = Vec::new();
    let mut flags = BTreeMap::new();
    let mut j = 0;
    while j < args.len() {
        let a = &args[j];
        if let Some(flag) = a.strip_prefix("--") {
            let flag = flag.to_ascii_lowercase();
            let value = if matches!(flag.as_str(), "help" | "json" | "replace" | "all-planets") {
                String::from("true")
            } else {
                j += 1;
                args.get(j)
                    .filter(|v| !v.starts_with("--"))
                    .ok_or_else(|| format!("--{flag} requires a value"))?
                    .clone()
            };
            if flags.insert(flag.clone(), value).is_some() {
                return Err(format!("duplicate --{flag}"));
            }
        } else {
            words.push(a.clone())
        }
        j += 1;
    }
    let help = flags.remove("help").is_some();
    flags.remove("json");
    let universe = flags
        .remove("universe")
        .map(|v| {
            Uuid::parse_str(&v)
                .map(UniverseId)
                .map_err(|_| "--universe must be UUID".to_string())
        })
        .transpose()?;
    let operation = flags
        .remove("operation-id")
        .map(|v| Uuid::parse_str(&v).map_err(|_| "--operation-id must be UUID".to_string()))
        .transpose()?
        .unwrap_or_else(Uuid::new_v4);
    if help || words.is_empty() {
        return Ok(WorldCliCommand {
            universe,
            operation,
            action: Action::Help,
        });
    }
    let verb = words.remove(0).to_ascii_lowercase();
    let action = if verb == "show" {
        if words.len() > 1 {
            return Err("show accepts one planet".into());
        }
        Action::Show {
            user: flags.remove("user"),
            planet: words.pop(),
        }
    } else if verb == "scenario" {
        if words.len() != 2 {
            return Err("scenario requires apply|load|save and NAME_OR_FILE".into());
        }
        let file = path(&words[1]);
        match words[0].to_ascii_lowercase().as_str() {
            "save" => Action::Save(file),
            "apply" | "load" => {
                let mode = if words[0].eq_ignore_ascii_case("apply") {
                    ScenarioMode::Patch
                } else if flags.remove("replace").is_some() {
                    ScenarioMode::Replace
                } else {
                    ScenarioMode::Create
                };
                let text = std::fs::read_to_string(&file)
                    .map_err(|e| format!("{}: {e}", file.display()))?;
                let mut document: WorldScenario =
                    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", file.display()))?;
                if let Some(file) = flags.remove("credentials") {
                    let text =
                        std::fs::read_to_string(&file).map_err(|e| format!("{file}: {e}"))?;
                    let credentials: BTreeMap<String, String> =
                        serde_json::from_str(&text).map_err(|e| e.to_string())?;
                    for edit in &mut document.edits {
                        if edit.op.eq_ignore_ascii_case("add-player")
                            && let Some(user) = &edit.user
                            && let Some(password) = credentials.get(user)
                        {
                            edit.password = Some(password.clone());
                        }
                    }
                }
                Action::Apply {
                    document: Box::new(document),
                    mode,
                }
            }
            _ => return Err("unknown scenario command".into()),
        }
    } else {
        let mut e = WorldEdit {
            op: verb.clone(),
            user: flags.remove("user").or_else(|| flags.remove("owner")),
            planet: flags.remove("planet"),
            all_planets: flags.remove("all-planets").is_some(),
            name: flags.remove("name"),
            password: flags.remove("password"),
            preset: flags.remove("preset"),
            activity: flags.remove("activity"),
            vacation: flags
                .remove("vacation")
                .map(|v| match v.to_ascii_lowercase().as_str() {
                    "true" => Ok(true),
                    "false" => Ok(false),
                    _ => Err("vacation must be true or false"),
                })
                .transpose()?,
            from: flags.remove("from"),
            arrives_in: flags.remove("arrives-in"),
            first_in: flags.remove("first-in"),
            travel_time: flags.remove("travel-time"),
            text: flags.remove("text"),
            kind: flags.remove("kind"),
            ..Default::default()
        };
        let category = match verb.as_str() {
            "set" | "give" => {
                if words.is_empty() {
                    return Err("set/give requires a category".into());
                }
                let c = words.remove(0).to_ascii_lowercase();
                if matches!(c.as_str(), "research" | "player") {
                    if !words.is_empty() && !words[0].contains('=') {
                        e.user = Some(words.remove(0));
                    }
                } else if !words.is_empty() && !words[0].contains('=') {
                    e.planet = Some(words.remove(0));
                }
                c
            }
            "add" => {
                if words.len() != 1 {
                    return Err("add requires player, planet, or bot".into());
                }
                let kind = words.remove(0).to_ascii_lowercase();
                if !matches!(kind.as_str(), "player" | "planet" | "bot") {
                    return Err("add requires player, planet, or bot".into());
                }
                e.op = format!("add-{kind}");
                e.from = flags.remove("near");
                "none".into()
            }
            "attack" | "spy" | "transport" | "debris" => {
                if words.is_empty() {
                    return Err("requires destination coordinates".into());
                }
                e.planet = Some(words.remove(0));
                if verb == "debris" {
                    "resources"
                } else {
                    "ships"
                }
                .into()
            }
            "finish" | "clear" => {
                if words
                    .first()
                    .is_none_or(|w| !w.eq_ignore_ascii_case("queues"))
                {
                    return Err("finish/clear requires queues".into());
                }
                words.remove(0);
                if !words.is_empty() {
                    e.planet = Some(words.remove(0));
                }
                "none".into()
            }
            "queue" => {
                if words.len() < 2 {
                    return Err("queue requires coordinates, category and ITEM=VALUE".into());
                }
                e.planet = Some(words.remove(0));
                words.remove(0).to_ascii_lowercase()
            }
            "message" | "report" | "alliance" => {
                if words.is_empty() {
                    return Err("requires recipient username".into());
                }
                e.user = Some(words.remove(0));
                "resources".into()
            }
            _ => return Err(format!("unknown world command {verb}")),
        };
        let map = match category.as_str() {
            "resources" => &mut e.resources,
            "ships" => &mut e.ships,
            "defenses" => &mut e.defenses,
            "building" | "buildings" => &mut e.buildings,
            "research" => &mut e.research,
            "none" | "player" => &mut e.resources,
            _ => return Err(format!("unknown category {category}")),
        };
        for word in words {
            let (k, v) = word
                .split_once('=')
                .ok_or_else(|| format!("expected ITEM=VALUE, got {word}"))?;
            let n = v
                .parse::<i64>()
                .map_err(|_| format!("{k}: expected integer"))?;
            if map.insert(k.to_ascii_lowercase(), n).is_some() {
                return Err(format!("duplicate item {k}"));
            }
        }
        if let Some(c) = &e.planet {
            orbit_engine::world_edit::coordinates(c)?;
        }
        Action::Apply {
            document: Box::new(WorldScenario {
                version: 1,
                retained_rules: vec![],
                name: None,
                policy: None,
                rules: None,
                edits: vec![e],
            }),
            mode: ScenarioMode::Patch,
        }
    };
    match &action {
        Action::Apply { document, .. } => {
            if document.version != 1 || document.edits.is_empty() {
                return Err("scenario requires version 1 and at least one edit".into());
            }
            for (index, edit) in document.edits.iter().enumerate() {
                edit.check_shape()
                    .map_err(|e| format!("edits[{index}]: {e}"))?;
            }
        }
        Action::Show {
            planet: Some(p), ..
        } => {
            orbit_engine::world_edit::coordinates(p)?;
        }
        _ => {}
    }
    if !flags.is_empty() {
        return Err(format!(
            "unknown options: {:?}",
            flags.keys().collect::<Vec<_>>()
        ));
    }
    Ok(WorldCliCommand {
        universe,
        operation,
        action,
    })
}
pub async fn run(store: &PgStore, c: WorldCliCommand) -> Result<(), String> {
    let requested = c.universe.or(std::env::var("ORBIT_UNIVERSE_ID")
        .ok()
        .map(|s| Uuid::parse_str(&s).map(UniverseId))
        .transpose()
        .map_err(|e| e.to_string())?);
    let create = matches!(
        &c.action,
        Action::Apply {
            mode: ScenarioMode::Create | ScenarioMode::Replace,
            ..
        }
    );
    let u = store
        .world_universe(requested, create)
        .await
        .map_err(|e| e.to_string())?;
    let output = match c.action {
        Action::Help => {
            println!("{HELP}");
            return Ok(());
        }
        Action::Show { user, planet } => store
            .inspect_world(u, user.as_deref(), planet.as_deref())
            .await
            .map_err(|e| e.to_string())?,
        Action::Apply { document, mode } => store
            .apply_world_scenario(u, &document, mode, c.operation)
            .await
            .map_err(|e| e.to_string())?,
        Action::Save(file) => {
            let d = store
                .export_world_scenario(u)
                .await
                .map_err(|e| e.to_string())?;
            if let Some(p) = file.parent().filter(|p| !p.as_os_str().is_empty()) {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            std::fs::write(
                &file,
                serde_json::to_string_pretty(&d).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            serde_json::json!({"saved":file,"universe":u})
        }
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&output).map_err(|e| e.to_string())?
    );
    Ok(())
}

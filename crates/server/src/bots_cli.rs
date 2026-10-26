use orbit_application::{PlayerId, UniverseId, parse_bot_sleep};
use orbit_storage_postgres::PgStore;
use std::{collections::BTreeMap, error::Error};
pub const HELP: &str = "orbit bots create --universe UUID --name NAME --sleep-start-utc HH:MM\norbit bots mark --universe UUID --player UUID --sleep-start-utc HH:MM\norbit bots token issue|revoke --universe UUID --player UUID\norbit bots retire --universe UUID --player UUID --reason TEXT";
pub struct Options {
    action: String,
    universe: UniverseId,
    player: Option<PlayerId>,
    name: Option<String>,
    sleep: Option<u16>,
    reason: Option<String>,
}
pub fn parse(args: &[String]) -> Result<Options, String> {
    let action = args.get(2).ok_or(HELP)?;
    let (action, start) = if action == "token" {
        (format!("token-{}", args.get(3).ok_or(HELP)?), 4)
    } else {
        (action.clone(), 3)
    };
    let required: &[&str] = match action.as_str() {
        "create" => &["--universe", "--name", "--sleep-start-utc"],
        "mark" => &["--universe", "--player", "--sleep-start-utc"],
        "token-issue" | "token-revoke" => &["--universe", "--player"],
        "retire" => &["--universe", "--player", "--reason"],
        _ => return Err(HELP.into()),
    };
    let mut options = BTreeMap::new();
    for pair in args[start..].chunks(2) {
        if pair.len() != 2
            || !required.contains(&pair[0].as_str())
            || options.insert(pair[0].as_str(), pair[1].as_str()).is_some()
        {
            return Err(HELP.into());
        }
    }
    if required.iter().any(|k| !options.contains_key(k)) {
        return Err(HELP.into());
    }
    let id = |s: &str| {
        uuid::Uuid::parse_str(s)
            .ok()
            .filter(|u| !u.is_nil())
            .ok_or("expected non-nil UUID".to_string())
    };
    Ok(Options {
        action,
        universe: UniverseId(id(options["--universe"])?),
        player: options
            .get("--player")
            .map(|s| id(s).map(PlayerId))
            .transpose()?,
        name: options.get("--name").map(|s| s.to_string()),
        sleep: options
            .get("--sleep-start-utc")
            .map(|s| parse_bot_sleep(s))
            .transpose()?,
        reason: options.get("--reason").map(|s| s.to_string()),
    })
}
pub async fn run(store: &PgStore, q: Options) -> Result<(), Box<dyn Error>> {
    store.check_universe_config_schema().await?;
    match q.action.as_str() {
        "create" => println!(
            "{}",
            serde_json::to_string(
                &store
                    .create_bot(
                        q.universe,
                        q.name.as_deref().ok_or(HELP)?,
                        q.sleep.ok_or(HELP)?
                    )
                    .await?
            )?
        ),
        "mark" => {
            store
                .mark_bot(q.universe, q.player.ok_or(HELP)?, q.sleep.ok_or(HELP)?)
                .await?
        }
        "token-issue" => println!(
            "{}",
            store
                .issue_bot_token(q.universe, q.player.ok_or(HELP)?)
                .await?
        ),
        "token-revoke" => {
            store
                .revoke_bot_tokens(q.universe, q.player.ok_or(HELP)?)
                .await?
        }
        "retire" => {
            store
                .retire_bot_player(
                    q.universe,
                    q.player.ok_or(HELP)?,
                    q.reason.as_deref().ok_or(HELP)?,
                )
                .await?
        }
        _ => return Err(HELP.into()),
    }
    Ok(())
}

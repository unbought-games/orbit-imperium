use orbit_application::announcements::{Announcement, FeedStore};
use orbit_storage_assets::{AssetConfig, announcements::AnnouncementStorage};
use std::{error::Error, io::Read};
pub const HELP: &str = "orbit announcements <command>
  validate FILE.md          Validate YAML metadata and Markdown without storage access
  publish FILE.md           Publish or edit one stable announcement ID
  list                      Print the active feed and revision as JSON
  withdraw ID               Remove an announcement from the active feed
  restore SHA256            Restore a retained feed revision
Uses ORBIT_ASSET_* configuration; defaults to data/assets. No database needed.
Publication conflicts fail without overwriting another operator's changes.";
#[derive(Debug, PartialEq)]
pub enum Command {
    Help,
    Validate(String),
    Publish(String),
    List,
    Withdraw(String),
    Restore(String),
}
pub fn parse(args: &[String]) -> Result<Command, &'static str> {
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        [] | ["--help"] => Ok(Command::Help),
        ["validate", file] => Ok(Command::Validate((*file).into())),
        ["publish", file] => Ok(Command::Publish((*file).into())),
        ["list"] => Ok(Command::List),
        ["withdraw", id] => Ok(Command::Withdraw((*id).into())),
        ["restore", revision] => Ok(Command::Restore((*revision).into())),
        _ => Err("invalid announcements command; use orbit announcements --help"),
    }
}
pub fn parse_source(text: &str) -> Result<Announcement, Box<dyn Error>> {
    if text.len() > 24_576 {
        return Err("announcement source exceeds 24 KiB".into());
    }
    let text = text.replace("\r\n", "\n");
    let (header, body) = text
        .strip_prefix("---\n")
        .and_then(|s| s.split_once("\n---\n"))
        .ok_or("expected YAML frontmatter between --- lines followed by Markdown")?;
    let mut value: serde_yaml_ng::Mapping = serde_yaml_ng::from_str(header)?;
    if value.insert("body".into(), body.trim().into()).is_some() {
        return Err("body belongs after the frontmatter".into());
    }
    let item: Announcement = serde_yaml_ng::from_value(value.into())?;
    item.validate()?;
    Ok(item)
}
fn read_source(path: &str) -> Result<Announcement, Box<dyn Error>> {
    let mut text = String::new();
    std::fs::File::open(path)?
        .take(24_577)
        .read_to_string(&mut text)?;
    parse_source(&text)
}
pub async fn run(command: Command) -> Result<(), Box<dyn Error>> {
    if command == Command::Help {
        println!("{HELP}");
        return Ok(());
    }
    let item = match &command {
        Command::Validate(file) | Command::Publish(file) => Some(read_source(file)?),
        _ => None,
    };
    if matches!(command, Command::Validate(_)) {
        println!("Valid announcement: {}", item.unwrap().id);
        return Ok(());
    }
    let config = AssetConfig::parse(|key| std::env::var(key).ok())?;
    let storage = AnnouncementStorage::connect(&config).await?;
    let current = storage.load().await?;
    if command == Command::List {
        println!("{}", serde_json::to_string_pretty(&current)?);
        return Ok(());
    }
    let mut feed = current.feed;
    match command {
        Command::Publish(_) => feed.publish(item.unwrap())?,
        Command::Withdraw(id) => feed.withdraw(&id)?,
        Command::Restore(revision) => feed = storage.revision(&revision).await?,
        _ => unreachable!(),
    }
    let revision = storage.save(current.revision.as_deref(), &feed).await?;
    println!(
        "{}",
        serde_json::json!({"revision": revision, "previous_revision": current.revision, "count": feed.announcements.len()})
    );
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_metadata_and_body_are_validated_before_publication() {
        let source = "---\nid: new-research\ntitle: New research\ndate: '2026-11-07T12:00:00Z'\nimage:\n  src: /art/research.webp\n  alt: Laboratories\n---\n**Research** together.\n";
        let item = parse_source(source).unwrap();
        assert_eq!(item.body, "**Research** together.");
        assert_eq!(parse_source(&source.replace('\n', "\r\n")).unwrap(), item);
        assert!(
            parse_source(
                &source.replace("title: New research", "title: New research\nextra: typo")
            )
            .is_err()
        );
        assert!(
            parse_source(
                &source.replace("title: New research", "title: New research\nbody: hidden")
            )
            .is_err()
        );
        assert!(
            parse_source(&source.replace("/art/research.webp", "javascript:alert(1)")).is_err()
        );
        assert!(parse_source("no metadata").is_err());
    }
    #[test]
    fn commands_reject_missing_or_extra_arguments() {
        assert_eq!(parse(&["list".into()]).unwrap(), Command::List);
        assert!(parse(&["publish".into()]).is_err());
        assert!(parse(&["list".into(), "extra".into()]).is_err());
    }
}

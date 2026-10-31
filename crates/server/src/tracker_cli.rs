use orbit_application::UniverseId;
use orbit_storage_postgres::PgStore;
use std::error::Error;
pub const HELP: &str = "orbit tracker token issue|revoke --universe UUID";
pub fn parse(args: &[String]) -> Result<(bool, UniverseId), String> {
    if args.len() != 6
        || args[2] != "token"
        || args[4] != "--universe"
        || !matches!(args[3].as_str(), "issue" | "revoke")
    {
        return Err(HELP.into());
    }
    let id = uuid::Uuid::parse_str(&args[5])
        .ok()
        .filter(|id| !id.is_nil())
        .ok_or(HELP)?;
    Ok((args[3] == "issue", UniverseId(id)))
}
pub async fn run(store: &PgStore, options: (bool, UniverseId)) -> Result<(), Box<dyn Error>> {
    if options.0 {
        println!("{}", store.issue_tracker_token(options.1).await?);
    } else {
        store.revoke_tracker_tokens(options.1).await?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_scoped_issue_and_revoke() {
        let args = |s: &str| s.split_whitespace().map(str::to_owned).collect::<Vec<_>>();
        assert!(
            parse(&args(
                "orbit tracker token issue --universe 11111111-1111-1111-1111-111111111111"
            ))
            .unwrap()
            .0
        );
        assert!(
            !parse(&args(
                "orbit tracker token revoke --universe 11111111-1111-1111-1111-111111111111"
            ))
            .unwrap()
            .0
        );
        for invalid in [
            "orbit tracker",
            "orbit tracker token issue",
            "orbit tracker token issue --universe 00000000-0000-0000-0000-000000000000",
            "orbit tracker token issue --player 11111111-1111-1111-1111-111111111111",
        ] {
            assert!(parse(&args(invalid)).is_err());
        }
    }
}

//! Explicit maintenance-only feature activation.
use orbit_engine::UniverseId;
use orbit_storage_postgres::PgStore;
pub const HELP: &str = "tutorial activate --universe UUID --all-binaries-ready\nStop every server/worker using this database and upgrade every binary first. Activation refuses while any server guard is held. Existing empires enroll in full interface; future humans begin guided. Pending work is preserved and re-scoped atomically. No historical grants. Resume upgraded servers only after success.";
pub fn parse(args: &[String]) -> Result<UniverseId, &'static str> {
    if args.len() != 6
        || args[1] != "tutorial"
        || args[2] != "activate"
        || args[3] != "--universe"
        || args[5] != "--all-binaries-ready"
    {
        return Err(HELP);
    }
    uuid::Uuid::parse_str(&args[4])
        .ok()
        .filter(|u| !u.is_nil())
        .map(UniverseId)
        .ok_or(HELP)
}
pub async fn run(store: &PgStore, u: UniverseId) -> Result<(), orbit_application::StoreError> {
    let enrolled = store.activate_tutorial(u, true).await?;
    println!(
        "{}",
        serde_json::json!({"universe":u,"tutorial_enabled":true,"enrolled_existing":enrolled})
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn activation_requires_explicit_readiness_and_non_nil_world() {
        let args = |id: &str| {
            [
                "orbit",
                "tutorial",
                "activate",
                "--universe",
                id,
                "--all-binaries-ready",
            ]
            .map(str::to_owned)
            .to_vec()
        };
        let valid = args("00000000-0000-4000-8000-000000000044");
        assert!(parse(&valid).is_ok());
        assert!(parse(&valid[..5]).is_err());
        assert!(parse(&args("00000000-0000-0000-0000-000000000000")).is_err());
        let mut invalid = valid;
        invalid[5] = "--force".into();
        assert!(parse(&invalid).is_err());
    }
}

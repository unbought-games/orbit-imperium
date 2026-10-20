use orbit_engine::UniverseId;
use orbit_storage_postgres::PgStore;
use uuid::Uuid;

pub fn parse(args: &[String]) -> Result<UniverseId, &'static str> {
    let usage = "use audit --universe UUID (explicit read-only current-state reconciliation)";
    if args.len() != 4 || args[2] != "--universe" {
        return Err(usage);
    }
    Uuid::parse_str(&args[3])
        .ok()
        .filter(|u| !u.is_nil())
        .map(UniverseId)
        .ok_or(usage)
}
pub async fn run(store: &PgStore, u: UniverseId) -> Result<(), orbit_storage_postgres::AuditError> {
    eprintln!(
        "universe {u}: auditing current-state progression, world lineage and rule references; 60s deadline; no historical replay or repair"
    );
    store.audit_universe(u).await?;
    println!("universe {u}: current-state audit passed");
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn audit_requires_one_non_nil_universe_and_no_other_options() {
        let id = "00000000-0000-4000-8000-000000000001";
        let args = |values: &[&str]| values.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(parse(&args(&["server", "audit", "--universe", id])).is_ok());
        for bad in [
            vec!["server", "audit"],
            vec!["server", "audit", "--universe", "bad"],
            vec![
                "server",
                "audit",
                "--universe",
                "00000000-0000-0000-0000-000000000000",
            ],
            vec!["server", "audit", "--universe", id, "--repair"],
        ] {
            assert!(parse(&args(&bad)).is_err());
        }
    }
}

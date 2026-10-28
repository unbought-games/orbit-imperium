use super::*;
fn args(s: &str) -> Vec<String> {
    s.split_whitespace().map(str::to_string).collect()
}
#[test]
fn coordinates_and_user_are_explicit() {
    let c = parse(&args("set ships 1:50:8 CRUISER=100 --user alice")).unwrap();
    let Action::Apply { document, .. } = c.action else {
        panic!()
    };
    assert_eq!(document.edits[0].ships["cruiser"], 100);
    assert_eq!(document.edits[0].user.as_deref(), Some("alice"));
    assert!(parse(&args("set ships home cruiser=100")).is_err());
    assert!(parse(&args("set ships 1:50:8 cruiser=1 Cruiser=2")).is_err());
}
#[test]
fn all_planets_research_and_help() {
    assert!(parse(&args("set ships --user bob --all-planets cruiser=5")).is_ok());
    assert!(parse(&args("set research bob astrophysics=15")).is_ok());
    assert!(matches!(
        parse(&args("--help")).unwrap().action,
        Action::Help
    ));
    assert!(parse(&args("show --unknown foo")).is_err());
}

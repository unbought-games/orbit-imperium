use super::*;
fn args(words: &[&str]) -> Vec<String> {
    words.iter().map(|s| (*s).into()).collect()
}
const ID: &str = "00000000-0000-4000-8000-000000000001";
#[test]
fn creation_defaults_to_five_and_bridge_requires_explicit_acknowledgement() {
    let words = args(&["orbit", "universe", "create", "--universe", ID]);
    let UniverseCli::Create(c) = parse_for_mode(&words, |_| None, false).unwrap() else {
        panic!()
    };
    assert_eq!(c.immutable.speed, 5);
    assert_eq!(c.policy.max_players, None);
    assert!(
        parse_for_mode(&words, |_| None, true)
            .unwrap_err()
            .contains("acknowledge")
    );
    let mut words = words;
    words.push("--acknowledge-bridge-rollout".into());
    assert!(parse_for_mode(&words, |_| None, true).is_ok());
    assert!(parse_for_mode(&words, |_| None, false).is_err());
}
#[test]
fn malformed_creation_and_unknown_options_fail_before_connection() {
    for extra in [
        vec!["--speed", "0"],
        vec!["--speed", "101"],
        vec!["--speed", "5.0"],
        vec!["--speed", "05"],
        vec!["--speed", "+5"],
        vec!["--galaxies", "0"],
        vec!["--positions-per-system", "14"],
        vec!["--signup-enabled", "1"],
        vec!["--speed", "5", "--speed", "10"],
        vec!["--unknown", "value"],
        vec!["--universe", "00000000-0000-0000-0000-000000000000"],
        vec!["--systems-per-galaxy", "1", "--max-players", "10"],
    ] {
        let mut words = vec!["orbit", "universe", "create"];
        words.extend(extra);
        assert!(
            parse_for_mode(&args(&words), |_| None, false).is_err(),
            "{words:?}"
        );
    }
}
#[test]
fn bridge_import_is_read_only_and_records_environment_or_default_provenance() {
    let words = args(&[
        "orbit",
        "universe",
        "config",
        "import-env",
        "--universe",
        ID,
        "--out",
        "review.json",
    ]);
    assert!(parse_for_mode(&words, |_| None, false).is_err());
    let UniverseCli::Import {
        policy, sources, ..
    } = parse_for_mode(
        &words,
        |key| match key {
            "ORBIT_SIGNUP_ENABLED" => Some("false".into()),
            "ORBIT_MAX_PLAYERS" => Some("12".into()),
            "ORBIT_SPEED" => Some("invalid-ignored".into()),
            _ => None,
        },
        true,
    )
    .unwrap()
    else {
        panic!()
    };
    assert!(!policy.signup_enabled);
    assert_eq!(policy.max_players, Some(12));
    assert_eq!(sources["commands_per_minute"], "default");
    assert_eq!(sources["signup_enabled"], "environment");
}
#[test]
fn document_identity_and_fields_are_validated_during_parsing() {
    let file = std::env::temp_dir().join(format!("universe-cli-{}.json", uuid::Uuid::new_v4()));
    let mut doc = UniverseConfigDocument {
        version: 1,
        universe: uuid::Uuid::new_v4().into(),
        base_revision: 0,
        immutable: Default::default(),
        policy: Default::default(),
    };
    std::fs::write(&file, serde_json::to_vec(&doc).unwrap()).unwrap();
    let words = args(&[
        "orbit",
        "universe",
        "config",
        "apply",
        "--universe",
        ID,
        "--file",
        file.to_str().unwrap(),
    ]);
    assert!(
        parse_for_mode(&words, |_| None, false)
            .unwrap_err()
            .contains("universe")
    );
    doc.universe = uuid::Uuid::parse_str(ID).unwrap().into();
    std::fs::write(&file, serde_json::to_vec(&doc).unwrap()).unwrap();
    assert!(parse_for_mode(&words, |_| None, false).is_ok());
    let mut value = serde_json::to_value(doc).unwrap();
    value["policy"]
        .as_object_mut()
        .unwrap()
        .remove("max_players");
    std::fs::write(&file, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(parse_for_mode(&words, |_| None, false).is_err());
    std::fs::remove_file(file).unwrap();
}

#[test]
fn update_accepts_arbitrary_names_and_rejects_missing_or_invalid_fields() {
    let command = |extra: &[&str]| {
        let mut words = vec!["orbit", "universe", "update", "--universe", ID];
        words.extend(extra);
        parse_for_mode(&args(&words), |_| None, false)
    };
    let UniverseCli::Update(update) = command(&["--name", "My Universe / 宇宙 🌌"]).unwrap()
    else {
        panic!("expected metadata update")
    };
    assert_eq!(update.name, "My Universe / 宇宙 🌌");
    assert!(command(&["--name", "--World"]).is_ok());
    for extra in [
        vec![],
        vec!["--name", " "],
        vec!["--name", " name"],
        vec!["--name", "line\nbreak"],
        vec!["--name", "Name", "--speed", "5"],
        vec!["--name", "A", "--name", "B"],
    ] {
        assert!(command(&extra).is_err(), "{extra:?}");
    }
    assert!(command(&["--name", &"x".repeat(81)]).is_err());
    assert!(command(&["--name", &"宇".repeat(80)]).is_ok());
}

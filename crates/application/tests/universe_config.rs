use orbit_application::*;
use orbit_engine::Ruleset;
use serde_json::{Value, json};

fn document() -> UniverseConfigDocument {
    UniverseConfigDocument {
        version: 1,
        universe: uuid::Uuid::from_u128(1).into(),
        base_revision: 0,
        immutable: UniverseImmutable::default(),
        policy: UniversePolicy::default(),
    }
}

#[test]
fn creation_defaults_and_capacity_are_derived() {
    let d = document();
    assert_eq!(
        d.immutable,
        UniverseImmutable {
            speed: 5,
            galaxies: 1,
            systems_per_galaxy: 100,
            positions_per_system: 15
        }
    );
    assert_eq!(
        d.policy,
        UniversePolicy {
            bots: Default::default(),
            signup_enabled: true,
            max_players: None,
            signup_per_minute: 5,
            commands_per_minute: 60
        }
    );
    d.validate().unwrap();
    assert_eq!(d.immutable.geometric_capacity(), 900);
    assert_eq!(d.policy.effective_max_players(&d.immutable), 900);
    let capped = UniversePolicy {
        bots: Default::default(),
        max_players: Some(3),
        ..d.policy.clone()
    };
    assert_eq!(capped.effective_max_players(&d.immutable), 3);
    UniverseCreate {
        universe: d.universe,
        immutable: d.immutable,
        policy: capped,
    }
    .validate()
    .unwrap();
}

#[test]
fn complete_documents_require_every_field_including_nullable_ceiling() {
    let raw = serde_json::to_value(document()).unwrap();
    for container in ["", "/immutable", "/policy"] {
        for field in raw.pointer(container).unwrap().as_object().unwrap().keys() {
            let mut missing = raw.clone();
            missing
                .pointer_mut(container)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(
                serde_json::from_value::<UniverseConfigDocument>(missing).is_err(),
                "missing {container}/{field}"
            );
            if container == "/policy" && field == "max_players" {
                continue;
            }
            let mut null = raw.clone();
            null.pointer_mut(container).unwrap()[field] = Value::Null;
            assert!(
                serde_json::from_value::<UniverseConfigDocument>(null).is_err(),
                "null {container}/{field}"
            );
        }
        let mut unknown = raw.clone();
        unknown.pointer_mut(container).unwrap()["unknown"] = json!(1);
        assert!(serde_json::from_value::<UniverseConfigDocument>(unknown).is_err());
    }
    let roundtrip: UniverseConfigDocument = serde_json::from_value(raw).unwrap();
    assert_eq!(roundtrip, document());
}

#[test]
fn invalid_documents_name_fields_and_do_not_clamp() {
    for (path, value) in [
        ("/version", json!(2)),
        ("/base_revision", json!(-1)),
        ("/universe", json!(uuid::Uuid::nil())),
        ("/immutable/speed", json!(0)),
        ("/immutable/speed", json!(101)),
        ("/immutable/galaxies", json!(0)),
        ("/immutable/galaxies", json!(101)),
        ("/immutable/systems_per_galaxy", json!(0)),
        ("/immutable/systems_per_galaxy", json!(1001)),
        ("/immutable/positions_per_system", json!(14)),
        ("/policy/max_players", json!(0)),
        ("/policy/max_players", json!(901)),
        ("/policy/signup_per_minute", json!(0)),
        ("/policy/signup_per_minute", json!(10001)),
        ("/policy/commands_per_minute", json!(0)),
        ("/policy/commands_per_minute", json!(10001)),
    ] {
        let mut raw = serde_json::to_value(document()).unwrap();
        *raw.pointer_mut(path).unwrap() = value;
        let d: UniverseConfigDocument = serde_json::from_value(raw).unwrap();
        assert!(
            d.validate()
                .unwrap_err()
                .contains(path.trim_start_matches('/').replace('/', ".").as_str()),
            "{path}"
        );
    }
    for (path, bad) in [
        ("/base_revision", json!(9223372036854775808u64)),
        ("/immutable/speed", json!(5.0)),
        ("/policy/max_players", json!(-1)),
        ("/policy/commands_per_minute", json!(4294967296u64)),
    ] {
        let mut raw = serde_json::to_value(document()).unwrap();
        *raw.pointer_mut(path).unwrap() = bad;
        assert!(
            serde_json::from_value::<UniverseConfigDocument>(raw).is_err(),
            "{path}"
        );
    }
}

#[test]
fn immutable_context_checks_each_field_and_universe() {
    let current = document();
    current
        .validate_for(current.universe, &current.immutable)
        .unwrap();
    assert!(
        current
            .validate_for(uuid::Uuid::from_u128(2).into(), &current.immutable)
            .unwrap_err()
            .contains("universe")
    );
    for (field, value) in [
        ("speed", 10),
        ("galaxies", 2),
        ("systems_per_galaxy", 101),
        ("positions_per_system", 14),
    ] {
        let mut raw = serde_json::to_value(&current).unwrap();
        raw["immutable"][field] = value.into();
        let changed: UniverseConfigDocument = serde_json::from_value(raw).unwrap();
        assert!(
            changed
                .validate_for(current.universe, &current.immutable)
                .unwrap_err()
                .contains(&format!("immutable.{field}"))
        );
    }
}

#[test]
fn supported_extremes_and_saved_rules_keep_their_actual_speed() {
    for speed in [1, 5, 10, 100] {
        let immutable = UniverseImmutable {
            speed,
            galaxies: 100,
            systems_per_galaxy: 1000,
            ..Default::default()
        };
        immutable.validate().unwrap();
        let policy = UniversePolicy {
            bots: Default::default(),
            max_players: Some(900_000),
            signup_per_minute: 10_000,
            commands_per_minute: 10_000,
            ..Default::default()
        };
        policy.validate(&immutable).unwrap();
        let rules = Ruleset::signup_with_speed(immutable.profile().unwrap(), speed).unwrap();
        assert_eq!(UniverseImmutable::from_rules(&rules).unwrap(), immutable);
    }
    assert_eq!(
        UniverseImmutable::from_rules(&Ruleset::mvp().unwrap())
            .unwrap()
            .speed,
        10
    );
}

#[test]
fn config_diff_checks_stale_revisions_and_explains_capacity_changes() {
    let mut current = document();
    current.base_revision = 3;
    let mut desired = current.clone();
    desired.policy.max_players = Some(12);
    let diff = config_diff(&current, &desired).unwrap();
    assert_eq!(
        diff["changes"],
        json!([{"path":"policy.max_players", "before":null, "after":12}])
    );
    assert_eq!(
        diff["effective_max_players"],
        json!({"before":900,"after":12})
    );
    desired.base_revision = 2;
    let error = config_diff(&current, &desired).unwrap_err();
    assert!(error.contains("expected revision 2, current 3") && error.contains("export again"));
    desired.policy = current.policy.clone();
    assert_eq!(
        config_diff(&current, &desired).unwrap()["changes"],
        json!([])
    );
    desired.immutable.speed = 10;
    assert!(
        config_diff(&current, &desired)
            .unwrap_err()
            .contains("immutable.speed")
    );
}

#[test]
fn duplicate_fields_and_incomplete_creation_are_rejected() {
    let raw = serde_json::to_string(&document()).unwrap();
    for (needle, duplicate) in [
        ("\"version\":1", "\"version\":1,\"version\":1"),
        (
            "\"max_players\":null",
            "\"max_players\":null,\"max_players\":null",
        ),
        ("\"speed\":5", "\"speed\":5,\"speed\":5"),
    ] {
        assert!(
            serde_json::from_str::<UniverseConfigDocument>(&raw.replace(needle, duplicate))
                .is_err()
        );
    }
    let d = document();
    let create = UniverseCreate {
        universe: d.universe,
        immutable: d.immutable,
        policy: d.policy,
    };
    let mut raw = serde_json::to_value(&create).unwrap();
    raw["policy"].as_object_mut().unwrap().remove("max_players");
    assert!(serde_json::from_value::<UniverseCreate>(raw).is_err());
    let mut invalid = create;
    invalid.universe = uuid::Uuid::nil().into();
    assert!(invalid.validate().unwrap_err().contains("universe"));
}

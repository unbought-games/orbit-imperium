use orbit_engine::*;
#[path = "common/prior_content.rs"]
mod prior_content;
use prior_content::without_battlecruiser;

fn rules() -> Ruleset {
    standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap()
}

#[test]
fn drive_upgrade_from_technology_release_is_atomic_idempotent_and_preserves_legacy_hash() {
    let latest = rules();
    let mut artifact = without_battlecruiser(latest.artifact.clone());
    artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .remove(&ResearchId::HyperspaceDrive);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::HyperspaceDrive))
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    artifact
        .ships
        .get_mut(&ShipType::Bomber)
        .unwrap()
        .hyperspace_drive = None;
    let previous = Ruleset::from_artifact(artifact, latest.speed).unwrap();
    let bytes = serde_json::to_vec(&previous.artifact).unwrap();
    assert!(
        !String::from_utf8(bytes.clone())
            .unwrap()
            .contains("hyperspace_drive")
    );
    assert_eq!(
        Ruleset::from_artifact(serde_json::from_slice(&bytes).unwrap(), previous.speed)
            .unwrap()
            .hash,
        previous.hash
    );
    let next = upgrade_standard_rules(&previous).unwrap();
    assert_eq!(next, latest);
    assert_eq!(upgrade_standard_rules(&next).unwrap(), next);
    let delta = validate_rules_update(&previous, &next).unwrap();
    assert_eq!(delta.add_research, vec![ResearchId::HyperspaceDrive]);
    assert!(delta.add_buildings.is_empty());
    assert_eq!(previous.protocol(), next.protocol());
    assert_eq!(
        previous.artifact.world,
        without_battlecruiser(next.artifact.clone()).world
    );
    assert_eq!(previous.artifact.universe, next.artifact.universe);
    assert!(validate_rules_update(&next, &previous).is_err());
    let mut custom = previous.artifact.clone();
    custom.ships.get_mut(&ShipType::Bomber).unwrap().base_speed = 6000;
    let custom = Ruleset::from_artifact(custom, previous.speed).unwrap();
    assert!(matches!(
        upgrade_standard_rules(&custom),
        Err(StandardRulesError::Conflicts(_))
    ));
    let mut custom = latest.artifact.clone();
    custom
        .ships
        .get_mut(&ShipType::Bomber)
        .unwrap()
        .hyperspace_drive
        .as_mut()
        .unwrap()
        .minimum_level = 9;
    let custom = Ruleset::from_artifact(custom, previous.speed).unwrap();
    assert!(matches!(
        upgrade_standard_rules(&custom),
        Err(StandardRulesError::Conflicts(_))
    ));
}

#[test]
fn hyperspace_rules_reject_incomplete_unsupported_and_invalid_switches() {
    let latest = rules();
    for fault in [
        "missing-profile",
        "missing-research",
        "zero-level",
        "zero-speed",
        "zero-fuel",
        "recycler",
        "wrong-base",
    ] {
        let mut a = latest.artifact.clone();
        let bomber = a.ships.get_mut(&ShipType::Bomber).unwrap();
        match fault {
            "missing-profile" => bomber.hyperspace_drive = None,
            "zero-level" => bomber.hyperspace_drive.as_mut().unwrap().minimum_level = 0,
            "zero-speed" => bomber.hyperspace_drive.as_mut().unwrap().base_speed = 0,
            "zero-fuel" => bomber.hyperspace_drive.as_mut().unwrap().fuel = 0,
            "wrong-base" => bomber.drive = None,
            "missing-research" => {
                a.progression
                    .as_mut()
                    .unwrap()
                    .research
                    .remove(&ResearchId::HyperspaceDrive);
            }
            "recycler" => {
                let profile = bomber.hyperspace_drive.clone();
                a.ships
                    .get_mut(&ShipType::Recycler)
                    .unwrap()
                    .hyperspace_drive = profile;
            }
            _ => unreachable!(),
        }
        assert!(Ruleset::from_artifact(a, latest.speed).is_err(), "{fault}");
    }
    // Research can be disabled without deleting an earned propulsion bonus.
    let mut a = latest.artifact.clone();
    a.catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::HyperspaceDrive))
        .unwrap()
        .enabled = false;
    a.catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::Battlecruiser))
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(a, latest.speed).unwrap();
    let research = ResearchLevels {
        owner: PlayerId(uuid::Uuid::nil()),
        revision: 0,
        levels: [(ResearchId::HyperspaceDrive, 8)].into(),
    };
    assert_eq!(
        ship_propulsion(&disabled.artifact.ships[&ShipType::Bomber], &research).unwrap(),
        (17000, 1000)
    );
    assert!(
        disabled.artifact.ships[&ShipType::Recycler]
            .hyperspace_drive
            .is_none()
    );
}

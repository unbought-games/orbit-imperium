use super::*;

fn retained(bytes: &[u8]) -> Ruleset {
    let mut artifact: RulesArtifact = serde_json::from_slice(bytes).unwrap();
    artifact.universe = Some(UniverseProfile::signup(2, 100).unwrap());
    artifact.id = "friends-custom-name".into();
    Ruleset::from_artifact(artifact, 3).unwrap()
}

#[test]
fn fresh_worlds_and_every_supported_partial_release_reach_the_same_content() {
    let fresh = standard_signup_rules(UniverseProfile::signup(2, 100).unwrap(), 3).unwrap();
    for bytes in [
        include_bytes!("../../../../rules/mvp-v1-slice-5.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-slice-6.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-slice-7.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-slice-8.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-slice-9.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-slice-10.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-slice-11.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-heavy-laser.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-slice-12.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-slice-13.json").as_slice(),
        include_bytes!("../../../../rules/mvp-v1-solar-satellite.json").as_slice(),
    ] {
        let old = retained(bytes);
        let next = upgrade_standard_rules(&old).unwrap();
        assert_eq!(next.artifact.id, old.artifact.id);
        assert_eq!(next.speed, 3);
        assert_eq!(next.artifact.universe, old.artifact.universe);
        assert_eq!(upgrade_standard_rules(&next).unwrap(), next);
        // Collection order is retained for stable hashes; compare keyed collections.
        assert_eq!(next.artifact.ships, fresh.artifact.ships);
        assert_eq!(
            next.artifact.progression.as_ref().unwrap().research,
            fresh.artifact.progression.as_ref().unwrap().research
        );
        for key in [
            CatalogKey::Ship(ShipType::LargeCargo),
            CatalogKey::Ship(ShipType::SolarSatellite),
            CatalogKey::Defense(DefenseId::HeavyLaser),
            CatalogKey::Defense(DefenseId::GaussCannon),
            CatalogKey::Defense(DefenseId::LargeShieldDome),
        ] {
            assert!(
                next.artifact
                    .catalog
                    .iter()
                    .any(|e| e.key == key && e.enabled)
            );
        }
        assert_eq!(next.artifact.ships[&ShipType::LargeCargo].capacity, 25000);
        assert!(next.colonization());
        assert!(
            next.artifact
                .progression
                .as_ref()
                .unwrap()
                .solar_satellite
                .is_some()
        );
        assert!(
            !next
                .artifact
                .catalog
                .iter()
                .any(|e| e.key == CatalogKey::Ship(ShipType::Deathstar) && e.enabled)
        );
    }
}

#[test]
fn unrelated_custom_settings_are_retained_and_owned_customizations_are_conflicts() {
    let mut old = retained(include_bytes!("../../../../rules/mvp-v1-slice-11.json"));
    old.artifact.base_income[0] = 45;
    old.artifact
        .buildings
        .get_mut(&Building::MetalMine)
        .unwrap()
        .base[0] = 90;
    old.artifact
        .ships
        .get_mut(&ShipType::SmallCargo)
        .unwrap()
        .capacity = 6000;
    old = Ruleset::from_artifact(old.artifact, old.speed).unwrap();
    let next = upgrade_standard_rules(&old).unwrap();
    assert_eq!(next.artifact.base_income, old.artifact.base_income);
    assert_eq!(next.artifact.buildings, old.artifact.buildings);
    assert_eq!(
        next.artifact.ships[&ShipType::SmallCargo],
        old.artifact.ships[&ShipType::SmallCargo]
    );
    let mut custom = next.artifact.clone();
    custom
        .ships
        .get_mut(&ShipType::LargeCargo)
        .unwrap()
        .capacity = 40000;
    let custom = Ruleset::from_artifact(custom, 3).unwrap();
    let before = custom.clone();
    let StandardRulesError::Conflicts(conflicts) = upgrade_standard_rules(&custom).unwrap_err()
    else {
        panic!("expected precise conflict")
    };
    assert_eq!(custom, before);
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].path, "/ships/LargeCargo");
    assert_eq!(conflicts[0].current.as_ref().unwrap()["capacity"], 40000);
    assert_eq!(conflicts[0].release_value["capacity"], 25000);
}

#[test]
fn intentionally_disabled_content_is_not_silently_reenabled() {
    let next = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
    let mut artifact = next.artifact;
    artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::LargeCargo))
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(artifact, 5).unwrap();
    assert!(matches!(
        upgrade_standard_rules(&disabled),
        Err(StandardRulesError::Conflicts(_))
    ));
}

#[test]
fn disabled_base_prerequisites_fail_before_any_upgrade() {
    let mut artifact = Ruleset::signup_with_speed(UniverseProfile::signup(1, 100).unwrap(), 5)
        .unwrap()
        .artifact;
    // Disable a base prerequisite and all its enabled dependents to keep the input valid.
    for entry in &mut artifact.catalog {
        if matches!(
            entry.key,
            CatalogKey::Building(Building::ResearchLab) | CatalogKey::Research(_)
        ) {
            entry.enabled = false;
        }
        if matches!(entry.key, CatalogKey::Ship(_)) {
            entry.enabled = false;
        }
    }
    // Other catalog entries may depend on disabled research; disable those too.
    for entry in &mut artifact.catalog {
        if entry
            .requirements
            .iter()
            .any(|r| matches!(r, Requirement::PlayerResearch { .. }))
        {
            entry.enabled = false;
        }
    }
    let disabled = Ruleset::from_artifact(artifact, 5).unwrap();
    assert!(matches!(
        upgrade_standard_rules(&disabled),
        Err(StandardRulesError::Prerequisite(_))
    ));
}

#[test]
fn large_shield_dome_upgrade_owns_complete_definitions_and_rejects_customizations() {
    let old = retained(include_bytes!("../../../../rules/mvp-v1-slice-13.json"));
    let next = upgrade_standard_rules(&old).unwrap();
    let item = ManufacturedItem::Defense(DefenseId::LargeShieldDome);
    let entry = next
        .artifact
        .catalog
        .iter()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    assert_eq!(
        entry.requirements,
        vec![
            Requirement::BodyBuilding {
                building: Building::Shipyard,
                level: 6
            },
            Requirement::PlayerResearch {
                research: ResearchId::ShieldingTechnology,
                level: 6
            },
        ]
    );
    assert!(!entry.mobile);
    let cost = next
        .artifact
        .progression
        .as_ref()
        .unwrap()
        .unit_costs
        .iter()
        .find(|u| u.item == item)
        .unwrap();
    assert_eq!(cost.cost, Resources::from_values([50000, 50000, 0]));
    let combat = &next.artifact.world.as_ref().unwrap().combat;
    let unit = combat.units.iter().find(|u| u.item == item).unwrap();
    assert_eq!(unit.cost, [50000, 50000, 0]);
    assert_eq!(
        combat_unit_stats(unit, [0; 3], combat).unwrap(),
        (100000, 1000000000, 1000000000)
    );
    for field in ["disabled", "requirements", "cost", "combat"] {
        let mut custom = next.artifact.clone();
        match field {
            "disabled" => {
                custom
                    .catalog
                    .iter_mut()
                    .find(|e| e.key == item.catalog_key())
                    .unwrap()
                    .enabled = false
            }
            "requirements" => custom
                .catalog
                .iter_mut()
                .find(|e| e.key == item.catalog_key())
                .unwrap()
                .requirements
                .clear(),
            "cost" => {
                custom
                    .progression
                    .as_mut()
                    .unwrap()
                    .unit_costs
                    .iter_mut()
                    .find(|u| u.item == item)
                    .unwrap()
                    .cost
                    .metal = 60000;
                custom
                    .world
                    .as_mut()
                    .unwrap()
                    .combat
                    .units
                    .iter_mut()
                    .find(|u| u.item == item)
                    .unwrap()
                    .cost[0] = 60000;
            }
            _ => {
                custom
                    .world
                    .as_mut()
                    .unwrap()
                    .combat
                    .units
                    .iter_mut()
                    .find(|u| u.item == item)
                    .unwrap()
                    .shield_hundredths = 2000000
            }
        }
        let custom = Ruleset::from_artifact(custom, next.speed).unwrap();
        assert!(
            matches!(
                upgrade_standard_rules(&custom),
                Err(StandardRulesError::Conflicts(_))
            ),
            "{field}"
        );
    }
}

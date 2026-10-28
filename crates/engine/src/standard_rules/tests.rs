use super::*;
#[path = "../../tests/common/prior_content.rs"]
mod prior_content;
use prior_content::without_battlecruiser;

fn retained(bytes: &[u8]) -> Ruleset {
    let mut artifact: RulesArtifact = serde_json::from_slice(bytes).unwrap();
    artifact.universe = Some(UniverseProfile::signup(2, 100).unwrap());
    artifact.id = "friends-custom-name".into();
    Ruleset::from_artifact(artifact, 3).unwrap()
}

#[test]
fn dreadnought_identity_round_trips_in_catalogs_and_combat_maps() {
    let key = CatalogKey::Ship(ShipType::Dreadnought);
    let encoded = serde_json::to_value(key).unwrap();
    assert_eq!(
        encoded,
        serde_json::json!({"kind": "Ship", "id": "Dreadnought"})
    );
    assert_eq!(serde_json::from_value::<CatalogKey>(encoded).unwrap(), key);
    let ships = std::collections::BTreeMap::from([(ShipType::Dreadnought, 2)]);
    let encoded = serde_json::to_value(&ships).unwrap();
    assert_eq!(encoded, serde_json::json!({"Dreadnought": 2}));
    assert_eq!(
        serde_json::from_value::<std::collections::BTreeMap<ShipType, i32>>(encoded).unwrap(),
        ships
    );
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
            CatalogKey::Building(Building::FusionReactor),
            CatalogKey::Ship(ShipType::LargeCargo),
            CatalogKey::Ship(ShipType::Bomber),
            CatalogKey::Ship(ShipType::Battlecruiser),
            CatalogKey::Ship(ShipType::SolarSatellite),
            CatalogKey::Defense(DefenseId::HeavyLaser),
            CatalogKey::Defense(DefenseId::GaussCannon),
            CatalogKey::Defense(DefenseId::PlasmaTurret),
            CatalogKey::Defense(DefenseId::LargeShieldDome),
            CatalogKey::Research(ResearchId::PlasmaTechnology),
            CatalogKey::Research(ResearchId::HyperspaceTechnology),
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
                .any(|e| e.key == CatalogKey::Ship(ShipType::Dreadnought) && e.enabled)
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
    for (key, definition) in &old.artifact.buildings {
        assert_eq!(&next.artifact.buildings[key], definition);
    }
    assert_eq!(
        validate_rules_update(&old, &next).unwrap().add_buildings,
        vec![Building::FusionReactor]
    );
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
fn fusion_upgrade_conflicts_and_disabled_prerequisites_are_explicit() {
    let old = retained(include_bytes!("../../../../rules/mvp-v1-slice-11.json"));
    let next = upgrade_standard_rules(&old).unwrap();
    assert_eq!(
        next.artifact.buildings[&Building::FusionReactor].base,
        [900, 360, 180]
    );
    assert_eq!(
        next.artifact.buildings[&Building::FusionReactor].growth,
        [9, 5]
    );
    let mut custom = next.artifact.clone();
    custom
        .progression
        .as_mut()
        .unwrap()
        .fusion_reactor
        .as_mut()
        .unwrap()
        .fuel_base = 12;
    let custom = Ruleset::from_artifact(custom, 3).unwrap();
    assert!(matches!(
        upgrade_standard_rules(&custom),
        Err(StandardRulesError::Conflicts(_))
    ));
    let mut disabled = old.artifact.clone();
    disabled
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Building(Building::DeuteriumSynthesizer))
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(disabled, 3).unwrap();
    assert!(matches!(
        upgrade_standard_rules(&disabled),
        Err(StandardRulesError::Prerequisite(_))
    ));
    let mut disabled = next.artifact.clone();
    disabled
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Building(Building::FusionReactor))
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(disabled, 3).unwrap();
    assert!(matches!(
        upgrade_standard_rules(&disabled),
        Err(StandardRulesError::Conflicts(_))
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

#[test]
fn plasma_upgrade_adds_research_and_turrets_and_preserves_custom_or_disabled_content() {
    let latest = standard_signup_rules(UniverseProfile::signup(2, 100).unwrap(), 5).unwrap();
    // Reconstruct a world from before Plasma and its dependent units were bundled.
    let mut artifact = without_battlecruiser(latest.artifact.clone());
    let bomber = ManufacturedItem::Ship(ShipType::Bomber);
    artifact.ships.remove(&ShipType::Bomber);
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != bomber);
    let combat = &mut artifact.world.as_mut().unwrap().combat;
    combat.units.retain(|u| u.item != bomber);
    combat
        .rapid_fire
        .retain(|rf| rf.shooter != bomber && rf.target != bomber);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == bomber.catalog_key())
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    let turret = ManufacturedItem::Defense(DefenseId::PlasmaTurret);
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != turret);
    artifact
        .world
        .as_mut()
        .unwrap()
        .combat
        .units
        .retain(|u| u.item != turret);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == turret.catalog_key())
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .remove(&ResearchId::PlasmaTechnology);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::PlasmaTechnology))
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    let previous = Ruleset::from_artifact(artifact, latest.speed).unwrap();
    let next = upgrade_standard_rules(&previous).unwrap();
    assert_eq!(next, latest);
    let delta = validate_rules_update(&previous, &next).unwrap();
    assert_eq!(delta.add_research, vec![ResearchId::PlasmaTechnology]);
    assert!(delta.add_buildings.is_empty());
    let mut artifact = next.artifact.clone();
    let bomber = ManufacturedItem::Ship(ShipType::Bomber);
    artifact.ships.remove(&ShipType::Bomber);
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != bomber);
    let combat = &mut artifact.world.as_mut().unwrap().combat;
    combat.units.retain(|u| u.item != bomber);
    combat
        .rapid_fire
        .retain(|rf| rf.shooter != bomber && rf.target != bomber);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == bomber.catalog_key())
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    let mut without_turrets = without_battlecruiser(artifact);
    assert_eq!(previous.artifact.ships, without_turrets.ships);
    without_turrets
        .world
        .as_mut()
        .unwrap()
        .combat
        .units
        .retain(|u| u.item != turret);
    without_turrets
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != turret);
    assert_eq!(previous.artifact.world, without_turrets.world);
    assert_eq!(
        previous.artifact.progression.as_ref().unwrap().unit_costs,
        without_turrets.progression.as_ref().unwrap().unit_costs
    );
    assert!(
        next.artifact
            .catalog
            .iter()
            .any(|e| e.key == turret.catalog_key() && e.enabled)
    );
    assert!(
        next.artifact
            .catalog
            .iter()
            .find(|e| e.key == CatalogKey::Ship(ShipType::Bomber))
            .unwrap()
            .enabled
    );
    assert!(validate_rules_update(&next, &previous).is_err());
    for disable in [false, true] {
        let mut custom = next.artifact.clone();
        if disable {
            custom
                .catalog
                .iter_mut()
                .find(|e| e.key == bomber.catalog_key())
                .unwrap()
                .enabled = false;
            custom
                .catalog
                .iter_mut()
                .find(|e| e.key == turret.catalog_key())
                .unwrap()
                .enabled = false;
            custom
                .catalog
                .iter_mut()
                .find(|e| e.key == CatalogKey::Research(ResearchId::PlasmaTechnology))
                .unwrap()
                .enabled = false;
        } else {
            custom
                .progression
                .as_mut()
                .unwrap()
                .research
                .get_mut(&ResearchId::PlasmaTechnology)
                .unwrap()
                .base[0] = 3000;
        }
        let custom = Ruleset::from_artifact(custom, next.speed).unwrap();
        assert!(matches!(
            upgrade_standard_rules(&custom),
            Err(StandardRulesError::Conflicts(_))
        ));
    }
}

#[test]
fn plasma_turret_upgrade_owns_complete_definitions_and_rejects_customizations() {
    let old = retained(include_bytes!("../../../../rules/mvp-v1-slice-13.json"));
    let next = upgrade_standard_rules(&old).unwrap();
    let item = ManufacturedItem::Defense(DefenseId::PlasmaTurret);
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
                level: 8
            },
            Requirement::PlayerResearch {
                research: ResearchId::PlasmaTechnology,
                level: 7
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
    assert_eq!(cost.cost, Resources::from_values([50000, 50000, 30000]));
    let combat = &next.artifact.world.as_ref().unwrap().combat;
    let unit = combat.units.iter().find(|u| u.item == item).unwrap();
    assert_eq!(unit.cost, [50000, 50000, 30000]);
    assert_eq!(
        combat_unit_stats(unit, [0; 3], combat).unwrap(),
        (300000000, 30000000, 1000000000)
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

#[test]
fn hyperspace_upgrade_initializes_technology_and_drive_and_preserves_customizations() {
    let latest = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
    let key = CatalogKey::Research(ResearchId::HyperspaceTechnology);
    let mut artifact = without_battlecruiser(latest.artifact.clone());
    artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .remove(&ResearchId::HyperspaceTechnology);
    let entry = artifact.catalog.iter_mut().find(|e| e.key == key).unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .remove(&ResearchId::HyperspaceDrive);
    let drive = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::HyperspaceDrive))
        .unwrap();
    drive.enabled = false;
    drive.requirements.clear();
    artifact
        .ships
        .get_mut(&ShipType::Bomber)
        .unwrap()
        .hyperspace_drive = None;
    let previous = Ruleset::from_artifact(artifact, latest.speed).unwrap();
    let next = upgrade_standard_rules(&previous).unwrap();
    assert_eq!(next, latest);
    let delta = validate_rules_update(&previous, &next).unwrap();
    assert_eq!(
        delta.add_research,
        vec![
            ResearchId::HyperspaceTechnology,
            ResearchId::HyperspaceDrive
        ]
    );
    assert!(delta.add_buildings.is_empty());
    let mut ships = without_battlecruiser(next.artifact.clone()).ships;
    ships.get_mut(&ShipType::Bomber).unwrap().hyperspace_drive = None;
    assert_eq!(ships, previous.artifact.ships);
    assert_eq!(
        without_battlecruiser(next.artifact.clone()).world,
        previous.artifact.world
    );
    for id in [
        ResearchId::IntergalacticResearchNetwork,
        ResearchId::GravitonTechnology,
    ] {
        assert!(
            !next
                .artifact
                .catalog
                .iter()
                .any(|e| e.key == CatalogKey::Research(id) && e.enabled)
        );
        assert!(!next.research_keys().contains(&id));
    }
    for custom in 0..3 {
        let mut artifact = next.artifact.clone();
        if custom == 0 {
            artifact
                .catalog
                .iter_mut()
                .find(|e| e.key == CatalogKey::Ship(ShipType::Battlecruiser))
                .unwrap()
                .enabled = false;
        }
        match custom {
            0 => {
                artifact
                    .catalog
                    .iter_mut()
                    .find(|e| e.key == CatalogKey::Research(ResearchId::HyperspaceDrive))
                    .unwrap()
                    .enabled = false;
                artifact
                    .catalog
                    .iter_mut()
                    .find(|e| e.key == key)
                    .unwrap()
                    .enabled = false
            }
            1 => {
                artifact
                    .progression
                    .as_mut()
                    .unwrap()
                    .research
                    .get_mut(&ResearchId::HyperspaceTechnology)
                    .unwrap()
                    .base[1] = 5000
            }
            _ => {
                artifact
                    .catalog
                    .iter_mut()
                    .find(|e| e.key == key)
                    .unwrap()
                    .requirements[0] = Requirement::BodyBuilding {
                    building: Building::ResearchLab,
                    level: 8,
                }
            }
        }
        let custom = Ruleset::from_artifact(artifact, next.speed).unwrap();
        assert!(matches!(
            upgrade_standard_rules(&custom),
            Err(StandardRulesError::Conflicts(_))
        ));
    }
}

use orbit_engine::*;
#[allow(dead_code)]
#[path = "common/prior_content.rs"]
mod prior_content;

#[test]
fn dreadnought_upgrade_activates_local_shipyards_and_all_directed_combat_pairs() {
    use DefenseId::*;
    use ManufacturedItem::{Defense as D, Ship as S};
    use ShipType::*;

    let latest = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap();
    let previous = Ruleset::from_artifact(
        prior_content::without_ship(latest.artifact.clone(), Dreadnought),
        latest.speed,
    )
    .unwrap();
    let active = upgrade_standard_rules(&previous).unwrap();
    assert_eq!(active, latest);
    assert_eq!(upgrade_standard_rules(&active).unwrap(), active);
    let delta = validate_rules_update(&previous, &active).unwrap();
    assert!(delta.add_research.is_empty() && delta.add_buildings.is_empty());
    let item = S(Dreadnought);
    let entry = active
        .artifact
        .catalog
        .iter()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    assert!(entry.enabled && entry.mobile);
    assert_eq!(entry.body_kinds, [BodyKind::Planet, BodyKind::Moon].into());
    assert_eq!(
        entry.requirements,
        vec![
            Requirement::BodyBuilding {
                building: Building::Shipyard,
                level: 12
            },
            Requirement::PlayerResearch {
                research: ResearchId::HyperspaceTechnology,
                level: 6
            },
            Requirement::PlayerResearch {
                research: ResearchId::HyperspaceDrive,
                level: 7
            },
            Requirement::PlayerResearch {
                research: ResearchId::GravitonTechnology,
                level: 1
            },
        ]
    );
    let combat = &active.artifact.world.as_ref().unwrap().combat;
    let unit = combat.units.iter().find(|u| u.item == item).unwrap();
    assert_eq!(
        combat_unit_stats(unit, [0; 3], combat).unwrap(),
        (20_000_000_000, 5_000_000_000, 90_000_000_000)
    );
    assert!(combat.rapid_fire.iter().all(|rf| rf.target != item));
    assert_eq!(combat.units.len(), 22);
    for target in &combat.units {
        let expected = match target.item {
            S(EspionageProbe | SolarSatellite) => 1250,
            S(SmallCargo | LargeCargo | Recycler | ColonyShip) => 250,
            S(LightFighter) | D(RocketLauncher | LightLaser) => 200,
            S(HeavyFighter) | D(HeavyLaser | IonCannon) => 100,
            D(GaussCannon) => 50,
            S(Cruiser) => 33,
            S(Battleship) => 30,
            S(Bomber) => 25,
            S(Battlecruiser) => 15,
            S(Destroyer) => 5,
            S(Dreadnought) | D(PlasmaTurret | SmallShieldDome | LargeShieldDome) => 1,
            ManufacturedItem::Missile(_) => panic!("missile in combat catalog"),
        };
        assert_eq!(
            combat
                .rapid_fire
                .iter()
                .find(|rf| rf.shooter == item && rf.target == target.item)
                .map_or(1, |rf| rf.factor),
            expected,
            "{:?}",
            target.item
        );
    }
    let mut custom = active.artifact.clone();
    custom.ships.get_mut(&Dreadnought).unwrap().capacity += 1;
    let custom = Ruleset::from_artifact(custom, latest.speed).unwrap();
    assert!(matches!(
        upgrade_standard_rules(&custom),
        Err(StandardRulesError::Conflicts(_))
    ));
}

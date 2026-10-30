use orbit_engine::*;
#[allow(dead_code)]
mod common;
fn rules() -> Ruleset {
    Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-solar-satellite.json")).unwrap()
}
#[test]
fn satellite_rules_require_energy_cost_combat_and_stationary_inventory() {
    let r = rules();
    let old = Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-11.json")).unwrap();
    let delta = validate_rules_update(&old, &r).unwrap();
    assert!(delta.add_buildings.is_empty() && delta.add_research.is_empty());
    for invalid in 0..7 {
        let mut a = r.artifact.clone();
        match invalid {
            0 => a.progression.as_mut().unwrap().solar_satellite = None,
            1 => a
                .progression
                .as_mut()
                .unwrap()
                .unit_costs
                .retain(|u| u.item != ManufacturedItem::Ship(ShipType::SolarSatellite)),
            2 => a
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .retain(|u| u.item != ManufacturedItem::Ship(ShipType::SolarSatellite)),
            3 => {
                a.catalog
                    .iter_mut()
                    .find(|e| e.key == CatalogKey::Ship(ShipType::SolarSatellite))
                    .unwrap()
                    .mobile = true
            }
            4 => {
                a.progression
                    .as_mut()
                    .unwrap()
                    .solar_satellite
                    .as_mut()
                    .unwrap()
                    .temperature_divisor = 0
            }
            5 => {
                a.progression
                    .as_mut()
                    .unwrap()
                    .solar_satellite
                    .as_mut()
                    .unwrap()
                    .temperature_offset = 129
            }
            _ => {
                a.ships.insert(
                    ShipType::SolarSatellite,
                    a.ships[&ShipType::SmallCargo].clone(),
                );
            }
        }
        assert!(
            Ruleset::from_artifact(a, r.speed).is_err(),
            "invalid case {invalid}"
        );
    }
    assert!(validate_rules_update(&r, &old).is_err());
    let mut a = r.artifact.clone();
    a.catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::SolarSatellite))
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(a, r.speed).unwrap();
    assert!(validate_rules_update(&r, &disabled).is_ok());
    let (_, _, _, b) = common::fixture();
    let (s, _, _, _) = common::fixture();
    assert_eq!(
        solar_satellite_energy(&s.bodies[&b], &ProductionSettings::default(), 2, &disabled)
            .unwrap(),
        60 * SCALE
    );
}
#[test]
fn satellite_energy_floors_temperature_before_count_and_setting_without_speed_bonus() {
    let r = rules();
    let (s, _, _, b) = common::fixture();
    let mut body = s.bodies[&b].clone();
    body.levels.insert(Building::SolarPlant, 0);
    body.levels.insert(Building::MetalMine, 1);
    body.levels.insert(Building::CrystalMine, 1);
    for (temperature, unit) in [
        (-130, 1),
        (-129, 1),
        (-128, 2),
        (39, 29),
        (40, 30),
        (45, 30),
        (46, 31),
        (260, 66),
    ] {
        body.max_temperature = temperature;
        assert_eq!(
            solar_satellite_unit_energy(&body, &r).unwrap(),
            unit * SCALE
        );
        for setting in (0..=100).step_by(10) {
            let settings = ProductionSettings {
                solar_satellite: setting,
                ..Default::default()
            };
            assert_eq!(
                solar_satellite_energy(&body, &settings, 3, &r).unwrap(),
                unit * SCALE * 3 * i64::from(setting) / 100
            );
        }
    }
    body.max_temperature = 40;
    let settings = ProductionSettings {
        solar_satellite: 50,
        ..Default::default()
    };
    let energy = energy_with_settings(&body, &settings, 1, &r).unwrap();
    assert_eq!((energy.supply, energy.demand), (15 * SCALE, 22 * SCALE));
    assert_eq!(
        production_rates_with_settings(&body, &settings, 1, &r).unwrap(),
        Resources::from_values([525 * SCALE, 300 * SCALE, 0])
    );
    let mut slow_artifact = r.artifact.clone();
    slow_artifact.universe = Some(UniverseProfile::signup(1, 5).unwrap());
    let slow = Ruleset::from_artifact(slow_artifact, 1).unwrap();
    assert_eq!(
        energy_with_settings(&body, &settings, 1, &slow).unwrap(),
        energy
    );
    assert_eq!(
        production_rates_with_settings(&body, &settings, 1, &slow).unwrap(),
        Resources::from_values([52_500_000, 30 * SCALE, 0])
    );
    assert!(solar_satellite_energy(&body, &settings, i64::MAX, &r).is_err());
    body.max_temperature = -141;
    assert!(solar_satellite_energy(&body, &settings, 0, &r).is_err());
}
#[test]
fn satellite_counts_require_complete_inventory_and_validate_settings_by_profile() {
    let r = rules();
    let (mut s, _, p, b) = common::fixture();
    assert_eq!(solar_satellite_count(&s, &s.bodies[&b], &r).unwrap(), 0);
    s.inventories.push(InventoryStack {
        body: b,
        owner: p,
        item: ManufacturedItem::Ship(ShipType::SolarSatellite),
        count: 3,
        revision: 0,
    });
    assert_eq!(solar_satellite_count(&s, &s.bodies[&b], &r).unwrap(), 3);
    s.coverage.inventory_owners.clear();
    assert!(solar_satellite_count(&s, &s.bodies[&b], &r).is_err());
    s.coverage.inventory_owners.insert((b, p));
    s.inventories.push(s.inventories[0].clone());
    assert!(solar_satellite_count(&s, &s.bodies[&b], &r).is_err());
    for setting in [0, 50, 100] {
        let settings = ProductionSettings {
            solar_satellite: setting,
            ..Default::default()
        };
        assert!(settings.validate(&r).is_ok());
        assert_eq!(
            settings
                .validate(&Ruleset::mvp_progression().unwrap())
                .is_ok(),
            setting == 100
        );
    }
    assert!(
        ProductionSettings {
            solar_satellite: 15,
            ..Default::default()
        }
        .validate(&r)
        .is_err()
    );
}
#[test]
fn satellite_attackers_are_rejected_without_consuming_randomness() {
    use uuid::Uuid;
    let r = rules();
    let id = InputId(Uuid::from_u128(3));
    let mut random = RandomStream::new(
        &[7; 32],
        UniverseId(Uuid::from_u128(1)),
        Epoch(Uuid::from_u128(2)),
        id,
        "battle",
    )
    .unwrap();
    let input = BattleInput {
        encounter_id: id,
        at: 0,
        target: BodyId(Uuid::from_u128(4)),
        rules_hash: r.hash.clone(),
        participants: vec![BattleParticipant {
            owner: PlayerId(Uuid::from_u128(5)),
            origin: BattleOrigin::Fleet(FleetId(Uuid::from_u128(6))),
            side: BattleSide::Attacker,
            technology: [0; 3],
            units: vec![(ManufacturedItem::Ship(ShipType::SolarSatellite), 1)],
        }],
    };
    let cursor = random.cursor();
    assert!(
        resolve_battle(
            &input,
            &r.artifact.world.as_ref().unwrap().combat,
            &mut random
        )
        .is_err()
    );
    assert_eq!(random.cursor(), cursor);
}

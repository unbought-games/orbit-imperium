use orbit_engine::*;

fn body() -> Body {
    Body {
        name: None,
        id: BodyId::default(),
        universe: UniverseId::default(),
        owner: PlayerId::default(),
        kind: BodyKind::Planet,
        coordinates: Coordinates {
            galaxy: 1,
            system: 1,
            position: 8,
        },
        fields: 163,
        max_temperature: 40,
        retained_capacity: None,
        checkpoint: ResourceCheckpoint {
            amounts: Resources::all(0),
            carry: Resources::all(0),
            at: 0,
        },
        levels: Building::MVP.into_iter().map(|b| (b, 0)).collect(),
        revision: 0,
    }
}
fn rules(speed: i32) -> Ruleset {
    Ruleset::signup_with_speed(UniverseProfile::signup(1, 100).unwrap(), speed).unwrap()
}
fn travel(rules: &Ruleset) -> TravelTerms {
    travel_terms(
        &TransportTermsRequest {
            origin: Coordinates {
                galaxy: 1,
                system: 1,
                position: 8,
            },
            target: Coordinates {
                galaxy: 1,
                system: 1,
                position: 9,
            },
            ships: vec![ShipStack {
                owner: PlayerId::default(),
                ship_type: ShipType::SmallCargo,
                count: 2,
            }],
            combustion: 1,
            speed_percent: 100,
        },
        rules,
    )
    .unwrap()
}

#[test]
fn all_production_speeds_preserve_economy_energy_storage_and_travel_rounding() {
    let mut body = body();
    for b in [
        Building::MetalMine,
        Building::CrystalMine,
        Building::DeuteriumSynthesizer,
    ] {
        body.levels.insert(b, 1);
    }
    body.levels.insert(Building::SolarPlant, 10);
    let baseline = rules(1);
    let energy = energy_stats(&body, &baseline).unwrap();
    // Level-one production at Tmax=40 with full energy: 63, 37, 14.08/hour.
    let per_hour = [63 * SCALE, 37 * SCALE, 1408 * SCALE / 100];
    for speed in 1..=100 {
        let rules = rules(speed);
        let scale = i64::from(speed);
        let rates = production_rates(&body, &rules).unwrap();
        assert_eq!(rates.values(), per_hour.map(|n| n * scale), "speed {speed}");
        let checkpoint = settle_economy(&body, 3600, &rules).unwrap();
        assert_eq!(
            checkpoint.amounts.values(),
            per_hour.map(|n| n * scale / 1000)
        );
        assert_eq!(checkpoint.at, 3600);
        assert_eq!(energy_stats(&body, &rules).unwrap(), energy);
        assert_eq!(
            body_storage_capacity(&body, &rules).unwrap(),
            Resources::all(10_000 * SCALE)
        );
        let terms = travel(&rules);
        assert!(terms.duration > 0 && terms.duration % 1000 == 0);
        assert_eq!(terms.fuel, 3 * SCALE);
        assert_eq!(terms.capacity, 10_000 * SCALE);
        assert_eq!(terms.maximum_payload, 9997 * SCALE);
        // Unspeeded adjacent travel is 4741.182823... seconds. Half-up rounding
        // must remain within half a second for every lifetime speed.
        assert!((terms.duration * scale - 4_741_183).abs() <= 500 * scale);
    }
    for (speed, milliseconds) in [(1, 4_741_000), (5, 948_000), (10, 474_000), (100, 47_000)] {
        assert_eq!(travel(&rules(speed)).duration, milliseconds);
    }
}

#[test]
fn all_enabled_build_research_and_manufacture_terms_scale_at_each_speed() {
    let body = body();
    let levels = ResearchLevels {
        owner: body.owner,
        levels: ResearchId::MVP.into_iter().map(|r| (r, 0)).collect(),
        revision: 0,
    };
    let baseline = rules(1);
    let progression = baseline.artifact.progression.as_ref().unwrap();
    for speed in 1..=100 {
        let rules = rules(speed);
        let multiplier = i64::from(speed);
        for entry in baseline
            .artifact
            .catalog
            .iter()
            .filter(|entry| entry.enabled)
        {
            match entry.key {
                CatalogKey::Building(building) => {
                    let terms =
                        building_terms(&body, building, BuildingAction::Upgrade, &rules).unwrap();
                    let base = baseline.artifact.buildings[&building].base;
                    let raw_seconds = 3600 * (base[0] + base[1]) / (2500 * multiplier);
                    let seconds = if raw_seconds >= 100 {
                        raw_seconds - 90
                    } else {
                        raw_seconds.max(1)
                    };
                    assert_eq!(terms.duration(), seconds * 1000, "{speed}/{building:?}");
                    assert_eq!(terms.paid().values(), base.map(|n| n * SCALE));
                }
                CatalogKey::Research(research) => {
                    let terms = research_terms(&body, &levels, research, &rules).unwrap();
                    let base = progression.research[&research].base;
                    let seconds = (3600 * (base[0] + base[1]) / (1000 * multiplier)).max(1);
                    assert_eq!(terms.duration(), seconds * 1000, "{speed}/{research:?}");
                    assert_eq!(terms.paid().values(), base.map(|n| n * SCALE));
                }
                key => {
                    let item = match key {
                        CatalogKey::Ship(ship) => ManufacturedItem::Ship(ship),
                        CatalogKey::Defense(defense) => ManufacturedItem::Defense(defense),
                        CatalogKey::Missile(missile) => ManufacturedItem::Missile(missile),
                        _ => unreachable!(),
                    };
                    let cost = progression
                        .unit_costs
                        .iter()
                        .find(|unit| unit.item == item)
                        .unwrap()
                        .cost;
                    let terms = manufacture_terms(&body, item, 3, &rules).unwrap();
                    let seconds = (3600 * (cost.metal + cost.crystal) / (2500 * multiplier)).max(1);
                    assert_eq!(terms.duration(), seconds * 1000, "{speed}/{item:?}");
                    assert_eq!(terms.paid().values(), cost.values().map(|n| n * 3 * SCALE));
                    assert!(manufacture_terms(&body, item, i64::MAX, &rules).is_err());
                }
            }
        }
    }
}

#[test]
fn catalog_updates_at_non_ten_speeds_retain_lifetime_settings() {
    for speed in [1, 5, 100] {
        let current = rules(speed);
        let mut artifact = current.artifact.clone();
        artifact
            .buildings
            .get_mut(&Building::MetalMine)
            .unwrap()
            .base[0] += 1;
        let next = Ruleset::from_artifact(artifact, speed).unwrap();
        validate_rules_update(&current, &next).unwrap();
        assert_ne!(current.hash, next.hash);
        assert!(
            validate_rules_update(
                &current,
                &next
                    .clone()
                    .with_speed(if speed == 1 { 5 } else { 1 })
                    .unwrap()
            )
            .is_err()
        );
        let mut topology = next.artifact.clone();
        topology.universe.as_mut().unwrap().galaxies = 2;
        assert!(
            validate_rules_update(&current, &Ruleset::from_artifact(topology, speed).unwrap())
                .is_err()
        );
    }
}

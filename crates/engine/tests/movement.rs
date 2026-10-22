use orbit_engine::*;
#[test]
fn independent_g07_vectors_and_probe_floor() {
    for (profiles, d, p, s, t, f) in [
        (vec![(10000, 50, 2)], 2795, 100, 1, 5861, 33),
        (vec![(10000, 50, 2)], 2795, 50, 1, 11713, 19),
        (
            vec![(12000, 50, 2), (3200, 300, 1)],
            2795,
            100,
            1,
            10354,
            115,
        ),
        (vec![(4000, 1000, 1)], 1035, 100, 1, 5640, 119),
        (vec![(130000000, 1, 1)], 5, 100, 1, 12, 1),
        (vec![(130000000, 1, 1)], 5, 100, 10, 2, 1),
        (vec![(130000000, 1, 1)], 1005, 100, 100, 1, 1),
    ] {
        assert_eq!(
            exact_flight_arithmetic(d, &profiles, p, s).unwrap(),
            (t * 1000, f * SCALE)
        );
    }
}
#[test]
fn minimum_safe_duration_grid() {
    for s in 1..=100 {
        for p in (10..=100).step_by(10) {
            let (ms, _) = exact_flight_arithmetic(5, &[(130000000, 1, 1)], p, s).unwrap();
            assert!(ms / 1000 * s > 10);
        }
    }
}
#[test]
fn exact_half_with_a_non_dyadic_rational_root() {
    // sqrt(1000*1035/5635000)=3/7, so raw duration at P80/S1 is 197.5.
    // Both roots in the fuel expression are rational too (3/70 for fuel).
    assert_eq!(
        exact_flight_arithmetic(1035, &[(5635000, 10, 1)], 80, 1).unwrap(),
        (198000, 2 * SCALE)
    );
}

#[allow(dead_code)]
mod common;
#[test]
fn completed_impulse_selects_entire_cargo_profile_without_stacking_or_recycler_switches() {
    let r = common::impulse_rules(&Ruleset::mvp_raids().unwrap());
    let mut levels = ResearchLevels {
        owner: PlayerId(uuid::Uuid::nil()),
        revision: 0,
        levels: r.research_keys().into_iter().map(|k| (k, 0)).collect(),
    };
    levels.levels.insert(ResearchId::CombustionDrive, 6);
    levels.levels.insert(ResearchId::ImpulseDrive, 4);
    let cargo = &r.artifact.ships[&ShipType::SmallCargo];
    assert_eq!(ship_propulsion(cargo, &levels).unwrap(), (8000, 10));
    levels.levels.insert(ResearchId::ImpulseDrive, 5);
    assert_eq!(ship_propulsion(cargo, &levels).unwrap(), (20000, 20));
    levels.levels.insert(ResearchId::CombustionDrive, 100);
    assert_eq!(ship_propulsion(cargo, &levels).unwrap(), (20000, 20));
    levels.levels.insert(ResearchId::CombustionDrive, 6);
    levels.levels.insert(ResearchId::ImpulseDrive, 17);
    for (ship, expected) in [
        (ShipType::Recycler, (3200, 300)),
        (ShipType::LightFighter, (20000, 20)),
        (ShipType::EspionageProbe, (160000000, 1)),
    ] {
        assert_eq!(
            ship_propulsion(&r.artifact.ships[&ship], &levels).unwrap(),
            expected
        );
    }
    // A retained artifact still selects the old profile, even with high research facts.
    assert_eq!(
        ship_propulsion(
            &Ruleset::mvp_raids().unwrap().artifact.ships[&ShipType::SmallCargo],
            &levels
        )
        .unwrap(),
        (8000, 10)
    );
    let mut extreme = cargo.clone();
    extreme.impulse_drive = None;
    extreme.base_speed = i64::MAX;
    extreme.drive_coefficient = [i64::MAX, 1];
    levels.levels.insert(ResearchId::CombustionDrive, u32::MAX);
    assert_eq!(
        ship_propulsion(&extreme, &levels),
        Err(GameError::NumericRange)
    );
}

use orbit_engine::*;
#[allow(dead_code)]
mod common;

#[test]
fn completed_capacity_excludes_homeworld_and_has_no_nine_planet_cap() {
    for (level, planets) in [
        (0, 1),
        (1, 2),
        (2, 2),
        (3, 3),
        (4, 3),
        (5, 4),
        (6, 4),
        (7, 5),
        (8, 5),
        (9, 6),
        (15, 9),
        (16, 9),
        (17, 10),
    ] {
        assert_eq!(astrophysics_planet_capacity(level), planets);
        assert_eq!(astrophysics_colony_capacity(level), planets - 1);
        assert!(!colony_capacity_available(level, planets.into()));
        assert!(!colony_capacity_available(level, u64::MAX));
        assert!(!colony_capacity_available(level, 0)); // no homeworld is not valid player membership
        if planets > 1 {
            assert!(colony_capacity_available(level, (planets - 1).into()));
        }
    }
    assert_eq!(astrophysics_colony_capacity(u32::MAX), 2_147_483_648);
    assert_eq!(astrophysics_planet_capacity(u32::MAX), 2_147_483_649);
}

#[test]
fn positions_are_symmetric_and_level_zero_never_allows_a_colony() {
    for (position, required) in [
        (1, 8),
        (2, 6),
        (3, 4),
        (4, 1),
        (5, 1),
        (6, 1),
        (7, 1),
        (8, 1),
        (9, 1),
        (10, 1),
        (11, 1),
        (12, 1),
        (13, 4),
        (14, 6),
        (15, 8),
    ] {
        assert_eq!(
            colony_position_required_astrophysics(position),
            Some(required)
        );
        assert!(!colony_position_unlocked(0, position));
        assert!(!colony_position_unlocked(required - 1, position));
        assert!(colony_position_unlocked(required, position));
        assert!(colony_position_unlocked(u32::MAX, position));
    }
    for position in [0, 16, 17, u32::MAX] {
        assert_eq!(colony_position_required_astrophysics(position), None);
        assert!(!colony_position_unlocked(u32::MAX, position));
    }
    // Launch gate intentionally remains true when the arrival count gate is false.
    assert!(colony_position_unlocked(1, 12));
    assert!(!colony_capacity_available(1, 2));
}

#[test]
fn exact_base_derived_costs_ties_and_duration_use_rounded_payments() {
    let (_, _, player, _) = common::fixture();
    let mut body = common::fixture().0.bodies.into_values().next().unwrap();
    body.levels = Building::MVP.into_iter().map(|key| (key, 0)).collect();
    body.levels.insert(Building::ResearchLab, 3);
    let r = common::astrophysics_rules(
        &Ruleset::signup_with_speed(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap(),
    );
    let mut levels = ResearchLevels {
        owner: player,
        levels: r.research_keys().into_iter().map(|key| (key, 0)).collect(),
        revision: 0,
    };
    for (target, costs, millis) in [
        (1, [4000, 8000, 4000], 2_160_000),
        (2, [7000, 14000, 7000], 3_780_000),
        (3, [12300, 24500, 12300], 6_624_000), // exact metal 12250 ties upward
        (4, [21400, 42900, 21400], 11_574_000),
        (5, [37500, 75000, 37500], 20_250_000), // raw base, NOT round(21400*1.75)
        (6, [65700, 131300, 65700], 35_460_000),
    ] {
        levels.levels.insert(ResearchId::Astrophysics, target - 1);
        let terms = research_terms(&body, &levels, ResearchId::Astrophysics, &r).unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values(costs.map(|v| v * SCALE))
        );
        assert_eq!(terms.duration(), millis);
        assert!(
            matches!(terms, ProgressionMaterial::Research { formula, .. } if formula == "ResearchAstrophysics")
        );
    }
    levels.levels.insert(ResearchId::Astrophysics, 0);
    body.levels.insert(Building::ResearchLab, 6);
    body.levels.insert(Building::RoboticsFactory, 10);
    for (speed, millis) in [(1, 6_171_000), (5, 1_234_000), (100, 61_000)] {
        let r = r.clone().with_speed(speed).unwrap();
        assert_eq!(
            research_terms(&body, &levels, ResearchId::Astrophysics, &r)
                .unwrap()
                .duration(),
            millis
        );
    }
    body.levels.insert(Building::ResearchLab, u32::MAX);
    assert_eq!(
        research_terms(&body, &levels, ResearchId::Astrophysics, &r)
            .unwrap()
            .duration(),
        1000
    );
    levels.levels.insert(ResearchId::Astrophysics, u32::MAX);
    assert_eq!(
        research_terms(&body, &levels, ResearchId::Astrophysics, &r),
        Err(GameError::NumericRange)
    );
    levels.levels.insert(ResearchId::Astrophysics, 100);
    assert_eq!(
        research_terms(&body, &levels, ResearchId::Astrophysics, &r),
        Err(GameError::NumericRange)
    );
}

#[test]
fn rules_validate_special_growth_dependencies_and_retain_supported_definitions() {
    let old = common::impulse_rules(&Ruleset::mvp_raids().unwrap());
    let next = common::astrophysics_rules(&old);
    assert_eq!(
        validate_rules_update(&old, &next).unwrap().add_research,
        vec![ResearchId::Astrophysics]
    );
    assert!(validate_rules_update(&next, &old).is_err());
    for growth in [[2, 1], [7, 0], [0, 4], [175, 100]] {
        let mut a = next.artifact.clone();
        a.progression
            .as_mut()
            .unwrap()
            .research
            .get_mut(&ResearchId::Astrophysics)
            .unwrap()
            .growth = growth;
        assert!(Ruleset::from_artifact(a, next.speed).is_err());
    }
    let mut a = next.artifact.clone();
    a.catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::ImpulseDrive))
        .unwrap()
        .enabled = false;
    assert!(Ruleset::from_artifact(a, next.speed).is_err());
    let mut a = next.artifact.clone();
    a.catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::Astrophysics))
        .unwrap()
        .enabled = false;
    assert!(validate_rules_update(&next, &Ruleset::from_artifact(a, next.speed).unwrap()).is_ok());
    assert!(
        !next
            .artifact
            .catalog
            .iter()
            .find(|e| e.key == CatalogKey::Ship(ShipType::ColonyShip))
            .unwrap()
            .enabled
    );
}

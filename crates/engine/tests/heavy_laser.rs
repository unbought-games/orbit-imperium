use orbit_engine::*;
use uuid::Uuid;
#[allow(dead_code)]
mod common;

#[test]
fn heavy_laser_fixture_is_additive_and_needs_no_level_initialization() {
    let old = Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-11.json")).unwrap();
    let next =
        Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-heavy-laser.json")).unwrap();
    let delta = validate_rules_update(&old, &next).unwrap();
    assert!(delta.add_research.is_empty());
    assert!(delta.add_buildings.is_empty());
    assert_eq!(old.protocol(), next.protocol());
    let mut expected = common::heavy_laser_rules(&old).artifact;
    expected.id = next.artifact.id.clone();
    assert_eq!(next.artifact, expected);
    assert!(validate_rules_update(&next, &old).is_err());
    let item = ManufacturedItem::Defense(DefenseId::HeavyLaser);
    for key in [
        CatalogKey::Building(Building::Shipyard),
        CatalogKey::Research(ResearchId::EnergyTechnology),
        CatalogKey::Research(ResearchId::LaserTechnology),
    ] {
        let mut artifact = next.artifact.clone();
        artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == key)
            .unwrap()
            .enabled = false;
        assert!(Ruleset::from_artifact(artifact, next.speed).is_err());
    }
    for missing_combat in [true, false] {
        let mut artifact = next.artifact.clone();
        if missing_combat {
            artifact
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .retain(|u| u.item != item);
        } else {
            artifact
                .progression
                .as_mut()
                .unwrap()
                .unit_costs
                .retain(|u| u.item != item);
        }
        assert!(Ruleset::from_artifact(artifact, next.speed).is_err());
    }
    let mut mismatch = next.artifact.clone();
    mismatch
        .world
        .as_mut()
        .unwrap()
        .combat
        .units
        .iter_mut()
        .find(|u| u.item == item)
        .unwrap()
        .cost[0] += 1;
    assert!(Ruleset::from_artifact(mismatch, next.speed).is_err());
    let mut disabled = next.artifact.clone();
    disabled
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap()
        .enabled = false;
    assert!(
        validate_rules_update(
            &next,
            &Ruleset::from_artifact(disabled, next.speed).unwrap()
        )
        .is_ok()
    );
}

#[test]
fn heavy_laser_combat_uses_cost_derived_hull_and_combat_technologies_without_rapid_fire() {
    let r = common::heavy_laser_rules(&common::light_laser_rules(&Ruleset::mvp_raids().unwrap()));
    let mut combat = r.artifact.world.as_ref().unwrap().combat.clone();
    combat.max_rounds = 1;
    let item = ManufacturedItem::Defense(DefenseId::HeavyLaser);
    assert!(
        combat
            .rapid_fire
            .iter()
            .all(|rf| rf.shooter != item && rf.target != item)
    );
    let target = BodyId(Uuid::from_u128(2));
    for level in [0, 1, 10] {
        let input = BattleInput {
            encounter_id: InputId(Uuid::from_u128(3)),
            at: 0,
            target,
            rules_hash: r.hash.clone(),
            participants: vec![
                BattleParticipant {
                    owner: PlayerId(Uuid::from_u128(4)),
                    origin: BattleOrigin::Fleet(FleetId(Uuid::from_u128(5))),
                    side: BattleSide::Attacker,
                    technology: [0; 3],
                    units: vec![(ManufacturedItem::Ship(ShipType::SmallCargo), 1)],
                },
                BattleParticipant {
                    owner: PlayerId(Uuid::from_u128(6)),
                    origin: BattleOrigin::Stationed(target),
                    side: BattleSide::Defender,
                    technology: [level; 3],
                    units: vec![(item, 1)],
                },
            ],
        };
        let mut rng = RandomStream::new(
            &[7; 32],
            UniverseId(Uuid::from_u128(1)),
            Epoch(Uuid::from_u128(2)),
            input.encounter_id,
            "battle",
        )
        .unwrap();
        let result = resolve_battle(&input, &combat, &mut rng).unwrap();
        let fire = result.rounds[0]
            .fire
            .iter()
            .find(|v| v.side == BattleSide::Defender)
            .unwrap();
        assert_eq!(fire.shots, "1");
        assert_eq!(
            fire.raw_attack_ticks,
            (250 * 100_000 * (10 + u64::from(level)) / 10).to_string()
        );
        let damage = result.damage.iter().find(|v| v.item == item).unwrap();
        assert_eq!(
            damage.hull_ticks,
            (800 * 100_000 * (10 + u64::from(level)) / 10).to_string()
        );
        let shield = 100 * 100_000 * (10 + u64::from(level)) / 10;
        let removed = (100 * 5 * 100_000 / shield) * (shield / 100);
        assert_eq!(damage.shield_ticks, (shield - removed).to_string());
    }
}

#[test]
fn heavy_laser_manufacturing_uses_exact_batch_cost_and_floored_unit_duration() {
    let (state, _, _, body) = common::fixture();
    let mut planet = state.bodies[&body].clone();
    planet.levels.insert(Building::Shipyard, 4);
    for (speed, unit_duration_ms) in [(1, 2_304_000), (5, 460_000), (10, 230_000)] {
        let rules =
            Ruleset::signup_with_speed(UniverseProfile::signup(1, 5).unwrap(), speed).unwrap();
        let rules = common::heavy_laser_rules(&common::light_laser_rules(&rules));
        let terms = manufacture_terms(
            &planet,
            ManufacturedItem::Defense(DefenseId::HeavyLaser),
            3,
            &rules,
        )
        .unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values([18000 * SCALE, 6000 * SCALE, 0])
        );
        assert_eq!(terms.duration(), unit_duration_ms);
        assert!(
            matches!(terms, ProgressionMaterial::Manufacture { unit_duration_ms: actual, .. } if actual == unit_duration_ms)
        );
    }
}

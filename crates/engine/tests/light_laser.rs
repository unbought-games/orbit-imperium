use orbit_engine::*;
use uuid::Uuid;
#[allow(dead_code)]
mod common;

#[test]
fn combined_slice_preserves_heavy_fighters_when_adding_lasers() {
    let previous =
        Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-7.json")).unwrap();
    let next = Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-8.json")).unwrap();
    assert_eq!(
        validate_rules_update(&previous, &next)
            .unwrap()
            .add_research,
        vec![ResearchId::LaserTechnology]
    );
    let mut expected = common::light_laser_rules(&previous).artifact;
    expected.id = next.artifact.id.clone();
    assert_eq!(next.artifact, expected);
}

#[test]
fn activation_requires_research_costs_and_combat_and_cannot_remove_retained_definitions() {
    let old = Ruleset::mvp_raids().unwrap();
    let next = common::light_laser_rules(&old);
    assert_eq!(next.protocol(), old.protocol());
    let delta = validate_rules_update(&old, &next).unwrap();
    assert_eq!(delta.add_research, vec![ResearchId::LaserTechnology]);
    assert!(delta.add_buildings.is_empty());
    assert!(validate_rules_update(&next, &old).is_err());
    for key in [
        CatalogKey::Research(ResearchId::LaserTechnology),
        CatalogKey::Research(ResearchId::EnergyTechnology),
        CatalogKey::Building(Building::Shipyard),
    ] {
        let mut a = next.artifact.clone();
        a.catalog.iter_mut().find(|e| e.key == key).unwrap().enabled = false;
        assert!(Ruleset::from_artifact(a, next.speed).is_err());
    }
    let item = ManufacturedItem::Defense(DefenseId::LightLaser);
    let mut a = next.artifact.clone();
    a.world
        .as_mut()
        .unwrap()
        .combat
        .units
        .retain(|u| u.item != item);
    assert!(Ruleset::from_artifact(a, next.speed).is_err());
    let mut a = next.artifact.clone();
    a.progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != item);
    assert!(Ruleset::from_artifact(a, next.speed).is_err());
    let mut a = next.artifact.clone();
    for key in [
        item.catalog_key(),
        CatalogKey::Research(ResearchId::LaserTechnology),
    ] {
        a.catalog.iter_mut().find(|e| e.key == key).unwrap().enabled = false;
    }
    assert!(validate_rules_update(&next, &Ruleset::from_artifact(a, next.speed).unwrap()).is_ok());
}

#[test]
fn light_laser_combat_uses_cost_derived_hull_and_combat_technologies_without_rapid_fire() {
    let r = common::light_laser_rules(&Ruleset::mvp_raids().unwrap());
    let mut combat = r.artifact.world.as_ref().unwrap().combat.clone();
    combat.max_rounds = 1;
    let item = ManufacturedItem::Defense(DefenseId::LightLaser);
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
            (100 * 100_000 * (10 + u64::from(level)) / 10).to_string()
        );
        let damage = result.damage.iter().find(|v| v.item == item).unwrap();
        assert_eq!(
            damage.hull_ticks,
            (200 * 100_000 * (10 + u64::from(level)) / 10).to_string()
        );
        let shield = 25 * 100_000 * (10 + u64::from(level)) / 10;
        let removed = (100 * 5 * 100_000 / shield) * (shield / 100);
        assert_eq!(damage.shield_ticks, (shield - removed).to_string());
    }
}

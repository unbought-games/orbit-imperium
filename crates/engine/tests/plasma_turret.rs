use orbit_engine::*;
use uuid::Uuid;
#[allow(dead_code)]
mod common;

#[test]
fn plasma_turret_combat_uses_cost_derived_hull_and_combat_technologies_without_rapid_fire() {
    let r = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap();
    let mut combat = r.artifact.world.as_ref().unwrap().combat.clone();
    combat.max_rounds = 1;
    let item = ManufacturedItem::Defense(DefenseId::PlasmaTurret);
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
            (3000 * 100_000 * (10 + u64::from(level)) / 10).to_string()
        );
        let damage = result.damage.iter().find(|v| v.item == item).unwrap();
        assert_eq!(
            damage.hull_ticks,
            (10000 * 100_000 * (10 + u64::from(level)) / 10).to_string()
        );
        let shield = 300 * 100_000 * (10 + u64::from(level)) / 10;
        let removed = (100 * 5 * 100_000 / shield) * (shield / 100);
        assert_eq!(damage.shield_ticks, (shield - removed).to_string());
    }
}

#[test]
fn plasma_turret_manufacturing_uses_exact_batch_cost_and_floored_unit_duration() {
    let (state, _, _, body) = common::fixture();
    let mut planet = state.bodies[&body].clone();
    planet.levels.insert(Building::Shipyard, 8);
    for (speed, unit_duration_ms) in [
        (1, 16_000_000),
        (5, 3_200_000),
        (7, 2_285_000),
        (10, 1_600_000),
    ] {
        let rules = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), speed).unwrap();
        let terms = manufacture_terms(
            &planet,
            ManufacturedItem::Defense(DefenseId::PlasmaTurret),
            3,
            &rules,
        )
        .unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values([150000 * SCALE, 150000 * SCALE, 90000 * SCALE])
        );
        assert_eq!(terms.duration(), unit_duration_ms);
        assert!(
            matches!(terms, ProgressionMaterial::Manufacture { unit_duration_ms: actual, .. } if actual == unit_duration_ms)
        );
    }
}

#[test]
fn turret_only_upgrade_preserves_existing_rules_without_initialization() {
    let latest = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap();
    let item = ManufacturedItem::Defense(DefenseId::PlasmaTurret);
    let mut old = latest.artifact.clone();
    old.progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != item);
    old.world
        .as_mut()
        .unwrap()
        .combat
        .units
        .retain(|u| u.item != item);
    let entry = old
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    let old = Ruleset::from_artifact(old, latest.speed).unwrap();
    let next = upgrade_standard_rules(&old).unwrap();
    assert_eq!(next, latest);
    let delta = validate_rules_update(&old, &next).unwrap();
    assert!(delta.add_research.is_empty() && delta.add_buildings.is_empty());
    assert_eq!(old.protocol(), next.protocol());
    assert_eq!(upgrade_standard_rules(&next).unwrap(), next);
    assert!(validate_rules_update(&next, &old).is_err());
    for missing in ["combat", "cost", "plasma", "shipyard"] {
        let mut broken = next.artifact.clone();
        match missing {
            "combat" => broken
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .retain(|u| u.item != item),
            "cost" => broken
                .progression
                .as_mut()
                .unwrap()
                .unit_costs
                .retain(|u| u.item != item),
            _ => {
                let key = if missing == "plasma" {
                    CatalogKey::Research(ResearchId::PlasmaTechnology)
                } else {
                    CatalogKey::Building(Building::Shipyard)
                };
                broken
                    .catalog
                    .iter_mut()
                    .find(|e| e.key == key)
                    .unwrap()
                    .enabled = false;
            }
        }
        assert!(
            Ruleset::from_artifact(broken, next.speed).is_err(),
            "{missing}"
        );
    }
}

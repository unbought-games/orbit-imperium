use orbit_engine::*;
use uuid::Uuid;
#[allow(dead_code)]
mod common;

fn rules() -> Ruleset {
    Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-11.json")).unwrap()
}

#[test]
fn cruiser_activation_requires_complete_definitions_and_preserves_retained_rules() {
    let old = Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-10.json")).unwrap();
    let next = rules();
    let delta = validate_rules_update(&old, &next).unwrap();
    assert!(delta.add_research.is_empty());
    assert!(delta.add_buildings.is_empty());
    assert!(!old.artifact.ships.contains_key(&ShipType::Cruiser));
    for missing in 0..6 {
        let mut a = next.artifact.clone();
        match missing {
            0 => {
                a.ships.remove(&ShipType::Cruiser);
            }
            1 => a
                .progression
                .as_mut()
                .unwrap()
                .unit_costs
                .retain(|c| c.item != ManufacturedItem::Ship(ShipType::Cruiser)),
            2 => a
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .retain(|c| c.item != ManufacturedItem::Ship(ShipType::Cruiser)),
            3 => {
                a.progression
                    .as_mut()
                    .unwrap()
                    .research
                    .remove(&ResearchId::ImpulseDrive);
            }
            4 => {
                a.progression
                    .as_mut()
                    .unwrap()
                    .research
                    .remove(&ResearchId::IonTechnology);
            }
            _ => {
                a.catalog
                    .iter_mut()
                    .find(|e| e.key == CatalogKey::Research(ResearchId::IonTechnology))
                    .unwrap()
                    .enabled = false
            }
        }
        assert!(
            Ruleset::from_artifact(a, next.speed).is_err(),
            "missing {missing}"
        );
    }
    let mut disabled = next.artifact.clone();
    disabled
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::Cruiser))
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(disabled, next.speed).unwrap();
    assert!(validate_rules_update(&next, &disabled).is_ok());
    assert!(validate_rules_update(&next, &old).is_err());
    let mut invalid = next.artifact.clone();
    invalid
        .ships
        .get_mut(&ShipType::LightFighter)
        .unwrap()
        .drive = Some(ResearchId::ImpulseDrive);
    assert!(Ruleset::from_artifact(invalid, next.speed).is_err());
}

#[test]
fn cruiser_uses_only_impulse_and_keeps_its_fuel_coefficient() {
    let r = rules();
    let mut levels = ResearchLevels {
        owner: PlayerId(Uuid::nil()),
        revision: 0,
        levels: r.research_keys().into_iter().map(|k| (k, 0)).collect(),
    };
    levels.levels.insert(ResearchId::CombustionDrive, 100);
    for (level, speed) in [(0, 15000), (4, 27000), (5, 30000), (17, 66000)] {
        levels.levels.insert(ResearchId::ImpulseDrive, level);
        assert_eq!(
            ship_propulsion(&r.artifact.ships[&ShipType::Cruiser], &levels).unwrap(),
            (speed, 300)
        );
    }
}

fn battle(target: ManufacturedItem, technology: [u32; 3]) -> BattleInput {
    BattleInput {
        encounter_id: InputId(Uuid::from_u128(3)),
        at: 0,
        target: BodyId(Uuid::from_u128(4)),
        rules_hash: rules().hash,
        participants: vec![
            BattleParticipant {
                owner: PlayerId(Uuid::from_u128(1)),
                side: BattleSide::Attacker,
                origin: BattleOrigin::Fleet(FleetId(Uuid::from_u128(5))),
                technology,
                units: vec![(ManufacturedItem::Ship(ShipType::Cruiser), 1)],
            },
            BattleParticipant {
                owner: PlayerId(Uuid::from_u128(2)),
                side: BattleSide::Defender,
                origin: BattleOrigin::Stationed(BodyId(Uuid::from_u128(4))),
                technology,
                units: vec![(target, 1)],
            },
        ],
    }
}
fn random(seed: u8) -> RandomStream {
    RandomStream::new(
        &[seed; 32],
        UniverseId(Uuid::from_u128(1)),
        Epoch(Uuid::from_u128(2)),
        InputId(Uuid::from_u128(3)),
        "battle",
    )
    .unwrap()
}

#[test]
fn cruiser_combat_derives_hull_and_research_bonuses() {
    let mut combat = rules().artifact.world.unwrap().combat;
    combat.max_rounds = 1;
    for (technology, hull, attack, shield, damage) in [
        ([0, 0, 0], "235000000", "40000000", "5000000", "35000000"),
        ([2, 4, 2], "283000000", "48000000", "7000000", "41000000"),
    ] {
        let result = resolve_battle(
            &battle(ManufacturedItem::Ship(ShipType::Cruiser), technology),
            &combat,
            &mut random(7),
        )
        .unwrap();
        assert_eq!(result.outcome, BattleOutcome::Draw);
        assert_eq!(result.damage.len(), 2);
        for unit in result.damage {
            assert_eq!(unit.hull_ticks, hull);
            assert_eq!(unit.shield_ticks, "0");
        }
        for fire in &result.rounds[0].fire {
            assert_eq!(fire.shots, "1");
            assert_eq!(fire.raw_attack_ticks, attack);
            assert_eq!(fire.shield_removed_ticks, shield);
            assert_eq!(fire.hull_removed_ticks, damage);
        }
    }
}

#[test]
fn cruiser_rapid_fire_applies_only_to_light_fighters_rockets_and_probes() {
    let mut combat = rules().artifact.world.unwrap().combat;
    combat.max_rounds = 1;
    for unit in &combat.units {
        let target = unit.item;
        let factor = match target {
            ManufacturedItem::Ship(ShipType::LightFighter) => 6,
            ManufacturedItem::Defense(DefenseId::RocketLauncher) => 10,
            ManufacturedItem::Ship(ShipType::EspionageProbe) => 5,
            _ => 1,
        };
        let configured = combat
            .rapid_fire
            .iter()
            .find(|rf| {
                rf.shooter == ManufacturedItem::Ship(ShipType::Cruiser) && rf.target == target
            })
            .map_or(1, |rf| rf.factor);
        assert_eq!(configured, factor);
        let shots: Vec<u64> = (0..16)
            .map(|seed| {
                let result =
                    resolve_battle(&battle(target, [0; 3]), &combat, &mut random(seed)).unwrap();
                result.rounds[0]
                    .fire
                    .iter()
                    .find(|f| f.side == BattleSide::Attacker)
                    .unwrap()
                    .shots
                    .parse()
                    .unwrap()
            })
            .collect();
        if factor == 1 {
            assert!(shots.iter().all(|n| *n == 1));
        } else {
            assert!(shots.iter().any(|n| *n > 1));
        }
    }
}

#[test]
fn cruiser_manufacturing_charges_deuterium_but_times_only_metal_and_crystal() {
    let mut artifact = rules().artifact;
    artifact.universe = Some(UniverseProfile::signup(1, 5).unwrap());
    for (speed, seconds) in [(1, 6480), (5, 1296), (10, 648)] {
        let r = Ruleset::from_artifact(artifact.clone(), speed).unwrap();
        let (state, _, _, body_id) = common::fixture();
        let mut body = state.bodies[&body_id].clone();
        body.levels.insert(Building::Shipyard, 5);
        let terms =
            manufacture_terms(&body, ManufacturedItem::Ship(ShipType::Cruiser), 3, &r).unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values([60000 * SCALE, 21000 * SCALE, 6000 * SCALE])
        );
        assert_eq!(terms.duration(), seconds * 1000);
    }
}

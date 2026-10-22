use orbit_engine::*;
use uuid::Uuid;

fn rules() -> Ruleset {
    Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-7.json")).unwrap()
}

#[test]
fn heavy_fighter_activation_requires_complete_definitions_and_preserves_retained_rules() {
    let old = Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-6.json")).unwrap();
    let next = rules();
    let delta = validate_rules_update(&old, &next).unwrap();
    assert!(delta.add_research.is_empty());
    assert!(delta.add_buildings.is_empty());
    assert!(!old.artifact.ships.contains_key(&ShipType::HeavyFighter));
    for missing in 0..5 {
        let mut a = next.artifact.clone();
        match missing {
            0 => {
                a.ships.remove(&ShipType::HeavyFighter);
            }
            1 => a
                .progression
                .as_mut()
                .unwrap()
                .unit_costs
                .retain(|c| c.item != ManufacturedItem::Ship(ShipType::HeavyFighter)),
            2 => a
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .retain(|c| c.item != ManufacturedItem::Ship(ShipType::HeavyFighter)),
            3 => {
                a.progression
                    .as_mut()
                    .unwrap()
                    .research
                    .remove(&ResearchId::ImpulseDrive);
            }
            _ => {
                a.catalog
                    .iter_mut()
                    .find(|e| e.key == CatalogKey::Research(ResearchId::ArmourTechnology))
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
        .find(|e| e.key == CatalogKey::Ship(ShipType::HeavyFighter))
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
fn heavy_fighter_uses_only_impulse_and_keeps_its_fuel_coefficient() {
    let r = rules();
    let mut levels = ResearchLevels {
        owner: PlayerId(Uuid::nil()),
        revision: 0,
        levels: r.research_keys().into_iter().map(|k| (k, 0)).collect(),
    };
    levels.levels.insert(ResearchId::CombustionDrive, 100);
    for (level, speed) in [(0, 10000), (2, 14000), (5, 20000), (17, 44000)] {
        levels.levels.insert(ResearchId::ImpulseDrive, level);
        assert_eq!(
            ship_propulsion(&r.artifact.ships[&ShipType::HeavyFighter], &levels).unwrap(),
            (speed, 75)
        );
    }
}

fn battle(target: ShipType, technology: [u32; 3]) -> BattleInput {
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
                units: vec![(ManufacturedItem::Ship(ShipType::HeavyFighter), 1)],
            },
            BattleParticipant {
                owner: PlayerId(Uuid::from_u128(2)),
                side: BattleSide::Defender,
                origin: BattleOrigin::Stationed(BodyId(Uuid::from_u128(4))),
                technology,
                units: vec![(ManufacturedItem::Ship(target), 1)],
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
fn heavy_fighter_combat_derives_hull_and_research_bonuses() {
    let mut combat = rules().artifact.world.unwrap().combat;
    combat.max_rounds = 1;
    for (technology, hull, attack, shield, damage) in [
        ([0, 0, 0], "87500000", "15000000", "2500000", "12500000"),
        ([2, 4, 2], "105500000", "18000000", "3500000", "14500000"),
    ] {
        let result = resolve_battle(
            &battle(ShipType::HeavyFighter, technology),
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
fn heavy_fighter_rapid_fire_applies_to_cargo_and_probes_only() {
    let mut combat = rules().artifact.world.unwrap().combat;
    combat.max_rounds = 1;
    for (target, factor) in [
        (ShipType::SmallCargo, 3),
        (ShipType::EspionageProbe, 5),
        (ShipType::LightFighter, 1),
    ] {
        let configured = combat
            .rapid_fire
            .iter()
            .find(|rf| {
                rf.shooter == ManufacturedItem::Ship(ShipType::HeavyFighter)
                    && rf.target == ManufacturedItem::Ship(target)
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

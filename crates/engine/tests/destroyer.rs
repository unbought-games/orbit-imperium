use orbit_engine::*;
use uuid::Uuid;
#[allow(dead_code)]
mod common;

const DESTROYER: ManufacturedItem = ManufacturedItem::Ship(ShipType::Destroyer);
fn rules() -> Ruleset {
    standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap()
}

#[test]
fn destroyer_uses_only_completed_hyperspace_drive_levels() {
    let r = rules();
    let mut research = ResearchLevels {
        owner: PlayerId(Uuid::nil()),
        revision: 0,
        levels: r.research_keys().into_iter().map(|k| (k, 0)).collect(),
    };
    for key in [
        ResearchId::CombustionDrive,
        ResearchId::ImpulseDrive,
        ResearchId::HyperspaceTechnology,
    ] {
        research.levels.insert(key, 100);
    }
    let ship = &r.artifact.ships[&ShipType::Destroyer];
    assert!(ship.impulse_drive.is_none() && ship.hyperspace_drive.is_none());
    assert_eq!(ship.capacity, 2000);
    for (level, speed) in [(0, 5000), (6, 14000), (7, 15500), (8, 17000)] {
        research.levels.insert(ResearchId::HyperspaceDrive, level);
        assert_eq!(ship_propulsion(ship, &research).unwrap(), (speed, 1000));
    }
    research.levels.remove(&ResearchId::HyperspaceDrive);
    assert_eq!(
        ship_propulsion(ship, &research),
        Err(GameError::PolicyUnavailable)
    );
    for drive in [ResearchId::ImpulseDrive, ResearchId::CombustionDrive] {
        let mut artifact = r.artifact.clone();
        artifact.ships.get_mut(&ShipType::Destroyer).unwrap().drive = Some(drive);
        assert!(Ruleset::from_artifact(artifact, r.speed).is_err());
    }
}

#[test]
fn destroyer_combat_derives_stats_and_applies_only_its_three_rapid_fire_pairs() {
    let r = rules();
    let mut combat = r.artifact.world.as_ref().unwrap().combat.clone();
    combat.max_rounds = 1;
    let unit = combat.units.iter().find(|u| u.item == DESTROYER).unwrap();
    for (technology, expected) in [
        ([0; 3], (200_000_000, 50_000_000, 1_100_000_000)),
        ([2, 4, 6], (240_000_000, 70_000_000, 1_760_000_000)),
    ] {
        assert_eq!(
            combat_unit_stats(unit, technology, &combat).unwrap(),
            expected
        );
    }
    for unit in &combat.units {
        let target = unit.item;
        let factor = match target {
            ManufacturedItem::Defense(DefenseId::LightLaser) => 10,
            ManufacturedItem::Ship(ShipType::EspionageProbe | ShipType::SolarSatellite) => 5,
            _ => 1,
        };
        assert_eq!(
            combat
                .rapid_fire
                .iter()
                .find(|rf| rf.shooter == DESTROYER && rf.target == target)
                .map_or(1, |rf| rf.factor),
            factor
        );
        let input = BattleInput {
            encounter_id: InputId(Uuid::from_u128(3)),
            at: 0,
            target: BodyId(Uuid::from_u128(4)),
            rules_hash: r.hash.clone(),
            participants: vec![
                BattleParticipant {
                    owner: PlayerId(Uuid::from_u128(1)),
                    side: BattleSide::Attacker,
                    origin: BattleOrigin::Fleet(FleetId(Uuid::from_u128(5))),
                    technology: [0; 3],
                    units: vec![(DESTROYER, 1)],
                },
                BattleParticipant {
                    owner: PlayerId(Uuid::from_u128(2)),
                    side: BattleSide::Defender,
                    origin: BattleOrigin::Stationed(BodyId(Uuid::from_u128(4))),
                    technology: [0; 3],
                    units: vec![(target, 1)],
                },
            ],
        };
        let shots: Vec<u64> = (0..16)
            .map(|seed| {
                let mut random = RandomStream::new(
                    &[seed; 32],
                    UniverseId(Uuid::from_u128(1)),
                    Epoch(Uuid::from_u128(2)),
                    input.encounter_id,
                    "battle",
                )
                .unwrap();
                let result = resolve_battle(&input, &combat, &mut random).unwrap();
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
    assert!(combat.rapid_fire.iter().all(|rf| rf.target != DESTROYER));
}

#[test]
fn destroyer_manufacturing_charges_all_resources_but_times_only_metal_and_crystal() {
    let (state, _, _, body) = common::fixture();
    let mut planet = state.bodies[&body].clone();
    planet.levels.insert(Building::Shipyard, 9);
    for (speed, seconds) in [(1, 15840), (5, 3168), (7, 2262), (10, 1584)] {
        let r = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), speed).unwrap();
        let terms = manufacture_terms(&planet, DESTROYER, 3, &r).unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values([180000 * SCALE, 150000 * SCALE, 45000 * SCALE])
        );
        assert_eq!(terms.duration(), seconds * 1000);
    }
}

#[test]
fn destroyer_upgrade_is_complete_idempotent_and_preserves_existing_world_data() {
    let latest = rules();
    let mut previous = latest.artifact.clone();
    previous.ships.remove(&ShipType::Destroyer);
    previous
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != DESTROYER);
    let combat = &mut previous.world.as_mut().unwrap().combat;
    combat.units.retain(|u| u.item != DESTROYER);
    combat
        .rapid_fire
        .retain(|rf| rf.shooter != DESTROYER && rf.target != DESTROYER);
    let entry = previous
        .catalog
        .iter_mut()
        .find(|e| e.key == DESTROYER.catalog_key())
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    let previous = Ruleset::from_artifact(previous, latest.speed).unwrap();
    let next = upgrade_standard_rules(&previous).unwrap();
    assert_eq!(next, latest);
    assert_eq!(upgrade_standard_rules(&next).unwrap(), next);
    let delta = validate_rules_update(&previous, &next).unwrap();
    assert!(delta.add_research.is_empty() && delta.add_buildings.is_empty());
    assert_eq!(previous.protocol(), next.protocol());
    assert!(validate_rules_update(&next, &previous).is_err());
    for missing in ["ship", "cost", "combat", "technology", "drive", "shipyard"] {
        let mut broken = next.artifact.clone();
        match missing {
            "ship" => {
                broken.ships.remove(&ShipType::Destroyer);
            }
            "cost" => broken
                .progression
                .as_mut()
                .unwrap()
                .unit_costs
                .retain(|u| u.item != DESTROYER),
            "combat" => broken
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .retain(|u| u.item != DESTROYER),
            _ => {
                let key = match missing {
                    "technology" => CatalogKey::Research(ResearchId::HyperspaceTechnology),
                    "drive" => CatalogKey::Research(ResearchId::HyperspaceDrive),
                    _ => CatalogKey::Building(Building::Shipyard),
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
    for custom in ["disabled", "speed", "rapid_fire"] {
        let mut artifact = next.artifact.clone();
        match custom {
            "disabled" => {
                artifact
                    .catalog
                    .iter_mut()
                    .find(|e| e.key == DESTROYER.catalog_key())
                    .unwrap()
                    .enabled = false
            }
            "speed" => {
                artifact
                    .ships
                    .get_mut(&ShipType::Destroyer)
                    .unwrap()
                    .base_speed = 6000
            }
            _ => {
                artifact
                    .world
                    .as_mut()
                    .unwrap()
                    .combat
                    .rapid_fire
                    .iter_mut()
                    .find(|rf| rf.shooter == DESTROYER)
                    .unwrap()
                    .factor = 30
            }
        }
        let custom = Ruleset::from_artifact(artifact, next.speed).unwrap();
        assert!(matches!(
            upgrade_standard_rules(&custom),
            Err(StandardRulesError::Conflicts(_))
        ));
    }
}

use orbit_engine::*;
#[path = "common/prior_content.rs"]
mod prior_content;
use uuid::Uuid;
#[allow(dead_code)]
mod common;

const BATTLESHIP: ManufacturedItem = ManufacturedItem::Ship(ShipType::Battleship);
fn rules() -> Ruleset {
    standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap()
}

#[test]
fn battleship_uses_only_completed_hyperspace_drive_and_fixed_fuel() {
    let r = rules();
    let ship = &r.artifact.ships[&ShipType::Battleship];
    let mut research = ResearchLevels {
        owner: PlayerId(Uuid::nil()),
        revision: 0,
        levels: r.research_keys().into_iter().map(|k| (k, 0)).collect(),
    };
    research.levels.insert(ResearchId::CombustionDrive, 100);
    research.levels.insert(ResearchId::ImpulseDrive, 100);
    research
        .levels
        .insert(ResearchId::HyperspaceTechnology, 100);
    assert!(ship.impulse_drive.is_none() && ship.hyperspace_drive.is_none());
    assert_eq!(ship.capacity, 1500);
    for (level, speed) in [(0, 10000), (4, 22000), (5, 25000), (8, 34000)] {
        research.levels.insert(ResearchId::HyperspaceDrive, level);
        assert_eq!(ship_propulsion(ship, &research).unwrap(), (speed, 500));
    }
    research.levels.remove(&ResearchId::HyperspaceDrive);
    assert_eq!(
        ship_propulsion(ship, &research),
        Err(GameError::PolicyUnavailable)
    );
}

#[test]
fn battleship_combat_derives_stats_and_applies_only_its_two_rapid_fire_pairs() {
    let r = rules();
    let mut combat = r.artifact.world.as_ref().unwrap().combat.clone();
    combat.max_rounds = 1;
    let unit = combat.units.iter().find(|u| u.item == BATTLESHIP).unwrap();
    for (technology, expected) in [
        ([0; 3], (100_000_000, 20_000_000, 600_000_000)),
        ([2, 4, 6], (120_000_000, 28_000_000, 960_000_000)),
    ] {
        assert_eq!(
            combat_unit_stats(unit, technology, &combat).unwrap(),
            expected
        );
    }
    for unit in &combat.units {
        let target = unit.item;
        let factor = match target {
            ManufacturedItem::Ship(ShipType::EspionageProbe | ShipType::SolarSatellite) => 5,
            _ => 1,
        };
        assert_eq!(
            combat
                .rapid_fire
                .iter()
                .find(|rf| rf.shooter == BATTLESHIP && rf.target == target)
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
                    units: vec![(BATTLESHIP, 1)],
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
    assert_eq!(
        combat
            .rapid_fire
            .iter()
            .filter(|rf| rf.target == BATTLESHIP)
            .map(|rf| (rf.shooter, rf.factor))
            .collect::<Vec<_>>(),
        vec![(ManufacturedItem::Ship(ShipType::Battlecruiser), 7)]
    );
}

#[test]
fn battleship_manufacturing_charges_and_times_metal_and_crystal_only() {
    let (state, _, _, body) = common::fixture();
    let mut planet = state.bodies[&body].clone();
    planet.levels.insert(Building::Shipyard, 7);
    for (speed, seconds) in [(1, 10800), (5, 2160), (7, 1542), (10, 1080)] {
        let r = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), speed).unwrap();
        let terms = manufacture_terms(&planet, BATTLESHIP, 3, &r).unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values([135000 * SCALE, 45000 * SCALE, 0])
        );
        assert_eq!(terms.duration(), seconds * 1000);
    }
}

#[test]
fn battleship_upgrade_is_complete_idempotent_and_preserves_existing_world_data() {
    let latest = rules();
    let mut previous = prior_content::without_battlecruiser(latest.artifact.clone());
    let destroyer = ManufacturedItem::Ship(ShipType::Destroyer);
    previous.ships.remove(&ShipType::Destroyer);
    previous
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != destroyer);
    let combat = &mut previous.world.as_mut().unwrap().combat;
    combat.units.retain(|u| u.item != destroyer);
    combat
        .rapid_fire
        .retain(|rf| rf.shooter != destroyer && rf.target != destroyer);
    let entry = previous
        .catalog
        .iter_mut()
        .find(|e| e.key == destroyer.catalog_key())
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();

    previous.ships.remove(&ShipType::Battleship);
    previous
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != BATTLESHIP);
    let combat = &mut previous.world.as_mut().unwrap().combat;
    combat.units.retain(|u| u.item != BATTLESHIP);
    combat
        .rapid_fire
        .retain(|rf| rf.shooter != BATTLESHIP && rf.target != BATTLESHIP);
    let entry = previous
        .catalog
        .iter_mut()
        .find(|e| e.key == BATTLESHIP.catalog_key())
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    let previous = Ruleset::from_artifact(previous, latest.speed).unwrap();
    let next = upgrade_standard_rules(&previous).unwrap();
    assert_eq!(next, latest);
    let mut retained = next.artifact.clone();
    retained.ships.remove(&ShipType::Battleship);
    retained.ships.remove(&ShipType::Destroyer);
    retained.ships.remove(&ShipType::Battlecruiser);
    assert_eq!(retained.ships, previous.artifact.ships);
    assert_eq!(next.artifact.buildings, previous.artifact.buildings);
    assert_eq!(
        next.artifact.progression.as_ref().unwrap().research,
        previous.artifact.progression.as_ref().unwrap().research
    );
    assert!(
        !next
            .artifact
            .catalog
            .iter()
            .any(|e| e.key == CatalogKey::Ship(ShipType::Dreadnought) && e.enabled)
    );

    assert_eq!(upgrade_standard_rules(&next).unwrap(), next);
    let delta = validate_rules_update(&previous, &next).unwrap();
    assert!(delta.add_research.is_empty() && delta.add_buildings.is_empty());
    assert_eq!(previous.protocol(), next.protocol());
    assert!(validate_rules_update(&next, &previous).is_err());
    for missing in ["ship", "cost", "combat", "hyperspace", "shipyard"] {
        let mut broken = next.artifact.clone();
        match missing {
            "ship" => {
                broken.ships.remove(&ShipType::Battleship);
            }
            "cost" => broken
                .progression
                .as_mut()
                .unwrap()
                .unit_costs
                .retain(|u| u.item != BATTLESHIP),
            "combat" => broken
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .retain(|u| u.item != BATTLESHIP),
            _ => {
                let key = match missing {
                    "hyperspace" => CatalogKey::Research(ResearchId::HyperspaceDrive),
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
                    .find(|e| e.key == BATTLESHIP.catalog_key())
                    .unwrap()
                    .enabled = false
            }
            "speed" => {
                artifact
                    .ships
                    .get_mut(&ShipType::Battleship)
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
                    .find(|rf| rf.shooter == BATTLESHIP)
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

#[test]
fn explicit_drive_validation_keeps_supported_ship_drive_pairs_and_research_definitions() {
    let r = rules();
    for (ship, drive) in [
        (ShipType::Battleship, ResearchId::ImpulseDrive),
        (ShipType::Battleship, ResearchId::CombustionDrive),
        (ShipType::Cruiser, ResearchId::HyperspaceDrive),
        (ShipType::Recycler, ResearchId::HyperspaceDrive),
    ] {
        let mut artifact = r.artifact.clone();
        artifact.ships.get_mut(&ship).unwrap().drive = Some(drive);
        assert!(Ruleset::from_artifact(artifact, r.speed).is_err());
    }
    let mut artifact = r.artifact.clone();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .remove(&ResearchId::HyperspaceDrive);
    assert!(Ruleset::from_artifact(artifact, r.speed).is_err());
}

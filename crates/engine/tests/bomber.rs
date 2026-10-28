use orbit_engine::*;
use uuid::Uuid;
#[allow(dead_code)]
mod common;
#[path = "common/prior_content.rs"]
mod prior_content;

const BOMBER: ManufacturedItem = ManufacturedItem::Ship(ShipType::Bomber);
fn rules() -> Ruleset {
    standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap()
}

#[test]
fn bomber_switches_only_at_completed_hyperspace_eight_without_stacking() {
    let r = rules();
    let mut research = ResearchLevels {
        owner: PlayerId(Uuid::nil()),
        revision: 0,
        levels: r.research_keys().into_iter().map(|k| (k, 0)).collect(),
    };
    research.levels.insert(ResearchId::CombustionDrive, 100);
    research
        .levels
        .insert(ResearchId::HyperspaceTechnology, 100);
    let ship = &r.artifact.ships[&ShipType::Bomber];
    assert!(ship.impulse_drive.is_none());
    for (impulse, hyperspace, speed) in [
        (6, 0, 8800),
        (6, 7, 8800),
        (6, 8, 17000),
        (100, 8, 17000),
        (6, 9, 18500),
    ] {
        research.levels.insert(ResearchId::ImpulseDrive, impulse);
        research
            .levels
            .insert(ResearchId::HyperspaceDrive, hyperspace);
        assert_eq!(ship_propulsion(ship, &research).unwrap(), (speed, 1000));
    }
    let mut retained = ship.clone();
    retained.hyperspace_drive = None;
    assert_eq!(ship_propulsion(&retained, &research).unwrap(), (8800, 1000));
    research.levels.remove(&ResearchId::HyperspaceDrive);
    assert_eq!(
        ship_propulsion(ship, &research),
        Err(GameError::PolicyUnavailable)
    );
}

#[test]
fn bomber_combat_derives_stats_and_applies_only_its_six_rapid_fire_pairs() {
    let r = rules();
    let mut combat = r.artifact.world.as_ref().unwrap().combat.clone();
    combat.max_rounds = 1;
    let unit = combat.units.iter().find(|u| u.item == BOMBER).unwrap();
    for (technology, expected) in [
        ([0; 3], (100_000_000, 50_000_000, 750_000_000)),
        ([2, 4, 6], (120_000_000, 70_000_000, 1_200_000_000)),
    ] {
        assert_eq!(
            combat_unit_stats(unit, technology, &combat).unwrap(),
            expected
        );
    }
    for unit in &combat.units {
        let target = unit.item;
        let factor = match target {
            ManufacturedItem::Defense(DefenseId::RocketLauncher | DefenseId::LightLaser) => 20,
            ManufacturedItem::Defense(DefenseId::HeavyLaser | DefenseId::IonCannon) => 10,
            ManufacturedItem::Ship(ShipType::EspionageProbe | ShipType::SolarSatellite) => 5,
            _ => 1,
        };
        assert_eq!(
            combat
                .rapid_fire
                .iter()
                .find(|rf| rf.shooter == BOMBER && rf.target == target)
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
                    units: vec![(BOMBER, 1)],
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
    assert!(combat.rapid_fire.iter().all(|rf| rf.target != BOMBER));
}

#[test]
fn bomber_manufacturing_charges_all_resources_but_times_only_metal_and_crystal() {
    let (state, _, _, body) = common::fixture();
    let mut planet = state.bodies[&body].clone();
    planet.levels.insert(Building::Shipyard, 8);
    for (speed, seconds) in [(1, 12000), (5, 2400), (7, 1714), (10, 1200)] {
        let r = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), speed).unwrap();
        let terms = manufacture_terms(&planet, BOMBER, 3, &r).unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values([150000 * SCALE, 75000 * SCALE, 45000 * SCALE])
        );
        assert_eq!(terms.duration(), seconds * 1000);
    }
}

#[test]
fn bomber_upgrade_is_complete_idempotent_and_preserves_existing_world_data() {
    let latest = rules();
    let mut previous = prior_content::without_battlecruiser(latest.artifact.clone());
    previous.ships.remove(&ShipType::Bomber);
    previous
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != BOMBER);
    let combat = &mut previous.world.as_mut().unwrap().combat;
    combat.units.retain(|u| u.item != BOMBER);
    combat
        .rapid_fire
        .retain(|rf| rf.shooter != BOMBER && rf.target != BOMBER);
    let entry = previous
        .catalog
        .iter_mut()
        .find(|e| e.key == BOMBER.catalog_key())
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
    for missing in ["ship", "cost", "combat", "plasma", "impulse", "shipyard"] {
        let mut broken = next.artifact.clone();
        match missing {
            "ship" => {
                broken.ships.remove(&ShipType::Bomber);
            }
            "cost" => broken
                .progression
                .as_mut()
                .unwrap()
                .unit_costs
                .retain(|u| u.item != BOMBER),
            "combat" => broken
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .retain(|u| u.item != BOMBER),
            _ => {
                let key = match missing {
                    "plasma" => CatalogKey::Research(ResearchId::PlasmaTechnology),
                    "impulse" => CatalogKey::Research(ResearchId::ImpulseDrive),
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
                    .find(|e| e.key == BOMBER.catalog_key())
                    .unwrap()
                    .enabled = false
            }
            "speed" => {
                artifact
                    .ships
                    .get_mut(&ShipType::Bomber)
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
                    .find(|rf| rf.shooter == BOMBER)
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

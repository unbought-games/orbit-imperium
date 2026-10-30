use orbit_engine::*;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[test]
fn certified_weights_hash_totals_and_every_cumulative_boundary() {
    assert_eq!(
        format!("{:x}", Sha256::digest(COLONY_WEIGHTS.as_bytes())),
        "e8d8faf1432c24306a72f221172b80f108d7eb191f874dc365487a032f106654"
    );
    let totals = [
        6405468918186,
        7980156157301,
        23571773511180,
        36245429121300,
        27908790694999,
        37924797220788,
        42087644343641,
        35411841306128,
        36666993021583,
        30842276564766,
        27509074243670,
        20650441296851,
        7915901902247,
        5716371100541,
        4715012905940,
    ];
    let lows = [
        95, 97, 98, 123, 148, 148, 141, 163, 155, 151, 139, 134, 107, 81, 65,
    ];
    for position in 1..=15 {
        let weights = colony_field_weights(position).unwrap();
        assert_eq!(weights.iter().sum::<u64>(), totals[position as usize - 1]);
        let mut start = 0;
        for (offset, weight) in weights.iter().enumerate() {
            let expected = lows[position as usize - 1] + offset as u32;
            assert_eq!(colony_fields_for_draw(position, start).unwrap(), expected);
            assert_eq!(
                colony_fields_for_draw(position, start + weight - 1).unwrap(),
                expected
            );
            let (low, high) = colony_diameter_range(expected);
            assert_eq!(u64::from(low).pow(2) / 1_000_000, u64::from(expected));
            assert_eq!(u64::from(high).pow(2) / 1_000_000, u64::from(expected));
            start += weight;
        }
        assert!(colony_fields_for_draw(position, start).is_err());
    }
    assert!(colony_field_weights(0).is_err());
    assert!(colony_field_weights(16).is_err());
    assert_eq!(colony_diameter_range(201), (14178, 14212));
}
#[test]
fn approved_generation_vector_and_stream_cursor_survive_serialization() {
    let secret = std::array::from_fn(|i| i as u8);
    let mut rng = RandomStream::new(
        &secret,
        UniverseId(Uuid::from_u128(1)),
        Epoch(Uuid::from_u128(2)),
        InputId(Uuid::from_u128(3)),
        "colony",
    )
    .unwrap();
    let saved = serde_json::to_vec(&rng).unwrap();
    let c = generate_colony(8, &mut rng).unwrap();
    assert_eq!(
        c,
        GeneratedColony {
            fields: 230,
            diameter_km: 15191,
            max_temperature: 64
        }
    );
    assert_eq!(rng.cursor(), (0, 8));
    let mut restored = serde_json::from_slice(&saved).unwrap();
    assert_eq!(generate_colony(8, &mut restored).unwrap(), c);
    assert_eq!(restored, rng);
}
#[test]
fn movement_catalog_and_activation_are_explicit_and_additive() {
    let r = Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-6.json")).unwrap();
    let old = Ruleset::mvp_raids().unwrap();
    assert!(!old.colonization());
    assert!(r.colonization());
    let delta = validate_rules_update(&old, &r).unwrap();
    assert_eq!(delta.add_research.len(), 2);
    let ship = &r.artifact.ships[&ShipType::ColonyShip];
    assert_eq!(
        (ship.base_speed, ship.capacity, ship.fuel),
        (2500, 7500, 1000)
    );
    let mut research = ResearchLevels {
        owner: PlayerId(Uuid::from_u128(1)),
        levels: r.research_keys().into_iter().map(|k| (k, 0)).collect(),
        revision: 0,
    };
    research.levels.insert(ResearchId::CombustionDrive, 20);
    research.levels.insert(ResearchId::ImpulseDrive, 3);
    assert_eq!(ship_propulsion(ship, &research).unwrap(), (4000, 1000));
    let mut disabled = r.artifact.clone();
    disabled
        .world
        .as_mut()
        .unwrap()
        .colonization
        .as_mut()
        .unwrap()
        .enabled = false;
    assert!(validate_rules_update(&r, &Ruleset::from_artifact(disabled, r.speed).unwrap()).is_ok());
    assert!(validate_rules_update(&r, &old).is_err());
    let mut bad = r.artifact.clone();
    bad.temperature = [0, -1, 1, 1];
    assert_eq!(Ruleset::from_artifact(bad, r.speed), Err(RulesError::Range));
}

#[test]
fn every_position_uses_its_temperature_envelope_and_integer_diameter() {
    let lows = [
        220, 170, 120, 70, 60, 50, 40, 30, 20, 10, 0, -10, -50, -90, -130,
    ];
    for position in 1..=15 {
        for seed in 0..32 {
            let mut rng = RandomStream::new(
                &[seed; 32],
                UniverseId(Uuid::from_u128(1)),
                Epoch(Uuid::from_u128(2)),
                InputId(Uuid::from_u128(3)),
                "colony",
            )
            .unwrap();
            let generated = generate_colony(position, &mut rng).unwrap();
            let low = lows[position as usize - 1];
            assert!((low..=low + 40).contains(&generated.max_temperature));
            assert_eq!(
                u64::from(generated.diameter_km).pow(2) / 1_000_000,
                u64::from(generated.fields)
            );
        }
    }
}

#[test]
fn legacy_admission_matches_old_vectors_and_skips_colonized_homeworld_slots() {
    let rules = Ruleset::mvp_raids().unwrap();
    let profile = rules.artifact.universe.clone().unwrap();
    let secret = [17; 32];
    let universe = UniverseId(Uuid::from_u128(1));
    let epoch = Epoch(Uuid::from_u128(2));
    let expected = homeworlds(&secret, universe, epoch, 45).unwrap();
    let mut occupied = vec![];
    for (ordinal, home) in expected.iter().enumerate() {
        let next =
            frontier_homeworld(&secret, universe, epoch, &profile, ordinal, &occupied).unwrap();
        assert_eq!(&next, home);
        occupied.push(next.coordinates);
    }
    assert!(frontier_homeworld(&secret, universe, epoch, &profile, 45, &occupied).is_err());
    occupied.retain(|c| c.system != 4 || c.position != 7);
    let next = frontier_homeworld(&secret, universe, epoch, &profile, 1, &occupied).unwrap();
    assert_eq!(
        next.coordinates,
        Coordinates {
            galaxy: 1,
            system: 4,
            position: 7
        }
    );
    assert_eq!(
        next.rng_bytes, 1,
        "single free position consumes no RNG bytes"
    );
}

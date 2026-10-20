use orbit_engine::*;

#[test]
fn private_mvp_profile_is_distinct_and_fixed_at_ten() {
    let mut value: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/shared-foundation-r1.json")).unwrap();
    value["id"] = "mvp-v1-slice-1".into();
    value["universe"] = serde_json::json!({"id":"mvp-v1", "galaxies":1,"systems_per_galaxy":5,"positions_per_system":15,"players":5,"homeworld_policy":"oi-homeworld-frontier-v1"});
    let rules = Ruleset::from_json(&serde_json::to_vec(&value).unwrap()).unwrap();
    rules.validate().unwrap();
    assert_eq!(rules.speed, 10);
    assert!(rules.clone().with_speed(1).is_err());
    let rules = rules.with_speed(10).unwrap();
    assert_eq!(
        construction_terms(Building::MetalMine, 1, &rules)
            .unwrap()
            .duration,
        10_000
    );
    assert_eq!(
        construction_terms(Building::MetalMine, 1, &rules)
            .unwrap()
            .cost
            .values(),
        [60 * SCALE, 15 * SCALE, 0]
    );
}

#[test]
fn configuration_and_homeworld_generation_are_bounded_and_repeatable() {
    use uuid::Uuid;
    for bad in [
        "0", "101", "-1", "+10", "010", "10.0", "1e1", " 10", "10 ", "",
    ] {
        assert!(parse_speed(bad).is_err(), "{bad}");
    }
    for speed in 1..=100 {
        assert_eq!(parse_speed(&speed.to_string()).unwrap(), speed);
    }
    let secret = std::array::from_fn(|i| i as u8);
    let u = UniverseId(Uuid::from_u128(1));
    let e = Epoch(Uuid::from_u128(2));
    let worlds = mvp_homeworlds(&secret, u, e).unwrap();
    assert_eq!(worlds, mvp_homeworlds(&secret, u, e).unwrap());
    assert_eq!(worlds.len(), 5);
    assert_eq!(
        worlds
            .iter()
            .map(|w| (w.coordinates.position, w.max_temperature, w.rng_bytes))
            .collect::<Vec<_>>(),
        vec![(11, 39, 2), (8, 49, 2), (12, -4, 2), (7, 63, 2), (4, 77, 2)]
    );
    let mut positions = std::collections::BTreeSet::new();
    let lows = [70, 60, 50, 40, 30, 20, 10, 0, -10];
    for w in worlds {
        assert_eq!(
            (
                w.coordinates.galaxy,
                w.coordinates.system,
                w.fields,
                w.diameter_km
            ),
            (1, 1, 163, 12800)
        );
        assert!(positions.insert(w.coordinates.position));
        let low = lows[(w.coordinates.position - 4) as usize];
        assert!((low..=low + 40).contains(&w.max_temperature));
        assert!(w.rng_bytes >= 2);
    }
    let mut raw: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/mvp-v1-slice-1.json")).unwrap();
    for (key, bad) in [
        ("galaxies", 0),
        ("systems_per_galaxy", 4),
        ("positions_per_system", 5),
        ("players", 6),
    ] {
        let mut altered = raw.clone();
        altered["universe"][key] = bad.into();
        assert!(Ruleset::from_json(&serde_json::to_vec(&altered).unwrap()).is_err());
    }
    raw["universe"]["systems_per_galaxy"] = 1.5.into();
    assert!(Ruleset::from_json(&serde_json::to_vec(&raw).unwrap()).is_err());
}

#[test]
fn single_ten_speed_scales_production_and_paired_transport_only() {
    use uuid::Uuid;
    let rules = Ruleset::mvp().unwrap();
    let body = Body {
        id: BodyId(Uuid::from_u128(1)),
        universe: UniverseId(Uuid::from_u128(2)),
        owner: PlayerId(Uuid::from_u128(3)),
        kind: BodyKind::Planet,
        coordinates: Coordinates {
            galaxy: 1,
            system: 1,
            position: 8,
        },
        fields: 163,
        max_temperature: 40,
        retained_capacity: Some(Resources::all(10000 * SCALE)),
        checkpoint: ResourceCheckpoint {
            amounts: Resources::from_values([500 * SCALE, 500 * SCALE, 0]),
            carry: Resources::all(0),
            at: 0,
        },
        levels: Building::ALL.into_iter().map(|b| (b, 0)).collect(),
        revision: 0,
    };
    assert_eq!(
        production_rates(&body, &rules).unwrap().values(),
        [300 * SCALE, 150 * SCALE, 0]
    );
    assert_eq!(
        settle_economy(&body, 1800000, &rules)
            .unwrap()
            .amounts
            .values(),
        [650 * SCALE, 575 * SCALE, 0]
    );
    assert_eq!(energy_stats(&body, &rules).unwrap().supply, 0);
    let mut request = TransportTermsRequest {
        origin: body.coordinates,
        target: Coordinates {
            galaxy: 1,
            system: 1,
            position: 9,
        },
        ships: vec![ShipStack {
            owner: body.owner,
            ship_type: ShipType::SmallCargo,
            count: 2,
        }],
        combustion: 1,
        speed_percent: 100,
    };
    let t = travel_terms(&request, &rules).unwrap();
    assert_eq!(
        (t.duration, t.fuel, t.capacity, t.maximum_payload),
        (474000, 3 * SCALE, 10000 * SCALE, 9997 * SCALE)
    );
    request.target.system = 6;
    assert_eq!(travel_terms(&request, &rules), Err(GameError::InvalidInput));
    request.target.system = 5;
    request.target.position = 15;
    assert!(travel_terms(&request, &rules).is_ok());
    request.target.galaxy = 2;
    assert_eq!(travel_terms(&request, &rules), Err(GameError::InvalidInput));
    assert_eq!(
        construction_terms(Building::SolarPlant, 1, &rules)
            .unwrap()
            .duration,
        15000
    );
}

mod common;
#[test]
fn mvp_commands_use_protocol_two_quotes_and_transitions() {
    let (mut state, _, p, b) = common::fixture();
    let r = Ruleset::mvp().unwrap();
    state.profile_hash = r.hash.clone();
    let request = QuoteRequest::Upgrade {
        body: b,
        building: Building::MetalMine,
    };
    let q = quote(&state, Actor::Player(p), &request, 1000, &r).unwrap();
    let expected = hash(
        &serde_json::json!({"protocol":2,"request":canonical_request(&request),"terms":wire_terms(&q)}),
    );
    assert_eq!(q.terms_hash, expected);
    let mut i = common::input(
        &state,
        &r,
        Actor::Player(p),
        1000,
        100,
        Input::Command(Command::StartUpgrade {
            body: b,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash,
        }),
    );
    i.protocol = 2;
    let result = transition(&state, &i, &r);
    let change = common::applied(&mut state, result);
    assert_eq!(change.constructions[0].due_at, 17000);
}

#[test]
fn signup_frontier_fills_all_systems_without_duplicate_slots() {
    let u = UniverseId(uuid::Uuid::from_u128(1));
    let epoch = Epoch(uuid::Uuid::from_u128(2));
    assert!(homeworlds(&[7; 32], u, epoch, 0).unwrap().is_empty());
    let worlds = homeworlds(&[7; 32], u, epoch, 45).unwrap();
    let occupied: std::collections::BTreeSet<_> = worlds
        .iter()
        .map(|w| {
            (
                w.coordinates.galaxy,
                w.coordinates.system,
                w.coordinates.position,
            )
        })
        .collect();
    assert_eq!(occupied.len(), 45);
    for system in 1..=5 {
        for position in 4..=12 {
            assert!(occupied.contains(&(1, system, position)));
        }
    }
    assert_eq!(worlds[9].coordinates.system, 2);
    assert_eq!(worlds[44].coordinates.system, 5);
    assert!(homeworlds(&[7; 32], u, epoch, 46).is_err());
}

#[test]
fn configurable_topology_validates_bounds_without_changing_legacy_profiles() {
    for (galaxies, systems) in [(1, 1), (1, 100), (100, 1000)] {
        let profile: UniverseProfile = serde_json::from_value(serde_json::json!({
            "id": "signup-v2", "galaxies": galaxies, "systems_per_galaxy": systems,
            "positions_per_system": 15, "homeworld_policy": "oi-homeworld-balanced-v2"
        }))
        .unwrap();
        assert!(profile.validate().is_ok());
    }
}

fn allocate(profile: &UniverseProfile, count: usize) -> Vec<Homeworld> {
    let mut worlds: Vec<Homeworld> = vec![];
    for n in 0..count {
        let coords: Vec<_> = worlds.iter().map(|w| w.coordinates).collect();
        worlds.push(
            balanced_homeworld(
                &[7; 32],
                uuid::Uuid::from_u128(1).into(),
                uuid::Uuid::from_u128(2).into(),
                profile,
                n,
                &coords,
                &coords,
            )
            .unwrap(),
        );
    }
    worlds
}

#[test]
fn region_scales_with_population_and_leaves_expansion_space() {
    let p = UniverseProfile::signup(1, 100).unwrap();
    let worlds = allocate(&p, 900);
    assert_eq!(worlds[..100], allocate(&p, 100));
    let mut counts = std::collections::BTreeMap::new();
    let mut slots = std::collections::BTreeSet::new();
    for (i, w) in worlds.iter().enumerate() {
        assert!(slots.insert((
            w.coordinates.galaxy,
            w.coordinates.system,
            w.coordinates.position
        )));
        assert!((4..=12).contains(&w.coordinates.position));
        assert_eq!((w.fields, w.diameter_km), (163, 12800));
        *counts.entry(w.coordinates.system).or_insert(0) += 1;
        let players = i + 1;
        // Nine eligible slots/system, one homeworld plus one expansion slot/account.
        let needed_systems = (players * 2).div_ceil(9).min(100);
        assert_eq!(counts.len(), needed_systems, "population {players}");
        assert_eq!(
            counts.keys().copied().max().unwrap() as usize,
            needed_systems
        );
        if players <= 450 {
            assert!(needed_systems * 9 - players >= players);
            assert!(counts.values().all(|&n| n <= 5));
        }
    }
    for (players, systems) in [(2, 1), (5, 2), (10, 3), (25, 6), (100, 23)] {
        let occupied: std::collections::BTreeSet<_> = worlds[..players]
            .iter()
            .map(|w| w.coordinates.system)
            .collect();
        assert_eq!(occupied.len(), systems);
    }
}

#[test]
fn small_populations_stay_in_one_galaxy_and_growth_crosses_boundaries() {
    let p = UniverseProfile::signup(10, 10).unwrap();
    let worlds = allocate(&p, 100);
    assert!(
        worlds[..5]
            .iter()
            .all(|w| w.coordinates.galaxy == 1 && w.coordinates.system <= 2)
    );
    assert!(worlds[..45].iter().all(|w| w.coordinates.galaxy == 1));
    assert_eq!(
        (worlds[45].coordinates.galaxy, worlds[45].coordinates.system),
        (2, 1)
    );
    assert!(worlds.iter().all(|w| w.coordinates.galaxy <= 3));
    let compact = allocate(&UniverseProfile::signup(100, 1).unwrap(), 10);
    assert!(compact[..4].iter().all(|w| w.coordinates.galaxy == 1));
    assert!(compact.iter().all(|w| w.coordinates.galaxy <= 3));
}

#[test]
fn balanced_admissions_handle_small_maps_galaxy_boundaries_and_exhaustion() {
    for (g, systems) in [(1, 1), (2, 3)] {
        let p = UniverseProfile::signup(g, systems).unwrap();
        let capacity = (g * systems * 9) as usize;
        let worlds = allocate(&p, capacity);
        let coords: Vec<_> = worlds.iter().map(|w| w.coordinates).collect();
        assert!(coords.iter().all(|&c| p.contains(c)));
        let unique: std::collections::BTreeSet<_> = coords
            .iter()
            .map(|c| (c.galaxy, c.system, c.position))
            .collect();
        assert_eq!(unique.len(), capacity);
        assert!(
            balanced_homeworld(
                &[7; 32],
                uuid::Uuid::from_u128(1).into(),
                uuid::Uuid::from_u128(2).into(),
                &p,
                capacity,
                &coords,
                &coords
            )
            .is_err()
        );
    }
}

#[test]
fn unavailable_slots_are_excluded_and_full_regions_expand() {
    let p = UniverseProfile::signup(1, 41).unwrap();
    let blocked: Vec<_> = (1..=40)
        .flat_map(|s| {
            (4..=12).map(move |position| Coordinates {
                galaxy: 1,
                system: s,
                position,
            })
        })
        .collect();
    let w = balanced_homeworld(
        &[7; 32],
        uuid::Uuid::from_u128(1).into(),
        uuid::Uuid::from_u128(2).into(),
        &p,
        0,
        &[],
        &blocked,
    )
    .unwrap();
    assert_eq!(w.coordinates.system, 41);
    let p = UniverseProfile::signup(1, 1).unwrap();
    let blocked: Vec<_> = (4..12)
        .map(|position| Coordinates {
            galaxy: 1,
            system: 1,
            position,
        })
        .collect();
    let w = balanced_homeworld(
        &[7; 32],
        uuid::Uuid::from_u128(1).into(),
        uuid::Uuid::from_u128(2).into(),
        &p,
        0,
        &[],
        &blocked,
    )
    .unwrap();
    assert_eq!(w.coordinates.position, 12);
    assert!((-10..=30).contains(&w.max_temperature));
}

#[test]
fn maximum_topology_and_invalid_profile_bounds_are_checked() {
    let p = UniverseProfile::signup(100, 1000).unwrap();
    assert_eq!(p.homeworld_capacity().unwrap(), 900_000);
    assert_eq!(allocate(&p, 1).len(), 1);
    for (g, s) in [(0, 1), (101, 1), (1, 0), (1, 1001)] {
        assert!(UniverseProfile::signup(g, s).is_err());
    }
    let legacy = Ruleset::mvp_raids().unwrap();
    let saved = legacy.artifact.universe.as_ref().unwrap();
    assert_eq!(
        UniverseOptions::default().resolve(Some(saved)).unwrap(),
        *saved
    );
    assert!(
        UniverseOptions {
            systems_per_galaxy: Some(100),
            ..Default::default()
        }
        .resolve(Some(saved))
        .is_err()
    );
    let new = Ruleset::signup(p).unwrap();
    assert_ne!(new.hash, legacy.hash);
    new.validate().unwrap();
}

#[test]
fn balancing_supports_more_than_256_candidate_systems() {
    let p = UniverseProfile::signup(1, 300).unwrap();
    let homes: Vec<_> = (1..=300)
        .flat_map(|system| {
            (4..=7).map(move |position| Coordinates {
                galaxy: 1,
                system,
                position,
            })
        })
        .collect();
    let mut reached_upper_systems = false;
    for seed in 0..32 {
        let w = balanced_homeworld(
            &[seed; 32],
            uuid::Uuid::from_u128(1).into(),
            uuid::Uuid::from_u128(2).into(),
            &p,
            1200,
            &homes,
            &homes,
        )
        .unwrap();
        assert!((8..=12).contains(&w.coordinates.position));
        assert!(p.contains(w.coordinates));
        reached_upper_systems |= w.coordinates.system > 256;
    }
    assert!(
        reached_upper_systems,
        "wide selection must not truncate the candidate count to a byte"
    );
}

#[test]
fn invalid_saved_homeworld_facts_are_rejected() {
    let p = UniverseProfile::signup(1, 100).unwrap();
    let home = allocate(&p, 1).remove(0);
    home.validate(&p).unwrap();
    let mut bad = home.clone();
    bad.coordinates.system = 101;
    assert!(bad.validate(&p).is_err());
    let mut bad = home.clone();
    bad.coordinates.position = 3;
    assert!(bad.validate(&p).is_err());
    let mut bad = home.clone();
    bad.fields = 164;
    assert!(bad.validate(&p).is_err());
    let mut bad = home.clone();
    bad.max_temperature = 500;
    assert!(bad.validate(&p).is_err());
    let mut bad = home;
    bad.rng_bytes = 0;
    assert!(bad.validate(&p).is_err());
}

#[test]
fn expansion_budget_accounts_for_other_occupied_slots() {
    let p = UniverseProfile::signup(1, 3).unwrap();
    let blocked: Vec<_> = (4..=9)
        .map(|position| Coordinates {
            galaxy: 1,
            system: 1,
            position,
        })
        .collect();
    let first = balanced_homeworld(
        &[7; 32],
        uuid::Uuid::from_u128(1).into(),
        uuid::Uuid::from_u128(2).into(),
        &p,
        0,
        &[],
        &blocked,
    )
    .unwrap();
    assert_eq!(first.coordinates.system, 1);
    assert!((10..=12).contains(&first.coordinates.position));
    let second = balanced_homeworld(
        &[7; 32],
        uuid::Uuid::from_u128(1).into(),
        uuid::Uuid::from_u128(2).into(),
        &p,
        1,
        &[first.coordinates],
        &blocked,
    )
    .unwrap();
    assert_eq!(second.coordinates.system, 2);
    // Homeworld occupancy and unavailable occupancy may overlap; count each slot once.
    let mut overlapping = blocked;
    overlapping.push(first.coordinates);
    let retried = balanced_homeworld(
        &[7; 32],
        uuid::Uuid::from_u128(1).into(),
        uuid::Uuid::from_u128(2).into(),
        &p,
        1,
        &[first.coordinates],
        &overlapping,
    )
    .unwrap();
    assert_eq!(second, retried);
}

#[test]
fn production_signup_supports_each_lifetime_speed_without_rewriting_legacy_rules() {
    let profile = UniverseProfile::signup(1, 100).unwrap();
    let legacy = Ruleset::mvp_raids().unwrap();
    let legacy_hash = legacy.hash.clone();
    assert_eq!(Ruleset::signup(profile.clone()).unwrap().speed, 10);
    let mut hashes = std::collections::BTreeSet::new();
    for speed in 1..=100 {
        let rules = Ruleset::signup_with_speed(profile.clone(), speed).unwrap();
        rules.validate().unwrap();
        assert_eq!(rules.speed, speed);
        assert!(hashes.insert(rules.hash.0.clone()));
        assert_eq!(
            Ruleset::from_artifact(rules.artifact.clone(), speed).unwrap(),
            rules
        );
        assert_eq!(
            Ruleset::signup(profile.clone())
                .unwrap()
                .with_speed(speed)
                .unwrap(),
            rules
        );
        assert!(legacy.clone().with_speed(speed).is_ok() == (speed == 10));
        assert!(Ruleset::from_artifact(legacy.artifact.clone(), speed).is_ok() == (speed == 10));
    }
    for speed in [i32::MIN, -1, 0, 101, i32::MAX] {
        assert!(Ruleset::signup_with_speed(profile.clone(), speed).is_err());
    }
    assert_eq!(legacy.hash, legacy_hash);
    assert_eq!(legacy, Ruleset::mvp_raids().unwrap());
}

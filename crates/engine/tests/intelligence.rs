use orbit_engine::*;
use uuid::Uuid;
#[test]
fn detector_two_stage_exact_and_extreme_levels() {
    for (a, d, i, s, r, p) in [
        (0, 0, 1, 100, 0, 0),
        (0, 0, 1, 100, 500000, 125000),
        (2, 0, 1, 100, 500000, 31250),
        (0, 1, 1, 100, 500000, 250000),
        (0, 0, 8, 100, 750000, 1000000),
        (u32::MAX, 0, i64::MAX, i64::MAX, 1000000, 0),
        (0, u32::MAX, 1, 1, 1, 1000000),
    ] {
        assert_eq!(counterespionage_probability(i, s, a, d, r).unwrap(), p);
    }
    let secret = std::array::from_fn(|i| i as u8);
    let mut rng = RandomStream::new(
        &secret,
        UniverseId(Uuid::from_u128(1)),
        Epoch(Uuid::from_u128(2)),
        InputId(Uuid::from_u128(3)),
        "espionage",
    )
    .unwrap();
    let result = detect_counterespionage(1, 100, 0, 0, &mut rng).unwrap();
    assert_eq!(result.probability_ppm, 53584);
    assert!(!result.detected);
    assert_eq!(result.multiplier, Some(214336));
    assert_eq!(result.detection_draw, Some(271384));
    assert_eq!(rng.cursor(), (0, 6));
    let before = rng.clone();
    let result = detect_counterespionage(1, 0, 0, 0, &mut rng).unwrap();
    assert!(!result.detected);
    assert_eq!(rng, before);
}
#[test]
fn disclosure_and_incoming_use_viewers_completed_research() {
    for (a, d, n, score) in [
        (6, 6, 1, 1),
        (6, 6, 3, 3),
        (6, 8, 6, 2),
        (8, 6, 1, 5),
        (9, 6, 1, 10),
        (2, 8, 1, -35),
    ] {
        assert_eq!(espionage_disclosure_score(n, a, d).unwrap(), score);
    }
    let ships = vec![
        ShipStack {
            owner: PlayerId::default(),
            ship_type: ShipType::LightFighter,
            count: 20,
        },
        ShipStack {
            owner: PlayerId::default(),
            ship_type: ShipType::SmallCargo,
            count: 10,
        },
    ];
    assert!(matches!(
        incoming_ships(&ships, 1).unwrap(),
        IncomingShips::Unknown
    ));
    assert!(matches!(incoming_ships(&ships,2).unwrap(),IncomingShips::Total{total} if total=="30"));
    assert!(
        matches!(incoming_ships(&ships,4).unwrap(),IncomingShips::Types{types,total} if types.len()==2&&total=="30")
    );
    assert!(
        matches!(incoming_ships(&ships,8).unwrap(),IncomingShips::Exact{ships,total} if ships[0].count=="20"&&total=="30")
    );
}

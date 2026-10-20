use orbit_engine::*;
use uuid::Uuid;
#[test]
fn adjacent_planets_match_all_three_frozen_vectors() {
    for (speed, seconds) in [(1, 4741), (4, 1185), (100, 47)] {
        let rules = Ruleset::from_json(include_bytes!("../../../rules/first-slice-v1.json"))
            .unwrap()
            .with_speed(speed)
            .unwrap();
        let request = TransportTermsRequest {
            origin: Coordinates {
                galaxy: 1,
                system: 1,
                position: 8,
            },
            target: Coordinates {
                galaxy: 1,
                system: 1,
                position: 9,
            },
            ships: vec![ShipStack {
                owner: PlayerId(Uuid::from_u128(1)),
                ship_type: ShipType::SmallCargo,
                count: 2,
            }],
            combustion: 1,
            speed_percent: 100,
        };
        let terms = travel_terms(&request, &rules).unwrap();
        assert_eq!(terms.duration, seconds * 1000);
        assert_eq!(terms.fuel, 3 * SCALE);
        assert_eq!(terms.maximum_payload, 9997 * SCALE);
        assert_eq!(terms.capacity, 10000 * SCALE);
    }
}
#[test]
fn square_root_fixed_precision_boundaries() {
    assert_eq!(sqrt12(4, 1).unwrap(), 2_000_000_000_000);
    assert_eq!(sqrt12(2, 1).unwrap(), 1_414_213_562_373);
    assert_eq!(sqrt12(0, 1).unwrap(), 0);
    assert!(sqrt12(1, 0).is_err());
    assert_eq!(
        sqrt12(3999999999999, 1000000000000).unwrap(),
        1_999_999_999_999
    );
}

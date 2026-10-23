use orbit_engine::*;
#[test]
fn exact_symmetric_protection_boundaries() {
    assert!(!beginner_protected(0, 0, false, false, 5).unwrap());
    assert!(beginner_protected(0, 1, false, false, 5).unwrap());
    assert!(!beginner_protected(0, 1, true, false, 5).unwrap());
    assert!(beginner_protected(0, 1, false, true, 5).unwrap());
    for (a, b) in [
        (1_000_000_000_000, 5_000_000_000_001),
        (5_000_000_000_001, 1_000_000_000_000),
    ] {
        assert!(beginner_protected(a, b, false, false, 5).unwrap());
    }
    assert!(!beginner_protected(1_000_000_000_000, 5_000_000_000_000, false, false, 5).unwrap());
    assert!(!beginner_protected(5_000_000_000_000, i64::MAX, false, false, 5).unwrap());
    assert!(beginner_protected(-1, 0, false, false, 5).is_err());
}
#[test]
fn real_time_presence_and_activity_boundaries() {
    assert_eq!(inactivity(0, 604_799_999).unwrap(), Inactivity::Active);
    assert_eq!(inactivity(0, 604_800_000).unwrap(), Inactivity::Inactive7);
    assert_eq!(
        inactivity(0, 2_419_200_000).unwrap(),
        Inactivity::Inactive28
    );
    assert_eq!(
        public_activity(Some(0), 899_999).unwrap(),
        PublicActivity::Recent
    );
    assert_eq!(
        public_activity(Some(0), 900_000).unwrap(),
        PublicActivity::Minutes(15)
    );
    assert_eq!(
        public_activity(Some(0), 3_599_999).unwrap(),
        PublicActivity::Minutes(59)
    );
    assert_eq!(
        public_activity(Some(0), 3_600_000).unwrap(),
        PublicActivity::None
    );
    assert!(public_activity(Some(1), 0).is_err());
}

#[test]
fn configurable_protection_keeps_exact_symmetric_boundaries_and_exemptions() {
    for multiplier in [1, 2, 5, 10, u32::MAX] {
        let low = 1000;
        let boundary = low * i64::from(multiplier);
        for (a, b) in [(low, boundary), (boundary, low)] {
            assert!(!beginner_protected(a, b, false, false, multiplier).unwrap());
        }
        assert!(beginner_protected(low, boundary + 1, false, false, multiplier).unwrap());
        assert!(beginner_protected(boundary + 1, low, false, false, multiplier).unwrap());
        assert!(!beginner_protected(low, boundary + 1, true, false, multiplier).unwrap());
        assert!(!beginner_protected(boundary + 1, low, false, true, multiplier).unwrap());
        assert!(beginner_protected(0, 1, false, false, multiplier).unwrap());
        assert!(!beginner_protected(0, 0, false, false, multiplier).unwrap());
        assert!(
            !beginner_protected(5_000_000_000_000, i64::MAX, false, false, multiplier).unwrap()
        );
    }
    // Multiplication is wider than the asset valuation, even below the score cutoff.
    assert!(!beginner_protected(4_999_999_999_999, i64::MAX, false, false, u32::MAX).unwrap());
    assert!(beginner_protected(1, 10, false, false, 0).is_err());
}

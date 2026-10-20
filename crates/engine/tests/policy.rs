use orbit_engine::*;
#[test]
fn exact_symmetric_protection_boundaries() {
    assert!(!beginner_protected(0, 0, false, false).unwrap());
    assert!(beginner_protected(0, 1, false, false).unwrap());
    assert!(!beginner_protected(0, 1, true, false).unwrap());
    assert!(beginner_protected(0, 1, false, true).unwrap());
    for (a, b) in [
        (1_000_000_000_000, 5_000_000_000_001),
        (5_000_000_000_001, 1_000_000_000_000),
    ] {
        assert!(beginner_protected(a, b, false, false).unwrap());
    }
    assert!(!beginner_protected(1_000_000_000_000, 5_000_000_000_000, false, false).unwrap());
    assert!(!beginner_protected(5_000_000_000_000, i64::MAX, false, false).unwrap());
    assert!(beginner_protected(-1, 0, false, false).is_err());
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

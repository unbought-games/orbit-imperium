use orbit_engine::*;
use std::collections::BTreeSet;

fn coordinate(galaxy: u32, system: u32, position: u32) -> Coordinates {
    Coordinates {
        galaxy,
        system,
        position,
    }
}

fn next(
    profile: &UniverseProfile,
    seed: u8,
    homes: &[Coordinates],
    blocked: &[Coordinates],
) -> Result<Homeworld, RulesError> {
    neighborhood_homeworld(
        &[seed; 32],
        uuid::Uuid::from_u128(1).into(),
        uuid::Uuid::from_u128(2).into(),
        profile,
        homes.len(),
        homes,
        blocked,
    )
}

fn grow(profile: &UniverseProfile, seed: u8, homes: &mut Vec<Coordinates>, additional: usize) {
    for _ in 0..additional {
        let home = next(profile, seed, homes, homes).unwrap();
        home.validate(profile).unwrap();
        assert_eq!(home.coordinates.galaxy, 1);
        assert!(!homes.contains(&home.coordinates));
        homes.push(home.coordinates);
    }
}

fn span(homes: &[Coordinates]) -> u32 {
    homes.iter().map(|c| c.system).max().unwrap() - homes.iter().map(|c| c.system).min().unwrap()
        + 1
}

#[test]
fn seeded_growth_targets_two_players_per_system_without_moving_earlier_homes() {
    let profile = UniverseProfile::signup(5, 500).unwrap();
    let mut starts = BTreeSet::new();
    for seed in [1, 7, 10, 42] {
        let mut homes = vec![];
        grow(&profile, seed, &mut homes, 20);
        starts.insert(homes[0].system);
        assert!(
            (8..=10).contains(&span(&homes)),
            "seed {seed}: {}",
            span(&homes)
        );
        let first_twenty = homes.clone();
        grow(&profile, seed, &mut homes, 80);
        assert_eq!(&homes[..20], first_twenty);
        assert!(
            (40..=50).contains(&span(&homes)),
            "seed {seed}: {}",
            span(&homes)
        );
        let first_hundred = homes.clone();
        grow(&profile, seed, &mut homes, 400);
        assert_eq!(&homes[..100], first_hundred);
        assert!(
            (225..=250).contains(&span(&homes)),
            "seed {seed}: {}",
            span(&homes)
        );
        let mut repeated = vec![];
        grow(&profile, seed, &mut repeated, 100);
        assert_eq!(first_hundred, repeated);
    }
    assert!(starts.len() > 1);
    assert!(starts.iter().any(|&system| system > 1));
}

#[test]
fn new_arrivals_spread_out_from_a_legacy_dense_population() {
    let profile = UniverseProfile::signup(5, 300).unwrap();
    let mut homes = vec![];
    for ordinal in 0..100 {
        homes.push(
            balanced_homeworld(
                &[7; 32],
                uuid::Uuid::from_u128(1).into(),
                uuid::Uuid::from_u128(2).into(),
                &profile,
                ordinal,
                &homes,
                &homes,
            )
            .unwrap()
            .coordinates,
        );
    }
    assert_eq!(span(&homes), 23);
    let original = homes.clone();
    grow(&profile, 7, &mut homes, 100);
    assert_eq!(&homes[..100], original);
    assert!((85..=100).contains(&span(&homes)), "span {}", span(&homes));
    assert!(homes[100..].iter().filter(|c| c.system <= 23).count() < 20);
    let expected = next(&profile, 7, &homes, &homes).unwrap();
    homes.reverse();
    assert_eq!(expected, next(&profile, 7, &homes, &homes).unwrap());
}

#[test]
fn scattered_neighborhoods_both_receive_arrivals_without_a_new_random_center() {
    let profile = UniverseProfile::signup(3, 100).unwrap();
    let homes: Vec<_> = (40..=44)
        .chain(80..=84)
        .flat_map(|s| (4..=7).map(move |p| coordinate(1, s, p)))
        .collect();
    let mut left = false;
    let mut right = false;
    for seed in 0..64 {
        let c = next(&profile, seed, &homes, &homes).unwrap().coordinates;
        assert_eq!(c.galaxy, 1);
        assert!(homes.iter().any(|old| old.system.abs_diff(c.system) <= 10));
        assert!((40..=84).contains(&c.system));
        left |= c.system < 60;
        right |= c.system > 60;
    }
    assert!(left && right);
}

#[test]
fn colonies_block_slots_without_counting_as_players_and_nearest_free_fallback_works() {
    let profile = UniverseProfile::signup(3, 100).unwrap();
    let homes = vec![coordinate(1, 50, 4)];
    let blocked: Vec<_> = (1..=100)
        .filter(|&s| s != 80 && s != 90)
        .flat_map(|s| (4..=12).map(move |p| coordinate(1, s, p)))
        .collect();
    let home = next(&profile, 7, &homes, &blocked).unwrap();
    assert_eq!(home.coordinates.system, 80);
    assert!(!blocked.contains(&home.coordinates));
    let mut duplicate_blockers = blocked.clone();
    duplicate_blockers.extend(blocked);
    duplicate_blockers.extend(&homes);
    assert_eq!(
        home,
        next(&profile, 7, &homes, &duplicate_blockers).unwrap()
    );

    // No homes in Galaxy 1: select any free system, not a colony-centered region.
    let blocked: Vec<_> = (1..=99)
        .flat_map(|s| (4..=12).map(move |p| coordinate(1, s, p)))
        .chain((4..12).map(|p| coordinate(1, 100, p)))
        .collect();
    assert_eq!(
        next(&profile, 7, &[], &blocked).unwrap().coordinates,
        coordinate(1, 100, 12)
    );
}

#[test]
fn galaxy_one_is_a_hard_boundary_even_after_its_density_target_is_exceeded() {
    for systems in [1, 3, 20] {
        let profile = UniverseProfile::signup(5, systems).unwrap();
        let mut homes = vec![];
        grow(&profile, 7, &mut homes, (systems * 9) as usize);
        assert_eq!(
            homes.iter().copied().collect::<BTreeSet<_>>().len(),
            (systems * 9) as usize
        );
        assert!(next(&profile, 7, &homes, &homes).is_err());
    }
}

#[test]
fn existing_other_galaxies_do_not_pull_new_homes_out_of_galaxy_one() {
    let profile = UniverseProfile::signup(3, 100).unwrap();
    let homes = vec![
        coordinate(1, 70, 4),
        coordinate(2, 1, 4),
        coordinate(3, 100, 4),
    ];
    for seed in 0..16 {
        let home = next(&profile, seed, &homes, &homes).unwrap();
        assert_eq!(home.coordinates.galaxy, 1);
        assert_eq!(home.coordinates.system, 70);
    }
}

#[test]
fn maximum_topology_uses_the_full_system_range_without_other_galaxy_allocation() {
    let profile = UniverseProfile::signup(100, 1000).unwrap();
    let homes: Vec<_> = (1..=1000).map(|s| coordinate(1, s, 4)).collect();
    let mut reached_upper_systems = false;
    for seed in 0..32 {
        let home = next(&profile, seed, &homes, &homes).unwrap();
        assert_eq!(home.coordinates.galaxy, 1);
        assert!((5..=12).contains(&home.coordinates.position));
        reached_upper_systems |= home.coordinates.system > 256;
    }
    assert!(reached_upper_systems);
}

#[test]
fn invalid_facts_are_rejected_and_noneligible_planet_slots_do_not_block_homeworlds() {
    let profile = UniverseProfile::signup(2, 1).unwrap();
    let home = coordinate(1, 1, 4);
    for homes in [
        vec![home, home],
        vec![coordinate(1, 1, 3)],
        vec![coordinate(3, 1, 4)],
    ] {
        assert!(next(&profile, 7, &homes, &[]).is_err());
    }
    assert!(next(&profile, 7, &[], &[coordinate(1, 2, 4)]).is_err());
    assert_eq!(
        next(&profile, 7, &[], &[]).unwrap(),
        next(
            &profile,
            7,
            &[],
            &[coordinate(1, 1, 1), coordinate(2, 1, 4)]
        )
        .unwrap()
    );
    let legacy = Ruleset::mvp_raids().unwrap();
    assert!(next(legacy.artifact.universe.as_ref().unwrap(), 7, &[], &[]).is_err());
}

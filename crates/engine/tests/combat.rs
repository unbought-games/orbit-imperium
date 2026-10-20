use orbit_engine::*;
#[test]
fn shield_and_inclusive_explosion_boundaries() {
    let r = CombatRules::selected();
    let a = apply_combat_hit(
        50 * 100000,
        2000 * 100000,
        2000 * 100000,
        100 * 100000,
        100 * 100000,
        &r,
    )
    .unwrap();
    assert_eq!(
        (a.shield_removed, a.hull_removed, a.explosion),
        (40 * 100000, 0, false)
    );
    let a = apply_combat_hit(
        50 * 100000,
        2000 * 100000,
        20 * 100000,
        100 * 100000,
        100 * 100000,
        &r,
    )
    .unwrap();
    assert_eq!(
        (a.shield_removed, a.hull_removed, a.explosion),
        (20 * 100000, 30 * 100000, true)
    );
    let a = apply_combat_hit(1, 2000 * 100000, 20 * 100000, 69 * 100000, 100 * 100000, &r).unwrap();
    assert!(a.bounced);
    assert!(!a.explosion);
    let a = apply_combat_hit(100000, 2000 * 100000, 0, 69 * 100000, 100 * 100000, &r).unwrap();
    assert!(!a.bounced);
    assert!(a.explosion);
}
#[test]
fn loaded_cargo_only_loses_overflow() {
    assert_eq!(
        retain_cargo(
            Resources::from_values([3 * SCALE, 2 * SCALE, SCALE]),
            3 * SCALE
        )
        .unwrap(),
        Resources::from_values([2 * SCALE, SCALE, 0])
    );
    assert_eq!(
        retain_cargo(Resources::from_values([10000 * SCALE, 0, 0]), 25000 * SCALE)
            .unwrap()
            .metal,
        10000 * SCALE
    );
    assert_eq!(
        retain_cargo(Resources::from_values([40000 * SCALE, 0, 0]), 25000 * SCALE)
            .unwrap()
            .metal,
        25000 * SCALE
    );
}
#[test]
fn simultaneous_rounds_and_artifact_driven_explosion_policy() {
    use uuid::Uuid;
    let owner = PlayerId(Uuid::from_u128(1));
    let other = PlayerId(Uuid::from_u128(2));
    let encounter = InputId(Uuid::from_u128(3));
    let participant = |owner, side, origin, technology| BattleParticipant {
        owner,
        side,
        origin,
        technology,
        units: vec![(ManufacturedItem::Ship(ShipType::LightFighter), 1)],
    };
    let input = BattleInput {
        encounter_id: encounter,
        at: 0,
        target: BodyId(Uuid::from_u128(4)),
        rules_hash: Hash("0".repeat(64)),
        participants: vec![
            participant(
                owner,
                BattleSide::Attacker,
                BattleOrigin::Fleet(FleetId(Uuid::from_u128(5))),
                [0; 3],
            ),
            participant(
                other,
                BattleSide::Defender,
                BattleOrigin::Stationed(BodyId(Uuid::from_u128(4))),
                [0; 3],
            ),
        ],
    };
    let mut rules = CombatRules::selected();
    rules.explosion_hull_threshold = [0, 10];
    let mut rng = RandomStream::new(
        &[7; 32],
        UniverseId(Uuid::from_u128(1)),
        Epoch(Uuid::from_u128(2)),
        encounter,
        "battle",
    )
    .unwrap();
    let before = rng.clone();
    let result = resolve_battle(&input, &rules, &mut rng).unwrap();
    assert_eq!(result.rounds.len(), 6);
    assert_eq!(result.outcome, BattleOutcome::Draw);
    assert!(
        result
            .damage
            .iter()
            .all(|unit| unit.hull_ticks == "16000000" && unit.shield_ticks == "0")
    );
    assert!(result.destroyed.iter().all(|p| p.units.is_empty()));
    assert_eq!(rng, before);
    let mut lethal = input.clone();
    for p in &mut lethal.participants {
        p.technology[0] = 100;
    }
    let result = resolve_battle(&lethal, &rules, &mut rng).unwrap();
    assert_eq!(result.outcome, BattleOutcome::MutualDestruction);
    assert_eq!(result.rounds.len(), 1);
    assert_eq!(result.rounds[0].shots, "2");
    assert_eq!(rng, before);
    let mut duplicate = lethal.clone();
    duplicate.participants.push(lethal.participants[0].clone());
    assert!(resolve_battle(&duplicate, &rules, &mut rng).is_err());
    assert_eq!(rng, before);
}

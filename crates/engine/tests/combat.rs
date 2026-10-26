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
    assert_eq!(result.rounds[0].fire.len(), 2);
    for fire in &result.rounds[0].fire {
        assert_eq!(fire.shots, "1");
        assert_eq!(fire.raw_attack_ticks, "55000000");
        assert_eq!(fire.shield_removed_ticks, "1000000");
        assert_eq!(fire.hull_removed_ticks, "40000000");
        assert_eq!(fire.explosions, "0");
    }
    assert_eq!(result.rounds[0].fire[0].owner, owner);
    assert_eq!(result.rounds[0].fire[0].side, BattleSide::Attacker);
    assert_eq!(result.rounds[0].fire[1].owner, other);
    assert_eq!(result.rounds[0].fire[1].side, BattleSide::Defender);
    assert_eq!(rng, before);
    let mut duplicate = lethal.clone();
    duplicate.participants.push(lethal.participants[0].clone());
    assert!(resolve_battle(&duplicate, &rules, &mut rng).is_err());
    assert_eq!(rng, before);
}

#[test]
fn fighter_and_launcher_fire_is_attributed_to_the_shooter() {
    use uuid::Uuid;
    let encounter = InputId(Uuid::from_u128(30));
    let target = BodyId(Uuid::from_u128(40));
    let attacker = PlayerId(Uuid::from_u128(10));
    let defender = PlayerId(Uuid::from_u128(20));
    let input = BattleInput {
        encounter_id: encounter,
        at: 0,
        target,
        rules_hash: Hash("0".repeat(64)),
        participants: vec![
            BattleParticipant {
                owner: defender,
                side: BattleSide::Defender,
                origin: BattleOrigin::Stationed(target),
                technology: [0; 3],
                units: vec![(ManufacturedItem::Defense(DefenseId::RocketLauncher), 1)],
            },
            BattleParticipant {
                owner: attacker,
                side: BattleSide::Attacker,
                origin: BattleOrigin::Fleet(FleetId(Uuid::from_u128(50))),
                technology: [0; 3],
                units: vec![(ManufacturedItem::Ship(ShipType::LightFighter), 1)],
            },
        ],
    };
    let mut rng = RandomStream::new(
        &[7; 32],
        UniverseId(Uuid::from_u128(1)),
        Epoch(Uuid::from_u128(2)),
        encounter,
        "battle",
    )
    .unwrap();
    let result = resolve_battle(&input, &CombatRules::selected(), &mut rng).unwrap();
    let first = &result.rounds[0];
    assert_eq!(first.fire[0].owner, attacker);
    assert_eq!(first.fire[0].side, BattleSide::Attacker);
    assert_eq!(first.fire[0].shots, "1");
    assert_eq!(first.fire[0].raw_attack_ticks, "5000000");
    assert_eq!(first.fire[0].shield_removed_ticks, "2000000");
    assert_eq!(first.fire[0].hull_removed_ticks, "3000000");
    assert_eq!(first.fire[1].owner, defender);
    assert_eq!(first.fire[1].side, BattleSide::Defender);
    assert_eq!(first.fire[1].shots, "1");
    assert_eq!(first.fire[1].raw_attack_ticks, "8000000");
    assert_eq!(first.fire[1].shield_removed_ticks, "1000000");
    assert_eq!(first.fire[1].hull_removed_ticks, "7000000");
    for round in &result.rounds {
        for fire in &round.fire {
            let start = round
                .start
                .iter()
                .find(|p| p.owner == fire.owner && p.origin == fire.origin)
                .unwrap();
            assert_eq!(
                fire.shots.parse::<i64>().unwrap(),
                start.units.iter().map(|(_, n)| n).sum::<i64>()
            );
        }
    }
    let serialized = serde_json::to_value(first).unwrap();
    assert!(
        serialized.get("shots").is_none(),
        "do not duplicate derived totals"
    );
    assert_eq!(
        serialized["fire"][0]["owner"],
        serde_json::to_value(attacker).unwrap()
    );
}

#[test]
fn large_shield_dome_bounces_light_fighters_and_resets_shields_each_round() {
    use uuid::Uuid;
    let rules = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
    let combat = &rules.artifact.world.as_ref().unwrap().combat;
    let dome = ManufacturedItem::Defense(DefenseId::LargeShieldDome);
    let stats = |item| {
        combat_unit_stats(
            combat.units.iter().find(|u| u.item == item).unwrap(),
            [6; 3],
            combat,
        )
        .unwrap()
    };
    let (_, shield, hull) = stats(dome);
    assert_eq!(shield, 16000 * 100000);
    assert_eq!(hull, 16000 * 100000);
    for (ship, bounced) in [
        (ShipType::LightFighter, true),
        (ShipType::HeavyFighter, false),
        (ShipType::Cruiser, false),
    ] {
        let (attack, _, _) = stats(ManufacturedItem::Ship(ship));
        let hit = apply_combat_hit(attack, shield, shield, hull, hull, combat).unwrap();
        assert_eq!(hit.bounced, bounced);
        assert_eq!(hit.shield_removed > 0, !bounced);
    }
    let target = BodyId(Uuid::from_u128(1));
    let encounter = InputId(Uuid::from_u128(2));
    let mut input = BattleInput {
        encounter_id: encounter,
        at: 0,
        target,
        rules_hash: rules.hash.clone(),
        participants: vec![
            BattleParticipant {
                owner: PlayerId(Uuid::from_u128(3)),
                origin: BattleOrigin::Fleet(FleetId(Uuid::from_u128(4))),
                side: BattleSide::Attacker,
                technology: [6; 3],
                units: vec![(ManufacturedItem::Ship(ShipType::LightFighter), 100)],
            },
            BattleParticipant {
                owner: PlayerId(Uuid::from_u128(5)),
                origin: BattleOrigin::Stationed(target),
                side: BattleSide::Defender,
                technology: [6; 3],
                units: vec![(dome, 1)],
            },
        ],
    };
    let rng = || {
        RandomStream::new(
            &[7; 32],
            UniverseId(Uuid::from_u128(6)),
            Epoch(Uuid::from_u128(7)),
            encounter,
            "battle",
        )
        .unwrap()
    };
    let result = resolve_battle(&input, combat, &mut rng()).unwrap();
    assert_eq!(result.outcome, BattleOutcome::Draw);
    assert_eq!(result.rounds.len(), 6);
    assert!(
        result
            .destroyed
            .iter()
            .all(|counts| counts.units.iter().all(|(_, n)| *n == 0))
    );
    // One Cruiser can chip the dome's shield but cannot overcome its round reset.
    input.participants[0].units = vec![(ManufacturedItem::Ship(ShipType::Cruiser), 1)];
    let result = resolve_battle(&input, combat, &mut rng()).unwrap();
    assert_eq!(result.outcome, BattleOutcome::Draw);
    let removed: Vec<_> = result
        .rounds
        .iter()
        .map(|round| {
            round
                .fire
                .iter()
                .find(|fire| fire.side == BattleSide::Attacker)
                .unwrap()
                .shield_removed_ticks
                .clone()
        })
        .collect();
    assert_eq!(removed.len(), 6);
    assert!(removed.iter().all(|n| n == &removed[0] && n != "0"));
    // A sufficiently strong fleet can destroy the dome.
    input.participants[0].units = vec![(ManufacturedItem::Ship(ShipType::Cruiser), 1000)];
    let result = resolve_battle(&input, combat, &mut rng()).unwrap();
    assert_eq!(result.outcome, BattleOutcome::AttackerVictory);
    assert!(
        result
            .destroyed
            .iter()
            .any(|counts| counts.units.contains(&(dome, 1)))
    );
}

use super::*;

pub(super) fn setup() -> (GameState, Ruleset, PlayerId, BodyId, BodyId, FleetIntent) {
    let rules = standard_signup_rules(UniverseProfile::signup(2, 100).unwrap(), 10).unwrap();
    let (mut s, rules, p, home, parent) = fixture_with_rules(rules);
    for body in s.bodies.values_mut() {
        body.levels = rules.building_keys().into_iter().map(|k| (k, 0)).collect();
    }
    for research in s.research.values_mut() {
        research.levels = rules.research_keys().into_iter().map(|k| (k, 0)).collect();
    }
    let moon = moons::add_moon(&mut s, parent, 83000);
    let defender = s.bodies[&moon].owner;
    s.collection_revisions
        .insert(format!("inventory:{moon}:{defender}"), 0);
    s.coverage.moon_removal_bodies.insert(moon);
    s.world
        .as_mut()
        .unwrap()
        .records
        .moons
        .get_mut(&moon)
        .unwrap()
        .diameter_km = 8100;
    s.bodies.get_mut(&moon).unwrap().checkpoint.amounts = Resources::all(100 * SCALE);
    // Equal launch scores, while the defending Dreadnoughts remain at the planet.
    for body in [home, parent] {
        set_units(
            &mut s,
            &rules,
            body,
            ManufacturedItem::Ship(ShipType::Dreadnought),
            4,
        );
    }
    let mut request = intent(&s, p, home, moon);
    request.mission = Mission::DestroyMoon;
    request.ships.push(ManifestStack {
        owner: p,
        ship_type: ShipType::Dreadnought,
        count: 4,
    });
    request.cargo = Resources::all(10 * SCALE);
    (s, rules, p, home, moon, request)
}

#[test]
fn requires_a_hostile_lunar_body_dreadnoughts_and_an_independent_fleet() {
    let (s, r, p, home, moon, request) = setup();
    let q = quote_fleet_with_odds(&s, p, &request, 1000, &r).unwrap();
    let wire = serde_json::to_value(q).unwrap();
    assert_eq!(
        wire["moon_destruction"],
        serde_json::json!({
            "diameter_km":8100, "moon_chance_ppm":200000, "fleet_loss_ppm":450000
        })
    );
    let mut no_ship = request.clone();
    no_ship
        .ships
        .retain(|ship| ship.ship_type != ShipType::Dreadnought);
    assert_eq!(
        quote_fleet(&s, p, &no_ship, 1000, &r),
        Err(GameError::InsufficientShips)
    );
    let mut wrong_body = request.clone();
    let parent = s.world.as_ref().unwrap().records.moons[&moon].parent;
    wrong_body.destination = intent(&s, p, home, parent).destination;
    assert_eq!(
        quote_fleet(&s, p, &wrong_body, 1000, &r),
        Err(GameError::BodyKindNotAllowed)
    );
    let mut joined = request;
    joined.attack_group = Some(OperationId(Uuid::from_u128(83333)));
    assert_eq!(
        quote_fleet(&s, p, &joined, 1000, &r),
        Err(GameError::UnavailableContent)
    );
}

#[test]
fn independent_rolls_account_for_loot_escorts_debris_and_committed_flights_after_deactivation() {
    // Precomputed HMAC draws for input 83002, d=8100 and four survivors.
    for (seed, destroyed, lost) in [
        (0, false, true),
        (3, false, false),
        (5, true, true),
        (28, true, false),
    ] {
        let (mut s, rules, p, home, moon, request) = setup();
        s.world.as_mut().unwrap().secret = [seed; 32];
        let event = launch_raid(&mut s, &rules, p, home, request.clone(), 1000, 83001);
        let mut disabled = rules.artifact.clone();
        disabled.world.as_mut().unwrap().moon_destruction = None;
        let r = Ruleset::from_artifact(disabled, rules.speed).unwrap();
        validate_rules_update(&rules, &r).unwrap();
        s.profile_hash = r.hash.clone();
        assert_eq!(
            quote_fleet(&s, p, &request, 1001, &r),
            Err(GameError::UnavailableContent)
        );
        let result = run(
            &mut s,
            &r,
            p,
            home,
            event.at,
            83002,
            Input::Event(event.event.clone()),
        );
        let changes = apply(&mut s, result);
        let world = &s.world.as_ref().unwrap().records;
        let fleet = world.fleets.values().next().unwrap();
        let report = &world
            .reports
            .values()
            .find(|report| report.kind == "Combat")
            .unwrap()
            .payloads[&p];
        assert_eq!(
            report["moon_destruction"],
            serde_json::json!({
                "diameter_km":8100,"moon_chance_ppm":200000,"fleet_loss_ppm":450000,
                "surviving_dreadnoughts":"4","moon_destroyed":destroyed,"fleet_lost":lost
            })
        );
        assert_eq!(
            report["loot"],
            serde_json::json!({"metal":(50*SCALE).to_string(),"crystal":(50*SCALE).to_string(),"deuterium":(50*SCALE).to_string()})
        );
        assert_eq!(world.moons.contains_key(&moon), !destroyed);
        assert_eq!(s.bodies.contains_key(&moon), !destroyed);
        assert!(world.debris.is_empty());
        let audits = &changes.world.as_ref().unwrap().audits;
        assert_eq!(
            audits
                .iter()
                .filter(|a| a["kind"] == "MoonDestruction")
                .count(),
            1
        );
        assert_eq!(
            audits
                .iter()
                .filter(|a| a["kind"] == "AttackEvidence")
                .count(),
            1
        );
        if lost {
            assert_eq!(fleet.leg, MissionLeg::Destroyed);
            assert!(fleet.ships.is_empty() && report["return_at"].is_null());
            assert_eq!(fleet.cargo, Resources::default());
            assert!(
                world
                    .lots
                    .iter()
                    .all(|lot| lot.location != AssetLocation::Fleet(fleet.id))
            );
        } else {
            assert_eq!(fleet.leg, MissionLeg::Returning);
            assert_eq!(fleet.ships.len(), 2);
            assert_eq!(fleet.cargo, Resources::all(60 * SCALE));
            assert_eq!(report["return_at"], fleet.due_at);
        }
        validate_asset_lineage(&s).unwrap();
    }
}

#[test]
fn defending_victory_counts_contact_once_and_skips_destruction_sampling() {
    let (mut s, r, p, home, moon, request) = setup();
    let event = launch_raid(&mut s, &r, p, home, request, 1000, 83001);
    // Defending reinforcements enter after launch.
    set_units(
        &mut s,
        &r,
        moon,
        ManufacturedItem::Ship(ShipType::Dreadnought),
        100,
    );
    let result = run(
        &mut s,
        &r,
        p,
        home,
        event.at,
        83002,
        Input::Event(event.event),
    );
    let changes = apply(&mut s, result);
    let world = &s.world.as_ref().unwrap().records;
    assert!(world.moons.contains_key(&moon));
    let defender = s.bodies[&moon].owner;
    let report = &world
        .reports
        .values()
        .find(|report| report.kind == "Combat")
        .unwrap()
        .payloads[&defender];
    assert_eq!(report["outcome"], "DefenderVictory");
    assert!(report.get("moon_destruction").is_none());
    let audits = &changes.world.unwrap().audits;
    assert!(!audits.iter().any(|a| a["kind"] == "MoonDestruction"));
    assert_eq!(
        audits
            .iter()
            .filter(|a| a["kind"] == "AttackEvidence")
            .count(),
        1
    );
}

#[test]
fn victory_uses_only_surviving_dreadnoughts_and_a_winning_escort_alone_cannot_fire() {
    // One simultaneous exchange: both sides can destroy a Dreadnought in one
    // shot. With one escort the fixed battle stream selects the Dreadnought.
    for with_escort in [false, true] {
        let (mut s, original, p, home, moon, mut request) = setup();
        let mut artifact = original.artifact.clone();
        let item = ManufacturedItem::Ship(ShipType::Dreadnought);
        artifact
            .world
            .as_mut()
            .unwrap()
            .combat
            .units
            .iter_mut()
            .find(|u| u.item == item)
            .unwrap()
            .attack_hundredths = 200_000_000;
        let rules = Ruleset::from_artifact(artifact, original.speed).unwrap();
        s.profile_hash = rules.hash.clone();
        s.world.as_mut().unwrap().secret = [4; 32];
        set_units(&mut s, &rules, moon, item, 1);
        let count = if with_escort { 1 } else { 2 };
        request
            .ships
            .retain(|s| with_escort || s.ship_type == ShipType::Dreadnought);
        request
            .ships
            .iter_mut()
            .find(|s| s.ship_type == ShipType::Dreadnought)
            .unwrap()
            .count = count;
        let event = launch_raid(&mut s, &rules, p, home, request, 1000, 83001);
        let result = run(
            &mut s,
            &rules,
            p,
            home,
            event.at,
            83002,
            Input::Event(event.event),
        );
        let c = apply(&mut s, result);
        let w = &c.world.unwrap();
        let report = &w
            .records
            .reports
            .values()
            .find(|r| r.kind == "Combat")
            .unwrap()
            .payloads[&p];
        assert_eq!(report["outcome"], "AttackerVictory");
        assert_eq!(report["debris"]["metal"], (3_000_000 * SCALE).to_string());
        if with_escort {
            assert!(report.get("moon_destruction").is_none());
            assert!(!w.audits.iter().any(|a| a["kind"] == "MoonDestruction"));
            assert!(s.bodies.contains_key(&moon));
        } else {
            assert_eq!(report["moon_destruction"]["surviving_dreadnoughts"], "1");
            assert_eq!(report["moon_destruction"]["moon_chance_ppm"], 100_000);
        }
    }
}

use super::*;
const DESTROYER: ManufacturedItem = ManufacturedItem::Ship(ShipType::Destroyer);

fn setup(yard: u32) -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, _, p, b, t) = raid_fixture();
    let r = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 10).unwrap();
    for body in s.bodies.values_mut() {
        for key in r.building_keys() {
            body.levels.entry(key).or_insert(0);
        }
    }
    s.profile_hash = r.hash.clone();
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(1000000 * SCALE);
    for research in s.research.values_mut() {
        for key in r.research_keys() {
            research.levels.entry(key).or_insert(0);
        }
    }
    fixture_building(&mut s, &r, b, Building::Shipyard, yard);
    fixture_research(&mut s, &r, p, ResearchId::HyperspaceTechnology, 5);
    fixture_research(&mut s, &r, p, ResearchId::HyperspaceDrive, 6);
    (s, r, p, b, t)
}

#[test]
fn every_destroyer_prerequisite_blocks_both_quote_and_manufacture() {
    for requirement in [
        Requirement::BodyBuilding {
            building: Building::Shipyard,
            level: 9,
        },
        Requirement::PlayerResearch {
            research: ResearchId::HyperspaceTechnology,
            level: 5,
        },
        Requirement::PlayerResearch {
            research: ResearchId::HyperspaceDrive,
            level: 6,
        },
    ] {
        let (mut s, r, p, b, _) = setup(9);
        match requirement {
            Requirement::BodyBuilding { building, level } => {
                s.bodies
                    .get_mut(&b)
                    .unwrap()
                    .levels
                    .insert(building, level - 1);
            }
            Requirement::PlayerResearch { research, level } => {
                s.research
                    .get_mut(&p)
                    .unwrap()
                    .levels
                    .insert(research, level - 1);
            }
        }
        // Keep the fixture's historical asset levels consistent with the missing gate.
        s.world
            .as_mut()
            .unwrap()
            .records
            .lots
            .retain(|lot| match requirement {
                Requirement::BodyBuilding { building, level } => {
                    !(lot.owner == p
                        && lot.item == CatalogKey::Building(building)
                        && lot.level == Some(level))
                }
                Requirement::PlayerResearch { research, level } => {
                    !(lot.owner == p
                        && lot.item == CatalogKey::Research(research)
                        && lot.level == Some(level))
                }
            });
        let request = QuoteRequest::Manufacture {
            body: b,
            item: DESTROYER,
            quantity: 1,
        };
        let q = inspect_progression(&s, Actor::Player(p), &request, 0, &r).unwrap();
        assert_eq!(q.blockers.len(), 1);
        assert_eq!(q.blockers[0].requirement, Some(requirement));
        let before = s.bodies[&b].checkpoint.clone();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            0,
            9900,
            Input::Command(Command::StartManufacture {
                body: b,
                item: DESTROYER,
                quantity: 1,
                expected_terms_hash: q.terms_hash.unwrap(),
            }),
        );
        assert_eq!(
            result,
            TransitionResult::Rejected(GameError::PrerequisiteMissing)
        );
        assert_eq!(s.bodies[&b].checkpoint, before);
        assert!(s.manufacturing_batches.is_empty());
    }
}

#[test]
fn manufactured_destroyer_flies_fights_and_returns_after_new_production_is_disabled() {
    paid_warship_roundtrip(
        ShipType::Destroyer,
        9,
        [60000, 50000, 15000],
        1_584_000,
        14000,
        1000,
        2000,
    );
}

#[test]
fn manufactured_dreadnought_flies_fights_and_returns_after_new_production_is_disabled() {
    paid_warship_roundtrip(
        ShipType::Dreadnought,
        12,
        [5_000_000, 4_000_000, 1_000_000],
        99_692_000,
        310,
        1,
        1_000_000,
    );
}

fn paid_warship_roundtrip(
    ship: ShipType,
    yard: u32,
    cost: [i64; 3],
    duration: i64,
    speed: i64,
    fuel: i64,
    capacity: i64,
) {
    let (mut s, r, p, b, t) = setup(yard);
    let item = ManufacturedItem::Ship(ship);
    if ship == ShipType::Dreadnought {
        s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(5_000_000 * SCALE);
        // An established target is outside beginner protection at launch.
        set_units(
            &mut s,
            &r,
            t,
            ManufacturedItem::Ship(ShipType::EspionageProbe),
            10_000,
        );
        fixture_research(&mut s, &r, p, ResearchId::HyperspaceTechnology, 6);
        fixture_research(&mut s, &r, p, ResearchId::HyperspaceDrive, 7);
        fixture_research(&mut s, &r, p, ResearchId::GravitonTechnology, 1);
    }
    let q = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item,
            quantity: 1,
        },
        0,
        &r,
    )
    .unwrap();
    assert!(q.blockers.is_empty());
    assert_eq!(
        q.terms.as_ref().unwrap().paid(),
        Resources::from_values([cost[0] * SCALE, cost[1] * SCALE, cost[2] * SCALE])
    );
    assert_eq!(q.terms.as_ref().unwrap().duration(), duration);
    let operation = OperationId(derived_id(
        InputId(Uuid::from_u128(9910)),
        "manufacturing:0",
    ));
    s.coverage.operations.insert(operation);
    s.coverage.manufacturing_operation_ids.insert(operation);
    s.coverage.research_operation_ids.insert(operation);
    let before = s.bodies[&b].checkpoint.amounts;
    let result = run(
        &mut s,
        &r,
        p,
        b,
        0,
        9910,
        Input::Command(Command::StartManufacture {
            body: b,
            item,
            quantity: 1,
            expected_terms_hash: q.terms_hash.unwrap(),
        }),
    );
    let started = apply(&mut s, result);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        before.metal - cost[0] * SCALE
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.crystal,
        before.crystal - cost[1] * SCALE
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.deuterium,
        before.deuterium - cost[2] * SCALE
    );
    let mut artifact = r.artifact.clone();
    artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ship))
        .unwrap()
        .enabled = false;
    let current = Ruleset::from_artifact(artifact, r.speed).unwrap();
    validate_rules_update(&r, &current).unwrap();
    s.profile_hash = current.hash.clone();
    let due = &started.events[0];
    let result = run(
        &mut s,
        &current,
        p,
        b,
        due.at,
        9911,
        Input::Event(due.event.clone()),
    );
    apply(&mut s, result);
    assert_eq!(
        s.inventories
            .iter()
            .find(|v| v.body == b && v.item == item)
            .unwrap()
            .count,
        1
    );
    validate_completed_assets(&s).unwrap();
    let blocked = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item,
            quantity: 1,
        },
        due.at,
        &current,
    )
    .unwrap();
    assert!(
        blocked
            .blockers
            .iter()
            .any(|b| b.code == GameError::UnavailableContent)
    );
    let mut request = intent(&s, p, b, t);
    request.mission = Mission::Attack;
    request.cargo = Resources::default();
    request.ships[0].ship_type = ship;
    let quote = quote_fleet(&s, p, &request, due.at, &current).unwrap();
    assert_eq!(quote.speeds, vec![(ship, speed.to_string())]);
    assert_eq!(quote.capacity, capacity * SCALE);
    assert_eq!(quote.maximum_payload, quote.capacity - quote.fuel);
    let expected = exact_flight_arithmetic(
        quote.distance,
        &[(speed, fuel, 1)],
        100,
        i64::from(current.speed),
    )
    .unwrap();
    assert_eq!((quote.duration_ms, quote.fuel), expected);
    let event = launch_raid(&mut s, &current, p, b, request, due.at, 9912);
    clear_units(&mut s, t);
    set_units(
        &mut s,
        &current,
        t,
        ManufacturedItem::Ship(ShipType::EspionageProbe),
        1,
    );
    let result = run(
        &mut s,
        &current,
        p,
        b,
        event.at,
        9913,
        Input::Event(event.event),
    );
    let combat = apply(&mut s, result);
    assert!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .reports
            .values()
            .any(|report| report.kind == "Combat")
    );
    let returning = combat
        .events
        .iter()
        .find(|e| matches!(e.event, ScheduledEvent::FleetLegDue { .. }))
        .unwrap();
    let result = run(
        &mut s,
        &current,
        p,
        b,
        returning.at,
        9914,
        Input::Event(returning.event.clone()),
    );
    apply(&mut s, result);
    assert_eq!(
        s.inventories
            .iter()
            .find(|v| v.body == b && v.item == item)
            .unwrap()
            .count,
        1
    );
    assert!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .all(|f| f.leg == MissionLeg::Returned)
    );
    validate_completed_assets(&s).unwrap();
}

#[test]
fn destroyer_batch_credits_each_unit_once_and_keeps_paid_terms_after_price_change() {
    let (mut s, r, p, b, _) = setup(9);
    let q = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: DESTROYER,
            quantity: 2,
        },
        0,
        &r,
    )
    .unwrap();
    assert!(q.blockers.is_empty());
    let operation = OperationId(derived_id(
        InputId(Uuid::from_u128(9950)),
        "manufacturing:0",
    ));
    s.coverage.operations.insert(operation);
    s.coverage.manufacturing_operation_ids.insert(operation);
    s.coverage.research_operation_ids.insert(operation);
    let before = s.bodies[&b].checkpoint.amounts;
    let result = run(
        &mut s,
        &r,
        p,
        b,
        0,
        9950,
        Input::Command(Command::StartManufacture {
            body: b,
            item: DESTROYER,
            quantity: 2,
            expected_terms_hash: q.terms_hash.unwrap(),
        }),
    );
    let started = apply(&mut s, result);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts,
        Resources::from_values([
            before.metal - 120000 * SCALE,
            before.crystal - 100000 * SCALE,
            before.deuterium - 30000 * SCALE,
        ])
    );
    assert!(
        !s.inventories
            .iter()
            .any(|i| i.body == b && i.item == DESTROYER)
    );
    let accepted = s.manufacturing_batches[&operation].clone();
    assert_eq!(accepted.unit_duration_ms, 1_584_000);
    assert_eq!(accepted.final_due_at, 3_168_000);
    let mut artifact = r.artifact.clone();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .iter_mut()
        .find(|u| u.item == DESTROYER)
        .unwrap()
        .cost
        .metal = 70000;
    artifact
        .world
        .as_mut()
        .unwrap()
        .combat
        .units
        .iter_mut()
        .find(|u| u.item == DESTROYER)
        .unwrap()
        .cost[0] = 70000;
    let current = Ruleset::from_artifact(artifact, r.speed).unwrap();
    validate_rules_update(&r, &current).unwrap();
    s.profile_hash = current.hash.clone();
    let mut event = started.events[0].clone();
    for count in 1..=2 {
        assert_eq!(event.at, count * 1_584_000);
        let expected_resources = settle_production(&s, &s.bodies[&b], event.at, &current).unwrap();
        let result = run(
            &mut s,
            &current,
            p,
            b,
            event.at,
            9950 + count as u128,
            Input::Event(event.event.clone()),
        );
        let completed = apply(&mut s, result);
        assert_eq!(
            s.inventories
                .iter()
                .find(|i| i.body == b && i.item == DESTROYER)
                .unwrap()
                .count,
            count
        );
        assert_eq!(s.manufacturing_batches[&operation].completed_prefix, count);
        assert_eq!(
            s.manufacturing_batches[&operation].commitment.paid,
            accepted.commitment.paid
        );
        assert_eq!(
            settle_production(&s, &s.bodies[&b], event.at, &current).unwrap(),
            expected_resources
        );
        validate_completed_assets(&s).unwrap();
        let duplicate = run(
            &mut s,
            &current,
            p,
            b,
            event.at,
            9960 + count as u128,
            Input::Event(event.event.clone()),
        );
        let duplicate = apply(&mut s, duplicate);
        assert!(duplicate.inventories.is_empty());
        assert_eq!(
            s.inventories
                .iter()
                .find(|i| i.body == b && i.item == DESTROYER)
                .unwrap()
                .count,
            count
        );
        if count == 1 {
            event = completed.events[0].clone();
        } else {
            assert!(completed.events.is_empty());
            assert_eq!(
                s.manufacturing_batches[&operation].status,
                ManufacturingStatus::Completed
            );
        }
    }
}

#[test]
fn destroyer_batch_requires_every_resource_before_payment() {
    for resource in 0..3 {
        let (mut s, r, p, b, _) = setup(9);
        let mut amounts = [120000 * SCALE, 100000 * SCALE, 30000 * SCALE];
        amounts[resource] -= 1;
        s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::from_values(amounts);
        let quote = inspect_progression(
            &s,
            Actor::Player(p),
            &QuoteRequest::Manufacture {
                body: b,
                item: DESTROYER,
                quantity: 2,
            },
            0,
            &r,
        )
        .unwrap();
        assert!(
            quote
                .blockers
                .iter()
                .any(|blocker| blocker.code == GameError::InsufficientResources)
        );
        let before = s.clone();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            0,
            9970,
            Input::Command(Command::StartManufacture {
                body: b,
                item: DESTROYER,
                quantity: 2,
                expected_terms_hash: quote.terms_hash.unwrap(),
            }),
        );
        assert_eq!(
            result,
            TransitionResult::Rejected(GameError::InsufficientResources)
        );
        // The harness records presence/coverage before calling the engine.
        // Rejection must preserve all gameplay balances, inventory and paid work.
        assert_eq!(s.bodies, before.bodies);
        assert_eq!(s.inventories, before.inventories);
        assert_eq!(s.manufacturing_batches, before.manufacturing_batches);
        assert_eq!(
            s.world.as_ref().unwrap().records.lots,
            before.world.as_ref().unwrap().records.lots
        );
    }
}

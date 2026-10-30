use super::*;
const BOMBER: ManufacturedItem = ManufacturedItem::Ship(ShipType::Bomber);

fn setup() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
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
    fixture_building(&mut s, &r, b, Building::Shipyard, 8);
    fixture_research(&mut s, &r, p, ResearchId::PlasmaTechnology, 5);
    fixture_research(&mut s, &r, p, ResearchId::ImpulseDrive, 6);
    (s, r, p, b, t)
}

#[test]
fn every_bomber_prerequisite_blocks_both_quote_and_manufacture() {
    for requirement in [
        Requirement::BodyBuilding {
            building: Building::Shipyard,
            level: 8,
        },
        Requirement::PlayerResearch {
            research: ResearchId::PlasmaTechnology,
            level: 5,
        },
        Requirement::PlayerResearch {
            research: ResearchId::ImpulseDrive,
            level: 6,
        },
    ] {
        let (mut s, r, p, b, _) = setup();
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
            item: BOMBER,
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
                item: BOMBER,
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
fn manufactured_bomber_flies_fights_and_returns_after_new_production_is_disabled() {
    let (mut s, r, p, b, t) = setup();
    let q = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: BOMBER,
            quantity: 1,
        },
        0,
        &r,
    )
    .unwrap();
    assert!(q.blockers.is_empty());
    assert_eq!(
        q.terms.as_ref().unwrap().paid(),
        Resources::from_values([50000 * SCALE, 25000 * SCALE, 15000 * SCALE])
    );
    assert_eq!(q.terms.as_ref().unwrap().duration(), 1_200_000);
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
            item: BOMBER,
            quantity: 1,
            expected_terms_hash: q.terms_hash.unwrap(),
        }),
    );
    let started = apply(&mut s, result);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        before.metal - 50000 * SCALE
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.crystal,
        before.crystal - 25000 * SCALE
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.deuterium,
        before.deuterium - 15000 * SCALE
    );
    let mut artifact = r.artifact.clone();
    artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::Bomber))
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
            .find(|v| v.body == b && v.item == BOMBER)
            .unwrap()
            .count,
        1
    );
    validate_asset_lineage(&s).unwrap();
    let blocked = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: BOMBER,
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
    request.ships[0].ship_type = ShipType::Bomber;
    let quote = quote_fleet(&s, p, &request, due.at, &current).unwrap();
    assert_eq!(quote.speeds, vec![(ShipType::Bomber, "8800".into())]);
    assert_eq!(quote.capacity, 500 * SCALE);
    assert_eq!(quote.maximum_payload, quote.capacity - quote.fuel);
    let expected = exact_flight_arithmetic(
        quote.distance,
        &[(8800, 1000, 1)],
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
            .find(|v| v.body == b && v.item == BOMBER)
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
    validate_asset_lineage(&s).unwrap();
}

#[test]
fn bomber_batch_credits_each_unit_once_and_keeps_paid_terms_after_price_change() {
    let (mut s, r, p, b, _) = setup();
    let q = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: BOMBER,
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
            item: BOMBER,
            quantity: 2,
            expected_terms_hash: q.terms_hash.unwrap(),
        }),
    );
    let started = apply(&mut s, result);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts,
        Resources::from_values([
            before.metal - 100000 * SCALE,
            before.crystal - 50000 * SCALE,
            before.deuterium - 30000 * SCALE,
        ])
    );
    assert!(
        !s.inventories
            .iter()
            .any(|i| i.body == b && i.item == BOMBER)
    );
    let accepted = s.manufacturing_batches[&operation].clone();
    assert_eq!(accepted.unit_duration_ms, 1_200_000);
    assert_eq!(accepted.final_due_at, 2_400_000);
    let mut artifact = r.artifact.clone();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .iter_mut()
        .find(|u| u.item == BOMBER)
        .unwrap()
        .cost
        .metal = 60000;
    artifact
        .world
        .as_mut()
        .unwrap()
        .combat
        .units
        .iter_mut()
        .find(|u| u.item == BOMBER)
        .unwrap()
        .cost[0] = 60000;
    let current = Ruleset::from_artifact(artifact, r.speed).unwrap();
    validate_rules_update(&r, &current).unwrap();
    s.profile_hash = current.hash.clone();
    let mut event = started.events[0].clone();
    for count in 1..=2 {
        assert_eq!(event.at, count * 1_200_000);
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
                .find(|i| i.body == b && i.item == BOMBER)
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
        validate_asset_lineage(&s).unwrap();
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
                .find(|i| i.body == b && i.item == BOMBER)
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
fn bomber_batch_requires_every_resource_before_payment() {
    for resource in 0..3 {
        let (mut s, r, p, b, _) = setup();
        let mut amounts = [100000 * SCALE, 50000 * SCALE, 30000 * SCALE];
        amounts[resource] -= 1;
        s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::from_values(amounts);
        let quote = inspect_progression(
            &s,
            Actor::Player(p),
            &QuoteRequest::Manufacture {
                body: b,
                item: BOMBER,
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
                item: BOMBER,
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

#[test]
fn hyperspace_switch_mixed_fuel_stale_quote_and_committed_return() {
    let (mut s, r, p, b, t) = setup();
    set_units(&mut s, &r, b, BOMBER, 3);
    fixture_research(&mut s, &r, p, ResearchId::HyperspaceDrive, 7);
    fixture_research(&mut s, &r, p, ResearchId::CombustionDrive, 6);
    let mut intent = intent(&s, p, b, t);
    intent.ships[0].ship_type = ShipType::Bomber;
    intent.cargo = Resources::default();
    let before = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    assert_eq!(before.speeds, vec![(ShipType::Bomber, "8800".into())]);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        8000,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: intent.clone(),
                expected_terms_hash: before.terms_hash.clone(),
            },
        }),
    );
    let launched = apply(&mut s, result);
    fixture_research(&mut s, &r, p, ResearchId::ComputerTechnology, 2);
    fixture_research(&mut s, &r, p, ResearchId::HyperspaceDrive, 8);
    let after = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    assert_eq!(after.speeds, vec![(ShipType::Bomber, "17000".into())]);
    assert!(after.duration_ms < before.duration_ms);
    assert_eq!(
        (after.duration_ms, after.fuel),
        exact_flight_arithmetic(after.distance, &[(17000, 1000, 1)], 100, 10).unwrap()
    );
    let mut new_launch = s.clone();
    let stock = new_launch.bodies[&b].checkpoint.amounts;
    let result = run(
        &mut new_launch,
        &r,
        p,
        b,
        1000,
        8010,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: intent.clone(),
                expected_terms_hash: after.terms_hash.clone(),
            },
        }),
    );
    apply(&mut new_launch, result);
    assert_eq!(
        new_launch.bodies[&b].checkpoint.amounts.deuterium,
        stock.deuterium - after.fuel
    );
    assert_eq!(
        new_launch.bodies[&b].checkpoint.amounts.metal,
        stock.metal - intent.cargo.metal
    );
    assert!(
        new_launch
            .world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .any(|f| f.terms == after)
    );
    // Recall uses elapsed time and keeps the original fuel payment after HD8.
    let mut recalling = s.clone();
    let original = recalling
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .next()
        .unwrap()
        .clone();
    let stock = recalling.bodies[&b].checkpoint.clone();
    let result = run(
        &mut recalling,
        &r,
        p,
        b,
        2000,
        8011,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: original.id },
        }),
    );
    let recalled = apply(&mut recalling, result);
    assert_eq!(recalled.events[0].at, 3000);
    assert_eq!(recalling.bodies[&b].checkpoint, stock);
    assert_eq!(
        recalling.world.as_ref().unwrap().records.fleets[&original.id].terms,
        original.terms
    );
    let stale = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        8001,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: intent.clone(),
                expected_terms_hash: before.terms_hash.clone(),
            },
        }),
    );
    assert_eq!(stale, TransitionResult::Rejected(GameError::QuoteChanged));
    // The mixed fleet uses its slowest ship for duration, each own speed/fuel in the sum.
    let mut mixed = intent.clone();
    mixed.ships.push(ManifestStack {
        owner: p,
        ship_type: ShipType::Recycler,
        count: 1,
    });
    let mixed = quote_fleet(&s, p, &mixed, 1000, &r).unwrap();
    assert!(mixed.speeds.contains(&(ShipType::Recycler, "3200".into())));
    assert_eq!(
        (mixed.duration_ms, mixed.fuel),
        exact_flight_arithmetic(mixed.distance, &[(17000, 1000, 1), (3200, 300, 1)], 100, 10)
            .unwrap()
    );
    fixture_research(&mut s, &r, p, ResearchId::HyperspaceDrive, 17);
    assert_eq!(
        ship_propulsion(&r.artifact.ships[&ShipType::Recycler], &s.research[&p]).unwrap(),
        (3200, 300)
    );
    // Serialization/restart and research completion cannot change an outbound obligation.
    s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    let arrival = &launched.events[0];
    let result = run(
        &mut s,
        &r,
        p,
        b,
        arrival.at,
        8002,
        Input::Event(arrival.event.clone()),
    );
    let arrived = apply(&mut s, result);
    assert_eq!(arrived.events[0].at, arrival.at + before.duration_ms);
    let returned = &arrived.events[0];
    let result = run(
        &mut s,
        &r,
        p,
        b,
        returned.at,
        8003,
        Input::Event(returned.event.clone()),
    );
    apply(&mut s, result);
    validate_asset_lineage(&s).unwrap();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .remove(&ResearchId::HyperspaceDrive);
    assert_eq!(
        quote_fleet(&s, p, &intent, returned.at, &r),
        Err(GameError::PolicyUnavailable)
    );
}

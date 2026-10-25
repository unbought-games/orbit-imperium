use super::*;
const LARGE_CARGO: ManufacturedItem = ManufacturedItem::Ship(ShipType::LargeCargo);

fn setup() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, _, p, b, t) = raid_fixture();
    let r = Ruleset::from_json(include_bytes!("../../../../rules/mvp-v1-slice-13.json")).unwrap();
    s.profile_hash = r.hash.clone();
    for research in s.research.values_mut() {
        for key in r.research_keys() {
            research.levels.entry(key).or_insert(0);
        }
    }
    fixture_building(&mut s, &r, b, Building::Shipyard, 4);
    fixture_research(&mut s, &r, p, ResearchId::CombustionDrive, 6);
    (s, r, p, b, t)
}

#[test]
fn every_large_cargo_prerequisite_blocks_both_quote_and_manufacture() {
    for requirement in [
        Requirement::BodyBuilding {
            building: Building::Shipyard,
            level: 4,
        },
        Requirement::PlayerResearch {
            research: ResearchId::CombustionDrive,
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
            item: LARGE_CARGO,
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
                item: LARGE_CARGO,
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
fn manufactured_large_cargo_flies_fights_and_returns_after_new_production_is_disabled() {
    let (mut s, r, p, b, t) = setup();
    let q = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: LARGE_CARGO,
            quantity: 1,
        },
        0,
        &r,
    )
    .unwrap();
    assert!(q.blockers.is_empty());
    assert_eq!(
        q.terms.as_ref().unwrap().paid(),
        Resources::from_values([6000 * SCALE, 6000 * SCALE, 0])
    );
    assert_eq!(q.terms.as_ref().unwrap().duration(), 345_000);
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
            item: LARGE_CARGO,
            quantity: 1,
            expected_terms_hash: q.terms_hash.unwrap(),
        }),
    );
    let started = apply(&mut s, result);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        before.metal - 6000 * SCALE
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.crystal,
        before.crystal - 6000 * SCALE
    );
    let mut artifact = r.artifact.clone();
    artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::LargeCargo))
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
            .find(|v| v.body == b && v.item == LARGE_CARGO)
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
            item: LARGE_CARGO,
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
    request.ships[0].ship_type = ShipType::LargeCargo;
    let quote = quote_fleet(&s, p, &request, due.at, &current).unwrap();
    assert_eq!(quote.speeds, vec![(ShipType::LargeCargo, "12000".into())]);
    assert_eq!(quote.capacity, 25000 * SCALE);
    assert_eq!(quote.maximum_payload, quote.capacity - quote.fuel);
    let expected = exact_flight_arithmetic(
        quote.distance,
        &[(12000, 50, 1)],
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
            .find(|v| v.body == b && v.item == LARGE_CARGO)
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
fn large_cargo_transport_delivers_once_and_returns_with_committed_terms() {
    let (mut s, r, p, b, t) = setup();
    set_units(&mut s, &r, b, LARGE_CARGO, 1);
    let mut request = intent(&s, p, b, t);
    request.ships[0].ship_type = ShipType::LargeCargo;
    request.cargo = Resources::from_values([6000 * SCALE, 2000 * SCALE, 1000 * SCALE]);
    let quote = quote_fleet(&s, p, &request, 0, &r).unwrap();
    assert_eq!(quote.capacity, 25000 * SCALE);
    assert_eq!(quote.maximum_payload, quote.capacity - quote.fuel);
    let before = s.bodies[&b].checkpoint.amounts;
    let event = launch_raid(&mut s, &r, p, b, request.clone(), 0, 9960);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts,
        Resources::from_values([
            before.metal - request.cargo.metal,
            before.crystal - request.cargo.crystal,
            before.deuterium - request.cargo.deuterium - quote.fuel,
        ])
    );
    validate_asset_lineage(&s).unwrap();
    // A subsequent propulsion change must not rewrite this accepted flight.
    let mut artifact = r.artifact.clone();
    let ship = artifact.ships.get_mut(&ShipType::LargeCargo).unwrap();
    ship.base_speed = 15000;
    ship.fuel = 100;
    let current = Ruleset::from_artifact(artifact, r.speed).unwrap();
    validate_rules_update(&r, &current).unwrap();
    s.profile_hash = current.hash.clone();
    let before_delivery = settle_production(&s, &s.bodies[&t], event.at, &current).unwrap();
    let result = run(
        &mut s,
        &current,
        p,
        b,
        event.at,
        9961,
        Input::Event(event.event.clone()),
    );
    let arrived = apply(&mut s, result);
    assert_eq!(
        s.bodies[&t].checkpoint.amounts,
        Resources::from_values([
            before_delivery.amounts.metal + request.cargo.metal,
            before_delivery.amounts.crystal + request.cargo.crystal,
            before_delivery.amounts.deuterium + request.cargo.deuterium,
        ])
    );
    let delivered = s.bodies[&t].checkpoint.clone();
    let reports = &s.world.as_ref().unwrap().records.reports;
    let report = reports
        .values()
        .find(|report| report.kind == "Delivered")
        .unwrap();
    assert_eq!(report.payloads[&p]["cargo"]["metal"], "6000000000");
    assert_eq!(
        report.payloads[&s.bodies[&t].owner]["cargo"]["deuterium"],
        "1000000000"
    );
    let result = run(
        &mut s,
        &current,
        p,
        b,
        event.at,
        9962,
        Input::Event(event.event),
    );
    let replay = apply(&mut s, result);
    assert!(replay.world.is_none());
    assert_eq!(s.bodies[&t].checkpoint, delivered);
    let returning = &arrived.events[0];
    assert_eq!(returning.at - event.at, quote.duration_ms);
    let before_return = settle_production(&s, &s.bodies[&b], returning.at, &current).unwrap();
    let result = run(
        &mut s,
        &current,
        p,
        b,
        returning.at,
        9963,
        Input::Event(returning.event.clone()),
    );
    apply(&mut s, result);
    assert_eq!(s.bodies[&b].checkpoint.amounts, before_return.amounts);
    assert_eq!(
        s.inventories
            .iter()
            .find(|i| i.body == b && i.item == LARGE_CARGO)
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
fn mixed_large_cargo_fleet_reserves_fuel_and_uses_the_slowest_ship() {
    let (mut s, r, p, b, t) = setup();
    set_units(&mut s, &r, b, LARGE_CARGO, 2);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(100000 * SCALE);
    let mut request = intent(&s, p, b, t);
    request.ships.push(ManifestStack {
        owner: p,
        ship_type: ShipType::LargeCargo,
        count: 2,
    });
    request.cargo = Resources::default();
    let quote = quote_fleet(&s, p, &request, 0, &r).unwrap();
    assert_eq!(quote.capacity, 55000 * SCALE);
    assert_eq!(quote.maximum_payload, quote.capacity - quote.fuel);
    assert_eq!(
        quote.speeds,
        vec![
            (ShipType::SmallCargo, "8000".into()),
            (ShipType::LargeCargo, "12000".into())
        ]
    );
    assert_eq!(
        (quote.duration_ms, quote.fuel),
        exact_flight_arithmetic(
            quote.distance,
            &[(8000, 10, 1), (12000, 50, 2)],
            100,
            i64::from(r.speed)
        )
        .unwrap()
    );
    request.cargo.metal = quote.maximum_payload;
    assert!(quote_fleet(&s, p, &request, 0, &r).is_ok());
    request.cargo.metal += SCALE;
    assert_eq!(
        quote_fleet(&s, p, &request, 0, &r),
        Err(GameError::CargoCapacity)
    );
    let result = run(
        &mut s,
        &r,
        p,
        b,
        0,
        9970,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: request,
                expected_terms_hash: quote.terms_hash,
            },
        }),
    );
    assert_eq!(result, TransitionResult::Rejected(GameError::CargoCapacity));
    assert!(s.world.as_ref().unwrap().records.fleets.is_empty());
}

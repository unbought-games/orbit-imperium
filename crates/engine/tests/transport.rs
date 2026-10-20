use orbit_engine::*;
use uuid::Uuid;
mod common;
use common::*;
fn fleet_fixture() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, r, p, b) = fixture();
    let target = BodyId(Uuid::from_u128(22));
    let recipient = PlayerId(Uuid::from_u128(21));
    let mut second = s.bodies[&b].clone();
    second.id = target;
    second.owner = recipient;
    second.coordinates.position = 9;
    s.bodies.insert(target, second);
    s.players.insert(
        recipient,
        Player {
            id: recipient,
            universe: s.universe,
        },
    );
    s.coverage.bodies.insert(target);
    s.coverage.construction_bodies.insert(target);
    s.coverage.inventory_owners.insert((target, recipient));
    s.coverage.research_players.insert(recipient);
    let mut research = s.research.values().next().unwrap().clone();
    research.owner = recipient;
    s.research.insert(recipient, research);
    s.coverage.fleet_owners.insert(recipient);
    s.inventories.push(InventoryStack {
        body: b,
        owner: p,
        item: ManufacturedItem::Ship(ShipType::SmallCargo),
        count: 2,
        revision: 0,
    });
    (s, r, p, b, target)
}
fn launch(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    target: BodyId,
    at: i64,
) -> ChangeSet {
    let request = QuoteRequest::Transport {
        origin: b,
        target,
        ships: vec![ShipStack {
            owner: p,
            ship_type: ShipType::SmallCargo,
            count: 2,
        }],
        cargo: Resources {
            metal: 100 * SCALE,
            crystal: 50 * SCALE,
            deuterium: 10 * SCALE,
        },
        speed_percent: 100,
    };
    let q = quote(s, Actor::Player(p), &request, at, r).unwrap();
    let QuoteRequest::Transport {
        origin,
        target,
        ships,
        cargo,
        speed_percent,
    } = request
    else {
        panic!()
    };
    let i = input(
        s,
        r,
        Actor::Player(p),
        at,
        100,
        Input::Command(Command::LaunchTransport {
            origin,
            target,
            ships,
            cargo,
            speed_percent,
            expected_terms_hash: q.terms_hash,
        }),
    );
    let result = transition(s, &i, r);
    applied(s, result)
}
#[test]
fn delivery_then_return_conserves_payload_ships_and_fuel() {
    let (mut s, r, p, b, t) = fleet_fixture();
    let first = launch(&mut s, &r, p, b, t, 0);
    assert_eq!(s.inventories[0].count, 0);
    assert_eq!(s.bodies[&b].checkpoint.amounts.deuterium, 987 * SCALE);
    let arrival = input(
        &s,
        &r,
        Actor::Scheduler,
        4741000,
        101,
        Input::Event(first.events[0].event.clone()),
    );
    let result = transition(&s, &arrival, &r);
    let arrived = applied(&mut s, result);
    assert_eq!(s.bodies[&t].checkpoint.amounts.deuterium, 1010 * SCALE);
    let fleet = s.fleets.values().next().unwrap();
    assert_eq!(fleet.status, FleetStatus::Returning);
    assert_eq!(fleet.payload, Resources::default());
    assert_eq!(arrived.reports.len(), 1);
    let returning = input(
        &s,
        &r,
        Actor::Scheduler,
        9482000,
        102,
        Input::Event(arrived.events[0].event.clone()),
    );
    let result = transition(&s, &returning, &r);
    applied(&mut s, result);
    assert_eq!(s.inventories[0].count, 2);
    assert_eq!(
        s.fleets.values().next().unwrap().status,
        FleetStatus::Completed
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts.deuterium, 987 * SCALE);
}
#[test]
fn recall_returns_payload_and_invalidates_arrival() {
    let (mut s, r, p, b, t) = fleet_fixture();
    let first = launch(&mut s, &r, p, b, t, 1000000);
    let fleet = *s.fleets.keys().next().unwrap();
    let recall = input(
        &s,
        &r,
        Actor::Player(p),
        2000000,
        103,
        Input::Command(Command::RecallFleet { fleet }),
    );
    let result = transition(&s, &recall, &r);
    let recalled = applied(&mut s, result);
    assert_eq!(recalled.events[0].at, 3000000);
    let returning = input(
        &s,
        &r,
        Actor::Scheduler,
        3000000,
        104,
        Input::Event(recalled.events[0].event.clone()),
    );
    let result = transition(&s, &returning, &r);
    applied(&mut s, result);
    assert_eq!(s.inventories[0].count, 2);
    assert_eq!(s.bodies[&b].checkpoint.amounts.deuterium, 997 * SCALE);
    assert_eq!(s.bodies[&t].checkpoint.amounts.deuterium, 1000 * SCALE);
    let stale = input(
        &s,
        &r,
        Actor::Scheduler,
        5741000,
        101,
        Input::Event(first.events[0].event.clone()),
    );
    let before = s.clone();
    let result = transition(&s, &stale, &r);
    applied(&mut s, result);
    assert_eq!(s, before);
}
#[test]
fn same_time_recall_completes_inline_and_absent_target_returns_intact() {
    let (mut s, r, p, b, t) = fleet_fixture();
    let first = launch(&mut s, &r, p, b, t, 0);
    let fleet = *s.fleets.keys().next().unwrap();
    let recall = input(
        &s,
        &r,
        Actor::Player(p),
        0,
        105,
        Input::Command(Command::RecallFleet { fleet }),
    );
    let result = transition(&s, &recall, &r);
    let result = applied(&mut s, result);
    assert!(result.events.is_empty());
    assert_eq!(s.inventories[0].count, 2);
    let (mut s, r, p, b, t) = fleet_fixture();
    launch(&mut s, &r, p, b, t, 0);
    s.bodies.remove(&t);
    let arrive = input(
        &s,
        &r,
        Actor::Scheduler,
        4741000,
        101,
        Input::Event(first.events[0].event.clone()),
    );
    let result = transition(&s, &arrive, &r);
    let failed = applied(&mut s, result);
    assert_eq!(failed.reports[0].kind, ReportKind::DeliveryFailed);
    assert_eq!(s.fleets.values().next().unwrap().payload.metal, 100 * SCALE);
}
#[test]
fn empty_payload_is_allowed_but_invalid_inventory_and_capacity_are_rejected() {
    let (s, r, p, b, t) = fleet_fixture();
    let request = QuoteRequest::Transport {
        origin: b,
        target: t,
        ships: vec![ShipStack {
            owner: p,
            ship_type: ShipType::SmallCargo,
            count: 2,
        }],
        cargo: Resources::default(),
        speed_percent: 100,
    };
    let q = quote(&s, Actor::Player(p), &request, 0, &r).unwrap();
    let QuoteRequest::Transport {
        origin,
        target,
        ships,
        cargo,
        speed_percent,
    } = request
    else {
        panic!()
    };
    let i = input(
        &s,
        &r,
        Actor::Player(p),
        0,
        999,
        Input::Command(Command::LaunchTransport {
            origin,
            target,
            ships: ships.clone(),
            cargo,
            speed_percent,
            expected_terms_hash: q.terms_hash,
        }),
    );
    let TransitionResult::Applied(changes) = transition(&s, &i, &r) else {
        panic!("empty cargo rejected")
    };
    assert_eq!(changes.bodies[0].checkpoint.amounts.deuterium, 997 * SCALE);
    assert_eq!(changes.fleets[0].payload, Resources::default());
    let mut too_many = ships.clone();
    too_many[0].count = 3;
    let request = QuoteRequest::Transport {
        origin: b,
        target: t,
        ships: too_many.clone(),
        cargo,
        speed_percent: 100,
    };
    let q = quote(&s, Actor::Player(p), &request, 0, &r).unwrap();
    let i = input(
        &s,
        &r,
        Actor::Player(p),
        0,
        1000,
        Input::Command(Command::LaunchTransport {
            origin: b,
            target: t,
            ships: too_many,
            cargo,
            speed_percent: 100,
            expected_terms_hash: q.terms_hash,
        }),
    );
    assert!(matches!(
        transition(&s, &i, &r),
        TransitionResult::Rejected(GameError::InsufficientShips)
    ));
    let excessive = QuoteRequest::Transport {
        origin: b,
        target: t,
        ships: ships.clone(),
        cargo: Resources {
            metal: 9998 * SCALE,
            ..Resources::default()
        },
        speed_percent: 100,
    };
    assert_eq!(
        quote(&s, Actor::Player(p), &excessive, 0, &r).unwrap_err(),
        GameError::CargoCapacity
    );
    let duplicate = QuoteRequest::Transport {
        origin: b,
        target: t,
        ships: vec![ships[0].clone(), ships[0].clone()],
        cargo,
        speed_percent: 100,
    };
    assert_eq!(
        quote(&s, Actor::Player(p), &duplicate, 0, &r).unwrap_err(),
        GameError::InvalidInput
    );
}

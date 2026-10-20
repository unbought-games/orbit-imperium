use orbit_engine::*;
use uuid::Uuid;
mod common;
use common::*;
#[test]
fn upgrade_completion_and_piecewise_accrual() {
    let (mut s, r, p, b) = fixture();
    let q = quote(
        &s,
        Actor::Player(p),
        &QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
        0,
        &r,
    )
    .unwrap();
    let start = input(
        &s,
        &r,
        Actor::Player(p),
        0,
        10,
        Input::Command(Command::StartUpgrade {
            body: b,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash,
        }),
    );
    let result = transition(&s, &start, &r);
    let change = applied(&mut s, result);
    assert_eq!(s.bodies[&b].levels[&Building::MetalMine], 1);
    assert_eq!(s.bodies[&b].checkpoint.amounts.metal, 910 * SCALE);
    assert_eq!(change.events[0].at, 161_000);
    let due = input(
        &s,
        &r,
        Actor::Scheduler,
        161_000,
        11,
        Input::Event(change.events[0].event.clone()),
    );
    let result = transition(&s, &due, &r);
    applied(&mut s, result);
    assert_eq!(s.bodies[&b].levels[&Building::MetalMine], 2);
    let end = settle_economy(&s.bodies[&b], 3_600_000, &r).unwrap();
    assert_eq!(end.amounts.metal, 1_010_829_000);
    assert_eq!(end.carry.metal, 0);
}
#[test]
fn cancellation_refunds_once_and_stale_event_does_nothing() {
    let (mut s, r, p, b) = fixture();
    let q = quote(
        &s,
        Actor::Player(p),
        &QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
        0,
        &r,
    )
    .unwrap();
    let start = input(
        &s,
        &r,
        Actor::Player(p),
        0,
        10,
        Input::Command(Command::StartUpgrade {
            body: b,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash,
        }),
    );
    let result = transition(&s, &start, &r);
    let changes = applied(&mut s, result);
    let operation = *s.constructions.keys().next().unwrap();
    let cancel = input(
        &s,
        &r,
        Actor::Player(p),
        1000,
        12,
        Input::Command(Command::CancelConstruction { operation }),
    );
    let result = transition(&s, &cancel, &r);
    applied(&mut s, result);
    assert_eq!(s.bodies[&b].checkpoint.amounts.metal, 1_000_017_500);
    assert!(matches!(
        transition(&s, &cancel, &r),
        TransitionResult::Rejected(GameError::OperationNotActive)
    ));
    let before = s.clone();
    let due = input(
        &s,
        &r,
        Actor::Scheduler,
        161_000,
        11,
        Input::Event(changes.events[0].event.clone()),
    );
    let result = transition(&s, &due, &r);
    applied(&mut s, result);
    assert_eq!(s, before);
}
#[test]
fn incomplete_facts_and_foreign_actor_fail_without_mutation() {
    let (mut s, r, p, b) = fixture();
    let q = quote(
        &s,
        Actor::Player(p),
        &QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
        0,
        &r,
    )
    .unwrap();
    let cmd = Command::StartUpgrade {
        body: b,
        building: Building::MetalMine,
        expected_terms_hash: q.terms_hash,
    };
    let foreign = input(
        &s,
        &r,
        Actor::Player(PlayerId(Uuid::from_u128(99))),
        0,
        10,
        Input::Command(cmd.clone()),
    );
    assert!(matches!(
        transition(&s, &foreign, &r),
        TransitionResult::Rejected(GameError::NotOwned)
    ));
    s.coverage.construction_bodies.clear();
    let i = input(&s, &r, Actor::Player(p), 0, 10, Input::Command(cmd));
    assert!(matches!(
        transition(&s, &i, &r),
        TransitionResult::InvalidState(_)
    ));
}
#[test]
fn cancellation_requires_a_complete_operation_lookup() {
    let (s, r, p, _) = fixture();
    let operation = OperationId(Uuid::from_u128(777));
    let i = input(
        &s,
        &r,
        Actor::Player(p),
        0,
        778,
        Input::Command(Command::CancelConstruction { operation }),
    );
    assert!(matches!(
        transition(&s, &i, &r),
        TransitionResult::InvalidState(_)
    ));
}
#[test]
fn old_quote_after_level_change_rejects_without_spending() {
    let (mut s, r, p, b) = fixture();
    let q = quote(
        &s,
        Actor::Player(p),
        &QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
        0,
        &r,
    )
    .unwrap();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::MetalMine, 2);
    let i = input(
        &s,
        &r,
        Actor::Player(p),
        0,
        779,
        Input::Command(Command::StartUpgrade {
            body: b,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash,
        }),
    );
    let before = s.clone();
    assert!(matches!(
        transition(&s, &i, &r),
        TransitionResult::Rejected(GameError::QuoteChanged)
    ));
    assert_eq!(s, before);
}

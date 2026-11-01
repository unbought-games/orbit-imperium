use super::*;

#[test]
fn hard_deadline_destroys_owned_flights_and_keeps_foreign_inbound() {
    let (mut s, r, p, b, t) = fixture();
    let owner = s.bodies[&t].owner;
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .deletion_requested_at = Some(0);
    let launch_at = DELETION_GRACE_MS - 1;
    let mut outgoing = intent(&s, p, b, t);
    outgoing.speed_percent = 10;
    let q = quote_fleet(&s, p, &outgoing, launch_at, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        launch_at,
        80001,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: outgoing,
                expected_terms_hash: q.terms_hash.clone(),
            },
        }),
    );
    apply(&mut s, result);
    let mut inbound = intent(&s, owner, t, b);
    inbound.speed_percent = 10;
    let q = quote_fleet(&s, owner, &inbound, launch_at, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        owner,
        t,
        launch_at,
        80002,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: inbound,
                expected_terms_hash: q.terms_hash.clone(),
            },
        }),
    );
    apply(&mut s, result);
    let foreign = s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .find(|f| f.owner == owner)
        .unwrap()
        .clone();
    let due = DELETION_GRACE_MS;
    assert!(foreign.due_at > due);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        due,
        80003,
        Input::Event(ScheduledEvent::EmpireDeletionDue { player: p }),
    );
    let change = apply(&mut s, result);
    let world = &s.world.as_ref().unwrap().records;
    assert!(!s.bodies.contains_key(&b));
    assert!(s.bodies.contains_key(&t));
    assert_eq!(world.policies[&p].lifecycle, PlayerLifecycle::Removed);
    assert!(
        world
            .fleets
            .values()
            .filter(|f| f.owner == p)
            .all(|f| f.leg == MissionLeg::Destroyed
                && f.ships.is_empty()
                && f.cargo == Resources::default())
    );
    assert_eq!(world.fleets[&foreign.id], foreign);
    assert!(!world.lots.iter().any(|lot| lot.owner == p));
    assert!(
        change
            .cancelled_events
            .iter()
            .any(|e| matches!(e, ScheduledEvent::FleetLegDue { .. }))
    );
    validate_asset_lineage(&s).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        due,
        80004,
        Input::Event(ScheduledEvent::EmpireDeletionDue { player: p }),
    );
    let replay = apply(&mut s, result);
    assert!(replay.cancelled_events.is_empty());
    assert!(replay.world.unwrap().audits.is_empty());
}

#[test]
fn presence_and_vacation_defer_automatic_cleanup_but_not_explicit_deletion() {
    for vacation in [false, true] {
        let (mut s, r, p, b, _) = fixture();
        let policy = s
            .world
            .as_mut()
            .unwrap()
            .records
            .policies
            .get_mut(&p)
            .unwrap();
        policy.last_presence_at = 20 * DAY_MS;
        policy.vacation = VacationState::Legacy(vacation);
        let result = run(
            &mut s,
            &r,
            p,
            b,
            INACTIVITY_DELETION_MS,
            80100,
            Input::Event(ScheduledEvent::EmpireDeletionDue { player: p }),
        );
        let c = apply(&mut s, result);
        assert!(s.bodies.contains_key(&b));
        assert_eq!(c.events.len(), 1);
        assert!(c.events[0].at > INACTIVITY_DELETION_MS);
        let policy = s
            .world
            .as_mut()
            .unwrap()
            .records
            .policies
            .get_mut(&p)
            .unwrap();
        policy.deletion_requested_at = Some(30 * DAY_MS);
        let result = run(
            &mut s,
            &r,
            p,
            b,
            37 * DAY_MS,
            80101,
            Input::Event(ScheduledEvent::EmpireDeletionDue { player: p }),
        );
        apply(&mut s, result);
        assert!(!s.bodies.contains_key(&b));
    }
}

#[test]
fn pending_status_is_derived_at_exact_boundaries_and_old_json_stays_stable() {
    let (s, _, p, _, _) = fixture();
    let mut policy = s.world.unwrap().records.policies[&p].clone();
    assert!(
        policy
            .deletion_status(INACTIVITY_WARNING_MS - 1)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        policy
            .deletion_status(INACTIVITY_WARNING_MS)
            .unwrap()
            .unwrap()
            .due_at,
        INACTIVITY_DELETION_MS
    );
    let value = serde_json::to_value(&policy).unwrap();
    assert!(value.get("deletion_requested_at").is_none());
    assert_eq!(
        serde_json::from_value::<PlayerPolicy>(value).unwrap(),
        policy
    );
    policy.vacation = VacationState::Legacy(true);
    assert!(!policy.deletion_pending(100 * DAY_MS));
    policy.deletion_requested_at = Some(40 * DAY_MS);
    assert_eq!(policy.deletion_deadline().unwrap(), Some(47 * DAY_MS));
}

#[test]
fn foreign_hold_returns_safely_and_its_original_departure_is_stale() {
    let (mut s, r, visitor, home, target) = super::holding::ready();
    let host = s.bodies[&target].owner;
    let cutoff = DELETION_GRACE_MS;
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&host)
        .unwrap()
        .deletion_requested_at = Some(0);
    let mut intent = super::holding::hold(&s, visitor, home, target, 32);
    intent.cargo.metal = 100 * SCALE;
    let event = launch_raid(
        &mut s,
        &r,
        visitor,
        home,
        intent,
        cutoff - 4 * HOLD_HOUR_MS,
        80200,
    );
    assert!(event.at < cutoff);
    let result = run(
        &mut s,
        &r,
        visitor,
        home,
        event.at,
        80201,
        Input::Event(event.event),
    );
    let arrival = apply(&mut s, result);
    let departure = arrival.events[0].clone();
    assert!(departure.at > cutoff);
    let held = s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .find(|f| f.owner == visitor)
        .unwrap()
        .clone();
    let result = run(
        &mut s,
        &r,
        host,
        target,
        cutoff,
        80202,
        Input::Event(ScheduledEvent::EmpireDeletionDue { player: host }),
    );
    let deletion = apply(&mut s, result);
    let returning = &s.world.as_ref().unwrap().records.fleets[&held.id];
    assert_eq!(returning.leg, MissionLeg::Returning);
    assert_eq!(returning.ships, held.ships);
    assert_eq!(returning.cargo, held.cargo);
    assert_eq!(returning.due_at, cutoff + held.terms.duration_ms);
    let ret = deletion
        .events
        .iter()
        .find(|e| matches!(e.event, ScheduledEvent::FleetLegDue { .. }))
        .unwrap()
        .clone();
    let result = run(
        &mut s,
        &r,
        visitor,
        home,
        ret.at,
        80203,
        Input::Event(ret.event),
    );
    apply(&mut s, result);
    let before = s.clone();
    let result = run(
        &mut s,
        &r,
        visitor,
        home,
        departure.at,
        80204,
        Input::Event(departure.event),
    );
    apply(&mut s, result);
    assert_eq!(s.bodies, before.bodies);
    assert_eq!(s.inventories, before.inventories);
    validate_asset_lineage(&s).unwrap();
}

#[test]
fn incomplete_removal_facts_never_destroy_an_empire() {
    let (mut s, r, p, b, _) = fixture();
    s.coverage.manufacturing_bodies.remove(&b);
    let before = s.clone();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        INACTIVITY_DELETION_MS,
        80300,
        Input::Event(ScheduledEvent::EmpireDeletionDue { player: p }),
    );
    assert!(matches!(result, TransitionResult::InvalidState(_)));
    assert_eq!(s.bodies, before.bodies);
    assert_eq!(s.inventories, before.inventories);
}

#[test]
fn automatic_grace_boundary_notifies_without_removing_assets() {
    let (mut s, r, p, b, _) = fixture();
    let policy = &s.world.as_ref().unwrap().records.policies[&p];
    assert_eq!(
        policy.next_deletion_check(0).unwrap(),
        Some(INACTIVITY_WARNING_MS)
    );
    let result = run(
        &mut s,
        &r,
        p,
        b,
        INACTIVITY_WARNING_MS,
        80400,
        Input::Event(ScheduledEvent::EmpireDeletionDue { player: p }),
    );
    let c = apply(&mut s, result);
    assert!(s.bodies.contains_key(&b));
    assert!(c.affected_viewers.contains(&p));
    assert_eq!(c.events[0].at, INACTIVITY_DELETION_MS);
    assert!(
        s.world.as_ref().unwrap().records.policies[&p]
            .deletion_requested_at
            .is_none()
    );
}

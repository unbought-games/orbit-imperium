use super::*;
fn ready() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, _, p, b, t) = fixture();
    let r = upgrade_standard_rules(&Ruleset::mvp_raids().unwrap()).unwrap();
    s.profile_hash = r.hash.clone();
    for body in s.bodies.values_mut() {
        for key in r.building_keys() {
            body.levels.entry(key).or_insert(0);
        }
    }
    for tech in s.research.values_mut() {
        for key in r.research_keys() {
            tech.levels.entry(key).or_insert(0);
        }
    }
    missiles::edit(
        &mut s,
        &r,
        b,
        9999,
        serde_json::json!({"op":"set","research":{"ComputerTechnology":4},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}}),
    );
    let w = s.world.as_mut().unwrap();
    w.holding_relationships = Some(HoldingRelationships {
        covered: w.covered_players.clone(),
        ..Default::default()
    });
    (s, r, p, b, t)
}
fn command(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    at: i64,
    n: u128,
    action: WorldAction,
) -> ChangeSet {
    let result = run(s, r, p, b, at, n, Input::Command(Command::World { action }));
    apply(s, result)
}
fn launch(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    t: BodyId,
    launch_time: (i64, u128),
    group: Option<OperationId>,
) -> FleetId {
    let (at, n) = launch_time;
    let mut intent = intent(s, p, b, t);
    intent.mission = Mission::Attack;
    intent.attack_group = group;
    intent.ships[0].count = 1;
    intent.cargo = Resources::default();
    let q = quote_fleet(s, p, &intent, at, r).unwrap();
    command(
        s,
        r,
        p,
        b,
        at,
        n,
        WorldAction::LaunchFleet {
            intent,
            expected_terms_hash: q.terms_hash.clone(),
        },
    );
    FleetId(derived_id(InputId(Uuid::from_u128(n)), "mission:0"))
}
#[test]
fn exact_join_boundary_compounds_without_floating_point() {
    assert_eq!(joined_arrival(1000, 2000, 1300).unwrap(), 2300);
    assert_eq!(
        joined_arrival(1000, 2000, 1301),
        Err(GameError::AttackGroupTooLate)
    );
    assert_eq!(joined_arrival(1100, 2300, 1560).unwrap(), 2660);
    assert_eq!(
        joined_arrival(1100, 2300, 1561),
        Err(GameError::AttackGroupTooLate)
    );
    assert_eq!(
        joined_arrival(2000, 2000, 1),
        Err(GameError::AttackGroupClosed)
    );
}
#[test]
fn joined_fleets_fight_once_and_return_independently() {
    let (mut s, r, p, b, t) = ready();
    let first = launch(&mut s, &r, p, b, t, (1000, 700), None);
    let created = command(
        &mut s,
        &r,
        p,
        b,
        1001,
        701,
        WorldAction::CreateAttackGroup { fleet: first },
    );
    let group = *s
        .world
        .as_ref()
        .unwrap()
        .records
        .attack_groups
        .keys()
        .next()
        .unwrap();
    let original = s.world.as_ref().unwrap().records.attack_groups[&group].arrival_at;
    let second = launch(&mut s, &r, p, b, t, (1002, 702), Some(group));
    let w = &s.world.as_ref().unwrap().records;
    let due = w.attack_groups[&group].arrival_at;
    let generation = w.attack_groups[&group].generation;
    assert!(due > original);
    let durations = [
        w.fleets[&first].terms.duration_ms,
        w.fleets[&second].terms.duration_ms,
    ];
    assert_eq!(effective_fleet_due(w, &w.fleets[&first]), due);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        due,
        703,
        Input::Event(ScheduledEvent::AttackGroupDue { group, generation }),
    );
    let change = apply(&mut s, result);
    let w = &s.world.as_ref().unwrap().records;
    let reports: Vec<_> = w.reports.values().filter(|r| r.kind == "Combat").collect();
    assert_eq!(reports.len(), 1);
    assert_eq!(
        reports[0].payloads[&p]["participants"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|v| v["side"] == "Attacker")
            .count(),
        2
    );
    for (fleet, duration) in [first, second].into_iter().zip(durations) {
        if w.fleets[&fleet].leg == MissionLeg::Returning {
            assert_eq!(w.fleets[&fleet].due_at, due + duration);
        }
    }
    assert_eq!(w.attack_groups[&group].resolved_at, Some(due));
    assert!(
        change
            .events
            .iter()
            .all(|e| !matches!(e.event, ScheduledEvent::AttackGroupDue { .. }))
    );
    let stale = run(
        &mut s,
        &r,
        p,
        b,
        original,
        704,
        Input::Event(created.events[0].event.clone()),
    );
    assert!(matches!(stale, TransitionResult::Applied(_)));
}
#[test]
fn recall_keeps_delay_closes_joining_and_uses_uncapped_elapsed_time() {
    let (mut s, r, p, b, t) = ready();
    let first = launch(&mut s, &r, p, b, t, (1000, 800), None);
    command(
        &mut s,
        &r,
        p,
        b,
        1001,
        801,
        WorldAction::CreateAttackGroup { fleet: first },
    );
    let group = *s
        .world
        .as_ref()
        .unwrap()
        .records
        .attack_groups
        .keys()
        .next()
        .unwrap();
    let second = launch(&mut s, &r, p, b, t, (1002, 802), Some(group));
    let arrival = s.world.as_ref().unwrap().records.attack_groups[&group].arrival_at;
    let recall = arrival - 1;
    command(
        &mut s,
        &r,
        p,
        b,
        recall,
        803,
        WorldAction::RecallMission { fleet: first },
    );
    let w = &s.world.as_ref().unwrap().records;
    assert_eq!(w.fleets[&first].due_at, recall + (recall - 1000));
    assert_eq!(w.attack_groups[&group].arrival_at, arrival);
    assert!(!group_open(w, &w.attack_groups[&group], recall));
    assert_eq!(group_members(w, &w.attack_groups[&group]).count(), 1);
    command(
        &mut s,
        &r,
        p,
        b,
        recall,
        804,
        WorldAction::RecallMission { fleet: second },
    );
    assert_eq!(
        s.world.as_ref().unwrap().records.attack_groups[&group].resolved_at,
        Some(recall)
    );
}

#[test]
fn bounds_count_active_fleets_and_distinct_owners_and_hide_unauthorized_groups() {
    let (mut s, r, p, b, t) = ready();
    let first = launch(&mut s, &r, p, b, t, (1000, 900), None);
    command(
        &mut s,
        &r,
        p,
        b,
        1001,
        901,
        WorldAction::CreateAttackGroup { fleet: first },
    );
    let mut w = s.world.unwrap().records;
    let group = *w.attack_groups.keys().next().unwrap();
    let template = w.fleets[&first].clone();
    let stranger = PlayerId(Uuid::from_u128(999999));
    assert_eq!(
        group_join_revision(&w, group, stranger, &template.intent.destination, 1002, 1),
        Err(GameError::NotFound)
    );
    for n in 1..16 {
        let mut f = template.clone();
        f.id = FleetId(Uuid::from_u128(2000 + n));
        f.owner = if n < 5 {
            PlayerId(Uuid::from_u128(3000 + n))
        } else {
            p
        };
        w.attack_groups
            .get_mut(&group)
            .unwrap()
            .members
            .insert(f.id);
        w.fleets.insert(f.id, f);
    }
    assert_eq!(
        group_join_revision(&w, group, p, &template.intent.destination, 1002, 1),
        Err(GameError::AttackGroupFull)
    );
    w.fleets
        .get_mut(&FleetId(Uuid::from_u128(2015)))
        .unwrap()
        .leg = MissionLeg::Returning;
    assert!(group_join_revision(&w, group, p, &template.intent.destination, 1002, 1).is_ok());
    w.attack_groups
        .get_mut(&group)
        .unwrap()
        .invited
        .insert(stranger);
    assert_eq!(
        group_join_revision(&w, group, stranger, &template.intent.destination, 1002, 1),
        Err(GameError::AttackGroupFull)
    );
    w.fleets
        .get_mut(&FleetId(Uuid::from_u128(2001)))
        .unwrap()
        .leg = MissionLeg::Returning;
    assert!(
        group_join_revision(&w, group, stranger, &template.intent.destination, 1002, 1).is_ok()
    );
    w.fleets.remove(&FleetId(Uuid::from_u128(2002)));
    assert_eq!(
        group_join_revision(&w, group, p, &template.intent.destination, 1002, 1),
        Err(GameError::PolicyUnavailable)
    );
}
#[test]
fn invitations_are_initiator_only_respect_blocks_and_invalidate_join_quotes() {
    let (mut s, r, p, b, t) = ready();
    let first = launch(&mut s, &r, p, b, t, (1000, 950), None);
    command(
        &mut s,
        &r,
        p,
        b,
        1001,
        951,
        WorldAction::CreateAttackGroup { fleet: first },
    );
    let host = s.bodies[&t].owner;
    let group = *s
        .world
        .as_ref()
        .unwrap()
        .records
        .attack_groups
        .keys()
        .next()
        .unwrap();
    s.world
        .as_mut()
        .unwrap()
        .holding_relationships
        .as_mut()
        .unwrap()
        .blocks
        .insert((host, p));
    let rejected = run(
        &mut s,
        &r,
        p,
        b,
        1002,
        952,
        Input::Command(Command::World {
            action: WorldAction::InviteAttackGroup {
                group,
                player: host,
            },
        }),
    );
    assert!(matches!(
        rejected,
        TransitionResult::Rejected(GameError::NotFound)
    ));
    s.world
        .as_mut()
        .unwrap()
        .holding_relationships
        .as_mut()
        .unwrap()
        .blocks
        .clear();
    let before = s.world.as_ref().unwrap().records.attack_groups[&group].revision;
    command(
        &mut s,
        &r,
        p,
        b,
        1003,
        953,
        WorldAction::InviteAttackGroup {
            group,
            player: host,
        },
    );
    assert!(s.world.as_ref().unwrap().records.attack_groups[&group].revision > before);
    let rejected = run(
        &mut s,
        &r,
        host,
        t,
        1004,
        954,
        Input::Command(Command::World {
            action: WorldAction::RevokeAttackGroupInvitation { group, player: p },
        }),
    );
    assert!(matches!(
        rejected,
        TransitionResult::Rejected(GameError::NotFound)
    ));
    command(
        &mut s,
        &r,
        p,
        b,
        1005,
        955,
        WorldAction::RevokeAttackGroupInvitation {
            group,
            player: host,
        },
    );
    assert!(
        s.world.as_ref().unwrap().records.attack_groups[&group]
            .invited
            .is_empty()
    );
}

#[test]
fn complete_first_round_group_loss_keeps_defender_intelligence_private() {
    let (mut s, r, p, b, t) = ready();
    for (n, body) in [b, t].into_iter().enumerate() {
        missiles::edit(
            &mut s,
            &r,
            body,
            11000 + n as u128,
            serde_json::json!({"op":"set","ships":{"Battleship":10}}),
        );
    }
    let first = launch(&mut s, &r, p, b, t, (1000, 970), None);
    command(
        &mut s,
        &r,
        p,
        b,
        1001,
        971,
        WorldAction::CreateAttackGroup { fleet: first },
    );
    let group = *s
        .world
        .as_ref()
        .unwrap()
        .records
        .attack_groups
        .keys()
        .next()
        .unwrap();
    launch(&mut s, &r, p, b, t, (1002, 972), Some(group));
    let g = s.world.as_ref().unwrap().records.attack_groups[&group].clone();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        g.arrival_at,
        973,
        Input::Event(ScheduledEvent::AttackGroupDue {
            group,
            generation: g.generation,
        }),
    );
    apply(&mut s, result);
    let w = &s.world.as_ref().unwrap().records;
    let report = w.reports.values().find(|r| r.kind == "Combat").unwrap();
    assert_eq!(report.payloads[&p]["kind"], "ContactLost");
    for key in ["participants", "rounds", "debris", "loot", "own_returns"] {
        assert!(report.payloads[&p].get(key).is_none());
    }
    assert_eq!(report.payloads[&s.bodies[&t].owner]["kind"], "Combat");
    assert_eq!(
        w.fleets
            .values()
            .filter(|f| f.owner == p && f.active())
            .count(),
        0
    );
}
#[test]
fn same_time_group_recall_returns_inline_and_cancels_its_only_event() {
    let (mut s, r, p, b, t) = ready();
    let fleet = launch(&mut s, &r, p, b, t, (1000, 980), None);
    command(
        &mut s,
        &r,
        p,
        b,
        1000,
        981,
        WorldAction::CreateAttackGroup { fleet },
    );
    let change = command(
        &mut s,
        &r,
        p,
        b,
        1000,
        982,
        WorldAction::RecallMission { fleet },
    );
    assert!(change.events.is_empty());
    let w = &s.world.as_ref().unwrap().records;
    assert_eq!(w.fleets[&fleet].leg, MissionLeg::Returned);
    assert_eq!(
        w.attack_groups.values().next().unwrap().resolved_at,
        Some(1000)
    );
    assert!(
        change
            .cancelled_events
            .iter()
            .any(|e| matches!(e, ScheduledEvent::AttackGroupDue { .. }))
    );
    validate_asset_lineage(&s).unwrap();
}

#[test]
fn empire_removal_cancels_a_group_with_no_remaining_attackers() {
    let (mut s, r, p, b, t) = ready();
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .deletion_requested_at = Some(0);
    let cutoff = DELETION_GRACE_MS;
    let first = launch(&mut s, &r, p, b, t, (cutoff - 1000, 9800), None);
    command(
        &mut s,
        &r,
        p,
        b,
        cutoff - 999,
        9801,
        WorldAction::CreateAttackGroup { fleet: first },
    );
    let group = *s
        .world
        .as_ref()
        .unwrap()
        .records
        .attack_groups
        .keys()
        .next()
        .unwrap();
    launch(&mut s, &r, p, b, t, (cutoff - 998, 9802), Some(group));
    let before = s.world.as_ref().unwrap().records.attack_groups[&group].clone();
    assert!(before.arrival_at > cutoff);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        cutoff,
        9803,
        Input::Event(ScheduledEvent::EmpireDeletionDue { player: p }),
    );
    let changes = apply(&mut s, result);
    assert_eq!(
        s.world.as_ref().unwrap().records.attack_groups[&group].resolved_at,
        Some(cutoff)
    );
    assert!(
        changes
            .cancelled_events
            .contains(&ScheduledEvent::AttackGroupDue {
                group,
                generation: before.generation
            })
    );
    validate_attack_group_records(&s.world.as_ref().unwrap().records).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        before.arrival_at,
        9804,
        Input::Event(ScheduledEvent::AttackGroupDue {
            group,
            generation: before.generation,
        }),
    );
    let stale = apply(&mut s, result);
    assert!(stale.events.is_empty());
}

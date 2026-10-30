use orbit_engine::*;
#[test]
fn half_fill_and_monday_boundaries() {
    assert_eq!(
        harvest_allocation(50000, 50000, 20000).unwrap(),
        (10000, 10000)
    );
    assert_eq!(harvest_allocation(2, 100, 5).unwrap(), (2, 3));
    assert_eq!(harvest_allocation(100, 100, 5).unwrap(), (3, 2));
    assert_eq!(harvest_allocation(100, 1, 5).unwrap(), (4, 1));
    assert_eq!(next_debris_cleanup(0).unwrap(), 4 * 86400000);
    assert_eq!(next_debris_cleanup(4 * 86400000).unwrap(), 11 * 86400000);
}

#[test]
fn legacy_debris_json_loads_but_new_snapshots_omit_reference_counts() {
    let legacy = serde_json::json!({
        "id": "00000000-0000-0000-0000-000000000900",
        "coordinates": {"galaxy":1,"system":1,"position":8},
        "marker_present": true, "metal": 1000000, "crystal": 2000000,
        "active_references": 7, "generation": 3, "cleanup_at": 345600000,
        "revision": 9
    });
    let field: DebrisField = serde_json::from_value(legacy.clone()).unwrap();
    let mut expected = legacy;
    expected
        .as_object_mut()
        .unwrap()
        .remove("active_references");
    assert_eq!(serde_json::to_value(field).unwrap(), expected);
    assert!(serde_json::from_value::<DebrisField>(expected).is_ok());
}

fn historical_case(index: usize) -> (serde_json::Value, OrderedInput, Hash) {
    let row: serde_json::Value = serde_json::from_str(
        include_str!("fixtures/legacy-debris-journal.jsonl")
            .lines()
            .nth(index)
            .unwrap(),
    )
    .unwrap();
    (
        row["facts"].clone(),
        serde_json::from_value(row["input"].clone()).unwrap(),
        serde_json::from_value(row["outcome_hash"].clone()).unwrap(),
    )
}

fn snapshot(index: usize) -> (GameState, OrderedInput) {
    let (facts, input, _) = historical_case(index);
    (serde_json::from_value(facts).unwrap(), input)
}

fn historical_rules() -> Ruleset {
    let artifact =
        include_str!("../../../rules/mvp-v1-slice-4.json").replace("Dreadnought", "Deathstar");
    let rules = Ruleset::from_json(artifact.as_bytes()).unwrap();
    assert_eq!(rules.hash, historical_case(0).1.profile_hash);
    for index in 1..5 {
        assert_eq!(historical_case(index).1.profile_hash, rules.hash);
    }
    rules
}

fn apply(state: &mut GameState, input: &OrderedInput) -> ChangeSet {
    let result = transition(state, input, &historical_rules());
    let TransitionResult::Applied(changes) = result else {
        panic!("{result:?}")
    };
    changes.apply_to(state).unwrap();
    validate_asset_lineage(state).unwrap();
    *changes
}

#[test]
fn reference_counts_follow_identity_and_active_legs() {
    let (s, _) = snapshot(1);
    let fleet = s
        .world
        .unwrap()
        .records
        .fleets
        .into_values()
        .next()
        .unwrap();
    let MissionDestination::Debris { field_identity, .. } = fleet.intent.destination else {
        panic!()
    };
    for (leg, count) in [
        (MissionLeg::Outbound, 1),
        (MissionLeg::Returning, 1),
        (MissionLeg::Returned, 0),
        (MissionLeg::Destroyed, 0),
    ] {
        let mut candidate = fleet.clone();
        candidate.leg = leg;
        assert_eq!(debris_reference_count(field_identity, [&candidate]), count);
    }
    let mut returning = fleet.clone();
    returning.leg = MissionLeg::Returning;
    let mut other_field = fleet.clone();
    let MissionDestination::Debris {
        field_identity: other,
        ..
    } = &mut other_field.intent.destination
    else {
        panic!()
    };
    *other = OperationId(uuid::Uuid::from_u128(999));
    let mut body_target = fleet.clone();
    body_target.intent.destination = MissionDestination::Body {
        id: fleet.intent.origin,
        expected_owner: fleet.owner,
        expected_kind: BodyKind::Planet,
    };
    assert_eq!(
        debris_reference_count(
            field_identity,
            [&fleet, &returning, &other_field, &body_target]
        ),
        2
    );
}

#[test]
fn cleanup_retains_outbound_and_returning_references_at_their_deadline() {
    for index in [1, 3] {
        let (mut s, mut input) = snapshot(index);
        let w = &mut s.world.as_mut().unwrap().records;
        let field = w.debris.values_mut().next().unwrap();
        field.cleanup_at = input.at;
        let id = field.id;
        input.payload = Input::Event(ScheduledEvent::DebrisCleanupDue {
            field: id,
            generation: field.generation,
        });
        let changes = apply(&mut s, &input);
        let field = &s.world.as_ref().unwrap().records.debris[&id];
        assert!(field.marker_present);
        assert!(field.cleanup_at > input.at);
        assert_eq!(changes.events.len(), 1);
    }
}

#[test]
fn recalls_release_only_after_terminal_return_and_stale_events_do_not_retain_marker() {
    for elapsed in [0, 1] {
        let (mut s, mut input) = snapshot(1);
        let fleet = s
            .world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .next()
            .unwrap()
            .clone();
        let field = *s
            .world
            .as_ref()
            .unwrap()
            .records
            .debris
            .keys()
            .next()
            .unwrap();
        input.actor = Actor::Player(fleet.owner);
        input.phase = 1;
        input.at = fleet.launched_at + elapsed;
        input.payload = Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: fleet.id },
        });
        s.world.as_mut().unwrap().records.presence.insert(
            input.id,
            PresenceLink {
                presence: InputId(uuid::Uuid::from_u128(9999)),
                gameplay: input.id,
                player: fleet.owner,
                body: Some(fleet.intent.origin),
                at: input.at,
            },
        );
        let recall = apply(&mut s, &input);
        assert_eq!(recall.events.len(), usize::from(elapsed > 0));
        assert_eq!(
            debris_reference_count(field, s.world.as_ref().unwrap().records.fleets.values()),
            usize::from(elapsed > 0)
        );
        input.actor = Actor::Scheduler;
        input.phase = 0;
        if elapsed > 0 {
            input.at = recall.events[0].at;
            input.payload = Input::Event(recall.events[0].event.clone());
            apply(&mut s, &input);
            let duplicate = apply(&mut s, &input);
            assert!(duplicate.world.is_none());
        }
        assert_eq!(
            debris_reference_count(field, s.world.as_ref().unwrap().records.fleets.values()),
            0
        );
        // Cleanup at the same timestamp as terminal return must see the updated leg.
        s.world
            .as_mut()
            .unwrap()
            .records
            .debris
            .get_mut(&field)
            .unwrap()
            .cleanup_at = input.at;
        input.payload = Input::Event(ScheduledEvent::DebrisCleanupDue {
            field,
            generation: 1,
        });
        apply(&mut s, &input);
        assert!(!s.world.as_ref().unwrap().records.debris[&field].marker_present);
        let (_, stale_arrival) = snapshot(2);
        assert!(apply(&mut s, &stale_arrival).world.is_none());
        assert!(apply(&mut s, &input).world.is_none());
    }
}

#[test]
fn cleanup_and_normal_return_at_equal_timestamps_follow_input_order() {
    for cleanup_first in [false, true] {
        let (mut s, return_input) = snapshot(3);
        let field = s
            .world
            .as_mut()
            .unwrap()
            .records
            .debris
            .values_mut()
            .next()
            .unwrap();
        field.cleanup_at = return_input.at;
        let id = field.id;
        let mut cleanup = return_input.clone();
        cleanup.payload = Input::Event(ScheduledEvent::DebrisCleanupDue {
            field: id,
            generation: field.generation,
        });
        // An obsolete cleanup generation never changes the deadline or resources.
        let mut stale = cleanup.clone();
        stale.payload = Input::Event(ScheduledEvent::DebrisCleanupDue {
            field: id,
            generation: 0,
        });
        let before = s.clone();
        assert!(apply(&mut s, &stale).world.is_none());
        assert_eq!(s, before);
        if cleanup_first {
            apply(&mut s, &cleanup);
            apply(&mut s, &return_input);
        } else {
            apply(&mut s, &return_input);
            apply(&mut s, &cleanup);
        }
        let field = &s.world.as_ref().unwrap().records.debris[&id];
        assert_eq!(field.marker_present, cleanup_first);
        assert_eq!(
            debris_reference_count(id, s.world.as_ref().unwrap().records.fleets.values()),
            0
        );
        if cleanup_first {
            cleanup.at = field.cleanup_at;
            apply(&mut s, &cleanup);
            assert!(!s.world.as_ref().unwrap().records.debris[&id].marker_present);
        }
    }
}

#[test]
fn historical_journal_replay_preserves_original_outcome_hashes() {
    // Captured from 8406eb6aa8d2972c96bb58e40dc75f7d319ce047 before this change.
    let rules = historical_rules();
    for index in 0..5 {
        let (facts, input, expected) = historical_case(index);
        let replayed = replay_legacy_debris_transition(&facts, &input, &rules).unwrap();
        assert_eq!(hash(&replayed), expected);
    }
}

#[test]
fn active_fleets_require_existing_visible_marker() {
    for remove in [false, true] {
        let (mut s, _) = snapshot(1);
        let debris = &mut s.world.as_mut().unwrap().records.debris;
        if remove {
            debris.clear();
        } else {
            debris.values_mut().next().unwrap().marker_present = false;
        }
        assert!(validate_asset_lineage(&s).is_err());
    }
}

#[test]
fn historical_replay_keeps_stale_event_hashes_and_rejects_inconsistent_counters() {
    let (facts, mut input, _) = historical_case(3);
    input.payload = Input::Event(ScheduledEvent::DebrisCleanupDue {
        field: OperationId(uuid::Uuid::from_u128(900)),
        generation: 0,
    });
    let rules = historical_rules();
    let replayed = replay_legacy_debris_transition(&facts, &input, &rules).unwrap();
    assert_eq!(
        replayed["Applied"]["expected_facts_hash"],
        serde_json::json!(hash(&facts))
    );
    assert!(replayed["Applied"].get("world").is_none());
    let mut corrupted = facts;
    corrupted["world"]["records"]["debris"]
        .as_object_mut()
        .unwrap()
        .values_mut()
        .next()
        .unwrap()["active_references"] = serde_json::json!(2);
    let replayed = replay_legacy_debris_transition(&corrupted, &input, &rules).unwrap();
    assert!(replayed.get("InvalidState").is_some());
}

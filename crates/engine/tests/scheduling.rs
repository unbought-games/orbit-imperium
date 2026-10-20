use orbit_engine::*;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
mod common;

#[test]
fn launches_declare_both_players_and_successor_locations() {
    let actor = PlayerId(Uuid::from_u128(1));
    let target = PlayerId(Uuid::from_u128(2));
    let origin = BodyId(Uuid::from_u128(3));
    let destination = BodyId(Uuid::from_u128(4));
    let a = Coordinates {
        galaxy: 1,
        system: 1,
        position: 1,
    };
    let b = Coordinates {
        galaxy: 1,
        system: 2,
        position: 1,
    };
    let refs = ScopeReferences {
        bodies: BTreeMap::from([(origin, (actor, a)), (destination, (target, b))]),
        ..Default::default()
    };
    let command = Command::World {
        action: WorldAction::LaunchFleet {
            intent: FleetIntent {
                origin,
                destination: MissionDestination::Body {
                    id: destination,
                    expected_kind: BodyKind::Planet,
                    expected_owner: target,
                },
                mission: Mission::Attack,
                ships: vec![],
                cargo: Resources::default(),
                speed_percent: 100,
            },
            expected_terms_hash: Hash(String::new()),
        },
    };
    let scopes = command_scopes(actor, &command, &refs).unwrap();
    assert_eq!(
        scopes,
        BTreeSet::from([
            ScopeKey::Player(actor),
            ScopeKey::Player(target),
            ScopeKey::Location(a),
            ScopeKey::Location(b)
        ])
    );
    let independent = command_scopes(
        PlayerId(Uuid::from_u128(9)),
        &Command::CancelConstruction {
            operation: OperationId(Uuid::from_u128(10)),
        },
        &ScopeReferences::default(),
    )
    .unwrap();
    assert!(scopes.is_disjoint(&independent));
    assert!(validate_successor_scopes(&scopes, &BTreeSet::from([ScopeKey::Location(b)])).is_ok());
    assert!(validate_successor_scopes(&scopes, &independent).is_err());
}

#[test]
fn arrivals_and_recalls_share_the_same_complete_conflict_scope() {
    let owner = PlayerId(Uuid::from_u128(1));
    let target = PlayerId(Uuid::from_u128(2));
    let fleet = FleetId(Uuid::from_u128(3));
    let origin = Coordinates {
        galaxy: 1,
        system: 1,
        position: 1,
    };
    let destination = Coordinates {
        galaxy: 1,
        system: 2,
        position: 1,
    };
    let refs = ScopeReferences {
        fleets: BTreeMap::from([(fleet, (owner, Some(target), origin, destination))]),
        ..Default::default()
    };
    let due = event_scopes(
        &ScheduledEvent::FleetLegDue {
            fleet,
            generation: 0,
            expected_leg: MissionLeg::Outbound,
        },
        &refs,
    )
    .unwrap();
    let recall = command_scopes(
        owner,
        &Command::World {
            action: WorldAction::RecallMission { fleet },
        },
        &refs,
    )
    .unwrap();
    assert_eq!(due, recall);
    assert_eq!(due.len(), 4);
    assert!(
        event_scopes(
            &ScheduledEvent::FleetLegDue {
                fleet,
                generation: 0,
                expected_leg: MissionLeg::Outbound
            },
            &ScopeReferences::default()
        )
        .is_err()
    );
}

#[test]
fn research_serializes_all_owned_bodies_without_locking_other_players() {
    let owner = PlayerId(Uuid::from_u128(1));
    let operation = OperationId(Uuid::from_u128(2));
    let refs = ScopeReferences {
        operations: BTreeMap::from([(operation, owner)]),
        ..Default::default()
    };
    let due = event_scopes(
        &ScheduledEvent::ResearchDue {
            operation,
            generation: 0,
        },
        &refs,
    )
    .unwrap();
    assert_eq!(due, BTreeSet::from([ScopeKey::Player(owner)]));
    assert!(
        OrderKey {
            at_ms: 10,
            phase: 0,
            ordinal: 20
        } < OrderKey {
            at_ms: 10,
            phase: 1,
            ordinal: 1
        }
    );
}

#[test]
fn disjoint_gameplay_matches_serial_reference_across_interleavings_and_restart() {
    let (mut initial, rules, a, body_a) = common::fixture();
    let b = PlayerId(Uuid::from_u128(21));
    let body_b = BodyId(Uuid::from_u128(22));
    let mut body = initial.bodies[&body_a].clone();
    body.id = body_b;
    body.owner = b;
    body.coordinates.position = 9;
    initial.bodies.insert(body_b, body);
    initial.players.insert(
        b,
        Player {
            id: b,
            universe: initial.universe,
        },
    );
    let mut research = initial.research[&a].clone();
    research.owner = b;
    initial.research.insert(b, research);
    initial.coverage.bodies.insert(body_b);
    initial.coverage.construction_bodies.insert(body_b);
    initial.coverage.inventory_owners.insert((body_b, b));
    initial.coverage.research_players.insert(b);
    initial.coverage.fleet_owners.insert(b);
    let mut serial = initial.clone();
    let mut batches = Vec::new();
    let mut at = 0;
    for round in 0..3u128 {
        let mut commands = Vec::new();
        for (index, (owner, body)) in [(a, body_a), (b, body_b)].into_iter().enumerate() {
            let terms = quote(
                &serial,
                Actor::Player(owner),
                &QuoteRequest::Upgrade {
                    body,
                    building: Building::MetalMine,
                },
                at,
                &rules,
            )
            .unwrap();
            commands.push(common::input(
                &serial,
                &rules,
                Actor::Player(owner),
                at,
                100 + round * 10 + index as u128,
                Input::Command(Command::StartUpgrade {
                    body,
                    building: Building::MetalMine,
                    expected_terms_hash: terms.terms_hash,
                }),
            ));
        }
        let mut events = Vec::new();
        for (index, input) in commands.iter().enumerate() {
            let result = transition(&serial, input, &rules);
            let changes = common::applied(&mut serial, result);
            for event in changes.events {
                let mut due = common::input(
                    &serial,
                    &rules,
                    Actor::Scheduler,
                    event.at,
                    200 + round * 10 + index as u128,
                    Input::Event(event.event),
                );
                due.id = event.id;
                events.push(due);
            }
        }
        events.sort_by_key(|input| (input.at, input.phase, input.sequence));
        for input in &events {
            let result = transition(&serial, input, &rules);
            common::applied(&mut serial, result);
        }
        at = events.iter().map(|input| input.at).max().unwrap() + 1;
        batches.push(commands);
        batches.push(events);
    }
    // Every reachable prefix is determined by how many inputs each player has
    // completed. Proving both incoming edges agree at each grid cell checks all
    // 924 legal merges of these histories without replaying shared prefixes.
    let histories: [Vec<_>; 2] = std::array::from_fn(|owner| {
        batches
            .iter()
            .flatten()
            .filter(|input| input.sequence as usize % 2 == owner)
            .cloned()
            .collect()
    });
    let mut states: Vec<Vec<Option<GameState>>> =
        vec![vec![None; histories[1].len() + 1]; histories[0].len() + 1];
    states[0][0] = Some(initial);
    for a in 0..=histories[0].len() {
        for b in 0..=histories[1].len() {
            if a == 0 && b == 0 {
                continue;
            }
            let mut reached = None;
            for (previous, input) in [
                a.checked_sub(1)
                    .map(|n| (states[n][b].as_ref().unwrap(), &histories[0][n])),
                b.checked_sub(1)
                    .map(|n| (states[a][n].as_ref().unwrap(), &histories[1][n])),
            ]
            .into_iter()
            .flatten()
            {
                let mut next = previous.clone();
                let result = transition(&next, input, &rules);
                common::applied(&mut next, result);
                let restarted: GameState =
                    serde_json::from_value(serde_json::to_value(&next).unwrap()).unwrap();
                assert_eq!(restarted, next);
                if let Some(other) = &reached {
                    assert_eq!(&next, other, "prefix ({a},{b})");
                }
                reached = Some(next);
            }
            states[a][b] = reached;
        }
    }
    assert_eq!(
        states.last().unwrap().last().unwrap().as_ref().unwrap(),
        &serial
    );
    assert_eq!(serial.bodies[&body_a].levels[&Building::MetalMine], 4);
    assert_eq!(serial.bodies[&body_b].levels[&Building::MetalMine], 4);
    assert_eq!(serial.bodies[&body_a].revision, 6);
    assert_eq!(serial.bodies[&body_b].revision, 6);
}

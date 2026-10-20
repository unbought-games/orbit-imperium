use orbit_engine::*;
use serde::Deserialize;
use std::collections::BTreeMap;
use uuid::Uuid;
mod common;
use common::*;
#[derive(Deserialize)]
struct Playthrough {
    inputs: Vec<Action>,
    source_final_micro: Resources,
    target_final_micro: Resources,
    source_carry: Resources,
    reports: usize,
    source_ships: i64,
}
#[derive(Deserialize)]
struct Action {
    at: i64,
    action: String,
}
fn run(restart_after: Option<usize>) -> GameState {
    let scenario: Playthrough = serde_json::from_str(include_str!(
        "../../../fixtures/first-slice/ordered-playthrough.json"
    ))
    .unwrap();
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
    let ships = vec![ShipStack {
        owner: p,
        ship_type: ShipType::SmallCargo,
        count: 2,
    }];
    s.inventories.push(InventoryStack {
        body: b,
        owner: ships[0].owner,
        item: ManufacturedItem::Ship(ships[0].ship_type),
        count: ships[0].count,
        revision: 0,
    });
    let mut pending = BTreeMap::<(i64, u128), ScheduledEvent>::new();
    for (index, action) in scenario.inputs.iter().enumerate() {
        let at = action.at;
        let payload = match action.action.as_str() {
            "upgrade" => {
                let q = quote(
                    &s,
                    Actor::Player(p),
                    &QuoteRequest::Upgrade {
                        body: b,
                        building: Building::MetalMine,
                    },
                    at,
                    &r,
                )
                .unwrap();
                Input::Command(Command::StartUpgrade {
                    body: b,
                    building: Building::MetalMine,
                    expected_terms_hash: q.terms_hash,
                })
            }
            "launch" => {
                let cargo = Resources {
                    metal: 100 * SCALE,
                    crystal: 50 * SCALE,
                    deuterium: 10 * SCALE,
                };
                let q = quote(
                    &s,
                    Actor::Player(p),
                    &QuoteRequest::Transport {
                        origin: b,
                        target,
                        ships: ships.clone(),
                        cargo,
                        speed_percent: 100,
                    },
                    at,
                    &r,
                )
                .unwrap();
                Input::Command(Command::LaunchTransport {
                    origin: b,
                    target,
                    ships: ships.clone(),
                    cargo,
                    speed_percent: 100,
                    expected_terms_hash: q.terms_hash,
                })
            }
            "recall" => {
                let fleet = s
                    .fleets
                    .values()
                    .find(|f| f.status == FleetStatus::Outbound)
                    .unwrap()
                    .id;
                Input::Command(Command::RecallFleet { fleet })
            }
            "event" => {
                let ((due, _), event) = pending.pop_first().unwrap();
                assert_eq!(due, at);
                Input::Event(event)
            }
            _ => panic!("unknown fixture action"),
        };
        let actor = if matches!(payload, Input::Event(_)) {
            Actor::Scheduler
        } else {
            Actor::Player(p)
        };
        let i = input(&s, &r, actor, at, index as u128 + 100, payload);
        let result = transition(&s, &i, &r);
        let changes = applied(&mut s, result);
        for cancelled in &changes.cancelled_events {
            pending.retain(|_, e| e != cancelled)
        }
        for event in changes.events {
            pending.insert((event.at, index as u128), event.event);
        }
        if restart_after == Some(index) {
            s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
        }
    }
    assert_eq!(s.bodies[&b].checkpoint.amounts, scenario.source_final_micro);
    assert_eq!(s.bodies[&b].checkpoint.carry, scenario.source_carry);
    assert_eq!(
        settle_economy(&s.bodies[&target], 16_682_000, &r)
            .unwrap()
            .amounts,
        scenario.target_final_micro
    );
    assert_eq!(s.reports.len(), scenario.reports);
    assert_eq!(s.inventories[0].count, scenario.source_ships);
    assert!(pending.is_empty());
    s
}
#[test]
fn full_playthrough_replays_after_every_input_boundary() {
    let baseline = hash(&run(None));
    for boundary in 0..8 {
        assert_eq!(hash(&run(Some(boundary))), baseline)
    }
}
#[test]
fn split_settlement_property_over_levels_intervals_and_carries() {
    let (s, r, _, b) = fixture();
    for level in 0..15 {
        for split in [1, 17, 999, 100001, 1_234_567] {
            let mut body = s.bodies[&b].clone();
            body.levels.insert(Building::MetalMine, level);
            body.levels.insert(Building::SolarPlant, level + 2);
            let expected = settle_economy(&body, 3_600_001, &r).unwrap();
            body.checkpoint = settle_economy(&body, split, &r).unwrap();
            assert_eq!(settle_economy(&body, 3_600_001, &r).unwrap(), expected)
        }
    }
}

#[test]
fn historical_capacity_journals_preserve_recorded_outcomes_and_current_gameplay() {
    // Captured from main 8406eb6 before capacity derivation changed: protocol 2 custom
    // capacities, protocol 3 storage start/completion, protocol 4 storage completion
    // and fleet arrival, and protocol 1 legacy saves, including paid terms.
    let records: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("fixtures/storage-capacity-journal.json")).unwrap();
    for record in records {
        let facts: GameState = serde_json::from_value(record["facts"].clone()).unwrap();
        let input: OrderedInput = serde_json::from_value(record["input"].clone()).unwrap();
        let rules = Ruleset::from_json(match input.protocol {
            1 => include_bytes!("../../../rules/first-slice-v1.json").as_slice(),
            2 => include_bytes!("../../../rules/shared-foundation-r1.json").as_slice(),
            3 => include_bytes!("../../../rules/mvp-v1-slice-2.json").as_slice(),
            4 => include_bytes!("../../../rules/mvp-v1-slice-4.json").as_slice(),
            _ => panic!("unknown fixture protocol"),
        })
        .unwrap();
        assert_eq!(serde_json::to_value(&facts).unwrap(), record["facts"]);
        // Recorded outcomes retain their original wire shape and facts-hash fence.
        let recorded: TransitionResult = serde_json::from_value(record["outcome"].clone()).unwrap();
        assert_eq!(serde_json::to_value(&recorded).unwrap(), record["outcome"]);
        let TransitionResult::Applied(recorded) = recorded else {
            panic!("fixture must apply");
        };
        let mut historical_state = facts.clone();
        recorded.apply_to(&mut historical_state).unwrap();

        // Current transitions no longer emit the redundant reservation updates.
        // Every other historical effect, including capacity and paid terms, is exact.
        let result = transition(&facts, &input, &rules);
        let mut expected = record["outcome"].clone();
        expected["Applied"]
            .as_object_mut()
            .unwrap()
            .remove("progression_reservations");
        assert_eq!(serde_json::to_value(&result).unwrap(), expected);
        let TransitionResult::Applied(changes) = result else {
            panic!("fixture must apply");
        };
        assert!(changes.progression_reservations.is_empty());
        let mut restarted = facts;
        changes.apply_to(&mut restarted).unwrap();
        // The recorded reservation copy may change only when applying the old outcome.
        historical_state.progression_reservations.clear();
        restarted.progression_reservations.clear();
        assert_eq!(restarted, historical_state);
    }
}

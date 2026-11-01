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
    for research in s.research.values_mut() {
        for key in r.research_keys() {
            research.levels.entry(key).or_insert(0);
        }
    }
    missiles::edit(
        &mut s,
        &r,
        t,
        9900,
        serde_json::json!({"op":"set","buildings":{"AllianceDepot":1},"resources":{"metal":1000000,"crystal":1000000,"deuterium":1000000}}),
    );
    let host = s.bodies[&t].owner;
    let w = s.world.as_mut().unwrap();
    w.holding_relationships = Some(HoldingRelationships {
        covered: w.covered_players.clone(),
        friends: BTreeSet::from([(p.min(host), p.max(host))]),
        ..Default::default()
    });
    w.covered_depot_sources = s.bodies.keys().copied().collect();
    (s, r, p, b, t)
}
fn hold(s: &GameState, p: PlayerId, b: BodyId, t: BodyId, hours: u32) -> FleetIntent {
    FleetIntent {
        attack_group: None,
        mission: Mission::Hold,
        hold_hours: Some(hours),
        cargo: Resources::default(),
        ..super::intent(s, p, b, t)
    }
}
fn arrive(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    e: &NewEvent,
    n: u128,
) -> ChangeSet {
    let result = run(s, r, p, b, e.at, n, Input::Event(e.event.clone()));
    apply(s, result)
}
fn supply(
    s: &mut GameState,
    r: &Ruleset,
    t: BodyId,
    fleet: FleetId,
    at: i64,
    fuel: i64,
    n: u128,
) -> ChangeSet {
    let host = s.bodies[&t].owner;
    let intent = DepotSupplyIntent {
        source_planet: t,
        fleet,
        deuterium: fuel * SCALE,
    };
    let q = quote_depot_supply(s, host, &intent, at, r).unwrap();
    let result = run(
        s,
        r,
        host,
        t,
        at,
        n,
        Input::Command(Command::World {
            action: WorldAction::SupplyHoldingFleet {
                intent,
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    apply(s, result)
}
#[test]
fn launch_rates_round_once_preserve_drive_terms_and_reject_irrelevant_hours() {
    let (mut s, r, p, b, t) = ready();
    let mut intent = hold(&s, p, b, t, 1);
    intent.ships = vec![ManifestStack {
        owner: p,
        ship_type: ShipType::EspionageProbe,
        count: 3,
    }];
    assert_eq!(
        holding_terms(&intent, &s.research[&p], &r)
            .unwrap()
            .unwrap()
            .fuel,
        SCALE
    );
    intent.ships = vec![ManifestStack {
        owner: p,
        ship_type: ShipType::HeavyFighter,
        count: 2,
    }];
    assert_eq!(
        holding_terms(&intent, &s.research[&p], &r)
            .unwrap()
            .unwrap()
            .fuel,
        15 * SCALE
    );
    intent.ships[0].ship_type = ShipType::SmallCargo;
    intent.ships[0].count = 1;
    intent.hold_hours = Some(4);
    let before = holding_terms(&intent, &s.research[&p], &r)
        .unwrap()
        .unwrap();
    assert_eq!(before.fuel, 4 * SCALE);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::ImpulseDrive, 5);
    assert_eq!(
        holding_terms(&intent, &s.research[&p], &r)
            .unwrap()
            .unwrap()
            .fuel,
        8 * SCALE
    );
    assert_eq!(before.rates[&ShipType::SmallCargo], 10);
    intent.hold_hours = Some(3);
    assert_eq!(
        holding_terms(&intent, &s.research[&p], &r),
        Err(GameError::InvalidInput)
    );
    intent.hold_hours = Some(1);
    intent.mission = Mission::Transport;
    assert_eq!(
        holding_terms(&intent, &s.research[&p], &r),
        Err(GameError::InvalidInput)
    );
}
#[test]
fn holding_keeps_ownership_cargo_slot_and_original_return_then_stales_departure() {
    let (mut s, r, p, b, t) = ready();
    let mut intent = hold(&s, p, b, t, 2);
    intent.cargo.metal = 100 * SCALE;
    let q = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    let event = launch_raid(&mut s, &r, p, b, intent.clone(), 1000, 100);
    let arrival = arrive(&mut s, &r, p, b, &event, 101);
    let f = s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .next()
        .unwrap()
        .clone();
    assert_eq!(f.leg, MissionLeg::Holding);
    assert_eq!(f.due_at, event.at + 2 * HOLD_HOUR_MS);
    assert_eq!(f.cargo, intent.cargo);
    assert!(quote_fleet(&s, p, &intent, event.at, &r).is_err());
    validate_asset_lineage(&s).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        event.at + 5,
        102,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: f.id },
        }),
    );
    let recall = apply(&mut s, result);
    assert_eq!(recall.events[0].at, event.at + 5 + q.duration_ms);
    let saved = s.clone();
    arrive(&mut s, &r, p, b, &arrival.events[0], 103);
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets,
        saved.world.as_ref().unwrap().records.fleets
    );
    arrive(&mut s, &r, p, b, &recall.events[0], 104);
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets[&f.id].leg,
        MissionLeg::Returned
    );
    validate_asset_lineage(&s).unwrap();
}
#[test]
fn zero_hour_hold_never_defends_and_relationship_revocation_preserves_paid_hold() {
    for hours in [0, 1] {
        let (mut s, r, p, b, t) = ready();
        let intent = hold(&s, p, b, t, hours);
        let event = launch_raid(&mut s, &r, p, b, intent, 1000, 110);
        s.world
            .as_mut()
            .unwrap()
            .holding_relationships
            .as_mut()
            .unwrap()
            .friends
            .clear();
        let arrival = arrive(&mut s, &r, p, b, &event, 111);
        assert_eq!(arrival.events.len(), 1);
        let f = s
            .world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .next()
            .unwrap();
        assert_eq!(
            f.leg,
            if hours == 0 {
                MissionLeg::Returning
            } else {
                MissionLeg::Holding
            }
        );
        let request = DepotSupplyIntent {
            source_planet: t,
            fleet: f.id,
            deuterium: SCALE,
        };
        assert_eq!(
            quote_depot_supply(&s, s.bodies[&t].owner, &request, event.at, &r),
            Err(GameError::HoldingUnavailable)
        );
    }
}
#[test]
fn supply_budget_boundary_stale_quote_departure_and_no_refund() {
    let (mut s, r, p, b, t) = ready();
    let host = s.bodies[&t].owner;
    let intent = hold(&s, p, b, t, 1);
    let event = launch_raid(&mut s, &r, p, b, intent, 1000, 120);
    let arrival = arrive(&mut s, &r, p, b, &event, 121);
    let f = s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .next()
        .unwrap()
        .clone();
    let at = event.at;
    let request = DepotSupplyIntent {
        source_planet: t,
        fleet: f.id,
        deuterium: 4000 * SCALE,
    };
    let q = quote_depot_supply(&s, host, &request, at, &r).unwrap();
    let c = supply(&mut s, &r, t, f.id, at, 4000, 122);
    assert_eq!(c.events[0].at, q.departure_at);
    let stale = run(
        &mut s,
        &r,
        host,
        t,
        at,
        123,
        Input::Command(Command::World {
            action: WorldAction::SupplyHoldingFleet {
                intent: request,
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    assert!(matches!(
        stale,
        TransitionResult::Rejected(GameError::QuoteChanged)
    ));
    supply(&mut s, &r, t, f.id, at + 1, 6000, 124);
    let w = &s.world.as_ref().unwrap().records;
    assert_eq!(
        depot_budget(1, t, at + HOLD_HOUR_MS - 1, &w.depot_supplies)
            .unwrap()
            .0,
        0
    );
    assert_eq!(
        depot_budget(1, t, at + HOLD_HOUR_MS, &w.depot_supplies)
            .unwrap()
            .0,
        4000 * SCALE
    );
    assert_eq!(
        depot_budget(2, t, at + 2, &w.depot_supplies).unwrap().0,
        10000 * SCALE
    );
    assert_eq!(depot_budget(0, t, at + 2, &w.depot_supplies).unwrap().0, 0);
    let latest = w.fleets[&f.id].clone();
    let request = DepotSupplyIntent {
        source_planet: t,
        fleet: f.id,
        deuterium: SCALE,
    };
    assert_eq!(
        quote_depot_supply(&s, host, &request, latest.due_at, &r),
        Err(GameError::HoldingUnavailable)
    );
    arrive(&mut s, &r, p, b, &arrival.events[0], 125);
    assert_eq!(s.world.as_ref().unwrap().records.fleets[&f.id], latest);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        at + 2,
        126,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: f.id },
        }),
    );
    apply(&mut s, result);
    assert_eq!(
        depot_budget(
            1,
            t,
            at + 2,
            &s.world.as_ref().unwrap().records.depot_supplies
        )
        .unwrap()
        .0,
        0
    );
}
#[test]
fn depot_rounding_uses_survivors_and_deletion_blocks_new_supply() {
    let (mut s, r, p, b, t) = ready();
    missiles::edit(
        &mut s,
        &r,
        b,
        9950,
        serde_json::json!({"op":"set","ships":{"HeavyFighter":2}}),
    );
    let mut intent = hold(&s, p, b, t, 1);
    intent.ships = vec![ManifestStack {
        owner: p,
        ship_type: ShipType::HeavyFighter,
        count: 1,
    }];
    let event = launch_raid(&mut s, &r, p, b, intent, 1000, 130);
    arrive(&mut s, &r, p, b, &event, 131);
    let f = s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .next()
        .unwrap();
    let request = DepotSupplyIntent {
        source_planet: t,
        fleet: f.id,
        deuterium: SCALE,
    };
    let host = s.bodies[&t].owner;
    assert_eq!(
        quote_depot_supply(&s, host, &request, event.at, &r)
            .unwrap()
            .extension_ms,
        480000
    );
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .lifecycle = PlayerLifecycle::DeletionPending;
    assert_eq!(
        quote_depot_supply(&s, host, &request, event.at, &r),
        Err(GameError::HoldingUnavailable)
    );
    for (player, lifecycle, vacation, expected) in [
        (
            p,
            PlayerLifecycle::Active,
            true,
            GameError::HoldingUnavailable,
        ),
        (
            host,
            PlayerLifecycle::DeletionPending,
            false,
            GameError::ActorDraining,
        ),
        (
            host,
            PlayerLifecycle::Active,
            true,
            GameError::ActorVacation,
        ),
    ] {
        for owner in [p, host] {
            let policy = s
                .world
                .as_mut()
                .unwrap()
                .records
                .policies
                .get_mut(&owner)
                .unwrap();
            policy.lifecycle = PlayerLifecycle::Active;
            policy.vacation = false;
        }
        let policy = s
            .world
            .as_mut()
            .unwrap()
            .records
            .policies
            .get_mut(&player)
            .unwrap();
        policy.lifecycle = lifecycle;
        policy.vacation = vacation;
        assert_eq!(
            quote_depot_supply(&s, host, &request, event.at, &r),
            Err(expected)
        );
    }
}
#[test]
fn capacity_counts_host_and_distinct_owners_at_arrival() {
    let (mut s, r, p, b, t) = ready();
    let intent = hold(&s, p, b, t, 1);
    let event = launch_raid(&mut s, &r, p, b, intent, 1000, 140);
    let template = s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .next()
        .unwrap()
        .clone();
    // Admission arithmetic alone: foreign fleets need not be in the visitor's economy to count.
    let mut records = s.world.as_ref().unwrap().records.clone();
    for n in 0..4 {
        let mut f = template.clone();
        f.id = FleetId(Uuid::from_u128(800 + n));
        f.owner = PlayerId(Uuid::from_u128(900 + n));
        f.leg = MissionLeg::Holding;
        f.authorization.actor = f.owner;
        for ship in &mut f.ships {
            ship.owner = f.owner;
        }
        for ship in &mut f.intent.ships {
            ship.owner = f.owner;
        }
        let mut terms = (*f.terms).clone();
        terms.intent = f.intent.clone();
        f.terms = terms.seal();
        records.fleets.insert(f.id, f);
    }
    s.world.as_mut().unwrap().records = records;
    let result = run(&mut s, &r, p, b, event.at, 141, Input::Event(event.event));
    apply(&mut s, result);
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets[&template.id].leg,
        MissionLeg::Returning
    );
}

#[test]
fn same_player_on_both_sides_receives_defender_report_and_keeps_held_assets() {
    let (mut s, r, p, b, t) = ready();
    for (n, body) in [b, t].into_iter().enumerate() {
        missiles::edit(
            &mut s,
            &r,
            body,
            10000 + n as u128,
            serde_json::json!({"op":"set","ships":{"Battleship":10},"research":{"ComputerTechnology":4}}),
        );
    }
    let hold = hold(&s, p, b, t, 1);
    let arrival = launch_raid(&mut s, &r, p, b, hold, 1000, 200);
    arrive(&mut s, &r, p, b, &arrival, 201);
    let held = s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .next()
        .unwrap()
        .clone();
    let mut attack = super::intent(&s, p, b, t);
    attack.mission = Mission::Attack;
    let battle = launch_raid(&mut s, &r, p, b, attack, arrival.at + 1, 202);
    arrive(&mut s, &r, p, b, &battle, 203);
    let records = &s.world.as_ref().unwrap().records;
    let report = records
        .reports
        .values()
        .find(|r| r.kind == "Combat")
        .unwrap();
    assert_eq!(report.payloads[&p]["kind"], "Combat");
    assert_eq!(
        report.payloads[&p]["participants"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    for payload in report.payloads.values() {
        for participant in payload["participants"].as_array().unwrap() {
            let location_body = if participant["side"] == "Defender" {
                t
            } else {
                b
            };
            assert_eq!(
                participant["location"],
                serde_json::json!({
                    "coordinates": s.bodies[&location_body].coordinates,
                    "name": s.bodies[&location_body].name,
                    "kind": s.bodies[&location_body].kind,
                })
            );
        }
    }
    assert_eq!(records.fleets[&held.id].leg, MissionLeg::Holding);
    assert_eq!(records.fleets[&held.id].due_at, held.due_at);
    validate_asset_lineage(&s).unwrap();
}

#[test]
fn host_block_vetoes_alliance_but_sender_block_alone_does_not_and_missing_coverage_fails() {
    let (mut s, _, p, _, t) = ready();
    let host = s.bodies[&t].owner;
    let rel = s
        .world
        .as_mut()
        .unwrap()
        .holding_relationships
        .as_mut()
        .unwrap();
    rel.friends.clear();
    let alliance = Uuid::from_u128(10101);
    rel.alliances.extend([(p, alliance), (host, alliance)]);
    rel.blocks.insert((p, host));
    assert_eq!(can_hold(&s, p, host), Ok(()));
    s.world
        .as_mut()
        .unwrap()
        .holding_relationships
        .as_mut()
        .unwrap()
        .blocks
        .insert((host, p));
    assert_eq!(can_hold(&s, p, host), Err(GameError::HoldingUnavailable));
    s.world
        .as_mut()
        .unwrap()
        .holding_relationships
        .as_mut()
        .unwrap()
        .covered
        .remove(&host);
    assert_eq!(can_hold(&s, p, host), Err(GameError::PolicyUnavailable));
}

#[test]
fn holding_arithmetic_rejects_overflow_and_sub_millisecond_supply_without_debit() {
    let (mut s, r, p, b, t) = ready();
    let intent = hold(&s, p, b, t, 1);
    let event = launch_raid(&mut s, &r, p, b, intent, 1000, 240);
    arrive(&mut s, &r, p, b, &event, 241);
    let fleet = s
        .world
        .as_mut()
        .unwrap()
        .records
        .fleets
        .values_mut()
        .next()
        .unwrap();
    let mut terms = (*fleet.terms).clone();
    let holding = terms.holding.as_mut().unwrap();
    holding.rates.insert(ShipType::SmallCargo, i64::MAX);
    assert_eq!(
        holding_rate(
            &[ShipStack {
                owner: p,
                ship_type: ShipType::SmallCargo,
                count: i64::MAX
            }],
            holding
        ),
        Err(GameError::NumericRange)
    );
    holding.rates.insert(ShipType::SmallCargo, 1_000_000_000);
    fleet.terms = terms.seal();
    let request = DepotSupplyIntent {
        source_planet: t,
        fleet: fleet.id,
        deuterium: SCALE,
    };
    let before = s.clone();
    assert_eq!(
        quote_depot_supply(&s, s.bodies[&t].owner, &request, event.at, &r),
        Err(GameError::ExtensionTooSmall)
    );
    assert_eq!(s, before);
}

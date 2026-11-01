use super::*;
fn action(enter: bool) -> Input {
    Input::Command(Command::World {
        action: if enter {
            WorldAction::EnterVacation
        } else {
            WorldAction::ExitVacation
        },
    })
}
#[test]
fn vacation_settles_all_bodies_preserves_settings_and_enforces_exact_minimum() {
    let (mut s, r, p, b, _) = fixture();
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::default();
    missiles::edit(
        &mut s,
        &r,
        b,
        80099,
        serde_json::json!({"op":"set","buildings":{"MetalMine":4,"SolarPlant":5,"MetalStorage":5,"CrystalStorage":5}}),
    );
    let settings = s.production_settings.clone();
    let start = 3_600_000;
    let expected = settle_production(&s, &s.bodies[&b], start, &r).unwrap();
    let result = run(&mut s, &r, p, b, start, 80100, action(true));
    apply(&mut s, result);
    assert_eq!(s.bodies[&b].checkpoint, expected);
    assert_eq!(s.production_settings, settings);
    let view = vacation_view(&s, p).unwrap();
    assert!(view.active);
    assert_eq!(view.earliest_exit_at, Some(start + VACATION_MINIMUM_MS));
    let after = settle_production(&s, &s.bodies[&b], start + VACATION_MINIMUM_MS, &r).unwrap();
    assert_eq!(
        after.amounts.metal - expected.amounts.metal,
        48 * r.artifact.base_income[0] * i64::from(r.speed) * SCALE
    );
    assert_eq!(after.amounts.deuterium, expected.amounts.deuterium);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        start + VACATION_MINIMUM_MS - 1,
        80101,
        action(false),
    );
    assert!(matches!(
        result,
        TransitionResult::Rejected(GameError::VacationMinimum)
    ));
    let result = run(
        &mut s,
        &r,
        p,
        b,
        start + VACATION_MINIMUM_MS,
        80102,
        action(false),
    );
    apply(&mut s, result);
    assert!(!vacation_view(&s, p).unwrap().active);
    assert_eq!(s.bodies[&b].checkpoint, after);
    assert_eq!(s.production_settings, settings);
    assert!(
        body_economy(&s, &s.bodies[&b], &r).unwrap().gross.metal
            > r.artifact.base_income[0] * i64::from(r.speed) * SCALE
    );
}
#[test]
fn own_flight_blocks_entry_but_inbound_transport_survives_entry() {
    let (mut s, r, p, b, t) = fixture();
    let intent = intent(&s, p, b, t);
    let quote = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        80200,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: quote.terms_hash.clone(),
            },
        }),
    );
    let launched = apply(&mut s, result);
    assert!(
        vacation_view(&s, p)
            .unwrap()
            .blockers
            .iter()
            .any(|v| v.kind == VacationBlockerKind::Fleet)
    );
    let result = run(&mut s, &r, p, b, 1001, 80201, action(true));
    assert!(matches!(
        result,
        TransitionResult::Rejected(GameError::VacationBlocked)
    ));
    let target = s.bodies[&t].owner;
    let result = run(&mut s, &r, target, t, 1001, 80202, action(true));
    apply(&mut s, result);
    assert_eq!(
        check_mission_eligibility(&s, p, Some(target), Mission::Transport, 1002, &r),
        Err(GameError::TargetVacation)
    );
    let event = &launched.events[0];
    let result = run(
        &mut s,
        &r,
        p,
        b,
        event.at,
        80203,
        Input::Event(event.event.clone()),
    );
    apply(&mut s, result);
    assert!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .any(|f| f.leg == MissionLeg::Returning && f.cargo == Resources::default())
    );
}
#[test]
fn incomplete_collections_cannot_certify_entry_and_vacation_blocks_work() {
    let (mut s, r, p, b, _) = fixture();
    s.coverage.manufacturing_bodies.remove(&b);
    assert_eq!(vacation_view(&s, p), Err(GameError::PolicyUnavailable));
    s.coverage.manufacturing_bodies.insert(b);
    let result = run(&mut s, &r, p, b, 1000, 80300, action(true));
    apply(&mut s, result);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1001,
        80301,
        Input::Command(Command::SetProduction {
            body: b,
            settings: ProductionSettings::default(),
            expected_settings_revision: 0,
        }),
    );
    assert!(matches!(
        result,
        TransitionResult::Rejected(GameError::ActorVacation)
    ));
    assert_eq!(
        check_mission_eligibility(&s, p, None, Mission::Harvest, 1001, &r),
        Err(GameError::ActorVacation)
    );
}
#[test]
fn migrated_interval_splits_offline_accrual_without_rewriting_history() {
    let (mut s, r, p, b, _) = fixture();
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::default();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::MetalMine, 5);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::SolarPlant, 5);
    let before = settle_production(&s, &s.bodies[&b], 3_600_000, &r).unwrap();
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .vacation = VacationState::Active {
        entered_at: 3_600_000,
        policy_hash: r.hash.clone(),
    };
    let after = settle_production(&s, &s.bodies[&b], 7_200_000, &r).unwrap();
    assert_eq!(
        after.amounts.metal,
        before.amounts.metal + r.artifact.base_income[0] * i64::from(r.speed) * SCALE
    );
    for value in [false, true] {
        let old: VacationState = serde_json::from_value(serde_json::json!(value)).unwrap();
        assert_eq!(serde_json::to_value(old).unwrap(), serde_json::json!(value));
    }
}

#[test]
fn vacation_pauses_fusion_consumption_and_moons_and_preserves_operator_edits() {
    let (mut s, r, p, b, t) = holding::ready();
    missiles::edit(
        &mut s,
        &r,
        b,
        81000,
        serde_json::json!({"op":"set","buildings":{"FusionReactor":5,"MetalMine":10,"CrystalMine":10,"MetalStorage":5,"CrystalStorage":5},"research":{"EnergyTechnology":5},"resources":{"metal":0,"crystal":0,"deuterium":1000}}),
    );
    assert!(body_economy(&s, &s.bodies[&b], &r).unwrap().fuel > 0);
    let enter = run(&mut s, &r, p, b, 1000, 81001, action(true));
    apply(&mut s, enter);
    let before = s.bodies[&b].checkpoint.clone();
    let after = settle_production(&s, &s.bodies[&b], 3_601_000, &r).unwrap();
    assert_eq!(after.amounts.deuterium, before.amounts.deuterium);
    assert_eq!(body_economy(&s, &s.bodies[&b], &r).unwrap().fuel, 0);
    let mut moon = s.bodies[&b].clone();
    moon.kind = BodyKind::Moon;
    assert_eq!(
        settle_production(&s, &moon, 3_601_000, &r).unwrap().amounts,
        before.amounts
    );
    assert_eq!(
        body_economy(&s, &moon, &r).unwrap().gross,
        Resources::default()
    );
    // A combined operator edit must not lose explicit new stock while settling the mode boundary.
    let edit:world_edit::WorldEdit=serde_json::from_value(serde_json::json!({"op":"set","planet":world_edit::coordinate_label(s.bodies[&t].coordinates),"resources":{"metal":42},"vacation":true})).unwrap();
    let owner = s.bodies[&t].owner;
    let input = common::input(&s, &r, Actor::Player(owner), 2000, 81002, action(true));
    let changes = world_edit::edit_world(&s, &r, &input, &edit, Some(owner)).unwrap();
    changes.apply_to(&mut s).unwrap();
    assert_eq!(s.bodies[&t].checkpoint.amounts.metal, 42 * SCALE);
    assert_eq!(
        s.world.as_ref().unwrap().records.policies[&owner]
            .vacation
            .entered_at(),
        Some(2000)
    );
}

#[test]
fn inbound_hold_keeps_prepaid_stay_but_a_current_hold_blocks_entry() {
    for enter_before_arrival in [false, true] {
        let (mut s, r, p, b, t) = holding::ready();
        let host = s.bodies[&t].owner;
        let mut intent = intent(&s, p, b, t);
        intent.mission = Mission::Hold;
        intent.hold_hours = Some(2);
        let event = launch_raid(&mut s, &r, p, b, intent, 1000, 82000);
        if enter_before_arrival {
            let result = run(&mut s, &r, host, t, 1001, 82001, action(true));
            apply(&mut s, result);
        }
        let result = run(&mut s, &r, p, b, event.at, 82002, Input::Event(event.event));
        let arrival = apply(&mut s, result);
        let fleet = s
            .world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .next()
            .unwrap();
        assert_eq!(fleet.leg, MissionLeg::Holding);
        assert_eq!(fleet.due_at, event.at + 2 * HOLD_HOUR_MS);
        if !enter_before_arrival {
            assert!(
                vacation_view(&s, host)
                    .unwrap()
                    .blockers
                    .iter()
                    .any(|b| b.kind == VacationBlockerKind::HostedFleet)
            );
            let result = run(&mut s, &r, host, t, event.at + 1, 82003, action(true));
            assert_eq!(
                result,
                TransitionResult::Rejected(GameError::VacationBlocked)
            );
        }
        let due = arrival
            .events
            .iter()
            .find(|e| {
                matches!(
                    e.event,
                    ScheduledEvent::FleetLegDue {
                        expected_leg: MissionLeg::Holding,
                        ..
                    }
                )
            })
            .unwrap();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            due.at,
            82004,
            Input::Event(due.event.clone()),
        );
        apply(&mut s, result);
        assert_eq!(
            s.world
                .as_ref()
                .unwrap()
                .records
                .fleets
                .values()
                .next()
                .unwrap()
                .leg,
            MissionLeg::Returning
        );
    }
}

#[test]
fn owned_missile_blocks_entry_and_preexisting_attack_still_resolves() {
    let (mut s, r, p, b, t) = missiles::ready();
    let missile_intent = MissileIntent {
        origin: b,
        target: MissileTarget {
            id: t,
            expected_kind: BodyKind::Planet,
            expected_owner: s.bodies[&t].owner,
        },
        count: 1,
        primary: None,
    };
    let q = quote_missiles(&s, p, &missile_intent, 1000, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        83000,
        Input::Command(Command::World {
            action: WorldAction::LaunchMissiles {
                intent: missile_intent,
                expected_terms_hash: q.terms_hash.clone(),
            },
        }),
    );
    apply(&mut s, result);
    assert!(
        vacation_view(&s, p)
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.kind == VacationBlockerKind::Missile)
    );
    let (mut s, r, p, b, t) = raid_fixture();
    let defender = s.bodies[&t].owner;
    let mut intent = intent(&s, p, b, t);
    intent.mission = Mission::Attack;
    let due = launch_raid(&mut s, &r, p, b, intent, 1000, 83001);
    let result = run(&mut s, &r, defender, t, 1001, 83002, action(true));
    apply(&mut s, result);
    let result = run(&mut s, &r, p, b, due.at, 83003, Input::Event(due.event));
    apply(&mut s, result);
    assert!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .reports
            .values()
            .any(|r| r.kind == "Combat")
    );
}

#[test]
fn all_work_categories_and_paid_future_batches_block_entry() {
    for kind in [
        VacationBlockerKind::Construction,
        VacationBlockerKind::Research,
        VacationBlockerKind::Manufacturing,
    ] {
        let (mut s, r, p, b, _) = missiles::ready();
        missiles::edit(
            &mut s,
            &r,
            b,
            84000,
            serde_json::json!({"op":"set","buildings":{"ResearchLab":2,"Shipyard":2}}),
        );
        let request = match kind {
            VacationBlockerKind::Construction => QuoteRequest::Upgrade {
                body: b,
                building: Building::MetalMine,
            },
            VacationBlockerKind::Research => QuoteRequest::Research {
                host: b,
                research: ResearchId::EnergyTechnology,
            },
            _ => QuoteRequest::Manufacture {
                body: b,
                item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
                quantity: 2,
            },
        };
        let batches = if kind == VacationBlockerKind::Manufacturing {
            2
        } else {
            1
        };
        for index in 0..batches {
            let n = 84001 + index;
            for category in ["construction:0", "research:0", "manufacturing:0"] {
                let id = OperationId(derived_id(InputId(Uuid::from_u128(n)), category));
                s.coverage.operations.insert(id);
                s.coverage.research_operation_ids.insert(id);
                s.coverage.manufacturing_operation_ids.insert(id);
            }
            let quote = inspect_progression(&s, Actor::Player(p), &request, 1000, &r).unwrap();
            assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
            let hash = quote.terms_hash.unwrap();
            let command = match &request {
                QuoteRequest::Upgrade { body, building } => Command::StartUpgrade {
                    body: *body,
                    building: *building,
                    expected_terms_hash: hash,
                },
                QuoteRequest::Research { host, research } => Command::StartResearch {
                    host: *host,
                    research: *research,
                    expected_terms_hash: hash,
                },
                QuoteRequest::Manufacture {
                    body,
                    item,
                    quantity,
                } => Command::StartManufacture {
                    body: *body,
                    item: *item,
                    quantity: *quantity,
                    expected_terms_hash: hash,
                },
                _ => unreachable!(),
            };
            let result = run(&mut s, &r, p, b, 1000, n, Input::Command(command));
            apply(&mut s, result);
        }
        assert!(
            vacation_view(&s, p)
                .unwrap()
                .blockers
                .iter()
                .any(|b| b.kind == kind)
        );
        let result = run(&mut s, &r, p, b, 1001, 84010, action(true));
        assert_eq!(
            result,
            TransitionResult::Rejected(GameError::VacationBlocked)
        );
        if kind == VacationBlockerKind::Manufacturing {
            assert!(
                s.manufacturing_batches
                    .values()
                    .any(|b| b.first_start_at > 1000)
            );
        }
    }
}

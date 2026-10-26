use orbit_engine::*;
#[test]
fn protocol_three_settings_are_typed_complete_commands() {
    let complete = serde_json::json!({"type":"SetProduction","body":"00000000-0000-0000-0000-000000000001","settings":{"metal_mine":100,"crystal_mine":100,"deuterium_synthesizer":100,"solar_plant":50,"fusion_reactor":100,"solar_satellite":100},"expected_settings_revision":"0"});
    assert!(serde_json::from_value::<Command>(complete.clone()).is_ok());
    let mut missing = complete;
    missing["settings"]
        .as_object_mut()
        .unwrap()
        .remove("fusion_reactor");
    assert!(serde_json::from_value::<Command>(missing).is_err());
}
mod common;
fn fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, _, p, b) = common::fixture();
    let r = Ruleset::mvp_progression().unwrap();
    s.profile_hash = r.hash.clone();
    let body = s.bodies.get_mut(&b).unwrap();
    body.retained_capacity = None;
    body.levels = Building::MVP.into_iter().map(|k| (k, 0)).collect();
    body.checkpoint.amounts = Resources::from_values([500 * SCALE, 500 * SCALE, 0]);
    s.research.get_mut(&p).unwrap().levels = ResearchId::MVP.into_iter().map(|k| (k, 0)).collect();
    s.production_settings.insert(
        b,
        ProductionSettingsRecord {
            body: b,
            settings: ProductionSettings::default(),
            revision: 0,
        },
    );
    s.coverage.production_bodies.insert(b);
    s.coverage.manufacturing_bodies.insert(b);
    s.coverage.research_slot_players.insert(p);
    s.coverage.owned_body_players.insert(p);
    s.coverage.lab_construction_players.insert(p);
    for k in ["production", "constructions", "manufacturing"] {
        s.collection_revisions.insert(format!("{k}:{b}"), 0);
    }
    for k in [
        "research",
        "research-operations",
        "owned-bodies",
        "lab-constructions",
    ] {
        s.collection_revisions.insert(format!("{k}:{p}"), 0);
    }
    s.collection_revisions
        .insert(format!("inventory:{b}:{p}"), 0);
    (s, r, p, b)
}
fn run(
    s: &mut GameState,
    r: &Ruleset,
    actor: Actor,
    at: i64,
    n: u128,
    payload: Input,
) -> ChangeSet {
    let mut i = common::input(s, r, actor, at, n, payload);
    i.protocol = 3;
    i.schema_version = 3;
    for category in ["construction:0", "research:0", "manufacturing:0"] {
        let id = OperationId(derived_id(i.id, category));
        s.coverage.operations.insert(id);
        s.coverage.research_operation_ids.insert(id);
        s.coverage.manufacturing_operation_ids.insert(id);
    }
    let result = transition(s, &i, r);
    common::applied(s, result)
}
#[test]
fn settings_settle_old_rates_noop_and_missing_coverage_fail_closed() {
    let (mut s, r, p, b) = fixture();
    let body = s.bodies.get_mut(&b).unwrap();
    for k in [
        Building::MetalMine,
        Building::CrystalMine,
        Building::SolarPlant,
    ] {
        body.levels.insert(k, 1);
    }
    body.checkpoint.amounts = Resources::all(0);
    let settings = ProductionSettings {
        solar_plant: 50,
        ..ProductionSettings::default()
    };
    run(
        &mut s,
        &r,
        Actor::Player(p),
        1_800_000,
        10,
        Input::Command(Command::SetProduction {
            body: b,
            settings: settings.clone(),
            expected_settings_revision: 0,
        }),
    );
    let whole = settle_production(&s, &s.bodies[&b], 3_600_000, &r).unwrap();
    assert_eq!(
        whole.amounts,
        Resources::from_values([547_500_000, 315_000_000, 0])
    );
    let mut split = s.clone();
    for t in [1_800_001, 1_900_000, 2_123_456, 3_600_000] {
        let cp = settle_production(&split, &split.bodies[&b], t, &r).unwrap();
        split.bodies.get_mut(&b).unwrap().checkpoint = cp;
    }
    assert_eq!(whole, split.bodies[&b].checkpoint);
    let c = run(
        &mut s,
        &r,
        Actor::Player(p),
        3_600_000,
        11,
        Input::Command(Command::SetProduction {
            body: b,
            settings: settings.clone(),
            expected_settings_revision: 1,
        }),
    );
    assert!(c.affected_viewers.is_empty());
    assert!(c.production_settings.is_empty());
    let mut input = common::input(
        &s,
        &r,
        Actor::Player(p),
        3_600_001,
        12,
        Input::Command(Command::SetProduction {
            body: b,
            settings,
            expected_settings_revision: 0,
        }),
    );
    input.protocol = 3;
    input.schema_version = 3;
    assert_eq!(
        transition(&s, &input, &r),
        TransitionResult::Rejected(GameError::SettingsChanged)
    );
    s.coverage.production_bodies.clear();
    assert!(matches!(
        transition(&s, &input, &r),
        TransitionResult::InvalidState(_)
    ));
}
#[test]
fn starter_can_reach_every_selected_unit_without_grants() {
    starter_journey(false);
    starter_journey(true);
}
fn starter_journey(lasers: bool) {
    let (mut s, mut r, p, b) = fixture();
    if lasers {
        r = common::light_laser_rules(&r);
        s.profile_hash = r.hash.clone();
        s.research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::LaserTechnology, 0);
    }
    let mut at = 0;
    let mut n = 100u128;
    fn purchase(
        s: &mut GameState,
        r: &Ruleset,
        p: PlayerId,
        b: BodyId,
        q: QuoteRequest,
        at: &mut i64,
        n: &mut u128,
    ) {
        loop {
            let inspect = inspect_progression(s, Actor::Player(p), &q, *at, r).unwrap();
            let t = inspect.terms.as_ref().unwrap();
            let cost = t.paid();
            let caps = body_storage_capacity(&s.bodies[&b], r).unwrap();
            let storage = [
                Building::MetalStorage,
                Building::CrystalStorage,
                Building::DeuteriumTank,
            ];
            if let Some(idx) = (0..3).find(|i| cost.values()[*i] > caps.values()[*i]) {
                purchase(
                    s,
                    r,
                    p,
                    b,
                    QuoteRequest::Upgrade {
                        body: b,
                        building: storage[idx],
                    },
                    at,
                    n,
                );
                continue;
            }
            if inspect
                .blockers
                .iter()
                .any(|x| x.code == GameError::InsufficientResources)
            {
                let cp = settle_production(s, &s.bodies[&b], *at, r).unwrap();
                let rate = production_rates_with_settings(
                    &s.bodies[&b],
                    &s.production_settings[&b].settings,
                    0,
                    r,
                )
                .unwrap();
                let mut wait = 0;
                for i in 0..3 {
                    let short = cost.values()[i] - cp.amounts.values()[i];
                    if short > 0 {
                        assert!(rate.values()[i] > 0, "no production for {q:?}");
                        wait = wait.max(
                            ((i128::from(short) * 3_600_000 + i128::from(rate.values()[i]) - 1)
                                / i128::from(rate.values()[i])) as i64
                                + 1,
                        )
                    }
                }
                *at += wait;
                continue;
            }
            assert!(inspect.blockers.is_empty(), "{q:?}: {:?}", inspect.blockers);
            let h = inspect.terms_hash.unwrap();
            let cmd = match q.clone() {
                QuoteRequest::Upgrade { body, building } => Command::StartUpgrade {
                    body,
                    building,
                    expected_terms_hash: h,
                },
                QuoteRequest::Research { host, research } => Command::StartResearch {
                    host,
                    research,
                    expected_terms_hash: h,
                },
                QuoteRequest::Manufacture {
                    body,
                    item,
                    quantity,
                } => Command::StartManufacture {
                    body,
                    item,
                    quantity,
                    expected_terms_hash: h,
                },
                _ => unreachable!(),
            };
            *n += 1;
            let mut c = run(s, r, Actor::Player(p), *at, *n, Input::Command(cmd));
            while let Some(e) = c.events.pop() {
                *at = e.at;
                *n += 1;
                c = run(s, r, Actor::Scheduler, *at, *n, Input::Event(e.event));
            }
            break;
        }
    }
    for (k, target) in [
        (Building::SolarPlant, 1),
        (Building::MetalMine, 1),
        (Building::CrystalMine, 1),
        (Building::DeuteriumSynthesizer, 1),
        (Building::SolarPlant, 8),
        (Building::MetalMine, 8),
        (Building::CrystalMine, 7),
        (Building::DeuteriumSynthesizer, 6),
        (Building::SolarPlant, 14),
        (Building::MetalMine, 12),
        (Building::CrystalMine, 10),
        (Building::DeuteriumSynthesizer, 8),
        (Building::RoboticsFactory, 2),
        (Building::ResearchLab, 6),
        (Building::Shipyard, 4),
    ] {
        while s.bodies[&b].levels[&k] < target {
            purchase(
                &mut s,
                &r,
                p,
                b,
                QuoteRequest::Upgrade {
                    body: b,
                    building: k,
                },
                &mut at,
                &mut n,
            )
        }
    }
    for (k, target) in [
        (ResearchId::EnergyTechnology, 3),
        (ResearchId::CombustionDrive, 6),
        (ResearchId::ShieldingTechnology, 2),
        (ResearchId::EspionageTechnology, 2),
        (ResearchId::ComputerTechnology, 1),
        (ResearchId::WeaponsTechnology, 1),
        (ResearchId::ArmourTechnology, 1),
        (ResearchId::LaserTechnology, if lasers { 3 } else { 0 }),
    ] {
        while target > 0 && s.research[&p].levels[&k] < target {
            purchase(
                &mut s,
                &r,
                p,
                b,
                QuoteRequest::Research {
                    host: b,
                    research: k,
                },
                &mut at,
                &mut n,
            )
        }
    }
    for item in [
        ManufacturedItem::Ship(ShipType::SmallCargo),
        ManufacturedItem::Ship(ShipType::LightFighter),
        ManufacturedItem::Ship(ShipType::Recycler),
        ManufacturedItem::Ship(ShipType::EspionageProbe),
        ManufacturedItem::Defense(DefenseId::RocketLauncher),
        ManufacturedItem::Defense(DefenseId::SmallShieldDome),
        ManufacturedItem::Defense(DefenseId::LightLaser),
    ] {
        if item == ManufacturedItem::Defense(DefenseId::LightLaser) && !lasers {
            continue;
        }
        purchase(
            &mut s,
            &r,
            p,
            b,
            QuoteRequest::Manufacture {
                body: b,
                item,
                quantity: 1,
            },
            &mut at,
            &mut n,
        );
        assert_eq!(
            s.inventories.iter().find(|x| x.item == item).unwrap().count,
            1
        )
    }
    assert_eq!(s.inventories.len(), if lasers { 7 } else { 6 });
    assert_eq!(s.research[&p].levels[&ResearchId::CombustionDrive], 6);
    assert!(
        inspect_progression(
            &s,
            Actor::Player(p),
            &QuoteRequest::Manufacture {
                body: b,
                item: ManufacturedItem::Defense(DefenseId::SmallShieldDome),
                quantity: 1
            },
            at,
            &r
        )
        .unwrap()
        .blockers
        .iter()
        .any(|x| x.code == GameError::CapacityReserved)
    );
    let restored: GameState = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    assert_eq!(s, restored);
}

fn prepared() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, r, p, b) = fixture();
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(1_000_000 * SCALE);
    for (k, n) in [
        (Building::RoboticsFactory, 2),
        (Building::Shipyard, 4),
        (Building::ResearchLab, 6),
    ] {
        s.bodies.get_mut(&b).unwrap().levels.insert(k, n);
    }
    for (k, n) in [
        (ResearchId::EnergyTechnology, 3),
        (ResearchId::CombustionDrive, 6),
        (ResearchId::ShieldingTechnology, 2),
        (ResearchId::EspionageTechnology, 2),
    ] {
        s.research.get_mut(&p).unwrap().levels.insert(k, n);
    }
    (s, r, p, b)
}
fn command(s: &GameState, r: &Ruleset, p: PlayerId, at: i64, q: QuoteRequest) -> Command {
    let x = inspect_progression(s, Actor::Player(p), &q, at, r).unwrap();
    assert!(x.blockers.is_empty(), "{:?}", x.blockers);
    let expected_terms_hash = x.terms_hash.unwrap();
    match q {
        QuoteRequest::Upgrade { body, building } => Command::StartUpgrade {
            body,
            building,
            expected_terms_hash,
        },
        QuoteRequest::Demolition { body, building } => Command::StartDemolition {
            body,
            building,
            expected_terms_hash,
        },
        QuoteRequest::Research { host, research } => Command::StartResearch {
            host,
            research,
            expected_terms_hash,
        },
        QuoteRequest::Manufacture {
            body,
            item,
            quantity,
        } => Command::StartManufacture {
            body,
            item,
            quantity,
            expected_terms_hash,
        },
        _ => unreachable!(),
    }
}
fn blocked(s: &GameState, r: &Ruleset, p: PlayerId, at: i64, q: QuoteRequest, code: GameError) {
    assert!(
        inspect_progression(s, Actor::Player(p), &q, at, r)
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.code == code),
        "missing {code:?}"
    );
}
#[test]
fn cancellation_refunds_stored_payment_releases_fields_and_cannot_resurrect() {
    let (mut s, r, p, b) = prepared();
    let before = s.bodies[&b].checkpoint.amounts;
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
    );
    let c = run(&mut s, &r, Actor::Player(p), 0, 100, Input::Command(cmd));
    let op = c.constructions[0].clone();
    assert_eq!(s.bodies[&b].levels[&Building::MetalMine], 0);
    assert_eq!(reserved_fields(&s, b).unwrap(), 1);
    run(
        &mut s,
        &r,
        Actor::Player(p),
        op.due_at - 1,
        101,
        Input::Command(Command::CancelConstruction { operation: op.id }),
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts, before); // over-cap income suppressed, refund preserved
    assert_eq!(reserved_fields(&s, b).unwrap(), 0);
    let c = run(
        &mut s,
        &r,
        Actor::Scheduler,
        op.due_at,
        102,
        Input::Event(c.events[0].event.clone()),
    );
    assert!(c.bodies.is_empty());
    assert_eq!(s.bodies[&b].levels[&Building::MetalMine], 0);
    let cmd = command(
        &s,
        &r,
        p,
        op.due_at,
        QuoteRequest::Research {
            host: b,
            research: ResearchId::ComputerTechnology,
        },
    );
    let c = run(
        &mut s,
        &r,
        Actor::Player(p),
        op.due_at,
        103,
        Input::Command(cmd),
    );
    let op = c.research_operations[0].clone();
    run(
        &mut s,
        &r,
        Actor::Player(p),
        op.commitment.due_at - 1,
        104,
        Input::Command(Command::CancelResearch { operation: op.id }),
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts, before);
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        op.commitment.due_at,
        105,
        Input::Event(c.events[0].event.clone()),
    );
    assert_eq!(s.research[&p].levels[&ResearchId::ComputerTechnology], 0);
}
#[test]
fn locks_are_bidirectional_and_other_work_is_concurrent() {
    let (mut s, r, p, b) = prepared();
    let q = QuoteRequest::Research {
        host: b,
        research: ResearchId::ComputerTechnology,
    };
    let cmd = command(&s, &r, p, 0, q.clone());
    run(&mut s, &r, Actor::Player(p), 0, 100, Input::Command(cmd));
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::ResearchLab,
        },
        GameError::LabLocked,
    );
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Demolition {
            body: b,
            building: Building::ResearchLab,
        },
        GameError::LabLocked,
    );
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
    );
    run(&mut s, &r, Actor::Player(p), 0, 101, Input::Command(cmd));
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Ship(ShipType::SmallCargo),
            quantity: 2,
        },
    );
    run(&mut s, &r, Actor::Player(p), 0, 102, Input::Command(cmd));
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::Shipyard,
        },
        GameError::YardLocked,
    );
    let (mut s, r, p, b) = prepared();
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::ResearchLab,
        },
    );
    run(&mut s, &r, Actor::Player(p), 0, 200, Input::Command(cmd));
    blocked(&s, &r, p, 0, q, GameError::LabLocked);
    let (mut s, r, p, b) = prepared();
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Demolition {
            body: b,
            building: Building::Shipyard,
        },
    );
    run(&mut s, &r, Actor::Player(p), 0, 200, Input::Command(cmd));
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
            quantity: 1,
        },
        GameError::YardLocked,
    );
}
#[test]
fn prepaid_fifo_prefixes_interleaving_and_dome_reservations_are_exact() {
    let (mut s, r, p, b) = prepared();
    let before = s.bodies[&b].checkpoint.amounts;
    let item = ManufacturedItem::Defense(DefenseId::RocketLauncher);
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item,
            quantity: 3,
        },
    );
    let first = run(&mut s, &r, Actor::Player(p), 0, 100, Input::Command(cmd));
    let a = first.manufacturing_batches[0].clone();
    assert_eq!(a.unit_duration_ms, 57_000);
    assert_eq!(a.final_due_at, 171_000);
    assert_eq!(
        before.metal - s.bodies[&b].checkpoint.amounts.metal,
        6000 * SCALE
    );
    assert_eq!(first.events.len(), 1);
    let cmd = command(
        &s,
        &r,
        p,
        1000,
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Defense(DefenseId::SmallShieldDome),
            quantity: 1,
        },
    );
    let second = run(&mut s, &r, Actor::Player(p), 1000, 101, Input::Command(cmd));
    let z = second.manufacturing_batches[0].clone();
    assert_eq!(z.first_start_at, a.final_due_at);
    assert_eq!(z.commitment.accepted_at, 1000);
    blocked(
        &s,
        &r,
        p,
        1000,
        QuoteRequest::Manufacture {
            body: b,
            item: z.item,
            quantity: 1,
        },
        GameError::CapacityReserved,
    );
    let next = run(
        &mut s,
        &r,
        Actor::Scheduler,
        a.next_due_at,
        102,
        Input::Event(first.events[0].event.clone()),
    );
    assert_eq!(s.inventories[0].count, 1);
    let saved: GameState = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    s = saved;
    let stale = run(
        &mut s,
        &r,
        Actor::Scheduler,
        a.next_due_at,
        103,
        Input::Event(first.events[0].event.clone()),
    );
    assert!(stale.inventories.is_empty());
    run(
        &mut s,
        &r,
        Actor::Player(p),
        a.next_due_at + 1,
        104,
        Input::Command(Command::SetProduction {
            body: b,
            settings: ProductionSettings {
                metal_mine: 0,
                ..Default::default()
            },
            expected_settings_revision: 0,
        }),
    );
    let third = run(
        &mut s,
        &r,
        Actor::Scheduler,
        next.events[0].at,
        105,
        Input::Event(next.events[0].event.clone()),
    );
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        third.events[0].at,
        106,
        Input::Event(third.events[0].event.clone()),
    );
    assert_eq!(s.inventories[0].count, 3);
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        second.events[0].at,
        107,
        Input::Event(second.events[0].event.clone()),
    );
    assert_eq!(
        s.manufacturing_batches[&z.id].status,
        ManufacturingStatus::Completed
    );
    blocked(
        &s,
        &r,
        p,
        z.final_due_at,
        QuoteRequest::Manufacture {
            body: b,
            item: z.item,
            quantity: 1,
        },
        GameError::CapacityReserved,
    );
}
#[test]
fn disabled_known_categories_numeric_bounds_and_field_limit_reject_before_mutation() {
    let (mut s, r, p, b) = prepared();
    for q in [
        QuoteRequest::Upgrade {
            body: b,
            building: Building::FusionReactor,
        },
        QuoteRequest::Research {
            host: b,
            research: ResearchId::ImpulseDrive,
        },
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Ship(ShipType::SolarSatellite),
            quantity: 1,
        },
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Missile(MissileId::AntiBallisticMissile),
            quantity: 1,
        },
    ] {
        blocked(&s, &r, p, 0, q, GameError::UnavailableContent);
    }
    for (n, error) in [
        (0, GameError::InvalidInput),
        (i64::MAX, GameError::NumericRange),
    ] {
        blocked(
            &s,
            &r,
            p,
            0,
            QuoteRequest::Manufacture {
                body: b,
                item: ManufacturedItem::Ship(ShipType::SmallCargo),
                quantity: n,
            },
            error,
        );
    }
    s.bodies.get_mut(&b).unwrap().fields = 12;
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
        GameError::NoFreeField,
    );
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .remove(&ResearchId::EnergyTechnology);
    assert!(
        inspect_progression(
            &s,
            Actor::Player(p),
            &QuoteRequest::Upgrade {
                body: b,
                building: Building::MetalMine
            },
            0,
            &r
        )
        .is_err()
    );
}

#[test]
fn full_queue_is_bounded_and_rejected_without_payment() {
    let (mut s, r, p, b) = prepared();
    let item = ManufacturedItem::Defense(DefenseId::RocketLauncher);
    let request = QuoteRequest::Manufacture {
        body: b,
        item,
        quantity: 1,
    };
    let first = command(&s, &r, p, 0, request.clone());
    let started = run(
        &mut s,
        &r,
        Actor::Player(p),
        0,
        1000,
        Input::Command(first.clone()),
    );
    let template = started.manufacturing_batches[0].clone();
    let mut predecessor = template.id;
    // Prepare paid queue facts; exercise the actual admission boundary instead
    // of spending the server-test budget grinding 254 equivalent appends.
    for n in 1..254 {
        let mut batch = template.clone();
        batch.id = OperationId(derived_id(
            InputId(uuid::Uuid::from_u128(1000 + n)),
            "manufacturing:0",
        ));
        batch.queue_sequence += n as i64;
        batch.predecessor = Some(predecessor);
        batch.first_start_at += n as i64 * batch.unit_duration_ms;
        batch.final_due_at = batch.first_start_at + batch.unit_duration_ms;
        batch.next_due_at = batch.final_due_at;
        predecessor = batch.id;
        s.coverage.operations.insert(batch.id);
        s.coverage.manufacturing_operation_ids.insert(batch.id);
        s.manufacturing_batches.insert(batch.id, batch);
    }
    let balance = &mut s.bodies.get_mut(&b).unwrap().checkpoint.amounts;
    balance.metal -= 253 * template.commitment.paid.metal;
    balance.crystal -= 253 * template.commitment.paid.crystal;
    balance.deuterium -= 253 * template.commitment.paid.deuterium;
    for n in 254..256 {
        let cmd = command(&s, &r, p, 0, request.clone());
        let c = run(
            &mut s,
            &r,
            Actor::Player(p),
            0,
            1000 + n,
            Input::Command(cmd),
        );
        assert_eq!(c.events.len(), 1);
        assert_eq!(c.manufacturing_batches[0].predecessor, Some(predecessor));
        predecessor = c.manufacturing_batches[0].id;
    }
    blocked(&s, &r, p, 0, request, GameError::QueueCapacity);
    let mut rejected = common::input(&s, &r, Actor::Player(p), 0, 1256, Input::Command(first));
    rejected.protocol = 3;
    rejected.schema_version = 3;
    let before = s.clone();
    assert_eq!(
        transition(&s, &rejected, &r),
        TransitionResult::Rejected(GameError::QueueCapacity)
    );
    assert_eq!(s, before);
    assert_eq!(s.manufacturing_batches.len(), 256);
}
#[test]
fn saturated_storage_discards_income_and_carry_and_demolition_preserves_over_cap() {
    let (mut s, r, p, b) = prepared();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::MetalStorage, 1);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(10_000 * SCALE);
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Demolition {
            body: b,
            building: Building::MetalStorage,
        },
    );
    let c = run(&mut s, &r, Actor::Player(p), 0, 1100, Input::Command(cmd));
    assert_eq!(s.bodies[&b].levels[&Building::MetalStorage], 1);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts.metal = 20_000 * SCALE; // external credit fixture
    let event = &c.events[0];
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        event.at,
        1101,
        Input::Event(event.event.clone()),
    );
    assert_eq!(
        body_storage_capacity(&s.bodies[&b], &r).unwrap().metal,
        10_000 * SCALE
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts.metal, 20_000 * SCALE);
    let cp = settle_production(&s, &s.bodies[&b], event.at + 86_400_000, &r).unwrap();
    assert_eq!(cp.amounts.metal, 20_000 * SCALE);
    assert_eq!(cp.carry.metal, 0);
    s.bodies.get_mut(&b).unwrap().checkpoint = cp;
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts.metal = 9999 * SCALE;
    let cp = settle_production(&s, &s.bodies[&b], event.at + 86_400_001, &r).unwrap();
    assert!(cp.amounts.metal < 10_000 * SCALE); // suppressed day did not become banked income
    let settings = ProductionSettings {
        fusion_reactor: 0,
        ..Default::default()
    };
    let mut i = common::input(
        &s,
        &r,
        Actor::Player(p),
        cp.at,
        1102,
        Input::Command(Command::SetProduction {
            body: b,
            settings,
            expected_settings_revision: 0,
        }),
    );
    i.protocol = 3;
    i.schema_version = 3;
    assert_eq!(
        transition(&s, &i, &r),
        TransitionResult::Rejected(GameError::UnavailableContent)
    );
}

#[test]
fn future_inventory_deadlines_and_epoch_protocol_bounds_fail_closed() {
    let (mut s, r, p, b) = prepared();
    let item = ManufacturedItem::Defense(DefenseId::RocketLauncher);
    s.inventories.push(InventoryStack {
        body: b,
        owner: p,
        item,
        count: i64::MAX - 1,
        revision: 0,
    });
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item,
            quantity: 2,
        },
        GameError::NumericRange,
    );
    blocked(
        &s,
        &r,
        p,
        MAX_WIRE_MS,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
        GameError::NumericRange,
    );
    let mut i = common::input(
        &s,
        &r,
        Actor::Player(p),
        0,
        2000,
        Input::Command(Command::SetProduction {
            body: b,
            settings: ProductionSettings::default(),
            expected_settings_revision: 0,
        }),
    );
    i.protocol = 2;
    i.schema_version = 2;
    assert!(matches!(
        transition(&s, &i, &r),
        TransitionResult::InvalidState(_)
    ));
    i.protocol = 3;
    i.schema_version = 3;
    i.epoch = Epoch::default();
    assert!(matches!(
        transition(&s, &i, &r),
        TransitionResult::InvalidState(_)
    ));
    i.epoch = s.epoch;
    s.collection_revisions.remove(&format!("manufacturing:{b}"));
    assert!(matches!(
        transition(&s, &i, &r),
        TransitionResult::InvalidState(_)
    ));
}

#[test]
fn storage_completion_settles_old_capacity_before_enabling_new_capacity() {
    for building in [
        Building::MetalStorage,
        Building::CrystalStorage,
        Building::DeuteriumTank,
    ] {
        let (mut s, r, p, b) = prepared();
        let cmd = command(&s, &r, p, 0, QuoteRequest::Upgrade { body: b, building });
        let c = run(&mut s, &r, Actor::Player(p), 0, 1200, Input::Command(cmd));
        let event = &c.events[0];
        // A final millisecond fills metal/crystal under the old limit. Excess
        // production and carry cannot be banked into the newly completed storage.
        let body = s.bodies.get_mut(&b).unwrap();
        body.checkpoint.at = event.at - 1;
        body.checkpoint.amounts = Resources::all(10000 * SCALE - 1);
        body.checkpoint.carry = Resources::all(3_599_999);
        let before = settle_production(&s, &s.bodies[&b], event.at, &r).unwrap();
        let cap_before = body_storage_capacity(&s.bodies[&b], &r).unwrap();
        assert_eq!(cap_before, Resources::all(10000 * SCALE));
        run(
            &mut s,
            &r,
            Actor::Scheduler,
            event.at,
            1201,
            Input::Event(event.event.clone()),
        );
        assert_eq!(s.bodies[&b].checkpoint, before);
        assert_eq!(s.bodies[&b].checkpoint.amounts.metal, 10000 * SCALE);
        assert_eq!(s.bodies[&b].checkpoint.carry.metal, 0);
        assert_eq!(s.bodies[&b].levels[&building], 1);
        assert!(s.bodies[&b].retained_capacity.is_none());
        assert!(
            serde_json::to_value(&s.bodies[&b])
                .unwrap()
                .get("capacity")
                .is_none()
        );
        if building == Building::MetalStorage {
            let whole = settle_production(&s, &s.bodies[&b], event.at + 1001, &r).unwrap();
            let split = settle_production(&s, &s.bodies[&b], event.at + 1, &r).unwrap();
            assert!(split.amounts.metal > 10000 * SCALE);
            assert!(split.carry.metal > 0);
            s.bodies.get_mut(&b).unwrap().checkpoint = split;
            assert_eq!(
                settle_production(&s, &s.bodies[&b], event.at + 1001, &r).unwrap(),
                whole
            );
        }
    }
}

#[test]
fn legacy_reservation_journal_retains_hashes_and_applies() {
    // Captured from main before removing current reservation persistence.
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "fixtures/legacy_progression_reservations.json"
    ))
    .unwrap();
    let mut facts: GameState = serde_json::from_value(fixture["facts"].clone()).unwrap();
    let change: ChangeSet = serde_json::from_value(fixture["change"].clone()).unwrap();
    assert_eq!(serde_json::to_value(&facts).unwrap(), fixture["facts"]);
    assert_eq!(serde_json::to_value(&change).unwrap(), fixture["change"]);
    assert_eq!(hash(&facts), change.expected_facts_hash);
    change.apply_to(&mut facts).unwrap();
    assert_eq!(
        serde_json::to_value(hash(&facts)).unwrap(),
        fixture["after_hash"]
    );
}

#[test]
fn progression_admission_needs_only_authoritative_operations() {
    let (mut s, r, p, b) = prepared();
    s.progression_reservations.clear();
    s.coverage.reservation_bodies.clear();
    s.collection_revisions
        .remove(&format!("progression-reservations:{b}"));
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
    );
    let change = run(&mut s, &r, Actor::Player(p), 0, 991, Input::Command(cmd));
    assert!(change.progression_reservations.is_empty());
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::CrystalMine,
        },
        GameError::ActiveConstruction,
    );
}

#[test]
fn fields_follow_upgrade_completion_and_demolition_without_a_second_record() {
    let (mut s, r, p, b) = prepared();
    let used: u32 = s.bodies[&b].levels.values().sum();
    s.bodies.get_mut(&b).unwrap().fields = used + 1;
    let q = QuoteRequest::Upgrade {
        body: b,
        building: Building::MetalMine,
    };
    let cmd = command(&s, &r, p, 0, q.clone());
    let start = run(&mut s, &r, Actor::Player(p), 0, 992, Input::Command(cmd));
    assert_eq!(reserved_fields(&s, b).unwrap(), 1);
    blocked(&s, &r, p, 0, q.clone(), GameError::NoFreeField);
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        start.events[0].at,
        993,
        Input::Event(start.events[0].event.clone()),
    );
    assert_eq!(reserved_fields(&s, b).unwrap(), 0);
    blocked(
        &s,
        &r,
        p,
        start.events[0].at,
        q.clone(),
        GameError::NoFreeField,
    );
    let cmd = command(
        &s,
        &r,
        p,
        start.events[0].at,
        QuoteRequest::Demolition {
            body: b,
            building: Building::MetalMine,
        },
    );
    let demolition = run(
        &mut s,
        &r,
        Actor::Player(p),
        start.events[0].at,
        994,
        Input::Command(cmd),
    );
    assert_eq!(reserved_fields(&s, b).unwrap(), 0);
    blocked(
        &s,
        &r,
        p,
        start.events[0].at,
        q.clone(),
        GameError::ActiveConstruction,
    );
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        demolition.events[0].at,
        995,
        Input::Event(demolition.events[0].event.clone()),
    );
    assert!(
        inspect_progression(&s, Actor::Player(p), &q, demolition.events[0].at, &r)
            .unwrap()
            .blockers
            .is_empty()
    );
}

#[test]
fn incomplete_operation_collections_cannot_claim_free_capacity() {
    let (s, r, p, b) = prepared();
    let q = QuoteRequest::Upgrade {
        body: b,
        building: Building::MetalMine,
    };
    for collection in ["constructions", "manufacturing"] {
        let mut missing = s.clone();
        if collection == "constructions" {
            missing.coverage.construction_bodies.remove(&b);
            assert!(reserved_fields(&missing, b).is_err());
        } else {
            missing.coverage.manufacturing_bodies.remove(&b);
        }
        assert!(inspect_progression(&missing, Actor::Player(p), &q, 0, &r).is_err());
        let mut missing = s.clone();
        missing
            .collection_revisions
            .remove(&format!("{collection}:{b}"));
        assert!(inspect_progression(&missing, Actor::Player(p), &q, 0, &r).is_err());
    }
}

#[test]
fn duplicate_active_operations_fail_closed_without_reservation_mirrors() {
    let (mut s, r, p, b) = prepared();
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
    );
    let started = run(&mut s, &r, Actor::Player(p), 0, 996, Input::Command(cmd));
    let mut duplicate = started.constructions[0].clone();
    duplicate.id = OperationId(uuid::Uuid::from_u128(997));
    s.constructions.insert(duplicate.id, duplicate);
    assert!(validate_progression_collections(&s, &s.bodies[&b]).is_err());

    let (mut s, r, p, b) = prepared();
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Defense(DefenseId::SmallShieldDome),
            quantity: 1,
        },
    );
    let started = run(&mut s, &r, Actor::Player(p), 0, 998, Input::Command(cmd));
    let mut duplicate = started.manufacturing_batches[0].clone();
    duplicate.id = OperationId(uuid::Uuid::from_u128(999));
    s.manufacturing_batches.insert(duplicate.id, duplicate);
    assert!(validate_progression_collections(&s, &s.bodies[&b]).is_err());
}

#[test]
fn pending_work_keeps_committed_terms_across_rules_activation() {
    for kind in 0..3 {
        let (mut s, old, p, b) = prepared();
        let request = match kind {
            0 => QuoteRequest::Upgrade {
                body: b,
                building: Building::MetalMine,
            },
            1 => QuoteRequest::Research {
                host: b,
                research: ResearchId::ComputerTechnology,
            },
            _ => QuoteRequest::Manufacture {
                body: b,
                item: ManufacturedItem::Ship(ShipType::LightFighter),
                quantity: 3,
            },
        };
        let cmd = command(&s, &old, p, 0, request);
        let started = run(&mut s, &old, Actor::Player(p), 0, 9000, Input::Command(cmd));
        let mut artifact = old.artifact.clone();
        artifact.base_income[0] += 5;
        artifact
            .buildings
            .get_mut(&Building::MetalMine)
            .unwrap()
            .base[0] *= 2;
        let current = Ruleset::from_artifact(artifact, old.speed).unwrap();
        s.profile_hash = current.hash.clone();
        let mut due = started.events[0].clone();
        for step in 0..if kind == 2 { 3 } else { 1 } {
            let mut input = common::input(
                &s,
                if step == 0 { &old } else { &current },
                Actor::Scheduler,
                due.at,
                9001 + step,
                Input::Event(due.event.clone()),
            );
            input.protocol = 3;
            input.schema_version = 3;
            let result = transition(&s, &input, &current);
            let change = common::applied(&mut s, result);
            if kind == 2 && step < 2 {
                due = change.events[0].clone();
            }
        }
        match kind {
            0 => {
                let op = &s.constructions[&started.constructions[0].id];
                assert_eq!(op.paid, started.constructions[0].paid);
                assert_eq!(op.due_at, started.constructions[0].due_at);
                assert_eq!(op.status, ConstructionStatus::Completed);
            }
            1 => {
                let op = &s.research_operations[&started.research_operations[0].id];
                assert_eq!(op.commitment, started.research_operations[0].commitment);
                assert_eq!(op.status, ResearchStatus::Completed);
            }
            _ => {
                let op = &s.manufacturing_batches[&started.manufacturing_batches[0].id];
                assert_eq!(op.commitment, started.manufacturing_batches[0].commitment);
                assert_eq!(
                    op.final_due_at,
                    started.manufacturing_batches[0].final_due_at
                );
                assert_eq!(op.completed_prefix, 3);
            }
        }
    }
}

#[test]
fn impulse_prerequisites_costs_duration_and_unbounded_progression() {
    let (mut s, old, p, b) = prepared();
    let r = common::impulse_rules(&old);
    s.profile_hash = r.hash.clone();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::ImpulseDrive, 0);
    let request = QuoteRequest::Research {
        host: b,
        research: ResearchId::ImpulseDrive,
    };
    // Each completed gate is necessary, independent of the other gate.
    for (lab, energy) in [(1, 1), (2, 0)] {
        s.bodies
            .get_mut(&b)
            .unwrap()
            .levels
            .insert(Building::ResearchLab, lab);
        s.research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::EnergyTechnology, energy);
        let options = inspect_progression(&s, Actor::Player(p), &request, 0, &r).unwrap();
        assert!(!options.blockers.is_empty());
        let before = s.clone();
        let input = common::input(
            &s,
            &r,
            Actor::Player(p),
            0,
            900,
            Input::Command(Command::StartResearch {
                host: b,
                research: ResearchId::ImpulseDrive,
                expected_terms_hash: options.terms_hash.unwrap(),
            }),
        );
        let mut input = input;
        input.protocol = 3;
        input.schema_version = 3;
        assert!(matches!(
            transition(&s, &input, &r),
            TransitionResult::Rejected(GameError::PrerequisiteMissing)
        ));
        assert_eq!(s.bodies, before.bodies);
        assert_eq!(s.research, before.research);
    }
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 2);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 1);
    let mut now = 0;
    // Reach the future colony prerequisite and keep going through the cargo switch.
    for target in 1..=6u32 {
        let options = inspect_progression(&s, Actor::Player(p), &request, now, &r).unwrap();
        assert!(options.blockers.is_empty());
        let material = options.terms.unwrap();
        let multiplier = 1i64 << (target - 1);
        assert_eq!(
            material.paid(),
            Resources::from_values([2000, 4000, 600].map(|v| v * multiplier * SCALE))
        );
        assert_eq!(material.duration(), 720_000 * multiplier); // Lab2, 10x
        let cmd = command(&s, &r, p, now, request.clone());
        let started = run(
            &mut s,
            &r,
            Actor::Player(p),
            now,
            1000 + u128::from(target) * 2,
            Input::Command(cmd),
        );
        assert_eq!(s.research[&p].levels[&ResearchId::ImpulseDrive], target - 1);
        now = started.events[0].at;
        run(
            &mut s,
            &r,
            Actor::Scheduler,
            now,
            1001 + u128::from(target) * 2,
            Input::Event(started.events[0].event.clone()),
        );
        assert_eq!(s.research[&p].levels[&ResearchId::ImpulseDrive], target);
    }
    // Exact floor before conversion to milliseconds, D and Robotics do not enter.
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::ImpulseDrive, 0);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 6);
    let r = Ruleset::from_artifact(r.artifact, 10).unwrap();
    assert_eq!(
        research_terms(&s.bodies[&b], &s.research[&p], ResearchId::ImpulseDrive, &r)
            .unwrap()
            .duration(),
        308_000
    );
    // Pure terms accept all supported speed factors with the same arithmetic.
    for (speed, expected) in [(1, 3_085_000), (5, 617_000), (100, 30_000)] {
        let r = common::impulse_rules(
            &Ruleset::signup_with_speed(UniverseProfile::signup(1, 100).unwrap(), speed).unwrap(),
        );
        assert_eq!(
            research_terms(&s.bodies[&b], &s.research[&p], ResearchId::ImpulseDrive, &r)
                .unwrap()
                .duration(),
            expected
        );
    }
}

fn astrophysics_prepared() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, r, p, b) = prepared();
    let r = common::astrophysics_rules(&r);
    s.profile_hash = r.hash.clone();
    let levels = &mut s.research.get_mut(&p).unwrap().levels;
    levels.insert(ResearchId::ImpulseDrive, 3);
    levels.insert(ResearchId::EspionageTechnology, 4);
    levels.insert(ResearchId::Astrophysics, 0);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 3);
    (s, r, p, b)
}

#[test]
fn astrophysics_requires_all_completed_gates_and_complete_facts() {
    let (s, r, p, b) = astrophysics_prepared();
    let request = QuoteRequest::Research {
        host: b,
        research: ResearchId::Astrophysics,
    };
    for (lab, espionage, impulse) in [(2, 4, 3), (3, 3, 3), (3, 4, 2)] {
        let mut s = s.clone();
        s.bodies
            .get_mut(&b)
            .unwrap()
            .levels
            .insert(Building::ResearchLab, lab);
        s.research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::EspionageTechnology, espionage);
        s.research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::ImpulseDrive, impulse);
        let options = inspect_progression(&s, Actor::Player(p), &request, 0, &r).unwrap();
        assert_eq!(options.blockers.len(), 1);
        assert_eq!(options.blockers[0].code, GameError::PrerequisiteMissing);
        let mut input = common::input(
            &s,
            &r,
            Actor::Player(p),
            0,
            9000,
            Input::Command(Command::StartResearch {
                host: b,
                research: ResearchId::Astrophysics,
                expected_terms_hash: options.terms_hash.unwrap(),
            }),
        );
        input.protocol = 3;
        input.schema_version = 3;
        assert_eq!(
            transition(&s, &input, &r),
            TransitionResult::Rejected(GameError::PrerequisiteMissing)
        );
    }
    assert!(
        inspect_progression(&s, Actor::Player(p), &request, 0, &r)
            .unwrap()
            .blockers
            .is_empty()
    );
    for missing in [ResearchId::Astrophysics, ResearchId::ImpulseDrive] {
        let mut s = s.clone();
        s.research.get_mut(&p).unwrap().levels.remove(&missing);
        assert!(inspect_progression(&s, Actor::Player(p), &request, 0, &r).is_err());
    }
}

#[test]
fn astrophysics_completion_and_refund_keep_committed_terms_across_rules_changes() {
    for cancel in [true, false] {
        let (mut s, r, p, b) = astrophysics_prepared();
        s.research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::Astrophysics, 4);
        let before = s.bodies[&b].checkpoint.amounts;
        let request = QuoteRequest::Research {
            host: b,
            research: ResearchId::Astrophysics,
        };
        let cmd = command(&s, &r, p, 0, request.clone());
        let started = run(&mut s, &r, Actor::Player(p), 0, 9100, Input::Command(cmd));
        let op = started.research_operations[0].clone();
        assert_eq!(
            op.commitment.paid,
            Resources::from_values([37500, 75000, 37500].map(|n| n * SCALE))
        );
        assert_eq!(op.commitment.due_at, 10_125_000); // Lab3 at 10x
        assert_eq!(
            astrophysics_colony_capacity(research_level(&s, p, ResearchId::Astrophysics).unwrap()),
            2
        );
        blocked(&s, &r, p, 0, request.clone(), GameError::ResearchActive);
        blocked(
            &s,
            &r,
            p,
            0,
            QuoteRequest::Upgrade {
                body: b,
                building: Building::ResearchLab,
            },
            GameError::LabLocked,
        );
        let mut artifact = r.artifact.clone();
        artifact
            .progression
            .as_mut()
            .unwrap()
            .research
            .get_mut(&ResearchId::Astrophysics)
            .unwrap()
            .base = [5000, 10000, 5000];
        artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Research(ResearchId::Astrophysics))
            .unwrap()
            .enabled = false;
        let next = Ruleset::from_artifact(artifact, r.speed).unwrap();
        validate_rules_update(&r, &next).unwrap();
        s.profile_hash = next.hash.clone();
        s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
        if cancel {
            run(
                &mut s,
                &next,
                Actor::Player(p),
                op.commitment.due_at - 1,
                9101,
                Input::Command(Command::CancelResearch { operation: op.id }),
            );
            assert_eq!(s.bodies[&b].checkpoint.amounts, before);
        }
        run(
            &mut s,
            &next,
            Actor::Scheduler,
            op.commitment.due_at,
            9102,
            Input::Event(started.events[0].event.clone()),
        );
        assert_eq!(
            research_level(&s, p, ResearchId::Astrophysics).unwrap(),
            if cancel { 4 } else { 5 }
        );
        assert_eq!(
            astrophysics_colony_capacity(research_level(&s, p, ResearchId::Astrophysics).unwrap()),
            if cancel { 2 } else { 3 }
        );
        let replay = run(
            &mut s,
            &next,
            Actor::Scheduler,
            op.commitment.due_at,
            9103,
            Input::Event(started.events[0].event.clone()),
        );
        assert!(replay.research.is_empty());
        let mut input = common::input(
            &s,
            &next,
            Actor::Player(p),
            op.commitment.due_at,
            9104,
            Input::Command(Command::CancelResearch { operation: op.id }),
        );
        input.protocol = 3;
        input.schema_version = 3;
        assert_eq!(
            transition(&s, &input, &next),
            TransitionResult::Rejected(GameError::OperationNotActive)
        );
        assert_eq!(s.bodies.len(), 1); // research never creates a colony
        assert_eq!(s.research_operations[&op.id].commitment, op.commitment);
    }
}

#[test]
fn astrophysics_stale_prices_and_insufficient_resources_never_spend() {
    let (mut s, r, p, b) = astrophysics_prepared();
    let request = QuoteRequest::Research {
        host: b,
        research: ResearchId::Astrophysics,
    };
    let cmd = command(&s, &r, p, 0, request.clone());
    let mut artifact = r.artifact.clone();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .get_mut(&ResearchId::Astrophysics)
        .unwrap()
        .base[0] = 4100;
    let next = Ruleset::from_artifact(artifact, r.speed).unwrap();
    s.profile_hash = next.hash.clone();
    let mut input = common::input(&s, &next, Actor::Player(p), 0, 9200, Input::Command(cmd));
    input.protocol = 3;
    input.schema_version = 3;
    assert_eq!(
        transition(&s, &input, &next),
        TransitionResult::Rejected(GameError::QuoteChanged)
    );
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts.metal = 4100 * SCALE - 1;
    blocked(&s, &next, p, 0, request, GameError::InsufficientResources);
    assert!(s.research_operations.is_empty());
}

#[test]
fn building_inspections_separate_operating_consumption_from_construction_energy() {
    let (mut s, r, p, b) = fixture();
    // Other producers, energy shortages and throttling must not change the
    // building's advertised full-output consumption or gate its construction.
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::MetalMine, 5);
    s.production_settings
        .get_mut(&b)
        .unwrap()
        .settings
        .crystal_mine = 0;
    for (building, source, current, target) in [
        (Building::CrystalMine, 3, 39_930_000, 58_564_000),
        (Building::DeuteriumSynthesizer, 1, 22_000_000, 48_400_000),
        (Building::MetalMine, 0, 0, 11_000_000),
        (Building::SolarPlant, 1, 0, 0),
        (Building::RoboticsFactory, 0, 0, 0),
    ] {
        s.bodies
            .get_mut(&b)
            .unwrap()
            .levels
            .insert(building, source);
        let request = QuoteRequest::Upgrade { body: b, building };
        let before = s.clone();
        let options = inspect_progression(&s, Actor::Player(p), &request, 0, &r).unwrap();
        assert_eq!(s, before);
        assert_eq!(
            options.building_energy,
            Some(BuildingEnergy {
                current_consumption: current.to_string(),
                target_consumption: target.to_string(),
            })
        );
        assert!(matches!(
            options.terms,
            Some(ProgressionMaterial::Building {
                required_energy: 0,
                ..
            })
        ));
        assert!(
            !options
                .blockers
                .iter()
                .any(|blocker| blocker.code == GameError::EnergyRequired)
        );
        if source > 0 {
            let demolition = inspect_progression(
                &s,
                Actor::Player(p),
                &QuoteRequest::Demolition { body: b, building },
                0,
                &r,
            )
            .unwrap();
            assert_eq!(
                demolition.building_energy.unwrap().current_consumption,
                current.to_string()
            );
        }
    }
    let demolition = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Demolition {
            body: b,
            building: Building::RoboticsFactory,
        },
        0,
        &r,
    )
    .unwrap();
    assert!(demolition.terms.is_none());
    assert!(demolition.building_energy.is_none());
}

#[test]
fn building_energy_uses_the_active_rules_and_exact_micro_units() {
    let (s, r, _, b) = fixture();
    let mut artifact = r.artifact.clone();
    artifact.energy_demand[0] = 17;
    artifact.growth = [6, 5];
    let rules = Ruleset::from_artifact(artifact, r.speed).unwrap();
    let energy = building_energy(&s.bodies[&b], Building::MetalMine, 1, 2, &rules).unwrap();
    assert_eq!(energy.current_consumption, "20400000");
    assert_eq!(energy.target_consumption, "48960000");
    let demolition = building_energy(&s.bodies[&b], Building::MetalMine, 2, 1, &rules).unwrap();
    assert_eq!(demolition.current_consumption, energy.target_consumption);
    assert_eq!(demolition.target_consumption, energy.current_consumption);
}

#[test]
fn laser_research_and_defense_require_completed_local_and_player_prerequisites() {
    let (mut s, old, p, b) = prepared();
    let r = common::light_laser_rules(&old);

    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 1);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 2);
    let research = QuoteRequest::Research {
        host: b,
        research: ResearchId::LaserTechnology,
    };
    let item = ManufacturedItem::Defense(DefenseId::LightLaser);
    let manufacture = QuoteRequest::Manufacture {
        body: b,
        item,
        quantity: 3,
    };
    blocked(
        &s,
        &old,
        p,
        0,
        research.clone(),
        GameError::UnavailableContent,
    );
    blocked(
        &s,
        &old,
        p,
        0,
        manufacture.clone(),
        GameError::UnavailableContent,
    );
    s.profile_hash = r.hash.clone();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::LaserTechnology, 0);

    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 1);
    blocked(
        &s,
        &r,
        p,
        0,
        research.clone(),
        GameError::PrerequisiteMissing,
    );
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 2);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 0);
    blocked(
        &s,
        &r,
        p,
        0,
        research.clone(),
        GameError::PrerequisiteMissing,
    );
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 1);
    let mut at = 0;
    for (level, cost, duration) in [
        (1, [200, 100, 0], 54_000),
        (2, [400, 200, 0], 108_000),
        (3, [800, 400, 0], 216_000),
    ] {
        let terms = research_terms(
            &s.bodies[&b],
            &s.research[&p],
            ResearchId::LaserTechnology,
            &r,
        )
        .unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values(cost.map(|v| v * SCALE))
        );
        assert_eq!(terms.duration(), duration);
        let cmd = command(&s, &r, p, at, research.clone());
        let c = run(
            &mut s,
            &r,
            Actor::Player(p),
            at,
            2000 + u128::from(level) * 2,
            Input::Command(cmd),
        );
        let event = &c.events[0];
        // Even a paid level 3 does not unlock the defense until its completion.
        blocked(
            &s,
            &r,
            p,
            event.at - 1,
            manufacture.clone(),
            GameError::PrerequisiteMissing,
        );
        assert_eq!(
            s.research[&p].levels[&ResearchId::LaserTechnology],
            level - 1
        );
        at = event.at;
        run(
            &mut s,
            &r,
            Actor::Scheduler,
            at,
            2001 + u128::from(level) * 2,
            Input::Event(event.event.clone()),
        );
        assert_eq!(s.research[&p].levels[&ResearchId::LaserTechnology], level);
    }
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 1);
    blocked(
        &s,
        &r,
        p,
        at,
        manufacture.clone(),
        GameError::PrerequisiteMissing,
    );
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 2);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 0);
    blocked(
        &s,
        &r,
        p,
        at,
        manufacture.clone(),
        GameError::PrerequisiteMissing,
    );
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 2);
    let terms = manufacture_terms(&s.bodies[&b], item, 3, &r).unwrap();
    assert_eq!(
        terms.paid(),
        Resources::from_values([4500 * SCALE, 1500 * SCALE, 0])
    );
    assert!(matches!(
        terms,
        ProgressionMaterial::Manufacture {
            unit_duration_ms: 96_000,
            ..
        }
    ));
    let before = s.bodies[&b].checkpoint.amounts;
    let cmd = command(&s, &r, p, at, manufacture);
    let mut c = run(&mut s, &r, Actor::Player(p), at, 2100, Input::Command(cmd));
    let batch = c.manufacturing_batches[0].clone();
    assert_eq!(batch.final_due_at - at, 288_000);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        before.metal - 4500 * SCALE
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.crystal,
        before.crystal - 1500 * SCALE
    );
    assert!(!s.inventories.iter().any(|v| v.item == item));
    // Disabling new orders keeps accepted payment, timing and output intact.
    let mut disabled = r.artifact.clone();
    disabled
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(disabled, r.speed).unwrap();
    assert!(validate_rules_update(&r, &disabled).is_ok());
    s.profile_hash = disabled.hash.clone();
    for count in 1..=3 {
        let event = c.events.remove(0);
        c = run(
            &mut s,
            &disabled,
            Actor::Scheduler,
            event.at,
            2100 + count as u128,
            Input::Event(event.event.clone()),
        );
        assert_eq!(
            s.inventories.iter().find(|v| v.item == item).unwrap().count,
            count
        );
        let duplicate = run(
            &mut s,
            &disabled,
            Actor::Scheduler,
            event.at,
            2200 + count as u128,
            Input::Event(event.event),
        );
        assert!(duplicate.inventories.is_empty());
    }
    assert_eq!(
        s.manufacturing_batches[&batch.id].status,
        ManufacturingStatus::Completed
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        before.metal - 4500 * SCALE
    );
}

#[test]
fn building_benefits_use_active_rules_without_mutating_state() {
    let (mut s, old, p, b) = fixture();
    let mut artifact = old.artifact.clone();
    artifact.production = [31, 23, 11];
    artifact.growth = [6, 5];
    artifact.energy_supply = 27;
    artifact.temperature = [1, 0, 1, 1];
    artifact.progression.as_mut().unwrap().storage_capacities[1] = 23456;
    let rules = Ruleset::from_artifact(artifact, old.speed).unwrap();
    s.profile_hash = rules.hash.clone();
    s.production_settings
        .get_mut(&b)
        .unwrap()
        .settings
        .metal_mine = 0;
    use BuildingBenefitKind::*;
    for (building, kind, current, target) in [
        (Building::MetalMine, MetalPerHour, 372_000_000, 892_800_000),
        (
            Building::CrystalMine,
            CrystalPerHour,
            276_000_000,
            662_400_000,
        ),
        (
            Building::DeuteriumSynthesizer,
            DeuteriumPerHour,
            132_000_000,
            316_800_000,
        ),
        (Building::SolarPlant, Energy, 32_400_000, 77_760_000),
    ] {
        s.bodies.get_mut(&b).unwrap().levels.insert(building, 1);
        let before = s.clone();
        let options = inspect_progression(
            &s,
            Actor::Player(p),
            &QuoteRequest::Upgrade { body: b, building },
            0,
            &rules,
        )
        .unwrap();
        assert_eq!(s, before);
        assert_eq!(
            options.building_benefit,
            Some(BuildingBenefit {
                kind,
                current: current.to_string(),
                target: target.to_string()
            })
        );
        let reversed = building_benefit(&s.bodies[&b], building, 2, 1, &rules)
            .unwrap()
            .unwrap();
        assert_eq!(reversed.current, target.to_string());
        assert_eq!(reversed.target, current.to_string());
        assert_eq!(
            building_benefit(&s.bodies[&b], building, 0, 1, &rules)
                .unwrap()
                .unwrap()
                .current,
            "0"
        );
    }
    for (building, kind) in [
        (Building::MetalStorage, MetalCapacity),
        (Building::CrystalStorage, CrystalCapacity),
        (Building::DeuteriumTank, DeuteriumCapacity),
    ] {
        let benefit = building_benefit(&s.bodies[&b], building, 0, 1, &rules)
            .unwrap()
            .unwrap();
        assert_eq!(
            benefit,
            BuildingBenefit {
                kind,
                current: "10000000000".into(),
                target: "23456000000".into()
            }
        );
    }
    assert!(
        building_benefit(&s.bodies[&b], Building::RoboticsFactory, 0, 1, &rules)
            .unwrap()
            .is_none()
    );
}

fn ion_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = prepared();
    let r = common::ion_rules(&common::light_laser_rules(&old));
    s.profile_hash = r.hash.clone();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 4);
    for (key, level) in [
        (ResearchId::EnergyTechnology, 4),
        (ResearchId::LaserTechnology, 5),
        (ResearchId::IonTechnology, 0),
    ] {
        s.research.get_mut(&p).unwrap().levels.insert(key, level);
    }
    (s, r, p, b)
}

#[test]
fn ion_requires_each_completed_gate_and_doubles_costs_with_exact_duration() {
    let (mut s, r, p, b) = ion_fixture();
    let request = QuoteRequest::Research {
        host: b,
        research: ResearchId::IonTechnology,
    };
    for (lab, energy, laser) in [(3, 4, 5), (4, 3, 5), (4, 4, 4)] {
        let mut missing = s.clone();
        missing
            .bodies
            .get_mut(&b)
            .unwrap()
            .levels
            .insert(Building::ResearchLab, lab);
        missing
            .research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::EnergyTechnology, energy);
        missing
            .research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::LaserTechnology, laser);
        blocked(
            &missing,
            &r,
            p,
            0,
            request.clone(),
            GameError::PrerequisiteMissing,
        );
        // A previously valid quote cannot bypass newly missing completed gates.
        let cmd = command(&s, &r, p, 0, request.clone());
        let mut input = common::input(&missing, &r, Actor::Player(p), 0, 9200, Input::Command(cmd));
        input.protocol = 3;
        input.schema_version = 3;
        let expected = if lab < 4 {
            GameError::QuoteChanged
        } else {
            GameError::PrerequisiteMissing
        };
        assert!(matches!(
            transition(&missing, &input, &r),
            TransitionResult::Rejected(code) if code == expected
        ));
    }
    let mut at = 0;
    for (level, costs, duration) in [
        (1, [1000, 300, 100], 93_000),
        (2, [2000, 600, 200], 187_000),
        (3, [4000, 1200, 400], 374_000),
    ] {
        let terms = research_terms(
            &s.bodies[&b],
            &s.research[&p],
            ResearchId::IonTechnology,
            &r,
        )
        .unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values(costs.map(|n| n * SCALE))
        );
        assert_eq!(terms.duration(), duration);
        let cmd = command(&s, &r, p, at, request.clone());
        let started = run(
            &mut s,
            &r,
            Actor::Player(p),
            at,
            9300 + u128::from(level) * 2,
            Input::Command(cmd),
        );
        assert_eq!(s.research[&p].levels[&ResearchId::IonTechnology], level - 1);
        blocked(&s, &r, p, at, request.clone(), GameError::ResearchActive);
        blocked(
            &s,
            &r,
            p,
            at,
            QuoteRequest::Upgrade {
                body: b,
                building: Building::ResearchLab,
            },
            GameError::LabLocked,
        );
        at = started.events[0].at;
        run(
            &mut s,
            &r,
            Actor::Scheduler,
            at,
            9301 + u128::from(level) * 2,
            Input::Event(started.events[0].event.clone()),
        );
        assert_eq!(s.research[&p].levels[&ResearchId::IonTechnology], level);
    }
}

#[test]
fn ion_paid_work_survives_disable_and_restart_with_exact_cancellation_refund() {
    for cancel in [true, false] {
        let (mut s, r, p, b) = ion_fixture();
        let before = s.bodies[&b].checkpoint.amounts;
        let request = QuoteRequest::Research {
            host: b,
            research: ResearchId::IonTechnology,
        };
        let cmd = command(&s, &r, p, 0, request.clone());
        let started = run(&mut s, &r, Actor::Player(p), 0, 9400, Input::Command(cmd));
        let op = started.research_operations[0].clone();
        assert_eq!(op.commitment.due_at, 93_000); // Legacy progression fixture runs at 10x.
        let mut artifact = r.artifact.clone();
        artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Research(ResearchId::IonTechnology))
            .unwrap()
            .enabled = false;
        artifact
            .progression
            .as_mut()
            .unwrap()
            .research
            .get_mut(&ResearchId::IonTechnology)
            .unwrap()
            .base = [2000, 600, 200];
        let next = Ruleset::from_artifact(artifact, r.speed).unwrap();
        validate_rules_update(&r, &next).unwrap();
        s.profile_hash = next.hash.clone();
        s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
        if cancel {
            run(
                &mut s,
                &next,
                Actor::Player(p),
                op.commitment.due_at - 1,
                9401,
                Input::Command(Command::CancelResearch { operation: op.id }),
            );
            assert_eq!(s.bodies[&b].checkpoint.amounts, before);
        }
        run(
            &mut s,
            &next,
            Actor::Scheduler,
            op.commitment.due_at,
            9402,
            Input::Event(started.events[0].event.clone()),
        );
        assert_eq!(
            s.research[&p].levels[&ResearchId::IonTechnology],
            u32::from(!cancel)
        );
        blocked(
            &s,
            &next,
            p,
            op.commitment.due_at,
            request,
            GameError::UnavailableContent,
        );
    }
}

fn ion_cannon_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = ion_fixture();
    let r = common::ion_cannon_rules(&old);
    s.profile_hash = r.hash.clone();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::IonTechnology, 4);
    (s, r, p, b)
}

#[test]
fn ion_cannon_checks_completed_gates_and_resources_at_quote_and_append() {
    let (s, r, p, b) = ion_cannon_fixture();
    let request = QuoteRequest::Manufacture {
        body: b,
        item: ManufacturedItem::Defense(DefenseId::IonCannon),
        quantity: 3,
    };
    let cmd = command(&s, &r, p, 0, request.clone());
    for (yard, ion, affordable, error) in [
        (3, 4, true, GameError::PrerequisiteMissing),
        (4, 3, true, GameError::PrerequisiteMissing),
        (4, 4, false, GameError::InsufficientResources),
    ] {
        let mut missing = s.clone();
        missing
            .bodies
            .get_mut(&b)
            .unwrap()
            .levels
            .insert(Building::Shipyard, yard);
        missing
            .research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::IonTechnology, ion);
        if !affordable {
            missing
                .bodies
                .get_mut(&b)
                .unwrap()
                .checkpoint
                .amounts
                .crystal = 18_000 * SCALE - 1;
        }
        blocked(&missing, &r, p, 0, request.clone(), error.clone());
        let before = missing.clone();
        let mut input = common::input(
            &missing,
            &r,
            Actor::Player(p),
            0,
            9500,
            Input::Command(cmd.clone()),
        );
        input.protocol = 3;
        input.schema_version = 3;
        let expected = if yard < 4 {
            GameError::QuoteChanged
        } else {
            error
        };
        assert_eq!(
            transition(&missing, &input, &r),
            TransitionResult::Rejected(expected)
        );
        assert_eq!(missing, before);
    }
}

#[test]
fn ion_cannon_unlocks_on_research_completion_across_planets_with_local_shipyards() {
    let (mut s, r, p, b) = ion_cannon_fixture();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::IonTechnology, 3);
    let mut second = s.bodies[&b].clone();
    second.id = BodyId(uuid::Uuid::from_u128(9501));
    second.coordinates.position = 9;
    second.levels.insert(Building::ResearchLab, 0);
    let target = second.id;
    s.bodies.insert(target, second);
    let mut production = s.production_settings[&b].clone();
    production.body = target;
    s.production_settings.insert(target, production);
    s.coverage.bodies.insert(target);
    s.coverage.production_bodies.insert(target);
    s.coverage.manufacturing_bodies.insert(target);
    s.coverage.construction_bodies.insert(target);
    s.coverage.inventory_owners.insert((target, p));
    for category in ["production", "manufacturing", "constructions"] {
        s.collection_revisions
            .insert(format!("{category}:{target}"), 0);
    }
    s.collection_revisions
        .insert(format!("inventory:{target}:{p}"), 0);
    let research = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Research {
            host: b,
            research: ResearchId::IonTechnology,
        },
    );
    let started = run(
        &mut s,
        &r,
        Actor::Player(p),
        0,
        9502,
        Input::Command(research),
    );
    let event = &started.events[0];
    let request = QuoteRequest::Manufacture {
        body: target,
        item: ManufacturedItem::Defense(DefenseId::IonCannon),
        quantity: 1,
    };
    blocked(
        &s,
        &r,
        p,
        event.at - 1,
        request.clone(),
        GameError::PrerequisiteMissing,
    );
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        event.at,
        9503,
        Input::Event(event.event.clone()),
    );
    assert_eq!(s.research[&p].levels[&ResearchId::IonTechnology], 4);
    s.bodies
        .get_mut(&target)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 3);
    blocked(
        &s,
        &r,
        p,
        event.at,
        request.clone(),
        GameError::PrerequisiteMissing,
    );
    s.bodies
        .get_mut(&target)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 4);
    let cmd = command(&s, &r, p, event.at, request);
    let built = run(
        &mut s,
        &r,
        Actor::Player(p),
        event.at,
        9504,
        Input::Command(cmd),
    );
    assert_eq!(built.manufacturing_batches[0].body, target);
    // Higher Ion levels only unlock content; they do not change cannon terms.
    let terms = manufacture_terms(
        &s.bodies[&target],
        ManufacturedItem::Defense(DefenseId::IonCannon),
        1,
        &r,
    )
    .unwrap();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::IonTechnology, 10);
    assert_eq!(
        manufacture_terms(
            &s.bodies[&target],
            ManufacturedItem::Defense(DefenseId::IonCannon),
            1,
            &r
        )
        .unwrap(),
        terms
    );
}

#[test]
fn ion_cannon_paid_fifo_survives_disable_and_restart_without_duplicate_credit() {
    let (mut s, r, p, b) = ion_cannon_fixture();
    let item = ManufacturedItem::Defense(DefenseId::IonCannon);
    let request = QuoteRequest::Manufacture {
        body: b,
        item,
        quantity: 3,
    };
    let terms = manufacture_terms(&s.bodies[&b], item, 3, &r).unwrap();
    assert_eq!(
        terms.paid(),
        Resources::from_values([6000 * SCALE, 18000 * SCALE, 0])
    );
    assert!(matches!(
        terms,
        ProgressionMaterial::Manufacture {
            unit_duration_ms: 230_000,
            ..
        }
    ));
    // A full planet still has room for defenses, and ships share the same FIFO.
    let body = s.bodies.get_mut(&b).unwrap();
    body.fields = body.levels.values().sum();
    let fields = body.fields;
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Ship(ShipType::LightFighter),
            quantity: 1,
        },
    );
    let preceding = run(&mut s, &r, Actor::Player(p), 0, 9600, Input::Command(cmd));
    let before = s.bodies[&b].checkpoint.amounts;
    let cmd = command(&s, &r, p, 0, request.clone());
    let mut started = run(&mut s, &r, Actor::Player(p), 0, 9601, Input::Command(cmd));
    let batch = started.manufacturing_batches[0].clone();
    assert_eq!(
        batch.first_start_at,
        preceding.manufacturing_batches[0].final_due_at
    );
    assert_eq!(batch.final_due_at - batch.first_start_at, 690_000);
    let paid = s.bodies[&b].checkpoint.amounts;
    assert_eq!(
        paid,
        Resources::from_values([
            before.metal - 6000 * SCALE,
            before.crystal - 18000 * SCALE,
            before.deuterium
        ])
    );
    assert!(!s.inventories.iter().any(|v| v.item == item));
    assert_eq!(reserved_fields(&s, b).unwrap(), 0);
    // No one-per-planet restriction while another cannon batch is queued.
    assert!(
        inspect_progression(&s, Actor::Player(p), &request, 0, &r)
            .unwrap()
            .blockers
            .is_empty()
    );
    let mut artifact = r.artifact.clone();
    artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(artifact, r.speed).unwrap();
    validate_rules_update(&r, &disabled).unwrap();
    s.profile_hash = disabled.hash.clone();
    s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    blocked(&s, &disabled, p, 0, request, GameError::UnavailableContent);
    let event = &preceding.events[0];
    run(
        &mut s,
        &disabled,
        Actor::Scheduler,
        event.at,
        9602,
        Input::Event(event.event.clone()),
    );
    for count in 1..=3 {
        let event = started.events.remove(0);
        started = run(
            &mut s,
            &disabled,
            Actor::Scheduler,
            event.at,
            9610 + count as u128,
            Input::Event(event.event.clone()),
        );
        assert_eq!(
            s.inventories.iter().find(|v| v.item == item).unwrap().count,
            count
        );
        let duplicate = run(
            &mut s,
            &disabled,
            Actor::Scheduler,
            event.at,
            9620 + count as u128,
            Input::Event(event.event),
        );
        assert!(duplicate.inventories.is_empty());
    }
    assert_eq!(
        s.manufacturing_batches[&batch.id].status,
        ManufacturingStatus::Completed
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts, paid);
    assert_eq!(s.bodies[&b].fields, fields);
}

fn gauss_cannon_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = prepared();
    let r = common::gauss_cannon_rules(&old);
    s.profile_hash = r.hash.clone();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 6);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 6);
    for (research, level) in [
        (ResearchId::EnergyTechnology, 6),
        (ResearchId::WeaponsTechnology, 3),
        (ResearchId::ShieldingTechnology, 1),
    ] {
        s.research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(research, level);
    }
    (s, r, p, b)
}

#[test]
fn gauss_cannon_checks_all_completed_gates_and_each_resource_at_quote_and_append() {
    let (s, r, p, b) = gauss_cannon_fixture();
    let request = QuoteRequest::Manufacture {
        body: b,
        item: ManufacturedItem::Defense(DefenseId::GaussCannon),
        quantity: 3,
    };
    let cmd = command(&s, &r, p, 0, request.clone());
    for missing_gate in 0..7 {
        let mut missing = s.clone();
        match missing_gate {
            0 => {
                missing
                    .bodies
                    .get_mut(&b)
                    .unwrap()
                    .levels
                    .insert(Building::Shipyard, 5);
            }
            1..=3 => {
                let research = [
                    ResearchId::EnergyTechnology,
                    ResearchId::WeaponsTechnology,
                    ResearchId::ShieldingTechnology,
                ][missing_gate - 1];
                *missing
                    .research
                    .get_mut(&p)
                    .unwrap()
                    .levels
                    .get_mut(&research)
                    .unwrap() -= 1;
            }
            4 => missing.bodies.get_mut(&b).unwrap().checkpoint.amounts.metal = 60000 * SCALE - 1,
            5 => {
                missing
                    .bodies
                    .get_mut(&b)
                    .unwrap()
                    .checkpoint
                    .amounts
                    .crystal = 45000 * SCALE - 1
            }
            6 => {
                missing
                    .bodies
                    .get_mut(&b)
                    .unwrap()
                    .checkpoint
                    .amounts
                    .deuterium = 6000 * SCALE - 1
            }
            _ => unreachable!(),
        }
        let error = if missing_gate < 4 {
            GameError::PrerequisiteMissing
        } else {
            GameError::InsufficientResources
        };
        blocked(&missing, &r, p, 0, request.clone(), error.clone());
        let before = missing.clone();
        let mut input = common::input(
            &missing,
            &r,
            Actor::Player(p),
            0,
            9700,
            Input::Command(cmd.clone()),
        );
        input.protocol = 3;
        input.schema_version = 3;
        assert_eq!(
            transition(&missing, &input, &r),
            TransitionResult::Rejected(if missing_gate == 0 {
                GameError::QuoteChanged
            } else {
                error
            })
        );
        assert_eq!(missing, before);
    }
}

#[test]
fn gauss_cannon_unlocks_on_research_completion_across_planets_with_local_shipyards() {
    let (mut s, r, p, b) = gauss_cannon_fixture();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 5);
    let mut second = s.bodies[&b].clone();
    second.id = BodyId(uuid::Uuid::from_u128(9501));
    second.coordinates.position = 9;
    second.levels.insert(Building::ResearchLab, 0);
    let target = second.id;
    s.bodies.insert(target, second);
    let mut production = s.production_settings[&b].clone();
    production.body = target;
    s.production_settings.insert(target, production);
    s.coverage.bodies.insert(target);
    s.coverage.production_bodies.insert(target);
    s.coverage.manufacturing_bodies.insert(target);
    s.coverage.construction_bodies.insert(target);
    s.coverage.inventory_owners.insert((target, p));
    for category in ["production", "manufacturing", "constructions"] {
        s.collection_revisions
            .insert(format!("{category}:{target}"), 0);
    }
    s.collection_revisions
        .insert(format!("inventory:{target}:{p}"), 0);
    let research = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Research {
            host: b,
            research: ResearchId::EnergyTechnology,
        },
    );
    let started = run(
        &mut s,
        &r,
        Actor::Player(p),
        0,
        9502,
        Input::Command(research),
    );
    let event = &started.events[0];
    let request = QuoteRequest::Manufacture {
        body: target,
        item: ManufacturedItem::Defense(DefenseId::GaussCannon),
        quantity: 1,
    };
    blocked(
        &s,
        &r,
        p,
        event.at - 1,
        request.clone(),
        GameError::PrerequisiteMissing,
    );
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        event.at,
        9503,
        Input::Event(event.event.clone()),
    );
    assert_eq!(s.research[&p].levels[&ResearchId::EnergyTechnology], 6);
    s.bodies
        .get_mut(&target)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 5);
    blocked(
        &s,
        &r,
        p,
        event.at,
        request.clone(),
        GameError::PrerequisiteMissing,
    );
    s.bodies
        .get_mut(&target)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 6);
    let cmd = command(&s, &r, p, event.at, request);
    let built = run(
        &mut s,
        &r,
        Actor::Player(p),
        event.at,
        9504,
        Input::Command(cmd),
    );
    assert_eq!(built.manufacturing_batches[0].body, target);
    // Higher Energy levels only unlock content; they do not change cannon terms.
    let terms = manufacture_terms(
        &s.bodies[&target],
        ManufacturedItem::Defense(DefenseId::GaussCannon),
        1,
        &r,
    )
    .unwrap();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 10);
    assert_eq!(
        manufacture_terms(
            &s.bodies[&target],
            ManufacturedItem::Defense(DefenseId::GaussCannon),
            1,
            &r
        )
        .unwrap(),
        terms
    );
}

#[test]
fn gauss_cannon_paid_fifo_survives_disable_and_restart_without_duplicate_credit() {
    let (mut s, r, p, b) = gauss_cannon_fixture();
    let item = ManufacturedItem::Defense(DefenseId::GaussCannon);
    let request = QuoteRequest::Manufacture {
        body: b,
        item,
        quantity: 3,
    };
    let terms = manufacture_terms(&s.bodies[&b], item, 3, &r).unwrap();
    assert_eq!(
        terms.paid(),
        Resources::from_values([60000 * SCALE, 45000 * SCALE, 6000 * SCALE])
    );
    assert!(matches!(
        terms,
        ProgressionMaterial::Manufacture {
            unit_duration_ms: 720_000,
            ..
        }
    ));
    // A full planet still has room for defenses, and ships share the same FIFO.
    let body = s.bodies.get_mut(&b).unwrap();
    body.fields = body.levels.values().sum();
    let fields = body.fields;
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Ship(ShipType::LightFighter),
            quantity: 1,
        },
    );
    let preceding = run(&mut s, &r, Actor::Player(p), 0, 9600, Input::Command(cmd));
    let before = s.bodies[&b].checkpoint.amounts;
    let cmd = command(&s, &r, p, 0, request.clone());
    let mut started = run(&mut s, &r, Actor::Player(p), 0, 9601, Input::Command(cmd));
    let batch = started.manufacturing_batches[0].clone();
    assert_eq!(
        batch.first_start_at,
        preceding.manufacturing_batches[0].final_due_at
    );
    assert_eq!(batch.final_due_at - batch.first_start_at, 2_160_000);
    let paid = s.bodies[&b].checkpoint.amounts;
    assert_eq!(
        paid,
        Resources::from_values([
            before.metal - 60000 * SCALE,
            before.crystal - 45000 * SCALE,
            before.deuterium - 6000 * SCALE
        ])
    );
    assert!(!s.inventories.iter().any(|v| v.item == item));
    assert_eq!(reserved_fields(&s, b).unwrap(), 0);
    // No one-per-planet restriction while another cannon batch is queued.
    assert!(
        inspect_progression(&s, Actor::Player(p), &request, 0, &r)
            .unwrap()
            .blockers
            .is_empty()
    );
    let mut artifact = r.artifact.clone();
    artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(artifact, r.speed).unwrap();
    validate_rules_update(&r, &disabled).unwrap();
    s.profile_hash = disabled.hash.clone();
    s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    blocked(&s, &disabled, p, 0, request, GameError::UnavailableContent);
    let event = &preceding.events[0];
    run(
        &mut s,
        &disabled,
        Actor::Scheduler,
        event.at,
        9602,
        Input::Event(event.event.clone()),
    );
    for count in 1..=3 {
        let event = started.events.remove(0);
        started = run(
            &mut s,
            &disabled,
            Actor::Scheduler,
            event.at,
            9610 + count as u128,
            Input::Event(event.event.clone()),
        );
        assert_eq!(
            s.inventories.iter().find(|v| v.item == item).unwrap().count,
            count
        );
        let duplicate = run(
            &mut s,
            &disabled,
            Actor::Scheduler,
            event.at,
            9620 + count as u128,
            Input::Event(event.event),
        );
        assert!(duplicate.inventories.is_empty());
    }
    assert_eq!(
        s.manufacturing_batches[&batch.id].status,
        ManufacturingStatus::Completed
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts, paid);
    assert_eq!(s.bodies[&b].fields, fields);
}

fn heavy_laser_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = prepared();
    let r = common::heavy_laser_rules(&common::light_laser_rules(&old));
    s.profile_hash = r.hash.clone();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::LaserTechnology, 6);
    (s, r, p, b)
}

#[test]
fn heavy_laser_checks_completed_gates_and_resources_at_quote_and_append() {
    let (s, r, p, b) = heavy_laser_fixture();
    let request = QuoteRequest::Manufacture {
        body: b,
        item: ManufacturedItem::Defense(DefenseId::HeavyLaser),
        quantity: 3,
    };
    let cmd = command(&s, &r, p, 0, request.clone());
    for (yard, energy, laser, short, error) in [
        (3, 3, 6, None, GameError::PrerequisiteMissing),
        (4, 2, 6, None, GameError::PrerequisiteMissing),
        (4, 3, 5, None, GameError::PrerequisiteMissing),
        (4, 3, 6, Some(0), GameError::InsufficientResources),
        (4, 3, 6, Some(1), GameError::InsufficientResources),
    ] {
        let mut missing = s.clone();
        missing
            .bodies
            .get_mut(&b)
            .unwrap()
            .levels
            .insert(Building::Shipyard, yard);
        for (research, level) in [
            (ResearchId::EnergyTechnology, energy),
            (ResearchId::LaserTechnology, laser),
        ] {
            missing
                .research
                .get_mut(&p)
                .unwrap()
                .levels
                .insert(research, level);
        }
        if let Some(resource) = short {
            let amounts = &mut missing.bodies.get_mut(&b).unwrap().checkpoint.amounts;
            if resource == 0 {
                amounts.metal = 18_000 * SCALE - 1;
            } else {
                amounts.crystal = 6_000 * SCALE - 1;
            }
        }
        blocked(&missing, &r, p, 0, request.clone(), error.clone());
        let before = missing.clone();
        let mut input = common::input(
            &missing,
            &r,
            Actor::Player(p),
            0,
            9500,
            Input::Command(cmd.clone()),
        );
        input.protocol = 3;
        input.schema_version = 3;
        let expected = if yard < 4 {
            GameError::QuoteChanged
        } else {
            error
        };
        assert_eq!(
            transition(&missing, &input, &r),
            TransitionResult::Rejected(expected)
        );
        assert_eq!(missing, before);
    }
}

#[test]
fn heavy_laser_unlocks_on_research_completion_across_planets_with_local_shipyards() {
    let (mut s, r, p, b) = heavy_laser_fixture();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::LaserTechnology, 5);
    let mut second = s.bodies[&b].clone();
    second.id = BodyId(uuid::Uuid::from_u128(9501));
    second.coordinates.position = 9;
    second.levels.insert(Building::ResearchLab, 0);
    let target = second.id;
    s.bodies.insert(target, second);
    let mut production = s.production_settings[&b].clone();
    production.body = target;
    s.production_settings.insert(target, production);
    s.coverage.bodies.insert(target);
    s.coverage.production_bodies.insert(target);
    s.coverage.manufacturing_bodies.insert(target);
    s.coverage.construction_bodies.insert(target);
    s.coverage.inventory_owners.insert((target, p));
    for category in ["production", "manufacturing", "constructions"] {
        s.collection_revisions
            .insert(format!("{category}:{target}"), 0);
    }
    s.collection_revisions
        .insert(format!("inventory:{target}:{p}"), 0);
    let research = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Research {
            host: b,
            research: ResearchId::LaserTechnology,
        },
    );
    let started = run(
        &mut s,
        &r,
        Actor::Player(p),
        0,
        9502,
        Input::Command(research),
    );
    let event = &started.events[0];
    let request = QuoteRequest::Manufacture {
        body: target,
        item: ManufacturedItem::Defense(DefenseId::HeavyLaser),
        quantity: 1,
    };
    blocked(
        &s,
        &r,
        p,
        event.at - 1,
        request.clone(),
        GameError::PrerequisiteMissing,
    );
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        event.at,
        9503,
        Input::Event(event.event.clone()),
    );
    assert_eq!(s.research[&p].levels[&ResearchId::LaserTechnology], 6);
    s.bodies
        .get_mut(&target)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 3);
    blocked(
        &s,
        &r,
        p,
        event.at,
        request.clone(),
        GameError::PrerequisiteMissing,
    );
    s.bodies
        .get_mut(&target)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 4);
    let cmd = command(&s, &r, p, event.at, request);
    let built = run(
        &mut s,
        &r,
        Actor::Player(p),
        event.at,
        9504,
        Input::Command(cmd),
    );
    assert_eq!(built.manufacturing_batches[0].body, target);
    // Higher Laser levels only unlock content; they do not change Heavy Laser terms.
    let terms = manufacture_terms(
        &s.bodies[&target],
        ManufacturedItem::Defense(DefenseId::HeavyLaser),
        1,
        &r,
    )
    .unwrap();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::LaserTechnology, 10);
    assert_eq!(
        manufacture_terms(
            &s.bodies[&target],
            ManufacturedItem::Defense(DefenseId::HeavyLaser),
            1,
            &r
        )
        .unwrap(),
        terms
    );
}

#[test]
fn heavy_laser_paid_fifo_survives_disable_and_restart_without_duplicate_credit() {
    let (mut s, r, p, b) = heavy_laser_fixture();
    let item = ManufacturedItem::Defense(DefenseId::HeavyLaser);
    let request = QuoteRequest::Manufacture {
        body: b,
        item,
        quantity: 3,
    };
    let terms = manufacture_terms(&s.bodies[&b], item, 3, &r).unwrap();
    assert_eq!(
        terms.paid(),
        Resources::from_values([18000 * SCALE, 6000 * SCALE, 0])
    );
    assert!(matches!(
        terms,
        ProgressionMaterial::Manufacture {
            unit_duration_ms: 230_000,
            ..
        }
    ));
    // A full planet still has room for defenses, and ships share the same FIFO.
    let body = s.bodies.get_mut(&b).unwrap();
    body.fields = body.levels.values().sum();
    let fields = body.fields;
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Ship(ShipType::LightFighter),
            quantity: 1,
        },
    );
    let preceding = run(&mut s, &r, Actor::Player(p), 0, 9600, Input::Command(cmd));
    let before = s.bodies[&b].checkpoint.amounts;
    let cmd = command(&s, &r, p, 0, request.clone());
    let mut started = run(&mut s, &r, Actor::Player(p), 0, 9601, Input::Command(cmd));
    let batch = started.manufacturing_batches[0].clone();
    assert_eq!(
        batch.first_start_at,
        preceding.manufacturing_batches[0].final_due_at
    );
    assert_eq!(batch.final_due_at - batch.first_start_at, 690_000);
    let paid = s.bodies[&b].checkpoint.amounts;
    assert_eq!(
        paid,
        Resources::from_values([
            before.metal - 18000 * SCALE,
            before.crystal - 6000 * SCALE,
            before.deuterium
        ])
    );
    assert!(!s.inventories.iter().any(|v| v.item == item));
    assert_eq!(reserved_fields(&s, b).unwrap(), 0);
    // No one-per-planet restriction while another Heavy Laser batch is queued.
    assert!(
        inspect_progression(&s, Actor::Player(p), &request, 0, &r)
            .unwrap()
            .blockers
            .is_empty()
    );
    let mut artifact = r.artifact.clone();
    artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(artifact, r.speed).unwrap();
    validate_rules_update(&r, &disabled).unwrap();
    s.profile_hash = disabled.hash.clone();
    s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    blocked(&s, &disabled, p, 0, request, GameError::UnavailableContent);
    let event = &preceding.events[0];
    run(
        &mut s,
        &disabled,
        Actor::Scheduler,
        event.at,
        9602,
        Input::Event(event.event.clone()),
    );
    for count in 1..=3 {
        let event = started.events.remove(0);
        started = run(
            &mut s,
            &disabled,
            Actor::Scheduler,
            event.at,
            9610 + count as u128,
            Input::Event(event.event.clone()),
        );
        assert_eq!(
            s.inventories.iter().find(|v| v.item == item).unwrap().count,
            count
        );
        let duplicate = run(
            &mut s,
            &disabled,
            Actor::Scheduler,
            event.at,
            9620 + count as u128,
            Input::Event(event.event),
        );
        assert!(duplicate.inventories.is_empty());
    }
    assert_eq!(
        s.manufacturing_batches[&batch.id].status,
        ManufacturingStatus::Completed
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts, paid);
    assert_eq!(s.bodies[&b].fields, fields);
}

#[path = "progression/plasma.rs"]
mod plasma;

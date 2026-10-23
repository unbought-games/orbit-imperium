use orbit_engine::*;
use std::collections::BTreeSet;
use uuid::Uuid;
mod common;
fn fixture() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, _, p, b) = common::fixture();
    let r = Ruleset::mvp_fleets().unwrap();
    s.profile_hash = r.hash.clone();
    let mut second = s.bodies[&b].clone();
    second.id = BodyId(Uuid::from_u128(20));
    second.owner = PlayerId(Uuid::from_u128(21));
    second.coordinates.position = 9;
    let target = second.id;
    s.bodies.insert(target, second);
    let mut w = WorldRecords::default();
    for body in s.bodies.values_mut() {
        body.retained_capacity = None;
        body.levels = Building::MVP.into_iter().map(|k| (k, 0)).collect();
        body.checkpoint.amounts = Resources::all(10000 * SCALE);
        s.players.insert(
            body.owner,
            Player {
                id: body.owner,
                universe: s.universe,
            },
        );
        s.research.insert(
            body.owner,
            ResearchLevels {
                owner: body.owner,
                levels: ResearchId::MVP.into_iter().map(|k| (k, 0)).collect(),
                revision: 0,
            },
        );
        s.production_settings.insert(
            body.id,
            ProductionSettingsRecord {
                body: body.id,
                settings: ProductionSettings::default(),
                revision: 0,
            },
        );
        s.progression_reservations.insert(
            body.id,
            ProgressionReservations {
                body: body.id,
                field_operation: None,
                small_dome_operation: None,
                large_dome_operation: None,
                missile_slots: 0,
                revision: 0,
            },
        );
        s.coverage.bodies.insert(body.id);
        s.coverage.production_bodies.insert(body.id);
        s.coverage.inventory_owners.insert((body.id, body.owner));
        s.coverage.construction_bodies.insert(body.id);
        s.coverage.manufacturing_bodies.insert(body.id);
        s.coverage.reservation_bodies.insert(body.id);
        s.coverage.research_players.insert(body.owner);
        s.coverage.fleet_owners.insert(body.owner);
        s.coverage.owned_body_players.insert(body.owner);
        s.coverage.research_slot_players.insert(body.owner);
        s.coverage.lab_construction_players.insert(body.owner);
        for k in [
            "production",
            "constructions",
            "manufacturing",
            "progression-reservations",
        ] {
            s.collection_revisions.insert(format!("{k}:{}", body.id), 0);
        }
        for k in [
            "research",
            "research-operations",
            "owned-bodies",
            "lab-constructions",
            "fleets",
        ] {
            s.collection_revisions
                .insert(format!("{k}:{}", body.owner), 0);
        }
        s.collection_revisions
            .insert(format!("inventory:{}:{}", body.id, body.owner), 0);
        w.policies.insert(
            body.owner,
            PlayerPolicy {
                player: body.owner,
                last_presence_at: 0,
                vacation: false,
                lifecycle: PlayerLifecycle::Active,
                policy_hash: r.hash.clone(),
                revision: 0,
            },
        );
        for (index, ship) in [
            ShipType::SmallCargo,
            ShipType::Recycler,
            ShipType::EspionageProbe,
        ]
        .into_iter()
        .enumerate()
        {
            s.inventories.push(InventoryStack {
                body: body.id,
                owner: body.owner,
                item: ManufacturedItem::Ship(ship),
                count: 2,
                revision: 0,
            });
            let cost = r
                .artifact
                .progression
                .as_ref()
                .unwrap()
                .unit_costs
                .iter()
                .find(|u| u.item == ManufacturedItem::Ship(ship))
                .unwrap()
                .cost;
            let id = OperationId(derived_id(InputId(body.id.0), &format!("seed-{index}")));
            w.lots.push(AssetLot {
                id,
                owner: body.owner,
                item: CatalogKey::Ship(ship),
                level: None,
                location: AssetLocation::Body(body.id),
                quantity: 2,
                unit_value_micro: cost.values().iter().sum::<i64>() * SCALE,
                rules_hash: r.hash.clone(),
                source_operation: id,
                acquired_at: 0,
                acquired_sequence: index as i64,
            });
        }
    }
    s.world = Some(WorldFacts {
        planet_slots: vec![],
        records: w,
        secret: [7; 32],
        covered_players: s.players.keys().copied().collect(),
        covered_coordinates: (1..=5)
            .flat_map(|sys| (1..=15).map(move |pos| (1, sys, pos)))
            .collect(),
        covered_reports: BTreeSet::new(),
        requested_pair: None,
        revision: 0,
    });
    validate_asset_lineage(&s).unwrap();
    (s, r, p, b, target)
}
fn intent(s: &GameState, p: PlayerId, b: BodyId, t: BodyId) -> FleetIntent {
    FleetIntent {
        origin: b,
        destination: MissionDestination::Body {
            id: t,
            expected_kind: BodyKind::Planet,
            expected_owner: s.bodies[&t].owner,
        },
        mission: Mission::Transport,
        ships: vec![ManifestStack {
            owner: p,
            ship_type: ShipType::SmallCargo,
            count: 1,
        }],
        cargo: Resources::from_values([10 * SCALE, 0, 0]),
        speed_percent: 100,
    }
}
fn run(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    at: i64,
    n: u128,
    payload: Input,
) -> TransitionResult {
    let mut i = common::input(
        s,
        r,
        if matches!(payload, Input::Event(_)) {
            Actor::Scheduler
        } else {
            Actor::Player(p)
        },
        at,
        n,
        payload,
    );
    i.protocol = 4;
    i.schema_version = 4;
    s.coverage
        .bodies
        .insert(BodyId(derived_id(i.id, "colony:0")));
    if matches!(i.payload, Input::Command(_)) {
        s.world.as_mut().unwrap().records.presence.insert(
            i.id,
            PresenceLink {
                presence: InputId(Uuid::from_u128(n + 10000)),
                gameplay: i.id,
                player: p,
                body: Some(b),
                at,
            },
        );
    }
    transition(s, &i, r)
}
fn apply(s: &mut GameState, result: TransitionResult) -> ChangeSet {
    common::applied(s, result)
}
#[test]
fn transport_slot_conservation_and_original_duration_return() {
    let (mut s, r, p, b, t) = fixture();
    let intent = intent(&s, p, b, t);
    let value = value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap();
    let q = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        100,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: intent.clone(),
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    let c = apply(&mut s, result);
    validate_asset_lineage(&s).unwrap();
    assert_eq!(
        value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap(),
        value
    );
    assert_eq!(
        quote_fleet(&s, p, &intent, 1000, &r),
        Err(GameError::NoFleetSlot)
    );
    let event = c.events[0].clone();
    let before = settle_production(&s, &s.bodies[&t], event.at, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        event.at,
        101,
        Input::Event(event.event.clone()),
    );
    let c = apply(&mut s, result);
    assert_eq!(
        s.bodies[&t].checkpoint.amounts.metal,
        before.amounts.metal + 10 * SCALE
    );
    assert_eq!(c.events[0].at - event.at, q.duration_ms);
    let result = run(&mut s, &r, p, b, event.at, 102, Input::Event(event.event));
    let c0 = apply(&mut s, result);
    assert!(c0.world.is_none());
    let event = c.events[0].clone();
    let result = run(&mut s, &r, p, b, event.at, 103, Input::Event(event.event));
    apply(&mut s, result);
    validate_asset_lineage(&s).unwrap();
    assert_eq!(
        s.inventories
            .iter()
            .find(|x| x.body == b && x.item == ManufacturedItem::Ship(ShipType::SmallCargo))
            .unwrap()
            .count,
        2
    );
    assert_eq!(
        value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap(),
        value
    );
}
#[test]
fn zero_elapsed_recall_is_inline_and_never_refunds_fuel() {
    let (mut s, r, p, b, t) = fixture();
    let intent = intent(&s, p, b, t);
    let q = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    let before = settle_production(&s, &s.bodies[&b], 1000, &r)
        .unwrap()
        .amounts;
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        200,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    apply(&mut s, result);
    let id = *s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .keys()
        .next()
        .unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        201,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: id },
        }),
    );
    let c = apply(&mut s, result);
    assert!(c.events.is_empty());
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets[&id].leg,
        MissionLeg::Returned
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts,
        Resources {
            deuterium: before.deuterium - q.fuel,
            ..before
        }
    );
    validate_asset_lineage(&s).unwrap();
}
#[test]
fn absent_lineage_and_unpaired_gameplay_fail_closed() {
    let (mut s, r, p, b, t) = fixture();
    let q = intent(&s, p, b, t);
    s.world.as_mut().unwrap().records.lots.clear();
    assert_eq!(
        quote_fleet(&s, p, &q, 1000, &r),
        Err(GameError::PolicyUnavailable)
    );
    let (s, r, p, b, _) = fixture();
    let mut i = common::input(
        &s,
        &r,
        Actor::Player(p),
        1000,
        1,
        Input::Command(Command::SetProduction {
            body: b,
            settings: ProductionSettings::default(),
            expected_settings_revision: 0,
        }),
    );
    i.protocol = 4;
    i.schema_version = 4;
    assert_eq!(
        transition(&s, &i, &r),
        TransitionResult::Rejected(GameError::PresenceUnavailable)
    );
}
#[test]
fn harvest_reference_survives_return_and_cleanup_records_loss() {
    let (mut s, r, p, b, _) = fixture();
    let id = OperationId(Uuid::from_u128(900));
    let coordinates = s.bodies[&b].coordinates;
    let cleanup = next_debris_cleanup(1000).unwrap();
    s.world.as_mut().unwrap().records.debris.insert(
        id,
        DebrisField {
            id,
            coordinates,
            marker_present: true,
            metal: 299 * SCALE,
            crystal: 0,
            generation: 1,
            cleanup_at: cleanup,
            revision: 0,
        },
    );
    let intent = FleetIntent {
        origin: b,
        destination: MissionDestination::Debris {
            coordinates,
            field_identity: id,
        },
        mission: Mission::Harvest,
        ships: vec![ManifestStack {
            owner: p,
            ship_type: ShipType::Recycler,
            count: 1,
        }],
        cargo: Resources::default(),
        speed_percent: 100,
    };
    let q = quote_fleet(&s, p, &intent, cleanup - 1, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        cleanup - 1,
        300,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    let launch = apply(&mut s, result);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        cleanup,
        301,
        Input::Event(ScheduledEvent::DebrisCleanupDue {
            field: id,
            generation: 1,
        }),
    );
    apply(&mut s, result);
    assert!(s.world.as_ref().unwrap().records.debris[&id].marker_present);
    assert_eq!(
        debris_reference_count(id, s.world.as_ref().unwrap().records.fleets.values()),
        1
    );
    let due = launch.events[0].clone();
    let result = run(&mut s, &r, p, b, due.at, 302, Input::Event(due.event));
    let arrival = apply(&mut s, result);
    assert_eq!(s.world.as_ref().unwrap().records.debris[&id].metal, 0);
    assert_eq!(
        debris_reference_count(id, s.world.as_ref().unwrap().records.fleets.values()),
        1
    );
    let due = arrival.events[0].clone();
    let result = run(&mut s, &r, p, b, due.at, 303, Input::Event(due.event));
    apply(&mut s, result);
    assert_eq!(
        debris_reference_count(id, s.world.as_ref().unwrap().records.fleets.values()),
        0
    );
    let next = s.world.as_ref().unwrap().records.debris[&id].cleanup_at;
    s.world
        .as_mut()
        .unwrap()
        .records
        .debris
        .get_mut(&id)
        .unwrap()
        .metal = SCALE;
    let result = run(
        &mut s,
        &r,
        p,
        b,
        next,
        304,
        Input::Event(ScheduledEvent::DebrisCleanupDue {
            field: id,
            generation: 1,
        }),
    );
    let c = apply(&mut s, result);
    assert!(!s.world.as_ref().unwrap().records.debris[&id].marker_present);
    assert_eq!(c.world.unwrap().audits[0]["kind"], "DebrisCleanupLoss");
    assert_eq!(
        resolve_destination(&s, DestinationSelection::DebrisAt { coordinates }, &r),
        Err(GameError::NoHarvestTarget)
    );
}
#[test]
fn equal_time_collectors_serialize_and_empty_marker_remains_eligible() {
    let (mut s, r, p, b, _) = fixture();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::ComputerTechnology, 1);
    let lot = OperationId(Uuid::from_u128(801));
    s.world.as_mut().unwrap().records.lots.push(AssetLot {
        id: lot,
        owner: p,
        item: CatalogKey::Research(ResearchId::ComputerTechnology),
        level: Some(1),
        location: AssetLocation::Player,
        quantity: 1,
        unit_value_micro: 1000 * SCALE,
        rules_hash: r.hash.clone(),
        source_operation: lot,
        acquired_at: 0,
        acquired_sequence: 0,
    });
    let field = OperationId(Uuid::from_u128(802));
    let coordinates = s.bodies[&b].coordinates;
    s.world.as_mut().unwrap().records.debris.insert(
        field,
        DebrisField {
            id: field,
            coordinates,
            marker_present: true,
            metal: 3000 * SCALE,
            crystal: 5000 * SCALE,
            generation: 1,
            cleanup_at: next_debris_cleanup(1000).unwrap(),
            revision: 0,
        },
    );
    let intent = FleetIntent {
        origin: b,
        destination: MissionDestination::Debris {
            coordinates,
            field_identity: field,
        },
        mission: Mission::Harvest,
        ships: vec![ManifestStack {
            owner: p,
            ship_type: ShipType::Recycler,
            count: 1,
        }],
        cargo: Resources::default(),
        speed_percent: 100,
    };
    let q = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    let mut events = vec![];
    for n in [810, 811] {
        let result = run(
            &mut s,
            &r,
            p,
            b,
            1000,
            n,
            Input::Command(Command::World {
                action: WorldAction::LaunchFleet {
                    intent: intent.clone(),
                    expected_terms_hash: q.terms_hash.clone(),
                },
            }),
        );
        events.extend(apply(&mut s, result).events);
    }
    assert_eq!(events[0].at, events[1].at);
    let mut returns = vec![];
    for (n, event) in events.iter().enumerate() {
        let result = run(
            &mut s,
            &r,
            p,
            b,
            event.at,
            820 + n as u128,
            Input::Event(event.event.clone()),
        );
        returns.extend(apply(&mut s, result).events);
    }
    let w = &s.world.as_ref().unwrap().records;
    assert_eq!(
        w.fleets
            .values()
            .map(|f| f.cargo.metal + f.cargo.crystal)
            .sum::<i64>(),
        8000 * SCALE
    );
    assert_eq!(
        w.fleets
            .values()
            .filter(|f| f.cargo == Resources::default())
            .count(),
        1
    );
    assert_eq!(w.debris[&field].metal + w.debris[&field].crystal, 0);
    assert!(w.debris[&field].marker_present);
    assert_eq!(debris_reference_count(field, w.fleets.values()), 2);
    assert!(matches!(
        resolve_destination(&s, DestinationSelection::DebrisAt { coordinates }, &r).unwrap(),
        MissionDestination::Debris { .. }
    ));
    assert!(
        galaxy_system(&s, p, 1, 1, events[0].at, &r)
            .unwrap()
            .positions
            .iter()
            .all(|p| p.debris.is_none())
    );
    for (n, event) in returns.into_iter().enumerate() {
        let result = run(
            &mut s,
            &r,
            p,
            b,
            event.at,
            830 + n as u128,
            Input::Event(event.event),
        );
        apply(&mut s, result);
        assert_eq!(
            debris_reference_count(field, s.world.as_ref().unwrap().records.fleets.values()),
            1 - n
        );
        validate_asset_lineage(&s).unwrap();
    }
}
#[test]
fn unrepresentable_return_blocks_instead_of_consuming_the_obligation() {
    let (mut s, r, p, b, t) = fixture();
    let intent = intent(&s, p, b, t);
    let q = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        850,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    apply(&mut s, result);
    let fleet = *s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .keys()
        .next()
        .unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        2000,
        851,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet },
        }),
    );
    let recall = apply(&mut s, result);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts.metal = i64::MAX;
    let event = recall.events[0].clone();
    let result = run(&mut s, &r, p, b, event.at, 852, Input::Event(event.event));
    assert!(
        matches!(result, TransitionResult::InvalidState(_)),
        "{result:?}"
    );
}
#[test]
fn unrepresentable_future_score_rejects_prepaid_work_before_debit() {
    let (mut s, r, p, b, _) = fixture();
    let mut n = 900u128;
    for (key, levels) in [
        (CatalogKey::Building(Building::RoboticsFactory), 2),
        (CatalogKey::Building(Building::Shipyard), 2),
        (CatalogKey::Research(ResearchId::CombustionDrive), 2),
    ] {
        match key {
            CatalogKey::Building(k) => {
                s.bodies.get_mut(&b).unwrap().levels.insert(k, levels);
            }
            CatalogKey::Research(k) => {
                s.research.get_mut(&p).unwrap().levels.insert(k, levels);
            }
            _ => unreachable!(),
        }
        for level in 1..=levels {
            n += 1;
            let id = OperationId(Uuid::from_u128(n));
            s.world.as_mut().unwrap().records.lots.push(AssetLot {
                id,
                owner: p,
                item: key,
                level: Some(level),
                location: if matches!(key, CatalogKey::Research(_)) {
                    AssetLocation::Player
                } else {
                    AssetLocation::Body(b)
                },
                quantity: 1,
                unit_value_micro: SCALE,
                rules_hash: r.hash.clone(),
                source_operation: id,
                acquired_at: 0,
                acquired_sequence: n as i64,
            });
        }
    }
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(6_000_000_000_000_000_000);
    let request = QuoteRequest::Manufacture {
        body: b,
        item: ManufacturedItem::Ship(ShipType::SmallCargo),
        quantity: 3_000_000_000,
    };
    let q = inspect_progression(&s, Actor::Player(p), &request, 1000, &r).unwrap();
    assert!(q.blockers.is_empty());
    let id = InputId(Uuid::from_u128(950));
    let operation = OperationId(derived_id(id, "manufacturing:0"));
    s.coverage.manufacturing_operation_ids.insert(operation);
    s.coverage.operations.insert(operation);
    s.coverage.research_operation_ids.insert(operation);
    let before = s.bodies[&b].checkpoint.clone();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        950,
        Input::Command(Command::StartManufacture {
            body: b,
            item: ManufacturedItem::Ship(ShipType::SmallCargo),
            quantity: 3_000_000_000,
            expected_terms_hash: q.terms_hash.unwrap(),
        }),
    );
    assert_eq!(result, TransitionResult::Rejected(GameError::NumericRange));
    assert_eq!(s.bodies[&b].checkpoint, before);
    assert!(s.manufacturing_batches.is_empty());
}

fn raid_fixture() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, _, p, b, t) = fixture();
    let r = Ruleset::mvp_raids().unwrap();
    s.profile_hash = r.hash.clone();
    for lot in &mut s.world.as_mut().unwrap().records.lots {
        lot.rules_hash = r.hash.clone();
    }
    for policy in s.world.as_mut().unwrap().records.policies.values_mut() {
        policy.policy_hash = r.hash.clone();
    }
    (s, r, p, b, t)
}
#[test]
fn galaxy_attack_blocker_uses_current_policy_and_matches_quote() {
    let (mut s, r, p, b, t) = raid_fixture();
    let other = s.bodies[&t].owner;
    let mut request = intent(&s, p, b, t);
    request.mission = Mission::Attack;
    let blocker = |s: &GameState| {
        galaxy_system(s, p, 1, 1, 0, &r)
            .unwrap()
            .positions
            .into_iter()
            .filter_map(|position| position.body)
            .find(|body| body.id == t)
            .unwrap()
            .attack_blocker
    };
    assert_eq!(blocker(&s), None);
    assert!(quote_fleet(&s, p, &request, 0, &r).is_ok());
    for lot in &mut s.world.as_mut().unwrap().records.lots {
        if lot.owner == other {
            lot.unit_value_micro *= 10;
        }
    }
    assert_eq!(blocker(&s), Some(GameError::BeginnerProtected));
    assert_eq!(
        quote_fleet(&s, p, &request, 0, &r),
        Err(GameError::BeginnerProtected)
    );
    request.mission = Mission::Transport;
    assert!(quote_fleet(&s, p, &request, 0, &r).is_ok());
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&other)
        .unwrap()
        .vacation = true;
    assert_eq!(blocker(&s), Some(GameError::TargetVacation));
}

fn launch_raid(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    intent: FleetIntent,
    at: i64,
    n: u128,
) -> NewEvent {
    let q = quote_fleet(s, p, &intent, at, r).unwrap();
    let result = run(
        s,
        r,
        p,
        b,
        at,
        n,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    apply(s, result).events[0].clone()
}
#[test]
fn attack_empty_contact_loots_once_retains_fractions_and_original_return() {
    let (mut s, r, p, b, t) = raid_fixture();
    let invested_before =
        value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap();
    let mut intent = intent(&s, p, b, t);
    intent.mission = Mission::Attack;
    // Equal scores at admission, then defender moves away before contact.
    let event = launch_raid(&mut s, &r, p, b, intent, 1000, 1001);
    s.inventories.retain(|v| v.body != t);
    s.world
        .as_mut()
        .unwrap()
        .records
        .lots
        .retain(|l| l.location != AssetLocation::Body(t));
    s.bodies.get_mut(&t).unwrap().checkpoint.amounts = Resources::from_values([3_999_999, 0, 0]);
    s.bodies.get_mut(&t).unwrap().checkpoint.at = event.at;
    let prior = s.clone();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        event.at,
        1002,
        Input::Event(event.event.clone()),
    );
    let c = apply(&mut s, result);
    assert_eq!(s.bodies[&t].checkpoint.amounts.metal, 2_999_999);
    let f = s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .next()
        .unwrap();
    assert_eq!(f.cargo.metal, 11 * SCALE);
    assert_eq!(
        value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap(),
        invested_before
    );
    assert_eq!(f.due_at - event.at, f.terms.duration_ms);
    let report = s
        .world
        .as_ref()
        .unwrap()
        .records
        .reports
        .values()
        .find(|r| r.kind == "Combat")
        .unwrap();
    assert_eq!(report.payloads[&p]["loot"]["metal"], SCALE.to_string());
    assert_eq!(report.payloads[&p]["rounds"], serde_json::json!([]));
    let audits = &c.world.as_ref().unwrap().audits;
    assert_eq!(
        audits
            .iter()
            .filter(|a| a["kind"] == "AttackEvidence")
            .count(),
        1
    );
    let battle = audits.iter().find(|a| a["kind"] == "Battle").unwrap();
    assert_eq!(battle["battle_cursor"], serde_json::json!([0, 0]));
    assert_eq!(battle["recovery_cursor"], serde_json::json!([0, 0]));
    let mut retry = prior;
    assert_eq!(
        run(
            &mut retry,
            &r,
            p,
            b,
            event.at,
            1002,
            Input::Event(event.event.clone())
        ),
        TransitionResult::Applied(Box::new(c.clone()))
    );
    let duplicate = run(&mut s, &r, p, b, event.at, 1003, Input::Event(event.event));
    assert!(apply(&mut s, duplicate).world.is_none());
    let ret = c
        .events
        .iter()
        .find(|e| matches!(e.event, ScheduledEvent::FleetLegDue { .. }))
        .unwrap();
    let before = settle_production(&s, &s.bodies[&b], ret.at, &r)
        .unwrap()
        .amounts;
    let result = run(
        &mut s,
        &r,
        p,
        b,
        ret.at,
        1004,
        Input::Event(ret.event.clone()),
    );
    apply(&mut s, result);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        before.metal + 11 * SCALE
    );
    assert_eq!(
        value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap(),
        invested_before
    );
    validate_asset_lineage(&s).unwrap();
}
#[test]
fn attack_is_unavailable_in_retained_fleet_profile() {
    let (s, r, p, b, t) = fixture();
    let mut q = intent(&s, p, b, t);
    q.mission = Mission::Attack;
    assert_eq!(
        quote_fleet(&s, p, &q, 1000, &r),
        Err(GameError::UnavailableContent)
    );
    assert!(!r.attacks());
}

fn set_units(s: &mut GameState, r: &Ruleset, body: BodyId, item: ManufacturedItem, count: i64) {
    let owner = s.bodies[&body].owner;
    let key = match item {
        ManufacturedItem::Ship(x) => CatalogKey::Ship(x),
        ManufacturedItem::Defense(x) => CatalogKey::Defense(x),
        _ => unreachable!(),
    };
    s.inventories
        .retain(|v| !(v.body == body && v.item == item));
    s.world
        .as_mut()
        .unwrap()
        .records
        .lots
        .retain(|l| !(l.location == AssetLocation::Body(body) && l.item == key));
    if count == 0 {
        return;
    }
    s.inventories.push(InventoryStack {
        body,
        owner,
        item,
        count,
        revision: 0,
    });
    let id = OperationId(derived_id(
        InputId(body.0),
        &format!("raid-fixture:{item:?}"),
    ));
    let cost = r
        .artifact
        .progression
        .as_ref()
        .unwrap()
        .unit_costs
        .iter()
        .find(|c| c.item == item)
        .unwrap()
        .cost
        .values()
        .iter()
        .sum::<i64>()
        * SCALE;
    s.world.as_mut().unwrap().records.lots.push(AssetLot {
        id,
        owner,
        item: key,
        level: None,
        location: AssetLocation::Body(body),
        quantity: count,
        unit_value_micro: cost,
        rules_hash: r.hash.clone(),
        source_operation: id,
        acquired_at: 0,
        acquired_sequence: 0,
    });
}
fn clear_units(s: &mut GameState, t: BodyId) {
    s.inventories.retain(|v| v.body != t);
    s.world
        .as_mut()
        .unwrap()
        .records
        .lots
        .retain(|l| l.location != AssetLocation::Body(t));
}
#[test]
fn probe_attack_empty_victory_has_zero_loot_and_qualifies_but_inactive_does_not() {
    for inactive in [false, true] {
        let (mut s, r, p, b, t) = raid_fixture();
        let mut intent = intent(&s, p, b, t);
        intent.mission = Mission::Attack;
        intent.cargo = Resources::default();
        intent.ships[0].ship_type = ShipType::EspionageProbe;
        let event = launch_raid(&mut s, &r, p, b, intent, 604_800_000, 1100);
        clear_units(&mut s, t);
        let target = s.bodies[&t].owner;
        s.world
            .as_mut()
            .unwrap()
            .records
            .policies
            .get_mut(&target)
            .unwrap()
            .last_presence_at = if inactive {
            event.at - 604_800_000
        } else {
            event.at - 604_799_999
        };
        let before = settle_production(&s, &s.bodies[&t], event.at, &r).unwrap();
        let result = run(&mut s, &r, p, b, event.at, 1101, Input::Event(event.event));
        let c = apply(&mut s, result);
        assert_eq!(s.bodies[&t].checkpoint.amounts, before.amounts);
        assert_eq!(
            c.world
                .unwrap()
                .audits
                .iter()
                .filter(|v| v["kind"] == "AttackEvidence")
                .count(),
            usize::from(!inactive)
        );
        assert_eq!(
            s.world
                .as_ref()
                .unwrap()
                .records
                .fleets
                .values()
                .next()
                .unwrap()
                .cargo,
            Resources::default()
        );
    }
}
#[test]
fn total_first_round_loss_is_terminal_private_and_never_loots() {
    let (mut s, r, p, b, t) = raid_fixture();
    let mut intent = intent(&s, p, b, t);
    intent.mission = Mission::Attack;
    let event = launch_raid(&mut s, &r, p, b, intent, 1000, 1200);
    clear_units(&mut s, t);
    set_units(
        &mut s,
        &r,
        t,
        ManufacturedItem::Ship(ShipType::LightFighter),
        1000,
    );
    let before = settle_production(&s, &s.bodies[&t], event.at, &r).unwrap();
    let result = run(&mut s, &r, p, b, event.at, 1201, Input::Event(event.event));
    let c = apply(&mut s, result);
    let w = &s.world.as_ref().unwrap().records;
    let f = w.fleets.values().next().unwrap();
    assert_eq!(f.leg, MissionLeg::Destroyed);
    assert!(f.ships.is_empty());
    assert_eq!(f.cargo, Resources::default());
    assert!(
        !c.events
            .iter()
            .any(|e| matches!(e.event, ScheduledEvent::FleetLegDue { .. }))
    );
    assert_eq!(s.bodies[&t].checkpoint.amounts, before.amounts);
    let report = w.reports.values().find(|v| v.kind == "Combat").unwrap();
    let observer = &report.payloads[&p];
    assert_eq!(observer["kind"], "ContactLost");
    for key in [
        "participants",
        "rounds",
        "survivors",
        "debris",
        "recovered",
        "loot",
        "outcome",
        "return_at",
    ] {
        assert!(observer.get(key).is_none(), "{key}");
    }
    assert_eq!(
        observer["own_cargo_loss"]["metal"],
        (10 * SCALE).to_string()
    );
    assert_eq!(report.payloads[&s.bodies[&t].owner]["kind"], "Combat");
    assert!(
        !c.world
            .unwrap()
            .audits
            .iter()
            .any(|a| a["kind"] == "AttackEvidence")
    );
    validate_asset_lineage(&s).unwrap();
}
#[test]
fn missing_or_reowned_target_returns_without_combat_loot_or_contact_evidence() {
    for missing in [false, true] {
        let (mut s, r, p, b, t) = raid_fixture();
        let mut intent = intent(&s, p, b, t);
        intent.mission = Mission::Attack;
        let event = launch_raid(&mut s, &r, p, b, intent, 1000, 1300);
        clear_units(&mut s, t);
        if missing {
            s.bodies.remove(&t);
        } else {
            s.bodies.get_mut(&t).unwrap().owner = p;
        }
        let result = run(&mut s, &r, p, b, event.at, 1301, Input::Event(event.event));
        let c = apply(&mut s, result);
        let w = &s.world.as_ref().unwrap().records;
        assert!(w.reports.values().all(|v| v.kind == "MissionFailed"));
        assert!(c.world.unwrap().audits.is_empty());
        let f = w.fleets.values().next().unwrap();
        assert_eq!(f.leg, MissionLeg::Returning);
        assert_eq!(f.cargo.metal, 10 * SCALE);
    }
}
#[test]
fn seventh_contact_is_nonblocking_and_window_is_exact_from_private_evidence() {
    let (mut s, r, p, b, t) = raid_fixture();
    let mut evidence = vec![];
    let mut at = 1000;
    for n in 0..7 {
        // Keep exact equal investment at launch via the original fixture's inventories.
        for ship in [
            ShipType::SmallCargo,
            ShipType::Recycler,
            ShipType::EspionageProbe,
        ] {
            set_units(&mut s, &r, t, ManufacturedItem::Ship(ship), 2);
        }
        s.world
            .as_mut()
            .unwrap()
            .records
            .policies
            .get_mut(&s.bodies[&t].owner)
            .unwrap()
            .last_presence_at = at;
        let mut intent = intent(&s, p, b, t);
        intent.mission = Mission::Attack;
        intent.cargo = Resources::default();
        let event = launch_raid(&mut s, &r, p, b, intent, at, 1400 + n * 3);
        clear_units(&mut s, t);
        let result = run(
            &mut s,
            &r,
            p,
            b,
            event.at,
            1401 + n * 3,
            Input::Event(event.event),
        );
        let c = apply(&mut s, result);
        evidence.push(
            c.world
                .as_ref()
                .unwrap()
                .audits
                .iter()
                .find(|a| a["kind"] == "AttackEvidence")
                .unwrap()
                .clone(),
        );
        let ret = c
            .events
            .iter()
            .find(|e| matches!(e.event, ScheduledEvent::FleetLegDue { .. }))
            .unwrap();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            ret.at,
            1402 + n * 3,
            Input::Event(ret.event.clone()),
        );
        apply(&mut s, result);
        at += 3_600_000;
    }
    assert_eq!(evidence.len(), 7);
    let first = evidence[0]["at_ms"].as_i64().unwrap();
    // A future reader needs no current presence or report-visible facts to count (t-24h,t].
    let count = |now| {
        evidence
            .iter()
            .filter(|e| {
                let t = e["at_ms"].as_i64().unwrap();
                t > now - 86_400_000 && t <= now
            })
            .count()
    };
    assert_eq!(count(first + 86_400_000 - 1), 7);
    assert_eq!(count(first + 86_400_000), 6);
    for e in evidence {
        assert_eq!(e["target_presence_class"], "Active");
        assert_eq!(e["target_body"], serde_json::json!(t));
        assert_eq!(e["policy_hash"], serde_json::json!(r.hash));
    }
}

#[test]
fn all_attack_outcomes_share_settlement_and_only_victory_plunders() {
    let mut outcomes = BTreeSet::new();
    for seed in 0..128u8 {
        let (mut s, r, p, b, t) = raid_fixture();
        set_units(
            &mut s,
            &r,
            b,
            ManufacturedItem::Ship(ShipType::LightFighter),
            1,
        );
        set_units(
            &mut s,
            &r,
            t,
            ManufacturedItem::Ship(ShipType::LightFighter),
            1,
        );
        let mut intent = intent(&s, p, b, t);
        intent.mission = Mission::Attack;
        intent.ships[0].ship_type = ShipType::LightFighter;
        intent.cargo = Resources::default();
        let event = launch_raid(&mut s, &r, p, b, intent, 1000, 1600);
        clear_units(&mut s, t);
        set_units(
            &mut s,
            &r,
            t,
            ManufacturedItem::Ship(ShipType::LightFighter),
            1,
        );
        s.world.as_mut().unwrap().secret = [seed; 32];
        let before = settle_production(&s, &s.bodies[&t], event.at, &r)
            .unwrap()
            .amounts;
        let result = run(&mut s, &r, p, b, event.at, 1601, Input::Event(event.event));
        let c = apply(&mut s, result);
        let w = &s.world.as_ref().unwrap().records;
        let defender = s.bodies[&t].owner;
        let report = &w
            .reports
            .values()
            .find(|x| x.kind == "Combat")
            .unwrap()
            .payloads[&defender];
        for round in report["rounds"].as_array().unwrap() {
            assert!(
                round.get("shots").is_none(),
                "aggregate fire is derived, not stored"
            );
            let fire = round["fire"].as_array().unwrap();
            assert_eq!(fire.len(), 2);
            assert_eq!(fire[0]["owner"], serde_json::to_value(p).unwrap());
            assert_eq!(fire[0]["side"], "Attacker");
            assert_eq!(fire[1]["owner"], serde_json::to_value(defender).unwrap());
            assert_eq!(fire[1]["side"], "Defender");
        }
        let outcome = report["outcome"].as_str().unwrap();
        outcomes.insert(outcome.to_string());
        let f = w.fleets.values().next().unwrap();
        if outcome != "AttackerVictory" {
            assert_eq!(f.cargo, Resources::default());
            assert_eq!(s.bodies[&t].checkpoint.amounts, before);
        } else {
            assert!(f.cargo.values().iter().sum::<i64>() > 0);
        }
        let evidence = c
            .world
            .unwrap()
            .audits
            .iter()
            .filter(|v| v["kind"] == "AttackEvidence")
            .count();
        assert_eq!(
            evidence,
            usize::from(matches!(outcome, "AttackerVictory" | "Draw"))
        );
        validate_asset_lineage(&s).unwrap();
        if outcomes.len() == 4 {
            break;
        }
    }
    assert_eq!(
        outcomes,
        BTreeSet::from(
            [
                "AttackerVictory",
                "DefenderVictory",
                "MutualDestruction",
                "Draw"
            ]
            .map(String::from)
        )
    );
}
#[test]
fn loaded_fleet_losses_trim_only_overflow_before_plunder_and_preserve_paid_lots() {
    let mut saw_loss = false;
    for seed in 0..100u8 {
        let (mut base, r, p, b, t) = raid_fixture();
        for body in [b, t] {
            set_units(
                &mut base,
                &r,
                body,
                ManufacturedItem::Ship(ShipType::LightFighter),
                30,
            );
            set_units(
                &mut base,
                &r,
                body,
                ManufacturedItem::Ship(ShipType::SmallCargo),
                5,
            );
        }
        for cargo in [100 * SCALE, 24000 * SCALE] {
            let mut s = base.clone();
            let mut intent = intent(&s, p, b, t);
            intent.mission = Mission::Attack;
            intent.cargo = Resources::from_values([cargo, 0, 0]);
            intent.ships = vec![
                ManifestStack {
                    owner: p,
                    ship_type: ShipType::SmallCargo,
                    count: 5,
                },
                ManifestStack {
                    owner: p,
                    ship_type: ShipType::LightFighter,
                    count: 30,
                },
            ];
            s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(100000 * SCALE);
            let event = launch_raid(&mut s, &r, p, b, intent, 1000, 1700);
            clear_units(&mut s, t);
            set_units(
                &mut s,
                &r,
                t,
                ManufacturedItem::Ship(ShipType::LightFighter),
                20,
            );
            s.world.as_mut().unwrap().secret = [seed; 32];
            let result = run(&mut s, &r, p, b, event.at, 1701, Input::Event(event.event));
            apply(&mut s, result);
            let w = &s.world.as_ref().unwrap().records;
            let f = w.fleets.values().next().unwrap();
            let cap = payload_capacity(&f.ships, &r).unwrap();
            let report = &w
                .reports
                .values()
                .find(|r| r.kind == "Combat")
                .unwrap()
                .payloads[&p];
            let lost = report["own_cargo_loss"]["metal"]
                .as_str()
                .unwrap()
                .parse::<i64>()
                .unwrap();
            assert_eq!(lost, (cargo - cap).max(0));
            assert!(f.cargo.values().iter().sum::<i64>() <= cap);
            if cap < 24000 * SCALE && cap > 100 * SCALE {
                saw_loss = true;
            }
            validate_asset_lineage(&s).unwrap();
        }
        if saw_loss {
            break;
        }
    }
    assert!(
        saw_loss,
        "fixture must exercise both retained small cargo and overflow loss"
    );
}
#[test]
fn sequential_raids_observe_remaining_stock_and_recovered_defenses() {
    sequential_defense_raids(DefenseId::RocketLauncher);
    sequential_defense_raids(DefenseId::LightLaser);
    sequential_defense_raids(DefenseId::IonCannon);
}
fn sequential_defense_raids(defense: DefenseId) {
    let (mut s, mut r, p, b, t) = raid_fixture();
    if matches!(defense, DefenseId::LightLaser | DefenseId::IonCannon) {
        r = common::light_laser_rules(&r);
        if defense == DefenseId::IonCannon {
            r = common::ion_cannon_rules(&common::ion_rules(&r));
        }
        s.profile_hash = r.hash.clone();
        for policy in s.world.as_mut().unwrap().records.policies.values_mut() {
            policy.policy_hash = r.hash.clone();
        }
        for research in s.research.values_mut() {
            research.levels.insert(ResearchId::LaserTechnology, 0);
            if defense == DefenseId::IonCannon {
                research.levels.insert(ResearchId::IonTechnology, 0);
            }
        }
    }
    // Ion shields need a larger attack to exercise total destruction and recovery.
    let fighters = if defense == DefenseId::IonCannon {
        300
    } else {
        100
    };
    for body in [b, t] {
        set_units(
            &mut s,
            &r,
            body,
            ManufacturedItem::Ship(ShipType::LightFighter),
            fighters,
        );
    }
    let mut intent = intent(&s, p, b, t);
    intent.mission = Mission::Attack;
    intent.cargo = Resources::default();
    intent.ships.push(ManifestStack {
        owner: p,
        ship_type: ShipType::LightFighter,
        count: fighters,
    });
    let event = launch_raid(&mut s, &r, p, b, intent.clone(), 1000, 1800);
    clear_units(&mut s, t);
    set_units(&mut s, &r, t, ManufacturedItem::Defense(defense), 10);
    let result = run(&mut s, &r, p, b, event.at, 1801, Input::Event(event.event));
    let c = apply(&mut s, result);
    let previous = s
        .inventories
        .iter()
        .find(|v| v.body == t && v.item == ManufacturedItem::Defense(defense))
        .unwrap()
        .count;
    assert!(
        previous > 0 && previous < 10,
        "destroyed defenses recover independently"
    );
    let first_report = &s
        .world
        .as_ref()
        .unwrap()
        .records
        .reports
        .values()
        .find(|v| v.event == InputId(Uuid::from_u128(1801)))
        .unwrap()
        .payloads[&s.bodies[&t].owner];
    let losses = first_report["gross_losses"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["side"] == "Defender")
        .unwrap();
    assert_eq!(losses["units"][0]["count"], "10");
    // Defense losses never produce debris; any debris is from lost attacking ships.
    let attacker_losses = first_report["gross_losses"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["side"] == "Attacker")
        .unwrap();
    let mut lost = [0i64; 2];
    for unit in attacker_losses["units"].as_array().unwrap() {
        let item: ManufacturedItem = serde_json::from_value(unit["item"].clone()).unwrap();
        let count: i64 = unit["count"].as_str().unwrap().parse().unwrap();
        let cost = &r
            .artifact
            .world
            .as_ref()
            .unwrap()
            .combat
            .units
            .iter()
            .find(|v| v.item == item)
            .unwrap()
            .cost;
        for k in 0..2 {
            lost[k] += count * cost[k];
        }
    }
    assert_eq!(
        first_report["debris"]["metal"],
        (lost[0] * 3000 / 10000 * SCALE).to_string()
    );
    assert_eq!(
        first_report["debris"]["crystal"],
        (lost[1] * 3000 / 10000 * SCALE).to_string()
    );
    let ret = c
        .events
        .iter()
        .find(|e| matches!(e.event, ScheduledEvent::FleetLegDue { .. }))
        .unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        ret.at,
        1802,
        Input::Event(ret.event.clone()),
    );
    apply(&mut s, result);
    // Already authorized second contact is represented by the same immutable intent; target is now inactive to permit the lower investment.
    let at = 604_801_000;
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&s.bodies[&t].owner)
        .unwrap()
        .last_presence_at = 0;
    intent.ships.retain(|x| x.ship_type == ShipType::SmallCargo);
    let event = launch_raid(&mut s, &r, p, b, intent, at, 1803);
    let before = settle_production(&s, &s.bodies[&t], event.at, &r)
        .unwrap()
        .amounts;
    let result = run(&mut s, &r, p, b, event.at, 1804, Input::Event(event.event));
    apply(&mut s, result);
    let report = s
        .world
        .as_ref()
        .unwrap()
        .records
        .reports
        .values()
        .find(|v| v.event == InputId(Uuid::from_u128(1804)))
        .unwrap();
    let full = &report.payloads[&s.bodies[&t].owner];
    let defender = full["participants"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["side"] == "Defender")
        .unwrap();
    let count = defender["units"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["item"]["id"] == serde_json::to_value(defense).unwrap())
        .map_or(0, |x| x["count"].as_str().unwrap().parse::<i64>().unwrap());
    assert_eq!(count, previous);
    for k in 0..3 {
        assert!(s.bodies[&t].checkpoint.amounts.values()[k] <= before.values()[k]);
    }
}

#[test]
fn refreshed_actor_presence_rejects_new_attack_without_debit_but_not_committed_contact() {
    let (mut s, r, p, b, t) = raid_fixture();
    let other = s.bodies[&t].owner;
    for l in &mut s.world.as_mut().unwrap().records.lots {
        if l.owner == other {
            l.unit_value_micro *= 10;
        }
    }
    let at = 604_800_000;
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&other)
        .unwrap()
        .last_presence_at = at;
    let mut intent = intent(&s, p, b, t);
    intent.mission = Mission::Attack;
    let q = quote_fleet(&s, p, &intent, at, &r).unwrap();
    let mut presence = common::input(
        &s,
        &r,
        Actor::Player(p),
        at,
        1900,
        Input::Command(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: Some(b),
                cause: PresenceCause::BodyVisit,
                paired_command_id: None,
            },
        }),
    );
    presence.protocol = 4;
    presence.schema_version = 4;
    let result = transition(&s, &presence, &r);
    apply(&mut s, result);
    let before = s.bodies[&b].clone();
    let inventory = s.inventories.clone();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        at,
        1901,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    assert_eq!(
        result,
        TransitionResult::Rejected(GameError::BeginnerProtected)
    );
    assert_eq!(s.bodies[&b], before);
    assert_eq!(s.inventories, inventory);
}
#[test]
fn competing_attacks_cannot_double_spend_last_ship_resources_or_slot() {
    for guard in [
        GameError::NoFleetSlot,
        GameError::InsufficientShips,
        GameError::InsufficientResources,
    ] {
        let (mut s, r, p, b, t) = raid_fixture();
        if guard != GameError::NoFleetSlot {
            s.research
                .get_mut(&p)
                .unwrap()
                .levels
                .insert(ResearchId::ComputerTechnology, 1);
            let id = OperationId(Uuid::from_u128(2000));
            s.world.as_mut().unwrap().records.lots.push(AssetLot {
                id,
                owner: p,
                item: CatalogKey::Research(ResearchId::ComputerTechnology),
                level: Some(1),
                location: AssetLocation::Player,
                quantity: 1,
                unit_value_micro: 1000 * SCALE,
                rules_hash: r.hash.clone(),
                source_operation: id,
                acquired_at: 0,
                acquired_sequence: 0,
            });
        }
        if guard == GameError::InsufficientResources {
            set_units(
                &mut s,
                &r,
                b,
                ManufacturedItem::Ship(ShipType::SmallCargo),
                4,
            );
        }
        let mut intent = intent(&s, p, b, t);
        intent.mission = Mission::Attack;
        intent.ships[0].count = 2;
        if guard == GameError::InsufficientResources {
            intent.cargo.metal = 7000 * SCALE;
        }
        let q = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
        launch_raid(&mut s, &r, p, b, intent.clone(), 1000, 2001);
        let before = s.bodies[&b].clone();
        let inventory = s.inventories.clone();
        let world = s.world.as_ref().unwrap().records.fleets.clone();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            1000,
            2002,
            Input::Command(Command::World {
                action: WorldAction::LaunchFleet {
                    intent,
                    expected_terms_hash: q.terms_hash,
                },
            }),
        );
        assert_eq!(result, TransitionResult::Rejected(guard));
        assert_eq!(s.bodies[&b], before);
        assert_eq!(s.inventories, inventory);
        assert_eq!(s.world.as_ref().unwrap().records.fleets, world);
    }
}

fn fixture_building(s: &mut GameState, r: &Ruleset, b: BodyId, k: Building, levels: u32) {
    let owner = s.bodies[&b].owner;
    s.bodies.get_mut(&b).unwrap().levels.insert(k, levels);
    for level in 1..=levels {
        let id = OperationId(derived_id(InputId(b.0), &format!("fixture:{k:?}:{level}")));
        s.world.as_mut().unwrap().records.lots.push(AssetLot {
            id,
            owner,
            item: CatalogKey::Building(k),
            level: Some(level),
            location: AssetLocation::Body(b),
            quantity: 1,
            unit_value_micro: 1000 * SCALE,
            rules_hash: r.hash.clone(),
            source_operation: id,
            acquired_at: 0,
            acquired_sequence: 0,
        });
    }
}
#[test]
fn equal_millisecond_research_manufacture_and_contact_use_supplied_durable_order() {
    for completions_first in [false, true] {
        let (mut s, r, p, b, t) = raid_fixture();
        let defender = s.bodies[&t].owner;
        fixture_building(&mut s, &r, b, Building::ResearchLab, 4);
        fixture_building(&mut s, &r, t, Building::Shipyard, 1);
        let mut intent = intent(&s, p, b, t);
        intent.mission = Mission::Attack;
        intent.cargo = Resources::default();
        let duration = quote_fleet(&s, p, &intent, 0, &r).unwrap().duration_ms;
        let target_time = 1_000_000;
        let research_request = QuoteRequest::Research {
            host: b,
            research: ResearchId::WeaponsTechnology,
        };
        let manufacture_request = QuoteRequest::Manufacture {
            body: t,
            item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
            quantity: 1,
        };
        let research = inspect_progression(&s, Actor::Player(p), &research_request, 0, &r).unwrap();
        let manufacture =
            inspect_progression(&s, Actor::Player(defender), &manufacture_request, 0, &r).unwrap();
        let research_ms = research.estimates.unwrap().final_due_at;
        let manufacture_ms = manufacture.estimates.unwrap().final_due_at;
        let mut starts = vec![
            (target_time - duration, 0),
            (target_time - research_ms, 1),
            (target_time - manufacture_ms, 2),
        ];
        starts.sort();
        let mut events = vec![];
        for (index, (at, kind)) in starts.into_iter().enumerate() {
            let n = 2100 + index as u128;
            for category in ["construction:0", "research:0", "manufacturing:0"] {
                let id = OperationId(derived_id(InputId(Uuid::from_u128(n)), category));
                s.coverage.operations.insert(id);
                s.coverage.research_operation_ids.insert(id);
                s.coverage.manufacturing_operation_ids.insert(id);
            }
            let (owner, origin, command) = match kind {
                0 => (
                    p,
                    b,
                    Command::World {
                        action: WorldAction::LaunchFleet {
                            intent: intent.clone(),
                            expected_terms_hash: quote_fleet(&s, p, &intent, at, &r)
                                .unwrap()
                                .terms_hash,
                        },
                    },
                ),
                1 => (
                    p,
                    b,
                    Command::StartResearch {
                        host: b,
                        research: ResearchId::WeaponsTechnology,
                        expected_terms_hash: inspect_progression(
                            &s,
                            Actor::Player(p),
                            &research_request,
                            at,
                            &r,
                        )
                        .unwrap()
                        .terms_hash
                        .unwrap(),
                    },
                ),
                _ => (
                    defender,
                    t,
                    Command::StartManufacture {
                        body: t,
                        item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
                        quantity: 1,
                        expected_terms_hash: inspect_progression(
                            &s,
                            Actor::Player(defender),
                            &manufacture_request,
                            at,
                            &r,
                        )
                        .unwrap()
                        .terms_hash
                        .unwrap(),
                    },
                ),
            };
            let result = run(&mut s, &r, owner, origin, at, n, Input::Command(command));
            let c = apply(&mut s, result);
            let event = c.events[0].clone();
            assert_eq!(event.at, target_time);
            events.push((kind, event));
        }
        events.sort_by_key(|(kind, _)| {
            if completions_first {
                if *kind == 0 { 3 } else { *kind }
            } else {
                *kind
            }
        });
        let mut contact_report = None;
        for (index, (kind, event)) in events.into_iter().enumerate() {
            let result = run(
                &mut s,
                &r,
                p,
                b,
                target_time,
                2110 + index as u128,
                Input::Event(event.event),
            );
            apply(&mut s, result);
            if kind == 0 {
                contact_report = s
                    .world
                    .as_ref()
                    .unwrap()
                    .records
                    .reports
                    .values()
                    .find(|v| v.kind == "Combat")
                    .cloned();
            }
        }
        let report = contact_report.unwrap();
        let full = &report.payloads[&defender];
        let participants = full["participants"].as_array().unwrap();
        let attacker = participants
            .iter()
            .find(|v| v["side"] == "Attacker")
            .unwrap();
        assert_eq!(attacker["technology"][0], u32::from(completions_first));
        let defending = participants
            .iter()
            .find(|v| v["side"] == "Defender")
            .unwrap();
        assert_eq!(
            defending["units"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v["item"]["id"] == "RocketLauncher"),
            completions_first
        );
        assert_eq!(s.research[&p].levels[&ResearchId::WeaponsTechnology], 1);
        assert_eq!(
            s.world.as_ref().unwrap().records.reports[&report.id],
            report
        );
        validate_asset_lineage(&s).unwrap();
    }
}

#[test]
fn detected_escorted_espionage_victory_observes_before_battle_and_never_plunders() {
    let mut detected = false;
    for seed in 0..32u8 {
        let (mut s, r, p, b, t) = raid_fixture();
        for body in [b, t] {
            set_units(
                &mut s,
                &r,
                body,
                ManufacturedItem::Ship(ShipType::LightFighter),
                80,
            );
        }
        let mut intent = intent(&s, p, b, t);
        intent.mission = Mission::Espionage;
        intent.ships = vec![
            ManifestStack {
                owner: p,
                ship_type: ShipType::LightFighter,
                count: 80,
            },
            ManifestStack {
                owner: p,
                ship_type: ShipType::EspionageProbe,
                count: 1,
            },
        ];
        let event = launch_raid(&mut s, &r, p, b, intent, 1000, 2200);
        clear_units(&mut s, t);
        set_units(
            &mut s,
            &r,
            t,
            ManufacturedItem::Ship(ShipType::EspionageProbe),
            100,
        );
        s.world.as_mut().unwrap().secret = [seed; 32];
        let before = settle_production(&s, &s.bodies[&t], event.at, &r)
            .unwrap()
            .amounts;
        let result = run(&mut s, &r, p, b, event.at, 2201, Input::Event(event.event));
        let c = apply(&mut s, result);
        let w = &s.world.as_ref().unwrap().records;
        assert_eq!(s.bodies[&t].checkpoint.amounts, before);
        assert!(
            !c.world
                .unwrap()
                .audits
                .iter()
                .any(|a| a["kind"] == "AttackEvidence")
        );
        let spy = &w
            .reports
            .values()
            .find(|v| v.kind == "Espionage")
            .unwrap()
            .payloads[&p];
        assert_eq!(
            spy["resources"]["value"]["metal"],
            (before.metal / SCALE * SCALE).to_string()
        );
        if let Some(combat) = w.reports.values().find(|v| v.kind == "Combat") {
            let full = &combat.payloads[&s.bodies[&t].owner];
            assert_eq!(full["outcome"], "AttackerVictory");
            assert_eq!(full["loot"], wire_resources(Resources::default()));
            assert_eq!(w.fleets.values().next().unwrap().cargo.metal, 10 * SCALE);
            detected = true;
            break;
        }
    }
    assert!(detected, "fixture must invoke shared combat");
}

#[test]
fn simultaneous_attack_arrivals_debit_remaining_stock_once_in_sequence() {
    let (mut s, r, p, b, t) = raid_fixture();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::ComputerTechnology, 1);
    let id = OperationId(Uuid::from_u128(2300));
    s.world.as_mut().unwrap().records.lots.push(AssetLot {
        id,
        owner: p,
        item: CatalogKey::Research(ResearchId::ComputerTechnology),
        level: Some(1),
        location: AssetLocation::Player,
        quantity: 1,
        unit_value_micro: 1000 * SCALE,
        rules_hash: r.hash.clone(),
        source_operation: id,
        acquired_at: 0,
        acquired_sequence: 0,
    });
    let mut intent = intent(&s, p, b, t);
    intent.mission = Mission::Attack;
    intent.cargo = Resources::default();
    let first = launch_raid(&mut s, &r, p, b, intent.clone(), 1000, 2301);
    let second = launch_raid(&mut s, &r, p, b, intent, 1000, 2302);
    assert_eq!(first.at, second.at);
    clear_units(&mut s, t);
    let initial = Resources::from_values([12000 * SCALE + 999999, 2000 * SCALE, 0]);
    s.bodies.get_mut(&t).unwrap().checkpoint.amounts = initial;
    s.bodies.get_mut(&t).unwrap().checkpoint.at = first.at;
    for (n, event) in [first, second].into_iter().enumerate() {
        let result = run(
            &mut s,
            &r,
            p,
            b,
            event.at,
            2303 + n as u128,
            Input::Event(event.event),
        );
        apply(&mut s, result);
    }
    let w = &s.world.as_ref().unwrap().records;
    for k in 0..3 {
        assert_eq!(
            s.bodies[&t].checkpoint.amounts.values()[k]
                + w.fleets.values().map(|f| f.cargo.values()[k]).sum::<i64>(),
            initial.values()[k]
        );
    }
    let mut metal: Vec<_> = w.fleets.values().map(|f| f.cargo.metal).collect();
    metal.sort();
    assert_ne!(metal[0], metal[1]);
    assert_eq!(s.bodies[&t].checkpoint.amounts.metal % SCALE, 999999);
}

#[test]
fn fleet_slot_limit_includes_base_slot_without_u32_overflow() {
    assert_eq!(fleet_slot_limit(0), 1);
    assert_eq!(fleet_slot_limit(4), 5);
    assert_eq!(fleet_slot_limit(u32::MAX), 4_294_967_296);
}

#[test]
fn rules_activation_preserves_flight_terms_and_reports_current_resolution() {
    let (mut s, old, p, b, t) = raid_fixture();
    let intent = intent(&s, p, b, t);
    let arrival = launch_raid(&mut s, &old, p, b, intent, 1000, 8000);
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
    let mut artifact = old.artifact.clone();
    artifact
        .ships
        .get_mut(&ShipType::SmallCargo)
        .unwrap()
        .base_speed = 2500;
    artifact.ships.get_mut(&ShipType::SmallCargo).unwrap().fuel = 20;
    let current = Ruleset::from_artifact(artifact, old.speed).unwrap();
    s.profile_hash = current.hash.clone();
    let mut i = common::input(
        &s,
        &old,
        Actor::Scheduler,
        arrival.at,
        8001,
        Input::Event(arrival.event),
    );
    i.protocol = 4;
    i.schema_version = 4;
    let result = transition(&s, &i, &current);
    let arrived = apply(&mut s, result);
    let returning = &s.world.as_ref().unwrap().records.fleets[&fleet.id];
    assert_eq!(returning.terms, fleet.terms);
    assert_eq!(returning.due_at, arrival.at + fleet.terms.duration_ms);
    assert!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .reports
            .values()
            .all(|r| r.rules_hash == current.hash)
    );
    let returned = arrived.events[0].clone();
    let result = run(
        &mut s,
        &current,
        p,
        b,
        returned.at,
        8002,
        Input::Event(returned.event),
    );
    apply(&mut s, result);
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets[&fleet.id].leg,
        MissionLeg::Returned
    );
}

#[test]
fn impulse_switch_mixed_fuel_stale_quote_and_committed_return() {
    let (mut s, old, p, b, t) = fixture();
    let r = common::impulse_rules(&old);
    s.profile_hash = r.hash.clone();
    for research in s.research.values_mut() {
        research.levels.insert(ResearchId::ImpulseDrive, 0);
    }
    fixture_research(&mut s, &r, p, ResearchId::ImpulseDrive, 4);
    fixture_research(&mut s, &r, p, ResearchId::CombustionDrive, 6);
    let intent = intent(&s, p, b, t);
    let before = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    assert_eq!(before.speeds, vec![(ShipType::SmallCargo, "8000".into())]);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        8000,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: intent.clone(),
                expected_terms_hash: before.terms_hash.clone(),
            },
        }),
    );
    let launched = apply(&mut s, result);
    fixture_research(&mut s, &r, p, ResearchId::ComputerTechnology, 2);
    fixture_research(&mut s, &r, p, ResearchId::ImpulseDrive, 5);
    let after = quote_fleet(&s, p, &intent, 1000, &r).unwrap();
    assert_eq!(after.speeds, vec![(ShipType::SmallCargo, "20000".into())]);
    assert!(after.duration_ms < before.duration_ms);
    assert_eq!(
        (after.duration_ms, after.fuel),
        exact_flight_arithmetic(after.distance, &[(20000, 20, 1)], 100, 10).unwrap()
    );
    let mut new_launch = s.clone();
    let stock = new_launch.bodies[&b].checkpoint.amounts;
    let result = run(
        &mut new_launch,
        &r,
        p,
        b,
        1000,
        8010,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: intent.clone(),
                expected_terms_hash: after.terms_hash.clone(),
            },
        }),
    );
    apply(&mut new_launch, result);
    assert_eq!(
        new_launch.bodies[&b].checkpoint.amounts.deuterium,
        stock.deuterium - after.fuel
    );
    assert_eq!(
        new_launch.bodies[&b].checkpoint.amounts.metal,
        stock.metal - intent.cargo.metal
    );
    assert!(
        new_launch
            .world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .any(|f| f.terms == after)
    );
    // Recall uses elapsed time and keeps the original fuel payment after I5.
    let mut recalling = s.clone();
    let original = recalling
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .values()
        .next()
        .unwrap()
        .clone();
    let stock = recalling.bodies[&b].checkpoint.clone();
    let result = run(
        &mut recalling,
        &r,
        p,
        b,
        2000,
        8011,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: original.id },
        }),
    );
    let recalled = apply(&mut recalling, result);
    assert_eq!(recalled.events[0].at, 3000);
    assert_eq!(recalling.bodies[&b].checkpoint, stock);
    assert_eq!(
        recalling.world.as_ref().unwrap().records.fleets[&original.id].terms,
        original.terms
    );
    let stale = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        8001,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: intent.clone(),
                expected_terms_hash: before.terms_hash,
            },
        }),
    );
    assert_eq!(stale, TransitionResult::Rejected(GameError::QuoteChanged));
    // The mixed fleet uses its slowest ship for duration, each own speed/fuel in the sum.
    let mut mixed = intent.clone();
    mixed.ships.push(ManifestStack {
        owner: p,
        ship_type: ShipType::Recycler,
        count: 1,
    });
    let mixed = quote_fleet(&s, p, &mixed, 1000, &r).unwrap();
    assert!(mixed.speeds.contains(&(ShipType::Recycler, "3200".into())));
    assert_eq!(
        (mixed.duration_ms, mixed.fuel),
        exact_flight_arithmetic(mixed.distance, &[(20000, 20, 1), (3200, 300, 1)], 100, 10)
            .unwrap()
    );
    fixture_research(&mut s, &r, p, ResearchId::ImpulseDrive, 17);
    assert_eq!(
        ship_propulsion(&r.artifact.ships[&ShipType::Recycler], &s.research[&p]).unwrap(),
        (3200, 300)
    );
    // Serialization/restart and research completion cannot change an outbound obligation.
    s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    let arrival = &launched.events[0];
    let result = run(
        &mut s,
        &r,
        p,
        b,
        arrival.at,
        8002,
        Input::Event(arrival.event.clone()),
    );
    let arrived = apply(&mut s, result);
    assert_eq!(arrived.events[0].at, arrival.at + before.duration_ms);
    let returned = &arrived.events[0];
    let result = run(
        &mut s,
        &r,
        p,
        b,
        returned.at,
        8003,
        Input::Event(returned.event.clone()),
    );
    apply(&mut s, result);
    validate_asset_lineage(&s).unwrap();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .remove(&ResearchId::ImpulseDrive);
    assert_eq!(
        quote_fleet(&s, p, &intent, returned.at, &r),
        Err(GameError::PolicyUnavailable)
    );
}

fn fixture_research(s: &mut GameState, r: &Ruleset, p: PlayerId, research: ResearchId, level: u32) {
    let previous = s.research[&p].levels[&research];
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(research, level);
    for increment in previous + 1..=level {
        let id = OperationId(derived_id(
            InputId(p.0),
            &format!("fixture:{research:?}:{increment}"),
        ));
        s.world.as_mut().unwrap().records.lots.push(AssetLot {
            id,
            owner: p,
            item: CatalogKey::Research(research),
            level: Some(increment),
            location: AssetLocation::Player,
            quantity: 1,
            unit_value_micro: 1000 * SCALE,
            rules_hash: r.hash.clone(),
            source_operation: id,
            acquired_at: 0,
            acquired_sequence: 0,
        });
    }
}

#[path = "missions/colonization.rs"]
mod colonization;

#[test]
fn espionage_contract_keeps_research_added_by_rules_updates() {
    let (mut s, baseline, p, b, t) = raid_fixture();
    let r = common::astrophysics_rules(&baseline);
    s.profile_hash = r.hash.clone();
    for research in s.research.values_mut() {
        for key in r.research_keys() {
            research.levels.entry(key).or_insert(0);
        }
    }
    for policy in s.world.as_mut().unwrap().records.policies.values_mut() {
        policy.policy_hash = r.hash.clone();
    }
    set_units(
        &mut s,
        &r,
        b,
        ManufacturedItem::Ship(ShipType::EspionageProbe),
        7,
    );
    let mut mission = intent(&s, p, b, t);
    mission.mission = Mission::Espionage;
    mission.cargo = Resources::default();
    mission.ships = vec![ManifestStack {
        owner: p,
        ship_type: ShipType::EspionageProbe,
        count: 7,
    }];
    let due = launch_raid(&mut s, &r, p, b, mission, 1000, 4000);
    clear_units(&mut s, t);
    let result = run(&mut s, &r, p, b, due.at, 4001, Input::Event(due.event));
    apply(&mut s, result);
    let payload = &s
        .world
        .as_ref()
        .unwrap()
        .records
        .reports
        .values()
        .find(|report| report.kind == "Espionage")
        .unwrap()
        .payloads[&p];
    let expected: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../contracts/fixtures/espionage-expanded.json"
    ))
    .unwrap();
    assert_eq!(
        payload, &expected,
        "The browser validates this same engine-produced observation"
    );
}

#[path = "missions/heavy_fighter.rs"]
mod heavy_fighter;

#[test]
fn planet_renaming_is_public_free_repeatable_and_owner_only() {
    let (mut s, r, p, b, target) = fixture();
    let original = s.bodies[&b].clone();
    let rename = |body, name: &str| {
        Input::Command(Command::World {
            action: WorldAction::RenamePlanet {
                body,
                name: name.into(),
            },
        })
    };
    // Presentation changes remain available during vacation.
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .vacation = true;
    for (n, name) in [(5000, "  Terra 🪐  "), (5001, "世界"), (5002, "世界")] {
        let result = run(&mut s, &r, p, b, 1000, n, rename(b, name));
        let change = apply(&mut s, result);
        assert_eq!(s.bodies[&b].name.as_deref(), Some(name.trim()));
        assert_eq!(s.bodies[&b].checkpoint, original.checkpoint);
        assert_eq!(s.bodies[&b].levels, original.levels);
        assert!(change.events.is_empty());
        assert!(change.inventories.is_empty());
        assert_eq!(change.affected_viewers, BTreeSet::from([p]));
        let galaxy = galaxy_system(
            &s,
            s.bodies[&target].owner,
            1,
            s.bodies[&b].coordinates.system,
            1000,
            &r,
        )
        .unwrap();
        assert_eq!(
            galaxy
                .positions
                .iter()
                .find_map(|position| position.body.as_ref().filter(|body| body.id == b))
                .unwrap()
                .name
                .as_deref(),
            Some(name.trim())
        );
    }
    for (id, expected) in [
        (target, GameError::NotOwned),
        (BodyId(Uuid::new_v4()), GameError::NotOwned),
    ] {
        assert!(
            matches!(run(&mut s, &r, p, id, 1000, 5010, rename(id, "Stolen")), TransitionResult::Rejected(e) if e == expected)
        );
    }
    let other = s.bodies[&target].owner;
    let result = run(
        &mut s,
        &r,
        other,
        target,
        1000,
        5011,
        rename(target, "世界"),
    );
    apply(&mut s, result);
    assert_eq!(
        s.bodies[&target].name, s.bodies[&b].name,
        "duplicate names are permitted"
    );
    s.bodies.get_mut(&b).unwrap().kind = BodyKind::Moon;
    assert!(matches!(
        run(&mut s, &r, p, b, 1000, 5012, rename(b, "Moon")),
        TransitionResult::Rejected(GameError::InvalidInput)
    ));
}

#[test]
fn unnamed_body_journals_keep_their_original_wire_shape() {
    let (s, _, _, b, _) = fixture();
    let encoded = serde_json::to_value(&s.bodies[&b]).unwrap();
    assert!(encoded.get("name").is_none());
    let decoded: Body = serde_json::from_value(encoded.clone()).unwrap();
    assert_eq!(serde_json::to_value(decoded).unwrap(), encoded);
}

#[test]
fn universe_protection_multiplier_controls_galaxy_quotes_and_launches() {
    for multiplier in [2, 5, 10, 20] {
        for mission in [Mission::Attack, Mission::Espionage] {
            for reverse in [false, true] {
                let (mut s, rules, player, origin, target) = raid_fixture();
                let other = s.bodies[&target].owner;
                for lot in &mut s.world.as_mut().unwrap().records.lots {
                    if lot.owner == other {
                        lot.unit_value_micro *= 10;
                    }
                }
                let mut artifact = rules.artifact;
                artifact
                    .world
                    .as_mut()
                    .unwrap()
                    .beginner_protection_multiplier = multiplier;
                let rules = Ruleset::from_artifact(artifact, rules.speed).unwrap();
                s.profile_hash = rules.hash.clone();
                let (player, origin, target) = if reverse {
                    (other, target, origin)
                } else {
                    (player, origin, target)
                };
                let mut request = intent(&s, player, origin, target);
                request.mission = mission;
                if mission == Mission::Espionage {
                    request.ships[0].ship_type = ShipType::EspionageProbe;
                    request.cargo = Resources::all(0);
                }
                let protected = multiplier < 10;
                let blocker = galaxy_system(&s, player, 1, 1, 0, &rules)
                    .unwrap()
                    .positions
                    .into_iter()
                    .filter_map(|p| p.body)
                    .find(|body| body.id == target)
                    .unwrap()
                    .attack_blocker;
                assert_eq!(blocker, protected.then_some(GameError::BeginnerProtected));
                let quote = quote_fleet(&s, player, &request, 0, &rules);
                let hash = if protected {
                    assert_eq!(quote, Err(GameError::BeginnerProtected));
                    Hash("unusable-quote".into())
                } else {
                    quote.unwrap().terms_hash
                };
                let result = run(
                    &mut s,
                    &rules,
                    player,
                    origin,
                    0,
                    9900,
                    Input::Command(Command::World {
                        action: WorldAction::LaunchFleet {
                            intent: request,
                            expected_terms_hash: hash,
                        },
                    }),
                );
                if protected {
                    assert_eq!(
                        result,
                        TransitionResult::Rejected(GameError::BeginnerProtected)
                    );
                } else {
                    apply(&mut s, result);
                    assert_eq!(s.world.as_ref().unwrap().records.fleets.len(), 1);
                }
            }
        }
    }
}

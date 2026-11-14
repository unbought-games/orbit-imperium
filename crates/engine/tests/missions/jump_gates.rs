use super::*;

fn setup(speed: i32) -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let r = standard_signup_rules(UniverseProfile::signup(2, 100).unwrap(), speed).unwrap();
    let (mut s, r, p, parent, other_parent) = fixture_with_rules(r);
    for body in s.bodies.values_mut() {
        body.levels = r.building_keys().into_iter().map(|k| (k, 0)).collect();
    }
    for research in s.research.values_mut() {
        research.levels = r.research_keys().into_iter().map(|k| (k, 0)).collect();
    }
    let other = s.bodies[&other_parent].owner;
    s.bodies.get_mut(&other_parent).unwrap().owner = p;
    for stock in s.inventories.iter_mut().filter(|x| x.body == other_parent) {
        stock.owner = p;
    }
    for lot in &mut s.world.as_mut().unwrap().records.lots {
        if lot.location == AssetLocation::Body(other_parent) {
            lot.owner = p;
        }
    }
    s.coverage.inventory_owners.remove(&(other_parent, other));
    s.coverage.inventory_owners.insert((other_parent, p));
    let source = moons::add_moon(&mut s, parent, 91000);
    let destination = moons::add_moon(&mut s, other_parent, 91001);
    for id in [source, destination] {
        s.bodies
            .get_mut(&id)
            .unwrap()
            .levels
            .insert(Building::JumpGate, 1);
        let lot = OperationId(derived_id(InputId(id.0), "gate"));
        s.world.as_mut().unwrap().records.lots.push(AssetLot {
            id: lot,
            owner: p,
            item: CatalogKey::Building(Building::JumpGate),
            level: Some(1),
            location: AssetLocation::Body(id),
            quantity: 1,
            unit_value_micro: 8_000_000 * SCALE,
            rules_hash: r.hash.clone(),
            source_operation: lot,
            acquired_at: 0,
            acquired_sequence: 0,
        });
    }
    for body in s.bodies.values() {
        s.collection_revisions
            .insert(format!("inventory:{}:{}", body.id, body.owner), 0);
    }
    s.world.as_mut().unwrap().covered_gate_bodies = s.bodies.keys().copied().collect();
    set_units(
        &mut s,
        &r,
        source,
        ManufacturedItem::Ship(ShipType::SmallCargo),
        20,
    );
    validate_asset_lineage(&s).unwrap();
    (s, r, p, source, destination)
}
fn selection(p: PlayerId, source: BodyId, destination: BodyId) -> JumpIntent {
    JumpIntent {
        source,
        destination,
        ships: vec![ManifestStack {
            owner: p,
            ship_type: ShipType::SmallCargo,
            count: 7,
        }],
    }
}
fn jump(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    intent: JumpIntent,
    at: i64,
    n: u128,
) -> TransitionResult {
    let q = quote_jump(s, p, &intent, at, r).unwrap();
    run(
        s,
        r,
        p,
        intent.source,
        at,
        n,
        Input::Command(Command::World {
            action: WorldAction::JumpShips {
                intent,
                expected_terms_hash: q.terms_hash,
            },
        }),
    )
}
fn count(s: &GameState, b: BodyId) -> i64 {
    s.inventories
        .iter()
        .filter(|x| x.body == b && x.item == ManufacturedItem::Ship(ShipType::SmallCargo))
        .map(|x| x.count)
        .sum()
}
#[test]
fn jump_moves_inventory_and_value_without_resources_flight_events_or_score_changes() {
    let (mut s, r, p, a, b) = setup(1);
    let bodies = s.bodies.clone();
    let value = value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap();
    let result = jump(&mut s, &r, p, selection(p, a, b), 1000, 91002);
    let c = apply(&mut s, result);
    assert_eq!((count(&s, a), count(&s, b)), (13, 7));
    assert_eq!(s.bodies, bodies);
    assert!(c.events.is_empty());
    assert!(c.fleets.is_empty());
    assert!(c.world.as_ref().unwrap().score_deltas.is_empty());
    assert!(s.world.as_ref().unwrap().records.fleets.is_empty());
    assert_eq!(
        value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap(),
        value
    );
    assert_eq!(c.affected_viewers, BTreeSet::from([p]));
    validate_asset_lineage(&s).unwrap();
    for body in [a, b] {
        assert_eq!(jump_gate_status(&s, body, &r).unwrap().ready_at, 3_601_000);
    }
    // Landed ships are ordinary inventory, but the gate never supplies fuel.
    let mut flight = intent(&s, p, b, a);
    flight.cargo = Resources::default();
    assert_eq!(
        quote_fleet(&s, p, &flight, 1001, &r),
        Err(GameError::InsufficientResources)
    );
}
#[test]
fn both_ends_share_cooldown_and_exact_boundary_survives_round_trip_and_upgrade() {
    for (speed, duration) in [(1, 3_600_000), (4, 900_000), (7, 514_286), (100, 36_000)] {
        let (mut s, r, p, a, b) = setup(speed);
        let result = jump(&mut s, &r, p, selection(p, a, b), 1000, 91003);
        apply(&mut s, result);
        let mut restored: GameState =
            serde_json::from_value(serde_json::to_value(&s).unwrap()).unwrap();
        restored
            .bodies
            .get_mut(&a)
            .unwrap()
            .levels
            .insert(Building::JumpGate, 5);
        for request in [selection(p, a, b), selection(p, b, a)] {
            assert_eq!(
                quote_jump(&restored, p, &request, 1000 + duration - 1, &r),
                Err(GameError::GateCooling)
            );
            assert!(quote_jump(&restored, p, &request, 1000 + duration, &r).is_ok());
        }
        assert_eq!(
            jump_gate_status(&restored, a, &r).unwrap().ready_at,
            1000 + duration
        );
    }
}
#[test]
fn eligibility_rejects_invalid_ownership_counts_satellites_and_missing_gate_facts() {
    let (s, r, p, a, b) = setup(1);
    let base = selection(p, a, b);
    for (request, error) in [
        (
            JumpIntent {
                destination: a,
                ..base.clone()
            },
            GameError::InvalidInput,
        ),
        (
            JumpIntent {
                ships: vec![],
                ..base.clone()
            },
            GameError::InvalidInput,
        ),
        (
            JumpIntent {
                ships: vec![base.ships[0].clone(), base.ships[0].clone()],
                ..base.clone()
            },
            GameError::InvalidInput,
        ),
        (
            JumpIntent {
                ships: vec![ManifestStack {
                    count: 21,
                    ..base.ships[0].clone()
                }],
                ..base.clone()
            },
            GameError::InsufficientShips,
        ),
        (
            JumpIntent {
                ships: vec![ManifestStack {
                    count: -1,
                    ..base.ships[0].clone()
                }],
                ..base.clone()
            },
            GameError::InvalidInput,
        ),
        (
            JumpIntent {
                ships: vec![ManifestStack {
                    owner: PlayerId(Uuid::from_u128(999)),
                    ..base.ships[0].clone()
                }],
                ..base.clone()
            },
            GameError::InvalidInput,
        ),
        (
            JumpIntent {
                ships: vec![ManifestStack {
                    ship_type: ShipType::SolarSatellite,
                    ..base.ships[0].clone()
                }],
                ..base.clone()
            },
            GameError::UnavailableContent,
        ),
        (
            JumpIntent {
                destination: BodyId(Uuid::from_u128(999)),
                ..base.clone()
            },
            GameError::NotOwned,
        ),
    ] {
        assert_eq!(quote_jump(&s, p, &request, 1000, &r), Err(error));
    }
    let mut incomplete = s.clone();
    incomplete
        .world
        .as_mut()
        .unwrap()
        .covered_gate_bodies
        .remove(&b);
    assert_eq!(
        quote_jump(&incomplete, p, &base, 1000, &r),
        Err(GameError::PolicyUnavailable)
    );
    let mut unbuilt = s.clone();
    unbuilt
        .bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::JumpGate, 0);
    assert_eq!(
        quote_jump(&unbuilt, p, &base, 1000, &r),
        Err(GameError::PrerequisiteMissing)
    );
    let mut foreign = s.clone();
    foreign.bodies.get_mut(&b).unwrap().owner = PlayerId(Uuid::from_u128(999));
    assert_eq!(
        quote_jump(&foreign, p, &base, 1000, &r),
        Err(GameError::NotOwned)
    );
    let mut planet = s.clone();
    planet.bodies.get_mut(&b).unwrap().kind = BodyKind::Planet;
    assert_eq!(
        quote_jump(&planet, p, &base, 1000, &r),
        Err(GameError::BodyKindNotAllowed)
    );
    let mut vacation = s.clone();
    vacation
        .world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .vacation = VacationState::Active {
        entered_at: 0,
        policy_hash: r.hash.clone(),
    };
    assert_eq!(
        quote_jump(&vacation, p, &base, 1000, &r),
        Err(GameError::ActorVacation)
    );
    let mut draining = s.clone();
    draining
        .world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .lifecycle = PlayerLifecycle::DeletionDraining;
    assert_eq!(
        quote_jump(&draining, p, &base, 1000, &r),
        Err(GameError::ActorDraining)
    );
}
#[test]
fn stale_terms_and_competing_prequoted_jump_cannot_mutate_either_end() {
    let (mut s, r, p, a, b) = setup(1);
    let request = selection(p, a, b);
    let quote = quote_jump(&s, p, &request, 1000, &r).unwrap();
    let bad = run(
        &mut s,
        &r,
        p,
        a,
        1000,
        91004,
        Input::Command(Command::World {
            action: WorldAction::JumpShips {
                intent: request.clone(),
                expected_terms_hash: Hash("bad".into()),
            },
        }),
    );
    assert_eq!(bad, TransitionResult::Rejected(GameError::QuoteChanged));
    let result = jump(&mut s, &r, p, request.clone(), 1000, 91005);
    apply(&mut s, result);
    let before = s.inventories.clone();
    let gates = s.world.as_ref().unwrap().records.gate_uses.clone();
    let second = run(
        &mut s,
        &r,
        p,
        a,
        1000,
        91006,
        Input::Command(Command::World {
            action: WorldAction::JumpShips {
                intent: request,
                expected_terms_hash: quote.terms_hash,
            },
        }),
    );
    assert_eq!(second, TransitionResult::Rejected(GameError::GateCooling));
    assert_eq!(s.inventories, before);
    assert_eq!(s.world.as_ref().unwrap().records.gate_uses, gates);
}
#[test]
fn construction_uses_lunar_fields_research_and_standard_costs() {
    let (mut s, r, p, a, b) = setup(1);
    for body in s.bodies.values_mut() {
        body.checkpoint.amounts = Resources::all(20_000_000 * SCALE);
    }
    s.bodies
        .get_mut(&a)
        .unwrap()
        .levels
        .insert(Building::JumpGate, 0);
    let request = QuoteRequest::Upgrade {
        body: a,
        building: Building::JumpGate,
    };
    let inspect =
        |s: &GameState| inspect_progression(s, Actor::Player(p), &request, 1000, &r).unwrap();
    assert!(
        inspect(&s)
            .blockers
            .iter()
            .any(|b| b.code == GameError::PrerequisiteMissing)
    );
    s.bodies
        .get_mut(&a)
        .unwrap()
        .levels
        .insert(Building::LunarBase, 1);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::HyperspaceTechnology, 7);
    assert!(
        inspect(&s).blockers.is_empty(),
        "{:?}",
        inspect(&s).blockers
    );
    let terms = building_terms(
        &s.bodies[&a],
        Building::JumpGate,
        BuildingAction::Upgrade,
        &r,
    )
    .unwrap();
    assert_eq!(
        terms.paid(),
        Resources::from_values([2_000_000, 4_000_000, 2_000_000].map(|v| v * SCALE))
    );
    let next = building_terms(
        &s.bodies[&b],
        Building::JumpGate,
        BuildingAction::Upgrade,
        &r,
    )
    .unwrap();
    assert_eq!(
        next.paid(),
        Resources::from_values([4_000_000, 8_000_000, 4_000_000].map(|v| v * SCALE))
    );
    s.bodies
        .get_mut(&a)
        .unwrap()
        .levels
        .insert(Building::RoboticsFactory, 3);
    assert!(
        inspect(&s)
            .blockers
            .iter()
            .any(|b| b.code == GameError::NoFreeField)
    );
    s.bodies.get_mut(&a).unwrap().kind = BodyKind::Planet;
    assert!(
        inspect(&s)
            .blockers
            .iter()
            .any(|b| b.code == GameError::BodyKindNotAllowed)
    );
}

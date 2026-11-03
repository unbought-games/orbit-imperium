use super::*;

fn lunar_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = prepared();
    let mut artifact = old.artifact.clone();
    artifact.universe = None;
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../../rules/content/lunar-base.json"))
            .unwrap();
    artifact.buildings.insert(
        Building::LunarBase,
        serde_json::from_value(content["building"].clone()).unwrap(),
    );
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Building(Building::LunarBase))
        .unwrap();
    entry.enabled = true;
    entry.body_kinds = [BodyKind::Moon].into();
    let r = Ruleset::from_artifact(artifact, 1).unwrap();
    s.profile_hash = r.hash.clone();
    let moon = s.bodies.get_mut(&b).unwrap();
    moon.kind = BodyKind::Moon;
    moon.fields = 1;
    moon.levels = r.building_keys().into_iter().map(|k| (k, 0)).collect();
    (s, r, p, b)
}
fn request(body: BodyId) -> QuoteRequest {
    QuoteRequest::Upgrade {
        body,
        building: Building::LunarBase,
    }
}

#[test]
fn lunar_base_cost_timing_capacity_and_overflow() {
    let (s, r, _, b) = lunar_fixture();
    let mut moon = s.bodies[&b].clone();
    for (source, cost, duration, capacity) in [
        (0, [20000, 40000, 20000], 86_310_000, 1),
        (1, [40000, 80000, 40000], 172_710_000, 4),
    ] {
        moon.levels.insert(Building::LunarBase, source);
        let terms =
            building_terms(&moon, Building::LunarBase, BuildingAction::Upgrade, &r).unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values(cost.map(|n| n * SCALE))
        );
        assert_eq!(terms.duration(), duration);
        assert_eq!(body_field_capacity(&moon, &r).unwrap(), capacity);
    }
    moon.levels.insert(Building::LunarBase, 0);
    let fast = Ruleset::from_artifact(r.artifact.clone(), 100).unwrap();
    assert_eq!(
        building_terms(&moon, Building::LunarBase, BuildingAction::Upgrade, &fast)
            .unwrap()
            .duration(),
        774_000
    );
    moon.levels.insert(Building::RoboticsFactory, 2);
    assert_eq!(
        building_terms(&moon, Building::LunarBase, BuildingAction::Upgrade, &r)
            .unwrap()
            .duration(),
        28_710_000
    );
    assert_eq!(
        lunar_base_field_capacity(u32::MAX),
        Err(GameError::NumericRange)
    );
    moon.levels.insert(Building::LunarBase, u32::MAX);
    assert_eq!(
        building_terms(&moon, Building::LunarBase, BuildingAction::Upgrade, &r),
        Err(GameError::NumericRange)
    );
    moon.levels.remove(&Building::LunarBase);
    assert_eq!(body_field_capacity(&moon, &r), Err(GameError::InvalidInput));
}

#[test]
fn lunar_base_reservation_completion_replay_and_cancellation_do_not_mirror_fields() {
    for cancel in [false, true] {
        let (mut s, r, p, b) = lunar_fixture();
        let resources = s.bodies[&b].checkpoint.amounts;
        let cmd = command(&s, &r, p, 0, request(b));
        let started = run(&mut s, &r, Actor::Player(p), 0, 13000, Input::Command(cmd));
        let event = &started.events[0];
        let operation = started.constructions[0].id;
        assert_eq!(reserved_fields(&s, b).unwrap(), 1);
        assert_eq!(body_field_capacity(&s.bodies[&b], &r).unwrap(), 1);
        blocked(&s, &r, p, 1, request(b), GameError::ActiveConstruction);
        assert_eq!(
            s.bodies[&b].checkpoint.amounts,
            Resources::from_values([980000, 960000, 980000].map(|n| n * SCALE))
        );
        s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
        // Disable future starts after acceptance: committed work still completes/cancels.
        let mut artifact = r.artifact.clone();
        artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Building(Building::LunarBase))
            .unwrap()
            .enabled = false;
        let disabled = Ruleset::from_artifact(artifact, 1).unwrap();
        s.profile_hash = disabled.hash.clone();
        if cancel {
            run(
                &mut s,
                &disabled,
                Actor::Player(p),
                1,
                13001,
                Input::Command(Command::CancelConstruction { operation }),
            );
        }
        for n in [13002, 13003] {
            run(
                &mut s,
                &disabled,
                Actor::Scheduler,
                event.at,
                n,
                Input::Event(event.event.clone()),
            );
        }
        let moon = &s.bodies[&b];
        assert_eq!(moon.fields, 1);
        assert_eq!(moon.levels[&Building::LunarBase], u32::from(!cancel));
        assert_eq!(
            body_field_capacity(moon, &disabled).unwrap(),
            if cancel { 1 } else { 4 }
        );
        assert_eq!(reserved_fields(&s, b).unwrap(), 0);
        assert_eq!(
            production_rates(moon, &disabled).unwrap(),
            Resources::default()
        );
        if cancel {
            assert_eq!(moon.checkpoint.amounts, resources);
        }
    }
}

#[test]
fn lunar_base_has_moon_only_local_resource_and_free_field_guards_and_no_demolition() {
    let (mut s, r, p, b) = lunar_fixture();
    let quote = inspect_progression(&s, Actor::Player(p), &request(b), 0, &r).unwrap();
    assert_eq!(
        quote.building_benefit.unwrap(),
        BuildingBenefit {
            kind: BuildingBenefitKind::FieldCapacity,
            current: "1".into(),
            target: "4".into()
        }
    );
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::default();
    blocked(&s, &r, p, 0, request(b), GameError::InsufficientResources);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(1_000_000 * SCALE);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::RoboticsFactory, 1);
    blocked(&s, &r, p, 0, request(b), GameError::NoFreeField);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::LunarBase, 1);
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Demolition {
            body: b,
            building: Building::LunarBase,
        },
        GameError::NotDemolishable,
    );
    for building in [
        Building::RoboticsFactory,
        Building::Shipyard,
        Building::MetalStorage,
        Building::SensorPhalanx,
        Building::JumpGate,
    ] {
        blocked(
            &s,
            &r,
            p,
            0,
            QuoteRequest::Upgrade { body: b, building },
            GameError::UnavailableContent,
        );
    }
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Research {
            host: b,
            research: ResearchId::EnergyTechnology,
        },
        GameError::UnavailableContent,
    );
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: b,
            item: ManufacturedItem::Ship(ShipType::SmallCargo),
            quantity: 1,
        },
        GameError::UnavailableContent,
    );
    let stranger = PlayerId(uuid::Uuid::from_u128(991));
    blocked(&s, &r, stranger, 0, request(b), GameError::NotOwned);
    s.bodies.get_mut(&b).unwrap().kind = BodyKind::Planet;
    blocked(&s, &r, p, 0, request(b), GameError::BodyKindNotAllowed);
    assert_eq!(body_field_capacity(&s.bodies[&b], &r).unwrap(), 1);
}

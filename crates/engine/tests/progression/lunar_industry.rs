use super::*;

fn fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = lunar_base::lunar_fixture();
    let mut artifact = old.artifact.clone();
    for entry in &mut artifact.catalog {
        if entry.enabled
            && matches!(
                entry.key,
                CatalogKey::Building(Building::RoboticsFactory | Building::Shipyard)
                    | CatalogKey::Ship(_)
                    | CatalogKey::Defense(_)
            )
        {
            entry.body_kinds = [BodyKind::Planet, BodyKind::Moon].into();
        }
    }
    let r = Ruleset::from_artifact(artifact, 1).unwrap();
    s.profile_hash = r.hash.clone();
    let moon = s.bodies.get_mut(&b).unwrap();
    moon.kind = BodyKind::Moon;
    moon.fields = 1;
    moon.levels = r.building_keys().into_iter().map(|k| (k, 0)).collect();
    s.research.get_mut(&p).unwrap().levels =
        r.research_keys().into_iter().map(|k| (k, 0)).collect();
    (s, r, p, b)
}
fn upgrade(body: BodyId, building: Building) -> QuoteRequest {
    QuoteRequest::Upgrade { body, building }
}
fn manufacture(body: BodyId, item: ManufacturedItem, quantity: i64) -> QuoteRequest {
    QuoteRequest::Manufacture {
        body,
        item,
        quantity,
    }
}
fn complete(s: &mut GameState, r: &Ruleset, changes: &ChangeSet, n: u128) {
    let event = &changes.events[0];
    run(
        s,
        r,
        Actor::Scheduler,
        event.at,
        n,
        Input::Event(event.event.clone()),
    );
}

#[test]
fn lunar_industry_construction_timing_fields_and_demolition_recovery() {
    let (mut s, r, p, b) = fixture();
    // Robotics needs no artificial Lunar Base prerequisite, even on a bare moon.
    let robotics = upgrade(b, Building::RoboticsFactory);
    let terms = inspect_progression(&s, Actor::Player(p), &robotics, 0, &r).unwrap();
    assert!(terms.blockers.is_empty());
    assert_eq!(
        terms.terms.as_ref().unwrap().paid(),
        Resources::from_values([400, 120, 200].map(|n| n * SCALE))
    );
    assert_eq!(terms.terms.unwrap().duration(), 658_000);
    let mut at = 0;
    for (index, building) in [
        Building::LunarBase,
        Building::RoboticsFactory,
        Building::RoboticsFactory,
        Building::Shipyard,
    ]
    .into_iter()
    .enumerate()
    {
        let cmd = command(&s, &r, p, at, upgrade(b, building));
        let c = run(
            &mut s,
            &r,
            Actor::Player(p),
            at,
            20_000 + index as u128 * 2,
            Input::Command(cmd),
        );
        assert_eq!(reserved_fields(&s, b).unwrap(), 1);
        at = c.events[0].at;
        complete(&mut s, &r, &c, 20_001 + index as u128 * 2);
    }
    assert_eq!(s.bodies[&b].levels[&Building::Shipyard], 1);
    assert_eq!(body_field_capacity(&s.bodies[&b], &r).unwrap(), 4);
    assert_eq!(s.bodies[&b].levels.values().sum::<u32>(), 4);
    blocked(
        &s,
        &r,
        p,
        at,
        upgrade(b, Building::LunarBase),
        GameError::NoFreeField,
    );
    let before = s.bodies[&b].checkpoint.amounts;
    let demolition = QuoteRequest::Demolition {
        body: b,
        building: Building::RoboticsFactory,
    };
    let cmd = command(&s, &r, p, at, demolition.clone());
    let c = run(
        &mut s,
        &r,
        Actor::Player(p),
        at,
        20_020,
        Input::Command(cmd),
    );
    assert_eq!(c.events[0].at - at, 249_000); // old Robotics 2, no 90-second adjustment
    assert_eq!(s.bodies[&b].levels[&Building::RoboticsFactory], 2);
    run(
        &mut s,
        &r,
        Actor::Player(p),
        at + 1,
        20_021,
        Input::Command(Command::CancelConstruction {
            operation: c.constructions[0].id,
        }),
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts, before);
    complete(&mut s, &r, &c, 20_022); // cancelled event cannot demolish
    at = c.events[0].at;
    let cmd = command(&s, &r, p, at, demolition);
    let c = run(
        &mut s,
        &r,
        Actor::Player(p),
        at,
        20_023,
        Input::Command(cmd),
    );
    complete(&mut s, &r, &c, 20_024);
    at = c.events[0].at;
    assert_eq!(s.bodies[&b].levels[&Building::RoboticsFactory], 1);
    assert_eq!(s.bodies[&b].levels[&Building::Shipyard], 1); // prerequisite loss does not erase it
    let cmd = command(&s, &r, p, at, upgrade(b, Building::LunarBase));
    let c = run(
        &mut s,
        &r,
        Actor::Player(p),
        at,
        20_025,
        Input::Command(cmd),
    );
    complete(&mut s, &r, &c, 20_026);
    complete(&mut s, &r, &c, 20_027); // stale duplicate completion
    assert_eq!(body_field_capacity(&s.bodies[&b], &r).unwrap(), 7);
    assert_eq!(s.bodies[&b].fields, 1);
}

#[test]
fn lunar_industry_uses_local_facilities_resources_and_account_research() {
    let (mut s, r, p, b) = fixture();
    let moon = s.bodies.get_mut(&b).unwrap();
    moon.levels.insert(Building::LunarBase, 3);
    blocked(
        &s,
        &r,
        p,
        0,
        upgrade(b, Building::Shipyard),
        GameError::PrerequisiteMissing,
    );
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::RoboticsFactory, 2);
    assert!(
        inspect_progression(&s, Actor::Player(p), &upgrade(b, Building::Shipyard), 0, &r)
            .unwrap()
            .blockers
            .is_empty()
    );
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 2);
    let cargo = manufacture(b, ManufacturedItem::Ship(ShipType::SmallCargo), 1);
    blocked(&s, &r, p, 0, cargo.clone(), GameError::PrerequisiteMissing);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::CombustionDrive, 2);
    let terms = inspect_progression(&s, Actor::Player(p), &cargo, 0, &r).unwrap();
    assert!(terms.blockers.is_empty());
    assert_eq!(terms.terms.unwrap().duration(), 1_920_000);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::default();
    blocked(
        &s,
        &r,
        p,
        0,
        cargo.clone(),
        GameError::InsufficientResources,
    );
    blocked(
        &s,
        &r,
        PlayerId(uuid::Uuid::from_u128(999)),
        0,
        cargo,
        GameError::NotOwned,
    );
    for request in [
        upgrade(b, Building::NaniteFactory),
        upgrade(b, Building::MetalStorage),
        upgrade(b, Building::MissileSilo),
        upgrade(b, Building::SensorPhalanx),
        QuoteRequest::Research {
            host: b,
            research: ResearchId::EnergyTechnology,
        },
        manufacture(
            b,
            ManufacturedItem::Missile(MissileId::AntiBallisticMissile),
            1,
        ),
    ] {
        blocked(&s, &r, p, 0, request, GameError::UnavailableContent);
    }
}

#[test]
fn lunar_industry_paid_fifo_locks_satellites_and_dome_reservations_survive_replay() {
    let (mut s, r, p, b) = fixture();
    for (building, level) in [
        (Building::LunarBase, 5),
        (Building::RoboticsFactory, 2),
        (Building::Shipyard, 2),
    ] {
        s.bodies.get_mut(&b).unwrap().levels.insert(building, level);
    }
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::ShieldingTechnology, 2);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::CombustionDrive, 1);
    let before = s.bodies[&b].checkpoint.amounts;
    let mut batches = vec![];
    for (index, item) in [
        ManufacturedItem::Ship(ShipType::LightFighter),
        ManufacturedItem::Defense(DefenseId::RocketLauncher),
        ManufacturedItem::Defense(DefenseId::SmallShieldDome),
    ]
    .into_iter()
    .enumerate()
    {
        let cmd = command(&s, &r, p, 0, manufacture(b, item, 1));
        batches.push(run(
            &mut s,
            &r,
            Actor::Player(p),
            0,
            21_000 + index as u128,
            Input::Command(cmd),
        ));
    }
    assert_eq!(
        s.bodies[&b].checkpoint.amounts,
        Resources::from_values([985000, 989000, 1000000].map(|n| n * SCALE))
    );
    for action in [
        upgrade(b, Building::Shipyard),
        QuoteRequest::Demolition {
            body: b,
            building: Building::Shipyard,
        },
    ] {
        blocked(&s, &r, p, 0, action, GameError::YardLocked);
    }
    blocked(
        &s,
        &r,
        p,
        0,
        manufacture(b, ManufacturedItem::Defense(DefenseId::SmallShieldDome), 1),
        GameError::CapacityReserved,
    );
    // Robotics may change while units are paid; it cannot retime their commitments.
    let cmd = command(&s, &r, p, 0, upgrade(b, Building::RoboticsFactory));
    let robotics = run(&mut s, &r, Actor::Player(p), 0, 21_010, Input::Command(cmd));
    complete(&mut s, &r, &robotics, 21_011);
    let paid = s.bodies[&b].checkpoint.amounts;
    s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    let mut prior_end = 0;
    for (index, c) in batches.iter().enumerate() {
        let batch = &c.manufacturing_batches[0];
        assert_eq!(batch.first_start_at, prior_end);
        prior_end = batch.final_due_at;
        complete(&mut s, &r, c, 21_020 + index as u128 * 2);
        complete(&mut s, &r, c, 21_021 + index as u128 * 2);
        assert_eq!(
            s.inventories
                .iter()
                .find(|x| x.body == b && x.item == batch.item)
                .unwrap()
                .count,
            1
        );
    }
    assert_eq!(s.bodies[&b].checkpoint.amounts, paid);
    assert_ne!(paid, before);
    assert_eq!(
        solar_satellite_unit_energy(
            &s.bodies[&b],
            &standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 1).unwrap()
        )
        .unwrap(),
        0
    );
    assert_eq!(
        body_production_rates(&s, &s.bodies[&b], &r).unwrap(),
        Resources::default()
    );
    assert_eq!(energy_stats(&s.bodies[&b], &r).unwrap().supply, 0);
    let cmd = command(&s, &r, p, prior_end, upgrade(b, Building::Shipyard));
    run(
        &mut s,
        &r,
        Actor::Player(p),
        prior_end,
        21_030,
        Input::Command(cmd),
    );
    blocked(
        &s,
        &r,
        p,
        prior_end,
        manufacture(b, ManufacturedItem::Defense(DefenseId::RocketLauncher), 1),
        GameError::YardLocked,
    );
}

#[test]
fn lunar_industry_parent_resources_facilities_and_queue_are_independent() {
    let (mut s, r, p, moon) = fixture();
    let parent = BodyId(uuid::Uuid::from_u128(222));
    let mut planet = s.bodies[&moon].clone();
    planet.id = parent;
    planet.kind = BodyKind::Planet;
    planet.fields = 163;
    planet.levels.insert(Building::RoboticsFactory, 10);
    planet.levels.insert(Building::Shipyard, 10);
    s.bodies.insert(parent, planet);
    s.coverage.bodies.insert(parent);
    s.coverage.production_bodies.insert(parent);
    s.coverage.construction_bodies.insert(parent);
    s.coverage.manufacturing_bodies.insert(parent);
    s.coverage.inventory_owners.insert((parent, p));
    s.production_settings.insert(
        parent,
        ProductionSettingsRecord {
            body: parent,
            settings: ProductionSettings::default(),
            revision: 0,
        },
    );
    for kind in ["production", "constructions", "manufacturing"] {
        s.collection_revisions.insert(format!("{kind}:{parent}"), 0);
    }
    s.collection_revisions
        .insert(format!("inventory:{parent}:{p}"), 0);
    s.bodies
        .get_mut(&moon)
        .unwrap()
        .levels
        .insert(Building::LunarBase, 2);
    // A parent Shipyard and Robotics cannot satisfy any lunar building requirement.
    blocked(
        &s,
        &r,
        p,
        0,
        upgrade(moon, Building::Shipyard),
        GameError::PrerequisiteMissing,
    );
    s.bodies
        .get_mut(&moon)
        .unwrap()
        .levels
        .insert(Building::RoboticsFactory, 2);
    s.bodies
        .get_mut(&moon)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 2);
    let item = ManufacturedItem::Defense(DefenseId::RocketLauncher);
    let request = manufacture(moon, item, 2);
    s.bodies.get_mut(&moon).unwrap().checkpoint.amounts = Resources::default();
    blocked(
        &s,
        &r,
        p,
        0,
        request.clone(),
        GameError::InsufficientResources,
    );
    s.bodies.get_mut(&moon).unwrap().checkpoint.amounts = Resources::all(1_000_000 * SCALE);
    let parent_before = s.bodies[&parent].clone();
    let cmd = command(&s, &r, p, 0, request);
    let lunar = run(&mut s, &r, Actor::Player(p), 0, 22_000, Input::Command(cmd));
    assert_eq!(s.bodies[&parent], parent_before);
    let cmd = command(&s, &r, p, 0, manufacture(parent, item, 2));
    let planetary = run(&mut s, &r, Actor::Player(p), 0, 22_001, Input::Command(cmd));
    assert_eq!(lunar.manufacturing_batches[0].first_start_at, 0);
    assert_eq!(planetary.manufacturing_batches[0].first_start_at, 0);
    assert_eq!(lunar.manufacturing_batches[0].unit_duration_ms, 960_000);
    assert_eq!(planetary.manufacturing_batches[0].unit_duration_ms, 261_000);
    complete(&mut s, &r, &planetary, 22_002);
    assert!(!s.inventories.iter().any(|stack| stack.body == moon));
    complete(&mut s, &r, &lunar, 22_003);
    assert_eq!(
        s.inventories
            .iter()
            .find(|stack| stack.body == moon)
            .unwrap()
            .count,
        1
    );
    assert_eq!(
        s.inventories
            .iter()
            .find(|stack| stack.body == parent)
            .unwrap()
            .count,
        1
    );
}

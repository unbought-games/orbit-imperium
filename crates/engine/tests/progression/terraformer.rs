use super::*;

fn terraformer_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = prepared();
    let mut artifact = old.artifact.clone();
    for (building, bytes) in [
        (
            Building::NaniteFactory,
            include_bytes!("../../../../rules/content/nanite-factory.json").as_slice(),
        ),
        (
            Building::Terraformer,
            include_bytes!("../../../../rules/content/terraformer.json").as_slice(),
        ),
        (
            Building::FusionReactor,
            include_bytes!("../../../../rules/content/fusion-reactor.json").as_slice(),
        ),
    ] {
        let content: serde_json::Value = serde_json::from_slice(bytes).unwrap();
        artifact.buildings.insert(
            building,
            serde_json::from_value(content["building"].clone()).unwrap(),
        );
        let entry = artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Building(building))
            .unwrap();
        entry.enabled = true;
        entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
        if building == Building::FusionReactor {
            artifact.progression.as_mut().unwrap().fusion_reactor =
                Some(serde_json::from_value(content["production"].clone()).unwrap());
        }
    }
    // Exact, independently chosen power fixture: one solar level supplies 1000.
    artifact.universe = None;
    artifact.growth = [1, 1];
    artifact.energy_supply = 1000;
    artifact.energy_demand[0] = 2500;
    let r = Ruleset::from_artifact(artifact, 1).unwrap();
    s.profile_hash = r.hash.clone();
    let body = s.bodies.get_mut(&b).unwrap();
    body.levels.insert(Building::Terraformer, 0);
    body.levels.insert(Building::FusionReactor, 0);
    body.levels.insert(Building::NaniteFactory, 1);
    body.levels.insert(Building::RoboticsFactory, 10);
    body.levels.insert(Building::SolarPlant, 1);
    body.checkpoint.amounts = Resources::all(10_000_000 * SCALE);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 12);
    (s, r, p, b)
}
fn request(body: BodyId) -> QuoteRequest {
    QuoteRequest::Upgrade {
        body,
        building: Building::Terraformer,
    }
}

#[test]
fn terraformer_costs_energy_timing_and_numeric_boundaries() {
    let (s, r, _, b) = terraformer_fixture();
    let mut body = s.bodies[&b].clone();
    for (level, crystal, deuterium, energy, duration) in [
        (0, 50_000, 100_000, 1000, 3_182_000),
        (1, 100_000, 200_000, 2000, 6_455_000),
    ] {
        body.levels.insert(Building::Terraformer, level);
        let t = building_terms(&body, Building::Terraformer, BuildingAction::Upgrade, &r).unwrap();
        assert_eq!(
            t.paid(),
            Resources::from_values([0, crystal * SCALE, deuterium * SCALE])
        );
        assert_eq!(t.duration(), duration);
        assert!(
            matches!(t, ProgressionMaterial::Building { required_energy, reserve_fields: 1, .. } if required_energy == energy * SCALE)
        );
        assert_eq!(
            body_field_capacity(&body, &r).unwrap(),
            body.fields + 5 * level
        );
    }
    assert_eq!(terraformer_required_energy(0), Err(GameError::InvalidInput));
    assert_eq!(
        terraformer_required_energy(u32::MAX),
        Err(GameError::NumericRange)
    );
    assert_eq!(
        terraformer_field_capacity(u32::MAX, 1),
        Err(GameError::NumericRange)
    );
    body.fields = u32::MAX;
    assert_eq!(
        building_terms(&body, Building::Terraformer, BuildingAction::Upgrade, &r),
        Err(GameError::NumericRange)
    );
    body.levels.remove(&Building::Terraformer);
    assert_eq!(body_field_capacity(&body, &r), Err(GameError::InvalidInput));
    let (old, old_rules, _, b) = prepared();
    assert_eq!(
        body_field_capacity(&old.bodies[&b], &old_rules).unwrap(),
        old.bodies[&b].fields
    );
}

#[test]
fn terraformer_checks_gross_power_completed_gates_and_rechecks_before_payment() {
    let (mut s, r, p, b) = terraformer_fixture();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::MetalMine, 1);
    assert_eq!(
        body_economy(&s, &s.bodies[&b], &r).unwrap().energy.demand,
        2500 * SCALE
    );
    let cmd = command(&s, &r, p, 0, request(b)); // 1000 gross passes despite negative surplus.
    for (nanite, energy, percent, kind, error) in [
        (0, 12, 100, BodyKind::Planet, GameError::PrerequisiteMissing),
        (1, 11, 100, BodyKind::Planet, GameError::PrerequisiteMissing),
        (1, 12, 90, BodyKind::Planet, GameError::EnergyRequired),
        (1, 12, 100, BodyKind::Moon, GameError::BodyKindNotAllowed),
    ] {
        let mut missing = s.clone();
        missing
            .bodies
            .get_mut(&b)
            .unwrap()
            .levels
            .insert(Building::NaniteFactory, nanite);
        missing.bodies.get_mut(&b).unwrap().kind = kind;
        missing
            .research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::EnergyTechnology, energy);
        missing
            .production_settings
            .get_mut(&b)
            .unwrap()
            .settings
            .solar_plant = percent;
        blocked(&missing, &r, p, 0, request(b), error.clone());
        let mut input = common::input(
            &missing,
            &r,
            Actor::Player(p),
            0,
            11000,
            Input::Command(cmd.clone()),
        );
        input.protocol = 3;
        input.schema_version = 3;
        let before = missing.clone();
        // Losing Nanite also changes the quoted duration, which fails consent first.
        let expected = if nanite == 0 {
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
    let mut artifact = r.artifact.clone();
    artifact.energy_supply = 999;
    let below = Ruleset::from_artifact(artifact, 1).unwrap();
    s.profile_hash = below.hash.clone();
    let quote = inspect_progression(&s, Actor::Player(p), &request(b), 0, &below).unwrap();
    let gate = quote
        .blockers
        .iter()
        .find(|x| x.code == GameError::EnergyRequired)
        .unwrap();
    assert_eq!(gate.required.as_deref(), Some("1000000000"));
    assert_eq!(gate.actual.as_deref(), Some("999000000"));
    assert_eq!(gate.unit, Some(BlockerUnit::MicroEnergy));
}

#[test]
fn terraformer_reserves_one_field_then_adds_five_only_on_completion_and_cannot_demolish() {
    let (mut s, r, p, b) = terraformer_fixture();
    s.bodies.get_mut(&b).unwrap().fields = 100;
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 82);
    assert_eq!(s.bodies[&b].levels.values().sum::<u32>(), 100);
    blocked(&s, &r, p, 0, request(b), GameError::NoFreeField);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 81);
    let cmd = command(&s, &r, p, 0, request(b));
    let started = run(&mut s, &r, Actor::Player(p), 0, 11100, Input::Command(cmd));
    assert_eq!(body_field_capacity(&s.bodies[&b], &r).unwrap(), 100);
    assert_eq!(reserved_fields(&s, b).unwrap(), 1);
    let event = &started.events[0];
    for id in [11101, 11102] {
        run(
            &mut s,
            &r,
            Actor::Scheduler,
            event.at,
            id,
            Input::Event(event.event.clone()),
        );
    }
    assert_eq!(s.bodies[&b].fields, 100);
    assert_eq!(body_field_capacity(&s.bodies[&b], &r).unwrap(), 105);
    assert_eq!(s.bodies[&b].levels.values().sum::<u32>(), 100);
    assert_eq!(reserved_fields(&s, b).unwrap(), 0);
    blocked(
        &s,
        &r,
        p,
        event.at,
        QuoteRequest::Demolition {
            body: b,
            building: Building::Terraformer,
        },
        GameError::NotDemolishable,
    );
    // Increase effective power without consuming another field, then complete level two.
    s.production_settings
        .get_mut(&b)
        .unwrap()
        .settings
        .solar_plant = 100;
    let mut a = r.artifact.clone();
    a.energy_supply = 2000;
    let next = Ruleset::from_artifact(a, 1).unwrap();
    s.profile_hash = next.hash.clone();
    let cmd = command(&s, &next, p, event.at, request(b));
    let started = run(
        &mut s,
        &next,
        Actor::Player(p),
        event.at,
        11103,
        Input::Command(cmd),
    );
    let due = &started.events[0];
    run(
        &mut s,
        &next,
        Actor::Scheduler,
        due.at,
        11104,
        Input::Event(due.event.clone()),
    );
    assert_eq!(body_field_capacity(&s.bodies[&b], &next).unwrap(), 110);
    assert_eq!(s.bodies[&b].levels.values().sum::<u32>(), 101);
    // Another building may now use fields beyond the original capacity.
    command(
        &s,
        &next,
        p,
        due.at,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::MetalMine,
        },
    );
}

#[test]
fn terraformer_cancel_restart_disable_and_power_loss_preserve_accepted_work() {
    for cancel in [false, true] {
        let (mut s, r, p, b) = terraformer_fixture();
        let before = s.bodies[&b].checkpoint.amounts;
        let cmd = command(&s, &r, p, 0, request(b));
        let start = run(&mut s, &r, Actor::Player(p), 0, 11200, Input::Command(cmd));
        let op = &start.constructions[0];
        assert_eq!(
            body_economy(&s, &s.bodies[&b], &r).unwrap().energy.supply,
            1000 * SCALE
        );
        s.production_settings
            .get_mut(&b)
            .unwrap()
            .settings
            .solar_plant = 0;
        let mut a = r.artifact.clone();
        a.catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Building(Building::Terraformer))
            .unwrap()
            .enabled = false;
        a.buildings.get_mut(&Building::Terraformer).unwrap().base = [0, 60_000, 120_000];
        let next = Ruleset::from_artifact(a, 1).unwrap();
        validate_rules_update(&r, &next).unwrap();
        s.profile_hash = next.hash.clone();
        s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
        assert_eq!(&s.constructions[&op.id], op);
        if cancel {
            run(
                &mut s,
                &next,
                Actor::Player(p),
                op.due_at - 1,
                11201,
                Input::Command(Command::CancelConstruction { operation: op.id }),
            );
            assert_eq!(s.bodies[&b].checkpoint.amounts, before);
        }
        run(
            &mut s,
            &next,
            Actor::Scheduler,
            op.due_at,
            11202,
            Input::Event(start.events[0].event.clone()),
        );
        assert_eq!(
            body_field_capacity(&s.bodies[&b], &next).unwrap(),
            163 + 5 * u32::from(!cancel)
        );
        assert_eq!(reserved_fields(&s, b).unwrap(), 0);
        blocked(
            &s,
            &next,
            p,
            op.due_at,
            request(b),
            GameError::UnavailableContent,
        );
    }
}

#[test]
fn terraformer_uses_settled_fuel_output_and_checks_before_spending_last_deuterium() {
    let (mut s, r, p, b) = terraformer_fixture();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::SolarPlant, 0);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::FusionReactor, 10);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts.deuterium = 100_000 * SCALE;
    assert!(body_economy(&s, &s.bodies[&b], &r).unwrap().energy.supply >= 1000 * SCALE);
    let cmd = command(&s, &r, p, 0, request(b));
    let start = run(&mut s, &r, Actor::Player(p), 0, 11300, Input::Command(cmd));
    assert_eq!(s.bodies[&b].checkpoint.amounts.deuterium, 0);
    assert_eq!(
        body_economy(&s, &s.bodies[&b], &r).unwrap().energy.supply,
        0
    );
    let due = &start.events[0];
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        due.at,
        11301,
        Input::Event(due.event.clone()),
    );
    assert_eq!(s.bodies[&b].levels[&Building::Terraformer], 1);
    let (mut s, r, p, b) = terraformer_fixture();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::SolarPlant, 0);
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::FusionReactor, 10);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts.deuterium = SCALE;
    blocked(&s, &r, p, 3_600_000, request(b), GameError::EnergyRequired);
}

#[test]
fn terraformer_satellites_use_covered_completed_inventory_and_saved_settings() {
    let (mut s, _, p, b) = prepared();
    let r = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
    s.profile_hash = r.hash.clone();
    let body = s.bodies.get_mut(&b).unwrap();
    body.levels = r.building_keys().into_iter().map(|key| (key, 0)).collect();
    body.levels.insert(Building::NaniteFactory, 1);
    body.levels.insert(Building::RoboticsFactory, 10);
    body.max_temperature = -130; // One energy per completed satellite.
    s.research.get_mut(&p).unwrap().levels =
        r.research_keys().into_iter().map(|key| (key, 0)).collect();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 12);
    s.inventories.push(InventoryStack {
        body: b,
        owner: p,
        item: ManufacturedItem::Ship(ShipType::SolarSatellite),
        count: 1000,
        revision: 0,
    });
    command(&s, &r, p, 0, request(b));
    s.inventories[0].count = 999;
    blocked(&s, &r, p, 0, request(b), GameError::EnergyRequired);
    s.inventories[0].count = 1000;
    s.production_settings
        .get_mut(&b)
        .unwrap()
        .settings
        .solar_satellite = 90;
    blocked(&s, &r, p, 0, request(b), GameError::EnergyRequired);
    s.coverage.inventory_owners.clear();
    assert!(inspect_progression(&s, Actor::Player(p), &request(b), 0, &r).is_err());
}

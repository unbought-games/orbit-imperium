use orbit_engine::*;
#[allow(dead_code)]
mod common;
fn fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, _, p, b) = common::fixture();
    let mut a = Ruleset::mvp_progression().unwrap().artifact.clone();
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/content/fusion-reactor.json"))
            .unwrap();
    a.buildings.insert(
        Building::FusionReactor,
        serde_json::from_value(content["building"].clone()).unwrap(),
    );
    a.progression.as_mut().unwrap().fusion_reactor =
        Some(serde_json::from_value(content["production"].clone()).unwrap());
    let entry = a
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Building(Building::FusionReactor))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    a.universe = None;
    let r = Ruleset::from_artifact(a, 1).unwrap();
    s.profile_hash = r.hash.clone();
    let body = s.bodies.get_mut(&b).unwrap();
    body.retained_capacity = None;
    body.levels = r.building_keys().into_iter().map(|key| (key, 0)).collect();
    body.checkpoint.amounts = Resources::all(5000 * SCALE);
    s.research.get_mut(&p).unwrap().levels =
        r.research_keys().into_iter().map(|key| (key, 0)).collect();
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
    for category in ["construction:0", "research:0"] {
        let id = OperationId(derived_id(i.id, category));
        s.coverage.operations.insert(id);
        s.coverage.research_operation_ids.insert(id);
        s.coverage.manufacturing_operation_ids.insert(id);
    }
    common::applied(s, transition(s, &i, r))
}
#[test]
fn documented_costs_output_and_speed_scaling() {
    let (s, r, _, b) = fixture();
    assert_eq!(
        fusion_full_output(5, 3, &r).unwrap(),
        (220_399_211, 80_525_500)
    );
    assert_eq!(
        fusion_full_output(5, 4, &r).unwrap(),
        (230_793_593, 80_525_500)
    );
    let fast = r.clone().with_speed(5).unwrap();
    assert_eq!(
        fusion_full_output(5, 3, &fast).unwrap(),
        (220_399_211, 402_627_500)
    );
    let terms = building_terms(
        &s.bodies[&b],
        Building::FusionReactor,
        BuildingAction::Upgrade,
        &r,
    )
    .unwrap();
    if let ProgressionMaterial::Building { paid, .. } = terms {
        assert_eq!(
            paid,
            Resources::from_values([900 * SCALE, 360 * SCALE, 180 * SCALE])
        );
    } else {
        panic!()
    }
    let mut body = s.bodies[&b].clone();
    body.levels.insert(Building::FusionReactor, 1);
    if let ProgressionMaterial::Building { paid, .. } =
        building_terms(&body, Building::FusionReactor, BuildingAction::Upgrade, &r).unwrap()
    {
        assert_eq!(
            paid,
            Resources::from_values([1620 * SCALE, 648 * SCALE, 324 * SCALE])
        );
    } else {
        panic!()
    }
}
#[test]
fn gates_construction_completion_throttle_and_demolition() {
    let (mut s, r, p, b) = fixture();
    let request = QuoteRequest::Upgrade {
        body: b,
        building: Building::FusionReactor,
    };
    let missing = inspect_progression(&s, Actor::Player(p), &request, 0, &r).unwrap();
    assert_eq!(
        missing
            .blockers
            .iter()
            .filter(|x| x.requirement.is_some())
            .count(),
        2
    );
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::DeuteriumSynthesizer, 5);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 3);
    let proposal = inspect_progression(&s, Actor::Player(p), &request, 0, &r).unwrap();
    assert!(proposal.blockers.is_empty());
    assert!(proposal.building_production.is_some());
    let changes = run(
        &mut s,
        &r,
        Actor::Player(p),
        0,
        10,
        Input::Command(Command::StartUpgrade {
            body: b,
            building: Building::FusionReactor,
            expected_terms_hash: proposal.terms_hash.unwrap(),
        }),
    );
    let op = &changes.constructions[0];
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        op.due_at,
        11,
        Input::Event(ScheduledEvent::ConstructionDue {
            operation: op.id,
            generation: op.generation,
        }),
    );
    assert_eq!(s.bodies[&b].levels[&Building::FusionReactor], 1);
    let full = body_economy(&s, &s.bodies[&b], &r).unwrap();
    let settings = ProductionSettings {
        fusion_reactor: 50,
        ..ProductionSettings::default()
    };
    run(
        &mut s,
        &r,
        Actor::Player(p),
        op.due_at + 1,
        12,
        Input::Command(Command::SetProduction {
            body: b,
            settings,
            expected_settings_revision: 0,
        }),
    );
    let half = body_economy(&s, &s.bodies[&b], &r).unwrap();
    assert_eq!(half.fusion_supply * 2, full.fusion_supply);
    assert_eq!(half.fuel * 2, full.fuel);
    let demolition = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Demolition {
            body: b,
            building: Building::FusionReactor,
        },
        op.due_at + 1,
        &r,
    )
    .unwrap();
    assert!(demolition.blockers.is_empty());
    assert_eq!(
        demolition
            .building_production
            .unwrap()
            .target
            .fuel_deuterium_per_hour,
        "0"
    );
}
#[test]
fn depletion_refueling_and_arbitrary_read_partitions() {
    let (mut s, r, _, b) = fixture();
    let body = s.bodies.get_mut(&b).unwrap();
    body.levels.insert(Building::FusionReactor, 5);
    body.levels.insert(Building::MetalMine, 10);
    body.checkpoint.amounts = Resources::from_values([0, 0, 10 * SCALE]);
    body.checkpoint.carry.deuterium = 1;
    let initial = body.clone();
    let end = 7_200_000;
    let expected = settle_production(&s, &initial, end, &r).unwrap();
    let mut split = initial.clone();
    for t in [1, 17, 100_000, 447_064, 447_065, 999_999, 1_800_000, end] {
        split.checkpoint = settle_production(&s, &split, t, &r).unwrap();
    }
    assert_eq!(split.checkpoint, expected);
    assert_eq!(expected.amounts.deuterium, 0);
    assert_eq!(body_economy(&s, &split, &r).unwrap().fusion_supply, 0);
    split.checkpoint.amounts.deuterium = SCALE;
    assert!(body_economy(&s, &split, &r).unwrap().fusion_supply > 0);
    assert_eq!(s.production_settings[&b].settings.fusion_reactor, 100);
}
#[test]
fn old_rules_remain_unavailable_and_new_rules_validate_definitions() {
    let (_, r, _, _) = fixture();
    let mut a = r.artifact.clone();
    a.progression.as_mut().unwrap().fusion_reactor = None;
    assert!(Ruleset::from_artifact(a, 1).is_err());
    let mut background_fuel = r.artifact.clone();
    background_fuel.base_income[2] = 1;
    assert!(Ruleset::from_artifact(background_fuel, 1).is_err());
    assert!(
        ProductionSettings {
            fusion_reactor: 0,
            ..ProductionSettings::default()
        }
        .validate(&Ruleset::mvp_progression().unwrap())
        .is_err()
    );
    for percent in [0, 10, 50, 100] {
        assert!(
            ProductionSettings {
                fusion_reactor: percent,
                ..ProductionSettings::default()
            }
            .validate(&r)
            .is_ok()
        );
    }
    assert!(
        ProductionSettings {
            fusion_reactor: 15,
            ..ProductionSettings::default()
        }
        .validate(&r)
        .is_err()
    );
}

#[test]
fn energy_research_settles_every_planet_at_old_output_before_upgrading() {
    let (mut s, r, p, b) = fixture();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 3);
    let body = s.bodies.get_mut(&b).unwrap();
    body.levels.insert(Building::ResearchLab, 1);
    body.levels.insert(Building::FusionReactor, 5);
    body.levels.insert(Building::MetalMine, 15);
    body.levels.insert(Building::DeuteriumSynthesizer, 5);
    body.levels.insert(Building::SolarPlant, 1);
    body.checkpoint.amounts = Resources::all(10_000 * SCALE);
    let colony = BodyId(uuid::Uuid::from_u128(999));
    let mut other = body.clone();
    other.id = colony;
    other.coordinates.position = 9;
    s.bodies.insert(colony, other);
    s.production_settings.insert(
        colony,
        ProductionSettingsRecord {
            body: colony,
            settings: ProductionSettings::default(),
            revision: 0,
        },
    );
    s.coverage.bodies.insert(colony);
    s.coverage.production_bodies.insert(colony);
    s.coverage.construction_bodies.insert(colony);
    s.coverage.manufacturing_bodies.insert(colony);
    s.coverage.inventory_owners.insert((colony, p));
    for k in ["production", "constructions", "manufacturing"] {
        s.collection_revisions.insert(format!("{k}:{colony}"), 0);
    }
    s.collection_revisions
        .insert(format!("inventory:{colony}:{p}"), 0);
    let proposal = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Research {
            host: b,
            research: ResearchId::EnergyTechnology,
        },
        0,
        &r,
    )
    .unwrap();
    assert!(proposal.blockers.is_empty(), "{:?}", proposal.blockers);
    let change = run(
        &mut s,
        &r,
        Actor::Player(p),
        0,
        100,
        Input::Command(Command::StartResearch {
            host: b,
            research: ResearchId::EnergyTechnology,
            expected_terms_hash: proposal.terms_hash.unwrap(),
        }),
    );
    let op = &change.research_operations[0];
    let due = op.commitment.due_at;
    let before = s.clone();
    let expected: Vec<_> = [b, colony]
        .into_iter()
        .map(|id| {
            (
                id,
                settle_production(&before, &before.bodies[&id], due, &r).unwrap(),
            )
        })
        .collect();
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        due,
        101,
        Input::Event(ScheduledEvent::ResearchDue {
            operation: op.id,
            generation: op.generation,
        }),
    );
    for (id, checkpoint) in expected {
        assert_eq!(s.bodies[&id].checkpoint, checkpoint);
        let after = body_economy(&s, &s.bodies[&id], &r).unwrap();
        let old = body_economy(&before, &s.bodies[&id], &r).unwrap();
        assert!(after.fusion_supply > old.fusion_supply);
        assert_eq!(after.fuel, old.fuel);
    }
}

#[test]
fn fuel_continues_above_capacity_and_synthesis_replaces_consumption_at_capacity() {
    let (mut s, r, p, b) = fixture();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::EnergyTechnology, 3);
    let body = s.bodies.get_mut(&b).unwrap();
    for (key, level) in [
        (Building::FusionReactor, 5),
        (Building::DeuteriumSynthesizer, 5),
        (Building::SolarPlant, 20),
    ] {
        body.levels.insert(key, level);
    }
    body.checkpoint.amounts.deuterium = 10_050 * SCALE;
    let above = body_economy(&s, &s.bodies[&b], &r).unwrap();
    assert_eq!(above.net_deuterium, -80_525_500);
    let result = settle_production(&s, &s.bodies[&b], 3_600_000, &r).unwrap();
    assert_eq!(result.amounts.deuterium, 10_000 * SCALE);
    assert_eq!(result.carry.deuterium, 0);
    let mut at_cap = s.bodies[&b].clone();
    at_cap.checkpoint = result;
    let capped = body_economy(&s, &at_cap, &r).unwrap();
    assert_eq!(capped.net_deuterium, 0);
    assert_eq!(capped.fuel, 80_525_500);
    at_cap.checkpoint.amounts.deuterium -= SCALE;
    assert_eq!(
        body_economy(&s, &at_cap, &r).unwrap().net_deuterium,
        22_547_140
    );
}

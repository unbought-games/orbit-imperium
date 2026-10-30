use super::*;

fn plasma_turret_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = plasma::plasma_fixture();
    let standard =
        standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), old.speed).unwrap();
    let item = ManufacturedItem::Defense(DefenseId::PlasmaTurret);
    let mut artifact = old.artifact.clone();
    *artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap() = standard
        .artifact
        .catalog
        .iter()
        .find(|e| e.key == item.catalog_key())
        .unwrap()
        .clone();
    artifact.progression.as_mut().unwrap().unit_costs.push(
        standard
            .artifact
            .progression
            .as_ref()
            .unwrap()
            .unit_costs
            .iter()
            .find(|u| u.item == item)
            .unwrap()
            .clone(),
    );
    let r = Ruleset::from_artifact(artifact, old.speed).unwrap();
    s.profile_hash = r.hash.clone();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 8);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::PlasmaTechnology, 7);

    (s, r, p, b)
}

#[test]
fn plasma_turret_checks_all_completed_gates_and_each_resource_at_quote_and_append() {
    let (s, r, p, b) = plasma_turret_fixture();
    let request = QuoteRequest::Manufacture {
        body: b,
        item: ManufacturedItem::Defense(DefenseId::PlasmaTurret),
        quantity: 3,
    };
    let cmd = command(&s, &r, p, 0, request.clone());
    for missing_gate in 0..5 {
        let mut missing = s.clone();
        match missing_gate {
            0 => {
                missing
                    .bodies
                    .get_mut(&b)
                    .unwrap()
                    .levels
                    .insert(Building::Shipyard, 7);
            }
            1 => {
                *missing
                    .research
                    .get_mut(&p)
                    .unwrap()
                    .levels
                    .get_mut(&ResearchId::PlasmaTechnology)
                    .unwrap() = 6;
            }
            2 => missing.bodies.get_mut(&b).unwrap().checkpoint.amounts.metal = 150000 * SCALE - 1,
            3 => {
                missing
                    .bodies
                    .get_mut(&b)
                    .unwrap()
                    .checkpoint
                    .amounts
                    .crystal = 150000 * SCALE - 1
            }
            4 => {
                missing
                    .bodies
                    .get_mut(&b)
                    .unwrap()
                    .checkpoint
                    .amounts
                    .deuterium = 90000 * SCALE - 1
            }
            _ => unreachable!(),
        }
        let error = if missing_gate < 2 {
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
fn plasma_turret_unlocks_on_research_completion_across_planets_with_local_shipyards() {
    let (mut s, r, p, b) = plasma_turret_fixture();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::PlasmaTechnology, 6);
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
            research: ResearchId::PlasmaTechnology,
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
        item: ManufacturedItem::Defense(DefenseId::PlasmaTurret),
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
    assert_eq!(s.research[&p].levels[&ResearchId::PlasmaTechnology], 7);
    s.bodies
        .get_mut(&target)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 7);
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
        .insert(Building::Shipyard, 8);
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
    // Higher Plasma levels only unlock content; they do not change cannon terms.
    let terms = manufacture_terms(
        &s.bodies[&target],
        ManufacturedItem::Defense(DefenseId::PlasmaTurret),
        1,
        &r,
    )
    .unwrap();
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::PlasmaTechnology, 10);
    assert_eq!(
        manufacture_terms(
            &s.bodies[&target],
            ManufacturedItem::Defense(DefenseId::PlasmaTurret),
            1,
            &r
        )
        .unwrap(),
        terms
    );
}

#[test]
fn plasma_turret_paid_fifo_survives_disable_and_restart_without_duplicate_credit() {
    let (mut s, r, p, b) = plasma_turret_fixture();
    let item = ManufacturedItem::Defense(DefenseId::PlasmaTurret);
    let request = QuoteRequest::Manufacture {
        body: b,
        item,
        quantity: 3,
    };
    let terms = manufacture_terms(&s.bodies[&b], item, 3, &r).unwrap();
    assert_eq!(
        terms.paid(),
        Resources::from_values([150000 * SCALE, 150000 * SCALE, 90000 * SCALE])
    );
    assert!(matches!(
        terms,
        ProgressionMaterial::Manufacture {
            unit_duration_ms: 1_600_000,
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
    assert_eq!(batch.final_due_at - batch.first_start_at, 4_800_000);
    let paid = s.bodies[&b].checkpoint.amounts;
    assert_eq!(
        paid,
        Resources::from_values([
            before.metal - 150000 * SCALE,
            before.crystal - 150000 * SCALE,
            before.deuterium - 90000 * SCALE
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

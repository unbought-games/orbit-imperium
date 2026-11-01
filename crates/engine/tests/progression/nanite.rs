use super::*;

fn nanite_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = prepared();
    let content: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../rules/content/nanite-factory.json"
    ))
    .unwrap();
    let mut artifact = old.artifact.clone();
    artifact.buildings.insert(
        Building::NaniteFactory,
        serde_json::from_value(content["building"].clone()).unwrap(),
    );
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Building(Building::NaniteFactory))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    let r = Ruleset::from_artifact(artifact, old.speed).unwrap();
    s.profile_hash = r.hash.clone();
    let body = s.bodies.get_mut(&b).unwrap();
    body.levels.insert(Building::NaniteFactory, 0);
    body.levels.insert(Building::RoboticsFactory, 10);
    body.checkpoint.amounts = Resources::all(10_000_000 * SCALE);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::ComputerTechnology, 10);
    (s, r, p, b)
}

#[test]
fn nanite_exact_costs_self_facilities_demolition_and_research() {
    let (s, _, p, b) = nanite_fixture();
    let r = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 1).unwrap();
    let mut body = s.bodies[&b].clone();
    for (source, cost) in [
        (0, [1_000_000, 500_000, 100_000]),
        (1, [2_000_000, 1_000_000, 200_000]),
    ] {
        body.levels.insert(Building::NaniteFactory, source);
        let terms =
            building_terms(&body, Building::NaniteFactory, BuildingAction::Upgrade, &r).unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values(cost.map(|n| n * SCALE))
        );
        assert_eq!(terms.duration(), 196_273_000);
        let ProgressionMaterial::Building { facilities, .. } = terms else {
            panic!()
        };
        assert_eq!(facilities[0].level, source);
    }
    let demo = building_terms(
        &body,
        Building::NaniteFactory,
        BuildingAction::Demolition,
        &r,
    )
    .unwrap();
    assert_eq!(
        demo.paid(),
        Resources::from_values([500_000, 250_000, 50_000].map(|n| n * SCALE))
    );
    assert_eq!(demo.duration(), 49_090_000);
    let research =
        research_terms(&body, &s.research[&p], ResearchId::EnergyTechnology, &r).unwrap();
    body.levels.insert(Building::NaniteFactory, 5);
    assert_eq!(
        research_terms(&body, &s.research[&p], ResearchId::EnergyTechnology, &r).unwrap(),
        research
    );
    body.levels.remove(&Building::NaniteFactory);
    assert_eq!(
        building_terms(&body, Building::MetalMine, BuildingAction::Upgrade, &r),
        Err(GameError::InvalidInput)
    );
}

#[test]
fn nanite_divides_before_building_threshold_and_unit_rounding_for_every_manufactured_kind() {
    let (s, _, _, b) = nanite_fixture();
    let r = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 1).unwrap();
    let mut body = s.bodies[&b].clone();
    body.levels.insert(Building::RoboticsFactory, 0);
    body.levels.insert(Building::NaniteFactory, 1);
    for (metal, seconds) in [(138, 99), (139, 10), (141, 11), (1, 1)] {
        let mut artifact = r.artifact.clone();
        artifact
            .buildings
            .get_mut(&Building::MetalMine)
            .unwrap()
            .base = [metal, 0, 0];
        let rules = Ruleset::from_artifact(artifact, 1).unwrap();
        assert_eq!(
            building_terms(&body, Building::MetalMine, BuildingAction::Upgrade, &rules)
                .unwrap()
                .duration(),
            seconds * 1000
        );
    }
    body.levels.insert(Building::Shipyard, 3);
    for item in [
        ManufacturedItem::Ship(ShipType::EspionageProbe),
        ManufacturedItem::Ship(ShipType::SolarSatellite),
        ManufacturedItem::Defense(DefenseId::RocketLauncher),
        ManufacturedItem::Missile(MissileId::AntiBallisticMissile),
    ] {
        body.levels.insert(Building::NaniteFactory, 0);
        let before = manufacture_terms(&body, item, 3, &r).unwrap();
        body.levels.insert(Building::NaniteFactory, 1);
        let after = manufacture_terms(&body, item, 3, &r).unwrap();
        assert_eq!(after.paid(), before.paid());
        assert_eq!(after.duration(), before.duration() / 2);
    }
    let r = Ruleset::from_artifact(r.artifact.clone(), 7).unwrap();
    let probe = ManufacturedItem::Ship(ShipType::EspionageProbe);
    assert_eq!(
        manufacture_terms(&body, probe, 3, &r).unwrap().duration(),
        25_000
    );
    body.levels.insert(Building::NaniteFactory, 20);
    assert_eq!(
        manufacture_terms(&body, probe, 3, &r).unwrap().duration(),
        1000
    );
    body.levels.insert(Building::NaniteFactory, u32::MAX);
    assert_eq!(
        manufacture_terms(&body, probe, 3, &r),
        Err(GameError::NumericRange)
    );
}

#[test]
fn nanite_requires_both_gates_for_upgrade_and_demolition_and_preserves_existing_effect() {
    let (mut s, r, p, b) = nanite_fixture();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::NaniteFactory, 1);
    for request in [
        QuoteRequest::Upgrade {
            body: b,
            building: Building::NaniteFactory,
        },
        QuoteRequest::Demolition {
            body: b,
            building: Building::NaniteFactory,
        },
    ] {
        for robotics in [true, false] {
            let mut missing = s.clone();
            if robotics {
                missing
                    .bodies
                    .get_mut(&b)
                    .unwrap()
                    .levels
                    .insert(Building::RoboticsFactory, 9);
            } else {
                missing
                    .research
                    .get_mut(&p)
                    .unwrap()
                    .levels
                    .insert(ResearchId::ComputerTechnology, 9);
            }
            blocked(
                &missing,
                &r,
                p,
                0,
                request.clone(),
                GameError::PrerequisiteMissing,
            );
            assert!(
                manufacture_terms(
                    &missing.bodies[&b],
                    ManufacturedItem::Ship(ShipType::SmallCargo),
                    1,
                    &r
                )
                .unwrap()
                .duration()
                    < manufacture_terms(
                        &prepared().0.bodies[&b],
                        ManufacturedItem::Ship(ShipType::SmallCargo),
                        1,
                        &prepared().1
                    )
                    .unwrap()
                    .duration()
            );
        }
    }
}

#[test]
fn nanite_locks_all_paid_manufacturing_in_both_orders_including_demolition() {
    for demolish in [false, true] {
        for manufacture_first in [false, true] {
            let (mut s, r, p, b) = nanite_fixture();
            s.bodies
                .get_mut(&b)
                .unwrap()
                .levels
                .insert(Building::NaniteFactory, 1);
            let building = if demolish {
                QuoteRequest::Demolition {
                    body: b,
                    building: Building::NaniteFactory,
                }
            } else {
                QuoteRequest::Upgrade {
                    body: b,
                    building: Building::NaniteFactory,
                }
            };
            let unit = QuoteRequest::Manufacture {
                body: b,
                item: ManufacturedItem::Ship(ShipType::SmallCargo),
                quantity: 2,
            };
            let (first, second) = if manufacture_first {
                (unit, building)
            } else {
                (building, unit)
            };
            let stale = command(&s, &r, p, 0, second.clone());
            let cmd = command(&s, &r, p, 0, first.clone());
            let started = run(&mut s, &r, Actor::Player(p), 0, 9800, Input::Command(cmd));
            let mut at = 0;
            if manufacture_first {
                let cmd = command(&s, &r, p, 0, first);
                run(&mut s, &r, Actor::Player(p), 0, 9801, Input::Command(cmd));
                assert_eq!(s.manufacturing_batches.len(), 2);
                // Drain only the first batch through ordinary per-unit events.
                let mut event = started.events[0].clone();
                for n in 0..2 {
                    at = event.at;
                    let completed = run(
                        &mut s,
                        &r,
                        Actor::Scheduler,
                        at,
                        9810 + n,
                        Input::Event(event.event),
                    );
                    if n == 0 {
                        event = completed.events[0].clone();
                    } else {
                        break;
                    }
                }
                assert_eq!(
                    s.manufacturing_batches
                        .values()
                        .filter(|b| b.status == ManufacturingStatus::Active)
                        .count(),
                    1
                );
            }
            blocked(&s, &r, p, at, second, GameError::YardLocked);
            let mut input =
                common::input(&s, &r, Actor::Player(p), at, 9802, Input::Command(stale));
            input.protocol = 3;
            input.schema_version = 3;
            assert!(matches!(
                transition(&s, &input, &r),
                TransitionResult::Rejected(GameError::YardLocked)
            ));
            if manufacture_first {
                command(
                    &s,
                    &r,
                    p,
                    at,
                    QuoteRequest::Upgrade {
                        body: b,
                        building: Building::RoboticsFactory,
                    },
                );
            }
        }
    }
}

#[test]
fn nanite_cancel_completion_and_disable_preserve_paid_terms_and_fields() {
    for cancel in [false, true] {
        let (mut s, r, p, b) = nanite_fixture();
        let request = QuoteRequest::Upgrade {
            body: b,
            building: Building::NaniteFactory,
        };
        let before = s.bodies[&b].checkpoint.amounts;
        let cmd = command(&s, &r, p, 0, request.clone());
        let changes = run(&mut s, &r, Actor::Player(p), 0, 9900, Input::Command(cmd));
        let op = changes.constructions[0].clone();
        assert_eq!(s.bodies[&b].levels[&Building::NaniteFactory], 0);
        assert_eq!(reserved_fields(&s, b).unwrap(), 1);
        let mut artifact = r.artifact.clone();
        artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Building(Building::NaniteFactory))
            .unwrap()
            .enabled = false;
        artifact
            .buildings
            .get_mut(&Building::NaniteFactory)
            .unwrap()
            .base = [2_000_000, 1_000_000, 200_000];
        let next = Ruleset::from_artifact(artifact, r.speed).unwrap();
        validate_rules_update(&r, &next).unwrap();
        s.profile_hash = next.hash.clone();
        s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
        if cancel {
            run(
                &mut s,
                &next,
                Actor::Player(p),
                op.due_at - 1,
                9901,
                Input::Command(Command::CancelConstruction { operation: op.id }),
            );
            assert_eq!(s.bodies[&b].checkpoint.amounts, before);
        }
        run(
            &mut s,
            &next,
            Actor::Scheduler,
            op.due_at,
            9902,
            Input::Event(changes.events[0].event.clone()),
        );
        assert_eq!(
            s.bodies[&b].levels[&Building::NaniteFactory],
            u32::from(!cancel)
        );
        assert_eq!(reserved_fields(&s, b).unwrap(), 0);
        blocked(
            &s,
            &next,
            p,
            op.due_at,
            request,
            GameError::UnavailableContent,
        );
    }
}

#[test]
fn nanite_completion_changes_quotes_and_demolition_uses_old_level_until_due() {
    let (mut s, r, p, b) = nanite_fixture();
    let manufacture = QuoteRequest::Manufacture {
        body: b,
        item: ManufacturedItem::Ship(ShipType::SmallCargo),
        quantity: 1,
    };
    let stale = command(&s, &r, p, 0, manufacture.clone());
    let before = manufacture_terms(
        &s.bodies[&b],
        ManufacturedItem::Ship(ShipType::SmallCargo),
        1,
        &r,
    )
    .unwrap()
    .duration();
    let request = QuoteRequest::Upgrade {
        body: b,
        building: Building::NaniteFactory,
    };
    let cmd = command(&s, &r, p, 0, request);
    let started = run(&mut s, &r, Actor::Player(p), 0, 9950, Input::Command(cmd));
    let event = &started.events[0];
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        event.at,
        9951,
        Input::Event(event.event.clone()),
    );
    let mut input = common::input(
        &s,
        &r,
        Actor::Player(p),
        event.at,
        9952,
        Input::Command(stale),
    );
    input.protocol = 3;
    input.schema_version = 3;
    assert!(matches!(
        transition(&s, &input, &r),
        TransitionResult::Rejected(GameError::QuoteChanged)
    ));
    let cmd = command(
        &s,
        &r,
        p,
        event.at,
        QuoteRequest::Demolition {
            body: b,
            building: Building::NaniteFactory,
        },
    );
    let demolition = run(
        &mut s,
        &r,
        Actor::Player(p),
        event.at,
        9953,
        Input::Command(cmd),
    );
    assert_eq!(s.bodies[&b].levels[&Building::NaniteFactory], 1);
    assert_eq!(reserved_fields(&s, b).unwrap(), 0);
    assert_eq!(
        manufacture_terms(
            &s.bodies[&b],
            ManufacturedItem::Ship(ShipType::SmallCargo),
            1,
            &r
        )
        .unwrap()
        .duration(),
        57_000 // floor(115.2 / 2) seconds, not half of the already rounded time.
    );
    let event = &demolition.events[0];
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        event.at,
        9954,
        Input::Event(event.event.clone()),
    );
    assert_eq!(s.bodies[&b].levels[&Building::NaniteFactory], 0);
    assert_eq!(
        manufacture_terms(
            &s.bodies[&b],
            ManufacturedItem::Ship(ShipType::SmallCargo),
            1,
            &r
        )
        .unwrap()
        .duration(),
        before
    );
}

#[test]
fn nanite_locks_are_planet_local_and_research_can_overlap() {
    let (mut s, r, p, b) = nanite_fixture();
    let mut other = s.bodies[&b].clone();
    other.id = BodyId(uuid::Uuid::from_u128(9960));
    other.coordinates.position = 9;
    let target = other.id;
    s.bodies.insert(target, other);
    let mut settings = s.production_settings[&b].clone();
    settings.body = target;
    s.production_settings.insert(target, settings);
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
    let cmd = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::NaniteFactory,
        },
    );
    run(&mut s, &r, Actor::Player(p), 0, 9961, Input::Command(cmd));
    command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Research {
            host: b,
            research: ResearchId::ComputerTechnology,
        },
    );
    command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Manufacture {
            body: target,
            item: ManufacturedItem::Ship(ShipType::SmallCargo),
            quantity: 1,
        },
    );
    command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: target,
            building: Building::NaniteFactory,
        },
    );
    s.bodies.get_mut(&target).unwrap().kind = BodyKind::Moon;
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: target,
            building: Building::NaniteFactory,
        },
        GameError::BodyKindNotAllowed,
    );
    s.bodies.get_mut(&target).unwrap().kind = BodyKind::Planet;
    s.bodies.get_mut(&target).unwrap().fields = s.bodies[&target].levels.values().sum();
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: target,
            building: Building::NaniteFactory,
        },
        GameError::NoFreeField,
    );
}

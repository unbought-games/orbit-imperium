use orbit_engine::*;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
#[allow(dead_code)]
mod common;
fn fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, _, p, b) = common::fixture();
    let r = Ruleset::mvp_fleets().unwrap();
    s.profile_hash = r.hash.clone();
    s.bodies.get_mut(&b).unwrap().levels = Building::MVP.into_iter().map(|b| (b, 0)).collect();
    s.bodies.get_mut(&b).unwrap().retained_capacity = None;
    s.research.get_mut(&p).unwrap().levels = ResearchId::MVP.into_iter().map(|r| (r, 0)).collect();
    s.production_settings.insert(
        b,
        ProductionSettingsRecord {
            body: b,
            settings: ProductionSettings::default(),
            revision: 0,
        },
    );
    s.coverage.production_bodies.insert(b);
    s.collection_revisions.insert(format!("production:{b}"), 0);
    s.world = Some(WorldFacts {
        machine_players: Default::default(),
        site_fleets_enabled: false,
        covered_sites: Default::default(),
        covered_site_players: Default::default(),
        phalanx: None,
        covered_vacation_players: BTreeSet::from([p]),
        alliance_leaders: None,
        holding_relationships: None,
        covered_depot_sources: BTreeSet::new(),
        homeworlds: BTreeMap::from([(p, b)]),
        planet_slots: vec![],
        records: WorldRecords {
            policies: BTreeMap::from([(
                p,
                PlayerPolicy {
                    player: p,
                    last_presence_at: 0,
                    vacation: VacationState::default(),
                    lifecycle: PlayerLifecycle::Active,
                    policy_hash: r.hash.clone(),
                    revision: 0,
                    deletion_requested_at: None,
                },
            )]),
            ..Default::default()
        },
        secret: [0; 32],
        covered_players: BTreeSet::from([p]),
        covered_coordinates: BTreeSet::new(),
        covered_reports: BTreeSet::new(),
        requested_pair: None,
        revision: 0,
    });
    (s, r, p, b)
}
fn input(s: &GameState, r: &Ruleset, n: u128) -> OrderedInput {
    let mut i = common::input(
        s,
        r,
        Actor::Scheduler,
        n as i64,
        n,
        Input::Event(ScheduledEvent::ConstructionDue {
            operation: OperationId(Uuid::from_u128(n)),
            generation: 0,
        }),
    );
    i.protocol = 4;
    i.schema_version = 4;
    i
}
fn change(s: &GameState, i: &OrderedInput) -> ChangeSet {
    ChangeSet {
        world: Some(WorldChanges {
            records: s.world.as_ref().unwrap().records.clone(),
            score_deltas: vec![],
            audits: vec![],
        }),
        production_settings: vec![],
        research_operations: vec![],
        manufacturing_batches: vec![],
        progression_reservations: vec![],
        fleets: vec![],
        inventories: vec![],
        research: vec![],
        reports: vec![],
        input: i.id,
        profile_hash: s.profile_hash.clone(),
        expected_facts_hash: hash(s),
        expected_collection_revisions: s.collection_revisions.clone(),
        bodies: vec![],
        constructions: vec![],
        events: vec![],
        cancelled_events: vec![],
        affected_viewers: BTreeSet::new(),
    }
}
fn definition(id: &str, predicate: ObjectivePredicate) -> ObjectiveDefinition {
    ObjectiveDefinition {
        id: id.into(),
        explanation: id.into(),
        predicate,
        reward: Resources::all(SCALE),
    }
}
fn program() -> ObjectiveProgram {
    ObjectiveProgram {
        id: "fixture-economy".into(),
        version: 1,
        objectives: vec![
            definition(
                "reinvest",
                ObjectivePredicate::Reinvest {
                    building: Building::MetalMine,
                    minimum: 8,
                    after_return: "haul".into(),
                },
            ),
            definition(
                "mine",
                ObjectivePredicate::Building {
                    building: Building::MetalMine,
                    minimum: 8,
                },
            ),
            definition(
                "ships",
                ObjectivePredicate::Manufacture {
                    ship: ShipType::LightFighter,
                    quantity: 2,
                },
            ),
            definition(
                "haul",
                ObjectivePredicate::RaidReturn {
                    required_ships: BTreeSet::from([ShipType::SmallCargo]),
                },
            ),
            definition("attack", ObjectivePredicate::Attack),
            definition(
                "research",
                ObjectivePredicate::Research {
                    research: ResearchId::CombustionDrive,
                    minimum: 1,
                },
            ),
        ],
    }
}
fn enroll(s: &mut GameState, r: &Ruleset, p: PlayerId) -> OperationId {
    let i = input(s, r, 1);
    let mut c = change(s, &i);
    let id = enroll_objective_program(s, &i, r, &mut c, p, program()).unwrap();
    c.apply_to(s).unwrap();
    id
}
fn evidence(i: &OrderedInput, p: PlayerId, fact: ObjectiveFact) -> ObjectiveEvidence {
    ObjectiveEvidence {
        input: i.id,
        order: objective_order(i),
        actor: i.actor,
        beneficiary: p,
        operation: OperationId(i.id.0),
        fact,
    }
}
fn feed(s: &mut GameState, r: &Ruleset, p: PlayerId, n: u128, facts: Vec<ObjectiveFact>) {
    let i = input(s, r, n);
    let mut c = change(s, &i);
    apply_objective_evidence(
        s,
        &i,
        r,
        &mut c,
        facts.into_iter().map(|f| evidence(&i, p, f)).collect(),
    )
    .unwrap();
    c.apply_to(s).unwrap();
}
#[test]
fn empty_compatibility_no_activation_deletion_and_validation_are_closed() {
    let (mut s, r, p, b) = fixture();
    assert!(
        !serde_json::to_value(s.world.as_ref().unwrap()).unwrap()["records"]
            .as_object()
            .unwrap()
            .contains_key("objective_runs")
    );
    feed(
        &mut s,
        &r,
        p,
        2,
        vec![ObjectiveFact::Building {
            body: b,
            building: Building::MetalMine,
            level: 10,
        }],
    );
    assert!(objective_receipts(&s, p).unwrap().is_empty());
    let run = enroll(&mut s, &r, p);
    let i = input(&s, &r, 3);
    let mut c = change(&s, &i);
    let mut next_version = program();
    next_version.version = 2;
    next_version.objectives[0].reward = Resources::all(999 * SCALE);
    assert_eq!(
        enroll_objective_program(&s, &i, &r, &mut c, p, next_version).unwrap(),
        run
    );
    c.apply_to(&mut s).unwrap();
    assert_eq!(
        s.world.as_ref().unwrap().records.objective_runs[&run]
            .program
            .version,
        1
    );
    assert_ne!(
        run,
        objective_run_id(s.universe, Epoch(Uuid::from_u128(99)), p, "fixture-economy")
    );
    assert_ne!(
        run,
        objective_run_id(
            s.universe,
            s.epoch,
            PlayerId(Uuid::from_u128(99)),
            "fixture-economy"
        )
    );
    // Evidence on/before activation is deliberately ineligible, even for advanced assets.
    feed(
        &mut s,
        &r,
        p,
        1,
        vec![ObjectiveFact::Building {
            body: b,
            building: Building::MetalMine,
            level: 21,
        }],
    );
    assert!(objective_receipts(&s, p).unwrap().is_empty());
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .lifecycle = PlayerLifecycle::Removed;
    feed(
        &mut s,
        &r,
        p,
        3,
        vec![ObjectiveFact::AttackResolved {
            fleet: FleetId(Uuid::from_u128(9999)),
        }],
    );
    assert!(objective_receipts(&s, p).unwrap().is_empty());
    let mut bad = program();
    bad.objectives[0].predicate = ObjectivePredicate::Reinvest {
        building: Building::Shipyard,
        minimum: 1,
        after_return: "haul".into(),
    };
    assert!(bad.validate(&r).is_err());
    assert!(
        serde_json::from_value::<ObjectivePredicate>(serde_json::json!({"kind":"ArbitraryScript"}))
            .is_err()
    );
}

#[test]
fn authored_sites_are_lazy_human_only_and_equivalent_contact_suppresses_issuance() {
    for (human, beginner, ordinary_first) in [
        (true, true, false),
        (true, false, false),
        (false, false, false),
        (true, true, true),
    ] {
        let (mut s, _, p, b) = fixture();
        let r = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 3).unwrap();
        s.profile_hash = r.hash.clone();
        s.collection_revisions.insert(format!("research:{p}"), 0);
        s.bodies.get_mut(&b).unwrap().levels =
            r.building_keys().into_iter().map(|k| (k, 0)).collect();
        s.research.get_mut(&p).unwrap().levels =
            r.research_keys().into_iter().map(|k| (k, 0)).collect();
        let w = s.world.as_mut().unwrap();
        w.site_fleets_enabled = true;
        w.covered_site_players.insert(p);
        for cargo in [false, true] {
            w.covered_sites
                .insert(tutorial_site_key(s.universe, s.epoch, p, cargo).id());
        }
        w.records
            .tutorial_preferences
            .insert(p, TutorialPreference { beginner });
        if !human {
            w.machine_players.insert(p);
        }
        let i = input(&s, &r, 1);
        let mut c = change(&s, &i);
        enroll_objective_program(&s, &i, &r, &mut c, p, tutorial_program()).unwrap();
        c.apply_to(&mut s).unwrap();
        assert!(s.world.as_ref().unwrap().records.mission_sites.is_empty());
        let i = input(&s, &r, 2);
        let mut c = change(&s, &i);
        let mut facts = vec![ObjectiveFact::Manufactured {
            body: b,
            ship: ShipType::LightFighter,
            quantity: 1,
        }];
        if ordinary_first {
            facts.push(ObjectiveFact::AttackResolved {
                fleet: FleetId(Uuid::from_u128(900)),
            });
        }
        apply_objective_evidence(
            &s,
            &i,
            &r,
            &mut c,
            facts
                .into_iter()
                .map(|fact| evidence(&i, p, fact))
                .collect(),
        )
        .unwrap();
        apply_tutorial_progress(&s, &i, &r, &mut c).unwrap();
        c.apply_to(&mut s).unwrap();
        assert_eq!(
            s.world.as_ref().unwrap().records.mission_sites.len(),
            usize::from(human && beginner && !ordinary_first)
        );
        let i = input(&s, &r, 3);
        let mut c = change(&s, &i);
        apply_objective_evidence(
            &s,
            &i,
            &r,
            &mut c,
            vec![evidence(
                &i,
                p,
                ObjectiveFact::AttackResolved {
                    fleet: FleetId(Uuid::from_u128(901)),
                },
            )],
        )
        .unwrap();
        apply_tutorial_progress(&s, &i, &r, &mut c).unwrap();
        c.apply_to(&mut s).unwrap();
        assert!(
            s.world
                .as_ref()
                .unwrap()
                .records
                .mission_sites
                .values()
                .all(|site| site.retired())
        );
        let i = input(&s, &r, 4);
        let mut c = change(&s, &i);
        apply_objective_evidence(
            &s,
            &i,
            &r,
            &mut c,
            vec![evidence(
                &i,
                p,
                ObjectiveFact::Manufactured {
                    body: b,
                    ship: ShipType::SmallCargo,
                    quantity: 1,
                },
            )],
        )
        .unwrap();
        apply_tutorial_progress(&s, &i, &r, &mut c).unwrap();
        c.apply_to(&mut s).unwrap();
        let cargo = tutorial_site_key(s.universe, s.epoch, p, true).id();
        assert_eq!(
            s.world
                .as_ref()
                .unwrap()
                .records
                .mission_sites
                .contains_key(&cargo),
            human && beginner
        );
        let i = input(&s, &r, 5);
        let mut c = change(&s, &i);
        apply_objective_evidence(
            &s,
            &i,
            &r,
            &mut c,
            vec![evidence(
                &i,
                p,
                ObjectiveFact::RaidLoaded {
                    fleet: FleetId(Uuid::from_u128(902)),
                    loot: Resources::all(SCALE),
                    ships: BTreeSet::from([ShipType::LightFighter, ShipType::SmallCargo]),
                },
            )],
        )
        .unwrap();
        apply_tutorial_progress(&s, &i, &r, &mut c).unwrap();
        c.apply_to(&mut s).unwrap();
        assert!(
            s.world
                .as_ref()
                .unwrap()
                .records
                .mission_sites
                .values()
                .all(|site| site.retired())
        );
        assert!(tutorial_run(&s, p).unwrap().receipts.contains_key("loaded"));
        assert!(!tutorial_run(&s, p).unwrap().receipts.contains_key("haul"));
    }
}

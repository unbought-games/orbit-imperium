use super::*;

const NETWORK: ResearchId = ResearchId::IntergalacticResearchNetwork;

fn fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = hyperspace::hyperspace_fixture();
    let mut artifact = old.artifact.clone();
    let content: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../rules/content/intergalactic-research-network.json"
    ))
    .unwrap();
    artifact.progression.as_mut().unwrap().research.insert(
        NETWORK,
        serde_json::from_value(content["research"].clone()).unwrap(),
    );
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(NETWORK))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    let r = Ruleset::from_artifact(artifact, old.speed).unwrap();
    s.profile_hash = r.hash.clone();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 10);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(10_000_000 * SCALE);
    for (key, level) in [
        (NETWORK, 1),
        (ResearchId::ComputerTechnology, 8),
        (ResearchId::HyperspaceTechnology, 8),
    ] {
        s.research.get_mut(&p).unwrap().levels.insert(key, level);
    }
    (s, r, p, b)
}

fn colony(s: &mut GameState, origin: BodyId, n: u128, level: u32) -> BodyId {
    let mut body = s.bodies[&origin].clone();
    body.id = BodyId(uuid::Uuid::from_u128(n));
    body.coordinates.position = (n % 7 + 1) as u32;
    body.levels.insert(Building::ResearchLab, level);
    let id = body.id;
    let owner = body.owner;
    s.bodies.insert(id, body);
    let mut production = s.production_settings[&origin].clone();
    production.body = id;
    s.production_settings.insert(id, production);
    s.coverage.bodies.insert(id);
    s.coverage.production_bodies.insert(id);
    s.coverage.manufacturing_bodies.insert(id);
    s.coverage.construction_bodies.insert(id);
    s.coverage.inventory_owners.insert((id, owner));
    for category in ["production", "manufacturing", "constructions"] {
        s.collection_revisions.insert(format!("{category}:{id}"), 0);
    }
    s.collection_revisions
        .insert(format!("inventory:{id}:{owner}"), 0);
    id
}

fn quote(
    s: &GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    research: ResearchId,
) -> ProgressionMaterial {
    inspect_progression(
        s,
        Actor::Player(p),
        &QuoteRequest::Research { host: b, research },
        0,
        r,
    )
    .unwrap()
    .terms
    .unwrap()
}

#[test]
fn network_selects_individually_eligible_labs_keeps_origin_and_breaks_ties_by_id() {
    let (mut s, r, p, b) = fixture();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 7);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::HyperspaceTechnology, 0);
    let high = colony(&mut s, b, 700, 12);
    colony(&mut s, b, 800, 12);
    colony(&mut s, b, 600, 6);
    let foreign = colony(&mut s, b, 500, 30);
    s.bodies.get_mut(&foreign).unwrap().owner = PlayerId(uuid::Uuid::from_u128(999));
    let moon = colony(&mut s, b, 400, 30);
    s.bodies.get_mut(&moon).unwrap().kind = BodyKind::Moon;
    let t = quote(&s, &r, p, b, ResearchId::HyperspaceTechnology);
    assert_eq!(t.duration(), 72_000); // speed 10; 720 seconds at speed 1
    assert!(
        matches!(t, ProgressionMaterial::Research { effective_lab: 19, labs, .. }
        if labs == vec![LabTerm { body: b, level: 7 }, LabTerm { body: high, level: 12 }])
    );
    s.research.get_mut(&p).unwrap().levels.insert(NETWORK, 100);
    assert!(
        matches!(quote(&s, &r, p, b, ResearchId::HyperspaceTechnology),
        ProgressionMaterial::Research { effective_lab: 31, labs, .. } if labs.len() == 3)
    );
    // A remote lab cannot unlock research from an ineligible origin.
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 6);
    blocked(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Research {
            host: b,
            research: ResearchId::HyperspaceTechnology,
        },
        GameError::PrerequisiteMissing,
    );
}

#[test]
fn network_bootstrap_cost_growth_and_each_prerequisite_use_completed_levels() {
    let (mut s, r, p, b) = fixture();
    colony(&mut s, b, 700, 12);
    s.research.get_mut(&p).unwrap().levels.insert(NETWORK, 0);
    let request = QuoteRequest::Research {
        host: b,
        research: NETWORK,
    };
    let t = quote(&s, &r, p, b, NETWORK);
    assert_eq!(
        t.paid(),
        Resources::from_values([240000, 400000, 160000].map(|v| v * SCALE))
    );
    assert_eq!(t.duration(), 20_945_000);
    for gate in [
        None,
        Some(ResearchId::ComputerTechnology),
        Some(ResearchId::HyperspaceTechnology),
    ] {
        let mut missing = s.clone();
        if let Some(key) = gate {
            missing.research.get_mut(&p).unwrap().levels.insert(key, 7);
        } else {
            missing
                .bodies
                .get_mut(&b)
                .unwrap()
                .levels
                .insert(Building::ResearchLab, 9);
        }
        blocked(
            &missing,
            &r,
            p,
            0,
            request.clone(),
            GameError::PrerequisiteMissing,
        );
    }
    let cmd = command(&s, &r, p, 0, request);
    let started = run(&mut s, &r, Actor::Player(p), 0, 19000, Input::Command(cmd));
    let op = started.research_operations[0].clone();
    assert_eq!(op.labs.len(), 1);
    run(
        &mut s,
        &r,
        Actor::Scheduler,
        op.commitment.due_at,
        19001,
        Input::Event(started.events[0].event.clone()),
    );
    let t = quote(&s, &r, p, b, NETWORK);
    assert_eq!(
        t.paid(),
        Resources::from_values([480000, 800000, 320000].map(|v| v * SCALE))
    );
    assert!(matches!(
        t,
        ProgressionMaterial::Research {
            effective_lab: 22,
            ..
        }
    ));
    assert_eq!(s.research_operations[&op.id].commitment, op.commitment);
}

#[test]
fn network_stale_remote_changes_and_incomplete_facts_fail_without_spending() {
    let (mut s, r, p, b) = fixture();
    let remote = colony(&mut s, b, 700, 12);
    let request = QuoteRequest::Research {
        host: b,
        research: NETWORK,
    };
    let cmd = command(&s, &r, p, 0, request.clone());
    s.bodies
        .get_mut(&remote)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 13);
    let before = s.clone();
    let mut input = common::input(&s, &r, Actor::Player(p), 0, 19100, Input::Command(cmd));
    input.protocol = 3;
    input.schema_version = 3;
    assert_eq!(
        transition(&s, &input, &r),
        TransitionResult::Rejected(GameError::QuoteChanged)
    );
    assert_eq!(s, before);
    for missing in 0..3 {
        let mut incomplete = s.clone();
        match missing {
            0 => {
                incomplete.coverage.owned_body_players.remove(&p);
            }
            1 => {
                incomplete.coverage.bodies.remove(&remote);
            }
            _ => {
                incomplete
                    .research
                    .get_mut(&p)
                    .unwrap()
                    .levels
                    .remove(&NETWORK);
            }
        }
        assert!(inspect_progression(&incomplete, Actor::Player(p), &request, 0, &r).is_err());
    }
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(0);
    blocked(&s, &r, p, 0, request, GameError::InsufficientResources);
}

#[test]
fn network_snapshots_survive_restart_disable_and_exact_refund_or_completion() {
    for cancel in [false, true] {
        let (mut s, r, p, b) = fixture();
        let remote = colony(&mut s, b, 700, 12);
        let unselected = colony(&mut s, b, 800, 10);
        let before = s.bodies[&b].checkpoint.amounts;
        let remote_before = s.bodies[&remote].checkpoint.amounts;
        let request = QuoteRequest::Research {
            host: b,
            research: NETWORK,
        };
        let cmd = command(&s, &r, p, 0, request.clone());
        let started = run(&mut s, &r, Actor::Player(p), 0, 19200, Input::Command(cmd));
        let op = started.research_operations[0].clone();
        assert_eq!(op.labs.len(), 2);
        assert_eq!(s.bodies[&remote].checkpoint.amounts, remote_before);
        for body in [b, remote, unselected] {
            for request in [
                QuoteRequest::Upgrade {
                    body,
                    building: Building::ResearchLab,
                },
                QuoteRequest::Demolition {
                    body,
                    building: Building::ResearchLab,
                },
            ] {
                blocked(&s, &r, p, 0, request, GameError::LabLocked);
            }
        }
        blocked(
            &s,
            &r,
            p,
            0,
            QuoteRequest::Research {
                host: remote,
                research: NETWORK,
            },
            GameError::ResearchActive,
        );
        let mut artifact = r.artifact.clone();
        artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Research(NETWORK))
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
                19201,
                Input::Command(Command::CancelResearch { operation: op.id }),
            );
            assert_eq!(s.bodies[&b].checkpoint.amounts, before);
        }
        for id in [19202, 19203] {
            run(
                &mut s,
                &next,
                Actor::Scheduler,
                op.commitment.due_at,
                id,
                Input::Event(started.events[0].event.clone()),
            );
        }
        assert_eq!(s.research[&p].levels[&NETWORK], if cancel { 1 } else { 2 });
        assert_eq!(s.research_operations[&op.id].commitment, op.commitment);
        assert_eq!(
            research_labs(&s, &s.bodies[&b], ResearchId::HyperspaceTechnology, &next)
                .unwrap()
                .len(),
            if cancel { 2 } else { 3 }
        );
    }
}

#[test]
fn network_origin_choice_and_custom_lab_requirements_change_future_duration() {
    let (mut s, r, p, b) = fixture();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 4);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .insert(ResearchId::WeaponsTechnology, 2);
    colony(&mut s, b, 700, 10);
    let high = colony(&mut s, b, 800, 12);
    // Pure formula vectors at speed 1 (legacy execution fixtures use speed 10).
    let mut wire = serde_json::to_value(&r).unwrap();
    wire["speed"] = serde_json::json!(1);
    wire["hash"] = serde_json::json!(hash(&(&wire["artifact"], 1)));
    let r: Ruleset = serde_json::from_value(wire).unwrap();
    for (origin, effective, seconds) in [(b, 16, 847), (high, 22, 626)] {
        let labs =
            research_labs(&s, &s.bodies[&origin], ResearchId::WeaponsTechnology, &r).unwrap();
        let t = research_terms_with_labs(
            &s.bodies[&origin],
            &s.research[&p],
            ResearchId::WeaponsTechnology,
            &r,
            labs,
        )
        .unwrap();
        assert_eq!(t.duration(), seconds * 1000);
        assert!(
            matches!(t, ProgressionMaterial::Research { effective_lab, .. } if effective_lab == effective)
        );
    }
    let mut artifact = r.artifact.clone();
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::WeaponsTechnology))
        .unwrap();
    entry.requirements = vec![Requirement::BodyBuilding {
        building: Building::ResearchLab,
        level: 11,
    }];
    let r = Ruleset::from_artifact(artifact, 10).unwrap();
    assert_eq!(
        research_labs(&s, &s.bodies[&high], ResearchId::WeaponsTechnology, &r).unwrap(),
        vec![LabTerm {
            body: high,
            level: 12
        }]
    );
}

#[test]
fn network_remote_lab_start_wins_against_a_previously_quoted_research_command() {
    let (mut s, r, p, b) = fixture();
    let remote = colony(&mut s, b, 700, 12);
    let research = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Research {
            host: b,
            research: NETWORK,
        },
    );
    let lab = command(
        &s,
        &r,
        p,
        0,
        QuoteRequest::Upgrade {
            body: remote,
            building: Building::ResearchLab,
        },
    );
    run(&mut s, &r, Actor::Player(p), 0, 19300, Input::Command(lab));
    let before = s.clone();
    let mut input = common::input(&s, &r, Actor::Player(p), 0, 19301, Input::Command(research));
    input.protocol = 3;
    input.schema_version = 3;
    assert_eq!(
        transition(&s, &input, &r),
        TransitionResult::Rejected(GameError::LabLocked)
    );
    assert_eq!(s, before);
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
        .unwrap()
        .blockers
        .is_empty()
    );
}

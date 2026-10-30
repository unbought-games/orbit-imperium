use super::*;

pub(super) fn plasma_fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let (mut s, old, p, b) = ion_fixture();
    let mut artifact = old.artifact.clone();
    let content: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../rules/content/plasma-technology.json"
    ))
    .unwrap();
    artifact.progression.as_mut().unwrap().research.insert(
        ResearchId::PlasmaTechnology,
        serde_json::from_value(content["research"].clone()).unwrap(),
    );
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::PlasmaTechnology))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    let r = Ruleset::from_artifact(artifact, old.speed).unwrap();
    s.profile_hash = r.hash.clone();
    for (key, level) in [
        (ResearchId::EnergyTechnology, 8),
        (ResearchId::LaserTechnology, 10),
        (ResearchId::IonTechnology, 5),
        (ResearchId::PlasmaTechnology, 0),
    ] {
        s.research.get_mut(&p).unwrap().levels.insert(key, level);
    }
    (s, r, p, b)
}

#[test]
fn plasma_requires_each_completed_gate_and_doubles_costs_with_exact_duration() {
    let (mut s, r, p, b) = plasma_fixture();
    let request = QuoteRequest::Research {
        host: b,
        research: ResearchId::PlasmaTechnology,
    };
    for (lab, energy, laser, ion) in [(3, 8, 10, 5), (4, 7, 10, 5), (4, 8, 9, 5), (4, 8, 10, 4)] {
        let mut missing = s.clone();
        missing
            .bodies
            .get_mut(&b)
            .unwrap()
            .levels
            .insert(Building::ResearchLab, lab);
        missing
            .research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::EnergyTechnology, energy);
        missing
            .research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::LaserTechnology, laser);
        missing
            .research
            .get_mut(&p)
            .unwrap()
            .levels
            .insert(ResearchId::IonTechnology, ion);
        blocked(
            &missing,
            &r,
            p,
            0,
            request.clone(),
            GameError::PrerequisiteMissing,
        );
        // A previously valid quote cannot bypass newly missing completed gates.
        let cmd = command(&s, &r, p, 0, request.clone());
        let mut input = common::input(&missing, &r, Actor::Player(p), 0, 9200, Input::Command(cmd));
        input.protocol = 3;
        input.schema_version = 3;
        let expected = if lab < 4 {
            GameError::QuoteChanged
        } else {
            GameError::PrerequisiteMissing
        };
        assert!(matches!(
            transition(&missing, &input, &r),
            TransitionResult::Rejected(code) if code == expected
        ));
    }
    let mut at = 0;
    for (level, costs, duration) in [
        (1, [2000, 4000, 1000], 432_000),
        (2, [4000, 8000, 2000], 864_000),
        (3, [8000, 16000, 4000], 1_728_000),
    ] {
        let terms = research_terms(
            &s.bodies[&b],
            &s.research[&p],
            ResearchId::PlasmaTechnology,
            &r,
        )
        .unwrap();
        assert_eq!(
            terms.paid(),
            Resources::from_values(costs.map(|n| n * SCALE))
        );
        assert_eq!(terms.duration(), duration);
        let cmd = command(&s, &r, p, at, request.clone());
        let started = run(
            &mut s,
            &r,
            Actor::Player(p),
            at,
            9300 + u128::from(level) * 2,
            Input::Command(cmd),
        );
        assert_eq!(
            s.research[&p].levels[&ResearchId::PlasmaTechnology],
            level - 1
        );
        blocked(&s, &r, p, at, request.clone(), GameError::ResearchActive);
        blocked(
            &s,
            &r,
            p,
            at,
            QuoteRequest::Upgrade {
                body: b,
                building: Building::ResearchLab,
            },
            GameError::LabLocked,
        );
        at = started.events[0].at;
        run(
            &mut s,
            &r,
            Actor::Scheduler,
            at,
            9301 + u128::from(level) * 2,
            Input::Event(started.events[0].event.clone()),
        );
        assert_eq!(s.research[&p].levels[&ResearchId::PlasmaTechnology], level);
    }
}

#[test]
fn plasma_paid_work_survives_disable_and_restart_with_exact_cancellation_refund() {
    for cancel in [true, false] {
        let (mut s, r, p, b) = plasma_fixture();
        let before = s.bodies[&b].checkpoint.amounts;
        let request = QuoteRequest::Research {
            host: b,
            research: ResearchId::PlasmaTechnology,
        };
        let cmd = command(&s, &r, p, 0, request.clone());
        let started = run(&mut s, &r, Actor::Player(p), 0, 9400, Input::Command(cmd));
        let op = started.research_operations[0].clone();
        assert_eq!(op.commitment.due_at, 432_000); // Legacy progression fixture runs at 10x.
        let mut artifact = r.artifact.clone();
        artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Research(ResearchId::PlasmaTechnology))
            .unwrap()
            .enabled = false;
        artifact
            .progression
            .as_mut()
            .unwrap()
            .research
            .get_mut(&ResearchId::PlasmaTechnology)
            .unwrap()
            .base = [4000, 8000, 2000];
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
                9401,
                Input::Command(Command::CancelResearch { operation: op.id }),
            );
            assert_eq!(s.bodies[&b].checkpoint.amounts, before);
        }
        run(
            &mut s,
            &next,
            Actor::Scheduler,
            op.commitment.due_at,
            9402,
            Input::Event(started.events[0].event.clone()),
        );
        assert_eq!(
            s.research[&p].levels[&ResearchId::PlasmaTechnology],
            u32::from(!cancel)
        );
        blocked(
            &s,
            &next,
            p,
            op.commitment.due_at,
            request,
            GameError::UnavailableContent,
        );
    }
}

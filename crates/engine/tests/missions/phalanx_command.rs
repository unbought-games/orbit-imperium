use super::*;
use std::collections::BTreeMap;

fn setup() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, old, p, parent, target) = fixture();
    let mut artifact = old.artifact.clone();
    artifact.world.as_mut().unwrap().phalanx = Some(PHALANX_PROFILE_V1.into());
    artifact.buildings.insert(
        Building::SensorPhalanx,
        BuildingRule {
            base: [20000, 40000, 20000],
            growth: [2, 1],
        },
    );
    let r = Ruleset::from_artifact(artifact, old.speed).unwrap();
    s.profile_hash = r.hash.clone();
    for body in s.bodies.values_mut() {
        body.levels.insert(Building::SensorPhalanx, 0);
    }
    let moon = moons::add_moon(&mut s, parent, 90000);
    s.bodies
        .get_mut(&moon)
        .unwrap()
        .levels
        .insert(Building::SensorPhalanx, 1);
    s.bodies
        .get_mut(&moon)
        .unwrap()
        .checkpoint
        .amounts
        .deuterium = 9999 * SCALE;
    s.world.as_mut().unwrap().phalanx = Some(PhalanxScanFacts {
        target,
        endpoints: BTreeMap::new(),
        owners: BTreeMap::new(),
    });
    (s, r, p, moon, target)
}
fn scan(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    moon: BodyId,
    target: BodyId,
    n: u128,
) -> TransitionResult {
    s.world
        .as_mut()
        .unwrap()
        .covered_reports
        .insert(phalanx_report_id(InputId(Uuid::from_u128(n))));
    run(
        s,
        r,
        p,
        moon,
        2000,
        n,
        Input::Command(Command::World {
            action: WorldAction::ScanPlanet {
                source_moon: moon,
                target_planet: target,
            },
        }),
    )
}
#[test]
fn accepted_empty_scan_pays_local_fuel_once_and_second_observation_cannot_borrow_parent() {
    let (mut s, r, p, moon, target) = setup();
    let before = s.bodies.clone();
    let result = scan(&mut s, &r, p, moon, target, 90001);
    let c = apply(&mut s, result);
    assert_eq!(c.affected_viewers, BTreeSet::from([p]));
    assert_eq!(s.bodies[&moon].checkpoint.amounts.deuterium, 4999 * SCALE);
    for (id, body) in before {
        if id != moon {
            assert_eq!(s.bodies[&id], body);
        }
    }
    let report = &s.world.as_ref().unwrap().records.reports
        [&phalanx_report_id(InputId(Uuid::from_u128(90001)))];
    assert_eq!(report.payloads.len(), 1);
    assert_eq!(
        report.payloads[&p]["observation"]["report"]["rows"],
        serde_json::json!([])
    );
    let snapshot = report.clone();
    assert_eq!(
        scan(&mut s, &r, p, moon, target, 90002),
        TransitionResult::Rejected(GameError::InsufficientResources)
    );
    assert_eq!(
        s.world.as_ref().unwrap().records.reports[&snapshot.id],
        snapshot
    );
}
#[test]
fn disabled_incomplete_unpaired_and_policy_rejections_never_produce_a_change() {
    let (mut s, r, p, moon, target) = setup();
    let mut a = r.artifact.clone();
    a.world.as_mut().unwrap().phalanx = None;
    let disabled = Ruleset::from_artifact(a, r.speed).unwrap();
    s.profile_hash = disabled.hash.clone();
    assert_eq!(
        scan(&mut s, &disabled, p, moon, target, 90001),
        TransitionResult::Rejected(GameError::UnavailableContent)
    );
    s.profile_hash = r.hash.clone();
    let owner = s.bodies[&target].owner;
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&owner)
        .unwrap()
        .vacation = VacationState::Active {
        entered_at: 0,
        policy_hash: r.hash.clone(),
    };
    assert_eq!(
        scan(&mut s, &r, p, moon, target, 90002),
        TransitionResult::Rejected(GameError::TargetVacation)
    );
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&owner)
        .unwrap()
        .vacation = VacationState::default();
    s.world.as_mut().unwrap().phalanx = None;
    assert!(matches!(
        scan(&mut s, &r, p, moon, target, 90003),
        TransitionResult::InvalidState(_)
    ));
    assert_eq!(s.bodies[&moon].checkpoint.amounts.deuterium, 9999 * SCALE);
    assert!(s.world.as_ref().unwrap().records.reports.is_empty());
}
#[test]
fn scopes_cover_both_endpoints_and_target_policy_without_foreign_viewer_invalidation() {
    let (s, _, p, moon, target) = setup();
    let refs = ScopeReferences {
        bodies: s
            .bodies
            .values()
            .map(|b| (b.id, (b.owner, b.coordinates)))
            .collect(),
        ..Default::default()
    };
    let scopes = command_scopes(
        p,
        &Command::World {
            action: WorldAction::ScanPlanet {
                source_moon: moon,
                target_planet: target,
            },
        },
        &refs,
    )
    .unwrap();
    assert_eq!(
        scopes,
        BTreeSet::from([
            ScopeKey::Player(p),
            ScopeKey::Player(s.bodies[&target].owner),
            ScopeKey::Location(s.bodies[&moon].coordinates),
            ScopeKey::Location(s.bodies[&target].coordinates)
        ])
    );
}

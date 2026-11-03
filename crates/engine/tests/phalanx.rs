use orbit_engine::*;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
#[allow(dead_code)]
mod common;
fn id(n: u128) -> BodyId {
    BodyId(Uuid::from_u128(n))
}
fn coords(system: u32) -> Coordinates {
    Coordinates {
        galaxy: 1,
        system,
        position: 8,
    }
}
fn policy(player: PlayerId) -> PlayerPolicy {
    PlayerPolicy {
        player,
        deletion_requested_at: None,
        last_presence_at: 0,
        vacation: VacationState::default(),
        lifecycle: PlayerLifecycle::Active,
        policy_hash: Hash("private".into()),
        revision: 99,
    }
}
fn fleet(mission: Mission) -> MissionFleet {
    let owner = PlayerId(Uuid::from_u128(1));
    let intent = FleetIntent {
        attack_group: None,
        hold_hours: (mission == Mission::Hold).then_some(1),
        origin: id(10),
        destination: MissionDestination::Body {
            id: id(20),
            expected_kind: BodyKind::Planet,
            expected_owner: PlayerId(Uuid::from_u128(2)),
        },
        mission,
        ships: vec![ManifestStack {
            owner,
            ship_type: ShipType::SmallCargo,
            count: 7,
        }],
        cargo: Resources::all(12345),
        speed_percent: 80,
    };
    let terms = FleetTermsData {
        group_revision: None,
        holding: (mission == Mission::Hold).then_some(HoldingTerms {
            duration_ms: 3000,
            rates: BTreeMap::new(),
            fuel: 0,
        }),
        intent: intent.clone(),
        profile_hash: Hash("private".into()),
        distance: 1,
        speeds: vec![(ShipType::SmallCargo, "5000".into())],
        duration_ms: 1000,
        fuel: SCALE,
        capacity: 100000,
        maximum_payload: 100000,
        slot_limit: 10,
        terms_hash: Hash("".into()),
    }
    .seal();
    MissionFleet {
        return_reason: None,
        id: FleetId(Uuid::from_u128(100)),
        owner,
        intent,
        origin_coordinates: coords(1),
        destination_coordinates: coords(999),
        terms,
        authorization: MissionAuthorization {
            actor: owner,
            target_owner: Some(PlayerId(Uuid::from_u128(2))),
            at: 100,
            input: InputId(Uuid::from_u128(99)),
            policy_hash: Hash("private".into()),
        },
        ships: vec![ShipStack {
            owner,
            ship_type: ShipType::SmallCargo,
            count: 7,
        }],
        cargo: Resources::all(12345),
        launched_at: 100,
        due_at: 1100,
        generation: 0,
        leg: MissionLeg::Outbound,
        revision: 55,
    }
}
fn endpoints(origin: PhalanxEndpointKind, target: PhalanxEndpointKind) -> PhalanxEndpoints {
    let a = PhalanxEndpoint {
        coordinates: coords(1),
        kind: origin,
        body: Some(id(10)),
    };
    let b = PhalanxEndpoint {
        coordinates: coords(999),
        kind: target,
        body: Some(id(20)),
    };
    PhalanxEndpoints {
        original_origin: a.clone(),
        effective_origin: a,
        original_destination: b.clone(),
        effective_destination: b,
    }
}
fn owners() -> BTreeMap<PlayerId, PhalanxPublicOwner> {
    let id = PlayerId(Uuid::from_u128(1));
    BTreeMap::from([(
        id,
        PhalanxPublicOwner {
            id,
            name: "Public Captain".into(),
        },
    )])
}
fn observed(
    world: &WorldRecords,
    f: &MissionFleet,
    ep: &PhalanxEndpoints,
    target: BodyId,
) -> Option<PhalanxDeadline> {
    project_phalanx_fleet(target, world, f, ep, &owners())
        .unwrap()
        .map(|row| match row {
            PhalanxObservationV1::Fleet { deadline, .. } => deadline,
            _ => unreachable!(),
        })
}
#[test]
fn linear_range_includes_level_one_own_system_and_checked_u32_max_square() {
    let topology = UniverseProfile::signup(2, 1000).unwrap();
    for (level, target, expected) in [
        (0, 100, false),
        (1, 100, true),
        (1, 101, false),
        (3, 92, true),
        (3, 108, true),
        (3, 91, false),
        (3, 109, false),
        (u32::MAX, 1000, true),
    ] {
        assert_eq!(
            phalanx_in_range(&topology, coords(100), coords(target), level),
            Ok(expected)
        );
    }
    assert_eq!(
        phalanx_in_range(&topology, coords(1), coords(1000), 2),
        Ok(false)
    );
    assert_eq!(
        phalanx_in_range(
            &topology,
            coords(1),
            Coordinates {
                galaxy: 2,
                ..coords(1)
            },
            u32::MAX
        ),
        Ok(false)
    );
    assert!(phalanx_in_range(&topology, coords(0), coords(1), 1).is_err());
}
#[test]
fn eligibility_checks_local_completed_level_and_policy_without_hostile_score_rules() {
    let (s, _, actor, body) = common::fixture();
    let mut source = s.bodies[&body].clone();
    source.kind = BodyKind::Moon;
    source.coordinates = coords(100);
    source.levels.insert(Building::SensorPhalanx, 3);
    source.checkpoint.amounts.deuterium = PHALANX_COST_V1;
    let mut target = source.clone();
    target.id = id(20);
    target.kind = BodyKind::Planet;
    target.owner = PlayerId(Uuid::from_u128(2));
    target.coordinates = coords(108);
    let topology = UniverseProfile::signup(2, 1000).unwrap();
    let actor_policy = policy(actor);
    let target_policy = policy(target.owner);
    let validate = |a: &Body, t: &Body, ap: &PlayerPolicy, tp: &PlayerPolicy| {
        validate_phalanx_scan(actor, a, t, ap, tp, &topology)
    };
    let before = source.clone();
    assert_eq!(
        validate(&source, &target, &actor_policy, &target_policy),
        Ok(())
    );
    assert_eq!(
        source, before,
        "validation never charges even accepted empty scans"
    );
    for (change, expected) in [
        (0, GameError::InsufficientResources),
        (1, GameError::UnavailableContent),
        (2, GameError::NotOwned),
        (3, GameError::BodyKindNotAllowed),
    ] {
        let mut source = source.clone();
        match change {
            0 => source.checkpoint.amounts.deuterium -= 1,
            1 => {
                source.levels.insert(Building::SensorPhalanx, 0);
            }
            2 => source.owner = target.owner,
            _ => source.kind = BodyKind::Planet,
        }
        assert_eq!(
            validate(&source, &target, &actor_policy, &target_policy),
            Err(expected)
        );
    }
    for lifecycle in [PlayerLifecycle::DeletionDraining, PlayerLifecycle::Removed] {
        let mut p = actor_policy.clone();
        p.lifecycle = lifecycle;
        assert_eq!(
            validate(&source, &target, &p, &target_policy),
            Err(GameError::ActorDraining)
        );
    }
    let mut p = actor_policy.clone();
    p.vacation = VacationState::Legacy(true);
    assert_eq!(
        validate(&source, &target, &p, &target_policy),
        Err(GameError::ActorVacation)
    );
    let mut p = target_policy.clone();
    p.vacation = VacationState::Legacy(true);
    assert_eq!(
        validate(&source, &target, &actor_policy, &p),
        Err(GameError::TargetVacation)
    );
    target.owner = actor;
    assert_eq!(
        validate(&source, &target, &actor_policy, &actor_policy),
        Err(GameError::InvalidInput)
    );
    target.owner = target_policy.player;
    target.kind = BodyKind::Moon;
    assert_eq!(
        validate(&source, &target, &actor_policy, &target_policy),
        Err(GameError::BodyKindNotAllowed)
    );
}
#[test]
fn exhaustive_mission_phase_endpoint_visibility_matrix() {
    let w = WorldRecords::default();
    for mission in [
        Mission::Transport,
        Mission::Harvest,
        Mission::Espionage,
        Mission::Attack,
        Mission::Deploy,
        Mission::Colonize,
        Mission::Hold,
    ] {
        for origin in [PhalanxEndpointKind::Planet, PhalanxEndpointKind::Moon] {
            for target in [
                PhalanxEndpointKind::Planet,
                PhalanxEndpointKind::Moon,
                PhalanxEndpointKind::Debris,
                PhalanxEndpointKind::EmptyPosition,
            ] {
                let ep = endpoints(origin, target);
                let mut f = fleet(mission);
                let home_visible = origin == PhalanxEndpointKind::Planet;
                let target_visible = target == PhalanxEndpointKind::Planet
                    && !matches!(mission, Mission::Harvest | Mission::Colonize);
                let expected_home = (home_visible && mission != Mission::Deploy).then_some(
                    PhalanxDeadline::Return(if mission == Mission::Hold { 5100 } else { 2100 }),
                );
                assert_eq!(
                    observed(&w, &f, &ep, id(10)),
                    expected_home,
                    "{mission:?} {origin:?} {target:?}"
                );
                assert_eq!(
                    observed(&w, &f, &ep, id(20)),
                    target_visible.then_some(PhalanxDeadline::Arrival(1100))
                );
                for reason in [
                    MissionReturnReason::VoluntaryRecall,
                    MissionReturnReason::InvalidTarget,
                ] {
                    f.leg = MissionLeg::Returning;
                    f.return_reason = Some(reason);
                    f.due_at = 1500;
                    assert_eq!(
                        observed(&w, &f, &ep, id(10)),
                        (home_visible
                            && !(mission == Mission::Deploy
                                && reason == MissionReturnReason::VoluntaryRecall))
                            .then_some(PhalanxDeadline::Return(1500))
                    );
                    assert_eq!(observed(&w, &f, &ep, id(20)), None);
                }
                f.return_reason = None;
                if mission == Mission::Hold {
                    f.leg = MissionLeg::Holding;
                    f.due_at = 4100;
                    assert_eq!(
                        observed(&w, &f, &ep, id(10)),
                        home_visible.then_some(PhalanxDeadline::Return(5100))
                    );
                    assert_eq!(
                        observed(&w, &f, &ep, id(20)),
                        target_visible.then_some(PhalanxDeadline::HoldEnd(4100))
                    );
                }
                for leg in [
                    MissionLeg::Returned,
                    MissionLeg::Destroyed,
                    MissionLeg::Colonized,
                    MissionLeg::Deployed,
                ] {
                    f.leg = leg;
                    assert_eq!(observed(&w, &f, &ep, id(10)), None);
                    assert_eq!(observed(&w, &f, &ep, id(20)), None);
                }
            }
        }
    }
}
#[test]
fn group_delay_uses_effective_arrival_and_independent_member_duration() {
    let mut w = WorldRecords::default();
    let first = fleet(Mission::Attack);
    let mut second = first.clone();
    second.id = FleetId(Uuid::from_u128(101));
    let mut terms = (*second.terms).clone();
    terms.duration_ms = 2000;
    second.terms = terms.seal();
    let g = AttackGroup {
        id: OperationId(Uuid::from_u128(50)),
        initiator: first.id,
        members: BTreeSet::from([first.id, second.id]),
        invited: BTreeSet::new(),
        arrival_at: 3100,
        generation: 1,
        revision: 1,
        resolved_at: None,
    };
    w.attack_groups.insert(g.id, g);
    let ep = endpoints(PhalanxEndpointKind::Planet, PhalanxEndpointKind::Planet);
    for (f, expected) in [(&first, 4100), (&second, 5100)] {
        assert_eq!(
            observed(&w, f, &ep, id(10)),
            Some(PhalanxDeadline::Return(expected))
        );
        assert_eq!(
            observed(&w, f, &ep, id(20)),
            Some(PhalanxDeadline::Arrival(3100))
        );
    }
}
#[test]
fn hold_extensions_equal_endpoints_and_future_fallback_preserve_causal_privacy() {
    let w = WorldRecords::default();
    let mut ep = endpoints(PhalanxEndpointKind::Planet, PhalanxEndpointKind::Planet);
    let mut f = fleet(Mission::Hold);
    f.leg = MissionLeg::Holding;
    f.due_at = 9100;
    assert_eq!(
        observed(&w, &f, &ep, id(10)),
        Some(PhalanxDeadline::Return(10100))
    );
    assert_eq!(
        observed(&w, &f, &ep, id(20)),
        Some(PhalanxDeadline::HoldEnd(9100))
    );
    ep.effective_origin = ep.effective_destination.clone();
    assert_eq!(
        observed(&w, &f, &ep, id(20)),
        Some(PhalanxDeadline::HoldEnd(9100))
    );
    f.leg = MissionLeg::Outbound;
    assert_eq!(
        observed(&w, &f, &ep, id(20)),
        Some(PhalanxDeadline::Arrival(9100))
    );
    f.leg = MissionLeg::Returning;
    f.return_reason = Some(MissionReturnReason::VoluntaryRecall);
    assert_eq!(
        observed(&w, &f, &ep, id(20)),
        Some(PhalanxDeadline::Return(9100))
    );
    f.intent.mission = Mission::Deploy;
    ep.original_origin.kind = PhalanxEndpointKind::Moon;
    assert_eq!(observed(&w, &f, &ep, id(20)), None);
    f.return_reason = None;
    assert!(project_phalanx_fleet(id(20), &w, &f, &ep, &owners()).is_err());
}
#[test]
fn privacy_snapshot_has_exact_ships_one_deadline_and_no_private_fields() {
    let f = fleet(Mission::Espionage);
    let w = WorldRecords::default();
    let ep = endpoints(PhalanxEndpointKind::Planet, PhalanxEndpointKind::Planet);
    let row = project_phalanx_fleet(id(20), &w, &f, &ep, &owners())
        .unwrap()
        .unwrap();
    let value = serde_json::to_value(row).unwrap();
    assert_eq!(
        value,
        serde_json::json!({
            "kind":"Fleet","owner":{"id":f.owner,"name":"Public Captain"},"mission":"Espionage","phase":"Outbound",
            "endpoints":ep,"ships":[{"ship_type":"SmallCargo","count":"7"}],"deadline":{"kind":"Arrival","at":1100}
        })
    );
    let report = |rows| {
        PhalanxReport::V1(PhalanxReportV1 {
            id: ReportId(Uuid::from_u128(999)),
            at: 500,
            source: ep.original_origin.clone(),
            target: ep.effective_destination.clone(),
            cost: PHALANX_COST_V1,
            rows,
        })
    };
    let hidden = endpoints(PhalanxEndpointKind::Moon, PhalanxEndpointKind::Moon);
    let rows = project_phalanx_fleet(id(20), &w, &f, &hidden, &BTreeMap::new())
        .unwrap()
        .into_iter()
        .collect();
    assert_eq!(
        serde_json::to_string(&report(rows)).unwrap(),
        serde_json::to_string(&report(vec![])).unwrap()
    );
}
#[test]
fn missile_rows_only_disclose_target_impact_and_public_source() {
    let f = fleet(Mission::Attack);
    let terms = MissileTermsData {
        intent: MissileIntent {
            origin: id(10),
            target: MissileTarget {
                id: id(20),
                expected_kind: BodyKind::Planet,
                expected_owner: PlayerId(Uuid::from_u128(2)),
            },
            count: 12,
            primary: Some(DefenseId::RocketLauncher),
        },
        source_coordinates: coords(1),
        target_coordinates: coords(999),
        interceptor_body: id(20),
        distance: 1,
        range: 1,
        duration_ms: 1000,
        weapons: 99,
        speed: 1,
        rules: missile_rules(&upgrade_standard_rules(&Ruleset::mvp_raids().unwrap()).unwrap())
            .unwrap()
            .clone(),
        profile_hash: Hash("private".into()),
        terms_hash: Hash("".into()),
    }
    .seal();
    let mut m = MissileFlight {
        id: OperationId(Uuid::from_u128(777)),
        owner: f.owner,
        terms,
        launched_at: 100,
        due_at: 1100,
        generation: 99,
        status: MissileStatus::InFlight,
    };
    assert_eq!(
        project_phalanx_missile(id(10), &m, &BTreeMap::new()).unwrap(),
        None
    );
    let row = project_phalanx_missile(id(20), &m, &owners())
        .unwrap()
        .unwrap();
    assert_eq!(
        serde_json::to_value(row).unwrap(),
        serde_json::json!({"kind":"Missile","attacker":{"id":f.owner,"name":"Public Captain"},"source":coords(1),"target":{"coordinates":coords(999),"kind":"Planet","body":id(20)},"count":"12","deadline":{"kind":"Impact","at":1100}})
    );
    let mut terms = (*m.terms).clone();
    terms.intent.target.expected_kind = BodyKind::Moon;
    m.terms = terms.seal();
    assert_eq!(
        project_phalanx_missile(id(20), &m, &BTreeMap::new()).unwrap(),
        None
    );
    let mut terms = (*m.terms).clone();
    terms.intent.target.expected_kind = BodyKind::Planet;
    m.terms = terms.seal();
    for status in [
        MissileStatus::Destroyed,
        MissileStatus::Impacted,
        MissileStatus::NoTarget,
    ] {
        m.status = status;
        assert_eq!(
            project_phalanx_missile(id(20), &m, &BTreeMap::new()).unwrap(),
            None
        );
    }
}
#[test]
fn historical_serialization_preserves_omissions_terms_hashes_and_unknown_causes() {
    let mut f = fleet(Mission::Deploy);
    f.leg = MissionLeg::Returning;
    let legacy = serde_json::to_value(&f).unwrap();
    assert!(legacy.get("return_reason").is_none());
    assert_eq!(
        serde_json::to_value(serde_json::from_value::<MissionFleet>(legacy.clone()).unwrap())
            .unwrap(),
        legacy
    );
    let terms = serde_json::to_value(&f.terms).unwrap();
    for reason in [
        MissionReturnReason::VoluntaryRecall,
        MissionReturnReason::InvalidTarget,
    ] {
        f.return_reason = Some(reason);
        let restored: MissionFleet =
            serde_json::from_value(serde_json::to_value(&f).unwrap()).unwrap();
        assert_eq!(restored.return_reason, Some(reason));
        assert_eq!(serde_json::to_value(&restored.terms).unwrap(), terms);
        validate_mission_return_reason(&restored).unwrap();
    }
    f.leg = MissionLeg::Outbound;
    assert!(validate_mission_return_reason(&f).is_err());
    f.leg = MissionLeg::Returning;
    f.return_reason = Some(MissionReturnReason::MissionComplete);
    assert!(validate_mission_return_reason(&f).is_err());
}

#[test]
fn endpoint_binding_never_scans_moons_through_parents_or_binds_colonization_to_new_occupants() {
    let (s, _, _, body) = common::fixture();
    let mut moon = s.bodies[&body].clone();
    moon.id = id(10);
    moon.kind = BodyKind::Moon;
    let mut later_colony = moon.clone();
    later_colony.id = id(20);
    later_colony.kind = BodyKind::Planet;
    let bodies = BTreeMap::from([
        (moon.id, moon.clone()),
        (later_colony.id, later_colony.clone()),
    ]);
    let mut f = fleet(Mission::Colonize);
    f.intent.destination = MissionDestination::EmptyPosition {
        coordinates: later_colony.coordinates,
        slot_revision: 0,
    };
    let ep = phalanx_endpoints(&f, &bodies).unwrap();
    assert_eq!(ep.effective_origin.kind, PhalanxEndpointKind::Moon);
    assert_eq!(
        ep.effective_destination.kind,
        PhalanxEndpointKind::EmptyPosition
    );
    assert_eq!(ep.effective_destination.body, None);
    assert_eq!(
        observed(&WorldRecords::default(), &f, &ep, later_colony.id),
        None
    );
    assert_eq!(observed(&WorldRecords::default(), &f, &ep, moon.id), None);
    assert!(phalanx_endpoints(&f, &BTreeMap::new()).is_err());
}

#[test]
fn return_deadline_overflow_is_an_invariant_error_and_hidden_rows_need_no_prediction() {
    let mut f = fleet(Mission::Transport);
    f.due_at = MAX_WIRE_MS;
    let ep = endpoints(PhalanxEndpointKind::Planet, PhalanxEndpointKind::Planet);
    let w = WorldRecords::default();
    assert!(project_phalanx_fleet(id(10), &w, &f, &ep, &owners()).is_err());
    assert_eq!(
        observed(&w, &f, &ep, id(20)),
        Some(PhalanxDeadline::Arrival(MAX_WIRE_MS))
    );
    assert_eq!(
        project_phalanx_fleet(id(30), &w, &f, &ep, &BTreeMap::new()).unwrap(),
        None
    );
}

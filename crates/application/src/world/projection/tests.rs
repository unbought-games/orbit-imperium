use super::*;
use serde_json::json;
use uuid::Uuid;

fn player(n: u128) -> PlayerId {
    PlayerId(Uuid::from_u128(n))
}

fn fleet(n: u128, owner: PlayerId, target: PlayerId, leg: MissionLeg) -> MissionFleet {
    let intent = FleetIntent {
        origin: BodyId(Uuid::from_u128(10)),
        destination: MissionDestination::Body {
            id: BodyId(Uuid::from_u128(20)),
            expected_kind: BodyKind::Planet,
            expected_owner: target,
        },
        mission: Mission::Transport,
        ships: vec![ManifestStack {
            owner,
            ship_type: ShipType::SmallCargo,
            count: 9,
        }],
        cargo: Resources::all(100),
        speed_percent: 100,
    };
    MissionFleet {
        id: FleetId(Uuid::from_u128(n)),
        owner,
        intent: intent.clone(),
        origin_coordinates: Coordinates {
            galaxy: 1,
            system: 2,
            position: 3,
        },
        destination_coordinates: Coordinates {
            galaxy: 1,
            system: 2,
            position: 4,
        },
        terms: FleetTerms {
            intent,
            profile_hash: Hash("historical-profile".into()),
            distance: 1000,
            speeds: vec![],
            duration_ms: 500,
            fuel: 123,
            capacity: 10000,
            maximum_payload: 9877,
            slot_limit: 1,
            terms_hash: Hash("paid-terms".into()),
        },
        authorization: MissionAuthorization {
            actor: owner,
            target_owner: Some(target),
            at: 10,
            input: InputId(Uuid::from_u128(30)),
            policy_hash: Hash("historical-policy".into()),
        },
        ships: vec![
            ShipStack {
                owner,
                ship_type: ShipType::SmallCargo,
                count: 2,
            },
            ShipStack {
                owner,
                ship_type: ShipType::EspionageProbe,
                count: 3,
            },
        ],
        cargo: Resources::from_values([7, 8, 9]),
        launched_at: 10,
        due_at: 510,
        generation: 1,
        leg,
        revision: 2,
    }
}

fn research() -> ResearchLevels {
    ResearchLevels {
        owner: player(1),
        levels: ResearchId::MVP.into_iter().map(|id| (id, 0)).collect(),
        revision: 0,
    }
}

#[test]
fn own_missions_exclude_foreign_and_terminal_fleets() {
    for leg in [
        MissionLeg::Outbound,
        MissionLeg::Returning,
        MissionLeg::Returned,
        MissionLeg::Destroyed,
    ] {
        assert!(own_mission(&fleet(1, player(2), player(1), leg), player(1), 100).is_none());
        assert_eq!(
            own_mission(&fleet(1, player(1), player(2), leg), player(1), 100).is_some(),
            matches!(leg, MissionLeg::Outbound | MissionLeg::Returning)
        );
    }
}

#[test]
fn recall_is_available_only_before_outbound_deadline() {
    for leg in [MissionLeg::Outbound, MissionLeg::Returning] {
        for at in [509, 510, 511] {
            let projected =
                own_mission(&fleet(1, player(1), player(2), leg), player(1), at).unwrap();
            assert_eq!(
                projected.can_recall,
                leg == MissionLeg::Outbound && at == 509
            );
        }
    }
}

#[test]
fn own_projection_keeps_paid_terms_and_current_manifest_and_cargo() {
    let f = fleet(1, player(1), player(2), MissionLeg::Returning);
    let wire = serde_json::to_value(own_mission(&f, player(1), 100).unwrap()).unwrap();
    assert_eq!(
        wire,
        json!({
            "id": f.id, "intent": f.intent, "origin": {"galaxy":1,"system":2,"position":3},
            "destination": {"galaxy":1,"system":2,"position":4}, "leg":"Returning",
            "ships":[{"ship_type":"SmallCargo","count":"2"},{"ship_type":"EspionageProbe","count":"3"}],
            "cargo":{"metal":"7","crystal":"8","deuterium":"9"}, "due_at":510,
            "launched_at":10, "duration_ms":500, "paid_fuel":"123", "can_recall":false
        })
    );
}

#[test]
fn incoming_visibility_requires_foreign_outbound_body_target_for_viewer() {
    for leg in [
        MissionLeg::Outbound,
        MissionLeg::Returning,
        MissionLeg::Returned,
        MissionLeg::Destroyed,
    ] {
        let f = fleet(1, player(2), player(1), leg);
        assert_eq!(
            incoming_mission(&f, player(1), 8).unwrap().is_some(),
            leg == MissionLeg::Outbound
        );
    }
    for (owner, target) in [(player(1), player(1)), (player(2), player(3))] {
        assert!(
            incoming_mission(&fleet(1, owner, target, MissionLeg::Outbound), player(1), 8)
                .unwrap()
                .is_none()
        );
    }
    let mut f = fleet(1, player(2), player(1), MissionLeg::Outbound);
    f.intent.destination = MissionDestination::Debris {
        coordinates: f.destination_coordinates,
        field_identity: OperationId::default(),
    };
    assert!(incoming_mission(&f, player(1), 8).unwrap().is_none());
}

#[test]
fn incoming_disclosure_respects_every_research_threshold_and_wire_privacy() {
    let f = fleet(1, player(2), player(1), MissionLeg::Outbound);
    for level in [0, 1, 2, 3, 4, 7, 8, u32::MAX] {
        let ships = match level {
            0 | 1 => json!({"visibility":"Unknown"}),
            2 | 3 => json!({"visibility":"Total","total":"5"}),
            4 | 7 => {
                json!({"visibility":"Types","total":"5","types":["SmallCargo","EspionageProbe"]})
            }
            _ => json!({"visibility":"Exact","total":"5","ships":[
                {"ship_type":"SmallCargo","count":"2"},{"ship_type":"EspionageProbe","count":"3"}]}),
        };
        let wire =
            serde_json::to_value(incoming_mission(&f, player(1), level).unwrap().unwrap()).unwrap();
        assert_eq!(
            wire,
            json!({
                "sender": player(2), "origin":{"galaxy":1,"system":2,"position":3},
                "target":BodyId(Uuid::from_u128(20)), "mission":"Transport", "arrival_at":510, "ships":ships
            }),
            "level {level}"
        );
    }
}

#[test]
fn invalid_visible_incoming_manifest_fails_without_examining_unrelated_fleets() {
    let mut f = fleet(1, player(2), player(1), MissionLeg::Outbound);
    f.ships[0].count = -1;
    assert!(matches!(
        incoming_mission(&f, player(1), 0),
        Err(ServiceError::InvariantFailure)
    ));
    assert!(incoming_mission(&f, player(3), 8).unwrap().is_none());
}

#[test]
fn mission_projection_preserves_id_order_and_derives_owned_score_and_slots() {
    let mut records = WorldRecords::default();
    for (id, owner, target) in [
        (9, player(1), player(2)),
        (4, player(2), player(1)),
        (2, player(1), player(2)),
        (3, player(3), player(1)),
        (1, player(2), player(3)),
    ] {
        let f = fleet(id, owner, target, MissionLeg::Outbound);
        records.fleets.insert(f.id, f);
    }
    records.lots = [player(1), player(2)]
        .into_iter()
        .map(|owner| AssetLot {
            id: OperationId::default(),
            owner,
            item: CatalogKey::Ship(ShipType::SmallCargo),
            level: None,
            location: AssetLocation::Player,
            quantity: 2,
            unit_value_micro: 17,
            rules_hash: Hash("paid-value".into()),
            source_operation: OperationId::default(),
            acquired_at: 0,
            acquired_sequence: 0,
        })
        .collect();
    let mut research = research();
    research.levels.insert(ResearchId::ComputerTechnology, 4);
    let view = mission_projection(&records, &research, 100).unwrap();
    assert_eq!(
        view.fleets
            .iter()
            .map(|f| f.id.0.as_u128())
            .collect::<Vec<_>>(),
        [2, 9]
    );
    assert_eq!(
        view.incoming.iter().map(|f| f.sender).collect::<Vec<_>>(),
        [player(3), player(2)]
    );
    assert_eq!(view.score_value_micro, "34");
    assert_eq!(view.fleet_slots, "5");
    assert!(matches!(view.incoming[0].ships, IncomingShips::Unknown));
}

#[test]
fn world_capabilities_preserve_existing_positions_and_profile_compatibility() {
    for (rules, attack) in [
        (Ruleset::mvp_fleets().unwrap(), false),
        (Ruleset::mvp_raids().unwrap(), true),
    ] {
        let capabilities = world_capabilities(
            vec![
                CapabilityState {
                    capability: "Transport".into(),
                    enabled: false,
                    reason: "Unavailable".into(),
                },
                CapabilityState {
                    capability: "Construction".into(),
                    enabled: true,
                    reason: "Available".into(),
                },
            ],
            &rules,
        );
        let mut names = vec![
            "Transport",
            "Construction",
            "Galaxy",
            "Fleets",
            "Espionage",
            "Harvest",
            "Reports",
        ];
        if attack {
            names.push("Attack");
        }
        assert_eq!(
            capabilities
                .iter()
                .map(|c| c.capability.as_str())
                .collect::<Vec<_>>(),
            names
        );
        assert!(
            capabilities
                .iter()
                .all(|c| c.enabled && c.reason == "Available")
        );
    }
}

fn snapshot() -> ViewerSnapshot {
    let rules = Ruleset::mvp_fleets().unwrap();
    let research = research();
    let mut coverage = FactCoverage::default();
    coverage.research_players.insert(research.owner);
    coverage.fleet_owners.insert(research.owner);
    let state = GameState {
        world: Some(WorldFacts {
            records: WorldRecords::default(),
            secret: [0; 32],
            covered_players: Default::default(),
            covered_coordinates: Default::default(),
            covered_reports: Default::default(),
            requested_pair: None,
            revision: 0,
        }),
        production_settings: Default::default(),
        research_operations: Default::default(),
        manufacturing_batches: Default::default(),
        progression_reservations: Default::default(),
        fleets: Default::default(),
        reports: Default::default(),
        universe: UniverseId::default(),
        epoch: Epoch::default(),
        profile_hash: rules.hash.clone(),
        bodies: Default::default(),
        players: Default::default(),
        inventories: vec![],
        research: [(research.owner, research.clone())].into_iter().collect(),
        constructions: Default::default(),
        coverage: coverage.clone(),
        collection_revisions: Default::default(),
    };
    ViewerSnapshot {
        world: Some(state.clone()),
        progression: Some(state),
        coverage,
        fleets: vec![],
        reports: vec![],
        universe: UniverseId::default(),
        epoch: Epoch::default(),
        player: research.owner,
        revision: 42,
        at: 100,
        rules,
        bodies: vec![],
        inventories: vec![],
        research,
        destinations: vec![],
        constructions: vec![],
    }
}

#[test]
fn world_projection_preserves_bound_envelope_and_does_not_mutate_snapshot() {
    let mut facts = snapshot();
    let f = fleet(1, player(1), player(2), MissionLeg::Outbound);
    facts
        .world
        .as_mut()
        .unwrap()
        .world
        .as_mut()
        .unwrap()
        .records
        .fleets
        .insert(f.id, f);
    let before = facts.world.clone();
    let context = QueryContext {
        binding: Binding {
            account: AccountId::default(),
            player: player(1),
            universe: facts.universe,
            epoch: facts.epoch,
        },
        request_id: Uuid::from_u128(99),
    };
    let view = world_projection(&facts, player(1), context.clone()).unwrap();
    assert_eq!(view.progression.protocol, 4);
    assert_eq!(view.progression.binding, context.binding);
    assert_eq!(view.progression.request_id, context.request_id);
    assert_eq!(view.progression.viewer_revision, "42");
    assert_eq!(view.progression.sampled_at, 100);
    assert_eq!(view.progression.as_of_ms, 100);
    assert_eq!(view.progression.profile_hash, facts.rules.hash);
    assert_eq!(view.missions.fleets.len(), 1);
    assert_eq!(view.missions.fleet_slots, "1");
    assert_eq!(facts.world, before);
    let wire = serde_json::to_value(view).unwrap();
    assert_eq!(wire["protocol"], 4);
    assert!(wire["missions"].is_object());
    assert!(wire["progression"]["production"].is_array());
}

#[test]
fn world_projection_rejects_foreign_research_in_the_viewer_slot() {
    let mut facts = snapshot();
    facts
        .world
        .as_mut()
        .unwrap()
        .research
        .get_mut(&player(1))
        .unwrap()
        .owner = player(2);
    let context = QueryContext {
        binding: Binding {
            account: AccountId::default(),
            player: player(1),
            universe: facts.universe,
            epoch: facts.epoch,
        },
        request_id: Uuid::nil(),
    };
    assert!(matches!(
        world_projection(&facts, player(1), context),
        Err(ServiceError::InvariantFailure)
    ));
}

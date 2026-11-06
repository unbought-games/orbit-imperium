use super::*;
fn setup(speed: i32) -> (GameState, Ruleset, PlayerId, BodyId, BodyId, SiteId) {
    let r = Ruleset::from_json(include_bytes!(
        "../../../../rules/mvp-v1-solar-satellite.json"
    ))
    .unwrap();
    let mut artifact = r.artifact.clone();
    artifact.universe = Some(UniverseProfile::signup(1, 100).unwrap());
    let r = Ruleset::from_artifact(artifact, speed).unwrap();
    let (mut s, _, p, b, t) = fixture_with_rules(r.clone());
    for research in s.research.values_mut() {
        for key in r.research_keys() {
            research.levels.entry(key).or_insert(0);
        }
    }
    set_units(
        &mut s,
        &r,
        b,
        ManufacturedItem::Ship(ShipType::LightFighter),
        1,
    );
    let mut i = common::input(
        &s,
        &r,
        Actor::Player(p),
        1,
        1,
        Input::Command(Command::RecallFleet {
            fleet: FleetId::default(),
        }),
    );
    i.protocol = 4;
    i.schema_version = 4;
    let origin = s.bodies[&b].coordinates;
    let w = s.world.as_mut().unwrap();
    w.site_fleets_enabled = true;
    w.homeworlds.insert(p, b);
    w.covered_site_players.insert(p);
    let id = issue_mission_site(
        &mut w.records.mission_sites,
        SiteIssuanceKey {
            universe: s.universe,
            epoch: s.epoch,
            beneficiary: p,
            key: "fixture:site".into(),
        },
        SiteDefinition {
            schema_version: 1,
            id: "fixture:satellite".into(),
            version: 1,
            placement: SitePlacementPolicy::Orbital,
            access: SiteAccessPolicy::BeneficiaryOnly,
            admission: SiteAdmissionPolicy::OneActiveOperation,
            debris: SiteDebrisPolicy::RetainedSiteLocal,
            initial_stock: Resources::all(200 * SCALE),
            forces: vec![SiteForce {
                item: ManufacturedItem::Ship(ShipType::SolarSatellite),
                count: 1,
            }],
            combat_technology: [0; 3],
        },
        origin,
        &i,
        &r,
        &w.secret,
    )
    .unwrap();
    w.records
        .mission_sites
        .get_mut(&id)
        .unwrap()
        .append(&i, 0, SiteEventKind::Disclosed)
        .unwrap();
    w.covered_sites.insert(id);
    (s, r, p, b, t, id)
}
fn request(s: &GameState, p: PlayerId, b: BodyId, t: BodyId, id: SiteId) -> FleetIntent {
    let mut q = intent(s, p, b, t);
    q.mission = Mission::Attack;
    q.destination = MissionDestination::Site {
        selection: SiteSelection {
            id,
            expected_revision: s.world.as_ref().unwrap().records.mission_sites[&id].revision(),
        },
    };
    q.ships.push(ManifestStack {
        owner: p,
        ship_type: ShipType::LightFighter,
        count: 1,
    });
    q
}
#[test]
fn site_privacy_readiness_and_actor_policy_fail_closed() {
    let (mut s, r, p, b, t, id) = setup(3);
    let q = request(&s, p, b, t, id);
    s.world.as_mut().unwrap().site_fleets_enabled = false;
    assert_eq!(
        quote_fleet(&s, p, &q, 1000, &r),
        Err(GameError::UnavailableContent)
    );
    s.world.as_mut().unwrap().site_fleets_enabled = true;
    let mut foreign = q.clone();
    foreign.origin = t;
    for x in &mut foreign.ships {
        x.owner = s.bodies[&t].owner;
    }
    assert_eq!(
        estimate_fleet(&s, s.bodies[&t].owner, &foreign, &r).unwrap_err(),
        GameError::NotFound
    );
    for mission in [
        Mission::Transport,
        Mission::Harvest,
        Mission::Espionage,
        Mission::Deploy,
        Mission::Colonize,
        Mission::Hold,
    ] {
        let mut q = q.clone();
        q.mission = mission;
        assert!(quote_fleet(&s, p, &q, 1000, &r).is_err());
        assert!(estimate_fleet(&s, p, &q, &r).is_err());
    }
    s.world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap()
        .vacation = VacationState::Legacy(true);
    assert_eq!(
        quote_fleet(&s, p, &q, 1000, &r),
        Err(GameError::ActorVacation)
    );
    let policy = s
        .world
        .as_mut()
        .unwrap()
        .records
        .policies
        .get_mut(&p)
        .unwrap();
    policy.vacation = VacationState::default();
    policy.lifecycle = PlayerLifecycle::DeletionDraining;
    assert_eq!(
        quote_fleet(&s, p, &q, 1000, &r),
        Err(GameError::ActorDraining)
    );
}
#[test]
fn recommended_fighter_and_cargo_are_safe_for_every_relevant_random_choice() {
    // Worst case: no rapid fire, no explosion and the satellite fires every round.
    // One defender means every fighter shot hits it. Additional cargo shots and
    // rapid fire cannot hurt allies. A satellite has no RF against either ship.
    for speed in [2, 3] {
        let (_, r, _, _, _, _) = setup(speed);
        let combat = &r.artifact.world.as_ref().unwrap().combat;
        let stats = |ship| {
            combat_unit_stats(
                combat
                    .units
                    .iter()
                    .find(|u| u.item == ManufacturedItem::Ship(ship))
                    .unwrap(),
                [0; 3],
                combat,
            )
            .unwrap()
        };
        let (sat_attack, sat_shield, mut hull) = stats(ShipType::SolarSatellite);
        let max_hull = hull;
        let (fighter_attack, _, _) = stats(ShipType::LightFighter);
        for ship in [ShipType::LightFighter, ShipType::SmallCargo] {
            let (_, shield, hull) = stats(ship);
            assert_eq!(
                apply_combat_hit(sat_attack, shield, shield, hull, hull, combat)
                    .unwrap()
                    .hull_removed,
                0
            );
            assert!(!combat.rapid_fire.iter().any(|rf| rf.shooter
                == ManufacturedItem::Ship(ShipType::SolarSatellite)
                && rf.target == ManufacturedItem::Ship(ship)
                && rf.factor > 1));
        }
        for _ in 0..combat.max_rounds {
            hull -= apply_combat_hit(
                fighter_attack,
                sat_shield,
                sat_shield,
                hull,
                max_hull,
                combat,
            )
            .unwrap()
            .hull_removed;
        }
        assert_eq!(
            hull, 0,
            "guaranteed kill even without explosions or rapid fire"
        );
    }
}

#[test]
fn ordinary_player_attack_and_delivered_raid_produce_generic_objective_evidence() {
    let (mut s, r, p, b, t) = raid_fixture();
    let world = s.world.as_mut().unwrap();
    world.site_fleets_enabled = true;
    world.homeworlds.insert(p, b);
    let mut enrollment = common::input(
        &s,
        &r,
        Actor::Player(p),
        1,
        900,
        Input::Command(Command::RecallFleet {
            fleet: FleetId::default(),
        }),
    );
    enrollment.schema_version = 4;
    enrollment.protocol = 4;
    enrollment.payload = Input::Command(Command::World {
        action: WorldAction::RecordForegroundPresence {
            body: None,
            cause: PresenceCause::BodyVisit,
            paired_command_id: None,
        },
    });
    let TransitionResult::Applied(mut change) = transition(&s, &enrollment, &r) else {
        panic!("enrollment fixture");
    };
    enroll_objective_program(
        &s,
        &enrollment,
        &r,
        &mut change,
        p,
        ObjectiveProgram {
            id: "ordinary-fixture".into(),
            version: 1,
            objectives: vec![
                ObjectiveDefinition {
                    id: "attack".into(),
                    explanation: "Contact".into(),
                    predicate: ObjectivePredicate::Attack,
                    reward: Resources::all(SCALE),
                },
                ObjectiveDefinition {
                    id: "haul".into(),
                    explanation: "Delivery".into(),
                    predicate: ObjectivePredicate::RaidReturn {
                        required_ships: BTreeSet::from([ShipType::SmallCargo]),
                    },
                    reward: Resources::all(SCALE),
                },
            ],
        },
    )
    .unwrap();
    change.apply_to(&mut s).unwrap();
    let mut q = intent(&s, p, b, t);
    q.mission = Mission::Attack;
    let arrival = launch_raid(&mut s, &r, p, b, q, 1000, 901);
    clear_units(&mut s, t);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        arrival.at,
        902,
        Input::Event(arrival.event),
    );
    let change = apply(&mut s, result);
    let world = &s.world.as_ref().unwrap().records;
    let fleet = world.fleets.values().next().unwrap();
    assert!(
        fleet
            .raid
            .as_ref()
            .unwrap()
            .loot
            .values()
            .iter()
            .any(|n| *n > 0)
    );
    assert_eq!(
        world.objective_runs.values().next().unwrap().receipts.len(),
        1
    );
    let returned = change
        .events
        .iter()
        .find(|e| matches!(e.event, ScheduledEvent::FleetLegDue { .. }))
        .unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        returned.at,
        903,
        Input::Event(returned.event.clone()),
    );
    apply(&mut s, result);
    let run = s
        .world
        .as_ref()
        .unwrap()
        .records
        .objective_runs
        .values()
        .next()
        .unwrap();
    assert_eq!(run.receipts.len(), 2);
    assert!(matches!(
        run.receipts["haul"].evidence.fact,
        ObjectiveFact::RaidReturned { .. }
    ));
}

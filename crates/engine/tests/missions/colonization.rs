use super::*;

fn level(
    s: &mut GameState,
    r: &Ruleset,
    owner: PlayerId,
    body: BodyId,
    key: ResearchId,
    value: u32,
) {
    s.world
        .as_mut()
        .unwrap()
        .records
        .lots
        .retain(|l| !(l.owner == owner && l.item == CatalogKey::Research(key)));
    for n in 1..=value {
        s.research
            .get_mut(&owner)
            .unwrap()
            .levels
            .insert(key, n - 1);
        let paid = research_terms(&s.bodies[&body], &s.research[&owner], key, r)
            .unwrap()
            .paid();
        let id = OperationId(derived_id(InputId(owner.0), &format!("level-{key:?}-{n}")));
        s.world.as_mut().unwrap().records.lots.push(AssetLot {
            id,
            owner,
            item: CatalogKey::Research(key),
            level: Some(n),
            location: AssetLocation::Player,
            quantity: 1,
            unit_value_micro: paid.values().iter().sum(),
            rules_hash: r.hash.clone(),
            source_operation: id,
            acquired_at: 0,
            acquired_sequence: 0,
        });
    }
    s.research
        .get_mut(&owner)
        .unwrap()
        .levels
        .insert(key, value);
}
fn setup() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, _, p, b, t) = fixture();
    let r = Ruleset::from_json(include_bytes!("../../../../rules/mvp-v1-slice-6.json")).unwrap();
    s.profile_hash = r.hash.clone();
    let players: Vec<_> = s.bodies.values().map(|b| (b.owner, b.id)).collect();
    for (owner, body) in players {
        for key in r.research_keys() {
            s.research
                .get_mut(&owner)
                .unwrap()
                .levels
                .entry(key)
                .or_insert(0);
        }
        level(&mut s, &r, owner, body, ResearchId::ImpulseDrive, 3);
        level(&mut s, &r, owner, body, ResearchId::Astrophysics, 1);
        level(&mut s, &r, owner, body, ResearchId::ComputerTechnology, 3);
        s.inventories.push(InventoryStack {
            body,
            owner,
            item: ManufacturedItem::Ship(ShipType::ColonyShip),
            count: 3,
            revision: 0,
        });
        let id = OperationId(derived_id(InputId(body.0), "colony-ships"));
        s.world.as_mut().unwrap().records.lots.push(AssetLot {
            id,
            owner,
            item: CatalogKey::Ship(ShipType::ColonyShip),
            level: None,
            location: AssetLocation::Body(body),
            quantity: 3,
            unit_value_micro: 40000 * SCALE,
            rules_hash: r.hash.clone(),
            source_operation: id,
            acquired_at: 0,
            acquired_sequence: 0,
        });
    }
    s.world.as_mut().unwrap().planet_slots = (1..=5)
        .flat_map(|system| {
            (1..=15).map(move |position| Coordinates {
                galaxy: 1,
                system,
                position,
            })
        })
        .map(|coordinates| {
            let occupant = s
                .bodies
                .values()
                .find(|b| b.coordinates == coordinates)
                .map(|b| b.id);
            PlanetSlot {
                coordinates,
                revision: if occupant.is_some() { 1 } else { 0 },
                occupant,
            }
        })
        .collect();
    validate_asset_lineage(&s).unwrap();
    (s, r, p, b, t)
}
fn colony(p: PlayerId, b: BodyId, position: u32, ships: i64) -> FleetIntent {
    FleetIntent {
        origin: b,
        mission: Mission::Colonize,
        destination: MissionDestination::EmptyPosition {
            coordinates: Coordinates {
                galaxy: 1,
                system: 2,
                position,
            },
            slot_revision: 0,
        },
        ships: vec![ManifestStack {
            owner: p,
            ship_type: ShipType::ColonyShip,
            count: ships,
        }],
        cargo: Resources::from_values([1000 * SCALE, 0, 0]),
        speed_percent: 100,
    }
}
fn launch(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    intent: FleetIntent,
    at: i64,
    n: u128,
) -> MissionFleet {
    let q = quote_fleet(s, p, &intent, at, r).unwrap();
    let result = run(
        s,
        r,
        p,
        b,
        at,
        n,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent,
                expected_terms_hash: q.terms_hash,
            },
        }),
    );
    let c = apply(s, result);
    s.world.as_ref().unwrap().records.fleets[&match c.events[0].event {
        ScheduledEvent::FleetLegDue { fleet, .. } => fleet,
        _ => panic!(),
    }]
        .clone()
}
fn arrive(s: &mut GameState, r: &Ruleset, f: &MissionFleet, n: u128) -> ChangeSet {
    let result = run(
        s,
        r,
        f.owner,
        f.intent.origin,
        f.due_at,
        n,
        Input::Event(ScheduledEvent::FleetLegDue {
            fleet: f.id,
            generation: f.generation,
            expected_leg: f.leg,
        }),
    );
    apply(s, result)
}
#[test]
fn success_consumes_one_ship_deposits_grant_and_cargo_returns_escorts_once() {
    let (mut s, r, p, b, _) = setup();
    let mut intent = colony(p, b, 8, 2);
    intent.ships.push(ManifestStack {
        owner: p,
        ship_type: ShipType::SmallCargo,
        count: 1,
    });
    let value = value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap();
    let f = launch(&mut s, &r, p, b, intent, 1000, 501);
    assert_eq!(
        f.terms
            .speeds
            .iter()
            .find(|(k, _)| *k == ShipType::ColonyShip)
            .unwrap()
            .1,
        "4000"
    );
    let before = s.clone();
    let c = arrive(&mut s, &r, &f, 502);
    assert_eq!(c.bodies.len(), 1);
    let planet = &c.bodies[0];
    assert!(planet.name.is_none());
    assert_eq!(
        planet.checkpoint.amounts,
        Resources::from_values([1500 * SCALE, 500 * SCALE, 0])
    );
    assert_eq!(planet.checkpoint.at, f.due_at);
    assert_eq!(planet.checkpoint.carry, Resources::default());
    assert!(planet.levels.values().all(|n| *n == 0));
    assert_eq!(
        s.production_settings[&planet.id].settings,
        ProductionSettings::default()
    );
    assert_eq!(
        value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap(),
        value - 40000 * SCALE
    );
    let returning = s.world.as_ref().unwrap().records.fleets[&f.id].clone();
    assert_eq!(returning.leg, MissionLeg::Returning);
    assert_eq!(returning.ships.iter().map(|x| x.count).sum::<i64>(), 2);
    assert_eq!(returning.cargo, Resources::default());
    assert_eq!(returning.due_at, f.due_at + f.terms.duration_ms);
    let mut replay: GameState =
        serde_json::from_slice(&serde_json::to_vec(&before).unwrap()).unwrap();
    assert_eq!(arrive(&mut replay, &r, &f, 502), c);
    assert_eq!(replay, s);
    let stale = arrive(&mut s, &r, &f, 503);
    assert!(stale.bodies.is_empty() && stale.events.is_empty());
    arrive(&mut s, &r, &returning, 504);
    validate_asset_lineage(&s).unwrap();
    assert_eq!(
        s.inventories
            .iter()
            .find(|x| x.body == b && x.item == ManufacturedItem::Ship(ShipType::ColonyShip))
            .unwrap()
            .count,
        2
    );
    assert!(production_rates(&s.bodies[&planet.id], &r).is_ok());
}
#[test]
fn single_ship_terminalizes_without_return_and_can_transport_then_deploy_to_colony() {
    let (mut s, r, p, b, _) = setup();
    let f = launch(&mut s, &r, p, b, colony(p, b, 8, 1), 1000, 601);
    let c = arrive(&mut s, &r, &f, 602);
    assert!(c.events.is_empty());
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets[&f.id].leg,
        MissionLeg::Colonized
    );
    let id = c.bodies[0].id;
    let mut intent = super::intent(&s, p, b, id);
    let transport = launch(&mut s, &r, p, b, intent.clone(), f.due_at + 1, 603);
    arrive(&mut s, &r, &transport, 604);
    assert!(s.bodies[&id].checkpoint.amounts.metal >= 1510 * SCALE);
    intent.mission = Mission::Deploy;
    let deploy = launch(&mut s, &r, p, b, intent, transport.due_at + 1, 605);
    let c = arrive(&mut s, &r, &deploy, 606);
    assert!(c.events.is_empty());
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets[&deploy.id].leg,
        MissionLeg::Deployed
    );
    assert_eq!(
        s.bodies[&id].checkpoint.amounts.deuterium,
        deploy.terms.fuel / SCALE / 2 * SCALE
    );
    assert_eq!(
        s.inventories.iter().find(|x| x.body == id).unwrap().count,
        1
    );
    validate_asset_lineage(&s).unwrap();
}
#[test]
fn two_arrivals_compete_for_capacity_and_full_cap_launch_returns_intact() {
    let (mut s, r, p, b, _) = setup();
    let f = launch(&mut s, &r, p, b, colony(p, b, 8, 1), 1000, 701);
    let second = launch(&mut s, &r, p, b, colony(p, b, 9, 1), 1000, 702);
    arrive(&mut s, &r, &f, 703);
    let c = arrive(&mut s, &r, &second, 704);
    assert!(c.bodies.is_empty());
    let w = &s.world.as_ref().unwrap().records;
    assert_eq!(w.fleets[&second.id].ships, second.ships);
    assert_eq!(w.fleets[&second.id].cargo, second.cargo);
    assert!(c.world.as_ref().unwrap().audits.is_empty());
    assert!(
        w.reports
            .values()
            .any(|r| r.payloads[&p]["reason"] == "ColonyCapacity")
    );
    let returning = w.fleets[&second.id].clone();
    let expected = settle_production(&s, &s.bodies[&b], returning.due_at, &r)
        .unwrap()
        .amounts;
    arrive(&mut s, &r, &returning, 707);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        expected.metal + second.cargo.metal
    );
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.deuterium,
        expected.deuterium
    );
    let third = launch(
        &mut s,
        &r,
        p,
        b,
        colony(p, b, 10, 1),
        returning.due_at + 1,
        705,
    );
    level(&mut s, &r, p, b, ResearchId::Astrophysics, 3);
    assert_eq!(arrive(&mut s, &r, &third, 706).bodies.len(), 1);
}
#[test]
fn competing_owners_and_recall_preserve_ships_cargo_and_rng() {
    let (mut s, r, p, b, t) = setup();
    let other = s.bodies[&t].owner;
    let first = launch(&mut s, &r, p, b, colony(p, b, 8, 1), 1000, 801);
    let second = launch(&mut s, &r, other, t, colony(other, t, 8, 1), 1000, 802);
    arrive(&mut s, &r, &first, 803);
    let c = arrive(&mut s, &r, &second, 804);
    assert!(c.bodies.is_empty());
    assert!(c.world.as_ref().unwrap().audits.is_empty());
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets[&second.id].cargo,
        second.cargo
    );
    assert!(s.world.as_ref().unwrap().records.reports.values().any(|r| {
        r.payloads
            .get(&other)
            .is_some_and(|p| p["reason"] == "Occupied")
    }));
    let recalled = launch(&mut s, &r, p, b, colony(p, b, 9, 1), second.due_at + 1, 805);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        recalled.launched_at + 100,
        806,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: recalled.id },
        }),
    );
    let c = apply(&mut s, result);
    assert!(c.bodies.is_empty());
    let ret = s.world.as_ref().unwrap().records.fleets[&recalled.id].clone();
    assert_eq!(ret.due_at, recalled.launched_at + 200);
    arrive(&mut s, &r, &ret, 807);
    assert_eq!(owned_planet_count(&s, p).unwrap(), 2);
    validate_asset_lineage(&s).unwrap();
}
#[test]
fn launch_requires_ship_completed_position_gate_and_covered_current_empty_slot() {
    let (mut s, r, p, b, _) = setup();
    let mut intent = colony(p, b, 3, 1);
    assert_eq!(
        quote_fleet(&s, p, &intent, 0, &r),
        Err(GameError::PrerequisiteMissing)
    );
    level(&mut s, &r, p, b, ResearchId::Astrophysics, 4);
    assert!(quote_fleet(&s, p, &intent, 0, &r).is_ok());
    intent.ships[0].ship_type = ShipType::SmallCargo;
    assert_eq!(
        quote_fleet(&s, p, &intent, 0, &r),
        Err(GameError::InsufficientShips)
    );
    intent.ships[0].ship_type = ShipType::ColonyShip;
    if let MissionDestination::EmptyPosition { slot_revision, .. } = &mut intent.destination {
        *slot_revision = 1;
    }
    assert_eq!(
        quote_fleet(&s, p, &intent, 0, &r),
        Err(GameError::QuoteChanged)
    );
    let mut disabled = r.artifact.clone();
    disabled
        .world
        .as_mut()
        .unwrap()
        .colonization
        .as_mut()
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(disabled, r.speed).unwrap();
    assert_eq!(
        quote_fleet(&s, p, &intent, 0, &disabled),
        Err(GameError::UnavailableContent)
    );
}

fn job(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    at: i64,
    n: u128,
    payload: Input,
) -> ChangeSet {
    for tag in ["construction:0", "research:0", "manufacturing:0"] {
        let id = OperationId(derived_id(InputId(Uuid::from_u128(n)), tag));
        s.coverage.operations.insert(id);
        s.coverage.research_operation_ids.insert(id);
        s.coverage.manufacturing_operation_ids.insert(id);
    }
    let result = run(s, r, p, b, at, n, payload);
    apply(s, result)
}
#[test]
fn ordinary_starter_builds_researches_manufactures_and_colonizes_without_grants() {
    let (mut s, r, p, b, _) = setup();
    s.inventories.retain(|x| x.owner != p);
    s.world
        .as_mut()
        .unwrap()
        .records
        .lots
        .retain(|x| x.owner != p);
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .values_mut()
        .for_each(|n| *n = 0);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts =
        Resources::from_values([1000 * SCALE, 1000 * SCALE, 0]);
    let (mut at, mut n) = (0, 2000);
    fn purchase(
        s: &mut GameState,
        r: &Ruleset,
        p: PlayerId,
        b: BodyId,
        q: QuoteRequest,
        at: &mut i64,
        n: &mut u128,
    ) {
        loop {
            let inspect = inspect_progression(s, Actor::Player(p), &q, *at, r).unwrap();
            let t = inspect.terms.as_ref().unwrap();
            let cost = t.paid();
            let caps = body_storage_capacity(&s.bodies[&b], r).unwrap();
            let storage = [
                Building::MetalStorage,
                Building::CrystalStorage,
                Building::DeuteriumTank,
            ];
            if let Some(idx) = (0..3).find(|i| cost.values()[*i] > caps.values()[*i]) {
                purchase(
                    s,
                    r,
                    p,
                    b,
                    QuoteRequest::Upgrade {
                        body: b,
                        building: storage[idx],
                    },
                    at,
                    n,
                );
                continue;
            }
            if inspect
                .blockers
                .iter()
                .any(|x| x.code == GameError::InsufficientResources)
            {
                let cp = settle_production(s, &s.bodies[&b], *at, r).unwrap();
                let rate = production_rates_with_settings(
                    &s.bodies[&b],
                    &s.production_settings[&b].settings,
                    0,
                    r,
                )
                .unwrap();
                let mut wait = 0;
                for i in 0..3 {
                    let short = cost.values()[i] - cp.amounts.values()[i];
                    if short > 0 {
                        assert!(rate.values()[i] > 0, "no production for {q:?}");
                        wait = wait.max(
                            ((i128::from(short) * 3_600_000 + i128::from(rate.values()[i]) - 1)
                                / i128::from(rate.values()[i])) as i64
                                + 1,
                        )
                    }
                }
                *at += wait;
                continue;
            }
            assert!(inspect.blockers.is_empty(), "{q:?}: {:?}", inspect.blockers);
            let h = inspect.terms_hash.unwrap();
            let cmd = match q.clone() {
                QuoteRequest::Upgrade { body, building } => Command::StartUpgrade {
                    body,
                    building,
                    expected_terms_hash: h,
                },
                QuoteRequest::Research { host, research } => Command::StartResearch {
                    host,
                    research,
                    expected_terms_hash: h,
                },
                QuoteRequest::Manufacture {
                    body,
                    item,
                    quantity,
                } => Command::StartManufacture {
                    body,
                    item,
                    quantity,
                    expected_terms_hash: h,
                },
                _ => unreachable!(),
            };
            *n += 1;
            let mut c = job(s, r, p, b, *at, *n, Input::Command(cmd));
            while let Some(e) = c.events.pop() {
                *at = e.at;
                *n += 1;
                c = job(s, r, p, b, *at, *n, Input::Event(e.event));
            }
            break;
        }
    }

    for (building, target) in [
        (Building::SolarPlant, 1),
        (Building::MetalMine, 1),
        (Building::CrystalMine, 1),
        (Building::DeuteriumSynthesizer, 1),
        (Building::SolarPlant, 8),
        (Building::MetalMine, 8),
        (Building::CrystalMine, 7),
        (Building::DeuteriumSynthesizer, 6),
        (Building::SolarPlant, 14),
        (Building::MetalMine, 12),
        (Building::CrystalMine, 10),
        (Building::DeuteriumSynthesizer, 8),
        (Building::RoboticsFactory, 2),
        (Building::ResearchLab, 3),
        (Building::Shipyard, 3),
    ] {
        while s.bodies[&b].levels[&building] < target {
            purchase(
                &mut s,
                &r,
                p,
                b,
                QuoteRequest::Upgrade { body: b, building },
                &mut at,
                &mut n,
            );
        }
    }
    let manufacture = QuoteRequest::Manufacture {
        body: b,
        item: ManufacturedItem::Ship(ShipType::ColonyShip),
        quantity: 1,
    };
    assert!(
        inspect_progression(&s, Actor::Player(p), &manufacture, at, &r)
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.code == GameError::PrerequisiteMissing)
    );
    for (research, target) in [
        (ResearchId::EnergyTechnology, 1),
        (ResearchId::ImpulseDrive, 3),
        (ResearchId::EspionageTechnology, 4),
        (ResearchId::Astrophysics, 1),
    ] {
        while s.research[&p].levels[&research] < target {
            purchase(
                &mut s,
                &r,
                p,
                b,
                QuoteRequest::Research { host: b, research },
                &mut at,
                &mut n,
            );
        }
    }
    assert!(
        inspect_progression(&s, Actor::Player(p), &manufacture, at, &r)
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.code == GameError::PrerequisiteMissing)
    );
    purchase(
        &mut s,
        &r,
        p,
        b,
        QuoteRequest::Upgrade {
            body: b,
            building: Building::Shipyard,
        },
        &mut at,
        &mut n,
    );
    let terms = manufacture_terms(
        &s.bodies[&b],
        ManufacturedItem::Ship(ShipType::ColonyShip),
        1,
        &r,
    )
    .unwrap();
    assert_eq!(
        terms.paid(),
        Resources::from_values([10000 * SCALE, 20000 * SCALE, 10000 * SCALE])
    );
    assert_eq!(terms.duration(), 864_000); // Y4, S10, 30,000 M+C; no building-time adjustment.
    purchase(&mut s, &r, p, b, manufacture, &mut at, &mut n);
    assert_eq!(
        s.inventories
            .iter()
            .find(|x| x.owner == p && x.item == ManufacturedItem::Ship(ShipType::ColonyShip))
            .unwrap()
            .count,
        1
    );
    at += 360_000_000;
    let f = launch(&mut s, &r, p, b, colony(p, b, 8, 1), at, n + 1);
    let c = arrive(&mut s, &r, &f, n + 2);
    assert_eq!(c.bodies.len(), 1);
    assert_eq!(owned_planet_count(&s, p).unwrap(), 2);
    validate_asset_lineage(&s).unwrap();
}

#[test]
fn accepted_colony_resolves_when_new_launches_are_disabled_without_repricing_flight() {
    let (mut s, r, p, b, _) = setup();
    let f = launch(&mut s, &r, p, b, colony(p, b, 8, 1), 1000, 901);
    let mut artifact = r.artifact.clone();
    artifact
        .world
        .as_mut()
        .unwrap()
        .colonization
        .as_mut()
        .unwrap()
        .enabled = false;
    artifact
        .ships
        .get_mut(&ShipType::ColonyShip)
        .unwrap()
        .base_speed = 5000;
    let next = Ruleset::from_artifact(artifact, r.speed).unwrap();
    validate_rules_update(&r, &next).unwrap();
    s.profile_hash = next.hash.clone();
    let c = arrive(&mut s, &next, &f, 902);
    assert_eq!(c.bodies.len(), 1);
    let saved = &s.world.as_ref().unwrap().records.fleets[&f.id];
    assert_eq!(saved.terms, f.terms);
    assert_eq!(saved.due_at, f.due_at);
    assert_eq!(saved.leg, MissionLeg::Colonized);
}

#[test]
fn occupied_and_out_of_bounds_manual_targets_fail_without_resource_changes() {
    let (s, r, p, b, _) = setup();
    assert_eq!(
        resolve_destination(
            &s,
            DestinationSelection::EmptyPositionAt {
                coordinates: s.bodies[&b].coordinates
            },
            &r
        ),
        Err(GameError::PositionOccupied)
    );
    let mut intent = colony(p, b, 16, 1);
    assert_eq!(quote_fleet(&s, p, &intent, 0, &r), Err(GameError::NotFound));
    if let MissionDestination::EmptyPosition { coordinates, .. } = &mut intent.destination {
        coordinates.position = 8;
        coordinates.galaxy = u32::MAX;
    }
    assert_eq!(quote_fleet(&s, p, &intent, 0, &r), Err(GameError::NotFound));
}

fn abandonment_fixture() -> (GameState, Ruleset, PlayerId, BodyId, BodyId, i64) {
    let (mut s, r, p, home, _) = setup();
    s.world.as_mut().unwrap().homeworlds.insert(p, home);
    let f = launch(&mut s, &r, p, home, colony(p, home, 8, 1), 1000, 9001);
    let c = arrive(&mut s, &r, &f, 9002);
    (s, r, p, home, c.bodies[0].id, f.due_at + 1)
}
fn abandon_input(id: BodyId, q: &AbandonmentQuote) -> Input {
    Input::Command(Command::World {
        action: WorldAction::AbandonPlanet {
            body: id,
            expected_terms_hash: q.terms_hash.clone(),
        },
    })
}
#[test]
fn colony_abandonment_is_permanent_replayable_and_slot_releases_at_strict_utc_boundary() {
    for at in [0, 1, 10 * 3_600_000, 86_399_999] {
        assert_eq!(abandonment_release(at).unwrap(), 2 * 86_400_000);
    }
    let (mut s, r, p, home, id, at) = abandonment_fixture();
    let before_midnight = quote_abandonment(&s, p, id, 86_400_000 - 1, &r).unwrap();
    let after_midnight = quote_abandonment(&s, p, id, 86_400_000, &r).unwrap();
    assert_ne!(before_midnight.terms_hash, after_midnight.terms_hash);
    let research = s.research.clone();
    let q = quote_abandonment(&s, p, id, at, &r).unwrap();
    assert!(q.blockers.is_empty());
    assert_eq!(
        q.losses[0].resources,
        settle_production(&s, &s.bodies[&id], at, &r)
            .unwrap()
            .amounts
    );
    let mut replay = s.clone();
    let result = run(&mut s, &r, p, id, at, 9003, abandon_input(id, &q));
    let c = apply(&mut s, result);
    let result = run(&mut replay, &r, p, id, at, 9003, abandon_input(id, &q));
    assert_eq!(apply(&mut replay, result), c);
    assert_eq!(s, replay);
    assert!(!s.bodies.contains_key(&id));
    assert!(s.bodies.contains_key(&home));
    assert_eq!(s.research, research);
    assert_eq!(owned_planet_count(&s, p).unwrap(), 1);
    let tombstone = s.world.as_ref().unwrap().records.abandonments[&id].clone();
    assert_eq!(
        planet_slot(&s, tombstone.coordinates).unwrap().occupant,
        Some(id)
    );
    assert!(matches!(
        resolve_destination(
            &s,
            DestinationSelection::EmptyPositionAt {
                coordinates: tombstone.coordinates
            },
            &r
        ),
        Err(GameError::PositionOccupied)
    ));
    assert!(matches!(
        quote_abandonment(&s, p, id, at, &r),
        Err(GameError::NotOwned)
    ));
    assert!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .reports
            .values()
            .any(|x| x.kind == "PlanetAbandoned")
    );
    let result = run(
        &mut s,
        &r,
        p,
        home,
        q.release_at,
        9004,
        Input::Event(c.events[0].event.clone()),
    );
    apply(&mut s, result);
    assert_eq!(
        planet_slot(&s, tombstone.coordinates).unwrap().occupant,
        None
    );
    assert!(
        resolve_destination(
            &s,
            DestinationSelection::EmptyPositionAt {
                coordinates: tombstone.coordinates
            },
            &r
        )
        .is_ok()
    );
    let replacement = BodyId(Uuid::from_u128(99999));
    s.world
        .as_mut()
        .unwrap()
        .planet_slots
        .iter_mut()
        .find(|slot| slot.coordinates == tombstone.coordinates)
        .unwrap()
        .occupant = Some(replacement);
    let result = run(
        &mut s,
        &r,
        p,
        home,
        q.release_at,
        9005,
        Input::Event(c.events[0].event.clone()),
    );
    apply(&mut s, result);
    assert_eq!(
        planet_slot(&s, tombstone.coordinates).unwrap().occupant,
        Some(replacement)
    );
    validate_asset_lineage(&s).unwrap();
}
#[test]
fn abandonment_rejects_homeworld_foreign_body_changed_losses_and_dependent_flights() {
    let (mut s, r, p, home, id, at) = abandonment_fixture();
    let q = quote_abandonment(&s, p, home, at, &r).unwrap();
    assert!(q.blockers.iter().any(|b| b.contains("homeworld")));
    assert!(matches!(
        run(&mut s, &r, p, home, at, 9100, abandon_input(home, &q)),
        TransitionResult::Rejected(GameError::AbandonmentBlocked)
    ));
    let foreign = s.bodies.values().find(|b| b.owner != p).unwrap().id;
    assert!(matches!(
        quote_abandonment(&s, p, foreign, at, &r),
        Err(GameError::NotOwned)
    ));
    let q = quote_abandonment(&s, p, id, at, &r).unwrap();
    s.bodies.get_mut(&id).unwrap().name = Some("Changed".into());
    assert!(matches!(
        run(&mut s, &r, p, id, at, 9101, abandon_input(id, &q)),
        TransitionResult::Rejected(GameError::QuoteChanged)
    ));
    // Move a stationed cargo ship and its valuation to the colony fixture.
    let item = ManufacturedItem::Ship(ShipType::SmallCargo);
    s.inventories
        .iter_mut()
        .find(|x| x.body == home && x.item == item)
        .unwrap()
        .body = id;
    for lot in &mut s.world.as_mut().unwrap().records.lots {
        if lot.location == AssetLocation::Body(home)
            && lot.item == CatalogKey::Ship(ShipType::SmallCargo)
        {
            lot.location = AssetLocation::Body(id);
        }
    }
    s.bodies.get_mut(&id).unwrap().checkpoint.amounts.deuterium = 1000 * SCALE;
    let intent = super::intent(&s, p, id, home);
    let fleet = launch(&mut s, &r, p, id, intent, at, 9102);
    let q = quote_abandonment(&s, p, id, at, &r).unwrap();
    assert!(q.blockers.iter().any(|b| b.contains("fleet")));
    assert!(matches!(
        run(&mut s, &r, p, id, at, 9103, abandon_input(id, &q)),
        TransitionResult::Rejected(GameError::AbandonmentBlocked)
    ));
    assert_eq!(s.world.as_ref().unwrap().records.fleets[&fleet.id], fleet);
}
#[test]
fn foreign_inbound_transport_survives_abandonment_and_returns_without_delivering() {
    let (mut s, r, p, _, id, at) = abandonment_fixture();
    let foreign = s.bodies.values().find(|b| b.owner != p).unwrap().clone();
    let intent = super::intent(&s, foreign.owner, foreign.id, id);
    let fleet = launch(&mut s, &r, foreign.owner, foreign.id, intent, at, 9200);
    let q = quote_abandonment(&s, p, id, at, &r).unwrap();
    assert!(q.blockers.is_empty());
    let result = run(&mut s, &r, p, id, at, 9201, abandon_input(id, &q));
    apply(&mut s, result);
    arrive(&mut s, &r, &fleet, 9202);
    let returning = &s.world.as_ref().unwrap().records.fleets[&fleet.id];
    assert_eq!(returning.leg, MissionLeg::Returning);
    assert_eq!(returning.cargo, fleet.cargo);
    assert_eq!(returning.ships, fleet.ships);
    assert_eq!(returning.due_at, fleet.due_at + fleet.terms.duration_ms);
}

#[test]
fn abandonment_research_guard_includes_irn_contributors_and_last_planet() {
    let (mut s, r, p, home, id, at) = abandonment_fixture();
    let operation = OperationId(Uuid::from_u128(9300));
    let mut research = ResearchOperation {
        id: operation,
        owner: p,
        host: home,
        research: ResearchId::EnergyTechnology,
        source_level: 0,
        target_level: 1,
        labs: vec![LabContribution {
            body: id,
            completed_level: 3,
        }],
        commitment: Commitment {
            profile_hash: r.hash.clone(),
            terms_hash: Hash("research".into()),
            paid: Resources::all(0),
            started_at: at,
            due_at: at + 1000,
        },
        status: ResearchStatus::Active,
        generation: 0,
        revision: 0,
    };
    s.research_operations.insert(operation, research.clone());
    assert!(
        quote_abandonment(&s, p, id, at, &r)
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.contains("research"))
    );
    research.labs.clear();
    research.host = id;
    s.research_operations.insert(operation, research.clone());
    assert!(
        quote_abandonment(&s, p, id, at, &r)
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.contains("research"))
    );
    research.status = ResearchStatus::Completed;
    s.research_operations.insert(operation, research);
    assert!(
        quote_abandonment(&s, p, id, at, &r)
            .unwrap()
            .blockers
            .is_empty()
    );
    s.bodies.remove(&home);
    assert!(
        quote_abandonment(&s, p, id, at, &r)
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.contains("last planet"))
    );
}
#[test]
fn abandonment_destroys_stationed_assets_and_moon_terminalizes_queues_and_preserves_debris() {
    let (mut s, r, p, home, id, at) = abandonment_fixture();
    let moon_id = BodyId(Uuid::from_u128(9400));
    let mut moon = s.bodies[&id].clone();
    moon.id = moon_id;
    moon.kind = BodyKind::Moon;
    s.bodies.insert(moon_id, moon);
    s.production_settings.insert(
        moon_id,
        ProductionSettingsRecord {
            body: moon_id,
            settings: ProductionSettings::default(),
            revision: 0,
        },
    );
    s.coverage.bodies.insert(moon_id);
    s.coverage.production_bodies.insert(moon_id);
    s.coverage.construction_bodies.insert(moon_id);
    s.coverage.manufacturing_bodies.insert(moon_id);
    s.coverage.inventory_owners.insert((moon_id, p));
    s.collection_revisions
        .insert(format!("production:{moon_id}"), 0);
    for x in &mut s.inventories {
        if x.body == home {
            x.body = moon_id;
        }
    }
    for x in &mut s.world.as_mut().unwrap().records.lots {
        if x.location == AssetLocation::Body(home) {
            x.location = AssetLocation::Body(moon_id);
        }
    }
    let op = OperationId(Uuid::from_u128(9401));
    s.manufacturing_batches.insert(
        op,
        ManufacturingBatch {
            id: op,
            owner: p,
            body: id,
            item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
            quantity: 4,
            completed_prefix: 0,
            commitment: BatchCommitment {
                profile_hash: r.hash.clone(),
                terms_hash: Hash("yard".into()),
                paid: Resources::from_values([8000 * SCALE, 0, 0]),
                unit_cost: Resources::from_values([2000 * SCALE, 0, 0]),
                accepted_at: at,
                facility_levels: Default::default(),
            },
            predecessor: None,
            queue_sequence: 1,
            first_start_at: at,
            final_due_at: at + 4000,
            unit_duration_ms: 1000,
            next_due_at: at + 1000,
            status: ManufacturingStatus::Active,
            generation: 0,
            revision: 0,
        },
    );
    s.coverage.manufacturing_operation_ids.insert(op);
    let request = QuoteRequest::Upgrade {
        body: id,
        building: Building::MetalMine,
    };
    let q = quote(&s, Actor::Player(p), &request, at, &r).unwrap();
    let construction_id = OperationId(derived_id(InputId(Uuid::from_u128(9402)), "construction:0"));
    s.coverage.operations.insert(construction_id);
    s.coverage.research_operation_ids.insert(construction_id);
    s.coverage
        .manufacturing_operation_ids
        .insert(construction_id);
    let result = run(
        &mut s,
        &r,
        p,
        id,
        at,
        9402,
        Input::Command(Command::StartUpgrade {
            body: id,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash,
        }),
    );
    let build = apply(&mut s, result);
    let prior_score = value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap();
    let field = OperationId(Uuid::from_u128(9490));
    s.world.as_mut().unwrap().records.debris.insert(
        field,
        DebrisField {
            id: field,
            coordinates: s.bodies[&id].coordinates,
            marker_present: true,
            metal: 500 * SCALE,
            crystal: 200 * SCALE,
            generation: 0,
            cleanup_at: next_debris_cleanup(at).unwrap(),
            revision: 0,
        },
    );
    let debris = s.world.as_ref().unwrap().records.debris.clone();
    let resources = s.bodies[&home].checkpoint.clone();
    let q = quote_abandonment(&s, p, id, at, &r).unwrap();
    assert_eq!(q.losses.len(), 2);
    assert!(q.losses.iter().any(|l| !l.inventory.is_empty()));
    let result = run(&mut s, &r, p, id, at, 9403, abandon_input(id, &q));
    let c = apply(&mut s, result);
    assert!(!s.bodies.contains_key(&moon_id));
    assert!(s.inventories.is_empty() || s.inventories.iter().all(|x| x.owner != p));
    assert_eq!(
        s.manufacturing_batches[&op].status,
        ManufacturingStatus::BodyAbandoned
    );
    assert_eq!(
        s.constructions[&construction_id].status,
        ConstructionStatus::BodyAbandoned
    );
    assert_eq!(s.bodies[&home].checkpoint, resources);
    assert_eq!(s.world.as_ref().unwrap().records.debris, debris);
    let after_score = value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap();
    assert!(after_score < prior_score);
    assert_eq!(
        c.world
            .as_ref()
            .unwrap()
            .score_deltas
            .iter()
            .map(|d| d.delta)
            .sum::<i64>(),
        after_score - prior_score
    );
    for event in [
        build.events[0].clone(),
        NewEvent {
            id: InputId(Uuid::from_u128(9404)),
            at: at + 1000,
            event: ScheduledEvent::ManufacturingDue {
                operation: op,
                generation: 0,
                expected_prefix: 0,
            },
        },
    ] {
        let result = run(
            &mut s,
            &r,
            p,
            home,
            event.at,
            9405,
            Input::Event(event.event),
        );
        let c = apply(&mut s, result);
        assert!(c.bodies.is_empty());
        assert!(c.inventories.is_empty());
    }
    validate_asset_lineage(&s).unwrap();
}

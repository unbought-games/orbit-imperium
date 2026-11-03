use super::*;

#[test]
fn creation_thresholds_use_only_new_metal_and_crystal_micro_units() {
    for (total, expected) in [
        (99_999, 0),
        (100_000, 1),
        (1_999_999, 19),
        (2_000_000, 20),
        (9_000_000, 20),
    ] {
        assert_eq!(
            moon_creation_chance(Resources {
                metal: total * SCALE - 1,
                crystal: 1,
                deuterium: i64::MAX
            })
            .unwrap(),
            expected
        );
    }
    assert_eq!(moon_creation_chance(Resources::all(i64::MAX)).unwrap(), 20);
    assert!(
        moon_creation_chance(Resources {
            metal: -1,
            ..Default::default()
        })
        .is_err()
    );
    for (chance, draw, size) in [(20, 0, 8366), (20, 10, 8944), (1, 0, 3605), (1, 10, 4795)] {
        assert_eq!(moon_diameter(chance, draw).unwrap(), size);
    }
    assert!(moon_diameter(0, 0).is_err());
    assert!(moon_diameter(20, 11).is_err());
}

fn prepared(mission: Mission) -> (GameState, Ruleset, PlayerId, BodyId, BodyId, NewEvent) {
    let (mut s, old, p, b, t) = raid_fixture();
    let mut artifact = old.artifact.clone();
    artifact.world.as_mut().unwrap().moons = true;
    let r = Ruleset::from_artifact(artifact, old.speed).unwrap();
    s.profile_hash = r.hash.clone();
    // Equal scores at launch; reinforcements arrive before the battle.
    for body in [b, t] {
        set_units(
            &mut s,
            &r,
            body,
            ManufacturedItem::Ship(ShipType::EspionageProbe),
            2000,
        );
    }
    let mut request = intent(&s, p, b, t);
    request.mission = mission;
    request.cargo = Resources::default();
    request.ships = vec![ManifestStack {
        owner: p,
        ship_type: ShipType::EspionageProbe,
        count: 2000,
    }];
    let event = launch_raid(&mut s, &r, p, b, request, 1000, 8200);
    clear_units(&mut s, t);
    set_units(
        &mut s,
        &r,
        t,
        ManufacturedItem::Defense(DefenseId::RocketLauncher),
        2000,
    );
    s.world.as_mut().unwrap().planet_slots.push(PlanetSlot {
        coordinates: s.bodies[&t].coordinates,
        occupant: Some(t),
        revision: 1,
    });
    (s, r, p, b, t, event)
}

// Select a deterministic mechanism fixture by its independent creation stream,
// before running combat. This is not a retry of a failed gameplay assertion.
fn creation_seed(s: &GameState, success: bool) -> [u8; 32] {
    for byte in 0..=255 {
        let secret = [byte; 32];
        let mut rng = RandomStream::new(
            &secret,
            s.universe,
            s.epoch,
            InputId(Uuid::from_u128(8201)),
            "moon-create",
        )
        .unwrap();
        if (rng.uniform_u64(100).unwrap() < 6) == success {
            return secret;
        }
    }
    panic!("missing deterministic fixture seed")
}

#[test]
fn battle_creates_one_empty_owned_moon_atomically_and_replay_cannot_reroll() {
    for success in [false, true] {
        let (mut s, r, p, b, t, event) = prepared(Mission::Attack);
        s.world.as_mut().unwrap().secret = creation_seed(&s, success);
        let mut restored: GameState =
            serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
        let resolve = |s: &mut GameState| {
            run(
                s,
                &r,
                p,
                b,
                event.at,
                8201,
                Input::Event(event.event.clone()),
            )
        };
        let first = resolve(&mut s);
        let replay = resolve(&mut restored);
        assert_eq!(hash(&first), hash(&replay));
        let c = apply(&mut s, first);
        let w = &s.world.as_ref().unwrap().records;
        let owner = s.bodies[&t].owner;
        let combat = w.reports.values().find(|r| r.kind == "Combat").unwrap();
        assert_eq!(
            combat.payloads[&owner]["moon_creation"]["chance_percent"],
            6
        );
        assert!(combat.payloads[&p].get("draw").is_none());
        let debris = w.debris.values().next().unwrap();
        assert_eq!(debris.metal, 0);
        assert_eq!(debris.crystal, 600_000 * SCALE);
        assert_eq!(w.moons.len(), usize::from(success));
        if success {
            let m = w.moons.values().next().unwrap();
            let moon = &s.bodies[&m.body];
            assert_eq!(m.parent, t);
            assert_eq!(moon.owner, owner);
            assert_eq!(moon.coordinates, s.bodies[&t].coordinates);
            assert_eq!(moon.fields, 1);
            assert!(moon.levels.values().all(|v| *v == 0));
            assert_eq!(moon.checkpoint.amounts, Resources::default());
            assert!(!s.inventories.iter().any(|v| v.body == moon.id));
            assert_eq!(
                settle_production(&s, moon, event.at + 86_400_000, &r)
                    .unwrap()
                    .amounts,
                Resources::default()
            );
            assert_eq!(s.world.as_ref().unwrap().planet_slots[0].occupant, Some(t));
            assert_eq!(s.world.as_ref().unwrap().planet_slots[0].revision, 1);
            let system = galaxy_system(&s, p, 1, 1, event.at, &r).unwrap();
            let slot = system
                .positions
                .iter()
                .find(|v| v.coordinates == moon.coordinates)
                .unwrap();
            assert_eq!(slot.body.as_ref().unwrap().id, t);
            assert_eq!(slot.moon.as_ref().unwrap().id, moon.id);
            assert!(
                w.reports
                    .values()
                    .any(|r| r.kind == "MoonCreated" && r.payloads.contains_key(&owner))
            );
            assert!(c.affected_viewers.contains(&owner));
        }
        let records = w.clone();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            event.at,
            8202,
            Input::Event(event.event.clone()),
        );
        let retry = apply(&mut s, result);
        assert_eq!(s.world.as_ref().unwrap().records.moons, records.moons);
        assert_eq!(s.world.as_ref().unwrap().records.debris, records.debris);
        assert!(
            retry
                .world
                .is_none_or(|w| !w.audits.iter().any(|a| a["kind"] == "MoonCreation"))
        );
    }
}

#[test]
fn existing_moon_skips_roll_but_not_debris_and_progression_stays_unavailable() {
    let (mut s, r, p, b, t, event) = prepared(Mission::Attack);
    let mut moon = s.bodies[&t].clone();
    moon.id = BodyId(Uuid::from_u128(1)); // Sorts before the planet: galaxy must still show both correctly.
    moon.kind = BodyKind::Moon;
    let id = moon.id;
    s.coverage.bodies.insert(id);
    s.coverage.production_bodies.insert(id);
    s.production_settings.insert(
        id,
        ProductionSettingsRecord {
            body: id,
            settings: ProductionSettings::default(),
            revision: 0,
        },
    );
    s.collection_revisions.insert(format!("production:{id}"), 0);
    s.bodies.insert(id, moon.clone());
    let result = run(&mut s, &r, p, b, event.at, 8201, Input::Event(event.event));
    let c = apply(&mut s, result);
    let w = &s.world.as_ref().unwrap().records;
    assert_eq!(w.debris.values().next().unwrap().crystal, 600_000 * SCALE);
    assert!(
        !c.world
            .unwrap()
            .audits
            .iter()
            .any(|a| a["kind"] == "MoonCreation")
    );
    for request in [
        QuoteRequest::Upgrade {
            body: id,
            building: Building::MetalMine,
        },
        QuoteRequest::Demolition {
            body: id,
            building: Building::MetalMine,
        },
        QuoteRequest::Research {
            host: id,
            research: ResearchId::ComputerTechnology,
        },
        QuoteRequest::Manufacture {
            body: id,
            item: ManufacturedItem::Ship(ShipType::SmallCargo),
            quantity: 1,
        },
    ] {
        assert_eq!(
            quote(&s, Actor::Player(moon.owner), &request, event.at, &r),
            Err(GameError::UnavailableContent)
        );
    }
}

#[test]
fn disabled_creation_and_old_debris_never_open_a_creation_stream() {
    for enabled in [false, true] {
        let (mut s, r, p, b, t, event) = prepared(Mission::Attack);
        let mut artifact = r.artifact.clone();
        artifact.world.as_mut().unwrap().moons = enabled;
        let r = Ruleset::from_artifact(artifact, r.speed).unwrap();
        s.profile_hash = r.hash.clone();
        if enabled {
            clear_units(&mut s, t);
            let id = OperationId(Uuid::from_u128(8300));
            s.world.as_mut().unwrap().records.debris.insert(
                id,
                DebrisField {
                    id,
                    coordinates: s.bodies[&t].coordinates,
                    marker_present: true,
                    metal: 2_000_000 * SCALE,
                    crystal: 0,
                    deuterium: 0,
                    generation: 1,
                    cleanup_at: event.at + 604_800_000,
                    revision: 0,
                },
            );
        }
        let result = run(&mut s, &r, p, b, event.at, 8201, Input::Event(event.event));
        let c = apply(&mut s, result);
        assert!(
            !c.world
                .unwrap()
                .audits
                .iter()
                .any(|a| a["kind"] == "MoonCreation")
        );
        let w = &s.world.as_ref().unwrap().records;
        assert!(w.moons.is_empty());
        let report = &w
            .reports
            .values()
            .find(|r| r.kind == "Combat")
            .unwrap()
            .payloads[&s.bodies[&t].owner];
        if enabled {
            assert_eq!(report["moon_creation"]["chance_percent"], 0);
            assert_eq!(w.debris.values().next().unwrap().metal, 2_000_000 * SCALE);
        } else {
            assert!(report.get("moon_creation").is_none());
            assert_eq!(w.debris.values().next().unwrap().crystal, 600_000 * SCALE);
        }
    }
}

#[test]
fn detected_espionage_creates_a_moon_for_the_planet_owner_without_loot() {
    let (mut s, r, p, b, t, event) = prepared(Mission::Espionage);
    set_units(
        &mut s,
        &r,
        t,
        ManufacturedItem::Ship(ShipType::LightFighter),
        1000,
    );
    s.world.as_mut().unwrap().secret = creation_seed(&s, true);
    let result = run(&mut s, &r, p, b, event.at, 8201, Input::Event(event.event));
    apply(&mut s, result);
    let w = &s.world.as_ref().unwrap().records;
    assert!(w.reports.values().any(|r| r.kind == "SpyContact"));
    assert_eq!(w.moons.len(), 1);
    let moon = w.moons.values().next().unwrap();
    assert_eq!(s.bodies[&moon.body].owner, s.bodies[&t].owner);
    let report = &w
        .reports
        .values()
        .find(|r| r.kind == "Combat")
        .unwrap()
        .payloads[&s.bodies[&t].owner];
    assert_eq!(
        report["loot"],
        serde_json::json!({"metal":"0", "crystal":"0", "deuterium":"0"})
    );
}

/// Empty, valid lunar body with complete facts, independent of its parent's stock.
pub(super) fn add_moon(s: &mut GameState, parent: BodyId, n: u128) -> BodyId {
    let input = InputId(Uuid::from_u128(n));
    let id = BodyId(derived_id(input, "moon:0"));
    let mut moon = s.bodies[&parent].clone();
    moon.id = id;
    moon.kind = BodyKind::Moon;
    moon.name = None;
    moon.fields = 1;
    moon.max_temperature = 0;
    moon.levels.values_mut().for_each(|v| *v = 0);
    moon.checkpoint.amounts = Resources::default();
    moon.checkpoint.carry = Resources::default();
    moon.revision = 0;
    s.coverage.bodies.insert(id);
    s.coverage.production_bodies.insert(id);
    s.coverage.inventory_owners.insert((id, moon.owner));
    s.coverage.construction_bodies.insert(id);
    s.coverage.manufacturing_bodies.insert(id);
    s.coverage.reservation_bodies.insert(id);
    s.production_settings.insert(
        id,
        ProductionSettingsRecord {
            body: id,
            settings: ProductionSettings::default(),
            revision: 0,
        },
    );
    s.progression_reservations.insert(
        id,
        ProgressionReservations {
            body: id,
            field_operation: None,
            small_dome_operation: None,
            large_dome_operation: None,
            missile_slots: 0,
            revision: 0,
        },
    );
    for collection in [
        "production",
        "constructions",
        "manufacturing",
        "progression-reservations",
    ] {
        s.collection_revisions
            .insert(format!("{collection}:{id}"), 0);
    }
    s.world.as_mut().unwrap().records.moons.insert(
        id,
        MoonGenesis {
            body: id,
            parent,
            diameter_km: 8366,
            created_at: 0,
            input,
            profile: MOON_PROFILE.into(),
        },
    );
    s.bodies.insert(id, moon);
    id
}
fn lunar_intent(
    s: &GameState,
    p: PlayerId,
    origin: BodyId,
    target: BodyId,
    mission: Mission,
) -> FleetIntent {
    let mut request = intent(s, p, origin, target);
    request.mission = mission;
    request.destination = MissionDestination::Body {
        id: target,
        expected_kind: s.bodies[&target].kind,
        expected_owner: s.bodies[&target].owner,
    };
    request
}
fn due(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    event: &NewEvent,
    n: u128,
) -> ChangeSet {
    let result = run(s, r, p, b, event.at, n, Input::Event(event.event.clone()));
    apply(s, result)
}
fn ships(s: &GameState, body: BodyId, ship: ShipType) -> i64 {
    s.inventories
        .iter()
        .filter(|x| x.body == body && x.item == ManufacturedItem::Ship(ship))
        .map(|x| x.count)
        .sum()
}

#[test]
fn lunar_transport_all_body_pairs_preserve_stock_lineage_and_return_once() {
    for pair in 0..5 {
        let (mut s, r, p, b, t) = holding::ready();
        let mb = add_moon(&mut s, b, 28001);
        let mt = add_moon(&mut s, t, 28002);
        let (origin, target) = [(b, mt), (mb, t), (mb, mt), (b, mb), (mb, b)][pair];
        s.bodies.get_mut(&origin).unwrap().checkpoint.amounts = Resources::all(100_000 * SCALE);
        set_units(
            &mut s,
            &r,
            origin,
            ManufacturedItem::Ship(ShipType::LargeCargo),
            1,
        );
        let mut request = lunar_intent(&s, p, origin, target, Mission::Transport);
        request.ships[0].ship_type = ShipType::LargeCargo;
        request.cargo = Resources::from_values([20_000 * SCALE, 0, 0]);
        validate_asset_lineage(&s).unwrap();
        let q = quote_fleet(&s, p, &request, 1000, &r).unwrap();
        assert!(estimate_fleet(&s, p, &request, &r).is_ok());
        assert!(q.duration_ms > 0);
        let arrival = launch_raid(&mut s, &r, p, origin, request, 1000, 28100);
        let before = settle_production(&s, &s.bodies[&target], arrival.at, &r)
            .unwrap()
            .amounts;
        let parent_before = s.bodies[&b].clone();
        let change = due(&mut s, &r, p, origin, &arrival, 28101);
        assert_eq!(
            s.bodies[&target].checkpoint.amounts.metal,
            before.metal + 20_000 * SCALE
        );
        if origin == mb && target != b {
            assert_eq!(s.bodies[&b], parent_before);
        }
        assert_eq!(ships(&s, origin, ShipType::LargeCargo), 0);
        let target_stock = s.bodies[&target].checkpoint.clone();
        due(&mut s, &r, p, origin, &arrival, 28102);
        assert_eq!(s.bodies[&target].checkpoint, target_stock);
        let returning = &change.events[0];
        assert_eq!(returning.at - arrival.at, q.duration_ms);
        due(&mut s, &r, p, origin, returning, 28103);
        due(&mut s, &r, p, origin, returning, 28104);
        assert_eq!(ships(&s, origin, ShipType::LargeCargo), 1);
        validate_asset_lineage(&s).unwrap();
        validate_moons(&s).unwrap();
        if s.bodies[&target].kind == BodyKind::Moon {
            assert_eq!(
                settle_production(&s, &s.bodies[&target], returning.at + 86_400_000, &r)
                    .unwrap()
                    .amounts,
                target_stock.amounts
            );
        }
    }
}

#[test]
fn lunar_deploy_stations_without_shipyard_and_credits_fuel_once() {
    for pair in 0..3 {
        let (mut s, r, p, b, t) = holding::ready();
        clear_units(&mut s, t);
        s.bodies
            .get_mut(&t)
            .unwrap()
            .levels
            .values_mut()
            .for_each(|level| *level = 0);
        s.bodies.get_mut(&t).unwrap().owner = p;
        for lot in &mut s.world.as_mut().unwrap().records.lots {
            if lot.location == AssetLocation::Body(t) {
                lot.owner = p;
            }
        }
        s.coverage.inventory_owners.insert((t, p));
        let mb = add_moon(&mut s, b, 28201);
        let mt = add_moon(&mut s, t, 28202);
        let (origin, target) = [(b, mb), (mb, b), (mb, mt)][pair];
        s.bodies.get_mut(&origin).unwrap().checkpoint.amounts = Resources::all(100_000 * SCALE);
        set_units(
            &mut s,
            &r,
            origin,
            ManufacturedItem::Ship(ShipType::SmallCargo),
            1,
        );
        let request = lunar_intent(&s, p, origin, target, Mission::Deploy);
        validate_asset_lineage(&s).unwrap();
        let q = quote_fleet(&s, p, &request, 1000, &r).unwrap();
        let event = launch_raid(&mut s, &r, p, origin, request, 1000, 28300);
        let before = settle_production(&s, &s.bodies[&target], event.at, &r)
            .unwrap()
            .amounts;
        let previous_ships = ships(&s, target, ShipType::SmallCargo);
        let change = due(&mut s, &r, p, origin, &event, 28301);
        assert!(change.events.is_empty());
        assert_eq!(ships(&s, target, ShipType::SmallCargo), previous_ships + 1);
        assert_eq!(
            s.bodies[&target].checkpoint.amounts.deuterium,
            before.deuterium + q.fuel / SCALE / 2 * SCALE
        );
        let stock = s.bodies[&target].checkpoint.clone();
        due(&mut s, &r, p, origin, &event, 28302);
        assert_eq!(s.bodies[&target].checkpoint, stock);
        assert_eq!(ships(&s, target, ShipType::SmallCargo), previous_ships + 1);
        assert!(
            !s.world
                .as_ref()
                .unwrap()
                .records
                .fleets
                .values()
                .any(|f| f.active())
        );
        validate_asset_lineage(&s).unwrap();
    }
}

#[test]
fn lunar_launch_requires_local_fuel_and_recall_restores_only_its_moon() {
    let (mut s, r, p, b, t) = holding::ready();
    let moon = add_moon(&mut s, b, 28400);
    set_units(
        &mut s,
        &r,
        moon,
        ManufacturedItem::Ship(ShipType::SmallCargo),
        1,
    );
    let request = lunar_intent(&s, p, moon, t, Mission::Transport);
    assert!(quote_fleet(&s, p, &request, 1000, &r).is_err());
    s.bodies.get_mut(&moon).unwrap().checkpoint.amounts = Resources::all(100_000 * SCALE);
    let event = launch_raid(&mut s, &r, p, moon, request, 1000, 28401);
    let fleet = *s
        .world
        .as_ref()
        .unwrap()
        .records
        .fleets
        .keys()
        .next()
        .unwrap();
    let parent = s.bodies[&b].clone();
    let result = run(
        &mut s,
        &r,
        p,
        moon,
        2000,
        28402,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet },
        }),
    );
    let recall = apply(&mut s, result);
    assert_eq!(recall.events[0].at, 3000);
    due(&mut s, &r, p, moon, &recall.events[0], 28403);
    due(&mut s, &r, p, moon, &event, 28404);
    assert_eq!(ships(&s, moon, ShipType::SmallCargo), 1);
    assert_eq!(s.bodies[&b], parent);
    assert!(
        quote_fleet(
            &s,
            p,
            &lunar_intent(&s, p, moon, moon, Mission::Transport),
            event.at,
            &r
        )
        .is_err()
    );
    for mission in [Mission::Colonize, Mission::Harvest] {
        assert!(quote_fleet(&s, p, &lunar_intent(&s, p, moon, t, mission), event.at, &r).is_err());
    }
}

#[test]
fn lunar_attack_and_spy_ignore_parent_defenders_and_never_create_a_moon() {
    for mission in [Mission::Attack, Mission::Espionage] {
        let (mut s, r, p, b, t) = holding::ready();
        let mb = add_moon(&mut s, b, 28500);
        let mt = add_moon(&mut s, t, 28501);
        s.bodies.get_mut(&mb).unwrap().checkpoint.amounts = Resources::all(100_000 * SCALE);
        s.bodies.get_mut(&mt).unwrap().checkpoint.amounts = Resources::all(1000 * SCALE);
        let ship = if mission == Mission::Attack {
            ShipType::SmallCargo
        } else {
            ShipType::EspionageProbe
        };
        set_units(&mut s, &r, mb, ManufacturedItem::Ship(ship), 1);
        let mut request = lunar_intent(&s, p, mb, mt, mission);
        request.ships[0].ship_type = ship;
        request.cargo = Resources::default();
        let arrival = launch_raid(&mut s, &r, p, mb, request, 1000, 28502);
        set_units(
            &mut s,
            &r,
            t,
            ManufacturedItem::Defense(DefenseId::RocketLauncher),
            100_000,
        );
        let parent = s.bodies[&t].clone();
        let c = due(&mut s, &r, p, mb, &arrival, 28503);
        assert_eq!(s.bodies[&t], parent);
        let w = &s.world.as_ref().unwrap().records;
        assert_eq!(w.moons.len(), 2);
        assert!(
            !c.world
                .as_ref()
                .unwrap()
                .audits
                .iter()
                .any(|a| a["kind"] == "MoonCreation")
        );
        let report = w
            .reports
            .values()
            .find(|v| {
                v.kind
                    == if mission == Mission::Attack {
                        "Combat"
                    } else {
                        "Espionage"
                    }
            })
            .unwrap();
        let payload = &report.payloads[&p];
        if mission == Mission::Attack {
            assert_eq!(payload["target_kind"], "Moon");
            assert_eq!(payload["outcome"], "AttackerVictory");
            assert!(s.bodies[&mt].checkpoint.amounts.metal < 1000 * SCALE);
        } else {
            assert_eq!(payload["target"]["kind"], "Moon");
            assert_eq!(payload["resources"]["value"]["metal"], "1000000000");
        }
        due(&mut s, &r, p, mb, &c.events[0], 28504);
        assert_eq!(ships(&s, mb, ship), 1);
    }
}

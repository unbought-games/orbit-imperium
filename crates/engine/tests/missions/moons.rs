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
fn existing_moon_skips_roll_but_not_debris_and_all_moon_actions_are_rejected() {
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
    let mut request = intent(&s, p, b, id);
    request.destination = MissionDestination::Body {
        id,
        expected_kind: BodyKind::Moon,
        expected_owner: moon.owner,
    };
    for mission in [
        Mission::Attack,
        Mission::Espionage,
        Mission::Transport,
        Mission::Deploy,
        Mission::Hold,
    ] {
        request.mission = mission;
        assert_eq!(
            quote_fleet(&s, p, &request, event.at, &r),
            Err(GameError::UnavailableContent)
        );
    }
    request.origin = id;
    assert_eq!(
        quote_fleet(&s, moon.owner, &request, event.at, &r),
        Err(GameError::UnavailableContent)
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

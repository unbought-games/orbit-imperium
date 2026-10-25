use super::*;
const SAT: ManufacturedItem = ManufacturedItem::Ship(ShipType::SolarSatellite);
fn setup() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, _, p, b, t) = raid_fixture();
    let r = Ruleset::from_json(include_bytes!(
        "../../../../rules/mvp-v1-solar-satellite.json"
    ))
    .unwrap();
    s.profile_hash = r.hash.clone();
    for research in s.research.values_mut() {
        for key in r.research_keys() {
            research.levels.entry(key).or_insert(0);
        }
    }
    fixture_building(&mut s, &r, b, Building::Shipyard, 1);
    fixture_building(&mut s, &r, b, Building::MetalMine, 3);
    fixture_building(&mut s, &r, b, Building::CrystalMine, 3);
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts =
        Resources::from_values([0, 5000 * SCALE, 1000 * SCALE]);
    (s, r, p, b, t)
}
fn manufacture(s: &mut GameState, r: &Ruleset, p: PlayerId, b: BodyId, n: u128) -> ChangeSet {
    let q = inspect_progression(
        s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: SAT,
            quantity: 2,
        },
        0,
        r,
    )
    .unwrap();
    assert!(q.blockers.is_empty(), "{:?}", q.blockers);
    assert_eq!(
        q.terms.as_ref().unwrap().paid(),
        Resources::from_values([0, 4000 * SCALE, 1000 * SCALE])
    );
    assert_eq!(q.terms.as_ref().unwrap().duration(), 144_000);
    let operation = OperationId(derived_id(InputId(Uuid::from_u128(n)), "manufacturing:0"));
    s.coverage.operations.insert(operation);
    s.coverage.manufacturing_operation_ids.insert(operation);
    s.coverage.research_operation_ids.insert(operation);
    let result = run(
        s,
        r,
        p,
        b,
        0,
        n,
        Input::Command(Command::StartManufacture {
            body: b,
            item: SAT,
            quantity: 2,
            expected_terms_hash: q.terms_hash.unwrap(),
        }),
    );
    apply(s, result)
}
#[test]
fn satellites_require_shipyard_one_but_no_research() {
    let (mut s, r, p, b, _) = setup();
    s.bodies
        .get_mut(&b)
        .unwrap()
        .levels
        .insert(Building::Shipyard, 0);
    s.world
        .as_mut()
        .unwrap()
        .records
        .lots
        .retain(|lot| lot.item != CatalogKey::Building(Building::Shipyard));
    let q = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: SAT,
            quantity: 1,
        },
        0,
        &r,
    )
    .unwrap();
    assert_eq!(
        q.blockers[0].requirement,
        Some(Requirement::BodyBuilding {
            building: Building::Shipyard,
            level: 1
        })
    );
    fixture_building(&mut s, &r, b, Building::Shipyard, 1);
    let q = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: SAT,
            quantity: 1,
        },
        0,
        &r,
    )
    .unwrap();
    assert!(q.blockers.is_empty());
}
#[test]
fn completed_satellites_power_each_interval_and_survive_disabled_manufacturing_and_replay() {
    let (mut s, r, p, b, t) = setup();
    let started = manufacture(&mut s, &r, p, b, 29900);
    let initial = s.bodies[&b].checkpoint.amounts;
    let before_score = value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap();
    let mut a = r.artifact.clone();
    a.catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::SolarSatellite))
        .unwrap()
        .enabled = false;
    let r = Ruleset::from_artifact(a, r.speed).unwrap();
    s.profile_hash = r.hash.clone();
    let first = &started.events[0];
    let result = run(
        &mut s,
        &r,
        p,
        b,
        first.at,
        29901,
        Input::Event(first.event.clone()),
    );
    let completed = apply(&mut s, result);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        initial.metal + 12 * SCALE
    );
    assert_eq!(solar_satellite_count(&s, &s.bodies[&b], &r).unwrap(), 1);
    // Replay a duplicate completion; it must not credit resources, count or score twice.
    let cp = s.bodies[&b].checkpoint.clone();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        first.at,
        29902,
        Input::Event(first.event.clone()),
    );
    apply(&mut s, result);
    assert_eq!(s.bodies[&b].checkpoint, cp);
    // Serialize as on restart before processing the second due event.
    s = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
    let second = &completed.events[0];
    let result = run(
        &mut s,
        &r,
        p,
        b,
        second.at,
        29903,
        Input::Event(second.event.clone()),
    );
    apply(&mut s, result);
    // At mine levels 3/3, 30 energy supplies half of 90 M/hour before speed.
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        initial.metal + 42 * SCALE
    );
    assert_eq!(solar_satellite_count(&s, &s.bodies[&b], &r).unwrap(), 2);
    assert_eq!(
        value_completed_assets(&s.world.as_ref().unwrap().records.lots, p).unwrap(),
        before_score + 5000 * SCALE
    );
    validate_asset_lineage(&s).unwrap();
    assert!(
        mobile_inventory(&s, b, p, &r)
            .unwrap()
            .iter()
            .all(|x| x.ship_type != ShipType::SolarSatellite)
    );
    let mut request = intent(&s, p, b, t);
    request.ships.push(ManifestStack {
        owner: p,
        ship_type: ShipType::SolarSatellite,
        count: 1,
    });
    assert!(quote_fleet(&s, p, &request, second.at, &r).is_err());
    let q = inspect_progression(
        &s,
        Actor::Player(p),
        &QuoteRequest::Manufacture {
            body: b,
            item: SAT,
            quantity: 1,
        },
        second.at,
        &r,
    )
    .unwrap();
    assert!(
        q.blockers
            .iter()
            .any(|x| x.code == GameError::UnavailableContent)
    );
    let result = run(
        &mut s,
        &r,
        p,
        b,
        second.at + 144_000,
        29904,
        Input::Command(Command::SetProduction {
            body: b,
            settings: ProductionSettings {
                solar_satellite: 0,
                ..Default::default()
            },
            expected_settings_revision: 0,
        }),
    );
    apply(&mut s, result);
    assert_eq!(
        s.bodies[&b].checkpoint.amounts.metal,
        initial.metal + 90 * SCALE
    );
    assert_eq!(
        body_production_rates(&s, &s.bodies[&b], &r).unwrap().metal,
        300 * SCALE
    );
    assert_eq!(solar_satellite_count(&s, &s.bodies[&b], &r).unwrap(), 2);
}
#[test]
fn raid_destroys_satellites_without_recovery_and_changes_production_only_after_arrival() {
    let (mut s, r, p, b, t) = setup();
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(10000 * SCALE);
    clear_units(&mut s, t);
    // Keep both players within beginner-protection range without adding defenders.
    let defender = s.bodies[&t].owner;
    fixture_research(&mut s, &r, defender, ResearchId::ComputerTechnology, 20);
    fixture_building(&mut s, &r, t, Building::MetalMine, 1);
    fixture_building(&mut s, &r, t, Building::CrystalMine, 1);
    s.bodies.get_mut(&t).unwrap().checkpoint.amounts = Resources::all(0);
    set_units(&mut s, &r, t, SAT, 1);
    set_units(&mut s, &r, b, ManufacturedItem::Ship(ShipType::Cruiser), 1);
    let mut request = intent(&s, p, b, t);
    request.mission = Mission::Attack;
    request.cargo = Resources::all(0);
    request.ships[0].ship_type = ShipType::Cruiser;
    let due = launch_raid(&mut s, &r, p, b, request, 0, 29910);
    let full = settle_production(&s, &s.bodies[&t], due.at, &r).unwrap();
    assert!(full.amounts.metal > 0);
    let result = run(&mut s, &r, p, b, due.at, 29911, Input::Event(due.event));
    let changes = apply(&mut s, result);
    assert_eq!(solar_satellite_count(&s, &s.bodies[&t], &r).unwrap(), 0);
    let report = s
        .world
        .as_ref()
        .unwrap()
        .records
        .reports
        .values()
        .find(|r| r.kind == "Combat")
        .unwrap();
    let loot: i64 = report.payloads[&p]["loot"]["metal"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert_eq!(
        s.bodies[&t].checkpoint.amounts.metal + loot,
        full.amounts.metal
    );
    assert_eq!(s.bodies[&t].checkpoint.at, due.at);
    assert_eq!(
        body_production_rates(&s, &s.bodies[&t], &r).unwrap().metal,
        300 * SCALE
    );
    let after = settle_production(&s, &s.bodies[&t], due.at + 3_600_000, &r).unwrap();
    assert_eq!(
        after.amounts.metal - s.bodies[&t].checkpoint.amounts.metal,
        300 * SCALE
    );
    let debris = s
        .world
        .as_ref()
        .unwrap()
        .records
        .debris
        .values()
        .find(|d| d.coordinates == s.bodies[&t].coordinates)
        .unwrap();
    assert_eq!(debris.crystal, 600 * SCALE);
    assert_eq!(debris.metal, 0);
    assert!(
        !changes
            .inventories
            .iter()
            .any(|i| i.item == SAT && i.count > 0)
    );
    validate_asset_lineage(&s).unwrap();
}

#[test]
fn espionage_observes_stationary_satellites_in_the_fleet_tier() {
    let (mut s, r, p, b, t) = setup();
    s.bodies.get_mut(&b).unwrap().checkpoint.amounts = Resources::all(10000 * SCALE);
    clear_units(&mut s, t);
    // Keep both players within beginner-protection range without adding defenders.
    let defender = s.bodies[&t].owner;
    fixture_research(&mut s, &r, defender, ResearchId::ComputerTechnology, 20);
    set_units(&mut s, &r, t, SAT, 2);
    set_units(
        &mut s,
        &r,
        b,
        ManufacturedItem::Ship(ShipType::EspionageProbe),
        2,
    );
    let mut mission = intent(&s, p, b, t);
    mission.mission = Mission::Espionage;
    mission.cargo = Resources::all(0);
    mission.ships = vec![ManifestStack {
        owner: p,
        ship_type: ShipType::EspionageProbe,
        count: 2,
    }];
    let due = launch_raid(&mut s, &r, p, b, mission, 0, 29920);
    let result = run(&mut s, &r, p, b, due.at, 29921, Input::Event(due.event));
    apply(&mut s, result);
    let report = s
        .world
        .as_ref()
        .unwrap()
        .records
        .reports
        .values()
        .find(|r| r.kind == "Espionage")
        .unwrap();
    assert_eq!(
        report.payloads[&p]["fleet"],
        serde_json::json!({"visibility":"Known","value":[{"item":{"kind":"Ship","id":"SolarSatellite"},"count":"2"}]})
    );
}

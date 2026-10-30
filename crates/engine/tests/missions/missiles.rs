use super::*;
use std::collections::BTreeMap;
fn edit(s: &mut GameState, r: &Ruleset, b: BodyId, n: u128, value: serde_json::Value) {
    let owner = s.bodies[&b].owner;
    let mut e: world_edit::WorldEdit = serde_json::from_value(value).unwrap();
    e.op = "set".into();
    e.planet = Some(world_edit::coordinate_label(s.bodies[&b].coordinates));
    let i = common::input(
        s,
        r,
        Actor::Player(owner),
        0,
        n,
        Input::Command(Command::CancelConstruction {
            operation: OperationId::default(),
        }),
    );
    let c = world_edit::edit_world(s, r, &i, &e, Some(owner)).unwrap();
    c.apply_to(s).unwrap();
}
fn ready() -> (GameState, Ruleset, PlayerId, BodyId, BodyId) {
    let (mut s, _, p, b, t) = fixture();
    let old = Ruleset::mvp_raids().unwrap();
    let r = upgrade_standard_rules(&old).unwrap();
    s.profile_hash = r.hash.clone();
    for body in s.bodies.values_mut() {
        for key in r.building_keys() {
            body.levels.entry(key).or_insert(0);
        }
    }
    for research in s.research.values_mut() {
        for key in r.research_keys() {
            research.levels.entry(key).or_insert(0);
        }
    }
    for (n, id) in [b, t].into_iter().enumerate() {
        edit(
            &mut s,
            &r,
            id,
            900 + n as u128,
            serde_json::json!({"op":"set","buildings":{"MissileSilo":4,"Shipyard":1},"research":{"ImpulseDrive":5},"resources":{"metal":10000000,"crystal":10000000,"deuterium":10000000}}),
        );
    }
    edit(
        &mut s,
        &r,
        b,
        902,
        serde_json::json!({"op":"set","missiles":{"InterplanetaryMissile":10}}),
    );
    edit(
        &mut s,
        &r,
        t,
        903,
        serde_json::json!({"op":"set","missiles":{"AntiBallisticMissile":6},"defenses":{"RocketLauncher":100}}),
    );
    validate_asset_lineage(&s).unwrap();
    (s, r, p, b, t)
}
fn intent(s: &GameState, b: BodyId, t: BodyId, n: i64) -> MissileIntent {
    MissileIntent {
        origin: b,
        target: MissileTarget {
            id: t,
            expected_kind: BodyKind::Planet,
            expected_owner: s.bodies[&t].owner,
        },
        count: n,
        primary: Some(DefenseId::RocketLauncher),
    }
}
fn launch(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    b: BodyId,
    t: BodyId,
    n: i64,
    id: u128,
) -> ChangeSet {
    let intent = intent(s, b, t, n);
    let q = quote_missiles(s, p, &intent, 1000, r).unwrap();
    let result = run(
        s,
        r,
        p,
        b,
        1000,
        id,
        Input::Command(Command::World {
            action: WorldAction::LaunchMissiles {
                intent,
                expected_terms_hash: q.terms_hash.clone(),
            },
        }),
    );
    apply(s, result)
}
fn count(s: &GameState, b: BodyId, item: ManufacturedItem) -> i64 {
    s.inventories
        .iter()
        .find(|x| x.body == b && x.item == item)
        .map_or(0, |x| x.count)
}
#[test]
fn interception_permanent_losses_private_reports_and_retries() {
    let (mut s, r, p, b, t) = ready();
    let owner = s.bodies[&t].owner;
    let c = launch(&mut s, &r, p, b, t, 10, 1000);
    assert_eq!(c.events.len(), 1);
    assert_eq!(
        count(
            &s,
            b,
            ManufacturedItem::Missile(MissileId::InterplanetaryMissile)
        ),
        0
    );
    assert!(s.world.as_ref().unwrap().records.fleets.is_empty());
    let event = c.events[0].clone();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        event.at,
        1001,
        Input::Event(event.event.clone()),
    );
    let impact = apply(&mut s, result);
    assert_eq!(
        count(
            &s,
            t,
            ManufacturedItem::Missile(MissileId::AntiBallisticMissile)
        ),
        0
    );
    assert_eq!(
        count(&s, t, ManufacturedItem::Defense(DefenseId::RocketLauncher)),
        0
    );
    assert_eq!(
        count(&s, t, ManufacturedItem::Ship(ShipType::SmallCargo)),
        2
    );
    let w = &impact.world.as_ref().unwrap().records;
    let report = w.reports.values().next().unwrap();
    assert_eq!(report.payloads[&p]["intercepted"], "6");
    assert_eq!(report.payloads[&p]["penetrating"], "4");
    assert!(report.payloads[&p].get("interceptors_remaining").is_none());
    assert_eq!(report.payloads[&owner]["interceptors_remaining"], "0");
    assert!(w.debris.is_empty());
    assert!(impact.events.is_empty());
    validate_asset_lineage(&s).unwrap();
    let result = run(&mut s, &r, p, b, event.at, 1002, Input::Event(event.event));
    let retry = apply(&mut s, result);
    assert!(retry.inventories.is_empty());
    assert_eq!(retry.world.unwrap().records.reports.len(), 1);
}
#[test]
fn full_interception_has_no_random_draws_and_uses_current_inventory() {
    let (mut s, r, p, b, t) = ready();
    let c = launch(&mut s, &r, p, b, t, 4, 1010);
    let e = &c.events[0];
    let result = run(&mut s, &r, p, b, e.at, 1011, Input::Event(e.event.clone()));
    let impact = apply(&mut s, result);
    assert_eq!(
        count(
            &s,
            t,
            ManufacturedItem::Missile(MissileId::AntiBallisticMissile)
        ),
        2
    );
    assert_eq!(
        count(&s, t, ManufacturedItem::Defense(DefenseId::RocketLauncher)),
        100
    );
    let audit = &impact.world.unwrap().audits[0];
    assert_eq!(audit["rng_before"], audit["rng_after"]);
}
#[test]
fn target_replacement_does_not_consume_parent_interceptors() {
    let (mut s, r, p, b, t) = ready();
    let c = launch(&mut s, &r, p, b, t, 4, 1020);
    // The covered old body is gone. All its assets are removed with its lifecycle.
    s.bodies.remove(&t);
    s.inventories.retain(|x| x.body != t);
    s.world
        .as_mut()
        .unwrap()
        .records
        .lots
        .retain(|x| x.location != AssetLocation::Body(t));
    let e = &c.events[0];
    let result = run(&mut s, &r, p, b, e.at, 1021, Input::Event(e.event.clone()));
    let impact = apply(&mut s, result);
    assert!(impact.inventories.is_empty());
    assert_eq!(
        impact
            .world
            .unwrap()
            .records
            .reports
            .values()
            .next()
            .unwrap()
            .payloads[&p]["outcome"],
        "NoTarget"
    );
}
#[test]
fn missile_damage_matches_documented_rounding_and_technology() {
    let (s, r, _, _, _) = ready();
    let rules = missile_rules(&r).unwrap();
    let combat = &r.artifact.world.as_ref().unwrap().combat;
    let rng = || {
        RandomStream::new(
            &[8; 32],
            s.universe,
            s.epoch,
            InputId::default(),
            "missile-target",
        )
        .unwrap()
    };
    for (armour, expected) in [(0, 60), (10, 30)] {
        let result = missile_damage(
            1,
            [0, armour],
            None,
            &BTreeMap::from([(DefenseId::RocketLauncher, 100)]),
            combat,
            rules,
            &mut rng(),
        )
        .unwrap();
        assert_eq!(result[&DefenseId::RocketLauncher], expected);
    }
    let result = missile_damage(
        1,
        [10, 10],
        Some(DefenseId::PlasmaTurret),
        &BTreeMap::from([
            (DefenseId::PlasmaTurret, 3),
            (DefenseId::RocketLauncher, 20),
        ]),
        combat,
        rules,
        &mut rng(),
    )
    .unwrap();
    assert_eq!(
        result,
        BTreeMap::from([
            (DefenseId::PlasmaTurret, 1),
            (DefenseId::RocketLauncher, 10)
        ])
    );
    let mut a = rng();
    let mut b = rng();
    let defenses = BTreeMap::from([
        (DefenseId::GaussCannon, 100),
        (DefenseId::RocketLauncher, 100),
    ]);
    assert_eq!(
        missile_damage(1, [0, 0], None, &defenses, combat, rules, &mut a).unwrap(),
        missile_damage(1, [0, 0], None, &defenses, combat, rules, &mut b).unwrap()
    );
    assert_eq!(a.cursor(), b.cursor());
}
#[test]
fn capacity_reserves_unfinished_units_and_blocks_demolition() {
    let (mut s, r, p, b, _) = ready();
    edit(
        &mut s,
        &r,
        b,
        1030,
        serde_json::json!({"op":"set","missiles":{"AntiBallisticMissile":18}}),
    );
    let q = QuoteRequest::Manufacture {
        body: b,
        item: ManufacturedItem::Missile(MissileId::AntiBallisticMissile),
        quantity: 2,
    };
    let inspection = inspect_progression(&s, Actor::Player(p), &q, 1000, &r).unwrap();
    assert!(inspection.blockers.is_empty(), "{:?}", inspection.blockers);
    let id = OperationId(derived_id(
        InputId(Uuid::from_u128(1031)),
        "manufacturing:0",
    ));
    s.coverage.operations.insert(id);
    s.coverage.research_operation_ids.insert(id);
    s.coverage.manufacturing_operation_ids.insert(id);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        1031,
        Input::Command(Command::StartManufacture {
            body: b,
            item: ManufacturedItem::Missile(MissileId::AntiBallisticMissile),
            quantity: 2,
            expected_terms_hash: inspection.terms_hash.unwrap(),
        }),
    );
    let c = apply(&mut s, result);
    let slots = silo_capacity(&s, &s.bodies[&b], missile_rules(&r).unwrap()).unwrap();
    assert_eq!((slots.occupied, slots.reserved, slots.total), (38, 2, 40));
    assert!(
        inspect_progression(&s, Actor::Player(p), &q, 1000, &r)
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.code == GameError::CapacityReserved)
    );
    assert!(
        inspect_progression(
            &s,
            Actor::Player(p),
            &QuoteRequest::Demolition {
                body: b,
                building: Building::MissileSilo
            },
            1000,
            &r
        )
        .unwrap()
        .blockers
        .iter()
        .any(|b| b.code == GameError::CapacityReserved)
    );
    let e = &c.events[0];
    let result = run(&mut s, &r, p, b, e.at, 1032, Input::Event(e.event.clone()));
    apply(&mut s, result);
    let slots = silo_capacity(&s, &s.bodies[&b], missile_rules(&r).unwrap()).unwrap();
    assert_eq!(slots.occupied + slots.reserved, 40);
}
#[test]
fn scrap_releases_capacity_without_refund_and_rules_remain_snapshotted() {
    let (mut s, r, p, b, t) = ready();
    let amounts = s.bodies[&b].checkpoint.amounts;
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        1040,
        Input::Command(Command::World {
            action: WorldAction::ScrapMissiles {
                body: b,
                item: MissileId::InterplanetaryMissile,
                count: 2,
            },
        }),
    );
    apply(&mut s, result);
    assert_eq!(
        count(
            &s,
            b,
            ManufacturedItem::Missile(MissileId::InterplanetaryMissile)
        ),
        8
    );
    assert_eq!(s.bodies[&b].checkpoint.amounts, amounts);
    let c = launch(&mut s, &r, p, b, t, 4, 1041);
    let due = c.events[0].at;
    let mut artifact = r.artifact.clone();
    artifact
        .world
        .as_mut()
        .unwrap()
        .missiles
        .as_mut()
        .unwrap()
        .base_seconds = 60;
    let next = Ruleset::from_artifact(artifact, r.speed).unwrap();
    s.profile_hash = next.hash.clone();
    assert_eq!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .missiles
            .values()
            .next()
            .unwrap()
            .due_at,
        due
    );
    assert_eq!(
        quote_missiles(&s, p, &intent(&s, b, t, 1), 1000, &next)
            .unwrap()
            .duration_ms,
        6000
    );
    let result = run(
        &mut s,
        &next,
        p,
        b,
        due,
        1042,
        Input::Event(c.events[0].event.clone()),
    );
    apply(&mut s, result);
    validate_asset_lineage(&s).unwrap();
}
#[test]
fn launch_guards_and_quotes_do_not_reveal_target_inventory() {
    let (mut s, r, p, b, t) = ready();
    let q = quote_missiles(&s, p, &intent(&s, b, t, 1), 1000, &r).unwrap();
    edit(
        &mut s,
        &r,
        t,
        1050,
        serde_json::json!({"op":"set","missiles":{"AntiBallisticMissile":0},"defenses":{"RocketLauncher":0}}),
    );
    assert_eq!(
        quote_missiles(&s, p, &intent(&s, b, t, 1), 1000, &r).unwrap(),
        q
    );
    assert_eq!(
        quote_missiles(&s, p, &intent(&s, b, t, 11), 1000, &r),
        Err(GameError::InsufficientMissiles)
    );
    assert_eq!(
        quote_missiles(&s, p, &intent(&s, b, b, 1), 1000, &r),
        Err(GameError::InvalidInput)
    );
    s.bodies.get_mut(&t).unwrap().coordinates.galaxy = 2;
    assert_eq!(
        quote_missiles(&s, p, &intent(&s, b, t, 1), 1000, &r),
        Err(GameError::OutOfRange)
    );
}
#[test]
fn moon_parent_binding_shares_one_inventory_and_removed_moon_does_not_spend_it() {
    let (mut s, r, p, b, t) = ready();
    let mut moon = s.bodies[&t].clone();
    moon.id = BodyId(Uuid::from_u128(888));
    moon.kind = BodyKind::Moon;
    assert_eq!(missile_interceptor_body(&moon, Some(&s.bodies[&t])), Ok(t));
    assert_eq!(
        missile_interceptor_body(&moon, None),
        Err(GameError::NotFound)
    );
    assert!(missile_interceptor_body(&moon, Some(&s.bodies[&b])).is_err());
    // Synthetic lunar flight exercises the shared-inventory impact path without enabling moons.
    let a = launch(&mut s, &r, p, b, t, 4, 1060);
    let bflight = launch(&mut s, &r, p, b, t, 4, 1061);
    let flight = s
        .world
        .as_mut()
        .unwrap()
        .records
        .missiles
        .values_mut()
        .find(|f| f.id == OperationId(derived_id(InputId(Uuid::from_u128(1060)), "missile:0")))
        .unwrap();
    let mut draft = (*flight.terms).clone();
    draft.intent.target.id = moon.id;
    draft.intent.target.expected_kind = BodyKind::Moon;
    flight.terms = draft.seal();
    s.coverage.bodies.insert(moon.id);
    s.coverage.inventory_owners.insert((moon.id, moon.owner));
    s.coverage.manufacturing_bodies.insert(moon.id);
    // No lunar buildings/units: the planet's stock alone is consumed.
    moon.levels.values_mut().for_each(|v| *v = 0);
    s.bodies.insert(moon.id, moon.clone());
    let result = run(
        &mut s,
        &r,
        p,
        b,
        a.events[0].at,
        1062,
        Input::Event(a.events[0].event.clone()),
    );
    apply(&mut s, result);
    assert_eq!(
        count(
            &s,
            t,
            ManufacturedItem::Missile(MissileId::AntiBallisticMissile)
        ),
        2
    );
    let result = run(
        &mut s,
        &r,
        p,
        b,
        bflight.events[0].at,
        1063,
        Input::Event(bflight.events[0].event.clone()),
    );
    let c = apply(&mut s, result);
    assert_eq!(
        count(
            &s,
            t,
            ManufacturedItem::Missile(MissileId::AntiBallisticMissile)
        ),
        0
    );
    assert!(
        c.world
            .unwrap()
            .records
            .reports
            .values()
            .any(|r| r.payloads[&p]["penetrating"] == "2")
    );
}

#[test]
fn ordinary_raids_never_target_silo_inventory() {
    let (mut s, r, p, b, t) = ready();
    let mut request = super::intent(&s, p, b, t);
    request.mission = Mission::Attack;
    let q = quote_fleet(&s, p, &request, 1000, &r).unwrap();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        1000,
        1100,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet {
                intent: request,
                expected_terms_hash: q.terms_hash.clone(),
            },
        }),
    );
    let launch = apply(&mut s, result);
    let e = &launch.events[0];
    let result = run(&mut s, &r, p, b, e.at, 1101, Input::Event(e.event.clone()));
    apply(&mut s, result);
    assert_eq!(
        count(
            &s,
            t,
            ManufacturedItem::Missile(MissileId::AntiBallisticMissile)
        ),
        6
    );
    assert_eq!(
        count(
            &s,
            b,
            ManufacturedItem::Missile(MissileId::InterplanetaryMissile)
        ),
        10
    );
    assert_eq!(s.bodies[&t].levels[&Building::MissileSilo], 4);
}
#[test]
fn removed_moon_leaves_parent_interceptors_untouched() {
    let (mut s, r, p, b, t) = ready();
    let c = launch(&mut s, &r, p, b, t, 4, 1110);
    let moon = BodyId(Uuid::from_u128(889));
    s.coverage.bodies.insert(moon);
    let f = s
        .world
        .as_mut()
        .unwrap()
        .records
        .missiles
        .values_mut()
        .next()
        .unwrap();
    let mut draft = (*f.terms).clone();
    draft.intent.target.id = moon;
    draft.intent.target.expected_kind = BodyKind::Moon;
    f.terms = draft.seal();
    let e = &c.events[0];
    let result = run(&mut s, &r, p, b, e.at, 1111, Input::Event(e.event.clone()));
    let impact = apply(&mut s, result);
    assert!(impact.inventories.is_empty());
    assert_eq!(
        count(
            &s,
            t,
            ManufacturedItem::Missile(MissileId::AntiBallisticMissile)
        ),
        6
    );
    assert_eq!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .missiles
            .values()
            .next()
            .unwrap()
            .status,
        MissileStatus::NoTarget
    );
}
#[test]
fn exact_residual_power_carries_between_defense_types() {
    let (s, r, _, _, _) = ready();
    let combat = &r.artifact.world.as_ref().unwrap().combat;
    let mut rule = missile_rules(&r).unwrap().clone();
    for (power, rockets) in [(11999, 9), (12000, 10)] {
        rule.base_attack = power;
        let mut rng = RandomStream::new(
            &[1; 32],
            s.universe,
            s.epoch,
            InputId::default(),
            "missile-target",
        )
        .unwrap();
        let losses = missile_damage(
            1,
            [0, 0],
            Some(DefenseId::PlasmaTurret),
            &BTreeMap::from([
                (DefenseId::PlasmaTurret, 1),
                (DefenseId::RocketLauncher, 10),
            ]),
            combat,
            &rule,
            &mut rng,
        )
        .unwrap();
        assert_eq!(losses[&DefenseId::PlasmaTurret], 1);
        assert_eq!(losses[&DefenseId::RocketLauncher], rockets);
    }
}

#[test]
fn accepted_missile_wire_survives_restart_and_rejects_tampering() {
    let (mut s, r, p, b, t) = ready();
    let launch = launch(&mut s, &r, p, b, t, 4, 6000);
    let saved = serde_json::to_value(&s).unwrap();
    let id = s
        .world
        .as_ref()
        .unwrap()
        .records
        .missiles
        .keys()
        .next()
        .unwrap()
        .to_string();
    let original_terms = saved["world"]["records"]["missiles"][&id]["terms"].clone();
    let mut tampered = saved.clone();
    tampered["world"]["records"]["missiles"][&id]["terms"]["duration_ms"] = serde_json::json!(1);
    assert!(serde_json::from_value::<GameState>(tampered).is_err());
    s = serde_json::from_value(saved).unwrap();
    validate_asset_lineage(&s).unwrap();
    let event = &launch.events[0];
    let result = run(
        &mut s,
        &r,
        p,
        b,
        event.at,
        6001,
        Input::Event(event.event.clone()),
    );
    apply(&mut s, result);
    let after = serde_json::to_value(&s).unwrap();
    assert_eq!(
        after["world"]["records"]["missiles"][&id]["terms"],
        original_terms
    );
    let result = run(
        &mut s,
        &r,
        p,
        b,
        event.at,
        6002,
        Input::Event(event.event.clone()),
    );
    let changes = apply(&mut s, result);
    assert!(changes.inventories.is_empty());
}

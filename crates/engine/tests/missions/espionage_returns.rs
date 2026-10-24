use super::*;

fn probe_intent(s: &GameState, p: PlayerId, b: BodyId, t: BodyId) -> FleetIntent {
    let mut request = intent(s, p, b, t);
    request.mission = Mission::Espionage;
    request.cargo = Resources::default();
    request.ships[0].ship_type = ShipType::EspionageProbe;
    request
}

fn report_kinds(s: &GameState, p: PlayerId) -> BTreeSet<&str> {
    s.world
        .as_ref()
        .unwrap()
        .records
        .reports
        .values()
        .filter(|report| report.payloads.contains_key(&p))
        .map(|report| report.kind.as_str())
        .collect()
}

#[test]
fn only_probe_only_espionage_returns_are_silent() {
    for (mission, escorted, escort_lost) in [
        (Mission::Espionage, false, false),
        (Mission::Espionage, true, false),
        (Mission::Espionage, true, true),
        (Mission::Transport, false, false),
        (Mission::Attack, false, false),
    ] {
        let (mut s, r, p, b, t) = raid_fixture();
        let mut request = probe_intent(&s, p, b, t);
        request.mission = mission;
        if escorted {
            request.ships.push(ManifestStack {
                owner: p,
                ship_type: ShipType::SmallCargo,
                count: 1,
            });
        }
        let arrival = launch_raid(&mut s, &r, p, b, request.clone(), 1000, 5000);
        clear_units(&mut s, t);
        let result = run(
            &mut s,
            &r,
            p,
            b,
            arrival.at,
            5001,
            Input::Event(arrival.event),
        );
        let changes = apply(&mut s, result);
        if mission == Mission::Espionage {
            assert_eq!(report_kinds(&s, p), BTreeSet::from(["Espionage"]));
            assert_eq!(
                report_kinds(&s, s.bodies[&t].owner),
                BTreeSet::from(["SpyContact"])
            );
        }
        let reports_before = s.world.as_ref().unwrap().records.reports.clone();
        if escort_lost {
            // Model a settled encounter that left only probes alive on the return leg.
            let w = &mut s.world.as_mut().unwrap().records;
            let fleet = w.fleets.values_mut().next().unwrap();
            fleet
                .ships
                .retain(|ship| ship.ship_type == ShipType::EspionageProbe);
            w.lots.retain(|lot| {
                lot.location != AssetLocation::Fleet(fleet.id)
                    || lot.item != CatalogKey::Ship(ShipType::SmallCargo)
            });
            validate_asset_lineage(&s).unwrap();
        }
        let returning = changes.events[0].clone();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            returning.at,
            5002,
            Input::Event(returning.event.clone()),
        );
        let changes = apply(&mut s, result);
        let w = &s.world.as_ref().unwrap().records;
        assert_eq!(w.fleets.values().next().unwrap().leg, MissionLeg::Returned);
        assert_eq!(w.activity[&b].cause, ActivityCause::Return);
        assert!(changes.affected_viewers.contains(&p));
        assert!(changes.events.is_empty());
        assert_eq!(
            report_kinds(&s, p).contains("Returned"),
            mission != Mission::Espionage || escorted,
            "{mission:?}, escorted={escorted}, escort_lost={escort_lost}"
        );
        for (id, report) in &reports_before {
            assert_eq!(&w.reports[id], report);
        }
        if mission == Mission::Espionage && !escorted {
            assert_eq!(w.reports, reports_before);
        }
        assert_eq!(
            s.inventories
                .iter()
                .find(|stack| {
                    stack.body == b
                        && stack.item == ManufacturedItem::Ship(ShipType::EspionageProbe)
                })
                .unwrap()
                .count,
            2
        );
        // A transport quote checks slot availability without hostile score protection
        // changing after the fixture removes the target's ships.
        request.mission = Mission::Transport;
        quote_fleet(&s, p, &request, returning.at, &r).unwrap();
        validate_asset_lineage(&s).unwrap();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            returning.at,
            5003,
            Input::Event(returning.event),
        );
        assert!(apply(&mut s, result).world.is_none());
    }
}

#[test]
fn probe_espionage_recalls_keep_confirmation_without_return_notice() {
    for elapsed in [0, 1] {
        let (mut s, r, p, b, t) = raid_fixture();
        let request = probe_intent(&s, p, b, t);
        launch_raid(&mut s, &r, p, b, request, 1000, 5100);
        let fleet = *s
            .world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .keys()
            .next()
            .unwrap();
        let result = run(
            &mut s,
            &r,
            p,
            b,
            1000 + elapsed,
            5101,
            Input::Command(Command::World {
                action: WorldAction::RecallMission { fleet },
            }),
        );
        let changes = apply(&mut s, result);
        assert_eq!(report_kinds(&s, p), BTreeSet::from(["Recalled"]));
        if elapsed > 0 {
            let returning = changes.events[0].clone();
            let result = run(
                &mut s,
                &r,
                p,
                b,
                returning.at,
                5102,
                Input::Event(returning.event),
            );
            apply(&mut s, result);
        } else {
            assert!(changes.events.is_empty());
        }
        assert_eq!(report_kinds(&s, p), BTreeSet::from(["Recalled"]));
        assert_eq!(
            s.world.as_ref().unwrap().records.fleets[&fleet].leg,
            MissionLeg::Returned
        );
        validate_asset_lineage(&s).unwrap();
    }
}

#[test]
fn failed_probe_espionage_keeps_failure_without_return_notice() {
    let (mut s, r, p, b, t) = raid_fixture();
    let request = probe_intent(&s, p, b, t);
    let arrival = launch_raid(&mut s, &r, p, b, request, 1000, 5200);
    clear_units(&mut s, t);
    s.bodies.remove(&t);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        arrival.at,
        5201,
        Input::Event(arrival.event),
    );
    let changes = apply(&mut s, result);
    assert_eq!(report_kinds(&s, p), BTreeSet::from(["MissionFailed"]));
    let returning = changes.events[0].clone();
    let result = run(
        &mut s,
        &r,
        p,
        b,
        returning.at,
        5202,
        Input::Event(returning.event),
    );
    apply(&mut s, result);
    assert_eq!(report_kinds(&s, p), BTreeSet::from(["MissionFailed"]));
    assert_eq!(
        s.world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .next()
            .unwrap()
            .leg,
        MissionLeg::Returned
    );
    validate_asset_lineage(&s).unwrap();
}

#[test]
fn detected_probe_loss_keeps_espionage_and_combat_reports() {
    let (mut s, r, p, b, t) = raid_fixture();
    let request = probe_intent(&s, p, b, t);
    let arrival = launch_raid(&mut s, &r, p, b, request, 1000, 5300);
    clear_units(&mut s, t);
    set_units(
        &mut s,
        &r,
        t,
        ManufacturedItem::Ship(ShipType::LightFighter),
        1000,
    );
    let defender = s.bodies[&t].owner;
    fixture_research(&mut s, &r, defender, ResearchId::EspionageTechnology, 10);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        arrival.at,
        5301,
        Input::Event(arrival.event),
    );
    let changes = apply(&mut s, result);
    assert_eq!(report_kinds(&s, p), BTreeSet::from(["Espionage", "Combat"]));
    let w = &s.world.as_ref().unwrap().records;
    let spy = w
        .reports
        .values()
        .find(|report| report.kind == "Espionage")
        .unwrap();
    assert_eq!(spy.payloads[&p]["counterespionage"]["detected"], true);
    assert_eq!(w.fleets.values().next().unwrap().leg, MissionLeg::Destroyed);
    assert!(
        !changes
            .events
            .iter()
            .any(|event| matches!(event.event, ScheduledEvent::FleetLegDue { .. }))
    );
    validate_asset_lineage(&s).unwrap();
}

#[test]
fn espionage_preserves_the_observed_planet_name() {
    let (mut s, r, p, b, t) = raid_fixture();
    s.bodies.get_mut(&t).unwrap().name = Some("Nova Roma".into());
    let request = probe_intent(&s, p, b, t);
    let arrival = launch_raid(&mut s, &r, p, b, request, 1000, 5100);
    clear_units(&mut s, t);
    let result = run(
        &mut s,
        &r,
        p,
        b,
        arrival.at,
        5101,
        Input::Event(arrival.event),
    );
    apply(&mut s, result);
    s.bodies.get_mut(&t).unwrap().name = Some("Renamed later".into());
    let report = s
        .world
        .as_ref()
        .unwrap()
        .records
        .reports
        .values()
        .find(|r| r.kind == "Espionage")
        .unwrap();
    assert_eq!(report.payloads[&p]["target"]["name"], "Nova Roma");
}

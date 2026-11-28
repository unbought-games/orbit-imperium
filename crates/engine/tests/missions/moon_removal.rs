use super::*;

fn arrive(
    s: &mut GameState,
    r: &Ruleset,
    p: PlayerId,
    home: BodyId,
    event: &NewEvent,
    n: u128,
) -> ChangeSet {
    let result = run(
        s,
        r,
        p,
        home,
        event.at,
        n,
        Input::Event(event.event.clone()),
    );
    apply(s, result)
}
fn fleet_id(event: &NewEvent) -> FleetId {
    let ScheduledEvent::FleetLegDue { fleet, .. } = event.event else {
        panic!("expected fleet arrival")
    };
    fleet
}

#[test]
fn inbound_missions_keep_their_paid_deadline_and_their_own_authorized_target() {
    for mission in [
        Mission::Deploy,
        Mission::Transport,
        Mission::Hold,
        Mission::Attack,
        Mission::Espionage,
        Mission::DestroyMoon,
    ] {
        let (mut s, r, p, home, moon, destroy) = moon_destruction::setup();
        let parent = s.world.as_ref().unwrap().records.moons[&moon].parent;
        let defender = s.bodies[&moon].owner;
        fixture_research(&mut s, &r, p, ResearchId::ComputerTechnology, 1);
        set_units(
            &mut s,
            &r,
            home,
            ManufacturedItem::Ship(ShipType::Dreadnought),
            5,
        );
        s.world.as_mut().unwrap().secret = [28; 32];
        let wave = launch_raid(&mut s, &r, p, home, destroy, 1000, 83001);
        let (sender, source) = if mission == Mission::Deploy {
            (defender, parent)
        } else {
            (p, home)
        };
        let mut request = intent(&s, sender, source, moon);
        request.mission = mission;
        if mission == Mission::Hold {
            request.hold_hours = Some(1);
            s.world.as_mut().unwrap().holding_relationships = Some(HoldingRelationships {
                covered: [p, defender].into(),
                friends: [(p.min(defender), p.max(defender))].into(),
                ..Default::default()
            });
        }
        if mission == Mission::Espionage {
            request.ships[0].ship_type = ShipType::EspionageProbe;
            request.cargo = Resources::default();
        }
        if mission == Mission::DestroyMoon {
            request.ships[0].ship_type = ShipType::Dreadnought;
        }
        let next = launch_raid(
            &mut s,
            &r,
            sender,
            source,
            request.clone(),
            wave.at - 1,
            83100,
        );
        let flight = fleet_id(&next);
        let accepted = s.world.as_ref().unwrap().records.fleets[&flight].clone();
        arrive(&mut s, &r, p, home, &wave, 83002);
        let w = &s.world.as_ref().unwrap().records;
        assert_eq!(w.destroyed_moons[&moon].parent, parent);
        let f = &w.fleets[&flight];
        let friendly = matches!(
            mission,
            Mission::Deploy | Mission::Transport | Mission::Hold
        );
        let expected = if friendly {
            MissionDestination::Body {
                id: parent,
                expected_kind: BodyKind::Planet,
                expected_owner: defender,
            }
        } else {
            request.destination
        };
        assert_eq!(f.intent.destination, expected);
        assert_eq!(f.due_at, next.at);
        assert_eq!(f.terms, accepted.terms);
        assert_eq!(f.ships, accepted.ships);
        assert_eq!(f.cargo, accepted.cargo);
        let notice = w
            .reports
            .values()
            .find(|r| {
                r.fleet == Some(flight)
                    && matches!(r.kind.as_str(), "MoonFleetRedirected" | "MoonTargetLost")
            })
            .unwrap();
        assert_eq!(notice.payloads.len(), 1);
        assert_eq!(notice.payloads[&sender]["destination_redirected"], friendly);
        assert_eq!(notice.payloads[&sender]["due_at"], next.at);
        // Recreating the lunar slot before the second arrival cannot authorize
        // contact with the replacement or divert a delivery away from the parent.
        let replacement = moons::add_moon(&mut s, parent, 83105);
        let before = s.bodies[&replacement].clone();
        let second = arrive(&mut s, &r, sender, source, &next, 83101);
        assert_eq!(s.bodies[&replacement], before);
        let w = &s.world.as_ref().unwrap().records;
        let f = &w.fleets[&flight];
        match mission {
            Mission::Deploy => assert_eq!(f.leg, MissionLeg::Deployed),
            Mission::Hold => assert_eq!(f.leg, MissionLeg::Holding),
            Mission::Transport => {
                assert_eq!(f.leg, MissionLeg::Returning);
                assert_eq!(f.cargo, Resources::default());
            }
            _ => {
                assert_eq!(f.leg, MissionLeg::Returning);
                assert_eq!(f.return_reason, Some(MissionReturnReason::InvalidTarget));
                assert!(
                    !second
                        .world
                        .as_ref()
                        .unwrap()
                        .audits
                        .iter()
                        .any(|a| a["kind"] == "MoonDestruction" || a["kind"] == "AttackEvidence")
                );
            }
        }
        validate_completed_assets(&s).unwrap();
    }
}

#[test]
fn recalling_a_lunar_deployment_before_destruction_keeps_it_hidden_until_landing_on_parent() {
    let (mut s, r, p, home, moon, destroy) = moon_destruction::setup();
    let parent = s.world.as_ref().unwrap().records.moons[&moon].parent;
    let defender = s.bodies[&moon].owner;
    set_units(
        &mut s,
        &r,
        moon,
        ManufacturedItem::Ship(ShipType::SmallCargo),
        1,
    );
    s.world.as_mut().unwrap().secret = [28; 32];
    let wave = launch_raid(&mut s, &r, p, home, destroy, 1000, 83001);
    let mut deployment = intent(&s, defender, moon, parent);
    deployment.mission = Mission::Deploy;
    let outbound = launch_raid(&mut s, &r, defender, moon, deployment, wave.at - 10, 83200);
    let id = fleet_id(&outbound);
    let recalled = run(
        &mut s,
        &r,
        defender,
        moon,
        wave.at - 2,
        83201,
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: id },
        }),
    );
    let returning = apply(&mut s, recalled).events[0].clone();
    assert_eq!(returning.at, wave.at + 6);
    arrive(&mut s, &r, p, home, &wave, 83002);
    let w = &s.world.as_ref().unwrap().records;
    let f = &w.fleets[&id];
    assert_eq!(f.intent.origin, parent);
    assert_eq!(f.terms.intent.origin, moon);
    assert_eq!(f.return_reason, Some(MissionReturnReason::VoluntaryRecall));
    assert_eq!(f.due_at, returning.at);
    let endpoints = phalanx_endpoints(f, &s.bodies).unwrap();
    assert!(
        project_phalanx_fleet(parent, w, f, &endpoints, &Default::default())
            .unwrap()
            .is_none()
    );
    let before = s
        .inventories
        .iter()
        .find(|v| v.body == parent && v.item == ManufacturedItem::Ship(ShipType::SmallCargo))
        .unwrap()
        .count;
    arrive(&mut s, &r, defender, parent, &returning, 83202);
    assert_eq!(
        s.world.as_ref().unwrap().records.fleets[&id].leg,
        MissionLeg::Returned
    );
    assert_eq!(
        s.inventories
            .iter()
            .find(|v| v.body == parent && v.item == ManufacturedItem::Ship(ShipType::SmallCargo))
            .unwrap()
            .count,
        before + 1
    );
    validate_completed_assets(&s).unwrap();
}

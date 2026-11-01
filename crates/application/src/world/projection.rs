//! Pure world-view projection from the single loaded viewer snapshot.
use super::*;

pub(super) fn world_projection(
    snapshot: &ViewerSnapshot,
    viewer: PlayerId,
    context: QueryContext,
) -> Result<BoundView4, ServiceError> {
    let mut progression = crate::progression::progression_projection(snapshot, context)?;
    let state = snapshot
        .world
        .as_ref()
        .ok_or(ServiceError::InvariantFailure)?;
    let world = world_facts(state).map_err(|_| ServiceError::InvariantFailure)?;
    for body in &mut progression.bodies {
        if let Some(genesis) = world.records.colonies.get(&body.id) {
            let source = state
                .bodies
                .get(&body.id)
                .ok_or(ServiceError::InvariantFailure)?;
            body.diameter_km = Some(genesis.diameter_km);
            body.colony = Some(crate::progression::ColonyDto {
                diameter_km: genesis.diameter_km,
                min_temperature: source.max_temperature - 40,
                max_temperature: source.max_temperature,
                created_at: genesis.created_at,
                profile: genesis.profile.clone(),
            });
        }
    }
    super::body_order::order_bodies(&mut progression.bodies);
    let research = state
        .research
        .get(&viewer)
        .ok_or(ServiceError::InvariantFailure)?;
    if research.owner != viewer {
        return Err(ServiceError::InvariantFailure);
    }
    let missions = mission_projection(&world.records, research, snapshot.at)?;
    progression.protocol = 4;
    progression.as_of_ms = snapshot.at;
    progression.sampled_at = snapshot.at;
    progression.capabilities = world_capabilities(progression.capabilities, &snapshot.rules);
    let holdings = world
        .records
        .fleets
        .values()
        .filter_map(|fleet| {
            let MissionDestination::Body {
                id, expected_owner, ..
            } = fleet.intent.destination
            else {
                return None;
            };
            if fleet.leg != MissionLeg::Holding || expected_owner != viewer || fleet.owner == viewer
            {
                return None;
            }
            let eligible = can_hold(state, fleet.owner, viewer).is_ok()
                && [viewer, fleet.owner].iter().all(|p| {
                    world
                        .records
                        .policies
                        .get(p)
                        .is_some_and(|p| !p.deletion_pending(snapshot.at) && !p.vacation)
                });
            Some(HeldFleetView {
                id: fleet.id,
                owner: fleet.owner,
                target: id,
                ships: fleet
                    .ships
                    .iter()
                    .map(|s| PublicShipStack {
                        ship_type: s.ship_type,
                        count: s.count.to_string(),
                    })
                    .collect(),
                departure_at: fleet.due_at,
                can_supply: eligible && snapshot.at < fleet.due_at,
            })
        })
        .collect();
    let mut depots = vec![];
    if holding_enabled(&snapshot.rules) {
        for body in state
            .bodies
            .values()
            .filter(|b| b.owner == viewer && b.kind == BodyKind::Planet)
        {
            if let Some(level) = body.levels.get(&Building::AllianceDepot) {
                let (budget, next) =
                    depot_budget(*level, body.id, snapshot.at, &world.records.depot_supplies)
                        .map_err(|_| ServiceError::InvariantFailure)?;
                depots.push(DepotView {
                    body: body.id,
                    remaining_budget: budget.to_string(),
                    next_budget_release_at: next,
                });
            }
        }
    }
    Ok(BoundView4 {
        empire_deletion: world
            .records
            .policies
            .get(&viewer)
            .ok_or(ServiceError::InvariantFailure)?
            .deletion_status(snapshot.at)
            .map_err(ServiceError::GameRejected)?,
        leads_alliance: world
            .alliance_leaders
            .as_ref()
            .is_some_and(|leaders| leaders.contains(&viewer)),
        attack_groups: attack_group_views(
            &world.records,
            viewer,
            snapshot.at,
            attack_groups_enabled(&snapshot.rules),
        ),
        holdings,
        depots,
        homeworld_id: snapshot.homeworld.as_ref().map(|(id, _)| *id),
        missiles: world
            .records
            .missiles
            .values()
            .filter(|f| {
                f.status == MissileStatus::InFlight
                    && (f.owner == viewer || f.terms.intent.target.expected_owner == viewer)
            })
            .map(|f| MissileFlightView {
                id: f.id,
                attacker: f.owner,
                origin: f.terms.source_coordinates,
                target: f.terms.target_coordinates,
                target_body: f.terms.intent.target.id,
                target_kind: f.terms.intent.target.expected_kind,
                count: f.terms.intent.count.to_string(),
                arrival_at: f.due_at,
                outgoing: f.owner == viewer,
            })
            .collect(),
        has_unread_reports: snapshot.unread_report.is_some(),
        player_names: Default::default(),
        progression,
        missions,
    })
}

fn mission_projection(
    records: &WorldRecords,
    research: &ResearchLevels,
    at: Timestamp,
) -> Result<MissionView, ServiceError> {
    let espionage = *research
        .levels
        .get(&ResearchId::EspionageTechnology)
        .ok_or(ServiceError::InvariantFailure)?;
    let computer = *research
        .levels
        .get(&ResearchId::ComputerTechnology)
        .ok_or(ServiceError::InvariantFailure)?;
    let mut fleets = vec![];
    let mut incoming = vec![];
    // Preserve the records' fleet-ID order for both public lists.
    for fleet in records.fleets.values() {
        if let Some(mut own) = own_mission(fleet, research.owner, at) {
            own.due_at = effective_fleet_due(records, fleet);
            own.can_recall =
                matches!(fleet.leg, MissionLeg::Outbound | MissionLeg::Holding) && at < own.due_at;
            own.attack_group = if fleet.leg == MissionLeg::Outbound {
                fleet_attack_group(records, fleet.id).map(|g| g.id)
            } else {
                None
            };
            fleets.push(own);
        } else if let Some(mut mission) = incoming_mission(fleet, research.owner, espionage)? {
            mission.arrival_at = effective_fleet_due(records, fleet);
            mission.attack_group = fleet_attack_group(records, fleet.id).map(|g| g.id);
            incoming.push(mission);
        }
    }
    Ok(MissionView {
        fleets,
        incoming,
        score_value_micro: value_completed_assets(&records.lots, research.owner)
            .map_err(|_| ServiceError::InvariantFailure)?
            .to_string(),
        fleet_slots: fleet_slot_limit(computer).to_string(),
    })
}

fn own_mission(fleet: &MissionFleet, viewer: PlayerId, at: Timestamp) -> Option<OwnMission> {
    if fleet.owner != viewer || !fleet.active() {
        return None;
    }
    Some(OwnMission {
        attack_group: None,
        id: fleet.id,
        intent: fleet.intent.clone(),
        origin: fleet.origin_coordinates,
        destination: fleet.destination_coordinates,
        leg: fleet.leg,
        ships: fleet
            .ships
            .iter()
            .map(|stack| PublicShipStack {
                ship_type: stack.ship_type,
                count: stack.count.to_string(),
            })
            .collect(),
        cargo: fleet.cargo.into(),
        due_at: fleet.due_at,
        launched_at: fleet.launched_at,
        // Paid launch terms remain historical even if research or rules change.
        duration_ms: fleet.terms.duration_ms,
        paid_fuel: fleet.terms.fuel.to_string(),
        can_recall: matches!(fleet.leg, MissionLeg::Outbound | MissionLeg::Holding)
            && at < fleet.due_at,
    })
}

fn incoming_mission(
    fleet: &MissionFleet,
    viewer: PlayerId,
    espionage: u32,
) -> Result<Option<IncomingMission>, ServiceError> {
    if fleet.owner == viewer || fleet.leg != MissionLeg::Outbound {
        return Ok(None);
    }
    let MissionDestination::Body {
        id, expected_owner, ..
    } = fleet.intent.destination
    else {
        return Ok(None);
    };
    if expected_owner != viewer {
        return Ok(None);
    }
    Ok(Some(IncomingMission {
        attack_group: None,
        sender: fleet.owner,
        origin: fleet.origin_coordinates,
        origin_body: Some(fleet.intent.origin),
        target: id,
        mission: fleet.intent.mission,
        arrival_at: fleet.due_at,
        ships: incoming_ships(&fleet.ships, espionage)
            .map_err(|_| ServiceError::InvariantFailure)?,
    }))
}

fn world_capabilities(
    mut capabilities: Vec<CapabilityState>,
    rules: &Ruleset,
) -> Vec<CapabilityState> {
    for name in [
        "Transport",
        "Galaxy",
        "Fleets",
        "Espionage",
        "Harvest",
        "Reports",
    ] {
        if let Some(capability) = capabilities.iter_mut().find(|c| c.capability == name) {
            capability.enabled = true;
            capability.reason = "Available".into();
        } else {
            capabilities.push(CapabilityState {
                capability: name.into(),
                enabled: true,
                reason: "Available".into(),
            });
        }
    }
    // Retained Slice 4 clients validate the original capability enum strictly.
    if rules.colonization() {
        capabilities.push(CapabilityState {
            capability: "Colonize".into(),
            enabled: true,
            reason: "Available".into(),
        });
        capabilities.push(CapabilityState {
            capability: "Deploy".into(),
            enabled: true,
            reason: "Available".into(),
        });
    }
    if attack_groups_enabled(rules) {
        capabilities.push(CapabilityState {
            capability: "AllianceAttacks".into(),
            enabled: true,
            reason: "Available".into(),
        });
    }
    if holding_enabled(rules) {
        capabilities.push(CapabilityState {
            capability: "Hold".into(),
            enabled: true,
            reason: "Available".into(),
        });
    }
    if missile_rules(rules).is_some() {
        capabilities.push(CapabilityState {
            capability: "Missiles".into(),
            enabled: true,
            reason: "Available".into(),
        });
    }
    if rules.attacks() {
        capabilities.push(CapabilityState {
            capability: "Attack".into(),
            enabled: true,
            reason: "Available".into(),
        });
    }
    capabilities
}

#[cfg(test)]
mod tests;

fn attack_group_views(
    w: &WorldRecords,
    viewer: PlayerId,
    at: Timestamp,
    enabled: bool,
) -> Vec<AttackGroupView> {
    w.attack_groups
        .values()
        .filter_map(|g| {
            if g.resolved_at.is_some() {
                return None;
            }
            let initiator = w.fleets.get(&g.initiator)?;
            let own_member = g
                .members
                .iter()
                .any(|id| w.fleets.get(id).is_some_and(|f| f.owner == viewer));
            if initiator.owner != viewer && !g.invited.contains(&viewer) && !own_member {
                return None;
            }
            let members: Vec<_> = group_members(w, g).collect();
            let owners: std::collections::BTreeSet<_> = members.iter().map(|f| f.owner).collect();
            Some(AttackGroupView {
                id: g.id,
                revision: g.revision,
                initiator: initiator.owner,
                target: initiator.intent.destination.clone(),
                coordinates: initiator.destination_coordinates,
                arrival_at: g.arrival_at,
                joining_open: enabled && group_open(w, g, at),
                can_join: enabled
                    && group_open(w, g, at)
                    && (viewer == initiator.owner || g.invited.contains(&viewer))
                    && members.len() < 16
                    && (owners.len() < 5 || owners.contains(&viewer)),
                invitations: (viewer == initiator.owner)
                    .then(|| g.invited.iter().copied().collect()),
                members: members
                    .into_iter()
                    .map(|f| AttackGroupMemberView {
                        owner: f.owner,
                        own_fleet: (f.owner == viewer).then_some(f.id),
                        ships: f
                            .ships
                            .iter()
                            .map(|s| PublicShipStack {
                                ship_type: s.ship_type,
                                count: s.count.to_string(),
                            })
                            .collect(),
                    })
                    .collect(),
            })
        })
        .collect()
}

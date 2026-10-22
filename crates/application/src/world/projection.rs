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
            body.colony = Some(crate::progression::ColonyDto {
                diameter_km: genesis.diameter_km,
                min_temperature: source.max_temperature - 40,
                max_temperature: source.max_temperature,
                created_at: genesis.created_at,
                profile: genesis.profile.clone(),
            });
        }
    }
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
    Ok(BoundView4 {
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
        if let Some(own) = own_mission(fleet, research.owner, at) {
            fleets.push(own);
        } else if let Some(mission) = incoming_mission(fleet, research.owner, espionage)? {
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
        can_recall: fleet.leg == MissionLeg::Outbound && at < fleet.due_at,
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
        sender: fleet.owner,
        origin: fleet.origin_coordinates,
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

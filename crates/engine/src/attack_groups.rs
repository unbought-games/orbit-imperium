//! Invitation-based attacks. Shared arrival is a commitment; counts and openness are derived.
use crate::transition::{Fault, invariant};
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttackGroup {
    pub id: OperationId,
    pub initiator: FleetId,
    pub members: BTreeSet<FleetId>,
    pub invited: BTreeSet<PlayerId>,
    pub arrival_at: Timestamp,
    pub generation: i64,
    pub revision: i64,
    pub resolved_at: Option<Timestamp>,
}
pub fn attack_groups_enabled(r: &Ruleset) -> bool {
    r.artifact
        .world
        .as_ref()
        .is_some_and(|w| w.attack_groups.is_some())
        && r.attacks()
}
pub fn fleet_attack_group(w: &WorldRecords, fleet: FleetId) -> Option<&AttackGroup> {
    w.attack_groups
        .values()
        .find(|g| g.resolved_at.is_none() && g.members.contains(&fleet))
}
pub fn group_members<'a>(
    w: &'a WorldRecords,
    g: &'a AttackGroup,
) -> impl Iterator<Item = &'a MissionFleet> {
    g.members
        .iter()
        .filter_map(|id| w.fleets.get(id))
        .filter(|f| f.leg == MissionLeg::Outbound)
}
pub fn group_open(w: &WorldRecords, g: &AttackGroup, at: Timestamp) -> bool {
    g.resolved_at.is_none()
        && at < g.arrival_at
        && w.fleets
            .get(&g.initiator)
            .is_some_and(|f| f.leg == MissionLeg::Outbound)
}
pub fn effective_fleet_due(w: &WorldRecords, f: &MissionFleet) -> Timestamp {
    if f.leg == MissionLeg::Outbound {
        fleet_attack_group(w, f.id).map_or(f.due_at, |g| g.arrival_at)
    } else {
        f.due_at
    }
}
pub fn joined_arrival(
    at: Timestamp,
    arrival: Timestamp,
    duration: i64,
) -> Result<Timestamp, GameError> {
    if at >= arrival {
        return Err(GameError::AttackGroupClosed);
    }
    if i128::from(duration) * 10 > i128::from(arrival - at) * 13 {
        return Err(GameError::AttackGroupTooLate);
    }
    Ok(arrival.max(deadline(at, duration)?))
}
pub(crate) fn validate_join(
    s: &GameState,
    owner: PlayerId,
    intent: &FleetIntent,
    at: Timestamp,
    duration: i64,
    r: &Ruleset,
) -> Result<Option<i64>, GameError> {
    let Some(id) = intent.attack_group else {
        return Ok(None);
    };
    if !attack_groups_enabled(r) || intent.mission != Mission::Attack {
        return Err(GameError::UnavailableContent);
    }
    let w = &world_facts(s)
        .map_err(|_| GameError::PolicyUnavailable)?
        .records;
    group_join_revision(w, id, owner, &intent.destination, at, duration).map(Some)
}
/// Pure group authorization and synchronization; ordinary launch guards run separately.
pub fn group_join_revision(
    w: &WorldRecords,
    id: OperationId,
    owner: PlayerId,
    destination: &MissionDestination,
    at: Timestamp,
    duration: i64,
) -> Result<i64, GameError> {
    let g = w.attack_groups.get(&id).ok_or(GameError::NotFound)?;
    let initiating = w
        .fleets
        .get(&g.initiator)
        .ok_or(GameError::PolicyUnavailable)?;
    if owner != initiating.owner && !g.invited.contains(&owner) {
        return Err(GameError::NotFound);
    }
    if !group_open(w, g, at) {
        return Err(GameError::AttackGroupClosed);
    }
    if *destination != initiating.intent.destination {
        return Err(GameError::InvalidInput);
    }
    if g.members.iter().any(|id| !w.fleets.contains_key(id)) {
        return Err(GameError::PolicyUnavailable);
    }
    let members: Vec<_> = group_members(w, g).collect();
    let owners: BTreeSet<_> = members.iter().map(|f| f.owner).chain([owner]).collect();
    if members.len() >= 16 || owners.len() > 5 {
        return Err(GameError::AttackGroupFull);
    }
    let arrival = joined_arrival(at, g.arrival_at, duration)?;
    for f in members {
        deadline(arrival, f.terms.duration_ms)?;
    }
    deadline(arrival, duration)?;
    Ok(g.revision)
}
fn cancel(c: &mut ChangeSet, g: &AttackGroup) {
    c.cancelled_events.push(ScheduledEvent::AttackGroupDue {
        group: g.id,
        generation: g.generation,
    });
}
fn schedule(c: &mut ChangeSet, i: &OrderedInput, g: &AttackGroup) {
    c.events.push(NewEvent {
        id: InputId(derived_id(
            i.id,
            &format!("group:{}:{}", g.id, g.generation),
        )),
        at: g.arrival_at,
        event: ScheduledEvent::AttackGroupDue {
            group: g.id,
            generation: g.generation,
        },
    });
}
fn viewers(c: &mut ChangeSet, w: &WorldRecords, g: &AttackGroup) {
    c.affected_viewers.extend(g.invited.iter().copied());
    for f in g.members.iter().filter_map(|id| w.fleets.get(id)) {
        c.affected_viewers.insert(f.owner);
        c.affected_viewers.extend(f.authorization.target_owner);
    }
}
pub(crate) fn command(
    s: &GameState,
    i: &OrderedInput,
    action: &WorldAction,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    if !attack_groups_enabled(r) {
        return Err(GameError::UnavailableContent.into());
    }
    let Actor::Player(owner) = i.actor else {
        return Err(invariant("group actor"));
    };
    match action {
        WorldAction::CreateAttackGroup { fleet } => {
            let f = w.fleets.get(fleet).ok_or(GameError::NotFound)?;
            if f.owner != owner {
                return Err(GameError::NotOwned.into());
            }
            if f.intent.mission != Mission::Attack
                || f.leg != MissionLeg::Outbound
                || i.at >= f.due_at
                || fleet_attack_group(w, *fleet).is_some()
            {
                return Err(GameError::NotOutbound.into());
            }
            let MissionDestination::Body {
                id,
                expected_owner,
                expected_kind,
            } = f.intent.destination
            else {
                return Err(GameError::InvalidInput.into());
            };
            if !s
                .bodies
                .get(&id)
                .is_some_and(|b| b.owner == expected_owner && b.kind == expected_kind)
            {
                return Err(GameError::NotFound.into());
            }
            let g = AttackGroup {
                id: OperationId(derived_id(i.id, "attack-group:0")),
                initiator: *fleet,
                members: BTreeSet::from([*fleet]),
                invited: BTreeSet::new(),
                arrival_at: f.due_at,
                generation: 0,
                revision: 0,
                resolved_at: None,
            };
            c.cancelled_events.push(ScheduledEvent::FleetLegDue {
                fleet: f.id,
                generation: f.generation,
                expected_leg: f.leg,
            });
            let f = w.fleets.get_mut(fleet).unwrap();
            f.generation = f.generation.checked_add(1).ok_or(GameError::NumericRange)?;
            f.revision = f.revision.checked_add(1).ok_or(GameError::NumericRange)?;
            schedule(c, i, &g);
            viewers(c, w, &g);
            w.attack_groups.insert(g.id, g);
        }
        WorldAction::InviteAttackGroup { group, player }
        | WorldAction::RevokeAttackGroupInvitation { group, player } => {
            let g = w.attack_groups.get(group).ok_or(GameError::NotFound)?;
            if w.fleets.get(&g.initiator).is_none_or(|f| f.owner != owner) {
                return Err(GameError::NotFound.into());
            }
            if !group_open(w, g, i.at) {
                return Err(GameError::AttackGroupClosed.into());
            }
            if matches!(action, WorldAction::InviteAttackGroup { .. }) {
                let rel = s
                    .world
                    .as_ref()
                    .and_then(|w| w.holding_relationships.as_ref())
                    .ok_or(GameError::PolicyUnavailable)?;
                if !rel.covered.contains(player)
                    || !w
                        .policies
                        .get(player)
                        .is_some_and(|p| p.lifecycle == PlayerLifecycle::Active)
                    || rel.blocks.contains(&(owner, *player))
                    || rel.blocks.contains(&(*player, owner))
                {
                    return Err(GameError::NotFound.into());
                }
            }
            let mut g = g.clone();
            if matches!(action, WorldAction::InviteAttackGroup { .. }) {
                g.invited.insert(*player);
            } else {
                g.invited.remove(player);
            }
            g.revision = g.revision.checked_add(1).ok_or(GameError::NumericRange)?;
            c.affected_viewers.insert(*player);
            viewers(c, w, &g);
            w.attack_groups.insert(*group, g);
        }
        _ => return Err(invariant("group command")),
    }
    Ok(())
}
pub(crate) fn join(
    i: &OrderedInput,
    f: &MissionFleet,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    let id = f
        .intent
        .attack_group
        .ok_or_else(|| invariant("missing group intent"))?;
    let mut g = w
        .attack_groups
        .get(&id)
        .ok_or_else(|| invariant("missing joining group"))?
        .clone();
    cancel(c, &g);
    g.arrival_at = joined_arrival(i.at, g.arrival_at, f.terms.duration_ms)?;
    g.members.insert(f.id);
    g.generation = g.generation.checked_add(1).ok_or(GameError::NumericRange)?;
    g.revision = g.revision.checked_add(1).ok_or(GameError::NumericRange)?;
    schedule(c, i, &g);
    viewers(c, w, &g);
    w.attack_groups.insert(id, g);
    Ok(())
}
pub(crate) fn recalled(
    i: &OrderedInput,
    fleet: FleetId,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    let Some(mut g) = fleet_attack_group(w, fleet).cloned() else {
        return Ok(());
    };
    g.revision = g.revision.checked_add(1).ok_or(GameError::NumericRange)?;
    if group_members(w, &g).next().is_none() {
        cancel(c, &g);
        g.resolved_at = Some(i.at);
    }
    viewers(c, w, &g);
    w.attack_groups.insert(g.id, g);
    Ok(())
}
pub(crate) fn arrive(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
    audits: &mut Vec<serde_json::Value>,
) -> Result<(), Fault> {
    let Input::Event(ScheduledEvent::AttackGroupDue {
        group: id,
        generation,
    }) = i.payload
    else {
        return Err(invariant("group event"));
    };
    let mut g = w
        .attack_groups
        .get(&id)
        .ok_or_else(|| invariant("missing due group"))?
        .clone();
    if g.resolved_at.is_some() || g.generation != generation {
        return Ok(());
    }
    if i.at != g.arrival_at {
        return Err(invariant("group deadline mismatch"));
    }
    let mut fleets: Vec<_> = group_members(w, &g).cloned().collect();
    if fleets.is_empty() {
        return Err(invariant("empty due group"));
    }
    let MissionDestination::Body {
        id: target,
        expected_owner,
        expected_kind,
    } = fleets[0].intent.destination
    else {
        return Err(invariant("group target"));
    };
    if s.bodies
        .get(&target)
        .is_some_and(|b| b.owner == expected_owner && b.kind == expected_kind)
    {
        crate::encounter::attack_group_encounter(s, i, &mut fleets, r, c, w, audits)?;
        crate::missions::signal(w, target, i, ActivityCause::Contact);
    } else {
        for f in &fleets {
            crate::missions::own_report(w, i, f, "MissionFailed");
        }
    }
    for mut f in fleets {
        f.generation = f.generation.checked_add(1).ok_or(GameError::NumericRange)?;
        f.revision = f.revision.checked_add(1).ok_or(GameError::NumericRange)?;
        if f.ships.is_empty() {
            f.leg = MissionLeg::Destroyed;
        } else {
            f.leg = MissionLeg::Returning;
            f.due_at = deadline(i.at, f.terms.duration_ms)?;
            crate::missions::schedule(c, i, &f);
        }
        w.fleets.insert(f.id, f);
    }
    viewers(c, w, &g);
    g.resolved_at = Some(i.at);
    w.attack_groups.insert(id, g);
    Ok(())
}

/// Reconcile persisted active groups without inventing missing members or deadlines.
pub fn validate_attack_group_records(w: &WorldRecords) -> Result<(), InvariantError> {
    let mut assigned = BTreeSet::new();
    for g in w.attack_groups.values().filter(|g| g.resolved_at.is_none()) {
        let initiating = w
            .fleets
            .get(&g.initiator)
            .ok_or_else(|| InvariantError("missing group initiator".into()))?;
        if !g.members.contains(&g.initiator)
            || g.generation < 0
            || g.revision < 0
            || !(0..=MAX_WIRE_MS).contains(&g.arrival_at)
        {
            return Err(InvariantError("invalid group commitment".into()));
        }
        for id in &g.members {
            let f = w
                .fleets
                .get(id)
                .ok_or_else(|| InvariantError("missing group member".into()))?;
            if f.intent.mission != Mission::Attack
                || f.intent.destination != initiating.intent.destination
                || !assigned.insert(*id)
            {
                return Err(InvariantError("invalid group membership".into()));
            }
        }
        let active: Vec<_> = group_members(w, g).collect();
        if active.is_empty()
            || active.len() > 16
            || active
                .iter()
                .map(|f| f.owner)
                .collect::<BTreeSet<_>>()
                .len()
                > 5
        {
            return Err(InvariantError("invalid group capacity".into()));
        }
    }
    Ok(())
}

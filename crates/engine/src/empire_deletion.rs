//! Empire-only lifecycle. Deadlines derive from explicit intent or foreground presence.
use crate::{
    transition::{Fault, invariant},
    *,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const DAY_MS: i64 = 86_400_000;
pub const DELETION_GRACE_MS: i64 = 7 * DAY_MS;
pub const INACTIVITY_WARNING_MS: i64 = 28 * DAY_MS;
pub const INACTIVITY_DELETION_MS: i64 = 35 * DAY_MS;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmpireDeletionStatus {
    pub reason: EmpireDeletionReason,
    pub due_at: Timestamp,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EmpireDeletionReason {
    Requested,
    Inactivity,
}

impl PlayerPolicy {
    pub fn deletion_deadline(&self) -> Result<Option<Timestamp>, GameError> {
        if self.lifecycle == PlayerLifecycle::Removed {
            return Ok(None);
        }
        let source = if let Some(at) = self.deletion_requested_at {
            Some((at, DELETION_GRACE_MS))
        } else if !self.vacation {
            Some((self.last_presence_at, INACTIVITY_DELETION_MS))
        } else {
            None
        };
        source.map(|(at, delay)| deadline(at, delay)).transpose()
    }
    /// Wake at the grace-period boundary so connected clients receive its notice.
    pub fn next_deletion_check(&self, at: Timestamp) -> Result<Option<Timestamp>, GameError> {
        let Some(due) = self.deletion_deadline()? else {
            return Ok(None);
        };
        if self.deletion_requested_at.is_none() {
            let warning = deadline(self.last_presence_at, INACTIVITY_WARNING_MS)?;
            if warning > at {
                return Ok(Some(warning));
            }
        }
        Ok(Some(due))
    }
    pub fn deletion_status(
        &self,
        at: Timestamp,
    ) -> Result<Option<EmpireDeletionStatus>, GameError> {
        let Some(due_at) = self.deletion_deadline()? else {
            return Ok(None);
        };
        if self.deletion_requested_at.is_some() {
            Ok(Some(EmpireDeletionStatus {
                reason: EmpireDeletionReason::Requested,
                due_at,
            }))
        } else if at >= deadline(self.last_presence_at, INACTIVITY_WARNING_MS)? {
            Ok(Some(EmpireDeletionStatus {
                reason: EmpireDeletionReason::Inactivity,
                due_at,
            }))
        } else {
            Ok(None)
        }
    }
    pub fn deletion_pending(&self, at: Timestamp) -> bool {
        self.lifecycle != PlayerLifecycle::Active
            || self.deletion_requested_at.is_some()
            || (!self.vacation && at.saturating_sub(self.last_presence_at) >= INACTIVITY_WARNING_MS)
    }
}

pub(crate) fn schedule_empire_check(
    c: &mut ChangeSet,
    i: &OrderedInput,
    player: PlayerId,
    at: Timestamp,
) {
    c.events.push(NewEvent {
        id: InputId(derived_id(i.id, &format!("empire-deletion:{player}"))),
        at,
        event: ScheduledEvent::EmpireDeletionDue { player },
    });
}

pub(crate) fn request(
    s: &GameState,
    i: &OrderedInput,
    w: &mut WorldRecords,
    c: &mut ChangeSet,
    cancel: bool,
) -> Result<(), Fault> {
    let Actor::Player(player) = i.actor else {
        return Err(invariant("deletion actor"));
    };
    if !cancel
        && world_facts(s)?
            .alliance_leaders
            .as_ref()
            .ok_or(GameError::PolicyUnavailable)?
            .contains(&player)
    {
        return Err(GameError::AllianceLeader.into());
    }
    let p = w
        .policies
        .get_mut(&player)
        .ok_or(GameError::PolicyUnavailable)?;
    if p.lifecycle == PlayerLifecycle::Removed {
        return Err(GameError::NotFound.into());
    }
    if p.deletion_requested_at
        .is_some_and(|at| i.at >= at.saturating_add(DELETION_GRACE_MS))
    {
        return Err(GameError::DeletionDue.into());
    }
    if cancel {
        p.deletion_requested_at = None;
    } else if p.deletion_requested_at.is_none() {
        p.deletion_requested_at = Some(i.at);
    }
    p.revision = p.revision.checked_add(1).ok_or(GameError::NumericRange)?;
    let at = p
        .next_deletion_check(i.at)?
        .unwrap_or(deadline(i.at, INACTIVITY_DELETION_MS)?);
    schedule_empire_check(c, i, player, at);
    c.affected_viewers.insert(player);
    Ok(())
}

pub(crate) fn finalize(
    s: &GameState,
    i: &OrderedInput,
    w: &mut WorldRecords,
    c: &mut ChangeSet,
    player: PlayerId,
    audits: &mut Vec<serde_json::Value>,
) -> Result<(), Fault> {
    let p = w
        .policies
        .get(&player)
        .ok_or_else(|| invariant("missing deletion policy"))?;
    if p.lifecycle == PlayerLifecycle::Removed {
        return Ok(());
    }
    let due = p
        .deletion_deadline()?
        .unwrap_or(deadline(i.at, INACTIVITY_DELETION_MS)?);
    if due > i.at {
        let next = p.next_deletion_check(i.at)?.unwrap_or(due);
        schedule_empire_check(c, i, player, next);
        if p.deletion_status(i.at)?.is_some() {
            c.affected_viewers.insert(player);
        }
        return Ok(());
    }
    if !world_facts(s)?.covered_players.contains(&player)
        || !s.coverage.fleet_owners.contains(&player)
        || !s.coverage.owned_body_players.contains(&player)
        || !s.coverage.research_slot_players.contains(&player)
    {
        return Err(invariant("incomplete empire removal coverage"));
    }
    let bodies: BTreeSet<_> = s
        .bodies
        .values()
        .filter(|b| b.owner == player)
        .map(|b| b.id)
        .collect();
    for body in &bodies {
        if !s.coverage.inventory_owners.contains(&(*body, player))
            || !s.coverage.construction_bodies.contains(body)
            || !s.coverage.manufacturing_bodies.contains(body)
        {
            return Err(invariant("incomplete body removal coverage"));
        }
    }
    if s.inventories
        .iter()
        .any(|stack| bodies.contains(&stack.body) && stack.owner != player && stack.count > 0)
    {
        return Err(invariant(
            "foreign stationed ships lack a committed return origin",
        ));
    }
    let removed_fleets: Vec<_> = w
        .fleets
        .values()
        .filter(|f| f.owner == player && f.active())
        .map(|f| f.id)
        .collect();
    for f in w.fleets.values_mut().filter(|f| f.active()) {
        let hosted = f.leg == MissionLeg::Holding
            && matches!(f.intent.destination, MissionDestination::Body { id, .. } if bodies.contains(&id));
        if f.owner != player && !hosted {
            continue;
        }
        c.cancelled_events.push(ScheduledEvent::FleetLegDue {
            fleet: f.id,
            generation: f.generation,
            expected_leg: f.leg,
        });
        f.generation = f.generation.checked_add(1).ok_or(GameError::NumericRange)?;
        f.revision = f.revision.checked_add(1).ok_or(GameError::NumericRange)?;
        if f.owner == player {
            f.ships.clear();
            f.cargo = Resources::default();
            f.leg = MissionLeg::Destroyed;
        } else {
            f.leg = MissionLeg::Returning;
            f.due_at = deadline(i.at, f.terms.duration_ms)?;
            crate::missions::schedule(c, i, f);
        }
        c.affected_viewers.insert(f.owner);
        c.affected_viewers.extend(f.authorization.target_owner);
    }
    // A group retains its committed arrival for other owners. Losing its last
    // outbound member closes the group and cancels the shared arrival event.
    for fleet in removed_fleets {
        crate::attack_groups::recalled(i, fleet, c, w)?;
    }
    for group in w
        .attack_groups
        .values_mut()
        .filter(|g| g.resolved_at.is_none())
    {
        if group.invited.remove(&player) {
            group.revision = group
                .revision
                .checked_add(1)
                .ok_or(GameError::NumericRange)?;
            c.affected_viewers.extend(group.invited.iter().copied());
            c.affected_viewers.extend(
                group
                    .members
                    .iter()
                    .filter_map(|id| w.fleets.get(id).map(|f| f.owner)),
            );
        }
    }
    for f in w
        .missiles
        .values_mut()
        .filter(|f| f.owner == player && f.status == MissileStatus::InFlight)
    {
        c.cancelled_events.push(ScheduledEvent::MissileImpact {
            flight: f.id,
            generation: f.generation,
        });
        f.generation = f.generation.checked_add(1).ok_or(GameError::NumericRange)?;
        f.status = MissileStatus::Destroyed;
        c.affected_viewers
            .insert(f.terms.intent.target.expected_owner);
    }
    for op in s
        .constructions
        .values()
        .filter(|op| op.owner == player && op.status == ConstructionStatus::Active)
    {
        let mut op = op.clone();
        c.cancelled_events.push(ScheduledEvent::ConstructionDue {
            operation: op.id,
            generation: op.generation,
        });
        op.status = ConstructionStatus::BodyAbandoned;
        op.revision = op.revision.checked_add(1).ok_or(GameError::NumericRange)?;
        c.constructions.push(op);
    }
    for op in s
        .manufacturing_batches
        .values()
        .filter(|op| op.owner == player && op.status == ManufacturingStatus::Active)
    {
        let mut op = op.clone();
        c.cancelled_events.push(ScheduledEvent::ManufacturingDue {
            operation: op.id,
            generation: op.generation,
            expected_prefix: op.completed_prefix,
        });
        op.status = ManufacturingStatus::BodyAbandoned;
        op.revision = op.revision.checked_add(1).ok_or(GameError::NumericRange)?;
        c.manufacturing_batches.push(op);
    }
    for op in s
        .research_operations
        .values()
        .filter(|op| op.owner == player && op.status == ResearchStatus::Active)
    {
        let mut op = op.clone();
        c.cancelled_events.push(ScheduledEvent::ResearchDue {
            operation: op.id,
            generation: op.generation,
        });
        op.status = ResearchStatus::Cancelled;
        op.revision = op.revision.checked_add(1).ok_or(GameError::NumericRange)?;
        c.research_operations.push(op);
    }
    let mut research = s
        .research
        .get(&player)
        .ok_or_else(|| invariant("missing deletion research"))?
        .clone();
    research.levels.values_mut().for_each(|level| *level = 0);
    research.revision = research
        .revision
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    c.research.push(research);
    w.lots.retain(|lot| lot.owner != player);
    w.colonies.retain(|id, _| !bodies.contains(id));
    w.activity.retain(|id, _| !bodies.contains(id));
    let p = w
        .policies
        .get_mut(&player)
        .ok_or_else(|| invariant("missing removal policy"))?;
    p.lifecycle = PlayerLifecycle::Removed;
    p.revision = p.revision.checked_add(1).ok_or(GameError::NumericRange)?;
    c.affected_viewers.insert(player);
    audits.push(
        serde_json::json!({"kind":"EmpireRemoved", "player":player, "at":i.at, "bodies":bodies}),
    );
    Ok(())
}

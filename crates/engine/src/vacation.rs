//! Vacation is an explicit interval; rates, eligibility and deadlines derive from it.
use crate::{
    transition::{Fault, invariant},
    *,
};
use serde::{Deserialize, Serialize};

pub const VACATION_MINIMUM_MS: i64 = 172_800_000;

/// Boolean forms preserve historical journals. New entries always record an interval.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum VacationState {
    Legacy(bool),
    Active {
        entered_at: Timestamp,
        policy_hash: Hash,
    },
}
impl Default for VacationState {
    fn default() -> Self {
        Self::Legacy(false)
    }
}
impl VacationState {
    pub fn is_active(&self) -> bool {
        !matches!(self, Self::Legacy(false))
    }
    pub fn entered_at(&self) -> Option<Timestamp> {
        match self {
            Self::Active { entered_at, .. } => Some(*entered_at),
            _ => None,
        }
    }
    pub fn earliest_exit_at(&self) -> Result<Option<Timestamp>, GameError> {
        self.entered_at()
            .map(|at| {
                at.checked_add(VACATION_MINIMUM_MS)
                    .filter(|t| *t <= MAX_WIRE_MS)
                    .ok_or(GameError::NumericRange)
            })
            .transpose()
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum VacationBlockerKind {
    Fleet,
    Missile,
    Construction,
    Research,
    Manufacturing,
    HostedFleet,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VacationBlocker {
    pub kind: VacationBlockerKind,
    pub body: Option<BodyId>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VacationView {
    pub active: bool,
    pub entered_at: Option<Timestamp>,
    pub earliest_exit_at: Option<Timestamp>,
    pub blockers: Vec<VacationBlocker>,
}

pub fn vacation_view(s: &GameState, player: PlayerId) -> Result<VacationView, GameError> {
    let w = world_facts(s).map_err(|_| GameError::PolicyUnavailable)?;
    let policy = w
        .records
        .policies
        .get(&player)
        .filter(|_| w.covered_players.contains(&player))
        .ok_or(GameError::PolicyUnavailable)?;
    if !w.covered_vacation_players.contains(&player)
        || !s.coverage.owned_body_players.contains(&player)
        || !s.coverage.fleet_owners.contains(&player)
        || !s.coverage.research_slot_players.contains(&player)
    {
        return Err(GameError::PolicyUnavailable);
    }
    let mut blockers = vec![];
    for b in s.bodies.values().filter(|b| b.owner == player) {
        if !s.coverage.construction_bodies.contains(&b.id)
            || !s.coverage.manufacturing_bodies.contains(&b.id)
            || !s.coverage.production_bodies.contains(&b.id)
        {
            return Err(GameError::PolicyUnavailable);
        }
        for (kind, blocked) in [
            (
                VacationBlockerKind::Construction,
                s.constructions
                    .values()
                    .any(|op| op.body == b.id && op.status == ConstructionStatus::Active),
            ),
            (
                VacationBlockerKind::Manufacturing,
                s.manufacturing_batches
                    .values()
                    .any(|op| op.body == b.id && op.status == ManufacturingStatus::Active),
            ),
            (
                VacationBlockerKind::HostedFleet,
                w.records
                    .fleets
                    .values()
                    .any(|f| f.owner != player && held_at(f, b.id)),
            ),
        ] {
            if blocked {
                blockers.push(VacationBlocker {
                    kind,
                    body: Some(b.id),
                });
            }
        }
    }
    for (kind, blocked) in [
        (
            VacationBlockerKind::Fleet,
            w.records
                .fleets
                .values()
                .any(|f| f.owner == player && f.active()),
        ),
        (
            VacationBlockerKind::Missile,
            w.records
                .missiles
                .values()
                .any(|f| f.owner == player && f.status == MissileStatus::InFlight),
        ),
        (
            VacationBlockerKind::Research,
            s.research_operations
                .values()
                .any(|op| op.owner == player && op.status == ResearchStatus::Active),
        ),
    ] {
        if blocked {
            blockers.push(VacationBlocker { kind, body: None });
        }
    }
    Ok(VacationView {
        active: policy.vacation.is_active(),
        entered_at: policy.vacation.entered_at(),
        earliest_exit_at: policy.vacation.earliest_exit_at()?,
        blockers,
    })
}

pub(crate) fn change(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    w: &mut WorldRecords,
    c: &mut ChangeSet,
    enter: bool,
) -> Result<(), Fault> {
    let Actor::Player(player) = i.actor else {
        return Err(invariant("vacation actor"));
    };
    let view = vacation_view(s, player)?;
    if enter {
        if view.active {
            return Err(GameError::ActorVacation.into());
        }
        if !view.blockers.is_empty() {
            return Err(GameError::VacationBlocked.into());
        }
        i.at.checked_add(VACATION_MINIMUM_MS)
            .filter(|at| *at <= MAX_WIRE_MS)
            .ok_or(GameError::NumericRange)?;
    } else {
        if !view.active {
            return Err(GameError::InvalidInput.into());
        }
        if view.earliest_exit_at.is_some_and(|at| i.at < at) {
            return Err(GameError::VacationMinimum.into());
        }
    }
    for b in s.bodies.values().filter(|b| b.owner == player) {
        let mut b = b.clone();
        b.checkpoint = settle_production(s, &b, i.at, r)?;
        b.revision = b.revision.checked_add(1).ok_or(GameError::NumericRange)?;
        crate::missions::signal(w, b.id, i, ActivityCause::Vacation);
        c.bodies.push(b);
    }
    let p = w
        .policies
        .get_mut(&player)
        .ok_or(GameError::PolicyUnavailable)?;
    p.vacation = if enter {
        VacationState::Active {
            entered_at: i.at,
            policy_hash: p.policy_hash.clone(),
        }
    } else {
        VacationState::default()
    };
    p.revision = p.revision.checked_add(1).ok_or(GameError::NumericRange)?;
    if let Some(at) = p.next_deletion_check(i.at)? {
        crate::empire_deletion::schedule_empire_check(c, i, player, at);
    }
    c.affected_viewers.insert(player);
    Ok(())
}

/// Saved settings remain unchanged; callers derive the settings effective at the checkpoint.
pub fn effective_production_settings(
    s: &GameState,
    b: &Body,
) -> Result<ProductionSettings, InvariantError> {
    let saved = &s
        .production_settings
        .get(&b.id)
        .ok_or_else(|| InvariantError("missing production settings".into()))?
        .settings;
    if vacation_start(s, b)?.is_some_and(|at| at <= b.checkpoint.at) {
        Ok(ProductionSettings {
            metal_mine: 0,
            crystal_mine: 0,
            deuterium_synthesizer: 0,
            solar_plant: 0,
            fusion_reactor: 0,
            solar_satellite: 0,
        })
    } else {
        Ok(saved.clone())
    }
}
pub(crate) fn vacation_start(s: &GameState, b: &Body) -> Result<Option<Timestamp>, InvariantError> {
    let Some(w) = &s.world else {
        return Ok(None);
    };
    let p = w
        .records
        .policies
        .get(&b.owner)
        .ok_or_else(|| InvariantError("missing production policy".into()))?;
    Ok(p.vacation.entered_at())
}
pub(crate) fn vacation_rates(b: &Body, r: &Ruleset) -> Result<Resources, GameError> {
    let mut values = [0; 3];
    if b.kind != BodyKind::Moon {
        for (value, base) in values.iter_mut().zip(r.artifact.base_income) {
            *value = base
                .checked_mul(i64::from(r.speed))
                .and_then(|v| v.checked_mul(SCALE))
                .ok_or(GameError::NumericRange)?;
        }
    }
    Ok(Resources::from_values(values))
}
pub(crate) fn settle_vacation(
    b: &Body,
    at: Timestamp,
    r: &Ruleset,
) -> Result<ResourceCheckpoint, InvariantError> {
    crate::economy::settle_rates(b, at, vacation_rates(b, r)?, r)
}

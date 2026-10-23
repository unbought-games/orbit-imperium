//! G10 exact completed-value protection and separate human/contact activity.
use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Inactivity {
    Active,
    Inactive7,
    Inactive28,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "minutes")]
pub enum PublicActivity {
    Recent,
    Minutes(u32),
    None,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlayerLifecycle {
    Active,
    DeletionPending,
    DeletionDraining,
    Removed,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerPolicy {
    pub player: PlayerId,
    pub last_presence_at: Timestamp,
    pub vacation: bool,
    pub lifecycle: PlayerLifecycle,
    pub policy_hash: Hash,
    pub revision: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BodyActivity {
    pub body: BodyId,
    pub last_signal_at: Timestamp,
    pub cause: ActivityCause,
    pub input: InputId,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActivityCause {
    Foreground,
    Launch,
    Contact,
    Return,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PresenceCause {
    Login,
    BodyVisit,
    GameplayGesture,
    Logout,
    AccountVisit,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PresenceLink {
    pub presence: InputId,
    pub gameplay: InputId,
    pub player: PlayerId,
    pub body: Option<BodyId>,
    pub at: Timestamp,
}
fn age(before: Timestamp, at: Timestamp) -> Result<i64, InvariantError> {
    if before < 0 || at > MAX_WIRE_MS {
        return Err(InvariantError("invalid policy timestamp".into()));
    }
    at.checked_sub(before)
        .filter(|n| *n >= 0)
        .ok_or_else(|| InvariantError("future policy timestamp".into()))
}
pub fn inactivity(last: Timestamp, at: Timestamp) -> Result<Inactivity, InvariantError> {
    Ok(match age(last, at)? {
        0..604_800_000 => Inactivity::Active,
        604_800_000..2_419_200_000 => Inactivity::Inactive7,
        _ => Inactivity::Inactive28,
    })
}
pub fn public_activity(
    last: Option<Timestamp>,
    at: Timestamp,
) -> Result<PublicActivity, InvariantError> {
    Ok(match last.map(|last| age(last, at)).transpose()? {
        Some(0..900_000) => PublicActivity::Recent,
        Some(n @ 900_000..3_600_000) => PublicActivity::Minutes((n / 60_000) as u32),
        _ => PublicActivity::None,
    })
}
pub fn beginner_protected(
    a: i64,
    b: i64,
    a_inactive: bool,
    b_inactive: bool,
) -> Result<bool, InvariantError> {
    if a < 0 || b < 0 {
        return Err(InvariantError("negative completed asset valuation".into()));
    }
    let (low, high, inactive) = if a <= b {
        (a, b, a_inactive)
    } else {
        (b, a, b_inactive)
    };
    Ok(low < 5_000_000_000_000 && i128::from(high) > 5 * i128::from(low) && !inactive)
}
pub fn check_mission_eligibility(
    s: &GameState,
    actor: PlayerId,
    target: Option<PlayerId>,
    mission: Mission,
    at: Timestamp,
    r: &Ruleset,
) -> Result<(), GameError> {
    if !r.world()
        || !(matches!(
            mission,
            Mission::Transport | Mission::Harvest | Mission::Espionage
        ) || (mission == Mission::Attack && r.attacks())
            || (matches!(mission, Mission::Colonize | Mission::Deploy) && r.colonization()))
    {
        return Err(GameError::UnavailableContent);
    }
    let w = world_facts(s).map_err(|_| GameError::PolicyUnavailable)?;
    let p = w
        .records
        .policies
        .get(&actor)
        .filter(|_| w.covered_players.contains(&actor))
        .ok_or(GameError::PolicyUnavailable)?;
    if p.vacation {
        return Err(GameError::ActorVacation);
    }
    if matches!(
        p.lifecycle,
        PlayerLifecycle::DeletionDraining | PlayerLifecycle::Removed
    ) {
        return Err(GameError::ActorDraining);
    }
    if let Some(target) = target {
        if mission == Mission::Deploy && actor != target {
            return Err(GameError::NotOwned);
        }
        let t = w
            .records
            .policies
            .get(&target)
            .filter(|_| w.covered_players.contains(&target))
            .ok_or(GameError::PolicyUnavailable)?;
        if t.vacation {
            return Err(GameError::TargetVacation);
        }
        if t.lifecycle == PlayerLifecycle::Removed {
            return Err(GameError::NotFound);
        }
        if matches!(mission, Mission::Espionage | Mission::Attack) {
            if actor == target {
                return Err(GameError::InvalidInput);
            }
            let a = value_completed_assets(&w.records.lots, actor)
                .map_err(|_| GameError::PolicyUnavailable)?;
            let b = value_completed_assets(&w.records.lots, target)
                .map_err(|_| GameError::PolicyUnavailable)?;
            let ai = inactivity(p.last_presence_at, at)
                .map_err(|_| GameError::PolicyUnavailable)?
                != Inactivity::Active;
            let bi = inactivity(t.last_presence_at, at)
                .map_err(|_| GameError::PolicyUnavailable)?
                != Inactivity::Active;
            if beginner_protected(a, b, ai, bi).map_err(|_| GameError::PolicyUnavailable)? {
                return Err(GameError::BeginnerProtected);
            }
        }
    } else if !matches!(mission, Mission::Harvest | Mission::Colonize) {
        return Err(GameError::InvalidInput);
    }
    Ok(())
}

/// Private qualifying-contact snapshot. The existing world evidence journal owns retention.
/// No runtime counter, warning or sanction consumes this record.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttackEvidence {
    pub kind: String,
    pub schema: u32,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub battle_or_destruction_id: InputId,
    pub attacker: PlayerId,
    pub fleet: FleetId,
    pub target_body: BodyId,
    pub target_owner: PlayerId,
    pub at_ms: Timestamp,
    pub contact_order: [i64; 2],
    pub outcome: BattleOutcome,
    pub target_presence_class: Inactivity,
    pub policy_hash: Hash,
    pub report: ReportId,
    pub debris_field: Option<OperationId>,
}

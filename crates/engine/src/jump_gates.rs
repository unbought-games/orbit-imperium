//! Instant, atomic transfers. Gate use is a committed fact; readiness is derived.
use crate::transition::{Fault, invariant};
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const JUMP_GATE_PROFILE: &str = "jump-gates-v1";
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JumpIntent {
    pub source: BodyId,
    pub destination: BodyId,
    pub ships: Vec<ManifestStack>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GateUse {
    pub body: BodyId,
    pub input: InputId,
    pub at: Timestamp,
    pub cooldown_ms: DurationMs,
    pub profile_hash: Hash,
}
impl GateUse {
    pub fn ready_at(&self) -> Result<Timestamp, GameError> {
        deadline(self.at, self.cooldown_ms)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct JumpGateStatus {
    pub ready_at: Timestamp,
    pub cooldown_ms: DurationMs,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct JumpQuote {
    pub intent: JumpIntent,
    pub cooldown_ms: DurationMs,
    pub profile_hash: Hash,
    pub terms_hash: Hash,
}
pub fn jump_gates_enabled(r: &Ruleset) -> bool {
    r.artifact
        .world
        .as_ref()
        .and_then(|w| w.jump_gates.as_deref())
        == Some(JUMP_GATE_PROFILE)
}
pub fn jump_cooldown(r: &Ruleset) -> Result<DurationMs, GameError> {
    let speed = i64::from(r.speed);
    if !(1..=100).contains(&speed) {
        return Err(GameError::NumericRange);
    }
    Ok((3_600_000 + speed - 1) / speed)
}
pub fn jump_gate_status(
    s: &GameState,
    body: BodyId,
    r: &Ruleset,
) -> Result<JumpGateStatus, GameError> {
    let facts = world_facts(s).map_err(|_| GameError::PolicyUnavailable)?;
    if !facts.covered_gate_bodies.contains(&body) {
        return Err(GameError::PolicyUnavailable);
    }
    Ok(JumpGateStatus {
        ready_at: facts
            .records
            .gate_uses
            .get(&body)
            .map(GateUse::ready_at)
            .transpose()?
            .unwrap_or(0),
        cooldown_ms: jump_cooldown(r)?,
    })
}
pub fn quote_jump(
    s: &GameState,
    owner: PlayerId,
    intent: &JumpIntent,
    at: Timestamp,
    r: &Ruleset,
) -> Result<JumpQuote, GameError> {
    if !jump_gates_enabled(r) {
        return Err(GameError::UnavailableContent);
    }
    if intent.source == intent.destination || intent.ships.is_empty() {
        return Err(GameError::InvalidInput);
    }
    let w = world_facts(s).map_err(|_| GameError::PolicyUnavailable)?;
    let policy = w
        .records
        .policies
        .get(&owner)
        .ok_or(GameError::PolicyUnavailable)?;
    if policy.vacation.is_active() {
        return Err(GameError::ActorVacation);
    }
    if policy.deletion_pending(at)
        || matches!(
            policy.lifecycle,
            PlayerLifecycle::DeletionDraining | PlayerLifecycle::Removed
        )
    {
        return Err(GameError::ActorDraining);
    }
    for id in [intent.source, intent.destination] {
        if !s.coverage.owned_body_players.contains(&owner)
            || !s.coverage.inventory_owners.contains(&(id, owner))
        {
            // Complete ownership coverage also proves a foreign or removed ID is unavailable.
            if !s.bodies.get(&id).is_some_and(|b| b.owner == owner)
                && s.coverage.owned_body_players.contains(&owner)
            {
                return Err(GameError::NotOwned);
            }
            return Err(GameError::PolicyUnavailable);
        }
        let b = s.bodies.get(&id).ok_or(GameError::NotFound)?;
        if b.owner != owner {
            return Err(GameError::NotOwned);
        }
        if b.kind != BodyKind::Moon {
            return Err(GameError::BodyKindNotAllowed);
        }
        if b.levels.get(&Building::JumpGate).copied().unwrap_or(0) == 0 {
            return Err(GameError::PrerequisiteMissing);
        }
        if at < jump_gate_status(s, id, r)?.ready_at {
            return Err(GameError::GateCooling);
        }
    }
    let available =
        mobile_inventory(s, intent.source, owner, r).map_err(|_| GameError::PolicyUnavailable)?;
    let mut seen = BTreeSet::new();
    for ship in &intent.ships {
        if ship.owner != owner || ship.count <= 0 || !seen.insert(ship.ship_type) {
            return Err(GameError::InvalidInput);
        }
        if !r
            .artifact
            .catalog
            .iter()
            .any(|e| e.key == CatalogKey::Ship(ship.ship_type) && e.enabled && e.mobile)
        {
            return Err(GameError::UnavailableContent);
        }
        if available
            .iter()
            .find(|s| s.ship_type == ship.ship_type)
            .map_or(0, |s| s.count)
            < ship.count
        {
            return Err(GameError::InsufficientShips);
        }
        let dest = s
            .inventories
            .iter()
            .find(|s| {
                s.body == intent.destination
                    && s.owner == owner
                    && s.item == ManufacturedItem::Ship(ship.ship_type)
            })
            .map_or(0, |s| s.count);
        dest.checked_add(ship.count)
            .ok_or(GameError::NumericRange)?;
    }
    let cooldown_ms = jump_cooldown(r)?;
    deadline(at, cooldown_ms)?;
    let intent = intent.clone();
    let terms_hash =
        hash(&serde_json::json!({"intent":intent,"cooldown_ms":cooldown_ms,"rules":r.hash}));
    Ok(JumpQuote {
        intent,
        cooldown_ms,
        profile_hash: r.hash.clone(),
        terms_hash,
    })
}
pub(crate) fn jump(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    intent: &JumpIntent,
    expected: &Hash,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    let Actor::Player(owner) = i.actor else {
        return Err(invariant("jump actor"));
    };
    let quote = quote_jump(s, owner, intent, i.at, r)?;
    if &quote.terms_hash != expected {
        return Err(GameError::QuoteChanged.into());
    }
    for ship in &quote.intent.ships {
        crate::missions::inventory(c, s, intent.source, owner, ship.ship_type, -ship.count)?;
        crate::missions::inventory(c, s, intent.destination, owner, ship.ship_type, ship.count)?;
        let lots = take_asset_lots(
            &mut w.lots,
            owner,
            CatalogKey::Ship(ship.ship_type),
            &AssetLocation::Body(intent.source),
            ship.count,
            Some(AssetLocation::Body(intent.destination)),
        )?;
        w.lots.extend(lots);
    }
    for body in [intent.source, intent.destination] {
        w.gate_uses.insert(
            body,
            GateUse {
                body,
                input: i.id,
                at: i.at,
                cooldown_ms: quote.cooldown_ms,
                profile_hash: r.hash.clone(),
            },
        );
    }
    c.affected_viewers.insert(owner);
    Ok(())
}

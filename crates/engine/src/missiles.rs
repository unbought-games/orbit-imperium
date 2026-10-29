//! Silo inventory and one-way missile commitments; never ordinary battle units.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
mod resolution;
pub(crate) use resolution::resolve;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissileRules {
    pub version: String,
    pub slots_per_level: i64,
    pub abm_weight: i64,
    pub ipm_weight: i64,
    pub range_factor: i64,
    pub range_offset: i64,
    pub base_seconds: i64,
    pub seconds_per_system: i64,
    pub base_attack: i64,
}
impl MissileRules {
    pub fn validate(&self) -> Result<(), RulesError> {
        if self.version != "oi-classic-missile-v1" {
            return Err(RulesError::Unsupported);
        }
        if [
            self.slots_per_level,
            self.abm_weight,
            self.ipm_weight,
            self.range_factor,
            self.base_seconds,
            self.seconds_per_system,
            self.base_attack,
        ]
        .iter()
        .any(|v| *v <= 0 || *v > 1_000_000)
            || !(-1_000_000..=1_000_000).contains(&self.range_offset)
        {
            return Err(RulesError::Range);
        }
        Ok(())
    }
    pub fn weight(&self, item: MissileId) -> i64 {
        match item {
            MissileId::AntiBallisticMissile => self.abm_weight,
            MissileId::InterplanetaryMissile => self.ipm_weight,
        }
    }
}
pub fn missile_rules(r: &Ruleset) -> Option<&MissileRules> {
    r.artifact.world.as_ref()?.missiles.as_ref()
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SiloCapacity {
    #[serde(with = "decimal_wire")]
    pub occupied: i64,
    #[serde(with = "decimal_wire")]
    pub reserved: i64,
    #[serde(with = "decimal_wire")]
    pub total: i64,
}
pub fn silo_capacity(
    s: &GameState,
    b: &Body,
    r: &MissileRules,
) -> Result<SiloCapacity, InvariantError> {
    if !s.coverage.inventory_owners.contains(&(b.id, b.owner))
        || !s.coverage.manufacturing_bodies.contains(&b.id)
    {
        return Err(InvariantError("uncovered silo inventory/queue".into()));
    }
    let weighted = |values: Vec<(MissileId, i64)>| -> Result<i64, InvariantError> {
        values.into_iter().try_fold(0i64, |a, (m, n)| {
            n.checked_mul(r.weight(m))
                .filter(|v| *v >= 0)
                .and_then(|v| a.checked_add(v))
                .ok_or_else(|| InvariantError("silo capacity overflow".into()))
        })
    };
    let occupied = weighted(
        s.inventories
            .iter()
            .filter(|x| x.body == b.id && x.owner == b.owner)
            .filter_map(|x| {
                if let ManufacturedItem::Missile(m) = x.item {
                    Some((m, x.count))
                } else {
                    None
                }
            })
            .collect(),
    )?;
    let reserved = weighted(
        s.manufacturing_batches
            .values()
            .filter(|x| x.body == b.id && x.status == ManufacturingStatus::Active)
            .filter_map(|x| {
                if let ManufacturedItem::Missile(m) = x.item {
                    Some((m, x.quantity - x.completed_prefix))
                } else {
                    None
                }
            })
            .collect(),
    )?;
    let total = i64::from(*b.levels.get(&Building::MissileSilo).unwrap_or(&0))
        .checked_mul(r.slots_per_level)
        .ok_or_else(|| InvariantError("silo size overflow".into()))?;
    occupied
        .checked_add(reserved)
        .ok_or_else(|| InvariantError("silo usage overflow".into()))?;
    Ok(SiloCapacity {
        occupied,
        reserved,
        total,
    })
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissileTarget {
    pub id: BodyId,
    pub expected_kind: BodyKind,
    pub expected_owner: PlayerId,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissileIntent {
    pub origin: BodyId,
    pub target: MissileTarget,
    #[serde(with = "decimal_wire")]
    pub count: i64,
    pub primary: Option<DefenseId>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MissileTerms {
    pub intent: MissileIntent,
    pub source_coordinates: Coordinates,
    pub target_coordinates: Coordinates,
    pub interceptor_body: BodyId,
    pub distance: i64,
    pub range: i64,
    pub duration_ms: i64,
    pub weapons: u32,
    pub speed: i32,
    pub rules: MissileRules,
    pub profile_hash: Hash,
    pub terms_hash: Hash,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MissileStatus {
    InFlight,
    Impacted,
    NoTarget,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MissileFlight {
    pub id: OperationId,
    pub owner: PlayerId,
    pub terms: MissileTerms,
    pub launched_at: Timestamp,
    pub due_at: Timestamp,
    pub generation: i64,
    pub status: MissileStatus,
}
/// The caller supplies the authoritative parent relationship. Coordinates alone
/// must never create a parent binding; replacement moons cannot inherit a flight.
pub fn missile_interceptor_body(target: &Body, parent: Option<&Body>) -> Result<BodyId, GameError> {
    match target.kind {
        BodyKind::Planet => Ok(target.id),
        BodyKind::Moon => parent
            .filter(|p| {
                p.kind == BodyKind::Planet
                    && p.owner == target.owner
                    && p.coordinates == target.coordinates
                    && p.id != target.id
            })
            .map(|p| p.id)
            .ok_or(GameError::NotFound),
    }
}
pub fn quote_missiles(
    s: &GameState,
    actor: PlayerId,
    intent: &MissileIntent,
    at: Timestamp,
    r: &Ruleset,
) -> Result<MissileTerms, GameError> {
    let rule = missile_rules(r).ok_or(GameError::UnavailableContent)?;
    let b = s
        .bodies
        .get(&intent.origin)
        .filter(|b| b.owner == actor)
        .ok_or(GameError::NotOwned)?;
    if b.kind != BodyKind::Planet {
        return Err(GameError::InvalidInput);
    }
    if !r
        .artifact
        .catalog
        .iter()
        .any(|e| e.key == CatalogKey::Missile(MissileId::InterplanetaryMissile) && e.enabled)
    {
        return Err(GameError::UnavailableContent);
    }
    if b.levels.get(&Building::MissileSilo).copied().unwrap_or(0) < 4 {
        return Err(GameError::PrerequisiteMissing);
    }
    if intent.count <= 0 {
        return Err(GameError::InvalidInput);
    }
    if !s.coverage.inventory_owners.contains(&(b.id, actor)) {
        return Err(GameError::PolicyUnavailable);
    }
    let available = s
        .inventories
        .iter()
        .find(|x| {
            x.body == b.id
                && x.owner == actor
                && x.item == ManufacturedItem::Missile(MissileId::InterplanetaryMissile)
        })
        .map_or(0, |x| x.count);
    if available < intent.count {
        return Err(GameError::InsufficientMissiles);
    }
    let target = s
        .bodies
        .get(&intent.target.id)
        .filter(|t| {
            t.kind == intent.target.expected_kind && t.owner == intent.target.expected_owner
        })
        .ok_or(GameError::NotFound)?;
    // Lunar ownership/lifecycle has not shipped. Keep the runtime gate explicit.
    if target.kind != BodyKind::Planet {
        return Err(GameError::UnavailableContent);
    }
    check_missile_eligibility(s, actor, target.owner, at, r)?;
    let research = s.research.get(&actor).ok_or(GameError::PolicyUnavailable)?;
    let impulse = *research
        .levels
        .get(&ResearchId::ImpulseDrive)
        .ok_or(GameError::PolicyUnavailable)?;
    let weapons = *research
        .levels
        .get(&ResearchId::WeaponsTechnology)
        .ok_or(GameError::PolicyUnavailable)?;
    let range = i64::from(impulse)
        .checked_mul(rule.range_factor)
        .and_then(|v| v.checked_add(rule.range_offset))
        .ok_or(GameError::NumericRange)?;
    let distance = i64::from(b.coordinates.system.abs_diff(target.coordinates.system));
    if impulse == 0 || b.coordinates.galaxy != target.coordinates.galaxy || distance > range {
        return Err(GameError::OutOfRange);
    }
    let numerator = rule
        .seconds_per_system
        .checked_mul(distance)
        .and_then(|v| v.checked_add(rule.base_seconds))
        .and_then(|v| v.checked_mul(1000))
        .ok_or(GameError::NumericRange)?;
    let duration_ms =
        (numerator / i64::from(r.speed) + i64::from(numerator % i64::from(r.speed) != 0)).max(1);
    deadline(at, duration_ms)?;
    let mut terms = MissileTerms {
        intent: intent.clone(),
        source_coordinates: b.coordinates,
        target_coordinates: target.coordinates,
        interceptor_body: missile_interceptor_body(target, None)?,
        distance,
        range,
        duration_ms,
        weapons,
        speed: r.speed,
        rules: rule.clone(),
        profile_hash: r.hash.clone(),
        terms_hash: Hash(String::new()),
    };
    terms.terms_hash = hash(&serde_json::json!({"protocol":4,"missile_terms":terms}));
    Ok(terms)
}
/// Pure pooled-power allocation. Surviving units never retain partial damage.
pub fn missile_damage(
    count: i64,
    technology: [u32; 2],
    primary: Option<DefenseId>,
    defenses: &BTreeMap<DefenseId, i64>,
    combat: &CombatRules,
    rule: &MissileRules,
    rng: &mut RandomStream,
) -> Result<BTreeMap<DefenseId, i64>, InvariantError> {
    let [weapons, armour] = technology;
    let bad = || InvariantError("invalid missile damage arithmetic".into());
    if count < 0 || defenses.values().any(|n| *n < 0) {
        return Err(bad());
    }
    if count == 0 {
        return Ok(BTreeMap::new());
    }
    let mut power = i128::from(count)
        .checked_mul(i128::from(rule.base_attack))
        .and_then(|v| v.checked_mul(i128::from(weapons) + 10))
        .and_then(|v| v.checked_mul(10))
        .ok_or_else(bad)?;
    let mut order: Vec<_> = defenses
        .iter()
        .filter(|(_, n)| **n > 0)
        .map(|(d, _)| *d)
        .collect();
    order.sort_by_key(|d| format!("{d:?}"));
    let primary = primary.filter(|p| order.contains(p));
    order.retain(|d| Some(*d) != primary);
    for i in (1..order.len()).rev() {
        let j = rng.uniform_u64((i + 1) as u64)? as usize;
        order.swap(i, j);
    }
    if let Some(p) = primary {
        order.insert(0, p);
    }
    let mut destroyed = BTreeMap::new();
    for d in order {
        let unit = combat
            .units
            .iter()
            .find(|u| u.item == ManufacturedItem::Defense(d))
            .ok_or_else(bad)?;
        let hull = (i128::from(unit.cost[0]) + i128::from(unit.cost[1]))
            .checked_mul(i128::from(armour) + 10)
            .filter(|v| *v > 0)
            .ok_or_else(bad)?;
        let n = (power / hull).min(i128::from(defenses[&d]));
        if n > 0 {
            destroyed.insert(d, i64::try_from(n).map_err(|_| bad())?);
            power -= n * hull;
        }
    }
    Ok(destroyed)
}

//! Shared G08 multi-origin deterministic combat; no mission, storage or plunder policy.
use crate::*;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CombatUnitRule {
    pub item: ManufacturedItem,
    pub cost: [i64; 3],
    pub attack_hundredths: u64,
    pub shield_hundredths: u64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RapidFire {
    pub shooter: ManufacturedItem,
    pub target: ManufacturedItem,
    pub factor: u64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CombatRules {
    pub id: String,
    pub max_rounds: u32,
    pub technology_bonus: [u64; 2],
    pub base_hull_fraction: [u64; 2],
    pub shield_step: [u64; 2],
    pub bounce_threshold: [u64; 2],
    pub explosion_hull_threshold: [u64; 2],
    pub explosion_inclusive: bool,
    pub defense_recovery_probability: [u64; 2],
    pub ship_debris_bps: u32,
    #[serde(default)]
    pub deuterium_in_debris: bool,
    pub units: Vec<CombatUnitRule>,
    pub rapid_fire: Vec<RapidFire>,
    pub strategy: String,
}
impl CombatRules {
    pub fn selected() -> Self {
        use DefenseId::*;
        use ManufacturedItem::{Defense as D, Ship as S};
        use ShipType::*;
        Self{id:"oi-classic-combat-v1".into(),max_rounds:6,technology_bonus:[1,10],base_hull_fraction:[1,10],shield_step:[1,100],bounce_threshold:[1,100],explosion_hull_threshold:[7,10],explosion_inclusive:true,defense_recovery_probability:[7,10],ship_debris_bps:3000,deuterium_in_debris:false,strategy:"WholeMaxShieldPercentWithRawOverflowV1/LostHullFractionV1/NonBouncingHitV1/IndependentBernoulliV1/EncounterTimeV1/UniformRoundStartIndividualsV1/RoundEndV1/ResetAfterEncounterV1".into(),units:vec![
            CombatUnitRule{item:S(SmallCargo),cost:[2000,2000,0],attack_hundredths:500,shield_hundredths:1000},
            CombatUnitRule{item:S(LightFighter),cost:[3000,1000,0],attack_hundredths:5000,shield_hundredths:1000},
            CombatUnitRule{item:S(Recycler),cost:[10000,6000,2000],attack_hundredths:100,shield_hundredths:1000},
            CombatUnitRule{item:S(EspionageProbe),cost:[0,1000,0],attack_hundredths:1,shield_hundredths:1},
            CombatUnitRule{item:D(RocketLauncher),cost:[2000,0,0],attack_hundredths:8000,shield_hundredths:2000},
            CombatUnitRule{item:D(SmallShieldDome),cost:[10000,10000,0],attack_hundredths:100,shield_hundredths:200000},
        ],rapid_fire:[SmallCargo,LightFighter,Recycler].into_iter().map(|s|RapidFire{shooter:S(s),target:S(EspionageProbe),factor:5}).collect()}
    }
    pub(crate) fn supported_policy(&self) -> bool {
        self.id == "oi-classic-combat-v1" && self.strategy == Self::selected().strategy
    }
    pub fn validate(&self) -> Result<(), InvariantError> {
        if !self.supported_policy() || self.max_rounds == 0 || self.ship_debris_bps > 10000 {
            return Err(bad("invalid combat policy"));
        }
        for [a, b] in [
            self.technology_bonus,
            self.base_hull_fraction,
            self.shield_step,
            self.bounce_threshold,
            self.explosion_hull_threshold,
            self.defense_recovery_probability,
        ] {
            if b == 0 || a > b {
                return Err(bad("invalid combat rational"));
            }
        }
        if self.shield_step[0] == 0 {
            return Err(bad("zero shield quantum"));
        }
        let mut keys = std::collections::BTreeSet::new();
        for u in &self.units {
            if !keys.insert(u.item)
                || u.cost.iter().any(|n| *n < 0)
                || matches!(u.item, ManufacturedItem::Missile(_))
            {
                return Err(bad("invalid combat catalog"));
            }
            // Stats and shield quanta are affine in technology level. Exact
            // values at 0 and 1 establish precision for every integer level;
            // the upper endpoint also checks the supported range for overflow.
            for level in [0, 1, u32::MAX] {
                combat_unit_stats(u, [level; 3], self)?;
            }
        }
        let mut pairs = std::collections::BTreeSet::new();
        for rf in &self.rapid_fire {
            if rf.factor == 0
                || !keys.contains(&rf.shooter)
                || !keys.contains(&rf.target)
                || !pairs.insert((rf.shooter, rf.target))
            {
                return Err(bad("invalid RF matrix"));
            }
        }
        Ok(())
    }
}
fn bad(s: &str) -> InvariantError {
    InvariantError(s.into())
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum BattleSide {
    Attacker,
    Defender,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum BattleOrigin {
    Stationed(BodyId),
    Fleet(FleetId),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BattleParticipant {
    pub owner: PlayerId,
    pub origin: BattleOrigin,
    pub side: BattleSide,
    pub technology: [u32; 3],
    pub units: Vec<(ManufacturedItem, i64)>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BattleInput {
    pub encounter_id: InputId,
    pub at: Timestamp,
    pub target: BodyId,
    pub participants: Vec<BattleParticipant>,
    pub rules_hash: Hash,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BattleOutcome {
    AttackerVictory,
    DefenderVictory,
    MutualDestruction,
    Draw,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BattleCounts {
    pub owner: PlayerId,
    pub origin: BattleOrigin,
    pub side: BattleSide,
    pub units: Vec<(ManufacturedItem, i64)>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BattleRound {
    pub number: u32,
    pub start: Vec<BattleCounts>,
    pub end: Vec<BattleCounts>,
    pub fire: Vec<BattleFire>,
}
/// Historical firing observations; totals are derived from these per-origin facts.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BattleFire {
    pub owner: PlayerId,
    pub origin: BattleOrigin,
    pub side: BattleSide,
    pub shots: String,
    pub raw_attack_ticks: String,
    pub shield_removed_ticks: String,
    pub hull_removed_ticks: String,
    pub explosions: String,
}
#[derive(Default)]
struct FireCounters {
    shots: BigUint,
    raw: BigUint,
    shields: BigUint,
    hulls: BigUint,
    explosions: BigUint,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BattleDamage {
    pub owner: PlayerId,
    pub origin: BattleOrigin,
    pub item: ManufacturedItem,
    pub instance: String,
    pub hull_ticks: String,
    pub shield_ticks: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BattleResult {
    pub damage: Vec<BattleDamage>,
    pub outcome: BattleOutcome,
    pub participants: Vec<BattleParticipant>,
    pub rounds: Vec<BattleRound>,
    pub survivors: Vec<BattleCounts>,
    pub destroyed: Vec<BattleCounts>,
    pub rng_cursor: (u64, u8),
}
struct Unit {
    instance: usize,
    participant: usize,
    item: ManufacturedItem,
    attack: u128,
    shield_max: u128,
    shield: u128,
    hull_max: u128,
    hull: u128,
}
fn scaled(base: u128, level: u32, r: &CombatRules) -> Result<u128, InvariantError> {
    let [a, b] = r.technology_bonus;
    let n = base
        .checked_mul(u128::from(b) + u128::from(a) * u128::from(level))
        .ok_or_else(|| bad("stat overflow"))?;
    if b == 0 || !n.is_multiple_of(u128::from(b)) {
        return Err(bad("unsupported stat precision"));
    }
    Ok(n / u128::from(b))
}
/// Attack, shield and hull in 1/100,000 units, shared by combat and presentation.
pub fn combat_unit_stats(
    u: &CombatUnitRule,
    tech: [u32; 3],
    r: &CombatRules,
) -> Result<(u128, u128, u128), InvariantError> {
    let a = scaled(u128::from(u.attack_hundredths) * 1000, tech[0], r)?;
    let s = scaled(u128::from(u.shield_hundredths) * 1000, tech[1], r)?;
    let cost = u.cost[0]
        .checked_add(u.cost[1])
        .filter(|n| *n > 0)
        .ok_or_else(|| bad("invalid hull basis"))? as u128;
    let n = cost
        .checked_mul(100000)
        .and_then(|n| n.checked_mul(u128::from(r.base_hull_fraction[0])))
        .ok_or_else(|| bad("hull overflow"))?;
    let d = u128::from(r.base_hull_fraction[1]);
    if d == 0 || !n.is_multiple_of(d) {
        return Err(bad("unsupported hull precision"));
    }
    let h = scaled(n / d, tech[2], r)?;
    let step = s
        .checked_mul(u128::from(r.shield_step[0]))
        .ok_or_else(|| bad("shield overflow"))?;
    if r.shield_step[1] == 0
        || !step.is_multiple_of(u128::from(r.shield_step[1]))
        || step == 0
        || h == 0
    {
        return Err(bad("unsupported shield precision"));
    }
    Ok((a, s, h))
}
#[derive(Debug)]
pub struct CombatHit {
    pub shield_removed: u128,
    pub hull_removed: u128,
    pub bounced: bool,
    pub explosion: bool,
}
pub fn apply_combat_hit(
    attack: u128,
    shield_max: u128,
    shield: u128,
    hull: u128,
    hull_max: u128,
    r: &CombatRules,
) -> Result<CombatHit, InvariantError> {
    if shield > shield_max || hull > hull_max || hull_max == 0 {
        return Err(bad("invalid transient damage"));
    }
    let mut out = CombatHit {
        shield_removed: 0,
        hull_removed: 0,
        bounced: false,
        explosion: false,
    };
    if hull == 0 {
        return Ok(out);
    }
    let [a, b] = r.bounce_threshold;
    if shield > 0 && BigUint::from(attack) * b < BigUint::from(shield_max) * a {
        out.bounced = true;
        return Ok(out);
    }
    if attack < shield {
        let [a, b] = r.shield_step;
        let quantum = shield_max
            .checked_mul(u128::from(a))
            .ok_or_else(|| bad("shield overflow"))?
            / u128::from(b);
        if quantum == 0 {
            return Err(bad("zero quantum"));
        }
        out.shield_removed = attack / quantum * quantum;
    } else {
        out.shield_removed = shield;
        out.hull_removed = (attack - shield).min(hull);
    }
    let left = hull - out.hull_removed;
    let [a, b] = r.explosion_hull_threshold;
    let lhs = BigUint::from(left) * b;
    let rhs = BigUint::from(hull_max) * a;
    out.explosion = left > 0 && (lhs < rhs || (r.explosion_inclusive && lhs == rhs));
    Ok(out)
}
fn counts(units: &[Unit], p: &[BattleParticipant]) -> Vec<BattleCounts> {
    p.iter()
        .enumerate()
        .map(|(index, p)| {
            let mut items = BTreeMap::new();
            for u in units
                .iter()
                .filter(|u| u.participant == index && u.hull > 0)
            {
                *items.entry(u.item).or_insert(0i64) += 1;
            }
            BattleCounts {
                owner: p.owner,
                origin: p.origin,
                side: p.side,
                units: items.into_iter().collect(),
            }
        })
        .collect()
}
fn add_total(sum: &mut BigUint, n: impl Into<BigUint>) -> Result<(), InvariantError> {
    *sum += n.into();
    if sum.bits() > 256 {
        Err(bad("combat total overflow"))
    } else {
        Ok(())
    }
}
pub fn resolve_battle(
    input: &BattleInput,
    r: &CombatRules,
    rng: &mut RandomStream,
) -> Result<BattleResult, InvariantError> {
    r.validate()?;
    let mut p = input.participants.clone();
    p.sort_by_key(|p| (p.side, p.owner, p.origin));
    let mut identities = std::collections::BTreeSet::new();
    let mut membership = std::collections::BTreeSet::new();
    let mut units = vec![];
    for (index, participant) in p.iter_mut().enumerate() {
        if !identities.insert((participant.side, participant.owner, participant.origin))
            || !membership.insert(participant.origin)
        {
            return Err(bad("duplicate combat origin"));
        }
        participant.units.sort_by_key(|(item, _)| match item {
            ManufacturedItem::Ship(k) => format!("{k:?}"),
            ManufacturedItem::Defense(k) => format!("{k:?}"),
            ManufacturedItem::Missile(k) => format!("{k:?}"),
        });
        let mut keys = std::collections::BTreeSet::new();
        for &(item, n) in &participant.units {
            if n <= 0
                || !keys.insert(item)
                || (participant.side == BattleSide::Attacker
                    && (!matches!(item, ManufacturedItem::Ship(_))
                        || item == ManufacturedItem::Ship(ShipType::SolarSatellite)))
            {
                return Err(bad("invalid combat stack"));
            }
            let rule = r
                .units
                .iter()
                .find(|u| u.item == item)
                .ok_or_else(|| bad("unsupported combat unit"))?;
            let (a, s, h) = combat_unit_stats(rule, participant.technology, r)?;
            let n = usize::try_from(n).map_err(|_| bad("combat instance range"))?;
            units
                .try_reserve(n)
                .map_err(|_| bad("combat allocation unavailable"))?;
            for instance in 0..n {
                units.push(Unit {
                    instance,
                    participant: index,
                    item,
                    attack: a,
                    shield_max: s,
                    shield: s,
                    hull_max: h,
                    hull: h,
                });
            }
        }
    }
    let mut tentative = rng.clone();
    let mut rounds = vec![];
    for number in 1..=r.max_rounds {
        let attackers: Vec<_> = units
            .iter()
            .enumerate()
            .filter(|(_, u)| p[u.participant].side == BattleSide::Attacker)
            .map(|(i, _)| i)
            .collect();
        let defenders: Vec<_> = units
            .iter()
            .enumerate()
            .filter(|(_, u)| p[u.participant].side == BattleSide::Defender)
            .map(|(i, _)| i)
            .collect();
        if attackers.is_empty() || defenders.is_empty() {
            break;
        }
        for u in &mut units {
            u.shield = u.shield_max;
        }
        let start = counts(&units, &p);
        let mut fire: Vec<FireCounters> = p.iter().map(|_| FireCounters::default()).collect();
        for shooter in 0..units.len() {
            let targets = if p[units[shooter].participant].side == BattleSide::Attacker {
                &defenders
            } else {
                &attackers
            };
            loop {
                let idx = tentative.uniform_u64(targets.len() as u64)? as usize;
                let target = targets[idx];
                let attack = units[shooter].attack;
                let shooter_item = units[shooter].item;
                let counters = &mut fire[units[shooter].participant];
                let u = &mut units[target];
                add_total(&mut counters.shots, 1u32)?;
                add_total(&mut counters.raw, attack)?;
                let hit = apply_combat_hit(attack, u.shield_max, u.shield, u.hull, u.hull_max, r)?;
                u.shield -= hit.shield_removed;
                u.hull -= hit.hull_removed;
                add_total(&mut counters.shields, hit.shield_removed)?;
                add_total(&mut counters.hulls, hit.hull_removed)?;
                if hit.explosion
                    && tentative.bernoulli(
                        &BigUint::from(u.hull_max - u.hull),
                        &BigUint::from(u.hull_max),
                    )?
                {
                    u.hull = 0;
                    add_total(&mut counters.explosions, 1u32)?;
                }
                let rf = r
                    .rapid_fire
                    .iter()
                    .find(|rf| rf.shooter == shooter_item && rf.target == u.item)
                    .map_or(1, |r| r.factor);
                if rf == 1 || tentative.uniform_u64(rf)? == 0 {
                    break;
                }
            }
        }
        units.retain(|u| u.hull > 0);
        let end = counts(&units, &p);
        rounds.push(BattleRound {
            number,
            start,
            end,
            fire: p
                .iter()
                .zip(fire)
                .map(|(participant, counters)| BattleFire {
                    owner: participant.owner,
                    origin: participant.origin,
                    side: participant.side,
                    shots: counters.shots.to_string(),
                    raw_attack_ticks: counters.raw.to_string(),
                    shield_removed_ticks: counters.shields.to_string(),
                    hull_removed_ticks: counters.hulls.to_string(),
                    explosions: counters.explosions.to_string(),
                })
                .collect(),
        });
    }
    let survivors = counts(&units, &p);
    let destroyed = p
        .iter()
        .zip(&survivors)
        .map(|(p, s)| BattleCounts {
            owner: p.owner,
            origin: p.origin,
            side: p.side,
            units: p
                .units
                .iter()
                .map(|(item, n)| {
                    (
                        *item,
                        n - s
                            .units
                            .iter()
                            .find(|(k, _)| k == item)
                            .map_or(0, |(_, n)| *n),
                    )
                })
                .filter(|(_, n)| *n > 0)
                .collect(),
        })
        .collect();
    let a = units
        .iter()
        .any(|u| p[u.participant].side == BattleSide::Attacker);
    let d = units
        .iter()
        .any(|u| p[u.participant].side == BattleSide::Defender);
    let outcome = match (a, d) {
        (true, false) => BattleOutcome::AttackerVictory,
        (false, true) => BattleOutcome::DefenderVictory,
        (false, false) => BattleOutcome::MutualDestruction,
        (true, true) => BattleOutcome::Draw,
    };
    *rng = tentative;
    let damage = units
        .iter()
        .map(|unit| BattleDamage {
            owner: p[unit.participant].owner,
            origin: p[unit.participant].origin,
            item: unit.item,
            instance: unit.instance.to_string(),
            hull_ticks: unit.hull.to_string(),
            shield_ticks: unit.shield.to_string(),
        })
        .collect();
    Ok(BattleResult {
        damage,
        outcome,
        participants: p,
        rounds,
        survivors,
        destroyed,
        rng_cursor: rng.cursor(),
    })
}
/// G08 overflow-only proportional whole cargo retention; stable M/C/D remainder ties.
pub fn retain_cargo(cargo: Resources, capacity: i64) -> Result<Resources, InvariantError> {
    if capacity < 0
        || capacity % SCALE != 0
        || cargo.values().iter().any(|n| *n < 0 || n % SCALE != 0)
    {
        return Err(bad("invalid cargo units"));
    }
    let p = cargo.values().map(|n| i128::from(n / SCALE));
    let total: i128 = p.iter().sum();
    if total == 0 {
        return Ok(cargo);
    }
    let k = total.min(i128::from(capacity / SCALE));
    let mut out = p.map(|n| k * n / total);
    let mut order = [0, 1, 2];
    order.sort_by_key(|&i| (std::cmp::Reverse(k * p[i] % total), i));
    let extra = k - out.iter().sum::<i128>();
    for &index in order.iter().take(extra as usize) {
        out[index] += 1;
    }
    Ok(Resources::from_values(out.map(|n| (n as i64) * SCALE)))
}

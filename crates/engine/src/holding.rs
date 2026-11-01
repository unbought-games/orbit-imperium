//! Allied defense commitments and host-funded extensions. Remaining budgets are derived.
use crate::transition::{Fault, invariant, resources};
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
pub const HOLD_HOURS: [u32; 7] = [0, 1, 2, 4, 8, 16, 32];
pub const HOLD_HOUR_MS: i64 = 3_600_000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HoldingTerms {
    pub duration_ms: i64,
    /// Historical launch coefficients, in tenths of deuterium per ship/hour.
    pub rates: BTreeMap<ShipType, i64>,
    #[serde(with = "decimal_wire")]
    pub fuel: i64,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct HoldingRelationships {
    pub covered: BTreeSet<PlayerId>,
    pub alliances: BTreeMap<PlayerId, uuid::Uuid>,
    pub friends: BTreeSet<(PlayerId, PlayerId)>,
    pub blocks: BTreeSet<(PlayerId, PlayerId)>,
}
pub fn holding_enabled(r: &Ruleset) -> bool {
    r.artifact.world.as_ref().and_then(|w| w.holding.as_deref()) == Some("allied-holding-depot-v1")
}
pub fn can_hold(s: &GameState, owner: PlayerId, host: PlayerId) -> Result<(), GameError> {
    let facts = world_facts(s).map_err(|_| GameError::PolicyUnavailable)?;
    let rel = facts
        .holding_relationships
        .as_ref()
        .ok_or(GameError::PolicyUnavailable)?;
    if !rel.covered.contains(&owner) || !rel.covered.contains(&host) {
        return Err(GameError::PolicyUnavailable);
    }
    if owner == host
        || rel.blocks.contains(&(host, owner))
        || !(rel
            .alliances
            .get(&owner)
            .is_some_and(|a| rel.alliances.get(&host) == Some(a))
            || rel.friends.contains(&(owner.min(host), owner.max(host))))
    {
        return Err(GameError::HoldingUnavailable);
    }
    Ok(())
}
pub fn held_at(f: &MissionFleet, body: BodyId) -> bool {
    f.leg == MissionLeg::Holding
        && matches!(f.intent.destination, MissionDestination::Body { id, .. } if id == body)
}
pub fn holding_rate(ships: &[ShipStack], terms: &HoldingTerms) -> Result<i64, GameError> {
    let rate = ships.iter().try_fold(0i128, |total, ship| {
        let rate = terms
            .rates
            .get(&ship.ship_type)
            .filter(|v| **v > 0)
            .ok_or(GameError::PolicyUnavailable)?;
        if ship.count <= 0 {
            return Err(GameError::InvalidInput);
        }
        let weighted = i128::from(ship.count)
            .checked_mul(i128::from(*rate))
            .and_then(|v| v.checked_mul(100_000))
            .ok_or(GameError::NumericRange)?;
        total.checked_add(weighted).ok_or(GameError::NumericRange)
    })?;
    i64::try_from(rate).map_err(|_| GameError::NumericRange)
}
pub fn holding_terms(
    intent: &FleetIntent,
    research: &ResearchLevels,
    r: &Ruleset,
) -> Result<Option<HoldingTerms>, GameError> {
    if intent.mission != Mission::Hold {
        return if intent.hold_hours.is_none() {
            Ok(None)
        } else {
            Err(GameError::InvalidInput)
        };
    }
    if !holding_enabled(r) {
        return Err(GameError::UnavailableContent);
    }
    let hours = intent
        .hold_hours
        .filter(|h| HOLD_HOURS.contains(h))
        .ok_or(GameError::InvalidInput)?;
    let mut terms = HoldingTerms {
        duration_ms: i64::from(hours) * HOLD_HOUR_MS,
        rates: BTreeMap::new(),
        fuel: 0,
    };
    let ships: Vec<_> = intent
        .ships
        .iter()
        .map(|s| ShipStack {
            owner: s.owner,
            ship_type: s.ship_type,
            count: s.count,
        })
        .collect();
    for ship in &ships {
        if ship.ship_type == ShipType::SolarSatellite {
            return Err(GameError::UnavailableContent);
        }
        let rule = r
            .artifact
            .ships
            .get(&ship.ship_type)
            .ok_or(GameError::UnavailableContent)?;
        terms
            .rates
            .insert(ship.ship_type, ship_propulsion(rule, research)?.1);
    }
    let micro = i128::from(holding_rate(&ships, &terms)?) * i128::from(hours);
    terms.fuel =
        i64::try_from(((micro + i128::from(SCALE) - 1) / i128::from(SCALE)) * i128::from(SCALE))
            .map_err(|_| GameError::NumericRange)?;
    Ok(Some(terms))
}
pub(crate) fn arrive(
    s: &GameState,
    i: &OrderedInput,
    f: &mut MissionFleet,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    let MissionDestination::Body {
        id, expected_owner, ..
    } = f.intent.destination
    else {
        return Err(invariant("holding target"));
    };
    let terms = f
        .terms
        .holding
        .as_ref()
        .ok_or_else(|| invariant("missing holding commitment"))?;
    if terms.duration_ms == 0 {
        return Ok(());
    }
    if !world_facts(s)?.covered_players.contains(&expected_owner) {
        return Err(invariant("uncovered host"));
    }
    let visitors: Vec<_> = w.fleets.values().filter(|v| held_at(v, id)).collect();
    let mut owners: BTreeSet<_> = visitors.iter().map(|v| v.owner).collect();
    owners.extend([expected_owner, f.owner]);
    if visitors.len() >= 16 || owners.len() > 5 {
        crate::missions::own_report(w, i, f, "MissionFailed");
        let report = ReportId(derived_id(i.id, &format!("report:MissionFailed:{}", f.id)));
        if let Some(r) = w.reports.get_mut(&report) {
            r.payloads.get_mut(&f.owner).unwrap()["reason"] =
                serde_json::json!("HoldingCapacityReached");
        }
        return Ok(());
    }
    f.leg = MissionLeg::Holding;
    f.due_at = deadline(i.at, terms.duration_ms)?;
    crate::missions::schedule(c, i, f);
    Ok(())
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DepotSupplyIntent {
    pub source_planet: BodyId,
    pub fleet: FleetId,
    #[serde(with = "decimal_wire")]
    pub deuterium: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DepotSupply {
    pub id: InputId,
    pub intent: DepotSupplyIntent,
    pub recipient: PlayerId,
    pub at: Timestamp,
    pub sequence: i64,
    pub departure_before: Timestamp,
    pub departure_after: Timestamp,
    pub terms_hash: Hash,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DepotSupplyQuote {
    pub profile_hash: Hash,
    pub intent: DepotSupplyIntent,
    #[serde(with = "decimal_wire")]
    pub rate_micro_per_hour: i64,
    pub extension_ms: i64,
    pub departure_at: Timestamp,
    #[serde(with = "decimal_wire")]
    pub remaining_budget: i64,
    #[serde(with = "decimal_wire")]
    pub available_deuterium: i64,
    pub next_budget_release_at: Option<Timestamp>,
    pub terms_hash: Hash,
}
pub fn depot_budget(
    level: u32,
    source: BodyId,
    at: Timestamp,
    supplies: &BTreeMap<InputId, DepotSupply>,
) -> Result<(i64, Option<Timestamp>), GameError> {
    let capacity = i128::from(level) * 10_000 * i128::from(SCALE);
    let mut used = 0i128;
    let mut next = None;
    for supply in supplies.values().filter(|s| {
        s.intent.source_planet == source
            && i128::from(s.at) > i128::from(at) - i128::from(HOLD_HOUR_MS)
            && s.at <= at
    }) {
        used += i128::from(supply.intent.deuterium);
        let release = deadline(supply.at, HOLD_HOUR_MS)?;
        next = Some(next.map_or(release, |old: i64| old.min(release)));
    }
    Ok((
        i64::try_from((capacity - used).max(0)).map_err(|_| GameError::NumericRange)?,
        next,
    ))
}
pub fn quote_depot_supply(
    s: &GameState,
    owner: PlayerId,
    intent: &DepotSupplyIntent,
    at: Timestamp,
    r: &Ruleset,
) -> Result<DepotSupplyQuote, GameError> {
    if !holding_enabled(r) {
        return Err(GameError::UnavailableContent);
    }
    if intent.deuterium <= 0 || intent.deuterium % SCALE != 0 {
        return Err(GameError::InvalidInput);
    }
    let w = world_facts(s).map_err(|_| GameError::PolicyUnavailable)?;
    if !w.covered_depot_sources.contains(&intent.source_planet) {
        return Err(GameError::PolicyUnavailable);
    }
    let source = s
        .bodies
        .get(&intent.source_planet)
        .ok_or(GameError::NotFound)?;
    if source.owner != owner {
        return Err(GameError::NotOwned);
    }
    if source.kind != BodyKind::Planet {
        return Err(GameError::BodyKindNotAllowed);
    }
    let enabled = r
        .artifact
        .catalog
        .iter()
        .any(|c| c.key == CatalogKey::Building(Building::AllianceDepot) && c.enabled);
    let level = *source
        .levels
        .get(&Building::AllianceDepot)
        .ok_or(GameError::UnavailableContent)?;
    if !enabled || level == 0 {
        return Err(GameError::UnavailableContent);
    }
    let fleet = w
        .records
        .fleets
        .get(&intent.fleet)
        .filter(|f| held_at(f, source.id) && at < f.due_at && !f.ships.is_empty())
        .ok_or(GameError::HoldingUnavailable)?;
    can_hold(s, fleet.owner, owner)?;
    for player in [owner, fleet.owner] {
        let policy = w
            .records
            .policies
            .get(&player)
            .ok_or(GameError::PolicyUnavailable)?;
        if policy.lifecycle != PlayerLifecycle::Active {
            return Err(if player == owner {
                GameError::ActorDraining
            } else {
                GameError::HoldingUnavailable
            });
        }
        if policy.vacation {
            return Err(if player == owner {
                GameError::ActorVacation
            } else {
                GameError::HoldingUnavailable
            });
        }
    }
    let terms = fleet
        .terms
        .holding
        .as_ref()
        .ok_or(GameError::PolicyUnavailable)?;
    let rate = holding_rate(&fleet.ships, terms)?;
    if rate <= 0 {
        return Err(GameError::PolicyUnavailable);
    }
    let extension_ms =
        i64::try_from(i128::from(intent.deuterium) * i128::from(HOLD_HOUR_MS) / i128::from(rate))
            .map_err(|_| GameError::NumericRange)?;
    if extension_ms == 0 {
        return Err(GameError::ExtensionTooSmall);
    }
    let departure_at = deadline(fleet.due_at, extension_ms)?;
    let (remaining_budget, next_budget_release_at) =
        depot_budget(level, source.id, at, &w.records.depot_supplies)?;
    if intent.deuterium > remaining_budget {
        return Err(GameError::DepotBudgetExceeded);
    }
    let available_deuterium = settle_production(s, source, at, r)
        .map_err(|_| GameError::PolicyUnavailable)?
        .amounts
        .deuterium;
    if intent.deuterium > available_deuterium {
        return Err(GameError::InsufficientResources);
    }
    let terms_hash = hash(
        &serde_json::json!({"intent":intent,"rate":rate,"departure":departure_at,"generation":fleet.generation,"launch_terms":fleet.terms.terms_hash,"rules":r.hash}),
    );
    Ok(DepotSupplyQuote {
        profile_hash: r.hash.clone(),
        intent: intent.clone(),
        rate_micro_per_hour: rate,
        extension_ms,
        departure_at,
        remaining_budget,
        available_deuterium,
        next_budget_release_at,
        terms_hash,
    })
}
pub(crate) fn supply(
    s: &GameState,
    i: &OrderedInput,
    intent: &DepotSupplyIntent,
    expected: &Hash,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    let Actor::Player(owner) = i.actor else {
        return Err(invariant("supply actor"));
    };
    let q = quote_depot_supply(s, owner, intent, i.at, r)?;
    if &q.terms_hash != expected {
        return Err(GameError::QuoteChanged.into());
    }
    let mut body = s.bodies[&intent.source_planet].clone();
    body.checkpoint = settle_production(s, &body, i.at, r)?;
    body.checkpoint.amounts = resources(
        body.checkpoint.amounts,
        Resources {
            deuterium: intent.deuterium,
            ..Default::default()
        },
        false,
    )?;
    body.revision = body
        .revision
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    c.bodies.push(body);
    let fleet = w
        .fleets
        .get_mut(&intent.fleet)
        .ok_or_else(|| invariant("supply fleet"))?;
    c.cancelled_events.push(ScheduledEvent::FleetLegDue {
        fleet: fleet.id,
        generation: fleet.generation,
        expected_leg: fleet.leg,
    });
    let payment = DepotSupply {
        id: i.id,
        intent: intent.clone(),
        recipient: fleet.owner,
        at: i.at,
        sequence: i.sequence,
        departure_before: fleet.due_at,
        departure_after: q.departure_at,
        terms_hash: q.terms_hash,
    };
    fleet.due_at = q.departure_at;
    fleet.generation = fleet
        .generation
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    fleet.revision = fleet
        .revision
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    crate::missions::schedule(c, i, fleet);
    c.affected_viewers.extend([owner, fleet.owner]);
    if w.depot_supplies.insert(i.id, payment).is_some() {
        return Err(invariant("duplicate depot supply"));
    }
    Ok(())
}

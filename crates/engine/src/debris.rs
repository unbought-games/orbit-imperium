//! Existing-marker harvesting and Monday UTC lifecycle arithmetic.
use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DebrisField {
    pub id: OperationId,
    pub coordinates: Coordinates,
    pub marker_present: bool,
    pub metal: i64,
    pub crystal: i64,
    /// Omit zero to preserve pre-deuterium state/journal representations.
    #[serde(default, skip_serializing_if = "deuterium_is_zero")]
    pub deuterium: i64,
    pub generation: i64,
    pub cleanup_at: Timestamp,
    pub revision: i64,
}
/// Active outbound and returning fleets retain their destination marker until terminal.
/// Call with the complete fleet collection after applying any leg transition.
pub fn debris_reference_count<'a>(
    field: OperationId,
    fleets: impl IntoIterator<Item = &'a MissionFleet>,
) -> usize {
    fleets
        .into_iter()
        .filter(|fleet| {
            fleet.active()
                && matches!(fleet.intent.destination,
            MissionDestination::Debris { field_identity, .. } if field_identity == field)
        })
        .count()
}

fn deuterium_is_zero(value: &i64) -> bool {
    *value == 0
}

impl DebrisField {
    /// Derived in wide arithmetic: three individually valid balances may exceed i64.
    pub fn total(&self) -> i128 {
        i128::from(self.metal) + i128::from(self.crystal) + i128::from(self.deuterium)
    }
}

/// Capped equal shares, redistributing unused space among remaining resources.
/// Whole-unit remainders go to metal, then crystal, then deuterium. With no
/// deuterium this preserves the original half-fill/metal-first allocation.
pub fn harvest_allocation(available: [i64; 3], capacity: i64) -> Result<[i64; 3], GameError> {
    if available.iter().any(|n| *n < 0) || capacity < 0 {
        return Err(GameError::InvalidInput);
    }
    let mut collected = [0; 3];
    let mut free = capacity;
    while free > 0 {
        let active = (0..3).filter(|&r| collected[r] < available[r]).count() as i64;
        if active == 0 {
            break;
        }
        let share = free / active;
        let mut remainder = free % active;
        for r in 0..3 {
            let remaining = available[r] - collected[r];
            if remaining == 0 {
                continue;
            }
            let extra = i64::from(remainder > 0);
            remainder -= extra;
            let take = remaining.min(share + extra);
            collected[r] += take;
            free -= take;
        }
    }
    Ok(collected)
}
pub fn next_debris_cleanup(at: Timestamp) -> Result<Timestamp, GameError> {
    if !(0..=MAX_WIRE_MS).contains(&at) {
        return Err(GameError::NumericRange);
    }
    // Unix epoch is Thursday; first Monday is day four. Strictly after creation.
    let week = 604_800_000i64;
    let monday = 345_600_000i64;
    let next = if at < monday {
        monday
    } else {
        (at - monday)
            .checked_div(week)
            .and_then(|v| v.checked_add(1))
            .and_then(|v| v.checked_mul(week))
            .and_then(|v| v.checked_add(monday))
            .ok_or(GameError::NumericRange)?
    };
    if next > MAX_WIRE_MS {
        return Err(GameError::NumericRange);
    }
    Ok(next)
}

/// Aggregate gross ship construction losses across all participants before rounding.
/// Cargo, fuel, and defenses never enter this pool.
pub fn destroyed_ship_debris(
    destroyed: &[BattleCounts],
    rules: &CombatRules,
) -> Result<Resources, InvariantError> {
    let mut costs = [0i128; 3];
    for origin in destroyed {
        for &(item, count) in &origin.units {
            if !matches!(item, ManufacturedItem::Ship(_)) {
                continue;
            }
            let unit = rules
                .units
                .iter()
                .find(|u| u.item == item)
                .ok_or_else(|| InvariantError("missing unit valuation".into()))?;
            if count < 0 || unit.cost.iter().any(|n| *n < 0) {
                return Err(InvariantError("negative ship loss valuation".into()));
            }
            for (resource, cost) in costs.iter_mut().enumerate() {
                if resource == 2 && !rules.deuterium_in_debris {
                    continue;
                }
                *cost = cost
                    .checked_add(i128::from(count) * i128::from(unit.cost[resource]))
                    .ok_or_else(|| InvariantError("debris overflow".into()))?;
            }
        }
    }
    let mut amounts = [0; 3];
    for (resource, cost) in costs.into_iter().enumerate() {
        amounts[resource] = cost
            .checked_mul(i128::from(rules.ship_debris_bps))
            .and_then(|value| i64::try_from(value / 10000).ok())
            .and_then(|whole| whole.checked_mul(SCALE))
            .ok_or_else(|| InvariantError("debris resource overflow".into()))?;
    }
    Ok(Resources::from_values(amounts))
}

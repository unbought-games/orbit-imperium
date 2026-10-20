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

pub fn harvest_allocation(
    metal: i64,
    crystal: i64,
    capacity: i64,
) -> Result<(i64, i64), GameError> {
    if metal < 0 || crystal < 0 || capacity < 0 {
        return Err(GameError::InvalidInput);
    }
    let mut m = metal.min(capacity / 2 + capacity % 2);
    let mut c = crystal.min(capacity / 2);
    let mut free = capacity - m - c;
    let more = (metal - m).min(free);
    m += more;
    free -= more;
    c += (crystal - c).min(free);
    Ok((m, c))
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

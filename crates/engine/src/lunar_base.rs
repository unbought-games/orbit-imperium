use crate::*;

/// The initial field and completed base levels determine capacity, never diameter.
pub fn lunar_base_field_capacity(level: u32) -> Result<u32, GameError> {
    level
        .checked_mul(3)
        .and_then(|extra| extra.checked_add(1))
        .ok_or(GameError::NumericRange)
}

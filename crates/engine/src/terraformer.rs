//! Terraformer effects depend only on completed levels, never on catalog availability.
use crate::*;

pub const TERRAFORMER_FIELDS_PER_LEVEL: u32 = 5;
pub const TERRAFORMER_BASE_ENERGY: i64 = 1000;

/// Stored fields are the original planet capacity. Do not persist this total.
pub fn body_field_capacity(body: &Body, rules: &Ruleset) -> Result<u32, GameError> {
    if body.kind != BodyKind::Planet
        || !rules
            .artifact
            .buildings
            .contains_key(&Building::Terraformer)
    {
        return Ok(body.fields);
    }
    let level = body
        .levels
        .get(&Building::Terraformer)
        .ok_or(GameError::InvalidInput)?;
    terraformer_field_capacity(body.fields, *level)
}

pub fn terraformer_field_capacity(base: u32, level: u32) -> Result<u32, GameError> {
    level
        .checked_mul(TERRAFORMER_FIELDS_PER_LEVEL)
        .and_then(|extra| base.checked_add(extra))
        .ok_or(GameError::NumericRange)
}

/// A nonconsuming start-time threshold, expressed in micro-energy like EnergyStats.
pub fn terraformer_required_energy(target: u32) -> Result<i64, GameError> {
    let exponent = target.checked_sub(1).ok_or(GameError::InvalidInput)?;
    2i64.checked_pow(exponent)
        .and_then(|factor| factor.checked_mul(TERRAFORMER_BASE_ENERGY * SCALE))
        .ok_or(GameError::NumericRange)
}

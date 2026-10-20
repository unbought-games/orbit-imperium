use crate::numeric::*;
use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConstructionTerms {
    pub cost: Resources,
    pub duration: DurationMs,
    pub target_level: u32,
}
pub fn construction_terms(
    building: Building,
    target_level: u32,
    rules: &Ruleset,
) -> Result<ConstructionTerms, GameError> {
    let exponent = target_level.checked_sub(1).ok_or(GameError::InvalidInput)?;
    let rule = rules
        .artifact
        .buildings
        .get(&building)
        .ok_or(GameError::UnavailableContent)?;
    let growth = power(ratio(rule.growth[0], rule.growth[1])?, exponent)?;
    let mut cost = [0; 3];
    for (i, base) in rule.base.iter().enumerate() {
        cost[i] = floor(integer(*base) * growth.clone())?
            .checked_mul(SCALE)
            .ok_or(GameError::NumericRange)?;
    }
    let total = add(cost[0] / SCALE, cost[1] / SCALE)?;
    let seconds = floor(
        integer(3600) * integer(total)
            / integer(rules.artifact.construction_divisor)
            / integer(i64::from(rules.speed)),
    )?
    .max(1);
    Ok(ConstructionTerms {
        cost: Resources::from_values(cost),
        duration: seconds.checked_mul(1000).ok_or(GameError::NumericRange)?,
        target_level,
    })
}

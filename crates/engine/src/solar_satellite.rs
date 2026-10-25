//! Stationary ship energy, derived from covered inventory and planet temperature.
use crate::numeric::*;
use crate::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SolarSatelliteRule {
    pub temperature_offset: i64,
    pub temperature_divisor: i64,
}
impl SolarSatelliteRule {
    pub(crate) fn validate(&self) -> Result<(), RulesError> {
        // Includes all admitted homeworld and colony temperatures.
        if self.temperature_divisor <= 0
            || self.temperature_offset < 130
            || self
                .temperature_offset
                .checked_add(i64::from(i32::MAX))
                .is_none()
        {
            return Err(RulesError::Range);
        }
        self.temperature_offset
            .checked_add(260)
            .and_then(|n| n.checked_div(self.temperature_divisor))
            .and_then(|n| n.checked_mul(SCALE))
            .ok_or(RulesError::Range)?;
        Ok(())
    }
}
pub fn solar_satellite_rule(rules: &Ruleset) -> Option<&SolarSatelliteRule> {
    rules
        .artifact
        .progression
        .as_ref()?
        .solar_satellite
        .as_ref()
}
/// Full output of one satellite in micro-energy, before the group setting.
pub fn solar_satellite_unit_energy(body: &Body, rules: &Ruleset) -> Result<i64, GameError> {
    let rule = solar_satellite_rule(rules).ok_or(GameError::UnavailableContent)?;
    if body.kind != BodyKind::Planet {
        return Err(GameError::UnavailableContent);
    }
    let temperature = i64::from(body.max_temperature)
        .checked_add(rule.temperature_offset)
        .filter(|t| *t >= 0)
        .ok_or(GameError::NumericRange)?;
    temperature
        .checked_div(rule.temperature_divisor)
        .and_then(|n| n.checked_mul(SCALE))
        .ok_or(GameError::NumericRange)
}
pub fn solar_satellite_energy(
    body: &Body,
    settings: &ProductionSettings,
    count: i64,
    rules: &Ruleset,
) -> Result<i64, GameError> {
    if count < 0 || settings.solar_satellite > 100 || !settings.solar_satellite.is_multiple_of(10) {
        return Err(GameError::InvalidInput);
    }
    if solar_satellite_rule(rules).is_none() {
        return if count == 0 {
            Ok(0)
        } else {
            Err(GameError::UnavailableContent)
        };
    }
    floor(
        integer(solar_satellite_unit_energy(body, rules)?)
            * integer(count)
            * ratio(i64::from(settings.solar_satellite), 100)?,
    )
}
/// Missing rows mean zero only when the entire owner's body inventory is covered.
pub fn solar_satellite_count(
    state: &GameState,
    body: &Body,
    rules: &Ruleset,
) -> Result<i64, InvariantError> {
    if solar_satellite_rule(rules).is_none() {
        return Ok(0);
    }
    if !state
        .coverage
        .inventory_owners
        .contains(&(body.id, body.owner))
    {
        return Err(InvariantError("uncovered satellite inventory".into()));
    }
    let mut stacks = state.inventories.iter().filter(|s| {
        s.body == body.id && s.item == ManufacturedItem::Ship(ShipType::SolarSatellite)
    });
    let Some(stack) = stacks.next() else {
        return Ok(0);
    };
    if stacks.next().is_some() || stack.owner != body.owner || stack.count < 0 || stack.revision < 0
    {
        return Err(InvariantError("invalid satellite inventory".into()));
    }
    Ok(stack.count)
}
pub fn body_production_rates(
    state: &GameState,
    body: &Body,
    rules: &Ruleset,
) -> Result<Resources, InvariantError> {
    let settings = state
        .production_settings
        .get(&body.id)
        .ok_or_else(|| InvariantError("missing production settings".into()))?;
    Ok(production_rates_with_settings(
        body,
        &settings.settings,
        solar_satellite_count(state, body, rules)?,
        rules,
    )?)
}

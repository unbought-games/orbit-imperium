use crate::numeric::*;
use crate::*;
use num_traits::{One, Zero};
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EnergyStats {
    pub supply: i64,
    pub demand: i64,
    pub utilization: i64,
}
fn output_factors(
    body: &Body,
    settings: &ProductionSettings,
    rules: &Ruleset,
) -> Result<[Rational; 4], GameError> {
    let mut output = std::array::from_fn(|_| Rational::zero());
    for (i, b) in Building::ALL.iter().enumerate() {
        let level = *body.levels.get(b).ok_or(GameError::InvalidInput)?;
        output[i] = ratio(i64::from(settings.producers()[i]), 100)?
            * integer(i64::from(level))
            * power(
                ratio(rules.artifact.growth[0], rules.artifact.growth[1])?,
                level,
            )?;
    }
    Ok(output)
}
fn energy_ratios(output: &[Rational; 4], rules: &Ruleset) -> (Rational, Rational, Rational) {
    let supply = output[3].clone() * integer(rules.artifact.energy_supply);
    let demand = (0..3).fold(Rational::zero(), |sum, i| {
        sum + output[i].clone() * integer(rules.artifact.energy_demand[i])
    });
    let utilization = if demand.is_zero() {
        Rational::one()
    } else {
        (supply.clone() / demand.clone()).min(Rational::one())
    };
    (supply, demand, utilization)
}
pub fn energy_stats(body: &Body, rules: &Ruleset) -> Result<EnergyStats, GameError> {
    energy_with_settings(body, &ProductionSettings::default(), rules)
}
pub fn energy_with_settings(
    body: &Body,
    settings: &ProductionSettings,
    rules: &Ruleset,
) -> Result<EnergyStats, GameError> {
    let output = output_factors(body, settings, rules)?;
    let (supply, demand, utilization) = energy_ratios(&output, rules);
    Ok(EnergyStats {
        supply: floor(supply * integer(SCALE))?,
        demand: floor(demand * integer(SCALE))?,
        utilization: floor(utilization * integer(SCALE))?,
    })
}
pub fn production_rates(body: &Body, rules: &Ruleset) -> Result<Resources, GameError> {
    production_rates_with_settings(body, &ProductionSettings::default(), rules)
}
pub fn production_rates_with_settings(
    body: &Body,
    settings: &ProductionSettings,
    rules: &Ruleset,
) -> Result<Resources, GameError> {
    let r = &rules.artifact;
    let output = output_factors(body, settings, rules)?;
    let (_, _, utilization) = energy_ratios(&output, rules);
    let mut rates = [0; 3];
    for i in 0..3 {
        rates[i] = floor(
            (integer(r.base_income[i])
                + utilization.clone() * resource_output(body, i, output[i].clone(), rules)?)
                * integer(i64::from(rules.speed))
                * integer(SCALE),
        )?;
    }
    Ok(Resources::from_values(rates))
}
// Shared by actual production and the full-output building preview. Base income,
// throttling and energy utilization are applied only to actual planet production.
fn resource_output(
    body: &Body,
    index: usize,
    output: Rational,
    rules: &Ruleset,
) -> Result<Rational, GameError> {
    let r = &rules.artifact;
    let temperature = ratio(r.temperature[0], r.temperature[2])?
        + ratio(r.temperature[1], r.temperature[3])? * integer(i64::from(body.max_temperature));
    if temperature < Rational::zero() {
        return Err(GameError::NumericRange);
    }
    let modifier = if index == 2 {
        temperature
    } else {
        Rational::one()
    };
    Ok(integer(r.production[index]) * output * modifier)
}

pub(crate) fn building_full_output(
    body: &Body,
    building: Building,
    level: u32,
    rules: &Ruleset,
) -> Result<i64, GameError> {
    let mut preview = body.clone();
    preview.levels.insert(building, level);
    let output = output_factors(&preview, &ProductionSettings::default(), rules)?;
    let index = Building::ALL
        .iter()
        .position(|b| *b == building)
        .ok_or(GameError::UnavailableContent)?;
    let value = if building == Building::SolarPlant {
        output[index].clone() * integer(rules.artifact.energy_supply)
    } else {
        resource_output(body, index, output[index].clone(), rules)?
            * integer(i64::from(rules.speed))
    };
    floor(value * integer(SCALE))
}

pub fn settle_economy(
    body: &Body,
    at: Timestamp,
    rules: &Ruleset,
) -> Result<ResourceCheckpoint, InvariantError> {
    settle_rates(body, at, production_rates(body, rules)?, rules)
}
pub(crate) fn settle_rates(
    body: &Body,
    at: Timestamp,
    rates: Resources,
    rules: &Ruleset,
) -> Result<ResourceCheckpoint, InvariantError> {
    let dt = at
        .checked_sub(body.checkpoint.at)
        .filter(|v| *v >= 0)
        .ok_or_else(|| InvariantError("time regressed".into()))?;
    let rates = rates.values();
    let mut amounts = body.checkpoint.amounts.values();
    let mut carry = body.checkpoint.carry.values();
    let caps = body_storage_capacity(body, rules)?.values();
    for i in 0..3 {
        if amounts[i] < 0 || caps[i] < 0 || !(0..rules.artifact.hour_ms).contains(&carry[i]) {
            return Err(InvariantError("invalid resource checkpoint".into()));
        }
        if amounts[i] >= caps[i] {
            carry[i] = 0;
            continue;
        }
        let numerator = i128::from(rates[i])
            .checked_mul(i128::from(dt))
            .and_then(|v| v.checked_add(i128::from(carry[i])))
            .ok_or(GameError::NumericRange)?;
        let next = i128::from(amounts[i]) + numerator / i128::from(rules.artifact.hour_ms);
        if next >= i128::from(caps[i]) {
            amounts[i] = caps[i];
            carry[i] = 0
        } else {
            amounts[i] = i64::try_from(next).map_err(|_| GameError::NumericRange)?;
            carry[i] = i64::try_from(numerator % i128::from(rules.artifact.hour_ms))
                .map_err(|_| GameError::NumericRange)?
        }
    }
    Ok(ResourceCheckpoint {
        amounts: Resources::from_values(amounts),
        carry: Resources::from_values(carry),
        at,
    })
}

/// The only capacity source for settlement and views. Legacy profiles lack storage
/// buildings, so their saved per-body limits must remain authoritative.
pub fn body_storage_capacity(body: &Body, rules: &Ruleset) -> Result<Resources, InvariantError> {
    if !rules.progression() {
        return body
            .retained_capacity
            .ok_or_else(|| InvariantError("missing legacy storage capacity".into()));
    }
    let mut capacities = [0; 3];
    for (index, building) in [
        Building::MetalStorage,
        Building::CrystalStorage,
        Building::DeuteriumTank,
    ]
    .into_iter()
    .enumerate()
    {
        let level = body
            .levels
            .get(&building)
            .ok_or_else(|| InvariantError("missing storage level".into()))?;
        capacities[index] = storage_capacity(*level, rules)?;
    }
    Ok(Resources::from_values(capacities))
}

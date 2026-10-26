//! Fuel-aware production. Requested settings are facts; effective duty is derived.
use crate::numeric::*;
use crate::*;
use num_traits::{One, ToPrimitive, Zero};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FusionRule {
    pub energy_base: i64,
    pub energy_growth: [i64; 2],
    pub technology_divisor: i64,
    pub fuel_base: i64,
    pub fuel_growth: [i64; 2],
}
impl FusionRule {
    pub(crate) fn validate(&self) -> Result<(), RulesError> {
        if self.energy_base <= 0
            || self.fuel_base <= 0
            || self.technology_divisor <= 0
            || self.energy_growth[0] <= 0
            || self.energy_growth[1] <= 0
            || self.fuel_growth[0] <= 0
            || self.fuel_growth[1] <= 0
        {
            return Err(RulesError::Range);
        }
        Ok(())
    }
}
pub fn fusion_rule(rules: &Ruleset) -> Option<&FusionRule> {
    rules.artifact.progression.as_ref()?.fusion_reactor.as_ref()
}
pub fn energy_technology(state: &GameState, body: &Body) -> Result<u32, InvariantError> {
    if !state.coverage.research_players.contains(&body.owner) {
        return Err(InvariantError("uncovered energy technology".into()));
    }
    state
        .research
        .get(&body.owner)
        .and_then(|r| r.levels.get(&ResearchId::EnergyTechnology))
        .copied()
        .ok_or_else(|| InvariantError("missing energy technology".into()))
}
fn fusion_output(
    level: u32,
    technology: u32,
    rules: &Ruleset,
) -> Result<(Rational, Rational), GameError> {
    let Some(rule) = fusion_rule(rules) else {
        return Ok((Rational::zero(), Rational::zero()));
    };
    let energy = integer(rule.energy_base)
        * integer(i64::from(level))
        * power(
            ratio(rule.energy_growth[0], rule.energy_growth[1])?
                + ratio(i64::from(technology), rule.technology_divisor)?,
            level,
        )?;
    let fuel = integer(rule.fuel_base)
        * integer(i64::from(level))
        * power(ratio(rule.fuel_growth[0], rule.fuel_growth[1])?, level)?
        * integer(i64::from(rules.speed));
    Ok((energy, fuel))
}
pub fn fusion_full_output(
    level: u32,
    technology: u32,
    rules: &Ruleset,
) -> Result<(i64, i64), GameError> {
    let (energy, fuel) = fusion_output(level, technology, rules)?;
    Ok((
        floor(energy * integer(SCALE))?,
        floor(fuel * integer(SCALE))?,
    ))
}

/// A-PROG-001: largest sustainable duty, with no fuel-free self-start.
fn sustainable_duty(
    e: &Rational,
    f: &Rational,
    q: &Rational,
    a: &Rational,
    b: &Rational,
) -> Rational {
    if b.is_zero() || e.is_zero() || q.is_zero() {
        return Rational::zero();
    }
    let mut u = Rational::one().min(a / b);
    let denominator = b * q - a * f;
    if denominator > Rational::zero() {
        u = u.min(a * e / denominator);
    }
    u
}

pub struct ProductionEconomy {
    pub energy: EnergyStats,
    pub gross: Resources,
    pub fuel: i64,
    /// Signed rate, never used as a resource inventory.
    pub net_deuterium: i64,
    pub fuel_utilization: i64,
    pub fusion_supply: i64,
    /// Integer milliseconds for which the current rates can safely be extrapolated.
    pub stable_for_ms: Option<i64>,
}
struct Inputs {
    external: Rational,
    fusion: Rational,
    fuel: Rational,
    demand: Rational,
    mines: [Rational; 3],
    base: [Rational; 3],
}
impl Inputs {
    fn new(
        body: &Body,
        settings: &ProductionSettings,
        satellites: i64,
        technology: u32,
        rules: &Ruleset,
    ) -> Result<Self, GameError> {
        let output = crate::economy::output_factors(body, settings, rules)?;
        let (external, demand, _) = crate::economy::energy_ratios(
            &output,
            solar_satellite_energy(body, settings, satellites, rules)?,
            rules,
        );
        let (fusion, fuel) = fusion_output(
            body.levels
                .get(&Building::FusionReactor)
                .copied()
                .unwrap_or(0),
            technology,
            rules,
        )?;
        let percent = ratio(i64::from(settings.fusion_reactor), 100)?;
        let speed = integer(i64::from(rules.speed));
        let mut mines = std::array::from_fn(|_| Rational::zero());
        for i in 0..3 {
            mines[i] = crate::economy::resource_output(body, i, output[i].clone(), rules)? * &speed;
        }
        Ok(Self {
            external,
            demand,
            fusion: fusion * &percent,
            fuel: fuel * percent,
            mines,
            base: std::array::from_fn(|i| integer(rules.artifact.base_income[i]) * &speed),
        })
    }
    fn at(&self, stock: &Rational, cap: &Rational) -> Result<ProductionEconomy, GameError> {
        let duty = if stock.is_zero() {
            sustainable_duty(
                &self.external,
                &self.fusion,
                &self.demand,
                &self.mines[2],
                &self.fuel,
            )
        } else {
            Rational::one()
        };
        let fusion = &self.fusion * &duty;
        let supply = &self.external + &fusion;
        let utilization = if self.demand.is_zero() {
            Rational::one()
        } else {
            Rational::one().min(&supply / &self.demand)
        };
        let gross: [Rational; 3] =
            std::array::from_fn(|i| &self.base[i] + &self.mines[i] * &utilization);
        let fuel = &self.fuel * &duty;
        let net = if stock > cap {
            -&fuel
        } else {
            &gross[2] - &fuel
        };
        let mut net_deuterium = (net * integer(SCALE))
            .to_integer()
            .to_i64()
            .ok_or(GameError::NumericRange)?;
        if stock == cap {
            net_deuterium = net_deuterium.min(0);
        }
        let boundary = if net_deuterium < 0 {
            Some(if stock > cap {
                stock - cap
            } else {
                stock.clone()
            })
        } else if net_deuterium > 0 && stock < cap {
            Some(cap - stock)
        } else {
            None
        };
        let stable_for_ms = boundary
            .filter(|distance| {
                distance <= &(integer(MAX_WIRE_MS) * integer(net_deuterium.saturating_abs()))
            })
            .map(|distance| {
                floor(
                    distance / integer(net_deuterium.checked_abs().ok_or(GameError::NumericRange)?),
                )
            })
            .transpose()?;
        Ok(ProductionEconomy {
            energy: EnergyStats {
                supply: floor(supply * integer(SCALE))?,
                demand: floor(&self.demand * integer(SCALE))?,
                utilization: floor(utilization * integer(SCALE))?,
            },
            gross: Resources::from_values([
                floor(&gross[0] * integer(SCALE))?,
                floor(&gross[1] * integer(SCALE))?,
                floor(&gross[2] * integer(SCALE))?,
            ]),
            fuel: floor(fuel * integer(SCALE))?,
            net_deuterium,
            fuel_utilization: if self.fuel.is_zero() {
                0
            } else {
                floor(duty * integer(SCALE))?
            },
            fusion_supply: floor(fusion * integer(SCALE))?,
            stable_for_ms,
        })
    }
}
pub fn production_economy(
    body: &Body,
    settings: &ProductionSettings,
    satellites: i64,
    technology: u32,
    rules: &Ruleset,
) -> Result<ProductionEconomy, GameError> {
    if fusion_rule(rules).is_none()
        || body
            .levels
            .get(&Building::FusionReactor)
            .copied()
            .unwrap_or(0)
            == 0
        || settings.fusion_reactor == 0
    {
        let energy = energy_with_settings(body, settings, satellites, rules)?;
        let gross = production_rates_with_settings(body, settings, satellites, rules)?;
        return Ok(ProductionEconomy {
            energy,
            gross,
            fuel: 0,
            net_deuterium: gross.deuterium,
            fuel_utilization: 0,
            fusion_supply: 0,
            stable_for_ms: None,
        });
    }
    let cap = body_storage_capacity(body, rules)
        .map_err(|_| GameError::InvalidInput)?
        .deuterium;
    let stock = integer(body.checkpoint.amounts.deuterium) * integer(rules.artifact.hour_ms)
        + integer(body.checkpoint.carry.deuterium);
    Inputs::new(body, settings, satellites, technology, rules)?
        .at(&stock, &(integer(cap) * integer(rules.artifact.hour_ms)))
}
pub fn body_economy(
    state: &GameState,
    body: &Body,
    rules: &Ruleset,
) -> Result<ProductionEconomy, InvariantError> {
    let settings = &state
        .production_settings
        .get(&body.id)
        .ok_or_else(|| InvariantError("missing production settings".into()))?
        .settings;
    Ok(production_economy(
        body,
        settings,
        solar_satellite_count(state, body, rules)?,
        energy_technology(state, body)?,
        rules,
    )?)
}
pub fn settle_fusion(
    body: &Body,
    settings: &ProductionSettings,
    satellites: i64,
    technology: u32,
    at: Timestamp,
    rules: &Ruleset,
) -> Result<ResourceCheckpoint, InvariantError> {
    if body
        .levels
        .get(&Building::FusionReactor)
        .copied()
        .unwrap_or(0)
        == 0
        || settings.fusion_reactor == 0
    {
        return crate::economy::settle_rates(
            body,
            at,
            production_rates_with_settings(body, settings, satellites, rules)?,
            rules,
        );
    }
    let inputs = Inputs::new(body, settings, satellites, technology, rules)?;
    crate::fuel_settlement::settle(body, at, rules, |stock, cap| {
        let economy = inputs.at(stock, cap)?;
        Ok([
            economy.gross.metal,
            economy.gross.crystal,
            economy.net_deuterium,
        ])
    })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BuildingProduction {
    pub current: BuildingProductionValues,
    pub target: BuildingProductionValues,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BuildingProductionValues {
    pub energy_supply: String,
    pub energy_demand: String,
    pub utilization: String,
    pub fusion_supply: String,
    pub fuel_deuterium_per_hour: String,
    pub fuel_utilization: String,
    pub net_deuterium_per_hour: String,
    pub metal_per_hour: String,
    pub crystal_per_hour: String,
}
impl From<ProductionEconomy> for BuildingProductionValues {
    fn from(e: ProductionEconomy) -> Self {
        Self {
            energy_supply: e.energy.supply.to_string(),
            energy_demand: e.energy.demand.to_string(),
            utilization: e.energy.utilization.to_string(),
            fusion_supply: e.fusion_supply.to_string(),
            fuel_deuterium_per_hour: e.fuel.to_string(),
            fuel_utilization: e.fuel_utilization.to_string(),
            net_deuterium_per_hour: e.net_deuterium.to_string(),
            metal_per_hour: e.gross.metal.to_string(),
            crystal_per_hour: e.gross.crystal.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn approved_sustainable_duty_vectors() {
        for (e, f, q, a, b, n, d) in [
            (20, 80, 100, 10, 20, 1, 6),
            (100, 80, 100, 10, 20, 1, 2),
            (0, 200, 100, 10, 5, 0, 1),
            (20, 80, 100, 40, 20, 1, 1),
            (20, 100, 100, 10, 20, 1, 5),
        ] {
            assert_eq!(
                sustainable_duty(
                    &integer(e),
                    &integer(f),
                    &integer(q),
                    &integer(a),
                    &integer(b)
                ),
                ratio(n, d).unwrap()
            );
        }
    }
    #[test]
    fn technology_changes_sustainable_output_without_changing_requested_fuel() {
        let mut inputs = Inputs {
            external: integer(20),
            fusion: integer(80),
            demand: integer(100),
            fuel: integer(20),
            mines: [integer(30), integer(0), integer(10)],
            base: [integer(30), integer(15), integer(0)],
        };
        let first = inputs
            .at(&integer(0), &integer(10_000 * SCALE * 3_600_000))
            .unwrap();
        assert_eq!(first.gross.metal, 40 * SCALE);
        assert_eq!(first.net_deuterium, 0);
        inputs.fusion = integer(100);
        let second = inputs
            .at(&integer(0), &integer(10_000 * SCALE * 3_600_000))
            .unwrap();
        assert_eq!(second.gross.metal, 42 * SCALE);
        assert_eq!(second.net_deuterium, 0);
    }
}

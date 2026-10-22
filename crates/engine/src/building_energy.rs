use crate::*;
use serde::{Deserialize, Serialize};

/// Informational consumption at 100% production, separate from payment and
/// construction prerequisites. Derived for each inspection, never persisted.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BuildingEnergy {
    pub current_consumption: String,
    pub target_consumption: String,
}

pub fn building_energy(
    body: &Body,
    building: Building,
    source: u32,
    target: u32,
    rules: &Ruleset,
) -> Result<BuildingEnergy, GameError> {
    let mut isolated = body.clone();
    for producer in Building::ALL {
        isolated.levels.insert(producer, 0);
    }
    isolated.levels.insert(building, source);
    let current = energy_stats(&isolated, rules)?.demand;
    isolated.levels.insert(building, target);
    let target = energy_stats(&isolated, rules)?.demand;
    Ok(BuildingEnergy {
        current_consumption: current.to_string(),
        target_consumption: target.to_string(),
    })
}

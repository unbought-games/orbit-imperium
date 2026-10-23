use crate::*;
use serde::{Deserialize, Serialize};

/// Full-output benefits derived from the active rules for this inspection only.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BuildingBenefit {
    pub kind: BuildingBenefitKind,
    pub current: String,
    pub target: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildingBenefitKind {
    MetalPerHour,
    CrystalPerHour,
    DeuteriumPerHour,
    Energy,
    MetalCapacity,
    CrystalCapacity,
    DeuteriumCapacity,
}

pub fn building_benefit(
    body: &Body,
    building: Building,
    source: u32,
    target: u32,
    rules: &Ruleset,
) -> Result<Option<BuildingBenefit>, GameError> {
    use BuildingBenefitKind::*;
    let kind = match building {
        Building::MetalMine => MetalPerHour,
        Building::CrystalMine => CrystalPerHour,
        Building::DeuteriumSynthesizer => DeuteriumPerHour,
        Building::SolarPlant => Energy,
        Building::MetalStorage => MetalCapacity,
        Building::CrystalStorage => CrystalCapacity,
        Building::DeuteriumTank => DeuteriumCapacity,
        _ => return Ok(None),
    };
    let value = |level| match building {
        Building::MetalStorage | Building::CrystalStorage | Building::DeuteriumTank => {
            storage_capacity(level, rules)
        }
        _ => crate::economy::building_full_output(body, building, level, rules),
    };
    Ok(Some(BuildingBenefit {
        kind,
        current: value(source)?.to_string(),
        target: value(target)?.to_string(),
    }))
}

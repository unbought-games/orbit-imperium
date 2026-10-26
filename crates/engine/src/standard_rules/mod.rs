//! Explicit release content, shared by fresh production worlds and retained-world upgrades.
use crate::*;
use serde::Serialize;
use serde_json::Value;
use std::fmt;

mod content;
mod patch;

pub const STANDARD_RULES_RELEASE: &str = "0.5.0";

#[derive(Debug, Serialize)]
pub struct RulesUpgradeConflict {
    pub path: String,
    pub current: Option<Value>,
    pub older_default: Option<Value>,
    pub release_value: Value,
}
#[derive(Debug)]
pub enum StandardRulesError {
    Invalid(RulesError),
    Prerequisite(String),
    Conflicts(Vec<RulesUpgradeConflict>),
}
impl fmt::Display for StandardRulesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(error) => write!(f, "invalid standard-content upgrade: {error}"),
            Self::Prerequisite(id) => write!(
                f,
                "standard-content upgrade requires enabled {id}; no changes applied"
            ),
            Self::Conflicts(conflicts) => write!(
                f,
                "standard-content conflicts; no changes applied. Use rules export/diff/apply to resolve customized content: {}",
                serde_json::to_string(conflicts).expect("conflicts serialize")
            ),
        }
    }
}
impl std::error::Error for StandardRulesError {}
impl From<RulesError> for StandardRulesError {
    fn from(value: RulesError) -> Self {
        Self::Invalid(value)
    }
}

/// Does not infer a release number from the world's hash or store a duplicate version.
/// Only explicitly owned fields may change, and only from absent/recognized old defaults.
pub fn upgrade_standard_rules(current: &Ruleset) -> Result<Ruleset, StandardRulesError> {
    current.validate()?;
    if !current.world() || current.artifact.progression.is_none() {
        return Err(StandardRulesError::Invalid(RulesError::Unsupported));
    }
    // Earlier additions in the bundle satisfy their own dependency chain. Base
    // prerequisites must remain enabled; custom disabled base content is not re-enabled.
    for key in [
        CatalogKey::Building(Building::RoboticsFactory),
        CatalogKey::Building(Building::ResearchLab),
        CatalogKey::Building(Building::Shipyard),
        CatalogKey::Ship(ShipType::SmallCargo),
        CatalogKey::Research(ResearchId::EnergyTechnology),
        CatalogKey::Research(ResearchId::CombustionDrive),
        CatalogKey::Research(ResearchId::EspionageTechnology),
        CatalogKey::Research(ResearchId::WeaponsTechnology),
        CatalogKey::Research(ResearchId::ShieldingTechnology),
        CatalogKey::Research(ResearchId::ArmourTechnology),
    ] {
        if !current
            .artifact
            .catalog
            .iter()
            .any(|entry| entry.key == key && entry.enabled)
        {
            return Err(StandardRulesError::Prerequisite(format!("{key:?}")));
        }
    }
    let baseline = serde_json::to_value(Ruleset::mvp_raids()?.artifact).expect("rules serialize");
    let mut next = serde_json::to_value(&current.artifact).expect("rules serialize");
    let mut conflicts = Vec::new();
    for patch in content::patches() {
        if let Err(conflict) = patch.apply(&mut next, &baseline) {
            conflicts.push(conflict);
        }
    }
    if !conflicts.is_empty() {
        return Err(StandardRulesError::Conflicts(conflicts));
    }
    let artifact = serde_json::from_value(next).map_err(|_| RulesError::Malformed)?;
    let next = Ruleset::from_artifact(artifact, current.speed)?;
    validate_rules_update(current, &next)?;
    Ok(next)
}

pub fn standard_signup_rules(
    profile: UniverseProfile,
    speed: i32,
) -> Result<Ruleset, StandardRulesError> {
    upgrade_standard_rules(&Ruleset::signup_with_speed(profile, speed)?)
}

#[cfg(test)]
mod tests;

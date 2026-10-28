//! The same request document powers single commands and multi-user scenario patches.
pub use orbit_engine::world_edit::WorldEdit;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorldScenario {
    pub version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub policy: Option<crate::UniversePolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<orbit_engine::Ruleset>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub retained_rules: Vec<orbit_engine::Ruleset>,
    pub edits: Vec<WorldEdit>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScenarioMode {
    Create,
    Patch,
    Replace,
}
pub type WorldEditError = Box<dyn std::error::Error + Send + Sync>;

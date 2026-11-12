//! Authored insignia composition shared by empire and alliance identities.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsigniaRecipe {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finish: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<InsigniaShape>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layers: Option<Vec<InsigniaLayer>>,
    pub version: u8,
    pub symbol: String,
    pub foreground: String,
    pub background: String,
}
impl Default for InsigniaRecipe {
    fn default() -> Self {
        Self {
            finish: None,
            effect: None,
            shape: None,
            layers: None,
            version: 1,
            symbol: "compass".into(),
            foreground: "#cbb68d".into(),
            background: "#152b40".into(),
        }
    }
}
/// Basic backgrounds are free recipe choices, independent of catalog entitlements.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InsigniaShape {
    Shield,
    Circle,
    RoundedSquare,
    Diamond,
    Hexagon,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsigniaLayer {
    pub symbol: String,
    pub color: String,
}

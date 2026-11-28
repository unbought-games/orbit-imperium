//! Durable ship appearance commands and the provider-independent rendering seam.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

pub const SHIP_TARGET: &str = "LightFighter";
pub const SHIP_PACKAGE: &str = "orbit-light-fighter";
pub const SHIP_PACKAGE_REVISION: &str = "concord-v1";
#[derive(Deserialize)]
pub struct BundledShipSkin {
    pub target: String,
    pub id: String,
    pub revision: String,
    pub name: String,
}

pub static BUNDLED_SHIP_SKINS: std::sync::LazyLock<Vec<BundledShipSkin>> =
    std::sync::LazyLock::new(|| {
        serde_json::from_str(include_str!("../assets/ship-skins.json"))
            .expect("bundled ship skin registry must be valid")
    });

pub const FREE_SHIP_DYES: &[(&str, &str, &str)] = &[
    ("free-ivory", "Ivory", "#e5dfce"),
    ("free-graphite", "Graphite", "#30343b"),
    ("free-steel", "Steel", "#8395a6"),
    ("free-blue", "Blue", "#315caa"),
    ("free-red", "Red", "#b83535"),
    ("free-gold", "Gold", "#d5a740"),
    ("free-green", "Green", "#367d62"),
];
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShipPaintRecipe {
    pub version: u8,
    pub skin_id: String,
    pub package_revision: String,
    pub primary: String,
    pub accent: String,
    pub emblem: ShipEmblem,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShipEmblem {
    pub treatment: String,
    pub placement: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShipDesign {
    pub id: Uuid,
    pub name: String,
    pub target: String,
    pub revision: i64,
    pub recipe: ShipPaintRecipe,
}
impl ShipDesign {
    pub fn valid(&self) -> bool {
        !self.id.is_nil()
            && self.revision >= 0
            && self.revision < i64::MAX
            && (1..=40).contains(&self.name.trim().chars().count())
            && !self.name.chars().any(char::is_control)
            && self.recipe.version == 1
            && BUNDLED_SHIP_SKINS.iter().any(|skin| {
                skin.target == self.target
                    && skin.id == self.recipe.skin_id
                    && skin.revision == self.recipe.package_revision
            })
            && matches!(
                self.recipe.emblem.treatment.as_str(),
                "none" | "full" | "layers"
            )
            && matches!(
                self.recipe.emblem.placement.as_str(),
                "near-wing" | "paired"
            )
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum ShipAppearanceAction {
    Load,
    Save {
        design: ShipDesign,
        equip: bool,
        expected_equipment_revision: i64,
    },
    Equip {
        target: String,
        design_id: Uuid,
        design_revision: i64,
        expected_equipment_revision: i64,
    },
    Reset {
        target: String,
        expected_equipment_revision: i64,
    },
    Cancel {
        request_id: Uuid,
    },
    Retry {
        request_id: Uuid,
    },
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShipAppearanceRequest {
    pub context: QueryContext,
    pub action: ShipAppearanceAction,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipArtworkVariant {
    pub width: u32,
    pub height: u32,
    pub url: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipArtwork {
    pub id: Uuid,
    pub variants: Vec<ShipArtworkVariant>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipRenderRequest {
    pub id: Uuid,
    pub stage: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub can_cancel: bool,
    pub can_retry: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipEquipment {
    pub target: String,
    pub revision: i64,
    pub design_id: Option<Uuid>,
    pub design_revision: Option<i64>,
    pub render: Option<ShipRenderRequest>,
    pub artwork: Option<ShipArtwork>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_reason: Option<String>,
}
#[derive(Clone, Debug)]
pub struct ShipAppearanceSnapshot {
    pub library: Vec<ShipDesign>,
    pub equipment: Vec<ShipEquipment>,
    pub emblem_recipe: Option<InsigniaRecipe>,
    pub emblem_revision: i64,
}
/// Authorized, resolved inputs obtained from current membership evidence. Never from a browser.
#[derive(Clone, Debug)]
pub struct ShipRenderEnvironment {
    pub valid_until: i64,
    pub dyes: BTreeMap<String, String>,
    pub emblem: Option<serde_json::Value>,
    pub emblem_revision: i64,
}
impl ShipRenderEnvironment {
    pub fn input(&self, recipe: &ShipPaintRecipe) -> Result<serde_json::Value, ServiceError> {
        let primary = self
            .dyes
            .get(&recipe.primary)
            .ok_or(ServiceError::Forbidden)?;
        let accent = self
            .dyes
            .get(&recipe.accent)
            .ok_or(ServiceError::Forbidden)?;
        let emblem = if recipe.emblem.treatment == "none" {
            None
        } else {
            self.emblem.as_ref().map(|appearance| {
                serde_json::json!({
                    "recipe": appearance["recipe"], "appearance": appearance,
                    "treatment":recipe.emblem.treatment, "placement":recipe.emblem.placement
                })
            })
        };
        Ok(serde_json::json!({"version":1,"package_id":recipe.skin_id,
            "package_revision":recipe.package_revision,"colors":{"primary":primary,"accent":accent},"emblem":emblem}))
    }
}
#[derive(Clone, Debug)]
pub struct ShipRenderJob {
    pub binding: Binding,
    pub id: Uuid,
    pub lease: Uuid,
    pub account: AccountId,
    pub input: serde_json::Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipStoredVariant {
    pub width: u32,
    pub height: u32,
    pub mime_type: String,
    pub key: String,
}

/// Replaceable internal rendering provider. It never selects equipment or writes storage.
pub struct RenderedShipVariant {
    pub width: u32,
    pub height: u32,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}
#[derive(Debug)]
pub enum ShipRenderError {
    Busy { retry_after_seconds: u64 },
    Unavailable(String),
}
impl From<String> for ShipRenderError {
    fn from(value: String) -> Self {
        Self::Unavailable(value)
    }
}
impl From<&str> for ShipRenderError {
    fn from(value: &str) -> Self {
        Self::Unavailable(value.into())
    }
}
pub type ShipRenderFuture<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, ShipRenderError>> + Send + 'a>>;
pub trait ShipRenderer: Send + Sync {
    fn render<'a>(
        &'a self,
        job: &'a ShipRenderJob,
    ) -> ShipRenderFuture<'a, Vec<RenderedShipVariant>>;
    /// Best-effort cancellation; durable selection and lease fencing remain authoritative.
    fn cancel(&self, request: Uuid) -> ShipRenderFuture<'_, ()>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_light_fighter_recipes_pin_the_matching_revision() {
        let mut design = ShipDesign {
            id: Uuid::from_u128(1),
            name: "Orbit Base".into(),
            target: SHIP_TARGET.into(),
            revision: 0,
            recipe: ShipPaintRecipe {
                version: 1,
                skin_id: "orbit-base-light-fighter".into(),
                package_revision: "v1".into(),
                primary: "free-blue".into(),
                accent: "free-gold".into(),
                emblem: ShipEmblem {
                    treatment: "full".into(),
                    placement: "paired".into(),
                },
            },
        };
        assert!(design.valid());
        design.recipe.package_revision = SHIP_PACKAGE_REVISION.into();
        assert!(!design.valid());
        design.recipe.skin_id = SHIP_PACKAGE.into();
        assert!(design.valid());
    }
}

//! Authored cosmetic choices, independent of simulation and billing.
use crate::*;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, future::Future, pin::Pin};

pub type AssetFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, AssetError>> + Send + 'a>>;
#[derive(Debug, thiserror::Error)]
pub enum AssetError {
    #[error("asset not found")]
    NotFound,
    #[error("asset storage unavailable")]
    Unavailable,
}
/// Opaque, application-generated keys; delivery URLs and access policy live above storage.
pub trait AssetStore: Send + Sync {
    fn read<'a>(&'a self, key: &'a str) -> AssetFuture<'a, Vec<u8>>;
    fn write<'a>(&'a self, key: &'a str, bytes: Vec<u8>) -> AssetFuture<'a, ()>;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CosmeticPolicy {
    #[default]
    Unrestricted,
    Supporter,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsigniaRecipe {
    pub version: u8,
    pub symbol: String,
    pub foreground: String,
    pub background: String,
}
impl Default for InsigniaRecipe {
    fn default() -> Self {
        Self {
            version: 1,
            symbol: "compass".into(),
            foreground: "#cbb68d".into(),
            background: "#152b40".into(),
        }
    }
}
pub const INSIGNIA_SYMBOLS: &[(&str, &str, bool)] = &[
    ("compass", "Wayfinder", false),
    ("wings", "Starwing", false),
    ("spire", "Ascendant", false),
    ("laurel", "Laureate", true),
];
pub fn valid_insignia(recipe: &InsigniaRecipe) -> bool {
    fn color(s: &str) -> bool {
        s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    }
    recipe.version == 1
        && INSIGNIA_SYMBOLS
            .iter()
            .any(|(id, _, _)| *id == recipe.symbol)
        && color(&recipe.foreground)
        && color(&recipe.background)
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct InsigniaDesign {
    pub id: uuid::Uuid,
    pub name: String,
    pub recipe: InsigniaRecipe,
    /// Optimistic concurrency token, not a copy of eligibility.
    pub revision: i64,
}
impl InsigniaDesign {
    pub fn valid(&self) -> bool {
        !self.id.is_nil()
            && self.revision >= 0
            && self.revision < i64::MAX
            && !self.name.trim().is_empty()
            && self.name.chars().count() <= 40
            && !self.name.chars().any(char::is_control)
            && valid_insignia(&self.recipe)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InsigniaLibrary {
    pub designs: Vec<InsigniaDesign>,
    pub equipped: Option<uuid::Uuid>,
    pub permanent_symbols: Vec<String>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum InsigniaAction {
    Load,
    Save { design: InsigniaDesign, equip: bool },
    Equip { design_id: Option<uuid::Uuid> },
    Delete { design_id: uuid::Uuid },
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsigniaRequest {
    pub context: QueryContext,
    pub action: InsigniaAction,
}
#[derive(Clone, Copy, Debug, Default)]
pub struct SupporterEvidence {
    pub known: bool,
    pub active: bool,
    pub expires_at: i64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InsigniaAccess {
    Available,
    SupporterRequired,
    Unavailable,
}
pub fn insignia_access(
    symbol: &str,
    policy: CosmeticPolicy,
    grants: &[String],
    evidence: SupporterEvidence,
    now: i64,
) -> InsigniaAccess {
    let Some((_, _, restricted)) = INSIGNIA_SYMBOLS.iter().find(|(id, _, _)| *id == symbol) else {
        return InsigniaAccess::SupporterRequired;
    };
    if !restricted || policy == CosmeticPolicy::Unrestricted || grants.iter().any(|s| s == symbol) {
        return InsigniaAccess::Available;
    }
    if !evidence.known || evidence.expires_at <= now {
        return InsigniaAccess::Unavailable;
    }
    if evidence.active {
        InsigniaAccess::Available
    } else {
        InsigniaAccess::SupporterRequired
    }
}
pub fn effective_insignia(
    recipe: &InsigniaRecipe,
    policy: CosmeticPolicy,
    grants: &[String],
    evidence: SupporterEvidence,
    now: i64,
) -> InsigniaRecipe {
    if valid_insignia(recipe)
        && insignia_access(&recipe.symbol, policy, grants, evidence, now)
            == InsigniaAccess::Available
    {
        recipe.clone()
    } else {
        InsigniaRecipe::default()
    }
}
pub type EquippedInsignias = BTreeMap<PlayerId, (InsigniaRecipe, Vec<String>)>;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn access_is_a_union_and_expired_evidence_never_grants_access() {
        let active = SupporterEvidence {
            known: true,
            active: true,
            expires_at: 100,
        };
        assert_eq!(
            insignia_access("laurel", CosmeticPolicy::Supporter, &[], active, 99),
            InsigniaAccess::Available
        );
        assert_eq!(
            insignia_access("laurel", CosmeticPolicy::Supporter, &[], active, 100),
            InsigniaAccess::Unavailable
        );
        assert_eq!(
            insignia_access(
                "laurel",
                CosmeticPolicy::Supporter,
                &["laurel".into()],
                active,
                100
            ),
            InsigniaAccess::Available
        );
        assert_eq!(
            insignia_access(
                "laurel",
                CosmeticPolicy::Unrestricted,
                &[],
                Default::default(),
                100
            ),
            InsigniaAccess::Available
        );
        assert_eq!(
            insignia_access(
                "compass",
                CosmeticPolicy::Supporter,
                &[],
                Default::default(),
                100
            ),
            InsigniaAccess::Available
        );
        assert_eq!(
            insignia_access(
                "laurel",
                CosmeticPolicy::Supporter,
                &[],
                SupporterEvidence {
                    active: false,
                    ..active
                },
                99
            ),
            InsigniaAccess::SupporterRequired
        );
        let recipe = InsigniaRecipe {
            symbol: "laurel".into(),
            ..Default::default()
        };
        assert_eq!(
            effective_insignia(&recipe, CosmeticPolicy::Supporter, &[], active, 100),
            InsigniaRecipe::default()
        );
        assert_eq!(
            effective_insignia(&recipe, CosmeticPolicy::Supporter, &[], active, 99),
            recipe
        );
    }
    #[test]
    fn only_versioned_catalog_symbols_and_literal_colors_are_accepted() {
        for (symbol, _, _) in INSIGNIA_SYMBOLS {
            assert!(valid_insignia(&InsigniaRecipe {
                symbol: (*symbol).into(),
                ..Default::default()
            }));
        }
        for value in [
            "red",
            "#fff",
            "#ffffff;",
            "url(https://example.com)",
            "#💥123",
        ] {
            assert!(!valid_insignia(&InsigniaRecipe {
                foreground: value.into(),
                ..Default::default()
            }));
        }
        assert!(!valid_insignia(&InsigniaRecipe {
            symbol: "../secret".into(),
            ..Default::default()
        }));
        assert!(!valid_insignia(&InsigniaRecipe {
            version: 2,
            ..Default::default()
        }));
    }
}

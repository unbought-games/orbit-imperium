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
/// Only freely distributed originals belong in the public binary.
pub const FREE_INSIGNIAS: &[(&str, &str, &[u8])] = &[
    (
        "compass",
        "Wayfinder",
        include_bytes!("../assets/insignias/compass.svg"),
    ),
    (
        "wings",
        "Starwing",
        include_bytes!("../assets/insignias/wings.svg"),
    ),
    (
        "spire",
        "Ascendant",
        include_bytes!("../assets/insignias/spire.svg"),
    ),
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsigniaSymbol {
    pub id: String,
    pub name: String,
    pub supporter: bool,
    pub sha256: String,
}
impl InsigniaSymbol {
    pub fn key(&self) -> String {
        format!("insignias/v1/{}/{}.svg", self.id, self.sha256)
    }
    pub fn asset_url(&self) -> String {
        format!("/api/media/insignias/{}/{}.svg", self.id, self.sha256)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsigniaManifest {
    pub version: u8,
    pub insignias: Vec<InsigniaSymbol>,
}

/// Installed authoritative definitions; availability is always derived from these.
#[derive(Clone, Debug)]
pub struct InsigniaCatalog {
    symbols: Vec<InsigniaSymbol>,
}
impl Default for InsigniaCatalog {
    fn default() -> Self {
        use sha2::Digest;
        Self {
            symbols: FREE_INSIGNIAS
                .iter()
                .map(|(id, name, bytes)| InsigniaSymbol {
                    id: (*id).into(),
                    name: (*name).into(),
                    supporter: false,
                    sha256: hex::encode(sha2::Sha256::digest(bytes)),
                })
                .collect(),
        }
    }
}
impl InsigniaCatalog {
    pub fn symbols(&self) -> &[InsigniaSymbol] {
        &self.symbols
    }
    pub fn get(&self, id: &str) -> Option<&InsigniaSymbol> {
        self.symbols.iter().find(|s| s.id == id)
    }
    pub fn with_manifest(manifest: InsigniaManifest) -> Result<Self, String> {
        let mut catalog = Self::default();
        if manifest.version != 1 || manifest.insignias.len() > 256 {
            return Err("Unsupported or oversized cosmetic catalog".into());
        }
        for item in manifest.insignias {
            if !valid_symbol_id(&item.id)
                || !valid_asset_hash(&item.sha256)
                || item.name.trim().is_empty()
                || item.name.chars().count() > 64
                || item.name.chars().any(char::is_control)
                || catalog.get(&item.id).is_some()
            {
                return Err("Invalid or duplicate cosmetic catalog item".into());
            }
            catalog.symbols.push(item);
        }
        Ok(catalog)
    }
    pub fn bundled(&self, id: &str) -> bool {
        FREE_INSIGNIAS.iter().any(|(free, _, _)| *free == id)
    }
}
pub fn valid_symbol_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}
pub fn valid_asset_hash(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
pub fn catalog_hash(key: &str) -> Option<&str> {
    key.strip_prefix("insignias/catalogs/")
        .and_then(|s| s.strip_suffix(".json"))
        .filter(|s| valid_asset_hash(s))
}
pub fn valid_insignia(recipe: &InsigniaRecipe) -> bool {
    fn color(s: &str) -> bool {
        s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    }
    recipe.version == 1
        && valid_symbol_id(&recipe.symbol)
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
    NotInstalled,
}
pub fn insignia_access(
    catalog: &InsigniaCatalog,
    symbol: &str,
    policy: CosmeticPolicy,
    grants: &[String],
    evidence: SupporterEvidence,
    now: i64,
) -> InsigniaAccess {
    let Some(item) = catalog.get(symbol) else {
        return InsigniaAccess::NotInstalled;
    };
    if !item.supporter
        || policy == CosmeticPolicy::Unrestricted
        || grants.iter().any(|s| s == symbol)
    {
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
    catalog: &InsigniaCatalog,
    recipe: &InsigniaRecipe,
    policy: CosmeticPolicy,
    grants: &[String],
    evidence: SupporterEvidence,
    now: i64,
) -> InsigniaRecipe {
    if valid_insignia(recipe)
        && insignia_access(catalog, &recipe.symbol, policy, grants, evidence, now)
            == InsigniaAccess::Available
    {
        recipe.clone()
    } else {
        InsigniaRecipe::default()
    }
}
pub type EquippedInsignias = BTreeMap<PlayerId, (InsigniaRecipe, Vec<String>)>;

/// Wire compatibility only; this list does not install or grant any content.
pub fn legacy_insignia_id(id: &str) -> bool {
    matches!(id, "compass" | "wings" | "spire" | "laurel")
}

#[cfg(test)]
mod tests {
    use super::*;
    fn catalog() -> InsigniaCatalog {
        InsigniaCatalog::with_manifest(InsigniaManifest {
            version: 1,
            insignias: vec![InsigniaSymbol {
                id: "test-star".into(),
                name: "Test star".into(),
                supporter: true,
                sha256: "a".repeat(64),
            }],
        })
        .unwrap()
    }
    #[test]
    fn missing_content_is_not_granted_by_policy_membership_or_permanent_ownership() {
        let c = InsigniaCatalog::default();
        assert_eq!(c.symbols().len(), 3);
        assert!(c.symbols().iter().all(|s| !s.supporter));
        let recipe = InsigniaRecipe {
            symbol: "test-star".into(),
            ..Default::default()
        };
        let evidence = SupporterEvidence {
            known: true,
            active: true,
            expires_at: 100,
        };
        assert_eq!(
            insignia_access(
                &c,
                "test-star",
                CosmeticPolicy::Unrestricted,
                &["test-star".into()],
                evidence,
                1
            ),
            InsigniaAccess::NotInstalled
        );
        assert_eq!(
            effective_insignia(&c, &recipe, CosmeticPolicy::Unrestricted, &[], evidence, 1),
            InsigniaRecipe::default()
        );
        assert_eq!(
            recipe.symbol, "test-star",
            "fallback never mutates authored choices"
        );
        assert_eq!(
            effective_insignia(
                &catalog(),
                &recipe,
                CosmeticPolicy::Supporter,
                &[],
                evidence,
                1
            ),
            recipe
        );
    }
    #[test]
    fn manifests_reject_unknown_versions_duplicates_invalid_ids_and_hashes() {
        for id in ["compass", "../escape", "", "UPPER"] {
            let item = InsigniaSymbol {
                id: id.into(),
                name: "Example".into(),
                supporter: true,
                sha256: "a".repeat(64),
            };
            assert!(
                InsigniaCatalog::with_manifest(InsigniaManifest {
                    version: 1,
                    insignias: vec![item]
                })
                .is_err()
            );
        }
        let item = catalog().get("test-star").unwrap().clone();
        assert!(
            InsigniaCatalog::with_manifest(InsigniaManifest {
                version: 1,
                insignias: vec![item.clone(), item.clone()]
            })
            .is_err()
        );
        assert!(
            InsigniaCatalog::with_manifest(InsigniaManifest {
                version: 2,
                insignias: vec![]
            })
            .is_err()
        );
        assert!(
            InsigniaCatalog::with_manifest(InsigniaManifest {
                version: 1,
                insignias: vec![InsigniaSymbol {
                    sha256: "bad".into(),
                    ..item
                }]
            })
            .is_err()
        );
    }
    #[test]
    fn access_is_a_union_and_expired_evidence_never_grants_access() {
        let active = SupporterEvidence {
            known: true,
            active: true,
            expires_at: 100,
        };
        assert_eq!(
            insignia_access(
                &catalog(),
                "test-star",
                CosmeticPolicy::Supporter,
                &[],
                active,
                99
            ),
            InsigniaAccess::Available
        );
        assert_eq!(
            insignia_access(
                &catalog(),
                "test-star",
                CosmeticPolicy::Supporter,
                &[],
                active,
                100
            ),
            InsigniaAccess::Unavailable
        );
        assert_eq!(
            insignia_access(
                &catalog(),
                "test-star",
                CosmeticPolicy::Supporter,
                &["test-star".into()],
                active,
                100
            ),
            InsigniaAccess::Available
        );
        assert_eq!(
            insignia_access(
                &catalog(),
                "test-star",
                CosmeticPolicy::Unrestricted,
                &[],
                Default::default(),
                100
            ),
            InsigniaAccess::Available
        );
        assert_eq!(
            insignia_access(
                &catalog(),
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
                &catalog(),
                "test-star",
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
            symbol: "test-star".into(),
            ..Default::default()
        };
        assert_eq!(
            effective_insignia(
                &catalog(),
                &recipe,
                CosmeticPolicy::Supporter,
                &[],
                active,
                100
            ),
            InsigniaRecipe::default()
        );
        assert_eq!(
            effective_insignia(
                &catalog(),
                &recipe,
                CosmeticPolicy::Supporter,
                &[],
                active,
                99
            ),
            recipe
        );
    }
    #[test]
    fn only_versioned_catalog_symbols_and_literal_colors_are_accepted() {
        for (symbol, _, _) in FREE_INSIGNIAS {
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

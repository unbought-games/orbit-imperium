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
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InsigniaGroup {
    #[default]
    Legacy,
    Center,
    Stripes,
    Accents,
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
    (
        "forge-wayfinder",
        "Wayfinder",
        include_bytes!("../assets/insignias/forge-wayfinder.svg"),
    ),
    (
        "forge-starwing",
        "Starwing",
        include_bytes!("../assets/insignias/forge-starwing.svg"),
    ),
    (
        "forge-ascendant",
        "Ascendant",
        include_bytes!("../assets/insignias/forge-ascendant.svg"),
    ),
    (
        "forge-anvil",
        "Anvil",
        include_bytes!("../assets/insignias/forge-anvil.svg"),
    ),
    (
        "forge-helix",
        "Ringed planet",
        include_bytes!("../assets/insignias/forge-helix.svg"),
    ),
    (
        "forge-quarter-moon",
        "Quarter moon",
        include_bytes!("../assets/insignias/forge-quarter-moon.svg"),
    ),
    (
        "forge-full-circle",
        "Full circle",
        include_bytes!("../assets/insignias/forge-full-circle.svg"),
    ),
    (
        "forge-triforce",
        "Triforce",
        include_bytes!("../assets/insignias/forge-triforce.svg"),
    ),
    (
        "forge-triads",
        "Corner sparks",
        include_bytes!("../assets/insignias/forge-triads.svg"),
    ),
    (
        "forge-crown",
        "Crown",
        include_bytes!("../assets/insignias/forge-crown.svg"),
    ),
    (
        "forge-moons",
        "Twin moons",
        include_bytes!("../assets/insignias/forge-moons.svg"),
    ),
    (
        "forge-diamonds",
        "Diamonds",
        include_bytes!("../assets/insignias/forge-diamonds.svg"),
    ),
    (
        "forge-diagonal-stars",
        "Diagonal stars",
        include_bytes!("../assets/insignias/forge-diagonal-stars.svg"),
    ),
    (
        "forge-diagonal-circles",
        "Diagonal circles",
        include_bytes!("../assets/insignias/forge-diagonal-circles.svg"),
    ),
    (
        "forge-zigzags",
        "Twin zigzags",
        include_bytes!("../assets/insignias/forge-zigzags.svg"),
    ),
    (
        "forge-mini-stripes",
        "Mini stripes",
        include_bytes!("../assets/insignias/forge-mini-stripes.svg"),
    ),
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsigniaSymbol {
    #[serde(default)]
    pub group: InsigniaGroup,
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
                    group: bundled_group(id),
                    id: (*id).into(),
                    name: (*name).into(),
                    supporter: false,
                    sha256: hex::encode(sha2::Sha256::digest(bytes)),
                })
                .collect(),
        }
    }
}
fn bundled_group(id: &str) -> InsigniaGroup {
    match id {
        "forge-wayfinder" => InsigniaGroup::Center,
        "forge-starwing" => InsigniaGroup::Center,
        "forge-ascendant" => InsigniaGroup::Center,
        "forge-anvil" => InsigniaGroup::Center,
        "forge-helix" => InsigniaGroup::Center,
        "forge-quarter-moon" => InsigniaGroup::Center,
        "forge-full-circle" => InsigniaGroup::Center,
        "forge-triforce" => InsigniaGroup::Center,
        "forge-triads" => InsigniaGroup::Accents,
        "forge-crown" => InsigniaGroup::Accents,
        "forge-moons" => InsigniaGroup::Accents,
        "forge-diamonds" => InsigniaGroup::Accents,
        "forge-diagonal-stars" => InsigniaGroup::Accents,
        "forge-diagonal-circles" => InsigniaGroup::Accents,
        "forge-zigzags" => InsigniaGroup::Accents,
        "forge-mini-stripes" => InsigniaGroup::Accents,
        _ => InsigniaGroup::Legacy,
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
    valid_symbol_id(&recipe.symbol)
        && color(&recipe.foreground)
        && color(&recipe.background)
        && match (&recipe.layers, recipe.version) {
            (None, 1) => recipe.shape.is_none(),
            (Some(layers), 2) => {
                recipe.symbol == "compass"
                    && layers.len() <= 4
                    && layers.iter().enumerate().all(|(i, l)| {
                        valid_symbol_id(&l.symbol)
                            && color(&l.color)
                            && !layers[..i].iter().any(|p| p.symbol == l.symbol)
                    })
            }
            _ => false,
        }
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
pub fn composition_access(
    policy: CosmeticPolicy,
    evidence: SupporterEvidence,
    now: i64,
) -> InsigniaAccess {
    if policy == CosmeticPolicy::Unrestricted {
        InsigniaAccess::Available
    } else if !evidence.known || evidence.expires_at <= now {
        InsigniaAccess::Unavailable
    } else if evidence.active {
        InsigniaAccess::Available
    } else {
        InsigniaAccess::SupporterRequired
    }
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
/// Membership and color/slot checks are enforced on save, equip and profile reads.
pub fn recipe_access(
    catalog: &InsigniaCatalog,
    recipe: &InsigniaRecipe,
    policy: CosmeticPolicy,
    grants: &[String],
    evidence: SupporterEvidence,
    now: i64,
) -> InsigniaAccess {
    if !valid_insignia(recipe) {
        return InsigniaAccess::NotInstalled;
    }
    let Some(layers) = &recipe.layers else {
        return insignia_access(catalog, &recipe.symbol, policy, grants, evidence, now);
    };
    let mut counts = [0; 3];
    for layer in layers {
        let Some(item) = catalog.get(&layer.symbol) else {
            return InsigniaAccess::NotInstalled;
        };
        let group = match item.group {
            InsigniaGroup::Center => 0,
            InsigniaGroup::Stripes => 1,
            InsigniaGroup::Accents => 2,
            InsigniaGroup::Legacy => return InsigniaAccess::NotInstalled,
        };
        counts[group] += 1;
        if counts[group] > if group == 1 { 2 } else { 1 } {
            return InsigniaAccess::NotInstalled;
        }
        let access = insignia_access(catalog, &layer.symbol, policy, grants, evidence, now);
        if access != InsigniaAccess::Available {
            return access;
        }
    }
    // Each group has one color, including both stripe slots.
    for (i, l) in layers.iter().enumerate() {
        for r in &layers[..i] {
            if catalog.get(&l.symbol).unwrap().group == catalog.get(&r.symbol).unwrap().group
                && l.color != r.color
            {
                return InsigniaAccess::NotInstalled;
            }
        }
    }
    let advanced = counts[1] > 0 || layers.iter().any(|l| l.color != recipe.foreground);
    if advanced {
        return composition_access(policy, evidence, now);
    }
    InsigniaAccess::Available
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
        && recipe_access(catalog, recipe, policy, grants, evidence, now)
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
                group: InsigniaGroup::Legacy,
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
        assert_eq!(c.symbols().len(), FREE_INSIGNIAS.len());
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
                group: InsigniaGroup::Legacy,
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
    #[test]
    fn layered_recipes_enforce_group_limits_membership_and_preserve_missing_choices() {
        let c = InsigniaCatalog::default();
        let layer = |symbol: &str, color: &str| InsigniaLayer {
            symbol: symbol.into(),
            color: color.into(),
        };
        let mut r = InsigniaRecipe {
            version: 2,
            layers: Some(vec![
                layer("forge-wayfinder", "#cbb68d"),
                layer("forge-crown", "#cbb68d"),
            ]),
            ..Default::default()
        };
        let free = SupporterEvidence {
            known: true,
            active: false,
            expires_at: 100,
        };
        let active = SupporterEvidence {
            active: true,
            ..free
        };
        let access =
            |r: &InsigniaRecipe, e| recipe_access(&c, r, CosmeticPolicy::Supporter, &[], e, 1);
        assert!(valid_insignia(&r));
        assert_eq!(access(&r, free), InsigniaAccess::Available);
        r.layers.as_mut().unwrap()[0].color = "#abcdef".into();
        assert_eq!(access(&r, free), InsigniaAccess::SupporterRequired);
        assert_eq!(access(&r, active), InsigniaAccess::Available);
        r.layers
            .as_mut()
            .unwrap()
            .push(layer("forge-full-circle", "#abcdef"));
        assert_ne!(access(&r, active), InsigniaAccess::Available);
        r.layers = Some(vec![layer("missing-center", "#cbb68d")]);
        assert_eq!(access(&r, active), InsigniaAccess::NotInstalled);
        assert_eq!(
            effective_insignia(&c, &r, CosmeticPolicy::Supporter, &[], active, 1),
            InsigniaRecipe::default()
        );
        assert_eq!(r.layers.unwrap()[0].symbol, "missing-center");
    }
    #[test]
    fn shapes_roundtrip_are_free_and_do_not_change_legacy_recipes() {
        let base = InsigniaRecipe {
            version: 2,
            layers: Some(vec![]),
            ..Default::default()
        };
        let old = serde_json::to_value(&base).unwrap();
        assert!(old.get("shape").is_none());
        assert_eq!(serde_json::from_value::<InsigniaRecipe>(old).unwrap(), base);
        for shape in [
            InsigniaShape::Shield,
            InsigniaShape::Circle,
            InsigniaShape::RoundedSquare,
            InsigniaShape::Diamond,
            InsigniaShape::Hexagon,
        ] {
            let r = InsigniaRecipe {
                shape: Some(shape),
                ..base.clone()
            };
            assert_eq!(
                recipe_access(
                    &InsigniaCatalog::default(),
                    &r,
                    CosmeticPolicy::Supporter,
                    &[],
                    SupporterEvidence::default(),
                    100
                ),
                InsigniaAccess::Available
            );
            assert_eq!(
                serde_json::from_value::<InsigniaRecipe>(serde_json::to_value(&r).unwrap())
                    .unwrap(),
                r
            );
            assert!(!valid_insignia(&InsigniaRecipe {
                shape: Some(shape),
                ..Default::default()
            }));
        }
        let mut invalid = serde_json::to_value(base).unwrap();
        invalid["shape"] = serde_json::json!("arbitrary-css");
        assert!(serde_json::from_value::<InsigniaRecipe>(invalid).is_err());
    }

    #[test]
    fn legacy_recipe_roundtrips_without_new_fields() {
        let value = serde_json::to_value(InsigniaRecipe::default()).unwrap();
        assert!(value.get("layers").is_none());
        assert_eq!(
            serde_json::from_value::<InsigniaRecipe>(value).unwrap(),
            InsigniaRecipe::default()
        );
    }

    #[test]
    fn stripe_slots_and_group_colors_are_not_client_assertions() {
        let c = InsigniaCatalog::with_manifest(InsigniaManifest {
            version: 1,
            insignias: ["sample-a", "sample-b", "sample-c"]
                .into_iter()
                .map(|id| InsigniaSymbol {
                    group: InsigniaGroup::Stripes,
                    id: id.into(),
                    name: id.into(),
                    supporter: false,
                    sha256: "a".repeat(64),
                })
                .collect(),
        })
        .unwrap();
        let mut r = InsigniaRecipe {
            version: 2,
            layers: Some(
                ["sample-a", "sample-b"]
                    .into_iter()
                    .map(|id| InsigniaLayer {
                        symbol: id.into(),
                        color: "#cbb68d".into(),
                    })
                    .collect(),
            ),
            ..Default::default()
        };
        let evidence = SupporterEvidence {
            known: true,
            active: true,
            expires_at: 100,
        };
        let access =
            |r: &InsigniaRecipe, e| recipe_access(&c, r, CosmeticPolicy::Supporter, &[], e, 1);
        assert_eq!(access(&r, evidence), InsigniaAccess::Available);
        assert_eq!(
            access(
                &r,
                SupporterEvidence {
                    active: false,
                    ..evidence
                }
            ),
            InsigniaAccess::SupporterRequired
        );
        r.layers.as_mut().unwrap()[1].color = "#abcdef".into();
        assert_ne!(access(&r, evidence), InsigniaAccess::Available);
        r.layers.as_mut().unwrap()[1].color = "#cbb68d".into();
        r.layers.as_mut().unwrap().push(InsigniaLayer {
            symbol: "sample-c".into(),
            color: "#cbb68d".into(),
        });
        assert_ne!(access(&r, evidence), InsigniaAccess::Available);
        r.layers = Some(vec![]);
        r.symbol = "uninstalled".into();
        assert!(!valid_insignia(&r));
    }
}

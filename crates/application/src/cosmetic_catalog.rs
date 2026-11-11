//! Versioned data-only renderer registry. Hosted authoring cannot supply executable styles.
use crate::{valid_identity_text, valid_symbol_id};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogAccess {
    Free,
    Membership,
    Earned,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CosmeticScope {
    Account,
    Game,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CosmeticDye {
    pub id: String,
    pub name: String,
    pub color: String,
    pub tier: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub palette_id: Option<String>,
    pub access: CatalogAccess,
    pub scope: CosmeticScope,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CosmeticTreatment {
    pub id: String,
    pub name: String,
    pub family: String,
    pub renderer: String,
    pub parameters: BTreeMap<String, serde_json::Value>,
    pub access: CatalogAccess,
    pub scope: CosmeticScope,
    pub surfaces: Vec<String>,
    pub reduced_motion: String,
}
pub fn literal_cosmetic_color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}
pub fn named_dye(s: &str) -> Option<&str> {
    s.strip_prefix("dye:").filter(|id| valid_symbol_id(id))
}
impl CosmeticDye {
    pub fn valid(&self) -> bool {
        valid_symbol_id(&self.id)
            && !self.name.trim().is_empty()
            && valid_identity_text(&self.name, 64)
            && literal_cosmetic_color(&self.color)
            && valid_symbol_id(&self.tier)
            && self.palette_id.as_ref().is_none_or(|s| valid_symbol_id(s))
            && self.scope == CosmeticScope::Account
    }
}
type RendererDefinition<'a> = (&'a str, &'a [&'a str], &'a [(&'a str, f64, f64)]);
impl CosmeticTreatment {
    pub fn valid(&self) -> bool {
        if !valid_symbol_id(&self.id)
            || self.name.trim().is_empty()
            || !valid_identity_text(&self.name, 64)
            || self.scope != CosmeticScope::Account
            || self.reduced_motion != "static"
            || self.surfaces.is_empty()
            || self.surfaces.len() > 3
            || self
                .surfaces
                .iter()
                .any(|s| !matches!(s.as_str(), "emblem" | "collection" | "profile"))
        {
            return false;
        }
        if self.renderer == "plain" {
            return self.family == "finish" && self.parameters.is_empty();
        }
        let (family, patterns, bounds): RendererDefinition<'_> = match self.renderer.as_str() {
            "surface" => (
                "finish",
                &[
                    "satin",
                    "brushed",
                    "pearl",
                    "smoke",
                    "frost",
                    "enamel",
                    "etched",
                    "relief",
                    "glitter",
                    "foil",
                    "crosshatch",
                    "lenticular",
                    "ceramic",
                    "hammered",
                    "linen",
                    "carbon",
                    "stipple",
                    "patina",
                    "mosaic",
                    "contour",
                    "obsidian",
                    "gilded",
                    "crystalline",
                    "stardust",
                ],
                &[
                    ("strength", 0., 1.),
                    ("scale", 1., 32.),
                    ("angle", 0., 360.),
                ],
            ),
            "light" => (
                "light",
                &[
                    "gleam",
                    "rainbow",
                    "facets",
                    "oil",
                    "ripple",
                    "confetti",
                    "starfield",
                    "aurora",
                    "constellation",
                    "edge",
                    "halo",
                    "rays",
                    "eclipse",
                    "comet",
                    "pulse",
                    "scan",
                    "caustic",
                    "lightning",
                    "corona",
                    "supernova",
                ],
                &[
                    ("strength", 0., 1.),
                    ("duration_ms", 1000., 20000.),
                    ("scale", 1., 32.),
                    ("angle", 0., 360.),
                ],
            ),
            "interaction" => (
                "interaction",
                &[
                    "tilt",
                    "parallax",
                    "spotlight",
                    "reveal",
                    "tap-sweep",
                    "focus-trace",
                    "bevel",
                    "ripple",
                    "orbit",
                    "prism",
                    "lift",
                    "magnetic",
                    "iris",
                    "depth",
                    "starburst",
                    "portal",
                ],
                &[
                    ("strength", 0., 1.),
                    ("duration_ms", 150., 3000.),
                    ("depth", 0., 12.),
                ],
            ),
            _ => return false,
        };
        self.family == family
            && self
                .parameters
                .get("pattern")
                .and_then(|v| v.as_str())
                .is_some_and(|p| patterns.contains(&p))
            && self.parameters.iter().all(|(key, value)| {
                key == "pattern"
                    || bounds.iter().any(|(field, min, max)| {
                        key == field
                            && value
                                .as_f64()
                                .is_some_and(|v| v.is_finite() && v >= *min && v <= *max)
                    })
            })
            && bounds
                .iter()
                .all(|(key, _, _)| self.parameters.contains_key(*key))
    }
}
/// Bounded remote observation, never inserted into game-owned grant tables.
#[derive(Clone, Debug, Default)]
pub struct AccountCosmeticObservation {
    pub expires_at: i64,
    pub membership: bool,
    pub items: Vec<(String, String)>,
}
impl AccountCosmeticObservation {
    pub fn owns(&self, kind: &str, id: &str, now: i64) -> bool {
        self.expires_at > now && self.items.iter().any(|(k, i)| k == kind && i == id)
    }
}

pub fn community_timestamp_seconds(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|v| v.timestamp())
}
pub fn account_cosmetic_observation(
    owner: &serde_json::Value,
    now: i64,
) -> Option<AccountCosmeticObservation> {
    if owner["contract_version"].as_u64() != Some(1) {
        return None;
    }
    let observed = community_timestamp_seconds(owner["observed_at"].as_str()?)?;
    let expires = community_timestamp_seconds(owner["expires_at"].as_str()?)?;
    let membership_expires =
        community_timestamp_seconds(owner["membership"]["expires_at"].as_str()?)?;
    if observed > now + 5 || expires <= now || membership_expires <= now {
        return None;
    }
    let mut items = Vec::new();
    for item in owner["collection"].as_array()? {
        let reward = &item["reward"];
        if item["permanent"] == true && reward["scope"] == "account" {
            let kind = reward["kind"].as_str()?;
            let id = reward["item_id"].as_str()?;
            if valid_symbol_id(id) && matches!(kind, "dye" | "finish" | "effect" | "title" | "mark")
            {
                items.push((kind.into(), id.into()));
            }
        }
    }
    Some(AccountCosmeticObservation {
        expires_at: expires.min(membership_expires).min(now + 60),
        membership: owner["membership"]["active"].as_bool()?,
        items,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarkOwner {
    Account,
    Alliance,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum MarkRender {
    Emblem { item_id: String },
    Finish { item_id: String },
    Effect { item_id: String },
    SupportDuration { months: u16 },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CosmeticMark {
    pub id: String,
    pub name: String,
    pub scope: CosmeticScope,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    pub owner_kind: MarkOwner,
    pub access: CatalogAccess,
    pub render: MarkRender,
}
impl CosmeticMark {
    pub fn valid(&self, catalog: &crate::InsigniaCatalog) -> bool {
        if !valid_symbol_id(&self.id)
            || self.name.trim().is_empty()
            || !valid_identity_text(&self.name, 64)
            || self.access != CatalogAccess::Earned
        {
            return false;
        }
        match (&self.render, self.owner_kind, self.scope) {
            (
                MarkRender::SupportDuration { months },
                MarkOwner::Account,
                CosmeticScope::Account,
            ) => self.game_id.is_none() && (1..=1200).contains(months),
            (render, MarkOwner::Alliance, CosmeticScope::Game)
                if self.game_id.as_deref() == Some(crate::COMMUNITY_GAME_ID) =>
            {
                match render {
                    MarkRender::Emblem { item_id } => catalog.get(item_id).is_some(),
                    MarkRender::Finish { item_id } => catalog
                        .treatment(item_id)
                        .is_some_and(|t| t.family == "finish"),
                    MarkRender::Effect { item_id } => catalog
                        .treatment(item_id)
                        .is_some_and(|t| t.family != "finish"),
                    _ => false,
                }
            }
            _ => false,
        }
    }
    pub fn concrete_grant(&self) -> Option<(&str, &str)> {
        match &self.render {
            MarkRender::Emblem { item_id } => Some(("insignia", item_id)),
            MarkRender::Finish { item_id } => Some(("finish", item_id)),
            MarkRender::Effect { item_id } => Some(("effect", item_id)),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::*;
    use serde_json::json;
    fn catalog() -> InsigniaCatalog {
        InsigniaCatalog::with_manifest(serde_json::from_value(json!({"version":3,"insignias":[],"dyes":[
            {"id":"fixture-blue","name":"Fixture blue","color":"#123456","tier":"standard","access":"free","scope":"account"},
            {"id":"fixture-copper","name":"Fixture copper","color":"#aa6622","tier":"refined","access":"membership","scope":"account"},
            {"id":"fixture-violet","name":"Fixture violet","color":"#663399","tier":"mythic","access":"earned","scope":"account"}
        ],"treatments":[{"id":"fixture-brush","name":"Fixture brush","family":"finish","renderer":"surface","parameters":{"pattern":"brushed","strength":0.5,"scale":4,"angle":45},"access":"membership","scope":"account","surfaces":["emblem"],"reduced_motion":"static"}]})).unwrap()).unwrap()
    }
    fn recipe() -> InsigniaRecipe {
        InsigniaRecipe {
            version: 3,
            layers: Some(vec![]),
            foreground: "dye:fixture-copper".into(),
            background: "dye:fixture-blue".into(),
            ..Default::default()
        }
    }
    #[test]
    fn account_ownership_survives_membership_expiry_but_not_observation_expiry() {
        let mut c = catalog();
        let r = recipe();
        let evidence = SupporterEvidence {
            known: true,
            active: false,
            expires_at: 100,
        };
        assert_eq!(
            recipe_access(&c, &r, CosmeticPolicy::Supporter, &[], evidence, 50),
            InsigniaAccess::SupporterRequired
        );
        c.account_observation = Some(AccountCosmeticObservation {
            expires_at: 100,
            membership: false,
            items: vec![("dye".into(), "fixture-copper".into())],
        });
        assert_eq!(
            recipe_access(&c, &r, CosmeticPolicy::Supporter, &[], evidence, 50),
            InsigniaAccess::Available
        );
        assert_eq!(
            effective_insignia(&c, &r, CosmeticPolicy::Supporter, &[], evidence, 101),
            InsigniaRecipe::default()
        );
        assert_eq!(r.foreground, "dye:fixture-copper");
        assert_eq!(
            recipe_access(
                &InsigniaCatalog::default(),
                &r,
                CosmeticPolicy::All,
                &[],
                evidence,
                50
            ),
            InsigniaAccess::NotInstalled
        );
    }
    #[test]
    fn membership_never_unlocks_exclusive_dyes_and_owned_effect_never_grants_dye() {
        let c = catalog();
        let mut r = recipe();
        r.foreground = "dye:fixture-violet".into();
        let evidence = SupporterEvidence {
            known: true,
            active: true,
            expires_at: 100,
        };
        assert_eq!(
            recipe_access(&c, &r, CosmeticPolicy::Supporter, &[], evidence, 50),
            InsigniaAccess::SupporterRequired
        );
        let mut c = c;
        c.account_observation = Some(AccountCosmeticObservation {
            expires_at: 100,
            membership: false,
            items: vec![("finish".into(), "fixture-brush".into())],
        });
        r = recipe();
        r.finish = Some("fixture-brush".into());
        assert_eq!(
            recipe_access(
                &c,
                &r,
                CosmeticPolicy::Supporter,
                &[],
                SupporterEvidence {
                    active: false,
                    ..evidence
                },
                50
            ),
            InsigniaAccess::SupporterRequired
        );
    }
    #[test]
    fn malformed_renderers_cannot_supply_styles_or_unbounded_motion() {
        let c = catalog();
        let treatment = c.treatments()[0].clone();
        assert!(treatment.valid());
        let mut invalid = treatment.clone();
        invalid
            .parameters
            .insert("css".into(), json!("url(https://example.test)"));
        assert!(!invalid.valid());
        let mut invalid = treatment.clone();
        invalid.parameters.insert("strength".into(), json!(1.1));
        assert!(!invalid.valid());
        let mut invalid = treatment;
        invalid.renderer = "arbitrary-script".into();
        assert!(!invalid.valid());
    }
    #[test]
    fn legacy_literal_colors_remain_readable_but_edits_require_named_colors() {
        let old = InsigniaRecipe::default();
        assert!(valid_insignia(&old));
        assert!(named_color_edits(Some(&old), &old));
        let changed = InsigniaRecipe {
            foreground: "#ffffff".into(),
            ..old.clone()
        };
        assert!(!named_color_edits(Some(&old), &changed));
        assert!(!named_color_edits(None, &old));
        assert!(named_color_edits(None, &recipe()));
    }
    #[test]
    fn observations_only_include_permanent_account_items_and_expire() {
        let owner = json!({"contract_version":1,"observed_at":"2026-01-01T00:00:00Z","expires_at":"2026-01-01T00:10:00Z","membership":{"active":true,"expires_at":"2026-01-01T00:05:00Z"},"collection":[
            {"permanent":true,"reward":{"scope":"account","kind":"dye","item_id":"fixture-blue"}},
            {"permanent":false,"reward":{"scope":"account","kind":"dye","item_id":"fixture-copper"}},
            {"permanent":true,"reward":{"scope":"game","kind":"title","item_id":"fixture-title"}}
        ]});
        let now = 1767225600;
        let observation = account_cosmetic_observation(&owner, now).unwrap();
        assert_eq!(observation.expires_at, now + 60);
        assert_eq!(
            observation.items,
            vec![("dye".into(), "fixture-blue".into())]
        );
        assert!(observation.membership);
        assert!(account_cosmetic_observation(&owner, now + 600).is_none());
    }
}

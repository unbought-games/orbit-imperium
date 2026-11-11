//! Versioned authored presentation. No rendered content or computed visibility is stored.
use super::AllianceError;
use crate::InsigniaRecipe;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum AllianceCrest {
    Composition { recipe: InsigniaRecipe },
    Upload { media_id: Uuid },
}
impl Default for AllianceCrest {
    fn default() -> Self {
        Self::Composition {
            recipe: InsigniaRecipe::default(),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaPlacement {
    pub media_id: Uuid,
    /// Percentages make authored focal points exact and easy to edit.
    pub x: u8,
    pub y: u8,
    pub mobile_x: Option<u8>,
    pub mobile_y: Option<u8>,
    pub alt: String,
}
impl MediaPlacement {
    pub fn validate(&self) -> Result<(), AllianceError> {
        if self.media_id.is_nil()
            || self.x > 100
            || self.y > 100
            || self.mobile_x.is_some_and(|n| n > 100)
            || self.mobile_y.is_some_and(|n| n > 100)
        {
            return invalid("invalid image placement");
        }
        text(&self.alt, 300)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct AllianceVisualIdentity {
    pub motto: String,
    pub primary: String,
    pub secondary: String,
    pub crest: AllianceCrest,
    pub banner: Option<MediaPlacement>,
}
impl Default for AllianceVisualIdentity {
    fn default() -> Self {
        Self {
            motto: String::new(),
            primary: "#cbb68d".into(),
            secondary: "#a4dbef".into(),
            crest: Default::default(),
            banner: None,
        }
    }
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct AllianceHall {
    pub welcome_markdown: String,
    pub community_markdown: String,
    pub background: Option<MediaPlacement>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceTemplateDocument {
    pub schema_version: u16,
    pub content: Value,
}
impl Default for AllianceTemplateDocument {
    fn default() -> Self {
        Self {
            schema_version: 1,
            content: serde_json::json!({}),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct AlliancePresentation {
    pub schema_version: u16,
    pub identity: AllianceVisualIdentity,
    pub hall: AllianceHall,
    pub active_template: String,
    pub templates: BTreeMap<String, AllianceTemplateDocument>,
}
impl Default for AlliancePresentation {
    fn default() -> Self {
        Self {
            schema_version: 1,
            identity: Default::default(),
            hall: Default::default(),
            active_template: "flagship".into(),
            templates: Default::default(),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum PresentationEdit {
    SetIdentity {
        schema_version: u16,
        value: AllianceVisualIdentity,
    },
    SetHall {
        schema_version: u16,
        value: AllianceHall,
    },
    SetTemplateDocument {
        template_id: String,
        document: AllianceTemplateDocument,
    },
    SelectTemplate {
        template_id: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateField {
    pub key: String,
    pub label: String,
    pub kind: String,
    pub max_length: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AllianceTemplateDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub schema_version: u16,
    pub fields: Vec<TemplateField>,
}
/// The editor consumes these definitions; field lists are not duplicated in JS.
pub fn alliance_templates() -> Vec<AllianceTemplateDefinition> {
    let field = |key: &str, label: &str, kind: &str, max_length| TemplateField {
        key: key.into(),
        label: label.into(),
        kind: kind.into(),
        max_length,
    };
    let common = || {
        vec![
            field("community_markdown", "Community links", "markdown", 4000),
            field("hero_media", "Artwork", "media", 1),
        ]
    };
    [
        (
            "flagship",
            "Flagship",
            "A cinematic invitation to your alliance.",
            vec![
                field("hero_markdown", "Hero introduction", "markdown", 1200),
                field("recruitment_heading", "Recruitment heading", "text", 120),
                field(
                    "recruitment_markdown",
                    "Recruitment message",
                    "markdown",
                    8000,
                ),
            ],
        ),
        (
            "transmission",
            "Transmission",
            "A personal letter to your next commander.",
            vec![
                field("letter_heading", "Letter heading", "text", 120),
                field("letter_markdown", "Your letter", "markdown", 12000),
                field("signature", "Signature", "text", 160),
            ],
        ),
        (
            "citadel",
            "Citadel",
            "A showcase for the world you are building together.",
            vec![
                field("hero_heading", "Hero heading", "text", 120),
                field("hero_markdown", "Hero introduction", "markdown", 1200),
                field("sections", "Story sections", "sections", 4),
                field("gallery", "Gallery", "gallery", 6),
            ],
        ),
    ]
    .into_iter()
    .map(|(id, name, description, mut fields)| {
        fields.extend(common());
        AllianceTemplateDefinition {
            id: id.into(),
            name: name.into(),
            description: description.into(),
            schema_version: 1,
            fields,
        }
    })
    .collect()
}
pub fn known_template(id: &str) -> bool {
    alliance_templates().iter().any(|t| t.id == id)
}
fn invalid<T>(message: &str) -> Result<T, AllianceError> {
    Err(AllianceError::InvalidInput(message.into()))
}
fn text(s: &str, max: usize) -> Result<(), AllianceError> {
    if s.chars().count() > max
        || s.chars()
            .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
    {
        invalid("presentation text is too long or contains control characters")
    } else {
        Ok(())
    }
}
fn color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}
fn placement(v: &Value) -> Result<MediaPlacement, AllianceError> {
    let p: MediaPlacement = serde_json::from_value(v.clone())
        .map_err(|_| AllianceError::InvalidInput("invalid image placement".into()))?;
    p.validate()?;
    Ok(p)
}
pub fn validate_template(
    id: &str,
    document: &AllianceTemplateDocument,
) -> Result<(), AllianceError> {
    let Some(definition) = alliance_templates().into_iter().find(|t| t.id == id) else {
        return invalid("unknown template");
    };
    if document.schema_version != definition.schema_version
        || document.content.to_string().len() > 32768
    {
        return invalid("unsupported template version or document size");
    }
    let Some(values) = document.content.as_object() else {
        return invalid("template content must be an object");
    };
    for (key, value) in values {
        let Some(field) = definition.fields.iter().find(|f| &f.key == key) else {
            return invalid("unknown template field");
        };
        match field.kind.as_str() {
            "text" | "markdown" => text(
                value.as_str().ok_or_else(|| {
                    AllianceError::InvalidInput("text field must be a string".into())
                })?,
                field.max_length,
            )?,
            "media" => {
                if !value.is_null() {
                    placement(value)?;
                }
            }
            "gallery" => {
                let Some(items) = value.as_array() else {
                    return invalid("gallery must be a list");
                };
                if items.len() > field.max_length {
                    return invalid("too many gallery images");
                }
                for item in items {
                    placement(item)?;
                }
            }
            "sections" => {
                let Some(items) = value.as_array() else {
                    return invalid("sections must be a list");
                };
                if items.len() > field.max_length {
                    return invalid("too many sections");
                }
                for item in items {
                    let Some(o) = item.as_object() else {
                        return invalid("invalid section");
                    };
                    if o.keys()
                        .any(|k| !matches!(k.as_str(), "heading" | "markdown"))
                    {
                        return invalid("unknown section field");
                    }
                    for (key, max) in [("heading", 120), ("markdown", 8000)] {
                        text(
                            o.get(key).and_then(Value::as_str).ok_or_else(|| {
                                AllianceError::InvalidInput(
                                    "section needs a heading and Markdown".into(),
                                )
                            })?,
                            max,
                        )?;
                    }
                }
            }
            _ => return invalid("unknown field type"),
        }
    }
    Ok(())
}
impl AllianceVisualIdentity {
    pub fn validate(&self) -> Result<(), AllianceError> {
        text(&self.motto, 160)?;
        if !color(&self.primary) || !color(&self.secondary) {
            return invalid("choose literal hex colors");
        }
        match &self.crest {
            AllianceCrest::Upload { media_id } if media_id.is_nil() => {
                return invalid("invalid crest image");
            }
            AllianceCrest::Composition { recipe } => {
                let identifier = |s: &str| {
                    !s.is_empty()
                        && s.len() <= 64
                        && s.bytes()
                            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                };
                if !matches!(recipe.version, 1 | 2)
                    || !identifier(&recipe.symbol)
                    || !color(&recipe.foreground)
                    || !color(&recipe.background)
                    || recipe.layers.as_ref().is_some_and(|ls| {
                        ls.len() > 4
                            || ls
                                .iter()
                                .any(|l| !identifier(&l.symbol) || !color(&l.color))
                    })
                {
                    return invalid("invalid crest composition");
                }
            }
            _ => {}
        }
        if let Some(p) = &self.banner {
            p.validate()?;
        }
        Ok(())
    }
    pub fn media_ids(&self) -> BTreeSet<Uuid> {
        let mut ids = BTreeSet::new();
        if let AllianceCrest::Upload { media_id } = self.crest {
            ids.insert(media_id);
        }
        if let Some(p) = &self.banner {
            ids.insert(p.media_id);
        }
        ids
    }
}
impl AlliancePresentation {
    pub fn edited(&self, edits: &[PresentationEdit]) -> Result<Self, AllianceError> {
        if self.schema_version != 1 || edits.is_empty() || edits.len() > 8 {
            return invalid("unsupported presentation or edit count");
        }
        let mut result = self.clone();
        let mut changed = BTreeSet::new();
        for edit in edits {
            let key = match edit {
                PresentationEdit::SetIdentity {
                    schema_version,
                    value,
                } => {
                    if *schema_version != 1 {
                        return invalid("unsupported identity version");
                    };
                    value.validate()?;
                    result.identity = value.clone();
                    "identity".to_string()
                }
                PresentationEdit::SetHall {
                    schema_version,
                    value,
                } => {
                    if *schema_version != 1 {
                        return invalid("unsupported hall version");
                    };
                    text(&value.welcome_markdown, 8000)?;
                    text(&value.community_markdown, 4000)?;
                    if let Some(p) = &value.background {
                        p.validate()?;
                    }
                    result.hall = value.clone();
                    "hall".into()
                }
                PresentationEdit::SetTemplateDocument {
                    template_id,
                    document,
                } => {
                    validate_template(template_id, document)?;
                    result
                        .templates
                        .insert(template_id.clone(), document.clone());
                    format!("template:{template_id}")
                }
                PresentationEdit::SelectTemplate { template_id } => {
                    if !known_template(template_id) {
                        return invalid("unknown template");
                    };
                    result.active_template = template_id.clone();
                    "selection".into()
                }
            };
            if !changed.insert(key) {
                return invalid("duplicate presentation edit");
            }
        }
        Ok(result)
    }
    pub fn public_media_ids(&self) -> BTreeSet<Uuid> {
        let mut ids = self.identity.media_ids();
        if known_template(&self.active_template)
            && let Some(doc) = self.templates.get(&self.active_template)
            && doc.schema_version == 1
        {
            ids.extend(template_media_ids(doc));
        }
        ids
    }
    pub fn member_media_ids(&self) -> BTreeSet<Uuid> {
        let mut ids = self.public_media_ids();
        if let Some(p) = &self.hall.background {
            ids.insert(p.media_id);
        }
        ids
    }
    pub fn all_media_ids(&self) -> BTreeSet<Uuid> {
        let mut ids = self.member_media_ids();
        for d in self.templates.values() {
            ids.extend(template_media_ids(d));
        }
        ids
    }
}
pub fn template_media_ids(document: &AllianceTemplateDocument) -> BTreeSet<Uuid> {
    let mut ids = BTreeSet::new();
    if let Some(v) = document.content.get("hero_media").filter(|v| !v.is_null())
        && let Ok(p) = placement(v)
    {
        ids.insert(p.media_id);
    }
    if let Some(items) = document.content.get("gallery").and_then(Value::as_array) {
        for v in items {
            if let Ok(p) = placement(v) {
                ids.insert(p.media_id);
            }
        }
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn template_switches_preserve_authored_content_and_reject_lossy_writes() {
        let p = AlliancePresentation::default()
            .edited(&[
                PresentationEdit::SetTemplateDocument {
                    template_id: "transmission".into(),
                    document: AllianceTemplateDocument {
                        schema_version: 1,
                        content: serde_json::json!({"letter_markdown":"Hello, commander"}),
                    },
                },
                PresentationEdit::SelectTemplate {
                    template_id: "transmission".into(),
                },
            ])
            .unwrap();
        let p = p
            .edited(&[PresentationEdit::SelectTemplate {
                template_id: "flagship".into(),
            }])
            .unwrap();
        assert_eq!(
            p.templates["transmission"].content["letter_markdown"],
            "Hello, commander"
        );
        assert!(
            validate_template(
                "flagship",
                &AllianceTemplateDocument {
                    schema_version: 2,
                    ..Default::default()
                }
            )
            .is_err()
        );
        assert!(
            validate_template(
                "flagship",
                &AllianceTemplateDocument {
                    content: serde_json::json!({"css":"body{}"}),
                    ..Default::default()
                }
            )
            .is_err()
        );
    }
    #[test]
    fn public_references_exclude_hall_and_inactive_templates() {
        let p = |n| MediaPlacement {
            media_id: Uuid::from_u128(n),
            x: 50,
            y: 50,
            mobile_x: None,
            mobile_y: None,
            alt: String::new(),
        };
        let mut a = AlliancePresentation::default();
        a.identity.banner = Some(p(1));
        a.hall.background = Some(p(2));
        a.templates.insert(
            "transmission".into(),
            AllianceTemplateDocument {
                content: serde_json::json!({"hero_media":p(3)}),
                ..Default::default()
            },
        );
        assert_eq!(a.public_media_ids(), BTreeSet::from([Uuid::from_u128(1)]));
        assert_eq!(
            a.member_media_ids(),
            BTreeSet::from([Uuid::from_u128(1), Uuid::from_u128(2)])
        );
        assert_eq!(a.all_media_ids().len(), 3);
    }
}

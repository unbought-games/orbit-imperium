use crate::{Customization, location_card};
use base64::{Engine, engine::general_purpose::STANDARD};
use orbit_application::InvitationUniverse;
use serde_json::Value;
use std::path::Path;

pub struct InvitationCard {
    pub sender: String,
    pub empire: String,
    pub title: String,
    pub universe: InvitationUniverse,
    pub emblem: Option<String>,
}
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn bounded(text: &str) -> String {
    text.chars().take(96).collect()
}
fn data(bytes: &[u8], mime: &str) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}
impl InvitationCard {
    pub fn page_html(template: &str, metadata: &str) -> Option<String> {
        let start = template.find("<!--orbit-page-metadata:start-->")?;
        let end = template.find("<!--orbit-page-metadata:end-->")?
            + "<!--orbit-page-metadata:end-->".len();
        if end < start {
            return None;
        }
        let mut html = template.to_owned();
        html.replace_range(start..end, metadata);
        crate::bootstrap_html::render_bootstrap_html(
            &html,
            &orbit_application::Bootstrap {
                version: 1,
                signup_enabled: false,
                result: orbit_application::BootstrapResult::Anonymous,
            },
        )
        .ok()
    }
    pub fn metadata(&self, canonical: &str) -> String {
        let title = escape(&format!(
            "{} invites you to {} · Orbit Imperium",
            self.sender, self.universe.name
        ));
        let description = escape(&format!(
            "Your personal invitation to join {} in {}. Build an empire, launch your fleet, and find your allies.",
            self.empire, self.universe.name
        ));
        let canonical = escape(canonical);
        format!(
            r#"<title>{title}</title><meta name="description" content="{description}"><link rel="canonical" href="{canonical}"><meta property="og:type" content="website"><meta property="og:site_name" content="Orbit Imperium"><meta property="og:title" content="{title}"><meta property="og:description" content="{description}"><meta property="og:url" content="{canonical}"><meta property="og:image" content="{canonical}/preview.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{title}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}"><meta name="twitter:description" content="{description}"><meta name="twitter:image" content="{canonical}/preview.png">"#
        )
    }
    pub async fn emblem(
        appearance: Option<&Value>,
        customization: Option<&Customization>,
    ) -> Result<Option<String>, String> {
        let (Some(a), Some(c)) = (appearance.filter(|v| !v.is_null()), customization) else {
            return Ok(None);
        };
        let background = a["rendering"]["background"]
            .as_str()
            .or(a["recipe"]["background"].as_str())
            .unwrap_or("#152b40");
        let shape = serde_json::from_value(a["recipe"]["shape"].clone()).ok();
        let (outline, height) = crate::alliance_card_art::crest_outline(shape);
        let layer_y = (height as f32 - 78.) / 2.;
        let mut layers = String::new();
        let items = if let Some(items) = a["layers"].as_array() {
            items.clone()
        } else {
            vec![
                serde_json::json!({"symbol":a["recipe"]["symbol"],"color":a["rendering"]["foreground"].as_str().or(a["recipe"]["foreground"].as_str()).unwrap_or("#cbb68d")}),
            ]
        };
        for (index, layer) in items.iter().enumerate() {
            let Some(symbol) = layer["symbol"].as_str().and_then(|id| c.catalog.get(id)) else {
                continue;
            };
            let bytes = c
                .assets
                .read(&symbol.key())
                .await
                .map_err(|_| "Emblem artwork unavailable")?;
            if bytes.len() > 65536 {
                return Err("Emblem artwork too large".into());
            }
            let art = data(&bytes, "image/svg+xml");
            let color = escape(layer["color"].as_str().unwrap_or("#cbb68d"));
            layers.push_str(&format!(r#"<defs><mask id="m{index}" mask-type="alpha"><image href="{art}" x="11" y="{layer_y}" width="78" height="78"/></mask></defs><rect width="100" height="{height}" fill="{color}" mask="url(#m{index})"/>"#));
        }
        let background = escape(background);
        Ok(Some(format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="{height}" viewBox="0 0 100 {height}"><defs><clipPath id="crest">{outline}</clipPath></defs><g clip-path="url(#crest)"><rect width="100" height="{height}" fill="{background}"/>{layers}</g></svg>"#
        )))
    }
    fn svg(&self, assets: &str, options: &resvg::usvg::Options<'_>) -> Result<String, String> {
        let root = Path::new(assets);
        let planet = data(
            &std::fs::read(root.join(format!(
                "art/atlas/planet-{:02}-1200.webp",
                self.universe.art_slot.clamp(1, 15)
            )))
            .map_err(|e| e.to_string())?,
            "image/webp",
        );
        let atmosphere = data(
            &std::fs::read(root.join("art/atlas/atmosphere-1600.webp"))
                .map_err(|e| e.to_string())?,
            "image/webp",
        );
        let emblem = self.emblem.as_ref().map_or(String::new(), |svg| {
            format!(
                r#"<image href="{}" x="52" y="218" width="144" height="158"/>"#,
                data(svg.as_bytes(), "image/svg+xml")
            )
        });
        let identity_x = if self.emblem.is_some() { 224 } else { 52 };
        let identity_width: f32 = if self.emblem.is_some() { 554. } else { 730. };
        let sender = bounded(&self.sender);
        let sender_size = location_card::size(&sender, 66., identity_width, 0., 600, options)?;
        let empire = bounded(self.empire.trim());
        let empire_size =
            location_card::size(&empire, 26., identity_width.min(680.), 0., 400, options)?;
        let universe = format!("Join me in {}", bounded(&self.universe.name));
        let universe_size = location_card::size(&universe, 31., 720., 0., 600, options)?;
        let sender = escape(&sender);
        let empire = escape(&empire);
        let universe = escape(&bounded(&self.universe.name));
        let title = bounded(&self.title);
        let title_size =
            location_card::size(&title, 19., identity_width.min(680.), 0., 400, options)?;
        let title = escape(&title);
        let mut identity = format!(
            r##"<text id="sender" x="{identity_x}" y="0" font-size="{sender_size}" font-weight="600">{sender}</text><text id="title" x="{identity_x}" y="45" font-size="{title_size}" fill="#d9c398">{title}</text>"##
        );
        if !empire.is_empty() {
            identity.push_str(&format!(
                r##"<text id="empire" x="{identity_x}" y="89" font-size="{empire_size}" fill="#b9ccd8">{empire}</text>"##
            ));
        }
        // Center the visible glyphs, including fitted long names, on the insignia.
        let identity_tree = resvg::usvg::Tree::from_str(
            &format!(r#"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><g font-family="IBM Plex Sans">{identity}</g></svg>"#),
            options,
        ).map_err(|e| e.to_string())?;
        let mut top = f32::INFINITY;
        let mut bottom = f32::NEG_INFINITY;
        for id in ["sender", "title", "empire"] {
            if let Some(resvg::usvg::Node::Text(text)) = identity_tree.node_by_id(id) {
                let bounds = text.flattened().abs_bounding_box();
                top = top.min(bounds.top());
                bottom = bottom.max(bounds.bottom());
            }
        }
        let identity_y = if top.is_finite() {
            297. - (top + bottom) / 2.
        } else {
            297.
        };
        Ok(format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="shade"><stop stop-color="#03111c"/><stop offset=".62" stop-color="#03111c" stop-opacity=".9"/><stop offset="1" stop-color="#03111c" stop-opacity=".08"/></linearGradient></defs><rect width="1200" height="630" fill="#03111c"/><image href="{atmosphere}" width="1200" height="750"/><image href="{planet}" x="620" y="-130" width="840" height="840"/><rect width="1200" height="630" fill="url(#shade)"/><path d="M48 110H1152M48 540H1152" stroke="#cbb68d" stroke-opacity=".55"/><g font-family="IBM Plex Sans" fill="#edf4f7"><text x="52" y="72" font-size="26" letter-spacing="5" fill="#d9c398">ORBIT IMPERIUM</text><text x="52" y="174" font-size="16" letter-spacing="4" fill="#b8d9e8">YOUR PERSONAL INVITATION</text><g transform="translate(0 {identity_y})">{identity}</g><text x="52" y="474" font-size="{universe_size}" font-weight="600">Join me in <tspan fill="#85d6ef">{universe}</tspan></text><text x="52" y="587" font-size="18" fill="#b8d9e8">Games worth playing.</text></g>{emblem}</svg>"##
        ))
    }
    pub fn render(&self, assets: &str) -> Result<Vec<u8>, String> {
        let options = location_card::render_options();
        let svg = self.svg(assets, &options)?;
        let tree = resvg::usvg::Tree::from_str(&svg, &options).map_err(|e| e.to_string())?;
        let mut pixels =
            resvg::tiny_skia::Pixmap::new(1200, 630).ok_or("Image allocation failed")?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::default(),
            &mut pixels.as_mut(),
        );
        pixels.encode_png().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn card() -> InvitationCard {
        InvitationCard {
            sender: "Captain <Nova> & friends".into(),
            empire: "The Long Horizon".into(),
            title: "Commander".into(),
            universe: InvitationUniverse {
                id: uuid::Uuid::new_v4(),
                epoch_id: uuid::Uuid::new_v4(),
                name: "Andromeda & beyond".into(),
                speed: 5,
                galaxies: 2,
                systems_per_galaxy: 100,
                players: 27,
                max_players: Some(500),
                signup_enabled: true,
                art_slot: 4,
            },
            emblem: None,
        }
    }
    #[test]
    fn metadata_replaces_the_single_marker_and_escapes_public_names() {
        let c = card();
        let url = "https://orbit.example/invite/inv_code";
        let metadata = c.metadata(url);
        let template = include_str!("../../../apps/web/index.html");
        let html = InvitationCard::page_html(template, &metadata).unwrap();
        assert_eq!(html.matches("<title>").count(), 1);
        for property in ["og:title", "og:image", "twitter:card"] {
            assert_eq!(html.matches(&format!("{property}\"")).count(), 1);
        }
        assert!(html.contains("Captain &lt;Nova&gt; &amp; friends"));
        assert!(html.contains("https://orbit.example/invite/inv_code/preview.png"));
        assert!(!html.contains("orbit-page-metadata:start"));
        assert!(InvitationCard::page_html("<html></html>", &metadata).is_none());
    }
    #[test]
    fn visible_identity_lines_center_on_the_insignia() {
        let assets = concat!(env!("CARGO_MANIFEST_DIR"), "/../../apps/web/public");
        let options = location_card::render_options();
        for (label, sender, empire) in [
            ("two-lines", "eth".to_owned(), ""),
            ("three-lines", "eth".to_owned(), "The Long Horizon"),
            ("blank-empire", "eth".to_owned(), "   "),
            ("long-name", "Wide Commander ".repeat(8), "The Long Horizon"),
        ] {
            let mut c = card();
            c.sender = sender;
            c.empire = empire.into();
            c.universe.name = "Andromeda".into();
            c.emblem = Some(r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="16" fill="#faffdf"/><path d="M50 22 58 42 80 50 58 58 50 78 42 58 20 50 42 42Z" fill="#15a200"/></svg>"##.into());
            let svg = c.svg(assets, &options).unwrap();
            let tree = resvg::usvg::Tree::from_str(&svg, &options).unwrap();
            let mut top = f32::INFINITY;
            let mut bottom = f32::NEG_INFINITY;
            for id in ["sender", "title", "empire"] {
                if id == "empire" && empire.trim().is_empty() {
                    assert!(tree.node_by_id(id).is_none(), "{label}: empty third line");
                    continue;
                }
                let Some(resvg::usvg::Node::Text(text)) = tree.node_by_id(id) else {
                    panic!("{label}: missing {id}");
                };
                let bounds = text
                    .flattened()
                    .bounding_box()
                    .transform(text.abs_transform())
                    .unwrap();
                top = top.min(bounds.top());
                bottom = bottom.max(bounds.bottom());
                assert!(
                    bounds.right() <= 779.,
                    "{label}: {id} exceeds available width"
                );
            }
            assert!(
                ((top + bottom) / 2. - 297.).abs() < 0.1,
                "{label}: {top}..{bottom}"
            );
            assert!(
                top >= 218. && bottom <= 376.,
                "{label}: text exceeds insignia height"
            );
            assert!(svg.contains(r##"Join me in <tspan fill="#85d6ef">Andromeda</tspan>"##));
            assert!(svg.contains("Games worth playing."));
            assert!(!svg.contains("× UNIVERSE") && !svg.contains("BUILD. EXPLORE. BELONG."));
            if let Ok(dir) = std::env::var("ORBIT_PREVIEW_OUTPUT") {
                std::fs::create_dir_all(&dir).unwrap();
                std::fs::write(
                    Path::new(&dir).join(format!("invite-{label}.png")),
                    c.render(assets).unwrap(),
                )
                .unwrap();
            }
        }
    }
    #[test]
    fn long_names_render_as_bounded_png_using_bundled_fonts() {
        let mut c = card();
        c.sender = "Wide 世界 👩‍🚀 ".repeat(8);
        c.universe.name =
            "A distant universe with an exceptionally long invitation destination 世界".into();
        let assets = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/public");
        let png = c.render(assets.to_str().unwrap()).unwrap();
        let image = image::load_from_memory(&png).unwrap();
        assert_eq!((image.width(), image.height()), (1200, 630));
    }
}

#[cfg(test)]
mod emblem_tests {
    use super::*;
    use orbit_application::{
        AssetError, AssetFuture, AssetStore, CosmeticPolicy, FREE_INSIGNIAS, InsigniaCatalog,
        InsigniaRecipe,
    };
    struct FreeAssets;
    impl AssetStore for FreeAssets {
        fn read<'a>(&'a self, key: &'a str) -> AssetFuture<'a, Vec<u8>> {
            Box::pin(async move {
                let catalog = InsigniaCatalog::default();
                FREE_INSIGNIAS
                    .iter()
                    .find(|(id, _, _)| catalog.get(id).is_some_and(|item| item.key() == key))
                    .map(|(_, _, bytes)| bytes.to_vec())
                    .ok_or(AssetError::Unavailable)
            })
        }
        fn write<'a>(&'a self, _key: &'a str, _bytes: Vec<u8>) -> AssetFuture<'a, ()> {
            Box::pin(async { panic!("public metadata must not write artwork") })
        }
    }
    #[tokio::test]
    async fn equipped_nonshield_shape_and_actual_base_colors_are_preserved() {
        let c = Customization {
            media_limits: Default::default(),
            policy: CosmeticPolicy::Unrestricted,
            assets: std::sync::Arc::new(FreeAssets),
            catalog: InsigniaCatalog::default(),
        };
        let recipe:InsigniaRecipe=serde_json::from_value(serde_json::json!({"version":1,"symbol":"compass","foreground":"#abcdef","background":"#123456","shape":"circle"})).unwrap();
        let appearance = serde_json::to_value(c.appearance(recipe)).unwrap();
        let svg = InvitationCard::emblem(Some(&appearance), Some(&c))
            .await
            .unwrap()
            .unwrap();
        assert!(svg.contains("<circle cx=\"50\" cy=\"50\" r=\"50\"/>"));
        assert!(svg.contains("#abcdef") && svg.contains("#123456"));
        assert!(!svg.contains("Q100 110"));
        let options = location_card::render_options();
        assert!(resvg::usvg::Tree::from_str(&svg, &options).is_ok());
    }
}

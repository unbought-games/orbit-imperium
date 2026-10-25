//! One deterministic template. Only the appearance and display content vary.
use base64::{Engine, engine::general_purpose::STANDARD};
use orbit_application::*;
use std::path::Path;
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Target {
    Planet,
    Moon,
    Debris,
}
pub(super) struct Card {
    pub appearance: LocationAppearance,
    pub target: Target,
    pub owner: Option<(String, Option<u8>)>,
}
fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn bounded(s: &str, max: usize) -> String {
    let mut chars = s.chars();
    let prefix: String = chars.by_ref().take(max).collect();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}
fn size(text: &str, max: f32, width: f32) -> f32 {
    max.min(width / (text.chars().count().max(1) as f32 * 0.66))
}
fn asset(root: &Path, name: &str, mime: &str) -> Result<String, String> {
    let bytes = std::fs::read(root.join(name)).map_err(|e| e.to_string())?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
impl Card {
    fn suffix(&self) -> &'static str {
        match self.target {
            Target::Planet => "",
            Target::Moon => "?target=moon",
            Target::Debris => "?target=debris",
        }
    }
    fn coordinates(&self) -> String {
        let c = self.appearance.coordinates;
        format!("[{}:{}:{}]", c.galaxy, c.system, c.position)
    }
    fn title(&self) -> String {
        self.appearance
            .body
            .as_ref()
            .map(|b| {
                b.name.clone().unwrap_or_else(|| {
                    if b.kind == LocationBodyKind::Moon {
                        "Moon"
                    } else {
                        "Planet"
                    }
                    .into()
                })
            })
            .unwrap_or_else(|| {
                match self.target {
                    Target::Moon => "Moon unavailable",
                    Target::Planet => "Empty position",
                    Target::Debris => "Debris location",
                }
                .into()
            })
    }
    pub fn metadata(&self, url: &str) -> String {
        let title = escape(&format!(
            "{} {} · {}",
            self.title(),
            self.coordinates(),
            self.appearance.universe_name
        ));
        let description = escape(&self.owner.as_ref().map_or_else(
            || "View this location in Orbit Imperium.".into(),
            |(name, _)| {
                format!(
                    "{name}’s {} in Orbit Imperium.",
                    if self.target == Target::Moon {
                        "moon"
                    } else {
                        "planet"
                    }
                )
            },
        ));
        let image = escape(&format!("{url}/preview.png{}", self.suffix()));
        let canonical = escape(&format!("{url}{}", self.suffix()));
        format!(
            r#"<meta property="og:type" content="website"><meta property="og:site_name" content="Orbit Imperium"><meta property="og:title" content="{title}"><meta property="og:description" content="{description}"><meta property="og:url" content="{canonical}"><meta property="og:image" content="{image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{title}"><meta name="twitter:card" content="summary_large_image">"#
        )
    }
    pub fn art_key(&self) -> Option<String> {
        self.appearance.body.as_ref().map(|b| {
            if b.kind == LocationBodyKind::Moon {
                // Same stable FNV-1a identity as ui/artwork.ts.
                let hash = b.id.to_string().bytes().fold(2166136261_u32, |h, c| {
                    (h ^ u32::from(c)).wrapping_mul(16777619)
                });
                format!("moon-0{}", hash % 3 + 1)
            } else {
                format!("planet-{:02}", self.appearance.coordinates.position)
            }
        })
    }
    fn svg(&self, assets: &str) -> Result<String, String> {
        let root = Path::new(assets);
        let background = asset(root, "art/atlas/atmosphere-1600.webp", "image/webp")?;
        let logo = asset(root, "brand-mark.svg", "image/svg+xml")?;
        let hero = if let Some(key) = self.art_key() {
            let art = asset(root, &format!("art/atlas/{key}-1200.webp"), "image/webp")?;
            format!(r#"<image x="460" y="-20" width="800" height="800" href="{art}"/>"#)
        } else {
            r##"<circle cx="860" cy="375" r="245" fill="none" stroke="#7392aa" stroke-opacity=".22"/><circle cx="860" cy="375" r="8" fill="#cbb68d"/>"##.into()
        };
        let title = bounded(&self.title(), 48);
        let title_size = size(&title, 86., 440.);
        let title = escape(&title);
        let kind = match self.target {
            Target::Moon => "MOON",
            Target::Planet => {
                if self.appearance.body.is_some() {
                    "PLANET"
                } else {
                    "LOCATION"
                }
            }
            Target::Debris => "DEBRIS",
        };
        let coords = self.coordinates();
        let universe = bounded(&self.appearance.universe_name.to_uppercase(), 80);
        let universe_size = size(&universe, 16., 700.);
        let universe = escape(&universe);
        let identity = if let Some((owner, tier)) = &self.owner {
            let owner = bounded(owner, 40);
            let font_size = size(&owner, 29., 210.);
            let name = escape(&owner);
            let color = match tier {
                Some(1) => "#85d6ef",
                Some(2) => "#f0acd4",
                Some(3) => "#f2bb83",
                _ => "#e3edf2",
            };
            let badge = if tier.is_some() {
                format!(
                    r##"<g transform="translate(283 431)" fill="none" stroke="{color}" stroke-width="1.8"><path d="m14 2 3.5 7 7.7 1.1-5.6 5.4 1.3 7.7-6.9-3.6-6.9 3.6 1.3-7.7-5.6-5.4L10.5 9z"/></g><text x="321" y="452" font-size="21" fill="#e6cbac">Supporter</text>"##
                )
            } else {
                String::new()
            };
            format!(
                r#"<text x="58" y="452" fill="{color}" font-size="{font_size}" font-weight="600">{name}</text>{badge}"#
            )
        } else {
            String::new()
        };
        Ok(format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
+<defs><linearGradient id="shade"><stop stop-color="#000409" stop-opacity=".77"/><stop offset=".34" stop-color="#000409" stop-opacity=".65"/><stop offset="1" stop-color="#000409" stop-opacity=".1"/></linearGradient></defs>
+<rect width="1200" height="630" fill="#02080f"/><image x="-5" y="-65" width="1210" height="756" href="{background}"/><rect width="1200" height="630" fill="url(#shade)"/>{hero}
+<image x="52" y="42" width="52" height="52" href="{logo}"/><g font-family="IBM Plex Sans" font-size="20" letter-spacing="2.6"><text x="120" y="76" fill="#e6edf3">ORBIT</text><text x="201" y="76" fill="#cbb68d" font-weight="600">IMPERIUM</text></g>
+<g font-family="IBM Plex Sans" fill="#f3f7fa"><text x="58" y="230" font-size="18" letter-spacing="6" fill="#d6bd8f">{kind}</text><path d="M203 223h128" stroke="#a18151" opacity=".6"/>
+<text x="54" y="325" font-size="{title_size}" font-weight="700" letter-spacing="-2">{title}</text>
+<text x="58" y="390" font-size="38" letter-spacing="3" fill="#e3edf2">{coords}</text>{identity}
+<text x="36" y="602" font-size="{universe_size}" letter-spacing="3" fill="#929caf">{universe}</text></g></svg>"##).replace("\n+","\n"))
    }
    pub fn render(&self, assets: &str) -> Result<Vec<u8>, String> {
        let svg = self.svg(assets)?;
        let mut options = resvg::usvg::Options {
            font_family: "IBM Plex Sans".into(),
            ..Default::default()
        };
        options
            .fontdb_mut()
            .load_font_data(include_bytes!("../assets/IBMPlexSans.ttf").to_vec());
        options.fontdb_mut().set_sans_serif_family("IBM Plex Sans");
        // All image references are locally constructed data URLs. Never resolve arbitrary paths.
        options.image_href_resolver.resolve_string = Box::new(|_, _| None);
        let tree = resvg::usvg::Tree::from_str(&svg, &options).map_err(|e| e.to_string())?;
        let mut pixels =
            resvg::tiny_skia::Pixmap::new(1200, 630).ok_or("Unable to allocate preview")?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::identity(),
            &mut pixels.as_mut(),
        );
        pixels.encode_png().map_err(|e| e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(kind: LocationBodyKind) -> Card {
        Card {
            appearance: LocationAppearance {
                universe: UniverseId(uuid::Uuid::nil()),
                universe_name: "Andromeda Prime".into(),
                coordinates: LocationCoordinates {
                    galaxy: 1,
                    system: 234,
                    position: 8,
                },
                body: Some(LocationBody {
                    id: BodyId(uuid::Uuid::from_u128(102)),
                    owner: PlayerId(uuid::Uuid::nil()),
                    kind,
                    name: Some(
                        if kind == LocationBodyKind::Moon {
                            "Selene"
                        } else {
                            "Elysium"
                        }
                        .into(),
                    ),
                }),
            },
            target: if kind == LocationBodyKind::Moon {
                Target::Moon
            } else {
                Target::Planet
            },
            owner: Some(("AstraVoss".into(), Some(3))),
        }
    }
    #[test]
    fn metadata_is_escaped_and_keeps_kind_without_mission() {
        let mut c = fixture(LocationBodyKind::Moon);
        c.appearance.body.as_mut().unwrap().name = Some("<script>\"&".into());
        let html = c.metadata("https://game.test/u/andromeda-prime/location/1:234:8");
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;&quot;&amp;"));
        assert!(html.contains("/preview.png?target=moon"));
        assert!(!html.contains("mission="));
        c.appearance.body = None;
        assert_eq!(c.title(), "Moon unavailable");
        assert!(c.art_key().is_none());
    }
    #[test]
    fn cards_render_from_one_template_and_real_assets() {
        let assets = concat!(env!("CARGO_MANIFEST_DIR"), "/../../apps/web/public");
        for kind in [LocationBodyKind::Planet, LocationBodyKind::Moon] {
            let c = fixture(kind);
            let svg = c.svg(assets).unwrap();
            assert!(svg.contains("x=\"52\" y=\"42\" width=\"52\""));
            assert!(svg.contains("x=\"460\" y=\"-20\" width=\"800\""));
            let png = c.render(assets).unwrap();
            assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
            assert!(png.len() > 10000);
            if let Ok(dir) = std::env::var("ORBIT_PREVIEW_OUTPUT") {
                std::fs::create_dir_all(&dir).unwrap();
                std::fs::write(
                    Path::new(&dir).join(if kind == LocationBodyKind::Moon {
                        "selene.png"
                    } else {
                        "elysium.png"
                    }),
                    png,
                )
                .unwrap();
            }
        }
    }
}

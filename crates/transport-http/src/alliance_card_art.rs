//! Share-card media comes only from currently public references and free symbols.
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use sha2::{Digest, Sha256};

#[derive(Default)]
pub(super) struct CardArt {
    pub background: Option<(Vec<u8>, u8, u8)>,
    pub uploaded_crest: Option<Vec<u8>>,
    pub symbols: Vec<(String, Vec<u8>)>,
    pub crest_background: String,
    pub composed: bool,
    pub shape: Option<InsigniaShape>,
}
async fn public_bytes<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    u: UniverseId,
    id: uuid::Uuid,
) -> Option<Vec<u8>> {
    let c = s.customization.as_ref()?;
    let media = s.game.alliance_media_read(u, id, None).await.ok()?;
    let bytes = c
        .assets
        .read_bounded(&media.key(), ALLIANCE_MEDIA_MAX_BYTES)
        .await
        .ok()?;
    (media.receipt?.sha256 == hex::encode(Sha256::digest(&bytes))).then_some(bytes)
}
pub(super) async fn load<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    alliance: &PublicAlliance,
) -> CardArt {
    let mut art = CardArt::default();
    let Some(p) = &alliance.presentation else {
        return art;
    };
    let override_image = p
        .document
        .content
        .get("hero_media")
        .and_then(|v| serde_json::from_value::<MediaPlacement>(v.clone()).ok());
    let background = override_image.as_ref().or(p.identity.banner.as_ref());
    if let Some(image) = background {
        art.background = public_bytes(s, alliance.summary.universe, image.media_id)
            .await
            .map(|bytes| (bytes, image.x, image.y));
    }
    match &p.identity.crest {
        AllianceCrest::Upload { media_id } => {
            art.uploaded_crest = public_bytes(s, alliance.summary.universe, *media_id).await
        }
        AllianceCrest::Composition { recipe } => {
            art.composed = true;
            art.shape = recipe.shape;
            art.crest_background = recipe.background.clone();
            if let Some(c) = &s.customization {
                let mut layers: Vec<_> = recipe
                    .layers
                    .as_ref()
                    .map(|ls| {
                        ls.iter()
                            .map(|l| (l.symbol.as_str(), l.color.as_str()))
                            .collect()
                    })
                    .unwrap_or_else(|| vec![(recipe.symbol.as_str(), recipe.foreground.as_str())]);
                layers.sort_by_key(|(id, _)| match c.catalog.get(id).map(|i| i.group) {
                    Some(InsigniaGroup::Stripes) => 0,
                    Some(InsigniaGroup::Center) => 1,
                    _ => 2,
                });
                for (id, color) in layers {
                    if let Some(item) = c.catalog.get(id).filter(|i| !i.supporter)
                        && let Ok(bytes) = c.assets.read(&item.key()).await
                    {
                        art.symbols.push((color.into(), bytes));
                    }
                }
            }
        }
    }
    art
}
fn uri(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(bytes))
}
fn rgb(color: &str) -> Option<[u8; 3]> {
    if color.len() != 7
        || !color.starts_with('#')
        || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    {
        return None;
    }
    Some([
        u8::from_str_radix(&color[1..3], 16).ok()?,
        u8::from_str_radix(&color[3..5], 16).ok()?,
        u8::from_str_radix(&color[5..7], 16).ok()?,
    ])
}
pub(super) fn accent(color: &str, fallback: &str) -> String {
    rgb(color)
        .map(|[r, g, b]| format!("#{:02x}{:02x}{:02x}", 128 + r / 2, 128 + g / 2, 128 + b / 2))
        .unwrap_or_else(|| fallback.into())
}
pub(super) fn markup(art: &CardArt) -> String {
    let mut svg = String::new();
    if let Some((bytes, x, y)) = &art.background
        && let Ok(png) = super::alliance_images::card_background(bytes, *x, *y)
    {
        svg.push_str(&format!(r##"<image width="1200" height="630" preserveAspectRatio="xMidYMid slice" href="{}"/><rect width="1200" height="630" fill="#071620" opacity=".76"/>"##,uri(&png)));
    }
    if let Some(bytes) = &art.uploaded_crest
        && let Ok(png) = super::alliance_images::poster(bytes, 128)
    {
        svg.push_str(&format!(r#"<image x="1010" y="95" width="100" height="100" preserveAspectRatio="xMidYMid meet" href="{}"/>"#,uri(&png)));
    } else if art.composed {
        let background = if rgb(&art.crest_background).is_some() {
            art.crest_background.as_str()
        } else {
            "#152b40"
        };
        let (outline, height) = crest_outline(art.shape);
        let image_height = height - 20;
        svg.push_str(&format!(r#"<g transform="translate(1010 95)"><defs><clipPath id="crest-shape">{outline}</clipPath></defs><g clip-path="url(#crest-shape)"><rect width="100" height="{height}" fill="{background}"/>"#));
        for (color, bytes) in &art.symbols {
            let Ok(tree) = resvg::usvg::Tree::from_data(bytes, &resvg::usvg::Options::default())
            else {
                continue;
            };
            let Some(mut pixels) = resvg::tiny_skia::Pixmap::new(128, 128) else {
                continue;
            };
            resvg::render(
                &tree,
                resvg::tiny_skia::Transform::from_scale(
                    128. / tree.size().width(),
                    128. / tree.size().height(),
                ),
                &mut pixels.as_mut(),
            );
            let [r, g, b] = rgb(color).unwrap_or([203, 182, 141]);
            for px in pixels.data_mut().as_chunks_mut::<4>().0 {
                let a = u16::from(px[3]);
                px[0] = (u16::from(r) * a / 255) as u8;
                px[1] = (u16::from(g) * a / 255) as u8;
                px[2] = (u16::from(b) * a / 255) as u8;
            }
            if let Ok(png) = pixels.encode_png() {
                svg.push_str(&format!(
                    r#"<image x="10" y="10" width="80" height="{image_height}" href="{}"/>"#,
                    uri(&png)
                ));
            }
        }
        svg.push_str("</g></g>");
    }
    svg
}

pub(super) fn crest_outline(shape: Option<InsigniaShape>) -> (&'static str, u32) {
    match shape.unwrap_or(InsigniaShape::Shield) {
        InsigniaShape::Circle => (r#"<circle cx="50" cy="50" r="50"/>"#, 100),
        InsigniaShape::RoundedSquare => (r#"<rect width="100" height="100" rx="15"/>"#, 100),
        InsigniaShape::Diamond => (r#"<path d="M50 0 100 50 50 100 0 50Z"/>"#, 100),
        InsigniaShape::Hexagon => (r#"<path d="M25 0H75L100 50 75 100H25L0 50Z"/>"#, 100),
        InsigniaShape::Shield => (
            r#"<path d="M24 0H76Q100 0 100 26V64Q100 110 58 110H42Q0 110 0 64V26Q0 0 24 0Z"/>"#,
            110,
        ),
    }
}

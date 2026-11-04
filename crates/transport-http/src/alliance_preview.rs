//! Recruitment previews use only the public alliance projection, never creator identity.
use super::*;
use crate::location_card::{escape, render_options, size};
use std::sync::LazyLock;
static RENDERS: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(2)));

fn status(alliance: &PublicAlliance) -> &'static str {
    match alliance.summary.recruitment {
        AllianceRecruitment::Open => "Open recruitment · Join the alliance",
        AllianceRecruitment::Application => "Recruiting · Applications welcome",
        AllianceRecruitment::Closed => "Recruitment currently closed",
    }
}
fn metadata(alliance: Option<&PublicAlliance>, url: &str) -> String {
    let (title, description) = alliance
        .map(|a| {
            (
                format!("[{}] {} · Orbit Imperium", a.summary.tag, a.summary.name),
                format!(
                    "{} in {}. Build an empire together. No purchased gameplay advantages.",
                    status(a),
                    a.universe_name
                ),
            )
        })
        .unwrap_or_else(|| {
            (
                "Alliance invitation unavailable · Orbit Imperium".into(),
                "Ask for a current invitation or browse recruiting alliances.".into(),
            )
        });
    let title = escape(&title);
    let description = escape(&description);
    let url = escape(url);
    let image = if alliance.is_some() {
        format!(
            r#"<meta property="og:image" content="{url}/image"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{title}">"#
        )
    } else {
        String::new()
    };
    format!(
        r#"<title>{title}</title><meta name="description" content="{description}"><meta property="og:type" content="website"><meta property="og:site_name" content="Orbit Imperium"><meta property="og:title" content="{title}"><meta property="og:description" content="{description}"><meta property="og:url" content="{url}"><meta name="twitter:card" content="summary_large_image">{image}"#
    )
}
fn render(alliance: &PublicAlliance, origin: &str, path: &str) -> Result<Vec<u8>, String> {
    let options = render_options();
    let name_size = size(&alliance.summary.name, 64., 1040., 0., 600, &options)?;
    let world_size = size(&alliance.universe_name, 30., 1000., 0., 400, &options)?;
    let origin_size = size(origin, 22., 1040., 0., 400, &options)?;
    let path_size = size(path, 16., 1040., 0., 400, &options)?;
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="space" x2="1" y2="1"><stop stop-color="#07121f"/><stop offset="1" stop-color="#172d40"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#space)"/>
<g fill="none" stroke="#6e9caf" stroke-opacity=".16"><circle cx="1080" cy="70" r="310"/><circle cx="1080" cy="70" r="250"/><circle cx="1080" cy="70" r="190"/></g>
<path d="M64 64H1136M64 472H1136" stroke="#b6a37c" stroke-opacity=".5"/>
<g font-family="IBM Plex Sans" fill="#ece9df">
<text x="64" y="112" fill="#cbb88e" font-size="22" letter-spacing="4">ORBIT IMPERIUM</text>
<text x="64" y="180" fill="#8ad8ec" font-size="26" letter-spacing="3">[{tag}]</text>
<text x="64" y="263" font-size="{name_size}" font-weight="600">{name}</text>
<text x="64" y="320" font-size="{world_size}" fill="#bdcbd5">{world}</text>
<text x="64" y="390" font-size="26">{status}</text>
<text x="64" y="432" font-size="20" fill="#bdcbd5">Build an empire. Find your people. Play on equal terms.</text>
<text x="64" y="520" font-size="{origin_size}" fill="#cbb88e">{origin}</text>
<text x="64" y="560" font-size="{path_size}" fill="#bdcbd5">{path}</text>
</g></svg>"##,
        tag = escape(&alliance.summary.tag),
        name = escape(&alliance.summary.name),
        world = escape(&alliance.universe_name),
        status = escape(status(alliance)),
        origin = escape(origin),
        path = escape(path)
    );
    let tree = resvg::usvg::Tree::from_str(&svg, &options).map_err(|e| e.to_string())?;
    let mut pixels = resvg::tiny_skia::Pixmap::new(1200, 630).ok_or("image allocation failed")?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::identity(),
        &mut pixels.as_mut(),
    );
    pixels.encode_png().map_err(|e| e.to_string())
}
async fn load<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    universe: uuid::Uuid,
    id: uuid::Uuid,
    invitation: bool,
) -> Result<PublicAlliance, ServiceError> {
    if invitation {
        s.game.alliance_invitation(UniverseId(universe), id).await
    } else {
        s.game.public_alliance(UniverseId(universe), id).await
    }
}
async fn serve<S: GameStore + IdentityStore + Send + Sync + 'static>(
    s: Arc<HttpState<S>>,
    universe: uuid::Uuid,
    id: uuid::Uuid,
    invitation: bool,
    image: bool,
    headers: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
) -> Response {
    if let Some(response) =
        super::alliances::public_budget(&s, &headers, peer, UniverseId(universe)).await
    {
        return response;
    }
    let path = format!(
        "/{}/{universe}/{id}",
        if invitation { "invite" } else { "alliances" }
    );
    let result = load(&s, universe, id, invitation).await;
    if image {
        let alliance = match result {
            Ok(a) => a,
            Err(e) => return Problem(e).into_response(),
        };
        let permit = match RENDERS.clone().try_acquire_owned() {
            Ok(p) => p,
            Err(_) => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    [(header::RETRY_AFTER, "2")],
                )
                    .into_response();
            }
        };
        let origin = s.config.origin.trim_end_matches('/').to_owned();
        return match tokio::task::spawn_blocking(move || {
            let _permit = permit;
            render(&alliance, &origin, &path)
        })
        .await
        {
            Ok(Ok(bytes)) => (
                [
                    (header::CONTENT_TYPE, "image/png"),
                    (header::CACHE_CONTROL, "no-store"),
                    (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
                ],
                bytes,
            )
                .into_response(),
            _ => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        };
    }
    let (code, alliance) = match result {
        Ok(a) => (StatusCode::OK, Some(a)),
        Err(e) => (Problem(e).into_response().status(), None),
    };
    let template =
        match tokio::fs::read_to_string(std::path::Path::new(&s.config.assets).join("index.html"))
            .await
        {
            Ok(t) => t,
            Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
        };
    let (Some(start), Some(end)) = (
        template.find("<!--orbit-page-metadata:start-->"),
        template.find("<!--orbit-page-metadata:end-->"),
    ) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let mut html = template;
    html.replace_range(
        start..end + "<!--orbit-page-metadata:end-->".len(),
        &metadata(
            alliance.as_ref(),
            &format!("{}{path}", s.config.origin.trim_end_matches('/')),
        ),
    );
    let html = match bootstrap_html::render_bootstrap_html(
        &html,
        &Bootstrap {
            version: 1,
            signup_enabled: false,
            result: BootstrapResult::Anonymous,
        },
    ) {
        Ok(h) => h,
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    (
        code,
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
            (header::HeaderName::from_static("x-robots-tag"), "noindex"),
        ],
        html,
    )
        .into_response()
}
macro_rules! endpoint {
    ($name:ident, $invitation:expr, $image:expr) => {
        pub(super) async fn $name<S: GameStore + IdentityStore + Send + Sync + 'static>(
            State(s): State<Arc<HttpState<S>>>,
            Path((u, id)): Path<(uuid::Uuid, uuid::Uuid)>,
            h: HeaderMap,
            peer: Option<Extension<ConnectInfo<SocketAddr>>>,
        ) -> Response {
            serve(s, u, id, $invitation, $image, h, peer).await
        }
    };
}
endpoint!(page, false, false);
endpoint!(invitation_page, true, false);
endpoint!(image, false, true);
endpoint!(invitation_image, true, true);

#[cfg(test)]
mod tests {
    use super::*;
    fn alliance() -> PublicAlliance {
        PublicAlliance {
            summary: AllianceSummary {
                id: uuid::Uuid::nil(),
                universe: UniverseId(uuid::Uuid::nil()),
                tag: "STARS".into(),
                name: "Starlight Assembly".into(),
                member_count: 3,
                recruitment: AllianceRecruitment::Application,
                recruitment_profile: RecruitmentProfile::default(),
                ranking: None,
            },
            public_text: "private-looking text must not enter preview metadata".into(),
            universe_name: "Andromeda".into(),
            enrollment_open: true,
        }
    }
    #[test]
    fn preview_escapes_identity_and_disabled_links_have_no_image() {
        let mut a = alliance();
        a.summary.name = "<script> & \"name\"".into();
        let html = metadata(Some(&a), "https://orbit.example/invite/u/t");
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;"));
        assert!(!html.contains(&a.public_text));
        assert!(!metadata(None, "https://orbit.example/invite/u/t").contains("og:image"));
    }
    #[test]
    fn recruitment_card_renders_bounded_long_identity_to_png() {
        let mut a = alliance();
        if let Ok(path) = std::env::var("ORBIT_RECRUITMENT_CARD_CAPTURE") {
            std::fs::write(path,render(&a,"https://orbit.example","/invite/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002").unwrap()).unwrap();
        }
        a.summary.name = "WWWW WWWW WWWW WWWW WWWW WWWW WWWW WWWW WWWW WWWW".into();
        let png = render(&a, "https://orbit.example", "/invite/world/link").unwrap();
        let pixels = resvg::tiny_skia::Pixmap::decode_png(&png).unwrap();
        assert_eq!((pixels.width(), pixels.height()), (1200, 630));
    }
}

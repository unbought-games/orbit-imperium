use super::*;
use crate::location_card::{Card, Target};
use axum::extract::Query;
use std::sync::LazyLock;

// Rendering is CPU work. Bound concurrent work without creating an unbounded queue.
static RENDERS: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(2)));
#[derive(Default, Deserialize)]
pub(super) struct Options {
    target: Option<String>,
}
fn address(text: &str) -> Option<LocationCoordinates> {
    let values = text
        .split(':')
        .map(|s| {
            if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            s.parse::<u32>().ok().filter(|n| *n > 0)
        })
        .collect::<Option<Vec<_>>>()?;
    (values.len() == 3).then(|| LocationCoordinates {
        galaxy: values[0],
        system: values[1],
        position: values[2],
    })
}
async fn load<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    slug: &str,
    text: &str,
    options: Options,
) -> Result<Card, StatusCode> {
    let coordinates = address(text).ok_or(StatusCode::NOT_FOUND)?;
    let target = match options.target.as_deref() {
        None | Some("planet") => Target::Planet,
        Some("moon") => Target::Moon,
        Some("debris") => Target::Debris,
        _ => return Err(StatusCode::NOT_FOUND),
    };
    let mut appearance = s
        .updates
        .location_appearance(
            slug,
            coordinates,
            if target == Target::Moon {
                LocationBodyKind::Moon
            } else {
                LocationBodyKind::Planet
            },
        )
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .ok_or(StatusCode::NOT_FOUND)?;
    if target == Target::Debris {
        appearance.body = None;
    }
    let mut owner = None;
    if let Some(body) = &appearance.body {
        let identities = s
            .updates
            .player_identities(appearance.universe, vec![body.owner])
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        owner = if let Some(profiles) = &s.profiles {
            profiles
                .display(identities)
                .await
                .into_iter()
                .next()
                .map(|p| (p.username, p.supporter_tier))
        } else {
            identities.into_iter().next().map(|p| (p.username, None))
        };
    }
    Ok(Card {
        appearance,
        target,
        owner,
    })
}
pub(super) async fn page<S: GameStore + IdentityStore + Send + Sync + 'static>(
    State(s): State<Arc<HttpState<S>>>,
    Path((universe, coordinates)): Path<(String, String)>,
    Query(options): Query<Options>,
    headers: HeaderMap,
) -> Response {
    let card = match load(&s, &universe, &coordinates, options).await {
        Ok(c) => c,
        Err(status) => return status.into_response(),
    };
    let template =
        match tokio::fs::read_to_string(std::path::Path::new(&s.config.assets).join("index.html"))
            .await
        {
            Ok(t) => t,
            Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
        };
    let bootstrap = bootstrap::prepare_bootstrap(&s, &headers).await;
    let html = match bootstrap_html::render_bootstrap_html(&template, &bootstrap) {
        Ok(h) => h,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let origin = s.config.origin.trim_end_matches('/');
    let url = format!("{origin}/u/{universe}/location/{coordinates}");
    let metadata = card.metadata(&url);
    let html = html.replacen("</head>", &format!("{metadata}</head>"), 1);
    (
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "private, no-store"),
            (header::VARY, "Cookie"),
        ],
        html,
    )
        .into_response()
}
pub(super) async fn image<S: GameStore + IdentityStore + Send + Sync + 'static>(
    State(s): State<Arc<HttpState<S>>>,
    Path((universe, coordinates)): Path<(String, String)>,
    Query(options): Query<Options>,
) -> Response {
    let Ok(permit) = RENDERS.clone().try_acquire_owned() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            [(header::RETRY_AFTER, "2")],
        )
            .into_response();
    };
    let card = match load(&s, &universe, &coordinates, options).await {
        Ok(c) => c,
        Err(status) => return status.into_response(),
    };
    let assets = s.config.assets.clone();
    match tokio::task::spawn_blocking(move || {
        let _permit = permit;
        card.render(&assets)
    })
    .await
    {
        Ok(Ok(bytes)) => (
            [
                (header::CONTENT_TYPE, "image/png"),
                (header::CACHE_CONTROL, "public, max-age=300"),
                (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            ],
            bytes,
        )
            .into_response(),
        _ => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn addresses_are_strict_and_bounded() {
        assert!(address("1:234:8").is_some());
        for invalid in [
            "0:1:1",
            "1:2",
            "1:2:3:4",
            "1:2:-1",
            "1:2:4294967296",
            "<script>:2:3",
        ] {
            assert!(address(invalid).is_none(), "{invalid}");
        }
    }
}

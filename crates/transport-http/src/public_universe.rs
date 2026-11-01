use super::*;
use axum::extract::rejection::PathRejection;
use sha2::{Digest, Sha256};

pub(super) async fn players<S: GameStore>(
    State(s): State<Arc<HttpState<S>>>,
    path: Result<Path<uuid::Uuid>, PathRejection>,
    headers: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
) -> Response {
    serve(&s, path, headers, peer, PublicFeed::Players).await
}
pub(super) async fn planets<S: GameStore>(
    State(s): State<Arc<HttpState<S>>>,
    path: Result<Path<uuid::Uuid>, PathRejection>,
    headers: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
) -> Response {
    serve(&s, path, headers, peer, PublicFeed::Planets).await
}
async fn serve<S: GameStore>(
    s: &HttpState<S>,
    path: Result<Path<uuid::Uuid>, PathRejection>,
    headers: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    feed: PublicFeed,
) -> Response {
    let response = async {
        let Path(id) = path.map_err(|_| Problem(ServiceError::Malformed).into_response())?;
        let source = login_source(peer.map(|p| p.0.0));
        s.public_feed_budget
            .lock()
            .await
            .admit(source, &source.to_string(), 120, Instant::now())
            .map_err(rate_limited)?;
        let _permit = s
            .public_feed_work
            .try_acquire()
            .map_err(|_| rate_limited(1))?;
        let result = s
            .game
            .public_universe(UniverseId(id), feed)
            .await
            .map_err(|e| Problem(e).into_response())?;
        let body = serde_json::to_vec(&result)
            .map_err(|_| Problem(ServiceError::Unavailable).into_response())?;
        let etag = format!("\"{}\"", hex::encode(Sha256::digest(&body)));
        let unchanged = headers
            .get_all(header::IF_NONE_MATCH)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .any(|v| etag_matches(v, &etag));
        let mut response = if unchanged {
            StatusCode::NOT_MODIFIED.into_response()
        } else {
            ([(header::CONTENT_TYPE, "application/json")], body).into_response()
        };
        response
            .headers_mut()
            .insert(header::ETAG, etag.parse().expect("hex ETag"));
        // Every cache hit must check the epoch, even before the next boundary.
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            "public, no-cache, max-age=0, must-revalidate"
                .parse()
                .unwrap(),
        );
        Ok::<_, Response>(response)
    }
    .await
    .unwrap_or_else(|response| response);
    cors(response)
}
fn etag_matches(value: &str, etag: &str) -> bool {
    value.split(',').any(|v| {
        let v = v.trim();
        v == "*" || v.strip_prefix("W/").unwrap_or(v) == etag
    })
}
fn cors(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*".parse().unwrap());
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        "ETag, Retry-After".parse().unwrap(),
    );
    response
}
pub(super) async fn options() -> Response {
    cors(
        (
            StatusCode::NO_CONTENT,
            [
                (header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS"),
                (header::ACCESS_CONTROL_ALLOW_HEADERS, "If-None-Match"),
                (header::CACHE_CONTROL, "no-store"),
            ],
        )
            .into_response(),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn conditional_get_accepts_lists_and_weak_validators() {
        for value in ["*", "\"abc\"", "W/\"abc\"", "\"old\", W/\"abc\""] {
            assert!(etag_matches(value, "\"abc\""));
        }
        for value in ["abc", "\"ab\"", "\"abcd\"", ""] {
            assert!(!etag_matches(value, "\"abc\""));
        }
    }
}

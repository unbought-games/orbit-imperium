use axum::{
    extract::{Request, State},
    http::HeaderValue,
    middleware::Next,
    response::Response,
};
use serde::Deserialize;
use std::path::Path;

pub(super) const HEADER: &str = "x-orbit-client-build";

#[derive(Deserialize)]
struct ClientBuild {
    id: uuid::Uuid,
}

// Loaded once with the router, from the same immutable assets served by it.
// Legacy/custom asset directories remain supported without a build header.
pub(super) fn read(assets: &str) -> Option<HeaderValue> {
    let bytes = std::fs::read(Path::new(assets).join("client-build.json")).ok()?;
    let build: ClientBuild = serde_json::from_slice(&bytes).ok()?;
    HeaderValue::from_str(&build.id.to_string()).ok()
}

pub(super) async fn advertise(
    State(build): State<Option<HeaderValue>>,
    request: Request,
    next: Next,
) -> Response {
    let mut response = next.run(request).await;
    if let Some(build) = build {
        response.headers_mut().insert(HEADER, build);
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, body::Body, middleware, routing::get};
    use tower::ServiceExt;

    #[tokio::test]
    async fn shipped_build_is_advertised_on_success_errors_and_streams() {
        let dir = std::env::temp_dir().join(format!("orbit-build-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let assets = dir.to_str().unwrap();
        assert!(read(assets).is_none());
        std::fs::write(
            dir.join("client-build.json"),
            r#"{"id":"invalid\r\nvalue"}"#,
        )
        .unwrap();
        assert!(read(assets).is_none());
        let id = uuid::Uuid::new_v4().to_string();
        std::fs::write(dir.join("client-build.json"), format!(r#"{{"id":"{id}"}}"#)).unwrap();
        let app = Router::new()
            .route("/api", get(|| async { "{}" }))
            .route(
                "/updates",
                get(|| async {
                    axum::response::Sse::new(tokio_stream::pending::<
                        Result<axum::response::sse::Event, std::convert::Infallible>,
                    >())
                }),
            )
            .layer(middleware::from_fn_with_state(read(assets), advertise));
        for path in ["/api", "/missing", "/updates"] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.headers()[HEADER], id);
        }
        std::fs::remove_dir_all(dir).unwrap();
    }
}

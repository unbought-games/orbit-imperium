use super::{HttpState, bootstrap::prepare_bootstrap, bootstrap_html::render_bootstrap_html};
use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{HeaderMap, Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use orbit_application::{Bootstrap, GameStore, IdentityStore};
use std::{future::Future, path::PathBuf, pin::Pin, sync::Arc};
use tower_http::services::ServeDir;
type Prepare =
    Arc<dyn Fn(HeaderMap) -> Pin<Box<dyn Future<Output = Bootstrap> + Send>> + Send + Sync>;
#[derive(Clone)]
struct StaticAssets {
    files: ServeDir,
    index: PathBuf,
    prepare: Prepare,
}
pub(super) fn router<S: GameStore + IdentityStore + Send + Sync + 'static>(
    state: Arc<HttpState<S>>,
) -> Router {
    let assets = state.config.assets.clone();
    router_with(
        assets,
        Arc::new(move |headers| {
            let state = state.clone();
            Box::pin(async move { prepare_bootstrap(&state, &headers).await })
        }),
    )
}
fn router_with(assets: String, prepare: Prepare) -> Router {
    Router::new().fallback(serve).with_state(StaticAssets {
        files: ServeDir::new(&assets).append_index_html_on_directories(false),
        index: PathBuf::from(assets).join("index.html"),
        prepare,
    })
}
async fn serve(State(mut assets): State<StaticAssets>, request: Request) -> Response {
    let Ok(path) = percent_encoding::percent_decode_str(request.uri().path()).decode_utf8() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let shared_report = path.starts_with("/reports/shared/");
    let namespace = path.split('/').nth(1).unwrap_or_default();
    if matches!(namespace, "api" | "health") {
        return StatusCode::NOT_FOUND.into_response();
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::ALLOW, "GET, HEAD")],
        )
            .into_response();
    }
    let entry = path == "/" || path == "/index.html";
    let ui = namespace != "assets" && !path.split('/').any(|p| p.contains('.'));
    // A real extensionless public asset keeps its file semantics. Only missing
    // UI paths fall back to the personalized entry document.
    if ui && !entry {
        let mut asset_request = Request::new(Body::empty());
        *asset_request.method_mut() = request.method().clone();
        *asset_request.uri_mut() = request.uri().clone();
        *asset_request.headers_mut() = request.headers().clone();
        match assets.files.try_call(asset_request).await {
            Ok(response) if response.status() != StatusCode::NOT_FOUND => {
                return response.into_response();
            }
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            _ => {}
        }
    }
    if entry || ui {
        let head = request.method() == Method::HEAD;
        let body = if head {
            String::new()
        } else {
            let template = match tokio::fs::read_to_string(&assets.index).await {
                Ok(t) => t,
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };
            let bootstrap = if shared_report {
                Bootstrap {
                    version: 1,
                    signup_enabled: false,
                    result: orbit_application::BootstrapResult::Anonymous,
                }
            } else {
                (assets.prepare)(request.headers().clone()).await
            };
            match render_bootstrap_html(&template, &bootstrap) {
                Ok(html) => html,
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            }
        };
        let mut response = (
            [
                (header::CONTENT_TYPE, "text/html"),
                (header::CACHE_CONTROL, "private, no-store"),
                (header::VARY, "Cookie"),
            ],
            Body::from(body),
        )
            .into_response();
        if shared_report {
            response.headers_mut().insert(
                "x-robots-tag",
                "noindex, nofollow, noarchive".parse().unwrap(),
            );
            response
                .headers_mut()
                .insert("referrer-policy", "no-referrer".parse().unwrap());
        }
        return response;
    }
    match assets.files.try_call(request).await {
        Ok(response) => response.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Method, Request, StatusCode, header},
    };
    use std::{
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };
    use tower::ServiceExt;

    const INDEX: &str = "<!doctype html><html><body>Orbit UI<script id=\"orbit-bootstrap\" type=\"application/json\"></script></body></html>";

    #[tokio::test]
    async fn shared_report_document_never_bootstraps_a_session_and_discourages_indexing() {
        let assets = Assets::new();
        let app = router_with(
            assets.0.to_string_lossy().into_owned(),
            Arc::new(|_| panic!("public report must not initialize the reader's game")),
        );
        let response = app
            .oneshot(
                Request::get("/reports/shared/00000000-0000-4000-8000-000000000001")
                    .header(header::COOKIE, "orbit_session=private")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["x-robots-tag"],
            "noindex, nofollow, noarchive"
        );
        assert_eq!(response.headers()["referrer-policy"], "no-referrer");
        assert_eq!(
            response.headers()[header::CACHE_CONTROL],
            "private, no-store"
        );
        let body = String::from_utf8(
            to_bytes(response.into_body(), 65536)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap();
        assert!(body.contains("anonymous"));
        assert!(!body.contains("private"));
    }

    fn guest() -> Bootstrap {
        Bootstrap {
            version: 1,
            signup_enabled: false,
            result: orbit_application::BootstrapResult::Anonymous,
        }
    }
    struct Assets(PathBuf);

    impl Assets {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "orbit-http-assets-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(root.join("assets")).unwrap();
            std::fs::write(root.join("index.html"), INDEX).unwrap();
            std::fs::write(root.join("assets/app.js"), "console.log('orbit');").unwrap();
            std::fs::write(root.join("assets/app.css"), "body { color: white; }").unwrap();
            std::fs::write(root.join("LICENSE.txt"), "project license").unwrap();
            std::fs::write(root.join("third-party.txt"), "dependency notices").unwrap();
            Self(root)
        }

        fn router(&self) -> Router {
            router_with(
                self.0.to_str().unwrap().to_owned(),
                Arc::new(|_| Box::pin(async { guest() })),
            )
        }
    }

    impl Drop for Assets {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[tokio::test]
    async fn browser_history_paths_serve_uncached_entry_document() {
        let assets = Assets::new();
        for path in [
            "/",
            "/index.html",
            "/login",
            "/u/00000000-0000-0000-0000-000000000001/overview?body=earth",
            "/u/00000000-0000-0000-0000-000000000001/unknown",
            "/unknown-ui-path",
        ] {
            let response = assets
                .router()
                .oneshot(Request::get(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK, "{path}");
            assert_eq!(
                response.headers()[header::CONTENT_TYPE],
                "text/html",
                "{path}"
            );
            assert_eq!(
                response
                    .headers()
                    .get(header::CACHE_CONTROL)
                    .and_then(|h| h.to_str().ok()),
                Some("private, no-store"),
                "{path}"
            );
            assert_eq!(
                to_bytes(response.into_body(), 1024).await.unwrap(),
                crate::bootstrap_html::render_bootstrap_html(INDEX, &guest()).unwrap(),
                "{path}"
            );
        }
    }

    #[tokio::test]
    async fn head_deep_link_has_document_headers_without_body() {
        let assets = Assets::new();
        let response = assets
            .router()
            .oneshot(
                Request::head("/u/demo/overview?body=earth")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "text/html");
        assert_eq!(
            response.headers()[header::CACHE_CONTROL],
            "private, no-store"
        );
        assert_ne!(
            response
                .headers()
                .get(header::CONTENT_LENGTH)
                .and_then(|h| h.to_str().ok()),
            Some(INDEX.len().to_string().as_str())
        );
        assert!(
            to_bytes(response.into_body(), 1024)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn missing_resources_and_server_routes_never_become_html() {
        let assets = Assets::new();
        for path in [
            "/api",
            "/api/unknown",
            "/api/v1/unknown",
            "/api/v2/unknown",
            "/api/v3/unknown",
            "/%61pi/v3/unknown",
            "/health",
            "/health/unknown",
            "/assets/missing.js",
            "/assets/missing.css",
            "/assets/missing",
            "/favicon.ico",
            "/missing.json",
            "/nested/missing.js",
            "/missing.js/",
            "/missing%2Ejs",
            "/%61ssets/missing",
        ] {
            for method in [Method::GET, Method::HEAD] {
                let response = assets
                    .router()
                    .oneshot(
                        Request::builder()
                            .method(method.clone())
                            .uri(path)
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(response.status(), StatusCode::NOT_FOUND, "{method} {path}");
                assert_ne!(
                    response
                        .headers()
                        .get(header::CONTENT_TYPE)
                        .and_then(|h| h.to_str().ok()),
                    Some("text/html"),
                    "{method} {path}"
                );
            }
        }
    }

    #[tokio::test]
    async fn non_read_methods_do_not_receive_entry_document() {
        let assets = Assets::new();
        for method in [
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ] {
            for path in [
                "/login",
                "/u/demo/overview",
                "/",
                "/index.html",
                "/assets/app.js",
            ] {
                let response = assets
                    .router()
                    .oneshot(
                        Request::builder()
                            .method(method.clone())
                            .uri(path)
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(
                    response.status(),
                    StatusCode::METHOD_NOT_ALLOWED,
                    "{method} {path}"
                );
                assert_ne!(
                    response
                        .headers()
                        .get(header::CONTENT_TYPE)
                        .and_then(|h| h.to_str().ok()),
                    Some("text/html")
                );
            }
        }
    }

    #[tokio::test]
    async fn existing_static_files_keep_their_content_and_type() {
        let assets = Assets::new();
        for (path, content, content_type) in [
            ("/assets/app.js", "console.log('orbit');", "text/javascript"),
            ("/assets/app.css", "body { color: white; }", "text/css"),
            ("/LICENSE.txt", "project license", "text/plain"),
            ("/third-party.txt", "dependency notices", "text/plain"),
        ] {
            let response = assets
                .router()
                .oneshot(Request::get(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.headers()[header::CONTENT_TYPE], content_type);
            assert_eq!(to_bytes(response.into_body(), 1024).await.unwrap(), content);
        }
    }
    #[tokio::test]
    async fn conditional_and_range_document_requests_are_complete_private_responses() {
        let assets = Assets::new();
        for name in ["range", "if-none-match", "if-modified-since"] {
            let response = assets
                .router()
                .oneshot(
                    Request::get("/")
                        .header(
                            name,
                            match name {
                                "range" => "bytes=0-5",
                                "if-none-match" => "*",
                                _ => "Wed, 21 Oct 2099 07:28:00 GMT",
                            },
                        )
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                response.headers()[header::CACHE_CONTROL],
                "private, no-store"
            );
            assert_eq!(response.headers()[header::VARY], "Cookie");
            assert!(response.headers().get(header::ETAG).is_none());
            assert!(response.headers().get(header::LAST_MODIFIED).is_none());
            let body = to_bytes(response.into_body(), 4096).await.unwrap();
            assert!(String::from_utf8_lossy(&body).contains("anonymous"));
        }
    }
    #[tokio::test]
    async fn assets_and_head_do_not_prepare_private_data() {
        let assets = Assets::new();
        let app = router_with(
            assets.0.to_string_lossy().into_owned(),
            Arc::new(|_| panic!("must not authenticate")),
        );
        for (method, path) in [
            (Method::GET, "/assets/app.js"),
            (Method::HEAD, "/"),
            (Method::HEAD, "/assets/app.css"),
            (Method::GET, "/LICENSE.txt"),
            (Method::GET, "/third-party.txt"),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(path)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }
    }
    #[tokio::test]
    async fn extensionless_static_files_are_not_replaced_with_game_html() {
        let assets = Assets::new();
        std::fs::write(assets.0.join("manifest"), "asset bytes").unwrap();
        let app = router_with(
            assets.0.to_string_lossy().into_owned(),
            Arc::new(|_| panic!("asset must not authenticate")),
        );
        let response = app
            .oneshot(Request::get("/manifest").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(
            to_bytes(response.into_body(), 1024).await.unwrap(),
            "asset bytes"
        );
    }
}

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
    homepage: PathBuf,
    homepage_closed: PathBuf,
    prepare: Prepare,
    origin: String,
}
pub(super) fn router<S: GameStore + IdentityStore + Send + Sync + 'static>(
    state: Arc<HttpState<S>>,
) -> Router {
    let assets = state.config.assets.clone();
    router_with(
        assets,
        state.config.origin.clone(),
        Arc::new(move |headers| {
            let state = state.clone();
            Box::pin(async move { prepare_bootstrap(&state, &headers).await })
        }),
    )
}
fn router_with(assets: String, origin: String, prepare: Prepare) -> Router {
    Router::new().fallback(serve).with_state(StaticAssets {
        files: ServeDir::new(&assets).append_index_html_on_directories(false),
        index: PathBuf::from(&assets).join("index.html"),
        homepage: PathBuf::from(&assets).join("homepage.html"),
        homepage_closed: PathBuf::from(assets).join("homepage-closed.html"),
        prepare,
        origin,
    })
}
async fn serve(State(mut assets): State<StaticAssets>, request: Request) -> Response {
    let Ok(path) = percent_encoding::percent_decode_str(request.uri().path()).decode_utf8() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let public_document = path.starts_with("/reports/shared/") || path.starts_with("/alliances/");
    let namespace = path.split('/').nth(1).unwrap_or_default();
    if matches!(namespace, "api" | "health")
        || matches!(path.as_ref(), "/homepage.html" | "/homepage-closed.html")
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::ALLOW, "GET, HEAD")],
        )
            .into_response();
    }
    if let Some((content_type, body)) = super::home_seo::discovery(&path, &assets.origin) {
        return (
            [
                (header::CONTENT_TYPE, content_type),
                (header::CACHE_CONTROL, "public, max-age=300"),
            ],
            if request.method() == Method::HEAD {
                String::new()
            } else {
                body
            },
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
            let mut template = match tokio::fs::read_to_string(&assets.index).await {
                Ok(t) => t,
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };
            let bootstrap = if public_document {
                Bootstrap {
                    version: 1,
                    signup_enabled: false,
                    result: orbit_application::BootstrapResult::Anonymous,
                }
            } else {
                (assets.prepare)(request.headers().clone()).await
            };
            if entry
                && matches!(
                    bootstrap.result,
                    orbit_application::BootstrapResult::Anonymous
                )
            {
                // Older/custom asset builds retain the regular entry as a safe fallback.
                let homepage = if bootstrap.signup_enabled {
                    &assets.homepage
                } else {
                    &assets.homepage_closed
                };
                match tokio::fs::read_to_string(homepage).await {
                    Ok(homepage) => template = homepage,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
                }
            }
            match render_bootstrap_html(&template, &bootstrap) {
                Ok(html)
                    if entry
                        && matches!(
                            bootstrap.result,
                            orbit_application::BootstrapResult::Anonymous
                        ) =>
                {
                    super::home_seo::decorate(html, &assets.origin)
                }
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
        if !entry {
            response
                .headers_mut()
                .insert("x-robots-tag", "noindex".parse().unwrap());
        }
        if public_document {
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
    async fn discovery_files_never_authenticate_and_only_list_the_public_homepage() {
        let assets = Assets::new();
        let app = router_with(
            assets.0.to_string_lossy().into_owned(),
            "https://community.example".into(),
            Arc::new(|_| panic!("discovery must not initialize sessions")),
        );
        for (path, content_type) in [
            ("/robots.txt", "text/plain; charset=utf-8"),
            ("/sitemap.xml", "application/xml; charset=utf-8"),
        ] {
            for method in [Method::GET, Method::HEAD] {
                let response = app
                    .clone()
                    .oneshot(
                        Request::builder()
                            .method(method.clone())
                            .uri(path)
                            .header("host", "attacker.example")
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(response.headers()[header::CONTENT_TYPE], content_type);
                assert_eq!(
                    response.headers()[header::CACHE_CONTROL],
                    "public, max-age=300"
                );
                assert!(response.headers().get(header::SET_COOKIE).is_none());
                let body =
                    String::from_utf8(to_bytes(response.into_body(), 8192).await.unwrap().to_vec())
                        .unwrap();
                if method == Method::HEAD {
                    assert!(body.is_empty());
                    continue;
                }
                assert!(body.contains("https://community.example/"));
                assert!(!body.contains("attacker.example"));
                assert!(!body.contains("/login"));
                assert!(!body.contains("/u/"));
                if path == "/robots.txt" {
                    assert!(body.contains("Allow: /"));
                    assert!(body.contains("Sitemap: https://community.example/sitemap.xml"));
                } else {
                    assert_eq!(body.matches("<loc>").count(), 1);
                }
            }
        }
    }

    #[tokio::test]
    async fn only_anonymous_home_requests_use_the_lightweight_entry() {
        use orbit_application::{
            AccountId, AuthenticatedSession, BootstrapError, BootstrapGame, BootstrapResult,
        };
        let assets = Assets::new();
        std::fs::write(
            assets.0.join("homepage.html"),
            format!("<title>Orbit Imperium</title>LIGHTWEIGHT SIGNUP_LINK{INDEX}"),
        )
        .unwrap();
        std::fs::write(
            assets.0.join("homepage-closed.html"),
            format!("<title>Orbit Imperium</title>CLOSED{INDEX}"),
        )
        .unwrap();
        for signup_enabled in [true, false] {
            for result in [
                BootstrapResult::Anonymous,
                BootstrapResult::Unavailable {
                    code: BootstrapError::Unavailable,
                },
                BootstrapResult::Authenticated {
                    session: AuthenticatedSession {
                        account: AccountId(uuid::Uuid::nil()),
                        csrf: "csrf".into(),
                        expires_at: 0,
                        memberships: vec![],
                    },
                    game: BootstrapGame::NoMembership,
                },
            ] {
                let anonymous = matches!(result, BootstrapResult::Anonymous);
                let app = router_with(
                    assets.0.to_string_lossy().into_owned(),
                    "https://community.example".into(),
                    Arc::new(move |_| {
                        let result = result.clone();
                        Box::pin(async move {
                            Bootstrap {
                                version: 1,
                                signup_enabled,
                                result,
                            }
                        })
                    }),
                );
                for path in ["/", "/index.html", "/login", "/u/demo/overview"] {
                    let response = app
                        .clone()
                        .oneshot(Request::get(path).body(Body::empty()).unwrap())
                        .await
                        .unwrap();
                    assert_eq!(response.status(), StatusCode::OK);
                    let body = String::from_utf8(
                        to_bytes(response.into_body(), 16384)
                            .await
                            .unwrap()
                            .to_vec(),
                    )
                    .unwrap();
                    assert_eq!(
                        body.contains(if signup_enabled {
                            "LIGHTWEIGHT"
                        } else {
                            "CLOSED"
                        }),
                        anonymous && matches!(path, "/" | "/index.html"),
                        "{path}"
                    );
                    assert_eq!(
                        body.contains("SIGNUP_LINK"),
                        anonymous && signup_enabled && matches!(path, "/" | "/index.html")
                    );
                }
            }
        }
        for path in [
            "/homepage.html",
            "/homepage-closed.html",
            "/%68omepage-closed.html",
        ] {
            let response = assets
                .router()
                .oneshot(Request::get(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
        }
    }

    #[tokio::test]
    async fn homepage_metadata_is_in_the_initial_response_and_not_on_app_routes() {
        let assets = Assets::new();
        std::fs::write(
            assets.0.join("index.html"),
            format!("<html><head><title>Orbit Imperium</title></head><body>{INDEX}</body></html>"),
        )
        .unwrap();
        for path in [
            "/",
            "/?utm_source=example",
            "/index.html",
            "/login",
            "/signup",
            "/u/demo/overview",
            "/unknown",
        ] {
            let response = assets
                .router()
                .oneshot(Request::get(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            let home = path == "/" || path.starts_with("/?") || path == "/index.html";
            assert_eq!(
                response.headers().get("x-robots-tag").is_some(),
                !home,
                "{path}"
            );
            let body = String::from_utf8(
                to_bytes(response.into_body(), 16384)
                    .await
                    .unwrap()
                    .to_vec(),
            )
            .unwrap();
            assert_eq!(body.contains("rel=\"canonical\""), home, "{path}");
            assert_eq!(body.contains("application/ld+json"), home, "{path}");
            assert_eq!(body.matches("<title").count(), 1, "{path}");
            if home {
                assert!(body.contains("href=\"https://community.example/\""));
                assert!(!body.contains("utm_source"));
                assert!(body.contains("property=\"og:image\""));
            }
        }
    }

    #[tokio::test]
    async fn public_documents_never_bootstrap_a_session_and_discourage_indexing() {
        let assets = Assets::new();
        let app = router_with(
            assets.0.to_string_lossy().into_owned(),
            "https://community.example".into(),
            Arc::new(|_| panic!("public document must not initialize the reader's game")),
        );
        for path in [
            "/reports/shared/00000000-0000-4000-8000-000000000001",
            "/alliances/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002",
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::get(path)
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
                "https://community.example".into(),
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
            "/homepage.html",
            "/homepage-closed.html",
            "/%68omepage-closed.html",
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
                "/robots.txt",
                "/sitemap.xml",
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
            "https://community.example".into(),
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
            "https://community.example".into(),
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

//! Public editorial feed. Storage faults never affect game readiness or requests.
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use orbit_application::announcements::{FeedStore, Snapshot};
use std::{sync::Arc, time::Duration};
use tokio::{sync::Mutex, time::Instant};
struct Cache {
    checked: Instant,
    result: Result<Snapshot, ()>,
}
struct News {
    store: Arc<dyn FeedStore>,
    cache: Mutex<Option<Cache>>,
}
pub fn router(store: Arc<dyn FeedStore>) -> Router {
    Router::new()
        .route("/api/announcements", get(feed))
        .with_state(Arc::new(News {
            store,
            cache: Mutex::new(None),
        }))
}
async fn feed(State(news): State<Arc<News>>, headers: HeaderMap) -> Response {
    let mut cache = news.cache.lock().await;
    if cache
        .as_ref()
        .is_none_or(|c| c.checked.elapsed() >= Duration::from_secs(60))
    {
        let result = tokio::time::timeout(Duration::from_secs(3), news.store.load())
            .await
            .ok()
            .and_then(Result::ok)
            .ok_or(());
        *cache = Some(Cache {
            checked: Instant::now(),
            result,
        });
    }
    match &cache.as_ref().expect("cache initialized").result {
        Ok(snapshot) => {
            let etag = format!("\"{}\"", snapshot.revision.as_deref().unwrap_or("empty"));
            let response_headers = [
                (header::CACHE_CONTROL, "no-cache".to_string()),
                (header::ETAG, etag.clone()),
            ];
            if headers
                .get(header::IF_NONE_MATCH)
                .and_then(|v| v.to_str().ok())
                == Some(&etag)
            {
                (StatusCode::NOT_MODIFIED, response_headers).into_response()
            } else {
                (response_headers, Json(snapshot)).into_response()
            }
        }
        Err(()) => (
            StatusCode::SERVICE_UNAVAILABLE,
            [
                (header::CACHE_CONTROL, "no-store"),
                (header::RETRY_AFTER, "60"),
            ],
        )
            .into_response(),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use orbit_application::announcements::{Error, Feed, FeedFuture};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tower::ServiceExt;
    struct Fake(AtomicUsize);
    impl FeedStore for Fake {
        fn load(&self) -> FeedFuture<'_> {
            Box::pin(async {
                let n = self.0.fetch_add(1, Ordering::SeqCst);
                if n == 1 {
                    return Err(Error::Unavailable);
                }
                Ok(Snapshot {
                    revision: Some(format!("{n:064x}")),
                    feed: Feed::default(),
                })
            })
        }
    }
    async fn get(app: Router, etag: Option<&str>) -> Response {
        let mut request = axum::http::Request::builder().uri("/api/announcements");
        if let Some(etag) = etag {
            request = request.header(header::IF_NONE_MATCH, etag);
        }
        app.oneshot(request.body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap()
    }
    #[tokio::test(start_paused = true)]
    async fn feed_revalidates_and_recovers_without_serving_stale_news_on_failure() {
        let store = Arc::new(Fake(AtomicUsize::new(0)));
        let app = router(store.clone());
        let response = get(app.clone(), None).await;
        assert_eq!(response.status(), StatusCode::OK);
        let etag = response.headers()[header::ETAG].to_str().unwrap();
        assert_eq!(
            get(app.clone(), Some(etag)).await.status(),
            StatusCode::NOT_MODIFIED
        );
        assert_eq!(store.0.load(Ordering::SeqCst), 1);
        tokio::time::advance(Duration::from_secs(60)).await;
        assert_eq!(
            get(app.clone(), Some(etag)).await.status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(
            get(app.clone(), None).await.status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(store.0.load(Ordering::SeqCst), 2);
        tokio::time::advance(Duration::from_secs(60)).await;
        assert_eq!(get(app, Some(etag)).await.status(), StatusCode::OK);
    }
}

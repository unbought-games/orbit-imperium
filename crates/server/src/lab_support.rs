//! Test-support-only scheduler notification after an external controlled-clock advance.
use axum::{
    Router,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use std::sync::Arc;
use tokio::sync::Notify;

fn signal(headers: &HeaderMap, token: &str, wake: &Notify) -> StatusCode {
    if headers
        .get("x-orbit-lab-token")
        .and_then(|v| v.to_str().ok())
        != Some(token)
    {
        return StatusCode::FORBIDDEN;
    }
    wake.notify_one();
    StatusCode::NO_CONTENT
}

pub fn router(wake: Arc<Notify>, token: String) -> Router {
    Router::new().route(
        "/__lab/wake",
        post(move |headers: HeaderMap| {
            let wake = wake.clone();
            let token = token.clone();
            async move { signal(&headers, &token, &wake) }
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn only_authenticated_lab_signal_wakes_scheduler() {
        let wake = Notify::new();
        let mut headers = HeaderMap::new();
        assert_eq!(
            signal(&headers, "fixture-secret", &wake),
            StatusCode::FORBIDDEN
        );
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(5), wake.notified())
                .await
                .is_err()
        );
        headers.insert("x-orbit-lab-token", "fixture-secret".parse().unwrap());
        assert_eq!(
            signal(&headers, "fixture-secret", &wake),
            StatusCode::NO_CONTENT
        );
        tokio::time::timeout(std::time::Duration::from_millis(50), wake.notified())
            .await
            .unwrap();
    }
}

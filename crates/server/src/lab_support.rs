//! Test-support-only scheduler notification after an external controlled-clock advance.
use axum::{
    Json, Router,
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

pub fn router(wake: Arc<Notify>, token: String, store: orbit_storage_postgres::PgStore) -> Router {
    let view_token = token.clone();
    let quote_token = token.clone();
    let view_store = store.clone();
    Router::new()
        .route(
            "/__lab/wake",
            post(move |headers: HeaderMap| {
                let wake = wake.clone();
                let token = token.clone();
                async move { signal(&headers, &token, &wake) }
            }),
        )
        .route(
            "/__lab/view",
            post(
                move |headers: HeaderMap, Json(context): Json<orbit_application::QueryContext>| {
                    let token = view_token.clone();
                    let store = view_store.clone();
                    async move {
                        authorize(&headers, &token)?;
                        use orbit_application::{GameStore, IdentityStore};
                        let b = context.binding;
                        let snapshot = store
                            .bound_view(b)
                            .await
                            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                        let view =
                            orbit_application::lab_world_projection(&snapshot.facts, context)
                                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                        let status = store
                            .bot_status(orbit_application::Principal {
                                account: b.account,
                                player: b.player,
                                universe: b.universe,
                            })
                            .await
                            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                        Ok::<_, StatusCode>(Json(
                            serde_json::json!({"view":view,"bot_status":status}),
                        ))
                    }
                },
            ),
        )
        .route(
            "/__lab/quote",
            post(
                move |headers: HeaderMap, Json(query): Json<orbit_application::WorldQuery>| {
                    let token = quote_token.clone();
                    let store = store.clone();
                    async move {
                        authorize(&headers, &token)?;
                        let orbit_application::WorldQueryKind::FleetQuote { intent } = query.query
                        else {
                            return Err(StatusCode::BAD_REQUEST);
                        };
                        let quote = store
                            .lab_fleet_quote(query.context.binding, intent)
                            .await
                            .map_err(|error| match error {
                                orbit_application::StoreError::GameRejected(_) => {
                                    StatusCode::UNPROCESSABLE_ENTITY
                                }
                                _ => StatusCode::INTERNAL_SERVER_ERROR,
                            })?;
                        Ok::<_, StatusCode>(Json(serde_json::json!({"data":quote})))
                    }
                },
            ),
        )
}

fn authorize(headers: &HeaderMap, token: &str) -> Result<(), StatusCode> {
    if headers
        .get("x-orbit-lab-token")
        .and_then(|v| v.to_str().ok())
        == Some(token)
    {
        Ok(())
    } else {
        Err(StatusCode::FORBIDDEN)
    }
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

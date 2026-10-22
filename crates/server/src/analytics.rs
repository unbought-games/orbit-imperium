//! Optional first-party measurement. All remote calls are bounded and independent of game commands.
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use orbit_application::IdentityStore;
use orbit_storage_postgres::PgStore;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::sync::{Semaphore, watch};
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    endpoint: String,
    property_id: uuid::Uuid,
    public_token: String,
    policy_version: i32,
    environment: String,
    #[serde(default)]
    handoff_origins: BTreeMap<String, uuid::Uuid>,
    #[serde(default)]
    enabled: bool,
}
pub fn disabled_router() -> Router {
    Router::new().route(
        "/api/analytics",
        get(|| async {
            (
                [(axum::http::header::CACHE_CONTROL, "no-store")],
                Json(json!({"enabled":false})),
            )
        }),
    )
}
pub struct Integration {
    config: Config,
    token: String,
    http: reqwest::Client,
    store: PgStore,
    oidc: Option<unbought_auth::RelyingParty>,
    origin: String,
    permits: Semaphore,
}
impl Integration {
    pub fn from_env(
        store: PgStore,
        oidc: Option<unbought_auth::RelyingParty>,
        origin: String,
    ) -> Result<Option<Arc<Self>>, Box<dyn std::error::Error>> {
        let Ok(raw) = std::env::var("ANALYTICS_CONFIG") else {
            return Ok(None);
        };
        let config: Config = serde_json::from_str(&raw)?;
        if !config.enabled {
            return Ok(None);
        }
        let url = reqwest::Url::parse(&config.endpoint)?;
        if url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
            || !(url.scheme() == "https"
                || (url.scheme() == "http"
                    && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))))
            || config.policy_version < 1
            || config.public_token.len() < 16
            || config.public_token.len() > 512
            || config.environment.is_empty()
            || config.environment.len() > 64
        {
            return Err("Invalid analytics configuration".into());
        }
        let token = std::env::var("ANALYTICS_SERVER_TOKEN")?;
        if token.is_empty() || token.contains(['\r', '\n']) {
            return Err("Invalid analytics token".into());
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Some(Arc::new(Self {
            config,
            token,
            http,
            store,
            oidc,
            origin,
            permits: Semaphore::new(4),
        })))
    }
    fn public(&self) -> Value {
        json!({"endpoint":self.config.endpoint.trim_end_matches('/'),"propertyId":self.config.property_id,"publicToken":self.config.public_token,"policyVersion":self.config.policy_version,"environment":self.config.environment,"handoffOrigins":self.config.handoff_origins})
    }
    pub fn router(self: &Arc<Self>) -> Router {
        Router::new()
            .route("/api/analytics", get(status).post(bridge))
            .layer(DefaultBodyLimit::max(4096))
            .with_state(self.clone())
    }
    async fn post(&self, path: &str, body: Value) -> Result<Value, StatusCode> {
        let mut response = self
            .http
            .post(format!(
                "{}{path}",
                self.config.endpoint.trim_end_matches('/')
            ))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        if !response.status().is_success() {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        if response.content_length().is_some_and(|n| n > 65536) {
            return Err(StatusCode::BAD_GATEWAY);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?
        {
            if bytes.len() + chunk.len() > 65536 {
                return Err(StatusCode::BAD_GATEWAY);
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| StatusCode::BAD_GATEWAY)
    }
    pub async fn dispatch(&self) -> Result<(), StatusCode> {
        let events = self
            .store
            .claim_analytics()
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        if events.is_empty() {
            return Ok(());
        }
        let ack = self
            .post("/v1/ingest/server", json!({"events":events}))
            .await?;
        for result in ack["results"].as_array().ok_or(StatusCode::BAD_GATEWAY)? {
            let Some(event) = events.iter().find(|e| e["event_id"] == result["event_id"]) else {
                continue;
            };
            let id =
                uuid::Uuid::parse_str(event["event_id"].as_str().ok_or(StatusCode::BAD_GATEWAY)?)
                    .map_err(|_| StatusCode::BAD_GATEWAY)?;
            let state = match result["status"].as_str() {
                Some("accepted" | "duplicate") => "delivered",
                Some("rejected" | "conflict") => "quarantined",
                _ => continue,
            };
            if state == "delivered" && event["category"] == "enrollment" {
                self.post("/v1/identity/link",json!({"property_id":self.config.property_id,"subject":event["subject"],"target":{"namespace":"orbit_player","id":event["properties"]["target_id"]},"relationship":"player","world":event["properties"]["world"],"evidence_event_id":id})).await?;
            }
            let reason = result["code"].as_str().filter(|v| v.len() <= 128);
            self.store
                .acknowledge_analytics(id, state, reason)
                .await
                .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        }
        Ok(())
    }
    pub async fn run(self: Arc<Self>, mut drain: watch::Receiver<bool>) {
        while !*drain.borrow() {
            let _ = self.dispatch().await;
            tokio::select! {_ = tokio::time::sleep(Duration::from_secs(5))=>{},_ = drain.changed()=>{}}
        }
    }
    async fn session(
        &self,
        h: &HeaderMap,
    ) -> Result<
        (
            orbit_application::AuthenticatedSession,
            unbought_auth::Identity,
        ),
        StatusCode,
    > {
        let cookie = h
            .get("cookie")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| {
                v.split(';')
                    .find_map(|p| p.trim().strip_prefix("orbit_session="))
            })
            .ok_or(StatusCode::UNAUTHORIZED)?;
        let digest = hex::encode(Sha256::digest(cookie.as_bytes()));
        let identity = self
            .store
            .revalidate_oidc(&digest, self.oidc.as_ref().ok_or(StatusCode::UNAUTHORIZED)?)
            .await
            .map_err(|_| StatusCode::UNAUTHORIZED)?;
        let session = self
            .store
            .lookup_session(&digest)
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
            .ok_or(StatusCode::UNAUTHORIZED)?;
        Ok((session, identity))
    }
}
fn blocked(h: &HeaderMap) -> bool {
    h.get("sec-gpc").is_some_and(|v| v == "1") || h.get("dnt").is_some_and(|v| v == "1")
}
async fn status(State(s): State<Arc<Integration>>, h: HeaderMap) -> (HeaderMap, Json<Value>) {
    let headers = HeaderMap::from_iter([(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    )]);
    if blocked(&h) {
        return (headers, Json(json!({"enabled":false})));
    }
    let key = s.session(&h).await.ok().map(|(session, _)| {
        hex::encode(Sha256::digest(
            format!("{}:{}", s.config.property_id, session.account.0).as_bytes(),
        ))
    });
    (
        headers,
        Json(json!({"enabled":true,"config":s.public(),"accountKey":key})),
    )
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Journey {
    visit_id: uuid::Uuid,
    visitor_id: uuid::Uuid,
    touch_id: Option<uuid::Uuid>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    action: String,
    journey: Journey,
    handoff: Option<String>,
}
async fn bridge(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
    Json(body): Json<Request>,
) -> Result<(HeaderMap, Json<Value>), StatusCode> {
    if blocked(&h) || h.get("origin").and_then(|v| v.to_str().ok()) != Some(s.origin.as_str()) {
        return Err(StatusCode::FORBIDDEN);
    }
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let journey = json!({"visit_id":body.journey.visit_id,"visitor_id":body.journey.visitor_id,"touch_id":body.journey.touch_id});
    let value = match body.action.as_str() {
        "redeem" => {
            let handoff = body.handoff.ok_or(StatusCode::BAD_REQUEST)?;
            if handoff.len() < 16
                || handoff.len() > 128
                || !handoff
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"._~-".contains(&c))
            {
                return Err(StatusCode::BAD_REQUEST);
            }
            s.post("/v1/journey/redeem",json!({"handoff":handoff,"audience":s.config.property_id,"visit_id":body.journey.visit_id,"visitor_id":body.journey.visitor_id})).await?;
            json!({"redeemed":true})
        }
        "identify" => {
            let (session, identity) = s.session(&h).await?;
            if h.get("x-csrf-token").and_then(|v| v.to_str().ok()) != Some(session.csrf.as_str()) {
                return Err(StatusCode::FORBIDDEN);
            }
            let evidence = s
                .store
                .capture_analytics(
                    session.account,
                    json!({"namespace":format!("oidc_{}", hex::encode(Sha256::digest(identity.issuer.as_bytes()))),"id":identity.subject}),
                    &s.public(),
                    &journey,
                )
                .await
                .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
            let _ = s.dispatch().await;
            if !s
                .store
                .analytics_delivered(evidence)
                .await
                .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
            {
                json!({"pending":true})
            } else {
                s.post("/v1/identity/proof",json!({"property_id":s.config.property_id,"visit_id":body.journey.visit_id,"visitor_id":body.journey.visitor_id,"evidence_event_id":evidence})).await?
            }
        }
        _ => return Err(StatusCode::BAD_REQUEST),
    };
    Ok((
        HeaderMap::from_iter([(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-store"),
        )]),
        Json(value),
    ))
}

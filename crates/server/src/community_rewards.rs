//! Optional official service bridge. Network work is bounded and outside gameplay commits.
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    routing::{get, post},
};
use orbit_application::{CommunityDelivery, IdentityStore};
use orbit_storage_postgres::PgStore;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Semaphore, watch};

pub struct Integration {
    pub observations: Arc<orbit_transport_http::AccountRewardsClient>,
    deployment_id: String,
    catalog_status: Value,
    catalog: Option<orbit_application::InsigniaCatalog>,
    endpoint: String,
    issuer: String,
    token: String,
    http: reqwest::Client,
    store: PgStore,
    oidc: Option<unbought_auth::RelyingParty>,
    callback_digest: [u8; 32],
    origin: String,
    permits: Semaphore,
    callback_permits: Semaphore,
}
impl Integration {
    pub fn from_env(
        store: PgStore,
        oidc: Option<unbought_auth::RelyingParty>,
        origin: String,
        customization: Option<&orbit_transport_http::Customization>,
    ) -> Result<Option<Arc<Self>>, Box<dyn std::error::Error>> {
        let Ok(token) = std::env::var("ORBIT_ACCOUNTS_REWARDS_CREDENTIAL") else {
            return Ok(None);
        };
        if token.len() < 32 || token.len() > 4096 || token.chars().any(char::is_control) {
            return Err("Invalid rewards credential".into());
        }
        let deployment_id = std::env::var("ORBIT_ACCOUNTS_REWARDS_DEPLOYMENT_ID")?;
        if deployment_id.is_empty()
            || deployment_id.len() > 200
            || !deployment_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b":._/-".contains(&b))
        {
            return Err("Invalid rewards deployment identity".into());
        }
        let callback = std::env::var("ORBIT_ACCOUNTS_REWARDS_CALLBACK_CREDENTIAL")?;
        if callback.len() < 32 || callback == token || callback.chars().any(char::is_control) {
            return Err("Invalid separate rewards callback credential".into());
        }
        let callback_digest: [u8; 32] = Sha256::digest(callback.as_bytes()).into();
        let issuer = std::env::var("ORBIT_OIDC_ISSUER")?;
        let endpoint = std::env::var("ORBIT_ACCOUNTS_REWARDS_URL")
            .unwrap_or_else(|_| issuer.trim_end_matches("/api/auth").into());
        let url = reqwest::Url::parse(&endpoint)?;
        let allow_local = std::env::var("ORBIT_ACCOUNTS_REWARDS_ALLOW_HTTP").as_deref() == Ok("1");
        if url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
            || !(url.scheme() == "https"
                || (allow_local
                    && url.scheme() == "http"
                    && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
        {
            return Err("Invalid rewards service URL".into());
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        let observations = Arc::new(orbit_transport_http::AccountRewardsClient::new(
            &endpoint, &token,
        )?);
        Ok(Some(Arc::new(Self {
            observations,
            deployment_id,
            catalog: customization.map(|c| c.catalog.clone()),
            catalog_status: json!({"contract_version":1,"catalog_pin":std::env::var("ORBIT_COSMETIC_CATALOG").ok(),
                "catalog_version":if customization.is_some_and(|c|!c.catalog.dyes().is_empty() || !c.catalog.treatments().is_empty()) {3} else {2},
                "catalog_ready":customization.is_some(),"catalog_versions":customization.and_then(|c|c.catalog.catalog_version.clone()).into_iter().collect::<Vec<_>>(),"supported_account_kinds":["dye","finish","effect","title","mark"],
                "supported_renderers":["plain","surface","light","interaction"],"recipe_version":3,
                "evidence_worker":true,"delivery_worker":true}),
            endpoint: endpoint.trim_end_matches('/').into(),
            issuer,
            token,
            http,
            store,
            oidc,
            callback_digest,
            origin,
            permits: Semaphore::new(4),
            callback_permits: Semaphore::new(4),
        })))
    }
    pub fn router(self: &Arc<Self>) -> Router {
        Router::new()
            .route("/api/v1/rewards", get(owner))
            .route("/api/v1/rewards/actions", post(action))
            .route("/api/v1/rewards/marks", get(account_marks))
            .route(
                "/api/v1/rewards/alliances/{alliance}/honors",
                get(alliance_honors),
            )
            .route(
                "/api/v1/rewards/invitation-preview",
                get(invitation_preview),
            )
            .route("/api/v1/rewards/service/status", post(service_status))
            .route(
                "/api/v1/rewards/service/diagnostics",
                post(service_diagnostics),
            )
            .route(
                "/api/v1/rewards/service/invitation-evidence",
                post(invitation_evidence),
            )
            .route(
                "/api/v1/rewards/service/alliance-snapshot",
                post(alliance_snapshot),
            )
            .layer(axum::middleware::map_response(
                |mut response: axum::response::Response| async move {
                    response.headers_mut().insert(
                        header::CACHE_CONTROL,
                        axum::http::HeaderValue::from_static("no-store"),
                    );
                    response
                },
            ))
            .layer(DefaultBodyLimit::max(16 * 1024))
            .with_state(self.clone())
    }
    async fn post(&self, path: &str, body: Value) -> Result<Value, StatusCode> {
        let mut response = self
            .http
            .post(format!("{}/api/community/v1/service/{path}", self.endpoint))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        let status = response.status();
        if !status.is_success() {
            return Err(match status.as_u16() {
                400 => StatusCode::BAD_REQUEST,
                403 => StatusCode::FORBIDDEN,
                404 => StatusCode::NOT_FOUND,
                409 => StatusCode::CONFLICT,
                429 => StatusCode::TOO_MANY_REQUESTS,
                _ => StatusCode::SERVICE_UNAVAILABLE,
            });
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?
        {
            if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                return Err(StatusCode::BAD_GATEWAY);
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| StatusCode::BAD_GATEWAY)
    }
    async fn session(
        &self,
        h: &HeaderMap,
        mutation: bool,
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
        if identity.issuer != self.issuer {
            return Err(StatusCode::UNAUTHORIZED);
        }
        let session = self
            .store
            .lookup_session(&digest)
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
            .ok_or(StatusCode::UNAUTHORIZED)?;
        if mutation
            && (h.get("origin").and_then(|v| v.to_str().ok()) != Some(self.origin.as_str())
                || h.get("x-csrf-token").and_then(|v| v.to_str().ok())
                    != Some(session.csrf.as_str()))
        {
            return Err(StatusCode::FORBIDDEN);
        }
        Ok((session, identity))
    }
    pub async fn dispatch(&self) -> Result<(), StatusCode> {
        let events = self
            .store
            .claim_community_events(&self.issuer)
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        if !events.is_empty() {
            let wire: Vec<_> = events
                .iter()
                .map(|event| {
                    let mut event = event.clone();
                    event.as_object_mut().unwrap().remove("lease");
                    event
                })
                .collect();
            let response = self
                .post("events", json!({"contract_version":1,"events":wire}))
                .await?;
            for outcome in response["results"]
                .as_array()
                .ok_or(StatusCode::BAD_GATEWAY)?
            {
                let Some(event) = events.iter().find(|event| event["id"] == outcome["id"]) else {
                    return Err(StatusCode::BAD_GATEWAY);
                };
                let rejected = match outcome["status"].as_str() {
                    Some("accepted" | "duplicate") => false,
                    Some("rejected") => true,
                    _ => return Err(StatusCode::BAD_GATEWAY),
                };
                let id = serde_json::from_value(event["id"].clone())
                    .map_err(|_| StatusCode::BAD_GATEWAY)?;
                let lease = serde_json::from_value(event["lease"].clone())
                    .map_err(|_| StatusCode::BAD_GATEWAY)?;
                self.store
                    .acknowledge_community_event(id, lease, rejected, outcome["code"].as_str())
                    .await
                    .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
            }
        }
        let response = self
            .post("deliveries", json!({"contract_version":1,"limit":100}))
            .await?;
        for item in response["deliveries"]
            .as_array()
            .ok_or(StatusCode::BAD_GATEWAY)?
        {
            let award: CommunityDelivery =
                serde_json::from_value(item.clone()).map_err(|_| StatusCode::BAD_GATEWAY)?;
            if self
                .store
                .deliver_community_award(&self.issuer, &award)
                .await
                .is_err()
            {
                // Retain the remote authorization, including unsupported/missing links.
                self.post("receipts", json!({"contract_version":1,"receipts":[{"award_id":award.award_id,"status":"retryable","code":"recipient_or_kind_unavailable"}]})).await?;
            }
        }
        if let Some(honors) = response["alliance_honors"].as_array() {
            for honor in honors {
                self.store
                    .community_collective_awards(honor)
                    .await
                    .map_err(store_status)?;
            }
        }
        let receipts = self
            .store
            .community_pending_receipts()
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        if !receipts.is_empty() {
            self.post(
                "receipts",
                json!({"contract_version":1,"receipts":receipts}),
            )
            .await?;
            let ids: Vec<_> = receipts
                .iter()
                .filter_map(|r| r["award_id"].as_str().map(str::to_owned))
                .collect();
            self.store
                .acknowledge_community_receipts(&ids)
                .await
                .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        }
        Ok(())
    }
    pub async fn run(self: Arc<Self>, mut drain: watch::Receiver<bool>) {
        let worker = uuid::Uuid::new_v4();
        while !*drain.borrow() {
            let _ = self.store.community_worker_observe(worker, false).await;
            let outcome = self.dispatch().await;
            let _ = self
                .store
                .community_worker_observe(worker, outcome.is_ok())
                .await;
            if let Err(status) = outcome {
                eprintln!("community rewards delivery pending: {}", status.as_u16());
            }
            tokio::select! { _ = tokio::time::sleep(Duration::from_secs(10)) => {}, _ = drain.changed() => {} }
        }
    }
}
fn response(value: Value) -> ([(header::HeaderName, &'static str); 1], Json<Value>) {
    ([(header::CACHE_CONTROL, "no-store")], Json(value))
}
async fn owner(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let (session, identity) = s.session(&h, false).await?;
    s.store
        .community_capture_history(session.account)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(response(
        s.post(
            "owner",
            json!({"contract_version":1,"subject":identity.subject}),
        )
        .await?,
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ActionRequest {
    contract_version: u32,
    request_id: String,
    action: Value,
}
async fn action(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
    Json(body): Json<ActionRequest>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let (session, identity) = s.session(&h, true).await?;
    if body.contract_version != 1 || body.request_id.is_empty() || body.request_id.len() > 200 {
        return Err(StatusCode::BAD_REQUEST);
    }
    validate_invitation_game(&body.action)?;
    if body.action["type"] == "create_invitation" && body.action["kind"] != "personal" {
        let alliance = serde_json::from_value(body.action["alliance"].clone())
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        let event = s
            .store
            .community_prepare_invitation(session.account, &s.issuer, &body.request_id, &alliance)
            .await
            .map_err(store_status)?;
        let result = s
            .post("events", json!({"contract_version":1,"events":[event]}))
            .await?;
        if !matches!(
            result["results"][0]["status"].as_str(),
            Some("accepted" | "duplicate")
        ) {
            return Err(StatusCode::CONFLICT);
        }
    }
    s.observations.invalidate(&identity.subject);
    let result=s.post("actions", json!({"contract_version":1,"subject":identity.subject,"request_id":body.request_id,"action":body.action})).await;
    s.observations.invalidate(&identity.subject);
    Ok(response(result?))
}
pub fn disabled_router() -> Router {
    Router::new().route(
        "/api/v1/rewards",
        get(|| async { response(json!({"enabled":false})) }),
    )
}

fn callback_authorized(s: &Integration, headers: &HeaderMap) -> Result<(), StatusCode> {
    if headers.contains_key("origin") {
        return Err(StatusCode::FORBIDDEN);
    }
    let credential = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let digest: [u8; 32] = Sha256::digest(credential.as_bytes()).into();
    // Equal fixed-size digests, no early mismatch branch.
    let mismatch = digest
        .iter()
        .zip(s.callback_digest)
        .fold(0u8, |diff, (a, b)| diff | (a ^ b));
    if mismatch != 0 {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(())
}
fn store_status(error: orbit_application::StoreError) -> StatusCode {
    match error {
        orbit_application::StoreError::Conflict => StatusCode::CONFLICT,
        orbit_application::StoreError::NotFound => StatusCode::NOT_FOUND,
        _ => StatusCode::SERVICE_UNAVAILABLE,
    }
}
async fn invitation_evidence(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
    Json(body): Json<orbit_application::InvitationEvidenceRequest>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    callback_authorized(&s, &h)?;
    let _permit = s
        .callback_permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    Ok(response(
        s.store
            .community_invitation_evidence(&s.issuer, &body)
            .await
            .map_err(store_status)?,
    ))
}
async fn alliance_snapshot(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
    Json(body): Json<orbit_application::AllianceSnapshotRequest>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    callback_authorized(&s, &h)?;
    let _permit = s
        .callback_permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    Ok(response(
        s.store
            .community_alliance_snapshot(&s.issuer, &body)
            .await
            .map_err(store_status)?,
    ))
}

async fn service_status(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    callback_authorized(&s, &h)?;
    let runtime = s.store.community_status().await.map_err(store_status)?;
    let versions = s.catalog_status["catalog_versions"].clone();
    Ok(response(
        json!({"contract_version":1,"ready":s.catalog_status["catalog_ready"]==true && runtime["worker_ready"]==true && runtime["worker_connected"]==true && versions.as_array().is_some_and(|v|!v.is_empty()),"catalog_versions":versions,"supported_kinds":["dye","finish","effect","title","mark","emblem","emblem_set"],"deployment_id":s.deployment_id}),
    ))
}
async fn service_diagnostics(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    callback_authorized(&s, &h)?;
    let mut status = s.catalog_status.clone();
    status["runtime"] = s.store.community_status().await.map_err(store_status)?;
    Ok(response(status))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PreviewQuery {
    code: String,
}
async fn invitation_preview(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
    Query(query): Query<PreviewQuery>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    if !valid_invitation_code(&query.code) {
        return Err(StatusCode::BAD_REQUEST);
    }
    // A public preview never creates attribution. Invalid/absent sessions may
    // see only the same safe anonymous proposal; writes still require CSRF/auth.
    let subject = match s.session(&h, false).await {
        Ok((_, identity)) => Some(identity.subject),
        Err(StatusCode::UNAUTHORIZED) => None,
        Err(status) => return Err(status),
    };
    let mut request = json!({"contract_version":1,"code":query.code});
    if let Some(subject) = subject {
        request["subject"] = json!(subject);
    }
    let result = s.post("invitation-preview", request).await?;
    Ok(response(public_invitation_preview(
        result,
        &query.code,
        &s.origin,
    )?))
}

fn valid_invitation_code(code: &str) -> bool {
    !code.is_empty()
        && code.len() <= 200
        && code.as_bytes()[0].is_ascii_alphanumeric()
        && code
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))
}

fn validate_invitation_game(action: &Value) -> Result<(), StatusCode> {
    if action["type"] == "create_invitation" && action["game_id"] != "orbit-imperium" {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(())
}

fn public_invitation_preview(result: Value, code: &str, origin: &str) -> Result<Value, StatusCode> {
    // Even a bad upstream registration cannot turn this bridge into an external redirect.
    if result["code"] != code
        || result["game_id"] != "orbit-imperium"
        || result["url"] != format!("{}/invite/{code}", origin.trim_end_matches('/'))
    {
        return Err(StatusCode::BAD_GATEWAY);
    }
    // Only safe proposed attribution. Never forward callback receipts/internal account IDs.
    let mut public = serde_json::Map::new();
    let alliance = match result["kind"].as_str() {
        Some("personal") => Value::Null,
        Some("combined" | "alliance_public") => {
            let mut identity = serde_json::Map::new();
            for field in ["universe_id", "alliance_id"] {
                let value = result["alliance"][field]
                    .as_str()
                    .ok_or(StatusCode::BAD_GATEWAY)?;
                uuid::Uuid::parse_str(value).map_err(|_| StatusCode::BAD_GATEWAY)?;
                identity.insert(field.into(), json!(value));
            }
            Value::Object(identity)
        }
        _ => return Err(StatusCode::BAD_GATEWAY),
    };
    public.insert("alliance".into(), alliance);
    for field in [
        "code",
        "kind",
        "inviter_name",
        "alliance_name",
        "game_id",
        "game_name",
        "url",
        "requires_game_check",
        "preview_version",
        "accepted",
        "attribution_locked",
    ] {
        public.insert(
            field.into(),
            result.get(field).cloned().ok_or(StatusCode::BAD_GATEWAY)?,
        );
    }
    Ok(Value::Object(public))
}

async fn account_marks(
    State(s): State<Arc<Integration>>,
    h: HeaderMap,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let (_, identity) = s.session(&h, false).await?;
    let observation = s
        .observations
        .resolve(&identity.subject)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let catalog = s.catalog.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let marks = catalog
        .marks()
        .iter()
        .filter(|m| {
            m.owner_kind == orbit_application::MarkOwner::Account
                && observation.owns("mark", &m.id, unbought_auth::now())
        })
        .collect::<Vec<_>>();
    Ok(response(
        json!({"marks":marks,"expires_at":observation.expires_at}),
    ))
}
async fn alliance_honors(
    State(s): State<Arc<Integration>>,
    Path(alliance): Path<uuid::Uuid>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let mut honors = s
        .store
        .community_alliance_honors(alliance)
        .await
        .map_err(store_status)?;
    let catalog = s.catalog.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    for honor in &mut honors {
        let mark = honor["item_id"]
            .as_str()
            .and_then(|id| catalog.mark(id))
            .filter(|m| m.owner_kind == orbit_application::MarkOwner::Alliance);
        honor["mark"] = json!(mark);
        honor["treatment"] = json!(
            mark.and_then(|m| m.concrete_grant())
                .filter(|(kind, _)| *kind == "finish" || *kind == "effect")
                .and_then(|(_, id)| catalog.treatment(id))
        );
        honor["emblem_url"] = json!(
            mark.and_then(|m| m.concrete_grant())
                .filter(|(kind, _)| *kind == "insignia")
                .and_then(|(_, id)| catalog.get(id))
                .map(|item| format!(
                    "/api/alliance-presentation/symbols/{}?alliance={alliance}",
                    item.id
                ))
        );
    }
    Ok(response(json!({"alliance_id":alliance,"honors":honors})))
}

#[cfg(test)]
mod invitation_tests {
    use super::*;

    #[test]
    fn every_invitation_creation_requires_this_game() {
        for kind in ["personal", "combined", "alliance_public"] {
            for game in [Value::Null, json!("other-game"), json!("orbit-imperium")] {
                let action = json!({"type":"create_invitation","kind":kind,"game_id":game});
                assert_eq!(
                    validate_invitation_game(&action).is_ok(),
                    game == "orbit-imperium"
                );
            }
        }
    }

    #[test]
    fn public_proposals_are_game_bound_and_exclude_private_evidence() {
        for kind in ["personal", "combined", "alliance_public"] {
            let result = json!({"code":"inv_sample","kind":kind,"inviter_name":"Sample commander","alliance_name":"Sample alliance","game_id":"orbit-imperium","game_name":"Orbit Imperium","url":"https://orbit.example/invite/inv_sample","requires_game_check":true,"preview_version":"v1","accepted":false,"attribution_locked":false,"alliance":{"universe_id":"00000000-0000-4000-8000-000000000003","alliance_id":"00000000-0000-4000-8000-000000000008","epoch_id":"private-unused"},"inviter_id":"private-id","evidence":{"receipt":"private-receipt"}});
            let public =
                public_invitation_preview(result.clone(), "inv_sample", "https://orbit.example")
                    .unwrap();
            assert_eq!(public["kind"], kind);
            assert!(public.get("inviter_id").is_none());
            assert!(public.get("evidence").is_none());
            if kind == "personal" {
                assert!(public["alliance"].is_null());
            } else {
                assert!(public["alliance"].get("epoch_id").is_none());
            }
            for (field, value) in [
                ("game_id", "other-game"),
                ("code", "other-code"),
                ("url", "https://evil.example/invite/inv_sample"),
            ] {
                let mut forged = result.clone();
                forged[field] = json!(value);
                assert_eq!(
                    public_invitation_preview(forged, "inv_sample", "https://orbit.example"),
                    Err(StatusCode::BAD_GATEWAY)
                );
            }
        }
        for code in ["", "../escape", "code/other", "code\n", "<script>"] {
            assert!(!valid_invitation_code(code));
        }
        assert!(valid_invitation_code("inv_A-b_9"));
    }
}

mod alliances;
mod bootstrap;
mod bootstrap_html;
mod bots;
mod bound_api;
mod home_seo;
mod location_card;
mod location_preview;
mod oidc;
mod oidc_enrollment;
mod password_work;
mod player_profiles;
mod shared_report_preview;
mod simulation;
pub use player_profiles::AccountProfiles;
mod rate_limit;
mod signup_config;
mod static_assets;
mod updates;
mod v2;
mod v3;
mod v4;
use axum::{
    Extension, Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use orbit_application::*;
use serde::Deserialize;
use std::time::Instant;
use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
};
use tokio::sync::{Mutex, Semaphore};

#[derive(Clone)]
pub struct HttpConfig {
    pub origin: String,
    pub assets: String,
    pub login_per_minute: u32,
    pub signup: Option<SignupPolicy>,
    pub signup_per_minute: u32,
    /// Only used when the storage adapter explicitly permits legacy fallback.
    pub legacy_signup_enabled: bool,
    pub wake: Option<Arc<tokio::sync::Notify>>,
    pub observer: Option<Arc<dyn RuntimeObserver>>,
}
impl HttpConfig {
    fn session_cookie(&self, name: &str, value: &str, age: u32) -> String {
        // The server validates this browser-facing origin at startup. The
        // internal connection and forwarded request headers are not inputs.
        let secure = if self.origin.starts_with("https://") {
            "; Secure"
        } else {
            ""
        };
        format!("{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}{secure}")
    }
}
struct HttpState<S> {
    profiles: Option<AccountProfiles>,
    oidc: Option<unbought_auth::RelyingParty>,
    game: GameService<S>,
    sessions: SessionService<S>,
    config: HttpConfig,
    alliance_public_budget: Mutex<rate_limit::LoginBudget>,
    login_budget: Mutex<rate_limit::LoginBudget>,
    signup_budget: Mutex<rate_limit::LoginBudget>,
    password_work: Arc<Semaphore>,
    updates: S,
    drain: Option<tokio::sync::watch::Receiver<bool>>,
}
pub fn router<S>(store: S, config: HttpConfig) -> Router
where
    S: GameStore + IdentityStore + UpdateStore + Clone + Send + Sync + 'static,
{
    build_router(store, config, None, None)
}
pub fn router_with_drain<S>(
    store: S,
    config: HttpConfig,
    drain: tokio::sync::watch::Receiver<bool>,
) -> Router
where
    S: GameStore + IdentityStore + UpdateStore + Clone + Send + Sync + 'static,
{
    build_router(store, config, Some(drain), None)
}
pub fn router_with_auth<S>(
    store: S,
    config: HttpConfig,
    drain: tokio::sync::watch::Receiver<bool>,
    oidc: Option<unbought_auth::RelyingParty>,
) -> Router
where
    S: GameStore + IdentityStore + UpdateStore + Clone + Send + Sync + 'static,
{
    build_router(store, config, Some(drain), oidc)
}
fn build_router<S>(
    store: S,
    config: HttpConfig,
    drain: Option<tokio::sync::watch::Receiver<bool>>,
    oidc: Option<unbought_auth::RelyingParty>,
) -> Router
where
    S: GameStore + IdentityStore + UpdateStore + Clone + Send + Sync + 'static,
{
    build_router_with_profiles(store, config, drain, oidc, None)
}
pub fn router_with_profiles<S>(
    store: S,
    config: HttpConfig,
    drain: tokio::sync::watch::Receiver<bool>,
    oidc: Option<unbought_auth::RelyingParty>,
    profiles: Option<AccountProfiles>,
) -> Router
where
    S: GameStore + IdentityStore + UpdateStore + Clone + Send + Sync + 'static,
{
    build_router_with_profiles(store, config, Some(drain), oidc, profiles)
}
fn build_router_with_profiles<S>(
    store: S,
    config: HttpConfig,
    drain: Option<tokio::sync::watch::Receiver<bool>>,
    oidc: Option<unbought_auth::RelyingParty>,
    profiles: Option<AccountProfiles>,
) -> Router
where
    S: GameStore + IdentityStore + UpdateStore + Clone + Send + Sync + 'static,
{
    let observer = config
        .observer
        .clone()
        .unwrap_or_else(|| Arc::new(NoopRuntimeObserver));
    let state = Arc::new(HttpState {
        profiles,
        oidc,
        game: GameService::new(store.clone()),
        sessions: SessionService::new(store.clone()),
        updates: store,
        drain,
        config,
        alliance_public_budget: Mutex::new(rate_limit::LoginBudget::new()),
        login_budget: Mutex::new(rate_limit::LoginBudget::new()),
        signup_budget: Mutex::new(rate_limit::LoginBudget::new()),
        password_work: Arc::new(Semaphore::new(2)),
    });
    Router::new()
        .route(
            "/u/{universe}/location/{coordinates}",
            get(location_preview::page::<S>),
        )
        .route(
            "/u/{universe}/location/{coordinates}/preview.png",
            get(location_preview::image::<S>),
        )
        .route(
            "/api/v1/universes/{id}/player-profiles",
            post(player_profiles::query::<S>),
        )
        .route("/api/auth/config", get(oidc::configuration::<S>))
        .route("/api/auth/login", get(oidc::login::<S>))
        .route("/api/auth/login-journey", post(oidc::login_journey::<S>))
        .route("/api/auth/callback", get(oidc::callback::<S>))
        .route("/api/auth/identity", get(oidc::identity::<S>))
        .route("/api/auth/enroll", post(oidc::enroll::<S>))
        .route("/api/auth/backchannel-logout", post(oidc::logout::<S>))
        .route("/api/v1/session/renew", post(renew_session::<S>))
        .route("/api/v1/bootstrap", get(bootstrap::get::<S>))
        .route(
            "/api/v1/registration",
            get(registration::<S>).post(signup::<S>),
        )
        .route("/health/live", get(|| async { StatusCode::NO_CONTENT }))
        .route("/health/ready", get(ready::<S>))
        .route(
            "/api/v1/session",
            post(login::<S>).get(session::<S>).delete(logout::<S>),
        )
        .route(
            "/api/v1/universes/{id}/overview",
            get(v2::retired).post(v2::retired),
        )
        .route("/api/v1/universes/{id}/quotes", post(v2::retired))
        .route("/api/v1/universes/{id}/commands", post(v2::retired))
        .route(
            "/api/v1/universes/{id}/commands/{command}",
            get(v2::retired),
        )
        .route("/api/v2/universes/{id}/binding", get(v2::binding::<S>))
        .route("/api/v2/universes/{id}/overview", post(v2::overview::<S>))
        .route("/api/v2/universes/{id}/settings", post(v2::settings::<S>))
        .route("/api/v2/universes/{id}/quotes", post(v2::quotes::<S>))
        .route("/api/v2/universes/{id}/commands", post(v2::commands::<S>))
        .route(
            "/api/v2/universes/{id}/commands/{command}",
            get(v2::receipt::<S>),
        )
        .route("/api/v3/universes/{id}/binding", get(v3::binding::<S>))
        .route("/api/v3/universes/{id}/overview", post(v3::overview::<S>))
        .route("/api/v3/universes/{id}/settings", post(v3::settings::<S>))
        .route("/api/v3/universes/{id}/quotes", post(v3::quotes::<S>))
        .route(
            "/api/v3/universes/{id}/progression-options",
            post(v3::options::<S>),
        )
        .route("/api/v3/universes/{id}/commands", post(v3::commands::<S>))
        .route(
            "/api/v3/universes/{id}/commands/{command}",
            get(v3::receipt::<S>),
        )
        .route("/api/v4/universes/{id}/bot-status", get(bots::status::<S>))
        .route("/api/v4/universes/{id}/bot-retire", post(bots::retire::<S>))
        .route(
            "/api/v4/universes/{id}/machine/commands",
            post(bots::commands::<S>),
        )
        .route("/api/v4/universes/{id}/binding", get(v4::binding::<S>))
        .route("/api/v4/universes/{id}/overview", post(v4::overview::<S>))
        .route("/api/v4/universes/{id}/catalog", post(v4::catalog::<S>))
        .route("/api/v4/universes/{id}/settings", post(v4::settings::<S>))
        .route("/api/v4/universes/{id}/quotes", post(v4::quotes::<S>))
        .route(
            "/api/v4/universes/{id}/progression-options",
            post(v4::options::<S>),
        )
        .route("/api/v4/universes/{id}/commands", post(v4::commands::<S>))
        .route(
            "/api/v4/universes/{id}/commands/{command}",
            get(v4::receipt::<S>),
        )
        .route("/api/v4/universes/{id}/updates", get(updates::stream::<S>))
        .route("/api/v4/universes/{id}/presence", post(v4::presence::<S>))
        .route("/api/v4/universes/{id}/world", post(v4::query::<S>))
        .route("/api/v4/universes/{id}/rankings", post(v4::rankings::<S>))
        .route(
            "/api/v4/universes/{id}/alliances/query",
            post(alliances::query::<S>),
        )
        .route(
            "/api/v4/universes/{id}/alliances/commands",
            post(alliances::command::<S>).layer(DefaultBodyLimit::max(128 * 1024)),
        )
        .route(
            "/api/v4/universes/{id}/alliances/{alliance}",
            get(alliances::public::<S>),
        )
        .route(
            "/api/v4/universes/{id}/combat-simulation",
            post(simulation::simulate::<S>),
        )
        .route(
            "/reports/shared/{token}",
            get(shared_report_preview::page::<S>),
        )
        .route(
            "/api/v4/shared-reports/{token}",
            get(v4::shared_report::<S>),
        )
        .route(
            "/api/v4/universes/{id}/reports/{report}/share",
            post(v4::report_share::<S>),
        )
        .route("/api/v4/universes/{id}/reports", post(v4::reports::<S>))
        .route(
            "/api/v4/universes/{id}/reports/{report}",
            post(v4::report::<S>),
        )
        .layer(axum::middleware::from_fn_with_state(
            observer,
            observe_request,
        ))
        .layer(DefaultBodyLimit::max(16 * 1024))
        .with_state(state.clone())
        .fallback_service(static_assets::router(state))
}
async fn observe_request(
    State(observer): State<Arc<dyn RuntimeObserver>>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let path = request.uri().path();
    let stage = path.contains("/universes/").then(|| {
        if path.ends_with("/commands") || path.ends_with("/presence") {
            RuntimeStage::Admission
        } else {
            RuntimeStage::Read
        }
    });
    let started = Instant::now();
    let response = next.run(request).await;
    if let Some(stage) = stage {
        observer.duration(stage, started.elapsed());
    }
    if response.status().is_server_error() {
        observer.event(RuntimeEvent::HttpFailure);
    }
    response
}

struct Problem(ServiceError);

fn snapshot_response<T: serde::Serialize>(
    headers: &HeaderMap,
    mut snapshot: ReadSnapshot<T>,
) -> Response {
    let metadata = headers
        .get("x-orbit-view-metadata")
        .and_then(|h| h.to_str().ok())
        == Some("1");
    let mut facts = match serde_json::to_value(snapshot.facts) {
        Ok(serde_json::Value::Object(facts)) => facts,
        _ => return Problem(ServiceError::InvariantFailure).into_response(),
    };
    facts.insert("sampled_at".into(), snapshot.progress.sampled_at.into());
    if !metadata {
        return ([(header::CACHE_CONTROL, "no-store")], Json(facts)).into_response();
    }
    if let Some(minimum) = headers.get("x-orbit-minimum-revision") {
        let minimum = minimum.to_str().ok().and_then(|s| s.parse::<u64>().ok());
        let Some(minimum) = minimum else {
            return Problem(ServiceError::Malformed).into_response();
        };
        let actual = facts
            .get("viewer_revision")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u64>().ok());
        snapshot.progress.minimum_revision_pending = actual.is_none_or(|actual| actual < minimum);
    }
    match serde_json::to_value(snapshot.progress) {
        Ok(progress) => {
            facts.insert("progress".into(), progress);
        }
        Err(_) => return Problem(ServiceError::InvariantFailure).into_response(),
    }
    ([(header::CACHE_CONTROL, "no-store")], Json(facts)).into_response()
}
impl From<ServiceError> for Problem {
    fn from(e: ServiceError) -> Self {
        Self(e)
    }
}
impl IntoResponse for Problem {
    fn into_response(self) -> Response {
        if matches!(self.0, ServiceError::RateLimited) {
            return rate_limited(60);
        }
        if let ServiceError::BotDenied(ref denial) = self.0 {
            return (StatusCode::FORBIDDEN, [(header::CONTENT_TYPE,"application/problem+json"),(header::CACHE_CONTROL,"no-store")], Json(serde_json::json!({"type":"about:blank","status":403,"code":denial.code,"next_eligible_at":denial.next_eligible_at}))).into_response();
        }
        let game_code = if let ServiceError::GameRejected(ref e) = self.0 {
            Some(e.clone())
        } else {
            None
        };
        let (status, code) = match self.0 {
            ServiceError::BotDenied(_) => unreachable!(),
            ServiceError::UniverseFull => (StatusCode::CONFLICT, "UniverseFull"),
            ServiceError::InvalidCursor => (StatusCode::BAD_REQUEST, "InvalidCursor"),
            ServiceError::EpochChanged => (StatusCode::CONFLICT, "EpochChanged"),
            ServiceError::UnsupportedProtocol => {
                (StatusCode::UPGRADE_REQUIRED, "UnsupportedProtocol")
            }
            ServiceError::GameRejected(_) => (StatusCode::UNPROCESSABLE_ENTITY, "GameRejected"),
            ServiceError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "RateLimited"),
            ServiceError::Unauthenticated => (StatusCode::UNAUTHORIZED, "Unauthenticated"),
            ServiceError::Forbidden => (StatusCode::FORBIDDEN, "Forbidden"),
            ServiceError::Malformed => (StatusCode::BAD_REQUEST, "Malformed"),
            ServiceError::Conflict => (StatusCode::CONFLICT, "Conflict"),
            ServiceError::NotFound => (StatusCode::NOT_FOUND, "NotFound"),
            ServiceError::Unavailable
            | ServiceError::InvariantFailure
            | ServiceError::UnsupportedState => (StatusCode::SERVICE_UNAVAILABLE, "Unavailable"),
        };
        let mut problem =
            serde_json::json!({"type":"about:blank","status":status.as_u16(),"code":code});
        if let Some(code) = game_code {
            problem["game_code"] = serde_json::json!(code);
        }
        (
            status,
            [
                (header::CONTENT_TYPE, "application/problem+json"),
                (header::CACHE_CONTROL, "no-store"),
            ],
            Json(problem),
        )
            .into_response()
    }
}
fn token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(str::trim)
        .find_map(|part| part.strip_prefix("orbit_session="))
}
fn origin<S>(s: &HttpState<S>, h: &HeaderMap) -> Result<(), Problem> {
    if h.get(header::ORIGIN).and_then(|v| v.to_str().ok()) != Some(s.config.origin.as_str()) {
        return Err(ServiceError::Forbidden.into());
    }
    Ok(())
}
async fn authenticate<S: IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
    mutation: bool,
) -> Result<AuthenticatedSession, Problem> {
    if let Some(value) = h.get(header::AUTHORIZATION) {
        let bearer = value
            .to_str()
            .ok()
            .and_then(|v| v.strip_prefix("Bearer "))
            .filter(|v| !v.is_empty() && v.len() <= 256)
            .ok_or(ServiceError::Unauthenticated)?;
        return s
            .updates
            .authenticate_machine(&token_digest(bearer))
            .await
            .map_err(ServiceError::from)?
            .ok_or(ServiceError::Unauthenticated.into());
    }
    if let Some(rp) = &s.oidc {
        s.updates
            .revalidate_oidc(
                &token_digest(token(h).ok_or(ServiceError::Unauthenticated)?),
                rp,
            )
            .await
            .map_err(oidc::session_error)?;
    }
    let session = s
        .sessions
        .authenticate(token(h).ok_or(ServiceError::Unauthenticated)?)
        .await?;
    if mutation {
        origin(s, h)?;
        if h.get("x-csrf-token").and_then(|v| v.to_str().ok()) != Some(session.csrf.as_str()) {
            return Err(ServiceError::Forbidden.into());
        }
    }
    Ok(session)
}
fn cookie<S>(s: &HttpState<S>, value: &str, age: u32) -> String {
    s.config.session_cookie("orbit_session", value, age)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Login {
    name: String,
    password: String,
}
async fn login<S: GameStore + IdentityStore + Clone + 'static>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    q: Result<
        axum::extract::Query<bootstrap::BootstrapQuery>,
        axum::extract::rejection::QueryRejection,
    >,
    ApiJson(request): ApiJson<Login>,
) -> Result<Response, Problem> {
    if s.oidc.is_some() {
        return Err(ServiceError::Forbidden.into());
    }
    origin(&s, &h)?;
    let include_bootstrap = bootstrap::query(q)?;
    if request.name.len() > 80 || request.password.len() > 1024 {
        return Err(ServiceError::Unauthenticated.into());
    }
    let source = login_source(peer.map(|Extension(ConnectInfo(address))| address));
    let name = request.name.trim().to_lowercase();
    if let Err(retry) =
        s.login_budget
            .lock()
            .await
            .admit(source, &name, s.config.login_per_minute, Instant::now())
    {
        return Ok(rate_limited(retry));
    }
    let prior = token(&h).map(str::to_owned);
    let service = s.sessions.clone();
    let work = match password_work::spawn(&s.password_work, move || {
        tokio::runtime::Handle::current().block_on(service.login(
            &request.name,
            &request.password,
            prior.as_deref(),
        ))
    }) {
        Ok(work) => work,
        Err(_) => return Ok(rate_limited(1)),
    };
    let result = work.await.map_err(|_| ServiceError::Unavailable)??;
    let mut response = if include_bootstrap {
        bootstrap::private_response(
            &h,
            bootstrap::prepare_authenticated_bootstrap(&s, result.session).await,
        )
    } else {
        ([(header::CACHE_CONTROL, "no-store")], Json(result.session)).into_response()
    };
    response.headers_mut().insert(
        header::SET_COOKIE,
        cookie(&s, &result.token, SESSION_IDLE_SECONDS)
            .parse()
            .map_err(|_| ServiceError::InvariantFailure)?,
    );
    Ok(response)
}
async fn registration<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
) -> Result<Response, Problem> {
    let enabled = signup_config::resolve(&s)
        .await
        .map_err(ServiceError::from)?
        .is_some();
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"enabled":enabled})),
    )
        .into_response())
}
async fn signup<S: GameStore + IdentityStore + Clone + 'static>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    q: Result<
        axum::extract::Query<bootstrap::BootstrapQuery>,
        axum::extract::rejection::QueryRejection,
    >,
    ApiJson(request): ApiJson<Login>,
) -> Result<Response, Problem> {
    if s.oidc.is_some() {
        return Err(ServiceError::Forbidden.into());
    }
    origin(&s, &h)?;
    let include_bootstrap = bootstrap::query(q)?;
    let (policy, per_minute) = signup_config::resolve(&s)
        .await
        .map_err(ServiceError::from)?
        .ok_or(ServiceError::Forbidden)?;
    if request.name.len() > 80 || request.password.len() > 1024 {
        return Err(ServiceError::Malformed.into());
    }
    let source = login_source(peer.map(|Extension(ConnectInfo(address))| address));
    let name = request.name.trim().to_lowercase();
    if let Err(retry) =
        s.signup_budget
            .lock()
            .await
            .admit(source, &name, per_minute, Instant::now())
    {
        return Ok(rate_limited(retry));
    }
    let prior = token(&h).map(str::to_owned);
    let service = s.sessions.clone();
    let work = match password_work::spawn(&s.password_work, move || {
        tokio::runtime::Handle::current().block_on(service.signup(
            &request.name,
            &request.password,
            policy,
            prior.as_deref(),
        ))
    }) {
        Ok(work) => work,
        Err(_) => return Ok(rate_limited(1)),
    };
    let result = work.await.map_err(|_| ServiceError::Unavailable)??;
    let mut response = if include_bootstrap {
        bootstrap::private_response(
            &h,
            bootstrap::prepare_authenticated_bootstrap(&s, result.session).await,
        )
    } else {
        ([(header::CACHE_CONTROL, "no-store")], Json(result.session)).into_response()
    };
    response.headers_mut().insert(
        header::SET_COOKIE,
        cookie(&s, &result.token, SESSION_IDLE_SECONDS)
            .parse()
            .map_err(|_| ServiceError::InvariantFailure)?,
    );
    *response.status_mut() = StatusCode::CREATED;
    Ok(response)
}
async fn session<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
) -> Result<Response, Problem> {
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(authenticate(&s, &h, false).await?),
    )
        .into_response())
}
async fn logout<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
) -> Result<Response, Problem> {
    authenticate(&s, &h, true).await?;
    s.sessions
        .logout(token(&h).ok_or(ServiceError::Unauthenticated)?)
        .await?;
    Ok((
        StatusCode::NO_CONTENT,
        [(header::SET_COOKIE, cookie(&s, "", 0))],
    )
        .into_response())
}
pub type HttpRouter = Router;
pub async fn serve(
    listener: tokio::net::TcpListener,
    app: Router,
    shutdown: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<(), std::io::Error> {
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown)
    .await
}
// HTTP types for adapter contract tests; game/application contracts remain runtime independent.
pub mod test_http {
    pub use axum::{body::Body, extract::ConnectInfo, http::Request};
}

async fn ready<S: GameStore>(State(s): State<Arc<HttpState<S>>>) -> Result<StatusCode, Problem> {
    s.game.ready().await?;
    Ok(StatusCode::NO_CONTENT)
}

fn player_for(session: &AuthenticatedSession, u: UniverseId) -> Result<Actor, Problem> {
    Ok(Actor::Player(
        session
            .memberships
            .iter()
            .find(|m| m.universe == u)
            .ok_or(ServiceError::NotFound)?
            .player,
    ))
}
struct ApiJson<T>(T);
impl<S, T> axum::extract::FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: serde::de::DeserializeOwned,
{
    type Rejection = Response;
    async fn from_request(
        request: axum::extract::Request,
        state: &S,
    ) -> Result<Self, Self::Rejection> {
        match Json::<T>::from_request(request, state).await {
            Ok(Json(value)) => Ok(Self(value)),
            Err(error) => {
                let status = if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
                    StatusCode::PAYLOAD_TOO_LARGE
                } else {
                    StatusCode::BAD_REQUEST
                };
                Err((status,[(header::CONTENT_TYPE,"application/problem+json"),(header::CACHE_CONTROL,"no-store")],Json(serde_json::json!({"type":"about:blank","status":status.as_u16(),"code":if status==StatusCode::PAYLOAD_TOO_LARGE{"BodyTooLarge"}else{"Malformed"}}))).into_response())
            }
        }
    }
}

fn rate_limited(seconds: u64) -> Response {
    (
        StatusCode::TOO_MANY_REQUESTS,
        [
            (header::CONTENT_TYPE, "application/problem+json".to_owned()),
            (header::RETRY_AFTER, seconds.to_string()),
            (header::CACHE_CONTROL, "no-store".to_owned()),
        ],
        Json(serde_json::json!({"type":"about:blank","status":429,"code":"RateLimited"})),
    )
        .into_response()
}
fn login_source(peer: Option<SocketAddr>) -> IpAddr {
    peer.map(|p| p.ip())
        .unwrap_or(IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED))
}
#[cfg(test)]
mod source_tests {
    use super::*;

    #[test]
    fn source_uses_the_connection_peer_without_its_port() {
        for address in ["203.0.113.1:1234", "127.0.0.1:4321", "[2001:db8::1]:1234"] {
            let peer = address.parse::<SocketAddr>().unwrap();
            assert_eq!(login_source(Some(peer)), peer.ip());
        }
    }

    #[test]
    fn missing_peer_uses_one_shared_source() {
        assert_eq!(
            login_source(None),
            IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED)
        );
    }
}

#[cfg(test)]
mod auth_worker_tests;

#[cfg(test)]
mod problem_tests {
    use super::*;
    #[tokio::test]
    async fn unsupported_persisted_state_remains_a_private_unavailable_response() {
        let response = Problem(StoreError::UnsupportedState.into()).into_response();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
            serde_json::json!({"type":"about:blank","status":503,"code":"Unavailable"})
        );
    }
}

/// Foreground activity is explicit; SSE, polling and token revalidation never renew.
async fn renew_session<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
) -> Result<Response, Problem> {
    origin(&s, &h)?;
    let value = token(&h).ok_or(ServiceError::Unauthenticated)?;
    let session = s.sessions.authenticate(value).await?;
    if h.get("x-csrf-token").and_then(|v| v.to_str().ok()) != Some(session.csrf.as_str()) {
        return Err(ServiceError::Forbidden.into());
    }
    let expires = s
        .updates
        .renew_session(&token_digest(value), s.oidc.as_ref())
        .await
        .map_err(oidc::session_error)?;
    let age = ((expires / 1000 - unbought_auth::now()).max(0) as u32).min(SESSION_IDLE_SECONDS);
    Ok((
        [
            (header::SET_COOKIE, cookie(&s, value, age)),
            (header::CACHE_CONTROL, "no-store".into()),
        ],
        StatusCode::NO_CONTENT,
    )
        .into_response())
}

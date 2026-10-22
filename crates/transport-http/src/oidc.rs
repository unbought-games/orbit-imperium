use super::*;
use axum::{
    extract::{Form, Query},
    response::Redirect,
};
use unbought_auth::{Error, LoginStore, LoginTransaction};
pub(super) fn session_error(error: StoreError) -> ServiceError {
    match error {
        StoreError::Conflict | StoreError::NotFound => ServiceError::Unauthenticated,
        other => other.into(),
    }
}
fn provider_error(error: Error) -> ServiceError {
    match error {
        Error::Unavailable => ServiceError::Unavailable,
        _ => ServiceError::Unauthenticated,
    }
}
struct Transactions<'a, S>(&'a S);
impl<S: IdentityStore> LoginStore for Transactions<'_, S> {
    async fn insert(&self, t: LoginTransaction) -> unbought_auth::Result<()> {
        self.0
            .save_oidc_login(t)
            .await
            .map_err(|_| Error::Unavailable)
    }
    async fn consume(
        &self,
        issuer: &str,
        client: &str,
        state: &str,
        browser: &str,
        now: i64,
    ) -> unbought_auth::Result<Option<LoginTransaction>> {
        self.0
            .consume_oidc_login(issuer, client, state, browser, now)
            .await
            .map_err(|_| Error::Unavailable)
    }
}
fn browser(h: &HeaderMap) -> Option<&str> {
    h.get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|v| v.trim().strip_prefix("orbit_oidc="))
}
#[derive(Deserialize)]
pub(super) struct LoginQuery {
    #[serde(default)]
    return_to: Option<String>,
    #[serde(default)]
    verify: bool,
}
pub(super) async fn configuration<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
) -> Result<Response, Problem> {
    let universes = if s.oidc.is_some() || s.config.signup.is_some() {
        s.updates
            .universe_summaries()
            .await
            .map_err(ServiceError::from)?
    } else {
        vec![]
    };
    let universes: Vec<_> = universes
        .into_iter()
        .filter(|universe| {
            s.oidc.is_some()
                || s.config
                    .signup
                    .is_some_and(|binding| binding.universe == universe.universe)
        })
        .collect();
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(serde_json::json!({"mode":if s.oidc.is_some(){"oidc"}else{"local"},"universes":universes,"client_id":s.oidc.as_ref().map(|r|r.configuration().client_id.as_str()),"accounts_url":s.oidc.as_ref().map(|r|r.configuration().issuer.trim_end_matches("/api/auth"))}))).into_response())
}
pub(super) async fn login<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Query(q): Query<LoginQuery>,
) -> Result<Response, Problem> {
    let rp = s.oidc.as_ref().ok_or(ServiceError::Forbidden)?;
    let secret = browser(&h)
        .map(str::to_owned)
        .unwrap_or_else(unbought_auth::random_secret);
    let expected = if q.verify {
        Some(
            s.updates
                .revalidate_oidc(
                    &token_digest(token(&h).ok_or(ServiceError::Unauthenticated)?),
                    rp,
                )
                .await
                .map_err(session_error)?
                .subject,
        )
    } else {
        None
    };
    let url = rp
        .begin(
            &Transactions(&s.updates),
            &secret,
            q.return_to.as_deref().unwrap_or("/"),
            expected,
        )
        .await
        .map_err(provider_error)?;
    let cookie = format!(
        "orbit_oidc={secret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600{}",
        if s.config.secure_cookies {
            "; Secure"
        } else {
            ""
        }
    );
    Ok((
        [
            (header::SET_COOKIE, cookie),
            (header::CACHE_CONTROL, "no-store".into()),
        ],
        Redirect::to(&url),
    )
        .into_response())
}
#[derive(Deserialize)]
pub(super) struct Callback {
    code: String,
    state: String,
    iss: String,
}
pub(super) async fn callback<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Query(q): Query<Callback>,
) -> Result<Response, Problem> {
    let rp = s.oidc.as_ref().ok_or(ServiceError::Forbidden)?;
    let (tokens, path) = rp
        .callback(
            &Transactions(&s.updates),
            browser(&h).ok_or(ServiceError::Unauthenticated)?,
            &q.state,
            &q.code,
            &q.iss,
        )
        .await
        .map_err(provider_error)?;
    // Orbit's cookie parser intentionally retains its existing 64-hex-character format.
    let secret = unbought_auth::digest(&unbought_auth::random_secret());
    let csrf = unbought_auth::random_secret();
    s.updates
        .complete_oidc_login(
            tokens,
            &token_digest(&secret),
            &csrf,
            token(&h).map(token_digest),
        )
        .await
        .map_err(ServiceError::from)?;
    Ok((
        [
            (
                header::SET_COOKIE,
                cookie(&s, &secret, SESSION_IDLE_SECONDS),
            ),
            (header::CACHE_CONTROL, "no-store".into()),
        ],
        Redirect::to(&path),
    )
        .into_response())
}
pub(super) async fn identity<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
) -> Result<Response, Problem> {
    let rp = s.oidc.as_ref().ok_or(ServiceError::Forbidden)?;
    authenticate(&s, &h, false).await?;
    let identity = s
        .updates
        .revalidate_oidc(
            &token_digest(token(&h).ok_or(ServiceError::Unauthenticated)?),
            rp,
        )
        .await
        .map_err(session_error)?;
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(identity)).into_response())
}
#[derive(Deserialize)]
pub(super) struct Enrollment {
    universe: uuid::Uuid,
}
pub(super) async fn enroll<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    ApiJson(body): ApiJson<Enrollment>,
) -> Result<Response, Problem> {
    if s.oidc.is_none() {
        return Err(ServiceError::Forbidden.into());
    }
    let session = authenticate(&s, &h, true).await?;
    let source = login_source(
        peer.map(|Extension(ConnectInfo(address))| address),
        &h,
        &s.config.trusted_fly_proxies,
    );
    oidc_enrollment::enroll(&s, session, UniverseId(body.universe), source).await
}

#[derive(Deserialize)]
pub(super) struct LogoutForm {
    logout_token: String,
}
pub(super) async fn logout<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    Form(body): Form<LogoutForm>,
) -> Result<Response, Problem> {
    let rp = s.oidc.as_ref().ok_or(ServiceError::Forbidden)?;
    let event = rp
        .logout(&body.logout_token)
        .await
        .map_err(provider_error)?;
    s.updates
        .revoke_oidc(
            &rp.configuration().issuer,
            &rp.configuration().client_id,
            event,
        )
        .await
        .map_err(ServiceError::from)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct JourneyLogin {
    return_to: Option<String>,
    #[serde(default)]
    verify: bool,
    handoff: String,
}
pub(super) async fn login_journey<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    ApiJson(body): ApiJson<JourneyLogin>,
) -> Result<Response, Problem> {
    origin(&s, &h)?;
    if body.handoff.len() < 16
        || body.handoff.len() > 128
        || !body
            .handoff
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._~-".contains(&c))
    {
        return Err(ServiceError::Forbidden.into());
    }
    let response = login(
        State(s),
        h,
        Query(LoginQuery {
            return_to: body.return_to,
            verify: body.verify,
        }),
    )
    .await?;
    let mut headers = response.headers().clone();
    let url = headers
        .get(header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(ServiceError::Unavailable)?
        .to_owned();
    headers.remove(header::LOCATION);
    Ok((
        headers,
        Json(serde_json::json!({"url":format!("{url}#analytics_handoff={}",body.handoff)})),
    )
        .into_response())
}

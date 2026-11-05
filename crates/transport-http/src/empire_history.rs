use super::*;
use axum::extract::Query;

async fn viewer<S: IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
) -> Result<Option<AccountId>, Problem> {
    if token(h).is_some() || h.contains_key(header::AUTHORIZATION) {
        match authenticate(s, h, false).await {
            Ok(session) => Ok(Some(session.account)),
            // Public archives remain public after a browser session expires.
            // Invalid explicit machine credentials must never become anonymous.
            Err(Problem(ServiceError::Unauthenticated))
                if !h.contains_key(header::AUTHORIZATION) =>
            {
                Ok(None)
            }
            Err(error) => Err(error),
        }
    } else {
        Ok(None)
    }
}
async fn budget<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
) -> Result<Option<Response>, Problem> {
    super::bots::public_access(s, h, None).await?;
    let source = login_source(peer.map(|Extension(ConnectInfo(a))| a));
    Ok(s.alliance_public_budget
        .lock()
        .await
        .admit(source, &source.to_string(), 120, Instant::now())
        .err()
        .map(rate_limited))
}
pub(super) async fn profile<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path(player): Path<uuid::Uuid>,
    Query(q): Query<HistoryQuery>,
) -> Result<Response, Problem> {
    if let Some(r) = budget(&s, &h, peer).await? {
        return Ok(r);
    }
    let mut p = s
        .updates
        .empire_profile(viewer(&s, &h).await?, player, q)
        .await
        .map_err(ServiceError::from)?;
    p.display = super::player_profiles::archive_display(&s, &p).await?;
    super::empire_identity::decorate(&s, &mut p).await?;
    super::empire_identity::response(&h, p)
}
pub(super) async fn overview<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Response, Problem> {
    if let Some(r) = budget(&s, &h, peer).await? {
        return Ok(r);
    }
    let mut overview = s
        .updates
        .orbit_profile(viewer(&s, &h).await?, Some(id))
        .await
        .map_err(ServiceError::from)?;
    for p in &mut overview.empires {
        super::empire_identity::decorate(&s, p).await?;
    }
    super::empire_identity::response(&h, overview)
}
pub(super) async fn mine<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
) -> Result<Response, Problem> {
    let account = authenticate(&s, &h, false).await?.account;
    let mut overview = s
        .updates
        .orbit_profile(Some(account), None)
        .await
        .map_err(ServiceError::from)?;
    for p in &mut overview.empires {
        super::empire_identity::decorate(&s, p).await?;
    }
    super::empire_identity::response(&h, overview)
}
pub(super) async fn detail<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Response, Problem> {
    if let Some(r) = budget(&s, &h, peer).await? {
        return Ok(r);
    }
    Ok(bound_api::no_store_json(
        s.updates
            .history_detail(viewer(&s, &h).await?, id, false)
            .await
            .map_err(ServiceError::from)?,
    ))
}
pub(super) async fn publication<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Response, Problem> {
    if let Some(r) = budget(&s, &h, peer).await? {
        return Ok(r);
    }
    Ok(bound_api::no_store_json(
        s.updates
            .history_detail(None, id, true)
            .await
            .map_err(ServiceError::from)?,
    ))
}
pub(super) async fn edit<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(player): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<ProfileCommand>,
) -> Result<Response, Problem> {
    let account = authenticate(&s, &h, true).await?.account;
    q.validate()?;
    if matches!(q.action, ProfileAction::Identity { .. }) {
        let p = s
            .updates
            .empire_profile(Some(account), player, HistoryQuery::default())
            .await
            .map_err(ServiceError::from)?;
        if !p.owner || p.removed || p.closed {
            return Err(ServiceError::NotFound.into());
        }
        let fallback = InsigniaCatalog::default();
        let (catalog, policy) = s
            .customization
            .as_ref()
            .map_or((&fallback, CosmeticPolicy::Unrestricted), |c| {
                (&c.catalog, c.policy)
            });
        let evidence = if policy == CosmeticPolicy::Supporter {
            super::empire_identity::evidence(&s, &p).await?
        } else {
            SupporterEvidence::default()
        };
        s.updates
            .edit_empire_identity(
                account,
                player,
                q,
                IdentityAccess {
                    catalog,
                    policy,
                    evidence,
                },
            )
            .await
            .map_err(ServiceError::from)?;
    } else {
        s.updates
            .edit_empire_profile(account, player, q)
            .await
            .map_err(ServiceError::from)?;
    }
    Ok(bound_api::no_store_json(serde_json::json!({"ok":true})))
}

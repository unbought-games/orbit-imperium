use super::bound_api::{no_store_json, path_binding, principal};
use super::*;
use axum::extract::Query;

pub(super) async fn query<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<AllianceQueryRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    path_binding(u, q.context.binding)?;
    s.game.require_protocol(session.account, u, 4).await?;
    let mut view = s.game.alliance_query(principal(&session, u)?, q).await?;
    for summary in &mut view.directory {
        if let Some(identity) = &mut summary.visual_identity {
            super::alliance_media::effective_identity(&s, summary.id, identity).await;
        }
    }
    if let Some(detail) = &mut view.alliance {
        if let Some(identity) = &mut detail.summary.visual_identity {
            super::alliance_media::effective_identity(&s, detail.summary.id, identity).await;
        }
        if let Some(presentation) = &mut detail.presentation {
            super::alliance_media::effective_identity(
                &s,
                detail.summary.id,
                &mut presentation.public.identity,
            )
            .await;
        }
    }
    if !presentation_enabled(&h) {
        for summary in &mut view.directory {
            summary.visual_identity = None;
        }
        if let Some(detail) = &mut view.alliance {
            detail.presentation = None;
            detail.summary.visual_identity = None;
        }
    }
    super::alliance_media::response(&s, &h, view)
}
pub(super) async fn command<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<AllianceCommandRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    path_binding(u, q.context.binding)?;
    s.game.require_protocol(session.account, u, 4).await?;
    super::alliance_media::validate_crest(&s, &q).await?;
    Ok(no_store_json(
        s.game.alliance_command(principal(&session, u)?, q).await?,
    ))
}
pub(super) async fn public<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path((universe, id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Response, Problem> {
    super::bots::public_access(&s, &h, Some(UniverseId(universe))).await?;
    let source = login_source(peer.map(|Extension(ConnectInfo(address))| address));
    if let Err(retry) = s.alliance_public_budget.lock().await.admit(
        source,
        &source.to_string(),
        120,
        Instant::now(),
    ) {
        return Ok(rate_limited(retry));
    }
    let mut data = s.game.public_alliance(UniverseId(universe), id).await?;
    if let Some(p) = &mut data.presentation {
        super::alliance_media::effective_identity(&s, data.summary.id, &mut p.identity).await;
        data.summary.visual_identity = Some(p.identity.clone());
    }
    legacy_public(&h, &mut data);
    let mut response = super::alliance_media::response(&s, &h, data)?;
    response
        .headers_mut()
        .insert("x-robots-tag", "noindex".parse().expect("static header"));
    Ok(response)
}

pub(super) async fn public_budget<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    h: &HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    universe: UniverseId,
) -> Option<Response> {
    if let Err(problem) = super::bots::public_access(s, h, Some(universe)).await {
        return Some(problem.into_response());
    }
    let source = login_source(peer.map(|Extension(ConnectInfo(address))| address));
    s.alliance_public_budget
        .lock()
        .await
        .admit(source, &source.to_string(), 120, Instant::now())
        .err()
        .map(rate_limited)
}
pub(super) async fn directory<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path(universe): Path<uuid::Uuid>,
    Query(query): Query<RecruitmentSearch>,
) -> Result<Response, Problem> {
    if let Some(response) = public_budget(&s, &h, peer, UniverseId(universe)).await {
        return Ok(response);
    }
    let mut data = s
        .game
        .recruitment_directory(UniverseId(universe), query)
        .await?;
    for alliance in &mut data.alliances {
        if let Some(identity) = &mut alliance.summary.visual_identity {
            super::alliance_media::effective_identity(&s, alliance.summary.id, identity).await;
        }
        if let Some(p) = &mut alliance.presentation {
            super::alliance_media::effective_identity(&s, alliance.summary.id, &mut p.identity)
                .await;
            alliance.summary.visual_identity = Some(p.identity.clone());
        }
        legacy_public(&h, alliance);
    }
    super::alliance_media::response(&s, &h, data)
}
pub(super) async fn invitation<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path((universe, token)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Response, Problem> {
    if let Some(response) = public_budget(&s, &h, peer, UniverseId(universe)).await {
        return Ok(response);
    }
    let mut data = s
        .game
        .alliance_invitation(UniverseId(universe), token)
        .await?;
    if let Some(p) = &mut data.presentation {
        super::alliance_media::effective_identity(&s, data.summary.id, &mut p.identity).await;
        data.summary.visual_identity = Some(p.identity.clone());
    }
    legacy_public(&h, &mut data);
    super::alliance_media::response(&s, &h, data)
}

fn presentation_enabled(h: &HeaderMap) -> bool {
    h.get("x-orbit-alliance-presentation")
        .and_then(|v| v.to_str().ok())
        == Some("1")
}
fn legacy_public(h: &HeaderMap, p: &mut PublicAlliance) {
    if !presentation_enabled(h) {
        p.presentation = None;
        p.summary.visual_identity = None;
    }
}

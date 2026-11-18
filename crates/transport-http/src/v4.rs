use super::bound_api::{Discovery, ReceiptQuery, no_store_json, path_binding, principal};
use super::*;
use axum::extract::Query;
use axum::http::HeaderValue;

pub(super) async fn binding<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    q: Result<Query<Discovery>, axum::extract::rejection::QueryRejection>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, false).await?;
    let Query(q) = q.map_err(|_| ServiceError::Malformed)?;
    s.game
        .require_protocol(session.account, UniverseId(id), 4)
        .await?;
    Ok(no_store_json(
        s.game
            .current_binding(session.account, UniverseId(id), q.request_id)
            .await?,
    ))
}
pub(super) async fn overview<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, c.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game.world_view(principal(&session, u)?, c).await?,
    ))
}
pub(super) async fn quotes<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<QuoteQuery3>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game
            .progression_quote(principal(&session, u)?, q.context, q.request)
            .await?,
    ))
}
pub(super) async fn commands<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(e): ApiJson<ForegroundAction>,
) -> Result<Response, Problem> {
    super::request_observation::action(RequestAction::of_v3(&e.gameplay.command));
    super::request_observation::correlate(UniverseId(id), e.gameplay.command_id);
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, e.gameplay.binding)?;
    let actor = principal(&session, u)?;
    if e.requires_recent_authentication()? {
        let existing = s
            .game
            .bound_receipt(actor, e.gameplay.binding, e.gameplay.command_id)
            .await;
        let known = match existing {
            Ok(_) => true,
            Err(ServiceError::NotFound) => false,
            Err(error) => return Err(error.into()),
        };
        if !known {
            let fresh = match token(&h) {
                Some(token) if !h.contains_key(header::AUTHORIZATION) => s
                    .updates
                    .recent_authentication(&token_digest(token))
                    .await
                    .map_err(ServiceError::from)?,
                _ => false,
            };
            if !fresh {
                return Err(ServiceError::GameRejected(GameError::ReauthenticationRequired).into());
            }
        }
    }
    let r = s.game.world_submit(actor, e).await?;
    if let Some(wake) = &s.config.wake {
        wake.notify_one();
    }
    Ok((StatusCode::ACCEPTED, no_store_json(r)).into_response())
}
pub(super) async fn receipt<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path((id, command)): Path<(uuid::Uuid, uuid::Uuid)>,
    q: Result<Query<ReceiptQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, false).await?;
    let Query(q) = q.map_err(|_| ServiceError::Malformed)?;
    s.game
        .require_protocol(session.account, UniverseId(id), 4)
        .await?;
    let p = principal(&session, UniverseId(id))?;
    Ok(no_store_json(
        s.game
            .bound_receipt(
                p,
                Binding {
                    account: p.account,
                    player: p.player,
                    universe: p.universe,
                    epoch: q.epoch,
                },
                CommandId(command),
            )
            .await?,
    ))
}

pub(super) async fn settings<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, c.binding)?;
    let mut settings = s.game.bound_settings(principal(&session, u)?, c).await?;
    if !super::bootstrap::wants_debris_settings(&h) {
        settings.ship_debris = None;
    }
    Ok(no_store_json(settings))
}
pub(super) async fn options<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<QuoteQuery3>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    if matches!(q.request.clone().domain()?, QuoteRequest::Transport { .. }) {
        return Err(ServiceError::Malformed.into());
    }
    Ok(super::snapshot_response(
        &h,
        s.game
            .progression_options(principal(&session, u)?, q.context, q.request)
            .await?,
    ))
}

pub(super) async fn query<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<WorldQuery>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game.world_query(principal(&session, u)?, q).await?,
    ))
}
/// Earlier v4 clients validate previews with a closed field allowlist.
fn present_report_headers(
    request: &HeaderMap,
    headers: &mut [ReportHeader4],
    names: Option<&mut PublicPlayerNames>,
) {
    if request
        .get("x-orbit-report-preview")
        .is_some_and(|v| v == "1")
    {
        return;
    }
    let mut removed_sender = false;
    for header in headers.iter_mut() {
        if let Some(preview) = header
            .preview
            .as_mut()
            .and_then(serde_json::Value::as_object_mut)
            && preview.get("kind").and_then(serde_json::Value::as_str) == Some("SpyContact")
        {
            removed_sender |= preview.remove("sender").is_some();
        }
    }
    // A list names only players still identified by at least one visible preview.
    // Detail names belong to its full observation and are unchanged.
    if removed_sender && let Some(names) = names {
        let visible: std::collections::BTreeSet<_> = headers
            .iter()
            .filter_map(|header| header.preview.as_ref())
            .flat_map(report_profile_players)
            .collect();
        names.retain(|player, _| visible.contains(player));
    }
}

pub(super) async fn reports<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<ReportsQuery4>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    let mut snapshot = s.game.reports4(principal(&session, u)?, q).await?;
    let page = &mut snapshot.facts.data;
    present_report_headers(&h, &mut page.items, Some(&mut page.player_names));
    if h.get("x-orbit-report-arrivals").is_none_or(|v| v != "1") {
        page.arrivals = None;
    }
    Ok(super::snapshot_response(&h, snapshot))
}
pub(super) async fn report<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path((id, report)): Path<(uuid::Uuid, uuid::Uuid)>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, c.binding)?;
    let mut snapshot = s
        .game
        .report4(principal(&session, u)?, c, ReportId(report))
        .await?;
    present_report_headers(
        &h,
        std::slice::from_mut(&mut snapshot.facts.data.header),
        None,
    );
    Ok(super::snapshot_response(&h, snapshot))
}

pub(super) async fn presence<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(e): ApiJson<CommandEnvelopeV4>,
) -> Result<Response, Problem> {
    super::request_observation::action(RequestAction::Presence);
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, e.binding)?;
    let r = s.game.world_presence(principal(&session, u)?, e).await?;
    if let Some(wake) = &s.config.wake {
        wake.notify_one();
    }
    Ok((StatusCode::ACCEPTED, no_store_json(r)).into_response())
}

pub(super) async fn rankings<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, c.binding)?;
    let mut result = s.game.rankings(principal(&session, u)?, c).await?;
    for a in &mut result.alliances {
        if let Some(identity) = &mut a.alliance.visual_identity {
            super::alliance_media::effective_identity(&s, a.alliance.id, identity).await;
        }
    }
    for p in &mut result.players {
        if let Some(a) = &mut p.alliance
            && let Some(identity) = &mut a.visual_identity
        {
            super::alliance_media::effective_identity(&s, a.id, identity).await;
        }
    }
    if h.get("x-orbit-alliance-presentation")
        .and_then(|v| v.to_str().ok())
        != Some("1")
    {
        for a in &mut result.alliances {
            a.alliance.visual_identity = None;
        }
        for p in &mut result.players {
            if let Some(a) = &mut p.alliance {
                a.visual_identity = None;
            }
        }
    }
    super::alliance_media::response(&s, &h, result)
}

pub(super) async fn report_share<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path((id, report)): Path<(uuid::Uuid, uuid::Uuid)>,
    ApiJson(q): ApiJson<ReportShareRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    Ok(no_store_json(
        s.game
            .report_share(principal(&session, u)?, ReportId(report), q)
            .await?,
    ))
}
pub(super) async fn mark_reports_read<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<ReportsReadRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    let mut result = s.game.mark_reports_read(principal(&session, u)?, q).await?;
    present_report_headers(&h, &mut result.items, None);
    Ok(no_store_json(result))
}

pub(super) async fn shared_report<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    Path(token): Path<uuid::Uuid>,
    h: HeaderMap,
) -> Result<Response, Problem> {
    super::bots::public_report_access(&s, &h, token).await?;
    let mut response = no_store_json(s.game.shared_report(token).await?);
    response.headers_mut().insert(
        "x-robots-tag",
        HeaderValue::from_static("noindex, nofollow, noarchive"),
    );
    response
        .headers_mut()
        .insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    Ok(response)
}

pub(super) async fn catalog<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(c): ApiJson<QueryContext>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    path_binding(u, c.binding)?;
    s.game.require_protocol(session.account, u, 4).await?;
    Ok(no_store_json(
        s.game.bound_catalog(principal(&session, u)?, c).await?,
    ))
}

pub(super) async fn options_batch<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<ProgressionOptionsBatchQuery>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let u = UniverseId(id);
    s.game.require_protocol(session.account, u, 4).await?;
    path_binding(u, q.context.binding)?;
    Ok(super::snapshot_response(
        &h,
        s.game
            .progression_options_batch(principal(&session, u)?, q)
            .await?,
    ))
}

#[cfg(test)]
mod report_preview_tests {
    use super::*;
    use serde_json::{Value, json};

    fn header(preview: Value) -> ReportHeader4 {
        serde_json::from_value(json!({
            "id":uuid::Uuid::from_u128(3), "kind":preview["kind"],
            "observed_at":0, "read":false, "hidden":false, "preview":preview,
        }))
        .unwrap()
    }

    #[test]
    fn only_negotiated_headers_include_spy_senders_and_legacy_lists_keep_other_visible_names() {
        let (spy, opponent) = (
            PlayerId(uuid::Uuid::from_u128(1)),
            PlayerId(uuid::Uuid::from_u128(2)),
        );
        let page = [
            header(json!({"kind":"SpyContact","sender":spy,"detected":true})),
            header(json!({"kind":"SpyContact","sender":opponent,"detected":false})),
            header(json!({"kind":"Combat","participants":[{"owner":opponent,"side":"Attacker"}]})),
        ];
        let names = PublicPlayerNames::from([(spy, "Scout".into()), (opponent, "Opponent".into())]);
        for version in [None, Some("0"), Some("1")] {
            let mut h = HeaderMap::new();
            if let Some(value) = version {
                h.insert("x-orbit-report-preview", HeaderValue::from_static(value));
            }
            let mut actual = page.clone();
            let mut visible_names = names.clone();
            present_report_headers(&h, &mut actual, Some(&mut visible_names));
            if version == Some("1") {
                assert_eq!(actual[0].preview, page[0].preview);
                assert_eq!(actual[1].preview, page[1].preview);
                assert_eq!(visible_names, names);
            } else {
                assert_eq!(
                    actual[0].preview,
                    Some(json!({"kind":"SpyContact","detected":true}))
                );
                assert_eq!(
                    actual[1].preview,
                    Some(json!({"kind":"SpyContact","detected":false}))
                );
                assert_eq!(
                    visible_names,
                    PublicPlayerNames::from([(opponent, "Opponent".into())])
                );
            }
            assert_eq!(actual[2].preview, page[2].preview);
        }
    }
}

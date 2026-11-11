use super::*;
use axum::{
    body::to_bytes,
    extract::{Query, Request},
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

fn invalid(message: String) -> Response {
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        [(header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"error":"invalid_media","message":message})),
    )
        .into_response()
}
fn customization<S>(s: &HttpState<S>) -> Result<&Customization, Problem> {
    s.customization
        .as_ref()
        .ok_or_else(|| ServiceError::Unavailable.into())
}

pub(super) async fn manage<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    ApiJson(q): ApiJson<AllianceMediaRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let universe = UniverseId(id);
    bound_api::path_binding(universe, q.context.binding)?;
    s.game
        .require_protocol(session.account, universe, 4)
        .await?;
    let assets = &customization(&s)?.assets;
    let deleting = matches!(q.action, AllianceMediaAction::Delete { .. });
    let result = s
        .game
        .alliance_media(
            bound_api::principal(&session, universe)?,
            q.context.binding,
            q.alliance,
            MediaOperation::User(q.action),
            customization(&s)?.media_limits,
        )
        .await?;
    if deleting {
        for m in &result.media {
            assets
                .delete(&m.key())
                .await
                .map_err(|_| ServiceError::Unavailable)?;
        }
    }
    Ok(bound_api::no_store_json(result))
}
#[derive(Deserialize)]
pub(super) struct UploadQuery {
    epoch: Uuid,
}
pub(super) async fn upload<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path((u, alliance, id)): Path<(Uuid, Uuid, Uuid)>,
    Query(q): Query<UploadQuery>,
    request: Request,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let universe = UniverseId(u);
    let principal = bound_api::principal(&session, universe)?;
    s.game
        .require_protocol(session.account, universe, 4)
        .await?;
    let binding = Binding {
        account: principal.account,
        player: principal.player,
        universe,
        epoch: Epoch(q.epoch),
    };
    let assets = customization(&s)?.assets.clone();
    let authorized = s
        .game
        .alliance_media(
            principal,
            binding,
            alliance,
            MediaOperation::Authorize { media_id: id },
            customization(&s)?.media_limits,
        )
        .await?;
    let m = authorized
        .media
        .into_iter()
        .next()
        .ok_or(ServiceError::NotFound)?;
    let permit = s
        .alliance_media_work
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| ServiceError::Unavailable)?;
    let bytes = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        to_bytes(request.into_body(), ALLIANCE_MEDIA_MAX_BYTES as usize),
    )
    .await
    .map_err(|_| ServiceError::Unavailable)?
    .map_err(|_| ServiceError::Malformed)?;
    if bytes.len() as u64 != m.declared_bytes {
        return Ok(invalid(
            "The uploaded file does not match its reserved size.".into(),
        ));
    }
    let (processed, _permit) = tokio::task::spawn_blocking(move || {
        (super::alliance_images::prepare(bytes.to_vec()), permit)
    })
    .await
    .map_err(|_| ServiceError::Unavailable)?;
    let (bytes, mime) = match processed {
        Ok(value) => value,
        Err(message) => return Ok(invalid(message)),
    };
    let receipt = MediaReceipt {
        sha256: hex::encode(Sha256::digest(&bytes)),
        content_type: mime.into(),
        bytes: bytes.len() as u64,
    };
    let limits = customization(&s)?.media_limits;
    if receipt.bytes > limits.file_bytes {
        return Ok(invalid(format!(
            "The processed image exceeds the server's {} byte image limit.",
            limits.file_bytes
        )));
    }
    s.game
        .alliance_media(
            principal,
            binding,
            alliance,
            MediaOperation::Prepare {
                media_id: id,
                receipt: receipt.clone(),
            },
            limits,
        )
        .await?;
    // Preparation rechecks current permission/lease and reserves processed bytes.
    assets
        .create_immutable(&m.key(), bytes, limits.file_bytes)
        .await
        .map_err(|_| ServiceError::Unavailable)?;
    match s
        .game
        .alliance_media(
            principal,
            binding,
            alliance,
            MediaOperation::Finalize {
                media_id: id,
                receipt,
            },
            customization(&s)?.media_limits,
        )
        .await
    {
        Ok(result) => Ok(bound_api::no_store_json(result)),
        // Keep the reserved/tombstoned key for retry/maintenance. Never delete a
        // concurrently finalized, valid asset because this request lost a race.
        Err(e) => Err(e.into()),
    }
}
#[derive(Default, Deserialize)]
pub(super) struct ImageQuery {
    #[serde(default)]
    still: bool,
    size: Option<u32>,
}
pub(super) async fn image<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Path((u, id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ImageQuery>,
) -> Result<Response, Problem> {
    let universe = UniverseId(u);
    if let Some(response) = super::alliances::public_budget(&s, &h, peer, universe).await {
        return Ok(response);
    }
    let account = authenticate(&s, &h, false).await.ok().map(|s| s.account);
    let media = s.game.alliance_media_read(universe, id, account).await?;
    let receipt = media.receipt.ok_or(ServiceError::InvariantFailure)?;
    let assets = &customization(&s)?.assets;
    let key = format!(
        "alliance-media/v1/{}/{}/{}/{}/original",
        media.universe, media.epoch, media.alliance, media.id
    );
    let permit = s
        .alliance_media_work
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| ServiceError::Unavailable)?;
    let bytes = assets
        .read_bounded(&key, ALLIANCE_MEDIA_MAX_BYTES)
        .await
        .map_err(|_| ServiceError::Unavailable)?;
    if hex::encode(Sha256::digest(&bytes)) != receipt.sha256 {
        return Err(ServiceError::Unavailable.into());
    }
    let (bytes, mime) = if query.still || query.size.is_some() {
        let size = query.size.unwrap_or(1600).clamp(32, 1600);
        let output = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            super::alliance_images::poster(&bytes, size)
        })
        .await
        .map_err(|_| ServiceError::Unavailable)?
        .map_err(|_| ServiceError::Unavailable)?;
        (output, "image/png".to_string())
    } else {
        (bytes, receipt.content_type)
    };
    Ok((
        [
            (header::CONTENT_TYPE, mime.as_str()),
            (header::CACHE_CONTROL, "private, no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            (header::CONTENT_SECURITY_POLICY, "default-src 'none'"),
        ],
        bytes,
    )
        .into_response())
}

pub(super) async fn catalog<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
) -> Result<Response, Problem> {
    authenticate(&s, &h, false).await?;
    let c = customization(&s)?;
    let symbols:Vec<_>=c.catalog.symbols().iter().filter(|i|!i.supporter).map(|i|serde_json::json!({"id":i.id,"name":i.name,"group":i.group,"supporter":false,"access":"available","asset_url":i.asset_url()})).collect();
    Ok(bound_api::no_store_json(
        serde_json::json!({"templates":alliance_templates(),"symbols":symbols,"max_file_bytes":if c.media_limits.uploads_enabled {c.media_limits.file_bytes}else{0},"max_count":c.media_limits.count,"max_total_bytes":c.media_limits.total_bytes}),
    ))
}

/// Public raster display of installed free symbols; private catalog originals
/// retain their existing authenticated delivery route.
pub(super) async fn symbol<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    Path(id): Path<String>,
) -> Result<Response, Problem> {
    let c = customization(&s)?;
    let item = c
        .catalog
        .get(&id)
        .filter(|i| !i.supporter)
        .ok_or(ServiceError::NotFound)?;
    let bytes = c
        .assets
        .read(&item.key())
        .await
        .map_err(|_| ServiceError::Unavailable)?;
    let permit = s
        .alliance_media_work
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| ServiceError::Unavailable)?;
    let png = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        super::alliance_images::symbol_raster(&bytes, 256)
    })
    .await
    .map_err(|_| ServiceError::Unavailable)?
    .map_err(|_| ServiceError::Unavailable)?;
    Ok((
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=300"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        png,
    )
        .into_response())
}

pub(super) fn validate_crest<S>(
    s: &HttpState<S>,
    q: &AllianceCommandRequest,
) -> Result<(), Problem> {
    if let AllianceAction::SavePresentation { edits, .. } = &q.action {
        let c = customization(s)?;
        for edit in edits {
            if let PresentationEdit::SetIdentity { value, .. } = edit
                && let AllianceCrest::Composition { recipe } = &value.crest
            {
                let symbols = std::iter::once(recipe.symbol.as_str())
                    .chain(recipe.layers.iter().flatten().map(|l| l.symbol.as_str()));
                if symbols
                    .into_iter()
                    .any(|id| c.catalog.get(id).is_none_or(|item| item.supporter))
                    || recipe_access(
                        &c.catalog,
                        recipe,
                        CosmeticPolicy::Unrestricted,
                        &[],
                        SupporterEvidence::default(),
                        0,
                    ) != InsigniaAccess::Available
                {
                    return Err(ServiceError::Conflict.into());
                }
            }
        }
    }
    Ok(())
}

/// Display fallback only: saved recipes remain intact in the editor projection.
pub(super) fn effective_identity<S>(s: &HttpState<S>, identity: &mut AllianceVisualIdentity) {
    if let AllianceCrest::Composition { recipe } = &identity.crest {
        let available = s.customization.as_ref().is_some_and(|c| {
            let symbols = std::iter::once(recipe.symbol.as_str())
                .chain(recipe.layers.iter().flatten().map(|l| l.symbol.as_str()));
            symbols
                .into_iter()
                .all(|id| c.catalog.get(id).is_some_and(|i| !i.supporter))
                && recipe_access(
                    &c.catalog,
                    recipe,
                    CosmeticPolicy::Unrestricted,
                    &[],
                    SupporterEvidence::default(),
                    0,
                ) == InsigniaAccess::Available
        });
        if !available {
            identity.crest = AllianceCrest::default();
        }
    }
}

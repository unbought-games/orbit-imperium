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

#[derive(Default, Deserialize)]
pub(super) struct CollectiveQuery {
    alliance: Option<Uuid>,
}
pub(super) async fn catalog<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<CollectiveQuery>,
) -> Result<Response, Problem> {
    authenticate(&s, &h, false).await?;
    let c = customization(&s)?;
    let grants = if let Some(alliance) = query.alliance {
        s.updates
            .alliance_cosmetic_grants(alliance)
            .await
            .map_err(ServiceError::from)?
    } else {
        vec![]
    };
    let grants = c.catalog.collective_grants(&grants);
    let owns = |kind: &str, id: &str| grants.iter().any(|(k, i)| k == kind && i == id);
    let symbols:Vec<_>=c.catalog.symbols().iter().filter(|i|(!i.supporter && i.access.is_none_or(|a|a==CatalogAccess::Free)) || owns("insignia",&i.id)).map(|i|serde_json::json!({"id":i.id,"name":i.name,"group":i.group,"supporter":false,"access":"available","asset_url":i.asset_url()})).collect();
    let mut value = serde_json::json!({"templates":alliance_templates(),"symbols":symbols,"max_file_bytes":if c.media_limits.uploads_enabled {c.media_limits.file_bytes}else{0},"max_count":c.media_limits.count,"max_total_bytes":c.media_limits.total_bytes});
    if query.alliance.is_some() {
        value["dyes"] = serde_json::to_value(
            c.catalog
                .dyes()
                .iter()
                .filter(|d| d.access == CatalogAccess::Free || owns("dye", &d.id))
                .collect::<Vec<_>>(),
        )
        .map_err(|_| ServiceError::InvariantFailure)?;
        value["treatments"] = serde_json::to_value(
            c.catalog
                .treatments()
                .iter()
                .filter(|t| {
                    t.access == CatalogAccess::Free
                        || owns(
                            if t.family == "finish" {
                                "finish"
                            } else {
                                "effect"
                            },
                            &t.id,
                        )
                })
                .collect::<Vec<_>>(),
        )
        .map_err(|_| ServiceError::InvariantFailure)?;
        value["honors"] =
            serde_json::to_value(grants).map_err(|_| ServiceError::InvariantFailure)?;
    }
    Ok(bound_api::no_store_json(value))
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
        .filter(|i| !i.supporter && i.access.is_none_or(|a| a == CatalogAccess::Free))
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

pub(super) async fn validate_crest<S: IdentityStore>(
    s: &HttpState<S>,
    q: &AllianceCommandRequest,
) -> Result<(), Problem> {
    if let AllianceAction::SavePresentation {
        alliance, edits, ..
    } = &q.action
    {
        let grants = s
            .updates
            .alliance_cosmetic_grants(*alliance)
            .await
            .map_err(ServiceError::from)?;
        for edit in edits {
            if let PresentationEdit::SetIdentity { value, .. } = edit
                && let AllianceCrest::Composition { recipe } = &value.crest
                && !collective_recipe_access(&customization(s)?.catalog, recipe, &grants)
            {
                return Err(ServiceError::Conflict.into());
            }
        }
    }
    Ok(())
}
fn collective_recipe_access(
    catalog: &InsigniaCatalog,
    recipe: &InsigniaRecipe,
    grants: &[(String, String)],
) -> bool {
    let grants = catalog.collective_grants(grants);
    let owns = |kind: &str, id: &str| grants.iter().any(|(k, i)| k == kind && i == id);
    let symbols: Vec<_> = std::iter::once(recipe.symbol.as_str())
        .chain(recipe.layers.iter().flatten().map(|l| l.symbol.as_str()))
        .collect();
    if symbols.iter().any(|id| {
        catalog.get(id).is_none_or(|i| {
            (i.supporter || i.access.is_some_and(|a| a != CatalogAccess::Free))
                && !owns("insignia", id)
        })
    }) {
        return false;
    }
    for color in std::iter::once(&recipe.foreground)
        .chain(std::iter::once(&recipe.background))
        .chain(recipe.layers.iter().flatten().map(|l| &l.color))
    {
        if let Some(id) = named_dye(color)
            && catalog
                .dye(id)
                .is_none_or(|d| d.access != CatalogAccess::Free && !owns("dye", id))
        {
            return false;
        }
    }
    for (kind, id) in recipe
        .finish
        .iter()
        .map(|id| ("finish", id))
        .chain(recipe.effect.iter().map(|id| ("effect", id)))
    {
        if catalog
            .treatment(id)
            .is_none_or(|t| t.access != CatalogAccess::Free && !owns(kind, id))
        {
            return false;
        }
    }
    let mut catalog = catalog.clone();
    catalog.account_observation = Some(AccountCosmeticObservation {
        expires_at: i64::MAX,
        membership: false,
        items: grants.clone(),
    });
    let symbols = grants
        .iter()
        .filter(|(k, _)| k == "insignia")
        .map(|(_, id)| id.clone())
        .collect::<Vec<_>>();
    recipe_access(
        &catalog,
        recipe,
        CosmeticPolicy::Unrestricted,
        &symbols,
        SupporterEvidence::default(),
        0,
    ) == InsigniaAccess::Available
}
/// Grants are authoritative; unavailable definitions only change the projection.
pub(super) async fn effective_identity<S: IdentityStore>(
    s: &HttpState<S>,
    alliance: uuid::Uuid,
    identity: &mut AllianceVisualIdentity,
) {
    if let AllianceCrest::Composition { recipe } = &identity.crest {
        let grants = s
            .updates
            .alliance_cosmetic_grants(alliance)
            .await
            .unwrap_or_default();
        if !s
            .customization
            .as_ref()
            .is_some_and(|c| collective_recipe_access(&c.catalog, recipe, &grants))
        {
            identity.crest = AllianceCrest::default();
        }
    }
}

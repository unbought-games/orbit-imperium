use super::*;
use serde_json::{Value, json};

/// Bound publication by every fresh entitlement source used to resolve its pixels.
/// Expired sources already produce fallback inputs and cannot shorten their lifetime.
fn publication_deadline(
    policy: CosmeticPolicy,
    evidence: SupporterEvidence,
    observation: Option<&AccountCosmeticObservation>,
    now: i64,
) -> i64 {
    let cap = if policy == CosmeticPolicy::Supporter && evidence.expires_at > now {
        now + 60
    } else {
        now + 30
    };
    if policy != CosmeticPolicy::Supporter {
        return cap;
    }
    std::iter::once(evidence.expires_at)
        .chain(observation.map(|value| value.expires_at))
        .filter(|deadline| *deadline > now)
        .fold(cap, i64::min)
}

/// Resolves current live emblem and dye access for both HTTP commands and the worker.
/// Catalog evidence is fetched outside database write transactions.
pub async fn ship_render_environment<S: IdentityStore>(
    store: &S,
    b: Binding,
    customization: &Customization,
    profiles: Option<&AccountProfiles>,
) -> Result<(ShipRenderEnvironment, Vec<Value>), ServiceError> {
    let snapshot = store.ship_appearance_snapshot(b).await?;
    let library = store.insignia_library(b).await?;
    let mut catalog = customization.catalog.clone();
    let mut evidence = SupporterEvidence::default();
    if customization.policy == CosmeticPolicy::Supporter
        && let Some(profiles) = profiles
    {
        let identities = store.player_identities(b.universe, vec![b.player]).await?;
        if let Some(profile) = profiles.display(identities).await.into_iter().next() {
            evidence = profile.evidence();
            catalog.account_observation = profile.account_cosmetics;
        }
    }
    let now = unbought_auth::now();
    let emblem = snapshot
        .emblem_recipe
        .map(|recipe| {
            effective_insignia(
                &catalog,
                &recipe,
                customization.policy,
                &library.permanent_symbols,
                evidence,
                now,
            )
        })
        .map(|recipe| {
            serde_json::to_value(super::insignias::appearance(&catalog, recipe))
                .expect("serializable appearance")
        });
    let mut dyes = std::collections::BTreeMap::new();
    let mut choices = Vec::new();
    for &(id, name, color) in FREE_SHIP_DYES {
        dyes.insert(id.into(), color.into());
        choices.push(
            json!({"id":id,"name":name,"color":color,"access":"free","availability":"available"}),
        );
    }
    for dye in catalog.dyes() {
        // Built-in IDs are reserved, so a separately installed catalog cannot remove the free set.
        if dyes.contains_key(&dye.id) {
            continue;
        }
        let access = account_item_access(
            &catalog,
            "dye",
            &dye.id,
            dye.access,
            customization.policy,
            evidence,
            now,
        );
        if access == InsigniaAccess::Available {
            dyes.insert(dye.id.clone(), dye.color.clone());
        }
        let mut item = json!({"id":dye.id,"name":dye.name,"color":dye.color,"access":dye.access,"availability":match access{InsigniaAccess::Available=>"available",InsigniaAccess::Unavailable|InsigniaAccess::NotInstalled=>"unavailable",_=>"locked"}});
        if let Some(id) = &dye.palette_id {
            item["palette_id"] = json!(id);
        }
        choices.push(item);
    }
    Ok((
        ShipRenderEnvironment {
            valid_until: publication_deadline(
                customization.policy,
                evidence,
                catalog.account_observation.as_ref(),
                now,
            ),
            dyes,
            emblem,
            emblem_revision: snapshot.emblem_revision,
        },
        choices,
    ))
}
pub(super) async fn handle<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    headers: HeaderMap,
    Path(universe): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<ShipAppearanceRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &headers, true).await?;
    let b = q.context.binding;
    bound_api::path_binding(UniverseId(universe), b)?;
    let p = bound_api::principal(&session, b.universe)?;
    if p.account != b.account || p.player != b.player {
        return Err(ServiceError::NotFound.into());
    }
    let customization = s.customization.as_ref().ok_or(ServiceError::Unavailable)?;
    let (env, dyes) =
        ship_render_environment(&s.updates, b, customization, s.profiles.as_ref()).await?;
    s.updates
        .change_ship_appearance(b, q.context.request_id, q.action, env.clone())
        .await?;
    let mut snapshot = s
        .updates
        .ship_appearance_snapshot(b)
        .await
        .map_err(ServiceError::from)?;
    for e in &mut snapshot.equipment {
        if let Some(design) = snapshot
            .library
            .iter()
            .find(|d| Some(d.id) == e.design_id && Some(d.revision) == e.design_revision)
            && (!env.dyes.contains_key(&design.recipe.primary)
                || !env.dyes.contains_key(&design.recipe.accent))
        {
            e.fallback_reason =
                Some("A selected dye is unavailable. Your saved design is retained.".into());
        }
    }
    Ok(bound_api::no_store_json(
        json!({"binding":b,"request_id":q.context.request_id,
        "catalog":[{"id":SHIP_PACKAGE,"name":"Concord","target":SHIP_TARGET,"package_revision":SHIP_PACKAGE_REVISION,
        "package_url":"/art/ship-skins/orbit-light-fighter/concord-v1/manifest.json","preview_url":"/art/ship-skins/orbit-light-fighter/concord-v1/preview.webp","available":true}],
        "dyes":dyes,"library":snapshot.library,"equipment":snapshot.equipment,"emblem":env.emblem,"emblem_revision":env.emblem_revision}),
    ))
}
pub(super) async fn media<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    headers: HeaderMap,
    Path((id, index)): Path<(uuid::Uuid, usize)>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &headers, false).await?;
    let variants = s
        .updates
        .ship_artifact(session.account, id)
        .await
        .map_err(ServiceError::from)?;
    let variant = variants.get(index).ok_or(ServiceError::NotFound)?;
    let c = s.customization.as_ref().ok_or(ServiceError::Unavailable)?;
    let bytes = c
        .assets
        .read_bounded(&variant.key, 8 * 1024 * 1024)
        .await
        .map_err(|_| ServiceError::Unavailable)?;
    Ok((
        [
            (header::CONTENT_TYPE, variant.mime_type.as_str()),
            (
                header::CACHE_CONTROL,
                "private, max-age=31536000, immutable",
            ),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        bytes,
    )
        .into_response())
}
/// Restricted originals may be fetched by the internal renderer on the fixed media
/// route only. This credential does not create a game identity or authorize APIs.
pub(super) fn renderer_media_authorized(headers: &HeaderMap) -> bool {
    let Ok(token) = std::env::var("ORBIT_APPEARANCE_RENDER_TOKEN") else {
        return false;
    };
    if token.len() < 32 {
        return false;
    }
    let Some(candidate) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    else {
        return false;
    };
    use sha2::{Digest, Sha256};
    // Fixed-length digests avoid comparing secret token prefixes.
    Sha256::digest(candidate.as_bytes()) == Sha256::digest(token.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publication_uses_earliest_fresh_entitlement_expiry_and_ignores_expired_sources() {
        let now = 100;
        for (supporter_expiry, account_expiry, expected) in [
            (200, Some(115), 115), // Owned dye/treatment evidence expires first.
            (110, Some(150), 110), // Supporter evidence expires first.
            (200, Some(190), 160), // Preserve the existing freshness cap.
            (200, None, 160),
            (90, Some(120), 120),  // Expired membership already fell back.
            (130, Some(100), 130), // Expired account ingredients already fell back.
            (90, Some(99), 130),
        ] {
            let evidence = SupporterEvidence {
                known: true,
                active: true,
                expires_at: supporter_expiry,
            };
            let account = account_expiry.map(|expires_at| AccountCosmeticObservation {
                expires_at,
                membership: true,
                items: vec![("dye".into(), "fixture-owned".into())],
            });
            assert_eq!(
                publication_deadline(CosmeticPolicy::Supporter, evidence, account.as_ref(), now),
                expected,
                "supporter {supporter_expiry}, account {account_expiry:?}"
            );
            for policy in [CosmeticPolicy::Unrestricted, CosmeticPolicy::All] {
                assert_eq!(
                    publication_deadline(policy, evidence, account.as_ref(), now),
                    130
                );
            }
        }
    }
}

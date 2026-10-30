use super::*;
use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct Customization {
    pub policy: CosmeticPolicy,
    pub assets: Arc<dyn AssetStore>,
}
fn source(symbol: &str) -> Option<&'static str> {
    Some(match symbol {
        "compass" => include_str!("../assets/insignias/compass.svg"),
        "wings" => include_str!("../assets/insignias/wings.svg"),
        "spire" => include_str!("../assets/insignias/spire.svg"),
        "laurel" => include_str!("../assets/insignias/laurel.svg"),
        _ => return None,
    })
}
fn digest(symbol: &str) -> Option<String> {
    source(symbol).map(|s| hex::encode(Sha256::digest(s.as_bytes())))
}
fn key(symbol: &str) -> Option<String> {
    Some(format!("insignias/v1/{symbol}/{}.svg", digest(symbol)?))
}
pub(super) fn asset_url(symbol: &str) -> String {
    format!(
        "/api/media/insignias/{symbol}/{}.svg",
        digest(symbol).expect("validated catalog symbol")
    )
}
impl Customization {
    /// Idempotent publication of trusted, bundled originals before accepting traffic.
    /// Concurrent replicas write identical bytes to immutable content-addressed keys.
    pub async fn publish(&self) -> Result<(), AssetError> {
        for (symbol, _, _) in INSIGNIA_SYMBOLS {
            let key = key(symbol).unwrap();
            let bytes = source(symbol).unwrap().as_bytes();
            // S3 can return AccessDenied for absent keys without ListBucket.
            // Publish identical bytes first, then verify delivery permissions.
            self.assets.write(&key, bytes.to_vec()).await?;
            if self.assets.read(&key).await? != bytes {
                return Err(AssetError::Unavailable);
            }
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
pub(super) struct InsigniaAppearance {
    pub recipe: InsigniaRecipe,
    pub asset_url: String,
}
pub(super) fn appearance(recipe: InsigniaRecipe) -> InsigniaAppearance {
    InsigniaAppearance {
        asset_url: asset_url(&recipe.symbol),
        recipe,
    }
}
#[derive(Serialize)]
struct Symbol {
    id: &'static str,
    name: &'static str,
    supporter: bool,
    asset_url: String,
    access: InsigniaAccess,
}
#[derive(Serialize)]
struct InsigniaState {
    binding: Binding,
    request_id: uuid::Uuid,
    library: InsigniaLibrary,
    catalog: Vec<Symbol>,
    policy: CosmeticPolicy,
    appearance: InsigniaAppearance,
    expires_at: i64,
}

async fn evidence<S: IdentityStore>(
    s: &HttpState<S>,
    b: Binding,
    policy: CosmeticPolicy,
) -> Result<SupporterEvidence, ServiceError> {
    if policy == CosmeticPolicy::Unrestricted {
        return Ok(SupporterEvidence::default());
    }
    let Some(profiles) = &s.profiles else {
        return Ok(SupporterEvidence::default());
    };
    let identities = s
        .updates
        .player_identities(b.universe, vec![b.player])
        .await?;
    let profile = profiles.display(identities).await.into_iter().next();
    Ok(profile.map_or_else(SupporterEvidence::default, |p| p.evidence()))
}
pub(super) async fn handle<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    headers: HeaderMap,
    Path(universe): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<InsigniaRequest>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &headers, true).await?;
    bound_api::path_binding(UniverseId(universe), q.context.binding)?;
    let principal = bound_api::principal(&session, UniverseId(universe))?;
    let b = q.context.binding;
    if principal.account != b.account || principal.player != b.player {
        return Err(ServiceError::NotFound.into());
    }
    let customization = s.customization.as_ref().ok_or(ServiceError::Unavailable)?;
    // Membership checked before any external profile lookup, and rechecked under the write lock.
    s.updates
        .insignia_library(b)
        .await
        .map_err(ServiceError::from)?;
    let evidence = evidence(&s, b, customization.policy).await?;
    if !matches!(q.action, InsigniaAction::Load) {
        s.updates
            .change_insignia(b, q.action, customization.policy, evidence)
            .await?;
    }
    let library = s
        .updates
        .insignia_library(b)
        .await
        .map_err(ServiceError::from)?;
    Ok(bound_api::no_store_json(project_state(
        b,
        q.context.request_id,
        library,
        customization.policy,
        evidence,
        unbought_auth::now(),
    )))
}
fn project_state(
    b: Binding,
    request_id: uuid::Uuid,
    library: InsigniaLibrary,
    policy: CosmeticPolicy,
    evidence: SupporterEvidence,
    now: i64,
) -> InsigniaState {
    let recipe = library
        .equipped
        .and_then(|id| library.designs.iter().find(|d| d.id == id))
        .map(|d| effective_insignia(&d.recipe, policy, &library.permanent_symbols, evidence, now))
        .unwrap_or_default();
    let catalog = INSIGNIA_SYMBOLS
        .iter()
        .map(|(id, name, supporter)| Symbol {
            id,
            name,
            supporter: *supporter,
            asset_url: asset_url(id),
            access: insignia_access(id, policy, &library.permanent_symbols, evidence, now),
        })
        .collect();
    let expires_at = if evidence.expires_at > now {
        evidence.expires_at.min(now + 60)
    } else {
        now + 30
    };
    InsigniaState {
        binding: b,
        request_id,
        library,
        catalog,
        policy,
        appearance: appearance(recipe),
        expires_at,
    }
}
pub(super) async fn media<S>(
    State(s): State<Arc<HttpState<S>>>,
    Path((symbol, version)): Path<(String, String)>,
) -> Response {
    let Some(expected) = media_digest(&symbol, &version) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(c) = &s.customization else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    // This namespace contains only operator-published, trusted originals. Accept
    // immutable revisions from other binaries during a rolling deployment.
    let object_key = format!("insignias/v1/{symbol}/{version}");
    match c.assets.read(&object_key).await {
        Ok(bytes) if hex::encode(Sha256::digest(&bytes)) == expected => (
            [
                (header::CONTENT_TYPE, "image/svg+xml"),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
                (
                    header::CONTENT_SECURITY_POLICY,
                    "default-src 'none'; sandbox",
                ),
                (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            ],
            bytes,
        )
            .into_response(),
        Err(AssetError::NotFound) => {
            (StatusCode::NOT_FOUND, [(header::CACHE_CONTROL, "no-store")]).into_response()
        }
        _ => (
            StatusCode::SERVICE_UNAVAILABLE,
            [
                (header::CACHE_CONTROL, "no-store"),
                (header::RETRY_AFTER, "30"),
            ],
        )
            .into_response(),
    }
}

fn media_digest<'a>(symbol: &str, version: &'a str) -> Option<&'a str> {
    if symbol.is_empty()
        || symbol.len() > 64
        || !symbol
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
    {
        return None;
    }
    let hash = version.strip_suffix(".svg")?;
    (hash.len() == 64
        && hash
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)))
    .then_some(hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn publication_does_not_require_permission_to_inspect_missing_keys() {
        #[derive(Default)]
        struct Store(std::sync::Mutex<std::collections::BTreeMap<String, Vec<u8>>>);
        impl AssetStore for Store {
            fn read<'a>(&'a self, key: &'a str) -> AssetFuture<'a, Vec<u8>> {
                Box::pin(async move {
                    self.0
                        .lock()
                        .unwrap()
                        .get(key)
                        .cloned()
                        .ok_or(AssetError::Unavailable)
                })
            }
            fn write<'a>(&'a self, key: &'a str, value: Vec<u8>) -> AssetFuture<'a, ()> {
                Box::pin(async move {
                    self.0.lock().unwrap().insert(key.into(), value);
                    Ok(())
                })
            }
        }
        let c = Customization {
            policy: CosmeticPolicy::Unrestricted,
            assets: Arc::new(Store::default()),
        };
        c.publish().await.unwrap();
        c.publish().await.unwrap();
        for (symbol, _, _) in INSIGNIA_SYMBOLS {
            assert_eq!(
                c.assets.read(&key(symbol).unwrap()).await.unwrap(),
                source(symbol).unwrap().as_bytes()
            );
        }
    }
    #[test]
    fn catalog_assets_are_small_static_svg_and_urls_are_immutable() {
        for (symbol, _, _) in INSIGNIA_SYMBOLS {
            let svg = source(symbol).unwrap();
            assert!(svg.len() < 4096);
            assert!(svg.starts_with("<svg"));
            assert!(!svg.contains("script") && !svg.contains("href="));
            assert!(asset_url(symbol).contains(&digest(symbol).unwrap()));
        }
        assert!(source("../compass").is_none());
        assert!(media_digest("compass", &format!("{}.svg", "a".repeat(64))).is_some());
        assert!(media_digest("next-release-symbol", &format!("{}.svg", "b".repeat(64))).is_some());
        for symbol in ["../compass", "a/b", "a%2fb", ""] {
            assert!(media_digest(symbol, &format!("{}.svg", "a".repeat(64))).is_none());
        }
        for version in ["latest.svg", "../test.svg", "abc.svg"] {
            assert!(media_digest("compass", version).is_none());
        }
    }
}

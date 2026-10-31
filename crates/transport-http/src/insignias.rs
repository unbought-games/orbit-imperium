use super::*;
use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct Customization {
    pub policy: CosmeticPolicy,
    pub assets: Arc<dyn AssetStore>,
    pub catalog: InsigniaCatalog,
}
impl Customization {
    /// Free originals are bundled. Additional originals must already exist in the
    /// configured store; the server only reads and verifies their pinned manifest.
    pub async fn load(
        policy: CosmeticPolicy,
        assets: Arc<dyn AssetStore>,
        manifest: Option<&str>,
    ) -> Result<Self, AssetError> {
        let catalog = if let Some(key) = manifest {
            let hash = catalog_hash(key).ok_or(AssetError::Unavailable)?;
            let bytes = assets.read(key).await?;
            if bytes.len() > 262_144 || hex::encode(Sha256::digest(&bytes)) != hash {
                return Err(AssetError::Unavailable);
            }
            InsigniaCatalog::with_manifest(
                serde_json::from_slice(&bytes).map_err(|_| AssetError::Unavailable)?,
            )
            .map_err(|_| AssetError::Unavailable)?
        } else {
            InsigniaCatalog::default()
        };
        let result = Self {
            policy,
            assets,
            catalog,
        };
        result.publish().await?;
        Ok(result)
    }
    pub async fn publish(&self) -> Result<(), AssetError> {
        for (symbol, _, bytes) in FREE_INSIGNIAS {
            self.assets
                .write(&self.catalog.get(symbol).unwrap().key(), bytes.to_vec())
                .await?;
        }
        for item in self.catalog.symbols() {
            let bytes = self.assets.read(&item.key()).await?;
            if hex::encode(Sha256::digest(&bytes)) != item.sha256 {
                return Err(AssetError::Unavailable);
            }
            // Catalogs are operator-authored, not player uploads. Require a valid,
            // bounded SVG before advertising an installed original.
            if !valid_original(&bytes) {
                return Err(AssetError::Unavailable);
            }
        }
        Ok(())
    }
    pub(super) fn appearance(&self, recipe: InsigniaRecipe) -> InsigniaAppearance {
        appearance(&self.catalog, recipe)
    }
}
fn valid_original(bytes: &[u8]) -> bool {
    if bytes.len() > 65_536 {
        return false;
    }
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    let Ok(doc) = roxmltree::Document::parse(text) else {
        return false;
    };
    if doc.root_element().tag_name().name() != "svg" {
        return false;
    }
    for node in doc.descendants().filter(|n| n.is_element()) {
        if node.tag_name().namespace() != Some("http://www.w3.org/2000/svg")
            || !matches!(
                node.tag_name().name(),
                "svg"
                    | "g"
                    | "path"
                    | "circle"
                    | "ellipse"
                    | "rect"
                    | "line"
                    | "polyline"
                    | "polygon"
                    | "title"
                    | "desc"
            )
        {
            return false;
        }
        if node.attributes().any(|a| {
            a.namespace().is_some()
                || !matches!(
                    a.name(),
                    "viewBox"
                        | "width"
                        | "height"
                        | "fill"
                        | "stroke"
                        | "stroke-width"
                        | "stroke-linecap"
                        | "stroke-linejoin"
                        | "fill-rule"
                        | "clip-rule"
                        | "opacity"
                        | "fill-opacity"
                        | "stroke-opacity"
                        | "transform"
                        | "d"
                        | "cx"
                        | "cy"
                        | "r"
                        | "rx"
                        | "ry"
                        | "x"
                        | "y"
                        | "x1"
                        | "x2"
                        | "y1"
                        | "y2"
                        | "points"
                        | "preserveAspectRatio"
                )
                || a.value().to_ascii_lowercase().contains("url(")
        }) {
            return false;
        }
    }
    resvg::usvg::Tree::from_data(bytes, &resvg::usvg::Options::default()).is_ok()
}

#[derive(Clone, Serialize)]
pub(super) struct InsigniaAppearance {
    pub recipe: InsigniaRecipe,
    pub asset_url: String,
}
fn appearance(catalog: &InsigniaCatalog, recipe: InsigniaRecipe) -> InsigniaAppearance {
    InsigniaAppearance {
        asset_url: catalog
            .get(&recipe.symbol)
            .expect("resolved installed symbol")
            .asset_url(),
        recipe,
    }
}
#[derive(Serialize)]
struct Symbol {
    id: String,
    name: String,
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
    appearance: Option<InsigniaAppearance>,
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
    // Membership checked before any external lookup or editor compatibility response.
    let current_library = s
        .updates
        .insignia_library(b)
        .await
        .map_err(ServiceError::from)?;
    // Old clients enumerate the initial symbols. Ask them to refresh their app
    // before editing a catalog/library they cannot faithfully represent.
    if headers.get("x-orbit-catalog").is_none_or(|v| v != "1")
        && (customization
            .catalog
            .symbols()
            .iter()
            .any(|item| !legacy_insignia_id(&item.id))
            || current_library
                .designs
                .iter()
                .any(|d| !legacy_insignia_id(&d.recipe.symbol)))
    {
        return Err(ServiceError::Conflict.into());
    }
    let evidence = evidence(&s, b, customization.policy).await?;
    if !matches!(q.action, InsigniaAction::Load) {
        s.updates
            .change_insignia(
                b,
                q.action,
                &customization.catalog,
                customization.policy,
                evidence,
            )
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
        &customization.catalog,
        customization.policy,
        evidence,
        unbought_auth::now(),
    )))
}
fn project_state(
    b: Binding,
    request_id: uuid::Uuid,
    library: InsigniaLibrary,
    installed: &InsigniaCatalog,
    policy: CosmeticPolicy,
    evidence: SupporterEvidence,
    now: i64,
) -> InsigniaState {
    let recipe = library
        .equipped
        .and_then(|id| library.designs.iter().find(|d| d.id == id))
        .map(|d| {
            effective_insignia(
                installed,
                &d.recipe,
                policy,
                &library.permanent_symbols,
                evidence,
                now,
            )
        });
    let catalog = installed
        .symbols()
        .iter()
        .map(|item| Symbol {
            id: item.id.clone(),
            name: item.name.clone(),
            supporter: item.supporter,
            asset_url: item.asset_url(),
            access: insignia_access(
                installed,
                &item.id,
                policy,
                &library.permanent_symbols,
                evidence,
                now,
            ),
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
        appearance: recipe.map(|r| appearance(installed, r)),
        expires_at,
    }
}
pub(super) async fn media<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    Path((symbol, version)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    let Some(expected) = media_digest(&symbol, &version) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(c) = &s.customization else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    // A leftover object alone never installs content. Access is limited to the
    // configured catalog, even if the store retains removed originals.
    if c.catalog.get(&symbol).is_none() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let bundled = c.catalog.bundled(&symbol);
    if !bundled && let Err(error) = authenticate(&s, &headers, false).await {
        let mut response = error.into_response();
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-store"),
        );
        return response;
    }
    // This namespace contains only operator-published, trusted originals. Accept
    // immutable revisions from other binaries during a rolling deployment.
    let object_key = format!("insignias/v1/{symbol}/{version}");
    match c.assets.read(&object_key).await {
        Ok(bytes) if hex::encode(Sha256::digest(&bytes)) == expected => (
            [
                (header::CONTENT_TYPE, "image/svg+xml"),
                (
                    header::CACHE_CONTROL,
                    if bundled {
                        "public, max-age=31536000, immutable"
                    } else {
                        "private, no-store"
                    },
                ),
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
    #[test]
    fn no_equipped_design_means_no_appearance_even_with_saved_designs() {
        let id = uuid::Uuid::new_v4();
        let binding = Binding {
            account: AccountId(id),
            player: PlayerId(id),
            universe: UniverseId(id),
            epoch: Epoch(id),
        };
        let mut library = InsigniaLibrary {
            designs: vec![],
            equipped: None,
            permanent_symbols: vec![],
        };
        let project = |library| {
            project_state(
                binding,
                id,
                library,
                &InsigniaCatalog::default(),
                CosmeticPolicy::Unrestricted,
                SupporterEvidence::default(),
                100,
            )
        };
        assert!(project(library.clone()).appearance.is_none());
        library.designs.push(InsigniaDesign {
            id,
            name: "Saved design".into(),
            recipe: InsigniaRecipe::default(),
            revision: 1,
        });
        assert!(project(library.clone()).appearance.is_none());
        library.equipped = Some(id);
        assert!(project(library.clone()).appearance.is_some());
        library.equipped = None;
        let removed = project(library);
        assert!(removed.appearance.is_none());
        assert_eq!(removed.library.designs.len(), 1);
    }
    #[tokio::test]
    async fn publication_does_not_require_permission_to_inspect_missing_keys() {
        let c = Customization {
            policy: CosmeticPolicy::Unrestricted,
            assets: Arc::new(Store::default()),
            catalog: InsigniaCatalog::default(),
        };
        c.publish().await.unwrap();
        c.publish().await.unwrap();
        for item in c.catalog.symbols() {
            let bytes = FREE_INSIGNIAS
                .iter()
                .find(|(id, _, _)| *id == item.id)
                .unwrap()
                .2;
            assert_eq!(c.assets.read(&item.key()).await.unwrap(), bytes);
            assert!(item.asset_url().contains(&item.sha256));
        }
    }
    #[test]
    fn media_paths_are_bounded_and_cannot_escape_storage() {
        assert!(media_digest("compass", &format!("{}.svg", "a".repeat(64))).is_some());
        assert!(media_digest("next-release-symbol", &format!("{}.svg", "b".repeat(64))).is_some());
        for symbol in ["../compass", "a/b", "a%2fb", ""] {
            assert!(media_digest(symbol, &format!("{}.svg", "a".repeat(64))).is_none());
        }
        for version in ["latest.svg", "../test.svg", "abc.svg"] {
            assert!(media_digest("compass", version).is_none());
        }
    }
    #[tokio::test]
    async fn external_catalog_is_opt_in_pinned_and_verified_without_publishing_hosted_originals() {
        let store = Arc::new(Store::default());
        let svg = b"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\"/></svg>";
        let hash = hex::encode(Sha256::digest(svg));
        let item = InsigniaSymbol {
            id: "operator-circle".into(),
            name: "Operator circle".into(),
            supporter: true,
            sha256: hash,
        };
        let manifest =
            serde_json::to_vec(&serde_json::json!({"version":1,"insignias":[item]})).unwrap();
        let key = format!(
            "insignias/catalogs/{}.json",
            hex::encode(Sha256::digest(&manifest))
        );
        store.write(&key, manifest.clone()).await.unwrap();
        // Installing only a manifest fails: the server cannot synthesize hosted originals.
        assert!(
            Customization::load(CosmeticPolicy::Unrestricted, store.clone(), Some(&key))
                .await
                .is_err()
        );
        store.write(&item.key(), svg.to_vec()).await.unwrap();
        let community = Customization::load(CosmeticPolicy::Unrestricted, store.clone(), None)
            .await
            .unwrap();
        assert_eq!(community.catalog.symbols().len(), 3);
        assert!(community.catalog.get(&item.id).is_none());
        let installed = Customization::load(CosmeticPolicy::Supporter, store.clone(), Some(&key))
            .await
            .unwrap();
        assert_eq!(installed.catalog.symbols().len(), 4);
        assert_eq!(
            installed.catalog.get(&item.id).unwrap().asset_url(),
            item.asset_url()
        );
        store.write(&item.key(), b"corrupt".to_vec()).await.unwrap();
        assert!(
            Customization::load(CosmeticPolicy::Supporter, store.clone(), Some(&key))
                .await
                .is_err()
        );
        assert_eq!(
            store.read(&item.key()).await.unwrap(),
            b"corrupt",
            "startup must never overwrite hosted content"
        );
        store.write(&key, b"{}".to_vec()).await.unwrap();
        assert!(
            Customization::load(CosmeticPolicy::Supporter, store.clone(), Some(&key))
                .await
                .is_err()
        );
        assert!(
            Customization::load(CosmeticPolicy::Supporter, store, Some("../manifest.json"))
                .await
                .is_err()
        );
    }
    #[test]
    fn installed_svg_cannot_reference_files_or_execute_content() {
        for inner in [
            "<script>alert(1)</script>",
            "<image href=\"file:///etc/passwd\"/>",
            "<path onclick=\"alert(1)\"/>",
            "<path style=\"fill:url(file:///tmp/a)\"/>",
        ] {
            let svg = format!("<svg xmlns=\"http://www.w3.org/2000/svg\">{inner}</svg>");
            assert!(!valid_original(svg.as_bytes()));
        }
        for (_, _, bytes) in FREE_INSIGNIAS {
            assert!(valid_original(bytes));
        }
    }
}

//! Filesystem and S3 adapters. Never contains player, billing, or presentation policy.
use object_store::{
    ObjectStore, ObjectStoreExt, aws::AmazonS3Builder, local::LocalFileSystem, path::Path,
};
use orbit_application::{AssetError, AssetFuture, AssetStore};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub enum AssetConfig {
    Files {
        directory: String,
    },
    S3 {
        bucket: String,
        region: String,
        endpoint: Option<String>,
        allow_http: bool,
    },
}
impl AssetConfig {
    pub fn parse(get: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        match get("ORBIT_ASSET_STORE").as_deref().unwrap_or("files") {
            "files" => Ok(Self::Files {
                directory: get("ORBIT_ASSET_DIRECTORY").unwrap_or_else(|| "data/assets".into()),
            }),
            "s3" => {
                let bucket = get("ORBIT_ASSET_S3_BUCKET")
                    .filter(|v| !v.is_empty())
                    .ok_or("ORBIT_ASSET_S3_BUCKET is required")?;
                let region = get("ORBIT_ASSET_S3_REGION")
                    .filter(|v| !v.is_empty())
                    .ok_or("ORBIT_ASSET_S3_REGION is required")?;
                let allow_http = match get("ORBIT_ASSET_S3_ALLOW_HTTP").as_deref() {
                    None | Some("0") => false,
                    Some("1") => true,
                    _ => return Err("ORBIT_ASSET_S3_ALLOW_HTTP must be 0 or 1".into()),
                };
                let endpoint = get("ORBIT_ASSET_S3_ENDPOINT");
                if endpoint.as_ref().is_some_and(|v| {
                    !v.starts_with("https://") && !(allow_http && v.starts_with("http://"))
                }) {
                    return Err(
                        "S3 endpoint requires HTTPS (or explicit ORBIT_ASSET_S3_ALLOW_HTTP=1)"
                            .into(),
                    );
                }
                Ok(Self::S3 {
                    bucket,
                    region,
                    endpoint,
                    allow_http,
                })
            }
            _ => Err("ORBIT_ASSET_STORE must be files or s3".into()),
        }
    }
    pub async fn connect(&self) -> Result<Arc<dyn AssetStore>, AssetError> {
        let store: Arc<dyn ObjectStore> = match self {
            Self::Files { directory } => {
                tokio::fs::create_dir_all(directory)
                    .await
                    .map_err(|_| AssetError::Unavailable)?;
                Arc::new(
                    LocalFileSystem::new_with_prefix(directory)
                        .map_err(|_| AssetError::Unavailable)?,
                )
            }
            Self::S3 {
                bucket,
                region,
                endpoint,
                allow_http,
            } => {
                // Environment credentials or workload identity (including EC2 IMDSv2).
                let mut builder = AmazonS3Builder::from_env()
                    .with_bucket_name(bucket)
                    .with_region(region)
                    .with_allow_http(*allow_http)
                    .with_virtual_hosted_style_request(false);
                if let Some(endpoint) = endpoint {
                    builder = builder.with_endpoint(endpoint);
                }
                Arc::new(builder.build().map_err(|_| AssetError::Unavailable)?)
            }
        };
        Ok(Arc::new(BlobStore(store)))
    }
}
pub struct BlobStore(pub Arc<dyn ObjectStore>);
fn key(value: &str) -> Result<Path, AssetError> {
    if value.is_empty()
        || value.len() > 240
        || value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"/-_.".contains(&c))
    {
        return Err(AssetError::NotFound);
    }
    Path::parse(value).map_err(|_| AssetError::NotFound)
}
fn error(e: object_store::Error) -> AssetError {
    match e {
        object_store::Error::NotFound { .. } => AssetError::NotFound,
        _ => AssetError::Unavailable,
    }
}
impl AssetStore for BlobStore {
    fn read<'a>(&'a self, name: &'a str) -> AssetFuture<'a, Vec<u8>> {
        Box::pin(async move {
            let result = self.0.get(&key(name)?).await.map_err(error)?;
            // This slice only serves small supplied SVGs; bound reads before allocation.
            if result.meta.size > 1_048_576 {
                return Err(AssetError::Unavailable);
            }
            Ok(result.bytes().await.map_err(error)?.to_vec())
        })
    }
    fn write<'a>(&'a self, name: &'a str, bytes: Vec<u8>) -> AssetFuture<'a, ()> {
        Box::pin(async move {
            if bytes.len() > 1_048_576 {
                return Err(AssetError::Unavailable);
            }
            self.0.put(&key(name)?, bytes.into()).await.map_err(error)?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn s3_compatible_requests_are_signed_and_shared_across_clients() {
        use axum::{
            Router,
            body::Bytes,
            extract::{Path as HttpPath, State},
            http::{HeaderMap, StatusCode},
            response::IntoResponse,
            routing::get,
        };
        use std::{collections::BTreeMap, sync::Mutex};
        type Objects = Arc<Mutex<BTreeMap<String, Vec<u8>>>>;
        async fn read(
            State(objects): State<Objects>,
            HttpPath(key): HttpPath<String>,
            headers: HeaderMap,
        ) -> axum::response::Response {
            assert!(
                headers["authorization"]
                    .to_str()
                    .unwrap()
                    .starts_with("AWS4-HMAC-SHA256 Credential=fixture/")
            );
            let objects = objects.lock().unwrap();
            match objects.get(&key) {
                Some(bytes) => (
                    [
                        ("etag", "\"fixture\""),
                        ("last-modified", "Fri, 30 Oct 2026 12:00:00 GMT"),
                    ],
                    bytes.clone(),
                )
                    .into_response(),
                None => (
                    StatusCode::NOT_FOUND,
                    "<Error><Code>NoSuchKey</Code></Error>",
                )
                    .into_response(),
            }
        }
        async fn write(
            State(objects): State<Objects>,
            HttpPath(key): HttpPath<String>,
            headers: HeaderMap,
            body: Bytes,
        ) -> impl IntoResponse {
            assert!(
                headers["authorization"]
                    .to_str()
                    .unwrap()
                    .starts_with("AWS4-HMAC-SHA256 Credential=fixture/")
            );
            assert!(headers.contains_key("x-amz-date"));
            objects.lock().unwrap().insert(key, body.to_vec());
            ([("etag", "\"fixture\"")], "")
        }
        let objects = Objects::default();
        let app = Router::new()
            .route("/assets/{*key}", get(read).put(write))
            .with_state(objects.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = || {
            BlobStore(Arc::new(
                AmazonS3Builder::new()
                    .with_bucket_name("assets")
                    .with_region("us-east-2")
                    .with_endpoint(&endpoint)
                    .with_allow_http(true)
                    .with_access_key_id("fixture")
                    .with_secret_access_key("fixture-secret")
                    .build()
                    .unwrap(),
            ))
        };
        let first = client();
        let second = client();
        assert!(matches!(
            first.read("insignias/missing.svg").await,
            Err(AssetError::NotFound)
        ));
        first
            .write("insignias/test.svg", b"<svg/>".to_vec())
            .await
            .unwrap();
        assert_eq!(second.read("insignias/test.svg").await.unwrap(), b"<svg/>");
        assert_eq!(objects.lock().unwrap().len(), 1);
        server.abort();
        assert!(server.await.unwrap_err().is_cancelled());
    }
    #[tokio::test]
    async fn files_persist_across_instances_and_reject_path_escape() {
        let dir = std::env::temp_dir().join(format!("orbit-assets-{}", uuid::Uuid::new_v4()));
        let config = AssetConfig::Files {
            directory: dir.to_string_lossy().into(),
        };
        let a = config.connect().await.unwrap();
        a.write("symbols/a.svg", b"original".to_vec())
            .await
            .unwrap();
        let b = config.connect().await.unwrap();
        assert_eq!(b.read("symbols/a.svg").await.unwrap(), b"original");
        a.write("symbols/a.svg", b"replacement".to_vec())
            .await
            .unwrap();
        assert_eq!(b.read("symbols/a.svg").await.unwrap(), b"replacement");
        for path in [
            "../outside",
            "/absolute",
            "a/../../b",
            "a//b",
            "a/%2e%2e/b",
            "a\\b",
        ] {
            assert!(a.write(path, vec![]).await.is_err());
        }
        assert!(matches!(a.read("missing").await, Err(AssetError::NotFound)));
        tokio::fs::remove_dir_all(dir).await.unwrap();
    }
    #[test]
    fn configuration_is_local_by_default_and_s3_requires_explicit_location() {
        assert!(matches!(
            AssetConfig::parse(|_| None).unwrap(),
            AssetConfig::Files { .. }
        ));
        assert!(AssetConfig::parse(|k| (k == "ORBIT_ASSET_STORE").then(|| "s3".into())).is_err());
        assert!(
            AssetConfig::parse(|k| match k {
                "ORBIT_ASSET_STORE" => Some("s3".into()),
                "ORBIT_ASSET_S3_BUCKET" => Some("bucket".into()),
                "ORBIT_ASSET_S3_REGION" => Some("us-east-2".into()),
                _ => None,
            })
            .is_ok()
        );
    }
}

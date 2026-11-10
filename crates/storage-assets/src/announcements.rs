//! Immutable feed revisions and a conditionally updated active pointer.
use crate::AssetConfig;
use object_store::{ObjectStore, ObjectStoreExt, PutMode, UpdateVersion, path::Path};
use orbit_application::announcements::{
    Error, Feed, FeedFuture, FeedStore, MAX_FEED_BYTES, Snapshot,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{path::PathBuf, sync::Arc};
const CURRENT: &str = "announcements/current.json";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pointer {
    schema: u32,
    revision: String,
}
pub struct AnnouncementStorage {
    store: Arc<dyn ObjectStore>,
    directory: Option<PathBuf>,
}
impl AnnouncementStorage {
    pub async fn connect(config: &AssetConfig) -> Result<Self, Error> {
        Ok(Self {
            store: config
                .object_store()
                .await
                .map_err(|_| Error::Unavailable)?,
            directory: match config {
                AssetConfig::Files { directory } => Some(directory.into()),
                _ => None,
            },
        })
    }
    async fn pointer(&self) -> Result<Option<(String, UpdateVersion)>, Error> {
        let result = match self.store.get(&Path::from(CURRENT)).await {
            Ok(result) => result,
            Err(object_store::Error::NotFound { .. }) => return Ok(None),
            Err(_) => return Err(Error::Unavailable),
        };
        if result.meta.size > 256 {
            return Err(Error::Invalid("invalid feed pointer"));
        }
        let version = UpdateVersion {
            e_tag: result.meta.e_tag.clone(),
            version: result.meta.version.clone(),
        };
        let bytes = result.bytes().await.map_err(|_| Error::Unavailable)?;
        let pointer: Pointer =
            serde_json::from_slice(&bytes).map_err(|_| Error::Invalid("invalid feed pointer"))?;
        if pointer.schema != 1 || !valid_revision(&pointer.revision) {
            return Err(Error::Invalid("invalid feed pointer"));
        }
        Ok(Some((pointer.revision, version)))
    }
    pub async fn revision(&self, revision: &str) -> Result<Feed, Error> {
        if !valid_revision(revision) {
            return Err(Error::Invalid("revision must be a SHA-256 hash"));
        }
        let result = self
            .store
            .get(&feed_key(revision))
            .await
            .map_err(|_| Error::Unavailable)?;
        if result.meta.size > MAX_FEED_BYTES as u64 {
            return Err(Error::Invalid("feed too large"));
        }
        let bytes = result.bytes().await.map_err(|_| Error::Unavailable)?;
        if hash(&bytes) != revision {
            return Err(Error::Invalid("feed hash mismatch"));
        }
        let feed: Feed =
            serde_json::from_slice(&bytes).map_err(|_| Error::Invalid("invalid feed JSON"))?;
        feed.validate()?;
        Ok(feed)
    }
    /// Reject concurrent edits. Local publication uses an OS lock and atomic
    /// replacement; object storage uses conditional puts, never a blind overwrite.
    pub async fn save(&self, expected: Option<&str>, feed: &Feed) -> Result<String, Error> {
        feed.validate()?;
        let bytes = serde_json::to_vec(feed).map_err(|_| Error::Invalid("invalid feed"))?;
        if bytes.len() > MAX_FEED_BYTES {
            return Err(Error::Invalid("feed too large"));
        }
        let _lock = if let Some(root) = &self.directory {
            let path = root.join("announcements");
            Some(
                tokio::task::spawn_blocking(move || {
                    std::fs::create_dir_all(&path)?;
                    let file = std::fs::OpenOptions::new()
                        .create(true)
                        .truncate(false)
                        .write(true)
                        .open(path.join("publish.lock"))?;
                    file.lock()?;
                    Ok::<_, std::io::Error>(file)
                })
                .await
                .map_err(|_| Error::Unavailable)?
                .map_err(|_| Error::Unavailable)?,
            )
        } else {
            None
        };
        let current = self.pointer().await?;
        if current.as_ref().map(|(revision, _)| revision.as_str()) != expected {
            return Err(Error::Conflict);
        }
        let revision = hash(&bytes);
        if expected == Some(&revision) {
            return Ok(revision);
        }
        match self
            .store
            .put_opts(
                &feed_key(&revision),
                bytes.clone().into(),
                PutMode::Create.into(),
            )
            .await
        {
            Ok(_) | Err(object_store::Error::AlreadyExists { .. }) => {}
            Err(_) => return Err(Error::Unavailable),
        }
        // Readback before making a revision visible, including an existing key.
        if self.revision(&revision).await? != *feed {
            return Err(Error::Invalid("feed readback mismatch"));
        }
        let mode = if self.directory.is_some() {
            PutMode::Overwrite
        } else {
            match current {
                Some((_, version)) => PutMode::Update(version),
                None => PutMode::Create,
            }
        };
        let pointer = serde_json::to_vec(&Pointer {
            schema: 1,
            revision: revision.clone(),
        })
        .map_err(|_| Error::Invalid("invalid pointer"))?;
        self.store
            .put_opts(&Path::from(CURRENT), pointer.into(), mode.into())
            .await
            .map_err(|err| match err {
                object_store::Error::AlreadyExists { .. }
                | object_store::Error::Precondition { .. } => Error::Conflict,
                _ => Error::Unavailable,
            })?;
        if self.pointer().await?.as_ref().map(|(r, _)| r) != Some(&revision) {
            return Err(Error::Conflict);
        }
        Ok(revision)
    }
}
impl FeedStore for AnnouncementStorage {
    fn load(&self) -> FeedFuture<'_> {
        Box::pin(async {
            match self.pointer().await? {
                Some((revision, _)) => Ok(Snapshot {
                    feed: self.revision(&revision).await?,
                    revision: Some(revision),
                }),
                None => Ok(Snapshot {
                    revision: None,
                    feed: Feed::default(),
                }),
            }
        })
    }
}
fn valid_revision(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
fn feed_key(revision: &str) -> Path {
    Path::from(format!("announcements/feeds/{revision}.json"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_application::announcements::Announcement;
    fn feed(id: &str) -> Feed {
        Feed {
            schema: 1,
            announcements: vec![Announcement {
                id: id.into(),
                title: id.into(),
                date: "2026-11-07T12:00:00Z".into(),
                until: None,
                href: None,
                image: None,
                body: "News".into(),
            }],
        }
    }
    async fn exercise(storage: AnnouncementStorage) {
        assert!(storage.load().await.unwrap().revision.is_none());
        let revision = storage.save(None, &feed("first")).await.unwrap();
        assert_eq!(storage.load().await.unwrap().feed, feed("first"));
        let second = feed("second");
        let third = feed("third");
        let (a, b) = tokio::join!(
            storage.save(Some(&revision), &second),
            storage.save(Some(&revision), &third)
        );
        assert!(a.is_ok() != b.is_ok());
        assert!(matches!(
            a.as_ref().err().or(b.as_ref().err()),
            Some(Error::Conflict)
        ));
        let current = storage.load().await.unwrap();
        let old = storage.revision(&revision).await.unwrap();
        assert_eq!(
            storage
                .save(current.revision.as_deref(), &old)
                .await
                .unwrap(),
            revision
        );
        let empty = storage
            .save(Some(&revision), &Feed::default())
            .await
            .unwrap();
        assert_eq!(
            storage.load().await.unwrap().revision.as_deref(),
            Some(empty.as_str())
        );
        assert!(storage.load().await.unwrap().feed.announcements.is_empty());
        // Broken pointers are errors, never interpreted as an empty catalog to overwrite.
        storage
            .store
            .put(&Path::from(CURRENT), b"broken".to_vec().into())
            .await
            .unwrap();
        assert!(storage.load().await.is_err());
        assert!(storage.save(None, &feed("fourth")).await.is_err());
    }
    #[tokio::test]
    async fn s3_compatible_publication_uses_conditional_signed_requests() {
        use axum::{
            Router,
            body::Bytes,
            extract::{Path as HttpPath, State},
            http::{HeaderMap, StatusCode},
            response::{IntoResponse, Response},
            routing::get,
        };
        use std::{collections::BTreeMap, sync::Mutex};
        type Objects = Arc<Mutex<BTreeMap<String, Vec<u8>>>>;
        async fn read(State(objects): State<Objects>, HttpPath(key): HttpPath<String>) -> Response {
            match objects.lock().unwrap().get(&key) {
                Some(bytes) => (
                    [
                        ("etag", format!("\"{}\"", hash(bytes))),
                        ("last-modified", "Fri, 30 Oct 2026 12:00:00 GMT".into()),
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
        ) -> Response {
            assert!(
                headers["authorization"]
                    .to_str()
                    .unwrap()
                    .starts_with("AWS4-HMAC-SHA256 Credential=fixture/")
            );
            let mut objects = objects.lock().unwrap();
            let current = objects
                .get(&key)
                .map(|bytes| format!("\"{}\"", hash(bytes)));
            let create = headers.get("if-none-match").is_some_and(|v| v == "*");
            let expected = headers.get("if-match").map(|v| v.to_str().unwrap());
            if (create && current.is_some())
                || (expected.is_some() && current.as_deref() != expected)
            {
                return (
                    StatusCode::PRECONDITION_FAILED,
                    "<Error><Code>PreconditionFailed</Code></Error>",
                )
                    .into_response();
            }
            if key.contains("/feeds/") {
                assert!(create, "immutable objects must use conditional create");
            }
            if key.ends_with("current.json") && body.as_ref() != b"broken" {
                assert!(
                    create || expected.is_some(),
                    "active pointer requires compare-and-swap"
                );
            }
            objects.insert(key, body.to_vec());
            ([("etag", format!("\"{}\"", hash(&body)))], "").into_response()
        }
        let app = Router::new()
            .route("/assets/{*key}", get(read).put(write))
            .with_state(Objects::default());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let store = object_store::aws::AmazonS3Builder::new()
            .with_bucket_name("assets")
            .with_region("us-east-2")
            .with_endpoint(endpoint)
            .with_allow_http(true)
            .with_access_key_id("fixture")
            .with_secret_access_key("fixture-secret")
            .build()
            .unwrap();
        exercise(AnnouncementStorage {
            store: Arc::new(store),
            directory: None,
        })
        .await;
        server.abort();
        assert!(server.await.unwrap_err().is_cancelled());
    }
    #[tokio::test]
    async fn local_publication_is_atomic_and_preserves_history() {
        let directory = std::env::temp_dir().join(format!("orbit-news-{}", uuid::Uuid::new_v4()));
        exercise(
            AnnouncementStorage::connect(&AssetConfig::Files {
                directory: directory.to_str().unwrap().into(),
            })
            .await
            .unwrap(),
        )
        .await;
        std::fs::remove_dir_all(directory).unwrap();
    }
    #[tokio::test]
    async fn conditional_object_publication_rejects_lost_updates() {
        exercise(AnnouncementStorage {
            store: Arc::new(object_store::memory::InMemory::new()),
            directory: None,
        })
        .await;
    }
}

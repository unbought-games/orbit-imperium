//! Provider-independent immutable objects and bounded reads. Access policy lives above this port.
use std::{future::Future, pin::Pin};

pub type AssetFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, AssetError>> + Send + 'a>>;
#[derive(Debug, thiserror::Error)]
pub enum AssetError {
    #[error("asset not found")]
    NotFound,
    #[error("asset storage unavailable")]
    Unavailable,
}
/// Opaque, application-generated keys; delivery URLs and access policy live above storage.
pub trait AssetStore: Send + Sync {
    fn read<'a>(&'a self, key: &'a str) -> AssetFuture<'a, Vec<u8>>;
    fn write<'a>(&'a self, key: &'a str, bytes: Vec<u8>) -> AssetFuture<'a, ()>;
    /// Media calls carry their own bounds; existing catalog calls keep 1 MiB limits.
    fn read_bounded<'a>(&'a self, _key: &'a str, _max_bytes: u64) -> AssetFuture<'a, Vec<u8>> {
        Box::pin(async { Err(AssetError::Unavailable) })
    }
    fn create_immutable<'a>(
        &'a self,
        _key: &'a str,
        _bytes: Vec<u8>,
        _max_bytes: u64,
    ) -> AssetFuture<'a, ()> {
        Box::pin(async { Err(AssetError::Unavailable) })
    }
    fn delete<'a>(&'a self, _key: &'a str) -> AssetFuture<'a, ()> {
        Box::pin(async { Err(AssetError::Unavailable) })
    }
}

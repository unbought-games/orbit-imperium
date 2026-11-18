use crate::{
    db_error,
    ordering::{Tx, now},
};
use orbit_application::{CommandIdentity, CommandTimeError, StoreError};
use uuid::Uuid;

pub(crate) async fn check(tx: &mut Tx<'_>, id: Uuid) -> Result<(), StoreError> {
    let identity = CommandIdentity::parse(id).map_err(StoreError::CommandTime)?;
    let cutoff = match identity {
        CommandIdentity::LegacyV4 => sqlx::query_scalar(
            "SELECT legacy_until_ms FROM command_admission_cutover WHERE singleton",
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?,
        CommandIdentity::V7 { .. } => 0,
    };
    identity
        .check(now(tx).await?, cutoff)
        .map_err(StoreError::CommandTime)?;
    Ok(())
}

/// Only called after scoped authorization and a receipt miss. Retained receipts
/// remain readable independently of admission and its legacy deadline.
pub(crate) async fn missing(tx: &mut Tx<'_>, id: Uuid) -> StoreError {
    match check(tx, id).await {
        Ok(()) => StoreError::NotFound,
        Err(StoreError::CommandTime(CommandTimeError::Expired)) => {
            StoreError::CommandTime(CommandTimeError::HistoryExpired)
        }
        Err(error) => error,
    }
}

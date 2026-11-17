//! Request-local collection policy; admission freezes it before a worker can run.
use crate::*;
use serde_json::{Value, json};
use std::future::Future;
tokio::task_local! { static COLLECTION: Value; }

/// Scope trusted server configuration around a request, never browser-supplied JSON.
/// Missing scope (native clients, disabled integration) remains explicit unknown coverage.
pub async fn with_activity_collection<F: Future>(policy: Value, request: F) -> F::Output {
    COLLECTION.scope(policy, request).await
}

pub(crate) async fn admit(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    input: uuid::Uuid,
) -> Result<(), StoreError> {
    let Some(config) = COLLECTION.try_with(Clone::clone).ok() else {
        return Ok(());
    };
    let policy = if config.get("reason").is_some() {
        config
    } else {
        let identity: Option<(String,String)> = sqlx::query_as("SELECT o.issuer,o.subject FROM commands c JOIN universe_memberships m ON m.universe=c.universe AND m.player=c.actor JOIN oidc_identity o ON o.account=m.account WHERE c.input_id=$1")
            .bind(input).fetch_optional(&mut **tx).await.map_err(db_error)?;
        match identity {
            Some((issuer, id)) => {
                use sha2::Digest;
                json!({"config":config,"subject":{"namespace":format!("oidc_{}",hex::encode(sha2::Sha256::digest(issuer.as_bytes()))),"id":id}})
            }
            None => json!({"reason":"identity_unavailable"}),
        }
    };
    sqlx::query("UPDATE commands SET activity_policy=$2 WHERE input_id=$1")
        .bind(input)
        .bind(policy)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}

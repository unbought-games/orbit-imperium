//! Social transactions share the alliance lock so membership, permission, block,
//! friendship and circular-delivery changes have one committed ordering.
use crate::{
    PgStore, db_error,
    ordering::{Tx, now},
};
use orbit_application::*;
use sqlx::{Row, postgres::PgRow};
use uuid::Uuid;
pub(crate) mod commands;
mod reads;

async fn lock(tx: &mut Tx<'_>, b: Binding) -> Result<(), StoreError> {
    sqlx::query("SELECT id FROM universes WHERE id=$1 FOR SHARE")
        .bind(b.universe.0)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,19))")
        .bind(format!("alliances:{}:{}", b.universe, b.epoch))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    crate::binding::check_read(tx, b).await
}
fn pair(b: Binding, player: PlayerId) -> Result<(Uuid, Uuid), StoreError> {
    if player == b.player {
        return Err(StoreError::Conflict);
    }
    Ok((b.player.0.min(player.0), b.player.0.max(player.0)))
}
async fn known_player(tx: &mut Tx<'_>, b: Binding, p: PlayerId) -> Result<String, StoreError> {
    sqlx::query_scalar("SELECT a.name FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1 AND m.player=$2")
        .bind(b.universe.0).bind(p.0).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)
}
async fn blocked(tx: &mut Tx<'_>, b: Binding, p: PlayerId) -> Result<bool, StoreError> {
    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM player_blocks WHERE universe=$1 AND epoch=$2 AND ((blocker=$3 AND blocked=$4) OR (blocker=$4 AND blocked=$3)))")
        .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(p.0).fetch_one(&mut **tx).await.map_err(db_error)
}
async fn conversation(
    tx: &mut Tx<'_>,
    b: Binding,
    p: PlayerId,
) -> Result<Option<Uuid>, StoreError> {
    let (lo, hi) = pair(b, p)?;
    sqlx::query_scalar("SELECT id FROM conversations WHERE universe=$1 AND epoch=$2 AND player_low=$3 AND player_high=$4")
        .bind(b.universe.0).bind(b.epoch.0).bind(lo).bind(hi).fetch_optional(&mut **tx).await.map_err(db_error)
}
async fn message_sequence(
    tx: &mut Tx<'_>,
    conversation: Uuid,
    message: Uuid,
) -> Result<i64, StoreError> {
    sqlx::query_scalar("SELECT sequence FROM conversation_messages WHERE conversation=$1 AND id=$2")
        .bind(conversation)
        .bind(message)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)
}
// A read/hide is private to its actor. A send or relationship change affects
// both participants. Circular delivery follows the stored recipient list.
async fn invalidate_social(
    tx: &mut Tx<'_>,
    b: Binding,
    action: &SocialAction,
    message: Option<Uuid>,
) -> Result<(), StoreError> {
    let mut recipients = std::collections::BTreeSet::from([b.player]);
    match action {
        SocialAction::Send { player, .. }
        | SocialAction::RequestFriend { player }
        | SocialAction::AcceptFriend { player, .. }
        | SocialAction::RemoveFriend { player, .. }
        | SocialAction::Block { player }
        | SocialAction::Unblock { player } => {
            recipients.insert(*player);
        }
        SocialAction::Circular { .. } => {
            let players: Vec<Uuid> = sqlx::query_scalar(
                "SELECT player FROM alliance_circular_recipients WHERE circular=$1",
            )
            .bind(message.ok_or(StoreError::CorruptData)?)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?;
            recipients.extend(players.into_iter().map(PlayerId));
        }
        SocialAction::Read { .. }
        | SocialAction::Hide { .. }
        | SocialAction::ReadCircular { .. }
        | SocialAction::HideCircular { .. } => {}
    }
    for player in recipients {
        crate::updates::invalidate_viewer(tx, b.universe, b.epoch, player).await?;
    }
    Ok(())
}

impl PgStore {
    pub(crate) async fn commit_social(
        &self,
        q: SocialCommandRequest,
    ) -> Result<SocialCommandResult, StoreError> {
        if let SocialAction::Send { body, .. } | SocialAction::Circular { body, .. } = &q.action
            && !valid_social_body(body)
        {
            return Err(StoreError::Conflict);
        }
        let b = q.context.binding;
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        lock(&mut tx, b).await?;
        let hash = orbit_engine::hash(&serde_json::json!({"binding":b,"action":q.action})).0;
        let existing=sqlx::query("SELECT intent_hash,result FROM social_command_receipts WHERE universe=$1 AND epoch=$2 AND account=$3 AND player=$4 AND command_id=$5")
            .bind(b.universe.0).bind(b.epoch.0).bind(b.account.0).bind(b.player.0).bind(q.command_id).fetch_optional(&mut *tx).await.map_err(db_error)?;
        crate::command_window::check(&mut tx, q.command_id).await?;
        if let Some(row) = existing {
            if row.try_get::<String, _>("intent_hash").map_err(db_error)? != hash {
                return Err(StoreError::Conflict);
            }
            return Ok(row
                .try_get::<sqlx::types::Json<SocialCommandResult>, _>("result")
                .map_err(db_error)?
                .0);
        }
        crate::bots::charge(&mut tx, b, "social", q.command_id, true).await?;
        let at = now(&mut tx).await?;
        let message = commands::apply(&mut tx, b, &q.action, at).await?;
        invalidate_social(&mut tx, b, &q.action, message).await?;
        let result = SocialCommandResult {
            command_id: q.command_id,
            message,
        };
        sqlx::query("INSERT INTO social_command_receipts VALUES($1,$2,$3,$4,$5,$6,$7)")
            .bind(b.universe.0)
            .bind(b.epoch.0)
            .bind(b.account.0)
            .bind(b.player.0)
            .bind(q.command_id)
            .bind(hash)
            .bind(sqlx::types::Json(&result))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        crate::command_window::check(&mut tx, q.command_id).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
}

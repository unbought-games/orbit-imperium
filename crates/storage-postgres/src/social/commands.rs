use super::*;
pub(crate) async fn apply(
    tx: &mut Tx<'_>,
    b: Binding,
    a: &SocialAction,
    at: i64,
) -> Result<Option<Uuid>, StoreError> {
    match a {
        SocialAction::Send { player, body } => {
            return send(tx, b, *player, body, at).await.map(Some);
        }
        SocialAction::Circular { alliance, body } => {
            return circular(tx, b, *alliance, body, at).await.map(Some);
        }
        SocialAction::Read { player, message } | SocialAction::Hide { player, message } => {
            let c = conversation(tx, b, *player)
                .await?
                .ok_or(StoreError::NotFound)?;
            let seq = message_sequence(tx, c, *message).await?;
            let read = matches!(a, SocialAction::Read { .. });
            sqlx::query("INSERT INTO conversation_player_state(conversation,player,last_read_sequence,hidden_through_sequence) VALUES($1,$2,$3,$4) ON CONFLICT(conversation,player) DO UPDATE SET last_read_sequence=GREATEST(conversation_player_state.last_read_sequence,EXCLUDED.last_read_sequence),hidden_through_sequence=GREATEST(conversation_player_state.hidden_through_sequence,EXCLUDED.hidden_through_sequence)")
                .bind(c).bind(b.player.0).bind(if read{seq}else{0}).bind(if read{0}else{seq}).execute(&mut **tx).await.map_err(db_error)?;
        }
        SocialAction::ReadCircular { circular } | SocialAction::HideCircular { circular } => {
            let read = matches!(a, SocialAction::ReadCircular { .. });
            let changed=sqlx::query("UPDATE alliance_circular_recipients r SET read_at=CASE WHEN $5 THEN COALESCE(r.read_at,$6) ELSE r.read_at END,hidden_at=CASE WHEN $5 THEN r.hidden_at ELSE COALESCE(r.hidden_at,$6) END FROM alliance_circulars c WHERE r.circular=c.id AND c.universe=$1 AND c.epoch=$2 AND r.player=$3 AND c.id=$4")
                .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(circular).bind(read).bind(at).execute(&mut **tx).await.map_err(db_error)?;
            if changed.rows_affected() != 1 {
                return Err(StoreError::NotFound);
            }
        }
        _ => relationship(tx, b, a, at).await?,
    }
    Ok(None)
}
async fn send(
    tx: &mut Tx<'_>,
    b: Binding,
    p: PlayerId,
    body: &str,
    at: i64,
) -> Result<Uuid, StoreError> {
    let (lo, hi) = pair(b, p)?;
    known_player(tx, b, p).await?;
    if blocked(tx, b, p).await? {
        return Err(StoreError::Conflict);
    }
    let c=sqlx::query_scalar::<_,Uuid>("INSERT INTO conversations(id,universe,epoch,player_low,player_high,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(universe,epoch,player_low,player_high) DO UPDATE SET id=conversations.id RETURNING id")
        .bind(Uuid::new_v4()).bind(b.universe.0).bind(b.epoch.0).bind(lo).bind(hi).bind(at).fetch_one(&mut **tx).await.map_err(db_error)?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO conversation_messages(id,conversation,sequence,sender,body,sent_at) SELECT $1,$2,COALESCE(MAX(sequence),0)+1,$3,$4,$5 FROM conversation_messages WHERE conversation=$2")
        .bind(id).bind(c).bind(b.player.0).bind(body).bind(at).execute(&mut **tx).await.map_err(db_error)?;
    Ok(id)
}
async fn relationship(
    tx: &mut Tx<'_>,
    b: Binding,
    a: &SocialAction,
    at: i64,
) -> Result<(), StoreError> {
    let p = match a {
        SocialAction::RequestFriend { player }
        | SocialAction::AcceptFriend { player, .. }
        | SocialAction::RemoveFriend { player, .. }
        | SocialAction::Block { player }
        | SocialAction::Unblock { player } => *player,
        _ => return Err(StoreError::Conflict),
    };
    let (lo, hi) = pair(b, p)?;
    known_player(tx, b, p).await?;
    match a {
        SocialAction::Block { .. } => {
            sqlx::query("INSERT INTO player_blocks VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING")
                .bind(b.universe.0)
                .bind(b.epoch.0)
                .bind(b.player.0)
                .bind(p.0)
                .bind(at)
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM friend_relationships WHERE universe=$1 AND epoch=$2 AND player_low=$3 AND player_high=$4").bind(b.universe.0).bind(b.epoch.0).bind(lo).bind(hi).execute(&mut **tx).await.map_err(db_error)?;
        }
        SocialAction::Unblock { .. } => {
            sqlx::query("DELETE FROM player_blocks WHERE universe=$1 AND epoch=$2 AND blocker=$3 AND blocked=$4").bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(p.0).execute(&mut **tx).await.map_err(db_error)?;
        }
        SocialAction::RequestFriend { .. } => {
            if blocked(tx, b, p).await? {
                return Err(StoreError::Conflict);
            }
            let n=sqlx::query("INSERT INTO friend_relationships(universe,epoch,player_low,player_high,request,requested_by,requested_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING")
                .bind(b.universe.0).bind(b.epoch.0).bind(lo).bind(hi).bind(Uuid::new_v4()).bind(b.player.0).bind(at).execute(&mut **tx).await.map_err(db_error)?.rows_affected();
            if n != 1 {
                return Err(StoreError::Conflict);
            }
        }
        SocialAction::AcceptFriend { request, .. } => {
            if blocked(tx, b, p).await? {
                return Err(StoreError::Conflict);
            }
            let n=sqlx::query("UPDATE friend_relationships SET accepted_at=$7 WHERE universe=$1 AND epoch=$2 AND player_low=$3 AND player_high=$4 AND request=$5 AND requested_by<>$6 AND accepted_at IS NULL")
                .bind(b.universe.0).bind(b.epoch.0).bind(lo).bind(hi).bind(request).bind(b.player.0).bind(at).execute(&mut **tx).await.map_err(db_error)?.rows_affected();
            if n != 1 {
                return Err(StoreError::Conflict);
            }
        }
        SocialAction::RemoveFriend { request, .. } => {
            sqlx::query("DELETE FROM friend_relationships WHERE universe=$1 AND epoch=$2 AND player_low=$3 AND player_high=$4 AND request=$5")
                .bind(b.universe.0).bind(b.epoch.0).bind(lo).bind(hi).bind(request).execute(&mut **tx).await.map_err(db_error)?;
        }
        _ => unreachable!(),
    }
    Ok(())
}
async fn circular(
    tx: &mut Tx<'_>,
    b: Binding,
    id: Uuid,
    body: &str,
    at: i64,
) -> Result<Uuid, StoreError> {
    let alliance = crate::alliances::persistence::load(tx, b.universe, b.epoch, id).await?;
    if !alliance
        .permissions(b.player)
        .contains(&AlliancePermission::SendCircular)
    {
        return Err(StoreError::NotFound);
    }
    let message = Uuid::new_v4();
    sqlx::query("INSERT INTO alliance_circulars VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
        .bind(message)
        .bind(b.universe.0)
        .bind(b.epoch.0)
        .bind(id)
        .bind(alliance.name)
        .bind(alliance.tag)
        .bind(b.player.0)
        .bind(body)
        .bind(at)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO alliance_circular_recipients(circular,player,read_at) SELECT $1,m.player,CASE WHEN m.player=$4 THEN $5 ELSE NULL END FROM alliance_memberships m WHERE m.universe=$2 AND m.epoch=$3 AND m.alliance=$6 AND NOT EXISTS(SELECT 1 FROM player_blocks x WHERE x.universe=$2 AND x.epoch=$3 AND ((x.blocker=m.player AND x.blocked=$4) OR (x.blocker=$4 AND x.blocked=m.player)))")
        .bind(message).bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(at).bind(id).execute(&mut **tx).await.map_err(db_error)?;
    Ok(message)
}

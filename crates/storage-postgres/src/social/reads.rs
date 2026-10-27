use super::*;
fn message(r: &PgRow) -> Result<SocialMessage, StoreError> {
    Ok(SocialMessage {
        id: r.try_get("id").map_err(db_error)?,
        sequence: r
            .try_get::<i64, _>("sequence")
            .map_err(db_error)?
            .to_string(),
        sender: PlayerId(r.try_get("sender").map_err(db_error)?),
        body: r.try_get("body").map_err(db_error)?,
        sent_at: r.try_get("sent_at").map_err(db_error)?,
    })
}
async fn contact(tx: &mut Tx<'_>, b: Binding, p: PlayerId) -> Result<SocialContact, StoreError> {
    let (lo, hi) = pair(b, p)?;
    let username = known_player(tx, b, p).await?;
    let blocked=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM player_blocks WHERE universe=$1 AND epoch=$2 AND blocker=$3 AND blocked=$4)")
        .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(p.0).fetch_one(&mut **tx).await.map_err(db_error)?;
    let row=sqlx::query("SELECT request,requested_by,accepted_at FROM friend_relationships WHERE universe=$1 AND epoch=$2 AND player_low=$3 AND player_high=$4")
        .bind(b.universe.0).bind(b.epoch.0).bind(lo).bind(hi).fetch_optional(&mut **tx).await.map_err(db_error)?;
    let (request, requested_by, accepted) = if let Some(r) = row {
        (
            Some(r.try_get("request").map_err(db_error)?),
            Some(PlayerId(r.try_get("requested_by").map_err(db_error)?)),
            r.try_get::<Option<i64>, _>("accepted_at")
                .map_err(db_error)?
                .is_some(),
        )
    } else {
        (None, None, false)
    };
    Ok(SocialContact {
        player: p,
        username,
        blocked,
        request,
        requested_by,
        accepted,
    })
}
impl PgStore {
    pub(crate) async fn read_social(
        &self,
        q: SocialQueryRequest,
    ) -> Result<SocialView, StoreError> {
        let limit = match &q.query {
            SocialQuery::Conversations { limit, .. }
            | SocialQuery::Messages { limit, .. }
            | SocialQuery::Circulars { limit, .. }
            | SocialQuery::Contacts { limit, .. } => *limit,
        };
        if !(1..=100).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let b = q.context.binding;
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        crate::bots::observe(&mut tx, b).await?;
        let mut view = SocialView {
            binding: b,
            request_id: q.context.request_id,
            conversations: vec![],
            messages: vec![],
            circulars: vec![],
            contacts: vec![],
            contact: None,
            next_cursor: None,
        };
        match q.query {
            SocialQuery::Conversations { cursor, .. } => {
                inbox(&mut tx, b, cursor, limit, &mut view).await?
            }
            SocialQuery::Messages {
                player,
                before,
                after,
                ..
            } => history(&mut tx, b, player, before, after, limit, &mut view).await?,
            SocialQuery::Circulars { cursor, .. } => {
                circulars(&mut tx, b, cursor, limit, &mut view).await?
            }
            SocialQuery::Contacts { kind, cursor, .. } => {
                contacts(&mut tx, b, kind, cursor, limit, &mut view).await?
            }
        }
        tx.commit().await.map_err(db_error)?;
        Ok(view)
    }
}
async fn history(
    tx: &mut Tx<'_>,
    b: Binding,
    p: PlayerId,
    before: Option<Uuid>,
    after: Option<Uuid>,
    limit: u32,
    v: &mut SocialView,
) -> Result<(), StoreError> {
    if before.is_some() && after.is_some() {
        return Err(StoreError::Conflict);
    }
    v.contact = Some(contact(tx, b, p).await?);
    let Some(c) = conversation(tx, b, p).await? else {
        return if before.is_some() || after.is_some() {
            Err(StoreError::NotFound)
        } else {
            Ok(())
        };
    };
    let seq = if let Some(id) = before.or(after) {
        Some(message_sequence(tx, c, id).await?)
    } else {
        None
    };
    let sql = if after.is_some() {
        "SELECT * FROM conversation_messages WHERE conversation=$1 AND sequence>$2 ORDER BY sequence ASC LIMIT $3"
    } else {
        "SELECT * FROM conversation_messages WHERE conversation=$1 AND ($2::bigint IS NULL OR sequence<$2) ORDER BY sequence DESC LIMIT $3"
    };
    let mut rows = sqlx::query(sql)
        .bind(c)
        .bind(seq)
        .bind(i64::from(limit) + 1)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?;
    let more = rows.len() > limit as usize;
    rows.truncate(limit as usize);
    if more {
        v.next_cursor = rows
            .last()
            .map(|r| r.try_get("id").map_err(db_error))
            .transpose()?;
    }
    v.messages = rows.iter().map(message).collect::<Result<_, _>>()?;
    if after.is_none() {
        v.messages.reverse();
    }
    Ok(())
}
async fn inbox(
    tx: &mut Tx<'_>,
    b: Binding,
    cursor: Option<Uuid>,
    limit: u32,
    v: &mut SocialView,
) -> Result<(), StoreError> {
    let anchor = if let Some(id) = cursor {
        Some(sqlx::query_scalar::<_,i64>("SELECT m.sent_at FROM conversation_messages m JOIN conversations c ON c.id=m.conversation WHERE m.id=$1 AND c.universe=$2 AND c.epoch=$3 AND $4 IN(c.player_low,c.player_high)")
            .bind(id).bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?)
    } else {
        None
    };
    let mut rows=sqlx::query("SELECT m.*, CASE WHEN c.player_low=$3 THEN c.player_high ELSE c.player_low END AS peer, EXISTS(SELECT 1 FROM conversation_messages u WHERE u.conversation=c.id AND u.sequence>COALESCE(s.last_read_sequence,0) AND u.sender=CASE WHEN c.player_low=$3 THEN c.player_high ELSE c.player_low END) AS unread FROM conversations c CROSS JOIN LATERAL(SELECT * FROM conversation_messages WHERE conversation=c.id ORDER BY sequence DESC LIMIT 1)m LEFT JOIN conversation_player_state s ON s.conversation=c.id AND s.player=$3 WHERE c.universe=$1 AND c.epoch=$2 AND $3 IN(c.player_low,c.player_high) AND m.sequence>COALESCE(s.hidden_through_sequence,0) AND ($4::bigint IS NULL OR (m.sent_at,m.id)<($4,$5)) ORDER BY m.sent_at DESC,m.id DESC LIMIT $6")
        .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(anchor).bind(cursor).bind(i64::from(limit)+1).fetch_all(&mut **tx).await.map_err(db_error)?;
    let more = rows.len() > limit as usize;
    rows.truncate(limit as usize);
    if more {
        v.next_cursor = rows
            .last()
            .map(|r| r.try_get("id").map_err(db_error))
            .transpose()?;
    }
    for r in rows {
        v.conversations.push(SocialConversation {
            contact: contact(tx, b, PlayerId(r.try_get("peer").map_err(db_error)?)).await?,
            latest: message(&r)?,
            unread: r.try_get("unread").map_err(db_error)?,
        });
    }
    Ok(())
}
async fn circulars(
    tx: &mut Tx<'_>,
    b: Binding,
    cursor: Option<Uuid>,
    limit: u32,
    v: &mut SocialView,
) -> Result<(), StoreError> {
    let anchor = if let Some(id) = cursor {
        Some(sqlx::query_scalar::<_,i64>("SELECT c.sent_at FROM alliance_circulars c JOIN alliance_circular_recipients r ON r.circular=c.id WHERE c.universe=$1 AND c.epoch=$2 AND r.player=$3 AND c.id=$4")
        .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(id).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?)
    } else {
        None
    };
    let mut rows=sqlx::query("SELECT c.*,r.read_at FROM alliance_circulars c JOIN alliance_circular_recipients r ON r.circular=c.id WHERE c.universe=$1 AND c.epoch=$2 AND r.player=$3 AND r.hidden_at IS NULL AND ($4::bigint IS NULL OR(c.sent_at,c.id)<($4,$5)) ORDER BY c.sent_at DESC,c.id DESC LIMIT $6")
        .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(anchor).bind(cursor).bind(i64::from(limit)+1).fetch_all(&mut **tx).await.map_err(db_error)?;
    let more = rows.len() > limit as usize;
    rows.truncate(limit as usize);
    if more {
        v.next_cursor = rows
            .last()
            .map(|r| r.try_get("id").map_err(db_error))
            .transpose()?;
    }
    for r in rows {
        let sender = PlayerId(r.try_get("sender").map_err(db_error)?);
        v.circulars.push(SocialCircular {
            id: r.try_get("id").map_err(db_error)?,
            alliance: r.try_get("alliance").map_err(db_error)?,
            alliance_name: r.try_get("alliance_name").map_err(db_error)?,
            alliance_tag: r.try_get("alliance_tag").map_err(db_error)?,
            sender,
            sender_name: known_player(tx, b, sender).await?,
            body: r.try_get("body").map_err(db_error)?,
            sent_at: r.try_get("sent_at").map_err(db_error)?,
            read: r
                .try_get::<Option<i64>, _>("read_at")
                .map_err(db_error)?
                .is_some(),
        });
    }
    Ok(())
}
async fn contacts(
    tx: &mut Tx<'_>,
    b: Binding,
    kind: ContactKind,
    cursor: Option<Uuid>,
    limit: u32,
    v: &mut SocialView,
) -> Result<(), StoreError> {
    let mut ids:Vec<Uuid>=match kind {
        ContactKind::Blocks=>sqlx::query_scalar("SELECT blocked FROM player_blocks WHERE universe=$1 AND epoch=$2 AND blocker=$3 AND ($4::uuid IS NULL OR blocked>$4) ORDER BY blocked LIMIT $5")
            .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(cursor).bind(i64::from(limit)+1).fetch_all(&mut **tx).await.map_err(db_error)?,
        _=>sqlx::query_scalar("SELECT CASE WHEN player_low=$3 THEN player_high ELSE player_low END AS peer FROM friend_relationships WHERE universe=$1 AND epoch=$2 AND $3 IN(player_low,player_high) AND (accepted_at IS NOT NULL)=$6 AND ($4::uuid IS NULL OR(CASE WHEN player_low=$3 THEN player_high ELSE player_low END)>$4) ORDER BY peer LIMIT $5")
            .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(cursor).bind(i64::from(limit)+1).bind(matches!(kind,ContactKind::Friends)).fetch_all(&mut **tx).await.map_err(db_error)?,
    };
    let more = ids.len() > limit as usize;
    ids.truncate(limit as usize);
    if more {
        v.next_cursor = ids.last().copied();
    }
    for id in ids {
        v.contacts.push(contact(tx, b, PlayerId(id)).await?);
    }
    Ok(())
}

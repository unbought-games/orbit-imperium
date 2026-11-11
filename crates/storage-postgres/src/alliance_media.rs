use crate::{
    ordering::{Tx, now},
    *,
};
use orbit_application::*;
use sqlx::{Row, postgres::PgRow};
use uuid::Uuid;

fn record(row: PgRow) -> Result<AllianceMedia, StoreError> {
    Ok(AllianceMedia {
        id: row.try_get("id").map_err(db_error)?,
        universe: UniverseId(row.try_get("universe").map_err(db_error)?),
        epoch: Epoch(row.try_get("epoch").map_err(db_error)?),
        alliance: row.try_get("alliance").map_err(db_error)?,
        filename: row.try_get("filename").map_err(db_error)?,
        state: row.try_get("state").map_err(db_error)?,
        declared_bytes: row.try_get::<i64, _>("declared_bytes").map_err(db_error)? as u64,
        created_at: row.try_get("created_at").map_err(db_error)?,
        expires_at: row.try_get("expires_at").map_err(db_error)?,
        receipt: row
            .try_get::<Option<sqlx::types::Json<MediaReceipt>>, _>("receipt")
            .map_err(db_error)?
            .map(|j| j.0),
    })
}
async fn one(tx: &mut Tx<'_>, alliance: Uuid, id: Uuid) -> Result<AllianceMedia, StoreError> {
    record(
        sqlx::query("SELECT * FROM alliance_media WHERE alliance=$1 AND id=$2 FOR UPDATE")
            .bind(alliance)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?,
    )
}
impl PgStore {
    pub(crate) async fn manage_alliance_media(
        &self,
        b: Binding,
        alliance: Uuid,
        action: MediaOperation,
    ) -> Result<AllianceMediaLibrary, StoreError> {
        let (limits, action) = match action {
            MediaOperation::Configured { limits, action } => (limits, *action),
            action => (AllianceMediaLimits::default(), action),
        };
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        sqlx::query("SELECT id FROM universes WHERE id=$1 FOR SHARE")
            .bind(b.universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,19))")
            .bind(format!("alliances:{}:{}", b.universe, b.epoch))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        crate::binding::check_read(&mut tx, b).await?;
        crate::bots::observe(&mut tx, b).await?;
        let state =
            crate::alliances::persistence::load(&mut tx, b.universe, b.epoch, alliance).await?;
        if !state
            .permissions(b.player)
            .contains(&AlliancePermission::EditProfile)
        {
            return Err(StoreError::NotFound);
        }
        let at = now(&mut tx).await?;
        let requested = match &action {
            MediaOperation::User(AllianceMediaAction::Begin {
                media_id,
                filename,
                bytes,
            }) => {
                if !limits.uploads_enabled
                    || media_id.is_nil()
                    || filename.trim().is_empty()
                    || filename.chars().count() > 160
                    || filename.chars().any(char::is_control)
                    || *bytes == 0
                    || *bytes > limits.file_bytes
                {
                    return Err(StoreError::Conflict);
                }
                if let Some(row) = sqlx::query("SELECT * FROM alliance_media WHERE id=$1")
                    .bind(media_id)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(db_error)?
                {
                    let old = record(row)?;
                    if old.alliance != alliance
                        || old.filename != *filename
                        || old.declared_bytes != *bytes
                        || !matches!(old.state.as_str(), "reserved" | "ready")
                    {
                        return Err(StoreError::Conflict);
                    }
                } else {
                    let (count,total):(i64,i64)=sqlx::query_as("SELECT count(*),COALESCE(sum(greatest(declared_bytes,COALESCE((receipt->>'bytes')::bigint,0))),0)::bigint FROM alliance_media WHERE alliance=$1 AND (state='ready' OR (state='reserved' AND expires_at>$2))").bind(alliance).bind(at).fetch_one(&mut *tx).await.map_err(db_error)?;
                    if count >= limits.count as i64 || total as u64 + bytes > limits.total_bytes {
                        return Err(StoreError::Conflict);
                    }
                    crate::bots::charge(&mut tx, b, "alliance-media-create", *media_id, true)
                        .await?;
                    sqlx::query("INSERT INTO alliance_media(id,universe,epoch,alliance,uploader,filename,declared_bytes,created_at,expires_at,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved')").bind(media_id).bind(b.universe.0).bind(b.epoch.0).bind(alliance).bind(b.account.0).bind(filename).bind(*bytes as i64).bind(at).bind(at+3_600_000).execute(&mut *tx).await.map_err(db_error)?;
                }
                Some(*media_id)
            }
            MediaOperation::Authorize { media_id } => {
                let m = one(&mut tx, alliance, *media_id).await?;
                if m.state == "reserved"
                    && (!limits.uploads_enabled || m.declared_bytes > limits.file_bytes)
                {
                    return Err(StoreError::Conflict);
                }
                if !matches!(m.state.as_str(), "reserved" | "ready")
                    || m.state == "reserved" && m.expires_at <= at
                {
                    return Err(StoreError::Conflict);
                }
                Some(*media_id)
            }
            MediaOperation::Prepare { media_id, receipt }
            | MediaOperation::Finalize { media_id, receipt } => {
                let finalize = matches!(action, MediaOperation::Finalize { .. });
                let m = one(&mut tx, alliance, *media_id).await?;
                if m.state == "ready" {
                    if m.receipt.as_ref() != Some(receipt) {
                        return Err(StoreError::Conflict);
                    }
                } else {
                    if m.receipt.as_ref().is_some_and(|old| old != receipt) {
                        return Err(StoreError::Conflict);
                    }
                    if !limits.uploads_enabled
                        || m.state != "reserved"
                        || m.expires_at <= at
                        || receipt.bytes == 0
                        || receipt.bytes > limits.file_bytes
                        || receipt.sha256.len() != 64
                        || !receipt.sha256.bytes().all(|b| b.is_ascii_hexdigit())
                        || !matches!(
                            receipt.content_type.as_str(),
                            "image/png" | "image/jpeg" | "image/gif" | "image/webp"
                        )
                    {
                        return Err(StoreError::Conflict);
                    }
                    let total:i64=sqlx::query_scalar("SELECT COALESCE(sum(greatest(declared_bytes,COALESCE((receipt->>'bytes')::bigint,0))),0)::bigint FROM alliance_media WHERE alliance=$1 AND id<>$2 AND (state='ready' OR (state='reserved' AND expires_at>$3))").bind(alliance).bind(media_id).bind(at).fetch_one(&mut *tx).await.map_err(db_error)?;
                    if total as u64 + m.declared_bytes.max(receipt.bytes) > limits.total_bytes {
                        return Err(StoreError::Conflict);
                    }
                    let updated=sqlx::query("UPDATE alliance_media SET state=$3,receipt=$2 WHERE id=$1 AND state='reserved' AND expires_at>$4")
                        .bind(media_id)
                        .bind(sqlx::types::Json(receipt))
                        .bind(if finalize { "ready" } else { "reserved" })
                        .bind(at)
                        .execute(&mut *tx)
                        .await
                        .map_err(db_error)?;
                    if updated.rows_affected() != 1 {
                        return Err(StoreError::Conflict);
                    }
                }
                Some(*media_id)
            }
            MediaOperation::User(AllianceMediaAction::Delete { media_id }) => {
                let media = one(&mut tx, alliance, *media_id).await?;
                if state
                    .presentation
                    .templates
                    .iter()
                    .any(|(id, d)| !known_template(id) || d.schema_version != 1)
                    || state.presentation.all_media_ids().contains(media_id)
                {
                    return Err(StoreError::Conflict);
                }
                if !matches!(media.state.as_str(), "deleting" | "deleted") {
                    crate::bots::charge(&mut tx, b, "alliance-media-delete", *media_id, true)
                        .await?;
                }
                sqlx::query("UPDATE alliance_media SET state='deleting',deleted_at=COALESCE(deleted_at,$2) WHERE id=$1 AND state<>'deleted'").bind(media_id).bind(at).execute(&mut *tx).await.map_err(db_error)?;
                Some(*media_id)
            }
            MediaOperation::User(AllianceMediaAction::List) => None,
            MediaOperation::Configured { .. } => return Err(StoreError::Conflict),
        };
        let media = if let Some(id) = requested {
            vec![one(&mut tx, alliance, id).await?]
        } else {
            sqlx::query("SELECT * FROM alliance_media WHERE alliance=$1 AND (state='ready' OR (state='reserved' AND expires_at>$2)) ORDER BY created_at DESC,id").bind(alliance).bind(at).fetch_all(&mut *tx).await.map_err(db_error)?.into_iter().map(record).collect::<Result<_,_>>()?
        };
        tx.commit().await.map_err(db_error)?;
        Ok(AllianceMediaLibrary {
            media,
            max_file_bytes: if limits.uploads_enabled {
                limits.file_bytes
            } else {
                0
            },
            max_total_bytes: limits.total_bytes,
            max_count: limits.count,
        })
    }

    pub(crate) async fn read_alliance_media(
        &self,
        universe: UniverseId,
        id: Uuid,
        account: Option<AccountId>,
    ) -> Result<AllianceMedia, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let m=record(sqlx::query("SELECT m.* FROM alliance_media m JOIN alliances a ON a.id=m.alliance AND a.universe=m.universe AND a.epoch=m.epoch JOIN universes u ON u.id=a.universe AND u.epoch=a.epoch WHERE m.id=$1 AND m.universe=$2 AND m.state='ready'").bind(id).bind(universe.0).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?)?;
        let p = crate::alliance_presentation::load(&mut tx, m.alliance).await?;
        let mut allowed = p.public_media_ids().contains(&id);
        if !allowed && let Some(account) = account {
            let player: Option<Uuid> = sqlx::query_scalar(
                "SELECT player FROM universe_memberships WHERE universe=$1 AND account=$2",
            )
            .bind(universe.0)
            .bind(account.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
            if let Some(player) = player {
                crate::bots::observe(
                    &mut tx,
                    Binding {
                        account,
                        player: PlayerId(player),
                        universe,
                        epoch: m.epoch,
                    },
                )
                .await?;
                let state =
                    crate::alliances::persistence::load(&mut tx, universe, m.epoch, m.alliance)
                        .await?;
                allowed = state
                    .permissions(PlayerId(player))
                    .contains(&AlliancePermission::EditProfile)
                    || (state.is_member(PlayerId(player)) && p.member_media_ids().contains(&id));
            }
        }
        if !allowed {
            return Err(StoreError::NotFound);
        }
        tx.commit().await.map_err(db_error)?;
        Ok(m)
    }

    /// Explicit operator maintenance; deletion intents survive alliance removal.
    pub async fn cleanup_alliance_media(
        &self,
        assets: &dyn AssetStore,
    ) -> Result<usize, StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        let at = now(&mut tx).await?;
        sqlx::query("UPDATE alliance_media SET state='deleting',deleted_at=$1 WHERE state='reserved' AND expires_at<=$1").bind(at).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        // Page retained tombstones without retaining an unbounded in-memory list.
        let mut count = 0;
        let mut after = Uuid::nil();
        loop {
            let rows=sqlx::query("SELECT * FROM alliance_media WHERE state IN ('deleting','deleted') AND id>$1 ORDER BY id LIMIT 100").bind(after).fetch_all(self.read_pool()?).await.map_err(db_error)?;
            if rows.is_empty() {
                break;
            }
            for row in rows {
                let m = record(row)?;
                after = m.id;
                assets
                    .delete(&m.key())
                    .await
                    .map_err(|_| StoreError::Unavailable)?;
                sqlx::query("UPDATE alliance_media SET state='deleted' WHERE id=$1 AND state IN ('deleting','deleted')").bind(m.id).execute(self.admission_pool()?).await.map_err(db_error)?;
                count += 1;
            }
        }
        Ok(count)
    }
}

//! Transactional delivery obligations reference receipts; they never copy game views.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use std::collections::BTreeSet;

fn prefix(b: Binding) -> String {
    format!(
        "{}:{}:{}:",
        b.universe.0.simple(),
        b.epoch.0.simple(),
        b.player.0.simple()
    )
}
fn cursor(b: Binding, position: i64) -> String {
    format!("{}{position}", prefix(b))
}
fn position(b: Binding, text: &str) -> Option<i64> {
    if text.len() > 160 {
        return None;
    }
    let value = text.strip_prefix(&prefix(b))?;
    let position = value.parse::<i64>().ok()?;
    (position >= 0 && position.to_string() == value).then_some(position)
}
fn reset(b: Binding, head: i64) -> UpdatePage {
    UpdatePage {
        items: vec![GameUpdate {
            binding: b,
            cursor: Some(cursor(b, head)),
            event: StreamEvent::Reset,
        }],
        has_more: false,
    }
}
impl UpdateStore for PgStore {
    fn watch_updates(&self, binding: Binding) -> Result<Box<dyn UpdateWatcher>, StoreError> {
        Ok(self.update_hub.subscribe(binding))
    }
    async fn read_updates(
        &self,
        b: Binding,
        after: Option<&str>,
        limit: u32,
    ) -> Result<UpdatePage, StoreError> {
        if !(1..=128).contains(&limit) {
            return Err(StoreError::Conflict);
        }
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let head: Option<i64> = sqlx::query_scalar(
            "SELECT position FROM game_update_heads WHERE universe=$1 AND epoch=$2 AND player=$3",
        )
        .bind(b.universe.0)
        .bind(b.epoch.0)
        .bind(b.player.0)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?;
        let head = head.unwrap_or(0);
        let Some(after) = after
            .and_then(|value| position(b, value))
            .filter(|value| *value <= head)
        else {
            return Ok(reset(b, head));
        };
        let oldest: Option<i64> = sqlx::query_scalar(
            "SELECT min(position) FROM game_updates WHERE universe=$1 AND epoch=$2 AND player=$3",
        )
        .bind(b.universe.0)
        .bind(b.epoch.0)
        .bind(b.player.0)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        if after < head && oldest.is_none_or(|oldest| after < oldest - 1) {
            return Ok(reset(b, head));
        }
        let mut rows=sqlx::query("SELECT d.position,d.kind,d.minimum_revision,greatest(0,floor(extract(epoch FROM (clock_timestamp()-d.created_at))*1000000))::bigint AS delivery_us,c.receipt,c.input->>'protocol' AS protocol FROM game_updates d LEFT JOIN commands c ON d.kind='outcome' AND c.universe=d.universe AND c.epoch=d.epoch AND c.actor=d.player AND c.input_id=d.input_id WHERE d.universe=$1 AND d.epoch=$2 AND d.player=$3 AND d.position>$4 ORDER BY d.position LIMIT $5")
            .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(after).bind(i64::from(limit)+1).fetch_all(&mut *tx).await.map_err(db_error)?;
        let has_more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let mut items = Vec::new();
        for row in rows {
            self.observer.duration(
                RuntimeStage::Delivery,
                std::time::Duration::from_micros(
                    row.try_get::<i64, _>("delivery_us").map_err(db_error)? as u64,
                ),
            );
            let event = match row.try_get::<String, _>("kind").map_err(db_error)?.as_str() {
                "outcome" => {
                    let receipt: Receipt = decode(row.try_get("receipt").map_err(db_error)?)?;
                    let mut receipt = BoundReceipt::new(b, receipt);
                    receipt.protocol = row
                        .try_get::<String, _>("protocol")
                        .map_err(db_error)?
                        .parse()
                        .map_err(|_| StoreError::CorruptData)?;
                    StreamEvent::Outcome { receipt }
                }
                "invalidate" => StreamEvent::Invalidate {
                    minimum_viewer_revision: row
                        .try_get::<i64, _>("minimum_revision")
                        .map_err(db_error)?
                        .to_string(),
                },
                _ => return Err(StoreError::CorruptData),
            };
            items.push(GameUpdate {
                binding: b,
                cursor: Some(cursor(b, row.try_get("position").map_err(db_error)?)),
                event,
            });
        }
        // Keep all outcomes and the last invalidation. Its revision covers prior
        // invalidations in this recipient's ordered publication stream.
        let last = items
            .iter()
            .rposition(|item| matches!(item.event, StreamEvent::Invalidate { .. }));
        let items = items
            .into_iter()
            .enumerate()
            .filter_map(|(i, item)| {
                (!matches!(item.event, StreamEvent::Invalidate { .. }) || Some(i) == last)
                    .then_some(item)
            })
            .collect();
        tx.commit().await.map_err(db_error)?;
        Ok(UpdatePage { items, has_more })
    }
}
pub(crate) async fn append_updates(
    tx: &mut Tx<'_>,
    input: &OrderedInput,
    receipt: Option<&Receipt>,
    viewers: &BTreeSet<PlayerId>,
) -> Result<(), StoreError> {
    let mut recipients = viewers.clone();
    if let (Actor::Player(player), Some(_)) = (input.actor, receipt) {
        recipients.insert(player);
    }
    for player in recipients {
        sqlx::query("INSERT INTO game_update_heads(universe,epoch,player) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
            .bind(input.universe.0).bind(input.epoch.0).bind(player.0).execute(&mut **tx).await.map_err(db_error)?;
        let mut position:i64=sqlx::query_scalar("SELECT position FROM game_update_heads WHERE universe=$1 AND epoch=$2 AND player=$3 FOR UPDATE")
            .bind(input.universe.0).bind(input.epoch.0).bind(player.0).fetch_one(&mut **tx).await.map_err(db_error)?;
        let mut kinds = Vec::new();
        if input.actor == Actor::Player(player) && receipt.is_some() {
            kinds.push(("outcome", None));
        }
        if viewers.contains(&player) {
            let revision: i64 = sqlx::query_scalar(
                "SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2",
            )
            .bind(input.universe.0)
            .bind(player.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
            kinds.push(("invalidate", Some(revision)));
        }
        for (kind, revision) in kinds {
            let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM game_updates WHERE universe=$1 AND epoch=$2 AND player=$3 AND input_id=$4 AND kind=$5)")
                .bind(input.universe.0).bind(input.epoch.0).bind(player.0).bind(input.id.0).bind(kind).fetch_one(&mut **tx).await.map_err(db_error)?;
            if exists {
                continue;
            }
            position = position.checked_add(1).ok_or(StoreError::CorruptData)?;
            sqlx::query("INSERT INTO game_updates(universe,epoch,player,position,input_id,kind,minimum_revision) VALUES($1,$2,$3,$4,$5,$6,$7)")
                .bind(input.universe.0).bind(input.epoch.0).bind(player.0).bind(position).bind(input.id.0).bind(kind).bind(revision).execute(&mut **tx).await.map_err(db_error)?;
        }
        sqlx::query(
            "UPDATE game_update_heads SET position=$4 WHERE universe=$1 AND epoch=$2 AND player=$3",
        )
        .bind(input.universe.0)
        .bind(input.epoch.0)
        .bind(player.0)
        .bind(position)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        sqlx::query("SELECT pg_notify('orbit_game_updates',$1)")
            .bind(format!("{}.{}.{}", input.universe, input.epoch, player))
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    Ok(())
}
pub(crate) async fn append_configuration_updates(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    revision: i64,
) -> Result<(), StoreError> {
    let input_id = derived_id(InputId(u.0), &format!("rules:{revision}"));
    sqlx::query("INSERT INTO game_update_heads(universe,epoch,player) SELECT universe,$2,player FROM viewer_heads WHERE universe=$1 ON CONFLICT DO NOTHING")
        .bind(u.0).bind(epoch.0).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("WITH published AS (UPDATE game_update_heads SET position=position+1 WHERE universe=$1 AND epoch=$2 RETURNING player,position) INSERT INTO game_updates(universe,epoch,player,position,input_id,kind,minimum_revision) SELECT $1,$2,p.player,p.position,$3,'invalidate',v.revision FROM published p JOIN viewer_heads v ON v.universe=$1 AND v.player=p.player")
        .bind(u.0).bind(epoch.0).bind(input_id).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("SELECT pg_notify('orbit_game_updates',$1)")
        .bind(format!("{u}.{epoch}.*"))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
impl PgStore {
    /// Retention does not affect receipts or idempotency. Readers detect a gap and reset.
    pub async fn prune_game_updates(&self) -> Result<u64, StoreError> {
        Ok(sqlx::query("DELETE FROM game_updates WHERE ctid IN (SELECT ctid FROM game_updates WHERE created_at<clock_timestamp()-interval '7 days' ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED)")
            .execute(self.worker_pool()?).await.map_err(db_error)?.rows_affected())
    }
}

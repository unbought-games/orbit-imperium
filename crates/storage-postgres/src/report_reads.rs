use crate::{PgStore, db_error};
use orbit_application::*;
use sqlx::Row;

impl PgStore {
    pub(crate) async fn read_report_selection(
        &self,
        q: ReportsReadRequest,
    ) -> Result<ReportsReadResult, StoreError> {
        if !q.valid_size() {
            return Err(StoreError::Conflict);
        }
        let b = q.context.binding;
        let reports: Vec<_> = q
            .reports
            .iter()
            .map(|id| id.0)
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let bot = crate::bots::lock_bot(&mut tx, b.universe, b.player)
            .await?
            .is_some();
        let intent = orbit_engine::hash(&serde_json::json!({"report_read": q})).0;
        if bot && let Some(row) = sqlx::query("SELECT intent_hash,response FROM bot_social_receipts WHERE universe=$1 AND player=$2 AND epoch=$3 AND request_id=$4")
            .bind(b.universe.0).bind(b.player.0).bind(b.epoch.0).bind(q.context.request_id)
            .fetch_optional(&mut *tx).await.map_err(db_error)? {
            if row.try_get::<String, _>("intent_hash").map_err(db_error)? != intent { return Err(StoreError::Conflict); }
            return Ok(row.try_get::<sqlx::types::Json<ReportsReadResult>, _>("response").map_err(db_error)?.0);
        }
        crate::bots::charge(&mut tx, b, "report_read", q.context.request_id, true).await?;
        // Same lock order as report command commits and sharing. Validate the
        // entire selection before changing anything; another recipient's copy
        // of a battle report is never authorized by knowing its ID.
        let owned: Vec<uuid::Uuid> = sqlx::query_scalar("SELECT p.report FROM mission_report_recipients p JOIN mission_reports r ON r.id=p.report WHERE r.universe=$1 AND p.recipient=$2 AND p.report=ANY($3) ORDER BY p.report FOR UPDATE OF p")
            .bind(b.universe.0).bind(b.player.0).bind(&reports)
            .fetch_all(&mut *tx).await.map_err(db_error)?;
        if owned != reports {
            return Err(StoreError::NotFound);
        }
        let changed = sqlx::query("UPDATE mission_report_recipients SET read=true WHERE recipient=$1 AND report=ANY($2) AND NOT read")
            .bind(b.player.0).bind(&reports).execute(&mut *tx).await.map_err(db_error)?.rows_affected();
        let revision: i64 = if changed > 0 {
            let revision = sqlx::query_scalar("UPDATE viewer_heads SET revision=revision+1 WHERE universe=$1 AND player=$2 RETURNING revision")
                .bind(b.universe.0).bind(b.player.0).fetch_one(&mut *tx).await.map_err(db_error)?;
            crate::updates::append_view_invalidation(
                &mut tx, b.universe, b.epoch, b.player, revision,
            )
            .await?;
            revision
        } else {
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(b.universe.0)
                .bind(b.player.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?
        };
        // Return authoritative headers, including other preferences, so delayed
        // responses cannot overwrite newer archive/star/share state in the UI.
        let rows = sqlx::query("SELECT r.id,r.kind,r.at_ms,p.read,p.hidden,p.starred,EXISTS(SELECT 1 FROM mission_report_shares s WHERE s.report=r.id AND s.recipient=p.recipient AND s.epoch=$4) AS shared,COALESCE(ai.identities,'{}'::jsonb) AS alliance_identities,r.data->'payloads'->(p.recipient::text) AS preview_payload FROM mission_reports r JOIN mission_report_recipients p ON p.report=r.id LEFT JOIN mission_report_alliances ai ON ai.report=r.id WHERE r.universe=$1 AND p.recipient=$2 AND r.id=ANY($3) ORDER BY r.id")
            .bind(b.universe.0).bind(b.player.0).bind(&reports).bind(b.epoch.0)
            .fetch_all(&mut *tx).await.map_err(db_error)?;
        let rules = crate::facts::rules(&mut tx, b.universe).await?;
        let items = rows
            .iter()
            .map(|row| crate::world::header(row, &rules))
            .collect::<Result<_, _>>()?;
        let result = ReportsReadResult {
            binding: b,
            request_id: q.context.request_id,
            viewer_revision: revision.to_string(),
            items,
        };
        if bot {
            sqlx::query("INSERT INTO bot_social_receipts(universe,player,epoch,request_id,intent_hash,response) VALUES($1,$2,$3,$4,$5,$6)")
                .bind(b.universe.0).bind(b.player.0).bind(b.epoch.0).bind(q.context.request_id).bind(intent).bind(sqlx::types::Json(&result))
                .execute(&mut *tx).await.map_err(db_error)?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
}

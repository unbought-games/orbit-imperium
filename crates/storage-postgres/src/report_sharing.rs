use crate::{PgStore, db_error};
use orbit_application::*;
use orbit_engine::ReportId;
use sqlx::Row;

impl PgStore {
    pub(crate) async fn manage_report_share(
        &self,
        b: Binding,
        report: ReportId,
        action: ReportShareAction,
    ) -> Result<ReportShareStatus, StoreError> {
        self.manage_report_share_request(
            report,
            ReportShareRequest {
                context: QueryContext {
                    binding: b,
                    request_id: uuid::Uuid::new_v4(),
                },
                action,
            },
        )
        .await
    }
    pub(crate) async fn manage_report_share_request(
        &self,
        report: ReportId,
        q: ReportShareRequest,
    ) -> Result<ReportShareStatus, StoreError> {
        let b = q.context.binding;
        let action = q.action.clone();
        let mut tx = self.admission_pool()?.begin().await.map_err(db_error)?;
        crate::binding::check_read(&mut tx, b).await?;
        let bot = crate::bots::lock_bot(&mut tx, b.universe, b.player)
            .await?
            .is_some();
        let intent = orbit_engine::hash(&serde_json::json!({"report":report,"request":q})).0;
        if bot && !matches!(action, ReportShareAction::Status)
            && let Some(row)=sqlx::query("SELECT intent_hash,response FROM bot_social_receipts WHERE universe=$1 AND player=$2 AND epoch=$3 AND request_id=$4").bind(b.universe.0).bind(b.player.0).bind(b.epoch.0).bind(q.context.request_id).fetch_optional(&mut *tx).await.map_err(db_error)? {
                if row.try_get::<String,_>("intent_hash").map_err(db_error)?!=intent {return Err(StoreError::Conflict);}
                return Ok(row.try_get::<sqlx::types::Json<ReportShareStatus>,_>("response").map_err(db_error)?.0);
        }
        crate::bots::charge(
            &mut tx,
            b,
            "report_share",
            q.context.request_id,
            !matches!(action, ReportShareAction::Status),
        )
        .await?;
        // Serialize creation/revocation with deletion for this recipient. Never use
        // another recipient's observation, even when both received this battle.
        let row = sqlx::query("SELECT r.data->'payloads'->(p.recipient::text) AS payload FROM mission_reports r JOIN mission_report_recipients p ON p.report=r.id WHERE r.universe=$1 AND r.id=$2 AND p.recipient=$3 AND NOT p.hidden FOR UPDATE OF p")
            .bind(b.universe.0).bind(report.0).bind(b.player.0).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        let payload: serde_json::Value = row.try_get("payload").map_err(db_error)?;
        if !shareable_report(&payload) {
            return Err(StoreError::NotFound);
        }
        let mutating = !matches!(action, ReportShareAction::Status);
        match action {
            ReportShareAction::Status => {}
            ReportShareAction::Revoke => {
                sqlx::query("DELETE FROM mission_report_shares WHERE report=$1 AND recipient=$2")
                    .bind(report.0)
                    .bind(b.player.0)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
            }
            ReportShareAction::Create { options } => {
                // The recipient lock is also held by report command commits:
                // publication and protection become visible together.
                sqlx::query("UPDATE mission_report_recipients SET starred=true WHERE report=$1 AND recipient=$2")
                    .bind(report.0).bind(b.player.0).execute(&mut *tx).await.map_err(db_error)?;
                sqlx::query("DELETE FROM mission_report_shares WHERE report=$1 AND recipient=$2 AND epoch<>$3").bind(report.0).bind(b.player.0).bind(b.epoch.0).execute(&mut *tx).await.map_err(db_error)?;
                // Publication is a historical event: record names once. Numbers
                // remain in the immutable recipient observation, not a duplicate.
                let rows: Vec<(uuid::Uuid, String)> = sqlx::query_as("SELECT m.player,a.name FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1 AND (m.player::text IN (SELECT value->>'owner' FROM jsonb_array_elements(COALESCE($2::jsonb->'participants','[]'::jsonb))) OR m.player::text=$2::jsonb->'target'->>'owner')")
                    .bind(b.universe.0).bind(&payload).fetch_all(&mut *tx).await.map_err(db_error)?;
                let names: PublicPlayerNames = rows
                    .into_iter()
                    .map(|(id, name)| (PlayerId(id), name))
                    .collect();
                // Retry-safe while active. Options change only after revoking, so
                // a retry can never silently widen an existing link's disclosure.
                sqlx::query("INSERT INTO mission_report_shares(report,recipient,epoch,token,options,names_at_publication) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(report,recipient) DO NOTHING")
                    .bind(report.0).bind(b.player.0).bind(b.epoch.0).bind(uuid::Uuid::new_v4()).bind(sqlx::types::Json(options)).bind(sqlx::types::Json(names)).execute(&mut *tx).await.map_err(db_error)?;
            }
        }
        let row = sqlx::query("SELECT token,options FROM mission_report_shares WHERE report=$1 AND recipient=$2 AND epoch=$3").bind(report.0).bind(b.player.0).bind(b.epoch.0).fetch_optional(&mut *tx).await.map_err(db_error)?;
        if mutating {
            // Report reads carry this revision, so pre-publication responses cannot
            // overwrite the new star or sharing state in the client.
            sqlx::query(
                "UPDATE viewer_heads SET revision=revision+1 WHERE universe=$1 AND player=$2",
            )
            .bind(b.universe.0)
            .bind(b.player.0)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        }
        let viewer_revision: i64 =
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(b.universe.0)
                .bind(b.player.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        if mutating {
            crate::updates::append_report_share_update(&mut tx, b, viewer_revision).await?;
        }
        let header_row = sqlx::query("SELECT r.id,r.kind,r.at_ms,p.read,p.hidden,p.starred,EXISTS(SELECT 1 FROM mission_report_shares s WHERE s.report=r.id AND s.recipient=p.recipient AND s.epoch=$4) AS shared,COALESCE(ai.identities,'{}'::jsonb) AS alliance_identities,r.data->'payloads'->(p.recipient::text) AS preview_payload FROM mission_reports r JOIN mission_report_recipients p ON p.report=r.id LEFT JOIN mission_report_alliances ai ON ai.report=r.id WHERE r.universe=$1 AND r.id=$2 AND p.recipient=$3")
            .bind(b.universe.0).bind(report.0).bind(b.player.0).bind(b.epoch.0).fetch_one(&mut *tx).await.map_err(db_error)?;
        let rules = crate::facts::rules(&mut tx, b.universe).await?;
        let (token, options) = match row {
            Some(row) => (
                Some(row.try_get("token").map_err(db_error)?),
                Some(
                    row.try_get::<sqlx::types::Json<ReportShareOptions>, _>("options")
                        .map_err(db_error)?
                        .0,
                ),
            ),
            None => (None, None),
        };
        let status = ReportShareStatus {
            token,
            options,
            header: crate::world::header(&header_row, &rules)?,
            viewer_revision: viewer_revision.to_string(),
        };
        if bot && mutating {
            sqlx::query("INSERT INTO bot_social_receipts(universe,player,epoch,request_id,intent_hash,response) VALUES($1,$2,$3,$4,$5,$6)").bind(b.universe.0).bind(b.player.0).bind(b.epoch.0).bind(q.context.request_id).bind(intent).bind(sqlx::types::Json(&status)).execute(&mut *tx).await.map_err(db_error)?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(status)
    }
    pub(crate) async fn read_shared_report(
        &self,
        token: uuid::Uuid,
    ) -> Result<SharedReport, StoreError> {
        let row = sqlx::query("SELECT s.report,s.options,s.names_at_publication,r.at_ms,COALESCE(ai.identities,'{}'::jsonb) AS alliance_identities,r.data->'payloads'->(s.recipient::text) AS payload FROM mission_report_shares s JOIN mission_report_recipients p ON p.report=s.report AND p.recipient=s.recipient JOIN mission_reports r ON r.id=s.report JOIN universes u ON u.id=r.universe AND u.epoch=s.epoch LEFT JOIN mission_report_alliances ai ON ai.report=r.id WHERE s.token=$1 AND NOT p.hidden")
            .bind(token).fetch_optional(self.read_pool()?).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        let mut result = project_shared_report_with_alliances(
            ReportId(row.try_get("report").map_err(db_error)?),
            row.try_get("at_ms").map_err(db_error)?,
            &row.try_get::<serde_json::Value, _>("payload")
                .map_err(db_error)?,
            &row.try_get::<sqlx::types::Json<PublicPlayerNames>, _>("names_at_publication")
                .map_err(db_error)?
                .0,
            &row.try_get::<sqlx::types::Json<PublicPlayerAlliances>, _>("alliance_identities")
                .map_err(db_error)?
                .0,
            row.try_get::<sqlx::types::Json<ReportShareOptions>, _>("options")
                .map_err(db_error)?
                .0,
        )?;
        let players: Vec<uuid::Uuid> = result
            .player_names
            .keys()
            .filter_map(|s| uuid::Uuid::parse_str(s).ok())
            .collect();
        let bots:Vec<uuid::Uuid>=sqlx::query_scalar("SELECT b.player FROM bot_participation b JOIN mission_reports r ON r.universe=b.universe WHERE r.id=$1 AND b.player=ANY($2)").bind(result.report.0).bind(players).fetch_all(self.read_pool()?).await.map_err(db_error)?;
        result.player_kinds = result
            .player_names
            .keys()
            .map(|p| {
                (
                    p.clone(),
                    if bots.iter().any(|b| b.to_string() == *p) {
                        PlayerKind::Bot
                    } else {
                        PlayerKind::Human
                    },
                )
            })
            .collect();
        Ok(result)
    }
}

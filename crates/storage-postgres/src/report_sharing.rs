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
        let mut tx = self.admission_pool()?.begin().await.map_err(db_error)?;
        crate::binding::check_read(&mut tx, b).await?;
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
        tx.commit().await.map_err(db_error)?;
        Ok(status)
    }
    pub(crate) async fn read_shared_report(
        &self,
        token: uuid::Uuid,
    ) -> Result<SharedReport, StoreError> {
        let row = sqlx::query("SELECT s.report,s.options,s.names_at_publication,r.at_ms,COALESCE(ai.identities,'{}'::jsonb) AS alliance_identities,r.data->'payloads'->(s.recipient::text) AS payload FROM mission_report_shares s JOIN mission_report_recipients p ON p.report=s.report AND p.recipient=s.recipient JOIN mission_reports r ON r.id=s.report JOIN universes u ON u.id=r.universe AND u.epoch=s.epoch LEFT JOIN mission_report_alliances ai ON ai.report=r.id WHERE s.token=$1 AND NOT p.hidden")
            .bind(token).fetch_optional(self.read_pool()?).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        project_shared_report_with_alliances(
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
        )
    }
}

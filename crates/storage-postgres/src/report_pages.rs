use crate::{PgStore, db_error};
use orbit_application::*;
use orbit_engine::Ruleset;
use sqlx::Row;

// Metrics are computed from the authorized historical payload and active rules.
// Keep unknown observations last, including unsupported units; never cache values
// that would become stale when universe costs change.
fn metric(sort: ReportSort4) -> String {
    let payload = "r.data->'payloads'->(p.recipient::text)";
    match sort {
        ReportSort4::Newest | ReportSort4::Oldest => "NULL::numeric".into(),
        ReportSort4::Total => format!(
            "CASE WHEN ({payload})->>'kind'='Espionage' AND ({payload})->'resources'->>'visibility'='Known' THEN (({payload})->'resources'->'value'->>'metal')::numeric + (({payload})->'resources'->'value'->>'crystal')::numeric + (({payload})->'resources'->'value'->>'deuterium')::numeric END"
        ),
        ReportSort4::Fleet | ReportSort4::Defenses => {
            let section = if sort == ReportSort4::Fleet {
                "fleet"
            } else {
                "defenses"
            };
            let count = "CASE WHEN jsonb_typeof(unit->'count')='string' AND unit->>'count' ~ '^[0-9]+$' THEN (unit->>'count')::numeric END";
            let total = format!("COALESCE(sum(({count}) * (c.value->>'cost')::numeric),0)");
            format!(
                "CASE WHEN ({payload})->>'kind'='Espionage' AND ({payload})->'{section}'->>'visibility'='Known' AND jsonb_typeof(({payload})->'{section}'->'value')='array' AND jsonb_typeof($10::jsonb)='array' THEN (SELECT CASE WHEN COALESCE(bool_and(c.value IS NOT NULL AND (({count}) BETWEEN 0 AND 9223372036854775807) IS TRUE),true) AND {total} <= 170141183460469231731687303715884105727 THEN {total} END FROM jsonb_array_elements(({payload})->'{section}'->'value') unit LEFT JOIN jsonb_array_elements($10::jsonb) c(value) ON c.value->'item'=unit->'item') END"
            )
        }
    }
}
fn costs(rules: &Ruleset) -> serde_json::Value {
    rules
        .artifact
        .progression
        .as_ref()
        .map(|p| {
            serde_json::Value::Array(
                p.unit_costs
                    .iter()
                    .map(|c| {
                        let value: i128 = c.cost.values().into_iter().map(i128::from).sum();
                        serde_json::json!({"item":c.item,"cost":(value * 1_000_000).to_string()})
                    })
                    .collect(),
            )
        })
        .unwrap_or(serde_json::Value::Null)
}

impl PgStore {
    pub(crate) async fn report_page(
        &self,
        q: ReportsQuery4,
    ) -> Result<ReadSnapshot<(ReportsPage4, i64)>, StoreError> {
        if !(1..=100).contains(&q.limit) {
            return Err(StoreError::Conflict);
        }
        let b = q.context.binding;
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        crate::bots::observe(&mut tx, b).await?;
        let at = crate::snapshots::safe_time(&mut tx, b.universe, b.player).await?;
        let head: i64 = sqlx::query_scalar(
            "SELECT revision FROM mission_report_heads WHERE universe=$1 AND recipient=$2",
        )
        .bind(b.universe.0)
        .bind(b.player.0)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let (cut, last_at, last_id, last_value) = if let Some(cursor) = &q.cursor {
            let token = uuid::Uuid::parse_str(cursor).map_err(|_| StoreError::InvalidCursor)?;
            let row = sqlx::query("SELECT cut,last_at,last_id,last_value FROM mission_report_cursors WHERE token=$1 AND binding=$2 AND kind IS NOT DISTINCT FROM $3 AND include_hidden=$4 AND filters=$5")
                .bind(token).bind(sqlx::types::Json(b)).bind(&q.kind).bind(q.include_hidden).bind(sqlx::types::Json(&q.filter))
                .fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::InvalidCursor)?;
            (
                row.try_get("cut").map_err(db_error)?,
                Some(row.try_get::<i64, _>("last_at").map_err(db_error)?),
                Some(row.try_get::<uuid::Uuid, _>("last_id").map_err(db_error)?),
                row.try_get::<Option<String>, _>("last_value")
                    .map_err(db_error)?,
            )
        } else {
            (head, None, None, None)
        };
        let hidden = q
            .filter
            .hidden
            .or(if q.include_hidden { None } else { Some(false) });
        let rules = crate::facts::rules(&mut tx, b.universe).await?;
        let (order, continuation) = match q.filter.sort {
            ReportSort4::Newest => ("at_ms DESC,id DESC", "(at_ms,id)<($6,$7)"),
            ReportSort4::Oldest => ("at_ms ASC,id DESC", "(at_ms>$6 OR (at_ms=$6 AND id<$7))"),
            _ => (
                "value DESC NULLS LAST,at_ms DESC,id DESC",
                "(value < $9::text::numeric OR (value IS NULL AND $9::text::numeric IS NOT NULL) OR (value IS NOT DISTINCT FROM $9::text::numeric AND (at_ms,id)<($6,$7)))",
            ),
        };
        // Materialize only recipient keys first. Sorting must not scan every other
        // player's reports, or build previews for rows outside the requested page.
        let sql = format!("WITH recipients AS MATERIALIZED (
            SELECT report,recipient,read,hidden,starred FROM mission_report_recipients
            WHERE recipient=$2 AND created_revision<=$3 AND ($5::boolean IS NULL OR hidden=$5) {} {}
        ), candidates AS (
            SELECT r.id,r.kind,r.at_ms,p.read,p.hidden,p.starred,{} AS value
            FROM recipients p JOIN mission_reports r ON r.id=p.report
            WHERE r.universe=$1 AND ($4::text IS NULL OR r.kind=$4)
        ), page AS MATERIALIZED (
            SELECT * FROM candidates WHERE ($6::bigint IS NULL OR {continuation})
            ORDER BY {order} LIMIT $8
        ) SELECT page.*,page.value::text AS cursor_value,
            EXISTS(SELECT 1 FROM mission_report_shares s WHERE s.report=page.id AND s.recipient=$2 AND s.epoch=(SELECT epoch FROM universes WHERE id=$1)) AS shared,
            COALESCE(ai.identities,'{{}}'::jsonb) AS alliance_identities,
            r.data->'payloads'->($2::uuid::text) AS preview_payload
        FROM page JOIN mission_reports r ON r.id=page.id
        LEFT JOIN mission_report_alliances ai ON ai.report=page.id
        ORDER BY {}",
            if q.filter.unread_only { "AND NOT read" } else { "" },
            if q.filter.starred_only { "AND starred" } else { "" },
            metric(q.filter.sort), order.split(',').map(|v| format!("page.{v}")).collect::<Vec<_>>().join(","));
        let mut query = sqlx::query(&sql)
            .bind(b.universe.0)
            .bind(b.player.0)
            .bind(cut)
            .bind(&q.kind)
            .bind(hidden)
            .bind(last_at)
            .bind(last_id)
            .bind(i64::from(q.limit) + 1);
        if !matches!(q.filter.sort, ReportSort4::Newest | ReportSort4::Oldest) {
            query = query.bind(&last_value);
        }
        if matches!(q.filter.sort, ReportSort4::Fleet | ReportSort4::Defenses) {
            query = query.bind(costs(&rules));
        }
        let rows = query.fetch_all(&mut *tx).await.map_err(db_error)?;
        let has_more = rows.len() > q.limit as usize;
        let items = rows
            .iter()
            .take(q.limit as usize)
            .map(|row| crate::world::header(row, &rules))
            .collect::<Result<Vec<_>, _>>()?;
        let unread_count: i64 = sqlx::query_scalar("SELECT count(*) FROM (SELECT 1 FROM mission_report_recipients p JOIN mission_reports r ON r.id=p.report WHERE p.recipient=$1 AND NOT p.hidden AND NOT p.read AND r.universe=$2 LIMIT 99) unread")
            .bind(b.player.0).bind(b.universe.0).fetch_one(&mut *tx).await.map_err(db_error)?;
        let cursor_record = if has_more {
            let last = items.last().ok_or(StoreError::CorruptData)?;
            Some((
                uuid::Uuid::new_v4(),
                last.observed_at,
                last.id,
                rows[items.len() - 1]
                    .try_get::<Option<String>, _>("cursor_value")
                    .map_err(db_error)?,
            ))
        } else {
            None
        };
        let rev =
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(b.universe.0)
                .bind(b.player.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        let snapshot = crate::snapshots::wrap(
            &mut tx,
            b.universe,
            b.player,
            (
                ReportsPage4 {
                    unread_count: unread_count as u32,
                    player_names: Default::default(),
                    items,
                    next_cursor: cursor_record.as_ref().map(|c| c.0.to_string()),
                    has_more,
                    as_of_ms: at,
                },
                rev,
            ),
        )
        .await?;
        tx.commit().await.map_err(db_error)?;
        if let Some((token, last_at, last_id, last_value)) = cursor_record {
            sqlx::query("INSERT INTO mission_report_cursors(token,binding,kind,include_hidden,cut,last_at,last_id,filters,last_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
                .bind(token).bind(sqlx::types::Json(b)).bind(&q.kind).bind(q.include_hidden).bind(cut).bind(last_at).bind(last_id.0)
                .bind(sqlx::types::Json(q.filter)).bind(last_value).execute(self.read_pool()?).await.map_err(db_error)?;
        }
        Ok(snapshot)
    }
}

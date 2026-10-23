use crate::*;
use orbit_application::AccountId;
use serde_json::{Value, json};
use sqlx::Row;

impl PgStore {
    /// Snapshot retained authoritative facts and journey together, before remote delivery.
    /// Callers supply an authenticated account; browsers never supply subjects or players.
    pub async fn capture_analytics(
        &self,
        account: AccountId,
        subject: Value,
        config: &Value,
        journey: &Value,
    ) -> Result<uuid::Uuid, StoreError> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("SET LOCAL lock_timeout='1s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("analytics:{}", account.0))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let count:i64=sqlx::query_scalar("SELECT count(*) FROM analytics_delivery WHERE account=$1 AND created_at>now()-interval '1 day'").bind(account.0).fetch_one(&mut *tx).await.map_err(db_error)?;
        if count >= 200 {
            return Err(StoreError::Unavailable);
        }
        let now:String=sqlx::query_scalar("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')").fetch_one(&mut *tx).await.map_err(db_error)?;
        let property = config["propertyId"]
            .as_str()
            .ok_or(StoreError::CorruptData)?;
        let mut facts = vec![(
            format!(
                "{property}:visit:{}:{}:{}",
                account.0,
                journey["visit_id"].as_str().unwrap_or(""),
                journey["visitor_id"].as_str().unwrap_or("")
            ),
            "account_authenticated",
            "custom",
            now,
            json!({}),
        )];
        let members=sqlx::query("SELECT universe,player,to_char(to_timestamp(joined_at_ms/1000.0) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS joined FROM universe_memberships WHERE account=$1 AND joined_at_ms IS NOT NULL ORDER BY universe").bind(account.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        for m in members {
            let world: uuid::Uuid = m.get("universe");
            let player: uuid::Uuid = m.get("player");
            facts.push((format!("{property}:enrollment:{world}:{player}"),"universe_enrolled","enrollment",m.get::<String,_>("joined"),json!({"target_namespace":"orbit_player","target_id":player.to_string(),"world":world.to_string()})));
        }
        let mut evidence = uuid::Uuid::nil();
        for (key, name, category, at, properties) in facts {
            let id = uuid::Uuid::new_v4();
            let payload = json!({"event_id":id,"property_id":property,"name":name,"schema_version":1,"producer":"server","category":category,"occurred_at":at,"clock":"server","visit_id":journey["visit_id"],"visitor_id":journey["visitor_id"],"subject":subject,"context":{"environment":config["environment"]},"collection":{"profile":"identified","policy_version":config["policyVersion"],"consent":true,"sample_rate":1,"dropped_events":0},"properties":properties});
            let saved:uuid::Uuid=sqlx::query_scalar("INSERT INTO analytics_delivery(event_id,fact_key,account,payload) VALUES($1,$2,$3,$4) ON CONFLICT(fact_key) DO UPDATE SET fact_key=excluded.fact_key RETURNING event_id").bind(id).bind(key).bind(account.0).bind(payload).fetch_one(&mut *tx).await.map_err(db_error)?;
            if category == "custom" {
                evidence = saved;
            }
        }
        tx.commit().await.map_err(db_error)?;
        Ok(evidence)
    }
    pub async fn claim_analytics(&self) -> Result<Vec<Value>, StoreError> {
        sqlx::query("WITH doomed AS (SELECT event_id,state,created_at FROM analytics_delivery
 WHERE created_at < now()-interval '90 days' AND payload->>'category'='custom'
 ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED),
 gap AS (INSERT INTO analytics_coverage_gaps(events,oldest,newest,reason)
 SELECT count(*),min(created_at),max(created_at),'source_retention_without_ack' FROM doomed WHERE state<>'delivered' HAVING count(*)>0)
 DELETE FROM analytics_delivery d USING doomed WHERE d.event_id=doomed.event_id").execute(&self.pool).await.map_err(db_error)?;
        sqlx::query_scalar("WITH picked AS (SELECT event_id FROM analytics_delivery WHERE state='pending' AND retry_at<=now() ORDER BY created_at,event_id FOR UPDATE SKIP LOCKED LIMIT 20) UPDATE analytics_delivery d SET retry_at=now()+interval '30 seconds',attempts=attempts+1 FROM picked WHERE d.event_id=picked.event_id RETURNING d.payload").fetch_all(&self.pool).await.map_err(db_error)
    }
    pub async fn acknowledge_analytics(
        &self,
        id: uuid::Uuid,
        state: &str,
        reason: Option<&str>,
    ) -> Result<(), StoreError> {
        if !["delivered", "quarantined"].contains(&state) {
            return Err(StoreError::CorruptData);
        }
        sqlx::query("UPDATE analytics_delivery SET state=$2,reason=$3,acknowledged_at=now() WHERE event_id=$1").bind(id).bind(state).bind(reason).execute(&self.pool).await.map_err(db_error)?;
        Ok(())
    }
    pub async fn analytics_delivered(&self, id: uuid::Uuid) -> Result<bool, StoreError> {
        sqlx::query_scalar("SELECT state='delivered' FROM analytics_delivery WHERE event_id=$1")
            .bind(id)
            .fetch_one(&self.pool)
            .await
            .map_err(db_error)
    }
}

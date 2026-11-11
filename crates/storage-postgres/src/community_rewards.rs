//! Durable evidence and delivery receipts. No remote work inside these transactions.
use crate::{ordering::Tx, *};
use orbit_application::*;
use orbit_engine::*;
use serde_json::{Value, json};
use sqlx::Row;

const SNAPSHOT_RECIPIENTS: &str = r#"
SELECT jsonb_build_object('subject',i.subject,
    'joined_at',to_char(to_timestamp(h.joined_at::double precision/1000) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'last_qualifying_date',to_char(max(p.date),'YYYY-MM-DD'))
FROM jsonb_to_recordset($3::jsonb) AS h(player uuid,joined_at bigint)
JOIN empire_profiles e ON e.player=h.player
JOIN orbit_profiles o ON o.id=e.profile
JOIN oidc_identity i ON i.account=o.account AND i.issuer=$1
JOIN community_participation p ON p.account=o.account
    AND p.recorded_at<=$2::text::timestamptz
    AND p.date>(($2::text::timestamptz-interval '30 days') AT TIME ZONE 'UTC')::date
WHERE NOT EXISTS(SELECT 1 FROM bot_participation b WHERE b.account=o.account)
GROUP BY i.subject,h.joined_at ORDER BY i.subject LIMIT 1001
"#;

async fn utc_now(tx: &mut Tx<'_>) -> Result<(String, String), StoreError> {
    sqlx::query_as("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD')")
        .fetch_one(&mut **tx).await.map_err(db_error)
}
async fn enqueue(
    tx: &mut Tx<'_>,
    account: AccountId,
    key: &str,
    kind: &str,
    at: &str,
    payload: Value,
) -> Result<(), StoreError> {
    sqlx::query("INSERT INTO community_outbox(account,fact_key,kind,occurred_at,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(fact_key) DO NOTHING")
        .bind(account.0).bind(key).bind(kind).bind(at).bind(payload).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
async fn human_account(tx: &mut Tx<'_>, player: PlayerId) -> Result<Option<AccountId>, StoreError> {
    let id: Option<uuid::Uuid> = sqlx::query_scalar("SELECT p.account FROM empire_profiles e JOIN orbit_profiles p ON p.id=e.profile WHERE e.player=$1 AND p.account IS NOT NULL AND EXISTS(SELECT 1 FROM oidc_identity i WHERE i.account=p.account) AND NOT EXISTS(SELECT 1 FROM bot_participation b WHERE b.account=p.account)")
        .bind(player.0).fetch_optional(&mut **tx).await.map_err(db_error)?;
    Ok(id.map(AccountId))
}
/// The earliest retained join includes removed empires. Unknown older dates block
/// new-player classification; they are not replaced by the most recent empire.
pub(crate) async fn capture_first_join(
    tx: &mut Tx<'_>,
    account: AccountId,
    historical: bool,
) -> Result<(), StoreError> {
    let row = sqlx::query("SELECT count(*) AS empires,min(e.joined_at) AS first_at,count(*) FILTER(WHERE e.joined_at IS NULL) AS unknown FROM empire_profiles e JOIN orbit_profiles p ON p.id=e.profile WHERE p.account=$1 AND EXISTS(SELECT 1 FROM oidc_identity i WHERE i.account=p.account) AND NOT EXISTS(SELECT 1 FROM bot_participation b WHERE b.account=p.account)")
        .bind(account.0).fetch_one(&mut **tx).await.map_err(db_error)?;
    let first: Option<i64> = row.try_get("first_at").map_err(db_error)?;
    let unknown: i64 = row.try_get("unknown").map_err(db_error)?;
    let historical = historical || row.try_get::<i64, _>("empires").map_err(db_error)? > 1;
    if unknown > 0 {
        let at: String=sqlx::query_scalar("SELECT to_char(installed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM community_evidence_installation WHERE singleton")
            .fetch_one(&mut **tx).await.map_err(db_error)?;
        let key = format!("established:{}", account.0);
        enqueue(
            tx,
            account,
            &key,
            "established_player",
            &at,
            json!({"existed_before":at,"evidence_ref":key}),
        )
        .await?;
    }
    if let Some(first) = first.filter(|_| unknown == 0) {
        let at: String = sqlx::query_scalar("SELECT to_char(to_timestamp($1::double precision/1000) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
            .bind(first).fetch_one(&mut **tx).await.map_err(db_error)?;
        let key = format!("join:{}", account.0);
        enqueue(
            tx,
            account,
            &key,
            "first_join",
            &at,
            json!({"joined_at":at,"historical":historical,"evidence_ref":key}),
        )
        .await?;
    }
    Ok(())
}
pub(crate) async fn capture_command(
    tx: &mut Tx<'_>,
    input: &OrderedInput,
) -> Result<(), StoreError> {
    if !qualifying_command(&input.payload) {
        return Ok(());
    }
    let Actor::Player(player) = input.actor else {
        return Ok(());
    };
    let Some(account) = human_account(tx, player).await? else {
        return Ok(());
    };
    let (at, date): (String,String) = sqlx::query_as("SELECT to_char(to_timestamp($1::double precision/1000) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),to_char(to_timestamp($1::double precision/1000) AT TIME ZONE 'UTC','YYYY-MM-DD')")
        .bind(input.at).fetch_one(&mut **tx).await.map_err(db_error)?;
    capture_first_join(tx, account, true).await?;
    sqlx::query("INSERT INTO community_participation(account,universe,epoch,player,date,input_id,recorded_at) VALUES($1,$2,$3,$4,$5::text::date,$6,to_timestamp($7::double precision/1000)) ON CONFLICT DO NOTHING")
        .bind(account.0).bind(input.universe.0).bind(input.epoch.0).bind(player.0).bind(&date).bind(input.id.0).bind(input.at).execute(&mut **tx).await.map_err(db_error)?;
    let key = format!("day:{}:{date}", account.0);
    enqueue(
        tx,
        account,
        &key,
        "qualifying_day",
        &at,
        json!({"date":date,"evidence_ref":input.id.to_string()}),
    )
    .await
}
pub(crate) async fn capture_onboarding(
    tx: &mut Tx<'_>,
    run: &ObjectiveRun,
) -> Result<(), StoreError> {
    // The pinned briefing program must have a durable receipt for every objective.
    if !community_onboarding_complete(&run.program, |id| run.receipts.contains_key(id)) {
        return Ok(());
    }
    let Some(account) = human_account(tx, run.beneficiary).await? else {
        return Ok(());
    };
    let (at, _) = utc_now(tx).await?;
    let key = format!("onboarding:{}", account.0);
    enqueue(
        tx,
        account,
        &key,
        "onboarding_completed",
        &at,
        json!({"completed_at":at,"evidence_ref":run.id.to_string()}),
    )
    .await
}

impl PgStore {
    pub async fn community_capture_history(&self, account: AccountId) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        capture_first_join(&mut tx, account, true).await?;
        tx.commit().await.map_err(db_error)
    }
    /// Each lease is fenced. Subjects are resolved from the currently linked exact
    /// issuer, never inferred from the local UUID or a public display name.
    pub async fn claim_community_events(&self, issuer: &str) -> Result<Vec<Value>, StoreError> {
        let rows = sqlx::query("WITH picked AS (SELECT o.id FROM community_outbox o JOIN oidc_identity i ON i.account=o.account AND i.issuer=$1 WHERE o.state='pending' AND o.retry_at<=now() ORDER BY o.created_at,o.id LIMIT 100 FOR UPDATE OF o SKIP LOCKED) UPDATE community_outbox o SET attempts=LEAST(o.attempts+1,1000000),lease=gen_random_uuid(),retry_at=now()+make_interval(secs=>LEAST(3600,5*power(2,LEAST(o.attempts,10)))::integer) FROM picked,oidc_identity i WHERE o.id=picked.id AND i.account=o.account AND i.issuer=$1 RETURNING o.id,o.lease,o.kind,o.occurred_at,o.payload,i.subject")
            .bind(issuer).fetch_all(&self.pool).await.map_err(db_error)?;
        rows.into_iter().map(|r| Ok(json!({"id":r.try_get::<uuid::Uuid,_>("id").map_err(db_error)?,"lease":r.try_get::<uuid::Uuid,_>("lease").map_err(db_error)?,"subject":r.try_get::<String,_>("subject").map_err(db_error)?,"kind":r.try_get::<String,_>("kind").map_err(db_error)?,"occurred_at":r.try_get::<String,_>("occurred_at").map_err(db_error)?,"payload":r.try_get::<Value,_>("payload").map_err(db_error)?}))).collect()
    }
    pub async fn acknowledge_community_event(
        &self,
        id: uuid::Uuid,
        lease: uuid::Uuid,
        rejected: bool,
        code: Option<&str>,
    ) -> Result<(), StoreError> {
        let safe_code = code.filter(|s| {
            s.len() <= 100
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        });
        sqlx::query("UPDATE community_outbox SET state=$3,reason=$4,acknowledged_at=now(),lease=NULL WHERE id=$1 AND lease=$2 AND state='pending'")
            .bind(id).bind(lease).bind(if rejected {"quarantined"} else {"delivered"}).bind(safe_code).execute(&self.pool).await.map_err(db_error)?;
        Ok(())
    }
    pub async fn deliver_community_award(
        &self,
        issuer: &str,
        award: &CommunityDelivery,
    ) -> Result<(), StoreError> {
        if !award.supported() {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        let account: Option<uuid::Uuid> = sqlx::query_scalar("SELECT i.account FROM oidc_identity i WHERE i.issuer=$1 AND i.subject=$2 AND NOT EXISTS(SELECT 1 FROM bot_participation b WHERE b.account=i.account) FOR SHARE")
            .bind(issuer).bind(&award.subject).fetch_optional(&mut *tx).await.map_err(db_error)?;
        let account = AccountId(account.ok_or(StoreError::NotFound)?);
        let source = award.grant_award_id.as_deref().unwrap_or(&award.award_id);
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,44))")
            .bind(format!("community-award-source:{source}"))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let tombstone:Option<(uuid::Uuid,String,String)>=sqlx::query_as("SELECT account,kind,item_id FROM cosmetic_grant_sources WHERE source=$1 AND revocation_id IS NOT NULL")
            .bind(source).fetch_optional(&mut *tx).await.map_err(db_error)?;
        if tombstone.is_some_and(|(owner, kind, item)| {
            owner != account.0 || kind != award.grant_kind() || item != award.item_id
        }) {
            return Err(StoreError::Conflict);
        }
        let award_payload = serde_json::to_value(award).map_err(|_| StoreError::CorruptData)?;
        sqlx::query("INSERT INTO community_award_receipts(award_id,account,award_payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
            .bind(&award.award_id).bind(account.0).bind(&award_payload).execute(&mut *tx).await.map_err(db_error)?;
        let saved: (uuid::Uuid, Value) = sqlx::query_as("SELECT account,award_payload FROM community_award_receipts WHERE award_id=$1 FOR UPDATE")
            .bind(&award.award_id).fetch_one(&mut *tx).await.map_err(db_error)?;
        if saved != (account.0, award_payload) {
            return Err(StoreError::Conflict);
        }
        match award.operation {
            DeliveryOperation::Grant => {
                grant_cosmetic(
                    &mut tx,
                    account,
                    award.grant_kind(),
                    &award.item_id,
                    &award.award_id,
                    &format!(
                        "Community award {} / {}",
                        award.source_id, award.rule_version
                    ),
                )
                .await?
            }
            DeliveryOperation::Revoke => {
                let source = award.grant_award_id.as_ref().ok_or(StoreError::Conflict)?;
                crate::empire_identity::lock_cosmetic_source(
                    &mut tx,
                    account,
                    award.grant_kind(),
                    &award.item_id,
                )
                .await?;
                let original: Option<(uuid::Uuid, Value)> = sqlx::query_as(
                    "SELECT account,award_payload FROM community_award_receipts WHERE award_id=$1",
                )
                .bind(source)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?;
                if original.is_some_and(|(owner, auth)| {
                    owner != account.0
                        || auth["item_id"] != award.item_id
                        || auth["kind"] != award.kind
                        || auth["operation"] == "revoke"
                }) {
                    return Err(StoreError::Conflict);
                }
                sqlx::query("INSERT INTO cosmetic_grant_sources(account,kind,item_id,source,reason,granted_at,revoked_at,revocation_id) VALUES($1,$2,$3,$4,$5,NULL,now(),$6) ON CONFLICT(account,kind,item_id,source) DO UPDATE SET revoked_at=COALESCE(cosmetic_grant_sources.revoked_at,excluded.revoked_at),revocation_id=COALESCE(cosmetic_grant_sources.revocation_id,excluded.revocation_id)")
                    .bind(account.0).bind(award.grant_kind()).bind(&award.item_id).bind(source).bind(format!("Revoked source: {}",award.source_id)).bind(&award.award_id).execute(&mut *tx).await.map_err(db_error)?;
                sqlx::query("DELETE FROM cosmetic_grants WHERE account=$1 AND kind=$2 AND item_id=$3 AND NOT EXISTS(SELECT 1 FROM cosmetic_grant_sources s WHERE s.account=$1 AND s.kind=$2 AND s.item_id=$3 AND s.revoked_at IS NULL AND s.granted_at IS NOT NULL)")
                    .bind(account.0).bind(award.grant_kind()).bind(&award.item_id).execute(&mut *tx).await.map_err(db_error)?;
            }
        }
        tx.commit().await.map_err(db_error)
    }
    pub async fn community_pending_receipts(&self) -> Result<Vec<Value>, StoreError> {
        sqlx::query_scalar("SELECT jsonb_build_object('award_id',award_id,'status','delivered','item_id',award_payload->>'item_id') FROM community_award_receipts WHERE acknowledged_at IS NULL ORDER BY granted_at,award_id LIMIT 100")
            .fetch_all(&self.pool).await.map_err(db_error)
    }
    pub async fn acknowledge_community_receipts(&self, ids: &[String]) -> Result<(), StoreError> {
        sqlx::query("UPDATE community_award_receipts SET acknowledged_at=now() WHERE award_id=ANY($1) AND acknowledged_at IS NULL")
            .bind(ids).execute(&self.pool).await.map_err(db_error)?;
        Ok(())
    }
}

async fn callback_lock(
    tx: &mut Tx<'_>,
    operation: &str,
    intent: &Value,
) -> Result<Option<Value>, StoreError> {
    if operation.is_empty() || operation.len() > 200 {
        return Err(StoreError::Conflict);
    }
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,44))")
        .bind(operation)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    let prior: Option<(Value, Value)> = sqlx::query_as(
        "SELECT intent,result FROM community_callback_receipts WHERE operation_id=$1",
    )
    .bind(operation)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    match prior {
        Some((saved, result)) if saved == *intent => Ok(Some(result)),
        Some(_) => Err(StoreError::Conflict),
        None => Ok(None),
    }
}
async fn callback_save(
    tx: &mut Tx<'_>,
    operation: &str,
    intent: Value,
    result: &Value,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO community_callback_receipts(operation_id,intent,result) VALUES($1,$2,$3)",
    )
    .bind(operation)
    .bind(intent)
    .bind(result)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}
async fn alliance_lock(
    tx: &mut Tx<'_>,
    identity: &CommunityAllianceIdentity,
) -> Result<(), StoreError> {
    sqlx::query("SELECT id FROM universes WHERE id=$1 FOR SHARE")
        .bind(identity.universe_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,19))")
        .bind(format!(
            "alliances:{}:{}",
            identity.universe_id, identity.epoch_id
        ))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
impl PgStore {
    pub async fn community_invitation_evidence(
        &self,
        issuer: &str,
        request: &InvitationEvidenceRequest,
    ) -> Result<Value, StoreError> {
        if request.contract_version != 1
            || !matches!(
                request.proposed_type.as_str(),
                "combined" | "alliance_public"
            )
        {
            return Err(StoreError::Conflict);
        }
        let intent = serde_json::to_value(request).map_err(|_| StoreError::CorruptData)?;
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        if let Some(result) = callback_lock(&mut tx, &request.operation_id, &intent).await? {
            return Ok(result);
        }
        alliance_lock(&mut tx, &request.alliance).await?;
        let state = crate::alliances::persistence::load(
            &mut tx,
            UniverseId(request.alliance.universe_id),
            Epoch(request.alliance.epoch_id),
            request.alliance.alliance_id,
        )
        .await;
        let player: Option<uuid::Uuid> = sqlx::query_scalar("SELECT m.player FROM oidc_identity i JOIN universe_memberships m ON m.account=i.account WHERE i.issuer=$1 AND i.subject=$2 AND m.universe=$3 AND NOT EXISTS(SELECT 1 FROM bot_participation b WHERE b.account=i.account)")
            .bind(issuer).bind(request.issuer_subject.as_deref().unwrap_or("")).bind(request.alliance.universe_id).fetch_optional(&mut *tx).await.map_err(db_error)?;
        let (member, recruit, active, _name) = match state {
            Ok(state) => (
                player.is_some_and(|p| state.is_member(PlayerId(p))),
                player.is_some_and(|p| {
                    state
                        .permissions(PlayerId(p))
                        .contains(&orbit_engine::alliances::AlliancePermission::ManageRecruitment)
                }),
                request.proposed_type == "combined" || state.invitation.is_some(),
                Some(state.name),
            ),
            Err(StoreError::NotFound) => (false, false, false, None),
            Err(error) => return Err(error),
        };
        let (at, _) = utc_now(&mut tx).await?;
        let result = json!({"contract_version":1,"operation_id":request.operation_id,"receipt_id":request.operation_id,"decided_at":at,"issuer_is_member":member,"issuer_can_recruit":recruit,"alliance_active":active});
        callback_save(&mut tx, &request.operation_id, intent, &result).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
    pub async fn community_alliance_snapshot(
        &self,
        issuer: &str,
        request: &AllianceSnapshotRequest,
    ) -> Result<Value, StoreError> {
        if request.contract_version != 1
            || community_timestamp_seconds(&request.reached_at)
                .is_none_or(|at| at > unbought_auth::now())
        {
            return Err(StoreError::Conflict);
        }
        let intent = serde_json::to_value(request).map_err(|_| StoreError::CorruptData)?;
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        if let Some(result) = callback_lock(&mut tx, &request.operation_id, &intent).await? {
            return Ok(result);
        }
        alliance_lock(&mut tx, &request.alliance).await?;
        let prior: Option<Value> = sqlx::query_scalar("SELECT evidence FROM community_alliance_snapshots WHERE universe=$1 AND epoch=$2 AND alliance=$3 AND milestone_id=$4")
            .bind(request.alliance.universe_id).bind(request.alliance.epoch_id).bind(request.alliance.alliance_id).bind(&request.honor_id).fetch_optional(&mut *tx).await.map_err(db_error)?;
        let result = if let Some(mut prior) = prior {
            if prior["reached_at"] != request.reached_at {
                return Err(StoreError::Conflict);
            }
            prior["operation_id"] = json!(request.operation_id);
            prior
        } else {
            // History intervals survive leaving/disbanding. Only real retained
            // participation before the first crossing can qualify a recipient.
            let histories=sqlx::query("SELECT h.id,h.player,h.alliance,h.valid_from,h.valid_until,EXISTS(SELECT 1 FROM empire_history e WHERE e.player=h.player AND e.at_ms=h.valid_from AND e.kind IN ('AllianceLeft','AllianceKicked','AllianceDisbanded') AND e.facts->>'alliance'=h.alliance::text) AS departure FROM alliance_affiliation_history h WHERE h.universe=$1 AND h.epoch=$2 AND h.alliance=$3 ORDER BY h.player,h.valid_from,h.id")
                .bind(request.alliance.universe_id).bind(request.alliance.epoch_id).bind(request.alliance.alliance_id).fetch_all(&mut *tx).await.map_err(db_error)?;
            let intervals = histories
                .into_iter()
                .map(|r| {
                    Ok(AllianceAffiliationInterval {
                        player: r.try_get("player").map_err(db_error)?,
                        alliance: r.try_get("alliance").map_err(db_error)?,
                        sequence: r.try_get("id").map_err(db_error)?,
                        from: r.try_get("valid_from").map_err(db_error)?,
                        until: r.try_get("valid_until").map_err(db_error)?,
                        departure_boundary: r.try_get("departure").map_err(db_error)?,
                    })
                })
                .collect::<Result<Vec<_>, StoreError>>()?;
            let at = community_timestamp_millis(&request.reached_at).ok_or(StoreError::Conflict)?;
            let tenures = community_alliance_tenures(intervals, at)
                .into_iter()
                .map(|(player, joined_at)| json!({"player":player,"joined_at":joined_at}))
                .collect::<Vec<_>>();
            let recipients: Vec<Value> = sqlx::query_scalar(SNAPSHOT_RECIPIENTS)
                .bind(issuer)
                .bind(&request.reached_at)
                .bind(json!(tenures))
                .fetch_all(&mut *tx)
                .await
                .map_err(db_error)?;
            if recipients.len() > 1000 {
                return Err(StoreError::Conflict);
            }
            let result = json!({"contract_version":1,"operation_id":request.operation_id,"receipt_id":request.operation_id,"reached_at":request.reached_at,"recipients":recipients});
            sqlx::query("INSERT INTO community_alliance_snapshots(universe,epoch,alliance,milestone_id,source_id,reached_at,evidence) VALUES($1,$2,$3,$4,$5,$6::text::timestamptz,$7)")
                .bind(request.alliance.universe_id).bind(request.alliance.epoch_id).bind(request.alliance.alliance_id).bind(&request.honor_id).bind(&request.operation_id).bind(&request.reached_at).bind(&result).execute(&mut *tx).await.map_err(db_error)?;
            result
        };
        callback_save(&mut tx, &request.operation_id, intent, &result).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
}

impl PgStore {
    pub async fn community_worker_observe(
        &self,
        worker: uuid::Uuid,
        success: bool,
    ) -> Result<(), StoreError> {
        sqlx::query("INSERT INTO community_worker_observations(worker_id,observed_at,succeeded_at) VALUES($1,now(),CASE WHEN $2 THEN now() ELSE NULL END) ON CONFLICT(worker_id) DO UPDATE SET observed_at=excluded.observed_at,succeeded_at=COALESCE(excluded.succeeded_at,community_worker_observations.succeeded_at)")
            .bind(worker).bind(success).execute(&self.pool).await.map_err(db_error)?;
        Ok(())
    }
    pub async fn community_status(&self) -> Result<Value, StoreError> {
        sqlx::query_scalar("SELECT jsonb_build_object('worker_ready',EXISTS(SELECT 1 FROM community_worker_observations WHERE observed_at>now()-interval '60 seconds'),'worker_connected',EXISTS(SELECT 1 FROM community_worker_observations WHERE succeeded_at>now()-interval '60 seconds'),'pending_events',(SELECT count(*) FROM (SELECT id FROM community_outbox WHERE state='pending' LIMIT 10001) q),'quarantined_events',(SELECT count(*) FROM (SELECT id FROM community_outbox WHERE state='quarantined' LIMIT 10001) q),'pending_receipts',(SELECT count(*) FROM (SELECT award_id FROM community_award_receipts WHERE acknowledged_at IS NULL LIMIT 10001) q),'counts_capped_at',10001)")
            .fetch_one(&self.pool).await.map_err(db_error)
    }
}

impl PgStore {
    pub async fn community_collective_awards(&self, honor: &Value) -> Result<(), StoreError> {
        let alliance: CommunityAllianceIdentity = serde_json::from_value(honor["alliance"].clone())
            .map_err(|_| StoreError::CorruptData)?;
        let honor_id = honor["honor_id"].as_str().ok_or(StoreError::CorruptData)?;
        let reached = honor["reached_at"]
            .as_str()
            .filter(|s| community_timestamp_seconds(s).is_some())
            .ok_or(StoreError::CorruptData)?;
        let rule = honor["rule_version"]
            .as_str()
            .ok_or(StoreError::CorruptData)?;
        let rewards = honor["rewards"].as_array().ok_or(StoreError::CorruptData)?;
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        for reward in rewards {
            let id = reward["id"].as_str().ok_or(StoreError::CorruptData)?;
            let kind = reward["kind"].as_str().ok_or(StoreError::CorruptData)?;
            let item = reward["item_id"]
                .as_str()
                .filter(|s| valid_symbol_id(s))
                .ok_or(StoreError::CorruptData)?;
            if !matches!(kind, "emblem" | "finish" | "effect" | "mark" | "title") {
                return Err(StoreError::Conflict);
            }
            if reward["scope"] == "game" && reward["game_id"] != COMMUNITY_GAME_ID {
                return Err(StoreError::Conflict);
            }
            sqlx::query("INSERT INTO community_alliance_awards(universe,epoch,alliance,honor_id,reward_id,kind,item_id,rule_version,reached_at,award_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::text::timestamptz,$10) ON CONFLICT DO NOTHING")
                .bind(alliance.universe_id).bind(alliance.epoch_id).bind(alliance.alliance_id).bind(honor_id).bind(id).bind(if kind=="emblem" {"insignia"} else {kind}).bind(item).bind(rule).bind(reached).bind(reward).execute(&mut *tx).await.map_err(db_error)?;
            let saved:Value=sqlx::query_scalar("SELECT award_payload FROM community_alliance_awards WHERE universe=$1 AND epoch=$2 AND alliance=$3 AND honor_id=$4 AND reward_id=$5")
                .bind(alliance.universe_id).bind(alliance.epoch_id).bind(alliance.alliance_id).bind(honor_id).bind(id).fetch_one(&mut *tx).await.map_err(db_error)?;
            if ["id", "kind", "item_id", "scope", "game_id"]
                .iter()
                .any(|key| saved[*key] != reward[*key])
            {
                return Err(StoreError::Conflict);
            }
        }
        tx.commit().await.map_err(db_error)
    }
    pub(crate) async fn read_alliance_cosmetic_grants(
        &self,
        alliance: uuid::Uuid,
    ) -> Result<Vec<(String, String)>, StoreError> {
        sqlx::query_as("SELECT DISTINCT kind,item_id FROM community_alliance_awards WHERE alliance=$1 ORDER BY kind,item_id")
            .bind(alliance).fetch_all(self.read_pool()?).await.map_err(db_error)
    }
}

impl PgStore {
    /// Creation evidence is committed before the proxy calls Accounts. Acceptance
    /// separately uses the synchronous callback and rechecks current permissions.
    pub async fn community_prepare_invitation(
        &self,
        account: AccountId,
        issuer: &str,
        operation: &str,
        alliance: &CommunityAllianceIdentity,
    ) -> Result<Value, StoreError> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        alliance_lock(&mut tx, alliance).await?;
        let identity:Option<(String,Option<uuid::Uuid>)>=sqlx::query_as("SELECT i.subject,m.player FROM oidc_identity i LEFT JOIN universe_memberships m ON m.account=i.account AND m.universe=$3 WHERE i.account=$1 AND i.issuer=$2 AND NOT EXISTS(SELECT 1 FROM bot_participation b WHERE b.account=i.account)")
            .bind(account.0).bind(issuer).bind(alliance.universe_id).fetch_optional(&mut *tx).await.map_err(db_error)?;
        let (subject, player) = identity.ok_or(StoreError::NotFound)?;
        let state = match crate::alliances::persistence::load(
            &mut tx,
            UniverseId(alliance.universe_id),
            Epoch(alliance.epoch_id),
            alliance.alliance_id,
        )
        .await
        {
            Ok(state) => Some(state),
            Err(StoreError::NotFound) => None,
            Err(error) => return Err(error),
        };
        let is_member = state
            .as_ref()
            .is_some_and(|s| player.is_some_and(|p| s.is_member(PlayerId(p))));
        let can_recruit = state.as_ref().is_some_and(|s| {
            player.is_some_and(|p| {
                s.permissions(PlayerId(p))
                    .contains(&orbit_engine::alliances::AlliancePermission::ManageRecruitment)
            })
        });
        // This is a new permission decision, not a replay of the client's action.
        // Keep negative evidence too: Accounts can replay an already committed
        // action before checking it, or reject a genuinely new unauthorized one.
        let checked_at = crate::ordering::now(&mut tx).await?;
        let (at,until):(String,String)=sqlx::query_as("SELECT to_char(to_timestamp($1::double precision/1000) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),to_char((to_timestamp($1::double precision/1000)+interval '2 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
            .bind(checked_at).fetch_one(&mut *tx).await.map_err(db_error)?;
        let evidence = format!("invitation-check:{}", uuid::Uuid::new_v4());
        let key = format!("invitation-permission:{}:{operation}:{evidence}", account.0);
        enqueue(&mut tx,account,&key,"alliance_permission",&at,json!({"alliance":alliance,"can_recruit":can_recruit,"is_member":is_member,"public_name":state.map(|s|s.name).unwrap_or_else(||"Unavailable alliance".into()),"evidence_ref":evidence,"valid_until":until})).await?;
        let event:Value=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'subject',$2::text,'kind',kind,'occurred_at',occurred_at,'payload',payload) FROM community_outbox WHERE fact_key=$1")
            .bind(key).bind(subject).fetch_one(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(event)
    }
}

impl PgStore {
    pub async fn community_alliance_honors(
        &self,
        alliance: uuid::Uuid,
    ) -> Result<Vec<Value>, StoreError> {
        sqlx::query_scalar("SELECT jsonb_build_object('honor_id',honor_id,'reward_id',reward_id,'kind',kind,'item_id',item_id,'rule_version',rule_version,'reached_at',to_char(reached_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')) FROM community_alliance_awards WHERE alliance=$1 ORDER BY reached_at,honor_id,reward_id LIMIT 512")
            .bind(alliance).fetch_all(self.read_pool()?).await.map_err(db_error)
    }
}

//! Archive reads deliberately do not require a live game binding.
use crate::{ordering::Tx, *};
use orbit_application::*;
use serde_json::{Value, json};
use sqlx::{Row, postgres::PgRow};
use uuid::Uuid;

fn entry(row: &PgRow) -> Result<HistoryEntry, StoreError> {
    let mut facts: Value = row.try_get("facts").map_err(db_error)?;
    let noteworthy = noteworthy_battle(&facts);
    if let Some(object) = facts.as_object_mut() {
        object.remove("valuation_before");
        object.remove("valuation_after");
        object.remove("origins");
    }
    Ok(HistoryEntry {
        id: row.try_get("id").map_err(db_error)?,
        kind: row.try_get("kind").map_err(db_error)?,
        at_ms: row.try_get("at_ms").map_err(db_error)?,
        facts,
        selected: row.try_get("selected").map_err(db_error)?,
        caption: row.try_get("caption").map_err(db_error)?,
        featured: row.try_get("featured").map_err(db_error)?,
        publication: row.try_get("publication").map_err(db_error)?,
        noteworthy,
        correction: row.try_get("correction").map_err(db_error)?,
    })
}
const ENTRIES: &str = "SELECT h.id,h.player,h.source,h.kind,h.at_ms,h.report,h.facts || COALESCE(c.facts,'{}'::jsonb) AS facts,c.payload AS corrected_payload,c.reason AS correction,t.event IS NOT NULL AS selected,COALESCE(t.caption,'') AS caption,COALESCE(t.featured,false) AS featured,p.id AS publication FROM empire_history h LEFT JOIN empire_timeline t ON t.event=h.id LEFT JOIN commemorative_publications p ON p.event=h.id LEFT JOIN LATERAL (SELECT facts,payload,reason FROM empire_history_corrections WHERE event=h.id ORDER BY at_ms DESC,source DESC LIMIT 1) c ON true";

async fn identity(
    tx: &mut Tx<'_>,
    viewer: Option<AccountId>,
    player: Uuid,
) -> Result<EmpireProfile, StoreError> {
    let row = sqlx::query("SELECT e.*,COALESCE(a.name,e.recorded_name) AS username,o.account,(c.closed_at IS NOT NULL) AS closed,EXISTS(SELECT 1 FROM empire_profiles m JOIN orbit_profiles p ON p.id=m.profile WHERE p.account=$2 AND m.universe=e.universe AND m.epoch=e.epoch AND NOT m.removed) AS fellow FROM empire_profiles e JOIN orbit_profiles o ON o.id=e.profile LEFT JOIN accounts a ON a.id=o.account LEFT JOIN campaign_history c ON c.universe=e.universe AND c.epoch=e.epoch WHERE e.player=$1")
        .bind(player).bind(viewer.map(|a|a.0)).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
    let account: Option<Uuid> = row.try_get("account").map_err(db_error)?;
    let owner = viewer.is_some_and(|v| Some(v.0) == account);
    let removed: bool = row.try_get("removed").map_err(db_error)?;
    let public: bool = row.try_get("public").map_err(db_error)?;
    if !owner
        && (removed
            || account.is_none()
            || (!public && !row.try_get::<bool, _>("fellow").map_err(db_error)?))
    {
        return Err(StoreError::NotFound);
    }
    Ok(EmpireProfile {
        player,
        profile: row.try_get("profile").map_err(db_error)?,
        universe: row.try_get("universe").map_err(db_error)?,
        epoch: row.try_get("epoch").map_err(db_error)?,
        universe_name: row.try_get("universe_name").map_err(db_error)?,
        username: row.try_get("username").map_err(db_error)?,
        identity: EmpireIdentity {
            name: row.try_get("empire_name").map_err(db_error)?,
            tagline: row.try_get("tagline").map_err(db_error)?,
            title_id: row.try_get("title_id").map_err(db_error)?,
        },
        title: TitleDisplay::default(),
        title_choices: None,
        title_grants: sqlx::query_scalar("SELECT item_id FROM cosmetic_grants WHERE account=$1 AND kind='title'")
            .bind(account).fetch_all(&mut **tx).await.map_err(db_error)?,
        display: None,
        alliance: sqlx::query_scalar::<_,sqlx::types::Json<AllianceIdentity>>("SELECT jsonb_build_object('id',a.id,'universe',a.universe,'tag',a.tag,'name',a.name) FROM alliance_memberships m JOIN alliances a ON a.id=m.alliance AND a.epoch=m.epoch JOIN empire_profiles p ON p.player=m.player AND p.epoch=m.epoch WHERE m.player=$1")
            .bind(player).fetch_optional(&mut **tx).await.map_err(db_error)?.map(|j|j.0),
        owner,
        public,
        removed,
        closed: row.try_get("closed").map_err(db_error)?,
        revision: row.try_get("revision").map_err(db_error)?,
        entries: vec![],
        next: None,
    })
}
impl PgStore {
    pub(crate) async fn read_empire_profile(
        &self,
        viewer: Option<AccountId>,
        player: Uuid,
        q: HistoryQuery,
    ) -> Result<EmpireProfile, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let mut profile = identity(&mut tx, viewer, player).await?;
        if q.library && !profile.owner {
            return Err(StoreError::NotFound);
        }
        let before: Option<(i64, Uuid)> = if let Some(id) = q.before {
            Some(
                sqlx::query_as(
                    "SELECT COALESCE(at_ms,-1),id FROM empire_history WHERE player=$1 AND id=$2",
                )
                .bind(player)
                .bind(id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
                .ok_or(StoreError::InvalidCursor)?,
            )
        } else {
            None
        };
        let rows=sqlx::query(&format!("{ENTRIES} WHERE h.player=$1 AND ($2 OR t.event IS NOT NULL) AND ($3::bigint IS NULL OR (COALESCE(h.at_ms,-1),h.id)<($3,$4)) ORDER BY COALESCE(h.at_ms,-1) DESC,h.id DESC LIMIT 51"))
            .bind(player).bind(q.library).bind(before.map(|b|b.0)).bind(before.map(|b|b.1)).fetch_all(&mut *tx).await.map_err(db_error)?;
        profile.entries = rows.iter().take(50).map(entry).collect::<Result<_, _>>()?;
        if rows.len() > 50 {
            profile.next = profile.entries.last().map(|e| e.id);
        }
        tx.commit().await.map_err(db_error)?;
        Ok(profile)
    }
    pub(crate) async fn read_orbit_profile(
        &self,
        viewer: Option<AccountId>,
        profile: Option<Uuid>,
    ) -> Result<OrbitProfile, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let id = match profile {
            Some(id) => id,
            None => sqlx::query_scalar("SELECT id FROM orbit_profiles WHERE account=$1")
                .bind(viewer.map(|a| a.0))
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
                .ok_or(StoreError::NotFound)?,
        };
        let account: Option<Uuid> =
            sqlx::query_scalar("SELECT account FROM orbit_profiles WHERE id=$1")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
                .flatten();
        let owner = viewer.is_some_and(|v| Some(v.0) == account);
        if account.is_none() {
            return Err(StoreError::NotFound);
        }
        let players:Vec<Uuid>=sqlx::query_scalar("SELECT player FROM empire_profiles WHERE profile=$1 AND ($2 OR (public AND NOT removed)) ORDER BY joined_at DESC NULLS LAST,player")
            .bind(id).bind(owner).fetch_all(&mut *tx).await.map_err(db_error)?;
        if !owner && players.is_empty() {
            return Err(StoreError::NotFound);
        }
        let mut empires = vec![];
        for player in players {
            empires.push(identity(&mut tx, viewer, player).await?);
        }
        tx.commit().await.map_err(db_error)?;
        Ok(OrbitProfile { id, owner, empires })
    }
    pub(crate) async fn read_history_detail(
        &self,
        viewer: Option<AccountId>,
        id: Uuid,
        publication: bool,
    ) -> Result<HistoricalDetail, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let row = sqlx::query(&format!(
            "{ENTRIES} WHERE {}=$1",
            if publication { "p.id" } else { "h.id" }
        ))
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)?;
        let player: Uuid = row.try_get("player").map_err(db_error)?;
        let mut event = entry(&row)?;
        if !publication {
            let profile = identity(&mut tx, viewer, player).await?;
            if !profile.owner && !event.selected {
                return Err(StoreError::NotFound);
            }
        } else {
            event.caption =
                sqlx::query_scalar("SELECT caption FROM commemorative_publications WHERE id=$1")
                    .bind(id)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
            event.selected = false;
            event.featured = false;
        }
        let report = if let Some(report) =
            row.try_get::<Option<Uuid>, _>("report").map_err(db_error)?
        {
            let payload: Value =
                sqlx::query_scalar("SELECT data->'payloads'->$2 FROM mission_reports WHERE id=$1")
                    .bind(report)
                    .bind(player.to_string())
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
            let payload = row
                .try_get::<Option<Value>, _>("corrected_payload")
                .map_err(db_error)?
                .unwrap_or(payload);
            let facts: Value = row.try_get("facts").map_err(db_error)?;
            Some(project_shared_report_with_identity(
                ReportId(report),
                event.at_ms.unwrap_or(0),
                &payload,
                &serde_json::from_value(facts.get("names").cloned().unwrap_or(json!({})))
                    .map_err(|_| StoreError::CorruptData)?,
                &serde_json::from_value(facts.get("alliances").cloned().unwrap_or(json!({})))
                    .map_err(|_| StoreError::CorruptData)?,
                &Default::default(),
                ReportShareOptions {
                    include_identity: true,
                    include_coordinates: true,
                },
            )?)
        } else {
            None
        };
        let universe_name =
            sqlx::query_scalar("SELECT universe_name FROM empire_profiles WHERE player=$1")
                .bind(player)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(HistoricalDetail {
            entry: event,
            player,
            universe_name,
            report,
        })
    }
    pub(crate) async fn write_empire_profile(
        &self,
        account: AccountId,
        player: Uuid,
        q: ProfileCommand,
        access: Option<IdentityAccess<'_>>,
    ) -> Result<(), StoreError> {
        q.validate().map_err(|_| StoreError::Conflict)?;
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        // Receipt FKs and account deletion use this order: account, then profile.
        // Otherwise a concurrent account delete can hold the account while waiting
        // for the profile that an editor holds before inserting its receipt.
        sqlx::query("SELECT id FROM accounts WHERE id=$1 FOR KEY SHARE")
            .bind(account.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        // The same row is locked by removal and account-detachment triggers.
        sqlx::query("SELECT player FROM empire_profiles WHERE player=$1 FOR UPDATE")
            .bind(player)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        let profile = identity(&mut tx, Some(account), player).await?;
        let intent =
            orbit_engine::hash(&json!({"action":q.action,"revision":q.expected_revision})).0;
        if let Some((old, actor)) = sqlx::query_as::<_, (String, Uuid)>(
            "SELECT intent,account FROM empire_profile_receipts WHERE player=$1 AND command=$2",
        )
        .bind(player)
        .bind(q.command_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?
        {
            return if old == intent && actor == account.0 {
                Ok(())
            } else {
                Err(StoreError::Conflict)
            };
        }
        if profile.revision != q.expected_revision {
            return Err(StoreError::Conflict);
        }
        match q.action {
            ProfileAction::Identity { identity } => {
                if !profile.owner || profile.removed || profile.closed {
                    return Err(StoreError::NotFound);
                }
                let access = access.ok_or(StoreError::NotFound)?;
                // Preserve an unavailable saved choice when editing unrelated text.
                if identity.title_id != profile.identity.title_id {
                    let now: i64 = sqlx::query_scalar(
                        "SELECT floor(extract(epoch FROM clock_timestamp()))::bigint",
                    )
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
                    match title_access(
                        access.catalog,
                        &identity.title_id,
                        access.policy,
                        &profile.title_grants,
                        access.evidence,
                        now,
                    ) {
                        TitleAccess::Available => {}
                        TitleAccess::NotInstalled => return Err(StoreError::NotFound),
                        TitleAccess::Unavailable => return Err(StoreError::Unavailable),
                        _ => return Err(StoreError::CosmeticDenied),
                    }
                }
                sqlx::query("UPDATE empire_profiles SET empire_name=$2,tagline=$3,title_id=$4 WHERE player=$1")
                    .bind(player).bind(identity.name.trim()).bind(identity.tagline.trim()).bind(identity.title_id)
                    .execute(&mut *tx).await.map_err(db_error)?;
            }
            ProfileAction::Visibility { public } => {
                if !profile.owner || (public && profile.removed) {
                    return Err(StoreError::NotFound);
                }
                sqlx::query("UPDATE empire_profiles SET public=$2 WHERE player=$1")
                    .bind(player)
                    .bind(public)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
            }
            ProfileAction::Select {
                event,
                selected,
                caption,
                featured,
            } => {
                if !profile.owner {
                    return Err(StoreError::NotFound);
                }
                require_event(&mut tx, player, event).await?;
                if selected {
                    sqlx::query("INSERT INTO empire_timeline(event,caption,featured) VALUES($1,$2,$3) ON CONFLICT(event) DO UPDATE SET caption=excluded.caption,featured=excluded.featured")
                        .bind(event).bind(caption).bind(featured).execute(&mut *tx).await.map_err(db_error)?;
                } else {
                    sqlx::query("DELETE FROM empire_timeline WHERE event=$1")
                        .bind(event)
                        .execute(&mut *tx)
                        .await
                        .map_err(db_error)?;
                }
            }
            ProfileAction::Publish { event } => {
                require_event(&mut tx, player, event).await?;
                let caption: Option<String> =
                    sqlx::query_scalar("SELECT caption FROM empire_timeline WHERE event=$1")
                        .bind(event)
                        .fetch_optional(&mut *tx)
                        .await
                        .map_err(db_error)?;
                if !profile.owner && caption.is_none() {
                    return Err(StoreError::NotFound);
                }
                sqlx::query("INSERT INTO commemorative_publications(event,caption) VALUES($1,$2) ON CONFLICT(event) DO NOTHING")
                    .bind(event).bind(caption.unwrap_or_default()).execute(&mut *tx).await.map_err(db_error)?;
            }
        }
        sqlx::query("UPDATE empire_profiles SET revision=revision+1 WHERE player=$1")
            .bind(player)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("INSERT INTO empire_profile_receipts(player,command,account,intent) VALUES($1,$2,$3,$4)")
            .bind(player).bind(q.command_id).bind(account.0).bind(intent).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)
    }
}
async fn require_event(tx: &mut Tx<'_>, player: Uuid, event: Uuid) -> Result<(), StoreError> {
    sqlx::query("SELECT id FROM empire_history WHERE player=$1 AND id=$2")
        .bind(player)
        .bind(event)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)?;
    Ok(())
}

pub(crate) async fn append(
    tx: &mut Tx<'_>,
    player: PlayerId,
    source: String,
    kind: &str,
    at: i64,
    facts: Value,
    report: Option<ReportId>,
) -> Result<(), StoreError> {
    // Non-account scenario actors have no profile. Never invent ownership.
    sqlx::query("INSERT INTO empire_history(player,source,kind,at_ms,facts,report) SELECT e.player,$2,$3,$4,$5 || jsonb_build_object('commander_name',n.name,'appearance_ref',a.recipe,'empire_identity',ci.identity),$6 FROM empire_profiles e JOIN orbit_profiles p ON p.id=e.profile LEFT JOIN LATERAL (SELECT name FROM orbit_name_history WHERE account=p.account AND observed_at<=$4 ORDER BY observed_at DESC LIMIT 1) n ON true LEFT JOIN LATERAL (SELECT recipe FROM orbit_appearance_history WHERE player=e.player AND observed_at<=$4 ORDER BY observed_at DESC LIMIT 1) a ON true LEFT JOIN LATERAL (SELECT identity FROM empire_identity_history WHERE player=e.player AND observed_at<=$4 ORDER BY observed_at DESC LIMIT 1) ci ON true WHERE e.player=$1 ON CONFLICT(player,source) DO NOTHING")
        .bind(player.0).bind(source).bind(kind).bind(at).bind(facts).bind(report.map(|r|r.0)).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

pub(crate) async fn capture_report(
    tx: &mut Tx<'_>,
    s: &orbit_engine::GameState,
    c: &orbit_engine::WorldChanges,
    report: &orbit_engine::MissionReport,
) -> Result<(), StoreError> {
    if report.kind != "Combat" && report.kind != "Colonized" {
        return Ok(());
    }
    for (recipient, payload) in &report.payloads {
        let mut facts = json!({});
        if report.kind == "Combat" {
            let ids: Vec<_> = report_profile_players(payload)
                .into_iter()
                .map(|p| p.0)
                .collect();
            let names:Vec<(Uuid,String)>=sqlx::query_as("SELECT DISTINCT ON (m.player) m.player,n.name FROM empire_profiles m JOIN orbit_profiles p ON p.id=m.profile JOIN orbit_name_history n ON n.account=p.account WHERE m.universe=$1 AND m.player=ANY($2) AND n.observed_at<=$3 ORDER BY m.player,n.observed_at DESC")
                .bind(s.universe.0).bind(&ids).bind(report.at).fetch_all(&mut **tx).await.map_err(db_error)?;
            let alliances: Value = sqlx::query_scalar(
                "SELECT identities FROM mission_report_alliances WHERE report=$1",
            )
            .bind(report.id.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
            let alliances = visible_report_alliances(
                payload,
                &serde_json::from_value(alliances).map_err(|_| StoreError::CorruptData)?,
            );
            let names: std::collections::BTreeMap<_, _> = names.into_iter().collect();
            let appearance_refs:Value=sqlx::query_scalar("SELECT COALESCE(jsonb_object_agg(player,recipe),'{}'::jsonb) FROM (SELECT DISTINCT ON (player) player,recipe FROM orbit_appearance_history WHERE player=ANY($1) AND observed_at<=$2 ORDER BY player,observed_at DESC) a")
                .bind(&ids).bind(report.at).fetch_one(&mut **tx).await.map_err(db_error)?;

            let before = &s
                .world
                .as_ref()
                .ok_or(StoreError::CorruptData)?
                .records
                .lots;
            let values = |lots: &[orbit_engine::AssetLot]| {
                lots.iter().filter(|l|l.owner==*recipient).map(|l|json!({"item":l.item,"quantity":l.quantity,"unit_value_micro":l.unit_value_micro,"location":l.location})).collect::<Vec<_>>()
            };
            let identities: Value = sqlx::query_scalar("SELECT COALESCE(jsonb_object_agg(player,identity),'{}'::jsonb) FROM (SELECT DISTINCT ON(player) player,identity FROM empire_identity_history WHERE player=ANY($1) AND observed_at<=$2 ORDER BY player,observed_at DESC) i")
                .bind(&ids).bind(report.at).fetch_one(&mut **tx).await.map_err(db_error)?;
            facts = json!({"empire_identities":identities,"names":names,"appearance_refs":appearance_refs,"alliances":alliances,"outcome":payload.get("outcome"),"significance_version":1,
                "valuation_before":values(before),"valuation_after":values(&c.records.lots),"origins":payload["participants"].as_array().into_iter().flatten().filter(|p|p["owner"].as_str()==Some(&recipient.to_string())).map(|p|p["origin"].clone()).collect::<Vec<_>>()});
        } else {
            for key in [
                "body",
                "destination_coordinates",
                "fields",
                "diameter_km",
                "max_temperature",
            ] {
                if let Some(value) = payload.get(key) {
                    facts[key] = value.clone();
                }
            }
        }
        append(
            tx,
            *recipient,
            format!("report:{}", report.id),
            if report.kind == "Combat" {
                "Battle"
            } else {
                "Colonized"
            },
            report.at,
            facts,
            (report.kind == "Combat").then_some(report.id),
        )
        .await?;
    }
    Ok(())
}

/// Lifecycle integration boundary. Call in the authoritative resolution transaction,
/// with the committed outcome source ID. This does not decide victory or close gameplay.
pub async fn record_campaign_result(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    universe: UniverseId,
    epoch: Epoch,
    source: Uuid,
    at: i64,
    outcome: &str,
    beneficiaries: &[PlayerId],
) -> Result<(), StoreError> {
    if at < 0
        || !matches!(outcome, "Victory" | "Defeat")
        || (outcome == "Defeat" && !beneficiaries.is_empty())
    {
        return Err(StoreError::Conflict);
    }
    let mut winners: Vec<Uuid> = beneficiaries.iter().map(|p| p.0).collect();
    winners.sort();
    winners.dedup();
    let inserted=sqlx::query("INSERT INTO campaign_history(universe,epoch,source,resolved_at,outcome,beneficiaries) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING")
        .bind(universe.0).bind(epoch.0).bind(source).bind(at).bind(outcome).bind(&winners).execute(&mut **tx).await.map_err(db_error)?;
    let identical:bool=sqlx::query_scalar("SELECT source=$3 AND resolved_at=$4 AND outcome=$5 AND beneficiaries=$6 FROM campaign_history WHERE universe=$1 AND epoch=$2")
        .bind(universe.0).bind(epoch.0).bind(source).bind(at).bind(outcome).bind(&winners).fetch_one(&mut **tx).await.map_err(db_error)?;
    if !identical {
        return Err(StoreError::Conflict);
    }
    if inserted.rows_affected() == 0 {
        return Ok(());
    }
    let players: Vec<Uuid> =
        sqlx::query_scalar("SELECT player FROM empire_profiles WHERE universe=$1 AND epoch=$2 AND (joined_at IS NULL OR joined_at<=$3)")
            .bind(universe.0)
            .bind(epoch.0)
            .bind(at)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?;
    for player in players {
        append(
            tx,
            PlayerId(player),
            format!("campaign:{source}"),
            "CampaignResult",
            at,
            json!({"outcome":outcome,"beneficiary":winners.contains(&player),"source":source}),
            None,
        )
        .await?;
    }
    Ok(())
}
/// Called alongside actual gameplay closure; leaves identities, selections and URLs intact.
pub async fn record_campaign_closure(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    universe: UniverseId,
    epoch: Epoch,
    at: i64,
) -> Result<(), StoreError> {
    let changed=sqlx::query("UPDATE campaign_history SET closed_at=$3 WHERE universe=$1 AND epoch=$2 AND resolved_at<=$3 AND (closed_at IS NULL OR closed_at=$3)")
        .bind(universe.0).bind(epoch.0).bind(at).execute(&mut **tx).await.map_err(db_error)?;
    if changed.rows_affected() != 1 {
        return Err(StoreError::Conflict);
    }
    Ok(())
}

/// Operator-only correction boundary; no player endpoint exposes this operation.
/// Source IDs make exact retries harmless. Facts may amend presentation facts,
/// never replace private valuation inputs; report payloads still use the allowlist.
pub async fn correct_history_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    event: Uuid,
    source: Uuid,
    at: i64,
    reason: &str,
    facts: Value,
    payload: Option<Value>,
) -> Result<(), StoreError> {
    if at < 0
        || reason.trim().is_empty()
        || reason.chars().count() > 2000
        || !facts.is_object()
        || ["valuation_before", "valuation_after", "origins"]
            .iter()
            .any(|key| facts.get(key).is_some())
    {
        return Err(StoreError::Conflict);
    }
    let row = sqlx::query("SELECT report,player,at_ms FROM empire_history WHERE id=$1 FOR UPDATE")
        .bind(event)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)?;
    if row
        .try_get::<Option<i64>, _>("at_ms")
        .map_err(db_error)?
        .is_some_and(|t| t > at)
    {
        return Err(StoreError::Conflict);
    }
    if let Some(p) = &payload {
        let report: Uuid = row
            .try_get::<Option<Uuid>, _>("report")
            .map_err(db_error)?
            .ok_or(StoreError::Conflict)?;
        let player: Uuid = row.try_get("player").map_err(db_error)?;
        let kind: String = sqlx::query_scalar(
            "SELECT data->'payloads'->$2->>'kind' FROM mission_reports WHERE id=$1",
        )
        .bind(report)
        .bind(player.to_string())
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
        if p["kind"].as_str() != Some(&kind) || !matches!(kind.as_str(), "Combat" | "ContactLost") {
            return Err(StoreError::Conflict);
        }
    }
    sqlx::query("INSERT INTO empire_history_corrections(source,event,at_ms,reason,facts,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING")
        .bind(source).bind(event).bind(at).bind(reason).bind(&facts).bind(&payload).execute(&mut **tx).await.map_err(db_error)?;
    let same:bool=sqlx::query_scalar("SELECT event=$2 AND at_ms=$3 AND reason=$4 AND facts=$5 AND payload IS NOT DISTINCT FROM $6 FROM empire_history_corrections WHERE source=$1")
        .bind(source).bind(event).bind(at).bind(reason).bind(&facts).bind(&payload).fetch_one(&mut **tx).await.map_err(db_error)?;
    if !same {
        return Err(StoreError::Conflict);
    }
    Ok(())
}

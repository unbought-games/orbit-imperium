use crate::{PgStore, db_error};
use orbit_application::*;
use serde_json::{Value, json};
use sqlx::{PgConnection, Row, types::Json};
use uuid::Uuid;

const ACCESS_REFRESH_REQUIRED: &str = "Appearance access expired; refresh required";
const SOURCE_REFRESH_REQUIRED: &str = "Appearance source changed; refresh required";

impl PgStore {
    pub(crate) async fn read_ship_appearances(
        &self,
        b: Binding,
    ) -> Result<ShipAppearanceSnapshot, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let library = sqlx::query("SELECT d.id,d.name,d.target,d.revision,d.recipe FROM ship_design_revisions d WHERE d.account=$1 AND (d.revision=(SELECT max(newest.revision) FROM ship_design_revisions newest WHERE newest.account=d.account AND newest.id=d.id) OR EXISTS(SELECT 1 FROM empire_ship_equipment e WHERE e.universe=$2 AND e.account=d.account AND e.design_id=d.id AND e.design_revision=d.revision)) ORDER BY d.id,d.revision DESC")
            .bind(b.account.0).bind(b.universe.0).fetch_all(&mut *tx).await.map_err(db_error)?
            .into_iter().map(|r| Ok(ShipDesign {id:r.try_get("id").map_err(db_error)?,name:r.try_get("name").map_err(db_error)?,target:r.try_get("target").map_err(db_error)?,revision:r.try_get("revision").map_err(db_error)?,recipe:r.try_get::<Json<ShipPaintRecipe>,_>("recipe").map_err(db_error)?.0})).collect::<Result<_,StoreError>>()?;
        let emblem = sqlx::query(
            "SELECT recipe,revision FROM empire_insignias WHERE universe=$1 AND account=$2",
        )
        .bind(b.universe.0)
        .bind(b.account.0)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?;
        let (emblem_recipe, emblem_revision) = match emblem {
            Some(r) => (
                r.try_get::<Option<Json<InsigniaRecipe>>, _>("recipe")
                    .map_err(db_error)?
                    .map(|r| r.0),
                r.try_get("revision").map_err(db_error)?,
            ),
            None => (None, 0),
        };
        let rows = sqlx::query("SELECT e.*,r.stage,r.error,r.cancel_requested,a.variants FROM empire_ship_equipment e LEFT JOIN ship_render_requests r ON r.id=e.latest_request LEFT JOIN ship_artifacts a ON a.id=e.artwork WHERE e.universe=$1 AND e.account=$2 ORDER BY e.target")
            .bind(b.universe.0).bind(b.account.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        let mut equipment = Vec::new();
        for r in rows {
            let stage: Option<String> = r.try_get("stage").map_err(db_error)?;
            let render = if let Some(stage) = stage {
                Some(ShipRenderRequest {
                    id: r.try_get("latest_request").map_err(db_error)?,
                    can_cancel: matches!(stage.as_str(), "queued" | "rendering" | "preparing")
                        && !r.try_get::<bool, _>("cancel_requested").map_err(db_error)?,
                    can_retry: matches!(stage.as_str(), "failed" | "canceled"),
                    stage,
                    error: r.try_get("error").map_err(db_error)?,
                })
            } else {
                None
            };
            let artwork = match r.try_get::<Option<Uuid>, _>("artwork").map_err(db_error)? {
                Some(id) => {
                    let variants: Json<Vec<ShipStoredVariant>> =
                        r.try_get("variants").map_err(db_error)?;
                    Some(ShipArtwork {
                        id,
                        variants: variants
                            .0
                            .iter()
                            .enumerate()
                            .filter(|(_, v)| {
                                v.mime_type == "image/webp"
                                    || !variants.0.iter().any(|other| {
                                        other.width == v.width && other.mime_type == "image/webp"
                                    })
                            })
                            .map(|(i, v)| ShipArtworkVariant {
                                width: v.width,
                                height: v.height,
                                url: format!("/api/media/ship-appearances/{id}/{i}"),
                            })
                            .collect(),
                    })
                }
                None => None,
            };
            equipment.push(ShipEquipment {
                target: r.try_get("target").map_err(db_error)?,
                revision: r.try_get("revision").map_err(db_error)?,
                design_id: r.try_get("design_id").map_err(db_error)?,
                design_revision: r.try_get("design_revision").map_err(db_error)?,
                render,
                artwork,
                fallback_reason: None,
            });
        }
        if equipment.is_empty() {
            equipment.push(ShipEquipment {
                target: SHIP_TARGET.into(),
                revision: 0,
                design_id: None,
                design_revision: None,
                render: None,
                artwork: None,
                fallback_reason: None,
            });
        }
        tx.commit().await.map_err(db_error)?;
        Ok(ShipAppearanceSnapshot {
            library,
            equipment,
            emblem_recipe,
            emblem_revision,
        })
    }

    pub(crate) async fn write_ship_appearance(
        &self,
        b: Binding,
        request: Uuid,
        action: ShipAppearanceAction,
        env: ShipRenderEnvironment,
    ) -> Result<(), ServiceError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        sqlx::query("SELECT id FROM universes WHERE id=$1 FOR SHARE")
            .bind(b.universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        sqlx::query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE")
            .bind(b.account.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        crate::binding::check_read(&mut tx, b).await?;
        let now: i64 =
            sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        if env.valid_until <= now {
            return Err(ServiceError::Unavailable);
        }
        let emblem_revision:i64=sqlx::query_scalar("SELECT COALESCE((SELECT revision FROM empire_insignias WHERE universe=$1 AND account=$2),0)").bind(b.universe.0).bind(b.account.0).fetch_one(&mut *tx).await.map_err(db_error)?;
        if emblem_revision != env.emblem_revision {
            return Err(ServiceError::Conflict);
        }
        let value = serde_json::to_value(&action).map_err(|_| ServiceError::Malformed)?;
        let replay:Option<Json<Value>>=sqlx::query_scalar("SELECT action FROM ship_appearance_actions WHERE universe=$1 AND account=$2 AND request_id=$3").bind(b.universe.0).bind(b.account.0).bind(request).fetch_optional(&mut *tx).await.map_err(db_error)?;
        if let Some(replay) = replay {
            if replay.0 != value {
                return Err(ServiceError::Conflict);
            }
            tx.commit().await.map_err(db_error)?;
            return Ok(());
        }
        sqlx::query("INSERT INTO empire_ship_equipment(universe,account,target) VALUES($1,$2,$3) ON CONFLICT DO NOTHING").bind(b.universe.0).bind(b.account.0).bind(SHIP_TARGET).execute(&mut *tx).await.map_err(db_error)?;
        let revision:i64=sqlx::query_scalar("SELECT revision FROM empire_ship_equipment WHERE universe=$1 AND account=$2 AND target=$3 FOR UPDATE").bind(b.universe.0).bind(b.account.0).bind(SHIP_TARGET).fetch_one(&mut *tx).await.map_err(db_error)?;
        let mut selection = None;
        let mut force_render = false;
        let is_load = matches!(action, ShipAppearanceAction::Load);
        match action {
            ShipAppearanceAction::Load => {}
            ShipAppearanceAction::Save {
                design,
                equip,
                expected_equipment_revision,
            } => {
                if !design.valid() {
                    return Err(ServiceError::Malformed);
                }
                env.input(&design.recipe)?;
                if equip && expected_equipment_revision != revision {
                    return Err(ServiceError::Conflict);
                }
                let previous: Option<i64> = sqlx::query_scalar(
                    "SELECT max(revision) FROM ship_design_revisions WHERE account=$1 AND id=$2",
                )
                .bind(b.account.0)
                .bind(design.id)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
                if previous.unwrap_or(0) != design.revision {
                    return Err(ServiceError::Conflict);
                }
                if previous.is_none() {
                    let count: i64 = sqlx::query_scalar(
                        "SELECT count(DISTINCT id) FROM ship_design_revisions WHERE account=$1",
                    )
                    .bind(b.account.0)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
                    if count >= 64 {
                        return Err(ServiceError::Conflict);
                    }
                }
                sqlx::query("INSERT INTO ship_design_revisions(account,id,revision,name,target,recipe) VALUES($1,$2,$3,$4,$5,$6)").bind(b.account.0).bind(design.id).bind(design.revision+1).bind(design.name.trim()).bind(&design.target).bind(Json(&design.recipe)).execute(&mut *tx).await.map_err(db_error)?;
                if equip {
                    selection = Some((design.id, design.revision + 1));
                }
            }
            ShipAppearanceAction::Equip {
                target,
                design_id,
                design_revision,
                expected_equipment_revision,
            } => {
                check_target_revision(&target, expected_equipment_revision, revision)?;
                let recipe:Json<ShipPaintRecipe>=sqlx::query_scalar("SELECT recipe FROM ship_design_revisions WHERE account=$1 AND id=$2 AND revision=$3 AND target=$4").bind(b.account.0).bind(design_id).bind(design_revision).bind(target).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(ServiceError::NotFound)?;
                env.input(&recipe.0)?;
                selection = Some((design_id, design_revision));
            }
            ShipAppearanceAction::Reset {
                target,
                expected_equipment_revision,
            } => {
                check_target_revision(&target, expected_equipment_revision, revision)?;
                sqlx::query("UPDATE ship_render_requests SET stage='superseded' WHERE universe=$1 AND account=$2 AND target=$3 AND stage='queued'").bind(b.universe.0).bind(b.account.0).bind(&target).execute(&mut *tx).await.map_err(db_error)?;
                sqlx::query("UPDATE empire_ship_equipment SET revision=revision+1,design_id=NULL,design_revision=NULL,latest_request=NULL,artwork=NULL WHERE universe=$1 AND account=$2 AND target=$3").bind(b.universe.0).bind(b.account.0).bind(target).execute(&mut *tx).await.map_err(db_error)?;
            }
            ShipAppearanceAction::Cancel { request_id } => {
                let n=sqlx::query("UPDATE ship_render_requests r SET stage=CASE WHEN r.lease IS NULL THEN 'canceled' ELSE r.stage END,cancel_requested=true,error=NULL FROM empire_ship_equipment e WHERE r.id=$3 AND r.universe=$1 AND r.account=$2 AND e.universe=r.universe AND e.account=r.account AND e.target=r.target AND e.latest_request=r.id AND r.stage IN ('queued','rendering','preparing') AND NOT r.cancel_requested").bind(b.universe.0).bind(b.account.0).bind(request_id).execute(&mut *tx).await.map_err(db_error)?.rows_affected();
                if n != 1 {
                    return Err(ServiceError::Conflict);
                }
            }
            ShipAppearanceAction::Retry { request_id } => {
                let input:Option<Json<Value>>=sqlx::query_scalar("SELECT r.input FROM ship_render_requests r JOIN empire_ship_equipment e ON e.latest_request=r.id WHERE r.id=$3 AND r.universe=$1 AND r.account=$2 AND r.stage IN ('failed','canceled')").bind(b.universe.0).bind(b.account.0).bind(request_id).fetch_optional(&mut *tx).await.map_err(db_error)?;
                if input.is_none() {
                    return Err(ServiceError::Conflict);
                }
                force_render = true;
            }
        }
        if let Some((id, rev)) = selection {
            force_render = true;
            sqlx::query("UPDATE empire_ship_equipment SET revision=revision+1,design_id=$3,design_revision=$4 WHERE universe=$1 AND account=$2 AND target=$5").bind(b.universe.0).bind(b.account.0).bind(id).bind(rev).bind(SHIP_TARGET).execute(&mut *tx).await.map_err(db_error)?;
        }
        refresh(&mut tx, b, &env, force_render).await?;
        if !is_load {
            sqlx::query("INSERT INTO ship_appearance_actions(universe,account,request_id,action) VALUES($1,$2,$3,$4)").bind(b.universe.0).bind(b.account.0).bind(request).bind(Json(value)).execute(&mut *tx).await.map_err(db_error)?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }

    pub(crate) async fn read_ship_artifact(
        &self,
        account: AccountId,
        id: Uuid,
    ) -> Result<Vec<ShipStoredVariant>, StoreError> {
        let variants: Json<Vec<ShipStoredVariant>> =
            sqlx::query_scalar("SELECT variants FROM ship_artifacts WHERE id=$1 AND account=$2")
                .bind(id)
                .bind(account.0)
                .fetch_optional(self.read_pool()?)
                .await
                .map_err(db_error)?
                .ok_or(StoreError::NotFound)?;
        Ok(variants.0)
    }
    /// Cursor scanning is bounded, and does not starve later empires.
    pub async fn ship_appearance_bindings(
        &self,
        after: Option<(Uuid, Uuid)>,
    ) -> Result<Vec<Binding>, StoreError> {
        let rows=sqlx::query("SELECT DISTINCT e.universe,e.account,u.epoch,m.player FROM empire_ship_equipment e JOIN universes u ON u.id=e.universe JOIN universe_memberships m ON m.universe=e.universe AND m.account=e.account WHERE e.design_id IS NOT NULL AND ($1::uuid IS NULL OR (e.universe,e.account)>($1,$2)) ORDER BY e.universe,e.account LIMIT 32")
            .bind(after.map(|x|x.0)).bind(after.map(|x|x.1)).fetch_all(self.read_pool()?).await.map_err(db_error)?;
        rows.into_iter()
            .map(|r| {
                Ok(Binding {
                    universe: UniverseId(r.try_get("universe").map_err(db_error)?),
                    account: AccountId(r.try_get("account").map_err(db_error)?),
                    player: PlayerId(r.try_get("player").map_err(db_error)?),
                    epoch: Epoch(r.try_get("epoch").map_err(db_error)?),
                })
            })
            .collect()
    }
    pub async fn claim_ship_render(&self) -> Result<Option<ShipRenderJob>, StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        sqlx::query("UPDATE ship_render_requests r SET stage='superseded',lease=NULL,lease_until=NULL WHERE r.stage='queued' AND NOT EXISTS(SELECT 1 FROM empire_ship_equipment e JOIN universe_memberships m ON m.universe=e.universe AND m.account=e.account JOIN universes u ON u.id=e.universe WHERE e.latest_request=r.id AND m.player=r.player AND u.epoch=r.epoch)").execute(&mut *tx).await.map_err(db_error)?;
        // Expired leases are recoverable. A fresh lease UUID fences old processes.
        sqlx::query("UPDATE ship_render_requests SET stage=CASE WHEN cancel_requested THEN 'canceled' WHEN stage IN ('rendering','preparing') THEN 'failed' ELSE stage END,error=CASE WHEN stage IN ('rendering','preparing') THEN 'Render interrupted; retry available' ELSE error END,lease=NULL,lease_until=NULL WHERE lease_until<clock_timestamp() AND lease IS NOT NULL").execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("UPDATE ship_render_requests r SET stage='queued',error=NULL WHERE r.stage='failed' AND r.error='Render interrupted; retry available' AND EXISTS(SELECT 1 FROM empire_ship_equipment e WHERE e.latest_request=r.id) AND NOT EXISTS(SELECT 1 FROM ship_render_requests pending WHERE pending.universe=r.universe AND pending.account=r.account AND pending.target=r.target AND pending.stage='queued')").execute(&mut *tx).await.map_err(db_error)?;
        let row=sqlx::query("SELECT r.id,r.account,r.input,r.universe,r.player,r.epoch FROM ship_render_requests r JOIN universes u ON u.id=r.universe AND u.epoch=r.epoch JOIN universe_memberships m ON m.universe=r.universe AND m.account=r.account AND m.player=r.player WHERE r.stage='queued' AND r.not_before<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM ship_render_requests running WHERE running.universe=r.universe AND running.account=r.account AND running.target=r.target AND running.lease IS NOT NULL) ORDER BY r.created_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1").fetch_optional(&mut *tx).await.map_err(db_error)?;
        let job = if let Some(row) = row {
            let id: Uuid = row.try_get("id").map_err(db_error)?;
            let lease = Uuid::new_v4();
            sqlx::query("UPDATE ship_render_requests SET stage='rendering',publication_valid_until=NULL,lease=$2,lease_until=clock_timestamp()+interval '120 seconds' WHERE id=$1").bind(id).bind(lease).execute(&mut *tx).await.map_err(db_error)?;
            let mut input: Value = row.try_get::<Json<Value>, _>("input").map_err(db_error)?.0;
            input["request_id"] = json!(id);
            Some(ShipRenderJob {
                binding: Binding {
                    universe: UniverseId(row.try_get("universe").map_err(db_error)?),
                    account: AccountId(row.try_get("account").map_err(db_error)?),
                    player: PlayerId(row.try_get("player").map_err(db_error)?),
                    epoch: Epoch(row.try_get("epoch").map_err(db_error)?),
                },
                id,
                lease,
                account: AccountId(row.try_get("account").map_err(db_error)?),
                input,
            })
        } else {
            None
        };
        tx.commit().await.map_err(db_error)?;
        Ok(job)
    }
    pub async fn ship_render_wanted(&self, job: &ShipRenderJob) -> Result<bool, StoreError> {
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ship_render_requests r JOIN empire_ship_equipment e ON e.latest_request=r.id JOIN universes u ON u.id=r.universe AND u.epoch=r.epoch JOIN universe_memberships m ON m.universe=r.universe AND m.account=r.account AND m.player=r.player WHERE r.id=$1 AND r.lease=$2 AND r.lease_until>clock_timestamp() AND NOT r.cancel_requested AND r.stage IN ('rendering','preparing') AND r.emblem_revision=COALESCE((SELECT revision FROM empire_insignias WHERE universe=r.universe AND account=r.account),0))").bind(job.id).bind(job.lease).fetch_one(self.read_pool()?).await.map_err(db_error)
    }
    pub async fn defer_ship_render(
        &self,
        job: &ShipRenderJob,
        seconds: u64,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        sqlx::query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE")
            .bind(job.account.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("UPDATE ship_render_requests r SET stage=CASE WHEN r.cancel_requested THEN 'canceled' WHEN EXISTS(SELECT 1 FROM empire_ship_equipment e WHERE e.latest_request=r.id) THEN 'queued' ELSE 'superseded' END,lease=NULL,lease_until=NULL,not_before=clock_timestamp()+make_interval(secs=>$3),error=NULL WHERE id=$1 AND lease=$2")
            .bind(job.id).bind(job.lease).bind(seconds.clamp(1,60) as f64).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
    pub async fn prepare_ship_render(
        &self,
        job: &ShipRenderJob,
        valid_until: i64,
    ) -> Result<bool, StoreError> {
        if !self.ship_render_wanted(job).await? {
            return Ok(false);
        }
        Ok(sqlx::query("UPDATE ship_render_requests SET stage='preparing',publication_valid_until=$3 WHERE id=$1 AND lease=$2 AND lease_until>clock_timestamp() AND stage='rendering' AND $3>floor(extract(epoch FROM clock_timestamp()))::bigint").bind(job.id).bind(job.lease).bind(valid_until).execute(self.admission_pool()?).await.map_err(db_error)?.rows_affected()==1)
    }
    pub async fn finish_ship_render(
        &self,
        job: &ShipRenderJob,
        result: Result<(Uuid, Vec<ShipStoredVariant>), String>,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        // Same account lock as emblem/equipment writers: completion observes a
        // current source revision, never a concurrent partially committed edit.
        sqlx::query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE")
            .bind(job.account.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
        let row=sqlx::query("SELECT r.*,e.latest_request,EXISTS(SELECT 1 FROM universes u JOIN universe_memberships m ON m.universe=u.id WHERE u.id=r.universe AND u.epoch=r.epoch AND m.account=r.account AND m.player=r.player) AS binding_current,COALESCE((SELECT revision FROM empire_insignias WHERE universe=r.universe AND account=r.account),0) AS current_emblem_revision FROM ship_render_requests r JOIN empire_ship_equipment e ON e.universe=r.universe AND e.account=r.account AND e.target=r.target WHERE r.id=$1 FOR UPDATE OF e,r").bind(job.id).fetch_optional(&mut *tx).await.map_err(db_error)?;
        if let Some(r) = row {
            let lease: Option<Uuid> = r.try_get("lease").map_err(db_error)?;
            if lease != Some(job.lease) {
                return Ok(());
            }
            let stage: String = r.try_get("stage").map_err(db_error)?;
            let canceled: bool = r.try_get("cancel_requested").map_err(db_error)?;
            let latest: Option<Uuid> = r.try_get("latest_request").map_err(db_error)?;
            let alive: bool = sqlx::query_scalar(
                "SELECT lease_until>clock_timestamp() FROM ship_render_requests WHERE id=$1",
            )
            .bind(job.id)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
            let source_current = r.try_get::<bool, _>("binding_current").map_err(db_error)?
                && r.try_get::<i64, _>("emblem_revision").map_err(db_error)?
                    == r.try_get::<i64, _>("current_emblem_revision")
                        .map_err(db_error)?;
            let (stage, error) = if canceled || stage == "canceled" {
                ("canceled", None)
            } else if latest != Some(job.id) {
                // Only actual replacement is terminal supersession. A selected
                // request must remain refreshable/retryable on every stale path.
                ("superseded", None)
            } else if !source_current || !matches!(stage.as_str(), "rendering" | "preparing") {
                ("failed", Some(SOURCE_REFRESH_REQUIRED.to_owned()))
            } else if !alive {
                // Same recovery marker as claim-time lease expiry. This ordering
                // also covers expire -> finish -> claim, without stranding Load.
                (
                    "failed",
                    Some("Render interrupted; retry available".to_owned()),
                )
            } else {
                match result {
                    Ok((id, variants)) => {
                        let deadline: Option<i64> =
                            r.try_get("publication_valid_until").map_err(db_error)?;
                        let authorized:bool = sqlx::query_scalar("SELECT $1::bigint>floor(extract(epoch FROM clock_timestamp()))::bigint")
                            .bind(deadline.unwrap_or(0)).fetch_one(&mut *tx).await.map_err(db_error)?;
                        if stage != "preparing" || !authorized {
                            ("failed", Some(ACCESS_REFRESH_REQUIRED.to_owned()))
                        } else {
                            sqlx::query("INSERT INTO ship_artifacts(id,account,request,variants) VALUES($1,$2,$3,$4)").bind(id).bind(job.account.0).bind(job.id).bind(Json(variants)).execute(&mut *tx).await.map_err(db_error)?;
                            // Recheck at the actual activation write as well: an
                            // awaited object/SQL write cannot outlive access evidence.
                            let activated=sqlx::query("UPDATE empire_ship_equipment SET artwork=$2 WHERE latest_request=$1 AND $3::bigint>floor(extract(epoch FROM clock_timestamp()))::bigint AND EXISTS(SELECT 1 FROM ship_render_requests WHERE id=$1 AND lease=$4 AND lease_until>clock_timestamp())")
                                .bind(job.id).bind(id).bind(deadline.unwrap_or(0)).bind(job.lease).execute(&mut *tx).await.map_err(db_error)?.rows_affected()==1;
                            if activated {
                                ("ready", None)
                            } else {
                                let lease_alive:bool=sqlx::query_scalar("SELECT lease_until>clock_timestamp() FROM ship_render_requests WHERE id=$1")
                                    .bind(job.id).fetch_one(&mut *tx).await.map_err(db_error)?;
                                (
                                    "failed",
                                    Some(
                                        if lease_alive {
                                            ACCESS_REFRESH_REQUIRED
                                        } else {
                                            "Render interrupted; retry available"
                                        }
                                        .to_owned(),
                                    ),
                                )
                            }
                        }
                    }
                    Err(error) => ("failed", Some(error)),
                }
            };
            sqlx::query("UPDATE ship_render_requests SET stage=$3,error=$4,lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2").bind(job.id).bind(job.lease).bind(stage).bind(error).execute(&mut *tx).await.map_err(db_error)?;
        }
        sqlx::query("UPDATE ship_render_requests r SET stage='superseded',lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2 AND NOT EXISTS(SELECT 1 FROM empire_ship_equipment e WHERE e.universe=r.universe AND e.account=r.account AND e.target=r.target)").bind(job.id).bind(job.lease).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
}
fn check_target_revision(target: &str, expected: i64, actual: i64) -> Result<(), ServiceError> {
    if target != SHIP_TARGET {
        return Err(ServiceError::Malformed);
    }
    if expected != actual {
        return Err(ServiceError::Conflict);
    }
    Ok(())
}
async fn refresh(
    tx: &mut PgConnection,
    b: Binding,
    env: &ShipRenderEnvironment,
    force: bool,
) -> Result<(), ServiceError> {
    let row=sqlx::query("SELECT e.revision,r.input,r.emblem_revision,r.error,r.stage,r.epoch,r.player,d.recipe FROM empire_ship_equipment e LEFT JOIN ship_render_requests r ON r.id=e.latest_request JOIN ship_design_revisions d ON d.account=e.account AND d.id=e.design_id AND d.revision=e.design_revision WHERE e.universe=$1 AND e.account=$2 AND e.target=$3").bind(b.universe.0).bind(b.account.0).bind(SHIP_TARGET).fetch_optional(&mut *tx).await.map_err(db_error)?;
    let Some(row) = row else {
        return Ok(());
    };
    let recipe: Json<ShipPaintRecipe> = row.try_get("recipe").map_err(db_error)?;
    // Retain unavailable choices. Render a free paint fallback without rewriting them.
    let input = env.input(&recipe.0).unwrap_or_else(|_| {
        let mut fallback = recipe.0.clone();
        fallback.primary = "free-ivory".into();
        fallback.accent = "free-blue".into();
        env.input(&fallback).expect("guaranteed free dyes")
    });
    let old: Option<Json<Value>> = row.try_get("input").map_err(db_error)?;
    let needs_refresh = row
        .try_get::<Option<String>, _>("stage")
        .map_err(db_error)?
        .as_deref()
        == Some("failed")
        && row
            .try_get::<Option<String>, _>("error")
            .map_err(db_error)?
            .is_some_and(|error| {
                matches!(
                    error.as_str(),
                    ACCESS_REFRESH_REQUIRED | SOURCE_REFRESH_REQUIRED
                )
            });
    if !force
        && !needs_refresh
        && row.try_get::<Option<Uuid>, _>("epoch").map_err(db_error)? == Some(b.epoch.0)
        && row.try_get::<Option<Uuid>, _>("player").map_err(db_error)? == Some(b.player.0)
        && old.is_some_and(|v| v.0 == input)
        && row
            .try_get::<Option<i64>, _>("emblem_revision")
            .map_err(db_error)?
            == Some(env.emblem_revision)
    {
        return Ok(());
    }
    sqlx::query("UPDATE ship_render_requests SET stage='superseded' WHERE universe=$1 AND account=$2 AND target=$3 AND stage='queued'").bind(b.universe.0).bind(b.account.0).bind(SHIP_TARGET).execute(&mut *tx).await.map_err(db_error)?;
    let id = Uuid::new_v4();
    let revision: i64 = row.try_get("revision").map_err(db_error)?;
    sqlx::query("INSERT INTO ship_render_requests(id,universe,account,target,equipment_revision,input,emblem_revision,player,epoch,stage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued')").bind(id).bind(b.universe.0).bind(b.account.0).bind(SHIP_TARGET).bind(revision).bind(Json(&input)).bind(env.emblem_revision).bind(b.player.0).bind(b.epoch.0).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("UPDATE empire_ship_equipment SET latest_request=$3 WHERE universe=$1 AND account=$2 AND target=$4").bind(b.universe.0).bind(b.account.0).bind(id).bind(SHIP_TARGET).execute(&mut *tx).await.map_err(db_error)?;
    Ok(())
}

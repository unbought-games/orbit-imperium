use crate::{PgStore, db_error};
use orbit_application::*;
use sqlx::Row;

impl PgStore {
    pub(crate) async fn read_insignia_library(
        &self,
        b: Binding,
    ) -> Result<InsigniaLibrary, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let mut designs = sqlx::query("SELECT id,name,recipe,revision FROM insignia_designs WHERE account=$1 ORDER BY name,id")
            .bind(b.account.0).fetch_all(&mut *tx).await.map_err(db_error)?.into_iter().map(|row| Ok(InsigniaDesign {
                id: row.try_get("id").map_err(db_error)?, name: row.try_get("name").map_err(db_error)?,
                recipe: row.try_get::<sqlx::types::Json<InsigniaRecipe>,_>("recipe").map_err(db_error)?.0,
                revision: row.try_get("revision").map_err(db_error)?,
            })).collect::<Result<Vec<_>, StoreError>>()?;
        let equipped = sqlx::query_scalar::<_, Option<uuid::Uuid>>(
            "SELECT design_id FROM empire_insignias WHERE universe=$1 AND account=$2",
        )
        .bind(b.universe.0)
        .bind(b.account.0)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?
        .flatten();
        // The selected template may have changed in another universe. Show this
        // empire's authored recipe while keeping the template concurrency token.
        let owned: Option<sqlx::types::Json<InsigniaRecipe>> = sqlx::query_scalar(
            "SELECT recipe FROM empire_insignias WHERE universe=$1 AND account=$2 AND recipe IS NOT NULL")
            .bind(b.universe.0).bind(b.account.0).fetch_optional(&mut *tx).await.map_err(db_error)?;
        if let (Some(id), Some(recipe)) = (equipped, owned) {
            if let Some(design) = designs.iter_mut().find(|d| d.id == id) {
                design.recipe = recipe.0;
            } else {
                // A deleted account template cannot remove this empire's emblem.
                // Revision zero permits saving it as a new reusable template.
                designs.push(InsigniaDesign {
                    id,
                    name: "Empire emblem".into(),
                    recipe: recipe.0,
                    revision: 0,
                });
            }
        }
        let permanent_symbols = sqlx::query_scalar(
            "SELECT item_id FROM cosmetic_grants WHERE account=$1 AND kind='insignia' ORDER BY item_id",
        )
        .bind(b.account.0)
        .fetch_all(&mut *tx)
        .await
        .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(InsigniaLibrary {
            designs,
            equipped,
            permanent_symbols,
        })
    }

    pub(crate) async fn write_insignia(
        &self,
        b: Binding,
        action: InsigniaAction,
        catalog: &InsigniaCatalog,
        policy: CosmeticPolicy,
        evidence: SupporterEvidence,
    ) -> Result<(), ServiceError> {
        if let InsigniaAction::Save { design, .. } = &action
            && !design.valid()
        {
            return Err(ServiceError::Malformed);
        }
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        sqlx::query("SELECT set_config('orbit.empire_insignia_writer','1',true)")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        // Same universe-before-account lock order as enrollment; fence universe replacement.
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
        let grants: Vec<String> = sqlx::query_scalar(
            "SELECT item_id FROM cosmetic_grants WHERE account=$1 AND kind='insignia'",
        )
        .bind(b.account.0)
        .fetch_all(&mut *tx)
        .await
        .map_err(db_error)?;
        // Real wall clock, not the accelerated simulation clock, governs membership evidence.
        let now: i64 =
            sqlx::query_scalar("SELECT floor(extract(epoch from clock_timestamp()))::bigint")
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        let authorize = |recipe: &InsigniaRecipe| match recipe_access(
            catalog, recipe, policy, &grants, evidence, now,
        ) {
            InsigniaAccess::Available => Ok(()),
            InsigniaAccess::SupporterRequired => Err(ServiceError::Forbidden),
            InsigniaAccess::Unavailable => Err(ServiceError::Unavailable),
            InsigniaAccess::NotInstalled => Err(ServiceError::NotFound),
        };
        let equip = match action {
            InsigniaAction::Load => None,
            InsigniaAction::Save { design, equip } => {
                if policy == CosmeticPolicy::Supporter && !catalog.dyes().is_empty() {
                    let previous: Option<sqlx::types::Json<InsigniaRecipe>> = sqlx::query_scalar(
                        "SELECT COALESCE((SELECT recipe FROM empire_insignias WHERE universe=$3 AND account=$1 AND design_id=$2),(SELECT recipe FROM insignia_designs WHERE account=$1 AND id=$2))",
                    )
                    .bind(b.account.0)
                    .bind(design.id).bind(b.universe.0)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
                    if !named_color_edits(previous.as_ref().map(|v| &v.0), &design.recipe) {
                        return Err(ServiceError::Forbidden);
                    }
                }
                authorize(&design.recipe)?;
                if design.revision == 0 {
                    let count: i64 = sqlx::query_scalar(
                        "SELECT count(*) FROM insignia_designs WHERE account=$1",
                    )
                    .bind(b.account.0)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
                    if count >= 32 {
                        return Err(ServiceError::Conflict);
                    }
                    sqlx::query("INSERT INTO insignia_designs(account,id,name,recipe,revision) VALUES($1,$2,$3,$4,1)")
                        .bind(b.account.0).bind(design.id).bind(design.name.trim()).bind(sqlx::types::Json(&design.recipe)).execute(&mut *tx).await.map_err(db_error)?;
                } else {
                    let result = sqlx::query("UPDATE insignia_designs SET name=$3,recipe=$4,revision=revision+1 WHERE account=$1 AND id=$2 AND revision=$5")
                        .bind(b.account.0).bind(design.id).bind(design.name.trim()).bind(sqlx::types::Json(&design.recipe)).bind(design.revision).execute(&mut *tx).await.map_err(db_error)?;
                    if result.rows_affected() != 1 {
                        return Err(ServiceError::Conflict);
                    }
                }
                let selected: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM empire_insignias WHERE universe=$1 AND account=$2 AND design_id=$3)")
                    .bind(b.universe.0).bind(b.account.0).bind(design.id).fetch_one(&mut *tx).await.map_err(db_error)?;
                (equip || selected).then_some(Some(design.id))
            }
            InsigniaAction::Equip { design_id } => {
                if let Some(id) = design_id {
                    let recipe: sqlx::types::Json<InsigniaRecipe> = sqlx::query_scalar(
                        "SELECT recipe FROM insignia_designs WHERE account=$1 AND id=$2",
                    )
                    .bind(b.account.0)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(db_error)?
                    .ok_or(StoreError::NotFound)?;
                    authorize(&recipe)?;
                }
                Some(design_id)
            }
            InsigniaAction::Delete { design_id } => {
                sqlx::query("UPDATE empire_insignias SET design_id=NULL,recipe=NULL,revision=revision+1 WHERE universe=$1 AND account=$2 AND design_id=$3")
                    .bind(b.universe.0).bind(b.account.0).bind(design_id).execute(&mut *tx).await.map_err(db_error)?;
                sqlx::query("DELETE FROM insignia_designs WHERE account=$1 AND id=$2")
                    .bind(b.account.0)
                    .bind(design_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
                None
            }
        };
        if let Some(design_id) = equip {
            sqlx::query("INSERT INTO empire_insignias(universe,account,design_id,recipe,revision) VALUES($1,$2,$3,(SELECT recipe FROM insignia_designs WHERE account=$2 AND id=$3),1) ON CONFLICT(universe,account) DO UPDATE SET design_id=excluded.design_id,recipe=excluded.recipe,revision=empire_insignias.revision+1")
                .bind(b.universe.0).bind(b.account.0).bind(design_id).execute(&mut *tx).await.map_err(db_error)?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }

    pub(crate) async fn read_equipped_insignias(
        &self,
        universe: UniverseId,
        players: Vec<PlayerId>,
    ) -> Result<EquippedInsignias, StoreError> {
        sqlx::query("SELECT m.player,e.recipe,ARRAY(SELECT item_id FROM cosmetic_grants g WHERE g.account=m.account AND g.kind='insignia') AS grants FROM universe_memberships m JOIN empire_insignias e ON e.universe=m.universe AND e.account=m.account WHERE m.universe=$1 AND m.player=ANY($2) AND e.recipe IS NOT NULL")
            .bind(universe.0).bind(players.iter().map(|p|p.0).collect::<Vec<_>>()).fetch_all(self.read_pool()?).await.map_err(db_error)?
            .into_iter().map(|r| Ok((PlayerId(r.try_get("player").map_err(db_error)?), (r.try_get::<sqlx::types::Json<InsigniaRecipe>,_>("recipe").map_err(db_error)?.0, r.try_get("grants").map_err(db_error)?)))).collect()
    }
}

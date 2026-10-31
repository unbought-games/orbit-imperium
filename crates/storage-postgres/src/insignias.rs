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
        let designs = sqlx::query("SELECT id,name,recipe,revision FROM insignia_designs WHERE account=$1 ORDER BY name,id")
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
        let permanent_symbols = sqlx::query_scalar(
            "SELECT symbol FROM insignia_grants WHERE account=$1 ORDER BY symbol",
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
        policy: CosmeticPolicy,
        evidence: SupporterEvidence,
    ) -> Result<(), ServiceError> {
        if let InsigniaAction::Save { design, .. } = &action
            && !design.valid()
        {
            return Err(ServiceError::Malformed);
        }
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
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
        let grants: Vec<String> =
            sqlx::query_scalar("SELECT symbol FROM insignia_grants WHERE account=$1")
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
        let authorize = |symbol: &str| match insignia_access(symbol, policy, &grants, evidence, now)
        {
            InsigniaAccess::Available => Ok(()),
            InsigniaAccess::SupporterRequired => Err(ServiceError::Forbidden),
            InsigniaAccess::Unavailable => Err(ServiceError::Unavailable),
        };
        let equip = match action {
            InsigniaAction::Load => None,
            InsigniaAction::Save { design, equip } => {
                authorize(&design.recipe.symbol)?;
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
                equip.then_some(Some(design.id))
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
                    authorize(&recipe.symbol)?;
                }
                Some(design_id)
            }
            InsigniaAction::Delete { design_id } => {
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
            sqlx::query("INSERT INTO empire_insignias(universe,account,design_id) VALUES($1,$2,$3) ON CONFLICT(universe,account) DO UPDATE SET design_id=excluded.design_id")
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
        sqlx::query("SELECT m.player,d.recipe,ARRAY(SELECT symbol FROM insignia_grants g WHERE g.account=m.account) AS grants FROM universe_memberships m JOIN empire_insignias e ON e.universe=m.universe AND e.account=m.account JOIN insignia_designs d ON d.account=e.account AND d.id=e.design_id WHERE m.universe=$1 AND m.player=ANY($2)")
            .bind(universe.0).bind(players.iter().map(|p|p.0).collect::<Vec<_>>()).fetch_all(self.read_pool()?).await.map_err(db_error)?
            .into_iter().map(|r| Ok((PlayerId(r.try_get("player").map_err(db_error)?), (r.try_get::<sqlx::types::Json<InsigniaRecipe>,_>("recipe").map_err(db_error)?.0, r.try_get("grants").map_err(db_error)?)))).collect()
    }
}

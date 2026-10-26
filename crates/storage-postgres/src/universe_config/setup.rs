use super::*;
use uuid::Uuid;

#[derive(Debug, serde::Serialize)]
pub struct SetupOutcome {
    pub status: &'static str,
    pub universe: UniverseId,
    pub name: String,
    pub configuration: UniverseConfigDocument,
}

impl PgStore {
    /// Migrations are performed by the caller before this atomic first-world operation.
    pub async fn setup_universe(&self, request: &UniverseSetup) -> Result<SetupOutcome, String> {
        request.validate()?;
        let mut tx = self.config_tx().await.map_err(operator_error)?;
        // Also serializes with universe create/update, which need not know about setup.
        // Ordinary reads continue; no permanent setup marker or copied state is needed.
        sqlx::query("LOCK TABLE universes IN SHARE ROW EXCLUSIVE MODE")
            .execute(&mut *tx)
            .await
            .map_err(db_error)
            .map_err(operator_error)?;
        let worlds: Vec<(Uuid, String)> =
            sqlx::query_as("SELECT id,name FROM universes ORDER BY id")
                .fetch_all(&mut *tx)
                .await
                .map_err(db_error)
                .map_err(operator_error)?;
        let selected = match request.universe {
            Some(id) => worlds.iter().find(|(saved, _)| *saved == id.0),
            None if worlds.len() > 1 => return Err("multiple universes exist; use setup --universe UUID (or ORBIT_UNIVERSE_ID) to select one".into()),
            None => worlds.first(),
        };
        let outcome = if let Some((id, name)) = selected {
            let universe = UniverseId(*id);
            let row = policy_row(&mut tx, universe, "FOR SHARE").await.map_err(operator_error)?
                .ok_or("existing universe has no policy; follow the configuration bridge upgrade guide; setup does not convert retained worlds")?;
            let configuration = decode_policy(&mut tx, universe, row)
                .await
                .map_err(operator_error)?;
            request.check_existing(&configuration, name)?;
            SetupOutcome {
                status: "already_initialized",
                universe,
                name: name.clone(),
                configuration,
            }
        } else {
            if !worlds.is_empty() {
                return Err("requested universe does not exist in this nonempty database; inspect universe list, or use universe create explicitly for additional worlds".into());
            }
            let universe = request
                .universe
                .unwrap_or_else(|| UniverseId(Uuid::new_v4()));
            let configuration = create_in_tx(&mut tx, &request.creation(universe)).await?;
            if let Some(name) = &request.name {
                sqlx::query("UPDATE universes SET name=$2 WHERE id=$1")
                    .bind(universe.0)
                    .bind(name)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)
                    .map_err(operator_error)?;
            }
            let name = sqlx::query_scalar("SELECT name FROM universes WHERE id=$1")
                .bind(universe.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)
                .map_err(operator_error)?;
            SetupOutcome {
                status: "created",
                universe,
                name,
                configuration,
            }
        };
        tx.commit()
            .await
            .map_err(db_error)
            .map_err(operator_error)?;
        Ok(outcome)
    }
}

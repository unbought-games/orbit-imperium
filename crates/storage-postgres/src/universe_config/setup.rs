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
        let creation = request.creation(
            request
                .universe
                .unwrap_or_else(|| UniverseId(Uuid::new_v4())),
        );
        // Rule assembly/validation is CPU work, not database work. In particular,
        // a second first-run caller must not spend its lock budget waiting for it.
        let prepared_rules =
            standard_signup_rules(creation.immutable.profile()?, creation.immutable.speed)
                .map_err(|error| format!("immutable: {error}"))?;
        // A peer may be performing first-world inserts. Do not hold a pool
        // connection or spend a SQL lock timeout waiting for that whole workflow.
        // Only this known lock conflict is retryable; all other errors propagate.
        let wait_until = tokio::time::Instant::now() + std::time::Duration::from_secs(3);
        let mut tx = loop {
            let mut candidate = self.config_tx().await.map_err(operator_error)?;
            match sqlx::query("LOCK TABLE universes IN SHARE ROW EXCLUSIVE MODE NOWAIT")
                .execute(&mut *candidate)
                .await
            {
                Ok(_) => break candidate,
                Err(error)
                    if error.as_database_error().and_then(|e| e.code()).as_deref()
                        == Some("55P03")
                        && tokio::time::Instant::now() < wait_until =>
                {
                    candidate
                        .rollback()
                        .await
                        .map_err(db_error)
                        .map_err(operator_error)?;
                    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
                }
                Err(error) => return Err(operator_error(db_error(error))),
            }
        };
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
            let universe = creation.universe;
            let configuration = create_prepared_in_tx(&mut tx, &creation, &prepared_rules).await?;
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

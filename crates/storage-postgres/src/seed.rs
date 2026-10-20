use crate::*;
use orbit_application::hash_password;
use orbit_engine::*;
use uuid::Uuid;
impl PgStore {
    pub async fn seed(
        &self,
        universe: UniverseId,
        at: i64,
        speed: i32,
        passwords: &[String; 2],
    ) -> Result<(), StoreError> {
        self.seed_world(universe, at, speed, passwords, false).await
    }
    pub async fn reset(
        &self,
        universe: UniverseId,
        at: i64,
        speed: i32,
        passwords: &[String; 2],
    ) -> Result<(), StoreError> {
        self.seed_world(universe, at, speed, passwords, true).await
    }
    async fn seed_world(
        &self,
        universe: UniverseId,
        at: i64,
        speed: i32,
        passwords: &[String; 2],
        reset: bool,
    ) -> Result<(), StoreError> {
        self.check_migrations().await?;
        if !(0..=MAX_WIRE_MS).contains(&at)
            || !(1..=100).contains(&speed)
            || passwords.iter().any(|p| p.len() < 12)
        {
            return Err(StoreError::Conflict);
        }
        let hashes = passwords
            .iter()
            .map(|p| hash_password(p).map_err(|_| StoreError::CorruptData))
            .collect::<Result<Vec<_>, _>>()?;
        let mut tx = self.begin_tx(&self.pool).await?;
        if reset {
            let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(901321)")
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
            if !locked {
                return Err(StoreError::Conflict);
            }
            let development: bool =
                sqlx::query_scalar("SELECT development FROM universes WHERE id=$1 FOR UPDATE")
                    .bind(universe.0)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(db_error)?
                    .ok_or(StoreError::NotFound)?;
            if !development {
                return Err(StoreError::Conflict);
            }
            let accounts: Vec<Uuid> =
                sqlx::query_scalar("SELECT account FROM universe_memberships WHERE universe=$1")
                    .bind(universe.0)
                    .fetch_all(&mut *tx)
                    .await
                    .map_err(db_error)?;
            sqlx::query("DELETE FROM reports WHERE universe=$1")
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM fleets WHERE universe=$1")
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM constructions WHERE universe=$1")
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM commands WHERE universe=$1")
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM bodies WHERE universe=$1")
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM viewer_heads WHERE universe=$1")
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM universes WHERE id=$1")
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM sessions WHERE account=ANY($1)")
                .bind(&accounts)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM accounts WHERE id=ANY($1) AND NOT EXISTS(SELECT 1 FROM universe_memberships WHERE account=accounts.id)").bind(&accounts).execute(&mut *tx).await.map_err(db_error)?;
        }
        let rules = Ruleset::from_json(include_bytes!("../../../rules/shared-foundation-r1.json"))
            .and_then(|r| r.with_speed(speed))
            .map_err(|_| StoreError::CorruptData)?;
        sqlx::query(
            "INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        )
        .bind(&rules.hash.0)
        .bind(&rules.artifact.id)
        .bind(sqlx::types::Json(&rules))
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        sqlx::query(
            "INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash) VALUES($1,$2,true,$3,$4,$5)",
        )
        .bind(universe.0)
        .bind(Uuid::new_v4())
        .bind(speed)
        .bind(at)
        .bind(&rules.hash.0)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        sqlx::query("INSERT INTO universe_runtime(universe,frontier) VALUES($1,$2)")
            .bind(universe.0)
            .bind(at)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        for (i, name) in ["alpha", "beta"].iter().enumerate() {
            let account = Uuid::new_v4();
            let player = Uuid::new_v4();
            let body = Uuid::new_v4();
            sqlx::query("INSERT INTO accounts(id,name,password_hash) VALUES($1,$2,$3)")
                .bind(account)
                .bind(name)
                .bind(&hashes[i])
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("INSERT INTO players(id,universe) VALUES($1,$2)")
                .bind(player)
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query(
                "INSERT INTO universe_memberships(universe,account,player) VALUES($1,$2,$3)",
            )
            .bind(universe.0)
            .bind(account)
            .bind(player)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
            sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at) VALUES($1,$2,$3,'Planet',1,1,$4,163,40,$5,$6,$7)").bind(body).bind(universe.0).bind(player).bind(i as i32+8).bind(sqlx::types::Json(Resources::all(1000*SCALE))).bind(sqlx::types::Json(Resources::all(0))).bind(at).execute(&mut *tx).await.map_err(db_error)?;
            sqlx::query("INSERT INTO legacy_body_capacities(body,capacity) VALUES($1,$2)")
                .bind(body)
                .bind(sqlx::types::Json(Resources::all(10000 * SCALE)))
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            for (building, level) in [
                ("MetalMine", 1),
                ("CrystalMine", 1),
                ("DeuteriumSynthesizer", 0),
                ("SolarPlant", 2),
            ] {
                sqlx::query("INSERT INTO building_levels VALUES($1,$2,$3)")
                    .bind(body)
                    .bind(building)
                    .bind(i64::from(level))
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
            }
            sqlx::query(
                "INSERT INTO inventories(body,owner,item,count) VALUES($1,$2,'{\"kind\":\"Ship\",\"id\":\"SmallCargo\"}',2)",
            )
            .bind(body)
            .bind(player)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
            for (research, level) in [("CombustionDrive", 1i64), ("ComputerTechnology", 0i64)] {
                sqlx::query("INSERT INTO research_levels(owner,research,level) VALUES($1,$2,$3)")
                    .bind(player)
                    .bind(research)
                    .bind(level)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
            }
            for (kind, key) in [
                ("research".to_owned(), player),
                ("fleets".to_owned(), player),
                ("constructions".to_owned(), body),
                (format!("inventory:{player}"), body),
            ] {
                sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
                    .bind(universe.0)
                    .bind(kind)
                    .bind(key)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
            }
            sqlx::query("INSERT INTO viewer_heads(universe,player) VALUES($1,$2)")
                .bind(universe.0)
                .bind(player)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
}

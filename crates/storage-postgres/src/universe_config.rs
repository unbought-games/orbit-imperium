//! Authoritative policies and historical changes. Runtime decisions never cache a policy.
use crate::{PgStore, StoreError, db_error, ordering::Tx};
use orbit_application::*;
use orbit_engine::{Ruleset, UniverseId};
use sqlx::Row;

#[derive(Debug)]
pub struct UniverseConfigChange {
    pub document: UniverseConfigDocument,
    pub changed: bool,
}
fn operator_error(error: StoreError) -> String {
    match error {
        StoreError::Conflict => "universe already exists; use universe show to inspect it".into(),
        StoreError::NotFound => "universe not found; use universe list".into(),
        StoreError::CorruptData => "universe has invalid stored configuration or rules binding".into(),
        _ => "universe configuration storage unavailable; retry after checking database connectivity and contention".into(),
    }
}

impl PgStore {
    /// Configuration administration validates schema independently of runtime health.
    pub async fn check_universe_config_schema(&self) -> Result<(), String> {
        self.check_migrations().await.map_err(|e| e.to_string())
    }
    async fn config_tx(&self) -> Result<Tx<'static>, StoreError> {
        self.bounded_policy_tx(&self.pool).await
    }
    pub(crate) async fn bounded_policy_tx(
        &self,
        pool: &sqlx::PgPool,
    ) -> Result<Tx<'static>, StoreError> {
        let mut tx = self.begin_tx(pool).await?;
        for setting in [
            "SET LOCAL lock_timeout='250ms'",
            "SET LOCAL statement_timeout='1500ms'",
        ] {
            sqlx::query(setting)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        Ok(tx)
    }
    pub async fn has_universe_policy(&self, universe: UniverseId) -> Result<bool, StoreError> {
        let mut tx = self.config_tx().await?;
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM universe_policies WHERE universe=$1)")
            .bind(universe.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)
    }
    pub fn with_legacy_universe_config(
        mut self,
        commands_per_minute: i64,
    ) -> Result<Self, StoreError> {
        if !(1..=10_000).contains(&commands_per_minute) {
            return Err(StoreError::Conflict);
        }
        self.legacy_universe_config = true;
        self.admission_limit = commands_per_minute;
        Ok(self)
    }
    pub async fn create_universe(
        &self,
        request: &UniverseCreate,
    ) -> Result<UniverseConfigDocument, String> {
        request.validate()?;
        let rules =
            Ruleset::signup_with_speed(request.immutable.profile()?, request.immutable.speed)
                .map_err(|e| format!("immutable: {e}"))?;
        let mut tx = self.config_tx().await.map_err(operator_error)?;
        crate::enrollment::provision(&mut tx, request.universe, &rules)
            .await
            .map_err(operator_error)?;
        let document = UniverseConfigDocument {
            version: UNIVERSE_CONFIG_VERSION,
            universe: request.universe,
            base_revision: 0,
            immutable: request.immutable.clone(),
            policy: request.policy.clone(),
        };
        insert_policy(&mut tx, &document, "create")
            .await
            .map_err(operator_error)?;
        tx.commit()
            .await
            .map_err(db_error)
            .map_err(operator_error)?;
        Ok(document)
    }
    pub async fn universe_immutable(
        &self,
        universe: UniverseId,
    ) -> Result<UniverseImmutable, String> {
        let mut tx = self.config_tx().await.map_err(operator_error)?;
        immutable(&mut tx, universe).await.map_err(operator_error)
    }
    pub async fn universe_config(
        &self,
        universe: UniverseId,
    ) -> Result<UniverseConfigDocument, String> {
        let mut tx = self.config_tx().await.map_err(operator_error)?;
        let row = policy_row(&mut tx, universe, "").await.map_err(operator_error)?
            .ok_or_else(|| format!("universe {universe} has no policy; initialize it with the bridge release before serving"))?;
        decode_policy(&mut tx, universe, row)
            .await
            .map_err(operator_error)
    }
    pub async fn apply_universe_config(
        &self,
        desired: &UniverseConfigDocument,
    ) -> Result<UniverseConfigChange, String> {
        desired.validate()?;
        let mut tx = self.config_tx().await.map_err(operator_error)?;
        let row = policy_row(&mut tx, desired.universe, "FOR UPDATE")
            .await
            .map_err(operator_error)?
            .ok_or_else(|| {
                "universe has no policy; initialize it with the bridge release".to_string()
            })?;
        let current = decode_policy(&mut tx, desired.universe, row)
            .await
            .map_err(operator_error)?;
        config_diff(&current, desired)?;
        if current.policy == desired.policy {
            return Ok(UniverseConfigChange {
                document: current,
                changed: false,
            });
        }
        let revision = current
            .base_revision
            .checked_add(1)
            .ok_or("base_revision exhausted")?;
        let next = UniverseConfigDocument {
            base_revision: revision,
            ..desired.clone()
        };
        sqlx::query("UPDATE universe_policies SET revision=$2,signup_enabled=$3,max_players=$4,signup_per_minute=$5,commands_per_minute=$6 WHERE universe=$1")
            .bind(next.universe.0).bind(revision).bind(next.policy.signup_enabled).bind(next.policy.max_players.map(i64::from))
            .bind(i64::from(next.policy.signup_per_minute)).bind(i64::from(next.policy.commands_per_minute))
            .execute(&mut *tx).await.map_err(db_error).map_err(operator_error)?;
        audit(&mut tx, &next, Some(&current.policy), "apply")
            .await
            .map_err(operator_error)?;
        tx.commit()
            .await
            .map_err(db_error)
            .map_err(operator_error)?;
        Ok(UniverseConfigChange {
            document: next,
            changed: true,
        })
    }
    pub async fn initialize_universe_config(
        &self,
        desired: &UniverseConfigDocument,
    ) -> Result<UniverseConfigChange, String> {
        desired.validate()?;
        if desired.base_revision != 0 {
            return Err("base_revision must be zero for initialization".into());
        }
        let mut tx = self.config_tx().await.map_err(operator_error)?;
        // The initial policy FK needs a universe key lock. Take it before activation
        // serialization so legacy admission's universe gate cannot invert this order.
        sqlx::query("SELECT id FROM universes WHERE id=$1 FOR KEY SHARE")
            .bind(desired.universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)
            .map_err(operator_error)?
            .ok_or_else(|| operator_error(StoreError::NotFound))?;
        // Initializers serialize the absent-row race; admissions share this lock only
        // while no policy exists. Normal apply locks only the existing policy row.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,901329))")
            .bind(desired.universe.to_string())
            .execute(&mut *tx)
            .await
            .map_err(db_error)
            .map_err(operator_error)?;
        let context = immutable(&mut tx, desired.universe)
            .await
            .map_err(operator_error)?;
        desired.validate_for(desired.universe, &context)?;
        if let Some(row) = policy_row(&mut tx, desired.universe, "FOR UPDATE")
            .await
            .map_err(operator_error)?
        {
            let current = decode_policy(&mut tx, desired.universe, row)
                .await
                .map_err(operator_error)?;
            if current.policy != desired.policy {
                return Err("universe policy already initialized; export and apply instead".into());
            }
            return Ok(UniverseConfigChange {
                document: current,
                changed: false,
            });
        }
        insert_policy(&mut tx, desired, "legacy_import")
            .await
            .map_err(operator_error)?;
        tx.commit()
            .await
            .map_err(db_error)
            .map_err(operator_error)?;
        Ok(UniverseConfigChange {
            document: desired.clone(),
            changed: true,
        })
    }
    pub async fn require_universe_policies(&self) -> Result<(), String> {
        self.check_serving_compatibility(None)
            .await
            .map_err(|e| e.to_string())?;
        let universes = self.universes().await.map_err(operator_error)?;
        if universes.is_empty() {
            return Err(
                "no universes exist; run db-init then universe create before serving".into(),
            );
        }
        for universe in universes {
            self.universe_config(universe).await?;
        }
        Ok(())
    }
    pub async fn signup_policy(&self, universe: UniverseId) -> Result<SignupPolicy, StoreError> {
        let mut tx = self.bounded_policy_tx(self.read_pool()?).await?;
        let current = self
            .read_policy(&mut tx, universe, false)
            .await?
            .ok_or(StoreError::Unavailable)?;
        if !current.policy.signup_enabled {
            return Err(StoreError::SignupClosed);
        }
        Ok(SignupPolicy {
            universe,
            max_players: current.policy.effective_max_players(&current.immutable),
        })
    }
    pub(crate) async fn read_policy(
        &self,
        tx: &mut Tx<'_>,
        universe: UniverseId,
        shared: bool,
    ) -> Result<Option<UniverseConfigDocument>, StoreError> {
        let mut row = policy_row(tx, universe, if shared { "FOR SHARE" } else { "" }).await?;
        if row.is_none() && shared {
            // Initialization cannot overtake a legacy admission that observed absence.
            // Recheck after taking the shared activation lock to close the absent-row gap.
            sqlx::query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,901329))")
                .bind(universe.to_string())
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
            row = policy_row(tx, universe, "FOR SHARE").await?;
        }
        match row {
            Some(row) => Ok(Some(decode_policy(tx, universe, row).await?)),
            None if self.legacy_universe_config || cfg!(feature = "test-support") => Ok(None),
            None => Err(StoreError::Unavailable),
        }
    }

    pub(crate) async fn command_limit(
        &self,
        tx: &mut Tx<'_>,
        universe: UniverseId,
    ) -> Result<i64, StoreError> {
        Ok(self
            .read_policy(tx, universe, true)
            .await?
            .map(|d| i64::from(d.policy.commands_per_minute))
            .unwrap_or(self.admission_limit))
    }
}
async fn immutable(tx: &mut Tx<'_>, universe: UniverseId) -> Result<UniverseImmutable, StoreError> {
    let row = sqlx::query("SELECT u.speed,u.profile_hash,r.profile FROM universes u JOIN rulesets r ON r.hash=u.profile_hash WHERE u.id=$1")
        .bind(universe.0).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
    let rules = crate::facts::decode_rules(row.try_get("profile").map_err(db_error)?)?;
    if rules.speed != row.try_get::<i32, _>("speed").map_err(db_error)?
        || rules.hash.0 != row.try_get::<String, _>("profile_hash").map_err(db_error)?
    {
        return Err(StoreError::CorruptData);
    }
    crate::enrollment::signup_profile(&rules)?;
    UniverseImmutable::from_rules(&rules).map_err(|_| StoreError::CorruptData)
}
async fn policy_row(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    lock: &str,
) -> Result<Option<sqlx::postgres::PgRow>, StoreError> {
    sqlx::query(&format!("SELECT revision,signup_enabled,max_players,signup_per_minute,commands_per_minute FROM universe_policies WHERE universe=$1 {lock}"))
        .bind(universe.0).fetch_optional(&mut **tx).await.map_err(db_error)
}
async fn decode_policy(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    row: sqlx::postgres::PgRow,
) -> Result<UniverseConfigDocument, StoreError> {
    let unsigned = |field| -> Result<u32, StoreError> {
        u32::try_from(row.try_get::<i32, _>(field).map_err(db_error)?)
            .map_err(|_| StoreError::CorruptData)
    };
    let document = UniverseConfigDocument {
        version: UNIVERSE_CONFIG_VERSION,
        universe,
        base_revision: row.try_get("revision").map_err(db_error)?,
        immutable: immutable(tx, universe).await?,
        policy: UniversePolicy {
            signup_enabled: row.try_get("signup_enabled").map_err(db_error)?,
            max_players: row
                .try_get::<Option<i32>, _>("max_players")
                .map_err(db_error)?
                .map(u32::try_from)
                .transpose()
                .map_err(|_| StoreError::CorruptData)?,
            signup_per_minute: unsigned("signup_per_minute")?,
            commands_per_minute: unsigned("commands_per_minute")?,
        },
    };
    document.validate().map_err(|_| StoreError::CorruptData)?;
    Ok(document)
}
async fn insert_policy(
    tx: &mut Tx<'_>,
    d: &UniverseConfigDocument,
    provenance: &str,
) -> Result<(), StoreError> {
    sqlx::query("INSERT INTO universe_policies(universe,revision,signup_enabled,max_players,signup_per_minute,commands_per_minute) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(d.universe.0).bind(d.base_revision).bind(d.policy.signup_enabled).bind(d.policy.max_players.map(i64::from))
        .bind(i64::from(d.policy.signup_per_minute)).bind(i64::from(d.policy.commands_per_minute)).execute(&mut **tx).await.map_err(db_error)?;
    audit(tx, d, None, provenance).await
}
async fn audit(
    tx: &mut Tx<'_>,
    d: &UniverseConfigDocument,
    previous: Option<&UniversePolicy>,
    provenance: &str,
) -> Result<(), StoreError> {
    sqlx::query("INSERT INTO universe_policy_changes(universe,revision,previous_policy,next_policy,provenance) VALUES($1,$2,$3,$4,$5)")
        .bind(d.universe.0).bind(d.base_revision).bind(previous.map(sqlx::types::Json)).bind(sqlx::types::Json(&d.policy)).bind(provenance)
        .execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

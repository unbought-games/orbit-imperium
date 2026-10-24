//! Explicit current-state reconciliation, never part of serve or readiness.
use crate::{PgStore, StoreError, db_error, ordering::Tx};
use orbit_engine::*;
use sqlx::Row;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum AuditError {
    #[error("universe {0}: legacy gameplay audit is unsupported; no integrity certification made")]
    UnsupportedProfile(UniverseId),
    #[error("universe {0}: current-state audit failed ({1}); no repair applied")]
    Invalid(UniverseId, StoreError),
    #[error("universe {0}: audit exceeded 60 seconds; no repair applied")]
    TimedOut(UniverseId),
}
impl PgStore {
    pub async fn audit_universe(&self, u: UniverseId) -> Result<(), AuditError> {
        let checked = tokio::time::timeout(Duration::from_secs(60), self.audit_snapshot(u))
            .await
            .map_err(|_| AuditError::TimedOut(u))?
            .map_err(|e| AuditError::Invalid(u, e))?;
        if checked {
            Ok(())
        } else {
            Err(AuditError::UnsupportedProfile(u))
        }
    }
    async fn audit_snapshot(&self, u: UniverseId) -> Result<bool, StoreError> {
        self.check_migrations().await?;
        let mut tx = self.begin_tx(&self.pool).await?;
        for setting in [
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
            "SET LOCAL lock_timeout='250ms'",
            "SET LOCAL statement_timeout='10s'",
            "SET LOCAL work_mem='16MB'",
        ] {
            sqlx::query(setting)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        crate::startup::check_metadata(&mut tx, Some(u), None, true)
            .await
            .map_err(crate::StartupError::store_error)?;
        let row = sqlx::query("SELECT epoch,development FROM universes WHERE id=$1")
            .bind(u.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        let epoch = Epoch(row.try_get("epoch").map_err(db_error)?);
        let rules = crate::facts::rules(&mut tx, u).await?;
        if !rules.progression() && !rules.world() {
            return Ok(false);
        }
        if rules.artifact.universe.is_some()
            && row.try_get::<bool, _>("development").map_err(db_error)?
        {
            let (secret, manifest) = crate::bootstrap::load_manifest(&mut tx, u).await?;
            crate::bootstrap::validate_manifest(&mut tx, u, &manifest, &secret).await?;
        }
        audit_state(&mut tx, u, epoch, &rules).await?;
        audit_scheduling(&mut tx, u).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
}
async fn audit_state(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    rules: &Ruleset,
) -> Result<(), StoreError> {
    let input = Input::Command(Command::RecallFleet {
        fleet: FleetId::default(),
    });
    if rules.world() {
        let populated: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM players WHERE universe=$1)")
                .bind(u.0)
                .fetch_one(&mut **tx)
                .await
                .map_err(db_error)?;
        if populated {
            // The world loader already validates every player's progression: do not do it twice.
            let state = crate::world::load(tx, u, epoch, rules, &input, None).await?;
            crate::facts::validate_rule_references(tx, &state).await?;
        }
    } else if rules.progression() {
        let players: Vec<uuid::Uuid> =
            sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 ORDER BY id")
                .bind(u.0)
                .fetch_all(&mut **tx)
                .await
                .map_err(db_error)?;
        for player in players {
            let state = crate::progression_state::load(
                tx,
                u,
                epoch,
                rules,
                Actor::Player(PlayerId(player)),
                &input,
                None,
            )
            .await?;
            crate::facts::validate_rule_references(tx, &state).await?;
        }
    }
    Ok(())
}

async fn audit_scheduling(tx: &mut Tx<'_>, u: UniverseId) -> Result<(), StoreError> {
    if !crate::admission::is_scoped(tx, u).await? {
        return Ok(());
    }
    for row in
        sqlx::query("SELECT * FROM pending_inputs WHERE universe=$1 ORDER BY at_ms,phase,sequence")
            .bind(u.0)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?
    {
        let input = crate::ordering::ordered_input(row.try_get("input").map_err(db_error)?)?;
        if input.universe != u
            || input.id.0 != row.try_get::<uuid::Uuid, _>("input_id").map_err(db_error)?
            || input.at != row.try_get::<i64, _>("at_ms").map_err(db_error)?
            || input.phase != row.try_get::<i32, _>("phase").map_err(db_error)?
            || input.sequence != row.try_get::<i64, _>("sequence").map_err(db_error)?
        {
            return Err(StoreError::CorruptData);
        }
        let required = crate::scoped_facts::select(tx, u, input.actor, &input.payload)
            .await?
            .scopes();
        let declared = crate::scoped_ordering::declarations(tx, u, input.id).await?;
        if declared.is_empty() || !required.is_subset(&declared) {
            return Err(StoreError::CorruptData);
        }
    }
    let dangling: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM input_scopes s WHERE s.universe=$1 AND NOT EXISTS(SELECT 1 FROM pending_inputs p WHERE p.universe=s.universe AND p.input_id=s.input_id))")
        .bind(u.0).fetch_one(&mut **tx).await.map_err(db_error)?;
    let partial_claim: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM execution_scopes e LEFT JOIN input_scopes mine ON mine.universe=e.universe AND mine.input_id=e.claim_input AND mine.scope_key=e.key WHERE e.universe=$1 AND e.claim_input IS NOT NULL AND (mine.input_id IS NULL OR EXISTS(SELECT 1 FROM input_scopes s JOIN execution_scopes other ON other.universe=s.universe AND other.key=s.scope_key WHERE s.universe=e.universe AND s.input_id=e.claim_input AND (other.claim_input IS DISTINCT FROM e.claim_input OR other.claim_owner IS DISTINCT FROM e.claim_owner OR other.claim_token IS DISTINCT FROM e.claim_token OR other.lease_until IS DISTINCT FROM e.lease_until))))")
        .bind(u.0).fetch_one(&mut **tx).await.map_err(db_error)?;
    if dangling || partial_claim {
        return Err(StoreError::CorruptData);
    }
    for row in sqlx::query("SELECT key,frontier,fence,resolved_at,resolved_phase,resolved_ordinal FROM execution_scopes WHERE universe=$1")
        .bind(u.0).fetch_all(&mut **tx).await.map_err(db_error)? {
        let key: String = row.try_get("key").map_err(db_error)?;
        let _: ScopeKey = crate::ordering::decode_supported(serde_json::from_str(&key).map_err(|_| StoreError::CorruptData)?)?;
        let frontier: i64 = row.try_get("frontier").map_err(db_error)?;
        let resolved: (Option<i64>, Option<i32>, Option<i64>) = (row.try_get("resolved_at").map_err(db_error)?,row.try_get("resolved_phase").map_err(db_error)?,row.try_get("resolved_ordinal").map_err(db_error)?);
        let position_valid = match resolved {
            (None,None,None) => true,
            (Some(at),Some(phase),Some(ordinal)) => (0..=frontier).contains(&at) && matches!(phase,0|1) && ordinal>0,
            _ => false,
        };
        if !(0..=MAX_WIRE_MS).contains(&frontier) || row.try_get::<i64,_>("fence").map_err(db_error)? < 0 || !position_valid { return Err(StoreError::CorruptData); }
    }
    Ok(())
}

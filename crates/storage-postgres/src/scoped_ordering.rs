//! Short scope gates establish chronology; durable leases own execution outside SQL.
use crate::{admission::scope_keys, ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::{Row, postgres::PgRow};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

const LEASE_MS: i64 = 15_000;

// Ephemeral scheduler continuation, shared by clones in this process. It changes
// only where a bounded probe starts; SQL still enforces every dependency.
type ScanPosition = (i64, i32, i64);
#[derive(Default)]
pub(crate) struct ScanCursors(std::sync::Mutex<BTreeMap<UniverseId, ScanPosition>>);
impl ScanCursors {
    fn get(&self, u: UniverseId) -> Result<Option<ScanPosition>, StoreError> {
        Ok(self
            .0
            .lock()
            .map_err(|_| StoreError::Unavailable)?
            .get(&u)
            .copied())
    }
    fn set(&self, u: UniverseId, position: Option<ScanPosition>) -> Result<(), StoreError> {
        let mut cursors = self.0.lock().map_err(|_| StoreError::Unavailable)?;
        if let Some(position) = position {
            cursors.insert(u, position);
        } else {
            cursors.remove(&u);
        }
        Ok(())
    }
}

pub(crate) async fn control(tx: &mut Tx<'_>, u: UniverseId) -> Result<PgRow, StoreError> {
    sqlx::query("SELECT executor_mode,mode_generation,ordering_floor,blocked FROM universe_runtime WHERE universe=$1 FOR SHARE")
        .bind(u.0).fetch_one(&mut **tx).await.map_err(db_error)
}
// Probe each table through its ordered head index; via the pending_inputs view
// every due input is sorted per claim, so claims slowed as the backlog grew.
fn candidate_branch(table: &str, id: &str, phase: i32, live: &str) -> String {
    let at = format!("(p.at_ms,{phase},p.sequence)");
    format!("(SELECT p.universe, p.{id} AS input_id, p.input, p.at_ms, {phase} AS phase, p.sequence FROM {table} p
        WHERE p.universe=$1 AND {live} AND p.at_ms<=$2 AND ($3::uuid IS NULL OR p.{id}=$3) AND NOT (p.{id}=ANY($4))
        AND ($5::bigint IS NULL OR {at}>($5,$6::integer,$7::bigint))
        AND EXISTS(SELECT 1 FROM input_scopes s WHERE s.universe=p.universe AND s.input_id=p.{id})
        AND NOT EXISTS(SELECT 1 FROM input_scopes s JOIN execution_scopes e ON e.universe=s.universe AND e.key=s.scope_key
            WHERE s.universe=p.universe AND s.input_id=p.{id} AND (e.blocked IS NOT NULL OR e.lease_until>$2))
        AND NOT EXISTS(SELECT 1 FROM input_scopes mine JOIN input_scopes other ON other.universe=mine.universe AND other.scope_key=mine.scope_key
            WHERE mine.universe=p.universe AND mine.input_id=p.{id} AND (
                EXISTS(SELECT 1 FROM commands c WHERE c.input_id=other.input_id AND c.universe=other.universe AND NOT c.done AND (c.at_ms,1,c.sequence)<{at})
                OR EXISTS(SELECT 1 FROM scheduled_events e WHERE e.id=other.input_id AND e.universe=other.universe AND NOT e.done AND NOT e.cancelled AND (e.at_ms,0,e.sequence)<{at})))
        AND NOT EXISTS(SELECT 1 FROM runtime_barriers b WHERE b.universe=p.universe AND NOT b.done AND (b.at_ms,1,b.sequence)<={at})
        ORDER BY p.at_ms,p.sequence LIMIT 1)")
}
static CANDIDATE: std::sync::LazyLock<String> = std::sync::LazyLock::new(|| {
    format!(
        "SELECT * FROM ({} UNION ALL {}) ready ORDER BY at_ms,phase,sequence LIMIT 1",
        candidate_branch(
            "scheduled_events",
            "id",
            0,
            "NOT p.done AND NOT p.cancelled"
        ),
        candidate_branch("commands", "input_id", 1, "NOT p.done"),
    )
});
async fn candidate(
    tx: &mut Tx<'_>,
    u: UniverseId,
    clock: i64,
    id: Option<InputId>,
    excluded: &[Uuid],
    after: Option<ScanPosition>,
) -> Result<Option<PgRow>, StoreError> {
    sqlx::query(&CANDIDATE)
        .bind(u.0)
        .bind(clock)
        .bind(id.map(|id| id.0))
        .bind(excluded)
        .bind(after.map(|p| p.0))
        .bind(after.map(|p| p.1))
        .bind(after.map(|p| p.2))
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)
}
// A contended admission gate must not hide another independent candidate.
// Roll back each incomplete acquisition so probes never retain partial gates.
async fn lock_candidate(
    tx: &mut Tx<'_>,
    u: UniverseId,
    cursors: &ScanCursors,
) -> Result<Option<(PgRow, BTreeSet<ScopeKey>, Vec<PgRow>)>, StoreError> {
    let after = cursors.get(u)?;
    let mut last = after;
    let mut excluded = Vec::new();
    for _ in 0..32 {
        let clock = now(tx).await?;
        let Some(row) = candidate(tx, u, clock, None, &excluded, after).await? else {
            cursors.set(u, None)?;
            return Ok(None);
        };
        last = Some((
            row.try_get("at_ms").map_err(db_error)?,
            row.try_get("phase").map_err(db_error)?,
            row.try_get("sequence").map_err(db_error)?,
        ));
        let id = InputId(row.try_get("input_id").map_err(db_error)?);
        let scopes = declarations(tx, u, id).await?;
        sqlx::query("SAVEPOINT candidate_gates")
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        let rows = lock_scopes(tx, u, &scopes, true).await?;
        if rows.len() == scopes.len() && !rows.is_empty() {
            let clock = now(tx).await?;
            if let Some(row) = candidate(tx, u, clock, Some(id), &excluded, None).await? {
                sqlx::query("RELEASE SAVEPOINT candidate_gates")
                    .execute(&mut **tx)
                    .await
                    .map_err(db_error)?;
                cursors.set(u, None)?;
                return Ok(Some((row, scopes, rows)));
            }
        }
        sqlx::query("ROLLBACK TO SAVEPOINT candidate_gates")
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        sqlx::query("RELEASE SAVEPOINT candidate_gates")
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        excluded.push(id.0);
    }
    cursors.set(u, last)?;
    Ok(None)
}

pub(crate) async fn declarations(
    tx: &mut Tx<'_>,
    u: UniverseId,
    input: InputId,
) -> Result<BTreeSet<ScopeKey>, StoreError> {
    let keys: Vec<String> = sqlx::query_scalar(
        "SELECT scope_key FROM input_scopes WHERE universe=$1 AND input_id=$2 ORDER BY scope_key",
    )
    .bind(u.0)
    .bind(input.0)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    keys.into_iter()
        .map(|key| {
            decode_supported(serde_json::from_str(&key).map_err(|_| StoreError::CorruptData)?)
        })
        .collect()
}
pub(crate) async fn lock_scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    scopes: &BTreeSet<ScopeKey>,
    skip_locked: bool,
) -> Result<Vec<PgRow>, StoreError> {
    let query = if skip_locked {
        "SELECT * FROM execution_scopes WHERE universe=$1 AND key=ANY($2) ORDER BY key FOR NO KEY UPDATE SKIP LOCKED"
    } else {
        "SELECT * FROM execution_scopes WHERE universe=$1 AND key=ANY($2) ORDER BY key FOR NO KEY UPDATE"
    };
    sqlx::query(query)
        .bind(u.0)
        .bind(scope_keys(scopes))
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)
}
pub(crate) async fn valid(tx: &mut Tx<'_>, claim: &ScopedClaim) -> Result<bool, StoreError> {
    let rt = runtime(tx, claim.input.universe).await?;
    if rt.try_get::<String, _>("executor_mode").map_err(db_error)? != "scoped"
        || rt.try_get::<i64, _>("mode_generation").map_err(db_error)? != claim.mode_generation
        || rt
            .try_get::<Option<String>, _>("blocked")
            .map_err(db_error)?
            .is_some()
        || declarations(tx, claim.input.universe, claim.input.id).await? != claim.scopes
    {
        return Ok(false);
    }
    let clock = now(tx).await?;
    let rows = sqlx::query("SELECT * FROM execution_scopes WHERE universe=$1 AND key=ANY($2)")
        .bind(claim.input.universe.0)
        .bind(scope_keys(&claim.scopes))
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?;
    if rows.len() != claim.scopes.len() || rows.is_empty() {
        return Ok(false);
    }
    for row in rows {
        let key: String = row.try_get("key").map_err(db_error)?;
        let key: ScopeKey =
            decode_supported(serde_json::from_str(&key).map_err(|_| StoreError::CorruptData)?)?;
        if row
            .try_get::<Option<Uuid>, _>("claim_input")
            .map_err(db_error)?
            != Some(claim.input.id.0)
            || row
                .try_get::<Option<Uuid>, _>("claim_token")
                .map_err(db_error)?
                != Some(claim.token)
            || row
                .try_get::<Option<Uuid>, _>("claim_owner")
                .map_err(db_error)?
                != Some(claim.owner.0)
            || Some(row.try_get::<i64, _>("fence").map_err(db_error)?)
                != claim.scope_fences.get(&key).copied()
            || row
                .try_get::<Option<i64>, _>("lease_until")
                .map_err(db_error)?
                .is_none_or(|until| until <= clock)
            || row
                .try_get::<Option<String>, _>("blocked")
                .map_err(db_error)?
                .is_some()
        {
            return Ok(false);
        }
    }
    Ok(true)
}

impl ScopedOrderStore for PgStore {
    async fn claim_scoped(
        &self,
        u: UniverseId,
        worker: WorkerId,
    ) -> Result<Option<ScopedClaim>, StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        let rt = control(&mut tx, u).await?;
        if rt.try_get::<String, _>("executor_mode").map_err(db_error)? != "scoped"
            || rt
                .try_get::<Option<String>, _>("blocked")
                .map_err(db_error)?
                .is_some()
        {
            return Ok(None);
        }
        crate::facts::rules(&mut tx, u).await?;
        let Some((row, scopes, rows)) = lock_candidate(&mut tx, u, &self.scan_cursors).await?
        else {
            return Ok(None);
        };
        let id = InputId(row.try_get("input_id").map_err(db_error)?);
        let clock = now(&mut tx).await?;
        let parsed = (|| -> Result<OrderedInput, StoreError> {
            let input = ordered_input(row.try_get("input").map_err(db_error)?)?;
            if input.id != id
                || input.universe != u
                || input.at != row.try_get::<i64, _>("at_ms").map_err(db_error)?
                || input.phase != row.try_get::<i32, _>("phase").map_err(db_error)?
                || input.sequence != row.try_get::<i64, _>("sequence").map_err(db_error)?
                || !matches!(
                    (&input.actor, &input.payload),
                    (Actor::Player(_), Input::Command(_)) | (Actor::Scheduler, Input::Event(_))
                )
            {
                return Err(StoreError::CorruptData);
            }
            Ok(input)
        })();
        let input = match parsed {
            Ok(input) => input,
            Err(StoreError::CorruptData) => {
                sqlx::query("UPDATE execution_scopes SET blocked='invalid scoped ordered input' WHERE universe=$1 AND key=ANY($2)")
                    .bind(u.0).bind(scope_keys(&scopes)).execute(&mut *tx).await.map_err(db_error)?;
                tx.commit().await.map_err(db_error)?;
                return Err(StoreError::CorruptData);
            }
            Err(error) => return Err(error),
        };
        let recovered = rows
            .iter()
            .any(|row| row.get::<Option<Uuid>, _>("claim_input").is_some());
        let token = Uuid::new_v4();
        let lease_until = clock.checked_add(LEASE_MS).ok_or(StoreError::CorruptData)?;
        let mut fences = BTreeMap::new();
        for row in rows {
            let key: String = row.try_get("key").map_err(db_error)?;
            let scope: ScopeKey =
                decode_supported(serde_json::from_str(&key).map_err(|_| StoreError::CorruptData)?)?;
            let fence = row
                .try_get::<i64, _>("fence")
                .map_err(db_error)?
                .checked_add(1)
                .ok_or(StoreError::CorruptData)?;
            sqlx::query("UPDATE execution_scopes SET frontier=greatest(frontier,$3),fence=$4,claim_input=$5,claim_token=$6,claim_owner=$7,lease_until=$8 WHERE universe=$1 AND key=$2")
                .bind(u.0).bind(key).bind(clock).bind(fence).bind(input.id.0).bind(token).bind(worker.0).bind(lease_until).execute(&mut *tx).await.map_err(db_error)?;
            fences.insert(scope, fence);
        }
        let claim = ScopedClaim {
            input,
            scopes,
            owner: worker,
            token,
            scope_fences: fences,
            mode_generation: rt.try_get("mode_generation").map_err(db_error)?,
            lease_until,
        };
        tx.commit().await.map_err(db_error)?;
        if recovered {
            self.observe_event(RuntimeEvent::ClaimRecovered);
        }
        self.observer.duration(
            RuntimeStage::DependencyWait,
            std::time::Duration::from_millis(clock.saturating_sub(claim.input.at).max(0) as u64),
        );
        Ok(Some(claim))
    }

    async fn load_scoped(&self, claim: &ScopedClaim) -> Result<ClaimSnapshot, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.worker_pool()?).await?;
        if !valid(&mut tx, claim).await? {
            return Err(StoreError::StaleClaim);
        }
        let provenance_exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM rulesets WHERE hash=$1)")
                .bind(&claim.input.profile_hash.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        if !provenance_exists {
            return Err(StoreError::CorruptData);
        }
        let required = crate::scoped_facts::select(
            &mut tx,
            claim.input.universe,
            claim.input.actor,
            &claim.input.payload,
        )
        .await?
        .scopes();
        if !required.is_subset(&claim.scopes) {
            return Err(StoreError::CorruptData);
        }
        let snapshot =
            crate::scoped_facts::load_execution(&mut tx, &claim.input, &claim.scopes).await?;
        crate::facts::validate_rule_references(&mut tx, &snapshot.state).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(snapshot)
    }

    async fn renew_scoped(&self, claim: &ScopedClaim) -> Result<ScopedClaim, StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        control(&mut tx, claim.input.universe).await?;
        lock_scopes(&mut tx, claim.input.universe, &claim.scopes, false).await?;
        if !valid(&mut tx, claim).await? {
            return Err(StoreError::StaleClaim);
        }
        let until = now(&mut tx)
            .await?
            .checked_add(LEASE_MS)
            .ok_or(StoreError::CorruptData)?;
        sqlx::query("UPDATE execution_scopes SET lease_until=$3 WHERE universe=$1 AND key=ANY($2)")
            .bind(claim.input.universe.0)
            .bind(scope_keys(&claim.scopes))
            .bind(until)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        let mut renewed = claim.clone();
        renewed.lease_until = until;
        Ok(renewed)
    }

    async fn fail_scoped(
        &self,
        claim: &ScopedClaim,
        error: &InvariantError,
    ) -> Result<(), StoreError> {
        self.finish_scoped_claim(claim, Some(&error.0)).await
    }
    async fn release_scoped(&self, claim: &ScopedClaim) -> Result<(), StoreError> {
        self.finish_scoped_claim(claim, None).await
    }
}
impl PgStore {
    async fn finish_scoped_claim(
        &self,
        claim: &ScopedClaim,
        blocked: Option<&str>,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        control(&mut tx, claim.input.universe).await?;
        lock_scopes(&mut tx, claim.input.universe, &claim.scopes, false).await?;
        if !valid(&mut tx, claim).await? {
            return Err(StoreError::StaleClaim);
        }
        sqlx::query("UPDATE execution_scopes SET fence=fence+1,claim_input=NULL,claim_token=NULL,claim_owner=NULL,lease_until=NULL,blocked=$3 WHERE universe=$1 AND key=ANY($2)")
            .bind(claim.input.universe.0).bind(scope_keys(&claim.scopes)).bind(blocked).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        if blocked.is_some() {
            self.observe_event(RuntimeEvent::ScopeBlocked);
        }
        Ok(())
    }
}

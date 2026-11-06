//! Objective bindings and immutable completion/payment receipts share the gameplay transaction.
use crate::{
    ordering::{Tx, decode},
    *,
};
use orbit_engine::*;
use std::collections::{BTreeMap, BTreeSet};

pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    owners: &[uuid::Uuid],
) -> Result<BTreeMap<OperationId, ObjectiveRun>, StoreError> {
    let rows: Vec<serde_json::Value> = sqlx::query_scalar("SELECT data FROM objective_runs WHERE universe=$1 AND epoch=$2 AND beneficiary=ANY($3) ORDER BY id")
        .bind(u.0).bind(epoch.0).bind(owners).fetch_all(&mut **tx).await.map_err(db_error)?;
    let mut runs = BTreeMap::new();
    for row in rows {
        let run: ObjectiveRun = decode(row)?;
        if run.universe != u
            || run.epoch != epoch
            || !owners.contains(&run.beneficiary.0)
            || run.id != objective_run_id(u, epoch, run.beneficiary, &run.program.id)
        {
            return Err(StoreError::CorruptData);
        }
        run.validate().map_err(|_| StoreError::CorruptData)?;
        runs.insert(run.id, run);
    }
    Ok(runs)
}
pub(crate) async fn save(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    old: &WorldRecords,
    new: &WorldRecords,
) -> Result<(), StoreError> {
    if old
        .objective_runs
        .keys()
        .any(|id| !new.objective_runs.contains_key(id))
    {
        return Err(StoreError::CorruptData);
    }
    for (id, run) in &new.objective_runs {
        if old.objective_runs.get(id) == Some(run) {
            continue;
        }
        if *id != run.id
            || run.universe != i.universe
            || run.epoch != i.epoch
            || run.id != objective_run_id(i.universe, i.epoch, run.beneficiary, &run.program.id)
        {
            return Err(StoreError::CorruptData);
        }
        if let Some(before) = old.objective_runs.get(id) {
            if before.program != run.program
                || before.enrolled_at != run.enrolled_at
                || before.beneficiary != run.beneficiary
                || !run.evidence.starts_with(&before.evidence)
                || before
                    .receipts
                    .iter()
                    .any(|(key, value)| run.receipts.get(key) != Some(value))
            {
                return Err(StoreError::CorruptData);
            }
            let n = sqlx::query("UPDATE objective_runs SET data=$2 WHERE id=$1 AND data=$3")
                .bind(id.0)
                .bind(sqlx::types::Json(run))
                .bind(sqlx::types::Json(before))
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
            if n.rows_affected() != 1 {
                return Err(StoreError::Conflict);
            }
        } else {
            sqlx::query("INSERT INTO objective_runs(id,universe,epoch,beneficiary,program,data) VALUES($1,$2,$3,$4,$5,$6)")
                .bind(id.0).bind(i.universe.0).bind(i.epoch.0).bind(run.beneficiary.0).bind(&run.program.id).bind(sqlx::types::Json(run)).execute(&mut **tx).await.map_err(db_error)?;
        }
    }
    Ok(())
}
/// All causally related work for enrolled owners reserves the homeworld location,
/// including foreign encounters. Activation must drain old scopes before enrollment.
pub(crate) async fn add_homeworld_scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    scopes: &mut BTreeSet<ScopeKey>,
) -> Result<(), StoreError> {
    let owners: Vec<_> = scopes
        .iter()
        .filter_map(|scope| match scope {
            ScopeKey::Player(p) => Some(p.0),
            _ => None,
        })
        .collect();
    let enrolled: Vec<uuid::Uuid> = sqlx::query_scalar("SELECT DISTINCT r.beneficiary FROM objective_runs r JOIN universes u ON u.id=r.universe AND u.epoch=r.epoch WHERE r.universe=$1 AND r.beneficiary=ANY($2)")
        .bind(u.0).bind(owners).fetch_all(&mut **tx).await.map_err(db_error)?;
    for owner in enrolled {
        if let Some((_, home)) = crate::bootstrap::viewer_homeworld(tx, u, PlayerId(owner)).await? {
            scopes.insert(ScopeKey::Location(home.coordinates));
        }
    }
    Ok(())
}

/// Verify objective writes against source coverage and the authority held by this commit.
pub(crate) fn validate_changes(
    i: &OrderedInput,
    s: &GameState,
    change: &ChangeSet,
    scopes: Option<&BTreeSet<ScopeKey>>,
) -> Result<(), StoreError> {
    let Some(new) = &change.world else {
        return Ok(());
    };
    let w = s.world.as_ref().ok_or(StoreError::CorruptData)?;
    for (id, run) in &new.records.objective_runs {
        let old = w.records.objective_runs.get(id);
        if old == Some(run) {
            continue;
        }
        run.validate().map_err(|_| StoreError::CorruptData)?;
        let home = w
            .homeworlds
            .get(&run.beneficiary)
            .ok_or(StoreError::CorruptData)?;
        let body = s.bodies.get(home).ok_or(StoreError::CorruptData)?;
        if !w.covered_players.contains(&run.beneficiary)
            || !s.coverage.production_bodies.contains(home)
            || body.owner != run.beneficiary
            || body.universe != i.universe
            || run.universe != i.universe
            || run.epoch != i.epoch
            || scopes.is_some_and(|scopes| {
                !scopes.contains(&ScopeKey::Player(run.beneficiary))
                    || !scopes.contains(&ScopeKey::Location(body.coordinates))
            })
        {
            return Err(StoreError::CorruptData);
        }
        let previous_evidence = old.map_or(0, |r| r.evidence.len());
        if run.evidence.len() < previous_evidence
            || run.evidence[previous_evidence..]
                .iter()
                .any(|e| e.input != i.id || e.order != objective_order(i) || e.actor != i.actor)
        {
            return Err(StoreError::CorruptData);
        }
        if old.is_none()
            && (run.enrolled_at != objective_order(i)
                || !run.evidence.is_empty()
                || !run.receipts.is_empty())
        {
            return Err(StoreError::CorruptData);
        }
        for (key, receipt) in &run.receipts {
            if old.is_some_and(|r| r.receipts.get(key) == Some(receipt)) {
                continue;
            }
            if receipt.homeworld != *home
                || receipt.granted_by != i.id
                || receipt.granted_at != objective_order(i)
                || receipt.evidence.order > objective_order(i)
                || !run.evidence[previous_evidence..]
                    .iter()
                    .any(|e| e.input == i.id)
                || !change
                    .bodies
                    .iter()
                    .any(|b| b.id == *home && b.owner == run.beneficiary && b.checkpoint.at == i.at)
                || !change.affected_viewers.contains(&run.beneficiary)
            {
                return Err(StoreError::CorruptData);
            }
        }
    }
    Ok(())
}

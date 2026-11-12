//! Site persistence only participates in the ordinary fenced world commit.
//! No independent write API, worker, public issuance or extraction endpoint.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet};

pub(crate) async fn load(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
    selected: &crate::scoped_facts::Selection,
) -> Result<BTreeMap<SiteId, MissionSite>, StoreError> {
    let owners: Vec<_> = selected.owners.iter().map(|p| p.0).collect();
    let ids: Vec<_> = selected.sites.iter().map(|id| id.0).collect();
    let rows = sqlx::query(
        "SELECT id,beneficiary,issuance_key,data FROM mission_sites WHERE universe=$1 AND epoch=$2 AND ($3 OR beneficiary=ANY($4) OR id=ANY($5)) ORDER BY id")
        .bind(universe.0).bind(epoch.0).bind(selected.all).bind(&owners).bind(&ids)
        .fetch_all(&mut **tx).await.map_err(db_error)?;
    let mut sites = BTreeMap::new();
    for row in rows {
        let site: MissionSite = decode(row.try_get("data").map_err(db_error)?)?;
        site.validate_history()
            .map_err(|_| StoreError::CorruptData)?;
        if (
            site.creation.issuance.universe,
            site.creation.issuance.epoch,
        ) != (universe, epoch)
            || site.id().0 != row.try_get::<uuid::Uuid, _>("id").map_err(db_error)?
            || site.creation.issuance.beneficiary.0
                != row
                    .try_get::<uuid::Uuid, _>("beneficiary")
                    .map_err(db_error)?
            || site.creation.issuance.key
                != row.try_get::<String, _>("issuance_key").map_err(db_error)?
            || sites.insert(site.id(), site).is_some()
        {
            return Err(StoreError::CorruptData);
        }
    }
    Ok(sites)
}

pub(crate) async fn save(
    tx: &mut Tx<'_>,
    input: &OrderedInput,
    facts: &GameState,
    records: &WorldRecords,
    claimed_scopes: Option<&BTreeSet<ScopeKey>>,
    rules: &Ruleset,
) -> Result<(), StoreError> {
    let world = facts.world.as_ref().ok_or(StoreError::CorruptData)?;
    validate_site_execution(facts, input, records, rules).map_err(|_| StoreError::CorruptData)?;
    validate_site_changes(facts, input, &records.mission_sites, rules)
        .map_err(|_| StoreError::CorruptData)?;
    for (id, site) in &records.mission_sites {
        let previous = world.records.mission_sites.get(id);
        if previous == Some(site) {
            continue;
        }
        let beneficiary = site.creation.issuance.beneficiary;
        if claimed_scopes.is_some_and(|s| {
            !s.contains(&ScopeKey::Site(*id)) || !s.contains(&ScopeKey::Player(beneficiary))
        }) {
            return Err(StoreError::CorruptData);
        }
        let changed = if let Some(previous) = previous {
            sqlx::query("UPDATE mission_sites SET data=$3 WHERE universe=$1 AND id=$2 AND data=$4")
                .bind(input.universe.0)
                .bind(id.0)
                .bind(sqlx::types::Json(site))
                .bind(sqlx::types::Json(previous))
                .execute(&mut **tx)
                .await
                .map_err(db_error)?
        } else {
            sqlx::query("INSERT INTO mission_sites(universe,epoch,id,beneficiary,issuance_key,data) VALUES($1,$2,$3,$4,$5,$6)")
                .bind(input.universe.0).bind(input.epoch.0).bind(id.0).bind(beneficiary.0)
                .bind(&site.creation.issuance.key).bind(sqlx::types::Json(site))
                .execute(&mut **tx).await.map_err(db_error)?
        };
        if changed.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
    }
    Ok(())
}

#[cfg(feature = "test-support")]
impl PgStore {
    /// Fixture-only declaration for a future trusted consumer. Must run before
    /// claiming the already admitted command, with no concurrent worker. The
    /// production consumer must declare site scopes during atomic admission.
    pub async fn declare_site_scope_for_test(
        &self,
        universe: UniverseId,
        command: CommandId,
        key: &SiteIssuanceKey,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_unlocked(&self.pool).await?;
        let value: serde_json::Value = sqlx::query_scalar(
            "SELECT input FROM commands WHERE universe=$1 AND command_id=$2 AND NOT done",
        )
        .bind(universe.0)
        .bind(command.0)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let input: OrderedInput = decode(value)?;
        if (input.universe, input.epoch, input.actor)
            != (key.universe, key.epoch, Actor::Player(key.beneficiary))
        {
            return Err(StoreError::Conflict);
        }
        crate::admission::register(&mut tx, &input, &mission_site_scopes(key)).await?;
        tx.commit().await.map_err(db_error)
    }
}

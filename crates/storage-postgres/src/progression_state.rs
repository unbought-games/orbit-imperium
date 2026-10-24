//! Complete player-scoped progression loads and fenced replacements, under the universe gate.
use crate::{
    ordering::{Tx, decode},
    *,
};
use orbit_application::StoreError;
use orbit_engine::*;
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet};

/// `rules` must be validated for `u` by `facts::rules` in this transaction.
pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    rules: &Ruleset,
    actor: Actor,
    input: &Input,
    input_id: Option<InputId>,
) -> Result<GameState, StoreError> {
    let mut requested = BTreeSet::new();
    let mut operation_ids = BTreeSet::new();
    match input {
        Input::Command(
            Command::SetProduction { body, .. }
            | Command::StartUpgrade { body, .. }
            | Command::StartDemolition { body, .. }
            | Command::StartManufacture { body, .. },
        ) => {
            requested.insert(*body);
        }
        Input::Command(Command::StartResearch { host, .. }) => {
            requested.insert(*host);
        }
        Input::Command(
            Command::CancelConstruction { operation } | Command::CancelResearch { operation },
        )
        | Input::Event(
            ScheduledEvent::ConstructionDue { operation, .. }
            | ScheduledEvent::ResearchDue { operation, .. }
            | ScheduledEvent::ManufacturingDue { operation, .. },
        ) => {
            operation_ids.insert(*operation);
        }
        _ => {}
    }
    if let Some(id) = input_id {
        for category in ["construction:0", "research:0", "manufacturing:0"] {
            operation_ids.insert(OperationId(derived_id(id, category)));
        }
    }
    let explicit: Vec<_> = operation_ids.iter().map(|x| x.0).collect();
    let owner = match actor {
        Actor::Player(p) => p,
        Actor::Scheduler => {
            let p:Option<uuid::Uuid>=sqlx::query_scalar("SELECT owner FROM (SELECT id,owner,universe FROM constructions UNION ALL SELECT id,owner,universe FROM research_operations UNION ALL SELECT id,owner,universe FROM manufacturing_batches) ops WHERE universe=$1 AND id=ANY($2) LIMIT 1").bind(u.0).bind(&explicit).fetch_optional(&mut **tx).await.map_err(db_error)?;
            PlayerId(p.ok_or(StoreError::CorruptData)?)
        }
    };
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM players WHERE id=$1 AND universe=$2)")
            .bind(owner.0)
            .bind(u.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
    if !exists {
        return Err(StoreError::NotFound);
    }
    let rows = sqlx::query("SELECT * FROM bodies WHERE universe=$1 AND owner=$2 ORDER BY id")
        .bind(u.0)
        .bind(owner.0)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?;
    let bodies: BTreeMap<_, _> = crate::views::bodies(tx, rows)
        .await?
        .into_iter()
        .map(|b| (b.id, b))
        .collect();
    let ids: Vec<_> = bodies.keys().map(|x| x.0).collect();
    requested.extend(bodies.keys());
    let constructions:BTreeMap<_,_>=sqlx::query("SELECT * FROM constructions WHERE universe=$1 AND ((owner=$2 AND status='Active') OR id=ANY($3)) ORDER BY id").bind(u.0).bind(owner.0).bind(&explicit).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(|r|{let c=crate::entities::construction(r)?;Ok((c.id,c))}).collect::<Result<_,StoreError>>()?;
    let mut research_operations = BTreeMap::new();
    for row in sqlx::query("SELECT * FROM research_operations WHERE universe=$1 AND ((owner=$2 AND data->>'status'='Active') OR id=ANY($3)) ORDER BY id").bind(u.0).bind(owner.0).bind(&explicit).fetch_all(&mut **tx).await.map_err(db_error)?{
        let x:ResearchOperation=decode(row.try_get("data").map_err(db_error)?)?;
        if x.id.0!=row.try_get::<uuid::Uuid,_>("id").map_err(db_error)?||x.owner.0!=row.try_get::<uuid::Uuid,_>("owner").map_err(db_error)?||x.host.0!=row.try_get::<uuid::Uuid,_>("body").map_err(db_error)?{return Err(StoreError::CorruptData)}research_operations.insert(x.id,x);
    }
    let mut manufacturing_batches = BTreeMap::new();
    for row in sqlx::query("SELECT * FROM manufacturing_batches WHERE universe=$1 AND ((owner=$2 AND data->>'status'='Active') OR id=ANY($3)) ORDER BY body,queue_sequence").bind(u.0).bind(owner.0).bind(&explicit).fetch_all(&mut **tx).await.map_err(db_error)?{
        let x:ManufacturingBatch=decode(row.try_get("data").map_err(db_error)?)?;
        if x.id.0!=row.try_get::<uuid::Uuid,_>("id").map_err(db_error)?||x.owner.0!=row.try_get::<uuid::Uuid,_>("owner").map_err(db_error)?||x.body.0!=row.try_get::<uuid::Uuid,_>("body").map_err(db_error)?||x.queue_sequence!=row.try_get::<i64,_>("queue_sequence").map_err(db_error)?{return Err(StoreError::CorruptData)}manufacturing_batches.insert(x.id,x);
    }
    requested.extend(constructions.values().map(|x| x.body));
    requested.extend(research_operations.values().map(|x| x.host));
    requested.extend(manufacturing_batches.values().map(|x| x.body));
    let mut production_settings = BTreeMap::new();
    for row in sqlx::query("SELECT * FROM production_settings WHERE body=ANY($1) ORDER BY body")
        .bind(&ids)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
    {
        let x: ProductionSettingsRecord = decode(row.try_get("data").map_err(db_error)?)?;
        if x.body.0 != row.try_get::<uuid::Uuid, _>("body").map_err(db_error)?
            || x.revision != row.try_get::<i64, _>("revision").map_err(db_error)?
        {
            return Err(StoreError::CorruptData);
        }
        production_settings.insert(x.body, x);
    }
    let research = crate::progression::research(tx, &[owner.0]).await?;
    let inventories = crate::progression::inventory(tx, &ids).await?;
    let mut keys = vec![];
    for k in [
        "research",
        "research-operations",
        "owned-bodies",
        "lab-constructions",
        "fleets",
    ] {
        keys.push((k.to_owned(), owner.0));
    }
    for id in &ids {
        for k in ["production", "constructions", "manufacturing"] {
            keys.push((k.to_owned(), *id));
        }
        keys.push((format!("inventory:{owner}"), *id));
    }
    let mut collection_revisions = BTreeMap::new();
    for (kind, key) in keys {
        let revision: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM collection_heads WHERE universe=$1 AND kind=$2 AND key=$3",
        )
        .bind(u.0)
        .bind(&kind)
        .bind(key)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?;
        let revision = revision
            .filter(|x| *x >= 0)
            .ok_or(StoreError::CorruptData)?;
        let name = if let Some(owner) = kind.strip_prefix("inventory:") {
            format!("inventory:{key}:{owner}")
        } else {
            format!("{kind}:{key}")
        };
        collection_revisions.insert(name, revision);
    }
    let mut coverage = FactCoverage {
        bodies: requested,
        construction_bodies: bodies.keys().copied().collect(),
        inventory_owners: bodies.values().map(|b| (b.id, b.owner)).collect(),
        research_players: BTreeSet::from([owner]),
        fleet_owners: BTreeSet::from([owner]),
        production_bodies: bodies.keys().copied().collect(),
        research_slot_players: BTreeSet::from([owner]),
        owned_body_players: BTreeSet::from([owner]),
        lab_construction_players: BTreeSet::from([owner]),
        manufacturing_bodies: bodies.keys().copied().collect(),
        ..Default::default()
    };
    coverage.operations = operation_ids.clone();
    coverage.operations.extend(constructions.keys());
    coverage.research_operation_ids = operation_ids.clone();
    coverage
        .research_operation_ids
        .extend(research_operations.keys());
    coverage.manufacturing_operation_ids = operation_ids;
    coverage
        .manufacturing_operation_ids
        .extend(manufacturing_batches.keys());
    let s = GameState {
        world: None,
        production_settings,
        research_operations,
        manufacturing_batches,
        progression_reservations: BTreeMap::new(),
        universe: u,
        epoch,
        profile_hash: rules.hash.clone(),
        bodies,
        players: BTreeMap::from([(
            owner,
            Player {
                id: owner,
                universe: u,
            },
        )]),
        inventories,
        research,
        constructions,
        fleets: BTreeMap::new(),
        reports: BTreeMap::new(),
        coverage,
        collection_revisions,
    };
    for id in s.bodies.keys() {
        orbit_engine::validate_body(&s, *id, rules).map_err(|_| StoreError::CorruptData)?;
        orbit_engine::validate_progression_collections(&s, &s.bodies[id])
            .map_err(|_| StoreError::CorruptData)?;
    }
    Ok(s)
}

pub(crate) async fn save(
    tx: &mut Tx<'_>,
    u: UniverseId,
    facts: &GameState,
    c: &ChangeSet,
) -> Result<(), StoreError> {
    let mut heads = BTreeSet::new();
    for x in &c.production_settings {
        let Some(old) = facts.production_settings.get(&x.body) else {
            if facts.bodies.contains_key(&x.body)
                || !c.bodies.iter().any(|b| b.id == x.body)
                || x.revision != 0
            {
                return Err(StoreError::CorruptData);
            }
            sqlx::query("INSERT INTO production_settings(body,data,revision) VALUES($1,$2,0)")
                .bind(x.body.0)
                .bind(sqlx::types::Json(x))
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
            continue;
        };
        let n = sqlx::query(
            "UPDATE production_settings SET data=$2,revision=$3 WHERE body=$1 AND revision=$4",
        )
        .bind(x.body.0)
        .bind(sqlx::types::Json(x))
        .bind(x.revision)
        .bind(old.revision)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        if n.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        heads.insert(("production", x.body.0));
    }
    for x in &c.research_operations {
        if let Some(old) = facts.research_operations.get(&x.id) {
            let n=sqlx::query("UPDATE research_operations SET data=$2 WHERE id=$1 AND (data->>'revision')::bigint=$3").bind(x.id.0).bind(sqlx::types::Json(x)).bind(old.revision).execute(&mut **tx).await.map_err(db_error)?;
            if n.rows_affected() != 1 {
                return Err(StoreError::Conflict);
            }
        } else {
            sqlx::query("INSERT INTO research_operations(id,universe,owner,body,data) VALUES($1,$2,$3,$4,$5)").bind(x.id.0).bind(u.0).bind(x.owner.0).bind(x.host.0).bind(sqlx::types::Json(x)).execute(&mut **tx).await.map_err(db_error)?;
        }
        heads.insert(("research-operations", x.owner.0));
    }
    for x in &c.manufacturing_batches {
        if let Some(old) = facts.manufacturing_batches.get(&x.id) {
            let n=sqlx::query("UPDATE manufacturing_batches SET data=$2 WHERE id=$1 AND (data->>'revision')::bigint=$3").bind(x.id.0).bind(sqlx::types::Json(x)).bind(old.revision).execute(&mut **tx).await.map_err(db_error)?;
            if n.rows_affected() != 1 {
                return Err(StoreError::Conflict);
            }
        } else {
            sqlx::query("INSERT INTO manufacturing_batches(id,universe,owner,body,queue_sequence,data) VALUES($1,$2,$3,$4,$5,$6)").bind(x.id.0).bind(u.0).bind(x.owner.0).bind(x.body.0).bind(x.queue_sequence).bind(sqlx::types::Json(x)).execute(&mut **tx).await.map_err(db_error)?;
        }
        heads.insert(("manufacturing", x.body.0));
    }
    for x in &c.constructions {
        if x.building == Building::ResearchLab {
            heads.insert(("lab-constructions", x.owner.0));
        }
    }
    for (kind, key) in heads {
        let n=sqlx::query("UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND kind=$2 AND key=$3").bind(u.0).bind(kind).bind(key).execute(&mut **tx).await.map_err(db_error)?;
        if n.rows_affected() != 1 {
            return Err(StoreError::CorruptData);
        }
    }
    Ok(())
}

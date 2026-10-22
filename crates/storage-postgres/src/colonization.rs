//! Colony persistence joins the same fenced transaction as consumption and reports.
use crate::{ordering::Tx, *};
use orbit_engine::*;

pub(crate) async fn enrollment_predecessor(
    tx: &mut Tx<'_>,
    u: UniverseId,
    coordinates: Coordinates,
    at: i64,
    scoped: bool,
) -> Result<bool, StoreError> {
    if scoped {
        let key = serde_json::to_string(&ScopeKey::Location(coordinates))
            .map_err(|_| StoreError::CorruptData)?;
        // stamp() holds this location's ordering row, preventing new selection
        // or admission while the absence and predecessor predicates are checked.
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM input_scopes s JOIN pending_inputs p ON p.universe=s.universe AND p.input_id=s.input_id WHERE s.universe=$1 AND s.scope_key=$2 AND p.at_ms <= $3)")
            .bind(u.0).bind(key).bind(at).fetch_one(&mut **tx).await.map_err(db_error)
    } else {
        // The serial executor has no per-location declarations. Preserve its
        // canonical order before changing occupancy; release the gate to catch up.
        sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM pending_inputs WHERE universe=$1 AND at_ms <= $2)",
        )
        .bind(u.0)
        .bind(at)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
    }
}

pub(crate) async fn insert_colony(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    facts: &GameState,
    change: &ChangeSet,
    body: &Body,
) -> Result<(), StoreError> {
    let genesis = change
        .world
        .as_ref()
        .and_then(|w| w.records.colonies.get(&body.id))
        .ok_or(StoreError::CorruptData)?;
    let slot = planet_slot(facts, body.coordinates).map_err(|_| StoreError::CorruptData)?;
    if genesis.input != i.id
        || genesis.created_at != i.at
        || slot.occupant.is_some()
        || body.universe != i.universe
        || body.kind != BodyKind::Planet
        || body.revision != 0
        || !facts.coverage.owned_body_players.contains(&body.owner)
    {
        return Err(StoreError::CorruptData);
    }
    sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,revision) VALUES($1,$2,$3,'Planet',$4,$5,$6,$7,$8,$9,$10,$11,0)")
        .bind(body.id.0).bind(i.universe.0).bind(body.owner.0)
        .bind(body.coordinates.galaxy as i32).bind(body.coordinates.system as i32).bind(body.coordinates.position as i32)
        .bind(i64::from(body.fields)).bind(body.max_temperature).bind(sqlx::types::Json(body.checkpoint.amounts))
        .bind(sqlx::types::Json(body.checkpoint.carry)).bind(body.checkpoint.at).execute(&mut **tx).await.map_err(db_error)?;
    for (building, level) in &body.levels {
        sqlx::query("INSERT INTO building_levels(body,building,level) VALUES($1,$2,$3)")
            .bind(body.id.0)
            .bind(format!("{building:?}"))
            .bind(i64::from(*level))
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    for kind in [
        "production".to_owned(),
        "constructions".into(),
        "manufacturing".into(),
        format!("inventory:{}", body.owner),
    ] {
        sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
            .bind(i.universe.0)
            .bind(kind)
            .bind(body.id.0)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    let n = sqlx::query("UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND kind='owned-bodies' AND key=$2")
        .bind(i.universe.0).bind(body.owner.0).execute(&mut **tx).await.map_err(db_error)?;
    if n.rows_affected() != 1 {
        return Err(StoreError::CorruptData);
    }
    Ok(())
}

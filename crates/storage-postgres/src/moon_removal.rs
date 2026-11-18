//! Complete, indexed lunar endpoint membership and immutable removal records.
use crate::{
    ordering::{Tx, decode_supported},
    *,
};
use orbit_engine::*;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

async fn arrivals(
    tx: &mut Tx<'_>,
    u: UniverseId,
    moon: BodyId,
) -> Result<Vec<(Uuid, Uuid)>, StoreError> {
    sqlx::query_as("SELECT id,owner FROM mission_fleets WHERE universe=$1 AND data->>'leg' IN ('Outbound','Holding') AND data->'intent'->'destination'->>'id'=$2 ORDER BY id")
        .bind(u.0).bind(moon.to_string()).fetch_all(&mut **tx).await.map_err(db_error)
}

pub(crate) async fn participant_scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    moon: BodyId,
) -> Result<BTreeSet<ScopeKey>, StoreError> {
    let mut scopes: BTreeSet<_> = arrivals(tx, u, moon)
        .await?
        .into_iter()
        .map(|(_, owner)| ScopeKey::Player(PlayerId(owner)))
        .collect();
    // A successful attack can cancel active jobs and the hold end of defeated
    // visitors. Keep every dependency already declared for those events.
    let rows = sqlx::query_scalar::<_, serde_json::Value>(r#"
        SELECT DISTINCT s.scope_key::jsonb FROM scheduled_events e
        JOIN input_scopes s ON s.universe=e.universe AND s.input_id=e.id
        WHERE e.universe=$1 AND NOT e.done AND NOT e.cancelled AND (
            e.event->>'operation' IN (
                SELECT id::text FROM constructions WHERE body=$2 AND status='Active'
                UNION ALL SELECT id::text FROM manufacturing_batches WHERE body=$2 AND data->>'status'='Active'
            ) OR e.event->>'fleet' IN (
                SELECT id::text FROM mission_fleets WHERE universe=$1 AND data->>'leg'='Holding'
                    AND data->'intent'->'destination'->>'id'=$3
            )
        )"#).bind(u.0).bind(moon.0).bind(moon.to_string()).fetch_all(&mut **tx).await.map_err(db_error)?;
    for row in rows {
        scopes.insert(decode_supported(row)?);
    }
    Ok(scopes)
}

/// A later transport, raid or hold can start after the destruction flight was
/// accepted. Its owner must be in the declared scope before that arrival runs.
pub(crate) async fn extend_pending(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    moon: BodyId,
    f: &MissionFleet,
) -> Result<(), StoreError> {
    let key = serde_json::to_string(&ScopeKey::Location(f.destination_coordinates))
        .map_err(|_| StoreError::CorruptData)?;
    let rows = sqlx::query_scalar::<_, serde_json::Value>(r#"
        SELECT p.input FROM pending_inputs p JOIN input_scopes s ON s.universe=p.universe AND s.input_id=p.input_id
        WHERE p.universe=$1 AND s.scope_key=$6 AND
            (p.at_ms,p.phase,p.sequence)>($2,$3,$4) AND (
                (p.input #>> '{payload,Command,action,intent,mission}'='DestroyMoon'
                 AND p.input #>> '{payload,Command,action,intent,destination,id}'=$5)
                OR p.input_id IN (
                    SELECT e.id FROM scheduled_events e JOIN mission_fleets f
                        ON f.universe=e.universe AND f.id::text=e.event->>'fleet'
                    WHERE e.universe=$1 AND NOT e.done AND NOT e.cancelled
                        AND e.event->>'expected_leg'='Outbound'
                        AND f.data->'intent'->>'mission'='DestroyMoon'
                        AND f.data->'intent'->'destination'->>'id'=$5
                )
            )"#).bind(i.universe.0).bind(i.at).bind(i.phase).bind(i.sequence).bind(moon.to_string()).bind(key).fetch_all(&mut **tx).await.map_err(db_error)?;
    let scopes = BTreeSet::from([ScopeKey::Player(f.owner)]);
    for value in rows {
        crate::admission::register(tx, &crate::ordering::ordered_input(value)?, &scopes).await?;
    }
    Ok(())
}

pub(crate) async fn cover_arrival(
    tx: &mut Tx<'_>,
    u: UniverseId,
    input: &Input,
    fleets: &[MissionFleet],
    state: &mut GameState,
) -> Result<(), StoreError> {
    let Input::Event(ScheduledEvent::FleetLegDue {
        fleet,
        expected_leg: MissionLeg::Outbound,
        ..
    }) = input
    else {
        return Ok(());
    };
    let Some(wave) = fleets
        .iter()
        .find(|f| f.id == *fleet && f.intent.mission == Mission::DestroyMoon)
    else {
        return Ok(());
    };
    let MissionDestination::Body {
        id, expected_owner, ..
    } = wave.intent.destination
    else {
        return Err(StoreError::CorruptData);
    };
    if !state.bodies.contains_key(&id) {
        // A later wave takes the existing invalid-target return path.
        return Ok(());
    }
    let coverage = &mut state.coverage;
    let loaded: BTreeSet<_> = fleets.iter().map(|f| f.id.0).collect();
    if !coverage.fleet_owners.contains(&expected_owner)
        || arrivals(tx, u, id).await?.iter().any(|(flight, owner)| {
            !loaded.contains(flight) || !coverage.fleet_owners.contains(&PlayerId(*owner))
        })
    {
        return Err(StoreError::CorruptData);
    }
    coverage.moon_removal_bodies.insert(id);
    Ok(())
}

pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    owners: &[Uuid],
    fleets: &[MissionFleet],
    all: bool,
) -> Result<BTreeMap<BodyId, DestroyedMoon>, StoreError> {
    let mut original = BTreeSet::new();
    for f in fleets {
        if f.intent.origin != f.terms.intent.origin {
            original.insert(f.terms.intent.origin.0);
        }
        if f.intent.destination != f.terms.intent.destination
            && let MissionDestination::Body { id, .. } = f.terms.intent.destination
        {
            original.insert(id.0);
        }
    }
    let rows = sqlx::query_scalar::<_,serde_json::Value>("SELECT data FROM destroyed_moons WHERE universe=$1 AND ($2 OR owner=ANY($3) OR id=ANY($4)) ORDER BY id")
        .bind(u.0).bind(all).bind(owners).bind(original.into_iter().collect::<Vec<_>>()).fetch_all(&mut **tx).await.map_err(db_error)?;
    rows.into_iter()
        .map(|row| {
            let loss: DestroyedMoon = decode_supported(row)?;
            Ok((loss.body, loss))
        })
        .collect()
}

pub(crate) async fn save(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    before: &WorldRecords,
    after: &WorldRecords,
) -> Result<(), StoreError> {
    for (id, loss) in &after.destroyed_moons {
        if let Some(previous) = before.destroyed_moons.get(id) {
            if previous != loss {
                return Err(StoreError::CorruptData);
            }
            continue;
        }
        if loss.input != i.id
            || before.moons.get(id).map(|m| m.parent) != Some(loss.parent)
            || after.moons.contains_key(id)
        {
            return Err(StoreError::CorruptData);
        }
        sqlx::query("INSERT INTO destroyed_moons(universe,id,owner,data) VALUES($1,$2,$3,$4)")
            .bind(i.universe.0)
            .bind(id.0)
            .bind(loss.owner.0)
            .bind(sqlx::types::Json(loss))
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        // The live body cascades resident inventory, levels, gate use and genesis.
        // Paid jobs retain their history after their due events have been invalidated.
        sqlx::query("DELETE FROM body_activity WHERE universe=$1 AND id=$2")
            .bind(i.universe.0)
            .bind(id.0)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        sqlx::query("DELETE FROM production_settings WHERE body=$1")
            .bind(id.0)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        let removed = sqlx::query(
            "DELETE FROM bodies WHERE universe=$1 AND id=$2 AND owner=$3 AND kind='Moon'",
        )
        .bind(i.universe.0)
        .bind(id.0)
        .bind(loss.owner.0)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        if removed.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND kind='owned-bodies' AND key=$2")
            .bind(i.universe.0).bind(loss.owner.0).execute(&mut **tx).await.map_err(db_error)?;
    }
    Ok(())
}

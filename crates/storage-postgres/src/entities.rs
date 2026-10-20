use crate::ordering::{Tx, decode};
use crate::*;
use orbit_engine::*;
use sqlx::{Row, postgres::PgRow};
use std::collections::{BTreeMap, BTreeSet};
fn text_enum<T: serde::de::DeserializeOwned>(r: &PgRow, key: &str) -> Result<T, StoreError> {
    decode(serde_json::Value::String(r.try_get(key).map_err(db_error)?))
}
pub(crate) fn construction(r: PgRow) -> Result<Construction, StoreError> {
    Ok(Construction {
        progression: match r.try_get::<Option<serde_json::Value>, _>("progression") {
            Ok(v) => v.map(decode).transpose()?,
            Err(sqlx::Error::ColumnNotFound(_)) => None,
            Err(e) => return Err(db_error(e)),
        },
        id: OperationId(r.try_get("id").map_err(db_error)?),
        body: BodyId(r.try_get("body").map_err(db_error)?),
        owner: PlayerId(r.try_get("owner").map_err(db_error)?),
        building: text_enum(&r, "building")?,
        target_level: u32::try_from(r.try_get::<i64, _>("target_level").map_err(db_error)?)
            .map_err(|_| StoreError::CorruptData)?,
        paid: decode(r.try_get("paid").map_err(db_error)?)?,
        profile_hash: Hash(r.try_get("profile_hash").map_err(db_error)?),
        terms_hash: Hash(r.try_get("terms_hash").map_err(db_error)?),
        started_at: r.try_get("started_at").map_err(db_error)?,
        due_at: r.try_get("due_at").map_err(db_error)?,
        generation: r.try_get("generation").map_err(db_error)?,
        status: text_enum(&r, "status")?,
        revision: r.try_get("revision").map_err(db_error)?,
    })
}
pub(crate) async fn fleets(tx: &mut Tx<'_>, rows: Vec<PgRow>) -> Result<Vec<Fleet>, StoreError> {
    let ids = rows
        .iter()
        .map(|r| r.try_get::<uuid::Uuid, _>("id").map_err(db_error))
        .collect::<Result<Vec<_>, _>>()?;
    let mut by_fleet: BTreeMap<FleetId, Vec<ShipStack>> = BTreeMap::new();
    if !ids.is_empty() {
        for r in sqlx::query("SELECT fleet,owner,ship_type,count FROM fleet_ships WHERE fleet=ANY($1) ORDER BY fleet,owner,ship_type").bind(&ids).fetch_all(&mut **tx).await.map_err(db_error)?{
        by_fleet.entry(FleetId(r.try_get("fleet").map_err(db_error)?)).or_default().push(ShipStack{owner:PlayerId(r.try_get("owner").map_err(db_error)?),ship_type:text_enum(&r,"ship_type")?,count:r.try_get("count").map_err(db_error)?});
    }
    }
    rows.into_iter()
        .map(|row| {
            let id = FleetId(row.try_get("id").map_err(db_error)?);
            fleet(row, by_fleet.remove(&id).ok_or(StoreError::CorruptData)?)
        })
        .collect()
}
fn fleet(r: PgRow, ships: Vec<ShipStack>) -> Result<Fleet, StoreError> {
    let id = FleetId(r.try_get("id").map_err(db_error)?);
    Ok(Fleet {
        id,
        ships,
        owner: PlayerId(r.try_get("owner").map_err(db_error)?),
        origin: BodyId(r.try_get("origin").map_err(db_error)?),
        target: BodyId(r.try_get("target").map_err(db_error)?),
        target_owner: PlayerId(r.try_get("target_owner").map_err(db_error)?),
        target_kind: text_enum(&r, "target_kind")?,
        payload: decode(r.try_get("payload").map_err(db_error)?)?,
        paid_fuel: r.try_get("paid_fuel").map_err(db_error)?,
        profile_hash: Hash(r.try_get("profile_hash").map_err(db_error)?),
        terms_hash: Hash(r.try_get("terms_hash").map_err(db_error)?),
        launched_at: r.try_get("launched_at").map_err(db_error)?,
        duration: r.try_get("duration").map_err(db_error)?,
        due_at: r.try_get("due_at").map_err(db_error)?,
        generation: r.try_get("generation").map_err(db_error)?,
        status: text_enum(&r, "status")?,
        revision: r.try_get("revision").map_err(db_error)?,
    })
}
pub(crate) async fn report(tx: &mut Tx<'_>, r: PgRow) -> Result<Report, StoreError> {
    let id = ReportId(r.try_get("id").map_err(db_error)?);
    let recipients = sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT player FROM report_recipients WHERE report=$1 ORDER BY player",
    )
    .bind(id.0)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?
    .into_iter()
    .map(PlayerId)
    .collect::<BTreeSet<_>>();
    Ok(Report {
        id,
        recipients,
        fleet: FleetId(r.try_get("fleet").map_err(db_error)?),
        kind: text_enum(&r, "kind")?,
        at: r.try_get("at_ms").map_err(db_error)?,
        origin: BodyId(r.try_get("origin").map_err(db_error)?),
        target: BodyId(r.try_get("target").map_err(db_error)?),
        cargo: decode(r.try_get("cargo").map_err(db_error)?)?,
    })
}
pub(crate) async fn save_construction(
    tx: &mut Tx<'_>,
    u: UniverseId,
    c: &Construction,
    previous: Option<&Construction>,
) -> Result<(), StoreError> {
    if let Some(previous) = previous {
        let n=sqlx::query("UPDATE constructions SET status=$2,generation=$3,revision=$4 WHERE id=$1 AND revision=$5").bind(c.id.0).bind(format!("{:?}",c.status)).bind(c.generation).bind(c.revision).bind(previous.revision).execute(&mut **tx).await.map_err(db_error)?;
        if n.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
    } else {
        sqlx::query("INSERT INTO constructions(id,universe,body,owner,status,generation,revision,building,target_level,paid,profile_hash,started_at,due_at,terms_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)").bind(c.id.0).bind(u.0).bind(c.body.0).bind(c.owner.0).bind(format!("{:?}",c.status)).bind(c.generation).bind(c.revision).bind(format!("{:?}",c.building)).bind(i64::from(c.target_level)).bind(sqlx::types::Json(c.paid)).bind(&c.profile_hash.0).bind(c.started_at).bind(c.due_at).bind(&c.terms_hash.0).execute(&mut **tx).await.map_err(db_error)?;
    }
    Ok(())
}
pub(crate) async fn save_fleet(
    tx: &mut Tx<'_>,
    u: UniverseId,
    f: &Fleet,
    previous: Option<&Fleet>,
) -> Result<(), StoreError> {
    if let Some(previous) = previous {
        let n=sqlx::query("UPDATE fleets SET payload=$2,due_at=$3,generation=$4,status=$5,revision=$6 WHERE id=$1 AND revision=$7").bind(f.id.0).bind(sqlx::types::Json(f.payload)).bind(f.due_at).bind(f.generation).bind(format!("{:?}",f.status)).bind(f.revision).bind(previous.revision).execute(&mut **tx).await.map_err(db_error)?;
        if n.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
    } else {
        sqlx::query("INSERT INTO fleets(id,universe,owner,origin,target,target_owner,target_kind,payload,paid_fuel,profile_hash,launched_at,duration,due_at,generation,status,revision,terms_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)").bind(f.id.0).bind(u.0).bind(f.owner.0).bind(f.origin.0).bind(f.target.0).bind(f.target_owner.0).bind(format!("{:?}",f.target_kind)).bind(sqlx::types::Json(f.payload)).bind(f.paid_fuel).bind(&f.profile_hash.0).bind(f.launched_at).bind(f.duration).bind(f.due_at).bind(f.generation).bind(format!("{:?}",f.status)).bind(f.revision).bind(&f.terms_hash.0).execute(&mut **tx).await.map_err(db_error)?;
        for stack in &f.ships {
            sqlx::query("INSERT INTO fleet_ships(fleet,owner,ship_type,count) VALUES($1,$2,$3,$4)")
                .bind(f.id.0)
                .bind(stack.owner.0)
                .bind(format!("{:?}", stack.ship_type))
                .bind(stack.count)
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
        }
    }
    Ok(())
}
pub(crate) async fn save_report(
    tx: &mut Tx<'_>,
    u: UniverseId,
    r: &Report,
) -> Result<(), StoreError> {
    sqlx::query("INSERT INTO reports(id,universe,fleet,kind,at_ms,origin,target,cargo) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(r.id.0).bind(u.0).bind(r.fleet.0).bind(format!("{:?}",r.kind)).bind(r.at).bind(r.origin.0).bind(r.target.0).bind(sqlx::types::Json(r.cargo)).execute(&mut **tx).await.map_err(db_error)?;
    for p in &r.recipients {
        sqlx::query("INSERT INTO report_recipients(report,player) VALUES($1,$2)")
            .bind(r.id.0)
            .bind(p.0)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    Ok(())
}

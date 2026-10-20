use crate::{
    ordering::{Tx, decode},
    *,
};
use orbit_engine::*;
use sqlx::Row;
use std::collections::BTreeMap;
pub(crate) async fn research(
    tx: &mut Tx<'_>,
    owners: &[uuid::Uuid],
) -> Result<BTreeMap<PlayerId, ResearchLevels>, StoreError> {
    let mut out: BTreeMap<PlayerId, ResearchLevels> = BTreeMap::new();
    for r in
        sqlx::query("SELECT * FROM research_levels WHERE owner=ANY($1) ORDER BY owner,research")
            .bind(owners)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?
    {
        let owner = PlayerId(r.try_get("owner").map_err(db_error)?);
        let revision = r.try_get("revision").map_err(db_error)?;
        let facts = out.entry(owner).or_insert_with(|| ResearchLevels {
            owner,
            levels: BTreeMap::new(),
            revision,
        });
        if facts.revision != revision {
            return Err(StoreError::CorruptData);
        }
        facts.levels.insert(
            decode(serde_json::Value::String(
                r.try_get("research").map_err(db_error)?,
            ))?,
            u32::try_from(r.try_get::<i64, _>("level").map_err(db_error)?)
                .map_err(|_| StoreError::CorruptData)?,
        );
    }
    for owner in owners {
        out.get(&PlayerId(*owner))
            .ok_or(StoreError::CorruptData)?
            .validate()
            .map_err(|_| StoreError::CorruptData)?;
    }
    Ok(out)
}
pub(crate) async fn inventory(
    tx: &mut Tx<'_>,
    bodies: &[uuid::Uuid],
) -> Result<Vec<InventoryStack>, StoreError> {
    sqlx::query("SELECT * FROM inventories WHERE body=ANY($1) ORDER BY body,owner,item")
        .bind(bodies)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|r| {
            Ok(InventoryStack {
                body: BodyId(r.try_get("body").map_err(db_error)?),
                owner: PlayerId(r.try_get("owner").map_err(db_error)?),
                item: decode(r.try_get("item").map_err(db_error)?)?,
                count: r.try_get("count").map_err(db_error)?,
                revision: r.try_get("revision").map_err(db_error)?,
            })
        })
        .collect()
}

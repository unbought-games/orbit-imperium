use crate::*;
use orbit_application::*;
use sqlx::Row;
use std::collections::BTreeMap;

impl PgStore {
    pub(crate) async fn read_empire_identities(
        &self,
        players: Vec<PlayerId>,
    ) -> Result<BTreeMap<PlayerId, EmpireIdentityRecord>, StoreError> {
        let rows = sqlx::query("SELECT e.player,e.empire_name,e.tagline,e.title_id,ARRAY(SELECT item_id FROM cosmetic_grants g WHERE g.account=o.account AND g.kind='title') AS grants FROM empire_profiles e JOIN orbit_profiles o ON o.id=e.profile WHERE e.player=ANY($1)")
            .bind(players.iter().map(|p| p.0).collect::<Vec<_>>()).fetch_all(self.read_pool()?).await.map_err(db_error)?;
        rows.into_iter()
            .map(|r| {
                Ok((
                    PlayerId(r.try_get("player").map_err(db_error)?),
                    EmpireIdentityRecord {
                        identity: EmpireIdentity {
                            name: r.try_get("empire_name").map_err(db_error)?,
                            tagline: r.try_get("tagline").map_err(db_error)?,
                            title_id: r.try_get("title_id").map_err(db_error)?,
                        },
                        grants: r.try_get("grants").map_err(db_error)?,
                    },
                ))
            })
            .collect()
    }
}

/// Trusted server/operator award hook. Call in the authoritative achievement
/// transaction. First award wins; replay never duplicates or rewrites provenance.
/// No catalog lookup: awards survive temporarily uninstalled content.
pub async fn grant_cosmetic(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    account: AccountId,
    kind: &str,
    item: &str,
    source: &str,
    reason: &str,
) -> Result<(), StoreError> {
    if !valid_symbol_id(kind)
        || !valid_symbol_id(item)
        || source.trim().is_empty()
        || !valid_identity_text(source, 200)
        || reason.trim().is_empty()
        || !valid_identity_text(reason, 2000)
    {
        return Err(StoreError::Conflict);
    }
    sqlx::query("INSERT INTO cosmetic_grants(account,kind,item_id,source,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account,kind,item_id) DO NOTHING")
        .bind(account.0).bind(kind).bind(item).bind(source).bind(reason).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

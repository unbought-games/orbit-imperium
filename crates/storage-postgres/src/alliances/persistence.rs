use super::*;

pub(super) async fn membership(
    tx: &mut Tx<'_>,
    b: Binding,
    player: PlayerId,
) -> Result<Option<Uuid>, StoreError> {
    sqlx::query_scalar(
        "SELECT alliance FROM alliance_memberships WHERE universe=$1 AND epoch=$2 AND player=$3",
    )
    .bind(b.universe.0)
    .bind(b.epoch.0)
    .bind(player.0)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)
}
pub(crate) async fn load(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
    id: Uuid,
) -> Result<AllianceState, StoreError> {
    let row = sqlx::query("SELECT * FROM alliances WHERE universe=$1 AND epoch=$2 AND id=$3")
        .bind(universe.0)
        .bind(epoch.0)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)?;
    let members = sqlx::query(
        "SELECT player,joined_at,roles FROM alliance_memberships WHERE alliance=$1 ORDER BY player",
    )
    .bind(id)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?
    .into_iter()
    .map(|r| {
        Ok(StateMember {
            player: PlayerId(r.try_get("player").map_err(db_error)?),
            joined_at: r.try_get("joined_at").map_err(db_error)?,
            roles: r
                .try_get::<sqlx::types::Json<Vec<Uuid>>, _>("roles")
                .map_err(db_error)?
                .0,
        })
    })
    .collect::<Result<Vec<_>, StoreError>>()?;
    let applications=sqlx::query("SELECT id,player,text,created_at FROM alliance_applications WHERE alliance=$1 ORDER BY created_at,id").bind(id).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(|r|Ok(StateApplication{id:r.try_get("id").map_err(db_error)?,player:PlayerId(r.try_get("player").map_err(db_error)?),text:r.try_get("text").map_err(db_error)?,created_at:r.try_get("created_at").map_err(db_error)?})).collect::<Result<Vec<_>,StoreError>>()?;
    Ok(AllianceState {
        id,
        name: row.try_get("name").map_err(db_error)?,
        tag: row.try_get("tag").map_err(db_error)?,
        leader: PlayerId(row.try_get("leader").map_err(db_error)?),
        recruitment: recruitment(&row)?,
        public_text: row.try_get("public_text").map_err(db_error)?,
        revision: row.try_get::<i64, _>("revision").map_err(db_error)? as u64,
        roles: row
            .try_get::<sqlx::types::Json<_>, _>("roles")
            .map_err(db_error)?
            .0,
        posts: row
            .try_get::<sqlx::types::Json<_>, _>("posts")
            .map_err(db_error)?
            .0,
        audit: row
            .try_get::<sqlx::types::Json<_>, _>("audit")
            .map_err(db_error)?
            .0,
        members,
        applications,
    })
}
pub(super) fn recruitment(row: &PgRow) -> Result<AllianceRecruitment, StoreError> {
    match row.try_get::<&str, _>("recruitment").map_err(db_error)? {
        "Open" => Ok(AllianceRecruitment::Open),
        "Application" => Ok(AllianceRecruitment::Application),
        "Closed" => Ok(AllianceRecruitment::Closed),
        _ => Err(StoreError::CorruptData),
    }
}
pub(super) async fn save(tx: &mut Tx<'_>, b: Binding, s: &AllianceState) -> Result<(), StoreError> {
    let recruitment = match s.recruitment {
        AllianceRecruitment::Open => "Open",
        AllianceRecruitment::Application => "Application",
        AllianceRecruitment::Closed => "Closed",
    };
    sqlx::query("INSERT INTO alliances(universe,epoch,id,name,tag,leader,recruitment,public_text,revision,roles,posts,audit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,tag=EXCLUDED.tag,leader=EXCLUDED.leader,recruitment=EXCLUDED.recruitment,public_text=EXCLUDED.public_text,revision=EXCLUDED.revision,roles=EXCLUDED.roles,posts=EXCLUDED.posts,audit=EXCLUDED.audit")
        .bind(b.universe.0).bind(b.epoch.0).bind(s.id).bind(&s.name).bind(&s.tag).bind(s.leader.0).bind(recruitment).bind(&s.public_text).bind(i64::try_from(s.revision).map_err(|_|StoreError::Conflict)?).bind(sqlx::types::Json(&s.roles)).bind(sqlx::types::Json(&s.posts)).bind(sqlx::types::Json(&s.audit)).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("DELETE FROM alliance_memberships WHERE alliance=$1")
        .bind(s.id)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    for m in &s.members {
        sqlx::query("INSERT INTO alliance_memberships(universe,epoch,player,alliance,joined_at,roles) VALUES($1,$2,$3,$4,$5,$6)").bind(b.universe.0).bind(b.epoch.0).bind(m.player.0).bind(s.id).bind(m.joined_at).bind(sqlx::types::Json(&m.roles)).execute(&mut **tx).await.map_err(db_error)?;
    }
    sqlx::query("DELETE FROM alliance_applications WHERE alliance=$1")
        .bind(s.id)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    for a in &s.applications {
        sqlx::query("INSERT INTO alliance_applications(id,universe,epoch,alliance,player,text,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)").bind(a.id).bind(b.universe.0).bind(b.epoch.0).bind(s.id).bind(a.player.0).bind(&a.text).bind(a.created_at).execute(&mut **tx).await.map_err(db_error)?;
    }
    Ok(())
}
pub(super) async fn history(
    tx: &mut Tx<'_>,
    b: Binding,
    before: Option<&AllianceState>,
    after: Option<&AllianceState>,
    at: i64,
) -> Result<(), StoreError> {
    if let Some(old) = before {
        for m in &old.members {
            if after
                .is_some_and(|s| s.is_member(m.player) && s.name == old.name && s.tag == old.tag)
            {
                continue;
            }
            sqlx::query("UPDATE alliance_affiliation_history SET valid_until=$4 WHERE universe=$1 AND epoch=$2 AND player=$3 AND valid_until IS NULL").bind(b.universe.0).bind(b.epoch.0).bind(m.player.0).bind(at).execute(&mut **tx).await.map_err(db_error)?;
        }
    }
    if let Some(new) = after {
        for m in &new.members {
            if before
                .is_some_and(|s| s.is_member(m.player) && s.name == new.name && s.tag == new.tag)
            {
                continue;
            }
            sqlx::query("INSERT INTO alliance_affiliation_history(universe,epoch,player,valid_from,alliance,tag,name) VALUES($1,$2,$3,$4,$5,$6,$7)").bind(b.universe.0).bind(b.epoch.0).bind(m.player.0).bind(at).bind(new.id).bind(&new.tag).bind(&new.name).execute(&mut **tx).await.map_err(db_error)?;
        }
    }
    Ok(())
}

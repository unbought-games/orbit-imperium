use super::*;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn summary(row: &PgRow, universe: UniverseId) -> Result<AllianceSummary, StoreError> {
    Ok(AllianceSummary {
        id: row.try_get("id").map_err(db_error)?,
        universe,
        name: row.try_get("name").map_err(db_error)?,
        tag: row.try_get("tag").map_err(db_error)?,
        recruitment: recruitment(row)?,
        member_count: row.try_get::<i64, _>("member_count").map_err(db_error)? as u64,
        ranking: None,
    })
}
async fn names(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    ids: BTreeSet<PlayerId>,
) -> Result<BTreeMap<PlayerId, String>, StoreError> {
    let ids: Vec<_> = ids.into_iter().map(|p| p.0).collect();
    let rows:Vec<(Uuid,String)>=sqlx::query_as("SELECT m.player,a.name FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1 AND m.player=ANY($2)").bind(universe.0).bind(ids).fetch_all(&mut **tx).await.map_err(db_error)?;
    Ok(rows.into_iter().map(|(p, n)| (PlayerId(p), n)).collect())
}
impl PgStore {
    pub(crate) async fn read_public_alliance(
        &self,
        universe: UniverseId,
        id: Uuid,
    ) -> Result<PublicAlliance, StoreError> {
        // Read public identity and derived scores in the same observation.
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let row=sqlx::query("SELECT a.epoch,a.id,a.name,a.tag,a.recruitment,a.public_text,(SELECT count(*) FROM alliance_memberships m WHERE m.alliance=a.id) AS member_count FROM alliances a JOIN universes u ON u.id=a.universe AND u.epoch=a.epoch WHERE a.universe=$1 AND a.id=$2").bind(universe.0).bind(id).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        let epoch = Epoch(row.try_get("epoch").map_err(db_error)?);
        let scores = crate::rankings::alliance_scores_in_snapshot(&mut tx, universe, epoch).await?;
        let mut summary = summary(&row, universe)?;
        summary.ranking = scores.get(&id).cloned();
        let result = PublicAlliance {
            summary,
            public_text: row.try_get("public_text").map_err(db_error)?,
        };
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
    pub(crate) async fn read_alliances(
        &self,
        q: AllianceQueryRequest,
    ) -> Result<AllianceView, StoreError> {
        let b = q.context.binding;
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        crate::bots::observe(&mut tx, b).await?;
        let at = now(&mut tx).await?;
        let mut view = AllianceView {
            binding: b,
            request_id: q.context.request_id,
            sampled_at: at,
            directory: vec![],
            directory_count: 0,
            alliance: None,
            applications: vec![],
        };
        let (target, before) = match q.query {
            AllianceQuery::Mine => (membership(&mut tx, b, b.player).await?, None),
            AllianceQuery::Detail {
                alliance,
                post_before,
            } => (Some(alliance), post_before),
            AllianceQuery::Directory { search, offset } => {
                if search.chars().count() > 48 || offset > i64::MAX as u64 {
                    return Err(StoreError::Conflict);
                }
                let search = search.trim().to_lowercase();
                let count:i64=sqlx::query_scalar("SELECT count(*) FROM alliances WHERE universe=$1 AND epoch=$2 AND (strpos(lower(name),$3)>0 OR strpos(lower(tag),$3)>0)").bind(b.universe.0).bind(b.epoch.0).bind(&search).fetch_one(&mut *tx).await.map_err(db_error)?;
                view.directory_count = count as u64;
                let rows=sqlx::query("SELECT a.id,a.name,a.tag,a.recruitment,(SELECT count(*) FROM alliance_memberships m WHERE m.alliance=a.id) AS member_count FROM alliances a WHERE a.universe=$1 AND a.epoch=$2 AND (strpos(lower(a.name),$3)>0 OR strpos(lower(a.tag),$3)>0) ORDER BY lower(a.name),a.id LIMIT 20 OFFSET $4").bind(b.universe.0).bind(b.epoch.0).bind(&search).bind(offset as i64).fetch_all(&mut *tx).await.map_err(db_error)?;
                view.directory = rows
                    .iter()
                    .map(|r| summary(r, b.universe))
                    .collect::<Result<_, _>>()?;
                (None, None)
            }
        };
        if let Some(id) = target {
            let state = load(&mut tx, b.universe, b.epoch, id).await?;
            if state.is_member(b.player) {
                let ids = state
                    .members
                    .iter()
                    .map(|m| m.player)
                    .chain(state.applications.iter().map(|a| a.player))
                    .chain(state.posts.iter().map(|p| p.author))
                    .chain(state.audit.iter().map(|a| a.actor))
                    .collect();
                let labels = names(&mut tx, b.universe, ids).await?;
                let mut presence = BTreeMap::new();
                if state
                    .permissions(b.player)
                    .contains(&AlliancePermission::ViewActivity)
                {
                    let members: Vec<_> = state.members.iter().map(|m| m.player.0).collect();
                    let rows:Vec<(Uuid,i64)>=sqlx::query_as("SELECT id,(data->>'last_presence_at')::bigint FROM player_policies WHERE universe=$1 AND id=ANY($2)").bind(b.universe.0).bind(members).fetch_all(&mut *tx).await.map_err(db_error)?;
                    presence = rows
                        .into_iter()
                        .map(|(id, at)| (PlayerId(id), at))
                        .collect();
                }
                view.alliance =
                    alliance_detail(b.universe, &state, b.player, &labels, &presence, at, before)?;
            } else {
                // Caller may use the public endpoint for recruitment text. Do not
                // serialize even a partial private detail (which requires leader).
                view.directory = vec![alliance_summary(b.universe, &state)];
                view.directory_count = 1;
            }
        }
        let rows=sqlx::query("SELECT p.id,p.alliance,a.tag,p.player,p.text,p.created_at,c.name FROM alliance_applications p JOIN alliances a ON a.id=p.alliance JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.player JOIN accounts c ON c.id=m.account WHERE p.universe=$1 AND p.epoch=$2 AND p.player=$3 ORDER BY p.created_at,p.id LIMIT 5").bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        for r in rows {
            view.applications.push(AllianceApplication {
                id: r.try_get("id").map_err(db_error)?,
                alliance: r.try_get("alliance").map_err(db_error)?,
                alliance_tag: r.try_get("tag").map_err(db_error)?,
                player: b.player,
                username: r.try_get("name").map_err(db_error)?,
                text: r.try_get("text").map_err(db_error)?,
                created_at: r.try_get("created_at").map_err(db_error)?,
            });
        }
        let scores =
            crate::rankings::alliance_scores_in_snapshot(&mut tx, b.universe, b.epoch).await?;
        for summary in &mut view.directory {
            summary.ranking = scores.get(&summary.id).cloned();
        }
        if let Some(detail) = &mut view.alliance {
            detail.summary.ranking = scores.get(&detail.summary.id).cloned();
        }
        tx.commit().await.map_err(db_error)?;
        Ok(view)
    }
}

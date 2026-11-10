use super::*;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn summary(row: &PgRow, universe: UniverseId) -> Result<AllianceSummary, StoreError> {
    Ok(AllianceSummary {
        id: row.try_get("id").map_err(db_error)?,
        universe,
        name: row.try_get("name").map_err(db_error)?,
        tag: row.try_get("tag").map_err(db_error)?,
        recruitment: recruitment(row)?,
        recruitment_profile: row
            .try_get::<sqlx::types::Json<_>, _>("recruitment_profile")
            .map_err(db_error)?
            .0,
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
        self.read_recruitment_target(universe, id, false).await
    }
    pub(crate) async fn read_alliance_invitation(
        &self,
        universe: UniverseId,
        token: Uuid,
    ) -> Result<PublicAlliance, StoreError> {
        self.read_recruitment_target(universe, token, true).await
    }
    async fn read_recruitment_target(
        &self,
        universe: UniverseId,
        id: Uuid,
        invitation: bool,
    ) -> Result<PublicAlliance, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let row = sqlx::query("SELECT a.epoch,a.id,a.name,a.tag,a.recruitment,a.recruitment_profile,a.public_text,(SELECT count(*) FROM alliance_memberships m WHERE m.alliance=a.id) AS member_count FROM alliances a JOIN universes u ON u.id=a.universe AND u.epoch=a.epoch WHERE a.universe=$1 AND (($3 AND a.invitation=$2) OR (NOT $3 AND a.id=$2))")
            .bind(universe.0).bind(id).bind(invitation).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        let (universe_name, enrollment_open) = self.recruitment_world(&mut tx, universe).await?;
        let epoch = Epoch(row.try_get("epoch").map_err(db_error)?);
        let scores = crate::rankings::alliance_scores_in_snapshot(&mut tx, universe, epoch).await?;
        let mut result = public_projection(&row, universe, &universe_name, enrollment_open)?;
        result.summary.ranking = scores.get(&result.summary.id).cloned();
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
    async fn recruitment_world(
        &self,
        tx: &mut Tx<'_>,
        universe: UniverseId,
    ) -> Result<(String, bool), StoreError> {
        let name: String = sqlx::query_scalar("SELECT name FROM universes WHERE id=$1")
            .bind(universe.0)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        let policy = self.read_policy(tx, universe, false).await?;
        let open = if let Some(current) = policy {
            let count: i64 =
                sqlx::query_scalar("SELECT count(*) FROM universe_memberships WHERE universe=$1")
                    .bind(universe.0)
                    .fetch_one(&mut **tx)
                    .await
                    .map_err(db_error)?;
            current.policy.signup_enabled
                && count < i64::from(current.policy.effective_max_players(&current.immutable))
        } else {
            false
        };
        Ok((name, open))
    }
    pub(crate) async fn read_recruitment_directory(
        &self,
        universe: UniverseId,
        query: RecruitmentSearch,
    ) -> Result<RecruitmentDirectory, StoreError> {
        query.validate()?;
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let (universe_name, enrollment_open) = self.recruitment_world(&mut tx, universe).await?;
        let filter = "a.universe=$1 AND a.epoch=u.epoch AND a.recruitment<>'Closed' AND a.recruitment_profile->>'listed'='true' AND (strpos(lower(a.name),$2)>0 OR strpos(lower(a.tag),$2)>0) AND ($3::text IS NULL OR (a.recruitment_profile->'languages') ? $3) AND ($4::text IS NULL OR a.recruitment_profile->>'beginners'=$4) AND ($5::text IS NULL OR a.recruitment_profile->>'activity'=$5)";
        let search = query.search.trim().to_lowercase();
        let beginners = query.beginners.map(|value| {
            serde_json::to_value(value)
                .expect("enum")
                .as_str()
                .expect("string")
                .to_owned()
        });
        let activity = query.activity.map(|value| {
            serde_json::to_value(value)
                .expect("enum")
                .as_str()
                .expect("string")
                .to_owned()
        });
        let total: i64 = sqlx::query_scalar(&format!(
            "SELECT count(*) FROM alliances a JOIN universes u ON u.id=a.universe WHERE {filter}"
        ))
        .bind(universe.0)
        .bind(&search)
        .bind(&query.language)
        .bind(&beginners)
        .bind(&activity)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let rows = sqlx::query(&format!("SELECT a.epoch,a.id,a.name,a.tag,a.recruitment,a.recruitment_profile,a.public_text,(SELECT count(*) FROM alliance_memberships m WHERE m.alliance=a.id) AS member_count FROM alliances a JOIN universes u ON u.id=a.universe WHERE {filter} ORDER BY lower(a.name),a.id LIMIT 20 OFFSET $6"))
            .bind(universe.0).bind(&search).bind(&query.language).bind(&beginners).bind(&activity).bind(query.offset as i64).fetch_all(&mut *tx).await.map_err(db_error)?;
        let scores = if let Some(row) = rows.first() {
            let epoch = Epoch(row.try_get("epoch").map_err(db_error)?);
            crate::rankings::alliance_scores_in_snapshot(&mut tx, universe, epoch).await?
        } else {
            BTreeMap::new()
        };
        let alliances = rows
            .iter()
            .map(|row| {
                let mut alliance =
                    public_projection(row, universe, &universe_name, enrollment_open)?;
                alliance.summary.ranking = scores.get(&alliance.summary.id).cloned();
                Ok(alliance)
            })
            .collect::<Result<_, _>>()?;
        tx.commit().await.map_err(db_error)?;
        Ok(RecruitmentDirectory {
            alliances,
            total: total as u64,
        })
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
            AllianceQuery::Directory {
                search,
                offset,
                recruiting_only,
                language,
                beginners,
                activity,
            } => {
                RecruitmentSearch {
                    search: search.clone(),
                    offset,
                    language: language.clone(),
                    beginners,
                    activity,
                }
                .validate()?;
                let search = search.trim().to_lowercase();
                let beginners = beginners.map(|value| {
                    serde_json::to_value(value)
                        .expect("enum")
                        .as_str()
                        .expect("string")
                        .to_owned()
                });
                let activity = activity.map(|value| {
                    serde_json::to_value(value)
                        .expect("enum")
                        .as_str()
                        .expect("string")
                        .to_owned()
                });
                let filter = "a.universe=$1 AND a.epoch=$2 AND (strpos(lower(a.name),$3)>0 OR strpos(lower(a.tag),$3)>0) AND (NOT $4::boolean OR a.recruitment<>'Closed') AND ($5::text IS NULL OR (a.recruitment_profile->'languages') ? $5) AND ($6::text IS NULL OR a.recruitment_profile->>'beginners'=$6) AND ($7::text IS NULL OR a.recruitment_profile->>'activity'=$7)";
                let count: i64 =
                    sqlx::query_scalar(&format!("SELECT count(*) FROM alliances a WHERE {filter}"))
                        .bind(b.universe.0)
                        .bind(b.epoch.0)
                        .bind(&search)
                        .bind(recruiting_only)
                        .bind(&language)
                        .bind(&beginners)
                        .bind(&activity)
                        .fetch_one(&mut *tx)
                        .await
                        .map_err(db_error)?;
                view.directory_count = count as u64;
                let rows=sqlx::query(&format!("SELECT a.id,a.name,a.tag,a.recruitment,a.recruitment_profile,(SELECT count(*) FROM alliance_memberships m WHERE m.alliance=a.id) AS member_count FROM alliances a WHERE {filter} ORDER BY lower(a.name),a.id LIMIT 20 OFFSET $8"))
                    .bind(b.universe.0).bind(b.epoch.0).bind(&search).bind(recruiting_only).bind(&language).bind(&beginners).bind(&activity).bind(offset as i64)
                    .fetch_all(&mut *tx).await.map_err(db_error)?;
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
                    .chain(state.audit.iter().filter_map(|a| a.subject_player()))
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

fn public_projection(
    row: &PgRow,
    universe: UniverseId,
    name: &str,
    enrollment_open: bool,
) -> Result<PublicAlliance, StoreError> {
    Ok(PublicAlliance {
        summary: summary(row, universe)?,
        public_text: row.try_get("public_text").map_err(db_error)?,
        universe_name: name.into(),
        enrollment_open,
    })
}

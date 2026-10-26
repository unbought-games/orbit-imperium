use super::*;
use orbit_engine::alliances::{AllianceState, StateApplication};
use std::collections::BTreeMap;

pub fn alliance_summary(universe: UniverseId, state: &AllianceState) -> AllianceSummary {
    AllianceSummary {
        id: state.id,
        universe,
        tag: state.tag.clone(),
        name: state.name.clone(),
        member_count: state.members.len() as u64,
        recruitment: state.recruitment,
        ranking: None,
    }
}
pub fn alliance_application(
    state: &AllianceState,
    app: &StateApplication,
    names: &BTreeMap<PlayerId, String>,
) -> AllianceApplication {
    AllianceApplication {
        id: app.id,
        alliance: state.id,
        alliance_tag: state.tag.clone(),
        player: app.player,
        username: label(names, app.player),
        text: app.text.clone(),
        created_at: app.created_at,
    }
}
fn label(names: &BTreeMap<PlayerId, String>, id: PlayerId) -> String {
    names
        .get(&id)
        .cloned()
        .unwrap_or_else(|| "Unknown player".into())
}
/// Every private field is projected from the actor's current effective rights.
/// A nonmember receives no private object at all (including leader identity).
pub fn alliance_detail(
    universe: UniverseId,
    state: &AllianceState,
    actor: PlayerId,
    names: &BTreeMap<PlayerId, String>,
    presence: &BTreeMap<PlayerId, i64>,
    now: i64,
    before: Option<Uuid>,
) -> Result<Option<AllianceDetail>, StoreError> {
    if !state.is_member(actor) {
        return Ok(None);
    }
    let rights = state.permissions(actor);
    let has = |p| rights.contains(&p);
    let members = has(AlliancePermission::ViewMembers).then(|| {
        state
            .members
            .iter()
            .map(|m| AllianceMember {
                player: m.player,
                username: label(names, m.player),
                joined_at: m.joined_at,
                roles: m.roles.clone(),
                activity: has(AlliancePermission::ViewActivity).then(|| {
                    let Some(last_presence) = presence.get(&m.player).copied() else {
                        return "Inactive".into();
                    };
                    let elapsed = now.saturating_sub(last_presence);
                    if elapsed < 15 * 60 * 1000 {
                        "Recent"
                    } else if elapsed < 7 * 24 * 60 * 60 * 1000 {
                        "Away"
                    } else {
                        "Inactive"
                    }
                    .into()
                }),
            })
            .collect()
    });
    // The opaque UUID cursor binds a page offset to this alliance revision.
    // Any board/membership/pin edit invalidates the cursor; clients restart rather
    // than mixing observations and duplicating a previously pinned post.
    let offset = if let Some(cursor) = before {
        let value = cursor.as_u128();
        if (value & ((1u128 << 53) - 1)) as u64 != state.revision {
            return Err(StoreError::Conflict);
        }
        let offset = (value >> 96) as usize;
        if offset == 0 || offset > 100 {
            return Err(StoreError::InvalidCursor);
        }
        offset
    } else {
        0
    };
    let mut ordered: Vec<_> = state.posts.iter().collect();
    ordered.sort_by(|a, b| {
        b.pinned
            .cmp(&a.pinned)
            .then(b.created_at.cmp(&a.created_at))
            .then(b.id.cmp(&a.id))
    });
    let end = (offset + 20).min(ordered.len());
    let cursor = (end < ordered.len()).then(|| {
        Uuid::from_u128(
            ((end as u128) << 96) | (4u128 << 76) | (2u128 << 62) | state.revision as u128,
        )
    });
    let ordered = ordered.into_iter().skip(offset).take(20);
    let posts = ordered
        .map(|p| AlliancePost {
            id: p.id,
            author: p.author,
            author_name: label(names, p.author),
            title: p.title.clone(),
            body: p.body.clone(),
            created_at: p.created_at,
            updated_at: p.updated_at,
            pinned: p.pinned,
        })
        .collect();
    Ok(Some(AllianceDetail {
        summary: alliance_summary(universe, state),
        public_text: state.public_text.clone(),
        revision: state.revision,
        leader: state.leader,
        permissions: rights.iter().copied().collect(),
        grantable_permissions: state.grantable_permissions(actor).into_iter().collect(),
        roles: has_roles(state, actor).then(|| {
            state
                .roles
                .iter()
                .map(|r| AllianceRole {
                    id: r.id,
                    name: r.name.clone(),
                    permissions: r.permissions.clone(),
                    grantable_permissions: r.grantable_permissions.clone(),
                    is_default: r.is_default,
                })
                .collect()
        }),
        members,
        applications: has(AlliancePermission::ViewApplications).then(|| {
            state
                .applications
                .iter()
                .map(|a| alliance_application(state, a, names))
                .collect()
        }),
        posts: Some(posts),
        next_post_before: Some(cursor),
        audit: has(AlliancePermission::ViewAudit).then(|| {
            state
                .audit
                .iter()
                .rev()
                .map(|a| AllianceAudit {
                    id: a.id,
                    actor: a.actor,
                    actor_name: label(names, a.actor),
                    action: a.action.clone(),
                    at: a.at,
                    target: a.target,
                })
                .collect()
        }),
    }))
}
fn has_roles(state: &AllianceState, actor: PlayerId) -> bool {
    let p = state.permissions(actor);
    p.contains(&AlliancePermission::ViewMembers)
        || p.contains(&AlliancePermission::ManageRoles)
        || p.contains(&AlliancePermission::AssignRoles)
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_engine::alliances::{AllianceAction, StateMember};
    fn state() -> AllianceState {
        AllianceState::create(
            Uuid::from_u128(1),
            PlayerId(Uuid::from_u128(2)),
            "Alliance".into(),
            "TAG".into(),
            1000,
            [Uuid::from_u128(3), Uuid::from_u128(4), Uuid::from_u128(5)],
        )
        .unwrap()
    }
    #[test]
    fn privacy_is_omission_and_coarse_activity_has_exact_boundaries() {
        let mut s = state();
        let member = PlayerId(Uuid::from_u128(9));
        s.members.push(StateMember {
            player: member,
            joined_at: 1000,
            roles: vec![],
        });
        let names = BTreeMap::new();
        let presence = BTreeMap::from([(member, 1000)]);
        assert!(
            alliance_detail(
                UniverseId(Uuid::nil()),
                &s,
                PlayerId(Uuid::from_u128(8)),
                &names,
                &presence,
                1000,
                None
            )
            .unwrap()
            .is_none()
        );
        let member_view = serde_json::to_value(
            alliance_detail(
                UniverseId(Uuid::nil()),
                &s,
                member,
                &names,
                &presence,
                1000,
                None,
            )
            .unwrap()
            .unwrap(),
        )
        .unwrap();
        assert!(member_view.get("applications").is_none());
        assert!(member_view.get("audit").is_none());
        assert!(member_view["members"][0].get("activity").is_none());
        for (now, activity) in [
            (900999, "Recent"),
            (901000, "Away"),
            (604801000, "Inactive"),
        ] {
            let d = alliance_detail(
                UniverseId(Uuid::nil()),
                &s,
                s.leader,
                &names,
                &presence,
                now,
                None,
            )
            .unwrap()
            .unwrap();
            assert_eq!(
                d.members
                    .unwrap()
                    .into_iter()
                    .find(|m| m.player == member)
                    .unwrap()
                    .activity
                    .as_deref(),
                Some(activity)
            );
        }
        let public = serde_json::to_value(PublicAlliance {
            summary: alliance_summary(UniverseId(Uuid::nil()), &s),
            public_text: s.public_text.clone(),
        })
        .unwrap();
        assert!(public.get("leader").is_none());
    }
    #[test]
    fn cursor_binds_revision_so_pin_changes_never_duplicate_posts() {
        let mut s = state();
        for i in 10..45 {
            s.execute(
                s.leader,
                &AllianceAction::CreatePost {
                    alliance: s.id,
                    title: format!("{i}"),
                    body: "body".into(),
                },
                i as i64,
                Uuid::from_u128(i),
            )
            .unwrap();
        }
        let names = BTreeMap::new();
        let p = BTreeMap::new();
        let first = alliance_detail(
            UniverseId(Uuid::nil()),
            &s,
            s.leader,
            &names,
            &p,
            2000,
            None,
        )
        .unwrap()
        .unwrap();
        let cursor = first.next_post_before.unwrap().unwrap();
        let second = alliance_detail(
            UniverseId(Uuid::nil()),
            &s,
            s.leader,
            &names,
            &p,
            2000,
            Some(cursor),
        )
        .unwrap()
        .unwrap();
        assert_eq!(second.posts.as_ref().unwrap().len(), 15);
        assert!(
            second.posts.unwrap().iter().all(|p| !first
                .posts
                .as_ref()
                .unwrap()
                .iter()
                .any(|f| f.id == p.id))
        );
        s.execute(
            s.leader,
            &AllianceAction::PinPost {
                alliance: s.id,
                post: Uuid::from_u128(10),
                pinned: true,
            },
            2001,
            Uuid::from_u128(99),
        )
        .unwrap();
        assert!(matches!(
            alliance_detail(
                UniverseId(Uuid::nil()),
                &s,
                s.leader,
                &names,
                &p,
                2002,
                Some(cursor)
            ),
            Err(StoreError::Conflict)
        ));
    }
}

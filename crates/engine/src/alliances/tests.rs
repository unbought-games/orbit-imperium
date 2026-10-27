use super::*;
use AlliancePermission::*;
fn id(n: u128) -> Uuid {
    Uuid::from_u128(n)
}
fn player(n: u128) -> PlayerId {
    PlayerId(id(n))
}
fn state() -> AllianceState {
    AllianceState::create(
        id(10),
        player(1),
        "Test Alliance".into(),
        "TAG".into(),
        1000,
        [id(20), id(21), id(22)],
    )
    .unwrap()
}
fn run(
    s: &mut AllianceState,
    actor: u128,
    action: AllianceAction,
) -> Result<AllianceEffect, AllianceError> {
    let rev = s.revision;
    s.execute(
        player(actor),
        &action,
        1000 + rev as i64,
        id(10000 + u128::from(rev)),
    )
}
fn join(s: &mut AllianceState, p: u128) {
    s.recruitment = AllianceRecruitment::Open;
    run(s, p, AllianceAction::Join { alliance: id(10) }).unwrap();
}
fn assign(s: &mut AllianceState, p: u128, roles: Vec<Uuid>) {
    run(
        s,
        1,
        AllianceAction::AssignRoles {
            alliance: id(10),
            player: player(p),
            roles,
        },
    )
    .unwrap();
}
fn role(
    s: &mut AllianceState,
    name: &str,
    permissions: Vec<AlliancePermission>,
    grants: Vec<AlliancePermission>,
) -> Uuid {
    let r = id(10000 + u128::from(s.revision));
    run(
        s,
        1,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: None,
            name: name.into(),
            permissions,
            grantable_permissions: grants,
        },
    )
    .unwrap();
    r
}
fn denied(s: &mut AllianceState, actor: u128, action: AllianceAction) {
    let before = s.clone();
    assert!(run(s, actor, action).is_err());
    assert_eq!(
        *s, before,
        "failed transition must not partially change state"
    );
}
#[test]
fn default_roles_and_leader_authority_are_derived() {
    let mut s = state();
    join(&mut s, 2);
    assert_eq!(
        s.permissions(player(1)),
        AlliancePermission::ALL.into_iter().collect()
    );
    assert_eq!(
        s.permissions(player(2)),
        [ViewMembers, PublishPosts, SendCircular]
            .into_iter()
            .collect()
    );
    assert!(s.grantable_permissions(player(2)).is_empty());
    assert!(s.permissions(player(999)).is_empty());
    assign(&mut s, 2, vec![id(21), id(22)]);
    assert!(s.permissions(player(2)).contains(&ProcessApplications));
    for p in [ViewActivity, ManageRoles, AssignRoles] {
        assert!(!s.permissions(player(2)).contains(&p));
    }
    assert!(s.grantable_permissions(player(2)).is_empty());
    assign(&mut s, 2, vec![]);
    assert_eq!(
        s.members
            .iter()
            .find(|m| m.player == player(2))
            .unwrap()
            .roles,
        vec![id(20)]
    );
    assert_eq!(
        s.permissions(player(2)),
        [ViewMembers, PublishPosts, SendCircular]
            .into_iter()
            .collect()
    );
}
#[test]
fn recruitment_modes_and_closed_existing_application_processing() {
    for recruitment in [
        AllianceRecruitment::Open,
        AllianceRecruitment::Application,
        AllianceRecruitment::Closed,
    ] {
        let mut s = state();
        s.recruitment = recruitment;
        let j = run(&mut s, 2, AllianceAction::Join { alliance: id(10) });
        assert_eq!(j.is_ok(), recruitment == AllianceRecruitment::Open);
        let a = run(
            &mut s,
            3,
            AllianceAction::Apply {
                alliance: id(10),
                text: "Please accept".into(),
            },
        );
        assert_eq!(a.is_ok(), recruitment == AllianceRecruitment::Application);
    }
    let mut s = state();
    run(
        &mut s,
        2,
        AllianceAction::Apply {
            alliance: id(10),
            text: "".into(),
        },
    )
    .unwrap();
    let application = s.applications[0].id;
    denied(
        &mut s,
        2,
        AllianceAction::Apply {
            alliance: id(10),
            text: "duplicate".into(),
        },
    );
    denied(&mut s, 3, AllianceAction::Withdraw { application });
    s.recruitment = AllianceRecruitment::Closed;
    let effect = run(
        &mut s,
        1,
        AllianceAction::Accept {
            alliance: id(10),
            application,
        },
    )
    .unwrap();
    assert_eq!(effect.joined, Some(player(2)));
    assert!(s.applications.is_empty());
    assert!(s.is_member(player(2)));
}
#[test]
fn open_join_clears_own_existing_application_and_member_cannot_apply() {
    let mut s = state();
    run(
        &mut s,
        2,
        AllianceAction::Apply {
            alliance: id(10),
            text: "join".into(),
        },
    )
    .unwrap();
    join(&mut s, 2);
    assert!(s.applications.is_empty());
    s.recruitment = AllianceRecruitment::Application;
    denied(
        &mut s,
        2,
        AllianceAction::Apply {
            alliance: id(10),
            text: "join".into(),
        },
    );
}
#[test]
fn withdraw_and_reject_have_separate_authorization() {
    let mut s = state();
    run(
        &mut s,
        2,
        AllianceAction::Apply {
            alliance: id(10),
            text: "join".into(),
        },
    )
    .unwrap();
    let application = s.applications[0].id;
    denied(
        &mut s,
        3,
        AllianceAction::Reject {
            alliance: id(10),
            application,
        },
    );
    run(&mut s, 2, AllianceAction::Withdraw { application }).unwrap();
    assert!(s.applications.is_empty());
    run(
        &mut s,
        2,
        AllianceAction::Apply {
            alliance: id(10),
            text: "again".into(),
        },
    )
    .unwrap();
    let application = s.applications[0].id;
    run(
        &mut s,
        1,
        AllianceAction::Reject {
            alliance: id(10),
            application,
        },
    )
    .unwrap();
    assert!(!s.is_member(player(2)));
    assert!(s.applications.is_empty());
}
#[test]
fn leadership_transfer_is_immediate_and_old_leader_becomes_member() {
    let mut s = state();
    join(&mut s, 2);
    denied(&mut s, 1, AllianceAction::Leave { alliance: id(10) });
    denied(
        &mut s,
        2,
        AllianceAction::Transfer {
            alliance: id(10),
            player: player(1),
        },
    );
    denied(
        &mut s,
        1,
        AllianceAction::Transfer {
            alliance: id(10),
            player: player(99),
        },
    );
    run(
        &mut s,
        1,
        AllianceAction::Transfer {
            alliance: id(10),
            player: player(2),
        },
    )
    .unwrap();
    assert_eq!(s.leader, player(2));
    assert_eq!(
        s.permissions(player(1)),
        [ViewMembers, PublishPosts, SendCircular]
            .into_iter()
            .collect()
    );
    denied(&mut s, 1, AllianceAction::Disband { alliance: id(10) });
    run(&mut s, 1, AllianceAction::Leave { alliance: id(10) }).unwrap();
    assert!(s.permissions(player(1)).is_empty());
    assert!(
        run(&mut s, 2, AllianceAction::Disband { alliance: id(10) })
            .unwrap()
            .disbanded
    );
    assert!(s.members.is_empty());
    assert!(s.permissions(player(2)).is_empty());
}
#[test]
fn delegated_administration_needs_acting_and_grantable_authority() {
    let mut s = state();
    join(&mut s, 2);
    join(&mut s, 3);
    let delegate = role(
        &mut s,
        "Delegator",
        vec![
            ManageRoles,
            AssignRoles,
            ViewApplications,
            ProcessApplications,
        ],
        vec![ViewApplications, ProcessApplications],
    );
    assign(&mut s, 2, vec![delegate]);
    run(
        &mut s,
        2,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: Some(id(21)),
            name: "Recruitment".into(),
            permissions: vec![ViewApplications, ProcessApplications],
            grantable_permissions: vec![],
        },
    )
    .unwrap();
    run(
        &mut s,
        2,
        AllianceAction::AssignRoles {
            alliance: id(10),
            player: player(3),
            roles: vec![id(21)],
        },
    )
    .unwrap();
    assert!(s.permissions(player(3)).contains(&ProcessApplications));
    denied(
        &mut s,
        2,
        AllianceAction::AssignRoles {
            alliance: id(10),
            player: player(3),
            roles: vec![id(22)],
        },
    );
    denied(
        &mut s,
        2,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: None,
            name: "Escalation".into(),
            permissions: vec![ManageRoles],
            grantable_permissions: vec![],
        },
    );
    run(
        &mut s,
        2,
        AllianceAction::DeleteRole {
            alliance: id(10),
            role: id(21),
        },
    )
    .unwrap();
    assert!(!s.permissions(player(3)).contains(&ProcessApplications));
}
#[test]
fn self_escalation_is_denied_even_with_grantable_capability() {
    let mut s = state();
    join(&mut s, 2);
    let delegate = role(
        &mut s,
        "Delegator",
        vec![ManageRoles, AssignRoles],
        vec![
            ViewMembers,
            PublishPosts,
            ViewActivity,
            ManageRoles,
            AssignRoles,
        ],
    );
    let activity = role(&mut s, "Activity", vec![ViewMembers, ViewActivity], vec![]);
    assign(&mut s, 2, vec![delegate]);
    denied(
        &mut s,
        2,
        AllianceAction::AssignRoles {
            alliance: id(10),
            player: player(2),
            roles: vec![delegate, activity],
        },
    );
    denied(
        &mut s,
        2,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: Some(delegate),
            name: "Delegator".into(),
            permissions: vec![ManageRoles, AssignRoles, ViewMembers, ViewActivity],
            grantable_permissions: vec![
                ViewMembers,
                PublishPosts,
                ViewActivity,
                ManageRoles,
                AssignRoles,
            ],
        },
    );
    // Baseline edits also affect the actor and cannot bypass the self check.
    denied(
        &mut s,
        2,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: Some(id(20)),
            name: "Member".into(),
            permissions: vec![ViewMembers, PublishPosts, ViewActivity],
            grantable_permissions: vec![],
        },
    );
}
#[test]
fn cannot_strip_superior_role_then_kick_or_delete_shared_role() {
    let mut s = state();
    join(&mut s, 2);
    join(&mut s, 3);
    let delegate = role(
        &mut s,
        "Delegate",
        vec![ManageRoles, AssignRoles, KickMembers, ViewApplications],
        vec![ViewApplications],
    );
    let superior = role(
        &mut s,
        "Specialist",
        vec![ViewMembers, ViewActivity],
        vec![],
    );
    let shared = role(&mut s, "Shared", vec![ViewApplications], vec![]);
    assign(&mut s, 2, vec![delegate]);
    assign(&mut s, 3, vec![superior, shared]);
    denied(
        &mut s,
        2,
        AllianceAction::Kick {
            alliance: id(10),
            player: player(3),
        },
    );
    denied(
        &mut s,
        2,
        AllianceAction::AssignRoles {
            alliance: id(10),
            player: player(3),
            roles: vec![shared],
        },
    );
    denied(
        &mut s,
        2,
        AllianceAction::DeleteRole {
            alliance: id(10),
            role: shared,
        },
    );
    denied(
        &mut s,
        2,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: Some(shared),
            name: "Shared".into(),
            permissions: vec![],
            grantable_permissions: vec![],
        },
    );
    denied(
        &mut s,
        2,
        AllianceAction::Kick {
            alliance: id(10),
            player: player(1),
        },
    );
}
#[test]
fn ordinary_officer_can_kick_member_but_not_act_after_revocation() {
    let mut s = state();
    join(&mut s, 2);
    join(&mut s, 3);
    assign(&mut s, 2, vec![id(22)]);
    run(
        &mut s,
        2,
        AllianceAction::Kick {
            alliance: id(10),
            player: player(3),
        },
    )
    .unwrap();
    assert!(!s.is_member(player(3)));
    denied(
        &mut s,
        3,
        AllianceAction::CreatePost {
            alliance: id(10),
            title: "x".into(),
            body: "x".into(),
        },
    );
    assign(&mut s, 2, vec![]);
    denied(
        &mut s,
        2,
        AllianceAction::Kick {
            alliance: id(10),
            player: player(1),
        },
    );
    assert!(!s.permissions(player(2)).contains(&KickMembers));
}
#[test]
fn dependencies_and_default_role_invariants_apply_to_leader_too() {
    let mut s = state();
    for permissions in [vec![ViewActivity], vec![ProcessApplications]] {
        denied(
            &mut s,
            1,
            AllianceAction::SaveRole {
                alliance: id(10),
                role: None,
                name: "Bad".into(),
                permissions,
                grantable_permissions: vec![],
            },
        );
    }
    denied(
        &mut s,
        1,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: None,
            name: "Bad grants".into(),
            permissions: vec![],
            grantable_permissions: vec![ViewActivity],
        },
    );
    denied(
        &mut s,
        1,
        AllianceAction::DeleteRole {
            alliance: id(10),
            role: id(20),
        },
    );
    denied(
        &mut s,
        1,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: None,
            name: "LEADER".into(),
            permissions: vec![],
            grantable_permissions: vec![],
        },
    );
    run(
        &mut s,
        1,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: Some(id(20)),
            name: "Citizen".into(),
            permissions: vec![ViewMembers],
            grantable_permissions: vec![],
        },
    )
    .unwrap();
    join(&mut s, 2);
    assert_eq!(
        s.permissions(player(2)),
        [ViewMembers].into_iter().collect()
    );
}
#[test]
fn noticeboard_rolls_oldest_unpinned_and_enforces_five_pins() {
    let mut s = state();
    let mut ids = vec![];
    for n in 0..100 {
        let post = id(10000 + u128::from(s.revision));
        ids.push(post);
        run(
            &mut s,
            1,
            AllianceAction::CreatePost {
                alliance: id(10),
                title: format!("Post {n}"),
                body: "body".into(),
            },
        )
        .unwrap();
        if n < 5 {
            run(
                &mut s,
                1,
                AllianceAction::PinPost {
                    alliance: id(10),
                    post,
                    pinned: true,
                },
            )
            .unwrap();
        }
    }
    denied(
        &mut s,
        1,
        AllianceAction::PinPost {
            alliance: id(10),
            post: ids[5],
            pinned: true,
        },
    );
    run(
        &mut s,
        1,
        AllianceAction::CreatePost {
            alliance: id(10),
            title: "New".into(),
            body: "body".into(),
        },
    )
    .unwrap();
    assert_eq!(s.posts.len(), 100);
    assert_eq!(s.posts.iter().filter(|p| p.pinned).count(), 5);
    for pin in &ids[..5] {
        assert!(s.posts.iter().any(|p| p.id == *pin));
    }
    assert!(!s.posts.iter().any(|p| p.id == ids[5]));
    assert!(s.posts.iter().any(|p| p.id == ids[6]));
    assert_eq!(s.audit.len(), MAX_AUDIT);
}
#[test]
fn post_authorship_requires_current_membership_and_pin_is_separate() {
    let mut s = state();
    join(&mut s, 2);
    join(&mut s, 3);
    let post = id(10000 + u128::from(s.revision));
    run(
        &mut s,
        2,
        AllianceAction::CreatePost {
            alliance: id(10),
            title: "Mine".into(),
            body: "body".into(),
        },
    )
    .unwrap();
    denied(
        &mut s,
        3,
        AllianceAction::EditPost {
            alliance: id(10),
            post,
            title: "bad".into(),
            body: "bad".into(),
        },
    );
    denied(
        &mut s,
        2,
        AllianceAction::PinPost {
            alliance: id(10),
            post,
            pinned: true,
        },
    );
    run(
        &mut s,
        2,
        AllianceAction::EditPost {
            alliance: id(10),
            post,
            title: "Mine again".into(),
            body: "body".into(),
        },
    )
    .unwrap();
    run(&mut s, 2, AllianceAction::Leave { alliance: id(10) }).unwrap();
    denied(
        &mut s,
        2,
        AllianceAction::DeletePost {
            alliance: id(10),
            post,
        },
    );
    run(
        &mut s,
        1,
        AllianceAction::DeletePost {
            alliance: id(10),
            post,
        },
    )
    .unwrap();
    assert!(s.posts.is_empty());
}
#[test]
fn profile_and_recruitment_require_independent_permissions() {
    let mut s = state();
    join(&mut s, 2);
    let recruiter = role(
        &mut s,
        "Recruitment manager",
        vec![ManageRecruitment],
        vec![],
    );
    assign(&mut s, 2, vec![recruiter]);
    run(
        &mut s,
        2,
        AllianceAction::Update {
            alliance: id(10),
            name: "Test Alliance".into(),
            tag: "TAG".into(),
            public_text: "".into(),
            recruitment: AllianceRecruitment::Closed,
        },
    )
    .unwrap();
    denied(
        &mut s,
        2,
        AllianceAction::Update {
            alliance: id(10),
            name: "Renamed".into(),
            tag: "TAG".into(),
            public_text: "".into(),
            recruitment: AllianceRecruitment::Closed,
        },
    );
    let editor = role(&mut s, "Editor", vec![EditProfile], vec![]);
    assign(&mut s, 2, vec![editor]);
    denied(
        &mut s,
        2,
        AllianceAction::Update {
            alliance: id(10),
            name: "Test Alliance".into(),
            tag: "TAG".into(),
            public_text: "".into(),
            recruitment: AllianceRecruitment::Open,
        },
    );
}
#[test]
fn validates_unicode_lengths_ascii_tags_and_markdown_without_partial_mutation() {
    assert!(
        AllianceState::create(
            id(10),
            player(1),
            "é".repeat(48),
            "abc123".into(),
            0,
            [id(20), id(21), id(22)]
        )
        .is_ok()
    );
    for (name, tag) in [
        ("ab".into(), "ABC".into()),
        ("x".repeat(49), "ABC".into()),
        ("Valid".into(), "éBC".into()),
        ("Valid".into(), "AB".into()),
        ("Valid".into(), "ABCDEFGHI".into()),
    ] {
        assert!(
            AllianceState::create(id(10), player(1), name, tag, 0, [id(20), id(21), id(22)])
                .is_err()
        );
    }
    let mut s = state();
    for body in [
        "x".repeat(8001),
        "<script>alert(1)</script>".into(),
        "![image](https://example.test/a)".into(),
        "[click](javascript:alert(1))".into(),
        "[click](data:text/html,example)".into(),
        "[reference]: file:///private".into(),
        "[x](JaVa\nScRiPt:alert(1))".into(),
        "bad\u{0}".into(),
    ] {
        denied(
            &mut s,
            1,
            AllianceAction::CreatePost {
                alliance: id(10),
                title: "Title".into(),
                body,
            },
        );
    }
    denied(
        &mut s,
        1,
        AllianceAction::CreatePost {
            alliance: id(10),
            title: "x".repeat(121),
            body: "x".into(),
        },
    );
    denied(
        &mut s,
        2,
        AllianceAction::Apply {
            alliance: id(10),
            text: "x".repeat(4001),
        },
    );
    run(
        &mut s,
        1,
        AllianceAction::CreatePost {
            alliance: id(10),
            title: "Good".into(),
            body: "# Markdown\n\n[Safe](https://example.test/) **bold**\n- List".into(),
        },
    )
    .unwrap();
}
#[test]
fn schema_roundtrip_and_wrong_scope_fail_closed() {
    let mut s = state();
    let encoded = serde_json::to_string(&s).unwrap();
    assert_eq!(s, serde_json::from_str::<AllianceState>(&encoded).unwrap());
    assert!(
        serde_json::from_value::<AllianceAction>(
            serde_json::json!({"type":"Join","alliance":id(10),"unexpected":true})
        )
        .is_err()
    );
    denied(&mut s, 1, AllianceAction::Disband { alliance: id(99) });
    s.revision = u64::MAX;
    denied(
        &mut s,
        1,
        AllianceAction::CreatePost {
            alliance: id(10),
            title: "valid".into(),
            body: "valid".into(),
        },
    );
}

#[test]
fn can_delegate_and_revoke_without_having_the_acting_permission() {
    let mut s = state();
    run(
        &mut s,
        1,
        AllianceAction::SaveRole {
            alliance: id(10),
            role: Some(id(20)),
            name: "Member".into(),
            permissions: vec![ViewMembers],
            grantable_permissions: vec![],
        },
    )
    .unwrap();
    join(&mut s, 2);
    join(&mut s, 3);
    let manager = role(
        &mut s,
        "Manager",
        vec![ManageRoles, AssignRoles],
        vec![PublishPosts],
    );
    let writer = role(&mut s, "Writer", vec![PublishPosts], vec![]);
    assign(&mut s, 2, vec![manager]);
    assert!(!s.permissions(player(2)).contains(&PublishPosts));
    assert!(s.grantable_permissions(player(2)).contains(&PublishPosts));
    run(
        &mut s,
        2,
        AllianceAction::AssignRoles {
            alliance: id(10),
            player: player(3),
            roles: vec![writer],
        },
    )
    .unwrap();
    assert!(s.permissions(player(3)).contains(&PublishPosts));
    run(
        &mut s,
        2,
        AllianceAction::AssignRoles {
            alliance: id(10),
            player: player(3),
            roles: vec![],
        },
    )
    .unwrap();
    assert!(!s.permissions(player(3)).contains(&PublishPosts));
    run(
        &mut s,
        2,
        AllianceAction::AssignRoles {
            alliance: id(10),
            player: player(3),
            roles: vec![writer],
        },
    )
    .unwrap();
    run(
        &mut s,
        2,
        AllianceAction::DeleteRole {
            alliance: id(10),
            role: writer,
        },
    )
    .unwrap();
    assert!(!s.permissions(player(3)).contains(&PublishPosts));
}

#[test]
fn create_audit_and_wire_revision_bounds() {
    let mut s = state();
    assert_eq!(s.audit.len(), 1);
    assert_eq!(s.audit[0].action, "Create");
    assert_eq!(s.audit[0].actor, player(1));
    assert_eq!(s.audit[0].at, 1000);
    s.revision = crate::MAX_WIRE_MS as u64;
    let before = s.clone();
    assert!(
        s.execute(
            player(1),
            &AllianceAction::CreatePost {
                alliance: id(10),
                title: "x".into(),
                body: "x".into()
            },
            1001,
            id(900)
        )
        .is_err()
    );
    assert_eq!(s, before);
    assert!(
        s.execute(
            player(1),
            &AllianceAction::Disband { alliance: id(10) },
            crate::MAX_WIRE_MS + 1,
            id(900)
        )
        .is_err()
    );
}

#[test]
fn disband_cannot_be_resurrected_by_open_recruitment() {
    let mut s = state();
    join(&mut s, 2);
    run(&mut s, 1, AllianceAction::Disband { alliance: id(10) }).unwrap();
    denied(&mut s, 3, AllianceAction::Join { alliance: id(10) });
    assert!(s.members.is_empty());
}

#[test]
fn unchanged_profile_update_still_requires_administration_and_is_atomic() {
    let mut s = state();
    join(&mut s, 2);
    let action = AllianceAction::Update {
        alliance: s.id,
        name: s.name.clone(),
        tag: s.tag.clone(),
        public_text: s.public_text.clone(),
        recruitment: s.recruitment,
    };
    let before = s.clone();
    assert_eq!(run(&mut s, 2, action), Err(AllianceError::Forbidden));
    assert_eq!(s, before);
}

#[test]
fn ordinary_protocol_words_remain_valid_alliance_prose() {
    let text = "Scouting data: compare our routes. Configuration file: keep a copy. JavaScript: discuss tools.";
    let mut s = state();
    run(
        &mut s,
        1,
        AllianceAction::CreatePost {
            alliance: id(10),
            title: "Scouting notes".into(),
            body: text.into(),
        },
    )
    .unwrap();
    assert_eq!(s.posts.last().unwrap().body, text);
    run(
        &mut s,
        1,
        AllianceAction::Update {
            alliance: id(10),
            name: "Test Alliance".into(),
            tag: "TAG".into(),
            public_text: text.into(),
            recruitment: AllianceRecruitment::Application,
        },
    )
    .unwrap();
    assert_eq!(s.public_text, text);
    run(
        &mut s,
        2,
        AllianceAction::Apply {
            alliance: id(10),
            text: text.into(),
        },
    )
    .unwrap();
    assert_eq!(s.applications.last().unwrap().text, text);
}

use super::*;
use orbit_engine::alliances::{AuditSubject, StateAudit};

pub(super) fn subject(
    state: &AllianceState,
    entry: &StateAudit,
    names: &BTreeMap<PlayerId, String>,
) -> Option<AllianceAuditSubject> {
    let context = entry
        .subject
        .clone()
        .or_else(|| legacy_subject(state, entry));
    let (kind, text, player) = match context {
        Some(AuditSubject::Player { player }) => ("Player", label(names, player), Some(player)),
        Some(AuditSubject::Role { name }) => ("Role", name, None),
        Some(AuditSubject::Notice { title }) => (
            "Notice",
            if title.trim().is_empty() {
                "Untitled notice".into()
            } else {
                title
            },
            None,
        ),
        None => match entry.action.as_str() {
            "Accept" | "Reject" | "Withdraw" => ("Player", "Former applicant".into(), None),
            "SaveRole" | "CreateRole" | "UpdateRole" | "DeleteRole" => {
                ("Role", "Deleted role".into(), None)
            }
            "CreatePost" | "EditPost" | "DeletePost" | "PinPost" | "UnpinPost" => {
                ("Notice", "Deleted notice".into(), None)
            }
            _ => return None,
        },
    };
    Some(AllianceAuditSubject {
        kind: kind.into(),
        label: text,
        player,
    })
}

fn legacy_subject(state: &AllianceState, entry: &StateAudit) -> Option<AuditSubject> {
    if let Some(player) = entry.subject_player() {
        return Some(AuditSubject::Player { player });
    }
    match entry.action.as_str() {
        "Accept" | "Reject" | "Withdraw" => {
            let id = entry.target?;
            // Application IDs and their Apply audit IDs share the command ID.
            // This remains evidence of the applicant after acceptance/removal.
            state
                .applications
                .iter()
                .find(|a| a.id == id)
                .map(|a| a.player)
                .or_else(|| {
                    state
                        .audit
                        .iter()
                        .find(|a| a.id == id && a.action == "Apply")
                        .map(|a| a.actor)
                })
                .map(|player| AuditSubject::Player { player })
        }
        "SaveRole" | "DeleteRole" => state
            .roles
            .iter()
            .find(|r| r.id == entry.target.unwrap_or(entry.id))
            .map(|r| AuditSubject::Role {
                name: r.name.clone(),
            }),
        "CreatePost" | "EditPost" | "DeletePost" | "PinPost" => state
            .posts
            .iter()
            .find(|p| p.id == entry.target.unwrap_or(entry.id))
            .map(|p| AuditSubject::Notice {
                title: p.title.clone(),
            }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn event(action: &str, target: Option<Uuid>) -> StateAudit {
        StateAudit {
            id: Uuid::from_u128(9),
            actor: PlayerId(Uuid::from_u128(2)),
            action: action.into(),
            at: 1000,
            target,
            subject: None,
        }
    }
    #[test]
    fn resolves_legacy_applications_players_roles_and_full_board_not_only_visible_page() {
        let mut s = super::super::tests::state();
        let applicant = PlayerId(Uuid::from_u128(20));
        let app = Uuid::from_u128(30);
        let mut applied = event("Apply", None);
        applied.id = app;
        applied.actor = applicant;
        s.audit.push(applied);
        let names = BTreeMap::from([(applicant, "Nova".into())]);
        for action in ["Accept", "Reject", "Withdraw"] {
            let result = subject(&s, &event(action, Some(app)), &names).unwrap();
            assert_eq!(result.label, "Nova");
            assert_eq!(result.player, Some(applicant));
        }
        assert_eq!(
            subject(&s, &event("Kick", Some(applicant.0)), &names)
                .unwrap()
                .label,
            "Nova"
        );
        let role = &s.roles[0];
        assert_eq!(
            subject(&s, &event("SaveRole", Some(role.id)), &names)
                .unwrap()
                .label,
            role.name
        );
        let post = Uuid::from_u128(50);
        s.posts.push(orbit_engine::alliances::StatePost {
            id: post,
            author: applicant,
            title: "".into(),
            body: "Message".into(),
            created_at: 1,
            updated_at: 1,
            pinned: false,
        });
        assert_eq!(
            subject(&s, &event("EditPost", Some(post)), &names)
                .unwrap()
                .label,
            "Untitled notice"
        );
        s.posts.clear();
        assert_eq!(
            subject(&s, &event("DeletePost", Some(post)), &names)
                .unwrap()
                .label,
            "Deleted notice"
        );
        assert_eq!(
            subject(&s, &event("Reject", Some(Uuid::nil())), &names)
                .unwrap()
                .label,
            "Former applicant"
        );
    }
    #[test]
    fn event_context_wins_over_current_names_and_missing_objects() {
        let s = super::super::tests::state();
        let mut e = event("DeleteRole", Some(s.roles[0].id));
        e.subject = Some(AuditSubject::Role {
            name: "Original role".into(),
        });
        assert_eq!(
            subject(&s, &e, &BTreeMap::new()).unwrap().label,
            "Original role"
        );
        e.subject = Some(AuditSubject::Notice {
            title: "Deleted launch plan".into(),
        });
        assert_eq!(
            subject(&s, &e, &BTreeMap::new()).unwrap().label,
            "Deleted launch plan"
        );
        assert!(
            subject(
                &s,
                &event("EmpireRemoved", Some(s.leader.0)),
                &BTreeMap::new()
            )
            .is_none()
        );
    }
}

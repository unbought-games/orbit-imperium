use super::*;

/// Immutable event context, not a cache of the current role or notice. Names here
/// describe the object at the time of the action, even after rename/deletion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum AuditSubject {
    Player { player: PlayerId },
    Role { name: String },
    Notice { title: String },
}

impl StateAudit {
    pub fn subject_player(&self) -> Option<PlayerId> {
        match &self.subject {
            Some(AuditSubject::Player { player }) => Some(*player),
            _ if matches!(self.action.as_str(), "Kick" | "Transfer" | "AssignRoles") => {
                self.target.map(PlayerId)
            }
            _ => None,
        }
    }
}

impl AllianceState {
    pub(super) fn audit_subject(&self, action: &AllianceAction) -> Option<AuditSubject> {
        use AllianceAction::*;
        match action {
            Accept { application, .. } | Reject { application, .. } | Withdraw { application } => {
                self.applications
                    .iter()
                    .find(|a| a.id == *application)
                    .map(|a| AuditSubject::Player { player: a.player })
            }
            Kick { player, .. } | Transfer { player, .. } | AssignRoles { player, .. } => {
                Some(AuditSubject::Player { player: *player })
            }
            SaveRole { name, .. } => Some(AuditSubject::Role {
                name: name.trim().into(),
            }),
            DeleteRole { role, .. } => {
                self.roles
                    .iter()
                    .find(|r| r.id == *role)
                    .map(|r| AuditSubject::Role {
                        name: r.name.clone(),
                    })
            }
            CreatePost { title, .. } | EditPost { title, .. } => Some(AuditSubject::Notice {
                title: title.clone(),
            }),
            DeletePost { post, .. } | PinPost { post, .. } => self
                .posts
                .iter()
                .find(|p| p.id == *post)
                .map(|p| AuditSubject::Notice {
                    title: p.title.clone(),
                }),
            _ => None,
        }
    }

    pub(super) fn audit_action(&self, action: &AllianceAction) -> &'static str {
        match action {
            AllianceAction::PinPost { pinned: false, .. } => "UnpinPost",
            AllianceAction::PinPost { pinned: true, .. } => "PinNotice",
            AllianceAction::SaveRole { role: None, .. } => "CreateRole",
            AllianceAction::SaveRole { .. } => "UpdateRole",
            AllianceAction::SetInvitation { enabled: false, .. } => "DisableInvitation",
            AllianceAction::SetInvitation { enabled: true, .. } if self.invitation.is_some() => {
                "ReplaceInvitation"
            }
            AllianceAction::SetInvitation { .. } => "CreateInvitation",
            _ => action.name(),
        }
    }
}

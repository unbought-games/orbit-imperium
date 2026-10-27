//! Pure source state and authorization. The store owns universe-wide membership,
//! pending-application limits, immutable command receipts, and revision checks.
use crate::PlayerId;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use uuid::Uuid;
mod policy;
#[cfg(test)]
mod tests;
pub const MAX_POSTS: usize = 100;
pub const MAX_PINNED_POSTS: usize = 5;
pub const MAX_PENDING_APPLICATIONS: usize = 5;
pub const MAX_AUDIT: usize = 100;
pub const POST_PAGE_SIZE: usize = 20;
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum AlliancePermission {
    ViewMembers,
    ViewActivity,
    ViewApplications,
    ProcessApplications,
    EditProfile,
    ManageRecruitment,
    PublishPosts,
    SendCircular,
    ManagePosts,
    PinPosts,
    ManageRoles,
    AssignRoles,
    KickMembers,
    ViewAudit,
}
impl AlliancePermission {
    pub const ALL: [Self; 14] = [
        Self::ViewMembers,
        Self::ViewActivity,
        Self::ViewApplications,
        Self::ProcessApplications,
        Self::EditProfile,
        Self::ManageRecruitment,
        Self::PublishPosts,
        Self::SendCircular,
        Self::ManagePosts,
        Self::PinPosts,
        Self::ManageRoles,
        Self::AssignRoles,
        Self::KickMembers,
        Self::ViewAudit,
    ];
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AllianceRecruitment {
    Open,
    Application,
    Closed,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum AllianceAction {
    Create {
        name: String,
        tag: String,
    },
    Join {
        alliance: Uuid,
    },
    Apply {
        alliance: Uuid,
        text: String,
    },
    Withdraw {
        application: Uuid,
    },
    Accept {
        alliance: Uuid,
        application: Uuid,
    },
    Reject {
        alliance: Uuid,
        application: Uuid,
    },
    Leave {
        alliance: Uuid,
    },
    Kick {
        alliance: Uuid,
        player: PlayerId,
    },
    Update {
        alliance: Uuid,
        name: String,
        tag: String,
        public_text: String,
        recruitment: AllianceRecruitment,
    },
    SaveRole {
        alliance: Uuid,
        role: Option<Uuid>,
        name: String,
        permissions: Vec<AlliancePermission>,
        grantable_permissions: Vec<AlliancePermission>,
    },
    DeleteRole {
        alliance: Uuid,
        role: Uuid,
    },
    AssignRoles {
        alliance: Uuid,
        player: PlayerId,
        roles: Vec<Uuid>,
    },
    Transfer {
        alliance: Uuid,
        player: PlayerId,
    },
    Disband {
        alliance: Uuid,
    },
    CreatePost {
        alliance: Uuid,
        title: String,
        body: String,
    },
    EditPost {
        alliance: Uuid,
        post: Uuid,
        title: String,
        body: String,
    },
    DeletePost {
        alliance: Uuid,
        post: Uuid,
    },
    PinPost {
        alliance: Uuid,
        post: Uuid,
        pinned: bool,
    },
}
impl AllianceAction {
    pub fn alliance_id(&self) -> Option<Uuid> {
        match self {
            Self::Create { .. } | Self::Withdraw { .. } => None,
            Self::Join { alliance }
            | Self::Apply { alliance, .. }
            | Self::Accept { alliance, .. }
            | Self::Reject { alliance, .. }
            | Self::Leave { alliance }
            | Self::Kick { alliance, .. }
            | Self::Update { alliance, .. }
            | Self::SaveRole { alliance, .. }
            | Self::DeleteRole { alliance, .. }
            | Self::AssignRoles { alliance, .. }
            | Self::Transfer { alliance, .. }
            | Self::Disband { alliance }
            | Self::CreatePost { alliance, .. }
            | Self::EditPost { alliance, .. }
            | Self::DeletePost { alliance, .. }
            | Self::PinPost { alliance, .. } => Some(*alliance),
        }
    }
    pub fn name(&self) -> &'static str {
        match self {
            Self::Create { .. } => "Create",
            Self::Join { .. } => "Join",
            Self::Apply { .. } => "Apply",
            Self::Withdraw { .. } => "Withdraw",
            Self::Accept { .. } => "Accept",
            Self::Reject { .. } => "Reject",
            Self::Leave { .. } => "Leave",
            Self::Kick { .. } => "Kick",
            Self::Update { .. } => "Update",
            Self::SaveRole { .. } => "SaveRole",
            Self::DeleteRole { .. } => "DeleteRole",
            Self::AssignRoles { .. } => "AssignRoles",
            Self::Transfer { .. } => "Transfer",
            Self::Disband { .. } => "Disband",
            Self::CreatePost { .. } => "CreatePost",
            Self::EditPost { .. } => "EditPost",
            Self::DeletePost { .. } => "DeletePost",
            Self::PinPost { .. } => "PinPost",
        }
    }
    fn target(&self) -> Option<Uuid> {
        match self {
            Self::Withdraw { application }
            | Self::Accept { application, .. }
            | Self::Reject { application, .. } => Some(*application),
            Self::Kick { player, .. }
            | Self::Transfer { player, .. }
            | Self::AssignRoles { player, .. } => Some(player.0),
            Self::SaveRole { role, .. } => *role,
            Self::DeleteRole { role, .. } => Some(*role),
            Self::EditPost { post, .. }
            | Self::DeletePost { post, .. }
            | Self::PinPost { post, .. } => Some(*post),
            _ => None,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StateRole {
    pub id: Uuid,
    pub name: String,
    pub permissions: Vec<AlliancePermission>,
    pub grantable_permissions: Vec<AlliancePermission>,
    pub is_default: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StateMember {
    pub player: PlayerId,
    pub joined_at: i64,
    pub roles: Vec<Uuid>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StateApplication {
    pub id: Uuid,
    pub player: PlayerId,
    pub text: String,
    pub created_at: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StatePost {
    pub id: Uuid,
    pub author: PlayerId,
    pub title: String,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StateAudit {
    pub id: Uuid,
    pub actor: PlayerId,
    pub action: String,
    pub at: i64,
    pub target: Option<Uuid>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AllianceState {
    pub id: Uuid,
    pub name: String,
    pub tag: String,
    pub leader: PlayerId,
    pub recruitment: AllianceRecruitment,
    pub public_text: String,
    pub revision: u64,
    pub roles: Vec<StateRole>,
    pub members: Vec<StateMember>,
    pub applications: Vec<StateApplication>,
    pub posts: Vec<StatePost>,
    pub audit: Vec<StateAudit>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AllianceEffect {
    pub joined: Option<PlayerId>,
    pub left: Option<PlayerId>,
    pub disbanded: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum AllianceError {
    #[error("invalid alliance input: {0}")]
    InvalidInput(String),
    #[error("alliance permission denied")]
    Forbidden,
    #[error("alliance source not found")]
    NotFound,
    #[error("alliance conflict: {0}")]
    Conflict(String),
}
impl AllianceState {
    pub fn create(
        id: Uuid,
        leader: PlayerId,
        name: String,
        tag: String,
        now: i64,
        role_ids: [Uuid; 3],
    ) -> Result<Self, AllianceError> {
        use AlliancePermission::*;
        policy::identity(&name, &tag)?;
        policy::timestamp(now)?;
        if role_ids.iter().collect::<BTreeSet<_>>().len() != 3 {
            return Err(AllianceError::InvalidInput(
                "role IDs must be unique".into(),
            ));
        }
        let roles = vec![
            StateRole {
                id: role_ids[0],
                name: "Member".into(),
                permissions: vec![ViewMembers, PublishPosts, SendCircular],
                grantable_permissions: vec![],
                is_default: true,
            },
            StateRole {
                id: role_ids[1],
                name: "Recruiter".into(),
                permissions: vec![ViewApplications, ProcessApplications],
                grantable_permissions: vec![],
                is_default: false,
            },
            StateRole {
                id: role_ids[2],
                name: "Officer".into(),
                permissions: vec![
                    ViewMembers,
                    ViewApplications,
                    ProcessApplications,
                    EditProfile,
                    ManageRecruitment,
                    PublishPosts,
                    ManagePosts,
                    PinPosts,
                    KickMembers,
                    ViewAudit,
                ],
                grantable_permissions: vec![],
                is_default: false,
            },
        ];
        Ok(Self {
            id,
            name: name.trim().into(),
            tag: tag.trim().into(),
            leader,
            recruitment: AllianceRecruitment::Application,
            public_text: String::new(),
            revision: 1,
            members: vec![StateMember {
                player: leader,
                joined_at: now,
                roles: vec![role_ids[0]],
            }],
            roles,
            applications: vec![],
            posts: vec![],
            audit: vec![StateAudit {
                id,
                actor: leader,
                action: "Create".into(),
                at: now,
                target: None,
            }],
        })
    }
    pub fn is_member(&self, player: PlayerId) -> bool {
        self.members.iter().any(|m| m.player == player)
    }
    pub fn permissions(&self, player: PlayerId) -> BTreeSet<AlliancePermission> {
        self.authority(player, false)
    }
    pub fn grantable_permissions(&self, player: PlayerId) -> BTreeSet<AlliancePermission> {
        self.authority(player, true)
    }
    fn authority(&self, player: PlayerId, grantable: bool) -> BTreeSet<AlliancePermission> {
        let Some(member) = self.members.iter().find(|m| m.player == player) else {
            return BTreeSet::new();
        };
        if player == self.leader {
            return AlliancePermission::ALL.into_iter().collect();
        }
        self.roles
            .iter()
            .filter(|r| r.is_default || member.roles.contains(&r.id))
            .flat_map(|r| {
                if grantable {
                    &r.grantable_permissions
                } else {
                    &r.permissions
                }
            })
            .copied()
            .collect()
    }
    fn require(
        &self,
        actor: PlayerId,
        permission: AlliancePermission,
    ) -> Result<(), AllianceError> {
        if self.permissions(actor).contains(&permission) {
            Ok(())
        } else {
            Err(AllianceError::Forbidden)
        }
    }
    fn default_role(&self) -> Result<Uuid, AllianceError> {
        self.roles
            .iter()
            .find(|r| r.is_default)
            .map(|r| r.id)
            .ok_or(AllianceError::NotFound)
    }
    fn add_member(&mut self, player: PlayerId, now: i64) -> Result<(), AllianceError> {
        if self.is_member(player) {
            return Err(AllianceError::Conflict("already a member".into()));
        }
        self.members.push(StateMember {
            player,
            joined_at: now,
            roles: vec![self.default_role()?],
        });
        self.applications.retain(|a| a.player != player);
        Ok(())
    }
    /// All failures leave source state, revision, and audit untouched.
    pub fn execute(
        &mut self,
        actor: PlayerId,
        action: &AllianceAction,
        now: i64,
        new_id: Uuid,
    ) -> Result<AllianceEffect, AllianceError> {
        policy::timestamp(now)?;
        // Disband clears membership. There is no live alliance without its leader;
        // derive terminal status instead of storing a second lifecycle flag.
        if !self.is_member(self.leader) {
            return Err(AllianceError::NotFound);
        }
        if action.alliance_id().is_some_and(|id| id != self.id) {
            return Err(AllianceError::NotFound);
        }
        let mut next = self.clone();
        let effect = next.apply(actor, action, now, new_id)?;
        next.revision = self
            .revision
            .checked_add(1)
            .filter(|revision| *revision <= crate::MAX_WIRE_MS as u64)
            .ok_or_else(|| AllianceError::Conflict("revision exhausted".into()))?;
        next.audit.push(StateAudit {
            id: new_id,
            actor,
            action: action.name().into(),
            at: now,
            target: action.target(),
        });
        if next.audit.len() > MAX_AUDIT {
            next.audit.drain(..next.audit.len() - MAX_AUDIT);
        }
        *self = next;
        Ok(effect)
    }
    fn apply(
        &mut self,
        actor: PlayerId,
        action: &AllianceAction,
        now: i64,
        new_id: Uuid,
    ) -> Result<AllianceEffect, AllianceError> {
        use AllianceAction::*;
        use AlliancePermission as P;
        let mut effect = AllianceEffect::default();
        if !matches!(action, Join { .. } | Apply { .. } | Withdraw { .. }) && !self.is_member(actor)
        {
            return Err(AllianceError::Forbidden);
        }
        match action {
            Create { .. } => {
                return Err(AllianceError::InvalidInput(
                    "use AllianceState::create".into(),
                ));
            }
            Join { .. } => {
                if self.recruitment != AllianceRecruitment::Open {
                    return Err(AllianceError::Forbidden);
                }
                self.add_member(actor, now)?;
                effect.joined = Some(actor);
            }
            Apply { text, .. } => {
                if self.is_member(actor) || self.recruitment != AllianceRecruitment::Application {
                    return Err(AllianceError::Forbidden);
                }
                policy::markdown(text, 4000, "application")?;
                if self
                    .applications
                    .iter()
                    .any(|a| a.player == actor || a.id == new_id)
                {
                    return Err(AllianceError::Conflict("application already exists".into()));
                }
                self.applications.push(StateApplication {
                    id: new_id,
                    player: actor,
                    text: text.clone(),
                    created_at: now,
                });
            }
            Withdraw { application } => {
                let i = self.application_index(*application)?;
                if self.applications[i].player != actor {
                    return Err(AllianceError::Forbidden);
                }
                self.applications.remove(i);
            }
            Accept { application, .. } | Reject { application, .. } => {
                self.require(actor, P::ProcessApplications)?;
                let i = self.application_index(*application)?;
                let player = self.applications[i].player;
                if matches!(action, Accept { .. }) {
                    self.add_member(player, now)?;
                    effect.joined = Some(player);
                } else {
                    self.applications.remove(i);
                }
            }
            Leave { .. } => {
                if actor == self.leader {
                    return Err(AllianceError::Conflict(
                        "leader must transfer or disband".into(),
                    ));
                }
                self.members.retain(|m| m.player != actor);
                effect.left = Some(actor);
            }
            Kick { player, .. } => {
                self.require(actor, P::KickMembers)?;
                if *player == actor {
                    return Err(AllianceError::Forbidden);
                }
                self.can_affect(actor, *player)?;
                self.members.retain(|m| m.player != *player);
                effect.left = Some(*player);
            }
            Update {
                name,
                tag,
                public_text,
                recruitment,
                ..
            } => {
                let permissions = self.permissions(actor);
                if !permissions.contains(&P::EditProfile)
                    && !permissions.contains(&P::ManageRecruitment)
                {
                    return Err(AllianceError::Forbidden);
                }
                if name.trim() != self.name
                    || tag.trim() != self.tag
                    || *public_text != self.public_text
                {
                    self.require(actor, P::EditProfile)?;
                }
                if *recruitment != self.recruitment {
                    self.require(actor, P::ManageRecruitment)?;
                }
                policy::identity(name, tag)?;
                policy::markdown(public_text, 8000, "public text")?;
                self.name = name.trim().into();
                self.tag = tag.trim().into();
                self.public_text = public_text.clone();
                self.recruitment = *recruitment;
            }
            SaveRole {
                role,
                name,
                permissions,
                grantable_permissions,
                ..
            } => {
                self.require(actor, P::ManageRoles)?;
                policy::label(name, 1, 48, "role name")?;
                if name.trim().eq_ignore_ascii_case("leader") {
                    return Err(AllianceError::InvalidInput(
                        "Leader is an implicit role".into(),
                    ));
                }
                policy::dependencies(permissions)?;
                policy::dependencies(grantable_permissions)?;
                let id = role.unwrap_or(new_id);
                if self
                    .roles
                    .iter()
                    .any(|r| r.id != id && r.name.to_lowercase() == name.trim().to_lowercase())
                {
                    return Err(AllianceError::Conflict("role name already exists".into()));
                }
                let before = self.clone();
                let existing = self.roles.iter().position(|r| r.id == id);
                if role.is_some() && existing.is_none() {
                    return Err(AllianceError::NotFound);
                }
                if role.is_none() && existing.is_some() {
                    return Err(AllianceError::Conflict("role ID already exists".into()));
                }
                self.can_grant(actor, permissions, grantable_permissions)?;
                let is_default = if let Some(i) = existing {
                    self.can_grant(
                        actor,
                        &self.roles[i].permissions,
                        &self.roles[i].grantable_permissions,
                    )?;
                    self.roles[i].is_default
                } else {
                    false
                };
                let replacement = StateRole {
                    id,
                    name: name.trim().into(),
                    permissions: policy::unique(permissions),
                    grantable_permissions: policy::unique(grantable_permissions),
                    is_default,
                };
                if let Some(i) = existing {
                    self.roles[i] = replacement;
                } else {
                    self.roles.push(replacement);
                }
                self.validate_authority_change(&before, actor)?;
            }
            DeleteRole { role, .. } => {
                self.require(actor, P::ManageRoles)?;
                let i = self
                    .roles
                    .iter()
                    .position(|r| r.id == *role)
                    .ok_or(AllianceError::NotFound)?;
                if self.roles[i].is_default {
                    return Err(AllianceError::Forbidden);
                }
                self.can_grant(
                    actor,
                    &self.roles[i].permissions,
                    &self.roles[i].grantable_permissions,
                )?;
                let before = self.clone();
                self.roles.remove(i);
                for m in &mut self.members {
                    m.roles.retain(|id| id != role);
                }
                self.validate_authority_change(&before, actor)?;
            }
            AssignRoles { player, roles, .. } => {
                self.require(actor, P::AssignRoles)?;
                self.can_affect(actor, *player)?;
                let i = self
                    .members
                    .iter()
                    .position(|m| m.player == *player)
                    .ok_or(AllianceError::NotFound)?;
                let mut selected: BTreeSet<_> = roles.iter().copied().collect();
                selected.insert(self.default_role()?);
                for id in
                    selected.symmetric_difference(&self.members[i].roles.iter().copied().collect())
                {
                    let r = self
                        .roles
                        .iter()
                        .find(|r| r.id == *id)
                        .ok_or(AllianceError::NotFound)?;
                    self.can_grant(actor, &r.permissions, &r.grantable_permissions)?;
                }
                if selected
                    .iter()
                    .any(|id| !self.roles.iter().any(|r| r.id == *id))
                {
                    return Err(AllianceError::NotFound);
                }
                let before = self.clone();
                self.members[i].roles = selected.into_iter().collect();
                self.validate_authority_change(&before, actor)?;
            }
            Transfer { player, .. } => {
                if actor != self.leader || *player == actor {
                    return Err(AllianceError::Forbidden);
                }
                if !self.is_member(*player) {
                    return Err(AllianceError::NotFound);
                }
                let default = self.default_role()?;
                for member in &mut self.members {
                    if member.player == actor || member.player == *player {
                        member.roles = vec![default];
                    }
                }
                self.leader = *player;
            }
            Disband { .. } => {
                if actor != self.leader {
                    return Err(AllianceError::Forbidden);
                }
                self.members.clear();
                self.applications.clear();
                effect.disbanded = true;
            }
            CreatePost { title, body, .. } => {
                self.require(actor, P::PublishPosts)?;
                policy::post(title, body)?;
                if self.posts.iter().any(|p| p.id == new_id) {
                    return Err(AllianceError::Conflict("post ID already exists".into()));
                }
                if self.posts.len() >= MAX_POSTS {
                    let i = self
                        .posts
                        .iter()
                        .enumerate()
                        .filter(|(_, p)| !p.pinned)
                        .min_by_key(|(_, p)| (p.created_at, p.id))
                        .map(|(i, _)| i)
                        .ok_or_else(|| {
                            AllianceError::Conflict("noticeboard has no removable post".into())
                        })?;
                    self.posts.remove(i);
                }
                self.posts.push(StatePost {
                    id: new_id,
                    author: actor,
                    title: title.trim().into(),
                    body: body.clone(),
                    created_at: now,
                    updated_at: now,
                    pinned: false,
                });
            }
            EditPost {
                post, title, body, ..
            } => {
                let i = self.post_index(*post)?;
                self.can_edit_post(actor, i)?;
                policy::post(title, body)?;
                self.posts[i].title = title.trim().into();
                self.posts[i].body = body.clone();
                self.posts[i].updated_at = now;
            }
            DeletePost { post, .. } => {
                let i = self.post_index(*post)?;
                self.can_edit_post(actor, i)?;
                self.posts.remove(i);
            }
            PinPost { post, pinned, .. } => {
                self.require(actor, P::PinPosts)?;
                let i = self.post_index(*post)?;
                if *pinned
                    && !self.posts[i].pinned
                    && self.posts.iter().filter(|p| p.pinned).count() >= MAX_PINNED_POSTS
                {
                    return Err(AllianceError::Conflict("at most five pinned posts".into()));
                }
                self.posts[i].pinned = *pinned;
            }
        }
        Ok(effect)
    }
    fn application_index(&self, id: Uuid) -> Result<usize, AllianceError> {
        self.applications
            .iter()
            .position(|a| a.id == id)
            .ok_or(AllianceError::NotFound)
    }
    fn post_index(&self, id: Uuid) -> Result<usize, AllianceError> {
        self.posts
            .iter()
            .position(|p| p.id == id)
            .ok_or(AllianceError::NotFound)
    }
    fn can_edit_post(&self, actor: PlayerId, i: usize) -> Result<(), AllianceError> {
        if self.posts[i].author == actor {
            Ok(())
        } else {
            self.require(actor, AlliancePermission::ManagePosts)
        }
    }
    fn can_grant(
        &self,
        actor: PlayerId,
        permissions: &[AlliancePermission],
        grants: &[AlliancePermission],
    ) -> Result<(), AllianceError> {
        let allowed = self.grantable_permissions(actor);
        if permissions
            .iter()
            .chain(grants)
            .all(|p| allowed.contains(p))
        {
            Ok(())
        } else {
            Err(AllianceError::Forbidden)
        }
    }
    /// Authority follows acting and delegation sets, never role labels or order.
    fn can_affect(&self, actor: PlayerId, target: PlayerId) -> Result<(), AllianceError> {
        if !self.is_member(target) {
            return Err(AllianceError::NotFound);
        }
        if target == self.leader {
            return Err(AllianceError::Forbidden);
        }
        if actor == self.leader {
            return Ok(());
        }
        let authority: BTreeSet<_> = self
            .permissions(actor)
            .union(&self.grantable_permissions(actor))
            .copied()
            .collect();
        if self.permissions(target).is_subset(&authority)
            && self
                .grantable_permissions(target)
                .is_subset(&self.grantable_permissions(actor))
        {
            Ok(())
        } else {
            Err(AllianceError::Forbidden)
        }
    }
    fn validate_authority_change(
        &self,
        before: &Self,
        actor: PlayerId,
    ) -> Result<(), AllianceError> {
        for member in &before.members {
            let player = member.player;
            let old = before.permissions(player);
            let old_grants = before.grantable_permissions(player);
            let new = self.permissions(player);
            let new_grants = self.grantable_permissions(player);
            if old != new || old_grants != new_grants {
                if actor != before.leader {
                    before.can_affect(actor, player)?;
                    if player == actor
                        && (!new.is_subset(&old) || !new_grants.is_subset(&old_grants))
                    {
                        return Err(AllianceError::Forbidden);
                    }
                }
                policy::dependencies(&new.into_iter().collect::<Vec<_>>())?;
                policy::dependencies(&new_grants.into_iter().collect::<Vec<_>>())?;
            }
        }
        Ok(())
    }
}

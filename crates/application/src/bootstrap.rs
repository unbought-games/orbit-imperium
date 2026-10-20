use crate::*;
use serde::Serialize;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize)]
pub struct Bootstrap {
    pub version: u8,
    pub signup_enabled: bool,
    pub result: BootstrapResult,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BootstrapResult {
    Anonymous,
    Unavailable {
        code: BootstrapError,
    },
    Authenticated {
        session: AuthenticatedSession,
        game: BootstrapGame,
    },
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BootstrapGame {
    Ready { snapshot: Box<InitialGameSnapshot> },
    NoMembership,
    Unavailable { code: BootstrapError },
}
#[derive(Clone, Copy, Debug, Serialize)]
pub enum BootstrapError {
    Unavailable,
    MembershipUnavailable,
    UnsupportedProtocol,
}
#[derive(Clone, Debug, Serialize)]
pub struct InitialGameSnapshot {
    pub request_id: Uuid,
    pub candidate: BindingCandidate,
    pub view: InitialGameView,
    pub settings: BoundSettings,
}
#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum InitialGameView {
    V2(ReadSnapshot<BoundView>),
    V3(ReadSnapshot<BoundView3>),
    V4(ReadSnapshot<BoundView4>),
}
impl InitialGameView {
    fn identity(&self) -> (i32, Binding, Uuid, &Hash, i32) {
        match self {
            Self::V2(v) => (
                v.protocol,
                v.binding,
                v.request_id,
                &v.view.profile_hash,
                v.view.speed,
            ),
            Self::V3(v) => (
                v.protocol,
                v.binding,
                v.request_id,
                &v.profile_hash,
                v.speed,
            ),
            Self::V4(v) => {
                let v = &v.progression;
                (
                    v.protocol,
                    v.binding,
                    v.request_id,
                    &v.profile_hash,
                    v.speed,
                )
            }
        }
    }
}
impl<S: GameStore> GameService<S> {
    pub async fn initial_game(
        &self,
        session: &AuthenticatedSession,
        request_id: Uuid,
    ) -> Result<Option<InitialGameSnapshot>, ServiceError> {
        let Some(membership) = session.memberships.first() else {
            return Ok(None);
        };
        let p = Principal {
            account: session.account,
            player: membership.player,
            universe: membership.universe,
        };
        for _ in 0..3 {
            match self.initial_game_attempt(p, request_id).await {
                Err(ServiceError::EpochChanged) => continue,
                other => return other.map(Some),
            }
        }
        Err(ServiceError::EpochChanged)
    }
    async fn initial_game_attempt(
        &self,
        p: Principal,
        request_id: Uuid,
    ) -> Result<InitialGameSnapshot, ServiceError> {
        let candidate = self
            .current_binding(p.account, p.universe, request_id)
            .await?;
        let b = candidate.binding;
        if b.account != p.account || b.player != p.player || b.universe != p.universe {
            return Err(ServiceError::InvariantFailure);
        }
        let c = QueryContext {
            binding: b,
            request_id,
        };
        let view = match candidate.protocol {
            2 => {
                let mut read = self.bound_view(p, c.clone()).await?;
                read.facts.view.sampled_at = read.progress.sampled_at;
                InitialGameView::V2(read)
            }
            3 => {
                let mut read = self.progression_view(p, c.clone()).await?;
                read.facts.sampled_at = read.progress.sampled_at;
                InitialGameView::V3(read)
            }
            4 => {
                let mut read = self.world_view(p, c.clone()).await?;
                read.facts.progression.sampled_at = read.progress.sampled_at;
                InitialGameView::V4(read)
            }
            _ => return Err(ServiceError::UnsupportedProtocol),
        };
        let settings = self.bound_settings(p, c).await?;
        let (protocol, binding, id, profile, speed) = view.identity();
        if protocol != candidate.protocol
            || binding != b
            || id != request_id
            || settings.protocol != protocol
            || settings.binding != b
            || settings.request_id != request_id
            || &settings.profile_hash != profile
            || settings.speed != speed
        {
            return Err(ServiceError::InvariantFailure);
        }
        Ok(InitialGameSnapshot {
            request_id,
            candidate,
            view,
            settings,
        })
    }
}

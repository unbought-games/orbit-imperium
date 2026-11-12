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
        #[serde(skip_serializing_if = "Option::is_none")]
        authentication: Option<OidcSessionMetadata>,
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
    V4(Box<ReadSnapshot<BoundView4>>),
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
        self.initial_game_for(session, request_id, None).await
    }
    pub async fn initial_game_for(
        &self,
        session: &AuthenticatedSession,
        request_id: Uuid,
        target: Option<&str>,
    ) -> Result<Option<InitialGameSnapshot>, ServiceError> {
        let membership = if let Some(target) = target {
            Some(
                session
                    .memberships
                    .iter()
                    .find(|m| {
                        m.universe.0.to_string() == target
                            || universe_route_key(&m.universe_name) == target
                    })
                    .ok_or(ServiceError::Forbidden)?,
            )
        } else {
            session.memberships.first()
        };
        let Some(membership) = membership else {
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
                InitialGameView::V4(Box::new(read))
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

/// Matches the public universe URL key in the browser and PostgreSQL.
pub fn universe_route_key(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            ' ' => "-".into(),
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' => c.to_ascii_lowercase().to_string(),
            _ => format!("~{:x}~", u32::from(c)),
        })
        .collect()
}

/// Nonsecret evidence for an authenticated caller's own identity lifetime.
#[derive(Clone, Debug, Serialize)]
pub struct OidcSessionMetadata {
    /// Unix seconds; verified identity expiry, not the Orbit cookie idle deadline.
    pub identity_valid_until: i64,
    /// Random generation changed only by a durably committed rotation or login.
    pub refresh_generation: String,
}

#[cfg(test)]
mod route_key_tests {
    use super::*;
    #[test]
    fn public_universe_keys_match_ascii_and_escaped_unicode_routes() {
        for (name, key) in [
            ("Orion Reach", "orion-reach"),
            ("A/B", "a~2f~b"),
            ("世界", "~4e16~~754c~"),
            ("..", "~2e~~2e~"),
        ] {
            assert_eq!(universe_route_key(name), key);
        }
    }
}

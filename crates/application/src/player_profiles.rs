use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Internal account mapping. Provider subjects never go to game browsers.
pub struct PlayerIdentity {
    pub player: PlayerId,
    pub username: String,
    pub issuer: Option<String>,
    pub subject: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum ProfileSource {
    SelfAccount,
    Rankings { players: Vec<PlayerId> },
    Galaxy { galaxy: u32, system: u32 },
    Incoming,
    Report { report: orbit_engine::ReportId },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlayerProfilesQuery {
    pub context: QueryContext,
    pub source: ProfileSource,
}

impl<S: GameStore> GameService<S> {
    /// Resolve visibility through the same membership and observation gates as
    /// gameplay. Callers cannot submit arbitrary player IDs or Accounts subjects.
    pub async fn visible_profile_players(
        &self,
        p: Principal,
        q: PlayerProfilesQuery,
    ) -> Result<Vec<PlayerId>, ServiceError> {
        Self::principal(p, q.context.binding)?;
        let current = self
            .current_binding(p.account, p.universe, q.context.request_id)
            .await?;
        if current.binding != q.context.binding {
            return Err(ServiceError::NotFound);
        }
        let mut players = BTreeSet::from([p.player]);
        if !matches!(q.source, ProfileSource::SelfAccount) && current.protocol != 4 {
            return Err(ServiceError::UnsupportedProtocol);
        }
        match q.source {
            ProfileSource::SelfAccount => {}
            ProfileSource::Rankings { players: requested } => {
                if requested.len() > 50 {
                    return Err(ServiceError::Malformed);
                }
                players.extend(
                    self.store
                        .public_player_names(q.context.binding, requested)
                        .await?
                        .into_keys(),
                );
            }
            ProfileSource::Galaxy { galaxy, system } => {
                let view = self
                    .world_query(
                        p,
                        WorldQuery {
                            context: q.context,
                            query: WorldQueryKind::Galaxy { galaxy, system },
                        },
                    )
                    .await?;
                for position in view.facts.data["positions"]
                    .as_array()
                    .into_iter()
                    .flatten()
                {
                    add_player(&mut players, &position["body"]["owner"]);
                }
            }
            ProfileSource::Incoming => {
                players.extend(
                    self.world_view(p, q.context)
                        .await?
                        .facts
                        .missions
                        .incoming
                        .into_iter()
                        .map(|fleet| fleet.sender),
                );
            }
            ProfileSource::Report { report } => {
                let view = self.report4(p, q.context, report).await?;
                players.extend(report_profile_players(&view.facts.data.payload));
            }
        }
        Ok(players.into_iter().collect())
    }
}

fn add_player(players: &mut BTreeSet<PlayerId>, value: &serde_json::Value) {
    if let Some(id) = value.as_str().and_then(|s| uuid::Uuid::parse_str(s).ok()) {
        players.insert(PlayerId(id));
    }
}
fn origins(players: &mut BTreeSet<PlayerId>, value: &serde_json::Value) {
    for origin in value.as_array().into_iter().flatten() {
        add_player(players, &origin["owner"]);
    }
}
/// Only identities actually revealed by the recipient's report, never hidden
/// engine participants or private attack evidence.
pub fn report_profile_players(payload: &serde_json::Value) -> BTreeSet<PlayerId> {
    let mut players = BTreeSet::new();
    match payload["kind"].as_str() {
        Some("Espionage") => add_player(&mut players, &payload["target"]["owner"]),
        Some("SpyContact") => add_player(&mut players, &payload["sender"]),
        Some("Combat") => {
            for key in [
                "participants",
                "survivors",
                "gross_losses",
                "recovered",
                "permanent_losses",
            ] {
                origins(&mut players, &payload[key]);
            }
            for round in payload["rounds"].as_array().into_iter().flatten() {
                origins(&mut players, &round["start"]);
                origins(&mut players, &round["end"]);
            }
        }
        _ => {}
    }
    players
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn profiles_follow_only_recipient_visible_report_identities() {
        let a = uuid::Uuid::from_u128(1);
        let b = uuid::Uuid::from_u128(2);
        assert_eq!(
            report_profile_players(
                &json!({"kind":"Combat","participants":[{"owner":a}],"rounds":[{"end":[{"owner":b},{"owner":a}]}]})
            ),
            BTreeSet::from([PlayerId(a), PlayerId(b)])
        );
        assert_eq!(
            report_profile_players(&json!({"kind":"Espionage","target":{"owner":a}})),
            BTreeSet::from([PlayerId(a)])
        );
        assert_eq!(
            report_profile_players(&json!({"kind":"SpyContact","sender":b})),
            BTreeSet::from([PlayerId(b)])
        );
        for kind in ["ContactLost", "AttackEvidence", "Future"] {
            assert!(
                report_profile_players(
                    &json!({"kind":kind,"sender":a,"participants":[{"owner":b}]})
                )
                .is_empty()
            );
        }
        assert!(report_profile_players(&json!({"kind":"SpyContact","sender":"bad"})).is_empty());
    }
}

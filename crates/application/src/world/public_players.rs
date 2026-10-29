use super::*;
use std::collections::{BTreeMap, BTreeSet};

/// Current public usernames, separate from immutable gameplay observations.
pub type PublicPlayerNames = BTreeMap<PlayerId, String>;

#[derive(Serialize)]
pub(super) struct NamedGalaxy {
    #[serde(flatten)]
    pub system: GalaxySystem,
    pub player_names: PublicPlayerNames,
}

impl<S: GameStore> GameService<S> {
    pub(super) async fn public_names(
        &self,
        binding: Binding,
        players: BTreeSet<PlayerId>,
    ) -> Result<PublicPlayerNames, ServiceError> {
        if players.is_empty() {
            return Ok(BTreeMap::new());
        }
        Ok(self
            .store
            .public_player_names(binding, players.into_iter().collect())
            .await?)
    }
}

/// Only inspect identity fields in the recipient's authorized payload. In
/// particular, ContactLost never resolves the hidden defender's identity.
pub(super) fn report_players(payload: &serde_json::Value) -> BTreeSet<PlayerId> {
    let mut players = BTreeSet::new();
    let mut add = |value: &serde_json::Value| {
        if let Some(id) = value.as_str().and_then(|s| uuid::Uuid::parse_str(s).ok()) {
            players.insert(PlayerId(id));
        }
    };
    match payload["kind"].as_str() {
        Some("MissileImpact") => add(&payload["attacker"]),
        Some("Espionage") => add(&payload["target"]["owner"]),
        Some("SpyContact") => add(&payload["sender"]),
        Some("Combat") => {
            for key in [
                "participants",
                "survivors",
                "gross_losses",
                "recovered",
                "permanent_losses",
            ] {
                for row in payload[key].as_array().into_iter().flatten() {
                    add(&row["owner"]);
                }
            }
            for round in payload["rounds"].as_array().into_iter().flatten() {
                for key in ["start", "end"] {
                    for row in round[key].as_array().into_iter().flatten() {
                        add(&row["owner"]);
                    }
                }
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
    fn report_names_follow_only_visible_identity_fields_and_deduplicate() {
        let a = PlayerId(uuid::Uuid::from_u128(1));
        let b = PlayerId(uuid::Uuid::from_u128(2));
        assert_eq!(
            report_players(&json!({"kind":"Espionage","target":{"owner":a}})),
            BTreeSet::from([a])
        );
        assert_eq!(
            report_players(&json!({"kind":"SpyContact","sender":b})),
            BTreeSet::from([b])
        );
        assert_eq!(
            report_players(
                &json!({"kind":"Combat","participants":[{"owner":a},{"owner":a}],"survivors":[{"owner":"invalid"}],"rounds":[{"start":[{"owner":b}],"end":[{"owner":a}]}],"private":{"owner":uuid::Uuid::from_u128(3)}})
            ),
            BTreeSet::from([a, b])
        );
        assert!(
            report_players(
                &json!({"kind":"ContactLost","target":{"owner":b},"own_lost_ships":[{"owner":a}]})
            )
            .is_empty()
        );
        assert!(report_players(&json!({"kind":"FutureReport","sender":a})).is_empty());
    }
}

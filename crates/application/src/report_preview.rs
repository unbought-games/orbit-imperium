use serde_json::{Map, Value};

/// A compact projection of the recipient's immutable observation, never live world facts.
/// The caller must select the authorized recipient's payload before projecting it.
pub fn report_preview(payload: &Value) -> Value {
    let fields: &[&str] = match payload["kind"].as_str() {
        Some("Espionage") => &[
            "target",
            "resources",
            "fleet",
            "defenses",
            "counterespionage",
        ],
        Some("SpyContact") => &["origin", "target", "detected"],
        Some("Delivered") => &["origin", "target", "cargo"],
        Some("Returned" | "Recalled" | "Harvested" | "MissionFailed" | "Deployed") => &[
            "origin_coordinates",
            "destination_coordinates",
            "cargo",
            "ships",
        ],
        Some("Combat") => &["target", "outcome", "loot", "debris", "mission"],
        Some("ContactLost") => &["target", "own_lost_ships", "own_cargo_loss"],
        Some("Colonized" | "ColonizationFailed") => &["destination_coordinates", "reason"],
        _ => &[],
    };
    let mut preview = Map::new();
    for key in std::iter::once(&"kind").chain(fields.iter()) {
        if let Some(value) = payload.get(*key) {
            preview.insert((*key).to_owned(), value.clone());
        }
    }
    if payload["kind"] == "Combat"
        && let Some(participants) = payload["participants"].as_array()
    {
        preview.insert(
            "participants".into(),
            Value::Array(
                participants
                    .iter()
                    .map(|participant| {
                        let mut identity = Map::new();
                        for key in ["owner", "side"] {
                            if let Some(value) = participant.get(key) {
                                identity.insert(key.into(), value.clone());
                            }
                        }
                        Value::Object(identity)
                    })
                    .collect(),
            ),
        );
    }
    Value::Object(preview)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn preserves_unknown_and_known_empty_observations_without_revealing_other_sections() {
        let payload = json!({"kind":"Espionage", "target":{"coordinates":{"galaxy":1,"system":2,"position":3}}, "resources":{"visibility":"Unknown"}, "fleet":{"visibility":"Known","value":[]}, "defenses":{"visibility":"Unknown"}, "research":{"visibility":"Known","value":{"WeaponsTechnology":9}}});
        let preview = report_preview(&payload);
        assert_eq!(preview["resources"], payload["resources"]);
        assert_eq!(preview["fleet"], payload["fleet"]);
        assert_eq!(preview["target"], payload["target"]);
        assert!(preview.get("research").is_none());
    }

    #[test]
    fn keeps_participant_sides_for_recipient_relative_outcomes_without_rosters() {
        let payload = json!({"kind":"Combat","outcome":"DefenderVictory","participants":[{"owner":"attacker","side":"Attacker","units":[{"count":"500"}],"technology":[9,9,9]},{"owner":"defender","side":"Defender","units":[]}]});
        assert_eq!(
            report_preview(&payload)["participants"],
            json!([{"owner":"attacker","side":"Attacker"},{"owner":"defender","side":"Defender"}])
        );
    }

    #[test]
    fn excludes_battle_rounds_and_preserves_exact_cargo_and_return_manifest() {
        let combat = json!({"kind":"Combat","outcome":"AttackerVictory","loot":{"metal":"9007199254740993123","crystal":"0","deuterium":"0"},"rounds":[{"private":"detail"}],"participants":[]});
        assert_eq!(
            report_preview(&combat),
            json!({"kind":"Combat","outcome":"AttackerVictory","loot":combat["loot"],"participants":[]})
        );
        let returned = json!({"kind":"Returned","ships":[{"ship_type":"EspionageProbe","count":"1"}],"cargo":{"metal":"0","crystal":"0","deuterium":"0"},"origin_coordinates":{"galaxy":1,"system":1,"position":5},"fleet":"internal"});
        let preview = report_preview(&returned);
        assert_eq!(preview["ships"], returned["ships"]);
        assert_eq!(
            preview["origin_coordinates"],
            returned["origin_coordinates"]
        );
        assert!(preview.get("fleet").is_none());
    }
}

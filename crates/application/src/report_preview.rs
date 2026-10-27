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
        Some("Harvested") => &[
            "origin_coordinates",
            "destination_coordinates",
            "cargo",
            "harvested",
            "ships",
        ],
        Some("Returned" | "Recalled" | "MissionFailed" | "Deployed") => &[
            "origin_coordinates",
            "destination_coordinates",
            "cargo",
            "ships",
        ],
        Some("Combat") => &[
            "target",
            "target_name",
            "target_kind",
            "outcome",
            "loot",
            "debris",
            "mission",
        ],
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
    fn harvest_preview_preserves_recorded_delta_and_does_not_invent_historical_amounts() {
        let legacy = json!({"kind":"Harvested","cargo":{"metal":"123000000","crystal":"45000000","deuterium":"6000000"}});
        assert_eq!(report_preview(&legacy), legacy);
        for metal in ["0", "9007199254740993"] {
            let mut current = legacy.clone();
            current["harvested"] = json!({"metal":metal,"crystal":"0","deuterium":"0"});
            assert_eq!(report_preview(&current), current);
        }
    }

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
    #[test]
    fn keeps_only_recipient_visible_historical_body_identity() {
        let payload = json!({"kind":"Combat","target":{"galaxy":1,"system":2,"position":3},"target_name":"Nova Roma","target_kind":"Planet"});
        assert_eq!(report_preview(&payload), payload);
        let restricted = json!({"kind":"ContactLost","target":payload["target"],"target_name":"Hidden","target_kind":"Moon"});
        assert_eq!(
            report_preview(&restricted),
            json!({"kind":"ContactLost","target":payload["target"]})
        );
        let legacy = json!({"kind":"Combat","target":payload["target"]});
        assert_eq!(report_preview(&legacy), legacy);
    }
}

/// Derive a comparable resource investment from authorized historical observations.
/// Unknown sections and unsupported units remain unknown, including on old reports.
pub fn report_investment(
    payload: &Value,
    section: &str,
    rules: &orbit_engine::Ruleset,
) -> Option<String> {
    if payload["kind"] != "Espionage" || payload[section]["visibility"] != "Known" {
        return None;
    }
    let units = payload[section]["value"].as_array()?;
    let costs = &rules.artifact.progression.as_ref()?.unit_costs;
    let mut total = 0i128;
    for unit in units {
        let item: orbit_engine::ManufacturedItem =
            serde_json::from_value(unit["item"].clone()).ok()?;
        let count = unit["count"].as_str()?.parse::<i64>().ok()?;
        if count < 0 {
            return None;
        }
        let cost = costs.iter().find(|cost| cost.item == item)?;
        let value: i128 = cost.cost.values().into_iter().map(i128::from).sum();
        total = total.checked_add(value.checked_mul(i128::from(count))?)?;
    }
    Some(total.checked_mul(1_000_000)?.to_string())
}

#[cfg(test)]
mod investment_tests {
    use super::*;
    use orbit_engine::*;
    use serde_json::json;
    #[test]
    fn investment_uses_active_costs_and_preserves_unknown_and_known_empty() {
        let mut rules = Ruleset::mvp_fleets().unwrap();
        let item = rules.artifact.progression.as_ref().unwrap().unit_costs[0].item;
        rules.artifact.progression.as_mut().unwrap().unit_costs[0].cost = Resources::all(7);
        let payload = json!({"kind":"Espionage","fleet":{"visibility":"Known","value":[{"item":item,"count":"9007199254740993"}]},"defenses":{"visibility":"Known","value":[]}});
        assert_eq!(
            report_investment(&payload, "fleet", &rules),
            Some((9007199254740993i128 * 21 * 1_000_000).to_string())
        );
        assert_eq!(
            report_investment(&payload, "defenses", &rules),
            Some("0".into())
        );
        assert_eq!(
            report_investment(
                &json!({"kind":"Espionage","fleet":{"visibility":"Unknown"}}),
                "fleet",
                &rules
            ),
            None
        );
        assert_eq!(
            report_investment(&json!({"kind":"Combat"}), "fleet", &rules),
            None
        );
    }
}

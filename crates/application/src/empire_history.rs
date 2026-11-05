//! Persistent player-authored timelines over bounded historical game facts.
use crate::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryQuery {
    #[serde(default)]
    pub library: bool,
    pub before: Option<Uuid>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: Uuid,
    pub kind: String,
    pub at_ms: Option<i64>,
    pub facts: Value,
    pub selected: bool,
    pub caption: String,
    pub featured: bool,
    pub publication: Option<Uuid>,
    pub noteworthy: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correction: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EmpireProfile {
    pub player: Uuid,
    pub profile: Uuid,
    pub universe: Uuid,
    pub epoch: Uuid,
    pub universe_name: String,
    pub username: String,
    pub identity: EmpireIdentity,
    pub title: TitleDisplay,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_choices: Option<Vec<TitleChoice>>,
    #[serde(skip)]
    pub title_grants: Vec<String>,
    pub display: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alliance: Option<AllianceIdentity>,
    pub owner: bool,
    pub public: bool,
    pub removed: bool,
    pub closed: bool,
    pub revision: i64,
    pub entries: Vec<HistoryEntry>,
    pub next: Option<Uuid>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrbitProfile {
    pub id: Uuid,
    pub owner: bool,
    pub empires: Vec<EmpireProfile>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoricalDetail {
    pub entry: HistoryEntry,
    pub player: Uuid,
    pub universe_name: String,
    pub report: Option<SharedReport>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum ProfileAction {
    Identity {
        identity: EmpireIdentity,
    },
    Visibility {
        public: bool,
    },
    Select {
        event: Uuid,
        selected: bool,
        caption: String,
        featured: bool,
    },
    Publish {
        event: Uuid,
    },
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileCommand {
    pub command_id: Uuid,
    pub expected_revision: i64,
    pub action: ProfileAction,
}
impl ProfileCommand {
    pub fn validate(&self) -> Result<(), ServiceError> {
        if let ProfileAction::Identity { identity } = &self.action
            && !identity.valid()
        {
            return Err(ServiceError::Malformed);
        }
        if self.expected_revision < 0 {
            return Err(ServiceError::Malformed);
        }
        if let ProfileAction::Select { caption, .. } = &self.action
            && (caption.chars().count() > 2000
                || caption
                    .chars()
                    .any(|c| c.is_control() && c != '\n' && c != '\t'))
        {
            return Err(ServiceError::Malformed);
        }
        Ok(())
    }
}

/// Version 1: a minimum involvement of 20,000 resource units, and either 10% of
/// the empire or 25% of its ships AND 2% of its empire. Involvement is the
/// greater of committed military assets and permanent paid-value losses. Integer comparisons
/// preserve determinism and avoid floating-point/rounding thresholds.
/// Inputs are an event-time observation of paid asset lineage, never live totals.
/// Unknown legacy baselines cannot earn an automatic recommendation.
pub fn noteworthy_battle(facts: &Value) -> bool {
    let Some(lots) = facts.get("valuation_before").and_then(Value::as_array) else {
        return false;
    };
    let mut empire = 0i128;
    let mut fleet = 0i128;
    let mut engaged = 0i128;
    for lot in lots {
        let Some(q) = lot["quantity"].as_i64().filter(|x| *x >= 0) else {
            return false;
        };
        let Some(v) = lot["unit_value_micro"].as_i64().filter(|x| *x >= 0) else {
            return false;
        };
        let value = i128::from(q) * i128::from(v);
        let Some(total) = empire.checked_add(value) else {
            return false;
        };
        empire = total;
        if matches!(lot["item"]["kind"].as_str(), Some("Ship" | "Defense"))
            && facts["origins"].as_array().is_some_and(|origins| {
                origins.iter().any(|origin| {
                    origin
                        .get("Fleet")
                        .is_some_and(|id| Some(id) == lot["location"].get("Fleet"))
                        || origin
                            .get("Stationed")
                            .is_some_and(|id| Some(id) == lot["location"].get("Body"))
                })
            })
        {
            engaged = match engaged.checked_add(value) {
                Some(x) => x,
                None => return false,
            };
        }
        if lot["item"]["kind"] == "Ship" {
            fleet = match fleet.checked_add(value) {
                Some(x) => x,
                None => return false,
            };
        }
    }
    let Some(after) = facts.get("valuation_after").and_then(Value::as_array) else {
        return false;
    };
    let mut remaining = 0i128;
    for lot in after {
        let Some(q) = lot["quantity"].as_i64().filter(|x| *x >= 0) else {
            return false;
        };
        let Some(v) = lot["unit_value_micro"].as_i64().filter(|x| *x >= 0) else {
            return false;
        };
        let Some(total) = remaining.checked_add(i128::from(q) * i128::from(v)) else {
            return false;
        };
        remaining = total;
    }
    let loss = (empire - remaining).max(engaged);
    loss >= 20_000_000_000
        && empire > 0
        && (loss > (empire - 1) / 10
            || (fleet > 0 && loss > (fleet - 1) / 4 && loss > (empire - 1) / 50))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn facts(fleet: i64, economy: i64, loss: i64) -> Value {
        json!({"valuation_before":[
            {"quantity":1,"unit_value_micro":fleet,"item":{"kind":"Ship","id":"SmallCargo"}},
            {"quantity":1,"unit_value_micro":economy,"item":{"kind":"Building","id":"MetalMine"}}
        ],"valuation_after":[{"quantity":1,"unit_value_micro":fleet+economy-loss}]})
    }
    #[test]
    fn significance_requires_absolute_and_empire_scale_not_just_all_of_a_tiny_fleet() {
        assert!(!noteworthy_battle(&facts(
            4_000_000_000,
            8_000_000_000_000,
            4_000_000_000
        )));
        assert!(!noteworthy_battle(&facts(
            20_000_000_000,
            8_000_000_000_000,
            20_000_000_000
        )));
        assert!(noteworthy_battle(&facts(
            100_000_000_000,
            400_000_000_000,
            25_000_000_000
        )));
        assert!(!noteworthy_battle(&facts(
            100_000_000_000,
            400_000_000_000,
            24_999_999_999
        )));
        assert!(noteworthy_battle(&facts(
            0,
            200_000_000_000,
            20_000_000_000
        )));
        assert!(!noteworthy_battle(&json!({})));
    }
    #[test]
    fn a_large_engagement_can_be_noteworthy_without_losing_the_fleet() {
        let mut f = facts(100_000_000_000, 400_000_000_000, 0);
        f["valuation_before"][0]["location"] = json!({"Fleet":"engaged"});
        f["origins"] = json!([{"Fleet":"engaged"}]);
        assert!(noteworthy_battle(&f));
        f["origins"] = json!([{"Fleet":"elsewhere"}]);
        assert!(!noteworthy_battle(&f));
    }
    #[test]
    fn captions_are_bounded_and_cannot_carry_control_characters() {
        let mut q = ProfileCommand {
            command_id: Uuid::nil(),
            expected_revision: 0,
            action: ProfileAction::Select {
                event: Uuid::nil(),
                selected: true,
                caption: "Story\nHere".into(),
                featured: false,
            },
        };
        assert!(q.validate().is_ok());
        if let ProfileAction::Select { caption, .. } = &mut q.action {
            *caption = "\0".into();
        }
        assert!(q.validate().is_err());
    }
}

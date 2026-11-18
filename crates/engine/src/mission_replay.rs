//! Offline supplied-artifact compatibility only; never queries production history.
use crate::*;
use serde_json::Value;

/// Replay supplied snapshots from executors that produced manual recall reports.
/// Select by producing release, since the rules and command protocol did not change.
pub fn replay_with_recall_reports(
    state: &GameState,
    input: &OrderedInput,
    rules: &Ruleset,
) -> TransitionResult {
    transition_with_recall_reports(state, input, rules, RecallReports::LegacyReplay)
}

/// Select explicitly by the journal's producing release. Original facts, outcomes
/// and accepted terms remain untouched. Live execution always uses `transition`.
pub fn replay_legacy_mission_transition(
    facts: &Value,
    input: &OrderedInput,
    rules: &Ruleset,
) -> Result<Value, serde_json::Error> {
    let state: GameState = serde_json::from_value(facts.clone())?;
    let mut result = serde_json::to_value(replay_with_recall_reports(&state, input, rules))?;
    strip_mission_return_reasons(&mut result);
    Ok(result)
}
pub(crate) fn strip_mission_return_reasons(result: &mut Value) {
    if let Some(fleets) = result
        .pointer_mut("/Applied/world/records/fleets")
        .and_then(Value::as_object_mut)
    {
        for fleet in fleets.values_mut() {
            fleet.as_object_mut().unwrap().remove("return_reason");
        }
    }
}

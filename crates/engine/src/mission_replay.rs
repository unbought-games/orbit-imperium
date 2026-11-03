//! Read-only replay boundary for journals predating causal return facts.
use crate::*;
use serde_json::Value;

/// Select explicitly by the journal's producing release. Original facts, outcomes
/// and accepted terms remain untouched. Live execution always uses `transition`.
pub fn replay_legacy_mission_transition(
    facts: &Value,
    input: &OrderedInput,
    rules: &Ruleset,
) -> Result<Value, serde_json::Error> {
    let state: GameState = serde_json::from_value(facts.clone())?;
    let mut result = serde_json::to_value(transition(&state, input, rules))?;
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

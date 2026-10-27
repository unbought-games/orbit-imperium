//! Read-only compatibility for journals written with stored debris reference counts.
use crate::*;
use serde_json::{Value, json};

/// Replay a pre-counter-removal journal snapshot in its original JSON format.
///
/// This is an investigation boundary, not a live-state writer: new transitions use
/// `transition` and never serialize the obsolete counter. The caller must select
/// this format from the journal's producing release (an empty debris collection
/// cannot distinguish old and new formats). Keep the original facts/outcome intact.
pub fn replay_legacy_debris_transition(
    facts: &Value,
    input: &OrderedInput,
    rules: &Ruleset,
) -> Result<Value, serde_json::Error> {
    let state: GameState = serde_json::from_value(facts.clone())?;
    if let Some(world) = &state.world {
        for field in world.records.debris.values() {
            let recorded =
                &facts["world"]["records"]["debris"][field.id.to_string()]["active_references"];
            if recorded.as_u64()
                != Some(debris_reference_count(field.id, world.records.fleets.values()) as u64)
            {
                return serde_json::to_value(TransitionResult::InvalidState(InvariantError(
                    "incomplete or inconsistent debris references".into(),
                )));
            }
        }
    }
    let result = transition(&state, input, rules);
    let mut serialized = serde_json::to_value(&result)?;
    if let TransitionResult::Applied(changes) = &result {
        // Historical fact hashes included the counter, even on no-op events.
        serialized["Applied"]["expected_facts_hash"] = json!(hash(facts));
        if let Some(world) = &changes.world {
            // This journal format predates collection observations. Reproduce
            // its original payload for reports emitted by this transition;
            // never rewrite historical reports already present in the facts.
            for report in world.records.reports.values() {
                if report.event == input.id && report.kind == "Harvested" {
                    for recipient in report.payloads.keys() {
                        if let Some(payload) = serialized["Applied"]["world"]["records"]["reports"]
                            [report.id.to_string()]["payloads"][recipient.to_string()]
                        .as_object_mut()
                        {
                            payload.remove("harvested");
                        }
                    }
                }
            }
            for field in world.records.debris.values() {
                serialized["Applied"]["world"]["records"]["debris"][field.id.to_string()]["active_references"] = json!(
                    debris_reference_count(field.id, world.records.fleets.values())
                );
            }
        }
    }
    Ok(serialized)
}

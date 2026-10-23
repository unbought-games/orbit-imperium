//! Pure rules-update checks and production settlement; no deployment coordination.
use crate::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RulesCatalogDelta {
    pub add_buildings: Vec<Building>,
    pub add_research: Vec<ResearchId>,
}
pub fn validate_rules_update(
    current: &Ruleset,
    next: &Ruleset,
) -> Result<RulesCatalogDelta, RulesError> {
    current.validate()?;
    next.validate()?;
    if !current.progression()
        || current.protocol() != next.protocol()
        || current.speed != next.speed
        || current.artifact.universe != next.artifact.universe
        || current.artifact.resource_scale != next.artifact.resource_scale
        || current.artifact.hour_ms != next.artifact.hour_ms
        || !current.building_keys().is_subset(&next.building_keys())
        || !current.research_keys().is_subset(&next.research_keys())
        || current
            .artifact
            .ships
            .keys()
            .any(|k| !next.artifact.ships.contains_key(k))
        || (current.attacks() && !next.attacks())
        || current
            .artifact
            .world
            .as_ref()
            .and_then(|w| w.colonization.as_ref())
            .is_some_and(|before| {
                next.artifact
                    .world
                    .as_ref()
                    .and_then(|w| w.colonization.as_ref())
                    .is_none_or(|after| before.profile != after.profile)
            })
    {
        return Err(RulesError::InvalidReference);
    }
    let before = current
        .artifact
        .progression
        .as_ref()
        .ok_or(RulesError::InvalidReference)?;
    let after = next
        .artifact
        .progression
        .as_ref()
        .ok_or(RulesError::InvalidReference)?;
    if before
        .unit_costs
        .iter()
        .any(|u| !after.unit_costs.iter().any(|n| n.item == u.item))
    {
        return Err(RulesError::InvalidReference);
    }
    Ok(RulesCatalogDelta {
        add_buildings: next
            .building_keys()
            .difference(&current.building_keys())
            .copied()
            .collect(),
        add_research: next
            .research_keys()
            .difference(&current.research_keys())
            .copied()
            .collect(),
    })
}
pub fn settle_rules_boundary(
    body: &Body,
    settings: &ProductionSettings,
    at: Timestamp,
    current: &Ruleset,
) -> Result<ResourceCheckpoint, InvariantError> {
    crate::economy::settle_rates(
        body,
        at,
        production_rates_with_settings(body, settings, current)?,
        current,
    )
}

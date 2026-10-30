//! Pure rules-update checks and production settlement; no deployment coordination.
use crate::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RulesCatalogDelta {
    pub add_buildings: Vec<Building>,
    pub add_research: Vec<ResearchId>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum RulesUpdateImpact {
    Unchanged,
    RulesOnly,
    SettleAndInitialize,
}

#[derive(Clone, Debug)]
pub struct RulesUpdatePlan {
    pub impact: RulesUpdateImpact,
    pub initialize: RulesCatalogDelta,
}

/// Classify validated runtime meaning, never the historical wire representation.
/// Only explicitly permitted differences can skip gameplay-state preparation.
pub fn plan_rules_update(current: &Ruleset, next: &Ruleset) -> Result<RulesUpdatePlan, RulesError> {
    let initialize = validate_rules_update(current, next)?;
    let impact = if current.equivalent(next) {
        RulesUpdateImpact::Unchanged
    } else {
        let mut remainder = next.artifact.clone();
        if let (Some(before), Some(after)) = (&current.artifact.world, &mut remainder.world) {
            after.combat.ship_debris_bps = before.combat.ship_debris_bps;
            after.combat.deuterium_in_debris = before.combat.deuterium_in_debris;
        }
        // Compare the entire remainder: mixed edits and future fields fall back
        // to settlement without maintaining a list of economic dependencies.
        if current.artifact.world.is_some()
            && next.artifact.world.is_some()
            && current.speed == next.speed
            && current.artifact == remainder
        {
            RulesUpdateImpact::RulesOnly
        } else {
            RulesUpdateImpact::SettleAndInitialize
        }
    };
    Ok(RulesUpdatePlan { impact, initialize })
}

pub fn validate_rules_update(
    current: &Ruleset,
    next: &Ruleset,
) -> Result<RulesCatalogDelta, RulesError> {
    current.validate()?;
    next.validate()?;
    if !current.progression()
        || current.protocol() != next.protocol()
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
    if current
        .artifact
        .world
        .as_ref()
        .is_some_and(|w| w.missiles.is_some())
        && next
            .artifact
            .world
            .as_ref()
            .is_none_or(|w| w.missiles.is_none())
    {
        return Err(RulesError::InvalidReference);
    }
    if (before.fusion_reactor.is_some() && after.fusion_reactor.is_none())
        || (before.solar_satellite.is_some() && after.solar_satellite.is_none())
        || before
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
    satellites: i64,
    technology: u32,
    at: Timestamp,
    current: &Ruleset,
) -> Result<ResourceCheckpoint, InvariantError> {
    if fusion_rule(current).is_some() {
        return settle_fusion(body, settings, satellites, technology, at, current);
    }
    crate::economy::settle_rates(
        body,
        at,
        production_rates_with_settings(body, settings, satellites, current)?,
        current,
    )
}

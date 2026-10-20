use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ResearchId {
    CombustionDrive,
    ComputerTechnology,
    EnergyTechnology,
    EspionageTechnology,
    WeaponsTechnology,
    ShieldingTechnology,
    ArmourTechnology,
    LaserTechnology,
    IonTechnology,
    PlasmaTechnology,
    HyperspaceTechnology,
    ImpulseDrive,
    HyperspaceDrive,
    Astrophysics,
    IntergalacticResearchNetwork,
    GravitonTechnology,
}
impl ResearchId {
    pub const MVP: [Self; 7] = [
        Self::CombustionDrive,
        Self::ComputerTechnology,
        Self::EnergyTechnology,
        Self::EspionageTechnology,
        Self::WeaponsTechnology,
        Self::ShieldingTechnology,
        Self::ArmourTechnology,
    ];
    pub const ALL: [Self; 2] = [Self::CombustionDrive, Self::ComputerTechnology];
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResearchLevels {
    pub owner: PlayerId,
    pub levels: BTreeMap<ResearchId, u32>,
    pub revision: i64,
}
impl ResearchLevels {
    pub fn validate(&self) -> Result<(), InvariantError> {
        if self.revision < 0 || ResearchId::ALL.iter().any(|k| !self.levels.contains_key(k)) {
            return Err(InvariantError("incomplete research levels".into()));
        }
        Ok(())
    }
}
pub fn research_level(
    state: &GameState,
    owner: PlayerId,
    research: ResearchId,
) -> Result<u32, InvariantError> {
    if !state.coverage.research_players.contains(&owner) {
        return Err(InvariantError("uncovered research".into()));
    }
    let facts = state
        .research
        .get(&owner)
        .ok_or_else(|| InvariantError("missing research".into()))?;
    facts.validate()?;
    if facts.owner != owner {
        return Err(InvariantError("research owner mismatch".into()));
    }
    facts
        .levels
        .get(&research)
        .copied()
        .ok_or_else(|| InvariantError("missing supported research level".into()))
}

pub fn validate_research_catalog(
    levels: &ResearchLevels,
    rules: &Ruleset,
) -> Result<(), InvariantError> {
    levels.validate()?;
    if levels
        .levels
        .keys()
        .copied()
        .collect::<std::collections::BTreeSet<_>>()
        != rules.research_keys()
    {
        return Err(InvariantError("incomplete research catalog".into()));
    }
    Ok(())
}

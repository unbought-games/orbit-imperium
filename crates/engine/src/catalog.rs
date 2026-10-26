use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum DefenseId {
    RocketLauncher,
    SmallShieldDome,
    LightLaser,
    HeavyLaser,
    GaussCannon,
    IonCannon,
    PlasmaTurret,
    LargeShieldDome,
}
impl DefenseId {
    pub fn is_shield_dome(self) -> bool {
        matches!(self, Self::SmallShieldDome | Self::LargeShieldDome)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum MissileId {
    AntiBallisticMissile,
    InterplanetaryMissile,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", deny_unknown_fields)]
pub enum CatalogKey {
    Building(Building),
    Research(ResearchId),
    Ship(ShipType),
    Defense(DefenseId),
    Missile(MissileId),
}
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum Requirement {
    BodyBuilding { building: Building, level: u32 },
    PlayerResearch { research: ResearchId, level: u32 },
}
impl Requirement {
    fn key(&self) -> CatalogKey {
        match self {
            Self::BodyBuilding { building, .. } => CatalogKey::Building(*building),
            Self::PlayerResearch { research, .. } => CatalogKey::Research(*research),
        }
    }
    fn level(&self) -> u32 {
        match self {
            Self::BodyBuilding { level, .. } | Self::PlayerResearch { level, .. } => *level,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CatalogEntry {
    pub key: CatalogKey,
    pub body_kinds: BTreeSet<BodyKind>,
    pub requirements: Vec<Requirement>,
    pub enabled: bool,
    pub mobile: bool,
}
pub(crate) fn validate_catalog(a: &RulesArtifact) -> Result<(), RulesError> {
    let entries: BTreeMap<_, _> = a.catalog.iter().map(|e| (e.key, e)).collect();
    if (a.progression.is_none() && entries.len() != 7) || entries.len() != a.catalog.len() {
        return Err(RulesError::InvalidReference);
    }
    for entry in &a.catalog {
        if entry.body_kinds != BTreeSet::from([BodyKind::Planet])
            || (entry.mobile && !matches!(entry.key, CatalogKey::Ship(_)))
        {
            return Err(RulesError::InvalidReference);
        }
        match entry.key {
            CatalogKey::Building(b) if entry.enabled && !a.buildings.contains_key(&b) => {
                return Err(RulesError::InvalidReference);
            }
            CatalogKey::Ship(s)
                if entry.enabled && a.progression.is_none() && !a.ships.contains_key(&s) =>
            {
                return Err(RulesError::InvalidReference);
            }
            _ => {}
        }
        if entry.enabled && !has_definition(a, entry.key) {
            return Err(RulesError::InvalidReference);
        }
        let mut seen = BTreeSet::new();
        for req in &entry.requirements {
            if req.level() == 0
                || !seen.insert(req.key())
                || !entries.contains_key(&req.key())
                || (entry.enabled
                    && (!entries[&req.key()].enabled || !has_definition(a, req.key())))
            {
                return Err(RulesError::InvalidReference);
            }
        }
        if !entry.requirements.windows(2).all(|p| p[0] < p[1]) {
            return Err(RulesError::InvalidReference);
        }
        let mut pending = vec![entry.key];
        let mut visited = BTreeSet::new();
        while let Some(key) = pending.pop() {
            if !visited.insert(key) {
                continue;
            }
            for req in &entries[&key].requirements {
                if req.key() == entry.key {
                    return Err(RulesError::InvalidReference);
                }
                pending.push(req.key());
            }
        }
    }
    Ok(())
}

fn has_definition(a: &RulesArtifact, key: CatalogKey) -> bool {
    match key {
        CatalogKey::Building(k) => a.buildings.contains_key(&k),
        CatalogKey::Research(k) => a
            .progression
            .as_ref()
            .map_or(ResearchId::ALL.contains(&k), |p| {
                p.research.contains_key(&k)
            }),
        CatalogKey::Ship(k) => {
            (a.ships.contains_key(&k)
                || (k == ShipType::SolarSatellite
                    && a.progression
                        .as_ref()
                        .is_some_and(|p| p.solar_satellite.is_some()))
                || (a.progression.is_some() && a.world.is_none()))
                && a.progression.as_ref().is_none_or(|p| {
                    p.unit_costs
                        .iter()
                        .any(|u| u.item == ManufacturedItem::Ship(k))
                })
        }
        CatalogKey::Defense(k) => a.progression.as_ref().is_some_and(|p| {
            p.unit_costs
                .iter()
                .any(|u| u.item == ManufacturedItem::Defense(k))
        }),
        CatalogKey::Missile(_) => false,
    }
}

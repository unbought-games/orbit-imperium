//! Immutable progression formulas. Rates, costs and durations never use floating point.
use crate::numeric::*;
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProgressionRules {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fusion_reactor: Option<FusionRule>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub solar_satellite: Option<SolarSatelliteRule>,
    pub building_formula: String,
    pub demolition_formula: String,
    /// Whole resource units, certified by G03; scaled only on use.
    pub storage_capacities: Vec<i64>,
    pub research: BTreeMap<ResearchId, BuildingRule>,
    pub unit_costs: Vec<UnitCost>,
    pub max_active_manufacturing_entries: usize,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnitCost {
    pub item: ManufacturedItem,
    pub cost: Resources,
}
impl ProgressionRules {
    pub(crate) fn validate(&self, a: &RulesArtifact) -> Result<(), RulesError> {
        if self.building_formula != "BuildingRedesign2011"
            || self.demolition_formula != "DemolitionClassic"
            || self.max_active_manufacturing_entries != 256
            || self.storage_capacities.len() != 34
            || self.storage_capacities[0] != 10000
            || !self.storage_capacities.windows(2).all(|p| p[0] < p[1])
            || self
                .storage_capacities
                .iter()
                .any(|n| *n < 0 || n.checked_mul(SCALE).is_none())
        {
            return Err(RulesError::InvalidReference);
        }
        if Building::MVP.iter().any(|k| !a.buildings.contains_key(k))
            || ResearchId::MVP
                .iter()
                .any(|k| !self.research.contains_key(k))
        {
            return Err(RulesError::InvalidReference);
        }
        for (&k, r) in &self.research {
            if !ResearchId::MVP.contains(&k)
                && !matches!(
                    k,
                    ResearchId::ImpulseDrive
                        | ResearchId::LaserTechnology
                        | ResearchId::IonTechnology
                        | ResearchId::PlasmaTechnology
                        | ResearchId::HyperspaceTechnology
                        | ResearchId::HyperspaceDrive
                        | ResearchId::Astrophysics
                )
            {
                return Err(RulesError::InvalidReference);
            }
            let growth = if k == ResearchId::Astrophysics {
                [7, 4]
            } else {
                [2, 1]
            };
            if r.base.iter().any(|v| *v < 0) || r.growth != growth {
                return Err(RulesError::Range);
            }
        }
        if a.buildings.contains_key(&Building::FusionReactor) != self.fusion_reactor.is_some() {
            return Err(RulesError::InvalidReference);
        }
        if let Some(rule) = &self.fusion_reactor {
            // The selected no-self-start equilibrium assumes no background fuel.
            // Refuse incompatible custom economies instead of inventing cycling.
            if a.base_income[2] != 0 {
                return Err(RulesError::InvalidReference);
            }
            rule.validate()?;
        }
        if let Some(rule) = &self.solar_satellite {
            rule.validate()?;
            if a.world.is_none()
                || a.ships.contains_key(&ShipType::SolarSatellite)
                || !a
                    .catalog
                    .iter()
                    .any(|e| e.key == CatalogKey::Ship(ShipType::SolarSatellite) && !e.mobile)
                || !self
                    .unit_costs
                    .iter()
                    .any(|u| u.item == ManufacturedItem::Ship(ShipType::SolarSatellite))
            {
                return Err(RulesError::InvalidReference);
            }
        }
        let mut items = BTreeSet::new();
        for u in &self.unit_costs {
            if !items.insert(u.item)
                || u.cost
                    .values()
                    .iter()
                    .any(|v| *v < 0 || v.checked_mul(SCALE).is_none())
            {
                return Err(RulesError::Range);
            }
        }
        for ship in a.ships.keys() {
            if !matches!(
                ship,
                ShipType::SmallCargo
                    | ShipType::ColonyShip
                    | ShipType::LargeCargo
                    | ShipType::LightFighter
                    | ShipType::HeavyFighter
                    | ShipType::Cruiser
                    | ShipType::Bomber
                    | ShipType::Battleship
                    | ShipType::Recycler
                    | ShipType::EspionageProbe
            ) {
                return Err(RulesError::InvalidReference);
            }
            if !items.contains(&ManufacturedItem::Ship(*ship)) {
                return Err(RulesError::InvalidReference);
            }
        }
        for unit in &self.unit_costs {
            if !a.catalog.iter().any(|e| e.key == unit.item.catalog_key())
                || match unit.item {
                    ManufacturedItem::Ship(ShipType::SolarSatellite) => {
                        self.solar_satellite.is_none()
                    }
                    ManufacturedItem::Ship(k) => a.world.is_some() && !a.ships.contains_key(&k),
                    ManufacturedItem::Defense(k) => !matches!(
                        k,
                        DefenseId::RocketLauncher
                            | DefenseId::SmallShieldDome
                            | DefenseId::LargeShieldDome
                            | DefenseId::LightLaser
                            | DefenseId::HeavyLaser
                            | DefenseId::GaussCannon
                            | DefenseId::IonCannon
                            | DefenseId::PlasmaTurret
                    ),
                    ManufacturedItem::Missile(_) => true,
                }
            {
                return Err(RulesError::InvalidReference);
            }
        }
        Ok(())
    }
}
impl ManufacturedItem {
    pub fn catalog_key(self) -> CatalogKey {
        match self {
            Self::Ship(s) => CatalogKey::Ship(s),
            Self::Defense(d) => CatalogKey::Defense(d),
            Self::Missile(m) => CatalogKey::Missile(m),
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildingAction {
    Upgrade,
    Demolition,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FacilityTerm {
    pub building: Building,
    pub level: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LabTerm {
    pub body: BodyId,
    pub level: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum ProgressionMaterial {
    Transport {
        legacy: RetainedTransportMaterial,
    },
    Building {
        profile_hash: Hash,
        body: BodyId,
        building: Building,
        action: BuildingAction,
        source_level: u32,
        target_level: u32,
        #[serde(with = "resource_wire")]
        paid: Resources,
        duration_ms: i64,
        formula: String,
        facilities: Vec<FacilityTerm>,
        #[serde(with = "decimal_wire")]
        required_energy: i64,
        reserve_fields: u32,
    },
    Research {
        profile_hash: Hash,
        host: BodyId,
        research: ResearchId,
        source_level: u32,
        target_level: u32,
        #[serde(with = "resource_wire")]
        paid: Resources,
        duration_ms: i64,
        formula: String,
        labs: Vec<LabTerm>,
        #[serde(with = "decimal_wire")]
        effective_lab: i64,
        #[serde(with = "decimal_wire")]
        required_energy: i64,
    },
    Manufacture {
        profile_hash: Hash,
        body: BodyId,
        item: ManufacturedItem,
        #[serde(with = "decimal_wire")]
        quantity: i64,
        #[serde(with = "resource_wire")]
        unit_cost: Resources,
        #[serde(with = "resource_wire")]
        paid: Resources,
        unit_duration_ms: i64,
        formula: String,
        facilities: Vec<FacilityTerm>,
    },
}
/// Reserved protocol-3 shape. The expanded profile never quotes transport until G07 is integrated.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RetainedTransportMaterial {
    #[serde(with = "decimal_wire")]
    pub fuel: i64,
    #[serde(with = "decimal_wire")]
    pub capacity: i64,
    #[serde(with = "decimal_wire")]
    pub maximum_payload: i64,
    pub profile_hash: Hash,
    #[serde(with = "resource_wire")]
    pub cost: Resources,
    pub duration: i64,
    pub target_level: Option<u32>,
}
impl ProgressionMaterial {
    pub fn paid(&self) -> Resources {
        match self {
            Self::Transport { legacy } => legacy.cost,
            Self::Building { paid, .. }
            | Self::Research { paid, .. }
            | Self::Manufacture { paid, .. } => *paid,
        }
    }
    pub fn duration(&self) -> i64 {
        match self {
            Self::Transport { legacy } => legacy.duration,
            Self::Building { duration_ms, .. } | Self::Research { duration_ms, .. } => *duration_ms,
            Self::Manufacture {
                unit_duration_ms, ..
            } => *unit_duration_ms,
        }
    }
}
pub mod decimal_wire {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(n: &i64, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&n.to_string())
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
        let s = String::deserialize(d)?;
        if s.is_empty()
            || s.len() > 19
            || !s.bytes().all(|b| b.is_ascii_digit())
            || (s.len() > 1 && s.starts_with('0'))
        {
            return Err(serde::de::Error::custom(
                "canonical nonnegative decimal required",
            ));
        }
        s.parse().map_err(serde::de::Error::custom)
    }
}
pub mod resource_wire {
    use super::*;
    #[derive(Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Wire {
        #[serde(with = "decimal_wire")]
        metal: i64,
        #[serde(with = "decimal_wire")]
        crystal: i64,
        #[serde(with = "decimal_wire")]
        deuterium: i64,
    }
    pub fn serialize<S: serde::Serializer>(v: &Resources, s: S) -> Result<S::Ok, S::Error> {
        Wire {
            metal: v.metal,
            crystal: v.crystal,
            deuterium: v.deuterium,
        }
        .serialize(s)
    }
    pub fn deserialize<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Resources, D::Error> {
        let v = Wire::deserialize(d)?;
        Ok(Resources {
            metal: v.metal,
            crystal: v.crystal,
            deuterium: v.deuterium,
        })
    }
}
fn enabled(r: &Ruleset, key: CatalogKey) -> Result<(), GameError> {
    if !r.progression() || !r.artifact.catalog.iter().any(|e| e.key == key && e.enabled) {
        Err(GameError::UnavailableContent)
    } else {
        Ok(())
    }
}
fn level(b: &Body, k: Building) -> Result<u32, GameError> {
    b.levels.get(&k).copied().ok_or(GameError::InvalidInput)
}
fn paid(raw: &[Rational; 3]) -> Result<Resources, GameError> {
    let mut out = [0; 3];
    for i in 0..3 {
        out[i] = floor(raw[i].clone())?
            .checked_mul(SCALE)
            .ok_or(GameError::NumericRange)?;
    }
    Ok(Resources::from_values(out))
}
fn millis(seconds: i64) -> Result<i64, GameError> {
    let d = seconds
        .max(1)
        .checked_mul(1000)
        .ok_or(GameError::NumericRange)?;
    if d > MAX_WIRE_MS {
        return Err(GameError::NumericRange);
    }
    Ok(d)
}
pub fn storage_capacity(level: u32, rules: &Ruleset) -> Result<i64, GameError> {
    rules
        .artifact
        .progression
        .as_ref()
        .ok_or(GameError::UnavailableContent)?
        .storage_capacities
        .get(level as usize)
        .and_then(|n| n.checked_mul(SCALE))
        .ok_or(GameError::NumericRange)
}
pub fn building_terms(
    body: &Body,
    building: Building,
    action: BuildingAction,
    rules: &Ruleset,
) -> Result<ProgressionMaterial, GameError> {
    enabled(rules, CatalogKey::Building(building))?;
    let source = level(body, building)?;
    let target = match action {
        BuildingAction::Upgrade => source.checked_add(1).ok_or(GameError::NumericRange)?,
        BuildingAction::Demolition => source.checked_sub(1).ok_or(GameError::InvalidInput)?,
    };
    let mut future = body.clone();
    future.levels.insert(building, target);
    production_rates(&future, rules)?;
    energy_stats(&future, rules)?;
    if matches!(
        building,
        Building::MetalStorage | Building::CrystalStorage | Building::DeuteriumTank
    ) {
        storage_capacity(target, rules)?;
    }
    let r = rules
        .artifact
        .buildings
        .get(&building)
        .ok_or(GameError::UnavailableContent)?;
    let growth = if target == 0 {
        ratio(r.growth[1], r.growth[0])?
    } else {
        power(ratio(r.growth[0], r.growth[1])?, target - 1)?
    };
    let raw: [Rational; 3] = std::array::from_fn(|i| integer(r.base[i]) * growth.clone());
    let robotics = level(body, Building::RoboticsFactory)?;
    let b = floor(
        integer(3600) * (raw[0].clone() + raw[1].clone())
            / integer(2500)
            / integer(1 + i64::from(robotics))
            / integer(i64::from(rules.speed)),
    )?;
    let seconds = if action == BuildingAction::Upgrade && b >= 100 {
        b - 90
    } else {
        b.max(1)
    };
    Ok(ProgressionMaterial::Building {
        profile_hash: rules.hash.clone(),
        body: body.id,
        building,
        action,
        source_level: source,
        target_level: target,
        paid: paid(&raw)?,
        duration_ms: millis(seconds)?,
        formula: if action == BuildingAction::Upgrade {
            "BuildingRedesign2011"
        } else {
            "DemolitionClassic"
        }
        .into(),
        facilities: vec![
            FacilityTerm {
                building: Building::NaniteFactory,
                level: 0,
            },
            FacilityTerm {
                building: Building::RoboticsFactory,
                level: robotics,
            },
        ],
        required_energy: 0,
        reserve_fields: u32::from(action == BuildingAction::Upgrade),
    })
}
// Round each raw base-derived cost independently to the nearest 100, ties up.
// Never feed an earlier level's rounded payment into the next level.
fn astrophysics_payment(raw: &[Rational; 3]) -> Result<Resources, GameError> {
    let mut values = [0; 3];
    for (i, value) in raw.iter().enumerate() {
        values[i] = floor(value.clone() / integer(100) + ratio(1, 2)?)?
            .checked_mul(100 * SCALE)
            .ok_or(GameError::NumericRange)?;
    }
    Ok(Resources::from_values(values))
}

pub fn research_terms(
    body: &Body,
    levels: &ResearchLevels,
    research: ResearchId,
    rules: &Ruleset,
) -> Result<ProgressionMaterial, GameError> {
    enabled(rules, CatalogKey::Research(research))?;
    let source = *levels
        .levels
        .get(&research)
        .ok_or(GameError::InvalidInput)?;
    let target = source.checked_add(1).ok_or(GameError::NumericRange)?;
    let r = &rules
        .artifact
        .progression
        .as_ref()
        .ok_or(GameError::UnavailableContent)?
        .research[&research];
    let growth = power(ratio(r.growth[0], r.growth[1])?, source)?;
    let raw = std::array::from_fn(|i| integer(r.base[i]) * growth.clone());
    let cost = if research == ResearchId::Astrophysics {
        astrophysics_payment(&raw)?
    } else {
        paid(&raw)?
    };
    let lab = level(body, Building::ResearchLab)?;
    let seconds = floor(
        integer(3600) * integer(add(cost.metal / SCALE, cost.crystal / SCALE)?)
            / integer(1000)
            / integer(1 + i64::from(lab))
            / integer(i64::from(rules.speed)),
    )?;
    Ok(ProgressionMaterial::Research {
        profile_hash: rules.hash.clone(),
        host: body.id,
        research,
        source_level: source,
        target_level: target,
        paid: cost,
        duration_ms: millis(seconds)?,
        formula: if research == ResearchId::Astrophysics {
            "ResearchAstrophysics"
        } else {
            "ResearchClassic"
        }
        .into(),
        labs: vec![LabTerm {
            body: body.id,
            level: lab,
        }],
        effective_lab: i64::from(lab),
        required_energy: 0,
    })
}
pub fn manufacture_terms(
    body: &Body,
    item: ManufacturedItem,
    quantity: i64,
    rules: &Ruleset,
) -> Result<ProgressionMaterial, GameError> {
    enabled(rules, item.catalog_key())?;
    if quantity <= 0 {
        return Err(GameError::InvalidInput);
    }
    let p = rules
        .artifact
        .progression
        .as_ref()
        .ok_or(GameError::UnavailableContent)?;
    let raw = p
        .unit_costs
        .iter()
        .find(|u| u.item == item)
        .ok_or(GameError::UnavailableContent)?
        .cost;
    let mut unit = [0; 3];
    let mut total = [0; 3];
    for i in 0..3 {
        unit[i] = raw.values()[i]
            .checked_mul(SCALE)
            .ok_or(GameError::NumericRange)?;
        total[i] = unit[i]
            .checked_mul(quantity)
            .ok_or(GameError::NumericRange)?;
    }
    let yard = level(body, Building::Shipyard)?;
    let duration = millis(floor(
        integer(3600) * integer(add(raw.metal, raw.crystal)?)
            / integer(2500)
            / integer(1 + i64::from(yard))
            / integer(i64::from(rules.speed)),
    )?)?;
    deadline(
        0,
        duration
            .checked_mul(quantity)
            .ok_or(GameError::NumericRange)?,
    )?;
    Ok(ProgressionMaterial::Manufacture {
        profile_hash: rules.hash.clone(),
        body: body.id,
        item,
        quantity,
        unit_cost: Resources::from_values(unit),
        paid: Resources::from_values(total),
        unit_duration_ms: duration,
        formula: "ManufactureClassic".into(),
        facilities: vec![
            FacilityTerm {
                building: Building::NaniteFactory,
                level: 0,
            },
            FacilityTerm {
                building: Building::Shipyard,
                level: yard,
            },
        ],
    })
}

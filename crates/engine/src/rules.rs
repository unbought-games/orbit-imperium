use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuildingRule {
    pub base: [i64; 3],
    pub growth: [i64; 2],
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImpulseDriveRule {
    pub minimum_level: u32,
    pub base_speed: i64,
    pub fuel: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShipRule {
    /// Base propulsion; absent historical profiles use Combustion Drive.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drive: Option<ResearchId>,
    /// Optional complete replacement profile; absent in retained rules artifacts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub impulse_drive: Option<ImpulseDriveRule>,
    /// Bomber replacement profile; omitted by retained rules artifacts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hyperspace_drive: Option<ImpulseDriveRule>,
    pub base_speed: i64,
    pub drive_coefficient: [i64; 2],
    pub fuel: i64,
    pub capacity: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RulesArtifact {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world: Option<WorldRules>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progression: Option<ProgressionRules>,
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub universe: Option<UniverseProfile>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub catalog: Vec<CatalogEntry>,
    pub resource_scale: i64,
    pub hour_ms: i64,
    pub growth: [i64; 2],
    pub base_income: [i64; 3],
    pub production: [i64; 3],
    pub energy_demand: [i64; 3],
    pub energy_supply: i64,
    pub temperature: [i64; 4],
    pub construction_divisor: i64,
    pub buildings: BTreeMap<Building, BuildingRule>,
    #[serde(deserialize_with = "crate::persisted::unique_map")]
    pub ships: BTreeMap<ShipType, ShipRule>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RulesData {
    pub artifact: RulesArtifact,
    pub speed: i32,
    pub hash: Hash,
}
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum RulesError {
    #[error("unsupported rules policy")]
    Unsupported,
    #[error("malformed rules")]
    Malformed,
    #[error("invalid catalog reference")]
    InvalidReference,
    #[error("numeric range or precision")]
    Range,
    #[error("rules hash mismatch")]
    HashMismatch,
}
pub type Ruleset = Persisted<RulesData>;
impl crate::persisted::private::Sealed for RulesData {}
impl PersistedFormat for RulesData {
    fn verify_original(value: &serde_json::Value) -> Result<(), String> {
        let expected: Hash =
            serde_json::from_value(value["hash"].clone()).map_err(|e| e.to_string())?;
        if hash(&(&value["artifact"], &value["speed"])) != expected {
            return Err(RulesError::HashMismatch.to_string());
        }
        Ok(())
    }
}
impl Ruleset {
    pub fn colonization(&self) -> bool {
        self.artifact
            .world
            .as_ref()
            .and_then(|w| w.colonization.as_ref())
            .is_some_and(|c| c.enabled)
    }
    pub fn world(&self) -> bool {
        self.artifact.world.is_some()
    }
    pub fn mvp_fleets() -> Result<Self, RulesError> {
        Self::from_json(include_bytes!("../../../rules/mvp-v1-slice-4.json"))
    }

    pub fn mvp_raids() -> Result<Self, RulesError> {
        Self::from_json(include_bytes!("../../../rules/mvp-v1-slice-5.json"))
    }
    /// Retained 10× constructor for historical fixtures and existing callers.
    pub fn signup(profile: UniverseProfile) -> Result<Self, RulesError> {
        Self::signup_with_speed(profile, 10)
    }
    pub fn signup_with_speed(profile: UniverseProfile, speed: i32) -> Result<Self, RulesError> {
        profile.validate()?;
        if profile.id != "signup-v2" {
            return Err(RulesError::InvalidReference);
        }
        let mut artifact = Self::mvp_raids()?.artifact.clone();
        artifact.universe = Some(profile);
        Self::from_artifact(artifact, speed)
    }
    pub fn attacks(&self) -> bool {
        self.artifact
            .world
            .as_ref()
            .is_some_and(|w| w.raiding.is_some())
    }
    pub fn progression(&self) -> bool {
        self.artifact.progression.is_some()
    }
    pub fn protocol(&self) -> i32 {
        if self.world() {
            4
        } else if self.progression() {
            3
        } else if self.artifact.id == "first-slice-v1" {
            1
        } else {
            2
        }
    }
    pub fn mvp_progression() -> Result<Self, RulesError> {
        Self::from_json(include_bytes!("../../../rules/mvp-v1-slice-2.json"))
    }
    pub fn from_json(bytes: &[u8]) -> Result<Self, RulesError> {
        let artifact: serde_json::Value =
            serde_json::from_slice(bytes).map_err(|_| RulesError::Malformed)?;
        let speed = if artifact.get("universe").is_some_and(|v| !v.is_null()) {
            10
        } else {
            1
        };
        let identity = hash(&(&artifact, speed));
        let rules: Self = serde_json::from_value(
            serde_json::json!({"artifact":artifact,"speed":speed,"hash":identity}),
        )
        .map_err(|_| RulesError::Malformed)?;
        rules.validate()?;
        Ok(rules)
    }
    pub fn from_artifact(artifact: RulesArtifact, speed: i32) -> Result<Self, RulesError> {
        if artifact.id.trim().is_empty()
            || !(1..=100).contains(&speed)
            || (artifact.universe.as_ref().is_some_and(|p| p.id == "mvp-v1") && speed != 10)
            || Building::ALL
                .iter()
                .any(|k| !artifact.buildings.contains_key(k))
            || artifact.buildings.keys().any(|k| {
                !Building::MVP.contains(k)
                    && (!matches!(k, Building::FusionReactor | Building::MissileSilo)
                        || artifact.progression.is_none())
            })
        {
            return Err(RulesError::InvalidReference);
        }
        if let Some(universe) = &artifact.universe {
            universe.validate()?;
        }
        if artifact
            .universe
            .as_ref()
            .is_some_and(|p| p.id == "signup-v2")
            && (artifact.world.as_ref().is_none_or(|w| w.raiding.is_none())
                || artifact.progression.is_none())
        {
            return Err(RulesError::InvalidReference);
        }
        if artifact.world.is_some()
            && (artifact.progression.is_none() || artifact.universe.is_none())
        {
            return Err(RulesError::InvalidReference);
        }
        if artifact.progression.is_none()
            && !matches!(
                artifact.id.as_str(),
                "first-slice-v1" | "shared-foundation-r1" | "mvp-v1-slice-1"
            )
        {
            return Err(RulesError::InvalidReference);
        }
        if artifact.resource_scale != SCALE
            || artifact.hour_ms != 3_600_000
            || artifact.growth[1] <= 0
            || artifact.growth[0] <= 0
            || artifact.construction_divisor <= 0
            || artifact.energy_supply < 0
            || artifact.temperature[2] <= 0
            || artifact.temperature[3] <= 0
            || artifact
                .base_income
                .iter()
                .chain(&artifact.production)
                .chain(&artifact.energy_demand)
                .any(|x| *x < 0)
        {
            return Err(RulesError::Range);
        }
        if artifact.universe.is_some() {
            // The linear temperature factor must also be valid for homeworlds
            // admitted after activation, including when this universe is empty.
            let (low, high) = if artifact
                .world
                .as_ref()
                .is_some_and(|w| w.colonization.is_some())
            {
                (-130, 260)
            } else {
                crate::universe::homeworld_temperature_bounds()
            };
            let t = artifact.temperature;
            for temperature in [low, high] {
                let factor = crate::numeric::ratio(t[0], t[2]).map_err(|_| RulesError::Range)?
                    + crate::numeric::ratio(t[1], t[3]).map_err(|_| RulesError::Range)?
                        * crate::numeric::integer(i64::from(temperature));
                if factor < crate::numeric::integer(0) {
                    return Err(RulesError::Range);
                }
            }
        }
        if let Some(w) = &artifact.world {
            w.validate()?;
            let progression = artifact
                .progression
                .as_ref()
                .ok_or(RulesError::InvalidReference)?;
            if w.combat.units.len()
                != progression
                    .unit_costs
                    .iter()
                    .filter(|u| !matches!(u.item, ManufacturedItem::Missile(_)))
                    .count()
            {
                return Err(RulesError::InvalidReference);
            }
            for unit in &w.combat.units {
                if !progression
                    .unit_costs
                    .iter()
                    .any(|cost| cost.item == unit.item && cost.cost.values() == unit.cost)
                {
                    return Err(RulesError::InvalidReference);
                }
            }
        }
        if let Some(p) = &artifact.progression {
            p.validate(&artifact)?;
        }
        for b in artifact.buildings.keys() {
            let r = artifact
                .buildings
                .get(b)
                .ok_or(RulesError::InvalidReference)?;
            if r.base.iter().any(|v| *v < 0) || r.growth[0] <= r.growth[1] || r.growth[1] <= 0 {
                return Err(RulesError::Range);
            }
        }
        for (ship, r) in &artifact.ships {
            if let Some(drive) = r.drive
                && (!matches!(
                    (ship, drive),
                    (
                        ShipType::ColonyShip
                            | ShipType::HeavyFighter
                            | ShipType::Cruiser
                            | ShipType::Bomber,
                        ResearchId::ImpulseDrive
                    ) | (
                        ShipType::Battleship | ShipType::Battlecruiser | ShipType::Destroyer,
                        ResearchId::HyperspaceDrive
                    )
                ) || artifact
                    .progression
                    .as_ref()
                    .is_none_or(|p| !p.research.contains_key(&drive)))
            {
                return Err(RulesError::InvalidReference);
            }
            if let Some(upgrade) = &r.impulse_drive {
                if *ship != ShipType::SmallCargo
                    || artifact.world.is_none()
                    || artifact
                        .progression
                        .as_ref()
                        .is_none_or(|p| !p.research.contains_key(&ResearchId::ImpulseDrive))
                {
                    return Err(RulesError::InvalidReference);
                }
                if upgrade.minimum_level == 0 || upgrade.base_speed <= 0 || upgrade.fuel <= 0 {
                    return Err(RulesError::Range);
                }
            }
            if let Some(upgrade) = &r.hyperspace_drive {
                if *ship != ShipType::Bomber
                    || r.drive != Some(ResearchId::ImpulseDrive)
                    || artifact.world.is_none()
                    || artifact
                        .progression
                        .as_ref()
                        .is_none_or(|p| !p.research.contains_key(&ResearchId::HyperspaceDrive))
                {
                    return Err(RulesError::InvalidReference);
                }
                if upgrade.minimum_level == 0 || upgrade.base_speed <= 0 || upgrade.fuel <= 0 {
                    return Err(RulesError::Range);
                }
            }
            if r.base_speed <= 0
                || r.drive_coefficient[0] < 0
                || r.drive_coefficient[1] <= 0
                || r.fuel <= 0
                || r.capacity < 0
                || (r.capacity == 0 && artifact.world.is_none())
            {
                return Err(RulesError::Range);
            }
        }
        if artifact
            .world
            .as_ref()
            .and_then(|w| w.colonization.as_ref())
            .is_some()
            && (!artifact
                .ships
                .get(&ShipType::ColonyShip)
                .is_some_and(|s| s.drive == Some(ResearchId::ImpulseDrive))
                || !artifact
                    .progression
                    .as_ref()
                    .is_some_and(|p| p.research.contains_key(&ResearchId::Astrophysics)))
        {
            return Err(RulesError::InvalidReference);
        }
        if artifact.id != "first-slice-v1" {
            crate::catalog::validate_catalog(&artifact)?;
        } else if !artifact.catalog.is_empty() {
            return Err(RulesError::InvalidReference);
        }
        // Enabling the drive in a flying universe must also supply its cargo switch.
        if artifact.world.is_some()
            && artifact
                .catalog
                .iter()
                .any(|e| e.key == CatalogKey::Research(ResearchId::ImpulseDrive) && e.enabled)
            && artifact
                .ships
                .get(&ShipType::SmallCargo)
                .is_some_and(|s| s.impulse_drive.is_none())
        {
            return Err(RulesError::InvalidReference);
        }
        // Enabling Hyperspace Drive in a universe with Bombers includes its switch.
        if artifact
            .catalog
            .iter()
            .any(|e| e.key == CatalogKey::Research(ResearchId::HyperspaceDrive) && e.enabled)
            && artifact
                .ships
                .get(&ShipType::Bomber)
                .is_some_and(|s| s.hyperspace_drive.is_none())
        {
            return Err(RulesError::InvalidReference);
        }
        let hash = hash(&(&artifact, speed));
        Ok(Self::from_new(RulesData {
            artifact,
            speed,
            hash,
        }))
    }
    pub fn building_keys(&self) -> BTreeSet<Building> {
        self.artifact.buildings.keys().copied().collect()
    }
    pub fn research_keys(&self) -> BTreeSet<ResearchId> {
        self.artifact.progression.as_ref().map_or_else(
            || ResearchId::ALL.into_iter().collect(),
            |p| p.research.keys().copied().collect(),
        )
    }
    pub fn with_speed(self, speed: i32) -> Result<Self, RulesError> {
        if !(1..=100).contains(&speed)
            || (self
                .artifact
                .universe
                .as_ref()
                .is_some_and(|p| p.id == "mvp-v1")
                && speed != 10)
        {
            return Err(RulesError::Range);
        }
        if self.speed == speed {
            return Ok(self);
        }
        Self::from_artifact(self.artifact.clone(), speed)
    }
    pub fn mvp() -> Result<Self, RulesError> {
        Self::from_json(include_bytes!("../../../rules/mvp-v1-slice-1.json"))?.with_speed(10)
    }
    pub fn equivalent(&self, other: &Self) -> bool {
        self.speed == other.speed && self.artifact == other.artifact
    }
    pub fn validate(&self) -> Result<(), RulesError> {
        // Integrity is verified before interpretation by Persisted's decoder.
        Self::from_artifact(self.artifact.clone(), self.speed).map(|_| ())
    }
}

//! Pure operator configuration contracts. Defaults apply only to explicit creation.
use crate::UniverseId;
use orbit_engine::{Ruleset, UniverseProfile};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Value, json};

pub const UNIVERSE_CONFIG_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UniversePolicy {
    pub signup_enabled: bool,
    // `Option` alone accepts omission. A complete policy requires explicit null.
    #[serde(deserialize_with = "required_ceiling")]
    pub max_players: Option<u32>,
    pub signup_per_minute: u32,
    pub commands_per_minute: u32,
}
fn required_ceiling<'de, D: Deserializer<'de>>(de: D) -> Result<Option<u32>, D::Error> {
    Option::deserialize(de)
}
impl Default for UniversePolicy {
    fn default() -> Self {
        Self {
            signup_enabled: true,
            max_players: None,
            signup_per_minute: 5,
            commands_per_minute: 60,
        }
    }
}
impl UniversePolicy {
    pub fn validate(&self, immutable: &UniverseImmutable) -> Result<(), String> {
        immutable.validate()?;
        let capacity = immutable.geometric_capacity();
        if self
            .max_players
            .is_some_and(|value| value == 0 || value > capacity)
        {
            return Err(format!(
                "policy.max_players must be null or an integer from 1 through {capacity}"
            ));
        }
        for (field, value) in [
            ("signup_per_minute", self.signup_per_minute),
            ("commands_per_minute", self.commands_per_minute),
        ] {
            if !(1..=10_000).contains(&value) {
                return Err(format!(
                    "policy.{field} must be an integer from 1 through 10000"
                ));
            }
        }
        Ok(())
    }
    /// Derived from a validated policy and immutable context; never persisted.
    pub fn effective_max_players(&self, immutable: &UniverseImmutable) -> u32 {
        self.max_players
            .unwrap_or_else(|| immutable.geometric_capacity())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UniverseImmutable {
    pub speed: i32,
    pub galaxies: u32,
    pub systems_per_galaxy: u32,
    pub positions_per_system: u32,
}
impl Default for UniverseImmutable {
    fn default() -> Self {
        Self {
            speed: 5,
            galaxies: 1,
            systems_per_galaxy: 100,
            positions_per_system: 15,
        }
    }
}
impl UniverseImmutable {
    pub fn validate(&self) -> Result<(), String> {
        if !(1..=100).contains(&self.speed) {
            return Err("immutable.speed must be an integer from 1 through 100".into());
        }
        if !(1..=100).contains(&self.galaxies) {
            return Err("immutable.galaxies must be an integer from 1 through 100".into());
        }
        if !(1..=1000).contains(&self.systems_per_galaxy) {
            return Err(
                "immutable.systems_per_galaxy must be an integer from 1 through 1000".into(),
            );
        }
        if self.positions_per_system != 15 {
            return Err("immutable.positions_per_system must be exactly 15".into());
        }
        Ok(())
    }
    /// Homeworld geometry for validated immutable settings, independent of policy.
    pub fn geometric_capacity(&self) -> u32 {
        self.galaxies * self.systems_per_galaxy * 9
    }
    pub fn profile(&self) -> Result<UniverseProfile, String> {
        self.validate()?;
        UniverseProfile::signup(self.galaxies, self.systems_per_galaxy)
            .map_err(|error| format!("immutable: {error}"))
    }
    pub fn from_rules(rules: &Ruleset) -> Result<Self, String> {
        rules
            .validate()
            .map_err(|error| format!("immutable: {error}"))?;
        let profile = rules
            .artifact
            .universe
            .as_ref()
            .ok_or_else(|| "immutable: rules have no universe profile".to_string())?;
        let immutable = Self {
            speed: rules.speed,
            galaxies: profile.galaxies,
            systems_per_galaxy: profile.systems_per_galaxy,
            positions_per_system: profile.positions_per_system,
        };
        immutable.validate()?;
        Ok(immutable)
    }
    pub fn validate_unchanged(&self, current: &Self) -> Result<(), String> {
        for (field, changed) in [
            ("speed", self.speed != current.speed),
            ("galaxies", self.galaxies != current.galaxies),
            (
                "systems_per_galaxy",
                self.systems_per_galaxy != current.systems_per_galaxy,
            ),
            (
                "positions_per_system",
                self.positions_per_system != current.positions_per_system,
            ),
        ] {
            if changed {
                return Err(format!(
                    "immutable.{field} cannot change after universe creation"
                ));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UniverseConfigDocument {
    pub version: u32,
    pub universe: UniverseId,
    pub base_revision: i64,
    pub immutable: UniverseImmutable,
    pub policy: UniversePolicy,
}
impl UniverseConfigDocument {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != UNIVERSE_CONFIG_VERSION {
            return Err("version must be 1".into());
        }
        validate_universe(self.universe)?;
        if self.base_revision < 0 {
            return Err(
                "base_revision must be an integer from 0 through 9223372036854775807".into(),
            );
        }
        self.policy.validate(&self.immutable)
    }
    pub fn validate_for(
        &self,
        universe: UniverseId,
        current: &UniverseImmutable,
    ) -> Result<(), String> {
        self.validate()?;
        if self.universe != universe {
            return Err("universe must match the selected universe".into());
        }
        self.immutable.validate_unchanged(current)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UniverseCreate {
    pub universe: UniverseId,
    pub immutable: UniverseImmutable,
    pub policy: UniversePolicy,
}
impl UniverseCreate {
    pub fn validate(&self) -> Result<(), String> {
        validate_universe(self.universe)?;
        self.policy.validate(&self.immutable)
    }
}
fn validate_universe(universe: UniverseId) -> Result<(), String> {
    if universe.0.is_nil() {
        Err("universe must be a non-nil UUID".into())
    } else {
        Ok(())
    }
}

/// Read-only policy difference using the same immutable and revision rules as apply.
pub fn config_diff(
    current: &UniverseConfigDocument,
    desired: &UniverseConfigDocument,
) -> Result<Value, String> {
    current.validate()?;
    desired.validate_for(current.universe, &current.immutable)?;
    if current.policy != desired.policy && current.base_revision != desired.base_revision {
        return Err(format!(
            "policy changed since export (expected revision {}, current {}); export again",
            desired.base_revision, current.base_revision
        ));
    }
    let before = serde_json::to_value(&current.policy).expect("policy serializes");
    let after = serde_json::to_value(&desired.policy).expect("policy serializes");
    let changes: Vec<_> = before.as_object().expect("policy object").iter()
        .filter(|(key, value)| after.get(key.as_str()) != Some(value))
        .map(|(key, value)| json!({"path": format!("policy.{key}"), "before": value, "after": after[key]}))
        .collect();
    Ok(json!({
        "changes": changes,
        "effective_max_players": {
            "before": current.policy.effective_max_players(&current.immutable),
            "after": desired.policy.effective_max_players(&desired.immutable)
        }
    }))
}

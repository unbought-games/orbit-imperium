//! First-run input: omitted settings are defaults only when creating a world.
use crate::{
    UniverseConfigDocument, UniverseCreate, UniverseId, UniverseImmutable, UniversePolicy,
    UniverseUpdate,
};

#[derive(Clone, Debug, Default)]
pub struct UniverseSetup {
    pub universe: Option<UniverseId>,
    pub name: Option<String>,
    pub speed: Option<i32>,
    pub galaxies: Option<u32>,
    pub systems_per_galaxy: Option<u32>,
    pub positions_per_system: Option<u32>,
    pub signup_enabled: Option<bool>,
    pub max_players: Option<u32>,
    pub signup_per_minute: Option<u32>,
    pub commands_per_minute: Option<u32>,
}

impl UniverseSetup {
    pub fn creation(&self, universe: UniverseId) -> UniverseCreate {
        let immutable = UniverseImmutable::default();
        let policy = UniversePolicy::default();
        UniverseCreate {
            universe,
            immutable: UniverseImmutable {
                speed: self.speed.unwrap_or(immutable.speed),
                galaxies: self.galaxies.unwrap_or(immutable.galaxies),
                systems_per_galaxy: self
                    .systems_per_galaxy
                    .unwrap_or(immutable.systems_per_galaxy),
                positions_per_system: self
                    .positions_per_system
                    .unwrap_or(immutable.positions_per_system),
            },
            policy: UniversePolicy {
                signup_enabled: self.signup_enabled.unwrap_or(policy.signup_enabled),
                max_players: self.max_players,
                signup_per_minute: self.signup_per_minute.unwrap_or(policy.signup_per_minute),
                commands_per_minute: self
                    .commands_per_minute
                    .unwrap_or(policy.commands_per_minute),
            },
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        let universe = self
            .universe
            .unwrap_or(UniverseId(uuid::Uuid::from_u128(1)));
        // Validate supplied values without applying default capacity to an existing world.
        let mut bounds = self.creation(universe);
        bounds.immutable.galaxies = self.galaxies.unwrap_or(100);
        bounds.immutable.systems_per_galaxy = self.systems_per_galaxy.unwrap_or(1000);
        bounds.validate()?;
        if let Some(name) = &self.name {
            UniverseUpdate {
                universe,
                name: name.clone(),
            }
            .validate()?;
        }
        Ok(())
    }

    /// A retry never changes saved settings, even after live policy/rules updates.
    pub fn check_existing(
        &self,
        current: &UniverseConfigDocument,
        name: &str,
    ) -> Result<(), String> {
        macro_rules! check {
            ($field:ident, $saved:expr) => {
                if self.$field.as_ref().is_some_and(|value| value != &$saved) {
                    return Err(format!("setup conflicts with saved {}; inspect with universe show and use the explicit update commands; no universe settings were changed", stringify!($field)));
                }
            };
        }
        check!(universe, current.universe);
        check!(name, name.to_string());
        check!(speed, current.immutable.speed);
        check!(galaxies, current.immutable.galaxies);
        check!(systems_per_galaxy, current.immutable.systems_per_galaxy);
        check!(positions_per_system, current.immutable.positions_per_system);
        check!(signup_enabled, current.policy.signup_enabled);
        if self.max_players.is_some() && self.max_players != current.policy.max_players {
            return Err("setup conflicts with saved max_players; use universe config export/diff/apply; no universe settings were changed".into());
        }
        check!(signup_per_minute, current.policy.signup_per_minute);
        check!(commands_per_minute, current.policy.commands_per_minute);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supplied_settings_match_saved_values_while_omissions_preserve_them() {
        let universe = UniverseId(uuid::Uuid::from_u128(1));
        let request = UniverseSetup {
            universe: Some(universe),
            name: Some("Friends".into()),
            speed: Some(3),
            galaxies: Some(2),
            systems_per_galaxy: Some(200),
            positions_per_system: Some(15),
            signup_enabled: Some(false),
            max_players: Some(1000),
            signup_per_minute: Some(7),
            commands_per_minute: Some(80),
        };
        request.validate().unwrap();
        let creation = request.creation(universe);
        let mut current = UniverseConfigDocument {
            version: crate::UNIVERSE_CONFIG_VERSION,
            universe,
            base_revision: 12,
            immutable: creation.immutable,
            policy: creation.policy,
        };
        request.check_existing(&current, "Friends").unwrap();
        current.immutable.systems_per_galaxy = 201;
        assert!(
            request
                .check_existing(&current, "Friends")
                .unwrap_err()
                .contains("systems_per_galaxy")
        );
        UniverseSetup::default()
            .check_existing(&current, "Renamed")
            .unwrap();
        let capacity_only = UniverseSetup {
            max_players: Some(1000),
            ..Default::default()
        };
        capacity_only.validate().unwrap();
        capacity_only.check_existing(&current, "Friends").unwrap();
        // An omitted map size must not constrain a retained world's valid ceiling,
        // but actual fresh creation still validates the default map capacity.
        assert!(capacity_only.creation(universe).validate().is_err());
    }
}

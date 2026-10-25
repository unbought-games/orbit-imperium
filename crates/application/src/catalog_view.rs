//! Catalog presentation derived from active rules at read time; never persisted.
use crate::ServiceError;
use orbit_engine::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogEntryView {
    #[serde(flatten)]
    pub entry: CatalogEntry,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ship_statistics: Option<ShipStatistics>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub technical_data: Option<crate::technical_data::TechnicalData>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipStatistics {
    pub propulsion: Option<ShipPropulsionStatistics>,
    pub combat: Option<ShipCombatStatistics>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipPropulsionStatistics {
    pub cargo_capacity: String,
    pub base_speed: String,
    pub fuel_consumption: String,
    pub drive: ResearchId,
    pub impulse_upgrade: Option<ShipImpulseStatistics>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipImpulseStatistics {
    pub minimum_level: u32,
    pub base_speed: String,
    pub fuel_consumption: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipCombatStatistics {
    /// Combat engine units: 100,000 ticks per displayed point.
    pub attack_ticks: String,
    pub shield_ticks: String,
    pub hull_ticks: String,
    pub rapid_fire_against: Vec<ShipRapidFireStatistics>,
    pub rapid_fire_from: Vec<ShipRapidFireStatistics>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipRapidFireStatistics {
    pub unit: ManufacturedItem,
    pub factor: String,
}
pub fn catalog_view(rules: &Ruleset) -> Result<Vec<CatalogEntryView>, ServiceError> {
    rules
        .artifact
        .catalog
        .iter()
        .map(|entry| {
            let ship_statistics = match entry.key {
                CatalogKey::Ship(ship) => {
                    let propulsion =
                        rules
                            .artifact
                            .ships
                            .get(&ship)
                            .map(|rule| ShipPropulsionStatistics {
                                cargo_capacity: rule.capacity.to_string(),
                                base_speed: rule.base_speed.to_string(),
                                fuel_consumption: rule.fuel.to_string(),
                                drive: rule.drive.unwrap_or(ResearchId::CombustionDrive),
                                impulse_upgrade: rule.impulse_drive.as_ref().map(|upgrade| {
                                    ShipImpulseStatistics {
                                        minimum_level: upgrade.minimum_level,
                                        base_speed: upgrade.base_speed.to_string(),
                                        fuel_consumption: upgrade.fuel.to_string(),
                                    }
                                }),
                            });
                    let combat = combat_statistics(rules, ManufacturedItem::Ship(ship))?;
                    Some(ShipStatistics { propulsion, combat })
                }
                _ => None,
            };
            Ok(CatalogEntryView {
                entry: entry.clone(),
                ship_statistics,
                technical_data: crate::technical_data::technical_data(rules, entry)?,
            })
        })
        .collect()
}

/// Shared base combat projection for ships and planetary defenses.
pub(crate) fn combat_statistics(
    rules: &Ruleset,
    item: ManufacturedItem,
) -> Result<Option<ShipCombatStatistics>, ServiceError> {
    let Some(combat) = rules.artifact.world.as_ref().map(|w| &w.combat) else {
        return Ok(None);
    };
    let Some(unit) = combat.units.iter().find(|unit| unit.item == item) else {
        return Ok(None);
    };
    let (attack, shield, hull) =
        combat_unit_stats(unit, [0; 3], combat).map_err(|_| ServiceError::InvariantFailure)?;
    let rapid_fire = |outgoing| {
        combat
            .rapid_fire
            .iter()
            .filter(|rf| {
                if outgoing {
                    rf.shooter == item
                } else {
                    rf.target == item
                }
            })
            .map(|rf| ShipRapidFireStatistics {
                unit: if outgoing { rf.target } else { rf.shooter },
                factor: rf.factor.to_string(),
            })
            .collect()
    };
    Ok(Some(ShipCombatStatistics {
        attack_ticks: attack.to_string(),
        shield_ticks: shield.to_string(),
        hull_ticks: hull.to_string(),
        rapid_fire_against: rapid_fire(true),
        rapid_fire_from: rapid_fire(false),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ship(rules: &Ruleset, ship: ShipType) -> ShipStatistics {
        catalog_view(rules)
            .unwrap()
            .into_iter()
            .find(|entry| entry.entry.key == CatalogKey::Ship(ship))
            .unwrap()
            .ship_statistics
            .unwrap()
    }
    #[test]
    fn large_cargo_presents_activated_stats_and_probe_rapid_fire() {
        let rules =
            Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-12.json")).unwrap();
        let stats = ship(&rules, ShipType::LargeCargo);
        let propulsion = stats.propulsion.unwrap();
        assert_eq!(propulsion.cargo_capacity, "25000");
        assert_eq!(propulsion.base_speed, "7500");
        assert_eq!(propulsion.fuel_consumption, "50");
        assert_eq!(propulsion.drive, ResearchId::CombustionDrive);
        assert!(propulsion.impulse_upgrade.is_none());
        let combat = stats.combat.unwrap();
        assert_eq!(combat.attack_ticks, "500000");
        assert_eq!(combat.shield_ticks, "2500000");
        assert_eq!(combat.hull_ticks, "120000000");
        assert_eq!(combat.rapid_fire_against.len(), 1);
        assert_eq!(
            combat.rapid_fire_against[0].unit,
            ManufacturedItem::Ship(ShipType::EspionageProbe)
        );
        assert_eq!(combat.rapid_fire_against[0].factor, "5");
    }

    #[test]
    fn presents_every_ship_without_mutating_rules() {
        let rules = Ruleset::signup(UniverseProfile::signup(1, 100).unwrap()).unwrap();
        let before = serde_json::to_value(&rules.artifact).unwrap();
        let json = serde_json::to_value(catalog_view(&rules).unwrap()).unwrap();
        let _: Vec<CatalogEntryView> = serde_json::from_value(json.clone()).unwrap();
        let mut historical = json;
        for entry in historical.as_array_mut().unwrap() {
            entry.as_object_mut().unwrap().remove("ship_statistics");
        }
        let legacy: Vec<CatalogEntryView> = serde_json::from_value(historical).unwrap();
        assert!(legacy.iter().all(|entry| entry.ship_statistics.is_none()));
        for entry in &rules.artifact.catalog {
            let CatalogKey::Ship(id) = entry.key else {
                continue;
            };
            let stats = ship(&rules, id);
            assert_eq!(
                stats.propulsion.is_some(),
                rules.artifact.ships.contains_key(&id)
            );
            assert_eq!(
                stats.combat.is_some(),
                rules
                    .artifact
                    .world
                    .as_ref()
                    .unwrap()
                    .combat
                    .units
                    .iter()
                    .any(|u| u.item == ManufacturedItem::Ship(id))
            );
        }
        let cargo = ship(&rules, ShipType::SmallCargo);
        assert_eq!(cargo.propulsion.unwrap().cargo_capacity, "5000");
        let combat = cargo.combat.unwrap();
        assert_eq!(
            (
                combat.attack_ticks.as_str(),
                combat.shield_ticks.as_str(),
                combat.hull_ticks.as_str()
            ),
            ("500000", "1000000", "40000000")
        );
        assert_eq!(
            ship(&rules, ShipType::EspionageProbe)
                .combat
                .unwrap()
                .attack_ticks,
            "1000"
        );
        assert!(combat.rapid_fire_against.iter().any(|rf| rf.unit
            == ManufacturedItem::Ship(ShipType::EspionageProbe)
            && rf.factor == "5"));
        let probe = ship(&rules, ShipType::EspionageProbe).combat.unwrap();
        assert!(
            probe
                .rapid_fire_from
                .iter()
                .any(|rf| rf.unit == ManufacturedItem::Ship(ShipType::SmallCargo)
                    && rf.factor == "5")
        );
        assert!(probe.rapid_fire_against.is_empty());
        assert_eq!(serde_json::to_value(&rules.artifact).unwrap(), before);
    }
    #[test]
    fn reflects_custom_rules_and_upgrade_profiles() {
        let mut rules = Ruleset::signup(UniverseProfile::signup(1, 100).unwrap()).unwrap();
        let rule = rules.artifact.ships.get_mut(&ShipType::SmallCargo).unwrap();
        rule.capacity = 7654;
        rule.base_speed = 4321;
        rule.fuel = 17;
        rule.impulse_drive = Some(ImpulseDriveRule {
            minimum_level: 8,
            base_speed: 9876,
            fuel: 33,
        });
        let combat = &mut rules.artifact.world.as_mut().unwrap().combat;
        combat.base_hull_fraction = [1, 5];
        let unit = combat
            .units
            .iter_mut()
            .find(|u| u.item == ManufacturedItem::Ship(ShipType::SmallCargo))
            .unwrap();
        unit.attack_hundredths = 1234;
        unit.shield_hundredths = 5678;
        let stats = ship(&rules, ShipType::SmallCargo);
        let propulsion = stats.propulsion.unwrap();
        assert_eq!(
            (
                propulsion.cargo_capacity.as_str(),
                propulsion.base_speed.as_str(),
                propulsion.fuel_consumption.as_str()
            ),
            ("7654", "4321", "17")
        );
        let upgrade = propulsion.impulse_upgrade.unwrap();
        assert_eq!(
            (
                upgrade.minimum_level,
                upgrade.base_speed.as_str(),
                upgrade.fuel_consumption.as_str()
            ),
            (8, "9876", "33")
        );
        let combat = stats.combat.unwrap();
        assert_eq!(
            (
                combat.attack_ticks.as_str(),
                combat.shield_ticks.as_str(),
                combat.hull_ticks.as_str()
            ),
            ("1234000", "5678000", "80000000")
        );
    }
    #[test]
    fn historical_rules_preserve_missing_data_and_legacy_drive() {
        let mut rules = Ruleset::mvp_fleets().unwrap();
        rules.artifact.world = None;
        let rule = rules.artifact.ships.get_mut(&ShipType::SmallCargo).unwrap();
        rule.drive = None;
        rule.impulse_drive = None;
        let stats = ship(&rules, ShipType::SmallCargo);
        assert!(stats.combat.is_none());
        assert_eq!(stats.propulsion.unwrap().drive, ResearchId::CombustionDrive);
        assert!(
            catalog_view(&rules)
                .unwrap()
                .iter()
                .filter(|e| !matches!(e.entry.key, CatalogKey::Ship(_)))
                .all(|e| e.ship_statistics.is_none())
        );
    }
}

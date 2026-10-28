//! Read-only explanations of supported engine semantics and active rule values.
//! No second balance catalog: numeric inputs come from the artifact or engine helpers.
use crate::{ServiceError, ShipCombatStatistics, catalog_view::combat_statistics};
use orbit_engine::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct TechnicalData {
    pub facts: Vec<TechnicalFact>,
    pub bonuses: Vec<TechnicalBonus>,
    pub combat: Option<ShipCombatStatistics>,
    /// Whole resource units by completed level; clients select, never extrapolate.
    pub storage_capacities: Option<Vec<String>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TechnicalFact {
    pub label: String,
    pub value: String,
    pub subject: Option<CatalogKey>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TechnicalBonus {
    pub label: String,
    pub fraction: [String; 2],
    pub subject: Option<CatalogKey>,
    pub condition: Option<String>,
}
impl TechnicalData {
    fn fact(&mut self, label: &str, value: impl Into<String>) {
        self.facts.push(TechnicalFact {
            label: label.into(),
            value: value.into(),
            subject: None,
        });
    }
    fn bonus(
        &mut self,
        label: &str,
        fraction: [i64; 2],
        subject: Option<CatalogKey>,
        condition: Option<String>,
    ) {
        self.bonuses.push(TechnicalBonus {
            label: label.into(),
            fraction: fraction.map(|n| n.to_string()),
            subject,
            condition,
        });
    }
}
fn ratio([n, d]: [i64; 2]) -> String {
    if d != 0 && n % d == 0 {
        (n / d).to_string()
    } else {
        format!("({n} / {d})")
    }
}
fn cost_scaling(data: &mut TechnicalData, rule: &BuildingRule, astrophysics: bool) {
    data.fact(
        "Cost scaling",
        format!(
            "Base cost × {}^(target level − 1), {}.",
            ratio(rule.growth),
            if astrophysics {
                "each resource rounded to the nearest 100"
            } else {
                "each resource rounded down to whole units"
            }
        ),
    );
}
pub(crate) fn technical_data(
    rules: &Ruleset,
    entry: &CatalogEntry,
) -> Result<Option<TechnicalData>, ServiceError> {
    if !entry.enabled {
        return Ok(None);
    }
    let mut data = TechnicalData::default();
    match entry.key {
        CatalogKey::Building(building) => {
            let Some(rule) = rules.artifact.buildings.get(&building) else {
                return Ok(None);
            };
            cost_scaling(&mut data, rule, false);
            building_data(&mut data, building, rules);
        }
        CatalogKey::Research(research) => {
            let Some(rule) = rules
                .artifact
                .progression
                .as_ref()
                .and_then(|p| p.research.get(&research))
            else {
                return Ok(None);
            };
            cost_scaling(&mut data, rule, research == ResearchId::Astrophysics);
            research_data(&mut data, research, rules);
        }
        CatalogKey::Defense(defense) => {
            data.combat = combat_statistics(rules, ManufacturedItem::Defense(defense))?;
            if let Some(world) = &rules.artifact.world {
                let [n, d] = world.combat.defense_recovery_probability;
                data.fact("Recovery after combat", format!("{n} / {d} chance for each destroyed defense to recover independently; not a guaranteed fraction of losses."));
            }
            if defense.is_shield_dome() {
                data.fact("Planet limit", "One completed or queued dome of this type per planet. Its shield protects itself, not other units.");
            }
        }
        CatalogKey::Ship(ShipType::SolarSatellite) => {
            let rule = solar_satellite_rule(rules).ok_or(ServiceError::InvariantFailure)?;
            data.fact("Energy per satellite", format!("floor((planet maximum temperature + {}) / {}). Total energy is multiplied by completed satellite count and the production setting; economy speed does not multiply energy.", rule.temperature_offset, rule.temperature_divisor));
            data.fact("Stationary ship", "Cannot fly or carry cargo. Uses no fuel or building fields. Defends the planet and can be destroyed; destroyed satellites do not recover.");
        }
        _ => return Ok(None),
    }
    Ok(Some(data))
}
fn building_data(data: &mut TechnicalData, building: Building, rules: &Ruleset) {
    let r = &rules.artifact;
    let growth = ratio(r.growth);
    if let Some(index) = Building::ALL.iter().position(|id| *id == building) {
        if index == 3 {
            data.fact("Energy at full output", format!("{} × level × {growth}^level. Production settings apply; universe speed does not multiply energy.", r.energy_supply));
        } else {
            let temperature = if index == 2 {
                format!(
                    " × ({} + {} × planet maximum temperature)",
                    ratio([r.temperature[0], r.temperature[2]]),
                    ratio([r.temperature[1], r.temperature[3]])
                )
            } else {
                String::new()
            };
            data.fact("Mine output per hour", format!("{} × level × {growth}^level × {}{temperature}. Before production settings and energy shortages; excludes planet base income.", r.production[index], rules.speed));
            data.fact(
                "Energy demand at full output",
                format!(
                    "{} × level × {growth}^level. Production settings apply.",
                    r.energy_demand[index]
                ),
            );
        }
    }
    match building {
        Building::MetalStorage | Building::CrystalStorage | Building::DeuteriumTank => {
            data.storage_capacities = r.progression.as_ref().map(|p| p.storage_capacities.iter().map(ToString::to_string).collect());
            data.fact("Storage", "Production stops for this resource at capacity. Incoming deliveries can exceed capacity.");
        }
        Building::RoboticsFactory if rules.progression() => data.fact("Construction time", "The raw construction duration is divided by (1 + Robotics Factory level). Upgrades use the universe’s construction formula and rounding; this is not a fixed percentage reduction per level."),
        Building::ResearchLab if rules.progression() => data.fact("Research time", "Research duration is divided by (1 + this planet’s Research Lab level), rounded down to whole seconds with a one-second minimum. Only this planet’s lab contributes."),
        Building::Shipyard if rules.progression() => data.fact("Manufacturing time", "Ship and defense duration per unit is divided by (1 + Shipyard level), rounded down to whole seconds with a one-second minimum."),
        _ => {}
    }
}
fn research_data(data: &mut TechnicalData, research: ResearchId, rules: &Ruleset) {
    use ResearchId::*;
    match research {
        WeaponsTechnology | ShieldingTechnology | ArmourTechnology => {
            if let Some(world) = &rules.artifact.world {
                data.bonuses.push(TechnicalBonus {
                    label: match research { WeaponsTechnology => "Attack", ShieldingTechnology => "Shield strength", _ => "Hull strength" }.into(),
                    fraction: world.combat.technology_bonus.map(|n| n.to_string()), subject: None, condition: Some("Applies to ships and defenses; bonuses add to the base value, not to the previous level.".into()),
                });
            } else { data.fact("Combat effects", "Combat statistics are unavailable from this universe’s rules."); }
        }
        CombustionDrive | ImpulseDrive | HyperspaceDrive => {
            for (&ship, rule) in &rules.artifact.ships {
                if !rules.artifact.catalog.iter().any(|e| e.enabled && e.key == CatalogKey::Ship(ship)) { continue; }
                let key = Some(CatalogKey::Ship(ship));
                if rule.drive.unwrap_or(CombustionDrive) == research {
                    data.bonus("Base speed", rule.drive_coefficient, key, rule.hyperspace_drive.as_ref().map(|u| format!("Replaced when Hyperspace Drive reaches level {}.", u.minimum_level)).or_else(|| rule.impulse_drive.as_ref().map(|u| format!("Replaced when Impulse Drive reaches level {}.", u.minimum_level))));
                }
                if research == HyperspaceDrive && let Some(upgrade) = &rule.hyperspace_drive {
                    data.bonus("Base speed", HYPERSPACE_UPGRADE_COEFFICIENT, key, Some(format!("From Hyperspace Drive level {}; replacement base speed {}. See the ship’s technical statistics for the full profile.", upgrade.minimum_level, upgrade.base_speed)));
                }
                if research == ImpulseDrive && let Some(upgrade) = &rule.impulse_drive {
                    data.bonus("Base speed", IMPULSE_UPGRADE_COEFFICIENT, key, Some(format!("From Impulse Drive level {}; replacement base speed {}. See the ship’s technical statistics for the full profile.", upgrade.minimum_level, upgrade.base_speed)));
                }
            }
            data.fact("Flight", "Bonuses add to base speed. Actual travel time and fuel depend on the slowest ship, route, universe speed and speed setting.");
        }
        ComputerTechnology => data.fact("Fleet slots", format!("{} base slot + {} per completed level. Outbound and returning missions occupy slots.", fleet_slot_limit(0), fleet_slot_limit(1) - fleet_slot_limit(0))),
        Astrophysics => {
            data.fact("Planet capacity", format!("{} homeworld + one colony at each odd completed level. Moons do not count; colony ships do not reserve a slot.", astrophysics_planet_capacity(0)));
            if rules.colonization() {
                let mut positions = std::collections::BTreeMap::<u32, Vec<String>>::new();
                for position in 1..=15 {
                    if let Some(level) = colony_position_required_astrophysics(position) {
                        positions.entry(level).or_default().push(position.to_string());
                    }
                }
                for (level, positions) in positions {
                    data.fact(&format!("Colonization at level {level}"), format!("Positions {}.", positions.join(", ")));
                }
            } else { data.fact("Colonization", "Colonization missions are unavailable in this universe."); }
        }
        EspionageTechnology => {
            data.fact("Report detail", "Disclosure score = arriving probes + sign(level difference) × level difference². The difference is your completed espionage level minus the target’s. Higher scores reveal more categories.");
            data.fact("Counterespionage", "Higher espionage relative to the target reduces detection risk. Risk also depends on arriving probes, defending ships and a random multiplier; no fixed success percentage is guaranteed.");
        }
        EnergyTechnology | LaserTechnology | IonTechnology | PlasmaTechnology | HyperspaceTechnology => data.fact("Effect", "Prerequisite research. No additional per-level production, combat, cargo or construction bonus is implemented in this universe."),
        _ => data.fact("Effects", "Additional technical effects are unavailable from this universe’s server."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn rules() -> Ruleset {
        Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-11.json")).unwrap()
    }
    fn data(rules: &Ruleset, key: CatalogKey) -> TechnicalData {
        technical_data(
            rules,
            rules
                .artifact
                .catalog
                .iter()
                .find(|e| e.key == key)
                .unwrap(),
        )
        .unwrap()
        .unwrap()
    }
    #[test]
    fn hyperspace_drive_bonus_and_impulse_replacement_condition_follow_active_rules() {
        let r = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap();
        let drive = data(&r, CatalogKey::Research(ResearchId::HyperspaceDrive));
        assert_eq!(drive.bonuses.len(), 3);
        let battleship = drive
            .bonuses
            .iter()
            .find(|b| b.subject == Some(CatalogKey::Ship(ShipType::Battleship)))
            .unwrap();
        assert_eq!(battleship.fraction, ["3", "10"]);
        assert!(battleship.condition.is_none());
        let battlecruiser = drive
            .bonuses
            .iter()
            .find(|b| b.subject == Some(CatalogKey::Ship(ShipType::Battlecruiser)))
            .unwrap();
        assert_eq!(battlecruiser.fraction, ["3", "10"]);
        assert!(battlecruiser.condition.is_none());
        let bomber = drive
            .bonuses
            .iter()
            .find(|b| b.subject == Some(CatalogKey::Ship(ShipType::Bomber)))
            .unwrap();
        assert_eq!(bomber.fraction, ["3", "10"]);
        assert!(
            bomber
                .condition
                .as_ref()
                .unwrap()
                .contains("level 8; replacement base speed 5000")
        );
        let impulse = data(&r, CatalogKey::Research(ResearchId::ImpulseDrive));
        let bomber = impulse
            .bonuses
            .iter()
            .find(|b| b.subject == Some(CatalogKey::Ship(ShipType::Bomber)))
            .unwrap();
        assert!(
            bomber
                .condition
                .as_ref()
                .unwrap()
                .contains("Hyperspace Drive reaches level 8")
        );
    }
    #[test]
    fn covers_enabled_buildings_research_and_defenses_without_mutation() {
        let r = rules();
        let before = serde_json::to_value(&r.artifact).unwrap();
        for entry in &r.artifact.catalog {
            let projected = technical_data(&r, entry).unwrap();
            if !entry.enabled || matches!(entry.key, CatalogKey::Ship(_) | CatalogKey::Missile(_)) {
                assert!(projected.is_none());
            } else {
                assert!(projected.is_some(), "{:?}", entry.key);
            }
        }
        assert_eq!(before, serde_json::to_value(&r.artifact).unwrap());
    }
    #[test]
    fn both_domes_explain_independent_limits_and_large_dome_uses_active_stats() {
        let r = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
        for defense in [DefenseId::SmallShieldDome, DefenseId::LargeShieldDome] {
            let projected = data(&r, CatalogKey::Defense(defense));
            assert!(
                projected
                    .facts
                    .iter()
                    .any(|fact| fact.label == "Planet limit"
                        && fact.value.contains("of this type")
                        && fact.value.contains("not other units"))
            );
            assert!(
                projected
                    .facts
                    .iter()
                    .any(|fact| fact.label == "Recovery after combat")
            );
        }
        let large = data(&r, CatalogKey::Defense(DefenseId::LargeShieldDome))
            .combat
            .unwrap();
        assert_eq!(large.attack_ticks, "100000");
        assert_eq!(large.shield_ticks, "1000000000");
        assert_eq!(large.hull_ticks, "1000000000");
        assert!(large.rapid_fire_against.is_empty());
        assert!(large.rapid_fire_from.is_empty());
    }
    #[test]
    fn heavy_laser_projects_base_stats_from_active_rules() {
        let r =
            Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-heavy-laser.json")).unwrap();
        let defense = data(&r, CatalogKey::Defense(DefenseId::HeavyLaser))
            .combat
            .unwrap();
        assert_eq!(defense.attack_ticks, "25000000");
        assert_eq!(defense.shield_ticks, "10000000");
        assert_eq!(defense.hull_ticks, "80000000");
        assert!(defense.rapid_fire_against.is_empty());
        assert!(defense.rapid_fire_from.is_empty());
    }
    #[test]
    fn custom_drive_and_combat_bonuses_match_engine_calculations() {
        let mut r = rules();
        let ship = r.artifact.ships.get_mut(&ShipType::SmallCargo).unwrap();
        ship.drive_coefficient = [3, 20];
        ship.impulse_drive.as_mut().unwrap().minimum_level = 8;
        ship.impulse_drive.as_mut().unwrap().base_speed = 12000;
        let research = ResearchLevels {
            owner: PlayerId::default(),
            levels: std::collections::BTreeMap::from([
                (ResearchId::CombustionDrive, 2),
                (ResearchId::ImpulseDrive, 0),
            ]),
            revision: 0,
        };
        assert_eq!(
            ship_propulsion(ship, &research).unwrap().0,
            ship.base_speed * 130 / 100
        );
        let combustion = data(&r, CatalogKey::Research(ResearchId::CombustionDrive));
        let bonus = combustion
            .bonuses
            .iter()
            .find(|b| b.subject == Some(CatalogKey::Ship(ShipType::SmallCargo)))
            .unwrap();
        assert_eq!(bonus.fraction, ["3", "20"]);
        assert!(bonus.condition.as_ref().unwrap().contains("level 8"));
        let impulse = data(&r, CatalogKey::Research(ResearchId::ImpulseDrive));
        let bonus = impulse
            .bonuses
            .iter()
            .find(|b| b.subject == Some(CatalogKey::Ship(ShipType::SmallCargo)))
            .unwrap();
        assert_eq!(
            bonus.fraction,
            IMPULSE_UPGRADE_COEFFICIENT.map(|n| n.to_string())
        );
        assert!(bonus.condition.as_ref().unwrap().contains("12000"));
        r.artifact.world.as_mut().unwrap().combat.technology_bonus = [1, 5];
        for tech in [
            ResearchId::WeaponsTechnology,
            ResearchId::ShieldingTechnology,
            ResearchId::ArmourTechnology,
        ] {
            assert_eq!(
                data(&r, CatalogKey::Research(tech)).bonuses[0].fraction,
                ["1", "5"]
            );
        }
        let defense = data(&r, CatalogKey::Defense(DefenseId::RocketLauncher))
            .combat
            .unwrap();
        let combat = &r.artifact.world.as_ref().unwrap().combat;
        let unit = combat
            .units
            .iter()
            .find(|u| u.item == ManufacturedItem::Defense(DefenseId::RocketLauncher))
            .unwrap();
        let (attack, shield, hull) = combat_unit_stats(unit, [0; 3], combat).unwrap();
        assert_eq!(
            [
                defense.attack_ticks,
                defense.shield_ticks,
                defense.hull_ticks
            ],
            [attack, shield, hull].map(|n| n.to_string())
        );
        let (effective, _, _) = combat_unit_stats(unit, [2, 0, 0], combat).unwrap();
        assert_eq!(effective, attack * 140 / 100);
    }
    #[test]
    fn building_values_follow_active_economy_and_storage_rules() {
        let mut r = rules();
        r.speed = 7;
        r.artifact.production[0] = 42;
        r.artifact.growth = [6, 5];
        r.artifact.energy_demand[0] = 19;
        r.artifact
            .buildings
            .get_mut(&Building::MetalMine)
            .unwrap()
            .growth = [7, 4];
        let mine = data(&r, CatalogKey::Building(Building::MetalMine));
        assert!(
            mine.facts
                .iter()
                .any(|f| f.value.contains("42 × level × (6 / 5)^level × 7"))
        );
        assert!(mine.facts.iter().any(|f| f.value.contains("19 × level")));
        assert!(
            mine.facts
                .iter()
                .any(|f| f.value.contains("(7 / 4)^(target level"))
        );
        r.artifact.progression.as_mut().unwrap().storage_capacities[2] = 54321;
        let capacities = data(&r, CatalogKey::Building(Building::MetalStorage))
            .storage_capacities
            .unwrap();
        assert_eq!(capacities[2], "54321");
        assert_eq!(storage_capacity(2, &r).unwrap(), 54321 * SCALE);
        assert_eq!(
            capacities.len(),
            r.artifact
                .progression
                .as_ref()
                .unwrap()
                .storage_capacities
                .len()
        );
    }
    #[test]
    fn missing_and_disabled_data_never_invents_effects() {
        let mut r = rules();
        r.artifact.world = None;
        let defense = data(&r, CatalogKey::Defense(DefenseId::RocketLauncher));
        assert!(defense.combat.is_none());
        assert!(
            !defense
                .facts
                .iter()
                .any(|f| f.label == "Recovery after combat")
        );
        let combat = data(&r, CatalogKey::Research(ResearchId::WeaponsTechnology));
        assert!(combat.bonuses.is_empty());
        for tech in [ResearchId::LaserTechnology, ResearchId::IonTechnology] {
            let projected = data(&r, CatalogKey::Research(tech));
            assert!(projected.bonuses.is_empty());
            assert!(
                projected
                    .facts
                    .iter()
                    .any(|f| f.value.contains("No additional per-level"))
            );
        }
        let entry = r
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Ship(ShipType::SmallCargo))
            .unwrap();
        entry.enabled = false;
        assert!(
            !data(&r, CatalogKey::Research(ResearchId::ImpulseDrive))
                .bonuses
                .iter()
                .any(|b| b.subject == Some(CatalogKey::Ship(ShipType::SmallCargo)))
        );
    }
    #[test]
    fn standard_plasma_projects_no_per_level_bonuses() {
        let r = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
        let projected = data(&r, CatalogKey::Research(ResearchId::PlasmaTechnology));
        assert!(projected.bonuses.is_empty());
        assert!(projected.combat.is_none());
        assert!(
            projected
                .facts
                .iter()
                .any(|f| f.value.contains("No additional per-level"))
        );
    }
    #[test]
    fn colony_thresholds_and_slot_capacity_match_supported_semantics() {
        let r = rules();
        let astro = data(&r, CatalogKey::Research(ResearchId::Astrophysics));
        for position in 1..=15 {
            let level = colony_position_required_astrophysics(position).unwrap();
            let fact = astro
                .facts
                .iter()
                .find(|f| f.label == format!("Colonization at level {level}"))
                .unwrap();
            assert!(
                fact.value
                    .trim_start_matches("Positions ")
                    .trim_end_matches('.')
                    .split(", ")
                    .any(|p| p == position.to_string())
            );
        }
        for level in 0..=16 {
            assert_eq!(astrophysics_planet_capacity(level), 1 + level.div_ceil(2));
        }
        let computer = data(&r, CatalogKey::Research(ResearchId::ComputerTechnology));
        assert!(
            computer
                .facts
                .iter()
                .any(|f| f.value.contains("1 base slot + 1 per completed level"))
        );
        assert_eq!(fleet_slot_limit(6), 7);
    }
}

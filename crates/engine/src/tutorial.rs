//! The first authored consumer of objectives and personal mission sites.
use crate::*;
use serde::{Deserialize, Serialize};
#[cfg(test)]
use std::collections::BTreeSet;

pub const TUTORIAL_PROGRAM: &str = "colony-opening-v1";
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TutorialPreference {
    pub beginner: bool,
}
fn reward(metal: i64, crystal: i64, deuterium: i64) -> Resources {
    Resources {
        metal: metal * SCALE,
        crystal: crystal * SCALE,
        deuterium: deuterium * SCALE,
    }
}
/// The released opening definition, pinned in each enrollment.
pub fn tutorial_program() -> ObjectiveProgram {
    serde_json::from_str(include_str!("tutorial-program.json"))
        .expect("validated authored tutorial program")
}

pub fn tutorial_chapters() -> [(&'static str, &'static str, &'static [&'static str]); 3] {
    [
        (
            "colony",
            "Establish the colony",
            &[
                "solar-1",
                "metal-1",
                "crystal-1",
                "metal-2",
                "solar-2",
                "production-settings",
                "crystal-2",
                "solar-3",
                "metal-3",
                "crystal-3",
                "metal-4",
                "solar-5",
                "deuterium-1",
                "deuterium-2",
                "crystal-4",
                "robotics-2",
                "deuterium-5",
                "crystal-6",
                "metal-7",
                "solar-9",
            ],
        ),
        (
            "fleet",
            "Build the first fleet",
            &["lab-2", "energy-1", "combustion-1", "shipyard-2", "fighter"],
        ),
        (
            "operations",
            "Operate and reinvest",
            &[
                "contact",
                "combustion-2",
                "cargo",
                "loaded",
                "haul",
                "reinvest",
            ],
        ),
    ]
}

/// Building guidance follows the same authored order as the checklist.
pub fn tutorial_build_plan() -> Vec<(Building, u32)> {
    tutorial_program()
        .objectives
        .into_iter()
        .filter_map(|d| match d.predicate {
            ObjectivePredicate::Building { building, minimum } => Some((building, minimum)),
            _ => None,
        })
        .collect()
}

/// Reviewing the controls is deliberate; players never have to degrade production
/// just to check a tutorial box. Building levels establish readiness, not credit.
pub fn can_review_production(s: &GameState, player: PlayerId) -> bool {
    let Some(run) = tutorial_run(s, player) else {
        return false;
    };
    if !run
        .program
        .objectives
        .iter()
        .any(|d| matches!(d.predicate, ObjectivePredicate::ProductionSettingsReview))
    {
        return false;
    }
    s.world
        .as_ref()
        .and_then(|w| w.homeworlds.get(&player))
        .and_then(|id| s.bodies.get(id))
        .is_some_and(|body| production_review_ready(&body.levels))
}

fn production_review_ready(levels: &std::collections::BTreeMap<Building, u32>) -> bool {
    levels.get(&Building::SolarPlant).copied().unwrap_or(0) >= 2
}

pub fn tutorial_site_key(
    u: UniverseId,
    epoch: Epoch,
    beneficiary: PlayerId,
    cargo: bool,
) -> SiteIssuanceKey {
    SiteIssuanceKey {
        universe: u,
        epoch,
        beneficiary,
        key: format!(
            "{TUTORIAL_PROGRAM}/{}",
            if cargo { "cargo" } else { "contact" }
        ),
    }
}
pub fn tutorial_site_definition(cargo: bool) -> SiteDefinition {
    SiteDefinition {
        schema_version: 1,
        id: if cargo {
            "opening-cargo"
        } else {
            "opening-contact"
        }
        .into(),
        version: 1,
        placement: SitePlacementPolicy::Orbital,
        access: SiteAccessPolicy::BeneficiaryOnly,
        admission: SiteAdmissionPolicy::OneActiveOperation,
        debris: SiteDebrisPolicy::RetainedSiteLocal,
        initial_stock: if cargo {
            reward(6000, 3000, 1000)
        } else {
            reward(40, 40, 20)
        },
        forces: vec![SiteForce {
            item: ManufacturedItem::Ship(ShipType::SolarSatellite),
            count: 1,
        }],
        combat_technology: [0; 3],
    }
}
pub fn tutorial_run(s: &GameState, player: PlayerId) -> Option<&ObjectiveRun> {
    s.world
        .as_ref()?
        .records
        .objective_runs
        .values()
        .find(|run| run.beneficiary == player && run.program.id == TUTORIAL_PROGRAM)
}
pub fn apply_tutorial_progress(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    c: &mut ChangeSet,
) -> Result<(), InvariantError> {
    let Some(old) = &s.world else {
        return Ok(());
    };
    // Preference changes are intentionally free of gameplay side effects.
    if matches!(
        i.payload,
        Input::Command(Command::World {
            action: WorldAction::SetTutorialPresentation { .. }
        })
    ) {
        return Ok(());
    }
    let Some(next) = &mut c.world else {
        return Ok(());
    };
    let changed = next.records.objective_runs.iter().any(|(id, run)| {
        old.records
            .objective_runs
            .get(id)
            .is_some_and(|before| before.receipts != run.receipts)
    });
    if !changed
        && !matches!(
            i.payload,
            Input::Command(Command::World {
                action: WorldAction::OpenTutorial
            })
        )
    {
        return Ok(());
    }
    let runs: Vec<_> = next
        .records
        .objective_runs
        .values()
        .filter(|run| run.program.id == TUTORIAL_PROGRAM)
        .cloned()
        .collect();
    for run in runs {
        let player = run.beneficiary;
        if matches!(i.actor, Actor::Player(actor) if actor != player) {
            continue;
        }
        let Some(_) = next.records.tutorial_preferences.get(&player) else {
            continue;
        };
        let complete = |id: &str| run.receipts.contains_key(id);
        for cargo in [false, true] {
            let key = tutorial_site_key(s.universe, s.epoch, player, cargo);
            let finished =
                complete(if cargo { "loaded" } else { "contact" }) || (cargo && complete("haul"));
            let needed = !finished
                && complete("fighter")
                && (!cargo || (complete("contact") && complete("cargo")));
            if let Some(site) = next.records.mission_sites.get_mut(&key.id()) {
                if finished && !site.retired() {
                    site.append(
                        i,
                        site.revision(),
                        SiteEventKind::Retired {
                            reason: "opening-lesson-accomplished".into(),
                        },
                    )
                    .map_err(|e| InvariantError(format!("tutorial retirement: {e:?}")))?;
                    c.affected_viewers.insert(player);
                }
            } else if needed
                && !old.machine_players.contains(&player)
                && old.site_fleets_enabled
                && next
                    .records
                    .policies
                    .get(&player)
                    .is_some_and(|p| p.lifecycle == PlayerLifecycle::Active)
                && !matches!(i.actor, Actor::Player(actor) if actor != player)
            {
                let home = old
                    .homeworlds
                    .get(&player)
                    .and_then(|id| s.bodies.get(id))
                    .ok_or_else(|| InvariantError("tutorial homeworld missing".into()))?;
                let id = issue_mission_site(
                    &mut next.records.mission_sites,
                    key,
                    tutorial_site_definition(cargo),
                    home.coordinates,
                    i,
                    r,
                    &old.secret,
                )
                .map_err(|e| InvariantError(format!("tutorial issuance: {e:?}")))?;
                next.records
                    .mission_sites
                    .get_mut(&id)
                    .unwrap()
                    .append(i, 0, SiteEventKind::Disclosed)
                    .map_err(|e| InvariantError(format!("tutorial disclosure: {e:?}")))?;
                c.affected_viewers.insert(player);
            }
        }
    }
    Ok(())
}

/// Exhaustive worst-case bound for the authored one-satellite encounters: no
/// explosions or rapid fire are needed, and no satellite shot reaches either
/// recommended ship's hull. This validates content instead of forcing a win.
pub fn tutorial_encounters_safe(r: &Ruleset) -> Result<bool, InvariantError> {
    let combat = &r
        .artifact
        .world
        .as_ref()
        .ok_or_else(|| InvariantError("tutorial combat missing".into()))?
        .combat;
    let stats = |ship| {
        combat
            .units
            .iter()
            .find(|u| u.item == ManufacturedItem::Ship(ship))
            .ok_or_else(|| InvariantError("tutorial ship missing".into()))
            .and_then(|unit| combat_unit_stats(unit, [0; 3], combat))
    };
    let (attack, shield, mut hull) = stats(ShipType::SolarSatellite)?;
    let max_hull = hull;
    for ship in [ShipType::LightFighter, ShipType::SmallCargo] {
        let (_, shield, hull) = stats(ship)?;
        if apply_combat_hit(attack, shield, shield, hull, hull, combat)?.hull_removed != 0
            || combat.rapid_fire.iter().any(|rf| {
                rf.shooter == ManufacturedItem::Ship(ShipType::SolarSatellite)
                    && rf.target == ManufacturedItem::Ship(ship)
                    && rf.factor > 1
            })
        {
            return Ok(false);
        }
    }
    let (attack, _, _) = stats(ShipType::LightFighter)?;
    for _ in 0..combat.max_rounds.min(6) {
        hull -= apply_combat_hit(attack, shield, shield, hull, max_hull, combat)?.hull_removed;
    }
    Ok(hull == 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn production_review_unlocks_at_solar_two_without_waiting_for_mine_upgrades() {
        let mut levels = std::collections::BTreeMap::new();
        assert!(!production_review_ready(&levels));
        levels.insert(Building::SolarPlant, 1);
        assert!(!production_review_ready(&levels));
        levels.insert(Building::SolarPlant, 2);
        assert!(production_review_ready(&levels));
        levels.insert(Building::SolarPlant, 4);
        assert!(production_review_ready(&levels));
    }
    #[test]
    fn authored_content_is_complete_and_safety_gate_rejects_dangerous_satellites() {
        for speed in [2, 3] {
            let r = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), speed).unwrap();
            tutorial_program().validate(&r).unwrap();
            assert!(tutorial_encounters_safe(&r).unwrap());
            let ids: BTreeSet<_> = tutorial_chapters()
                .into_iter()
                .flat_map(|(_, _, ids)| ids.iter().copied())
                .collect();
            assert_eq!(ids.len(), tutorial_program().objectives.len());
            assert!(
                tutorial_program()
                    .objectives
                    .iter()
                    .all(|d| ids.contains(d.id.as_str()))
            );
            let mut artifact = r.artifact.clone();
            artifact
                .world
                .as_mut()
                .unwrap()
                .combat
                .units
                .iter_mut()
                .find(|u| u.item == ManufacturedItem::Ship(ShipType::SolarSatellite))
                .unwrap()
                .attack_hundredths = 1_000_000;
            let dangerous = Ruleset::from_artifact(artifact, speed).unwrap();
            assert!(!tutorial_encounters_safe(&dangerous).unwrap());
        }
    }
}

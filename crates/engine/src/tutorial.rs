//! The first authored consumer of objectives and personal mission sites.
use crate::*;
use serde::{Deserialize, Serialize};
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
/// Stable objective identities, pinned with each enrollment. Rewards are staged
/// against actual completion and never depend on chapter display order.
pub fn tutorial_program() -> ObjectiveProgram {
    use Building::*;
    use ObjectivePredicate as P;
    let mut objectives = vec![];
    let mut add = |id: &str, explanation: &str, predicate, resources| {
        objectives.push(ObjectiveDefinition {
            id: id.into(),
            explanation: explanation.into(),
            predicate,
            reward: resources,
        })
    };
    for (id, building, minimum, amounts, explanation) in [
        (
            "metal-1",
            MetalMine,
            1,
            (200, 100, 0),
            "Your first mine begins paying for the colony. Build solar power and crystal production next.",
        ),
        (
            "crystal-1",
            CrystalMine,
            1,
            (200, 100, 0),
            "Crystal supports power, research and ships. Keep both mines growing.",
        ),
        (
            "solar-2",
            SolarPlant,
            2,
            (400, 200, 0),
            "Power feeds production. The energy balance shows when mines need more solar capacity.",
        ),
        (
            "metal-4",
            MetalMine,
            4,
            (800, 400, 0),
            "Higher production makes future investments easier. Add deuterium and more power.",
        ),
        (
            "crystal-3",
            CrystalMine,
            3,
            (800, 400, 100),
            "Crystal production is catching up. Continue investing in your mines.",
        ),
        (
            "deuterium-1",
            DeuteriumSynthesizer,
            1,
            (600, 300, 600),
            "Early fuel unlocks robotics. Build Robotics Factory level 2 to reduce every later construction wait.",
        ),
        (
            "solar-4",
            SolarPlant,
            4,
            (1600, 800, 0),
            "The growing power grid supports your next mine upgrades.",
        ),
        (
            "metal-6",
            MetalMine,
            6,
            (2000, 1000, 200),
            "Reinvest this milestone in the final opening mine levels.",
        ),
        (
            "solar-6",
            SolarPlant,
            6,
            (2500, 1200, 0),
            "Expand power alongside production before the final colony milestones.",
        ),
        (
            "deuterium-2",
            DeuteriumSynthesizer,
            2,
            (1200, 600, 200),
            "Deuterium fuels flights and research. Power demand grows with production.",
        ),
        (
            "metal-8",
            MetalMine,
            8,
            (1600, 800, 200),
            "Your metal economy can support useful infrastructure.",
        ),
        (
            "crystal-6",
            CrystalMine,
            6,
            (1200, 1200, 300),
            "A productive crystal mine supports the first fleet.",
        ),
        (
            "deuterium-4",
            DeuteriumSynthesizer,
            4,
            (1000, 800, 500),
            "Fuel production will sustain operations after these grants end.",
        ),
        (
            "solar-9",
            SolarPlant,
            9,
            (2000, 1000, 300),
            "Reliable power keeps the opening economy productive.",
        ),
        (
            "robotics-2",
            RoboticsFactory,
            2,
            (1000, 800, 300),
            "Robotics shortens ordinary construction and unlocks the shipyard.",
        ),
        (
            "lab-1",
            ResearchLab,
            1,
            (800, 1200, 800),
            "Research unlocks ships. Start Energy Technology, then Combustion Drive.",
        ),
        (
            "shipyard-1",
            Shipyard,
            1,
            (2000, 1000, 300),
            "The shipyard builds real ships. Manufacture a Light Fighter when its drive is ready.",
        ),
        (
            "shipyard-2",
            Shipyard,
            2,
            (1000, 1000, 200),
            "Small Cargo carries much more stockpile loot than a fighter.",
        ),
    ] {
        add(
            id,
            explanation,
            P::Building { building, minimum },
            reward(amounts.0, amounts.1, amounts.2),
        );
    }
    for (id, research, minimum, amounts, explanation) in [
        (
            "energy-1",
            ResearchId::EnergyTechnology,
            1,
            (600, 800, 500),
            "Energy Technology unlocks the combustion research chain.",
        ),
        (
            "combustion-1",
            ResearchId::CombustionDrive,
            1,
            (1200, 600, 300),
            "Your first drive unlocks a Light Fighter.",
        ),
        (
            "combustion-2",
            ResearchId::CombustionDrive,
            2,
            (1000, 1000, 300),
            "The improved drive unlocks Small Cargo and speeds new flights.",
        ),
    ] {
        add(
            id,
            explanation,
            P::Research { research, minimum },
            reward(amounts.0, amounts.1, amounts.2),
        );
    }
    add(
        "fighter",
        "Your own fighter is ready. Inspect the first orbital briefing and send an attack.",
        P::Manufacture {
            ship: ShipType::LightFighter,
            quantity: 1,
        },
        reward(1000, 500, 200),
    );
    add(
        "cargo",
        "Bring a fighter and Small Cargo to the second outpost. Cargo collects stockpile loot; debris needs a Recycler later.",
        P::Manufacture {
            ship: ShipType::SmallCargo,
            quantity: 1,
        },
        reward(0, 0, 100),
    );
    add(
        "contact",
        "Combat resolved. Read the report: ships, losses, stockpile loot and site-local debris are separate outcomes.",
        P::Attack,
        reward(500, 500, 100),
    );
    let ships = BTreeSet::from([ShipType::LightFighter, ShipType::SmallCargo]);
    add(
        "loaded",
        "A surviving fighter and cargo fleet loaded real raid loot. The opportunity closes; the loot remains aboard until return.",
        P::RaidLoaded {
            required_ships: ships.clone(),
        },
        Resources::default(),
    );
    add(
        "haul",
        "The raid returned with surviving ships and loot. The cargo has now reached its committed return destination.",
        P::RaidReturn {
            required_ships: ships,
        },
        reward(500, 250, 0),
    );
    add(
        "reinvest",
        "Complete another Metal Mine upgrade after your haul. Your production and ordinary operations now fund the next steps.",
        P::Reinvest {
            building: MetalMine,
            minimum: 9,
            after_return: "haul".into(),
        },
        Resources::default(),
    );
    ObjectiveProgram {
        id: TUTORIAL_PROGRAM.into(),
        version: 1,
        objectives,
    }
}
pub fn tutorial_chapters() -> [(&'static str, &'static str, &'static [&'static str]); 3] {
    [
        (
            "colony",
            "Establish the colony",
            &[
                "metal-1",
                "crystal-1",
                "solar-2",
                "metal-4",
                "crystal-3",
                "deuterium-1",
                "deuterium-2",
                "robotics-2",
                "solar-4",
                "metal-6",
                "solar-6",
                "metal-8",
                "crystal-6",
                "deuterium-4",
                "solar-9",
            ],
        ),
        (
            "fleet",
            "Build the first fleet",
            &["lab-1", "energy-1", "combustion-1", "shipyard-1", "fighter"],
        ),
        (
            "operations",
            "Operate and reinvest",
            &[
                "contact",
                "combustion-2",
                "shipyard-2",
                "cargo",
                "loaded",
                "haul",
                "reinvest",
            ],
        ),
    ]
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
        let Some(preference) = next.records.tutorial_preferences.get(&player) else {
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
                && preference.beginner
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

/// Economy-first guidance order. Research and manufacture are separate queues;
/// these targets never gate recognition of independent accomplishments.
pub fn tutorial_build_plan() -> Vec<(Building, u32)> {
    use Building::*;
    vec![
        (MetalMine, 1),
        (CrystalMine, 1),
        (SolarPlant, 2),
        (MetalMine, 4),
        (CrystalMine, 3),
        (DeuteriumSynthesizer, 2),
        (RoboticsFactory, 2),
        (ResearchLab, 1),
        (Shipyard, 1),
        (Shipyard, 2),
        (SolarPlant, 4),
        (MetalMine, 6),
        (CrystalMine, 4),
        (SolarPlant, 6),
        (DeuteriumSynthesizer, 3),
        (MetalMine, 8),
        (CrystalMine, 6),
        (SolarPlant, 9),
        (DeuteriumSynthesizer, 4),
    ]
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

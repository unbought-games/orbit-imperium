//! Authorized tutorial view, derived from ordinary facts and immutable receipts.
use crate::*;
use orbit_engine::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TutorialObjectiveView {
    pub id: String,
    pub explanation: String,
    pub completed: bool,
    pub minimum_level: Option<u32>,
    pub after_objective: Option<String>,
    pub reward: ResourceDto,
    pub inspection: Option<ProgressionInspection>,
    pub next_action: Option<TutorialNextAction>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TutorialNextAction {
    ReviewProductionSettings,
    Progression {
        request: QuoteRequest,
    },
    Attack {
        site: Option<SiteSelection>,
        ships: Vec<ShipType>,
    },
    AwaitReturn {
        fleets: Vec<FleetId>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TutorialChapterView {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub objectives: Vec<TutorialObjectiveView>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TutorialSiteView {
    pub site: MissionSiteView,
    pub title: String,
    pub briefing: String,
    pub recommended_ships: Vec<ShipType>,
    pub remaining_forces: Vec<TutorialForceView>,
    pub busy: bool,
    pub allowed_mission: Mission,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TutorialForceView {
    pub item: ManufacturedItem,
    pub count: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TutorialView {
    pub enrolled: bool,
    pub human: bool,
    pub program: String,
    pub version: u32,
    pub preference: Option<TutorialPreference>,
    pub beginner: bool,
    pub completed: bool,
    pub homeworld: Option<BodyId>,
    pub chapters: Vec<TutorialChapterView>,
    /// Objective IDs in authored priority order across independent queues.
    pub recommended_objectives: Vec<String>,
    pub receipts: Vec<MilestoneReceiptView>,
    /// Includes retired disclosed sites, for fleet/report labels. Retired entries
    /// are historical context only; ordinary resolve/quote reject new launches.
    pub sites: Vec<TutorialSiteView>,
}
pub fn tutorial_view(
    s: &GameState,
    r: &Ruleset,
    player: PlayerId,
    at: i64,
) -> Result<TutorialView, ServiceError> {
    let w = world_facts(s).map_err(|_| ServiceError::InvariantFailure)?;
    if !w.covered_players.contains(&player) {
        return Err(ServiceError::NotFound);
    }
    let run = tutorial_run(s, player);
    let preference = w.records.tutorial_preferences.get(&player).cloned();
    let homeworld = w.homeworlds.get(&player).copied();
    let mut chapters = vec![];
    if let (Some(run), Some(home)) = (run, homeworld) {
        for (id, title, ids) in tutorial_chapters() {
            let mut objectives = vec![];
            for id in ids {
                let definition = run.program.objectives.iter().find(|d| d.id == *id);
                let definition = definition.ok_or(ServiceError::InvariantFailure)?;
                let completed = run.receipts.contains_key(*id);
                let request = if completed {
                    None
                } else {
                    match definition.predicate {
                        ObjectivePredicate::Building { building, .. }
                        | ObjectivePredicate::Reinvest { building, .. } => {
                            Some(QuoteRequest::Upgrade {
                                body: home,
                                building,
                            })
                        }
                        ObjectivePredicate::Research { research, .. } => {
                            Some(QuoteRequest::Research {
                                host: home,
                                research,
                            })
                        }
                        ObjectivePredicate::Manufacture { ship, quantity } => {
                            Some(QuoteRequest::Manufacture {
                                body: home,
                                item: ManufacturedItem::Ship(ship),
                                quantity,
                            })
                        }
                        _ => None,
                    }
                };
                let inspection = request
                    .clone()
                    .map(|q| inspect_progression(s, Actor::Player(player), &q, at, r))
                    .transpose()
                    .map_err(|_| ServiceError::InvariantFailure)?;
                let next_action = if completed {
                    None
                } else if let Some(request) = request {
                    Some(TutorialNextAction::Progression { request })
                } else if matches!(
                    definition.predicate,
                    ObjectivePredicate::ProductionSettingsReview
                ) {
                    Some(TutorialNextAction::ReviewProductionSettings)
                } else if *id == "haul" {
                    Some(TutorialNextAction::AwaitReturn {
                        fleets: w
                            .records
                            .fleets
                            .values()
                            .filter(|f| {
                                f.owner == player
                                    && f.active()
                                    && f.raid.as_ref().is_some_and(|raid| {
                                        raid.loot.values().iter().any(|n| *n > 0)
                                    })
                            })
                            .map(|f| f.id)
                            .collect(),
                    })
                } else {
                    let cargo = *id == "loaded";
                    let key = tutorial_site_key(s.universe, s.epoch, player, cargo);
                    let site = w
                        .records
                        .mission_sites
                        .get(&key.id())
                        .filter(|site| site.disclosed() && !site.retired())
                        .map(|site| SiteSelection {
                            id: site.id(),
                            expected_revision: site.revision(),
                        });
                    Some(TutorialNextAction::Attack {
                        site,
                        ships: if cargo {
                            vec![ShipType::LightFighter, ShipType::SmallCargo]
                        } else {
                            vec![ShipType::LightFighter]
                        },
                    })
                };
                objectives.push(TutorialObjectiveView {
                    id: id.to_string(),
                    explanation: definition.explanation.clone(),
                    completed,
                    minimum_level: match definition.predicate {
                        ObjectivePredicate::Building { minimum, .. }
                        | ObjectivePredicate::Research { minimum, .. }
                        | ObjectivePredicate::Reinvest { minimum, .. } => Some(minimum),
                        _ => None,
                    },
                    after_objective: match &definition.predicate {
                        ObjectivePredicate::Reinvest { after_return, .. } => {
                            Some(after_return.clone())
                        }
                        _ => None,
                    },
                    reward: definition.reward.into(),
                    inspection,
                    next_action,
                });
            }
            chapters.push(TutorialChapterView {
                id: id.into(),
                title: title.into(),
                completed: objectives.iter().all(|o| o.completed),
                objectives,
            });
        }
    }
    let mut recommended_objectives = vec![];
    if let (Some(run), Some(home)) = (run, homeworld) {
        let body = &s.bodies[&home];
        if can_review_production(s, player) && !run.receipts.contains_key("production-settings") {
            recommended_objectives.push("production-settings".into());
        }
        let goal = tutorial_build_plan()
            .into_iter()
            .find(|(building, minimum)| body.levels.get(building).copied().unwrap_or(0) < *minimum);
        if let Some((building, target)) = goal
            && let Some(definition) = run.program.objectives.iter().filter(|d| matches!(d.predicate, ObjectivePredicate::Building { building: b, minimum } if b == building && minimum >= target)).min_by_key(|d| match d.predicate {ObjectivePredicate::Building { minimum, .. }=>minimum,_=>0}) {
            recommended_objectives.push(definition.id.clone());
        }
        for id in [
            "energy-1",
            "combustion-1",
            "combustion-2",
            "fighter",
            "cargo",
            "contact",
            "loaded",
            "haul",
            "reinvest",
        ] {
            if !run.receipts.contains_key(id) {
                recommended_objectives.push(id.into());
            }
        }
        // New completions at existing high levels still need an ordinary new
        // upgrade. Do not infer historical accomplishment from current inventory.
        for definition in &run.program.objectives {
            if !run.receipts.contains_key(&definition.id)
                && !recommended_objectives.contains(&definition.id)
            {
                recommended_objectives.push(definition.id.clone());
            }
        }
    }
    let completed = run.is_some() && chapters.iter().all(|c| c.completed);
    let mut receipts = run
        .map(|run| {
            run.receipts
                .values()
                .cloned()
                .map(MilestoneReceiptView::from)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    receipts.sort_by_key(|receipt| receipt.granted_at);
    let sites = w.records.mission_sites.values().filter(|site| site.creation.issuance.beneficiary == player && site.disclosed() && site.creation.issuance.key.starts_with(TUTORIAL_PROGRAM)).map(|site| {
        let cargo = site.creation.definition.id == "opening-cargo";
        Ok(TutorialSiteView { site: site.view(s.universe,s.epoch,player).map(MissionSiteView::from).map_err(crate::mission_sites::site_error)?,
            title: if cargo { "Magpie Depot" } else { "Tin Can Outpost" }.into(),
            briefing: "A finite introductory opportunity at ordinary orbital distance. One solar satellite, no combat technology. Send an Attack with your own ships. Stockpile loot uses ordinary half-plunder and cargo capacity; it arrives only when survivors return. Debris stays at this site and cannot be collected. Actual losses and depleted stock are never restored.".into(),
            remaining_forces: site.remaining_forces().iter().map(|f|TutorialForceView { item:f.item, count:f.count.to_string() }).collect(),
            busy: !site.active_references().is_empty(), allowed_mission: Mission::Attack,
            recommended_ships: if cargo { vec![ShipType::LightFighter,ShipType::SmallCargo] } else { vec![ShipType::LightFighter] },
        })
    }).collect::<Result<_,ServiceError>>()?;
    Ok(TutorialView {
        enrolled: run.is_some(),
        human: !w.machine_players.contains(&player),
        program: TUTORIAL_PROGRAM.into(),
        version: run.map_or(1, |run| run.program.version),
        beginner: beginner_presentation(
            preference.as_ref(),
            !w.machine_players.contains(&player),
            completed,
            run.into_iter()
                .flat_map(|run| run.receipts.keys().map(String::as_str)),
        ),
        preference,
        completed,
        homeworld,
        chapters,
        recommended_objectives,
        receipts,
        sites,
    })
}

/// Returning the raid loot graduates presentation, not the remaining objectives.
fn beginner_presentation<'a>(
    preference: Option<&TutorialPreference>,
    human: bool,
    briefing_completed: bool,
    mut accomplishments: impl Iterator<Item = &'a str>,
) -> bool {
    human
        && preference.is_some_and(|p| p.beginner)
        && !briefing_completed
        && !accomplishments.any(|id| id == "haul")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returning_raid_loot_unlocks_full_presentation_with_unfinished_directives() {
        let preference = TutorialPreference { beginner: true };
        assert!(beginner_presentation(
            Some(&preference),
            true,
            false,
            ["contact", "loaded"].into_iter()
        ));
        assert!(!beginner_presentation(
            Some(&preference),
            true,
            false,
            ["contact", "loaded", "haul"].into_iter()
        ));
        // Re-reading an older saved run with the same receipt needs no preference write.
        assert!(preference.beginner);
        assert!(!beginner_presentation(
            Some(&preference),
            true,
            false,
            ["haul"].into_iter()
        ));
    }

    #[test]
    fn manual_full_mode_and_completed_or_machine_players_stay_full() {
        let beginner = TutorialPreference { beginner: true };
        let full = TutorialPreference { beginner: false };
        assert!(!beginner_presentation(
            Some(&full),
            true,
            false,
            [].into_iter()
        ));
        assert!(!beginner_presentation(
            Some(&beginner),
            true,
            true,
            [].into_iter()
        ));
        assert!(!beginner_presentation(
            Some(&beginner),
            false,
            false,
            [].into_iter()
        ));
        assert!(!beginner_presentation(None, true, false, [].into_iter()));
    }
}

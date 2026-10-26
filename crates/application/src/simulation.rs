//! Hypothetical combat uses submitted inputs only, with the active universe rules.
//! No target lookup, game admission, persisted state or production random stream.
use crate::*;
use orbit_engine::{
    BattleInput, BattleOrigin, BattleParticipant, BattleSide, CombatRules, ManufacturedItem,
    RandomStream, Resources, Ruleset, ShipStack, ShipType, payload_capacity, raid_loot,
    resolve_battle,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const SIMULATION_UNIT_LIMIT: u32 = 2000;
pub const SIMULATION_SAMPLES: usize = 10;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SimulationUnit {
    pub item: ManufacturedItem,
    pub count: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SimulationSide {
    pub technology: [u32; 3],
    pub units: Vec<SimulationUnit>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SimulationInputs {
    pub attacker: SimulationSide,
    pub defender: SimulationSide,
    /// Report-observed micro-resources only; absent means unknown, never zero.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_resources: Option<ResourceDto>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SimulationQuery {
    pub context: QueryContext,
    pub inputs: SimulationInputs,
}
#[derive(Debug, Serialize)]
pub struct SimulationSample {
    pub outcome: orbit_engine::BattleOutcome,
    pub rounds: usize,
    pub attacker: Vec<SimulationUnit>,
    pub defender: Vec<SimulationUnit>,
    pub surviving_cargo_capacity: String,
    pub estimated_loot: Option<ResourceDto>,
}
#[derive(Debug, Serialize)]
pub struct SimulationResponse {
    pub binding: Binding,
    pub request_id: uuid::Uuid,
    pub profile_hash: Hash,
    pub samples: Vec<SimulationSample>,
    pub loot_rules_enabled: bool,
}
pub struct SimulationJob {
    context: QueryContext,
    rules: Ruleset,
    inputs: SimulationInputs,
}
impl<S: GameStore> GameService<S> {
    pub async fn prepare_simulation(
        &self,
        p: Principal,
        q: SimulationQuery,
    ) -> Result<SimulationJob, ServiceError> {
        Self::principal(p, q.context.binding)?;
        let facts = self.store.bound_view(q.context.binding).await?;
        let rules = facts.rules.clone();
        let world = rules
            .artifact
            .world
            .as_ref()
            .ok_or(ServiceError::UnsupportedProtocol)?;
        validate_simulation(&q.inputs, &world.combat)?;
        observed_resources(&q.inputs)?;
        Ok(SimulationJob {
            context: q.context,
            rules,
            inputs: q.inputs,
        })
    }
}
fn validate_simulation(inputs: &SimulationInputs, rules: &CombatRules) -> Result<(), ServiceError> {
    let mut total = 0u32;
    for (side, attacker) in [(&inputs.attacker, true), (&inputs.defender, false)] {
        if side.technology.iter().any(|n| *n > 100) || side.units.len() > rules.units.len() {
            return Err(ServiceError::Malformed);
        }
        let mut seen = BTreeSet::new();
        for unit in &side.units {
            if unit.count == 0
                || !seen.insert(unit.item)
                || !rules.units.iter().any(|r| r.item == unit.item)
                || (attacker
                    && (!matches!(unit.item, ManufacturedItem::Ship(_))
                        || unit.item == ManufacturedItem::Ship(ShipType::SolarSatellite)))
            {
                return Err(ServiceError::Malformed);
            }
            total = total
                .checked_add(unit.count)
                .ok_or(ServiceError::Malformed)?;
        }
    }
    if total > SIMULATION_UNIT_LIMIT || inputs.attacker.units.is_empty() {
        return Err(ServiceError::Malformed);
    }
    Ok(())
}
fn observed_resources(inputs: &SimulationInputs) -> Result<Option<Resources>, ServiceError> {
    inputs
        .observed_resources
        .as_ref()
        .map(|stock| {
            Ok(Resources {
                metal: crate::dto::quantity(&stock.metal)?,
                crystal: crate::dto::quantity(&stock.crystal)?,
                deuterium: crate::dto::quantity(&stock.deuterium)?,
            })
        })
        .transpose()
}

/// Same capacity and whole-unit five-pass loot policy as attack settlement.
/// The hypothetical fleet arrives empty; launch fuel is paid separately.
fn planning_sample(
    attacker: &[SimulationUnit],
    outcome: orbit_engine::BattleOutcome,
    stock: Option<Resources>,
    rules: &Ruleset,
) -> Result<(String, Option<ResourceDto>), ServiceError> {
    let ships: Vec<_> = attacker
        .iter()
        .filter_map(|unit| {
            if let ManufacturedItem::Ship(ship_type) = unit.item {
                Some(ShipStack {
                    owner: PlayerId(uuid::Uuid::nil()),
                    ship_type,
                    count: i64::from(unit.count),
                })
            } else {
                None
            }
        })
        .collect();
    let capacity = payload_capacity(&ships, rules).map_err(|_| ServiceError::InvariantFailure)?;
    let loot = if rules
        .artifact
        .world
        .as_ref()
        .is_some_and(|w| w.raiding.is_some())
    {
        stock
            .map(|stock| {
                if outcome == orbit_engine::BattleOutcome::AttackerVictory {
                    raid_loot(stock, capacity)
                        .map(ResourceDto::from)
                        .map_err(|_| ServiceError::InvariantFailure)
                } else {
                    Ok(Resources::default().into())
                }
            })
            .transpose()?
    } else {
        None
    };
    Ok((capacity.to_string(), loot))
}

impl SimulationJob {
    /// Seed is freshly generated by the transport, never the universe secret.
    pub fn run(self, seed: [u8; 32]) -> Result<SimulationResponse, ServiceError> {
        let stock = observed_resources(&self.inputs)?;
        let world = self
            .rules
            .artifact
            .world
            .as_ref()
            .ok_or(ServiceError::UnsupportedProtocol)?;
        let input = BattleInput {
            encounter_id: InputId(self.context.request_id),
            at: 0,
            target: BodyId(uuid::Uuid::from_u128(2)),
            rules_hash: self.rules.hash.clone(),
            participants: [
                (&self.inputs.attacker, BattleSide::Attacker, 1),
                (&self.inputs.defender, BattleSide::Defender, 2),
            ]
            .into_iter()
            .map(|(side, battle_side, id)| BattleParticipant {
                owner: PlayerId(uuid::Uuid::from_u128(id)),
                origin: BattleOrigin::Stationed(BodyId(uuid::Uuid::from_u128(id))),
                side: battle_side,
                technology: side.technology,
                units: side
                    .units
                    .iter()
                    .map(|u| (u.item, i64::from(u.count)))
                    .collect(),
            })
            .collect(),
        };
        let mut rng = RandomStream::new(
            &seed,
            self.context.binding.universe,
            self.context.binding.epoch,
            input.encounter_id,
            "battle",
        )
        .map_err(|_| ServiceError::InvariantFailure)?;
        let mut samples = Vec::with_capacity(SIMULATION_SAMPLES);
        for _ in 0..SIMULATION_SAMPLES {
            let result = resolve_battle(&input, &world.combat, &mut rng)
                .map_err(|_| ServiceError::InvariantFailure)?;
            let survivors = |side| -> Vec<SimulationUnit> {
                result
                    .survivors
                    .iter()
                    .filter(|p| p.side == side)
                    .flat_map(|p| &p.units)
                    .map(|(item, count)| SimulationUnit {
                        item: *item,
                        count: *count as u32,
                    })
                    .collect()
            };
            let attacker = survivors(BattleSide::Attacker);
            let (surviving_cargo_capacity, estimated_loot) =
                planning_sample(&attacker, result.outcome.clone(), stock, &self.rules)?;
            samples.push(SimulationSample {
                attacker,
                surviving_cargo_capacity,
                estimated_loot,
                defender: survivors(BattleSide::Defender),
                outcome: result.outcome,
                rounds: result.rounds.len(),
            });
        }
        Ok(SimulationResponse {
            binding: self.context.binding,
            request_id: self.context.request_id,
            profile_hash: self.rules.hash,
            samples,
            loot_rules_enabled: world.raiding.is_some(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_engine::{DefenseId, ShipType};
    fn inputs() -> SimulationInputs {
        SimulationInputs {
            observed_resources: None,
            attacker: SimulationSide {
                technology: [0; 3],
                units: vec![SimulationUnit {
                    item: ManufacturedItem::Ship(ShipType::LightFighter),
                    count: 5,
                }],
            },
            defender: SimulationSide {
                technology: [0; 3],
                units: vec![],
            },
        }
    }
    #[test]
    fn validates_bounded_inputs_without_turning_unknown_into_zero() {
        let rules = CombatRules::selected();
        assert!(validate_simulation(&inputs(), &rules).is_ok());
        let mut q = inputs();
        q.attacker.units[0].count = 2001;
        assert!(validate_simulation(&q, &rules).is_err());
        q.attacker.units[0].count = 0;
        assert!(validate_simulation(&q, &rules).is_err());
        q = inputs();
        q.attacker.technology[0] = 101;
        assert!(validate_simulation(&q, &rules).is_err());
        q = inputs();
        q.attacker.units.push(q.attacker.units[0].clone());
        assert!(validate_simulation(&q, &rules).is_err());
        q = inputs();
        q.attacker.units[0].item = ManufacturedItem::Defense(DefenseId::RocketLauncher);
        assert!(validate_simulation(&q, &rules).is_err());
        assert!(serde_json::from_value::<SimulationInputs>(serde_json::json!({"attacker": {"technology": [null,0,0], "units": []}, "defender": {"technology": [0,0,0], "units": []}})).is_err());
    }
    #[test]
    fn satellites_are_valid_defenders_but_malformed_attackers() {
        let rules = orbit_engine::Ruleset::from_json(include_bytes!(
            "../../../rules/mvp-v1-solar-satellite.json"
        ))
        .unwrap()
        .artifact
        .world
        .unwrap()
        .combat;
        let mut q = inputs();
        q.defender.units.push(SimulationUnit {
            item: ManufacturedItem::Ship(ShipType::SolarSatellite),
            count: 3,
        });
        assert!(validate_simulation(&q, &rules).is_ok());
        q.attacker.units.push(q.defender.units[0].clone());
        assert!(matches!(
            validate_simulation(&q, &rules),
            Err(ServiceError::Malformed)
        ));
    }
    #[test]
    fn uses_supplied_universe_combat_stats_for_occupied_targets() {
        let id = uuid::Uuid::from_u128(10);
        let mut inputs = inputs();
        inputs.defender.units = vec![SimulationUnit {
            item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
            count: 1,
        }];
        let mut rules = Ruleset::mvp_raids().unwrap();
        // A supported custom artifact with no damaging shots must draw, regardless
        // of random targets. Hardcoding the standard unit stats would fail this.
        for unit in &mut rules.artifact.world.as_mut().unwrap().combat.units {
            unit.attack_hundredths = 0;
        }
        rules.hash = Hash("custom".into());
        let job = SimulationJob {
            context: QueryContext {
                binding: Binding {
                    account: AccountId(id),
                    player: PlayerId(id),
                    universe: UniverseId(id),
                    epoch: Epoch(id),
                },
                request_id: id,
            },
            rules,
            inputs,
        };
        let result = job.run([9; 32]).unwrap();
        assert_eq!(result.profile_hash, Hash("custom".into()));
        for sample in result.samples {
            assert_eq!(sample.outcome, orbit_engine::BattleOutcome::Draw);
            assert_eq!(sample.rounds, 6);
            assert_eq!(sample.attacker[0].count, 5);
            assert_eq!(sample.defender[0].count, 1);
        }
    }

    #[test]
    fn runs_actual_engine_with_empty_defender_and_independent_randomness() {
        let id = uuid::Uuid::from_u128(10);
        let job = SimulationJob {
            context: QueryContext {
                binding: Binding {
                    account: AccountId(id),
                    player: PlayerId(id),
                    universe: UniverseId(id),
                    epoch: Epoch(id),
                },
                request_id: id,
            },
            rules: Ruleset::mvp_raids().unwrap(),
            inputs: SimulationInputs {
                observed_resources: Some(Resources::all(1_000_000_000).into()),
                ..inputs()
            },
        };
        let result = job.run([7; 32]).unwrap();
        assert!(result.loot_rules_enabled);
        assert_eq!(result.samples.len(), SIMULATION_SAMPLES);
        for sample in result.samples {
            assert_eq!(sample.outcome, orbit_engine::BattleOutcome::AttackerVictory);
            assert_eq!(sample.rounds, 0);
            assert_eq!(sample.attacker[0].count, 5);
            assert!(sample.defender.is_empty());
            assert_eq!(sample.surviving_cargo_capacity, "250000000");
            let loot = sample.estimated_loot.unwrap();
            assert_eq!(
                [
                    loot.metal.as_str(),
                    loot.crystal.as_str(),
                    loot.deuterium.as_str()
                ],
                ["83000000", "83000000", "84000000"]
            );
        }
    }
    #[test]
    fn planning_uses_custom_cargo_and_exact_five_pass_whole_unit_loot() {
        let mut rules = Ruleset::mvp_raids().unwrap();
        rules
            .artifact
            .ships
            .get_mut(&ShipType::LightFighter)
            .unwrap()
            .capacity = 7;
        let stock = Resources {
            metal: 31_999_999,
            crystal: 9_999_999,
            deuterium: 2_999_999,
        };
        let (capacity, loot) = planning_sample(
            &inputs().attacker.units,
            orbit_engine::BattleOutcome::AttackerVictory,
            Some(stock),
            &rules,
        )
        .unwrap();
        assert_eq!(capacity, "35000000");
        let loot = loot.unwrap();
        assert_eq!(
            [
                loot.metal.as_str(),
                loot.crystal.as_str(),
                loot.deuterium.as_str()
            ],
            ["15000000", "4000000", "1000000"]
        );
        let survivors = vec![SimulationUnit {
            item: ManufacturedItem::Ship(ShipType::LightFighter),
            count: 1,
        }];
        let (capacity, loot) = planning_sample(
            &survivors,
            orbit_engine::BattleOutcome::AttackerVictory,
            Some(stock),
            &rules,
        )
        .unwrap();
        assert_eq!(capacity, "7000000");
        let loot = loot.unwrap();
        assert_eq!(
            [
                loot.metal.as_str(),
                loot.crystal.as_str(),
                loot.deuterium.as_str()
            ],
            ["3000000", "3000000", "1000000"]
        );
    }

    #[test]
    fn non_wins_and_zero_capacity_never_loot() {
        use orbit_engine::BattleOutcome::*;
        let mut rules = Ruleset::mvp_raids().unwrap();
        for outcome in [DefenderVictory, Draw, MutualDestruction] {
            let (_, loot) = planning_sample(
                &inputs().attacker.units,
                outcome,
                Some(Resources::all(i64::MAX)),
                &rules,
            )
            .unwrap();
            let loot = loot.unwrap();
            assert_eq!(
                [
                    loot.metal.as_str(),
                    loot.crystal.as_str(),
                    loot.deuterium.as_str()
                ],
                ["0"; 3]
            );
        }
        rules
            .artifact
            .ships
            .get_mut(&ShipType::LightFighter)
            .unwrap()
            .capacity = 0;
        for survivors in [vec![], inputs().attacker.units] {
            let (capacity, loot) = planning_sample(
                &survivors,
                AttackerVictory,
                Some(Resources::all(i64::MAX)),
                &rules,
            )
            .unwrap();
            assert_eq!(capacity, "0");
            let loot = loot.unwrap();
            assert_eq!(
                [
                    loot.metal.as_str(),
                    loot.crystal.as_str(),
                    loot.deuterium.as_str()
                ],
                ["0"; 3]
            );
        }
    }

    #[test]
    fn unknown_stock_and_disabled_raiding_are_unavailable_not_zero() {
        let mut rules = Ruleset::mvp_raids().unwrap();
        let units = inputs().attacker.units;
        assert!(
            planning_sample(
                &units,
                orbit_engine::BattleOutcome::AttackerVictory,
                None,
                &rules
            )
            .unwrap()
            .1
            .is_none()
        );
        rules.artifact.world.as_mut().unwrap().raiding = None;
        assert!(
            planning_sample(
                &units,
                orbit_engine::BattleOutcome::AttackerVictory,
                Some(Resources::all(10_000_000)),
                &rules
            )
            .unwrap()
            .1
            .is_none()
        );
    }

    #[test]
    fn observed_stock_validates_canonical_i64_but_allows_fractional_resources() {
        let mut input = inputs();
        assert_eq!(observed_resources(&input).unwrap(), None);
        for invalid in ["-1", "01", "1e6", "9223372036854775808", ""] {
            input.observed_resources = Some(ResourceDto {
                metal: invalid.into(),
                crystal: "0".into(),
                deuterium: "0".into(),
            });
            assert!(matches!(
                observed_resources(&input),
                Err(ServiceError::Malformed)
            ));
        }
        input.observed_resources = Some(Resources::all(1_234_567).into());
        assert_eq!(
            observed_resources(&input).unwrap(),
            Some(Resources::all(1_234_567))
        );
    }
    #[test]
    fn computes_cargo_and_loot_from_each_actual_sample_not_the_initial_fleet() {
        let id = uuid::Uuid::from_u128(11);
        let rules = Ruleset::mvp_raids().unwrap();
        let mut input = inputs();
        input.attacker.units[0].count = 10;
        input.defender.units = vec![SimulationUnit {
            item: ManufacturedItem::Ship(ShipType::LightFighter),
            count: 8,
        }];
        let stock = Resources::all(500_000_000);
        input.observed_resources = Some(stock.into());
        let result = SimulationJob {
            context: QueryContext {
                binding: Binding {
                    account: AccountId(id),
                    player: PlayerId(id),
                    universe: UniverseId(id),
                    epoch: Epoch(id),
                },
                request_id: id,
            },
            rules: rules.clone(),
            inputs: input,
        }
        .run([13; 32])
        .unwrap();
        let mut capacities = BTreeSet::new();
        for sample in result.samples {
            let survivors: i64 = sample.attacker.iter().map(|u| i64::from(u.count)).sum();
            let capacity = survivors * 50 * orbit_engine::SCALE;
            assert_eq!(sample.surviving_cargo_capacity, capacity.to_string());
            capacities.insert(capacity);
            let expected = if sample.outcome == orbit_engine::BattleOutcome::AttackerVictory {
                raid_loot(stock, capacity).unwrap()
            } else {
                Resources::default()
            };
            assert_eq!(
                serde_json::to_value(sample.estimated_loot.unwrap()).unwrap(),
                serde_json::to_value(ResourceDto::from(expected)).unwrap()
            );
        }
        assert!(
            capacities.len() > 1,
            "fixture must exercise different surviving fleets"
        );
    }
}

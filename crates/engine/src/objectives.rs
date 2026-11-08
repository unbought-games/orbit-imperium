//! Typed, explicitly enrolled accomplishment programs. No presentation or account-type inputs.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ObjectiveProgram {
    pub id: String,
    pub version: u32,
    pub objectives: Vec<ObjectiveDefinition>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ObjectiveDefinition {
    pub id: String,
    pub explanation: String,
    pub predicate: ObjectivePredicate,
    pub reward: Resources,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum ObjectivePredicate {
    ProductionSettingsReview,
    Building {
        building: Building,
        minimum: u32,
    },
    Research {
        research: ResearchId,
        minimum: u32,
    },
    Manufacture {
        ship: ShipType,
        quantity: i64,
    },
    Attack,
    RaidLoaded {
        required_ships: BTreeSet<ShipType>,
    },
    RaidReturn {
        required_ships: BTreeSet<ShipType>,
    },
    Reinvest {
        building: Building,
        minimum: u32,
        after_return: String,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ObjectiveFact {
    ProductionSettingsReviewed,
    Building {
        body: BodyId,
        building: Building,
        level: u32,
    },
    Research {
        research: ResearchId,
        level: u32,
    },
    Manufactured {
        body: BodyId,
        ship: ShipType,
        quantity: i64,
    },
    /// Chat 3 must emit only after a real, eligible encounter resolves (including defeat).
    AttackResolved {
        fleet: FleetId,
    },
    /// Chat 3 must emit on committed delivery, with raid provenance and surviving ships.
    /// Generic payload/transport returns must never be converted to this fact.
    RaidLoaded {
        fleet: FleetId,
        loot: Resources,
        ships: BTreeSet<ShipType>,
    },
    RaidReturned {
        fleet: FleetId,
        destination: BodyId,
        loot: Resources,
        ships: BTreeSet<ShipType>,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObjectiveEvidence {
    pub input: InputId,
    pub order: OrderKey,
    pub actor: Actor,
    pub beneficiary: PlayerId,
    pub operation: OperationId,
    pub fact: ObjectiveFact,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MilestoneReceipt {
    pub id: OperationId,
    pub program: String,
    pub definition_version: u32,
    pub objective: String,
    pub beneficiary: PlayerId,
    pub homeworld: BodyId,
    pub resources: Resources,
    pub explanation: String,
    pub granted_by: InputId,
    pub granted_at: OrderKey,
    pub evidence: ObjectiveEvidence,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObjectiveRun {
    pub id: OperationId,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub beneficiary: PlayerId,
    pub program: ObjectiveProgram,
    pub enrolled_at: OrderKey,
    pub evidence: Vec<ObjectiveEvidence>,
    pub receipts: BTreeMap<String, MilestoneReceipt>,
}
fn invalid(message: &str) -> InvariantError {
    InvariantError(message.into())
}
fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 80
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
impl ObjectiveProgram {
    pub fn validate(&self, rules: &Ruleset) -> Result<(), InvariantError> {
        self.validate_definition(Some(rules))
    }
    fn validate_definition(&self, rules: Option<&Ruleset>) -> Result<(), InvariantError> {
        if rules.is_some_and(|r| !r.world())
            || !valid_key(&self.id)
            || self.version == 0
            || self.objectives.is_empty()
            || self.objectives.len() > 128
        {
            return Err(invalid("unsupported objective program"));
        }
        let mut ids = BTreeSet::new();
        for d in &self.objectives {
            if !valid_key(&d.id)
                || !ids.insert(&d.id)
                || d.explanation.is_empty()
                || d.reward.values().iter().any(|n| *n < 0)
            {
                return Err(invalid("invalid objective definition"));
            }
            let supported = match &d.predicate {
                ObjectivePredicate::Building { building, minimum } => {
                    *minimum > 0
                        && rules.is_none_or(|r| r.artifact.buildings.contains_key(building))
                }
                ObjectivePredicate::Reinvest {
                    building,
                    minimum,
                    after_return,
                } => {
                    *minimum > 0
                        && matches!(
                            building,
                            Building::MetalMine
                                | Building::CrystalMine
                                | Building::DeuteriumSynthesizer
                                | Building::SolarPlant
                                | Building::FusionReactor
                        )
                        && rules.is_none_or(|r| r.artifact.buildings.contains_key(building))
                        && self.objectives.iter().any(|x| {
                            x.id == *after_return
                                && matches!(x.predicate, ObjectivePredicate::RaidReturn { .. })
                        })
                }
                ObjectivePredicate::Research { research, minimum } => {
                    *minimum > 0
                        && rules.is_none_or(|r| {
                            r.artifact
                                .progression
                                .as_ref()
                                .is_some_and(|p| p.research.contains_key(research))
                        })
                }
                ObjectivePredicate::Manufacture { ship, quantity } => {
                    *quantity > 0 && rules.is_none_or(|r| r.artifact.ships.contains_key(ship))
                }
                ObjectivePredicate::RaidLoaded { required_ships }
                | ObjectivePredicate::RaidReturn { required_ships } => required_ships
                    .iter()
                    .all(|ship| rules.is_none_or(|r| r.artifact.ships.contains_key(ship))),
                ObjectivePredicate::Attack | ObjectivePredicate::ProductionSettingsReview => true,
            };
            if !supported {
                return Err(invalid("unsupported objective predicate"));
            }
        }
        Ok(())
    }
}
pub fn objective_order(i: &OrderedInput) -> OrderKey {
    OrderKey {
        at_ms: i.at,
        phase: i.phase as u8,
        ordinal: i.sequence,
    }
}
pub fn objective_run_id(
    universe: UniverseId,
    epoch: Epoch,
    player: PlayerId,
    program: &str,
) -> OperationId {
    OperationId(derived_id(
        InputId(player.0),
        &format!("objective-run:{universe}:{epoch}:{program}"),
    ))
}
/// Server integration only: compose into an existing authorized ordered change.
/// Existing bindings remain pinned even if the author supplies a newer version.
/// Rollout must enroll under a barrier with all workers upgraded; no default enrollment exists.
pub fn enroll_objective_program(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    c: &mut ChangeSet,
    beneficiary: PlayerId,
    program: ObjectiveProgram,
) -> Result<OperationId, InvariantError> {
    program.validate(r)?;
    validate_binding(s, i, c)?;
    let w = world_facts(s)?;
    if !w.covered_players.contains(&beneficiary)
        || !s.players.contains_key(&beneficiary)
        || !w.homeworlds.contains_key(&beneficiary)
        || !w
            .records
            .policies
            .get(&beneficiary)
            .is_some_and(|p| p.lifecycle == PlayerLifecycle::Active)
    {
        return Err(invalid("uncovered objective beneficiary"));
    }
    let id = objective_run_id(s.universe, s.epoch, beneficiary, &program.id);
    let changes = c
        .world
        .as_mut()
        .ok_or_else(|| invalid("objective enrollment requires world change"))?;
    changes
        .records
        .objective_runs
        .entry(id)
        .or_insert(ObjectiveRun {
            id,
            universe: s.universe,
            epoch: s.epoch,
            beneficiary,
            program,
            enrolled_at: objective_order(i),
            evidence: vec![],
            receipts: BTreeMap::new(),
        });
    c.affected_viewers.insert(beneficiary);
    Ok(id)
}
fn validate_binding(s: &GameState, i: &OrderedInput, c: &ChangeSet) -> Result<(), InvariantError> {
    if s.universe != i.universe
        || s.epoch != i.epoch
        || c.input != i.id
        || c.expected_facts_hash != hash(s)
        || !(0..=1).contains(&i.phase)
    {
        return Err(invalid("objective input binding mismatch"));
    }
    Ok(())
}
fn matches_fact(p: &ObjectivePredicate, f: &ObjectiveFact) -> bool {
    match (p, f) {
        (
            ObjectivePredicate::Building { building, minimum }
            | ObjectivePredicate::Reinvest {
                building, minimum, ..
            },
            ObjectiveFact::Building {
                building: b, level, ..
            },
        ) => building == b && level >= minimum,
        (
            ObjectivePredicate::Research { research, minimum },
            ObjectiveFact::Research { research: b, level },
        ) => research == b && level >= minimum,
        (
            ObjectivePredicate::Manufacture { ship, .. },
            ObjectiveFact::Manufactured {
                ship: b, quantity, ..
            },
        ) => ship == b && *quantity > 0,
        (ObjectivePredicate::Attack, ObjectiveFact::AttackResolved { .. }) => true,
        (
            ObjectivePredicate::ProductionSettingsReview,
            ObjectiveFact::ProductionSettingsReviewed,
        ) => true,
        (
            ObjectivePredicate::RaidLoaded { required_ships },
            ObjectiveFact::RaidLoaded { loot, ships, .. },
        )
        | (
            ObjectivePredicate::RaidReturn { required_ships },
            ObjectiveFact::RaidReturned { loot, ships, .. },
        ) => {
            loot.values().iter().all(|v| *v >= 0)
                && loot.values().iter().any(|v| *v > 0)
                && required_ships.is_subset(ships)
        }
        _ => false,
    }
}
fn completion(run: &ObjectiveRun, d: &ObjectiveDefinition) -> Option<ObjectiveEvidence> {
    let mut candidates: Vec<_> = run
        .evidence
        .iter()
        .filter(|e| matches_fact(&d.predicate, &e.fact))
        .collect();
    candidates.sort_by_key(|e| e.order);
    match &d.predicate {
        ObjectivePredicate::Manufacture { quantity, .. } => {
            let mut total = 0i128;
            candidates
                .into_iter()
                .find(|e| {
                    if let ObjectiveFact::Manufactured { quantity: n, .. } = e.fact {
                        total += i128::from(n);
                    }
                    total >= i128::from(*quantity)
                })
                .cloned()
        }
        ObjectivePredicate::Reinvest { after_return, .. } => {
            let prerequisite = run
                .program
                .objectives
                .iter()
                .find(|x| x.id == *after_return)?;
            let returned = completion(run, prerequisite)?;
            candidates
                .into_iter()
                .find(|e| e.order > returned.order)
                .cloned()
        }
        _ => candidates.first().map(|e| (*e).clone()),
    }
}
/// Authoritative engine seam for Chat 3; not a command, route, or client evidence API.
/// Caller must establish encounter/raid provenance in the same transition before invoking.
pub fn apply_objective_evidence(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    c: &mut ChangeSet,
    evidence: Vec<ObjectiveEvidence>,
) -> Result<(), InvariantError> {
    if evidence.is_empty() {
        return Ok(());
    }
    validate_binding(s, i, c)?;
    let w = world_facts(s)?;
    let Some(mut changes) = c.world.clone() else {
        return Err(invalid("objective evidence requires world change"));
    };
    // Work on a private copy: failures must not leave a partially modified caller's change.
    let mut next = c.clone();
    let result = (|| {
        for e in &evidence {
            if e.input != i.id
                || e.order != objective_order(i)
                || e.actor != i.actor
                || !w.covered_players.contains(&e.beneficiary)
            {
                return Err(invalid("objective evidence provenance mismatch"));
            }
            if let Actor::Player(actor) = e.actor
                && actor != e.beneficiary
            {
                return Err(invalid("collective objective credit unsupported"));
            }
            for run in changes
                .records
                .objective_runs
                .values_mut()
                .filter(|run| run.beneficiary == e.beneficiary)
            {
                if run.universe != s.universe
                    || run.epoch != s.epoch
                    || run.id
                        != objective_run_id(s.universe, s.epoch, run.beneficiary, &run.program.id)
                {
                    return Err(invalid("objective run binding mismatch"));
                }
                if !changes.records.policies.contains_key(&run.beneficiary) {
                    return Err(invalid("missing objective beneficiary policy"));
                }
                if e.order <= run.enrolled_at
                    || matches!(
                        changes
                            .records
                            .policies
                            .get(&run.beneficiary)
                            .map(|p| p.lifecycle),
                        Some(PlayerLifecycle::Removed | PlayerLifecycle::DeletionDraining)
                    )
                {
                    continue;
                }
                if run.program.objectives.iter().any(|d| {
                    !run.receipts.contains_key(&d.id) && matches_fact(&d.predicate, &e.fact)
                }) && !run.evidence.contains(e)
                {
                    run.evidence.push(e.clone());
                }
                for d in &run.program.objectives {
                    if run.receipts.contains_key(&d.id) {
                        continue;
                    }
                    let Some(proof) = completion(run, d) else {
                        continue;
                    };
                    let home = *w
                        .homeworlds
                        .get(&run.beneficiary)
                        .ok_or_else(|| invalid("missing objective homeworld"))?;
                    if !s.coverage.bodies.contains(&home)
                        || !s.coverage.production_bodies.contains(&home)
                    {
                        return Err(invalid("uncovered objective homeworld"));
                    }
                    let mut body = next
                        .bodies
                        .iter()
                        .find(|b| b.id == home)
                        .or_else(|| s.bodies.get(&home))
                        .ok_or_else(|| invalid("missing objective homeworld body"))?
                        .clone();
                    if body.owner != run.beneficiary || body.universe != s.universe {
                        return Err(invalid("objective homeworld owner mismatch"));
                    }
                    body.checkpoint = settle_production(s, &body, i.at, r)?;
                    body.checkpoint.amounts =
                        crate::transition::resources(body.checkpoint.amounts, d.reward, true)
                            .map_err(InvariantError::from)?;
                    if !next.bodies.iter().any(|b| b.id == home) {
                        body.revision = body
                            .revision
                            .checked_add(1)
                            .ok_or_else(|| invalid("body revision overflow"))?;
                    }
                    next.bodies.retain(|b| b.id != home);
                    next.bodies.push(body);
                    run.receipts.insert(
                        d.id.clone(),
                        MilestoneReceipt {
                            id: OperationId(derived_id(
                                InputId(run.id.0),
                                &format!("milestone:{}", d.id),
                            )),
                            program: run.program.id.clone(),
                            definition_version: run.program.version,
                            objective: d.id.clone(),
                            beneficiary: run.beneficiary,
                            homeworld: home,
                            resources: d.reward,
                            explanation: d.explanation.clone(),
                            granted_by: i.id,
                            granted_at: objective_order(i),
                            evidence: proof,
                        },
                    );
                    next.affected_viewers.insert(run.beneficiary);
                }
            }
        }
        Ok(())
    })();
    if result.is_ok() {
        next.world = Some(changes);
        *c = next;
    }
    result
}

pub(crate) fn apply_completion_objectives(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    c: &mut ChangeSet,
) -> Result<(), InvariantError> {
    if s.world
        .as_ref()
        .is_none_or(|w| w.records.objective_runs.is_empty())
    {
        return Ok(());
    }
    let mut evidence = vec![];
    let mut push = |beneficiary, operation, fact| {
        evidence.push(ObjectiveEvidence {
            input: i.id,
            order: objective_order(i),
            actor: i.actor,
            beneficiary,
            operation,
            fact,
        })
    };
    if matches!(
        i.payload,
        Input::Command(Command::World {
            action: WorldAction::ReviewProductionSettings
        })
    ) && let Actor::Player(player) = i.actor
        && can_review_production(s, player)
    {
        push(
            player,
            OperationId(i.id.0),
            ObjectiveFact::ProductionSettingsReviewed,
        );
    }
    for x in &c.constructions {
        if x.status == ConstructionStatus::Completed
            && s.constructions
                .get(&x.id)
                .is_some_and(|old| old.status == ConstructionStatus::Active)
            && s.bodies
                .get(&x.body)
                .is_some_and(|b| b.levels.get(&x.building).copied().unwrap_or(0) < x.target_level)
        {
            push(
                x.owner,
                x.id,
                ObjectiveFact::Building {
                    body: x.body,
                    building: x.building,
                    level: x.target_level,
                },
            );
        }
    }
    for x in &c.research_operations {
        if x.status == ResearchStatus::Completed
            && s.research_operations
                .get(&x.id)
                .is_some_and(|old| old.status == ResearchStatus::Active)
        {
            push(
                x.owner,
                x.id,
                ObjectiveFact::Research {
                    research: x.research,
                    level: x.target_level,
                },
            );
        }
    }
    for x in &c.manufacturing_batches {
        if let ManufacturedItem::Ship(ship) = x.item
            && let Some(old) = s.manufacturing_batches.get(&x.id)
            && x.completed_prefix > old.completed_prefix
        {
            push(
                x.owner,
                x.id,
                ObjectiveFact::Manufactured {
                    body: x.body,
                    ship,
                    quantity: x.completed_prefix - old.completed_prefix,
                },
            );
        }
    }
    if let (Some(old), Some(next)) = (&s.world, &c.world) {
        for fleet in next.records.fleets.values() {
            let prior = old.records.fleets.get(&fleet.id);
            if let Some(raid) = &fleet.raid {
                if raid.encounter == i.id && prior.is_some_and(|f| f.raid.is_none()) {
                    push(
                        fleet.owner,
                        OperationId(fleet.id.0),
                        ObjectiveFact::AttackResolved { fleet: fleet.id },
                    );
                    if raid.loot.values().iter().any(|n| *n > 0) {
                        push(
                            fleet.owner,
                            OperationId(fleet.id.0),
                            ObjectiveFact::RaidLoaded {
                                fleet: fleet.id,
                                loot: raid.loot,
                                ships: fleet.ships.iter().map(|s| s.ship_type).collect(),
                            },
                        );
                    }
                }
                if fleet.leg == MissionLeg::Returned
                    && prior.is_some_and(|f| f.leg != MissionLeg::Returned)
                    && raid.loot.values().iter().any(|n| *n > 0)
                    && !fleet.ships.is_empty()
                {
                    push(
                        fleet.owner,
                        OperationId(fleet.id.0),
                        ObjectiveFact::RaidReturned {
                            fleet: fleet.id,
                            destination: fleet.intent.origin,
                            loot: raid.loot,
                            ships: fleet.ships.iter().map(|s| s.ship_type).collect(),
                        },
                    );
                }
            }
        }
    }
    apply_objective_evidence(s, i, r, c, evidence)
}
/// Projection requires the caller's authenticated player; no beneficiary parameter is accepted.
pub fn objective_receipts(
    s: &GameState,
    viewer: PlayerId,
) -> Result<Vec<MilestoneReceipt>, InvariantError> {
    let w = world_facts(s)?;
    if !w.covered_players.contains(&viewer) {
        return Err(invalid("uncovered objective viewer"));
    }
    Ok(w.records
        .objective_runs
        .values()
        .filter(|run| {
            run.beneficiary == viewer && run.universe == s.universe && run.epoch == s.epoch
        })
        .flat_map(|run| run.receipts.values().cloned())
        .collect())
}

impl ObjectiveRun {
    /// Validate retained facts without consulting presentation state or mutable content files.
    pub fn validate(&self) -> Result<(), InvariantError> {
        self.program.validate_definition(None)?;
        if self.id
            != objective_run_id(
                self.universe,
                self.epoch,
                self.beneficiary,
                &self.program.id,
            )
            || self.enrolled_at.phase > 1
        {
            return Err(invalid("invalid objective run identity"));
        }
        for (index, e) in self.evidence.iter().enumerate() {
            if e.beneficiary != self.beneficiary
                || e.order <= self.enrolled_at
                || e.order.phase > 1
                || self.evidence[..index].contains(e)
                || matches!(e.actor, Actor::Player(p) if p != self.beneficiary)
                || !self
                    .program
                    .objectives
                    .iter()
                    .any(|d| matches_fact(&d.predicate, &e.fact))
            {
                return Err(invalid("invalid retained objective evidence"));
            }
        }
        for (key, receipt) in &self.receipts {
            let d = self
                .program
                .objectives
                .iter()
                .find(|d| &d.id == key)
                .ok_or_else(|| invalid("unknown objective receipt"))?;
            if receipt.id
                != OperationId(derived_id(InputId(self.id.0), &format!("milestone:{key}")))
                || receipt.program != self.program.id
                || receipt.definition_version != self.program.version
                || receipt.objective != *key
                || receipt.beneficiary != self.beneficiary
                || receipt.resources != d.reward
                || receipt.explanation != d.explanation
                || receipt.granted_at < receipt.evidence.order
                || receipt.granted_at.phase > 1
                || completion(self, d).as_ref() != Some(&receipt.evidence)
            {
                return Err(invalid("invalid objective receipt"));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_production_review_needs_its_own_fact_not_a_building_completion() {
        assert!(matches_fact(
            &ObjectivePredicate::ProductionSettingsReview,
            &ObjectiveFact::ProductionSettingsReviewed
        ));
        assert!(!matches_fact(
            &ObjectivePredicate::ProductionSettingsReview,
            &ObjectiveFact::Building {
                body: BodyId::default(),
                building: Building::SolarPlant,
                level: 2
            }
        ));
        assert!(!matches_fact(
            &ObjectivePredicate::Building {
                building: Building::SolarPlant,
                minimum: 2
            },
            &ObjectiveFact::ProductionSettingsReviewed
        ));
        assert_eq!(
            tutorial_program()
                .objectives
                .iter()
                .find(|d| d.id == "production-settings")
                .unwrap()
                .reward,
            Resources::from_values([200 * SCALE, 100 * SCALE, 0])
        );
    }
    #[test]
    fn predicate_credit_is_causal_and_quantity_based_without_economy_fixtures() {
        let p = PlayerId(uuid::Uuid::from_u128(1));
        let mut run = ObjectiveRun {
            id: OperationId::default(),
            universe: UniverseId::default(),
            epoch: Epoch::default(),
            beneficiary: p,
            enrolled_at: OrderKey {
                at_ms: 0,
                phase: 0,
                ordinal: 0,
            },
            program: ObjectiveProgram {
                id: "pure".into(),
                version: 1,
                objectives: vec![ObjectiveDefinition {
                    id: "haul".into(),
                    explanation: "haul".into(),
                    reward: Resources::default(),
                    predicate: ObjectivePredicate::RaidReturn {
                        required_ships: BTreeSet::from([ShipType::SmallCargo]),
                    },
                }],
            },
            evidence: vec![],
            receipts: BTreeMap::new(),
        };
        let make = |n, fact| ObjectiveEvidence {
            input: InputId(uuid::Uuid::from_u128(n)),
            order: OrderKey {
                at_ms: 1,
                phase: 0,
                ordinal: n as i64,
            },
            actor: Actor::Scheduler,
            beneficiary: p,
            operation: OperationId::default(),
            fact,
        };
        let build = ObjectiveFact::Building {
            body: BodyId::default(),
            building: Building::MetalMine,
            level: 21,
        };
        let reinvest = ObjectiveDefinition {
            id: "reinvest".into(),
            explanation: "reinvest".into(),
            reward: Resources::default(),
            predicate: ObjectivePredicate::Reinvest {
                building: Building::MetalMine,
                minimum: 8,
                after_return: "haul".into(),
            },
        };
        run.evidence.push(make(1, build.clone()));
        assert!(matches_fact(
            &ObjectivePredicate::Building {
                building: Building::MetalMine,
                minimum: 8
            },
            &build
        ));
        run.evidence.push(make(
            2,
            ObjectiveFact::RaidReturned {
                fleet: FleetId::default(),
                destination: BodyId::default(),
                loot: Resources::all(1),
                ships: BTreeSet::from([ShipType::SmallCargo]),
            },
        ));
        assert!(completion(&run, &reinvest).is_none());
        run.evidence.push(make(3, build));
        assert_eq!(completion(&run, &reinvest).unwrap().order.ordinal, 3);
        let manufacture = ObjectiveDefinition {
            id: "ships".into(),
            explanation: "ships".into(),
            reward: Resources::default(),
            predicate: ObjectivePredicate::Manufacture {
                ship: ShipType::LightFighter,
                quantity: 2,
            },
        };
        assert!(completion(&run, &manufacture).is_none());
        for n in [4, 5] {
            run.evidence.push(make(
                n,
                ObjectiveFact::Manufactured {
                    body: BodyId::default(),
                    ship: ShipType::LightFighter,
                    quantity: 1,
                },
            ));
        }
        assert_eq!(completion(&run, &manufacture).unwrap().order.ordinal, 5);
        assert!(!matches_fact(
            &run.program.objectives[0].predicate,
            &ObjectiveFact::RaidReturned {
                fleet: FleetId::default(),
                destination: BodyId::default(),
                loot: Resources::default(),
                ships: BTreeSet::from([ShipType::SmallCargo])
            }
        ));
    }
}

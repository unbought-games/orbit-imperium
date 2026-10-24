use crate::numeric::add;
use crate::*;
#[derive(Debug)]
pub(crate) enum Fault {
    Game(GameError),
    Invariant(InvariantError),
}
impl From<GameError> for Fault {
    fn from(e: GameError) -> Self {
        Self::Game(e)
    }
}
impl From<InvariantError> for Fault {
    fn from(e: InvariantError) -> Self {
        Self::Invariant(e)
    }
}
pub(crate) fn invariant(message: &str) -> Fault {
    Fault::Invariant(InvariantError(message.into()))
}
pub(crate) fn require_body(s: &GameState, id: BodyId) -> Result<&Body, Fault> {
    if !s.coverage.bodies.contains(&id) {
        return Err(invariant("incomplete body facts"));
    }
    let body = s.bodies.get(&id).ok_or(GameError::NotFound)?;
    research_level(s, body.owner, ResearchId::CombustionDrive)?;
    if body.levels.len() != 4 || Building::ALL.iter().any(|b| !body.levels.contains_key(b)) {
        return Err(invariant("incomplete building levels"));
    }
    Ok(body)
}
fn require_constructions(s: &GameState, id: BodyId) -> Result<(), Fault> {
    if !s.coverage.construction_bodies.contains(&id) {
        return Err(invariant("incomplete construction collection"));
    }
    Ok(())
}
pub(crate) fn resources(
    amounts: Resources,
    cost: Resources,
    refund: bool,
) -> Result<Resources, GameError> {
    let mut out = amounts.values();
    for (i, c) in cost.values().iter().enumerate() {
        if *c < 0 {
            return Err(GameError::InvalidInput);
        }
        out[i] = if refund {
            add(out[i], *c)?
        } else {
            out[i]
                .checked_sub(*c)
                .filter(|v| *v >= 0)
                .ok_or(GameError::InsufficientResources)?
        }
    }
    Ok(Resources::from_values(out))
}
pub fn transition(state: &GameState, input: &OrderedInput, rules: &Ruleset) -> TransitionResult {
    // Admission/scheduling provenance remains on the durable input. Ordered
    // execution uses the rules at this position; paid terms stay on operations
    // and quoted commands still validate the player's exact consent.
    let mut execution = input.clone();
    if rules.progression() {
        execution.profile_hash = rules.hash.clone();
    }
    match resolve(state, &execution, rules) {
        Ok(change) => TransitionResult::Applied(Box::new(change)),
        Err(Fault::Game(e)) if rules.world() && matches!(input.payload, Input::Event(_)) => {
            TransitionResult::InvalidState(InvariantError(format!(
                "scheduled R3 settlement failed: {e}"
            )))
        }
        Err(Fault::Game(e)) => TransitionResult::Rejected(e),
        Err(Fault::Invariant(e)) => TransitionResult::InvalidState(e),
    }
}
fn resolve(s: &GameState, i: &OrderedInput, r: &Ruleset) -> Result<ChangeSet, Fault> {
    if r.world() {
        return crate::missions::resolve(s, i, r);
    }
    if r.progression() {
        return crate::progression::resolve(s, i, r);
    }
    if i.schema_version != 2
        || s.universe != i.universe
        || s.epoch != i.epoch
        || s.profile_hash != i.profile_hash
        || r.hash != i.profile_hash
        || i.protocol
            != if r.artifact.id != "first-slice-v1" {
                2
            } else {
                1
            }
        || i.at < 0
        || i.at > MAX_WIRE_MS
    {
        return Err(invariant("input binding does not match facts"));
    }
    let expected_phase = if matches!(i.payload, Input::Event(_)) {
        0
    } else {
        1
    };
    if i.phase != expected_phase {
        return Err(invariant("invalid input phase"));
    }
    let mut change = ChangeSet::new(s, i, r);
    match &i.payload {
        Input::Command(
            Command::World { .. }
            | Command::SetProduction { .. }
            | Command::StartDemolition { .. }
            | Command::StartResearch { .. }
            | Command::CancelResearch { .. }
            | Command::StartManufacture { .. },
        ) => return Err(GameError::UnavailableContent.into()),
        Input::Event(
            ScheduledEvent::FleetLegDue { .. }
            | ScheduledEvent::DebrisCleanupDue { .. }
            | ScheduledEvent::ResearchDue { .. }
            | ScheduledEvent::ManufacturingDue { .. },
        ) => return Err(invariant("progression event under legacy profile")),
        Input::Command(Command::LaunchTransport { .. } | Command::RecallFleet { .. })
        | Input::Event(
            ScheduledEvent::TransportArrived { .. } | ScheduledEvent::FleetReturned { .. },
        ) => crate::fleets::resolve_fleet(s, i, r, &mut change)?,
        Input::Command(Command::StartUpgrade {
            body,
            building,
            expected_terms_hash,
        }) => {
            let original = require_body(s, *body)?;
            if i.actor != Actor::Player(original.owner) {
                return Err(GameError::NotOwned.into());
            }
            require_constructions(s, *body)?;
            let q = quote(
                s,
                i.actor,
                &QuoteRequest::Upgrade {
                    body: *body,
                    building: *building,
                },
                i.at,
                r,
            )?;
            if &q.terms_hash != expected_terms_hash {
                return Err(GameError::QuoteChanged.into());
            }
            if s.constructions
                .values()
                .any(|c| c.body == *body && c.status == ConstructionStatus::Active)
            {
                return Err(GameError::ActiveConstruction.into());
            }
            let used = original
                .levels
                .values()
                .try_fold(0u32, |sum, n| sum.checked_add(*n))
                .ok_or(GameError::NumericRange)?;
            if used >= original.fields {
                return Err(GameError::NoFreeField.into());
            }
            let due_at = deadline(i.at, q.duration)?;
            let mut b = original.clone();
            b.checkpoint = settle_economy(&b, i.at, r)?;
            b.checkpoint.amounts = resources(b.checkpoint.amounts, q.cost, false)?;
            b.revision = add(b.revision, 1)?;
            let id = OperationId(derived_id(i.id, "construction:0"));
            if s.constructions.contains_key(&id) {
                return Err(invariant("derived operation ID already exists"));
            }
            let operation = Construction {
                progression: None,
                id,
                body: *body,
                owner: b.owner,
                building: *building,
                target_level: q
                    .target_level
                    .ok_or_else(|| invariant("construction quote missing level"))?,
                paid: q.cost,
                profile_hash: r.hash.clone(),
                terms_hash: q.terms_hash.clone(),
                started_at: i.at,
                due_at,
                generation: 0,
                status: ConstructionStatus::Active,
                revision: 0,
            };
            change.events.push(NewEvent {
                id: InputId(derived_id(i.id, "event:0")),
                at: due_at,
                event: ScheduledEvent::ConstructionDue {
                    operation: id,
                    generation: 0,
                },
            });
            change.affected_viewers.insert(b.owner);
            change.bodies.push(b);
            change.constructions.push(operation);
        }
        Input::Command(Command::CancelConstruction { operation }) => {
            if !s.coverage.operations.contains(operation) {
                return Err(invariant("incomplete operation lookup"));
            }
            let original = s.constructions.get(operation).ok_or(GameError::NotFound)?;
            if i.actor != Actor::Player(original.owner) {
                return Err(GameError::NotOwned.into());
            }
            if original.status != ConstructionStatus::Active {
                return Err(GameError::OperationNotActive.into());
            }
            if i.at >= original.due_at {
                return Err(invariant("due event was not resolved before cancellation"));
            }
            let mut b = require_body(s, original.body)?.clone();
            require_constructions(s, b.id)?;
            b.checkpoint = settle_economy(&b, i.at, r)?;
            b.checkpoint.amounts = resources(b.checkpoint.amounts, original.paid, true)?;
            b.revision = add(b.revision, 1)?;
            let mut operation = original.clone();
            operation.status = ConstructionStatus::Cancelled;
            operation.generation = add(operation.generation, 1)?;
            operation.revision = add(operation.revision, 1)?;
            change
                .cancelled_events
                .push(ScheduledEvent::ConstructionDue {
                    operation: original.id,
                    generation: original.generation,
                });
            change.affected_viewers.insert(b.owner);
            change.bodies.push(b);
            change.constructions.push(operation);
        }
        Input::Event(ScheduledEvent::ConstructionDue {
            operation,
            generation,
        }) => {
            if i.actor != Actor::Scheduler {
                return Err(invariant("event without scheduler actor"));
            }
            let original = s
                .constructions
                .get(operation)
                .ok_or_else(|| invariant("scheduled construction missing"))?;
            if original.generation != *generation || original.status != ConstructionStatus::Active {
                return Ok(change);
            }
            if i.at != original.due_at {
                return Err(invariant("construction deadline mismatch"));
            }
            let mut b = require_body(s, original.body)?.clone();
            require_constructions(s, b.id)?;
            let level = b
                .levels
                .get(&original.building)
                .ok_or_else(|| invariant("missing building level"))?;
            if level.checked_add(1) != Some(original.target_level)
                || original.profile_hash != r.hash
            {
                return Err(invariant("construction terms mismatch"));
            }
            b.checkpoint = settle_economy(&b, i.at, r)?;
            b.levels.insert(original.building, original.target_level);
            b.revision = add(b.revision, 1)?;
            // Validate the resulting rate before committing an unrepresentable level.
            production_rates(&b, r).map_err(InvariantError::from)?;
            let mut operation = original.clone();
            operation.status = ConstructionStatus::Completed;
            operation.revision = add(operation.revision, 1)?;
            change.affected_viewers.insert(b.owner);
            change.bodies.push(b);
            change.constructions.push(operation);
        }
    }
    Ok(change)
}

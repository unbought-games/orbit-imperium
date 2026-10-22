//! Protocol-3 progression guards and atomic transitions over completely covered facts.
use crate::numeric::add;
use crate::transition::{Fault, invariant, resources};
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProductionSettings {
    pub metal_mine: u32,
    pub crystal_mine: u32,
    pub deuterium_synthesizer: u32,
    pub solar_plant: u32,
    pub fusion_reactor: u32,
    pub solar_satellite: u32,
}
impl Default for ProductionSettings {
    fn default() -> Self {
        Self {
            metal_mine: 100,
            crystal_mine: 100,
            deuterium_synthesizer: 100,
            solar_plant: 100,
            fusion_reactor: 100,
            solar_satellite: 100,
        }
    }
}
impl ProductionSettings {
    pub fn producers(&self) -> [u32; 4] {
        [
            self.metal_mine,
            self.crystal_mine,
            self.deuterium_synthesizer,
            self.solar_plant,
        ]
    }
    pub fn validate(&self) -> Result<(), GameError> {
        if self
            .producers()
            .into_iter()
            .chain([self.fusion_reactor, self.solar_satellite])
            .any(|n| n > 100 || !n.is_multiple_of(10))
        {
            return Err(GameError::InvalidInput);
        }
        if self.fusion_reactor != 100 || self.solar_satellite != 100 {
            return Err(GameError::UnavailableContent);
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProductionSettingsRecord {
    pub body: BodyId,
    pub settings: ProductionSettings,
    pub revision: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// Historical journal payload only. Live reservations derive from active operations.
pub struct ProgressionReservations {
    pub body: BodyId,
    pub field_operation: Option<OperationId>,
    pub small_dome_operation: Option<OperationId>,
    pub large_dome_operation: Option<OperationId>,
    pub missile_slots: i64,
    pub revision: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ResourceKind {
    Metal,
    Crystal,
    Deuterium,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BlockerUnit {
    Level,
    MicroResource,
    MicroEnergy,
    Count,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProgressionBlocker {
    pub code: GameError,
    pub requirement: Option<Requirement>,
    pub required: Option<String>,
    pub actual: Option<String>,
    pub resource: Option<ResourceKind>,
    pub unit: Option<BlockerUnit>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProgressionEstimate {
    pub first_start_at: i64,
    pub final_due_at: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProgressionInspection {
    pub request: QuoteRequest,
    pub terms: Option<ProgressionMaterial>,
    pub terms_hash: Option<Hash>,
    pub blockers: Vec<ProgressionBlocker>,
    pub estimates: Option<ProgressionEstimate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub building_energy: Option<BuildingEnergy>,
}
fn block(code: GameError) -> ProgressionBlocker {
    ProgressionBlocker {
        code,
        requirement: None,
        required: None,
        actual: None,
        resource: None,
        unit: None,
    }
}
fn bad(msg: &str) -> InvariantError {
    InvariantError(msg.into())
}
pub fn settle_production(
    s: &GameState,
    b: &Body,
    at: i64,
    r: &Ruleset,
) -> Result<ResourceCheckpoint, InvariantError> {
    if !r.progression() {
        return settle_economy(b, at, r);
    }
    validate_body(s, b.id, r)?;
    let settings = &s.production_settings[&b.id].settings;
    crate::economy::settle_rates(b, at, production_rates_with_settings(b, settings, r)?, r)
}
fn head(s: &GameState, kind: &str, id: impl std::fmt::Display) -> Result<(), InvariantError> {
    if !s
        .collection_revisions
        .get(&format!("{kind}:{id}"))
        .is_some_and(|v| *v >= 0)
    {
        return Err(bad("missing progression collection revision"));
    }
    Ok(())
}
pub fn validate_body<'a>(
    s: &'a GameState,
    id: BodyId,
    r: &Ruleset,
) -> Result<Option<&'a Body>, InvariantError> {
    if !s.coverage.bodies.contains(&id) {
        return Err(bad("uncovered body"));
    }
    let Some(b) = s.bodies.get(&id) else {
        return Ok(None);
    };
    if b.universe != s.universe
        || b.revision < 0
        || b.levels.len() != r.artifact.buildings.len()
        || r.artifact
            .buildings
            .keys()
            .any(|k| !b.levels.contains_key(k))
    {
        return Err(bad("incomplete progression building levels"));
    }
    if !s.coverage.production_bodies.contains(&id)
        || !s.coverage.research_players.contains(&b.owner)
    {
        return Err(bad("incomplete production facts"));
    }
    let set = s
        .production_settings
        .get(&id)
        .ok_or_else(|| bad("missing production settings"))?;
    if set.body != id || set.revision < 0 || set.settings.validate().is_err() {
        return Err(bad("invalid production settings"));
    }
    let research = s
        .research
        .get(&b.owner)
        .ok_or_else(|| bad("missing research"))?;
    if research.owner != b.owner
        || research.revision < 0
        || validate_research_catalog(research, r).is_err()
    {
        return Err(bad("incomplete supported research"));
    }
    let capacity = body_storage_capacity(b, r)?;
    // Old journal facts carried this field and rejected mismatches. Preserve that
    // replay contract without requiring or storing it in current progression facts.
    if b.retained_capacity
        .is_some_and(|retained| retained != capacity)
    {
        return Err(bad("storage capacity mismatch"));
    }
    head(s, "production", id)?;
    head(s, "research", b.owner)?;
    Ok(Some(b))
}
/// Fields occupied by active upgrades, derived only from a completely covered collection.
/// Demolitions occupy the construction slot but do not reserve an additional field.
pub fn reserved_fields(s: &GameState, id: BodyId) -> Result<u32, InvariantError> {
    if !s.coverage.construction_bodies.contains(&id) {
        return Err(bad("incomplete construction coverage"));
    }
    head(s, "constructions", id)?;
    let mut active = s
        .constructions
        .values()
        .filter(|x| x.body == id && x.status == ConstructionStatus::Active);
    let construction = active.next();
    if active.next().is_some() {
        return Err(bad("multiple active constructions"));
    }
    Ok(u32::from(construction.is_some_and(|x| {
        matches!(
            x.progression,
            Some(ProgressionMaterial::Building {
                action: BuildingAction::Upgrade,
                ..
            })
        )
    })))
}

pub fn validate_progression_collections(s: &GameState, b: &Body) -> Result<(), InvariantError> {
    let c = &s.coverage;
    if !c.construction_bodies.contains(&b.id)
        || !c.manufacturing_bodies.contains(&b.id)
        || !c.inventory_owners.contains(&(b.id, b.owner))
        || !c.research_slot_players.contains(&b.owner)
        || !c.lab_construction_players.contains(&b.owner)
        || !c.owned_body_players.contains(&b.owner)
    {
        return Err(bad("incomplete progression locks"));
    }
    for k in ["constructions", "manufacturing"] {
        head(s, k, b.id)?
    }
    for k in ["research-operations", "lab-constructions", "owned-bodies"] {
        head(s, k, b.owner)?
    }
    head(s, &format!("inventory:{}", b.id), b.owner)?;
    reserved_fields(s, b.id)?;
    let domes: Vec<_> = s
        .manufacturing_batches
        .values()
        .filter(|x| {
            x.body == b.id
                && x.status == ManufacturingStatus::Active
                && x.item == ManufacturedItem::Defense(DefenseId::SmallShieldDome)
        })
        .collect();
    if domes.len() > 1 {
        return Err(bad("multiple active dome batches"));
    }
    if s.research_operations
        .values()
        .filter(|x| x.owner == b.owner && x.status == ResearchStatus::Active)
        .count()
        > 1
    {
        return Err(bad("multiple research slots"));
    }
    let mut seen = BTreeSet::new();
    for x in s.inventories.iter().filter(|x| x.body == b.id) {
        if x.owner != b.owner || x.count < 0 || x.revision < 0 || !seen.insert(x.item) {
            return Err(bad("invalid inventory"));
        }
    }
    for x in s
        .manufacturing_batches
        .values()
        .filter(|x| x.body == b.id && x.status == ManufacturingStatus::Active)
    {
        if x.owner != b.owner
            || x.quantity <= 0
            || x.completed_prefix < 0
            || x.completed_prefix >= x.quantity
            || x.unit_duration_ms <= 0
            || x.generation < 0
            || x.revision < 0
            || deadline(
                x.first_start_at,
                x.unit_duration_ms
                    .checked_mul(x.quantity)
                    .ok_or_else(|| bad("batch overflow"))?,
            )? != x.final_due_at
            || deadline(
                x.first_start_at,
                x.unit_duration_ms
                    .checked_mul(x.completed_prefix + 1)
                    .ok_or_else(|| bad("prefix overflow"))?,
            )? != x.next_due_at
        {
            return Err(bad("invalid batch"));
        }
    }
    Ok(())
}
fn request_identity(q: &QuoteRequest) -> Option<(BodyId, CatalogKey)> {
    match q {
        QuoteRequest::Upgrade { body, building } | QuoteRequest::Demolition { body, building } => {
            Some((*body, CatalogKey::Building(*building)))
        }
        QuoteRequest::Research { host, research } => Some((*host, CatalogKey::Research(*research))),
        QuoteRequest::Manufacture { body, item, .. } => Some((*body, item.catalog_key())),
        _ => None,
    }
}
pub fn inspect_progression(
    s: &GameState,
    actor: Actor,
    q: &QuoteRequest,
    at: i64,
    r: &Ruleset,
) -> Result<ProgressionInspection, InvariantError> {
    let mut out = ProgressionInspection {
        request: q.clone(),
        terms: None,
        terms_hash: None,
        blockers: vec![],
        estimates: None,
        building_energy: None,
    };
    let Some((id, key)) = request_identity(q) else {
        out.blockers.push(block(GameError::UnavailableContent));
        return Ok(out);
    };
    if s.profile_hash != r.hash || !(0..=MAX_WIRE_MS).contains(&at) {
        return Err(bad("invalid progression binding"));
    }
    let Some(b) = validate_body(s, id, r)? else {
        out.blockers.push(block(GameError::NotFound));
        return Ok(out);
    };
    if actor != Actor::Player(b.owner) {
        out.blockers.push(block(GameError::NotOwned));
        return Ok(out);
    }
    validate_progression_collections(s, b)?;
    let Some(entry) = r
        .artifact
        .catalog
        .iter()
        .find(|e| e.key == key && e.enabled)
    else {
        out.blockers.push(block(GameError::UnavailableContent));
        return Ok(out);
    };
    if !entry.body_kinds.contains(&b.kind) {
        out.blockers.push(block(GameError::BodyKindNotAllowed));
        return Ok(out);
    }
    let t = match q {
        QuoteRequest::Upgrade { building, .. } => {
            building_terms(b, *building, BuildingAction::Upgrade, r)
        }
        QuoteRequest::Demolition { building, .. } => {
            building_terms(b, *building, BuildingAction::Demolition, r)
        }
        QuoteRequest::Research { research, .. } => {
            research_terms(b, &s.research[&b.owner], *research, r)
        }
        QuoteRequest::Manufacture { item, quantity, .. } => {
            manufacture_terms(b, *item, *quantity, r)
        }
        _ => unreachable!(),
    };
    let terms = match t {
        Ok(t) => t,
        Err(e) => {
            out.blockers.push(block(e));
            return Ok(out);
        }
    };
    if let ProgressionMaterial::Building {
        building,
        source_level,
        target_level,
        ..
    } = &terms
    {
        out.building_energy = Some(building_energy(
            b,
            *building,
            *source_level,
            *target_level,
            r,
        )?);
    }
    out.terms_hash = Some(hash(
        &serde_json::json!({"protocol":r.protocol(),"request":canonical_request(q),"terms":terms}),
    ));
    for req in &entry.requirements {
        let (actual, required) = match req {
            Requirement::BodyBuilding { building, level } => (
                *b.levels
                    .get(building)
                    .ok_or_else(|| bad("missing prerequisite level"))?,
                *level,
            ),
            Requirement::PlayerResearch { research, level } => (
                *s.research[&b.owner]
                    .levels
                    .get(research)
                    .ok_or_else(|| bad("missing prerequisite technology"))?,
                *level,
            ),
        };
        if actual < required {
            let mut x = block(GameError::PrerequisiteMissing);
            x.requirement = Some(req.clone());
            x.required = Some(required.to_string());
            x.actual = Some(actual.to_string());
            x.unit = Some(BlockerUnit::Level);
            out.blockers.push(x)
        }
    }
    let construction = s
        .constructions
        .values()
        .find(|x| x.body == id && x.status == ConstructionStatus::Active);
    let research = s
        .research_operations
        .values()
        .any(|x| x.owner == b.owner && x.status == ResearchStatus::Active);
    let labs = s.constructions.values().any(|x| {
        x.owner == b.owner
            && x.building == Building::ResearchLab
            && x.status == ConstructionStatus::Active
    });
    let queue: Vec<_> = s
        .manufacturing_batches
        .values()
        .filter(|x| x.body == id && x.status == ManufacturingStatus::Active)
        .collect();
    match q {
        QuoteRequest::Upgrade { building, .. } | QuoteRequest::Demolition { building, .. } => {
            if construction.is_some() {
                out.blockers.push(block(GameError::ActiveConstruction))
            }
            if *building == Building::ResearchLab && research {
                out.blockers.push(block(GameError::LabLocked))
            }
            if *building == Building::Shipyard && !queue.is_empty() {
                out.blockers.push(block(GameError::YardLocked))
            }
            if matches!(q, QuoteRequest::Upgrade { .. })
                && b.levels
                    .values()
                    .try_fold(0u32, |n, v| n.checked_add(*v))
                    .ok_or_else(|| bad("field overflow"))?
                    .checked_add(reserved_fields(s, id)?)
                    .ok_or_else(|| bad("field reservation overflow"))?
                    >= b.fields
            {
                out.blockers.push(block(GameError::NoFreeField))
            }
        }
        QuoteRequest::Research { .. } => {
            if research {
                out.blockers.push(block(GameError::ResearchActive))
            }
            if labs {
                out.blockers.push(block(GameError::LabLocked))
            }
        }
        QuoteRequest::Manufacture { item, quantity, .. } => {
            if construction.is_some_and(|x| x.building == Building::Shipyard) {
                out.blockers.push(block(GameError::YardLocked))
            }
            if queue.len()
                >= r.artifact
                    .progression
                    .as_ref()
                    .ok_or_else(|| bad("missing progression rules"))?
                    .max_active_manufacturing_entries
            {
                out.blockers.push(block(GameError::QueueCapacity))
            }
            let count = s
                .inventories
                .iter()
                .find(|x| x.body == id && x.item == *item)
                .map_or(0, |x| x.count);
            let queued = queue
                .iter()
                .filter(|x| x.item == *item)
                .try_fold(0i64, |n, x| n.checked_add(x.quantity - x.completed_prefix));
            let total = queued
                .and_then(|n| n.checked_add(count))
                .and_then(|n| n.checked_add(*quantity));
            if total.is_none() {
                out.blockers.push(block(GameError::NumericRange))
            }
            if *item == ManufacturedItem::Defense(DefenseId::SmallShieldDome)
                && total.is_some_and(|n| n > 1)
            {
                out.blockers.push(block(GameError::CapacityReserved))
            }
        }
        _ => {}
    }
    let start = if matches!(q, QuoteRequest::Manufacture { .. }) {
        queue
            .iter()
            .map(|x| x.final_due_at)
            .max()
            .unwrap_or(at)
            .max(at)
    } else {
        at
    };
    let duration = match q {
        QuoteRequest::Manufacture { quantity, .. } => terms.duration().checked_mul(*quantity),
        _ => Some(terms.duration()),
    };
    match duration.and_then(|d| deadline(start, d).ok()) {
        Some(end) => {
            out.estimates = Some(ProgressionEstimate {
                first_start_at: start,
                final_due_at: end,
            })
        }
        None => out.blockers.push(block(GameError::NumericRange)),
    }
    let available = settle_production(s, b, at, r)?.amounts;
    for (idx, resource) in [
        ResourceKind::Metal,
        ResourceKind::Crystal,
        ResourceKind::Deuterium,
    ]
    .into_iter()
    .enumerate()
    {
        if available.values()[idx] < terms.paid().values()[idx] {
            let mut x = block(GameError::InsufficientResources);
            x.required = Some(terms.paid().values()[idx].to_string());
            x.actual = Some(available.values()[idx].to_string());
            x.resource = Some(resource);
            x.unit = Some(BlockerUnit::MicroResource);
            out.blockers.push(x)
        }
    }
    out.terms = Some(terms);
    Ok(out)
}
pub(crate) fn progression_quote(
    s: &GameState,
    a: Actor,
    q: &QuoteRequest,
    at: i64,
    r: &Ruleset,
) -> Result<Quote, GameError> {
    let x = inspect_progression(s, a, q, at, r).map_err(|_| GameError::InvalidInput)?;
    if let Some(b) = x.blockers.first() {
        return Err(b.code.clone());
    }
    let t = x.terms.ok_or(GameError::UnavailableContent)?;
    Ok(Quote {
        cost: t.paid(),
        duration: t.duration(),
        target_level: match &t {
            ProgressionMaterial::Building { target_level, .. }
            | ProgressionMaterial::Research { target_level, .. } => Some(*target_level),
            _ => None,
        },
        profile_hash: r.hash.clone(),
        terms_hash: x.terms_hash.ok_or(GameError::InvalidInput)?,
        fuel: 0,
        capacity: 0,
        maximum_payload: 0,
        progression: Some(t),
    })
}
fn empty(s: &GameState, i: &OrderedInput, r: &Ruleset) -> ChangeSet {
    ChangeSet {
        world: None,
        production_settings: vec![],
        research_operations: vec![],
        manufacturing_batches: vec![],
        progression_reservations: vec![],
        fleets: vec![],
        inventories: vec![],
        research: vec![],
        reports: vec![],
        input: i.id,
        profile_hash: r.hash.clone(),
        expected_facts_hash: hash(s),
        expected_collection_revisions: s.collection_revisions.clone(),
        bodies: vec![],
        constructions: vec![],
        events: vec![],
        cancelled_events: vec![],
        affected_viewers: BTreeSet::new(),
    }
}
fn owned<'a>(
    s: &'a GameState,
    id: BodyId,
    i: &OrderedInput,
    r: &Ruleset,
) -> Result<&'a Body, Fault> {
    let b = validate_body(s, id, r)?.ok_or(GameError::NotFound)?;
    if i.actor != Actor::Scheduler && i.actor != Actor::Player(b.owner) {
        return Err(GameError::NotOwned.into());
    }
    validate_progression_collections(s, b)?;
    Ok(b)
}
fn settle(s: &GameState, b: &Body, i: &OrderedInput, r: &Ruleset) -> Result<Body, Fault> {
    let mut b = b.clone();
    b.checkpoint = settle_production(s, &b, i.at, r)?;
    b.revision = add(b.revision, 1)?;
    Ok(b)
}
fn absent(s: &GameState, id: OperationId) -> Result<(), Fault> {
    if !s.coverage.operations.contains(&id)
        || !s.coverage.research_operation_ids.contains(&id)
        || !s.coverage.manufacturing_operation_ids.contains(&id)
    {
        return Err(invariant("missing derived operation absence"));
    }
    if s.constructions.contains_key(&id)
        || s.research_operations.contains_key(&id)
        || s.manufacturing_batches.contains_key(&id)
    {
        return Err(invariant("operation ID collision"));
    }
    Ok(())
}
fn event(c: &mut ChangeSet, i: &OrderedInput, at: i64, e: ScheduledEvent) {
    c.events.push(NewEvent {
        id: InputId(derived_id(i.id, "event:0")),
        at,
        event: e,
    })
}
fn terms(
    s: &GameState,
    i: &OrderedInput,
    q: &QuoteRequest,
    expected: &Hash,
    r: &Ruleset,
) -> Result<(ProgressionMaterial, ProgressionEstimate), Fault> {
    let x = inspect_progression(s, i.actor, q, i.at, r)?;
    if let Some(t) = &x.terms_hash
        && t != expected
    {
        return Err(GameError::QuoteChanged.into());
    }
    if let Some(b) = x.blockers.first() {
        return Err(b.code.clone().into());
    }
    Ok((
        x.terms.ok_or_else(|| invariant("missing material"))?,
        x.estimates.ok_or_else(|| invariant("missing estimate"))?,
    ))
}
pub(crate) fn resolve(s: &GameState, i: &OrderedInput, r: &Ruleset) -> Result<ChangeSet, Fault> {
    if i.schema_version != r.protocol()
        || i.protocol != r.protocol()
        || s.universe != i.universe
        || s.epoch != i.epoch
        || s.profile_hash != i.profile_hash
        || r.hash != i.profile_hash
        || i.at < 0
        || i.at > MAX_WIRE_MS
        || i.phase
            != if matches!(i.payload, Input::Event(_)) {
                0
            } else {
                1
            }
    {
        return Err(invariant("invalid progression binding"));
    }
    if matches!(i.payload, Input::Event(_)) && i.actor != Actor::Scheduler {
        return Err(invariant("event requires scheduler"));
    }
    if matches!(i.payload, Input::Command(_)) && !matches!(i.actor, Actor::Player(_)) {
        return Err(invariant("command requires player"));
    }
    let mut c = empty(s, i, r);
    match &i.payload {
        Input::Command(Command::SetProduction {
            body,
            settings,
            expected_settings_revision,
        }) => {
            let b = owned(s, *body, i, r)?;
            settings.validate()?;
            let settled = settle(s, b, i, r)?;
            let old = &s.production_settings[body];
            if old.revision != *expected_settings_revision {
                return Err(GameError::SettingsChanged.into());
            }
            if old.settings != *settings {
                c.production_settings.push(ProductionSettingsRecord {
                    body: *body,
                    settings: settings.clone(),
                    revision: add(old.revision, 1)?,
                });
                c.affected_viewers.insert(b.owner);
            }
            c.bodies.push(settled);
        }
        Input::Command(
            Command::StartUpgrade {
                body,
                building,
                expected_terms_hash,
            }
            | Command::StartDemolition {
                body,
                building,
                expected_terms_hash,
            },
        ) => {
            let q = if matches!(i.payload, Input::Command(Command::StartUpgrade { .. })) {
                QuoteRequest::Upgrade {
                    body: *body,
                    building: *building,
                }
            } else {
                QuoteRequest::Demolition {
                    body: *body,
                    building: *building,
                }
            };
            let (t, times) = terms(s, i, &q, expected_terms_hash, r)?;
            let mut b = settle(s, owned(s, *body, i, r)?, i, r)?;
            b.checkpoint.amounts = resources(b.checkpoint.amounts, t.paid(), false)?;
            let id = OperationId(derived_id(i.id, "construction:0"));
            absent(s, id)?;
            let ProgressionMaterial::Building { target_level, .. } = &t else {
                return Err(invariant("building terms kind"));
            };
            c.constructions.push(Construction {
                progression: Some(t.clone()),
                id,
                body: *body,
                owner: b.owner,
                building: *building,
                target_level: *target_level,
                paid: t.paid(),
                profile_hash: r.hash.clone(),
                terms_hash: expected_terms_hash.clone(),
                started_at: i.at,
                due_at: times.final_due_at,
                generation: 0,
                status: ConstructionStatus::Active,
                revision: 0,
            });
            event(
                &mut c,
                i,
                times.final_due_at,
                ScheduledEvent::ConstructionDue {
                    operation: id,
                    generation: 0,
                },
            );
            c.affected_viewers.insert(b.owner);
            c.bodies.push(b);
        }
        Input::Command(Command::CancelConstruction { operation })
        | Input::Event(ScheduledEvent::ConstructionDue { operation, .. }) => {
            if !s.coverage.operations.contains(operation) {
                return Err(invariant("uncovered construction"));
            }
            let original = s.constructions.get(operation).ok_or(GameError::NotFound)?;
            let b = owned(s, original.body, i, r)?;
            let cancel = matches!(i.payload, Input::Command(_));
            if let Input::Event(ScheduledEvent::ConstructionDue { generation, .. }) = i.payload
                && (generation != original.generation
                    || original.status != ConstructionStatus::Active)
            {
                return Ok(c);
            }
            if original.status != ConstructionStatus::Active {
                return Err(GameError::OperationNotActive.into());
            }
            if (cancel && i.at >= original.due_at) || (!cancel && i.at != original.due_at) {
                return Err(invariant("construction ordering mismatch"));
            }
            let mut b = settle(s, b, i, r)?;
            let mut op = original.clone();
            let Some(ProgressionMaterial::Building {
                source_level,
                target_level,
                ..
            }) = &original.progression
            else {
                return Err(invariant("missing committed construction terms"));
            };
            if b.levels[&op.building] != *source_level {
                return Err(invariant("construction source mismatch"));
            }
            if cancel {
                b.checkpoint.amounts = resources(b.checkpoint.amounts, op.paid, true)?;
                op.status = ConstructionStatus::Cancelled;
                op.generation = add(op.generation, 1)?;
                c.cancelled_events.push(ScheduledEvent::ConstructionDue {
                    operation: *operation,
                    generation: original.generation,
                });
            } else {
                b.levels.insert(op.building, *target_level);
                // Only historical snapshots carry capacity. Re-emit their old
                // outcome shape when replaying; current state has no mirror to update.
                let capacity = body_storage_capacity(&b, r)?;
                if b.retained_capacity.is_some() {
                    b.retained_capacity = Some(capacity);
                }
                production_rates_with_settings(&b, &s.production_settings[&b.id].settings, r)?;
                op.status = ConstructionStatus::Completed;
            }
            op.revision = add(op.revision, 1)?;
            c.affected_viewers.insert(b.owner);
            c.bodies.push(b);
            c.constructions.push(op);
        }
        Input::Command(Command::StartResearch {
            host,
            research,
            expected_terms_hash,
        }) => {
            let (t, times) = terms(
                s,
                i,
                &QuoteRequest::Research {
                    host: *host,
                    research: *research,
                },
                expected_terms_hash,
                r,
            )?;
            let mut b = settle(s, owned(s, *host, i, r)?, i, r)?;
            b.checkpoint.amounts = resources(b.checkpoint.amounts, t.paid(), false)?;
            let id = OperationId(derived_id(i.id, "research:0"));
            absent(s, id)?;
            let ProgressionMaterial::Research {
                source_level,
                target_level,
                labs,
                ..
            } = &t
            else {
                return Err(invariant("research terms kind"));
            };
            c.research_operations.push(ResearchOperation {
                id,
                owner: b.owner,
                host: *host,
                research: *research,
                source_level: *source_level,
                target_level: *target_level,
                labs: labs
                    .iter()
                    .map(|l| LabContribution {
                        body: l.body,
                        completed_level: l.level,
                    })
                    .collect(),
                commitment: Commitment {
                    profile_hash: r.hash.clone(),
                    terms_hash: expected_terms_hash.clone(),
                    paid: t.paid(),
                    started_at: i.at,
                    due_at: times.final_due_at,
                },
                status: ResearchStatus::Active,
                generation: 0,
                revision: 0,
            });
            event(
                &mut c,
                i,
                times.final_due_at,
                ScheduledEvent::ResearchDue {
                    operation: id,
                    generation: 0,
                },
            );
            c.affected_viewers.insert(b.owner);
            c.bodies.push(b);
        }
        Input::Command(Command::CancelResearch { operation })
        | Input::Event(ScheduledEvent::ResearchDue { operation, .. }) => {
            if !s.coverage.research_operation_ids.contains(operation) {
                return Err(invariant("uncovered research operation"));
            }
            let original = s
                .research_operations
                .get(operation)
                .ok_or(GameError::NotFound)?;
            let b = owned(s, original.host, i, r)?;
            let cancel = matches!(i.payload, Input::Command(_));
            if let Input::Event(ScheduledEvent::ResearchDue { generation, .. }) = i.payload
                && (generation != original.generation || original.status != ResearchStatus::Active)
            {
                return Ok(c);
            }
            if original.status != ResearchStatus::Active {
                return Err(GameError::OperationNotActive.into());
            }
            if (cancel && i.at >= original.commitment.due_at)
                || (!cancel && i.at != original.commitment.due_at)
            {
                return Err(invariant("research ordering mismatch"));
            }
            let mut op = original.clone();
            let mut levels = s.research[&b.owner].clone();
            if levels.levels[&op.research] != op.source_level
                || op.source_level.checked_add(1) != Some(op.target_level)
            {
                return Err(invariant("research source mismatch"));
            }
            if cancel {
                let mut b = settle(s, b, i, r)?;
                b.checkpoint.amounts = resources(b.checkpoint.amounts, op.commitment.paid, true)?;
                c.bodies.push(b);
                op.status = ResearchStatus::Cancelled;
                op.generation = add(op.generation, 1)?;
                c.cancelled_events.push(ScheduledEvent::ResearchDue {
                    operation: *operation,
                    generation: original.generation,
                });
            } else {
                if op.research == ResearchId::EnergyTechnology {
                    for b in s.bodies.values().filter(|b| b.owner == op.owner) {
                        c.bodies.push(settle(s, b, i, r)?);
                    }
                }
                levels.levels.insert(op.research, op.target_level);
                levels.revision = add(levels.revision, 1)?;
                c.research.push(levels);
                op.status = ResearchStatus::Completed;
            }
            op.revision = add(op.revision, 1)?;
            c.affected_viewers.insert(op.owner);
            c.research_operations.push(op);
        }
        Input::Command(Command::StartManufacture {
            body,
            item,
            quantity,
            expected_terms_hash,
        }) => {
            let (t, times) = terms(
                s,
                i,
                &QuoteRequest::Manufacture {
                    body: *body,
                    item: *item,
                    quantity: *quantity,
                },
                expected_terms_hash,
                r,
            )?;
            let mut b = settle(s, owned(s, *body, i, r)?, i, r)?;
            b.checkpoint.amounts = resources(b.checkpoint.amounts, t.paid(), false)?;
            let id = OperationId(derived_id(i.id, "manufacturing:0"));
            absent(s, id)?;
            let ProgressionMaterial::Manufacture {
                unit_cost,
                unit_duration_ms,
                facilities,
                ..
            } = &t
            else {
                return Err(invariant("manufacture terms kind"));
            };
            let prev = s
                .manufacturing_batches
                .values()
                .filter(|x| x.body == *body && x.status == ManufacturingStatus::Active)
                .max_by_key(|x| x.queue_sequence);
            let next = deadline(times.first_start_at, *unit_duration_ms)?;
            c.manufacturing_batches.push(ManufacturingBatch {
                id,
                owner: b.owner,
                body: *body,
                item: *item,
                quantity: *quantity,
                completed_prefix: 0,
                commitment: BatchCommitment {
                    profile_hash: r.hash.clone(),
                    terms_hash: expected_terms_hash.clone(),
                    paid: t.paid(),
                    unit_cost: *unit_cost,
                    accepted_at: i.at,
                    facility_levels: facilities.iter().map(|x| (x.building, x.level)).collect(),
                },
                predecessor: prev.map(|x| x.id),
                queue_sequence: i.sequence,
                first_start_at: times.first_start_at,
                final_due_at: times.final_due_at,
                unit_duration_ms: *unit_duration_ms,
                next_due_at: next,
                status: ManufacturingStatus::Active,
                generation: 0,
                revision: 0,
            });
            event(
                &mut c,
                i,
                next,
                ScheduledEvent::ManufacturingDue {
                    operation: id,
                    generation: 0,
                    expected_prefix: 0,
                },
            );
            c.affected_viewers.insert(b.owner);
            c.bodies.push(b);
        }
        Input::Event(ScheduledEvent::ManufacturingDue {
            operation,
            generation,
            expected_prefix,
        }) => {
            if !s.coverage.manufacturing_operation_ids.contains(operation) {
                return Err(invariant("uncovered manufacturing operation"));
            }
            let original = s
                .manufacturing_batches
                .get(operation)
                .ok_or_else(|| invariant("missing paid batch"))?;
            let b = owned(s, original.body, i, r)?;
            if original.status != ManufacturingStatus::Active
                || original.generation != *generation
                || original.completed_prefix != *expected_prefix
            {
                return Ok(c);
            }
            if i.at != original.next_due_at
                || s.manufacturing_batches.values().any(|x| {
                    x.body == b.id
                        && x.status == ManufacturingStatus::Active
                        && x.queue_sequence < original.queue_sequence
                })
            {
                return Err(invariant("manufacturing ordering mismatch"));
            }
            let mut op = original.clone();
            op.completed_prefix = add(op.completed_prefix, 1)?;
            op.revision = add(op.revision, 1)?;
            let old = s
                .inventories
                .iter()
                .find(|x| x.body == b.id && x.item == op.item);
            c.inventories.push(InventoryStack {
                body: b.id,
                owner: b.owner,
                item: op.item,
                count: add(old.map_or(0, |x| x.count), 1)?,
                revision: old.map_or(Ok(0), |x| add(x.revision, 1))?,
            });
            if op.completed_prefix == op.quantity {
                op.status = ManufacturingStatus::Completed;
            } else {
                op.next_due_at = deadline(i.at, op.unit_duration_ms)?;
                event(
                    &mut c,
                    i,
                    op.next_due_at,
                    ScheduledEvent::ManufacturingDue {
                        operation: op.id,
                        generation: op.generation,
                        expected_prefix: op.completed_prefix,
                    },
                )
            }
            c.affected_viewers.insert(b.owner);
            c.manufacturing_batches.push(op);
        }
        _ => return Err(GameError::UnavailableContent.into()),
    }
    Ok(c)
}

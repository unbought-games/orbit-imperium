//! Finite, personal encounter sources. These APIs are trusted engine composition
//! seams, not player commands. Real fleet settlement uses site_encounter.
use crate::*;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

#[derive(
    Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
)]
#[serde(transparent)]
pub struct SiteId(pub Uuid);
impl std::fmt::Display for SiteId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}
/// An NPC encounter identity cannot be passed as a player/asset owner.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SiteEncounterId(pub Uuid);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteIssuanceKey {
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub beneficiary: PlayerId,
    pub key: String,
}
impl SiteIssuanceKey {
    pub fn id(&self) -> SiteId {
        SiteId(derived_id(
            InputId(self.universe.0),
            &format!("mission-site-v1:{}", hash(self).0),
        ))
    }
    fn validate(&self) -> Result<(), SiteError> {
        if !valid_name(&self.key) {
            return Err(SiteError::InvalidDefinition);
        }
        Ok(())
    }
}
fn valid_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 160
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.:/".contains(&b))
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum SitePlacementPolicy {
    Orbital,
    /// Coordinates are candidate anchors, never colony reservations. Bound the
    /// authored list and normal topology distance; no hidden fallback exists.
    Bounded {
        candidates: Vec<Coordinates>,
        maximum_distance: i64,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SiteAccessPolicy {
    BeneficiaryOnly,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SiteAdmissionPolicy {
    OneActiveOperation,
    MultipleOperations,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SiteDebrisPolicy {
    None,
    RetainedSiteLocal,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteForce {
    pub item: ManufacturedItem,
    pub count: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteDefinition {
    pub schema_version: u32,
    pub id: String,
    pub version: u32,
    pub placement: SitePlacementPolicy,
    pub access: SiteAccessPolicy,
    pub admission: SiteAdmissionPolicy,
    pub debris: SiteDebrisPolicy,
    pub initial_stock: Resources,
    pub forces: Vec<SiteForce>,
    pub combat_technology: [u32; 3],
}
impl SiteDefinition {
    pub fn validate(&self, rules: &Ruleset) -> Result<(), SiteError> {
        if self.schema_version != 1
            || self.version == 0
            || !valid_name(&self.id)
            || self.initial_stock.values().iter().any(|n| *n < 0)
        {
            return Err(SiteError::InvalidDefinition);
        }
        let topology = rules
            .artifact
            .universe
            .as_ref()
            .ok_or(SiteError::Unsupported)?;
        let combat = &rules
            .artifact
            .world
            .as_ref()
            .ok_or(SiteError::Unsupported)?
            .combat;
        let mut seen = BTreeSet::new();
        if self.forces.len() > combat.units.len()
            || self.forces.iter().any(|f| {
                f.count <= 0
                    || !seen.insert(f.item)
                    || !combat.units.iter().any(|u| u.item == f.item)
                    || !rules
                        .artifact
                        .catalog
                        .iter()
                        .any(|entry| entry.key == f.item.catalog_key() && entry.enabled)
            })
        {
            return Err(SiteError::InvalidDefinition);
        }
        if let SitePlacementPolicy::Bounded {
            candidates,
            maximum_distance,
        } = &self.placement
            && (candidates.len() > 4096
                || *maximum_distance < 0
                || candidates.iter().any(|c| !topology.contains(*c))
                || candidates.iter().collect::<BTreeSet<_>>().len() != candidates.len())
        {
            return Err(SiteError::InvalidDefinition);
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteCause {
    pub input: InputId,
    pub order: OrderKey,
}
impl SiteCause {
    pub fn from_input(input: &OrderedInput) -> Self {
        Self {
            input: input.id,
            order: OrderKey {
                at_ms: input.at,
                phase: input.phase as u8,
                ordinal: input.sequence,
            },
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteCreation {
    pub issuance: SiteIssuanceKey,
    pub definition: SiteDefinition,
    pub origin: Coordinates,
    pub coordinates: Coordinates,
    pub placement_algorithm: String,
    pub encounter: SiteEncounterId,
    pub cause: SiteCause,
    pub rules_hash: Hash,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteOperationReference {
    pub operation: OperationId,
    pub fleet: FleetId,
    pub actor: PlayerId,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum SiteEventKind {
    Disclosed,
    OperationAccepted {
        reference: SiteOperationReference,
    },
    OperationSettled {
        operation: OperationId,
        fleet: FleetId,
    },
    /// Conserved source debit; cargo must be credited in the same encounter
    /// ChangeSet by the fleet consumer. Never a milestone mint.
    Extracted {
        reference: SiteOperationReference,
        free_capacity: i64,
        resources: Resources,
    },
    EncounterResolved {
        reference: SiteOperationReference,
        battle: BattleResult<CombatIdentity>,
        debris: Resources,
    },
    Retired {
        reason: String,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteEvent {
    pub cause: SiteCause,
    pub kind: SiteEventKind,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissionSite {
    pub creation: SiteCreation,
    pub events: Vec<SiteEvent>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SiteError {
    InvalidDefinition,
    Unsupported,
    NoPlacement,
    NotFound,
    StaleRevision,
    Retired,
    Busy,
    Conflict,
    InvalidFacts,
    InsufficientCoverage,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteSelection {
    pub id: SiteId,
    #[serde(with = "crate::decimal_wire")]
    pub expected_revision: i64,
}
/// Authorized site view. Fleet requests carry its stable selection, not coordinates.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SiteDestination {
    pub selection: SiteSelection,
    pub coordinates: Coordinates,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SiteView {
    pub destination: SiteDestination,
    pub definition_id: String,
    pub definition_version: u32,
    pub remaining_stock: Resources,
    pub retired: bool,
}

pub fn create_mission_site(
    key: SiteIssuanceKey,
    definition: SiteDefinition,
    origin: Coordinates,
    input: &OrderedInput,
    rules: &Ruleset,
    secret: &[u8; 32],
) -> Result<MissionSite, SiteError> {
    key.validate()?;
    definition.validate(rules)?;
    if key.universe != input.universe
        || key.epoch != input.epoch
        || matches!(input.actor, Actor::Player(actor) if actor != key.beneficiary)
    {
        return Err(SiteError::InvalidFacts);
    }
    let topology = rules
        .artifact
        .universe
        .as_ref()
        .ok_or(SiteError::Unsupported)?;
    if !topology.contains(origin) {
        return Err(SiteError::NoPlacement);
    }
    let id = key.id();
    let coordinates = match &definition.placement {
        SitePlacementPolicy::Orbital => origin,
        SitePlacementPolicy::Bounded {
            candidates,
            maximum_distance,
        } => {
            // Ranking with a private HMAC is deterministic, domain-separated and
            // independent of authoring order. The selected anchor is persisted.
            let eligible = candidates
                .iter()
                .filter(|c| galaxy_distance(origin, **c) <= *maximum_distance);
            eligible
                .map(|c| {
                    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC key");
                    mac.update(b"OI-SITE-PLACEMENT-v1\0");
                    mac.update(id.0.as_bytes());
                    mac.update(&serde_json::to_vec(c).expect("coordinate serialization"));
                    (mac.finalize().into_bytes().to_vec(), *c)
                })
                .min()
                .map(|(_, c)| c)
                .ok_or(SiteError::NoPlacement)?
        }
    };
    Ok(MissionSite {
        creation: SiteCreation {
            issuance: key,
            definition,
            origin,
            coordinates,
            placement_algorithm: "oi-site-hmac-rank-v1".into(),
            encounter: SiteEncounterId(derived_id(InputId(id.0), "encounter-v1")),
            cause: SiteCause::from_input(input),
            rules_hash: rules.hash.clone(),
        },
        events: vec![],
    })
}
impl MissionSite {
    pub fn id(&self) -> SiteId {
        self.creation.issuance.id()
    }
    pub fn revision(&self) -> i64 {
        self.events.len() as i64
    }
    pub fn retired(&self) -> bool {
        self.events
            .iter()
            .any(|e| matches!(e.kind, SiteEventKind::Retired { .. }))
    }
    pub fn disclosed(&self) -> bool {
        self.events
            .iter()
            .any(|e| matches!(e.kind, SiteEventKind::Disclosed))
    }
    pub fn remaining_stock(&self) -> Result<Resources, SiteError> {
        let mut remaining = self.creation.definition.initial_stock.values();
        for event in &self.events {
            if let SiteEventKind::Extracted { resources, .. } = event.kind {
                for (idx, amount) in resources.values().into_iter().enumerate() {
                    if amount < 0 {
                        return Err(SiteError::InvalidFacts);
                    }
                    remaining[idx] = remaining[idx]
                        .checked_sub(amount)
                        .filter(|n| *n >= 0)
                        .ok_or(SiteError::InvalidFacts)?;
                }
            }
        }
        Ok(Resources::from_values(remaining))
    }
    pub fn remaining_forces(&self) -> Vec<SiteForce> {
        let mut forces = self.creation.definition.forces.clone();
        for event in &self.events {
            if let SiteEventKind::EncounterResolved { battle, .. } = &event.kind {
                for loss in battle
                    .destroyed
                    .iter()
                    .filter(|p| p.owner == CombatIdentity::Npc(self.creation.encounter))
                {
                    for (item, count) in &loss.units {
                        if let Some(force) = forces.iter_mut().find(|f| f.item == *item) {
                            force.count -= count;
                        }
                    }
                }
            }
        }
        forces.retain(|f| f.count > 0);
        forces
    }
    pub fn active_references(&self) -> Vec<SiteOperationReference> {
        self.events
            .iter()
            .filter_map(|event| match &event.kind {
                SiteEventKind::OperationAccepted { reference }
                    if !self.events.iter().any(|e| {
                        matches!(e.kind, SiteEventKind::OperationSettled { operation, fleet }
                    if operation == reference.operation && fleet == reference.fleet)
                    }) =>
                {
                    Some(reference.clone())
                }
                _ => None,
            })
            .collect()
    }
    fn authorized(
        &self,
        universe: UniverseId,
        epoch: Epoch,
        viewer: PlayerId,
    ) -> Result<(), SiteError> {
        let key = &self.creation.issuance;
        if (key.universe, key.epoch, key.beneficiary) != (universe, epoch, viewer)
            || !self.disclosed()
        {
            return Err(SiteError::NotFound);
        }
        Ok(())
    }
    pub fn view(
        &self,
        universe: UniverseId,
        epoch: Epoch,
        viewer: PlayerId,
    ) -> Result<SiteView, SiteError> {
        self.authorized(universe, epoch, viewer)?;
        Ok(SiteView {
            destination: SiteDestination {
                selection: SiteSelection {
                    id: self.id(),
                    expected_revision: self.revision(),
                },
                coordinates: self.creation.coordinates,
            },
            definition_id: self.creation.definition.id.clone(),
            definition_version: self.creation.definition.version,
            remaining_stock: self.remaining_stock()?,
            retired: self.retired(),
        })
    }
    pub fn resolve(
        &self,
        universe: UniverseId,
        epoch: Epoch,
        viewer: PlayerId,
        selection: SiteSelection,
    ) -> Result<SiteDestination, SiteError> {
        self.authorized(universe, epoch, viewer)?;
        if selection.id != self.id() {
            return Err(SiteError::NotFound);
        }
        if selection.expected_revision != self.revision() {
            return Err(SiteError::StaleRevision);
        }
        if self.retired() {
            return Err(SiteError::Retired);
        }
        Ok(self.view(universe, epoch, viewer)?.destination)
    }
    /// Only attacks are supported; runtime readiness is enforced by the fleet consumer.
    pub fn authorize_mission(
        &self,
        universe: UniverseId,
        epoch: Epoch,
        actor: PlayerId,
        mission: Mission,
    ) -> Result<(), SiteError> {
        self.authorized(universe, epoch, actor)?;
        if mission != Mission::Attack {
            return Err(SiteError::Unsupported);
        }
        if self.retired() {
            return Err(SiteError::Retired);
        }
        if self.creation.definition.admission == SiteAdmissionPolicy::OneActiveOperation
            && !self.active_references().is_empty()
        {
            return Err(SiteError::Busy);
        }
        Ok(())
    }
    /// Applies a source fact once. One input may append distinct lifecycle facts;
    /// an identical fact retry succeeds even after subsequent revisions. Semantic
    /// duplicates (such as a second extraction for one operation) fail closed.
    pub fn append(
        &mut self,
        input: &OrderedInput,
        expected_revision: i64,
        kind: SiteEventKind,
    ) -> Result<(), SiteError> {
        if (input.universe, input.epoch)
            != (
                self.creation.issuance.universe,
                self.creation.issuance.epoch,
            )
            || matches!(input.actor, Actor::Player(actor) if actor != self.creation.issuance.beneficiary)
        {
            return Err(SiteError::InvalidFacts);
        }
        let cause = SiteCause::from_input(input);
        if self
            .events
            .iter()
            .any(|e| e.cause == cause && e.kind == kind)
        {
            return Ok(());
        }
        if expected_revision != self.revision() {
            return Err(SiteError::StaleRevision);
        }
        if cause.order
            < self
                .events
                .last()
                .map_or(self.creation.cause.order, |e| e.cause.order)
        {
            return Err(SiteError::InvalidFacts);
        }
        self.validate_event(&kind)?;
        self.events.push(SiteEvent { cause, kind });
        Ok(())
    }
    fn validate_event(&self, kind: &SiteEventKind) -> Result<(), SiteError> {
        match kind {
            SiteEventKind::EncounterResolved {
                reference,
                battle,
                debris,
            } => {
                if !self.active_references().contains(reference)
                    || self.events.iter().any(|e| matches!(&e.kind, SiteEventKind::EncounterResolved { reference: prior, .. } if prior.fleet == reference.fleet))
                    || debris.values().iter().any(|n| *n < 0)
                { return Err(SiteError::InvalidFacts); }
                let npc = battle
                    .participants
                    .iter()
                    .find(|p| p.owner == CombatIdentity::Npc(self.creation.encounter))
                    .ok_or(SiteError::InvalidFacts)?;
                let mut expected: Vec<_> = self
                    .remaining_forces()
                    .into_iter()
                    .map(|f| (f.item, f.count))
                    .collect();
                expected.sort();
                let mut actual = npc.units.clone();
                actual.sort();
                if expected != actual {
                    return Err(SiteError::InvalidFacts);
                }
                for loss in battle.destroyed.iter().filter(|p| p.owner == npc.owner) {
                    for (item, count) in &loss.units {
                        if *count < 0
                            || *count
                                > expected
                                    .iter()
                                    .find(|(k, _)| k == item)
                                    .map_or(0, |(_, n)| *n)
                        {
                            return Err(SiteError::InvalidFacts);
                        }
                    }
                }
            }
            SiteEventKind::Disclosed => {
                if self.disclosed() || self.retired() {
                    return Err(SiteError::Conflict);
                }
            }
            SiteEventKind::Retired { reason } => {
                if self.retired() || !valid_name(reason) {
                    return Err(SiteError::Conflict);
                }
            }
            SiteEventKind::OperationAccepted { reference } => {
                if self.retired() {
                    return Err(SiteError::Retired);
                }
                if !self.disclosed() || reference.actor != self.creation.issuance.beneficiary {
                    return Err(SiteError::NotFound);
                }
                if self.events.iter().any(|e| {
                    matches!(&e.kind, SiteEventKind::OperationAccepted { reference: prior }
                    if prior.operation == reference.operation || prior.fleet == reference.fleet)
                }) {
                    return Err(SiteError::Conflict);
                }
                if self.creation.definition.admission == SiteAdmissionPolicy::OneActiveOperation
                    && !self.active_references().is_empty()
                {
                    return Err(SiteError::Busy);
                }
            }
            SiteEventKind::OperationSettled { operation, fleet } => {
                if !self
                    .active_references()
                    .iter()
                    .any(|r| r.operation == *operation && r.fleet == *fleet)
                {
                    return Err(SiteError::Conflict);
                }
            }
            SiteEventKind::Extracted {
                reference,
                free_capacity,
                resources,
            } => {
                if !self.active_references().contains(reference) || self.events.iter().any(|e|
                    matches!(&e.kind, SiteEventKind::Extracted { reference: prior, .. } if prior.operation == reference.operation || prior.fleet == reference.fleet)) { return Err(SiteError::Conflict); }
                let maximum = raid_loot(self.remaining_stock()?, *free_capacity)
                    .map_err(|_| SiteError::InvalidFacts)?;
                if *resources != maximum {
                    return Err(SiteError::InvalidFacts);
                }
            }
        }
        Ok(())
    }
    /// Replays retained source facts without re-running placement or interpreting
    /// an old definition under new content. Catalog validation occurs at creation.
    pub fn validate_history(&self) -> Result<(), SiteError> {
        self.creation.issuance.validate()?;
        if self.creation.definition.schema_version != 1
            || self.creation.definition.version == 0
            || !valid_name(&self.creation.definition.id)
            || self
                .creation
                .definition
                .initial_stock
                .values()
                .iter()
                .any(|n| *n < 0)
            || self.creation.placement_algorithm != "oi-site-hmac-rank-v1"
            || self.creation.encounter
                != SiteEncounterId(derived_id(InputId(self.id().0), "encounter-v1"))
        {
            return Err(SiteError::InvalidFacts);
        }
        let mut replay = Self {
            creation: self.creation.clone(),
            events: vec![],
        };
        let mut order = self.creation.cause.order;
        for event in &self.events {
            if event.cause.order < order {
                return Err(SiteError::InvalidFacts);
            }
            replay.validate_event(&event.kind)?;
            replay.events.push(event.clone());
            order = event.cause.order;
        }
        self.remaining_stock()?;
        Ok(())
    }
}

/// Idempotence is independent of definition revisions, input retries, origin and
/// RNG secret changes. An existing issuance is returned unchanged.
pub fn issue_mission_site(
    sites: &mut BTreeMap<SiteId, MissionSite>,
    key: SiteIssuanceKey,
    definition: SiteDefinition,
    origin: Coordinates,
    input: &OrderedInput,
    rules: &Ruleset,
    secret: &[u8; 32],
) -> Result<SiteId, SiteError> {
    if (key.universe, key.epoch) != (input.universe, input.epoch) {
        return Err(SiteError::InvalidFacts);
    }
    let id = key.id();
    if let Some(existing) = sites.get(&id) {
        if existing.creation.issuance != key {
            return Err(SiteError::Conflict);
        }
        return Ok(id);
    }
    sites.insert(
        id,
        create_mission_site(key, definition, origin, input, rules, secret)?,
    );
    Ok(id)
}

#[cfg(test)]
mod tests;

/// The issuance scope can be calculated before a site exists. All mutating
/// consumers must declare these scopes before admission (not during commit).
pub fn mission_site_scopes(key: &SiteIssuanceKey) -> BTreeSet<ScopeKey> {
    BTreeSet::from([ScopeKey::Player(key.beneficiary), ScopeKey::Site(key.id())])
}

/// Shared validator for in-memory and PostgreSQL commits. Complete owned-site
/// coverage proves issuance absence; explicit Site coverage proves existing facts.
pub fn validate_site_changes(
    state: &GameState,
    input: &OrderedInput,
    next: &BTreeMap<SiteId, MissionSite>,
    rules: &Ruleset,
) -> Result<(), SiteError> {
    if (state.universe, state.epoch) != (input.universe, input.epoch) {
        return Err(SiteError::InvalidFacts);
    }
    let world = state
        .world
        .as_ref()
        .ok_or(SiteError::InsufficientCoverage)?;
    let old = &world.records.mission_sites;
    if old.keys().any(|id| !next.contains_key(id)) {
        return Err(SiteError::InvalidFacts);
    }
    for (id, site) in next {
        if old.get(id) == Some(site) {
            continue;
        }
        if *id != site.id()
            || (
                site.creation.issuance.universe,
                site.creation.issuance.epoch,
            ) != (state.universe, state.epoch)
        {
            return Err(SiteError::InvalidFacts);
        }
        site.validate_history()?;
        if matches!(input.actor, Actor::Player(actor) if actor != site.creation.issuance.beneficiary)
        {
            return Err(SiteError::InvalidFacts);
        }
        let appended = if let Some(previous) = old.get(id) {
            if !world.covered_sites.contains(id)
                || site.creation != previous.creation
                || !site.events.starts_with(&previous.events)
            {
                return Err(SiteError::InvalidFacts);
            }
            &site.events[previous.events.len()..]
        } else {
            if !state
                .players
                .contains_key(&site.creation.issuance.beneficiary)
                || !world
                    .records
                    .policies
                    .get(&site.creation.issuance.beneficiary)
                    .is_some_and(|p| p.lifecycle == PlayerLifecycle::Active)
                || !world
                    .homeworlds
                    .contains_key(&site.creation.issuance.beneficiary)
                || !world
                    .covered_site_players
                    .contains(&site.creation.issuance.beneficiary)
                || !world
                    .covered_players
                    .contains(&site.creation.issuance.beneficiary)
            {
                return Err(SiteError::InsufficientCoverage);
            }
            if site.creation.cause != SiteCause::from_input(input)
                || site.creation.rules_hash != rules.hash
            {
                return Err(SiteError::InvalidFacts);
            }
            let recreated = create_mission_site(
                site.creation.issuance.clone(),
                site.creation.definition.clone(),
                site.creation.origin,
                input,
                rules,
                &world.secret,
            )?;
            if recreated.creation != site.creation {
                return Err(SiteError::InvalidFacts);
            }
            &site.events[..]
        };
        if appended
            .iter()
            .any(|event| event.cause != SiteCause::from_input(input))
        {
            return Err(SiteError::InvalidFacts);
        }
    }
    Ok(())
}

/// Attach trusted site effects to the same ChangeSet as the causal gameplay
/// transition. This does not admit inputs and is never called from a public route.
pub fn attach_mission_sites(
    state: &GameState,
    input: &OrderedInput,
    rules: &Ruleset,
    change: &mut ChangeSet,
    sites: BTreeMap<SiteId, MissionSite>,
) -> Result<(), SiteError> {
    if change.input != input.id || change.expected_facts_hash != hash(state) {
        return Err(SiteError::InvalidFacts);
    }
    validate_site_changes(state, input, &sites, rules)?;
    let world = state
        .world
        .as_ref()
        .ok_or(SiteError::InsufficientCoverage)?;
    for (id, site) in &sites {
        if world.records.mission_sites.get(id) != Some(site) {
            change
                .affected_viewers
                .insert(site.creation.issuance.beneficiary);
        }
    }
    change
        .world
        .get_or_insert_with(|| WorldChanges {
            records: world.records.clone(),
            score_deltas: vec![],
            audits: vec![],
        })
        .records
        .mission_sites = sites;
    Ok(())
}

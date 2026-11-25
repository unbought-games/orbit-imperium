//! Exact catalog values derived from completed inventory, buildings, research and active fleets.
use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum AssetLocation {
    Body(BodyId),
    Fleet(FleetId),
    Player,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogHolding {
    pub owner: PlayerId,
    pub item: CatalogKey,
    pub level: Option<u32>,
    pub location: AssetLocation,
    pub quantity: i64,
    pub unit_value_micro: i64,
    /// Only archived journal records carry paid acquisition metadata.
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    pub acquisition: Option<Box<JournalAcquisition>>,
}
impl CatalogHolding {
    fn key(&self) -> (PlayerId, CatalogKey, AssetLocation, Option<u32>) {
        (self.owner, self.item, self.location, self.level)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScoreLedgerDelta {
    pub input: InputId,
    pub player: PlayerId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lot: Option<OperationId>,
    pub delta: i64,
    pub valuation_hash: Hash,
}
fn add_lot_value(sum: i64, lot: &CatalogHolding) -> Result<i64, InvariantError> {
    if lot.quantity < 0 || lot.unit_value_micro < 0 {
        return Err(InvariantError("invalid catalog holding".into()));
    }
    lot.quantity
        .checked_mul(lot.unit_value_micro)
        .and_then(|value| sum.checked_add(value))
        .ok_or_else(|| InvariantError("score overflow".into()))
}

pub fn value_completed_assets(
    lots: &[CatalogHolding],
    owner: PlayerId,
) -> Result<i64, InvariantError> {
    lots.iter()
        .filter(|lot| lot.owner == owner)
        .try_fold(0, add_lot_value)
}

/// Compute the exact committed values for all owners of the supplied lots in one pass.
pub fn value_completed_assets_by_owner(
    lots: &[CatalogHolding],
) -> Result<std::collections::BTreeMap<PlayerId, i64>, InvariantError> {
    let mut totals = std::collections::BTreeMap::new();
    for lot in lots {
        let total = totals.entry(lot.owner).or_default();
        *total = add_lot_value(*total, lot)?;
    }
    Ok(totals)
}

/// Move or consume a quantity. All units of a type have the same catalog price.
pub fn take_asset_quantity(
    lots: &mut Vec<CatalogHolding>,
    owner: PlayerId,
    item: CatalogKey,
    from: &AssetLocation,
    quantity: i64,
    to: Option<AssetLocation>,
) -> Result<Vec<CatalogHolding>, InvariantError> {
    if quantity < 0 {
        return Err(InvariantError("negative inventory quantity".into()));
    }
    if quantity == 0 {
        return Ok(Vec::new());
    }
    if crate::valuation_replay::has_acquisitions(lots) {
        return crate::valuation_replay::take(lots, owner, item, from, quantity, to);
    }
    let matches = |s: &CatalogHolding| s.owner == owner && s.item == item && s.location == *from;
    let available = lots
        .iter()
        .filter(|stack| matches(stack))
        .try_fold(0i64, |sum, stack| {
            sum.checked_add(stack.quantity)
                .ok_or_else(|| InvariantError("inventory quantity overflow".into()))
        })?;
    if available < quantity {
        return Err(InvariantError("insufficient completed inventory".into()));
    }
    let mut remaining = quantity;
    let mut taken = Vec::new();
    for stack in lots.iter_mut().filter(|stack| matches(stack)) {
        let count = remaining.min(stack.quantity);
        let mut moved = stack.clone();
        moved.quantity = count;
        moved.location = to.unwrap_or(*from);
        stack.quantity -= count;
        remaining -= count;
        taken.push(moved);
        if remaining == 0 {
            break;
        }
    }
    lots.retain(|stack| stack.quantity > 0);
    Ok(taken)
}

/// These quantities are a working projection. Only the underlying levels, stationed
/// inventories and fleet manifests persist. Incoming foreign fleets are outside the
/// selected owner's score coverage.
pub fn catalog_holdings(
    state: &GameState,
    rules: &Ruleset,
) -> Result<Vec<CatalogHolding>, InvariantError> {
    let world = world_facts(state)?;
    let mut assets = Vec::new();
    let mut prices = std::collections::BTreeMap::new();
    let mut push = |owner, item, level, location, quantity| -> Result<(), InvariantError> {
        if quantity < 0 {
            return Err(InvariantError("negative inventory quantity".into()));
        }
        if quantity == 0 {
            return Ok(());
        }
        let value = match prices.entry((item, level)) {
            std::collections::btree_map::Entry::Occupied(price) => *price.get(),
            std::collections::btree_map::Entry::Vacant(price) => *price.insert(
                catalog_asset_value(rules, item, level)
                    .map_err(|_| InvariantError("invalid catalog price".into()))?,
            ),
        };
        assets.push(CatalogHolding {
            acquisition: None,
            owner,
            item,
            level,
            location,
            quantity,
            unit_value_micro: value,
        });
        Ok(())
    };
    for body in state.bodies.values() {
        for (&building, &level) in &body.levels {
            for increment in 1..=level {
                push(
                    body.owner,
                    CatalogKey::Building(building),
                    Some(increment),
                    AssetLocation::Body(body.id),
                    1,
                )?;
            }
        }
    }
    for (&owner, research) in &state.research {
        for (&item, &level) in &research.levels {
            for increment in 1..=level {
                push(
                    owner,
                    CatalogKey::Research(item),
                    Some(increment),
                    AssetLocation::Player,
                    1,
                )?;
            }
        }
    }
    for stack in &state.inventories {
        push(
            stack.owner,
            stack.item.catalog_key(),
            None,
            AssetLocation::Body(stack.body),
            stack.count,
        )?;
    }
    for fleet in world
        .records
        .fleets
        .values()
        .filter(|f| f.active() && world.covered_players.contains(&f.owner))
    {
        for ship in &fleet.ships {
            push(
                fleet.owner,
                CatalogKey::Ship(ship.ship_type),
                None,
                AssetLocation::Fleet(fleet.id),
                ship.count,
            )?;
        }
    }
    assets.sort_unstable_by_key(CatalogHolding::key);
    Ok(assets)
}
pub fn validate_completed_assets(s: &GameState) -> Result<(), InvariantError> {
    let w = world_facts(s)?;
    validate_colonies(s)?;
    validate_moons(s)?;
    for (&owner, player) in &s.players {
        let policy = w
            .records
            .policies
            .get(&owner)
            .ok_or_else(|| InvariantError("missing player policy".into()))?;
        if player.universe != s.universe
            || policy.player != owner
            || policy.revision < 0
            || !(0..=MAX_WIRE_MS).contains(&policy.last_presence_at)
            || policy
                .deletion_requested_at
                .is_some_and(|at| !(0..=MAX_WIRE_MS).contains(&at))
            || policy
                .vacation
                .entered_at()
                .is_some_and(|at| !(0..=MAX_WIRE_MS).contains(&at))
            || policy.vacation.earliest_exit_at().is_err()
            || !w.covered_players.contains(&owner)
        {
            return Err(InvariantError("invalid policy coverage or profile".into()));
        }
    }
    for f in w.records.missiles.values() {
        let terms = &f.terms;
        if (terms.intent.target.expected_kind == BodyKind::Planet
            && terms.interceptor_body != terms.intent.target.id)
            || terms.intent.count <= 0
            || terms.duration_ms <= 0
            || f.generation < 0
            || !(1..=100).contains(&terms.speed)
            || f.owner == terms.intent.target.expected_owner
            || deadline(f.launched_at, terms.duration_ms).ok() != Some(f.due_at)
            || terms.rules.validate().is_err()
        {
            return Err(InvariantError("invalid immutable missile terms".into()));
        }
    }
    for fleet in w.records.fleets.values() {
        validate_mission_return_reason(fleet)?;
        if fleet.owner != fleet.authorization.actor
            || !crate::moon_removal::valid_intent(fleet, &w.records.destroyed_moons)
            || fleet.terms.duration_ms <= 0
            || fleet.terms.fuel < 0
            || fleet.terms.fuel % SCALE != 0
            || !(0..=MAX_WIRE_MS).contains(&fleet.launched_at)
            || !(0..=MAX_WIRE_MS).contains(&fleet.due_at)
        {
            return Err(InvariantError("invalid immutable fleet terms".into()));
        }
        let mut types = std::collections::BTreeSet::new();
        for stack in &fleet.ships {
            if stack.owner != fleet.owner
                || stack.count <= 0
                || !types.insert(stack.ship_type)
                || !fleet.intent.ships.iter().any(|original| {
                    original.ship_type == stack.ship_type && stack.count <= original.count
                })
            {
                return Err(InvariantError("invalid surviving manifest".into()));
            }
        }
    }
    for field in w.records.debris.values() {
        let references = debris_reference_count(field.id, w.records.fleets.values());
        if field.metal < 0
            || field.crystal < 0
            || field.deuterium < 0
            || field.metal % SCALE != 0
            || field.crystal % SCALE != 0
            || field.deuterium % SCALE != 0
            || (references > 0 && !field.marker_present)
        {
            return Err(InvariantError(
                "incomplete or inconsistent debris references".into(),
            ));
        }
    }
    for f in w.records.fleets.values().filter(|f| f.active()) {
        if let MissionDestination::Debris {
            field_identity,
            coordinates,
        } = f.intent.destination
            && w.covered_coordinates.contains(&(
                coordinates.galaxy,
                coordinates.system,
                coordinates.position,
            ))
            && !w.records.debris.contains_key(&field_identity)
        {
            return Err(InvariantError("missing referenced debris field".into()));
        }
    }

    let mut expected = std::collections::BTreeMap::new();
    let key = |owner: PlayerId, item: CatalogKey, location: &AssetLocation, level: Option<u32>| {
        (owner, item, *location, level)
    };
    for b in s.bodies.values() {
        if !w.covered_players.contains(&b.owner) || !w.records.policies.contains_key(&b.owner) {
            return Err(InvariantError("missing valuation/policy coverage".into()));
        }
        for (&building, &level) in &b.levels {
            for increment in 1..=level {
                expected.insert(
                    key(
                        b.owner,
                        CatalogKey::Building(building),
                        &AssetLocation::Body(b.id),
                        Some(increment),
                    ),
                    1,
                );
            }
        }
    }
    for (&owner, research) in &s.research {
        for (&technology, &level) in &research.levels {
            for increment in 1..=level {
                expected.insert(
                    key(
                        owner,
                        CatalogKey::Research(technology),
                        &AssetLocation::Player,
                        Some(increment),
                    ),
                    1,
                );
            }
        }
    }
    for x in &s.inventories {
        if x.count > 0 {
            let item = match x.item {
                ManufacturedItem::Ship(k) => CatalogKey::Ship(k),
                ManufacturedItem::Defense(k) => CatalogKey::Defense(k),
                ManufacturedItem::Missile(k) => CatalogKey::Missile(k),
            };
            expected.insert(
                key(x.owner, item, &AssetLocation::Body(x.body), None),
                x.count,
            );
        }
    }
    for f in w
        .records
        .fleets
        .values()
        .filter(|f| f.active() && w.covered_players.contains(&f.owner))
    {
        for x in &f.ships {
            expected.insert(
                key(
                    f.owner,
                    CatalogKey::Ship(x.ship_type),
                    &AssetLocation::Fleet(f.id),
                    None,
                ),
                x.count,
            );
        }
    }
    let mut actual = std::collections::BTreeMap::<_, i64>::new();
    for lot in &w.records.lots {
        if lot.quantity <= 0 || lot.unit_value_micro < 0 {
            return Err(InvariantError("invalid asset quantity".into()));
        }
        let v = actual
            .entry(key(lot.owner, lot.item, &lot.location, lot.level))
            .or_default();
        *v = v
            .checked_add(lot.quantity)
            .ok_or_else(|| InvariantError("inventory quantity overflow".into()))?;
    }
    if actual != expected {
        return Err(InvariantError(
            "completed quantities disagree with assets".into(),
        ));
    }
    for owner in &w.covered_players {
        value_completed_assets(&w.records.lots, *owner)?;
    }
    Ok(())
}
#[derive(Clone, Copy)]
enum CompletedOperation<'a> {
    Building(&'a Construction),
    Research(&'a ResearchOperation),
    Manufacture(&'a ManufacturingBatch, i64),
}
impl CompletedOperation<'_> {
    fn holding(
        self,
        rules: &Ruleset,
        journal: Option<&OrderedInput>,
    ) -> Result<CatalogHolding, InvariantError> {
        let (item, owner, location, level, quantity) = match self {
            Self::Building(op) => (
                CatalogKey::Building(op.building),
                op.owner,
                AssetLocation::Body(op.body),
                Some(op.target_level),
                1,
            ),
            Self::Research(op) => (
                CatalogKey::Research(op.research),
                op.owner,
                AssetLocation::Player,
                Some(op.target_level),
                1,
            ),
            Self::Manufacture(op, n) => (
                op.item.catalog_key(),
                op.owner,
                AssetLocation::Body(op.body),
                None,
                n,
            ),
        };
        let (unit_value_micro, acquisition) = if let Some(input) = journal {
            let (cost, profile, operation, tag) = match self {
                Self::Building(op) => (
                    op.paid,
                    &op.profile_hash,
                    op.id,
                    "building-value".to_owned(),
                ),
                Self::Research(op) => (
                    op.commitment.paid,
                    &op.commitment.profile_hash,
                    op.id,
                    "research-value".to_owned(),
                ),
                Self::Manufacture(op, _) => (
                    op.commitment.unit_cost,
                    &op.commitment.profile_hash,
                    op.id,
                    format!("manufactured-value:{}", op.completed_prefix),
                ),
            };
            let price = cost
                .values()
                .into_iter()
                .try_fold(0i64, i64::checked_add)
                .ok_or_else(|| InvariantError("paid valuation overflow".into()))?;
            (
                price,
                Some(Box::new(JournalAcquisition {
                    id: OperationId(derived_id(input.id, &tag)),
                    rules_hash: profile.clone(),
                    source_operation: operation,
                    acquired_at: input.at,
                    acquired_sequence: input.sequence,
                })),
            )
        } else {
            (
                catalog_asset_value(rules, item, level)
                    .map_err(|_| InvariantError("invalid catalog price".into()))?,
                None,
            )
        };
        Ok(CatalogHolding {
            owner,
            item,
            level,
            location,
            quantity,
            unit_value_micro,
            acquisition,
        })
    }
}
pub(crate) fn progression_valuation(
    s: &GameState,
    rules: &Ruleset,
    c: &ChangeSet,
    w: &mut WorldRecords,
    journal: Option<&OrderedInput>,
) -> Result<(), InvariantError> {
    for op in &c.research_operations {
        if op.status == ResearchStatus::Completed
            && s.research_operations
                .get(&op.id)
                .is_some_and(|old| old.status == ResearchStatus::Active)
        {
            w.lots
                .push(CompletedOperation::Research(op).holding(rules, journal)?);
        }
    }
    for op in &c.manufacturing_batches {
        let old = s
            .manufacturing_batches
            .get(&op.id)
            .map_or(0, |p| p.completed_prefix);
        if op.completed_prefix > old {
            w.lots.push(
                CompletedOperation::Manufacture(op, op.completed_prefix - old)
                    .holding(rules, journal)?,
            );
        }
    }
    for op in &c.constructions {
        if op.status != ConstructionStatus::Completed
            || !s
                .constructions
                .get(&op.id)
                .is_some_and(|old| old.status == ConstructionStatus::Active)
        {
            continue;
        }
        let old = s
            .bodies
            .get(&op.body)
            .ok_or_else(|| InvariantError("valuation body missing".into()))?
            .levels[&op.building];
        if op.target_level > old {
            w.lots
                .push(CompletedOperation::Building(op).holding(rules, journal)?);
        } else {
            let before = w.lots.len();
            w.lots.retain(|l| {
                !(l.owner == op.owner
                    && l.item == CatalogKey::Building(op.building)
                    && l.location == AssetLocation::Body(op.body)
                    && l.level == Some(old))
            });
            if w.lots.len() + 1 != before {
                return Err(InvariantError("missing demolished valuation".into()));
            }
        }
    }
    Ok(())
}
/// Combine quantities at the same location, independent of acquisition history.
pub fn combine_asset_quantities(lots: &mut Vec<CatalogHolding>) -> Result<(), InvariantError> {
    if crate::valuation_replay::has_acquisitions(lots) {
        return crate::valuation_replay::combine(lots);
    }
    let mut merged = std::collections::BTreeMap::new();
    for lot in lots.drain(..) {
        let key = lot.key();
        let entry: &mut CatalogHolding = merged.entry(key).or_insert_with(|| CatalogHolding {
            quantity: 0,
            ..lot.clone()
        });
        if entry.unit_value_micro != lot.unit_value_micro {
            return Err(InvariantError("inconsistent catalog price".into()));
        }
        entry.quantity = entry
            .quantity
            .checked_add(lot.quantity)
            .ok_or_else(|| InvariantError("inventory quantity overflow".into()))?;
    }
    *lots = merged.into_values().collect();
    Ok(())
}
/// Paid work must remain representable when it completes; it is not current score.
/// This is a numeric admission guard, never a protection/ranking value.
pub(crate) fn validate_committed_value_capacity(
    s: &GameState,
    c: &ChangeSet,
    w: &WorldRecords,
    rules: Option<&Ruleset>,
) -> Result<(), GameError> {
    let mut construction = s.constructions.clone();
    construction.extend(c.constructions.iter().map(|x| (x.id, x.clone())));
    let mut research = s.research_operations.clone();
    research.extend(c.research_operations.iter().map(|x| (x.id, x.clone())));
    let mut manufacture = s.manufacturing_batches.clone();
    manufacture.extend(c.manufacturing_batches.iter().map(|x| (x.id, x.clone())));
    check_capacity(
        &w.lots,
        rules,
        &construction,
        &research,
        &manufacture,
        w.policies.keys().copied(),
    )
}

/// An activation can change the value of already-paid work that will complete later.
pub fn validate_catalog_capacity(
    state: &GameState,
    rules: &Ruleset,
    assets: &[CatalogHolding],
) -> Result<(), GameError> {
    check_capacity(
        assets,
        Some(rules),
        &state.constructions,
        &state.research_operations,
        &state.manufacturing_batches,
        state.players.keys().copied(),
    )
}
fn check_capacity(
    assets: &[CatalogHolding],
    rules: Option<&Ruleset>,
    construction: &std::collections::BTreeMap<OperationId, Construction>,
    research: &std::collections::BTreeMap<OperationId, ResearchOperation>,
    manufacture: &std::collections::BTreeMap<OperationId, ManufacturingBatch>,
    owners: impl Iterator<Item = PlayerId>,
) -> Result<(), GameError> {
    let price = |item, level, paid: Resources| -> Result<i128, GameError> {
        match rules {
            Some(rules) => Ok(i128::from(catalog_asset_value(rules, item, level)?)),
            None => Ok(paid.values().into_iter().map(i128::from).sum()),
        }
    };
    for owner in owners {
        let mut total =
            i128::from(value_completed_assets(assets, owner).map_err(|_| GameError::NumericRange)?);
        for op in construction
            .values()
            .filter(|op| op.owner == owner && op.status == ConstructionStatus::Active)
        {
            if matches!(op.progression,Some(ProgressionMaterial::Building{source_level,target_level,..}) if target_level>source_level)
            {
                total = total
                    .checked_add(price(
                        CatalogKey::Building(op.building),
                        Some(op.target_level),
                        op.paid,
                    )?)
                    .ok_or(GameError::NumericRange)?;
            }
        }
        for op in research
            .values()
            .filter(|op| op.owner == owner && op.status == ResearchStatus::Active)
        {
            total = total
                .checked_add(price(
                    CatalogKey::Research(op.research),
                    Some(op.target_level),
                    op.commitment.paid,
                )?)
                .ok_or(GameError::NumericRange)?;
        }
        for batch in manufacture
            .values()
            .filter(|op| op.owner == owner && op.status == ManufacturingStatus::Active)
        {
            let future = price(batch.item.catalog_key(), None, batch.commitment.unit_cost)?
                .checked_mul(i128::from(batch.quantity - batch.completed_prefix))
                .ok_or(GameError::NumericRange)?;
            total = total.checked_add(future).ok_or(GameError::NumericRange)?;
        }
        if !(0..=i128::from(i64::MAX)).contains(&total) {
            return Err(GameError::NumericRange);
        }
    }
    Ok(())
}

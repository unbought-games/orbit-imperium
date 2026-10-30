//! Immutable paid-value lots. Location changes never revalue a completed asset.
use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AssetLocation {
    Body(BodyId),
    Fleet(FleetId),
    Player,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetLot {
    pub id: OperationId,
    pub owner: PlayerId,
    pub item: CatalogKey,
    pub level: Option<u32>,
    pub location: AssetLocation,
    pub quantity: i64,
    pub unit_value_micro: i64,
    pub rules_hash: Hash,
    pub source_operation: OperationId,
    pub acquired_at: Timestamp,
    pub acquired_sequence: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScoreLedgerDelta {
    pub input: InputId,
    pub player: PlayerId,
    pub lot: OperationId,
    pub delta: i64,
    pub valuation_hash: Hash,
}
pub fn value_completed_assets(lots: &[AssetLot], owner: PlayerId) -> Result<i64, InvariantError> {
    let mut sum = 0i128;
    for l in lots.iter().filter(|l| l.owner == owner) {
        if l.quantity < 0 || l.unit_value_micro < 0 {
            return Err(InvariantError("invalid valuation lot".into()));
        }
        sum = sum
            .checked_add(i128::from(l.quantity) * i128::from(l.unit_value_micro))
            .ok_or_else(|| InvariantError("score overflow".into()))?;
    }
    i64::try_from(sum).map_err(|_| InvariantError("score overflow".into()))
}
/// Select the oldest acquisition lineage; preserve source IDs and paid values when splitting.
pub fn take_asset_lots(
    lots: &mut Vec<AssetLot>,
    owner: PlayerId,
    item: CatalogKey,
    from: &AssetLocation,
    quantity: i64,
    to: Option<AssetLocation>,
) -> Result<Vec<AssetLot>, InvariantError> {
    if quantity < 0 {
        return Err(InvariantError("negative lot selection".into()));
    }
    let mut indices: Vec<_> = lots
        .iter()
        .enumerate()
        .filter(|(_, l)| l.owner == owner && l.item == item && &l.location == from)
        .map(|(i, _)| i)
        .collect();
    indices.sort_by_key(|i| {
        (
            lots[*i].acquired_at,
            lots[*i].acquired_sequence,
            lots[*i].source_operation,
            lots[*i].id,
        )
    });
    let available = indices
        .iter()
        .try_fold(0i64, |sum, i| sum.checked_add(lots[*i].quantity))
        .ok_or_else(|| InvariantError("lot count overflow".into()))?;
    if available < quantity {
        return Err(InvariantError("missing asset valuation lineage".into()));
    }
    let mut remaining = quantity;
    let mut taken = vec![];
    for index in indices {
        if remaining == 0 {
            break;
        }
        let lot = &mut lots[index];
        let n = remaining.min(lot.quantity);
        if n == 0 {
            continue;
        }
        let mut part = lot.clone();
        part.quantity = n;
        if let Some(to) = &to {
            part.location = to.clone();
        }
        lot.quantity -= n;
        remaining -= n;
        taken.push(part);
    }
    lots.retain(|l| l.quantity > 0);
    Ok(taken)
}
pub fn validate_asset_lineage(s: &GameState) -> Result<(), InvariantError> {
    let w = world_facts(s)?;
    validate_colonies(s)?;
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
        if fleet.owner != fleet.authorization.actor
            || fleet.intent != fleet.terms.intent
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

    let mut expected = std::collections::BTreeMap::<String, i64>::new();
    let key = |owner: PlayerId, item: CatalogKey, location: &AssetLocation, level: Option<u32>| {
        serde_json::to_string(&(owner, item, location, level)).expect("asset key")
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
    let mut actual = std::collections::BTreeMap::<String, i64>::new();
    for lot in &w.records.lots {
        if lot.quantity <= 0 || lot.unit_value_micro < 0 {
            return Err(InvariantError("invalid asset lot".into()));
        }
        let v = actual
            .entry(key(lot.owner, lot.item, &lot.location, lot.level))
            .or_default();
        *v = v
            .checked_add(lot.quantity)
            .ok_or_else(|| InvariantError("lot total overflow".into()))?;
    }
    if actual != expected {
        return Err(InvariantError(
            "completed assets lack exact valuation lineage".into(),
        ));
    }
    for owner in &w.covered_players {
        value_completed_assets(&w.records.lots, *owner)?;
    }
    Ok(())
}
pub(crate) fn progression_valuation(
    s: &GameState,
    i: &OrderedInput,
    c: &ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), InvariantError> {
    let mut add = |owner: PlayerId,
                   item: CatalogKey,
                   location: AssetLocation,
                   level: Option<u32>,
                   quantity: i64,
                   paid: Resources,
                   source: OperationId,
                   tag: String,
                   paid_profile: &Hash|
     -> Result<(), InvariantError> {
        let value = paid
            .values()
            .into_iter()
            .try_fold(0i64, |a, n| a.checked_add(n))
            .ok_or_else(|| InvariantError("paid valuation overflow".into()))?;
        w.lots.push(AssetLot {
            id: OperationId(derived_id(i.id, &tag)),
            owner,
            item,
            location,
            level,
            quantity,
            unit_value_micro: value,
            rules_hash: paid_profile.clone(),
            source_operation: source,
            acquired_at: i.at,
            acquired_sequence: i.sequence,
        });
        Ok(())
    };
    for op in &c.research_operations {
        if op.status == ResearchStatus::Completed
            && s.research_operations
                .get(&op.id)
                .is_some_and(|p| p.status == ResearchStatus::Active)
        {
            add(
                op.owner,
                CatalogKey::Research(op.research),
                AssetLocation::Player,
                Some(op.target_level),
                1,
                op.commitment.paid,
                op.id,
                "research-value".into(),
                &op.commitment.profile_hash,
            )?;
        }
    }
    for op in &c.manufacturing_batches {
        let old = s
            .manufacturing_batches
            .get(&op.id)
            .map_or(0, |p| p.completed_prefix);
        if op.completed_prefix > old {
            let item = match op.item {
                ManufacturedItem::Ship(k) => CatalogKey::Ship(k),
                ManufacturedItem::Defense(k) => CatalogKey::Defense(k),
                ManufacturedItem::Missile(k) => CatalogKey::Missile(k),
            };
            add(
                op.owner,
                item,
                AssetLocation::Body(op.body),
                None,
                op.completed_prefix - old,
                op.commitment.unit_cost,
                op.id,
                format!("manufactured-value:{}", op.completed_prefix),
                &op.commitment.profile_hash,
            )?;
        }
    }
    for op in &c.constructions {
        if op.status != ConstructionStatus::Completed
            || !s
                .constructions
                .get(&op.id)
                .is_some_and(|p| p.status == ConstructionStatus::Active)
        {
            continue;
        }
        let old = s
            .bodies
            .get(&op.body)
            .ok_or_else(|| InvariantError("valuation body missing".into()))?
            .levels[&op.building];
        if op.target_level > old {
            let value = op
                .paid
                .values()
                .into_iter()
                .try_fold(0i64, |a, n| a.checked_add(n))
                .ok_or_else(|| InvariantError("building valuation overflow".into()))?;
            w.lots.push(AssetLot {
                id: OperationId(derived_id(i.id, "building-value")),
                owner: op.owner,
                item: CatalogKey::Building(op.building),
                location: AssetLocation::Body(op.body),
                level: Some(op.target_level),
                quantity: 1,
                unit_value_micro: value,
                rules_hash: op.profile_hash.clone(),
                source_operation: op.id,
                acquired_at: i.at,
                acquired_sequence: i.sequence,
            });
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
/// Merge reunited portions without changing the acquisition identity or paid value.
pub fn normalize_asset_lots(lots: &mut Vec<AssetLot>) -> Result<(), InvariantError> {
    let mut merged = std::collections::BTreeMap::<String, AssetLot>::new();
    for lot in lots.drain(..) {
        let key = serde_json::to_string(&(lot.id, &lot.location))
            .map_err(|_| InvariantError("lot key".into()))?;
        if let Some(old) = merged.get_mut(&key) {
            let mut a = old.clone();
            let mut b = lot.clone();
            a.quantity = 0;
            b.quantity = 0;
            if a != b {
                return Err(InvariantError("conflicting valuation lineage".into()));
            }
            old.quantity = old
                .quantity
                .checked_add(lot.quantity)
                .ok_or_else(|| InvariantError("lot overflow".into()))?;
        } else {
            merged.insert(key, lot);
        }
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
) -> Result<(), GameError> {
    let mut construction = s.constructions.clone();
    construction.extend(c.constructions.iter().map(|x| (x.id, x.clone())));
    let mut research = s.research_operations.clone();
    research.extend(c.research_operations.iter().map(|x| (x.id, x.clone())));
    let mut manufacture = s.manufacturing_batches.clone();
    manufacture.extend(c.manufacturing_batches.iter().map(|x| (x.id, x.clone())));
    for owner in w.policies.keys() {
        let mut total = i128::from(
            value_completed_assets(&w.lots, *owner).map_err(|_| GameError::NumericRange)?,
        );
        let value = |r: Resources| r.values().into_iter().map(i128::from).sum::<i128>();
        for op in construction
            .values()
            .filter(|op| op.owner == *owner && op.status == ConstructionStatus::Active)
        {
            if matches!(op.progression,Some(ProgressionMaterial::Building{source_level,target_level,..}) if target_level>source_level)
            {
                total = total
                    .checked_add(value(op.paid))
                    .ok_or(GameError::NumericRange)?;
            }
        }
        for op in research
            .values()
            .filter(|op| op.owner == *owner && op.status == ResearchStatus::Active)
        {
            total = total
                .checked_add(value(op.commitment.paid))
                .ok_or(GameError::NumericRange)?;
        }
        for batch in manufacture
            .values()
            .filter(|op| op.owner == *owner && op.status == ManufacturingStatus::Active)
        {
            let future = value(batch.commitment.unit_cost)
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

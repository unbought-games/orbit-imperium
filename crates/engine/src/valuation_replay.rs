//! Paid-asset journal compatibility. The catalog-backed loader never constructs acquisitions.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Original flattened fields required to round-trip an archived state and its fact fence.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct JournalAcquisition {
    pub id: OperationId,
    pub rules_hash: Hash,
    pub source_operation: OperationId,
    pub acquired_at: Timestamp,
    pub acquired_sequence: i64,
}

pub(super) fn has_acquisitions(holdings: &[CatalogHolding]) -> bool {
    holdings
        .first()
        .is_some_and(|holding| holding.acquisition.is_some())
}

pub(super) fn take(
    holdings: &mut Vec<CatalogHolding>,
    owner: PlayerId,
    item: CatalogKey,
    from: &AssetLocation,
    quantity: i64,
    to: Option<AssetLocation>,
) -> Result<Vec<CatalogHolding>, InvariantError> {
    let mut available = 0i64;
    let mut matching = Vec::new();
    for (index, stack) in holdings
        .iter()
        .enumerate()
        .filter(|(_, s)| s.owner == owner && s.item == item && s.location == *from)
    {
        let source = stack
            .acquisition
            .as_ref()
            .ok_or_else(|| InvariantError("missing asset valuation lineage".into()))?;
        matching.push((
            (
                source.acquired_at,
                source.acquired_sequence,
                source.source_operation,
                source.id,
            ),
            index,
        ));
        available = available
            .checked_add(stack.quantity)
            .ok_or_else(|| InvariantError("lot count overflow".into()))?;
    }
    if available < quantity {
        return Err(InvariantError("missing asset valuation lineage".into()));
    }
    matching.sort_unstable();
    let mut remaining = quantity;
    let mut taken = Vec::new();
    for (_, index) in matching {
        if remaining == 0 {
            break;
        }
        let original = &mut holdings[index];
        let n = remaining.min(original.quantity);
        if n == 0 {
            continue;
        }
        let mut part = original.clone();
        part.quantity = n;
        part.location = to.unwrap_or(*from);
        original.quantity -= n;
        remaining -= n;
        taken.push(part);
    }
    holdings.retain(|s| s.quantity > 0);
    Ok(taken)
}

/// Old outcome hashes include the original serialized tuple's lexical ordering.
pub(super) fn combine(holdings: &mut Vec<CatalogHolding>) -> Result<(), InvariantError> {
    let mut merged = BTreeMap::<String, CatalogHolding>::new();
    for mut holding in holdings.drain(..) {
        let acquisition = holding
            .acquisition
            .as_ref()
            .ok_or_else(|| InvariantError("missing asset valuation lineage".into()))?;
        let key = serde_json::to_string(&(acquisition.id, holding.location))
            .map_err(|_| InvariantError("lot key".into()))?;
        if let Some(previous) = merged.get_mut(&key) {
            let count = holding.quantity;
            holding.quantity = previous.quantity;
            if *previous != holding {
                return Err(InvariantError("conflicting valuation lineage".into()));
            }
            previous.quantity = previous
                .quantity
                .checked_add(count)
                .ok_or_else(|| InvariantError("lot overflow".into()))?;
        } else {
            merged.insert(key, holding);
        }
    }
    *holdings = merged.into_values().collect();
    Ok(())
}

pub(super) fn restore_defenses(
    mut lost: Vec<CatalogHolding>,
    recovered_indices: &[i64],
    survivors: &mut Vec<CatalogHolding>,
) {
    let mut first = 0;
    for holding in &mut lost {
        let end = first + holding.quantity;
        holding.quantity = recovered_indices
            .iter()
            .filter(|&&index| index >= first && index < end)
            .count() as i64;
        first = end;
    }
    survivors.extend(lost.into_iter().filter(|s| s.quantity > 0));
}

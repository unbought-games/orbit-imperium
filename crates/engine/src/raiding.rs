//! G08 whole-unit plunder and multi-origin residual-capacity allocation.
use crate::*;
use std::collections::BTreeSet;

/// Input/output are micro-resources; fractional stock never becomes loot.
pub fn raid_loot(stock: Resources, free_capacity: i64) -> Result<Resources, InvariantError> {
    if free_capacity < 0 || stock.values().iter().any(|n| *n < 0) {
        return Err(InvariantError("negative raid resources".into()));
    }
    let mut caps = stock.values().map(|n| n / (2 * SCALE));
    let mut free = free_capacity / SCALE;
    let mut loot = [0i64; 3];
    for (resource, divisor) in [(0, 3), (1, 2), (2, 1), (0, 2), (1, 1)] {
        let taken = caps[resource].min(free / divisor);
        loot[resource] = loot[resource]
            .checked_add(taken)
            .ok_or_else(|| InvariantError("loot overflow".into()))?;
        caps[resource] = caps[resource]
            .checked_sub(taken)
            .ok_or_else(|| InvariantError("loot cap underflow".into()))?;
        free = free
            .checked_sub(taken)
            .ok_or_else(|| InvariantError("loot capacity underflow".into()))?;
    }
    scale_loot(loot)
}
fn scale_loot(whole: [i64; 3]) -> Result<Resources, InvariantError> {
    let mut result = [0; 3];
    for k in 0..3 {
        result[k] = whole[k]
            .checked_mul(SCALE)
            .ok_or_else(|| InvariantError("loot overflow".into()))?;
    }
    Ok(Resources::from_values(result))
}
#[derive(Clone, Copy, Debug)]
pub struct LootCapacity {
    pub owner: PlayerId,
    pub origin: BattleOrigin,
    pub free_capacity: i64,
}
/// Capacities are micro-units; canonical (owner, origin) order breaks Hamilton ties.
/// Compute raid_loot once for pooled free capacity, then distribute its result.
pub fn allocate_loot(
    loot: Resources,
    capacities: &[LootCapacity],
) -> Result<Vec<(BattleOrigin, Resources)>, InvariantError> {
    if loot.values().iter().any(|n| *n < 0 || n % SCALE != 0) {
        return Err(InvariantError("invalid whole loot".into()));
    }
    let mut rows = capacities.to_vec();
    rows.sort_by_key(|row| (row.owner, row.origin));
    let mut seen = BTreeSet::new();
    if rows.iter().any(|row| {
        row.free_capacity < 0 || row.free_capacity % SCALE != 0 || !seen.insert(row.origin)
    }) {
        return Err(InvariantError("invalid loot capacities".into()));
    }
    let mut residual: Vec<i64> = rows.iter().map(|row| row.free_capacity / SCALE).collect();
    let mut shares = vec![[0i64; 3]; rows.len()];
    for (resource, quantity) in loot.values().map(|n| n / SCALE).into_iter().enumerate() {
        if quantity == 0 {
            continue;
        }
        let total = residual
            .iter()
            .try_fold(0i128, |sum, n| sum.checked_add(i128::from(*n)))
            .ok_or_else(|| InvariantError("pooled capacity overflow".into()))?;
        if total == 0 || i128::from(quantity) > total {
            return Err(InvariantError("loot exceeds residual capacity".into()));
        }
        let mut remainder = Vec::with_capacity(rows.len());
        let mut left = quantity;
        for (idx, capacity) in residual.iter().enumerate() {
            let weighted = i128::from(quantity) * i128::from(*capacity);
            let base = i64::try_from(weighted / total)
                .map_err(|_| InvariantError("loot share overflow".into()))?;
            shares[idx][resource] = base;
            left -= base;
            remainder.push((idx, weighted % total));
        }
        remainder.sort_by_key(|(idx, rem)| (std::cmp::Reverse(*rem), *idx));
        for (idx, _) in remainder.into_iter().take(left as usize) {
            shares[idx][resource] += 1;
        }
        for idx in 0..rows.len() {
            residual[idx] -= shares[idx][resource];
        }
    }
    rows.into_iter()
        .zip(shares)
        .map(|(row, shares)| Ok((row.origin, scale_loot(shares)?)))
        .collect()
}

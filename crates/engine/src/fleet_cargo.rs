use crate::*;

/// Reserve exact entries and flight fuel, then distribute whole units within each
/// group. Each group uses the same equal shares and remainder order as Add all.
pub(super) fn load(
    fill: &FleetCargoFill,
    available: Resources,
    fuel: i64,
    capacity: i64,
) -> Result<Resources, GameError> {
    let mut stock = available.values();
    stock[2] = stock[2].checked_sub(fuel).ok_or(GameError::NumericRange)?;
    let mut loaded = fill.minimum.values();
    if fill.groups.is_empty()
        || fill.groups.len() > 3
        || loaded.iter().any(|v| *v < 0 || v % SCALE != 0)
    {
        return Err(GameError::InvalidInput);
    }
    let mut remaining = capacity / SCALE;
    for i in 0..3 {
        if loaded[i] > stock[i] {
            return Err(GameError::InsufficientResources);
        }
        loaded[i] /= SCALE;
        stock[i] /= SCALE;
        remaining -= loaded[i];
    }
    if remaining < 0 {
        return Err(GameError::CargoCapacity);
    }
    let mut seen = [false; 3];
    for group in &fill.groups {
        if group.is_empty() || group.len() > 3 {
            return Err(GameError::InvalidInput);
        }
        let mut indices = Vec::with_capacity(group.len());
        for resource in group {
            let i = match resource {
                ResourceKind::Metal => 0,
                ResourceKind::Crystal => 1,
                ResourceKind::Deuterium => 2,
            };
            if std::mem::replace(&mut seen[i], true) {
                return Err(GameError::InvalidInput);
            }
            indices.push(i);
        }
        while remaining > 0 {
            indices.retain(|&i| loaded[i] < stock[i]);
            if indices.is_empty() {
                break;
            }
            let share = (remaining / indices.len() as i64).max(1);
            for &i in &indices {
                let added = share.min(stock[i] - loaded[i]).min(remaining);
                loaded[i] += added;
                remaining -= added;
            }
        }
    }
    Ok(Resources::from_values(loaded.map(|v| v * SCALE)))
}

fn material_change(reviewed: Resources, current: Resources) -> bool {
    reviewed
        .values()
        .into_iter()
        .zip(current.values())
        .any(|(old, new)| {
            old != new && (i128::from(old) - i128::from(new)).abs() * 10 >= i128::from(old)
        })
}

pub(super) fn authorize(
    terms: FleetTermsData,
    reviewed: &FleetIntent,
    expected: &Hash,
) -> Result<FleetTerms, GameError> {
    // Compare the hashed terms with the reviewed cargo restored; all flight
    // conditions and the fill instruction must still match.
    let mut concrete = terms;
    let actual = concrete.intent.cargo;
    if actual != reviewed.cargo {
        if reviewed.cargo_fill.is_none() || material_change(reviewed.cargo, actual) {
            return Err(GameError::QuoteChanged);
        }
        concrete.intent.cargo = reviewed.cargo;
    }
    if reviewed.cargo_fill.is_none() {
        let fixed = concrete.seal();
        return (fixed.terms_hash == *expected)
            .then_some(fixed)
            .ok_or(GameError::QuoteChanged);
    }
    if concrete.clone().seal().terms_hash != *expected {
        return Err(GameError::QuoteChanged);
    }
    // Store the exact cargo that left. A fleet in flight never auto-fills again.
    concrete.intent.cargo = actual;
    concrete.intent.cargo_fill = None;
    Ok(concrete.seal())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_entries_priority_fuel_and_equal_shares_are_whole_units() {
        let mut plan = FleetCargoFill {
            minimum: Resources::from_values([SCALE, 0, 0]),
            groups: vec![
                vec![ResourceKind::Deuterium],
                vec![ResourceKind::Metal, ResourceKind::Crystal],
            ],
        };
        let available = Resources::from_values([6 * SCALE, 7 * SCALE, 4 * SCALE + SCALE / 2]);
        assert_eq!(
            load(&plan, available, SCALE, 10 * SCALE).unwrap(),
            Resources::from_values([4 * SCALE, 3 * SCALE, 3 * SCALE])
        );
        plan.groups.push(vec![ResourceKind::Deuterium]);
        assert_eq!(
            load(&plan, available, SCALE, 10 * SCALE),
            Err(GameError::InvalidInput)
        );
        plan.groups.pop();
        assert_eq!(
            load(&plan, available, 5 * SCALE, 10 * SCALE),
            Err(GameError::InsufficientResources)
        );
        plan.minimum.metal = 7 * SCALE;
        assert_eq!(
            load(&plan, available, SCALE, 10 * SCALE),
            Err(GameError::InsufficientResources)
        );
        assert!(material_change(
            Resources::default(),
            Resources::from_values([0, 0, SCALE])
        ));
    }
}

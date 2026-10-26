//! Jump over constant-rate intervals; integrate only crossing milliseconds rationally.
use crate::numeric::*;
use crate::*;
use num_traits::{ToPrimitive, Zero};

pub(crate) fn settle(
    body: &Body,
    at: Timestamp,
    rules: &Ruleset,
    rates: impl Fn(&Rational, &Rational) -> Result<[i64; 3], GameError>,
) -> Result<ResourceCheckpoint, InvariantError> {
    settle_balances(
        &body.checkpoint,
        body_storage_capacity(body, rules)?,
        at,
        rules.artifact.hour_ms,
        rates,
    )
}
fn settle_balances(
    checkpoint: &ResourceCheckpoint,
    capacity: Resources,
    at: Timestamp,
    h: i64,
    rates: impl Fn(&Rational, &Rational) -> Result<[i64; 3], GameError>,
) -> Result<ResourceCheckpoint, InvariantError> {
    let mut remaining = at
        .checked_sub(checkpoint.at)
        .filter(|dt| *dt >= 0)
        .ok_or_else(|| InvariantError("time regressed".into()))?;
    let amounts = checkpoint.amounts.values();
    let carry = checkpoint.carry.values();
    if (0..3).any(|i| amounts[i] < 0 || !(0..h).contains(&carry[i])) {
        return Err(InvariantError("invalid resource checkpoint".into()));
    }
    let caps = capacity.values().map(|v| integer(v) * integer(h));
    let mut x = std::array::from_fn(|i| integer(amounts[i]) * integer(h) + integer(carry[i]));
    for i in 0..2 {
        if amounts[i] >= capacity.values()[i] {
            x[i] = integer(amounts[i]) * integer(h);
        }
    }
    // Validate rates even for a zero-length projection/activation.
    rates(&x[2], &caps[2])?;
    while remaining > 0 {
        let r = rates(&x[2], &caps[2])?;
        let crossing = boundary(&x[2], &caps[2], r[2]);
        let jump = crossing
            .as_ref()
            .map(|t| floor(t.clone().min(integer(remaining))))
            .transpose()?
            .unwrap_or(remaining)
            .min(remaining);
        if jump > 0 {
            advance(&mut x, &caps, r, integer(jump));
            remaining -= jump;
        } else {
            let mut fraction = integer(1);
            while fraction > Rational::zero() {
                let r = rates(&x[2], &caps[2])?;
                let segment = boundary(&x[2], &caps[2], r[2])
                    .map_or(fraction.clone(), |t| t.min(fraction.clone()));
                if segment <= Rational::zero() {
                    return Err(InvariantError("nonadvancing fuel boundary".into()));
                }
                advance(&mut x, &caps, r, segment.clone());
                fraction -= segment;
            }
            for value in &mut x {
                *value = Rational::from_integer(value.to_integer());
            }
            remaining -= 1;
        }
    }
    let mut amounts = [0; 3];
    let mut carry = [0; 3];
    for i in 0..3 {
        let value = x[i].to_integer();
        amounts[i] = (&value / h).to_i64().ok_or(GameError::NumericRange)?;
        carry[i] = (&value % h).to_i64().ok_or(GameError::NumericRange)?;
    }
    Ok(ResourceCheckpoint {
        amounts: Resources::from_values(amounts),
        carry: Resources::from_values(carry),
        at,
    })
}
fn boundary(stock: &Rational, cap: &Rational, rate: i64) -> Option<Rational> {
    if rate < 0 && stock > &Rational::zero() {
        Some(
            (if stock > cap {
                stock - cap
            } else {
                stock.clone()
            }) / -integer(rate),
        )
    } else if rate > 0 && stock < cap {
        Some((cap - stock) / integer(rate))
    } else {
        None
    }
}
fn advance(x: &mut [Rational; 3], caps: &[Rational; 3], rates: [i64; 3], dt: Rational) {
    for i in 0..3 {
        if rates[i] >= 0 && x[i] >= caps[i] {
            // Retain over-cap credits, but discard suppressed sub-resource carry.
            continue;
        }
        x[i] += integer(rates[i]) * &dt;
        if rates[i] > 0 && x[i] >= caps[i] {
            x[i] = caps[i].clone();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn checkpoint(deuterium: i64, carry: i64) -> ResourceCheckpoint {
        ResourceCheckpoint {
            amounts: Resources::from_values([0, 0, deuterium]),
            carry: Resources::from_values([0, 0, carry]),
            at: 0,
        }
    }
    #[test]
    fn fractional_depletion_consumes_exactly_remaining_fuel() {
        let cp = checkpoint(0, 1);
        let rates =
            |d: &Rational, _: &Rational| Ok(if d.is_zero() { [1, 0, 0] } else { [3, 0, -2] });
        let result = settle_balances(&cp, Resources::all(100), 1, 3_600_000, rates).unwrap();
        assert_eq!(result.carry.metal, 2);
        assert_eq!(result.carry.deuterium, 0);
        let split = settle_balances(&result, Resources::all(100), 9, 3_600_000, rates).unwrap();
        assert_eq!(
            split,
            settle_balances(&cp, Resources::all(100), 9, 3_600_000, rates).unwrap()
        );
    }
    #[test]
    fn over_cap_consumption_then_net_consumption_and_exhaustion_are_partition_invariant() {
        let cp = checkpoint(15 * SCALE, 0);
        let caps = Resources::all(10 * SCALE);
        let rates = |d: &Rational, cap: &Rational| {
            Ok([
                3 * SCALE,
                0,
                if d > cap {
                    -10 * SCALE
                } else if d.is_zero() {
                    0
                } else {
                    -5 * SCALE
                },
            ])
        };
        for (at, expected) in [
            (1_800_000, 10 * SCALE),
            (5_400_000, 5 * SCALE),
            (9_000_000, 0),
        ] {
            let whole = settle_balances(&cp, caps, at, 3_600_000, rates).unwrap();
            assert_eq!(whole.amounts.deuterium, expected);
            let mut split = cp.clone();
            for time in [
                1, 13, 1_799_999, 1_800_000, 1_800_001, 3_000_007, 5_400_000, 8_999_999, at,
            ] {
                if time > split.at && time <= at {
                    split = settle_balances(&split, caps, time, 3_600_000, rates).unwrap();
                }
            }
            assert_eq!(whole, split);
        }
    }
    #[test]
    fn long_intervals_do_not_tick_and_fractional_boundary_loss_is_bounded() {
        let cp = checkpoint(0, 1);
        let rates =
            |d: &Rational, _: &Rational| Ok(if d.is_zero() { [1, 0, 0] } else { [2, 0, -3] });
        let end = 31_536_000_000;
        let result = settle_balances(&cp, Resources::all(i64::MAX), end, 3_600_000, rates).unwrap();
        assert_eq!(
            i128::from(result.amounts.metal) * 3_600_000 + i128::from(result.carry.metal),
            i128::from(end)
        );
        assert_eq!(result.amounts.deuterium, 0);
    }
}

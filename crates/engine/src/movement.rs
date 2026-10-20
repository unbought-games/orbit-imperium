//! G07 certified enclosing rational intervals. Legacy sqrt12 remains unchanged.
use crate::*;
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, ToPrimitive, Zero};
type Q = BigRational;
fn q(n: i64) -> Q {
    Q::from_integer(n.into())
}
fn root_bounds(x: Q, bits: usize) -> (Q, Q) {
    let numerator = x.numer().sqrt();
    let denominator = x.denom().sqrt();
    if &numerator * &numerator == *x.numer() && &denominator * &denominator == *x.denom() {
        let exact = Q::new(numerator, denominator);
        return (exact.clone(), exact);
    }

    let scale = BigInt::one() << bits;
    let n = (x.clone() * Q::from_integer(&scale * &scale)).to_integer();
    let root = n.sqrt();
    let low = Q::new(root.clone(), scale.clone());
    let high = if &low * &low == x {
        low.clone()
    } else {
        Q::new(root + 1, scale)
    };
    (low, high)
}
fn rounded(x: Q) -> BigInt {
    (x + Q::new(1.into(), 2.into())).to_integer()
}
/// `(speed, fuel coefficient, count)` for each distinct type; output ms and micro-D.
pub fn exact_flight_arithmetic(
    distance: i64,
    profiles: &[(i64, i64, i64)],
    percent: i64,
    speed: i64,
) -> Result<(DurationMs, i64), GameError> {
    if distance <= 0
        || profiles.is_empty()
        || !(1..=100).contains(&speed)
        || !(10..=100).contains(&percent)
        || percent % 10 != 0
        || profiles
            .iter()
            .any(|(v, b, n)| *v <= 0 || *b <= 0 || *n <= 0)
    {
        return Err(GameError::InvalidInput);
    }
    let min = profiles
        .iter()
        .map(|p| p.0)
        .min()
        .ok_or(GameError::InvalidInput)?;
    let mut bits = 32usize;
    let seconds = loop {
        let (low, high) = root_bounds(q(1000) * q(distance) / q(min), bits);
        let a = rounded((q(35000) / q(percent) * low + q(10)) / q(speed));
        let b = rounded((q(35000) / q(percent) * high + q(10)) / q(speed));
        if a == b {
            break a
                .to_i64()
                .ok_or(GameError::NumericRange)?
                .max(10 / speed + 1);
        }
        bits = bits.checked_mul(2).ok_or(GameError::NumericRange)?;
    };
    let denominator = q(seconds) * q(speed) - q(10);
    let mut bits = 32usize;
    let fuel = loop {
        let (mut low, mut high) = (Q::zero(), Q::zero());
        for &(v, b, n) in profiles {
            let (a, z) = root_bounds(q(10) * q(distance) / q(v), bits);
            let a = q(1) + q(3500) / &denominator * a;
            let z = q(1) + q(3500) / &denominator * z;
            let c = q(n) * q(b) * q(distance) / q(35000);
            low += &c * &a * &a;
            high += c * &z * &z;
        }
        let a = rounded(low);
        let b = rounded(high);
        if a == b {
            break a
                .to_i64()
                .and_then(|v| v.checked_add(1))
                .and_then(|v| v.checked_mul(SCALE))
                .ok_or(GameError::NumericRange)?;
        }
        if a > BigInt::from(i64::MAX / SCALE) {
            return Err(GameError::NumericRange);
        }
        bits = bits.checked_mul(2).ok_or(GameError::NumericRange)?;
    };
    Ok((
        seconds
            .checked_mul(1000)
            .filter(|v| *v <= MAX_WIRE_MS)
            .ok_or(GameError::NumericRange)?,
        fuel,
    ))
}
pub fn galaxy_distance(a: Coordinates, b: Coordinates) -> i64 {
    if a.galaxy != b.galaxy {
        20000 * i64::from(a.galaxy.abs_diff(b.galaxy))
    } else if a.system != b.system {
        2700 + 95 * i64::from(a.system.abs_diff(b.system))
    } else if a.position != b.position {
        1000 + 5 * i64::from(a.position.abs_diff(b.position))
    } else {
        5
    }
}

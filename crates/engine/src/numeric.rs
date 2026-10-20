use crate::GameError;
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, ToPrimitive, Zero};
pub(crate) type Rational = BigRational;
pub(crate) fn integer(n: i64) -> Rational {
    Rational::from_integer(BigInt::from(n))
}
pub(crate) fn ratio(n: i64, d: i64) -> Result<Rational, GameError> {
    if d <= 0 {
        return Err(GameError::NumericRange);
    }
    Ok(Rational::new(n.into(), d.into()))
}
/// Limit intermediate allocation, not gameplay level. Representable i64 costs fail much earlier.
pub(crate) fn bounded(value: Rational) -> Result<Rational, GameError> {
    if value.numer().bits() > 512 || value.denom().bits() > 512 {
        Err(GameError::NumericRange)
    } else {
        Ok(value)
    }
}
pub(crate) fn power(mut base: Rational, mut exponent: u32) -> Result<Rational, GameError> {
    let mut result = Rational::one();
    while exponent > 0 {
        if exponent & 1 == 1 {
            result = bounded(result * base.clone())?
        }
        exponent >>= 1;
        if exponent > 0 {
            base = bounded(base.clone() * base)?
        }
    }
    Ok(result)
}
pub(crate) fn floor(value: Rational) -> Result<i64, GameError> {
    if value < Rational::zero() {
        return Err(GameError::NumericRange);
    }
    value.to_integer().to_i64().ok_or(GameError::NumericRange)
}
pub(crate) fn add(a: i64, b: i64) -> Result<i64, GameError> {
    a.checked_add(b)
        .filter(|v| *v >= 0)
        .ok_or(GameError::NumericRange)
}

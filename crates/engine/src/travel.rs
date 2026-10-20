use crate::numeric::*;
use crate::*;
use num_bigint::BigInt;
use num_traits::{One, ToPrimitive, Zero};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TransportTermsRequest {
    pub origin: Coordinates,
    pub target: Coordinates,
    pub ships: Vec<ShipStack>,
    pub combustion: u32,
    pub speed_percent: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TravelTerms {
    pub duration: DurationMs,
    pub fuel: i64,
    pub capacity: i64,
    pub maximum_payload: i64,
}
fn square_root(value: Rational) -> Result<Rational, GameError> {
    if value < Rational::zero() {
        return Err(GameError::NumericRange);
    }
    let scale = BigInt::from(1_000_000_000_000i64);
    let n = (value * Rational::from_integer(&scale * &scale)).to_integer();
    let mut root = n.clone();
    let mut next = (&root + BigInt::one()) / 2;
    while next < root {
        root = next;
        next = (&root + &n / &root) / 2;
    }
    Ok(Rational::new(root, scale))
}
/// Returns the integer numerator of the specified sqrt12 approximation, denominator 10^12.
pub fn sqrt12(numerator: u128, denominator: u128) -> Result<u128, GameError> {
    if denominator == 0 {
        return Err(GameError::NumericRange);
    }
    let root = square_root(Rational::new(numerator.into(), denominator.into()))?;
    let scaled = root * integer(1_000_000_000_000);
    scaled.to_integer().to_u128().ok_or(GameError::NumericRange)
}
fn half_up(value: Rational) -> Result<i64, GameError> {
    floor(value + ratio(1, 2)?)
}
pub fn travel_terms(
    request: &TransportTermsRequest,
    rules: &Ruleset,
) -> Result<TravelTerms, GameError> {
    if request.ships.is_empty()
        || request.speed_percent == 0
        || request.speed_percent > 100
        || !request.speed_percent.is_multiple_of(10)
    {
        return Err(GameError::InvalidInput);
    }
    let a = request.origin;
    let b = request.target;
    if [
        a.galaxy, a.system, a.position, b.galaxy, b.system, b.position,
    ]
    .contains(&0)
    {
        return Err(GameError::InvalidInput);
    }
    if rules
        .artifact
        .universe
        .as_ref()
        .is_some_and(|p| !p.contains(a) || !p.contains(b))
    {
        return Err(GameError::InvalidInput);
    }
    let distance = if a.galaxy != b.galaxy {
        i64::from(a.galaxy.abs_diff(b.galaxy)) * 20000
    } else if a.system != b.system {
        2700 + i64::from(a.system.abs_diff(b.system)) * 95
    } else if a.position != b.position {
        1000 + i64::from(a.position.abs_diff(b.position)) * 5
    } else {
        5
    };
    let mut seen = BTreeSet::new();
    let mut profiles = Vec::new();
    let mut capacity = 0;
    for stack in &request.ships {
        if stack.count <= 0 || !seen.insert((stack.owner, stack.ship_type)) {
            return Err(GameError::InvalidInput);
        }
        let profile = rules
            .artifact
            .ships
            .get(&stack.ship_type)
            .ok_or(GameError::UnavailableContent)?;
        let speed = integer(profile.base_speed)
            * (integer(1)
                + ratio(profile.drive_coefficient[0], profile.drive_coefficient[1])?
                    * integer(i64::from(request.combustion)));
        let contribution = stack
            .count
            .checked_mul(profile.capacity)
            .and_then(|v| v.checked_mul(SCALE))
            .ok_or(GameError::NumericRange)?;
        capacity = add(capacity, contribution)?;
        profiles.push((speed, profile.fuel, stack.count));
    }
    let min_speed = profiles
        .iter()
        .map(|(v, _, _)| v)
        .min()
        .ok_or(GameError::InvalidInput)?
        .clone();
    let speed = integer(i64::from(rules.speed));
    let seconds = half_up(
        (ratio(35000, i64::from(request.speed_percent))?
            * square_root(integer(1000) * integer(distance) / min_speed)?
            + integer(10))
            / speed.clone(),
    )?;
    let denominator = integer(seconds) * speed - integer(10);
    if seconds <= 0 || denominator <= Rational::zero() {
        return Err(GameError::NumericRange);
    }
    let mut fuel = Rational::zero();
    for (v, coefficient, count) in profiles {
        let term = integer(1)
            + integer(3500) / denominator.clone()
                * square_root(integer(10) * integer(distance) / v)?;
        fuel +=
            integer(count) * integer(coefficient) * ratio(distance, 35000)? * term.clone() * term;
    }
    let fuel = add(1, half_up(fuel)?)?
        .checked_mul(SCALE)
        .ok_or(GameError::NumericRange)?;
    let maximum_payload = capacity
        .checked_sub(fuel)
        .filter(|n| *n >= 0)
        .ok_or(GameError::CargoCapacity)?;
    Ok(TravelTerms {
        duration: seconds.checked_mul(1000).ok_or(GameError::NumericRange)?,
        fuel,
        capacity,
        maximum_payload,
    })
}

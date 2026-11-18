//! Versioned destruction probabilities applied after ordinary lunar combat.
use crate::transition::{Fault, invariant};
use crate::*;
use num_bigint::BigUint;
use serde::Serialize;

pub const MOON_DESTRUCTION_PROFILE: &str = "moon-destruction-v1";
const PPM: u32 = 1_000_000;

pub fn moon_destruction_enabled(r: &Ruleset) -> bool {
    r.attacks()
        && r.artifact.ships.contains_key(&ShipType::Dreadnought)
        && r.artifact.world.as_ref().is_some_and(|world| {
            world.moons && world.moon_destruction.as_deref() == Some(MOON_DESTRUCTION_PROFILE)
        })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MoonDestructionOdds {
    pub diameter_km: u32,
    pub moon_chance_ppm: u32,
    pub fleet_loss_ppm: u32,
}

/// Find floor(1_000_000 √n − 10_000 √(dn)) exactly, clamped to [0,1_000_000].
/// For a candidate t, A ≥ B + t iff A² − B² − t² ≥ 2Bt. Check the sign before
/// squaring both sides again; the resulting comparison contains only integers.
pub fn moon_destruction_odds(diameter_km: u32, dreadnoughts: u64) -> MoonDestructionOdds {
    let fleet_loss_ppm = (25_000_000 * u64::from(diameter_km))
        .isqrt()
        .min(u64::from(PPM)) as u32;
    let mut low = 0;
    if diameter_km < 10_000 && dreadnoughts > 0 {
        let a_sq = BigUint::from(dreadnoughts) * 1_000_000_000_000u64;
        let b_sq = BigUint::from(dreadnoughts) * diameter_km * 100_000_000u32;
        let diff = a_sq - &b_sq;
        let mut high = PPM;
        while low < high {
            let t = low + (high - low).div_ceil(2);
            let t_sq = BigUint::from(t) * t;
            let at_least_t = diff >= t_sq && (&diff - &t_sq).pow(2) >= &b_sq * &t_sq * 4u32;
            if at_least_t {
                low = t;
            } else {
                high = t - 1;
            }
        }
    }
    MoonDestructionOdds {
        diameter_km,
        moon_chance_ppm: low,
        fleet_loss_ppm,
    }
}

#[derive(Serialize)]
pub struct FleetQuoteView {
    #[serde(flatten)]
    pub terms: FleetTerms,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moon_destruction: Option<MoonDestructionOdds>,
}

/// Odds annotate this read only. Immutable moon identity and launch manifest
/// already bind the inputs, so a flight has no separate stored estimate.
pub fn quote_fleet_with_odds(
    s: &GameState,
    owner: PlayerId,
    intent: &FleetIntent,
    at: Timestamp,
    rules: &Ruleset,
) -> Result<FleetQuoteView, GameError> {
    let terms = quote_fleet(s, owner, intent, at, rules)?;
    let moon_destruction = match (intent.mission, &intent.destination) {
        (Mission::DestroyMoon, MissionDestination::Body { id, .. }) => {
            let moon = world_facts(s)
                .map_err(|_| GameError::PolicyUnavailable)?
                .records
                .moons
                .get(id)
                .ok_or(GameError::PolicyUnavailable)?;
            let n = intent
                .ships
                .iter()
                .find(|ship| ship.ship_type == ShipType::Dreadnought)
                .ok_or(GameError::InsufficientShips)?
                .count;
            Some(moon_destruction_odds(moon.diameter_km, n as u64))
        }
        _ => None,
    };
    Ok(FleetQuoteView {
        terms,
        moon_destruction,
    })
}

#[derive(Serialize)]
pub(crate) struct DestructionOutcome {
    #[serde(flatten)]
    odds: MoonDestructionOdds,
    #[serde(with = "decimal_wire")]
    surviving_dreadnoughts: i64,
    pub(crate) moon_destroyed: bool,
    pub(crate) fleet_lost: bool,
}

pub(crate) fn resolve(
    s: &GameState,
    i: &OrderedInput,
    target: BodyId,
    survivors: &MissionFleet,
    audits: &mut Vec<serde_json::Value>,
) -> Result<Option<DestructionOutcome>, Fault> {
    let Some(stack) = survivors
        .ships
        .iter()
        .find(|ship| ship.ship_type == ShipType::Dreadnought)
    else {
        return Ok(None);
    };
    let facts = world_facts(s)?;
    let moon = facts
        .records
        .moons
        .get(&target)
        .ok_or_else(|| invariant("missing moon at destruction"))?;
    let n = u64::try_from(stack.count).map_err(|_| invariant("negative surviving ship count"))?;
    let odds = moon_destruction_odds(moon.diameter_km, n);
    let mut rng = RandomStream::new(&facts.secret, s.universe, s.epoch, i.id, "moon-destroy")?;
    let denominator = BigUint::from(PPM);
    let moon_destroyed = rng.bernoulli(&odds.moon_chance_ppm.into(), &denominator)?;
    let fleet_lost = rng.bernoulli(&odds.fleet_loss_ppm.into(), &denominator)?;
    let outcome = DestructionOutcome {
        odds,
        surviving_dreadnoughts: stack.count,
        moon_destroyed,
        fleet_lost,
    };
    audits.push(serde_json::json!({"kind":"MoonDestruction","target":target,"profile":MOON_DESTRUCTION_PROFILE,
        "result":outcome,"cursor":rng.cursor()}));
    Ok(Some(outcome))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantization_is_exact_at_square_boundaries_and_clamps_extreme_counts() {
        for (diameter, count, moon, fleet) in [
            (8_000, 10, 333_850, 447_213),
            (8_000, 1, 105_572, 447_213),
            (8_100, 4, 200_000, 450_000),
            (8_944, u64::MAX, 1_000_000, 472_863),
            (10_000, u64::MAX, 0, 500_000),
            (40_000, 1, 0, 1_000_000),
        ] {
            let odds = moon_destruction_odds(diameter, count);
            assert_eq!((odds.moon_chance_ppm, odds.fleet_loss_ppm), (moon, fleet));
        }
    }
}

use super::*;

const ELIGIBLE_MASK: u16 = (1 << 9) - 1;

/// Allocate one homeworld from authoritative prior homeworlds and unavailable slots.
/// `unavailable` includes planets and any unreleased tombstones; moons do not block slots.
/// Counts and masks are derived for this call, never persisted.
pub fn balanced_homeworld(
    secret: &[u8; 32],
    universe: UniverseId,
    epoch: Epoch,
    profile: &UniverseProfile,
    ordinal: usize,
    homeworlds: &[Coordinates],
    unavailable: &[Coordinates],
) -> Result<Homeworld, RulesError> {
    profile.validate()?;
    if profile.id != "signup-v2" {
        return Err(RulesError::InvalidReference);
    }
    let total = (profile.galaxies * profile.systems_per_galaxy) as usize;
    let mut counts = vec![0u8; total];
    let mut occupied = vec![0u16; total];
    let system_index = |c: Coordinates| -> Result<usize, RulesError> {
        if !profile.contains(c) {
            return Err(RulesError::Range);
        }
        Ok(((c.galaxy - 1) * profile.systems_per_galaxy + c.system - 1) as usize)
    };
    let mut inhabited_width = 0;
    for &c in homeworlds {
        let i = system_index(c)?;
        if !(4..=12).contains(&c.position) {
            return Err(RulesError::Range);
        }
        let bit = 1 << (c.position - 4);
        if occupied[i] & bit != 0 {
            return Err(RulesError::Range);
        }
        inhabited_width = inhabited_width.max(i + 1);
        counts[i] += 1;
        occupied[i] |= bit;
    }
    for &c in unavailable {
        let i = system_index(c)?;
        if (4..=12).contains(&c.position) {
            occupied[i] |= 1 << (c.position - 4);
        }
    }
    // Keep one free eligible expansion slot per homeworld after this admission.
    // The new homeworld itself needs one more free slot. Choose the smallest
    // contiguous prefix containing existing homes and meeting that budget,
    // accounting for actual occupancy. Never shrink away from an inhabited system.
    // If the map cannot meet the reserve, use all remaining capacity instead.
    let expansion_slots = homeworlds.len().checked_add(1).ok_or(RulesError::Range)?;
    let mut free = 0usize;
    let width = occupied
        .iter()
        .position(|mask| {
            free += (ELIGIBLE_MASK & !mask).count_ones() as usize;
            free > expansion_slots // one additional slot for the arriving homeworld
        })
        .map_or(total, |i| i + 1)
        .max(inhabited_width);
    let min = (0..width)
        .filter(|&i| occupied[i] != ELIGIBLE_MASK)
        .map(|i| counts[i])
        .min()
        .ok_or(RulesError::Range)?;
    let candidates: Vec<_> = (0..width)
        .filter(|&i| counts[i] == min && occupied[i] != ELIGIBLE_MASK)
        .collect();
    let input = InputId(derived_id(
        InputId(universe.0),
        &format!("balanced-homeworld-v2-{ordinal}"),
    ));
    let mut rng = RandomStream::new(secret, universe, epoch, input, "homeworld")
        .map_err(|_| RulesError::Range)?;
    let index = candidates[rng
        .uniform_u64(candidates.len() as u64)
        .map_err(|_| RulesError::Range)? as usize];
    let positions: Vec<_> = (4..=12)
        .filter(|p| occupied[index] & (1 << (p - 4)) == 0)
        .collect();
    let position = positions[rng
        .uniform_u64(positions.len() as u64)
        .map_err(|_| RulesError::Range)? as usize];
    let max_temperature = HOMEWORLD_TEMPERATURE_LOWS[(position - 1) as usize]
        + rng.uniform_u64(41).map_err(|_| RulesError::Range)? as i32;
    let (block, offset) = rng.cursor();
    Ok(Homeworld {
        coordinates: Coordinates {
            galaxy: index as u32 / profile.systems_per_galaxy + 1,
            system: index as u32 % profile.systems_per_galaxy + 1,
            position,
        },
        diameter_km: 12800,
        fields: 163,
        max_temperature,
        rng_bytes: block * 32 + u64::from(offset),
    })
}

impl Homeworld {
    /// Validate saved creation facts without reallocating against today's occupancy.
    pub fn validate(&self, profile: &UniverseProfile) -> Result<(), RulesError> {
        profile.validate()?;
        let c = self.coordinates;
        if !profile.contains(c)
            || !(4..=12).contains(&c.position)
            || self.fields != 163
            || self.diameter_km != 12800
        {
            return Err(RulesError::Range);
        }
        let low = HOMEWORLD_TEMPERATURE_LOWS[(c.position - 1) as usize];
        if !(low..=low + 40).contains(&self.max_temperature) || self.rng_bytes == 0 {
            return Err(RulesError::Range);
        }
        Ok(())
    }
}

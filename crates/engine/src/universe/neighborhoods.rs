use super::*;
use std::collections::BTreeSet;

const ELIGIBLE_MASK: u16 = (1 << 9) - 1;
const TARGET_PLAYERS_PER_SYSTEM: usize = 2;
const EXPANSION_DISTANCE: usize = 10;
// exp(-distance / 5), scaled to integers. Fixed weights avoid platform-dependent
// floating-point sampling while retaining the simulator's proximity preference.
const PROXIMITY: [u64; 11] = [
    1_000_000_000,
    818_730_753,
    670_320_046,
    548_811_636,
    449_328_964,
    367_879_441,
    301_194_212,
    246_596_964,
    201_896_518,
    165_298_888,
    135_335_283,
];

/// Current automatic admission policy for signup universes, including existing
/// signup-v2 worlds. Historical profile/rules hashes and saved homes stay intact.
/// Grow around existing homes toward two players per system, in Galaxy 1 only.
/// Colonies/tombstones block positions but do not contribute to player density.
/// Every count, neighborhood and candidate is derived from the supplied facts.
pub fn neighborhood_homeworld(
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
    let systems = profile.systems_per_galaxy as usize;
    let mut counts = vec![0u8; systems];
    let mut occupied = vec![0u16; systems];
    let mut seen = BTreeSet::new();
    for &c in homeworlds {
        if !profile.contains(c) || !(4..=12).contains(&c.position) || !seen.insert(c) {
            return Err(RulesError::Range);
        }
        if c.galaxy == 1 {
            let i = c.system as usize - 1;
            counts[i] += 1;
            occupied[i] |= 1 << (c.position - 4);
        }
    }
    for &c in unavailable {
        if !profile.contains(c) {
            return Err(RulesError::Range);
        }
        if c.galaxy == 1 && (4..=12).contains(&c.position) {
            occupied[c.system as usize - 1] |= 1 << (c.position - 4);
        }
    }
    let free: Vec<_> = (0..systems)
        .filter(|&i| occupied[i] != ELIGIBLE_MASK)
        .collect();
    if free.is_empty() {
        // Deliberately do not fall through to another galaxy.
        return Err(RulesError::Range);
    }
    let input = InputId(derived_id(
        InputId(universe.0),
        &format!("neighborhood-homeworld-v3-{ordinal}"),
    ));
    let mut rng = RandomStream::new(secret, universe, epoch, input, "homeworld")
        .map_err(|_| RulesError::Range)?;
    let candidates = neighborhood_candidates(&counts, &free);
    let total: u64 = candidates.iter().map(|(_, weight)| weight).sum();
    let mut draw = rng.uniform_u64(total).map_err(|_| RulesError::Range)?;
    let index = candidates
        .into_iter()
        .find_map(|(index, weight)| {
            if draw < weight {
                Some(index)
            } else {
                draw -= weight;
                None
            }
        })
        .ok_or(RulesError::Range)?;
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
            galaxy: 1,
            system: index as u32 + 1,
            position,
        },
        diameter_km: 12800,
        fields: 163,
        max_temperature,
        rng_bytes: block * 32 + u64::from(offset),
    })
}

fn neighborhood_candidates(counts: &[u8], free: &[usize]) -> Vec<(usize, u64)> {
    let Some(first) = counts.iter().position(|&n| n > 0) else {
        // An empty Galaxy 1 starts at a seeded random free system.
        return free.iter().map(|&i| (i, 1)).collect();
    };
    let last = counts.iter().rposition(|&n| n > 0).unwrap();
    let mut prefix = vec![0usize; counts.len() + 1];
    for (i, &n) in counts.iter().enumerate() {
        prefix[i + 1] = prefix[i] + usize::from(n);
    }
    let max_span =
        (last - first + 1).max((prefix[counts.len()] + 1).div_ceil(TARGET_PLAYERS_PER_SYSTEM));
    // Two linear scans find the distance to the closest occupied system.
    let mut distance = vec![counts.len(); counts.len()];
    let mut nearest = counts.len();
    for i in 0..counts.len() {
        nearest = if counts[i] > 0 { 0 } else { nearest + 1 };
        distance[i] = nearest;
    }
    nearest = counts.len();
    for i in (0..counts.len()).rev() {
        nearest = if counts[i] > 0 { 0 } else { nearest + 1 };
        distance[i] = distance[i].min(nearest);
    }
    let candidates: Vec<_> = free
        .iter()
        .copied()
        .filter(|&i| distance[i] <= EXPANSION_DISTANCE && last.max(i) - first.min(i) < max_span)
        .map(|i| {
            let lo = i.saturating_sub(EXPANSION_DISTANCE);
            let hi = (i + EXPANSION_DISTANCE + 1).min(counts.len());
            let local_players = (prefix[hi] - prefix[lo]) as u128;
            let target_players = ((hi - lo) * TARGET_PLAYERS_PER_SYSTEM) as u128;
            let target_fourth = target_players.pow(4);
            let weight = u128::from(PROXIMITY[distance[i]]) * target_fourth
                / (target_fourth + local_players.pow(4))
                / (1 + u128::from(counts[i])).pow(2);
            (i, (weight as u64).max(1))
        })
        .collect();
    if !candidates.is_empty() {
        return candidates;
    }
    // Colonies can fill the whole neighborhood. Relax span/distance only then,
    // choosing the nearest free system in Galaxy 1 instead of rejecting early.
    let nearest_free = free.iter().map(|&i| distance[i]).min().unwrap();
    free.iter()
        .copied()
        .filter(|&i| distance[i] == nearest_free)
        .map(|i| (i, 1))
        .collect()
}

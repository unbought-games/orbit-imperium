//! Completed-research effects, independent of mission availability.
//! G06 colonization consumes these at launch (position only) and again at arrival
//! (position and count). A full capacity never blocks launch. No reservation,
//! generation, ownership mutation or expedition capability is implied here.

/// Additional planets, excluding the homeworld. Moons never count as colonies.
pub fn astrophysics_colony_capacity(completed_level: u32) -> u32 {
    completed_level / 2 + completed_level % 2
}

/// Total owned planets, including the homeworld; no fixed nine-planet ceiling.
pub fn astrophysics_planet_capacity(completed_level: u32) -> u32 {
    1 + astrophysics_colony_capacity(completed_level)
}

/// Minimum completed Astrophysics for a colony position. Homeworld admission has
/// its own placement policy and must not use this gate. Position 16 is not a planet.
pub fn colony_position_required_astrophysics(position: u32) -> Option<u32> {
    match position {
        4..=12 => Some(1),
        3 | 13 => Some(4),
        2 | 14 => Some(6),
        1 | 15 => Some(8),
        _ => None,
    }
}

pub fn colony_position_unlocked(completed_level: u32, position: u32) -> bool {
    colony_position_required_astrophysics(position).is_some_and(|level| completed_level >= level)
}

/// Arrival-time count guard only. Caller derives the current count of live owned
/// planets (including the homeworld, excluding moons) from complete membership
/// facts, and serializes arrival against that membership. No in-flight claims.
pub fn colony_capacity_available(completed_level: u32, owned_planets: u64) -> bool {
    owned_planets >= 1 && owned_planets < u64::from(astrophysics_planet_capacity(completed_level))
}

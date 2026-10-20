//! Emit actual engine allocations as CSV for placement inspection.
use orbit_engine::*;
use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 4 {
        return Err("usage: placement_simulation GALAXIES SYSTEMS PLAYERS SEED_BYTE".into());
    }
    let profile = UniverseProfile::signup(args[0].parse()?, args[1].parse()?)?;
    let players: usize = args[2].parse()?;
    let seed: u8 = args[3].parse()?;
    if players > profile.homeworld_capacity()? as usize {
        return Err("population exceeds homeworld capacity".into());
    }
    let mut homes = Vec::new();
    println!("player,galaxy,system,position");
    for ordinal in 0..players {
        let world = balanced_homeworld(
            &[seed; 32],
            uuid::Uuid::from_u128(1).into(),
            uuid::Uuid::from_u128(2).into(),
            &profile,
            ordinal,
            &homes,
            &homes,
        )?;
        let c = world.coordinates;
        homes.push(c);
        println!("{},{},{},{}", ordinal + 1, c.galaxy, c.system, c.position);
    }
    Ok(())
}

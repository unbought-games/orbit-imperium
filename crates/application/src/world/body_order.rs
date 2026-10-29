use crate::progression::BodyV3;
use orbit_engine::BodyKind;
use std::collections::BTreeMap;

/// Homeworlds have no colony genesis. Colonies follow in acquisition order,
/// with IDs breaking timestamp ties. Keep moons beside their planet and orphan
/// moons last. All clients consume this order, including the default selection.
pub(super) fn order_bodies(bodies: &mut [BodyV3]) {
    let mut planets: Vec<_> = bodies
        .iter()
        .filter(|body| body.kind == BodyKind::Planet)
        .collect();
    planets.sort_by_key(|body| (body.colony.as_ref().map(|c| c.created_at), body.id));
    let positions: BTreeMap<_, _> = planets
        .iter()
        .enumerate()
        .map(|(index, body)| (body.coordinates, index))
        .collect();
    bodies.sort_by_key(|body| {
        (
            positions
                .get(&body.coordinates)
                .copied()
                .unwrap_or(positions.len()),
            body.kind,
            body.id,
        )
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progression::ColonyDto;
    use orbit_engine::{BodyId, Coordinates, Resources};
    use uuid::Uuid;

    fn planet(id: u128, position: u32, created_at: Option<i64>) -> BodyV3 {
        BodyV3 {
            silo: None,
            max_temperature: None,
            name: None,
            colony: created_at.map(|created_at| ColonyDto {
                created_at,
                diameter_km: 12000,
                min_temperature: 0,
                max_temperature: 40,
                profile: "oi-redesign-reconstructed-v1".into(),
            }),
            id: BodyId(Uuid::from_u128(id)),
            coordinates: Coordinates {
                galaxy: 1,
                system: 1,
                position,
            },
            kind: BodyKind::Planet,
            amounts: Resources::default().into(),
            capacity: Resources::default().into(),
            levels: BTreeMap::new(),
            fields: 100,
            fields_used: 0,
            fields_reserved: 0,
            energy: crate::views::EnergyDto {
                supply: "0".into(),
                demand: "0".into(),
                utilization: "0".into(),
            },
            inventories: vec![],
        }
    }

    fn ids(bodies: &[BodyV3]) -> Vec<u128> {
        bodies.iter().map(|body| body.id.0.as_u128()).collect()
    }

    #[test]
    fn homeworld_precedes_colonies_regardless_of_id_coordinates_or_name() {
        let mut bodies = vec![
            planet(1, 1, Some(300)),
            planet(9, 15, None),
            planet(4, 8, Some(100)),
        ];
        bodies[0].name = Some("A colony".into());
        bodies[1].name = Some("Z homeworld".into());
        order_bodies(&mut bodies);
        assert_eq!(ids(&bodies), [9, 4, 1]);
    }

    #[test]
    fn zero_timestamps_and_legacy_planets_have_deterministic_ties() {
        let mut bodies = vec![
            planet(2, 15, Some(0)),
            planet(9, 10, None),
            planet(1, 1, Some(0)),
            planet(8, 3, None),
        ];
        order_bodies(&mut bodies);
        assert_eq!(ids(&bodies), [8, 9, 1, 2]);
        bodies.reverse();
        order_bodies(&mut bodies);
        assert_eq!(ids(&bodies), [8, 9, 1, 2]);
    }

    #[test]
    fn moons_follow_their_planet_and_orphans_follow_all_planets() {
        let mut home_moon = planet(2, 15, None);
        home_moon.kind = BodyKind::Moon;
        let mut colony_moon = planet(1, 1, None);
        colony_moon.kind = BodyKind::Moon;
        let mut orphan = planet(3, 8, None);
        orphan.kind = BodyKind::Moon;
        let mut bodies = vec![
            colony_moon,
            orphan,
            planet(4, 1, Some(100)),
            home_moon,
            planet(9, 15, None),
        ];
        order_bodies(&mut bodies);
        assert_eq!(ids(&bodies), [9, 2, 4, 1, 3]);
        order_bodies(&mut []);
    }
}

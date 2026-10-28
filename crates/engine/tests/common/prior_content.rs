use super::*;

/// Reconstruct retained worlds before Battlecruiser and its dependencies existed.
pub fn without_battlecruiser(artifact: RulesArtifact) -> RulesArtifact {
    without_ship(artifact, ShipType::Battlecruiser)
}

pub fn without_native_hyperspace_ships(artifact: RulesArtifact) -> RulesArtifact {
    without_ship(
        without_ship(without_battlecruiser(artifact), ShipType::Battleship),
        ShipType::Destroyer,
    )
}

fn without_ship(mut artifact: RulesArtifact, ship: ShipType) -> RulesArtifact {
    let item = ManufacturedItem::Ship(ship);
    artifact.ships.remove(&ship);
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != item);
    let combat = &mut artifact.world.as_mut().unwrap().combat;
    combat.units.retain(|u| u.item != item);
    combat
        .rapid_fire
        .retain(|r| r.shooter != item && r.target != item);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    entry.enabled = false;
    entry.requirements.clear();
    artifact
}

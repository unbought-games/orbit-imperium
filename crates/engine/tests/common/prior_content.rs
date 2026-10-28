use super::*;

/// Reconstruct retained worlds before Battlecruiser and its dependencies existed.
pub fn without_battlecruiser(mut artifact: RulesArtifact) -> RulesArtifact {
    let item = ManufacturedItem::Ship(ShipType::Battlecruiser);
    artifact.ships.remove(&ShipType::Battlecruiser);
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

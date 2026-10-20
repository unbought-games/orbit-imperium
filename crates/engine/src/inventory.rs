use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", deny_unknown_fields)]
pub enum ManufacturedItem {
    Ship(ShipType),
    Defense(DefenseId),
    Missile(MissileId),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InventoryStack {
    pub body: BodyId,
    pub owner: PlayerId,
    pub item: ManufacturedItem,
    pub count: i64,
    pub revision: i64,
}
pub fn mobile_inventory(
    state: &GameState,
    body: BodyId,
    owner: PlayerId,
    rules: &Ruleset,
) -> Result<Vec<ShipStack>, InvariantError> {
    if !state.coverage.inventory_owners.contains(&(body, owner)) {
        return Err(InvariantError("uncovered inventory".into()));
    }
    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for item in state
        .inventories
        .iter()
        .filter(|i| i.body == body && i.owner == owner)
    {
        if item.count < 0 || item.revision < 0 || !seen.insert(item.item) {
            return Err(InvariantError("invalid inventory".into()));
        }
        match item.item {
            ManufacturedItem::Ship(ship_type)
                if rules.artifact.catalog.is_empty()
                    || rules
                        .artifact
                        .catalog
                        .iter()
                        .any(|e| e.key == CatalogKey::Ship(ship_type) && e.enabled && e.mobile) =>
            {
                out.push(ShipStack {
                    owner,
                    ship_type,
                    count: item.count,
                })
            }
            _ => {}
        }
    }
    out.sort_by_key(|s| (s.owner, s.ship_type));
    Ok(out)
}

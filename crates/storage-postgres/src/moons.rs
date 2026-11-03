use crate::{ordering::Tx, *};
use orbit_engine::*;

pub(crate) async fn insert_moon(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    facts: &GameState,
    change: &ChangeSet,
    body: &Body,
) -> Result<(), StoreError> {
    let genesis = change
        .world
        .as_ref()
        .and_then(|w| w.records.moons.get(&body.id))
        .ok_or(StoreError::CorruptData)?;
    let parent = facts
        .bodies
        .get(&genesis.parent)
        .ok_or(StoreError::CorruptData)?;
    if genesis.input != i.id
        || genesis.created_at != i.at
        || body.id != BodyId(derived_id(i.id, "moon:0"))
        || body.universe != i.universe
        || body.kind != BodyKind::Moon
        || body.revision != 0
        || parent.kind != BodyKind::Planet
        || parent.owner != body.owner
        || parent.coordinates != body.coordinates
        || !facts.coverage.owned_body_players.contains(&body.owner)
    {
        return Err(StoreError::CorruptData);
    }
    // The location scope serializes battles; body-kind and parent uniqueness are
    // database backstops, in the same transaction as debris and report delivery.
    crate::colonization::insert_body(tx, i, body).await
}

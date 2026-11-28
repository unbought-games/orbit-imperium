//! Wake the command uplink and refresh leadership-dependent private game state.
use super::*;
use std::collections::BTreeSet;

pub(crate) async fn viewers(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
    before: Option<PlayerId>,
    after: Option<PlayerId>,
    mut players: BTreeSet<PlayerId>,
) -> Result<(), StoreError> {
    if before != after {
        players.extend(before.into_iter().chain(after));
    }
    for player in players {
        // Social mutations do not advance gameplay time or foreground presence.
        crate::updates::invalidate_viewer(tx, universe, epoch, player).await?;
    }
    Ok(())
}

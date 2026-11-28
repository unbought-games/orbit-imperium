//! Leadership is a source dependency of the private game view.
use super::*;
use std::collections::BTreeSet;

pub(crate) async fn leadership(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
    before: Option<PlayerId>,
    after: Option<PlayerId>,
) -> Result<(), StoreError> {
    if before == after {
        return Ok(());
    }
    let players: BTreeSet<_> = before.into_iter().chain(after).collect();
    for player in players {
        // Social mutations do not advance gameplay time or foreground presence.
        crate::updates::invalidate_viewer(tx, universe, epoch, player).await?;
    }
    Ok(())
}

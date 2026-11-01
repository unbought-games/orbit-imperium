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
        let revision: i64 = sqlx::query_scalar(
            "UPDATE viewer_heads SET revision=revision+1 WHERE universe=$1 AND player=$2 RETURNING revision",
        ).bind(universe.0).bind(player.0).fetch_optional(&mut **tx).await.map_err(db_error)?
            .ok_or(StoreError::CorruptData)?;
        crate::updates::append_view_invalidation(tx, universe, epoch, player, revision).await?;
    }
    Ok(())
}

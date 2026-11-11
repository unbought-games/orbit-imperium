use crate::*;
use orbit_application::*;

impl PgStore {
    pub(crate) async fn query_player_preferences(
        &self,
        b: Binding,
        preferences: Option<PlayerPreferences>,
    ) -> Result<PlayerPreferences, StoreError> {
        if preferences.as_ref().is_some_and(|p| !p.valid()) {
            return Err(StoreError::Conflict);
        }
        // Authenticate the full binding in the same statement as the write. A
        // stale session must never update a replacement universe membership.
        let count = if let Some(preferences) = preferences {
            sqlx::query_scalar("UPDATE universe_memberships m SET galaxy_probe_count=$5 FROM universes u WHERE m.universe=u.id AND m.universe=$1 AND m.account=$2 AND m.player=$3 AND u.epoch=$4 RETURNING m.galaxy_probe_count")
                .bind(b.universe.0).bind(b.account.0).bind(b.player.0).bind(b.epoch.0)
                .bind(preferences.galaxy_probe_count)
                .fetch_optional(&self.pool).await.map_err(db_error)?
        } else {
            sqlx::query_scalar("SELECT m.galaxy_probe_count FROM universe_memberships m JOIN universes u ON u.id=m.universe WHERE m.universe=$1 AND m.account=$2 AND m.player=$3 AND u.epoch=$4")
                .bind(b.universe.0).bind(b.account.0).bind(b.player.0).bind(b.epoch.0)
                .fetch_optional(self.read_pool()?).await.map_err(db_error)?
        };
        Ok(PlayerPreferences {
            galaxy_probe_count: count.ok_or(StoreError::NotFound)?,
        })
    }
}

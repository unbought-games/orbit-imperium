use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::Coordinates;
use sqlx::Row;

impl PgStore {
    pub async fn issue_tracker_token(&self, universe: UniverseId) -> Result<String, StoreError> {
        let token = format!("orbit_tracker_{}", unbought_auth::random_secret());
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        let epoch: uuid::Uuid =
            sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1 FOR SHARE")
                .bind(universe.0)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
                .ok_or(StoreError::NotFound)?;
        let at = now(&mut tx).await?;
        sqlx::query(
            "INSERT INTO tracker_tokens(digest,universe,epoch,issued_at) VALUES($1,$2,$3,$4)",
        )
        .bind(token_digest(&token))
        .bind(universe.0)
        .bind(epoch)
        .bind(at)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(token)
    }

    pub async fn revoke_tracker_tokens(&self, universe: UniverseId) -> Result<(), StoreError> {
        sqlx::query("UPDATE tracker_tokens SET revoked_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE universe=$1 AND revoked_at IS NULL")
            .bind(universe.0).execute(self.admission_pool()?).await.map_err(db_error)?;
        Ok(())
    }

    pub(crate) async fn read_tracker_snapshot(
        &self,
        universe: UniverseId,
        digest: &str,
    ) -> Result<Option<TrackerSnapshot>, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let epoch: Option<uuid::Uuid> = sqlx::query_scalar("SELECT u.epoch FROM tracker_tokens t JOIN universes u ON u.id=t.universe AND u.epoch=t.epoch WHERE t.digest=$1 AND t.universe=$2 AND t.revoked_at IS NULL")
            .bind(digest).bind(universe.0).fetch_optional(&mut *tx).await.map_err(db_error)?;
        let Some(epoch) = epoch.map(Epoch) else {
            return Ok(None);
        };
        if crate::facts::rules(&mut tx, universe).await?.protocol() != 4 {
            return Err(StoreError::UnsupportedProtocol);
        }
        let sampled_at = now(&mut tx).await?;
        let names: Vec<(uuid::Uuid, String)> = sqlx::query_as("SELECT p.id,a.name FROM players p JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.id JOIN accounts a ON a.id=m.account WHERE p.universe=$1 ORDER BY p.id")
            .bind(universe.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        let (lots, alliances) = crate::rankings::source_facts(&mut tx, universe, epoch).await?;
        let mut players = rank_with_baseline(
            names
                .into_iter()
                .map(|(id, name)| (PlayerId(id), name))
                .collect(),
            lots,
            None,
        )
        .map_err(|_| StoreError::CorruptData)?;
        let affiliations: std::collections::BTreeMap<_, _> = alliances
            .iter()
            .flat_map(|a| a.members.iter().map(|p| (*p, a.alliance.clone())))
            .collect();
        for player in &mut players {
            player.alliance = affiliations.get(&player.player).cloned();
        }
        let rows = sqlx::query("SELECT id,owner,name,galaxy,system,position FROM bodies WHERE universe=$1 AND kind='Planet' ORDER BY galaxy,system,position,id")
            .bind(universe.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        let planets = rows
            .into_iter()
            .map(|row| -> Result<TrackerPlanet, StoreError> {
                let coordinate = |key| -> Result<u32, StoreError> {
                    u32::try_from(row.try_get::<i32, _>(key).map_err(db_error)?)
                        .map_err(|_| StoreError::CorruptData)
                };
                Ok(TrackerPlanet {
                    id: BodyId(row.try_get("id").map_err(db_error)?),
                    owner: PlayerId(row.try_get("owner").map_err(db_error)?),
                    name: row.try_get("name").map_err(db_error)?,
                    coordinates: Coordinates {
                        galaxy: coordinate("galaxy")?,
                        system: coordinate("system")?,
                        position: coordinate("position")?,
                    },
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let processing_pending = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM pending_inputs WHERE universe=$1 AND at_ms<=$2)",
        )
        .bind(universe.0)
        .bind(sampled_at)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(Some(TrackerSnapshot {
            schema_version: 1,
            universe,
            epoch,
            sampled_at,
            processing_pending,
            players,
            planets,
        }))
    }
}

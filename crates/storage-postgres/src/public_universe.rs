use crate::{
    ordering::{Tx, now},
    *,
};
use orbit_application::*;
use orbit_engine::{BodyId, Coordinates};
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct PublicationClaim {
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub feed: PublicFeed,
    pub boundary: i64,
    pub attempt: i32,
    token: Uuid,
}
impl PgStore {
    /// Initial discovery (including a new epoch) waits for the next boundary.
    /// Expired leases consume attempts; replicas cannot multiply the retry budget.
    pub async fn claim_publication(
        &self,
        universe: UniverseId,
        feed: PublicFeed,
    ) -> Result<Option<PublicationClaim>, StoreError> {
        let mut tx = self.begin_tx(self.worker_pool()?).await?;
        let at = now(&mut tx).await?;
        let epoch: Uuid = sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1 FOR SHARE")
            .bind(universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        sqlx::query("INSERT INTO public_feed_jobs(universe,feed,epoch,boundary,retry_at) VALUES($1,$2,$3,$4,$4) ON CONFLICT (universe,feed) DO UPDATE SET epoch=EXCLUDED.epoch,boundary=EXCLUDED.boundary,retry_at=EXCLUDED.retry_at,attempts=0,token=NULL WHERE public_feed_jobs.epoch<>EXCLUDED.epoch")
            .bind(universe.0).bind(feed.name()).bind(epoch).bind(feed.next_boundary(at)).execute(&mut *tx).await.map_err(db_error)?;
        let row = sqlx::query("SELECT boundary,attempts,retry_at FROM public_feed_jobs WHERE universe=$1 AND feed=$2 FOR UPDATE")
            .bind(universe.0).bind(feed.name()).fetch_one(&mut *tx).await.map_err(db_error)?;
        let mut boundary: i64 = row.try_get("boundary").map_err(db_error)?;
        let mut attempts: i32 = row.try_get("attempts").map_err(db_error)?;
        let mut retry_at: i64 = row.try_get("retry_at").map_err(db_error)?;
        if at >= feed.next_boundary(boundary) {
            boundary = at.div_euclid(feed.period_ms()) * feed.period_ms();
            attempts = 0;
            retry_at = boundary;
        }
        let completed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM public_feed_observations WHERE universe=$1 AND feed=$2 AND epoch=$3 AND boundary=$4)")
            .bind(universe.0).bind(feed.name()).bind(epoch).bind(boundary).fetch_one(&mut *tx).await.map_err(db_error)?;
        if at < boundary || at < retry_at || completed || attempts >= PUBLICATION_ATTEMPTS {
            tx.commit().await.map_err(db_error)?;
            return Ok(None);
        }
        let token = Uuid::new_v4();
        sqlx::query("UPDATE public_feed_jobs SET boundary=$3,attempts=$4,retry_at=$5,token=$6 WHERE universe=$1 AND feed=$2")
            .bind(universe.0).bind(feed.name()).bind(boundary).bind(attempts+1).bind(at+120_000).bind(token)
            .execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(Some(PublicationClaim {
            universe,
            epoch: Epoch(epoch),
            feed,
            boundary,
            attempt: attempts + 1,
            token,
        }))
    }

    pub async fn sample_publication(
        &self,
        claim: &PublicationClaim,
    ) -> Result<PublicObservation, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.worker_pool()?).await?;
        // Establish the committed snapshot and its observation time together.
        let sampled_at = now(&mut tx).await?;
        let epoch: Uuid = sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
            .bind(claim.universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        if epoch != claim.epoch.0 {
            return Err(StoreError::EpochChanged);
        }
        let source = match claim.feed {
            PublicFeed::Players => {
                let names: Vec<(Uuid, String)> = sqlx::query_as("SELECT p.id,a.name FROM players p JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.id JOIN accounts a ON a.id=m.account WHERE p.universe=$1 ORDER BY p.id")
                    .bind(claim.universe.0).fetch_all(&mut *tx).await.map_err(db_error)?;
                let (lots, alliances) =
                    crate::rankings::source_facts(&mut tx, claim.universe, claim.epoch).await?;
                PublicSource::Players {
                    names: names
                        .into_iter()
                        .map(|(id, name)| (PlayerId(id), name))
                        .collect(),
                    lots,
                    alliances,
                }
            }
            PublicFeed::Planets => {
                let rows = sqlx::query("SELECT id,name,galaxy,system,position,owner FROM bodies WHERE universe=$1 AND kind='Planet' ORDER BY galaxy,system,position,id")
                    .bind(claim.universe.0).fetch_all(&mut *tx).await.map_err(db_error)?;
                PublicSource::Planets {
                    planets: rows
                        .iter()
                        .map(|r| {
                            Ok(PublicPlanet {
                                planet_id: BodyId(r.try_get("id").map_err(db_error)?),
                                name: r.try_get("name").map_err(db_error)?,
                                owner_player_id: PlayerId(r.try_get("owner").map_err(db_error)?),
                                coordinates: Coordinates {
                                    galaxy: r
                                        .try_get::<i32, _>("galaxy")
                                        .map_err(db_error)?
                                        .try_into()
                                        .map_err(|_| StoreError::CorruptData)?,
                                    system: r
                                        .try_get::<i32, _>("system")
                                        .map_err(db_error)?
                                        .try_into()
                                        .map_err(|_| StoreError::CorruptData)?,
                                    position: r
                                        .try_get::<i32, _>("position")
                                        .map_err(db_error)?
                                        .try_into()
                                        .map_err(|_| StoreError::CorruptData)?,
                                },
                            })
                        })
                        .collect::<Result<_, StoreError>>()?,
                }
            }
        };
        tx.commit().await.map_err(db_error)?;
        let observation = PublicObservation {
            universe: claim.universe,
            epoch: claim.epoch,
            boundary: claim.boundary,
            sampled_at,
            source,
        };
        // Reject invalid source facts before making them the only published observation.
        observation
            .clone()
            .project()
            .map_err(|_| StoreError::CorruptData)?;
        Ok(observation)
    }

    pub async fn commit_publication(
        &self,
        claim: &PublicationClaim,
        observation: &PublicObservation,
    ) -> Result<(), StoreError> {
        if observation.universe != claim.universe
            || observation.epoch != claim.epoch
            || observation.boundary != claim.boundary
            || !matches!(
                (&observation.source, claim.feed),
                (PublicSource::Players { .. }, PublicFeed::Players)
                    | (PublicSource::Planets { .. }, PublicFeed::Planets)
            )
        {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_tx(self.worker_pool()?).await?;
        let at = now(&mut tx).await?;
        check_epoch(&mut tx, claim).await?;
        let changed = sqlx::query("UPDATE public_feed_jobs SET token=NULL WHERE universe=$1 AND feed=$2 AND epoch=$3 AND token=$4 AND retry_at>$5 AND boundary=$6")
            .bind(claim.universe.0).bind(claim.feed.name()).bind(claim.epoch.0).bind(claim.token).bind(at).bind(claim.boundary)
            .execute(&mut *tx).await.map_err(db_error)?.rows_affected();
        if changed != 1 || at >= claim.feed.next_boundary(claim.boundary) {
            return Err(StoreError::StaleClaim);
        }
        sqlx::query("INSERT INTO public_feed_observations(universe,feed,epoch,boundary,sampled_at,source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(universe,feed) DO UPDATE SET epoch=EXCLUDED.epoch,boundary=EXCLUDED.boundary,sampled_at=EXCLUDED.sampled_at,source=EXCLUDED.source")
            .bind(claim.universe.0).bind(claim.feed.name()).bind(claim.epoch.0).bind(claim.boundary).bind(observation.sampled_at)
            .bind(serde_json::to_value(&observation.source).map_err(|_| StoreError::CorruptData)?)
            .execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)
    }

    pub async fn fail_publication(
        &self,
        claim: &PublicationClaim,
        error: &StoreError,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(self.worker_pool()?).await?;
        let at = now(&mut tx).await?;
        let delay = publication_retry_ms(claim.attempt, error);
        sqlx::query("UPDATE public_feed_jobs SET retry_at=$5,attempts=$6,token=NULL WHERE universe=$1 AND feed=$2 AND epoch=$3 AND token=$4")
            .bind(claim.universe.0).bind(claim.feed.name()).bind(claim.epoch.0).bind(claim.token)
            .bind(at+delay.unwrap_or(0)).bind(if delay.is_some() { claim.attempt } else { PUBLICATION_ATTEMPTS })
            .execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)
    }

    pub(crate) async fn read_public_observation(
        &self,
        universe: UniverseId,
        feed: PublicFeed,
    ) -> Result<PublicObservation, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let row = sqlx::query("SELECT u.epoch,o.boundary,o.sampled_at,o.source FROM universes u LEFT JOIN public_feed_observations o ON o.universe=u.id AND o.epoch=u.epoch AND o.feed=$2 WHERE u.id=$1")
            .bind(universe.0).bind(feed.name()).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        let source: Option<serde_json::Value> = row.try_get("source").map_err(db_error)?;
        let observation = PublicObservation {
            universe,
            epoch: Epoch(row.try_get("epoch").map_err(db_error)?),
            source: serde_json::from_value(source.ok_or(StoreError::Unavailable)?)
                .map_err(|_| StoreError::CorruptData)?,
            boundary: row.try_get("boundary").map_err(db_error)?,
            sampled_at: row.try_get("sampled_at").map_err(db_error)?,
        };
        tx.commit().await.map_err(db_error)?;
        Ok(observation)
    }
}
async fn check_epoch(tx: &mut Tx<'_>, claim: &PublicationClaim) -> Result<(), StoreError> {
    let epoch: Option<Uuid> =
        sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1 FOR SHARE")
            .bind(claim.universe.0)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?;
    if epoch != Some(claim.epoch.0) {
        return Err(StoreError::EpochChanged);
    }
    Ok(())
}

pub struct PublicFeedHealth {
    pub universe: UniverseId,
    pub feed: PublicFeed,
    pub now: i64,
    pub sampled_at: Option<i64>,
    pub next_refresh_at: Option<i64>,
    pub attempts: i32,
}
impl PgStore {
    /// Metrics derive age from publication facts, including missing observations.
    pub async fn public_feed_health(&self) -> Result<Vec<PublicFeedHealth>, StoreError> {
        let mut tx = crate::snapshots::begin(self, &self.pool).await?;
        let at = now(&mut tx).await?;
        let rows = sqlx::query("SELECT u.id,f.feed,o.sampled_at,o.boundary AS published_boundary,j.boundary,j.attempts FROM universes u CROSS JOIN (VALUES ('players'),('planets')) f(feed) LEFT JOIN public_feed_jobs j ON j.universe=u.id AND j.epoch=u.epoch AND j.feed=f.feed LEFT JOIN public_feed_observations o ON o.universe=u.id AND o.epoch=u.epoch AND o.feed=f.feed ORDER BY u.id,f.feed")
            .fetch_all(&mut *tx).await.map_err(db_error)?;
        let health = rows
            .iter()
            .map(|r| {
                Ok(PublicFeedHealth {
                    universe: UniverseId(r.try_get("id").map_err(db_error)?),
                    feed: match r.try_get::<&str, _>("feed").map_err(db_error)? {
                        "players" => PublicFeed::Players,
                        "planets" => PublicFeed::Planets,
                        _ => return Err(StoreError::CorruptData),
                    },
                    now: at,
                    sampled_at: r.try_get("sampled_at").map_err(db_error)?,
                    next_refresh_at: r
                        .try_get::<Option<i64>, _>("published_boundary")
                        .map_err(db_error)?
                        .map(|at| {
                            if r.get::<&str, _>("feed") == "players" {
                                PublicFeed::Players
                            } else {
                                PublicFeed::Planets
                            }
                            .next_boundary(at)
                        })
                        .or(r.try_get("boundary").map_err(db_error)?),
                    attempts: r
                        .try_get::<Option<i32>, _>("attempts")
                        .map_err(db_error)?
                        .unwrap_or(0),
                })
            })
            .collect::<Result<_, StoreError>>()?;
        tx.commit().await.map_err(db_error)?;
        Ok(health)
    }
}

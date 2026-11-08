//! Arrival presentation records. Never part of ordered world state.
use crate::{ordering::Tx, *};
use orbit_application::*;
use sqlx::Row;

pub(crate) async fn enroll(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO empire_arrivals(player,universe) VALUES($1,$2) ON CONFLICT DO NOTHING",
    )
    .bind(player.0)
    .bind(u.0)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}

async fn appearances(
    tx: &mut Tx<'_>,
    u: UniverseId,
    bodies: Vec<BodyId>,
) -> Result<BodyAppearances, StoreError> {
    let ids: Vec<_> = bodies.into_iter().map(|b| b.0).collect();
    if ids.is_empty() {
        return Ok(BodyAppearances::new());
    }
    sqlx::query("SELECT a.body,a.art_slot FROM body_appearances a JOIN bodies b ON b.id=a.body WHERE b.universe=$1 AND a.body=ANY($2)")
        .bind(u.0)
        .bind(ids)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|row| {
            let slot: i16 = row.try_get("art_slot").map_err(db_error)?;
            Ok((
                BodyId(row.try_get("body").map_err(db_error)?),
                u8::try_from(slot).map_err(|_| StoreError::CorruptData)?,
            ))
        })
        .collect()
}

impl PgStore {
    pub(crate) async fn read_arrival_presentation(
        &self,
        b: Binding,
        bodies: Vec<BodyId>,
    ) -> Result<ArrivalPresentation, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let row = sqlx::query("SELECT m.joined_at_ms, EXISTS(SELECT 1 FROM empire_arrivals a WHERE a.player=m.player AND a.completed_at_ms IS NULL) AS pending FROM universe_memberships m WHERE m.universe=$1 AND m.player=$2")
            .bind(b.universe.0)
            .bind(b.player.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
        let appearances = appearances(&mut tx, b.universe, bodies).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(ArrivalPresentation {
            pending: row.try_get("pending").map_err(db_error)?,
            joined_at_ms: row.try_get("joined_at_ms").map_err(db_error)?,
            appearances,
        })
    }

    pub(crate) async fn read_body_appearances(
        &self,
        b: Binding,
        bodies: Vec<BodyId>,
    ) -> Result<BodyAppearances, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let result = appearances(&mut tx, b.universe, bodies).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }

    async fn arrival_write(&self, b: Binding) -> Result<Tx<'static>, StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        sqlx::query("SELECT id FROM universes WHERE id=$1 FOR SHARE")
            .bind(b.universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        crate::binding::check_read(&mut tx, b).await?;
        Ok(tx)
    }

    pub(crate) async fn write_body_appearance(
        &self,
        b: Binding,
        body: BodyId,
        slot: u8,
    ) -> Result<(), StoreError> {
        let mut tx = self.arrival_write(b).await?;
        let position: i32 = sqlx::query_scalar("SELECT position FROM bodies WHERE id=$1 AND universe=$2 AND owner=$3 AND kind='Planet' FOR SHARE")
            .bind(body.0)
            .bind(b.universe.0)
            .bind(b.player.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        let band = appearance_band(u32::try_from(position).map_err(|_| StoreError::CorruptData)?);
        if !band.contains(&slot) {
            return Err(StoreError::GameRejected(
                orbit_engine::GameError::InvalidInput,
            ));
        }
        sqlx::query("INSERT INTO body_appearances(body,art_slot) VALUES($1,$2) ON CONFLICT(body) DO UPDATE SET art_slot=excluded.art_slot")
            .bind(body.0)
            .bind(i16::from(slot))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }

    pub(crate) async fn write_arrival_completion(&self, b: Binding) -> Result<(), StoreError> {
        let mut tx = self.arrival_write(b).await?;
        sqlx::query("UPDATE empire_arrivals SET completed_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE player=$1 AND universe=$2 AND completed_at_ms IS NULL")
            .bind(b.player.0)
            .bind(b.universe.0)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
}

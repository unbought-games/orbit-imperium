use crate::{PgStore, db_error};
use orbit_application::*;
use orbit_engine::ReportId;
use sqlx::{Postgres, Transaction};

impl PgStore {
    pub(crate) async fn read_player_alliances(
        &self,
        binding: Binding,
        players: Vec<PlayerId>,
    ) -> Result<PublicPlayerAlliances, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, binding).await?;
        let ids: Vec<_> = players.into_iter().map(|p| p.0).collect();
        let rows: Vec<(uuid::Uuid, uuid::Uuid, String, String)> = sqlx::query_as(
            "SELECT m.player,a.id,a.tag,a.name FROM alliance_memberships m JOIN alliances a ON a.id=m.alliance AND a.universe=m.universe AND a.epoch=m.epoch JOIN universe_memberships u ON u.universe=m.universe AND u.player=m.player WHERE m.universe=$1 AND m.epoch=$2 AND m.player=ANY($3)",
        ).bind(binding.universe.0).bind(binding.epoch.0).bind(ids)
            .fetch_all(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(rows
            .into_iter()
            .map(|(player, id, tag, name)| {
                (
                    PlayerId(player),
                    AllianceIdentity {
                        id,
                        universe: binding.universe,
                        tag,
                        name,
                    },
                )
            })
            .collect())
    }
}

pub(crate) async fn capture_report_alliances(
    tx: &mut Transaction<'_, Postgres>,
    universe: UniverseId,
    report: ReportId,
    at: i64,
    players: Vec<PlayerId>,
) -> Result<(), StoreError> {
    let ids: Vec<_> = players.into_iter().map(|p| p.0).collect();
    let rows: Vec<(uuid::Uuid, uuid::Uuid, String, String)> = sqlx::query_as(
        "SELECT h.player,h.alliance,h.tag,h.name FROM alliance_affiliation_history h JOIN universes u ON u.id=h.universe AND u.epoch=h.epoch WHERE h.universe=$1 AND h.player=ANY($2) AND h.valid_from<=$3 AND (h.valid_until IS NULL OR h.valid_until>$3)",
    ).bind(universe.0).bind(ids).bind(at).fetch_all(&mut **tx).await.map_err(db_error)?;
    let identities: PublicPlayerAlliances = rows
        .into_iter()
        .map(|(player, id, tag, name)| {
            (
                PlayerId(player),
                AllianceIdentity {
                    id,
                    universe,
                    tag,
                    name,
                },
            )
        })
        .collect();
    sqlx::query("INSERT INTO mission_report_alliances(report,identities) VALUES($1,$2)")
        .bind(report.0)
        .bind(sqlx::types::Json(identities))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}

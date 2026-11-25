//! Match a single coordinate without loading player economies or inventories.
use crate::{StoreError, bots::TacticalResult, db_error, ordering::Tx};
use orbit_application::{BoundWorld, QueryContext};
use orbit_engine::*;

pub(crate) async fn read(
    tx: &mut Tx<'_>,
    context: &QueryContext,
    selection: &DestinationSelection,
) -> Result<TacticalResult, StoreError> {
    let b = context.binding;
    let rules = crate::facts::rules(tx, b.universe).await?;
    if !rules.world() {
        return Err(StoreError::UnsupportedProtocol);
    }
    let coords = selection.coordinates();
    let u = b.universe.0;
    let (g, s, p) = (
        i64::from(coords.galaxy),
        i64::from(coords.system),
        i64::from(coords.position),
    );
    let facts = match selection {
        DestinationSelection::BodyAt { kind, .. } => {
            let body: Option<(uuid::Uuid, uuid::Uuid)> = sqlx::query_as(
                "SELECT id,owner FROM bodies WHERE universe=$1 AND galaxy=$2 AND system=$3 AND position=$4 AND kind=$5",
            ).bind(u).bind(g).bind(s).bind(p).bind(format!("{kind:?}")).fetch_optional(&mut **tx).await.map_err(db_error)?;
            DestinationFacts::Body(*kind, body.map(|(id, owner)| (BodyId(id), PlayerId(owner))))
        }
        DestinationSelection::DebrisAt { .. } => {
            let field = sqlx::query_scalar(
                "SELECT id FROM debris_fields WHERE universe=$1 AND data->'coordinates'=$2
                 AND data->>'marker_present'='true' ORDER BY id LIMIT 1",
            )
            .bind(u)
            .bind(sqlx::types::Json(coords))
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?;
            DestinationFacts::Debris(field.map(OperationId))
        }
        DestinationSelection::EmptyPositionAt { .. } => {
            // An abandoned planet reserves its slot through its release event.
            let (body, abandoned, revision): (Option<uuid::Uuid>, Option<uuid::Uuid>, i64) = sqlx::query_as(
                "SELECT b.id, a.id, COALESCE(h.revision,CASE WHEN b.id IS NULL THEN 0 ELSE 1 END)::bigint
                 FROM (VALUES ($1::uuid,$2::bigint,$3::bigint,$4::bigint)) c(u,g,s,p)
                 LEFT JOIN bodies b ON b.universe=c.u AND b.galaxy=c.g AND b.system=c.s AND b.position=c.p AND b.kind='Planet'
                 LEFT JOIN planet_slot_revisions h ON h.universe=c.u AND h.galaxy=c.g AND h.system=c.s AND h.position=c.p
                 LEFT JOIN planet_abandonments a ON a.universe=c.u AND a.data->'coordinates'=$5 AND a.data->>'released'='false'",
            ).bind(u).bind(g).bind(s).bind(p).bind(sqlx::types::Json(coords)).fetch_one(&mut **tx).await.map_err(db_error)?;
            if body.is_some() && abandoned.is_some() {
                return Err(StoreError::CorruptData);
            }
            DestinationFacts::PlanetSlot(Some(PlanetSlot {
                coordinates: coords,
                occupant: body.or(abandoned).map(BodyId),
                revision,
            }))
        }
    };
    let destination = match facts.resolve(coords, &rules) {
        Ok(destination) => destination,
        Err(error) => return Ok(Err(error)),
    };
    let revision: i64 =
        sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
            .bind(u)
            .bind(b.player.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
    let at = crate::snapshots::estimate_time(tx, b.universe, b.player).await?;
    let snapshot = crate::snapshots::wrap(
        tx,
        b.universe,
        b.player,
        BoundWorld {
            protocol: 4,
            binding: b,
            request_id: context.request_id,
            viewer_revision: revision.to_string(),
            sampled_at: at,
            as_of_ms: at,
            data: serde_json::to_value(destination).map_err(|_| StoreError::CorruptData)?,
        },
    )
    .await?;
    Ok(Ok(snapshot))
}

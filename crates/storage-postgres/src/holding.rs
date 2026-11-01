//! Relationship source facts and changes to the existing scheduler's participant indexes.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use std::collections::BTreeSet;

pub(crate) fn requires_lock(input: &Input) -> bool {
    matches!(
        input,
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet { .. }
                | WorldAction::SupplyHoldingFleet { .. }
                | WorldAction::AbandonPlanet { .. }
        })
    )
}
pub(crate) async fn lock(tx: &mut Tx<'_>, u: UniverseId, epoch: Epoch) -> Result<(), StoreError> {
    // Same lock as social/alliance mutations; retained through fact revalidation and commit.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,19))")
        .bind(format!("alliances:{u}:{epoch}"))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
pub(crate) async fn relationships(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    owners: &[uuid::Uuid],
) -> Result<HoldingRelationships, StoreError> {
    let mut facts = HoldingRelationships {
        covered: owners.iter().copied().map(PlayerId).collect(),
        ..Default::default()
    };
    for row in sqlx::query("SELECT player,alliance FROM alliance_memberships WHERE universe=$1 AND epoch=$2 AND player=ANY($3)").bind(u.0).bind(epoch.0).bind(owners).fetch_all(&mut **tx).await.map_err(db_error)? {
        facts.alliances.insert(PlayerId(row.try_get("player").map_err(db_error)?), row.try_get("alliance").map_err(db_error)?);
    }
    for row in sqlx::query("SELECT player_low,player_high FROM friend_relationships WHERE universe=$1 AND epoch=$2 AND accepted_at IS NOT NULL AND player_low=ANY($3) AND player_high=ANY($3)").bind(u.0).bind(epoch.0).bind(owners).fetch_all(&mut **tx).await.map_err(db_error)? {
        facts.friends.insert((PlayerId(row.try_get("player_low").map_err(db_error)?), PlayerId(row.try_get("player_high").map_err(db_error)?)));
    }
    for row in sqlx::query("SELECT blocker,blocked FROM player_blocks WHERE universe=$1 AND epoch=$2 AND blocker=ANY($3) AND blocked=ANY($3)").bind(u.0).bind(epoch.0).bind(owners).fetch_all(&mut **tx).await.map_err(db_error)? {
        facts.blocks.insert((PlayerId(row.try_get("blocker").map_err(db_error)?), PlayerId(row.try_get("blocked").map_err(db_error)?)));
    }
    Ok(facts)
}
pub(crate) async fn participant_scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    body: BodyId,
) -> Result<BTreeSet<ScopeKey>, StoreError> {
    let mut scopes = BTreeSet::new();
    for data in sqlx::query_scalar::<_, serde_json::Value>("SELECT data FROM mission_fleets WHERE universe=$1 AND data->'intent'->>'mission'='Hold' AND data->'intent'->'destination'->>'id'=$2 AND data->>'leg' IN ('Outbound','Holding') ORDER BY id")
        .bind(u.0).bind(body.to_string()).fetch_all(&mut **tx).await.map_err(db_error)? {
        let f: MissionFleet = decode_supported(data)?;
        scopes.extend([ScopeKey::Player(f.owner), ScopeKey::Location(f.origin_coordinates), ScopeKey::Location(f.destination_coordinates)]);
    }
    Ok(scopes)
}
/// Newly launched visitors must be dependencies of already scheduled encounters.
/// The launch holds the host location and visitor scopes; later host contacts
/// cannot already be executing. Admissions share the social lock with this write.
pub(crate) async fn extend_pending(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    f: &MissionFleet,
) -> Result<(), StoreError> {
    let key = serde_json::to_string(&ScopeKey::Location(f.destination_coordinates))
        .map_err(|_| StoreError::CorruptData)?;
    let scopes = BTreeSet::from([
        ScopeKey::Player(f.owner),
        ScopeKey::Location(f.origin_coordinates),
    ]);
    let rows = sqlx::query("SELECT DISTINCT p.input FROM pending_inputs p JOIN input_scopes s ON s.universe=p.universe AND s.input_id=p.input_id WHERE p.universe=$1 AND s.scope_key=$2 AND (p.at_ms,p.phase,p.sequence)>($3,$4,$5)")
        .bind(i.universe.0).bind(key).bind(i.at).bind(i.phase).bind(i.sequence).fetch_all(&mut **tx).await.map_err(db_error)?;
    for row in rows {
        let input = ordered_input(row.try_get("input").map_err(db_error)?)?;
        crate::admission::register(tx, &input, &scopes).await?;
    }
    Ok(())
}

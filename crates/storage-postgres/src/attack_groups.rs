//! Group source facts and dependencies, using the existing ordered runtime.
use crate::{ordering::*, *};
use orbit_engine::*;
use std::collections::{BTreeMap, BTreeSet};
fn requested(input: &Input) -> (Option<OperationId>, Option<FleetId>) {
    match input {
        Input::Command(Command::World {
            action:
                WorldAction::InviteAttackGroup { group, .. }
                | WorldAction::RevokeAttackGroupInvitation { group, .. },
        })
        | Input::Event(ScheduledEvent::AttackGroupDue { group, .. }) => (Some(*group), None),
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet { intent, .. },
        }) => (intent.attack_group, None),
        Input::Command(Command::World {
            action: WorldAction::CreateAttackGroup { fleet } | WorldAction::RecallMission { fleet },
        })
        | Input::Event(ScheduledEvent::FleetLegDue { fleet, .. }) => (None, Some(*fleet)),
        _ => (None, None),
    }
}
pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    input: &Input,
    owners: &[uuid::Uuid],
    all: bool,
) -> Result<Vec<AttackGroup>, StoreError> {
    let (group, fleet) = requested(input);
    let owners: Vec<_> = owners.iter().map(ToString::to_string).collect();
    sqlx::query_scalar::<_, serde_json::Value>("SELECT g.data FROM attack_groups g WHERE g.universe=$1 AND (g.id=$2 OR g.data->'members' ? $3 OR ((g.data->>'resolved_at') IS NULL AND ($4 OR g.data->'invited' ?| $5 OR EXISTS(SELECT 1 FROM mission_fleets f WHERE f.universe=g.universe AND (f.owner::text=ANY($5) OR f.data->'intent'->'destination'->>'expected_owner'=ANY($5)) AND g.data->'members' ? f.id::text)))) ORDER BY g.id")
        .bind(u.0).bind(group.map(|g| g.0)).bind(fleet.map(|f| f.to_string())).bind(all).bind(&owners)
        .fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(decode_supported).collect()
}
pub(crate) async fn scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    input: &Input,
) -> Result<BTreeSet<ScopeKey>, StoreError> {
    let groups = load(tx, u, input, &[], false).await?;
    let mut scopes = BTreeSet::new();
    let (_, fleet) = requested(input);
    let ids: Vec<_> = groups.iter().map(|g| g.id.to_string()).collect();
    // Cancellation must hold every previously declared dependency, including
    // departed defenders and recipients whose invitations were revoked.
    for value in sqlx::query_scalar::<_, serde_json::Value>("SELECT DISTINCT s.scope_key::jsonb FROM scheduled_events e JOIN input_scopes s ON s.universe=e.universe AND s.input_id=e.id WHERE e.universe=$1 AND NOT e.done AND NOT e.cancelled AND (e.event->>'group'=ANY($2) OR e.event->>'fleet'=$3)")
        .bind(u.0).bind(ids).bind(fleet.map(|f|f.to_string())).fetch_all(&mut **tx).await.map_err(db_error)? {
        scopes.insert(decode_supported(value)?);
    }
    for g in groups {
        scopes.extend(g.invited.iter().copied().map(ScopeKey::Player));
        let ids: Vec<_> = g.members.iter().map(|f| f.0).collect();
        for value in sqlx::query_scalar::<_, serde_json::Value>(
            "SELECT data FROM mission_fleets WHERE universe=$1 AND id=ANY($2)",
        )
        .bind(u.0)
        .bind(ids)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
        {
            let f: MissionFleet = decode_supported(value)?;
            scopes.extend([
                ScopeKey::Player(f.owner),
                ScopeKey::Location(f.origin_coordinates),
                ScopeKey::Location(f.destination_coordinates),
            ]);
            scopes.extend(f.authorization.target_owner.map(ScopeKey::Player));
            if let MissionDestination::Body { id, .. } = f.intent.destination {
                scopes.extend(crate::holding::participant_scopes(tx, u, id).await?);
            }
        }
    }
    Ok(scopes)
}
pub(crate) async fn save(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    before: &BTreeMap<OperationId, AttackGroup>,
    w: &WorldRecords,
) -> Result<(), StoreError> {
    for g in w
        .attack_groups
        .values()
        .filter(|g| before.get(&g.id) != Some(g))
    {
        sqlx::query("INSERT INTO attack_groups(id,universe,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE attack_groups.universe=excluded.universe")
            .bind(g.id.0).bind(i.universe.0).bind(sqlx::types::Json(g)).execute(&mut **tx).await.map_err(db_error)?;
        // Existing pending group commands/events also need newly joined owners and invitees.
        let mut dependencies: BTreeSet<_> =
            g.invited.iter().copied().map(ScopeKey::Player).collect();
        for f in g.members.iter().filter_map(|id| w.fleets.get(id)) {
            dependencies.extend([
                ScopeKey::Player(f.owner),
                ScopeKey::Location(f.origin_coordinates),
                ScopeKey::Location(f.destination_coordinates),
            ]);
            dependencies.extend(f.authorization.target_owner.map(ScopeKey::Player));
        }
        let f = w.fleets.get(&g.initiator).ok_or(StoreError::CorruptData)?;
        let key = serde_json::to_string(&ScopeKey::Location(f.destination_coordinates))
            .map_err(|_| StoreError::CorruptData)?;
        let rows = sqlx::query_scalar::<_, serde_json::Value>("SELECT DISTINCT p.input FROM pending_inputs p JOIN input_scopes s ON s.universe=p.universe AND s.input_id=p.input_id WHERE p.universe=$1 AND s.scope_key=$2 AND (p.at_ms,p.phase,p.sequence)>($3,$4,$5)")
            .bind(i.universe.0).bind(key).bind(i.at).bind(i.phase).bind(i.sequence).fetch_all(&mut **tx).await.map_err(db_error)?;
        for value in rows {
            let pending = ordered_input(value)?;
            crate::admission::register(tx, &pending, &dependencies).await?;
        }
    }
    Ok(())
}

pub(crate) async fn audit(
    tx: &mut Tx<'_>,
    u: UniverseId,
    w: &WorldRecords,
) -> Result<(), StoreError> {
    validate_attack_group_records(w).map_err(|_| StoreError::CorruptData)?;
    for g in w.attack_groups.values().filter(|g| g.resolved_at.is_none()) {
        let event = ScheduledEvent::AttackGroupDue {
            group: g.id,
            generation: g.generation,
        };
        let count:i64=sqlx::query_scalar("SELECT count(*) FROM scheduled_events WHERE universe=$1 AND event=$2 AND at_ms=$3 AND NOT done AND NOT cancelled")
            .bind(u.0).bind(sqlx::types::Json(event)).bind(g.arrival_at).fetch_one(&mut **tx).await.map_err(db_error)?;
        if count != 1 {
            return Err(StoreError::CorruptData);
        }
        let ids: Vec<_> = group_members(w, g).map(|f| f.id.to_string()).collect();
        let solo:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM scheduled_events WHERE universe=$1 AND event->>'type'='FleetLegDue' AND event->>'expected_leg'='Outbound' AND event->>'fleet'=ANY($2) AND NOT done AND NOT cancelled)")
            .bind(u.0).bind(ids).fetch_one(&mut **tx).await.map_err(db_error)?;
        if solo {
            return Err(StoreError::CorruptData);
        }
    }
    Ok(())
}

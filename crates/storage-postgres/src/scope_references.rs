//! Identity-only scheduling references; no balances, eligibility, or simulation.
use crate::{ordering::*, *};
use orbit_engine::*;
use sqlx::Row;
use std::collections::BTreeSet;

/// A dependent command can name its accepted creator's command ID before the
/// entity exists. Resolve only this actor's same-epoch commands, never another
/// player's command history. The original request still owns the intent hash.
pub(crate) async fn resolve_command(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    actor: PlayerId,
    command: Command,
) -> Result<(Command, BTreeSet<ScopeKey>), StoreError> {
    let (id, table) = match &command {
        Command::World {
            action: WorldAction::RecallMission { fleet },
        } => (fleet.0, "mission_fleets"),
        Command::RecallFleet { fleet } => (fleet.0, "fleets"),
        Command::CancelConstruction { operation } => (operation.0, "constructions"),
        Command::CancelResearch { operation } => (operation.0, "research_operations"),
        _ => return Ok((command, BTreeSet::new())),
    };
    let exists: bool = sqlx::query_scalar(&format!(
        "SELECT EXISTS(SELECT 1 FROM {table} WHERE universe=$1 AND id=$2)"
    ))
    .bind(u.0)
    .bind(id)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    if exists {
        return Ok((command, BTreeSet::new()));
    }
    let parent: Option<serde_json::Value> = sqlx::query_scalar(
        "SELECT input FROM commands WHERE universe=$1 AND epoch=$2 AND actor=$3 AND command_id=$4",
    )
    .bind(u.0)
    .bind(epoch.0)
    .bind(actor.0)
    .bind(id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    let Some(parent) = parent else {
        return Ok((command, BTreeSet::new()));
    };
    let parent = ordered_input(parent)?;
    let resolved = match (&command, &parent.payload) {
        (
            Command::World {
                action: WorldAction::RecallMission { .. },
            },
            Input::Command(Command::World {
                action: WorldAction::LaunchFleet { .. },
            }),
        ) => Command::World {
            action: WorldAction::RecallMission {
                fleet: FleetId(derived_id(parent.id, "mission:0")),
            },
        },
        (Command::RecallFleet { .. }, Input::Command(Command::LaunchTransport { .. })) => {
            Command::RecallFleet {
                fleet: FleetId(derived_id(parent.id, "fleet:0")),
            }
        }
        (
            Command::CancelConstruction { .. },
            Input::Command(Command::StartUpgrade { .. } | Command::StartDemolition { .. }),
        ) => Command::CancelConstruction {
            operation: OperationId(derived_id(parent.id, "construction:0")),
        },
        (Command::CancelResearch { .. }, Input::Command(Command::StartResearch { .. })) => {
            Command::CancelResearch {
                operation: OperationId(derived_id(parent.id, "research:0")),
            }
        }
        _ => return Ok((command, BTreeSet::new())),
    };
    let keys: Vec<String> = sqlx::query_scalar(
        "SELECT scope_key FROM input_scopes WHERE universe=$1 AND input_id=$2 ORDER BY scope_key",
    )
    .bind(u.0)
    .bind(parent.id.0)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    let mut scopes = BTreeSet::new();
    for key in keys {
        scopes.insert(serde_json::from_str(&key).map_err(|_| StoreError::CorruptData)?);
    }
    if scopes.is_empty() {
        scopes = crate::scoped_facts::select(tx, u, parent.actor, &parent.payload)
            .await?
            .scopes();
    }
    Ok((resolved, scopes))
}

pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    input: &Input,
) -> Result<ScopeReferences, StoreError> {
    let mut refs = ScopeReferences::default();
    let mut bodies = BTreeSet::new();
    let mut operation = None;
    let mut fleet = None;
    let mut field = None;
    match input {
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet { intent, .. },
        }) => {
            bodies.insert(intent.origin.0);
            if let MissionDestination::Body { id, .. } = intent.destination {
                bodies.insert(id.0);
            }
        }
        Input::Command(Command::LaunchTransport { origin, target, .. }) => {
            bodies.extend([origin.0, target.0]);
        }
        Input::Command(
            Command::World {
                action: WorldAction::RecallMission { fleet: id },
            }
            | Command::RecallFleet { fleet: id },
        )
        | Input::Event(
            ScheduledEvent::FleetLegDue { fleet: id, .. }
            | ScheduledEvent::TransportArrived { fleet: id, .. }
            | ScheduledEvent::FleetReturned { fleet: id, .. },
        ) => {
            fleet = Some(*id);
        }
        Input::Command(
            Command::CancelConstruction { operation: id }
            | Command::CancelResearch { operation: id },
        )
        | Input::Event(
            ScheduledEvent::ConstructionDue { operation: id, .. }
            | ScheduledEvent::ResearchDue { operation: id, .. }
            | ScheduledEvent::ManufacturingDue { operation: id, .. },
        ) => {
            operation = Some(*id);
        }
        Input::Event(ScheduledEvent::DebrisCleanupDue { field: id, .. }) => {
            field = Some(*id);
        }
        _ => {}
    }
    if let Some(id) = fleet {
        if let Some(value) =
            sqlx::query_scalar("SELECT data FROM mission_fleets WHERE universe=$1 AND id=$2")
                .bind(u.0)
                .bind(id.0)
                .fetch_optional(&mut **tx)
                .await
                .map_err(db_error)?
        {
            let f: MissionFleet = decode_supported(value)?;
            refs.fleets.insert(
                id,
                (
                    f.owner,
                    f.authorization.target_owner,
                    f.origin_coordinates,
                    f.destination_coordinates,
                ),
            );
        } else if let Some(row) = sqlx::query(
            "SELECT owner,target_owner,origin,target FROM fleets WHERE universe=$1 AND id=$2",
        )
        .bind(u.0)
        .bind(id.0)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        {
            let origin: uuid::Uuid = row.try_get("origin").map_err(db_error)?;
            let target: uuid::Uuid = row.try_get("target").map_err(db_error)?;
            for body in [origin, target] {
                bodies.insert(body);
            }
            load_bodies(tx, u, &bodies, &mut refs).await?;
            let a = refs
                .bodies
                .get(&BodyId(origin))
                .ok_or(StoreError::CorruptData)?
                .1;
            let b = refs
                .bodies
                .get(&BodyId(target))
                .ok_or(StoreError::CorruptData)?
                .1;
            refs.fleets.insert(
                id,
                (
                    PlayerId(row.try_get("owner").map_err(db_error)?),
                    Some(PlayerId(row.try_get("target_owner").map_err(db_error)?)),
                    a,
                    b,
                ),
            );
            bodies.clear();
        }
    }
    if let Some(id) = operation {
        let owner: Option<uuid::Uuid> = sqlx::query_scalar("SELECT owner FROM (SELECT id,owner,universe FROM constructions UNION ALL SELECT id,owner,universe FROM research_operations UNION ALL SELECT id,owner,universe FROM manufacturing_batches) ops WHERE universe=$1 AND id=$2 LIMIT 1")
            .bind(u.0).bind(id.0).fetch_optional(&mut **tx).await.map_err(db_error)?;
        if let Some(owner) = owner {
            refs.operations.insert(id, PlayerId(owner));
        }
    }
    if let Some(id) = field
        && let Some(value) =
            sqlx::query_scalar("SELECT data FROM debris_fields WHERE universe=$1 AND id=$2")
                .bind(u.0)
                .bind(id.0)
                .fetch_optional(&mut **tx)
                .await
                .map_err(db_error)?
    {
        let field: DebrisField = decode_supported(value)?;
        refs.debris.insert(id, field.coordinates);
    }

    load_bodies(tx, u, &bodies, &mut refs).await?;
    Ok(refs)
}
async fn load_bodies(
    tx: &mut Tx<'_>,
    u: UniverseId,
    ids: &BTreeSet<uuid::Uuid>,
    refs: &mut ScopeReferences,
) -> Result<(), StoreError> {
    if ids.is_empty() {
        return Ok(());
    }
    for row in sqlx::query(
        "SELECT id,owner,galaxy,system,position FROM bodies WHERE universe=$1 AND id=ANY($2)",
    )
    .bind(u.0)
    .bind(ids.iter().copied().collect::<Vec<_>>())
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?
    {
        let coordinate = |name| -> Result<u32, StoreError> {
            u32::try_from(row.try_get::<i32, _>(name).map_err(db_error)?)
                .map_err(|_| StoreError::CorruptData)
        };
        refs.bodies.insert(
            BodyId(row.try_get("id").map_err(db_error)?),
            (
                PlayerId(row.try_get("owner").map_err(db_error)?),
                Coordinates {
                    galaxy: coordinate("galaxy")?,
                    system: coordinate("system")?,
                    position: coordinate("position")?,
                },
            ),
        );
    }
    Ok(())
}

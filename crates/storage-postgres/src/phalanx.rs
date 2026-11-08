//! Endpoint membership, loaded and revalidated under existing player/location claims.
use crate::{ordering::*, *};
use orbit_engine::*;
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet};

pub(crate) fn target(input: &Input) -> Option<(BodyId, BodyId)> {
    match input {
        Input::Command(Command::World {
            action:
                WorldAction::ScanPlanet {
                    source_moon,
                    target_planet,
                },
        }) => Some((*source_moon, *target_planet)),
        _ => None,
    }
}
pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    rules: &Ruleset,
    actor: Actor,
    input: &Input,
    input_id: Option<InputId>,
) -> Result<GameState, StoreError> {
    let Actor::Player(actor) = actor else {
        return Err(StoreError::CorruptData);
    };
    let (source, target) = target(input).ok_or(StoreError::CorruptData)?;
    // Only the actor's economy closure is loaded. Foreign endpoint owners do not
    // drag their economies, inventories, reports or fleet collections into a scan.
    let selected = crate::scoped_facts::Selection {
        owners: BTreeSet::from([actor]),
        ..Default::default()
    };
    let mut state =
        crate::world::load_selected(tx, u, epoch, rules, input, input_id, selected).await?;
    if !phalanx_enabled(rules) {
        return Ok(state);
    }
    state.coverage.bodies.extend([source, target]);
    let rows = sqlx::query("SELECT * FROM bodies WHERE universe=$1 AND id=$2")
        .bind(u.0)
        .bind(target.0)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?;
    for body in crate::views::bodies(tx, rows).await? {
        state.bodies.insert(body.id, body);
    }
    let fleets: Vec<MissionFleet> = sqlx::query_scalar::<_, serde_json::Value>("SELECT data FROM mission_fleets WHERE universe=$1 AND data->'intent'->'destination'->>'type' <> 'Site' AND data->>'leg' IN ('Outbound','Holding','Returning') AND (data->'intent'->>'origin'=$2 OR data->'intent'->'destination'->>'id'=$2) ORDER BY id")
        .bind(u.0).bind(target.to_string()).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(decode_supported).collect::<Result<_,_>>()?;
    let missiles: Vec<MissileFlight> = sqlx::query_scalar::<_, serde_json::Value>("SELECT data FROM missile_flights WHERE universe=$1 AND data->>'status'='InFlight' AND data->'terms'->'intent'->'target'->>'id'=$2 ORDER BY id")
        .bind(u.0).bind(target.to_string()).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(decode_supported).collect::<Result<_,_>>()?;
    // Resolve origins by stable body ID. Destination binding comes from the
    // accepted intent; a colony subsequently occupying coordinates cannot rebind it.
    let origins: Vec<_> = fleets
        .iter()
        .map(|f| f.intent.origin.0)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let rows = sqlx::query(
        "SELECT id,kind,galaxy,system,position FROM bodies WHERE universe=$1 AND id=ANY($2)",
    )
    .bind(u.0)
    .bind(origins)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    let mut origins = BTreeMap::new();
    for row in rows {
        let id = BodyId(row.try_get("id").map_err(db_error)?);
        let coordinate = |name| -> Result<u32, StoreError> {
            u32::try_from(row.try_get::<i32, _>(name).map_err(db_error)?)
                .map_err(|_| StoreError::CorruptData)
        };
        let kind = match row.try_get::<String, _>("kind").map_err(db_error)?.as_str() {
            "Planet" => PhalanxEndpointKind::Planet,
            "Moon" => PhalanxEndpointKind::Moon,
            _ => return Err(StoreError::CorruptData),
        };
        origins.insert(
            id,
            PhalanxEndpoint {
                body: Some(id),
                kind,
                coordinates: Coordinates {
                    galaxy: coordinate("galaxy")?,
                    system: coordinate("system")?,
                    position: coordinate("position")?,
                },
            },
        );
    }
    let endpoints = fleets
        .iter()
        .map(|f| {
            let origin = origins
                .get(&f.intent.origin)
                .ok_or(StoreError::CorruptData)?
                .clone();
            phalanx_endpoints_from_origin(f, origin)
                .map(|e| (f.id, e))
                .map_err(|_| StoreError::CorruptData)
        })
        .collect::<Result<_, _>>()?;
    let groups: Vec<_> = fleets.iter().map(|f| f.id.to_string()).collect();
    let groups: Vec<AttackGroup> = sqlx::query_scalar::<_, serde_json::Value>("SELECT data FROM attack_groups WHERE universe=$1 AND data->>'resolved_at' IS NULL AND data->'members' ?| $2 ORDER BY id")
        .bind(u.0).bind(groups).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(decode_supported).collect::<Result<_,_>>()?;
    let participants: Vec<_> = fleets
        .iter()
        .map(|f| f.owner.0)
        .chain(missiles.iter().map(|f| f.owner.0))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut owners = BTreeMap::new();
    for row in sqlx::query("SELECT m.player,a.name FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1 AND m.player=ANY($2) ORDER BY m.player")
        .bind(u.0).bind(participants).fetch_all(&mut **tx).await.map_err(db_error)? {
        let id = PlayerId(row.try_get("player").map_err(db_error)?);
        owners.insert(id, PhalanxPublicOwner { id, name: row.try_get("name").map_err(db_error)? });
    }
    let w = state.world.as_mut().ok_or(StoreError::CorruptData)?;
    if let Some(body) = state.bodies.get(&target) {
        let policy: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT data FROM player_policies WHERE universe=$1 AND id=$2")
                .bind(u.0)
                .bind(body.owner.0)
                .fetch_optional(&mut **tx)
                .await
                .map_err(db_error)?;
        if let Some(policy) = policy {
            w.records
                .policies
                .insert(body.owner, decode_supported(policy)?);
        }
        w.covered_players.insert(body.owner);
    }
    w.records.fleets = fleets.into_iter().map(|f| (f.id, f)).collect();
    w.records.missiles = missiles.into_iter().map(|f| (f.id, f)).collect();
    w.records.attack_groups = groups.into_iter().map(|g| (g.id, g)).collect();
    w.phalanx = Some(PhalanxScanFacts {
        target,
        endpoints,
        owners,
    });
    if let Some(input_id) = input_id {
        let id = phalanx_report_id(input_id);
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mission_reports WHERE id=$1)")
                .bind(id.0)
                .fetch_one(&mut **tx)
                .await
                .map_err(db_error)?;
        if exists {
            return Err(StoreError::Conflict);
        }
        w.covered_reports.insert(id);
    }
    Ok(state)
}

/// Deployment completes the binary rollout before invoking normal rules apply.
/// Re-read authoritative active membership here; a preview is never readiness.
pub(crate) async fn activation(
    tx: &mut Tx<'_>,
    u: UniverseId,
    current: &Ruleset,
    next: &Ruleset,
) -> Result<(), orbit_application::RulesUpdateError> {
    if !phalanx_enabled(next) || phalanx_enabled(current) {
        return Ok(());
    }
    readiness(tx, u).await
}

/// Complete final data validation shared by rules publication and the exclusive
/// world-edit transaction after all scenario edits have been applied.
pub(crate) async fn readiness(
    tx: &mut Tx<'_>,
    u: UniverseId,
) -> Result<(), orbit_application::RulesUpdateError> {
    let fleets: Vec<MissionFleet> = sqlx::query_scalar::<_, serde_json::Value>("SELECT data FROM mission_fleets WHERE universe=$1 AND data->'intent'->'destination'->>'type' <> 'Site' AND data->>'leg' IN ('Outbound','Holding','Returning') ORDER BY id")
        .bind(u.0).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(decode_supported).collect::<Result<_,_>>()?;
    validate_phalanx_scan_readiness(true, &fleets)
        .map_err(orbit_application::RulesUpdateError::PhalanxActivationBlocked)
}

/// Do not persist new vocabulary for old workers while disabled or after a
/// deactivation boundary. Read active and queued rules in one statement so a
/// concurrent publication cannot fall between two eligibility reads. Admission
/// already holds the runtime shared lock used by barrier registration.
pub(crate) async fn admit(tx: &mut Tx<'_>, u: UniverseId) -> Result<(), StoreError> {
    let row = sqlx::query("SELECT r.profile,b.rules AS pending FROM universes u JOIN rulesets r ON r.hash=u.profile_hash LEFT JOIN runtime_barriers b ON b.universe=u.id AND NOT b.done WHERE u.id=$1")
        .bind(u.0).fetch_one(&mut **tx).await.map_err(db_error)?;
    let current: Ruleset = decode_supported(row.try_get("profile").map_err(db_error)?)?;
    let pending: Option<Ruleset> = row
        .try_get::<Option<serde_json::Value>, _>("pending")
        .map_err(db_error)?
        .map(decode_supported)
        .transpose()?;
    if !phalanx_enabled(&current) || pending.as_ref().is_some_and(|r| !phalanx_enabled(r)) {
        return Err(StoreError::GameRejected(GameError::UnavailableContent));
    }
    Ok(())
}

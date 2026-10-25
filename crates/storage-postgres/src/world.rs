//! R3 focused records under the existing universe gate. Player closure is bounded by the saved topology.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet};
async fn records<T: serde::de::DeserializeOwned>(
    tx: &mut Tx<'_>,
    u: UniverseId,
    table: &str,
) -> Result<Vec<T>, StoreError> {
    // table names are private compile-time call sites, never request data.
    sqlx::query_scalar::<_, serde_json::Value>(&format!(
        "SELECT data FROM {table} WHERE universe=$1 ORDER BY data::text"
    ))
    .bind(u.0)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?
    .into_iter()
    .map(decode)
    .collect()
}
/// `rules` must be validated for `u` by `facts::rules` in this transaction.
pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    rules: &Ruleset,
    input: &Input,
    input_id: Option<InputId>,
) -> Result<GameState, StoreError> {
    let mut selected = crate::scoped_facts::Selection {
        all: true,
        ..Default::default()
    };
    let owners: Vec<uuid::Uuid> =
        sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 ORDER BY id")
            .bind(u.0)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?;
    selected.owners.extend(owners.into_iter().map(PlayerId));
    load_selected(tx, u, epoch, rules, input, input_id, selected).await
}
/// Share the transaction's validated rules across every selected owner.
pub(crate) async fn load_selected(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    rules: &Ruleset,
    input: &Input,
    input_id: Option<InputId>,
    selected: crate::scoped_facts::Selection,
) -> Result<GameState, StoreError> {
    let requested_owners: Vec<_> = selected.owners.iter().map(|p| p.0).collect();
    let owners: Vec<uuid::Uuid> =
        sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 AND id=ANY($2) ORDER BY id")
            .bind(u.0)
            .bind(&requested_owners)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?;
    let capacity = rules
        .artifact
        .universe
        .as_ref()
        .ok_or(StoreError::CorruptData)?
        .homeworld_capacity()
        .map_err(|_| StoreError::CorruptData)?;
    if owners.len() > capacity as usize {
        return Err(StoreError::CorruptData);
    }
    let mut all: Option<GameState> = None;
    for owner in &owners {
        let part = crate::progression_state::load(
            tx,
            u,
            epoch,
            rules,
            Actor::Player(PlayerId(*owner)),
            input,
            input_id,
        )
        .await?;
        if let Some(s) = &mut all {
            s.bodies.extend(part.bodies);
            s.players.extend(part.players);
            s.inventories.extend(part.inventories);
            s.research.extend(part.research);
            s.constructions.extend(part.constructions);
            s.production_settings.extend(part.production_settings);
            s.research_operations.extend(part.research_operations);
            s.manufacturing_batches.extend(part.manufacturing_batches);
            s.collection_revisions.extend(part.collection_revisions);
            macro_rules! union{($($field:ident),*)=>{$(s.coverage.$field.extend(part.coverage.$field);)*};}
            union!(
                bodies,
                operations,
                fleet_ids,
                construction_bodies,
                inventory_owners,
                research_players,
                fleet_owners,
                production_bodies,
                research_operation_ids,
                research_slot_players,
                owned_body_players,
                lab_construction_players,
                manufacturing_operation_ids,
                manufacturing_bodies
            );
        } else {
            all = Some(part);
        }
    }
    let mut s = all.unwrap_or_else(|| GameState {
        world: None,
        production_settings: BTreeMap::new(),
        research_operations: BTreeMap::new(),
        manufacturing_batches: BTreeMap::new(),
        progression_reservations: BTreeMap::new(),
        fleets: BTreeMap::new(),
        reports: BTreeMap::new(),
        universe: u,
        epoch,
        profile_hash: rules.hash.clone(),
        bodies: BTreeMap::new(),
        players: BTreeMap::new(),
        inventories: Vec::new(),
        research: BTreeMap::new(),
        constructions: BTreeMap::new(),
        coverage: FactCoverage::default(),
        collection_revisions: BTreeMap::new(),
    });
    if let Input::Command(Command::World {
        action: WorldAction::LaunchFleet { intent, .. },
    }) = input
    {
        s.coverage.bodies.insert(intent.origin);
        if let MissionDestination::Body { id, .. } = intent.destination {
            s.coverage.bodies.insert(id);
        }
    }
    s.inventories.sort_by_key(|x| (x.body, x.owner, x.item));
    let body_ids: Vec<_> = s.bodies.keys().map(|id| id.0).collect();
    let owner_strings: Vec<_> = owners.iter().map(ToString::to_string).collect();
    let coordinate_values: Vec<_> = selected
        .coordinates
        .iter()
        .map(|c| serde_json::to_value(c).expect("coordinates"))
        .collect();
    let policies: Vec<PlayerPolicy> = if selected.all {
        records(tx, u, "player_policies").await?
    } else {
        sqlx::query_scalar(
            "SELECT data FROM player_policies WHERE universe=$1 AND id=ANY($2) ORDER BY id",
        )
        .bind(u.0)
        .bind(&owners)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(decode)
        .collect::<Result<_, _>>()?
    };
    let activity: Vec<BodyActivity> = if selected.all {
        records(tx, u, "body_activity").await?
    } else {
        sqlx::query_scalar(
            "SELECT data FROM body_activity WHERE universe=$1 AND id=ANY($2) ORDER BY id",
        )
        .bind(u.0)
        .bind(&body_ids)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(decode)
        .collect::<Result<_, _>>()?
    };
    let mut lots = if selected.all {
        records(tx, u, "asset_lots").await?
    } else {
        sqlx::query_scalar(
            "SELECT data FROM asset_lots WHERE universe=$1 AND data->>'owner'=ANY($2) ORDER BY key",
        )
        .bind(u.0)
        .bind(&owner_strings)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(decode)
        .collect::<Result<Vec<AssetLot>, _>>()?
    };
    normalize_asset_lots(&mut lots).map_err(|_| StoreError::CorruptData)?;
    let debris: Vec<DebrisField> = if selected.all {
        records(tx, u, "debris_fields").await?
    } else {
        sqlx::query_scalar("SELECT data FROM debris_fields WHERE universe=$1 AND data->'coordinates'=ANY($2) ORDER BY id")
            .bind(u.0).bind(&coordinate_values).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(decode).collect::<Result<_,_>>()?
    };
    let fleet_id = match input {
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet },
        })
        | Input::Event(ScheduledEvent::FleetLegDue { fleet, .. }) => Some(fleet.0),
        _ => None,
    };
    if let (
        Some(input_id),
        Input::Command(Command::World {
            action: WorldAction::LaunchFleet { .. },
        }),
    ) = (input_id, input)
    {
        let derived = derived_id(input_id, "mission:0");
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mission_fleets WHERE id=$1)")
                .bind(derived)
                .fetch_one(&mut **tx)
                .await
                .map_err(db_error)?;
        if exists {
            return Err(StoreError::CorruptData);
        }
        s.coverage.fleet_ids.insert(FleetId(derived));
    }
    let fleets: Vec<MissionFleet> = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT data FROM mission_fleets WHERE universe=$1 AND ((data->>'leg') IN ('Outbound','Returning') OR id=$2) AND ($3 OR owner=ANY($4) OR id=$2 OR (data->'intent'->'destination'->>'expected_owner'=$5 AND data->>'leg'='Outbound') OR data->'intent'->'destination'->'coordinates'=ANY($6)) ORDER BY id",
    )
    .bind(u.0)
    .bind(fleet_id)
    .bind(selected.all)
    .bind(&owners)
    .bind(selected.incoming_for.map(|p| p.to_string()))
    .bind(&coordinate_values)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?
    .into_iter()
    .map(decode)
    .collect::<Result<_, _>>()?;
    if let (
        Some(input_id),
        Input::Event(ScheduledEvent::FleetLegDue {
            fleet,
            expected_leg: MissionLeg::Outbound,
            ..
        }),
    ) = (input_id, input)
        && fleets
            .iter()
            .any(|f: &MissionFleet| f.id == *fleet && f.intent.mission == Mission::Colonize)
    {
        let id = BodyId(derived_id(input_id, "colony:0"));
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM bodies WHERE id=$1)")
            .bind(id.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
        if exists {
            return Err(StoreError::CorruptData);
        }
        s.coverage.bodies.insert(id);
    }
    for f in &fleets {
        if selected.owners.contains(&f.owner) {
            s.coverage.bodies.insert(f.intent.origin);
        }
        if let MissionDestination::Body {
            id, expected_owner, ..
        } = f.intent.destination
            && selected.owners.contains(&expected_owner)
        {
            s.coverage.bodies.insert(id);
        }
    }
    let report = match input {
        Input::Command(Command::World {
            action:
                WorldAction::MarkReportRead { report }
                | WorldAction::SetReportHidden { report, .. }
                | WorldAction::SetReportStarred { report, .. },
        }) => Some(*report),
        _ => None,
    };
    let mut reports = BTreeMap::new();
    let mut report_states = vec![];
    if let Some(id) = report {
        if let Some(data) =
            sqlx::query_scalar("SELECT data FROM mission_reports WHERE universe=$1 AND id=$2")
                .bind(u.0)
                .bind(id.0)
                .fetch_optional(&mut **tx)
                .await
                .map_err(db_error)?
        {
            let r: MissionReport = decode(data)?;
            reports.insert(r.id, r);
        }
        for row in sqlx::query(
            "SELECT recipient,read,hidden,starred FROM mission_report_recipients WHERE report=$1 AND recipient=ANY($2) ORDER BY recipient",
        )
        .bind(id.0)
        .bind(&owners)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
        {
            report_states.push(RecipientReportState {
                report: id,
                recipient: PlayerId(row.try_get("recipient").map_err(db_error)?),
                read: row.try_get("read").map_err(db_error)?,
                hidden: row.try_get("hidden").map_err(db_error)?,
                starred: row.try_get("starred").map_err(db_error)?,
            });
        }
    }
    let mut covered_reports: BTreeSet<ReportId> = report.into_iter().collect();
    if let (Some(input_id), Some(fleet)) = (input_id, fleet_id) {
        let ids: Vec<_> = [
            "Delivered",
            "Returned",
            "Recalled",
            "Harvested",
            "MissionFailed",
            "Colonized",
            "Deployed",
            "ColonizationFailed",
            "Espionage",
            "SpyContact",
            "Combat",
        ]
        .into_iter()
        .map(|kind| derived_id(input_id, &format!("report:{kind}:{fleet}")))
        .collect();
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mission_reports WHERE id=ANY($1))")
                .bind(&ids)
                .fetch_one(&mut **tx)
                .await
                .map_err(db_error)?;
        if exists {
            return Err(StoreError::CorruptData);
        }
        covered_reports.extend(ids.into_iter().map(ReportId));
    }
    let mut presence = BTreeMap::new();
    let mut requested_pair = None;
    if let Some(id) = input_id {
        for row in sqlx::query("SELECT data,succeeded FROM presence_pairs WHERE universe=$1 AND (presence_input=$2 OR gameplay_input=$2)").bind(u.0).bind(id.0).fetch_all(&mut **tx).await.map_err(db_error)?{let p:PresenceLink=decode(row.try_get("data").map_err(db_error)?)?;if p.presence==id{requested_pair=Some(p.clone());}
if row.try_get::<bool,_>("succeeded").map_err(db_error)?{presence.insert(p.gameplay,p);}}
    }
    let secret: Vec<u8> = sqlx::query_scalar("SELECT secret FROM mvp_bootstraps WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    #[cfg(feature = "test-support")]
    let secret = if let Some(input_id) = input_id {
        let exists: bool =
            sqlx::query_scalar("SELECT to_regclass('orbit_test_random') IS NOT NULL")
                .fetch_one(&mut **tx)
                .await
                .map_err(db_error)?;
        if exists {
            sqlx::query_scalar::<_, Vec<u8>>(
                "SELECT secret FROM orbit_test_random WHERE input_id=$1",
            )
            .bind(input_id.0)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?
            .unwrap_or(secret)
        } else {
            secret
        }
    } else {
        secret
    };
    // Scope/entity versions, not a universe revision, validate runtime facts.
    let revision = 0;
    let mut coords: BTreeSet<_> = selected
        .coordinates
        .iter()
        .map(|c| (c.galaxy, c.system, c.position))
        .collect();
    if selected.all {
        let dims = rules
            .artifact
            .universe
            .as_ref()
            .ok_or(StoreError::CorruptData)?;
        for g in 1..=dims.galaxies {
            for system in 1..=dims.systems_per_galaxy {
                for p in 1..=dims.positions_per_system {
                    coords.insert((g, system, p));
                }
            }
        }
    }
    let colonies: Vec<ColonyGenesis> = sqlx::query_scalar(
        "SELECT data FROM colony_genesis WHERE universe=$1 AND id=ANY($2) ORDER BY id",
    )
    .bind(u.0)
    .bind(&body_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?
    .into_iter()
    .map(decode)
    .collect::<Result<_, _>>()?;
    let mut planet_slots = Vec::new();
    if rules
        .artifact
        .world
        .as_ref()
        .and_then(|w| w.colonization.as_ref())
        .is_some()
    {
        // Load only public occupancy at declared coordinates, without pulling a
        // new occupant's private economy into the original fleet's player scope.
        let coordinates: Vec<_> = coords
            .iter()
            .map(|&(galaxy, system, position)| Coordinates {
                galaxy,
                system,
                position,
            })
            .filter(|c| {
                rules
                    .artifact
                    .universe
                    .as_ref()
                    .is_some_and(|u| u.contains(*c))
            })
            .collect();
        let values: Vec<_> = coordinates
            .iter()
            .map(|c| serde_json::to_value(c).expect("coordinates"))
            .collect();
        let rows = sqlx::query("SELECT c.galaxy,c.system,c.position,b.id,coalesce(h.revision,CASE WHEN b.id IS NULL THEN 0 ELSE 1 END) AS revision FROM jsonb_to_recordset($2) AS c(galaxy integer,system integer,position integer) LEFT JOIN bodies b ON b.universe=$1 AND b.galaxy=c.galaxy AND b.system=c.system AND b.position=c.position AND b.kind='Planet' LEFT JOIN planet_slot_revisions h ON h.universe=$1 AND h.galaxy=c.galaxy AND h.system=c.system AND h.position=c.position ORDER BY c.galaxy,c.system,c.position")
            .bind(u.0).bind(serde_json::Value::Array(values)).fetch_all(&mut **tx).await.map_err(db_error)?;
        for row in rows {
            planet_slots.push(PlanetSlot {
                coordinates: Coordinates {
                    galaxy: row.get::<i32, _>("galaxy") as u32,
                    system: row.get::<i32, _>("system") as u32,
                    position: row.get::<i32, _>("position") as u32,
                },
                occupant: row.get::<Option<uuid::Uuid>, _>("id").map(BodyId),
                revision: row.get("revision"),
            });
        }
    }
    s.world = Some(WorldFacts {
        planet_slots,
        records: WorldRecords {
            colonies: colonies.into_iter().map(|c| (c.body, c)).collect(),
            policies: policies.into_iter().map(|x| (x.player, x)).collect(),
            activity: activity.into_iter().map(|x| (x.body, x)).collect(),
            lots,
            fleets: fleets.into_iter().map(|x| (x.id, x)).collect(),
            debris: debris.into_iter().map(|x| (x.id, x)).collect(),
            reports,
            report_states,
            presence,
        },
        secret: secret.try_into().map_err(|_| StoreError::CorruptData)?,
        covered_players: owners.into_iter().map(PlayerId).collect(),
        covered_coordinates: coords,
        covered_reports,
        requested_pair,
        revision,
    });
    validate_asset_lineage(&s).map_err(|_| StoreError::CorruptData)?;
    Ok(s)
}
async fn put<T: serde::Serialize>(
    tx: &mut Tx<'_>,
    u: UniverseId,
    table: &str,
    id: uuid::Uuid,
    data: &T,
) -> Result<(), StoreError> {
    sqlx::query(&format!("INSERT INTO {table}(universe,id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE {table}.universe=excluded.universe")).bind(u.0).bind(id).bind(sqlx::types::Json(data)).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

pub(crate) async fn viewer_snapshot(
    tx: &mut Tx<'_>,
    universe: UniverseId,
    epoch: Epoch,
    player: PlayerId,
    revision: i64,
    at: i64,
    rules: Ruleset,
) -> Result<ViewerSnapshot, StoreError> {
    let state = load_selected(
        tx,
        universe,
        epoch,
        &rules,
        &Input::Command(Command::RecallFleet {
            fleet: FleetId::default(),
        }),
        None,
        crate::scoped_facts::Selection {
            owners: BTreeSet::from([player]),
            incoming_for: Some(player),
            ..Default::default()
        },
    )
    .await?;
    let destinations = crate::views::public_destinations(tx, universe).await?;
    // Read in the same snapshot as the viewer revision. This is an existence
    // witness, not a persisted counter or a scan of the paginated inbox.
    let unread_report = sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT r.id FROM mission_report_recipients p JOIN mission_reports r ON r.id=p.report WHERE r.universe=$1 AND p.recipient=$2 AND NOT p.read AND NOT p.hidden LIMIT 1",
    )
    .bind(universe.0)
    .bind(player.0)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .map(ReportId);
    Ok(ViewerSnapshot {
        unread_report,
        coverage: state.coverage.clone(),
        bodies: state.bodies.values().cloned().collect(),
        inventories: state.inventories.clone(),
        research: state
            .research
            .get(&player)
            .cloned()
            .ok_or(StoreError::CorruptData)?,
        constructions: state.constructions.values().cloned().collect(),
        fleets: Vec::new(),
        reports: Vec::new(),
        progression: None,
        world: Some(state),
        universe,
        epoch,
        player,
        revision,
        at,
        rules,
        destinations,
    })
}
pub(crate) async fn save(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    s: &GameState,
    c: &WorldChanges,
) -> Result<(), StoreError> {
    let old = &s.world.as_ref().ok_or(StoreError::CorruptData)?.records;
    let u = i.universe;
    for (id, genesis) in &c.records.colonies {
        if !old.colonies.contains_key(id) {
            sqlx::query("INSERT INTO colony_genesis(universe,id,data) VALUES($1,$2,$3)")
                .bind(u.0)
                .bind(id.0)
                .bind(sqlx::types::Json(genesis))
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
        } else if old.colonies.get(id) != Some(genesis) {
            return Err(StoreError::CorruptData);
        }
    }
    for (x, p) in &c.records.policies {
        if old.policies.get(x) != Some(p) {
            put(tx, u, "player_policies", x.0, p).await?;
        }
    }
    for (x, p) in &c.records.activity {
        if old.activity.get(x) != Some(p) {
            put(tx, u, "body_activity", x.0, p).await?;
        }
    }
    if old.lots != c.records.lots {
        let owners: Vec<_> = s
            .world
            .as_ref()
            .ok_or(StoreError::CorruptData)?
            .covered_players
            .iter()
            .map(ToString::to_string)
            .collect();
        sqlx::query("DELETE FROM asset_lots WHERE universe=$1 AND data->>'owner'=ANY($2)")
            .bind(u.0)
            .bind(owners)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        // One round trip: a mature player holds hundreds of lots.
        let keys: Vec<String> = (0..c.records.lots.len())
            .map(|index| format!("{}:{index}", i.id))
            .collect();
        let data = c
            .records
            .lots
            .iter()
            .map(serde_json::to_value)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| StoreError::CorruptData)?;
        sqlx::query("INSERT INTO asset_lots(universe,key,data) SELECT $1,k,d FROM unnest($2::text[],$3::jsonb[]) AS t(k,d)")
            .bind(u.0)
            .bind(keys)
            .bind(data)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    for (x, f) in &c.records.fleets {
        if old.fleets.get(x) != Some(f) {
            sqlx::query("INSERT INTO mission_fleets(universe,id,owner,data) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE mission_fleets.universe=excluded.universe").bind(u.0).bind(x.0).bind(f.owner.0).bind(sqlx::types::Json(f)).execute(&mut **tx).await.map_err(db_error)?;
        }
    }
    for (x, p) in &c.records.debris {
        if old.debris.get(x) != Some(p) {
            put(tx, u, "debris_fields", x.0, p).await?;
        }
    }
    for (x, p) in &c.records.presence {
        if old.presence.get(x) != Some(p) {
            let n=sqlx::query("UPDATE presence_pairs SET succeeded=true WHERE universe=$1 AND gameplay_input=$2 AND presence_input=$3 AND data=$4").bind(u.0).bind(x.0).bind(p.presence.0).bind(sqlx::types::Json(p)).execute(&mut **tx).await.map_err(db_error)?;
            if n.rows_affected() != 1 {
                return Err(StoreError::CorruptData);
            }
        }
    }
    for (id, report) in &c.records.reports {
        if old.reports.contains_key(id) {
            continue;
        }
        sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,$4,$5,$6)").bind(u.0).bind(id.0).bind(report.event.0).bind(&report.kind).bind(report.at).bind(sqlx::types::Json(report)).execute(&mut **tx).await.map_err(db_error)?;
        for recipient in report.payloads.keys() {
            let revision:i64=sqlx::query_scalar("UPDATE mission_report_heads SET revision=revision+1 WHERE universe=$1 AND recipient=$2 RETURNING revision").bind(u.0).bind(recipient.0).fetch_one(&mut **tx).await.map_err(db_error)?;
            sqlx::query("INSERT INTO mission_report_recipients(report,recipient,created_revision) VALUES($1,$2,$3)").bind(id.0).bind(recipient.0).bind(revision).execute(&mut **tx).await.map_err(db_error)?;
        }
    }
    for state in &c.records.report_states {
        if old.report_states.contains(state) {
            continue;
        }
        if !s
            .world
            .as_ref()
            .ok_or(StoreError::CorruptData)?
            .covered_players
            .contains(&state.recipient)
        {
            return Err(StoreError::CorruptData);
        }
        sqlx::query("UPDATE mission_report_recipients SET read=$3,hidden=$4,starred=$5 WHERE report=$1 AND recipient=$2").bind(state.report.0).bind(state.recipient.0).bind(state.read).bind(state.hidden).bind(state.starred).execute(&mut **tx).await.map_err(db_error)?;
    }
    sqlx::query("INSERT INTO world_evidence(universe,input,deltas,audits) VALUES($1,$2,$3,$4)")
        .bind(u.0)
        .bind(i.id.0)
        .bind(sqlx::types::Json(&c.score_deltas))
        .bind(sqlx::types::Json(&c.audits))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
impl PgStore {
    pub(crate) async fn admit_pair(
        &self,
        pair: ForegroundAction,
    ) -> Result<BoundReceipt, StoreError> {
        let (p, mut g) = pair.validate().map_err(|_| StoreError::Conflict)?;
        let b = pair.gameplay.binding;
        let (mut tx, scoped) = self.begin_admission(b.universe).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let rules = crate::facts::rules(&mut tx, b.universe).await?;
        if !rules.world() {
            return Err(StoreError::UnsupportedProtocol);
        }
        let pair_hash = hash(&pair);
        if let Some(receipt) = crate::admission::existing_pair(&mut tx, &pair).await? {
            return Ok(receipt);
        }
        let runtime = runtime(&mut tx, b.universe).await?;
        let indexed = scoped
            || runtime
                .try_get::<String, _>("executor_mode")
                .map_err(db_error)?
                == "preparing";
        let presence_scopes = BTreeSet::from([ScopeKey::Player(b.player)]);
        let inherited = if indexed {
            let (command, scopes) =
                crate::scope_references::resolve_command(&mut tx, b.universe, b.epoch, b.player, g)
                    .await?;
            g = command;
            scopes
        } else {
            Default::default()
        };
        let mut gameplay_scopes = if indexed {
            crate::scoped_facts::select(
                &mut tx,
                b.universe,
                Actor::Player(b.player),
                &Input::Command(g.clone()),
            )
            .await?
            .scopes()
        } else {
            Default::default()
        };
        gameplay_scopes.extend(inherited);
        let (at, _ordering_hold) = if scoped {
            crate::admission::stamp(&mut tx, b.universe, &gameplay_scopes, self.observer.clone())
                .await?
        } else {
            (
                now(&mut tx)
                    .await?
                    .max(runtime.try_get("frontier").map_err(db_error)?),
                self.timer(RuntimeStage::OrderingHold),
            )
        };
        if let Some(receipt) = crate::admission::existing_pair(&mut tx, &pair).await? {
            return Ok(receipt);
        }
        let recent: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM commands WHERE universe=$1 AND actor=$2 AND at_ms>$3",
        )
        .bind(b.universe.0)
        .bind(b.player.0)
        .bind(at - 60000)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let limit = self.command_limit(&mut tx, b.universe).await?;
        if recent >= 2 * limit {
            return Err(StoreError::RateLimited);
        }
        let pi = InputId(uuid::Uuid::new_v4());
        let gi = InputId(uuid::Uuid::new_v4());
        let body = if let Command::World {
            action: WorldAction::RecordForegroundPresence { body, .. },
        } = &p
        {
            *body
        } else {
            return Err(StoreError::Conflict);
        };
        for (envelope, command, id) in [(&pair.presence, p, pi), (&pair.gameplay, g, gi)] {
            let sequence = next_sequence(&mut tx, b.universe).await?;
            let input = OrderedInput {
                schema_version: 4,
                id,
                universe: b.universe,
                epoch: b.epoch,
                actor: Actor::Player(b.player),
                at,
                phase: 1,
                sequence,
                protocol: 4,
                profile_hash: rules.hash.clone(),
                payload: Input::Command(command),
            };
            let receipt = Receipt {
                command_id: envelope.command_id,
                epoch: b.epoch,
                admitted_at: at,
                executed_at: None,
                status: ReceiptStatus::Pending,
            };
            sqlx::query("INSERT INTO commands(universe,actor,command_id,input_id,intent_hash,at_ms,sequence,input,receipt,epoch) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)").bind(b.universe.0).bind(b.player.0).bind(envelope.command_id.0).bind(id.0).bind(&pair_hash.0).bind(at).bind(sequence).bind(sqlx::types::Json(&input)).bind(sqlx::types::Json(receipt)).bind(b.epoch.0).execute(&mut *tx).await.map_err(db_error)?;
            if indexed {
                crate::admission::register(
                    &mut tx,
                    &input,
                    if id == pi {
                        &presence_scopes
                    } else {
                        &gameplay_scopes
                    },
                )
                .await?;
            }
        }
        let link = PresenceLink {
            presence: pi,
            gameplay: gi,
            player: b.player,
            body,
            at,
        };
        sqlx::query("INSERT INTO presence_pairs(universe,presence_input,gameplay_input,data) VALUES($1,$2,$3,$4)").bind(b.universe.0).bind(pi.0).bind(gi.0).bind(sqlx::types::Json(link)).execute(&mut *tx).await.map_err(db_error)?;
        if !scoped {
            sqlx::query("UPDATE universe_runtime SET frontier=$2 WHERE universe=$1")
                .bind(b.universe.0)
                .bind(at)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        #[cfg(feature = "test-support")]
        self.test_fault("before_pair_admission").await?;
        tx.commit().await.map_err(db_error)?;
        #[cfg(feature = "test-support")]
        self.test_fault("after_pair_admission").await?;
        let mut result = BoundReceipt::new(
            b,
            Receipt {
                command_id: pair.gameplay.command_id,
                epoch: b.epoch,
                admitted_at: at,
                executed_at: None,
                status: ReceiptStatus::Pending,
            },
        );
        result.protocol = 4;
        Ok(result)
    }
    pub(crate) async fn world_snapshot(
        &self,
        b: Binding,
    ) -> Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError> {
        self.world_snapshot_query(b, None).await
    }
    pub(crate) async fn world_snapshot_query(
        &self,
        b: Binding,
        query: Option<&WorldQueryKind>,
    ) -> Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let at = if query.is_some() {
            crate::snapshots::estimate_time(&mut tx, b.universe, b.player).await?
        } else {
            crate::snapshots::safe_time(&mut tx, b.universe, b.player).await?
        };
        let rules = crate::facts::rules(&mut tx, b.universe).await?;
        if !rules.world() {
            return Err(StoreError::UnsupportedProtocol);
        }
        let selected = if let Some(query) = query {
            crate::scoped_facts::select_query(&mut tx, b, query, &rules).await?
        } else {
            crate::scoped_facts::Selection {
                owners: BTreeSet::from([b.player]),
                incoming_for: Some(b.player),
                ..Default::default()
            }
        };
        let state = load_selected(
            &mut tx,
            b.universe,
            b.epoch,
            &rules,
            &Input::Command(Command::RecallFleet {
                fleet: FleetId::default(),
            }),
            None,
            selected,
        )
        .await?;
        let rev =
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(b.universe.0)
                .bind(b.player.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        let snapshot = crate::snapshots::wrap(
            &mut tx,
            b.universe,
            b.player,
            (QuoteSnapshot { state, rules, at }, rev),
        )
        .await?;
        tx.commit().await.map_err(db_error)?;
        Ok(snapshot)
    }
    pub(crate) async fn report_page(
        &self,
        q: ReportsQuery4,
    ) -> Result<ReadSnapshot<(ReportsPage4, i64)>, StoreError> {
        if !(1..=100).contains(&q.limit) {
            return Err(StoreError::Conflict);
        }
        let b = q.context.binding;
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let at = crate::snapshots::safe_time(&mut tx, b.universe, b.player).await?;
        let head: i64 = sqlx::query_scalar(
            "SELECT revision FROM mission_report_heads WHERE universe=$1 AND recipient=$2",
        )
        .bind(b.universe.0)
        .bind(b.player.0)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let (cut, last_at, last_id) = if let Some(cursor) = &q.cursor {
            let token = uuid::Uuid::parse_str(cursor).map_err(|_| StoreError::InvalidCursor)?;
            let row=sqlx::query("SELECT cut,last_at,last_id FROM mission_report_cursors WHERE token=$1 AND binding=$2 AND kind IS NOT DISTINCT FROM $3 AND include_hidden=$4").bind(token).bind(sqlx::types::Json(b)).bind(&q.kind).bind(q.include_hidden).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::InvalidCursor)?;
            (
                row.try_get("cut").map_err(db_error)?,
                Some(row.try_get::<i64, _>("last_at").map_err(db_error)?),
                Some(row.try_get::<uuid::Uuid, _>("last_id").map_err(db_error)?),
            )
        } else {
            (head, None, None)
        };
        let rows=sqlx::query("SELECT r.id,r.kind,r.at_ms,p.read,p.hidden,p.starred,r.data->'payloads'->(p.recipient::text) AS preview_payload FROM mission_reports r JOIN mission_report_recipients p ON p.report=r.id WHERE r.universe=$1 AND p.recipient=$2 AND p.created_revision<=$3 AND ($4::text IS NULL OR r.kind=$4) AND ($5 OR NOT p.hidden) AND ($6::bigint IS NULL OR (r.at_ms,r.id)<($6,$7)) ORDER BY r.at_ms DESC,r.id DESC LIMIT $8").bind(b.universe.0).bind(b.player.0).bind(cut).bind(&q.kind).bind(q.include_hidden).bind(last_at).bind(last_id).bind(i64::from(q.limit)+1).fetch_all(&mut *tx).await.map_err(db_error)?;
        let rules = crate::facts::rules(&mut tx, b.universe).await?;
        let has_more = rows.len() > q.limit as usize;
        let items = rows
            .iter()
            .take(q.limit as usize)
            .map(|row| header(row, &rules))
            .collect::<Result<Vec<_>, _>>()?;
        let mut cursor_record = None;
        let next_cursor = if has_more {
            let last = items.last().ok_or(StoreError::CorruptData)?;
            let token = uuid::Uuid::new_v4();
            cursor_record = Some((token, last.observed_at, last.id));
            Some(token.to_string())
        } else {
            None
        };
        let rev =
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(b.universe.0)
                .bind(b.player.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        let snapshot = crate::snapshots::wrap(
            &mut tx,
            b.universe,
            b.player,
            (
                ReportsPage4 {
                    player_names: Default::default(),
                    items,
                    next_cursor,
                    has_more,
                    as_of_ms: at,
                },
                rev,
            ),
        )
        .await?;
        tx.commit().await.map_err(db_error)?;
        if let Some((token, last_at, last_id)) = cursor_record {
            sqlx::query("INSERT INTO mission_report_cursors(token,binding,kind,include_hidden,cut,last_at,last_id) VALUES($1,$2,$3,$4,$5,$6,$7)").bind(token).bind(sqlx::types::Json(b)).bind(&q.kind).bind(q.include_hidden).bind(cut).bind(last_at).bind(last_id.0).execute(self.read_pool()?).await.map_err(db_error)?;
        }
        Ok(snapshot)
    }
    pub(crate) async fn report_detail(
        &self,
        b: Binding,
        id: ReportId,
    ) -> Result<ReadSnapshot<(ReportDetail4, i64, i64)>, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, b).await?;
        let at = crate::snapshots::safe_time(&mut tx, b.universe, b.player).await?;
        let row=sqlx::query("SELECT r.id,r.kind,r.at_ms,p.read,p.hidden,p.starred,r.data,r.data->'payloads'->(p.recipient::text) AS preview_payload FROM mission_reports r JOIN mission_report_recipients p ON p.report=r.id WHERE r.universe=$1 AND r.id=$2 AND p.recipient=$3").bind(b.universe.0).bind(id.0).bind(b.player.0).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        let r: MissionReport = decode(row.try_get("data").map_err(db_error)?)?;
        let rules = crate::facts::rules(&mut tx, b.universe).await?;
        let detail = ReportDetail4 {
            player_names: Default::default(),
            header: header(&row, &rules)?,
            payload: r
                .payloads
                .get(&b.player)
                .cloned()
                .ok_or(StoreError::CorruptData)?,
        };
        let rev =
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(b.universe.0)
                .bind(b.player.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        let snapshot =
            crate::snapshots::wrap(&mut tx, b.universe, b.player, (detail, at, rev)).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(snapshot)
    }
}
fn header(row: &sqlx::postgres::PgRow, rules: &Ruleset) -> Result<ReportHeader4, StoreError> {
    let payload: serde_json::Value = row.try_get("preview_payload").map_err(db_error)?;
    if !payload.is_object() {
        return Err(StoreError::CorruptData);
    }
    Ok(ReportHeader4 {
        fleet_investment: orbit_application::report_preview::report_investment(
            &payload, "fleet", rules,
        ),
        defense_investment: orbit_application::report_preview::report_investment(
            &payload, "defenses", rules,
        ),
        preview: Some(orbit_application::report_preview(&payload)),
        id: ReportId(row.try_get("id").map_err(db_error)?),
        kind: row.try_get("kind").map_err(db_error)?,
        observed_at: row.try_get("at_ms").map_err(db_error)?,
        read: row.try_get("read").map_err(db_error)?,
        hidden: row.try_get("hidden").map_err(db_error)?,
        starred: row.try_get("starred").map_err(db_error)?,
    })
}

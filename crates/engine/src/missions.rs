//! Single R3 movement state machine, shared by all enabled missions.
use crate::transition::{Fault, invariant, resources};
use crate::*;
use serde_json::json;
use std::collections::BTreeSet;
fn body<'a>(s: &'a GameState, id: BodyId, r: &Ruleset) -> Result<&'a Body, Fault> {
    validate_body(s, id, r)?.ok_or(GameError::NotFound.into())
}
fn sum(r: Resources) -> Result<i64, GameError> {
    r.values()
        .into_iter()
        .try_fold(0i64, |a, n| a.checked_add(n))
        .ok_or(GameError::NumericRange)
}
fn item(s: ShipType) -> CatalogKey {
    CatalogKey::Ship(s)
}
fn target(
    s: &GameState,
    d: &MissionDestination,
    r: &Ruleset,
) -> Result<(Coordinates, Option<PlayerId>), Fault> {
    match d {
        MissionDestination::EmptyPosition { coordinates, .. } => {
            if !r
                .artifact
                .universe
                .as_ref()
                .is_some_and(|u| u.contains(*coordinates))
            {
                return Err(GameError::NotFound.into());
            }
            planet_slot(s, *coordinates)?;
            Ok((*coordinates, None))
        }
        MissionDestination::Body {
            id,
            expected_kind,
            expected_owner,
        } => {
            let b = body(s, *id, r)?;
            if b.kind != *expected_kind || b.owner != *expected_owner {
                return Err(GameError::NotFound.into());
            }
            Ok((b.coordinates, Some(b.owner)))
        }
        MissionDestination::Debris {
            coordinates,
            field_identity,
        } => {
            let w = world_facts(s)?;
            let f = w
                .records
                .debris
                .get(field_identity)
                .filter(|f| f.coordinates == *coordinates && f.marker_present)
                .ok_or(GameError::NoHarvestTarget)?;
            Ok((f.coordinates, None))
        }
    }
}
/// Derive the active propulsion profile from completed research at quotation/launch.
/// Disabling further research does not remove bonuses already earned. Retained
/// artifacts without an upgrade continue using their original combustion terms.
pub fn ship_propulsion(
    rule: &ShipRule,
    research: &ResearchLevels,
) -> Result<(i64, i64), GameError> {
    let level = |key| {
        research
            .levels
            .get(&key)
            .copied()
            .ok_or(GameError::PolicyUnavailable)
    };
    let (base, coefficient, fuel, completed) = match &rule.impulse_drive {
        Some(upgrade) if level(ResearchId::ImpulseDrive)? >= upgrade.minimum_level => (
            upgrade.base_speed,
            [1, 5],
            upgrade.fuel,
            level(ResearchId::ImpulseDrive)?,
        ),
        _ => (
            rule.base_speed,
            rule.drive_coefficient,
            rule.fuel,
            level(rule.drive.unwrap_or(ResearchId::CombustionDrive))?,
        ),
    };
    let multiplier =
        i128::from(coefficient[1]) + i128::from(coefficient[0]) * i128::from(completed);
    let speed = i128::from(base)
        .checked_mul(multiplier)
        .and_then(|value| value.checked_div(i128::from(coefficient[1])))
        .ok_or(GameError::NumericRange)?;
    Ok((
        i64::try_from(speed).map_err(|_| GameError::NumericRange)?,
        fuel,
    ))
}

pub fn fleet_terms(
    intent: &FleetIntent,
    origin: Coordinates,
    target: Coordinates,
    research: &ResearchLevels,
    r: &Ruleset,
) -> Result<FleetTerms, GameError> {
    if !r.world() {
        return Err(GameError::UnavailableContent);
    }
    let p = r
        .artifact
        .universe
        .as_ref()
        .ok_or(GameError::UnavailableContent)?;
    if !p.contains(origin)
        || !p.contains(target)
        || intent.ships.is_empty()
        || intent.ships.len() > r.artifact.ships.len()
        || intent
            .cargo
            .values()
            .iter()
            .any(|n| *n < 0 || n % SCALE != 0)
    {
        return Err(GameError::InvalidInput);
    }
    let mut intent = intent.clone();
    intent.ships.sort_by_key(|s| (s.owner, s.ship_type));
    let mut seen = BTreeSet::new();
    let mut profiles = vec![];
    let (mut capacity, mut probe_capacity) = (0i64, 0i64);
    let mut speeds = vec![];
    for stack in &intent.ships {
        if stack.count <= 0 || !seen.insert((stack.owner, stack.ship_type)) {
            return Err(GameError::InvalidInput);
        }
        let rule = r
            .artifact
            .ships
            .get(&stack.ship_type)
            .ok_or(GameError::UnavailableContent)?;
        let (speed, fuel) = ship_propulsion(rule, research)?;
        profiles.push((speed, fuel, stack.count));
        speeds.push((stack.ship_type, speed.to_string()));
        capacity = capacity
            .checked_add(
                stack
                    .count
                    .checked_mul(rule.capacity)
                    .and_then(|v| v.checked_mul(SCALE))
                    .ok_or(GameError::NumericRange)?,
            )
            .ok_or(GameError::NumericRange)?;
        if stack.ship_type == ShipType::EspionageProbe {
            probe_capacity = stack
                .count
                .checked_mul(5 * SCALE)
                .ok_or(GameError::NumericRange)?;
        }
    }
    let distance = galaxy_distance(origin, target);
    let (duration_ms, fuel) = exact_flight_arithmetic(
        distance,
        &profiles,
        i64::from(intent.speed_percent),
        i64::from(r.speed),
    )?;
    let maximum_payload = capacity
        .checked_add(probe_capacity)
        .and_then(|v| v.checked_sub(fuel))
        .filter(|v| *v >= 0)
        .ok_or(GameError::CargoCapacity)?
        .min(capacity);
    if sum(intent.cargo)? > maximum_payload {
        return Err(GameError::CargoCapacity);
    }
    Ok(FleetTerms {
        intent,
        profile_hash: r.hash.clone(),
        distance,
        speeds,
        duration_ms,
        fuel,
        capacity,
        maximum_payload,
        slot_limit: 0,
        terms_hash: Hash(String::new()),
    })
}
/// Concurrent mission slots unlocked by completed computer technology.
pub fn fleet_slot_limit(computer_level: u32) -> i64 {
    1 + i64::from(computer_level)
}

pub fn quote_fleet(
    s: &GameState,
    owner: PlayerId,
    intent: &FleetIntent,
    at: Timestamp,
    r: &Ruleset,
) -> Result<FleetTerms, GameError> {
    match quote_inner(s, owner, intent, at, r) {
        Ok(q) => Ok(q),
        Err(Fault::Game(e)) => Err(e),
        Err(Fault::Invariant(_)) => Err(GameError::PolicyUnavailable),
    }
}
fn quote_inner(
    s: &GameState,
    owner: PlayerId,
    intent: &FleetIntent,
    at: Timestamp,
    r: &Ruleset,
) -> Result<FleetTerms, Fault> {
    let b = body(s, intent.origin, r)?;
    if b.owner != owner {
        return Err(GameError::NotOwned.into());
    }
    let w = world_facts(s)?;
    validate_asset_lineage(s)?;
    if !s.coverage.inventory_owners.contains(&(b.id, owner))
        || !s.coverage.research_players.contains(&owner)
        || !w.covered_players.contains(&owner)
    {
        return Err(invariant("incomplete fleet coverage"));
    }
    let (coords, target_owner) = target(s, &intent.destination, r)?;
    check_mission_eligibility(s, owner, target_owner, intent.mission, at, r)?;
    if matches!(intent.destination,MissionDestination::Body{id,..} if id==b.id) {
        return Err(GameError::InvalidInput.into());
    }
    match (intent.mission, &intent.destination) {
        (
            Mission::Colonize,
            MissionDestination::EmptyPosition {
                coordinates,
                slot_revision,
            },
        ) => {
            let slot = planet_slot(s, *coordinates)?;
            if slot.occupant.is_some() {
                return Err(GameError::PositionOccupied.into());
            }
            if slot.revision != *slot_revision {
                return Err(GameError::QuoteChanged.into());
            }
            if !colony_position_unlocked(completed_astrophysics(s, owner)?, coordinates.position) {
                return Err(GameError::PrerequisiteMissing.into());
            }
            if !intent
                .ships
                .iter()
                .any(|x| x.ship_type == ShipType::ColonyShip && x.count > 0)
            {
                return Err(GameError::InsufficientShips.into());
            }
            resources(
                intent.cargo,
                Resources::from_values([500 * SCALE, 500 * SCALE, 0]),
                true,
            )?;
        }
        (Mission::Harvest, MissionDestination::Debris { .. })
            if intent
                .ships
                .iter()
                .any(|x| x.ship_type == ShipType::Recycler && x.count > 0) => {}
        (
            Mission::Transport | Mission::Attack | Mission::Deploy,
            MissionDestination::Body { .. },
        ) => {}
        (Mission::Espionage, MissionDestination::Body { .. })
            if intent
                .ships
                .iter()
                .any(|x| x.ship_type == ShipType::EspionageProbe && x.count > 0) => {}
        _ => return Err(GameError::InvalidInput.into()),
    }
    let research = s
        .research
        .get(&owner)
        .ok_or_else(|| invariant("missing research"))?;
    validate_research_catalog(research, r)?;
    let mut q = fleet_terms(intent, b.coordinates, coords, research, r)?;
    q.slot_limit = fleet_slot_limit(
        *research
            .levels
            .get(&ResearchId::ComputerTechnology)
            .ok_or_else(|| invariant("missing computer"))?,
    );
    if w.records
        .fleets
        .values()
        .filter(|f| f.owner == owner && f.active())
        .count() as i64
        >= q.slot_limit
    {
        return Err(GameError::NoFleetSlot.into());
    }
    for x in &intent.ships {
        if x.owner != owner {
            return Err(GameError::NotOwned.into());
        }
        let available = s
            .inventories
            .iter()
            .find(|v| {
                v.body == b.id && v.owner == owner && v.item == ManufacturedItem::Ship(x.ship_type)
            })
            .map_or(0, |v| v.count);
        if x.count > available {
            return Err(GameError::InsufficientShips.into());
        }
    }
    let cost = resources(
        intent.cargo,
        Resources {
            deuterium: q.fuel,
            ..Resources::default()
        },
        true,
    )?;
    resources(settle_production(s, b, at, r)?.amounts, cost, false)?;
    deadline(deadline(at, q.duration_ms)?, q.duration_ms)?;
    q.terms_hash = hash(&json!({"protocol":4,"terms":q}));
    Ok(q)
}
fn inventory(
    c: &mut ChangeSet,
    s: &GameState,
    b: BodyId,
    owner: PlayerId,
    ship: ShipType,
    n: i64,
) -> Result<(), Fault> {
    let key = ManufacturedItem::Ship(ship);
    let old = c
        .inventories
        .iter()
        .find(|v| v.body == b && v.owner == owner && v.item == key)
        .or_else(|| {
            s.inventories
                .iter()
                .find(|v| v.body == b && v.owner == owner && v.item == key)
        });
    let count = old
        .map_or(0, |v| v.count)
        .checked_add(n)
        .filter(|n| *n >= 0)
        .ok_or(GameError::InsufficientShips)?;
    let revision = old
        .map_or(Some(0), |v| v.revision.checked_add(1))
        .ok_or(GameError::NumericRange)?;
    c.inventories
        .retain(|v| !(v.body == b && v.owner == owner && v.item == key));
    c.inventories.push(InventoryStack {
        body: b,
        owner,
        item: key,
        count,
        revision,
    });
    Ok(())
}
fn credit(
    c: &mut ChangeSet,
    s: &GameState,
    id: BodyId,
    cargo: Resources,
    at: Timestamp,
    r: &Ruleset,
) -> Result<(), Fault> {
    let mut b = c
        .bodies
        .iter()
        .find(|b| b.id == id)
        .unwrap_or(body(s, id, r)?)
        .clone();
    b.checkpoint = settle_production(s, &b, at, r)?;
    b.checkpoint.amounts = resources(b.checkpoint.amounts, cargo, true)?;
    b.revision = b.revision.checked_add(1).ok_or(GameError::NumericRange)?;
    c.affected_viewers.insert(b.owner);
    c.bodies.retain(|x| x.id != id);
    c.bodies.push(b);
    Ok(())
}
fn signal(w: &mut WorldRecords, id: BodyId, i: &OrderedInput, cause: ActivityCause) {
    if w.activity.get(&id).is_none_or(|a| a.last_signal_at <= i.at) {
        w.activity.insert(
            id,
            BodyActivity {
                body: id,
                last_signal_at: i.at,
                cause,
                input: i.id,
            },
        );
    }
}
pub(crate) fn mission_report(
    w: &mut WorldRecords,
    i: &OrderedInput,
    f: &MissionFleet,
    kind: &str,
    payloads: std::collections::BTreeMap<PlayerId, serde_json::Value>,
) {
    let id = ReportId(derived_id(i.id, &format!("report:{kind}:{}", f.id)));
    w.reports.insert(
        id,
        MissionReport {
            id,
            event: i.id,
            kind: kind.into(),
            at: i.at,
            fleet: Some(f.id),
            rules_hash: i.profile_hash.clone(),
            payloads,
        },
    );
}
fn own_report(w: &mut WorldRecords, i: &OrderedInput, f: &MissionFleet, kind: &str) {
    mission_report(
        w,
        i,
        f,
        kind,
        std::collections::BTreeMap::from([(
            f.owner,
            json!({"kind":kind,"fleet":f.id,"origin":f.intent.origin,"destination":f.intent.destination,"origin_coordinates":f.origin_coordinates,"destination_coordinates":f.destination_coordinates,"cargo":wire_resources(f.cargo),"ships":f.ships.iter().map(|s|json!({"ship_type":s.ship_type,"count":s.count.to_string()})).collect::<Vec<_>>(),"at":i.at}),
        )]),
    );
}
fn schedule(c: &mut ChangeSet, i: &OrderedInput, f: &MissionFleet) {
    c.events.push(NewEvent {
        id: InputId(derived_id(i.id, &format!("leg:{}:{}", f.id, f.generation))),
        at: f.due_at,
        event: ScheduledEvent::FleetLegDue {
            fleet: f.id,
            generation: f.generation,
            expected_leg: f.leg,
        },
    });
}
fn terminal_return(
    c: &mut ChangeSet,
    s: &GameState,
    w: &mut WorldRecords,
    i: &OrderedInput,
    f: &mut MissionFleet,
    r: &Ruleset,
) -> Result<(), Fault> {
    let home = body(s, f.intent.origin, r)
        .map_err(|_| invariant("missing committed return identity; flight retained"))?;
    if home.owner != f.owner {
        return Err(invariant("return ownership changed; flight retained"));
    }
    credit(c, s, home.id, f.cargo, i.at, r)?;
    for x in &f.ships {
        inventory(c, s, home.id, f.owner, x.ship_type, x.count)?;
        let lots = take_asset_lots(
            &mut w.lots,
            f.owner,
            item(x.ship_type),
            &AssetLocation::Fleet(f.id),
            x.count,
            Some(AssetLocation::Body(home.id)),
        )?;
        w.lots.extend(lots);
    }
    if let MissionDestination::Debris { field_identity, .. } = f.intent.destination {
        let field = w
            .debris
            .get_mut(&field_identity)
            .ok_or_else(|| invariant("missing harvest reference"))?;
        field.revision = field
            .revision
            .checked_add(1)
            .ok_or(GameError::NumericRange)?;
    }
    f.leg = MissionLeg::Returned;
    signal(w, home.id, i, ActivityCause::Return);
    own_report(w, i, f, "Returned");
    Ok(())
}
fn empty(s: &GameState, i: &OrderedInput, r: &Ruleset) -> ChangeSet {
    ChangeSet {
        world: None,
        production_settings: vec![],
        research_operations: vec![],
        manufacturing_batches: vec![],
        progression_reservations: vec![],
        fleets: vec![],
        inventories: vec![],
        research: vec![],
        reports: vec![],
        input: i.id,
        profile_hash: r.hash.clone(),
        expected_facts_hash: hash(s),
        expected_collection_revisions: s.collection_revisions.clone(),
        bodies: vec![],
        constructions: vec![],
        events: vec![],
        cancelled_events: vec![],
        affected_viewers: BTreeSet::new(),
    }
}
pub(crate) fn resolve(s: &GameState, i: &OrderedInput, r: &Ruleset) -> Result<ChangeSet, Fault> {
    if i.schema_version != 4
        || i.protocol != 4
        || s.universe != i.universe
        || s.epoch != i.epoch
        || s.profile_hash != r.hash
        || i.profile_hash != r.hash
        || !(0..=MAX_WIRE_MS).contains(&i.at)
        || i.phase
            != if matches!(i.payload, Input::Event(_)) {
                0
            } else {
                1
            }
    {
        return Err(invariant("invalid R3 binding"));
    }
    let facts = world_facts(s)?;
    validate_asset_lineage(s)?;
    let mut w = facts.records.clone();
    let mut c = empty(s, i, r);
    let mut audits = vec![];
    if let Input::Command(command) = &i.payload {
        let Actor::Player(owner) = i.actor else {
            return Err(invariant("command actor"));
        };
        if !matches!(
            command,
            Command::World {
                action: WorldAction::RecordForegroundPresence { .. }
            }
        ) {
            let link = w
                .presence
                .get(&i.id)
                .ok_or(GameError::PresenceUnavailable)?;
            if link.player != owner || link.at != i.at {
                return Err(GameError::PresenceUnavailable.into());
            }
            let expected_body = match command {
                Command::SetProduction { body, .. }
                | Command::StartUpgrade { body, .. }
                | Command::StartDemolition { body, .. }
                | Command::StartManufacture { body, .. } => Some(*body),
                Command::StartResearch { host, .. } => Some(*host),
                Command::CancelConstruction { operation } => {
                    s.constructions.get(operation).map(|op| op.body)
                }
                Command::CancelResearch { operation } => {
                    s.research_operations.get(operation).map(|op| op.host)
                }
                Command::World {
                    action: WorldAction::LaunchFleet { intent, .. },
                } => Some(intent.origin),
                Command::World {
                    action: WorldAction::RecallMission { fleet },
                } => w.fleets.get(fleet).map(|f| f.intent.origin),
                _ => None,
            };
            if link.body != expected_body {
                return Err(GameError::PresenceUnavailable.into());
            }
            let p = w
                .policies
                .get(&owner)
                .ok_or_else(|| invariant("missing actor policy"))?;
            if !matches!(
                command,
                Command::World {
                    action: WorldAction::MarkReportRead { .. }
                        | WorldAction::SetReportHidden { .. }
                }
            ) {
                if p.vacation {
                    return Err(GameError::ActorVacation.into());
                }
                if matches!(
                    p.lifecycle,
                    PlayerLifecycle::DeletionDraining | PlayerLifecycle::Removed
                ) {
                    return Err(GameError::ActorDraining.into());
                }
            }
        }
    } else if i.actor != Actor::Scheduler {
        return Err(invariant("event actor"));
    }
    match &i.payload {
        Input::Command(Command::World {
            action:
                WorldAction::RecordForegroundPresence {
                    body: signal_body, ..
                },
        }) => {
            let Actor::Player(owner) = i.actor else {
                return Err(invariant("presence actor"));
            };
            if let Some(id) = signal_body {
                // A complete owned-body collection proves this stale/foreign ID
                // is not owned. It is a game rejection, not missing engine facts.
                if s.coverage.owned_body_players.contains(&owner) && !s.bodies.contains_key(id) {
                    return Err(GameError::NotOwned.into());
                }
                if body(s, *id, r)?.owner != owner {
                    return Err(GameError::NotOwned.into());
                }
                signal(&mut w, *id, i, ActivityCause::Foreground);
            }
            let p = w
                .policies
                .get_mut(&owner)
                .ok_or_else(|| invariant("missing player policy"))?;
            p.last_presence_at = p.last_presence_at.max(i.at);
            p.revision = p.revision.checked_add(1).ok_or(GameError::NumericRange)?;
            if let Some(link) = &facts.requested_pair {
                if link.presence != i.id
                    || link.player != owner
                    || link.at != i.at
                    || link.body != *signal_body
                {
                    return Err(invariant("inconsistent presence pair"));
                }
                w.presence.insert(link.gameplay, link.clone());
            }
            c.affected_viewers.insert(owner);
        }
        Input::Command(Command::World {
            action:
                WorldAction::LaunchFleet {
                    intent,
                    expected_terms_hash,
                },
        }) => {
            let Actor::Player(owner) = i.actor else {
                return Err(invariant("launch actor"));
            };
            if w.presence[&i.id].body != Some(intent.origin) {
                return Err(GameError::PresenceUnavailable.into());
            }
            let q = quote_inner(s, owner, intent, i.at, r)?;
            if &q.terms_hash != expected_terms_hash {
                return Err(GameError::QuoteChanged.into());
            }
            let origin = body(s, intent.origin, r)?;
            let (coords, target_owner) = target(s, &intent.destination, r)?;
            let id = FleetId(derived_id(i.id, "mission:0"));
            if w.fleets.contains_key(&id) {
                return Err(invariant("duplicate fleet identity"));
            }
            let mut b = origin.clone();
            b.checkpoint = settle_production(s, &b, i.at, r)?;
            b.checkpoint.amounts = resources(
                b.checkpoint.amounts,
                resources(
                    intent.cargo,
                    Resources {
                        deuterium: q.fuel,
                        ..Resources::default()
                    },
                    true,
                )?,
                false,
            )?;
            b.revision = b.revision.checked_add(1).ok_or(GameError::NumericRange)?;
            c.bodies.push(b);
            for x in &q.intent.ships {
                inventory(&mut c, s, origin.id, owner, x.ship_type, -x.count)?;
                let lots = take_asset_lots(
                    &mut w.lots,
                    owner,
                    item(x.ship_type),
                    &AssetLocation::Body(origin.id),
                    x.count,
                    Some(AssetLocation::Fleet(id)),
                )?;
                w.lots.extend(lots);
            }
            let f = MissionFleet {
                id,
                owner,
                intent: q.intent.clone(),
                origin_coordinates: origin.coordinates,
                destination_coordinates: coords,
                ships: q
                    .intent
                    .ships
                    .iter()
                    .map(|x| ShipStack {
                        owner: x.owner,
                        ship_type: x.ship_type,
                        count: x.count,
                    })
                    .collect(),
                cargo: intent.cargo,
                launched_at: i.at,
                due_at: deadline(i.at, q.duration_ms)?,
                generation: 0,
                leg: MissionLeg::Outbound,
                revision: 0,
                authorization: MissionAuthorization {
                    actor: owner,
                    target_owner,
                    at: i.at,
                    input: i.id,
                    policy_hash: r.hash.clone(),
                },
                terms: q,
            };
            if let MissionDestination::Debris { field_identity, .. } = f.intent.destination {
                let field = w
                    .debris
                    .get_mut(&field_identity)
                    .ok_or_else(|| invariant("missing field"))?;
                field.revision = field
                    .revision
                    .checked_add(1)
                    .ok_or(GameError::NumericRange)?;
            }
            signal(&mut w, origin.id, i, ActivityCause::Launch);
            schedule(&mut c, i, &f);
            c.affected_viewers.insert(owner);
            if let Some(owner) = target_owner {
                c.affected_viewers.insert(owner);
            }
            w.fleets.insert(id, f);
        }
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet },
        }) => {
            let mut f = w.fleets.get(fleet).ok_or(GameError::NotFound)?.clone();
            if i.actor != Actor::Player(f.owner) {
                return Err(GameError::NotOwned.into());
            }
            if f.leg != MissionLeg::Outbound {
                return Err(GameError::NotOutbound.into());
            }
            if i.at >= f.due_at {
                return Err(invariant("arrival not settled before recall"));
            }
            c.cancelled_events.push(ScheduledEvent::FleetLegDue {
                fleet: f.id,
                generation: f.generation,
                expected_leg: f.leg,
            });
            f.generation = f.generation.checked_add(1).ok_or(GameError::NumericRange)?;
            f.revision = f.revision.checked_add(1).ok_or(GameError::NumericRange)?;
            f.leg = MissionLeg::Returning;
            if i.at == f.launched_at {
                terminal_return(&mut c, s, &mut w, i, &mut f, r)?;
            } else {
                f.due_at = deadline(i.at, i.at - f.launched_at)?;
                schedule(&mut c, i, &f);
                own_report(&mut w, i, &f, "Recalled");
            }
            c.affected_viewers.insert(f.owner);
            if let Some(owner) = f.authorization.target_owner {
                c.affected_viewers.insert(owner);
            }
            w.fleets.insert(*fleet, f);
        }
        Input::Event(ScheduledEvent::FleetLegDue {
            fleet,
            generation,
            expected_leg,
        }) => {
            let mut f = w
                .fleets
                .get(fleet)
                .ok_or_else(|| invariant("missing due fleet"))?
                .clone();
            if f.generation != *generation || f.leg != *expected_leg {
                return Ok(c);
            }
            if i.at != f.due_at {
                return Err(invariant("fleet deadline mismatch"));
            }
            f.generation = f.generation.checked_add(1).ok_or(GameError::NumericRange)?;
            f.revision = f.revision.checked_add(1).ok_or(GameError::NumericRange)?;
            c.affected_viewers.insert(f.owner);
            if f.leg == MissionLeg::Returning {
                terminal_return(&mut c, s, &mut w, i, &mut f, r)?;
            } else if f.leg == MissionLeg::Outbound {
                let physical = target(s, &f.intent.destination, r);
                match physical {
                    Err(Fault::Game(GameError::NotFound)) => {
                        own_report(&mut w, i, &f, "MissionFailed")
                    }
                    Err(e) => return Err(e),
                    Ok((_, target_owner)) => {
                        match f.intent.mission {
                            Mission::Deploy => {
                                let MissionDestination::Body { id, .. } = f.intent.destination
                                else {
                                    return Err(invariant("deploy target"));
                                };
                                if target_owner != Some(f.owner) {
                                    return Err(invariant("deploy owner"));
                                }
                                let cargo = resources(
                                    f.cargo,
                                    Resources::from_values([
                                        0,
                                        0,
                                        (f.terms.fuel / SCALE / 2) * SCALE,
                                    ]),
                                    true,
                                )?;
                                credit(&mut c, s, id, cargo, i.at, r)?;
                                for ship in &f.ships {
                                    inventory(&mut c, s, id, f.owner, ship.ship_type, ship.count)?;
                                    let lots = take_asset_lots(
                                        &mut w.lots,
                                        f.owner,
                                        item(ship.ship_type),
                                        &AssetLocation::Fleet(f.id),
                                        ship.count,
                                        Some(AssetLocation::Body(id)),
                                    )?;
                                    w.lots.extend(lots);
                                }
                                f.cargo = cargo;
                                own_report(&mut w, i, &f, "Deployed");
                                f.cargo = Resources::default();
                                f.leg = MissionLeg::Deployed;
                            }
                            Mission::Colonize => crate::colonization::colony_arrival(
                                s,
                                i,
                                &mut f,
                                r,
                                &mut c,
                                &mut w,
                                &mut audits,
                            )?,
                            Mission::Transport => {
                                let MissionDestination::Body { id, .. } = f.intent.destination
                                else {
                                    return Err(invariant("transport target"));
                                };
                                let cargo = f.cargo;
                                audits.push(json!({"kind":"TransportDeliveryEvidence","input":i.id,"at":i.at,"sequence":i.sequence,"sender":f.owner,"recipient":target_owner,"fleet":f.id,"origin":f.intent.origin,"target":id,"cargo":wire_resources(cargo),"sender_score_value_micro":value_completed_assets(&w.lots,f.owner)?.to_string(),"recipient_score_value_micro":value_completed_assets(&w.lots,expected_recipient(&f.intent.destination)?)?.to_string(),"policy_hash":r.hash}));
                                credit(&mut c, s, id, cargo, i.at, r)?;
                                let mut payloads = std::collections::BTreeMap::new();
                                for owner in [Some(f.owner), target_owner].into_iter().flatten() {
                                    payloads.insert(owner,json!({"kind":"Delivered","at":i.at,"sender":f.owner,"recipient":target_owner,"origin":f.origin_coordinates,"target":f.destination_coordinates,"cargo":wire_resources(cargo)}));
                                }
                                mission_report(&mut w, i, &f, "Delivered", payloads);
                                f.cargo = Resources::default();
                            }
                            Mission::Harvest => {
                                let MissionDestination::Debris { field_identity, .. } =
                                    f.intent.destination
                                else {
                                    return Err(invariant("harvest target"));
                                };
                                let field = w
                                    .debris
                                    .get_mut(&field_identity)
                                    .ok_or_else(|| invariant("missing harvest field"))?;
                                let cap = payload_capacity(&f.ships, r)?;
                                let recycler = f
                                    .ships
                                    .iter()
                                    .find(|x| x.ship_type == ShipType::Recycler)
                                    .map_or(0, |x| x.count)
                                    .checked_mul(20000 * SCALE)
                                    .ok_or(GameError::NumericRange)?;
                                let free = (cap - sum(f.cargo)?).max(0).min(recycler) / SCALE;
                                let (m, k) = harvest_allocation(
                                    field.metal / SCALE,
                                    field.crystal / SCALE,
                                    free,
                                )?;
                                field.metal -= m * SCALE;
                                field.crystal -= k * SCALE;
                                field.revision = field
                                    .revision
                                    .checked_add(1)
                                    .ok_or(GameError::NumericRange)?;
                                f.cargo = resources(
                                    f.cargo,
                                    Resources::from_values([m * SCALE, k * SCALE, 0]),
                                    true,
                                )?;
                                own_report(&mut w, i, &f, "Harvested");
                            }
                            Mission::Attack => crate::encounter::attack_encounter(
                                s,
                                i,
                                &mut f,
                                r,
                                &mut c,
                                &mut w,
                                &mut audits,
                            )?,
                            Mission::Espionage => crate::encounter::spy_encounter(
                                s,
                                i,
                                &mut f,
                                r,
                                &mut c,
                                &mut w,
                                &mut audits,
                            )?,
                        }
                        if let MissionDestination::Body { id, .. } = f.intent.destination {
                            signal(&mut w, id, i, ActivityCause::Contact);
                            if let Some(owner) = target_owner {
                                c.affected_viewers.insert(owner);
                            }
                        }
                    }
                }
                if matches!(f.leg, MissionLeg::Colonized | MissionLeg::Deployed) {
                    // The single consumed ship leaves no empty return obligation.
                } else if f.ships.is_empty() {
                    f.leg = MissionLeg::Destroyed;
                } else {
                    f.leg = MissionLeg::Returning;
                    f.due_at = deadline(i.at, f.terms.duration_ms)?;
                    schedule(&mut c, i, &f);
                }
            } else {
                return Err(invariant("terminal fleet scheduled"));
            }
            w.fleets.insert(*fleet, f);
        }
        Input::Event(ScheduledEvent::DebrisCleanupDue { field, generation }) => {
            let f = w
                .debris
                .get_mut(field)
                .ok_or_else(|| invariant("missing cleanup field"))?;
            if f.generation != *generation || !f.marker_present {
                return Ok(c);
            }
            if f.cleanup_at != i.at {
                return Err(invariant("cleanup deadline mismatch"));
            }
            if i128::from(f.metal) + i128::from(f.crystal) < 300 * i128::from(SCALE)
                && debris_reference_count(*field, w.fleets.values()) == 0
            {
                audits.push(json!({"kind":"DebrisCleanupLoss","field":f.id,"metal":f.metal.to_string(),"crystal":f.crystal.to_string()}));
                f.metal = 0;
                f.crystal = 0;
                f.marker_present = false;
            } else {
                f.cleanup_at = next_debris_cleanup(i.at)?;
                c.events.push(NewEvent {
                    id: InputId(derived_id(i.id, "cleanup:0")),
                    at: f.cleanup_at,
                    event: ScheduledEvent::DebrisCleanupDue {
                        field: *field,
                        generation: *generation,
                    },
                });
            }
            f.revision = f.revision.checked_add(1).ok_or(GameError::NumericRange)?;
        }
        Input::Command(Command::World {
            action:
                WorldAction::MarkReportRead { report } | WorldAction::SetReportHidden { report, .. },
        }) => {
            let Actor::Player(owner) = i.actor else {
                return Err(invariant("report actor"));
            };
            if !w
                .reports
                .get(report)
                .is_some_and(|r| r.payloads.contains_key(&owner))
            {
                return Err(GameError::NotFound.into());
            }
            let pos = w
                .report_states
                .iter()
                .position(|x| x.report == *report && x.recipient == owner);
            let idx = if let Some(idx) = pos {
                idx
            } else {
                w.report_states.push(RecipientReportState {
                    report: *report,
                    recipient: owner,
                    read: false,
                    hidden: false,
                });
                w.report_states.len() - 1
            };
            match &i.payload {
                Input::Command(Command::World {
                    action: WorldAction::SetReportHidden { hidden, .. },
                }) => w.report_states[idx].hidden = *hidden,
                _ => w.report_states[idx].read = true,
            };
            c.affected_viewers.insert(owner);
        }
        _ => {
            c = crate::progression::resolve(s, i, r)?;
            progression_valuation(s, i, &c, &mut w)?;
        }
    }
    normalize_asset_lots(&mut w.lots)?;
    validate_committed_value_capacity(s, &c, &w)?;
    let mut values = std::collections::BTreeMap::<(PlayerId, OperationId), i128>::new();
    for lot in &facts.records.lots {
        *values.entry((lot.owner, lot.id)).or_default() -=
            i128::from(lot.quantity) * i128::from(lot.unit_value_micro);
    }
    for lot in &w.lots {
        *values.entry((lot.owner, lot.id)).or_default() +=
            i128::from(lot.quantity) * i128::from(lot.unit_value_micro);
    }
    let mut deltas = vec![];
    for ((player, lot), delta) in values {
        if delta != 0 {
            deltas.push(ScoreLedgerDelta {
                input: i.id,
                player,
                lot,
                delta: i64::try_from(delta).map_err(|_| invariant("score delta overflow"))?,
                valuation_hash: r.hash.clone(),
            });
        }
    }
    for owner in &facts.covered_players {
        value_completed_assets(&w.lots, *owner)?;
    }
    c.world = Some(WorldChanges {
        records: w,
        score_deltas: deltas,
        audits,
    });
    Ok(c)
}
pub fn payload_capacity(ships: &[ShipStack], r: &Ruleset) -> Result<i64, GameError> {
    ships.iter().try_fold(0i64, |sum, x| {
        let rule = r
            .artifact
            .ships
            .get(&x.ship_type)
            .ok_or(GameError::UnavailableContent)?;
        sum.checked_add(
            x.count
                .checked_mul(rule.capacity)
                .and_then(|n| n.checked_mul(SCALE))
                .ok_or(GameError::NumericRange)?,
        )
        .ok_or(GameError::NumericRange)
    })
}

fn expected_recipient(d: &MissionDestination) -> Result<PlayerId, Fault> {
    if let MissionDestination::Body { expected_owner, .. } = d {
        Ok(*expected_owner)
    } else {
        Err(invariant("missing delivery recipient"))
    }
}

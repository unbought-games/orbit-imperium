use crate::numeric::add;
use crate::transition::{Fault, invariant, require_body, resources};
use crate::*;
use std::collections::BTreeSet;
fn require_ships(s: &GameState, body: BodyId) -> Result<(), Fault> {
    if !s
        .coverage
        .inventory_owners
        .contains(&(body, require_body(s, body)?.owner))
    {
        return Err(invariant("incomplete ship inventory"));
    }
    Ok(())
}
fn require_fleets(s: &GameState, owner: PlayerId) -> Result<(), Fault> {
    if !s.coverage.fleet_owners.contains(&owner) {
        return Err(invariant("incomplete fleet collection"));
    }
    Ok(())
}
fn report(
    i: &OrderedInput,
    f: &Fleet,
    kind: ReportKind,
    cargo: Resources,
    recipients: BTreeSet<PlayerId>,
) -> Report {
    Report {
        id: ReportId(derived_id(i.id, "report:0")),
        fleet: f.id,
        kind,
        at: i.at,
        origin: f.origin,
        target: f.target,
        cargo,
        recipients,
    }
}
fn restore(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    f: &mut Fleet,
    change: &mut ChangeSet,
) -> Result<(), Fault> {
    require_ships(s, f.origin)?;
    let mut origin = require_body(s, f.origin)
        .map_err(|_| invariant("fleet origin missing"))?
        .clone();
    if origin.owner != f.owner {
        return Err(invariant("fleet origin ownership changed"));
    }
    origin.checkpoint = settle_economy(&origin, i.at, r)?;
    origin.checkpoint.amounts =
        resources(origin.checkpoint.amounts, f.payload, true).map_err(InvariantError::from)?;
    origin.revision = add(origin.revision, 1)?;
    for stack in &f.ships {
        let existing = s.inventories.iter().find(|v| {
            v.body == f.origin
                && v.owner == stack.owner
                && v.item == ManufacturedItem::Ship(stack.ship_type)
        });
        let mut next = existing.cloned().unwrap_or(InventoryStack {
            body: f.origin,
            owner: stack.owner,
            item: ManufacturedItem::Ship(stack.ship_type),
            count: 0,
            revision: 0,
        });
        next.count = add(next.count, stack.count).map_err(InvariantError::from)?;
        next.revision = add(next.revision, 1)?;
        change.inventories.push(next);
    }
    f.payload = Resources::default();
    f.status = FleetStatus::Completed;
    change.bodies.push(origin);
    change.affected_viewers.insert(f.owner);
    Ok(())
}
pub(crate) fn resolve_fleet(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    change: &mut ChangeSet,
) -> Result<(), Fault> {
    match &i.payload {
        Input::Command(Command::LaunchTransport {
            origin,
            target,
            ships,
            cargo,
            speed_percent,
            expected_terms_hash,
        }) => {
            let source = require_body(s, *origin)?;
            if i.actor != Actor::Player(source.owner) {
                return Err(GameError::NotOwned.into());
            }
            let destination = require_body(s, *target)?;
            require_ships(s, *origin)?;
            require_fleets(s, source.owner)?;
            mobile_inventory(s, *origin, source.owner, r)?;
            let q = quote(
                s,
                i.actor,
                &QuoteRequest::Transport {
                    origin: *origin,
                    target: *target,
                    ships: ships.clone(),
                    cargo: *cargo,
                    speed_percent: *speed_percent,
                },
                i.at,
                r,
            )?;
            if &q.terms_hash != expected_terms_hash {
                return Err(GameError::QuoteChanged.into());
            }
            let slots = research_level(s, source.owner, ResearchId::ComputerTechnology)?
                .checked_add(1)
                .ok_or(GameError::NumericRange)?;
            if s.fleets
                .values()
                .filter(|f| f.owner == source.owner && f.status != FleetStatus::Completed)
                .count()
                >= slots as usize
            {
                return Err(GameError::NoFleetSlot.into());
            }
            for stack in ships {
                let mut inventory = s
                    .inventories
                    .iter()
                    .find(|v| {
                        v.body == *origin
                            && v.owner == stack.owner
                            && v.item == ManufacturedItem::Ship(stack.ship_type)
                    })
                    .cloned()
                    .ok_or(GameError::InsufficientShips)?;
                inventory.count = inventory
                    .count
                    .checked_sub(stack.count)
                    .filter(|v| *v >= 0)
                    .ok_or(GameError::InsufficientShips)?;
                inventory.revision = add(inventory.revision, 1)?;
                change.inventories.push(inventory);
            }
            let mut body = source.clone();
            body.checkpoint = settle_economy(&body, i.at, r)?;
            let cost = resources(*cargo, q.cost, true)?;
            body.checkpoint.amounts = resources(body.checkpoint.amounts, cost, false)?;
            body.revision = add(body.revision, 1)?;
            let id = FleetId(derived_id(i.id, "fleet:0"));
            if s.fleets.contains_key(&id) {
                return Err(invariant("derived fleet ID already exists"));
            }
            let fleet = Fleet {
                id,
                owner: body.owner,
                origin: *origin,
                target: *target,
                target_owner: destination.owner,
                target_kind: destination.kind,
                ships: ships.clone(),
                payload: *cargo,
                paid_fuel: q.fuel,
                profile_hash: r.hash.clone(),
                terms_hash: q.terms_hash.clone(),
                launched_at: i.at,
                duration: q.duration,
                due_at: deadline(i.at, q.duration)?,
                generation: 0,
                status: FleetStatus::Outbound,
                revision: 0,
            };
            change.events.push(NewEvent {
                id: InputId(derived_id(i.id, "event:0")),
                at: fleet.due_at,
                event: ScheduledEvent::TransportArrived {
                    fleet: id,
                    generation: 0,
                },
            });
            change.affected_viewers.insert(body.owner);
            change.bodies.push(body);
            change.fleets.push(fleet);
        }
        Input::Command(Command::RecallFleet { fleet }) => {
            if !s.coverage.fleet_ids.contains(fleet) {
                return Err(invariant("incomplete fleet lookup"));
            }
            let original = s.fleets.get(fleet).ok_or(GameError::NotFound)?;
            if i.actor != Actor::Player(original.owner) {
                return Err(GameError::NotOwned.into());
            }
            require_fleets(s, original.owner)?;
            if original.status != FleetStatus::Outbound {
                return Err(GameError::NotOutbound.into());
            }
            if i.at >= original.due_at {
                return Err(invariant("arrival not resolved before recall"));
            }
            let elapsed =
                i.at.checked_sub(original.launched_at)
                    .filter(|v| *v >= 0)
                    .ok_or_else(|| invariant("recall precedes launch"))?;
            let mut fleet = original.clone();
            fleet.status = FleetStatus::Returning;
            fleet.generation = add(fleet.generation, 1)?;
            fleet.revision = add(fleet.revision, 1)?;
            fleet.due_at = deadline(i.at, elapsed.max(1))?;
            if elapsed == 0 {
                fleet.due_at = i.at;
            };
            change
                .cancelled_events
                .push(ScheduledEvent::TransportArrived {
                    fleet: fleet.id,
                    generation: original.generation,
                });
            change.reports.push(report(
                i,
                &fleet,
                ReportKind::Recalled,
                fleet.payload,
                BTreeSet::from([fleet.owner]),
            ));
            if elapsed == 0 {
                restore(s, i, r, &mut fleet, change)?
            } else {
                change.events.push(NewEvent {
                    id: InputId(derived_id(i.id, "event:0")),
                    at: fleet.due_at,
                    event: ScheduledEvent::FleetReturned {
                        fleet: fleet.id,
                        generation: fleet.generation,
                    },
                })
            }
            change.affected_viewers.insert(fleet.owner);
            change.fleets.push(fleet);
        }
        Input::Event(
            event @ (ScheduledEvent::TransportArrived { fleet, generation }
            | ScheduledEvent::FleetReturned { fleet, generation }),
        ) => {
            if i.actor != Actor::Scheduler {
                return Err(invariant("fleet event without scheduler actor"));
            }
            let original = s
                .fleets
                .get(fleet)
                .ok_or_else(|| invariant("scheduled fleet missing"))?;
            require_fleets(s, original.owner)?;
            let expected_status = if matches!(event, ScheduledEvent::TransportArrived { .. }) {
                FleetStatus::Outbound
            } else {
                FleetStatus::Returning
            };
            if original.generation != *generation || original.status != expected_status {
                return Ok(());
            }
            if original.due_at != i.at || original.profile_hash != r.hash {
                return Err(invariant("fleet event terms mismatch"));
            }
            let mut fleet = original.clone();
            fleet.revision = add(fleet.revision, 1)?;
            if matches!(event, ScheduledEvent::TransportArrived { .. }) {
                if !s.coverage.bodies.contains(&fleet.target) {
                    return Err(invariant("incomplete target existence fact"));
                }
                let target = s.bodies.get(&fleet.target).filter(|b| {
                    b.owner == fleet.target_owner
                        && b.kind == fleet.target_kind
                        && b.universe == s.universe
                });
                if let Some(target) = target {
                    let mut target = target.clone();
                    target.checkpoint = settle_economy(&target, i.at, r)?;
                    target.checkpoint.amounts =
                        resources(target.checkpoint.amounts, fleet.payload, true)
                            .map_err(InvariantError::from)?;
                    target.revision = add(target.revision, 1)?;
                    change.reports.push(report(
                        i,
                        &fleet,
                        ReportKind::Delivered,
                        fleet.payload,
                        BTreeSet::from([fleet.owner, target.owner]),
                    ));
                    change.affected_viewers.insert(target.owner);
                    change.bodies.push(target);
                    fleet.payload = Resources::default();
                } else {
                    change.reports.push(report(
                        i,
                        &fleet,
                        ReportKind::DeliveryFailed,
                        fleet.payload,
                        BTreeSet::from([fleet.owner]),
                    ));
                }
                fleet.status = FleetStatus::Returning;
                fleet.generation = add(fleet.generation, 1)?;
                fleet.due_at = deadline(i.at, fleet.duration)?;
                change.events.push(NewEvent {
                    id: InputId(derived_id(i.id, "event:0")),
                    at: fleet.due_at,
                    event: ScheduledEvent::FleetReturned {
                        fleet: fleet.id,
                        generation: fleet.generation,
                    },
                });
            } else {
                let cargo = fleet.payload;
                restore(s, i, r, &mut fleet, change)?;
                change.reports.push(report(
                    i,
                    &fleet,
                    ReportKind::Returned,
                    cargo,
                    BTreeSet::from([fleet.owner]),
                ));
            }
            change.affected_viewers.insert(fleet.owner);
            change.fleets.push(fleet);
        }
        _ => return Err(invariant("non-fleet input routed to fleet transition")),
    }
    Ok(())
}

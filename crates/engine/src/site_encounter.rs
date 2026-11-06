//! Site policy around the ordinary fleet and combat engines. No NPC player assets.
use crate::transition::{Fault, invariant, resources};
use crate::*;
use std::collections::BTreeMap;

fn error(e: SiteError) -> GameError {
    match e {
        SiteError::NotFound => GameError::NotFound,
        SiteError::StaleRevision | SiteError::Busy | SiteError::Retired => GameError::QuoteChanged,
        _ => GameError::InvalidInput,
    }
}
pub(crate) fn authorize(s: &GameState, owner: PlayerId, intent: &FleetIntent) -> Result<(), Fault> {
    if let MissionDestination::Site { selection } = intent.destination {
        let world = world_facts(s)?;
        if !world.site_fleets_enabled {
            return Err(GameError::UnavailableContent.into());
        }
        let site = world
            .records
            .mission_sites
            .get(&selection.id)
            .ok_or(GameError::NotFound)?;
        site.resolve(s.universe, s.epoch, owner, selection)
            .map_err(error)?;
        site.authorize_mission(s.universe, s.epoch, owner, intent.mission)
            .map_err(error)?;
        if intent.attack_group.is_some() {
            return Err(GameError::InvalidInput.into());
        }
    }
    Ok(())
}
fn reference(f: &MissionFleet) -> SiteOperationReference {
    SiteOperationReference {
        operation: OperationId(f.id.0),
        fleet: f.id,
        actor: f.owner,
    }
}
fn append(site: &mut MissionSite, i: &OrderedInput, kind: SiteEventKind) -> Result<(), Fault> {
    site.append(i, site.revision(), kind)
        .map_err(|_| invariant("invalid site execution fact"))
}
pub(crate) fn accept(
    w: &mut WorldRecords,
    i: &OrderedInput,
    f: &MissionFleet,
) -> Result<(), Fault> {
    if let MissionDestination::Site { selection } = f.intent.destination {
        let site = w
            .mission_sites
            .get_mut(&selection.id)
            .ok_or_else(|| invariant("missing accepted site"))?;
        append(
            site,
            i,
            SiteEventKind::OperationAccepted {
                reference: reference(f),
            },
        )?;
    }
    Ok(())
}
pub(crate) fn settle_reference(
    w: &mut WorldRecords,
    i: &OrderedInput,
    f: &MissionFleet,
) -> Result<(), Fault> {
    if let MissionDestination::Site { selection } = f.intent.destination {
        let site = w
            .mission_sites
            .get_mut(&selection.id)
            .ok_or_else(|| invariant("missing retained site"))?;
        append(
            site,
            i,
            SiteEventKind::OperationSettled {
                operation: OperationId(f.id.0),
                fleet: f.id,
            },
        )?;
    }
    Ok(())
}
pub(crate) fn arrive(
    s: &GameState,
    i: &OrderedInput,
    f: &mut MissionFleet,
    r: &Ruleset,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    let MissionDestination::Site { selection } = f.intent.destination else {
        return Err(invariant("site destination"));
    };
    let site = w
        .mission_sites
        .get_mut(&selection.id)
        .ok_or_else(|| invariant("missing retained site"))?;
    if site.creation.issuance.beneficiary != f.owner
        || !site.active_references().contains(&reference(f))
        || site.creation.coordinates != f.destination_coordinates
    {
        return Err(invariant("site accepted identity mismatch"));
    }
    let combat = &r
        .artifact
        .world
        .as_ref()
        .ok_or_else(|| invariant("combat rules"))?
        .combat;
    let input = BattleInput {
        encounter_id: i.id,
        at: i.at,
        target: selection.id,
        rules_hash: r.hash.clone(),
        participants: vec![
            BattleParticipant {
                owner: CombatIdentity::Player(f.owner),
                origin: BattleOrigin::Fleet(f.id),
                side: BattleSide::Attacker,
                technology: crate::encounter::technology(s, f.owner)?,
                units: f
                    .ships
                    .iter()
                    .map(|x| (ManufacturedItem::Ship(x.ship_type), x.count))
                    .collect(),
            },
            BattleParticipant {
                owner: CombatIdentity::Npc(site.creation.encounter),
                origin: BattleOrigin::Site(site.creation.encounter),
                side: BattleSide::Defender,
                technology: site.creation.definition.combat_technology,
                units: site
                    .remaining_forces()
                    .iter()
                    .map(|x| (x.item, x.count))
                    .collect(),
            },
        ],
    };
    let mut rng = RandomStream::new(&world_facts(s)?.secret, s.universe, s.epoch, i.id, "battle")?;
    let battle = resolve_battle(&input, combat, &mut rng)?;
    let debris = destroyed_ship_debris(&battle.destroyed, combat)?;
    let losses = battle
        .destroyed
        .iter()
        .find(|p| p.origin == BattleOrigin::Fleet(f.id))
        .ok_or_else(|| invariant("attacker losses"))?;
    for (item, count) in &losses.units {
        take_asset_lots(
            &mut w.lots,
            f.owner,
            item.catalog_key(),
            &AssetLocation::Fleet(f.id),
            *count,
            None,
        )?;
    }
    let survivors = battle
        .survivors
        .iter()
        .find(|p| p.origin == BattleOrigin::Fleet(f.id))
        .ok_or_else(|| invariant("attacker survivors"))?;
    f.ships = survivors
        .units
        .iter()
        .filter_map(|(item, count)| match item {
            ManufacturedItem::Ship(ship_type) => Some(ShipStack {
                owner: f.owner,
                ship_type: *ship_type,
                count: *count,
            }),
            _ => None,
        })
        .collect();
    let capacity = payload_capacity(&f.ships, r)?;
    f.cargo = retain_cargo(f.cargo, capacity)?;
    let used = f
        .cargo
        .values()
        .into_iter()
        .try_fold(0i64, |a, n| a.checked_add(n))
        .ok_or(GameError::NumericRange)?;
    let loot = if battle.outcome == BattleOutcome::AttackerVictory {
        raid_loot(site.remaining_stock().map_err(error)?, capacity - used)?
    } else {
        Resources::default()
    };
    append(
        site,
        i,
        SiteEventKind::EncounterResolved {
            reference: reference(f),
            battle: battle.clone(),
            debris,
        },
    )?;
    if battle.outcome == BattleOutcome::AttackerVictory {
        append(
            site,
            i,
            SiteEventKind::Extracted {
                reference: reference(f),
                free_capacity: capacity - used,
                resources: loot,
            },
        )?;
        f.cargo = resources(f.cargo, loot, true)?;
    }
    f.raid = Some(RaidProvenance {
        encounter: i.id,
        loot,
    });
    let payload = serde_json::json!({"kind":"SiteEncounter","site":selection.id,"fleet":f.id,"coordinates":f.destination_coordinates,"battle":public_battle(&battle),"debris_policy":site.creation.definition.debris,"debris":wire_resources(debris),"loot":wire_resources(loot),"cargo":wire_resources(f.cargo),"at":i.at});
    crate::missions::mission_report(
        w,
        i,
        f,
        "SiteEncounter",
        BTreeMap::from([(f.owner, payload)]),
    );
    Ok(())
}

// Public numeric quantities use decimal strings; RNG cursor and residual damage
// remain private retained source facts. This projection cannot grant resources.
fn public_battle(battle: &BattleResult<CombatIdentity>) -> serde_json::Value {
    fn units(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(object) => {
                if let Some(serde_json::Value::Array(stacks)) = object.get_mut("units") {
                    for stack in stacks {
                        *stack = serde_json::json!({"item":stack[0],"count":stack[1].as_i64().expect("battle count").to_string()});
                    }
                }
                for value in object.values_mut() {
                    units(value);
                }
            }
            serde_json::Value::Array(values) => {
                for value in values {
                    units(value);
                }
            }
            _ => {}
        }
    }
    let mut value = serde_json::json!({"outcome":battle.outcome,"participants":battle.participants,"rounds":battle.rounds,"survivors":battle.survivors,"gross_losses":battle.destroyed});
    units(&mut value);
    value
}

/// Cross-record conservation fence for newly resolved real encounters. The site
/// history alone cannot prove that extraction reached surviving owned cargo.
pub fn validate_site_execution(
    state: &GameState,
    input: &OrderedInput,
    records: &WorldRecords,
    rules: &Ruleset,
) -> Result<(), InvariantError> {
    let old = &world_facts(state)?.records;
    for (id, site) in &records.mission_sites {
        let prior = old.mission_sites.get(id);
        for event in site.events.iter().skip(prior.map_or(0, |s| s.events.len())) {
            let SiteEventKind::EncounterResolved {
                reference,
                battle,
                debris,
            } = &event.kind
            else {
                continue;
            };
            let before = old
                .fleets
                .get(&reference.fleet)
                .ok_or_else(|| invariant_error("missing encounter fleet"))?;
            let after = records
                .fleets
                .get(&reference.fleet)
                .ok_or_else(|| invariant_error("missing encounter cargo"))?;
            if before.leg != MissionLeg::Outbound
                || before.owner != reference.actor
                || reference.operation != OperationId(before.id.0)
                || !matches!(before.intent.destination, MissionDestination::Site { selection } if selection.id == *id)
                || before.terms != after.terms
                || before.intent != after.intent
            {
                return Err(invariant_error("site fleet identity changed"));
            }
            let survivor = battle
                .survivors
                .iter()
                .find(|p| {
                    p.owner == CombatIdentity::Player(before.owner)
                        && p.origin == BattleOrigin::Fleet(before.id)
                })
                .ok_or_else(|| invariant_error("missing site survivors"))?;
            let ships: Vec<_> = survivor
                .units
                .iter()
                .filter_map(|(item, count)| match item {
                    ManufacturedItem::Ship(ship_type) => Some(ShipStack {
                        owner: before.owner,
                        ship_type: *ship_type,
                        count: *count,
                    }),
                    _ => None,
                })
                .collect();
            let capacity =
                payload_capacity(&ships, rules).map_err(|_| invariant_error("site capacity"))?;
            let retained = retain_cargo(before.cargo, capacity)?;
            let used = retained
                .values()
                .into_iter()
                .try_fold(0i64, |a, n| a.checked_add(n))
                .ok_or_else(|| invariant_error("site payload overflow"))?;
            let loot = if battle.outcome == BattleOutcome::AttackerVictory {
                raid_loot(
                    prior
                        .ok_or_else(|| invariant_error("missing prior site"))?
                        .remaining_stock()
                        .map_err(|_| invariant_error("site stock"))?,
                    capacity - used,
                )?
            } else {
                Resources::default()
            };
            let cargo = Resources::from_values(std::array::from_fn(|n| {
                retained.values()[n] + loot.values()[n]
            }));
            let extraction = site.events.iter().skip(prior.map_or(0,|s|s.events.len())).find(|e| matches!(&e.kind,SiteEventKind::Extracted { reference:r,.. } if r==reference));
            let valid_extraction =
                match (battle.outcome == BattleOutcome::AttackerVictory, extraction) {
                    (false, None) => true,
                    (
                        true,
                        Some(SiteEvent {
                            kind:
                                SiteEventKind::Extracted {
                                    resources,
                                    free_capacity,
                                    ..
                                },
                            ..
                        }),
                    ) => *resources == loot && *free_capacity == capacity - used,
                    _ => false,
                };
            if !valid_extraction
                || after.ships != ships
                || after.cargo != cargo
                || after.raid
                    != Some(RaidProvenance {
                        encounter: input.id,
                        loot,
                    })
                || !matches!(after.leg, MissionLeg::Returning | MissionLeg::Destroyed)
                || *debris
                    != destroyed_ship_debris(
                        &battle.destroyed,
                        &rules
                            .artifact
                            .world
                            .as_ref()
                            .ok_or_else(|| invariant_error("site combat rules"))?
                            .combat,
                    )?
            {
                return Err(invariant_error("site stock/cargo conservation mismatch"));
            }
        }
    }
    Ok(())
}
fn invariant_error(message: &str) -> InvariantError {
    InvariantError(message.into())
}

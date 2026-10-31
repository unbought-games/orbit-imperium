//! Shared atomic encounter settlement; observation and loot remain mission-specific.
use crate::transition::{Fault, invariant};
use crate::*;
use serde_json::json;
use std::collections::BTreeMap;
fn technology(s: &GameState, p: PlayerId) -> Result<[u32; 3], InvariantError> {
    let levels = &s
        .research
        .get(&p)
        .ok_or_else(|| InvariantError("missing combat research".into()))?
        .levels;
    let mut out = [0; 3];
    for (k, key) in [
        ResearchId::WeaponsTechnology,
        ResearchId::ShieldingTechnology,
        ResearchId::ArmourTechnology,
    ]
    .iter()
    .enumerate()
    {
        out[k] = *levels
            .get(key)
            .ok_or_else(|| InvariantError("missing completed combat technology".into()))?;
    }
    Ok(out)
}
#[derive(Clone, Debug)]
pub struct EncounterSettlement {
    pub battle: BattleResult,
    pub debris: Resources,
    pub recovery: Vec<BattleCounts>,
    pub recovery_cursor: (u64, u8),
    pub recovery_indices: Vec<(BattleOrigin, ManufacturedItem, Vec<i64>)>,
}
pub fn settle_encounter(
    s: &GameState,
    i: &OrderedInput,
    f: &MissionFleet,
    r: &Ruleset,
) -> Result<EncounterSettlement, InvariantError> {
    let MissionDestination::Body {
        id, expected_owner, ..
    } = f.intent.destination
    else {
        return Err(InvariantError("encounter requires body".into()));
    };
    let facts = world_facts(s)?;
    let rules = &r
        .artifact
        .world
        .as_ref()
        .ok_or_else(|| InvariantError("missing combat profile".into()))?
        .combat;
    let defenders = s
        .inventories
        .iter()
        .filter(|x| {
            x.body == id
                && x.owner == expected_owner
                && x.count > 0
                && !matches!(x.item, ManufacturedItem::Missile(_))
        })
        .map(|x| (x.item, x.count))
        .collect();
    let input = BattleInput {
        encounter_id: i.id,
        at: i.at,
        target: id,
        rules_hash: r.hash.clone(),
        participants: vec![
            BattleParticipant {
                owner: f.owner,
                origin: BattleOrigin::Fleet(f.id),
                side: BattleSide::Attacker,
                technology: technology(s, f.owner)?,
                units: f
                    .ships
                    .iter()
                    .map(|x| (ManufacturedItem::Ship(x.ship_type), x.count))
                    .collect(),
            },
            BattleParticipant {
                owner: expected_owner,
                origin: BattleOrigin::Stationed(id),
                side: BattleSide::Defender,
                technology: technology(s, expected_owner)?,
                units: defenders,
            },
        ],
    };
    let mut rng = RandomStream::new(&facts.secret, s.universe, s.epoch, i.id, "battle")?;
    let battle = resolve_battle(&input, rules, &mut rng)?;
    let mut recovery_rng = RandomStream::new(&facts.secret, s.universe, s.epoch, i.id, "recovery")?;
    let mut recovery = vec![];
    let mut recovery_indices = vec![];
    let debris = destroyed_ship_debris(&battle.destroyed, rules)?;
    for origin in &battle.destroyed {
        let mut restored = origin.clone();
        restored.units.clear();
        for &(item, count) in &origin.units {
            match item {
                ManufacturedItem::Ship(_) => {}
                ManufacturedItem::Defense(_) => {
                    let [a, b] = rules.defense_recovery_probability;
                    let mut indices = vec![];
                    for index in 0..count {
                        if recovery_rng.bernoulli(&a.into(), &b.into())? {
                            indices.push(index);
                        }
                    }
                    let n = indices.len() as i64;
                    if n > 0 {
                        restored.units.push((item, n));
                    }
                    recovery_indices.push((origin.origin, item, indices));
                }
                _ => return Err(InvariantError("missile in ordinary battle".into())),
            }
        }
        recovery.push(restored);
    }
    Ok(EncounterSettlement {
        battle,
        debris,
        recovery,
        recovery_cursor: recovery_rng.cursor(),
        recovery_indices,
    })
}
fn public_counts(counts: &[BattleCounts]) -> serde_json::Value {
    json!(counts.iter().map(|p|json!({"owner":p.owner,"origin":p.origin,"side":p.side,"units":p.units.iter().map(|(item,n)|json!({"item":item,"count":n.to_string()})).collect::<Vec<_>>()})).collect::<Vec<_>>())
}
pub(crate) fn spy_encounter(
    s: &GameState,
    i: &OrderedInput,
    f: &mut MissionFleet,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
    audits: &mut Vec<serde_json::Value>,
) -> Result<(), Fault> {
    let MissionDestination::Body {
        id, expected_owner, ..
    } = f.intent.destination
    else {
        return Err(invariant("spy body"));
    };
    let target = s
        .bodies
        .get(&id)
        .ok_or_else(|| invariant("missing target"))?;
    let mut settled = target.clone();
    settled.checkpoint = settle_production(s, target, i.at, r)?;
    settled.revision = settled
        .revision
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    c.bodies.push(settled.clone());
    let observer_tech = s.research[&f.owner].levels[&ResearchId::EspionageTechnology];
    let target_tech = s.research[&expected_owner].levels[&ResearchId::EspionageTechnology];
    let probes = f
        .ships
        .iter()
        .find(|x| x.ship_type == ShipType::EspionageProbe)
        .map_or(0, |x| x.count);
    let score = espionage_disclosure_score(probes, observer_tech, target_tech)?;
    let known = |yes: bool, value: serde_json::Value| {
        if yes {
            json!({"visibility":"Known","value":value})
        } else {
            json!({"visibility":"Unknown"})
        }
    };
    let stock = Resources::from_values(
        settled
            .checkpoint
            .amounts
            .values()
            .map(|n| n / SCALE * SCALE),
    );
    let stocks = s
        .inventories
        .iter()
        .filter(|x| x.body == id && x.count > 0)
        .collect::<Vec<_>>();
    let local = |ships: bool| {
        json!(
            stocks
                .iter()
                .filter(|x| matches!(x.item, ManufacturedItem::Ship(_)) == ships)
                .map(|x| json!({"item":x.item,"count":x.count.to_string()}))
                .collect::<Vec<_>>()
        )
    };
    let activity = public_activity(w.activity.get(&id).map(|x| x.last_signal_at), i.at)?;
    let total = |counts: Vec<i64>| {
        counts
            .into_iter()
            .try_fold(0i64, |a, n| a.checked_add(n))
            .ok_or_else(|| invariant("detector count overflow"))
    };
    let arriving = total(f.ships.iter().map(|x| x.count).collect())?;
    let defending = total(
        stocks
            .iter()
            .filter(|x| matches!(x.item, ManufacturedItem::Ship(_)))
            .map(|x| x.count)
            .collect(),
    )?;
    let mut rng = RandomStream::new(
        &world_facts(s)?.secret,
        s.universe,
        s.epoch,
        i.id,
        "espionage",
    )?;
    let detection =
        detect_counterespionage(arriving, defending, observer_tech, target_tech, &mut rng)?;
    let observation = json!({"kind":"Espionage","target":{"body":id,"name":target.name,"coordinates":target.coordinates,"owner":expected_owner,"kind":target.kind},"observed_at":i.at,"resources":known(true,wire_resources(stock)),"fleet":known(score>=2,local(true)),"defenses":known(score>=3,local(false)),"buildings":known(score>=5,json!(target.levels)),"research":known(score>=7,json!(s.research[&expected_owner].levels)),"activity":activity,"counterespionage":{"probability_ppm":detection.probability_ppm,"detected":detection.detected}});
    crate::missions::mission_report(
        w,
        i,
        f,
        "Espionage",
        BTreeMap::from([(f.owner, observation)]),
    );
    crate::missions::mission_report(
        w,
        i,
        f,
        "SpyContact",
        BTreeMap::from([(
            expected_owner,
            json!({"kind":"SpyContact","sender":f.owner,"origin":f.origin_coordinates,"target":target.coordinates,"at":i.at,"probability_ppm":detection.probability_ppm,"detected":detection.detected}),
        )]),
    );
    audits.push(json!({"kind":"EspionageRisk","result":detection}));
    if !detection.detected {
        return Ok(());
    }
    combat_encounter(s, i, f, r, c, w, audits)
}
pub(crate) fn attack_encounter(
    s: &GameState,
    i: &OrderedInput,
    f: &mut MissionFleet,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
    audits: &mut Vec<serde_json::Value>,
) -> Result<(), Fault> {
    if !r.attacks() {
        return Err(invariant("attack profile unavailable"));
    }
    let MissionDestination::Body { id, .. } = f.intent.destination else {
        return Err(invariant("attack body"));
    };
    let target = s
        .bodies
        .get(&id)
        .ok_or_else(|| invariant("missing attack target"))?;
    let mut settled = target.clone();
    settled.checkpoint = settle_production(s, target, i.at, r)?;
    settled.revision = settled
        .revision
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    c.bodies.push(settled);
    combat_encounter(s, i, f, r, c, w, audits)
}
fn combat_encounter(
    s: &GameState,
    i: &OrderedInput,
    f: &mut MissionFleet,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
    audits: &mut Vec<serde_json::Value>,
) -> Result<(), Fault> {
    let MissionDestination::Body {
        id, expected_owner, ..
    } = f.intent.destination
    else {
        return Err(invariant("combat body"));
    };
    let target = s
        .bodies
        .get(&id)
        .ok_or_else(|| invariant("missing combat target"))?;
    let result = settle_encounter(s, i, f, r)?;
    let before_cargo = f.cargo;
    let before_ships = f.ships.clone();
    for (losses, recovered) in result.battle.destroyed.iter().zip(&result.recovery) {
        for &(unit, count) in &losses.units {
            let restored = recovered
                .units
                .iter()
                .find(|(k, _)| *k == unit)
                .map_or(0, |(_, n)| *n);
            let key = match unit {
                ManufacturedItem::Ship(x) => CatalogKey::Ship(x),
                ManufacturedItem::Defense(x) => CatalogKey::Defense(x),
                _ => return Err(invariant("unsupported encounter unit")),
            };
            let location = match losses.origin {
                BattleOrigin::Fleet(id) => AssetLocation::Fleet(id),
                BattleOrigin::Stationed(id) => AssetLocation::Body(id),
            };
            // Oldest paid lots are the casualty pool; restored units keep that pool's lineage.
            let mut lost = take_asset_lots(&mut w.lots, losses.owner, key, &location, count, None)?;
            let recovered_indices = result
                .recovery_indices
                .iter()
                .find(|(origin, item, _)| *origin == losses.origin && *item == unit)
                .map(|(_, _, indices)| indices);
            let mut offset = 0;
            for lot in &mut lost {
                let end = offset + lot.quantity;
                lot.quantity = recovered_indices.map_or(0, |indices| {
                    indices
                        .iter()
                        .filter(|&&index| index >= offset && index < end)
                        .count() as i64
                });
                offset = end;
            }
            w.lots.extend(lost.into_iter().filter(|l| l.quantity > 0));
            if let BattleOrigin::Stationed(body) = losses.origin {
                let old = s
                    .inventories
                    .iter()
                    .find(|x| x.body == body && x.owner == losses.owner && x.item == unit)
                    .ok_or_else(|| invariant("missing defender inventory"))?;
                c.inventories.push(InventoryStack {
                    count: old.count - count + restored,
                    revision: old.revision.checked_add(1).ok_or(GameError::NumericRange)?,
                    ..old.clone()
                });
            }
        }
    }
    let survivors = result
        .battle
        .survivors
        .iter()
        .find(|p| p.origin == BattleOrigin::Fleet(f.id))
        .ok_or_else(|| invariant("missing attacking result"))?;
    f.ships = survivors
        .units
        .iter()
        .filter_map(|(item, n)| {
            if let ManufacturedItem::Ship(ship_type) = item {
                Some(ShipStack {
                    owner: f.owner,
                    ship_type: *ship_type,
                    count: *n,
                })
            } else {
                None
            }
        })
        .collect();
    f.cargo = retain_cargo(f.cargo, payload_capacity(&f.ships, r)?)?;
    let lost_cargo = Resources::from_values(std::array::from_fn(|idx| {
        before_cargo.values()[idx] - f.cargo.values()[idx]
    }));
    let mut loot = Resources::default();
    if f.intent.mission == Mission::Attack
        && result.battle.outcome == BattleOutcome::AttackerVictory
    {
        let settled = c
            .bodies
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| invariant("missing encounter economy settlement"))?;
        let used = f
            .cargo
            .values()
            .into_iter()
            .try_fold(0i64, |a, n| a.checked_add(n))
            .ok_or_else(|| invariant("cargo total overflow"))?;
        let free = payload_capacity(&f.ships, r)?
            .checked_sub(used)
            .filter(|v| *v >= 0)
            .ok_or_else(|| invariant("surviving cargo exceeds capacity"))?;
        loot = raid_loot(settled.checkpoint.amounts, free)?;
        // One pooled calculation/debit; this solo adapter uses the same multi-origin allocator.
        let allocation = allocate_loot(
            loot,
            &[LootCapacity {
                owner: f.owner,
                origin: BattleOrigin::Fleet(f.id),
                free_capacity: free,
            }],
        )?;
        settled.checkpoint.amounts =
            crate::transition::resources(settled.checkpoint.amounts, loot, false)?;
        f.cargo = crate::transition::resources(f.cargo, allocation[0].1, true)?;
    }
    let debris = result.debris;
    if debris.metal > 0 || debris.crystal > 0 || debris.deuterium > 0 {
        let coords = target.coordinates;
        let id = OperationId(derived_id(
            InputId(s.epoch.0),
            &format!(
                "debris:{}:{}:{}:{}",
                s.universe, coords.galaxy, coords.system, coords.position
            ),
        ));
        let field = w.debris.entry(id).or_insert(DebrisField {
            id,
            coordinates: coords,
            marker_present: false,
            metal: 0,
            crystal: 0,
            deuterium: 0,
            generation: 0,
            cleanup_at: 0,
            revision: 0,
        });
        if !field.marker_present {
            field.marker_present = true;
            field.generation = field
                .generation
                .checked_add(1)
                .ok_or(GameError::NumericRange)?;
            field.cleanup_at = next_debris_cleanup(i.at)?;
            c.events.push(NewEvent {
                id: InputId(derived_id(i.id, "debris-cleanup:0")),
                at: field.cleanup_at,
                event: ScheduledEvent::DebrisCleanupDue {
                    field: id,
                    generation: field.generation,
                },
            });
        }
        field.metal = field
            .metal
            .checked_add(debris.metal)
            .ok_or_else(|| invariant("debris metal overflow"))?;
        field.crystal = field
            .crystal
            .checked_add(debris.crystal)
            .ok_or_else(|| invariant("debris crystal overflow"))?;
        field.deuterium = field
            .deuterium
            .checked_add(debris.deuterium)
            .ok_or_else(|| invariant("debris deuterium overflow"))?;
        field.revision = field
            .revision
            .checked_add(1)
            .ok_or(GameError::NumericRange)?;
    }

    let permanent: Vec<_> = result
        .battle
        .destroyed
        .iter()
        .zip(&result.recovery)
        .map(|(gross, recovered)| {
            let mut losses = gross.clone();
            for (item, count) in &mut losses.units {
                *count -= recovered
                    .units
                    .iter()
                    .find(|(key, _)| key == item)
                    .map_or(0, |(_, count)| *count);
            }
            losses.units.retain(|(_, count)| *count > 0);
            losses
        })
        .collect();
    let mut full = json!({"kind":"Combat","at":i.at,"target":target.coordinates,"outcome":result.battle.outcome,"participants":result.battle.participants.iter().map(|p|json!({"owner":p.owner,"origin":p.origin,"side":p.side,"technology":p.technology,"units":p.units.iter().map(|(item,n)|json!({"item":item,"count":n.to_string()})).collect::<Vec<_>>()})).collect::<Vec<_>>(),"rounds":result.battle.rounds.iter().map(|round|json!({"number":round.number,"start":public_counts(&round.start),"end":public_counts(&round.end),"fire":round.fire})).collect::<Vec<_>>(),"survivors":public_counts(&result.battle.survivors),"gross_losses":public_counts(&result.battle.destroyed),"recovered":public_counts(&result.recovery),"permanent_losses":public_counts(&permanent),"debris":wire_resources(debris),"loot":wire_resources(loot)});
    // Capture the identity at contact, not when the report is read. The restricted
    // ContactLost observation below deliberately does not inherit defender facts.
    full["target_name"] = json!(target.name);
    full["target_kind"] = json!(target.kind);
    if r.attacks() {
        full["mission"] = json!(f.intent.mission);
    }
    let mut observer = if f.ships.is_empty() && result.battle.rounds.len() == 1 {
        json!({"kind":"ContactLost","at":i.at,"target":target.coordinates,"own_lost_ships":before_ships.iter().map(|s|json!({"ship_type":s.ship_type,"count":s.count.to_string()})).collect::<Vec<_>>()})
    } else {
        full.clone()
    };
    observer["own_cargo_loss"] = wire_resources(lost_cargo);
    if r.attacks() && observer["kind"] == "Combat" {
        observer["mission"] = json!(f.intent.mission);
        observer["return_at"] = if f.ships.is_empty() {
            serde_json::Value::Null
        } else {
            json!(deadline(i.at, f.terms.duration_ms)?)
        };
    }
    if f.intent.mission == Mission::Attack {
        let policy = w
            .policies
            .get(&expected_owner)
            .ok_or_else(|| invariant("missing target presence"))?;
        let presence = inactivity(policy.last_presence_at, i.at)?;
        if presence == Inactivity::Active
            && matches!(
                result.battle.outcome,
                BattleOutcome::AttackerVictory | BattleOutcome::Draw
            )
        {
            let report = ReportId(derived_id(i.id, &format!("report:Combat:{}", f.id)));
            audits.push(
                serde_json::to_value(AttackEvidence {
                    kind: "AttackEvidence".into(),
                    schema: 1,
                    universe: s.universe,
                    epoch: s.epoch,
                    battle_or_destruction_id: i.id,
                    attacker: f.owner,
                    fleet: f.id,
                    target_body: id,
                    target_owner: expected_owner,
                    at_ms: i.at,
                    contact_order: [i.phase as i64, i.sequence],
                    outcome: result.battle.outcome.clone(),
                    target_presence_class: presence,
                    policy_hash: r.hash.clone(),
                    report,
                    debris_field: w
                        .debris
                        .values()
                        .find(|d| d.coordinates == target.coordinates && d.marker_present)
                        .map(|d| d.id),
                })
                .map_err(|_| invariant("attack evidence serialization"))?,
            );
        }
    }
    crate::missions::mission_report(
        w,
        i,
        f,
        "Combat",
        BTreeMap::from([(f.owner, observer), (expected_owner, full)]),
    );
    audits.push(json!({"kind":"Battle","battle_cursor":result.battle.rng_cursor,"recovery_cursor":result.recovery_cursor}));
    Ok(())
}

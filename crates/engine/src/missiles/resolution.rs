use super::*;
use crate::transition::{Fault, invariant};
use serde_json::json;
fn consume(
    s: &GameState,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
    body: BodyId,
    owner: PlayerId,
    item: ManufacturedItem,
    count: i64,
) -> Result<(), Fault> {
    if count == 0 {
        return Ok(());
    }
    if count < 0 || !s.coverage.inventory_owners.contains(&(body, owner)) {
        return Err(invariant("uncovered missile debit"));
    }
    let old = s
        .inventories
        .iter()
        .find(|x| x.body == body && x.owner == owner && x.item == item)
        .ok_or_else(|| invariant("missing consumed inventory"))?;
    let mut next = old.clone();
    next.count = next
        .count
        .checked_sub(count)
        .filter(|v| *v >= 0)
        .ok_or_else(|| invariant("negative missile inventory"))?;
    next.revision = next
        .revision
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    c.inventories.push(next);
    take_asset_lots(
        &mut w.lots,
        owner,
        item.catalog_key(),
        &AssetLocation::Body(body),
        count,
        None,
    )?;
    c.affected_viewers.insert(owner);
    Ok(())
}
pub(crate) fn resolve(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
    audits: &mut Vec<serde_json::Value>,
) -> Result<(), Fault> {
    match &i.payload {
        Input::Command(Command::World {
            action:
                WorldAction::LaunchMissiles {
                    intent,
                    expected_terms_hash,
                },
        }) => {
            let Actor::Player(owner) = i.actor else {
                return Err(invariant("missile actor"));
            };
            let terms = quote_missiles(s, owner, intent, i.at, r)?;
            if &terms.terms_hash != expected_terms_hash {
                return Err(GameError::QuoteChanged.into());
            }
            let id = OperationId(derived_id(i.id, "missile:0"));
            if w.missiles.contains_key(&id) {
                return Err(invariant("duplicate missile flight"));
            }
            let flight = MissileFlight {
                id,
                owner,
                due_at: deadline(i.at, terms.duration_ms)?,
                terms,
                launched_at: i.at,
                generation: 0,
                status: MissileStatus::InFlight,
            };
            consume(
                s,
                c,
                w,
                intent.origin,
                owner,
                ManufacturedItem::Missile(MissileId::InterplanetaryMissile),
                intent.count,
            )?;
            c.events.push(NewEvent {
                id: InputId(derived_id(i.id, "missile-impact:0")),
                at: flight.due_at,
                event: ScheduledEvent::MissileImpact {
                    flight: id,
                    generation: 0,
                },
            });
            w.missiles.insert(id, flight);
            w.activity.insert(
                intent.origin,
                BodyActivity {
                    body: intent.origin,
                    last_signal_at: i.at,
                    cause: ActivityCause::Launch,
                    input: i.id,
                },
            );
            c.affected_viewers.insert(intent.target.expected_owner);
        }
        Input::Command(Command::World {
            action: WorldAction::ScrapMissiles { body, item, count },
        }) => {
            let Actor::Player(owner) = i.actor else {
                return Err(invariant("scrap actor"));
            };
            let b = s
                .bodies
                .get(body)
                .filter(|b| b.owner == owner)
                .ok_or(GameError::NotOwned)?;
            if b.kind != BodyKind::Planet || *count <= 0 {
                return Err(GameError::InvalidInput.into());
            }
            missile_rules(r).ok_or(GameError::UnavailableContent)?;
            let item = ManufacturedItem::Missile(*item);
            let available = s
                .inventories
                .iter()
                .find(|x| x.body == *body && x.owner == owner && x.item == item)
                .map_or(0, |x| x.count);
            if *count > available {
                return Err(GameError::InsufficientMissiles.into());
            }
            consume(s, c, w, *body, owner, item, *count)?;
        }
        Input::Event(ScheduledEvent::MissileImpact { flight, generation }) => {
            let mut f = w
                .missiles
                .get(flight)
                .ok_or_else(|| invariant("missing missile flight"))?
                .clone();
            if f.status != MissileStatus::InFlight || f.generation != *generation {
                return Ok(());
            }
            if f.due_at != i.at {
                return Err(invariant("missile deadline mismatch"));
            }
            let binding = &f.terms.intent.target;
            if !s.coverage.bodies.contains(&binding.id) {
                return Err(invariant("uncovered missile target"));
            }
            let target = s
                .bodies
                .get(&binding.id)
                .filter(|b| b.owner == binding.expected_owner && b.kind == binding.expected_kind)
                .filter(|b| {
                    b.kind == BodyKind::Planet
                        || missile_interceptor_body(b, s.bodies.get(&f.terms.interceptor_body)).ok()
                            == Some(f.terms.interceptor_body)
                });
            let mut payloads = BTreeMap::new();
            let mut payload = json!({"kind":"MissileImpact","at":i.at,"attacker":f.owner,"origin":f.terms.source_coordinates,"target":f.terms.target_coordinates,"target_kind":binding.expected_kind,"sent":f.terms.intent.count.to_string()});
            if let Some(target) = target {
                if !s
                    .coverage
                    .inventory_owners
                    .contains(&(target.id, target.owner))
                    || !s.coverage.research_players.contains(&target.owner)
                    || !s.coverage.bodies.contains(&f.terms.interceptor_body)
                {
                    return Err(invariant("uncovered missile impact inventory/research"));
                }
                // The frozen interceptor binding is a different identity for a future moon.
                // Validate its ownership/kind; a missing or transferred parent cannot spend ABMs.
                let parent = s.bodies.get(&f.terms.interceptor_body).filter(|p| {
                    p.kind == BodyKind::Planet
                        && p.owner == target.owner
                        && p.coordinates == target.coordinates
                });
                if parent.is_some_and(|p| !s.coverage.inventory_owners.contains(&(p.id, p.owner))) {
                    return Err(invariant("uncovered interceptor inventory"));
                }
                let abm = ManufacturedItem::Missile(MissileId::AntiBallisticMissile);
                let available = parent.map_or(0, |p| {
                    s.inventories
                        .iter()
                        .find(|x| x.body == p.id && x.owner == p.owner && x.item == abm)
                        .map_or(0, |x| x.count)
                });
                let intercepted = available.min(f.terms.intent.count);
                if intercepted > 0 {
                    consume(
                        s,
                        c,
                        w,
                        f.terms.interceptor_body,
                        target.owner,
                        abm,
                        intercepted,
                    )?;
                }
                let penetrating = f.terms.intent.count - intercepted;
                let armour = *s
                    .research
                    .get(&target.owner)
                    .and_then(|r| r.levels.get(&ResearchId::ArmourTechnology))
                    .ok_or_else(|| invariant("missing target armour"))?;
                let defenses = s
                    .inventories
                    .iter()
                    .filter(|x| x.body == target.id && x.owner == target.owner)
                    .filter_map(|x| {
                        if let ManufacturedItem::Defense(d) = x.item {
                            Some((d, x.count))
                        } else {
                            None
                        }
                    })
                    .collect();
                let mut rng = RandomStream::new(
                    &world_facts(s)?.secret,
                    s.universe,
                    s.epoch,
                    i.id,
                    "missile-target",
                )?;
                let before = rng.cursor();
                let losses = missile_damage(
                    penetrating,
                    [f.terms.weapons, armour],
                    f.terms.intent.primary,
                    &defenses,
                    &r.artifact
                        .world
                        .as_ref()
                        .ok_or_else(|| invariant("missing world rules"))?
                        .combat,
                    &f.terms.rules,
                    &mut rng,
                )?;
                for (d, n) in &losses {
                    consume(
                        s,
                        c,
                        w,
                        target.id,
                        target.owner,
                        ManufacturedItem::Defense(*d),
                        *n,
                    )?;
                }
                payload["outcome"] = json!("Impacted");
                payload["intercepted"] = json!(intercepted.to_string());
                payload["penetrating"] = json!(penetrating.to_string());
                payload["destroyed"] = json!(
                    losses
                        .iter()
                        .map(|(d, n)| (format!("{d:?}"), n.to_string()))
                        .collect::<BTreeMap<_, _>>()
                );
                payload["primary"] = json!(f.terms.intent.primary);
                payloads.insert(f.owner, payload.clone());
                payload
                    .as_object_mut()
                    .expect("report object")
                    .remove("primary");
                payload["interceptors_spent"] = json!(intercepted.to_string());
                payload["interceptors_remaining"] = json!((available - intercepted).to_string());
                payloads.insert(target.owner, payload);
                audits.push(json!({"kind":"MissileImpact","flight":f.id,"rng_before":before,"rng_after":rng.cursor()}));
                c.affected_viewers.insert(target.owner);
                w.activity.insert(
                    target.id,
                    BodyActivity {
                        body: target.id,
                        last_signal_at: i.at,
                        cause: ActivityCause::Contact,
                        input: i.id,
                    },
                );
                f.status = MissileStatus::Impacted;
            } else {
                payload["outcome"] = json!("NoTarget");
                payloads.insert(f.owner, payload);
                f.status = MissileStatus::NoTarget;
            }
            let id = ReportId(derived_id(i.id, "missile-report:0"));
            w.reports.insert(
                id,
                MissionReport {
                    id,
                    event: i.id,
                    kind: "MissileImpact".into(),
                    at: i.at,
                    fleet: None,
                    rules_hash: f.terms.profile_hash.clone(),
                    payloads,
                },
            );
            c.affected_viewers.insert(f.owner);
            c.affected_viewers.insert(binding.expected_owner);
            w.missiles.insert(f.id, f);
        }
        _ => return Err(invariant("not a missile transition")),
    }
    Ok(())
}

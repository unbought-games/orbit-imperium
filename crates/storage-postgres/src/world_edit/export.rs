use super::*;
use orbit_engine::world_edit::WorldAssetValue;
use std::collections::BTreeMap;
fn portable(value: &Value, refs: &BTreeMap<String, Value>, at: i64, key: &str) -> Value {
    match value {
        Value::String(s) => refs.get(s).cloned().unwrap_or_else(|| value.clone()),
        Value::Array(a) => Value::Array(a.iter().map(|v| portable(v, refs, at, key)).collect()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| (k.clone(), portable(v, refs, at, k)))
                .collect(),
        ),
        Value::Number(n) if (key == "at" || key.ends_with("_at")) && n.as_i64().is_some() => {
            json!({"$time":n.as_i64().unwrap()-at})
        }
        _ => value.clone(),
    }
}
fn unportable(value: &Value, refs: &BTreeMap<String, String>, at: i64) -> Result<Value> {
    if let Some(c) = value.get("$planet").and_then(Value::as_str) {
        return refs
            .get(&format!("planet:{c}"))
            .map(|s| json!(s))
            .ok_or_else(|| format!("missing referenced planet {c}").into());
    }
    if let Some(n) = value.get("$user").and_then(Value::as_str) {
        return refs
            .get(&format!("user:{n}"))
            .map(|s| json!(s))
            .ok_or_else(|| format!("missing referenced user {n}").into());
    }
    if let Some(n) = value.get("$time").and_then(Value::as_i64) {
        return Ok(json!(
            at.checked_add(n)
                .filter(|n| *n >= 0 && *n <= MAX_WIRE_MS)
                .ok_or("report time out of range")?
        ));
    }
    Ok(match value {
        Value::Array(a) => Value::Array(
            a.iter()
                .map(|v| unportable(v, refs, at))
                .collect::<Result<_>>()?,
        ),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| Ok((k.clone(), unportable(v, refs, at)?)))
                .collect::<Result<_>>()?,
        ),
        _ => value.clone(),
    })
}
pub(super) async fn import_payload(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    value: &Value,
) -> Result<Value> {
    let mut refs = BTreeMap::new();
    for (id, g, s, p) in sqlx::query_as::<_, (Uuid, i32, i32, i32)>(
        "SELECT id,galaxy,system,position FROM bodies WHERE universe=$1",
    )
    .bind(i.universe.0)
    .fetch_all(&mut **tx)
    .await?
    {
        refs.insert(format!("planet:{g}:{s}:{p}"), id.to_string());
    }
    for(id,name)in sqlx::query_as::<_,(Uuid,String)>("SELECT m.player,a.name FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1").bind(i.universe.0).fetch_all(&mut **tx).await?{refs.insert(format!("user:{name}"),id.to_string());}
    unportable(value, &refs, i.at)
}
fn values(lots: &[AssetLot], owner: PlayerId, location: AssetLocation) -> Vec<WorldAssetValue> {
    lots.iter()
        .filter(|l| l.owner == owner && l.location == location)
        .map(|l| {
            let (category, item) = match l.item {
                CatalogKey::Building(k) => ("building", format!("{k:?}")),
                CatalogKey::Research(k) => ("research", format!("{k:?}")),
                CatalogKey::Ship(k) => ("ship", format!("{k:?}")),
                CatalogKey::Defense(k) => ("defense", format!("{k:?}")),
                CatalogKey::Missile(k) => ("missile", format!("{k:?}")),
            };
            WorldAssetValue {
                category: category.into(),
                item,
                level: l.level,
                quantity: l.quantity,
                unit_value_micro: l.unit_value_micro,
                rules_hash: l.rules_hash.clone(),
            }
        })
        .collect()
}
impl PgStore {
    pub async fn export_world_scenario(&self, u: UniverseId) -> Result<WorldScenario> {
        let mut tx = crate::snapshots::begin(self, &self.pool).await?;
        let rules = crate::facts::rules(&mut tx, u).await?;
        let epoch = Epoch(
            sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
                .bind(u.0)
                .fetch_one(&mut *tx)
                .await?,
        );
        let at = now(&mut tx).await?;
        let s = crate::world::load(
            &mut tx,
            u,
            epoch,
            &rules,
            &Input::Command(Command::RecallFleet {
                fleet: FleetId::default(),
            }),
            None,
        )
        .await?;
        let w = &s.world.as_ref().ok_or("missing world")?.records;
        let (_, manifest) = crate::bootstrap::load_manifest(&mut tx, u).await?;
        let mut edits = Vec::new();
        let names: BTreeMap<_, _> = manifest
            .members
            .iter()
            .map(|m| (PlayerId(m.player), m.name.clone()))
            .collect();
        let mut refs = BTreeMap::new();
        for b in s.bodies.values() {
            refs.insert(
                b.id.to_string(),
                json!({"$planet":coordinate_label(b.coordinates)}),
            );
        }
        for (p, n) in &names {
            refs.insert(p.to_string(), json!({"$user":n}));
        }
        for m in &manifest.members {
            let p = PlayerId(m.player);
            let bot:Option<(i32,Option<i64>)>=sqlx::query_as("SELECT sleep_start_utc_minute,retired_at FROM bot_participation WHERE universe=$1 AND player=$2").bind(u.0).bind(p.0).fetch_optional(&mut *tx).await?;
            edits.push(WorldEdit {
                op: if bot.is_some() {
                    "add-bot"
                } else {
                    "add-player"
                }
                .into(),
                user: Some(m.name.clone()),
                planet: Some(coordinate_label(m.homeworld.coordinates)),
                ..Default::default()
            });
            edits.push(WorldEdit {
                op: "set".into(),
                user: Some(m.name.clone()),
                research: s.research[&p]
                    .levels
                    .iter()
                    .map(|(k, v)| (format!("{k:?}"), i64::from(*v)))
                    .collect(),
                valuation: Some(values(&w.lots, p, AssetLocation::Player)),
                vacation: Some(w.policies[&p].vacation),
                presence_age_ms: Some(at.saturating_sub(w.policies[&p].last_presence_at)),
                ..Default::default()
            });
            for b in s.bodies.values().filter(|b| b.owner == p) {
                if let Some(genesis) = w.colonies.get(&b.id) {
                    edits.push(WorldEdit {
                        op: "add-planet".into(),
                        user: Some(m.name.clone()),
                        planet: Some(coordinate_label(b.coordinates)),
                        name: b.name.clone(),
                        colony: Some(GeneratedColony {
                            fields: b.fields,
                            max_temperature: b.max_temperature,
                            diameter_km: genesis.diameter_km,
                        }),
                        ..Default::default()
                    });
                }
                let mut edit = WorldEdit {
                    op: "set".into(),
                    user: Some(m.name.clone()),
                    planet: Some(coordinate_label(b.coordinates)),
                    name: b.name.clone(),
                    buildings: b
                        .levels
                        .iter()
                        .map(|(k, v)| (format!("{k:?}"), i64::from(*v)))
                        .collect(),
                    stock: Some(settle_production(&s, b, at, &rules)?.amounts),
                    valuation: Some(values(&w.lots, p, AssetLocation::Body(b.id))),
                    ..Default::default()
                };
                for item in s.inventories.iter().filter(|x| x.body == b.id) {
                    match item.item {
                        ManufacturedItem::Ship(k) => {
                            edit.ships.insert(format!("{k:?}"), item.count);
                        }
                        ManufacturedItem::Defense(k) => {
                            edit.defenses.insert(format!("{k:?}"), item.count);
                        }
                        ManufacturedItem::Missile(k) => {
                            edit.missiles.insert(format!("{k:?}"), item.count);
                        }
                    }
                }
                edits.push(edit);
            }
            if let Some((start, retired)) = bot
                && (retired.is_some() || bot_awake_at(at, start as u16) > at)
            {
                edits.push(WorldEdit {
                    op: "set".into(),
                    user: Some(m.name.clone()),
                    activity: Some(
                        if retired.is_some() {
                            "retired"
                        } else {
                            "sleeping"
                        }
                        .into(),
                    ),
                    ..Default::default()
                });
            }
        }
        for field in w.debris.values().filter(|f| f.marker_present) {
            edits.push(WorldEdit {
                op: "debris".into(),
                planet: Some(coordinate_label(field.coordinates)),
                resources: BTreeMap::from([
                    ("metal".into(), field.metal / SCALE),
                    ("crystal".into(), field.crystal / SCALE),
                    ("deuterium".into(), field.deuterium / SCALE),
                ]),
                ..Default::default()
            });
        }
        for c in s
            .constructions
            .values()
            .filter(|c| c.status == ConstructionStatus::Active)
        {
            edits.push(WorldEdit {
                op: "queue".into(),
                planet: Some(coordinate_label(s.bodies[&c.body].coordinates)),
                buildings: BTreeMap::from([(
                    format!("{:?}", c.building),
                    i64::from(c.target_level),
                )]),
                arrives_in: Some(format!("{}ms", (c.due_at - at).max(1))),
                paid: Some(c.paid),
                paid_rules_hash: Some(c.profile_hash.clone()),
                ..Default::default()
            });
        }
        for c in s
            .research_operations
            .values()
            .filter(|c| c.status == ResearchStatus::Active)
        {
            edits.push(WorldEdit {
                op: "queue".into(),
                planet: Some(coordinate_label(s.bodies[&c.host].coordinates)),
                research: BTreeMap::from([(
                    format!("{:?}", c.research),
                    i64::from(c.target_level),
                )]),
                arrives_in: Some(format!("{}ms", (c.commitment.due_at - at).max(1))),
                paid: Some(c.commitment.paid),
                paid_rules_hash: Some(c.commitment.profile_hash.clone()),
                ..Default::default()
            });
        }
        let mut batches = s
            .manufacturing_batches
            .values()
            .filter(|c| c.status == ManufacturingStatus::Active)
            .collect::<Vec<_>>();
        batches.sort_by_key(|c| c.queue_sequence);
        for c in batches {
            let mut e = WorldEdit {
                op: "queue".into(),
                planet: Some(coordinate_label(s.bodies[&c.body].coordinates)),
                arrives_in: Some(format!("{}ms", c.unit_duration_ms)),
                first_in: Some(format!("{}ms", (c.next_due_at - at).max(1))),
                paid: Some(c.commitment.unit_cost),
                paid_rules_hash: Some(c.commitment.profile_hash.clone()),
                ..Default::default()
            };
            match c.item {
                ManufacturedItem::Ship(k) => {
                    e.ships
                        .insert(format!("{k:?}"), c.quantity - c.completed_prefix);
                }
                ManufacturedItem::Defense(k) => {
                    e.defenses
                        .insert(format!("{k:?}"), c.quantity - c.completed_prefix);
                }
                ManufacturedItem::Missile(k) => {
                    e.missiles
                        .insert(format!("{k:?}"), c.quantity - c.completed_prefix);
                }
            }
            edits.push(e);
        }
        if w.missiles
            .values()
            .any(|f| f.status == MissileStatus::InFlight)
        {
            return Err("cannot export active missile flights; wait for impact first".into());
        }
        for f in w.fleets.values().filter(|f| f.active()) {
            let MissionDestination::Body { id: target, .. } = f.intent.destination else {
                return Err(
                    "cannot export active harvest/colonization mission; finish it first".into(),
                );
            };
            let mission = match f.intent.mission {
                Mission::Attack => "attack",
                Mission::Espionage => "spy",
                Mission::Transport => "transport",
                _ => return Err("cannot export active deploy mission; finish it first".into()),
            };
            let source = coordinate_label(s.bodies[&f.intent.origin].coordinates);
            let ships: BTreeMap<_, _> = f
                .ships
                .iter()
                .map(|x| (format!("{:?}", x.ship_type), x.count))
                .collect();
            edits.push(WorldEdit {
                op: "give".into(),
                planet: Some(source.clone()),
                ships: ships.clone(),
                resources: ["metal", "crystal", "deuterium"]
                    .into_iter()
                    .zip(f.cargo.values())
                    .map(|(k, v)| (k.into(), v / SCALE))
                    .collect(),
                ..Default::default()
            });
            edits.push(WorldEdit {
                op: mission.into(),
                from: Some(source),
                planet: Some(coordinate_label(s.bodies[&target].coordinates)),
                ships,
                resources: ["metal", "crystal", "deuterium"]
                    .into_iter()
                    .zip(f.cargo.values())
                    .map(|(k, v)| (k.into(), v / SCALE))
                    .collect(),
                returning: f.leg == MissionLeg::Returning,
                travel_time: Some(format!("{}ms", f.terms.duration_ms)),
                arrives_in: Some(format!("{}ms", (f.due_at - at).max(1))),
                valuation: Some(values(&w.lots, f.owner, AssetLocation::Fleet(f.id))),
                ..Default::default()
            });
        }
        let reports: Vec<sqlx::types::Json<MissionReport>> = sqlx::query_scalar(
            "SELECT data FROM mission_reports WHERE universe=$1 ORDER BY at_ms,id",
        )
        .bind(u.0)
        .fetch_all(&mut *tx)
        .await?;
        for report in reports.iter().map(|r| &r.0) {
            for (player, payload) in &report.payloads {
                edits.push(WorldEdit {
                    op: "report".into(),
                    user: Some(
                        names
                            .get(player)
                            .ok_or("report refers to missing player")?
                            .clone(),
                    ),
                    payload: Some(portable(payload, &refs, at, "")),
                    ..Default::default()
                });
            }
        }
        let alliances: Vec<(String, String, Uuid)> =
            sqlx::query_as("SELECT name,tag,leader FROM alliances WHERE universe=$1 ORDER BY name")
                .bind(u.0)
                .fetch_all(&mut *tx)
                .await?;
        for (name, tag, leader) in alliances {
            edits.push(WorldEdit {
                op: "alliance".into(),
                user: Some(names[&PlayerId(leader)].clone()),
                name: Some(name),
                text: Some(tag),
                ..Default::default()
            });
        }
        let messages:Vec<(Uuid,Uuid,Uuid,String)>=sqlx::query_as("SELECT c.player_low,c.player_high,m.sender,m.body FROM conversation_messages m JOIN conversations c ON c.id=m.conversation WHERE c.universe=$1 ORDER BY m.sent_at,m.sequence").bind(u.0).fetch_all(&mut *tx).await?;
        for (lo, hi, sender, text) in messages {
            let to = if sender == lo { hi } else { lo };
            edits.push(WorldEdit {
                op: "message".into(),
                user: Some(names[&PlayerId(to)].clone()),
                from: Some(names[&PlayerId(sender)].clone()),
                text: Some(text),
                ..Default::default()
            });
        }
        // Mission recreation moves the oldest source lots. Restore the source's
        // original paid values after all launches so historical costs stay intact.
        for body in s.bodies.values() {
            edits.push(WorldEdit {
                op: "set".into(),
                user: Some(names[&body.owner].clone()),
                planet: Some(coordinate_label(body.coordinates)),
                valuation: Some(values(&w.lots, body.owner, AssetLocation::Body(body.id))),
                ..Default::default()
            });
        }
        let mut hashes = std::collections::BTreeSet::new();
        for l in &w.lots {
            hashes.insert(l.rules_hash.0.clone());
        }
        for c in s.constructions.values() {
            hashes.insert(c.profile_hash.0.clone());
        }
        for c in s.research_operations.values() {
            hashes.insert(c.commitment.profile_hash.0.clone());
        }
        for c in s.manufacturing_batches.values() {
            hashes.insert(c.commitment.profile_hash.0.clone());
        }
        let retained: Vec<sqlx::types::Json<Ruleset>> =
            sqlx::query_scalar("SELECT profile FROM rulesets WHERE hash=ANY($1) ORDER BY hash")
                .bind(hashes.into_iter().collect::<Vec<_>>())
                .fetch_all(&mut *tx)
                .await?;
        Ok(WorldScenario {
            version: 1,
            name: None,
            policy: self.read_policy(&mut tx, u, false).await?.map(|p| p.policy),
            rules: Some(rules),
            retained_rules: retained.into_iter().map(|r| r.0).collect(),
            edits,
        })
    }
}

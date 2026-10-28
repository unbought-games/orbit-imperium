use super::*;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn world(s: &GameState) -> EditResult<WorldRecords> {
    Ok(s.world.as_ref().ok_or("missing world")?.records.clone())
}
fn values(v: &BTreeMap<String, i64>) -> EditResult<Resources> {
    let mut r = Resources::default();
    let mut seen = BTreeSet::new();
    for (k, n) in v {
        if *n < 0 {
            return Err("negative resources".into());
        }
        let k = k.to_ascii_lowercase();
        if !seen.insert(k.clone()) {
            return Err("duplicate resource".into());
        }
        let n = n.checked_mul(SCALE).ok_or("resource overflow")?;
        match k.as_str() {
            "metal" => r.metal = n,
            "crystal" => r.crystal = n,
            "deuterium" => r.deuterium = n,
            _ => return Err(format!("unknown resource {k}")),
        }
    }
    Ok(r)
}
fn publish(c: &mut ChangeSet, w: WorldRecords) {
    c.world = Some(WorldChanges {
        records: w,
        score_deltas: vec![],
        audits: vec![],
    });
}
fn due(c: &mut ChangeSet, i: &OrderedInput, at: i64, event: ScheduledEvent) {
    c.events.push(NewEvent {
        id: InputId(derived_id(i.id, &format!("world-event:{}", c.events.len()))),
        at,
        event,
    });
}
pub(super) fn mission(
    s: &GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
) -> EditResult<ChangeSet> {
    let origin = &s.bodies[&planet_id(
        s,
        e.from
            .as_deref()
            .ok_or("mission requires from coordinates")?,
    )?];
    let target = &s.bodies[&planet_id(
        s,
        e.planet
            .as_deref()
            .ok_or("mission requires destination coordinates")?,
    )?];
    if origin.id == target.id {
        return Err("mission origin and destination must differ".into());
    }
    let ships = if e.ships.is_empty() {
        BTreeMap::from([(
            if e.op.eq_ignore_ascii_case("spy") {
                ShipType::EspionageProbe
            } else if e.op.eq_ignore_ascii_case("transport") {
                ShipType::SmallCargo
            } else {
                ShipType::LightFighter
            },
            1,
        )])
    } else {
        canonical_map(&e.ships, r.artifact.ships.keys().copied())?
    };
    let intent = FleetIntent {
        origin: origin.id,
        destination: MissionDestination::Body {
            id: target.id,
            expected_kind: target.kind,
            expected_owner: target.owner,
        },
        mission: match e.op.to_ascii_lowercase().as_str() {
            "attack" => Mission::Attack,
            "spy" => Mission::Espionage,
            _ => Mission::Transport,
        },
        ships: ships
            .iter()
            .map(|(key, n)| ManifestStack {
                owner: origin.owner,
                ship_type: *key,
                count: *n,
            })
            .collect(),
        cargo: values(&e.resources)?,
        speed_percent: 100,
    };
    let mut terms = fleet_terms(
        &intent,
        origin.coordinates,
        target.coordinates,
        &s.research[&origin.owner],
        r,
    )
    .map_err(error)?;
    if let Some(t) = e.travel_time.as_ref().or(e.arrives_in.as_ref()) {
        terms.duration_ms = duration_ms(t)?;
    }
    terms.terms_hash = Hash(String::new());
    terms.terms_hash = hash(&serde_json::json!({"protocol":4,"terms":terms}));
    let remaining = e
        .arrives_in
        .as_ref()
        .map(|s| duration_ms(s))
        .transpose()?
        .unwrap_or(terms.duration_ms);
    let at =
        i.at.checked_add(remaining)
            .filter(|n| *n <= MAX_WIRE_MS)
            .ok_or("arrival outside supported clock")?;
    let mut c = ChangeSet::new(s, i, r);
    let mut w = world(s)?;
    let id = FleetId(derived_id(i.id, "mission:0"));
    let mut body = origin.clone();
    body.checkpoint = settle_production(s, &body, i.at, r).map_err(error)?;
    if intent
        .cargo
        .values()
        .iter()
        .zip(body.checkpoint.amounts.values())
        .any(|(need, have)| *need > have)
    {
        return Err("source planet has insufficient cargo resources".into());
    }
    body.checkpoint.amounts = Resources::from_values(std::array::from_fn(|j| {
        body.checkpoint.amounts.values()[j] - intent.cargo.values()[j]
    }));
    body.revision += 1;
    c.bodies.push(body);
    for (key, count) in ships {
        if count <= 0 {
            return Err("fleet ship counts must be positive".into());
        }
        let mut inv = s
            .inventories
            .iter()
            .find(|x| {
                x.body == origin.id
                    && x.owner == origin.owner
                    && x.item == ManufacturedItem::Ship(key)
            })
            .cloned()
            .ok_or_else(|| format!("source has no {key:?}"))?;
        if inv.count < count {
            return Err(format!("source has only {} {key:?}", inv.count));
        }
        inv.count -= count;
        inv.revision += 1;
        c.inventories.push(inv);
        let moved = take_asset_lots(
            &mut w.lots,
            origin.owner,
            CatalogKey::Ship(key),
            &AssetLocation::Body(origin.id),
            count,
            Some(AssetLocation::Fleet(id)),
        )
        .map_err(error)?;
        w.lots.extend(moved);
    }
    w.fleets.insert(
        id,
        MissionFleet {
            id,
            owner: origin.owner,
            intent: intent.clone(),
            origin_coordinates: origin.coordinates,
            destination_coordinates: target.coordinates,
            terms,
            authorization: MissionAuthorization {
                actor: origin.owner,
                target_owner: Some(target.owner),
                at: i.at,
                input: i.id,
                policy_hash: r.hash.clone(),
            },
            ships: intent
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
            due_at: at,
            generation: 0,
            leg: if e.returning {
                MissionLeg::Returning
            } else {
                MissionLeg::Outbound
            },
            revision: 0,
        },
    );
    if let Some(values) = &e.valuation {
        let mut restored = s.clone();
        restored.world.as_mut().unwrap().records = w;
        super::assets::restore_values_at(
            &mut restored,
            r,
            i,
            origin.owner,
            AssetLocation::Fleet(id),
            values,
        )?;
        w = restored.world.unwrap().records;
    }
    due(
        &mut c,
        i,
        at,
        ScheduledEvent::FleetLegDue {
            fleet: id,
            generation: 0,
            expected_leg: if e.returning {
                MissionLeg::Returning
            } else {
                MissionLeg::Outbound
            },
        },
    );
    c.affected_viewers.extend([origin.owner, target.owner]);
    publish(&mut c, w);
    Ok(c)
}
pub(super) fn colony(
    s: &GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
    owner: PlayerId,
) -> EditResult<ChangeSet> {
    let w = s.world.as_ref().ok_or("missing world")?;
    let coordinates = if let Some(c) = &e.planet {
        coordinates(c)?
    } else {
        w.planet_slots
            .iter()
            .find(|p| p.occupant.is_none() && p.coordinates.position == 8)
            .map(|p| p.coordinates)
            .ok_or("no empty planet slot")?
    };
    let slot = planet_slot(s, coordinates).map_err(error)?;
    if slot.occupant.is_some() {
        return Err("planet slot is occupied".into());
    }
    let astro = completed_astrophysics(s, owner).map_err(error)?;
    if !colony_capacity_available(astro, owned_planet_count(s, owner).map_err(error)?)
        || !colony_position_unlocked(astro, coordinates.position)
    {
        return Err("raise Astrophysics before adding this colony".into());
    }
    let mut rng =
        RandomStream::new(&w.secret, s.universe, s.epoch, i.id, "colony").map_err(error)?;
    let g = e
        .colony
        .clone()
        .map(Ok)
        .unwrap_or_else(|| generate_colony(coordinates.position, &mut rng).map_err(error))?;
    let id = BodyId(derived_id(i.id, "colony:0"));
    let mut c = ChangeSet::new(s, i, r);
    let mut records = world(s)?;
    c.bodies.push(Body {
        name: e
            .name
            .as_ref()
            .map(|n| normalize_planet_name(n))
            .transpose()
            .map_err(error)?,
        id,
        universe: s.universe,
        owner,
        kind: BodyKind::Planet,
        coordinates,
        fields: g.fields,
        max_temperature: g.max_temperature,
        retained_capacity: None,
        checkpoint: ResourceCheckpoint {
            amounts: Resources::default(),
            carry: Resources::default(),
            at: i.at,
        },
        levels: r.building_keys().into_iter().map(|k| (k, 0)).collect(),
        revision: 0,
    });
    c.production_settings.push(ProductionSettingsRecord {
        body: id,
        settings: ProductionSettings::default(),
        revision: 0,
    });
    records.colonies.insert(
        id,
        ColonyGenesis {
            body: id,
            diameter_km: g.diameter_km,
            created_at: i.at,
            profile: COLONY_PROFILE.into(),
            input: i.id,
        },
    );
    c.affected_viewers.insert(owner);
    publish(&mut c, records);
    Ok(c)
}
pub(super) fn debris(s: &mut GameState, i: &OrderedInput, e: &WorldEdit) -> EditResult<()> {
    let coordinates = coordinates(e.planet.as_deref().ok_or("debris requires coordinates")?)?;
    let r = values(&e.resources)?;
    if r.deuterium != 0 {
        return Err("debris cannot contain deuterium".into());
    }
    let w = &mut s.world.as_mut().ok_or("missing world")?.records;
    let id = w
        .debris
        .values()
        .find(|f| f.coordinates == coordinates)
        .map(|f| f.id)
        .unwrap_or(OperationId(derived_id(i.id, "debris")));
    let rev = w.debris.get(&id).map(|f| f.revision + 1).unwrap_or(0);
    w.debris.insert(
        id,
        DebrisField {
            id,
            coordinates,
            metal: r.metal,
            crystal: r.crystal,
            marker_present: true,
            generation: rev,
            cleanup_at: next_debris_cleanup(i.at).map_err(error)?,
            revision: rev,
        },
    );
    Ok(())
}
pub(super) fn report(
    s: &mut GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
    owner: PlayerId,
) -> EditResult<()> {
    let id = ReportId(derived_id(i.id, "report"));
    let kind = e.kind.as_deref().unwrap_or("TransportDelivered");
    let combat_example = if kind.eq_ignore_ascii_case("combat") && e.payload.is_none() {
        let origin = s
            .bodies
            .values()
            .find(|b| b.owner == owner)
            .ok_or("recipient has no planet")?;
        let target = s
            .bodies
            .values()
            .find(|b| b.owner != owner)
            .ok_or("combat example requires another player")?;
        let example = WorldEdit {
            op: "attack".into(),
            from: Some(coordinate_label(origin.coordinates)),
            planet: Some(coordinate_label(target.coordinates)),
            arrives_in: Some("1ms".into()),
            ..Default::default()
        };
        let launch = mission(s, r, i, &example)?;
        let event = launch.events.first().ok_or("missing mission event")?;
        let mut scratch = s.clone();
        launch.apply_to(&mut scratch).map_err(error)?;
        let mut arrival = i.clone();
        arrival.id = event.id;
        arrival.at = event.at;
        arrival.phase = 0;
        arrival.payload = Input::Event(event.event.clone());
        let outcome = match transition(&scratch, &arrival, r) {
            TransitionResult::Applied(c) => c,
            other => return Err(format!("combat example: {other:?}")),
        };
        let payload = outcome
            .world
            .as_ref()
            .and_then(|w| {
                w.records
                    .reports
                    .values()
                    .find(|r| r.event == arrival.id && r.payloads.contains_key(&owner))
            })
            .and_then(|r| r.payloads.get(&owner))
            .cloned()
            .ok_or("combat produced no recipient report")?;
        Some(payload)
    } else {
        None
    };
    let payload = if let Some(payload) = e.payload.as_ref().or(combat_example.as_ref()) {
        payload.clone()
    } else {
        let body = s
            .bodies
            .values()
            .find(|b| b.owner == owner)
            .ok_or("recipient has no planet")?;
        let cargo = values(&e.resources)?.values().map(|n| n.to_string());
        match kind.to_ascii_lowercase().as_str() {
            "transport" | "delivered" | "transportdelivered" => {
                serde_json::json!({"kind":"Delivered","origin":body.id,"target":body.id,"cargo":{"metal":cargo[0],"crystal":cargo[1],"deuterium":cargo[2]},"at":i.at})
            }
            "espionage" | "spy" => {
                serde_json::json!({"kind":"Espionage","target":{"body":body.id,"name":body.name,"coordinates":body.coordinates,"owner":owner,"kind":"Planet"},"observed_at":i.at,"resources":{"visibility":"Known","value":{"metal":cargo[0],"crystal":cargo[1],"deuterium":cargo[2]}},"fleet":{"visibility":"Unknown"},"defenses":{"visibility":"Unknown"},"buildings":{"visibility":"Unknown"},"research":{"visibility":"Unknown"},"activity":{"type":"None"},"counterespionage":{"probability_ppm":0,"detected":false}})
            }
            _ => return Err(
                "report kind must be transport or espionage; use attack for real combat reports"
                    .into(),
            ),
        }
    };
    let kind = payload
        .get("kind")
        .and_then(|v| v.as_str())
        .ok_or("report payload requires kind")?;
    if ![
        "Delivered",
        "Espionage",
        "SpyContact",
        "Harvested",
        "Returned",
        "Recalled",
        "MissionFailed",
        "Deployed",
        "Combat",
        "ContactLost",
        "Colonized",
        "ColonizationFailed",
    ]
    .contains(&kind)
    {
        return Err("unsupported report payload kind".into());
    }

    s.world
        .as_mut()
        .ok_or("missing world")?
        .records
        .reports
        .insert(
            id,
            MissionReport {
                id,
                event: i.id,
                kind: kind.into(),
                at: i.at,
                fleet: None,
                rules_hash: s.profile_hash.clone(),
                payloads: BTreeMap::from([(owner, payload)]),
            },
        );
    Ok(())
}
pub(super) fn queues(
    s: &GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
    ids: &[BodyId],
    owner: Option<PlayerId>,
) -> EditResult<ChangeSet> {
    if e.op.eq_ignore_ascii_case("queue") {
        return super::queues::start(s, r, i, e, *ids.first().ok_or("queue requires planet")?);
    }
    super::queues::finish(s, r, i, e, ids, owner)
}

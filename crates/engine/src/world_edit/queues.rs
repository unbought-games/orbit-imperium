use super::*;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn fault(e: crate::transition::Fault) -> String {
    format!("{e:?}")
}
fn world(s: &GameState) -> EditResult<WorldRecords> {
    Ok(s.world.as_ref().ok_or("missing world")?.records.clone())
}
fn apply(s: &mut GameState, r: &Ruleset, i: &OrderedInput) -> EditResult<ChangeSet> {
    let mut c = crate::progression::resolve(s, i, r).map_err(fault)?;
    let mut w = world(s)?;
    crate::valuation::progression_valuation(s, i, &c, &mut w).map_err(error)?;
    c.world = Some(WorldChanges {
        records: w,
        score_deltas: vec![],
        audits: vec![],
    });
    c.apply_to(s).map_err(error)?;
    Ok(c)
}
pub(super) fn finish(
    s: &GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
    ids: &[BodyId],
    owner: Option<PlayerId>,
) -> EditResult<ChangeSet> {
    if ids.is_empty() && owner.is_none() {
        return Err("queue control requires planet or user".into());
    }
    let ids: Vec<_> = if ids.is_empty() {
        s.bodies
            .values()
            .filter(|b| owner == Some(b.owner))
            .map(|b| b.id)
            .collect()
    } else {
        ids.to_vec()
    };
    let clear = e.op.eq_ignore_ascii_case("clear");
    let mut working = s.clone();
    let mut result = ChangeSet::new(s, i, r);
    let mut steps = Vec::new();
    for x in s
        .constructions
        .values()
        .filter(|x| ids.contains(&x.body) && x.status == ConstructionStatus::Active)
    {
        steps.push((
            x.id,
            x.owner,
            ScheduledEvent::ConstructionDue {
                operation: x.id,
                generation: x.generation,
            },
        ));
    }
    for x in s.research_operations.values().filter(|x| {
        (ids.contains(&x.host) || owner == Some(x.owner)) && x.status == ResearchStatus::Active
    }) {
        steps.push((
            x.id,
            x.owner,
            ScheduledEvent::ResearchDue {
                operation: x.id,
                generation: x.generation,
            },
        ));
    }
    for (id, p, event) in steps {
        let mut input = i.clone();
        input.id = InputId(derived_id(i.id, &id.to_string()));
        input.actor = if clear {
            Actor::Player(p)
        } else {
            Actor::Scheduler
        };
        input.phase = if clear { 1 } else { 0 };
        input.payload = if clear {
            Input::Command(if working.constructions.contains_key(&id) {
                Command::CancelConstruction { operation: id }
            } else {
                Command::CancelResearch { operation: id }
            })
        } else {
            if let Some(c) = working.constructions.get_mut(&id) {
                c.due_at = i.at;
            }
            if let Some(c) = working.research_operations.get_mut(&id) {
                c.commitment.due_at = i.at;
            }
            Input::Event(event.clone())
        };
        apply(&mut working, r, &input)?;
        result.cancelled_events.push(event);
    }
    let mut batches = s
        .manufacturing_batches
        .values()
        .filter(|x| ids.contains(&x.body) && x.status == ManufacturingStatus::Active)
        .cloned()
        .collect::<Vec<_>>();
    batches.sort_by_key(|x| x.queue_sequence);
    for original in batches {
        result
            .cancelled_events
            .push(ScheduledEvent::ManufacturingDue {
                operation: original.id,
                generation: original.generation,
                expected_prefix: original.completed_prefix,
            });
        if clear {
            let b = working.bodies.get(&original.body).unwrap().clone();
            let mut b = b.clone();
            b.checkpoint = settle_production(&working, &b, i.at, r).map_err(error)?;
            let remaining = original.quantity - original.completed_prefix;
            let refund = Resources::from_values(
                original
                    .commitment
                    .unit_cost
                    .values()
                    .map(|n| n.checked_mul(remaining))
                    .into_iter()
                    .collect::<Option<Vec<_>>>()
                    .ok_or("refund overflow")?
                    .try_into()
                    .unwrap(),
            );
            b.checkpoint.amounts =
                crate::transition::resources(b.checkpoint.amounts, refund, true).map_err(error)?;
            b.revision += 1;
            working.bodies.insert(b.id, b);
            let batch = working.manufacturing_batches.get_mut(&original.id).unwrap();
            batch.status = ManufacturingStatus::Cancelled;
            batch.generation += 1;
            batch.revision += 1;
            continue;
        }
        let batch = working.manufacturing_batches.get_mut(&original.id).unwrap();
        let prefix = batch.completed_prefix;
        batch.first_start_at =
            i.at.checked_sub(prefix + 1)
                .ok_or("cannot finish before clock origin")?;
        batch.unit_duration_ms = 1;
        batch.next_due_at = i.at;
        batch.final_due_at = batch
            .first_start_at
            .checked_add(batch.quantity)
            .ok_or("deadline overflow")?;
        let batch = batch.clone();
        let mut input = i.clone();
        input.id = InputId(derived_id(i.id, &format!("{}:{prefix}", original.id)));
        input.phase = 0;
        input.payload = Input::Event(ScheduledEvent::ManufacturingDue {
            operation: batch.id,
            generation: batch.generation,
            expected_prefix: prefix,
        });
        let mut change = crate::progression::complete_manufacturing(
            &working,
            &input,
            r,
            &batch,
            batch.quantity - prefix,
        )
        .map_err(fault)?;
        let mut records = world(&working)?;
        crate::valuation::progression_valuation(&working, &input, &change, &mut records)
            .map_err(error)?;
        change.world = Some(WorldChanges {
            records,
            score_deltas: vec![],
            audits: vec![],
        });
        change.apply_to(&mut working).map_err(error)?;
    }
    result.bodies = working
        .bodies
        .values()
        .filter(|b| s.bodies.get(&b.id) != Some(*b))
        .cloned()
        .collect();
    result.constructions = working
        .constructions
        .values()
        .filter(|x| s.constructions.get(&x.id) != Some(*x))
        .cloned()
        .collect();
    result.research_operations = working
        .research_operations
        .values()
        .filter(|x| s.research_operations.get(&x.id) != Some(*x))
        .cloned()
        .collect();
    result.manufacturing_batches = working
        .manufacturing_batches
        .values()
        .filter(|x| s.manufacturing_batches.get(&x.id) != Some(*x))
        .cloned()
        .collect();
    result.research = working
        .research
        .values()
        .filter(|x| s.research.get(&x.owner) != Some(*x))
        .cloned()
        .collect();
    result.inventories = working
        .inventories
        .iter()
        .filter(|x| !s.inventories.contains(x))
        .cloned()
        .collect();
    result.world = Some(WorldChanges {
        records: world(&working)?,
        score_deltas: vec![],
        audits: vec![],
    });
    result.affected_viewers.extend(s.players.keys());
    Ok(result)
}
pub(super) fn start(
    s: &GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
    id: BodyId,
) -> EditResult<ChangeSet> {
    let b = &s.bodies[&id];
    let mut c = ChangeSet::new(s, i, r);
    let operation = OperationId(derived_id(i.id, "queue"));
    if e.buildings.len() + e.research.len() + e.ships.len() + e.defenses.len() != 1 {
        return Err("queue requires exactly one catalog item".into());
    }
    if e.paid.is_some_and(|p| p.values().iter().any(|n| *n < 0)) {
        return Err("negative paid value".into());
    }
    let event = if !e.buildings.is_empty() {
        if s.constructions
            .values()
            .any(|x| x.body == id && x.status == ConstructionStatus::Active)
        {
            return Err("planet already has active construction".into());
        }
        let (key, target) = canonical_map(&e.buildings, r.building_keys())?
            .into_iter()
            .next()
            .unwrap();
        if target != i64::from(b.levels[&key]) + 1 {
            return Err("queued building level must be the next level".into());
        }
        let terms = building_terms(b, key, BuildingAction::Upgrade, r).map_err(error)?;
        let at = deadline(i, e, &terms)?;
        c.constructions.push(Construction {
            progression: Some(terms.clone()),
            id: operation,
            body: id,
            owner: b.owner,
            building: key,
            target_level: b.levels[&key] + 1,
            paid: e.paid.unwrap_or(terms.paid()),
            profile_hash: e.paid_rules_hash.clone().unwrap_or_else(|| r.hash.clone()),
            terms_hash: hash(&terms),
            started_at: i.at,
            due_at: at,
            generation: 0,
            status: ConstructionStatus::Active,
            revision: 0,
        });
        (
            at,
            ScheduledEvent::ConstructionDue {
                operation,
                generation: 0,
            },
        )
    } else if !e.research.is_empty() {
        if s.research_operations
            .values()
            .any(|x| x.owner == b.owner && x.status == ResearchStatus::Active)
        {
            return Err("player already has active research".into());
        }
        let (key, target) = canonical_map(&e.research, r.research_keys())?
            .into_iter()
            .next()
            .unwrap();
        let levels = &s.research[&b.owner];
        if target != i64::from(levels.levels[&key]) + 1 {
            return Err("queued research must be the next level".into());
        }
        let terms = research_terms(b, levels, key, r).map_err(error)?;
        let at = deadline(i, e, &terms)?;
        c.research_operations.push(ResearchOperation {
            id: operation,
            owner: b.owner,
            host: id,
            research: key,
            source_level: levels.levels[&key],
            target_level: levels.levels[&key] + 1,
            labs: vec![LabContribution {
                body: id,
                completed_level: b.levels[&Building::ResearchLab],
            }],
            commitment: Commitment {
                profile_hash: e.paid_rules_hash.clone().unwrap_or_else(|| r.hash.clone()),
                terms_hash: hash(&terms),
                paid: e.paid.unwrap_or(terms.paid()),
                started_at: i.at,
                due_at: at,
            },
            status: ResearchStatus::Active,
            generation: 0,
            revision: 0,
        });
        (
            at,
            ScheduledEvent::ResearchDue {
                operation,
                generation: 0,
            },
        )
    } else {
        let (item, n) = if !e.ships.is_empty() {
            let (k, n) = canonical_map(&e.ships, r.artifact.ships.keys().copied())?
                .into_iter()
                .next()
                .unwrap();
            (ManufacturedItem::Ship(k), n)
        } else {
            let (k, n) = canonical_map(
                &e.defenses,
                r.artifact.catalog.iter().filter_map(|x| match x.key {
                    CatalogKey::Defense(d) if x.enabled => Some(d),
                    _ => None,
                }),
            )?
            .into_iter()
            .next()
            .unwrap();
            (ManufacturedItem::Defense(k), n)
        };
        let terms = manufacture_terms(b, item, n, r).map_err(error)?;
        let ProgressionMaterial::Manufacture {
            unit_cost,
            unit_duration_ms,
            facilities,
            ..
        } = &terms
        else {
            unreachable!()
        };
        let duration = e
            .arrives_in
            .as_ref()
            .map(|t| duration_ms(t))
            .transpose()?
            .unwrap_or(*unit_duration_ms);
        let prev = s
            .manufacturing_batches
            .values()
            .filter(|x| x.body == id && x.status == ManufacturingStatus::Active)
            .max_by_key(|x| x.queue_sequence);
        let start = if let Some(first) = &e.first_in {
            let next =
                i.at.checked_add(duration_ms(first)?)
                    .ok_or("deadline overflow")?;
            let start = next
                .checked_sub(duration)
                .filter(|n| *n >= 0)
                .ok_or("first completion precedes supported clock")?;
            if prev.is_some_and(|p| start < p.final_due_at) {
                return Err("first completion conflicts with preceding batch".into());
            }
            start
        } else {
            prev.map(|x| x.final_due_at.max(i.at)).unwrap_or(i.at)
        };
        let next = start.checked_add(duration).ok_or("deadline overflow")?;
        let end = duration
            .checked_mul(n)
            .and_then(|d| start.checked_add(d))
            .filter(|t| *t <= MAX_WIRE_MS)
            .ok_or("deadline overflow")?;
        c.manufacturing_batches.push(ManufacturingBatch {
            id: operation,
            owner: b.owner,
            body: id,
            item,
            quantity: n,
            completed_prefix: 0,
            commitment: BatchCommitment {
                profile_hash: e.paid_rules_hash.clone().unwrap_or_else(|| r.hash.clone()),
                terms_hash: hash(&terms),
                paid: if let Some(unit) = e.paid {
                    Resources::from_values(
                        unit.values()
                            .map(|x| x.checked_mul(n))
                            .into_iter()
                            .collect::<Option<Vec<_>>>()
                            .ok_or("paid value overflow")?
                            .try_into()
                            .unwrap(),
                    )
                } else {
                    terms.paid()
                },
                unit_cost: e.paid.unwrap_or(*unit_cost),
                accepted_at: i.at,
                facility_levels: facilities.iter().map(|x| (x.building, x.level)).collect(),
            },
            predecessor: prev.map(|x| x.id),
            queue_sequence: i.sequence,
            first_start_at: start,
            final_due_at: end,
            unit_duration_ms: duration,
            next_due_at: next,
            status: ManufacturingStatus::Active,
            generation: 0,
            revision: 0,
        });
        (
            next,
            ScheduledEvent::ManufacturingDue {
                operation,
                generation: 0,
                expected_prefix: 0,
            },
        )
    };
    c.events.push(NewEvent {
        id: InputId(derived_id(i.id, "queue-event")),
        at: event.0,
        event: event.1,
    });
    c.affected_viewers.insert(b.owner);
    Ok(c)
}
fn deadline(i: &OrderedInput, e: &WorldEdit, t: &ProgressionMaterial) -> EditResult<i64> {
    i.at.checked_add(
        e.arrives_in
            .as_ref()
            .map(|s| duration_ms(s))
            .transpose()?
            .unwrap_or(t.duration()),
    )
    .filter(|t| *t <= MAX_WIRE_MS)
    .ok_or("deadline overflow".into())
}

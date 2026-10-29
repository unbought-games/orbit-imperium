use super::*;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn amount(old: i64, n: i64, give: bool) -> EditResult<i64> {
    if give {
        old.checked_add(n).ok_or("amount overflow".into())
    } else {
        Ok(n)
    }
}
fn lot(
    s: &mut GameState,
    i: &OrderedInput,
    owner: PlayerId,
    item: CatalogKey,
    location: AssetLocation,
    amount: (Option<u32>, i64),
    paid: Resources,
) -> EditResult<()> {
    let (level, quantity) = amount;
    let value = paid
        .values()
        .into_iter()
        .try_fold(0i64, |s, n| s.checked_add(n))
        .ok_or("valuation overflow")?;
    let w = &mut s.world.as_mut().ok_or("missing world")?.records;
    let id = OperationId(derived_id(
        i.id,
        &format!("world-lot:{owner:?}:{item:?}:{location:?}:{level:?}"),
    ));
    w.lots.push(AssetLot {
        id,
        owner,
        item,
        location,
        level,
        quantity,
        unit_value_micro: value,
        rules_hash: s.profile_hash.clone(),
        source_operation: OperationId(i.id.0),
        acquired_at: i.at,
        acquired_sequence: i.sequence,
    });
    Ok(())
}
pub(super) fn edit_body(
    s: &mut GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
    id: BodyId,
    give: bool,
) -> EditResult<()> {
    let mut b = s.bodies[&id].clone();
    let satellites = solar_satellite_count(s, &b, r).map_err(error)?;
    b.checkpoint = settle_rules_boundary(
        &b,
        &s.production_settings[&id].settings,
        satellites,
        s.research[&b.owner].levels[&ResearchId::EnergyTechnology],
        i.at,
        r,
    )
    .map_err(error)?;
    if let Some(stock) = e.stock {
        if stock.values().iter().any(|n| *n < 0) {
            return Err("negative stock".into());
        }
        b.checkpoint.amounts = stock;
    }
    if let Some(name) = &e.name {
        b.name = Some(normalize_planet_name(name).map_err(error)?);
    }
    let mut seen = BTreeSet::new();
    for (k, n) in &e.resources {
        if *n < 0 {
            return Err("resources must be nonnegative".into());
        }
        let key = k.to_ascii_lowercase();
        if !seen.insert(key.clone()) {
            return Err(format!("duplicate resource {k}"));
        }
        let v = n.checked_mul(SCALE).ok_or("resource overflow")?;
        let dst = match key.as_str() {
            "metal" => &mut b.checkpoint.amounts.metal,
            "crystal" => &mut b.checkpoint.amounts.crystal,
            "deuterium" => &mut b.checkpoint.amounts.deuterium,
            _ => return Err(format!("unknown resource {k}")),
        };
        *dst = amount(*dst, v, give)?;
    }
    for (key, n) in canonical_map(&e.buildings, r.building_keys())? {
        if s.constructions
            .values()
            .any(|c| c.body == id && c.status == ConstructionStatus::Active)
        {
            return Err(
                "finish or clear active construction before changing building levels".into(),
            );
        }
        let old = b.levels[&key];
        let target = u32::try_from(amount(i64::from(old), n, give)?).map_err(error)?;
        if target > 1000 {
            return Err("building level exceeds supported range".into());
        }
        for level in old + 1..=target {
            let paid = building_terms(&b, key, BuildingAction::Upgrade, r)
                .map_err(error)?
                .paid();
            lot(
                s,
                i,
                b.owner,
                CatalogKey::Building(key),
                AssetLocation::Body(id),
                (Some(level), 1),
                paid,
            )?;
            b.levels.insert(key, level);
        }
        if target < old {
            s.world.as_mut().unwrap().records.lots.retain(|l| {
                !(l.owner == b.owner
                    && l.location == AssetLocation::Body(id)
                    && l.item == CatalogKey::Building(key)
                    && l.level.is_some_and(|v| v > target))
            });
            b.levels.insert(key, target);
        }
    }
    let ships = canonical_map(&e.ships, r.artifact.ships.keys().copied())?
        .into_iter()
        .map(|(k, n)| (ManufacturedItem::Ship(k), n));
    let defenses = canonical_map(
        &e.defenses,
        r.artifact.catalog.iter().filter_map(|e| match e.key {
            CatalogKey::Defense(d) if e.enabled => Some(d),
            _ => None,
        }),
    )?
    .into_iter()
    .map(|(k, n)| (ManufacturedItem::Defense(k), n));
    let missiles = canonical_map(
        &e.missiles,
        r.artifact.catalog.iter().filter_map(|e| match e.key {
            CatalogKey::Missile(m) if e.enabled => Some(m),
            _ => None,
        }),
    )?
    .into_iter()
    .map(|(m, n)| (ManufacturedItem::Missile(m), n));
    for (item, n) in ships.chain(defenses).chain(missiles) {
        let key = item.catalog_key();
        let at = s
            .inventories
            .iter()
            .position(|x| x.body == id && x.owner == b.owner && x.item == item);
        let old = at.map(|idx| s.inventories[idx].count).unwrap_or(0);
        let target = amount(old, n, give)?;
        if target > old {
            let paid = manufacture_terms(&b, item, 1, r).map_err(error)?.paid();
            lot(
                s,
                i,
                b.owner,
                key,
                AssetLocation::Body(id),
                (None, target - old),
                paid,
            )?;
        }
        if target < old {
            take_asset_lots(
                &mut s.world.as_mut().unwrap().records.lots,
                b.owner,
                key,
                &AssetLocation::Body(id),
                old - target,
                None,
            )
            .map_err(error)?;
        }
        if let Some(idx) = at {
            s.inventories[idx].count = target;
            s.inventories[idx].revision += 1
        } else {
            s.inventories.push(InventoryStack {
                body: id,
                owner: b.owner,
                item,
                count: target,
                revision: 0,
            })
        }
    }
    if let Some(rule) = missile_rules(r) {
        let slots = silo_capacity(s, &b, rule).map_err(error)?;
        if slots.occupied + slots.reserved > slots.total {
            return Err("missile inventory exceeds silo capacity".into());
        }
    }
    b.revision += 1;
    s.bodies.insert(id, b);
    Ok(())
}
pub(super) fn edit_research(
    s: &mut GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
    owner: PlayerId,
    give: bool,
) -> EditResult<()> {
    if s.research_operations
        .values()
        .any(|x| x.owner == owner && x.status == ResearchStatus::Active)
    {
        return Err("finish or clear active research before changing levels".into());
    }
    let settled = s
        .bodies
        .values()
        .filter(|b| b.owner == owner)
        .map(|b| Ok((b.id, settle_production(s, b, i.at, r).map_err(error)?)))
        .collect::<EditResult<Vec<_>>>()?;
    for (id, checkpoint) in settled {
        let body = s.bodies.get_mut(&id).unwrap();
        body.checkpoint = checkpoint;
        body.revision += 1;
    }
    let b = s
        .bodies
        .values()
        .find(|b| b.owner == owner)
        .ok_or("player has no planets")?
        .clone();
    let mut research = s.research[&owner].clone();
    for (key, n) in canonical_map(&e.research, r.research_keys())? {
        let old = research.levels[&key];
        let target = u32::try_from(amount(i64::from(old), n, give)?).map_err(error)?;
        if target > 1000 {
            return Err("research level exceeds supported range".into());
        }
        for level in old + 1..=target {
            let paid = research_terms(&b, &research, key, r).map_err(error)?.paid();
            lot(
                s,
                i,
                owner,
                CatalogKey::Research(key),
                AssetLocation::Player,
                (Some(level), 1),
                paid,
            )?;
            research.levels.insert(key, level);
        }
        if target < old {
            s.world.as_mut().unwrap().records.lots.retain(|l| {
                !(l.owner == owner
                    && l.item == CatalogKey::Research(key)
                    && l.level.is_some_and(|v| v > target))
            });
            research.levels.insert(key, target);
        }
    }
    research.revision += 1;
    s.research.insert(owner, research);
    Ok(())
}

pub(super) fn restore_values(
    s: &mut GameState,
    r: &Ruleset,
    i: &OrderedInput,
    e: &WorldEdit,
    owner: PlayerId,
    values: &[WorldAssetValue],
) -> EditResult<()> {
    let location = if let Some(p) = &e.planet {
        AssetLocation::Body(planet_id(s, p)?)
    } else {
        AssetLocation::Player
    };
    restore_values_at(s, r, i, owner, location, values)
}
pub(super) fn restore_values_at(
    s: &mut GameState,
    r: &Ruleset,
    i: &OrderedInput,
    owner: PlayerId,
    location: AssetLocation,
    values: &[WorldAssetValue],
) -> EditResult<()> {
    let lots = &mut s.world.as_mut().ok_or("missing world")?.records.lots;
    lots.retain(|l| l.owner != owner || l.location != location);
    for (index, v) in values.iter().enumerate() {
        if v.quantity <= 0 || v.unit_value_micro < 0 {
            return Err("invalid asset value".into());
        }
        let key = match v.category.to_ascii_lowercase().as_str() {
            "building" => CatalogKey::Building(catalog_key(&v.item, r.building_keys())?),
            "research" => CatalogKey::Research(catalog_key(&v.item, r.research_keys())?),
            "ship" => CatalogKey::Ship(catalog_key(&v.item, r.artifact.ships.keys().copied())?),
            "missile" => CatalogKey::Missile(catalog_key(
                &v.item,
                [
                    MissileId::AntiBallisticMissile,
                    MissileId::InterplanetaryMissile,
                ],
            )?),
            "defense" => CatalogKey::Defense(catalog_key(
                &v.item,
                r.artifact.catalog.iter().filter_map(|e| match e.key {
                    CatalogKey::Defense(d) if e.enabled => Some(d),
                    _ => None,
                }),
            )?),
            _ => return Err("unknown valuation category".into()),
        };
        lots.push(AssetLot {
            id: OperationId(derived_id(i.id, &format!("restored-value:{index}"))),
            owner,
            item: key,
            level: v.level,
            location: location.clone(),
            quantity: v.quantity,
            unit_value_micro: v.unit_value_micro,
            rules_hash: v.rules_hash.clone(),
            source_operation: OperationId(i.id.0),
            acquired_at: i.at,
            acquired_sequence: i.sequence,
        });
    }
    Ok(())
}

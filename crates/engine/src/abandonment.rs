//! Voluntary G06 colony removal. Immutable loss evidence outlives the bodies.
use crate::transition::{Fault, invariant};
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AbandonedInventory {
    pub item: ManufacturedItem,
    #[serde(with = "decimal_wire")]
    pub count: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AbandonedWork {
    pub id: OperationId,
    pub item: String,
    #[serde(with = "decimal_wire")]
    pub quantity: i64,
    #[serde(with = "resource_strings")]
    pub paid: Resources,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AbandonmentLoss {
    pub id: BodyId,
    pub name: Option<String>,
    pub kind: BodyKind,
    pub coordinates: Coordinates,
    #[serde(with = "resource_strings")]
    pub resources: Resources,
    pub buildings: BTreeMap<Building, u32>,
    pub inventory: Vec<AbandonedInventory>,
    pub construction: Vec<AbandonedWork>,
    pub manufacturing: Vec<AbandonedWork>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Abandonment {
    pub body: BodyId,
    pub owner: PlayerId,
    pub coordinates: Coordinates,
    pub removed_at: Timestamp,
    pub release_at: Timestamp,
    pub released: bool,
    pub input: InputId,
    pub losses: Vec<AbandonmentLoss>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AbandonmentQuote {
    pub body: BodyId,
    pub terms_hash: Hash,
    pub release_at: Timestamp,
    pub blockers: Vec<String>,
    pub losses: Vec<AbandonmentLoss>,
}
pub fn abandonment_release(at: Timestamp) -> Result<Timestamp, GameError> {
    if !(0..=MAX_WIRE_MS).contains(&at) {
        return Err(GameError::NumericRange);
    }
    let day = 86_400_000;
    deadline((at / day + 1) * day, day)
}
pub fn quote_abandonment(
    s: &GameState,
    owner: PlayerId,
    id: BodyId,
    at: Timestamp,
    r: &Ruleset,
) -> Result<AbandonmentQuote, GameError> {
    let b = s
        .bodies
        .get(&id)
        .filter(|b| b.owner == owner)
        .ok_or(GameError::NotOwned)?;
    if b.kind != BodyKind::Planet {
        return Err(GameError::BodyKindNotAllowed);
    }
    let w = world_facts(s).map_err(|_| GameError::PolicyUnavailable)?;
    if !s.coverage.owned_body_players.contains(&owner)
        || !s.coverage.research_slot_players.contains(&owner)
        || !w.covered_players.contains(&owner)
    {
        return Err(GameError::PolicyUnavailable);
    }
    let home = w
        .homeworlds
        .get(&owner)
        .ok_or(GameError::PolicyUnavailable)?;
    let bodies: Vec<_> = s
        .bodies
        .values()
        .filter(|x| x.coordinates == b.coordinates && x.owner == owner)
        .collect();
    let ids: Vec<_> = bodies.iter().map(|b| b.id).collect();
    let mut blockers = Vec::new();
    if w.records.policies.get(&owner).is_some_and(|p| p.vacation) {
        blockers.push("Leave vacation mode before abandoning a planet.".into());
    }
    if *home == id {
        blockers.push("Your homeworld cannot be abandoned.".into());
    }
    if owned_planet_count(s, owner).map_err(|_| GameError::PolicyUnavailable)? <= 1 {
        blockers.push("Your last planet cannot be abandoned.".into());
    }
    if w.records
        .fleets
        .values()
        .any(|f| f.owner == owner && f.active() && ids.contains(&f.intent.origin))
    {
        blockers.push(
            "An active fleet depends on this planet or its moon. Wait for it to finish.".into(),
        );
    }
    // Current mission catalog has no Hold or moon fallback redirects. Keep the
    // inventory-owner guard so foreign stationed assets can never be destroyed.
    if s.inventories
        .iter()
        .any(|x| ids.contains(&x.body) && x.owner != owner && x.count > 0)
    {
        blockers.push("Allied ships are stationed here.".into());
    }
    if s.research_operations.values().any(|op| {
        op.status == ResearchStatus::Active
            && (ids.contains(&op.host) || op.labs.iter().any(|lab| ids.contains(&lab.body)))
    }) {
        blockers.push("This planet hosts or contributes a lab to active research. Finish or cancel that research first.".into());
    }
    let mut losses = Vec::new();
    for body in &bodies {
        if !s.coverage.construction_bodies.contains(&body.id)
            || !s.coverage.manufacturing_bodies.contains(&body.id)
            || !s.coverage.inventory_owners.contains(&(body.id, owner))
        {
            return Err(GameError::PolicyUnavailable);
        }
        losses.push(AbandonmentLoss {
            id: body.id,
            name: body.name.clone(),
            kind: body.kind,
            coordinates: body.coordinates,
            resources: settle_production(s, body, at, r)
                .map_err(|_| GameError::PolicyUnavailable)?
                .amounts,
            buildings: body.levels.clone(),
            inventory: s
                .inventories
                .iter()
                .filter(|x| x.body == body.id && x.count > 0)
                .map(|x| AbandonedInventory {
                    item: x.item,
                    count: x.count,
                })
                .collect(),
            construction: s
                .constructions
                .values()
                .filter(|x| x.body == body.id && x.status == ConstructionStatus::Active)
                .map(|x| AbandonedWork {
                    id: x.id,
                    item: format!("{:?} level {}", x.building, x.target_level),
                    quantity: 1,
                    paid: x.paid,
                })
                .collect(),
            manufacturing: s
                .manufacturing_batches
                .values()
                .filter(|x| x.body == body.id && x.status == ManufacturingStatus::Active)
                .map(|x| {
                    Ok(AbandonedWork {
                        id: x.id,
                        item: match x.item {
                            ManufacturedItem::Ship(v) => format!("{v:?}"),
                            ManufacturedItem::Defense(v) => format!("{v:?}"),
                            ManufacturedItem::Missile(v) => format!("{v:?}"),
                        },
                        quantity: x.quantity - x.completed_prefix,
                        paid: Resources::from_values(
                            x.commitment
                                .unit_cost
                                .values()
                                .map(|v| {
                                    v.checked_mul(x.quantity - x.completed_prefix)
                                        .ok_or(GameError::NumericRange)
                                })
                                .into_iter()
                                .collect::<Result<Vec<_>, _>>()?
                                .try_into()
                                .map_err(|_| GameError::NumericRange)?,
                        ),
                    })
                })
                .collect::<Result<Vec<_>, GameError>>()?,
        });
    }
    // Passive production does not invalidate consent. A changed cleanup day,
    // inventory, building, queue or checkpoint requires a fresh review.
    let release_at = abandonment_release(at)?;
    let terms_hash = hash(&(
        id,
        release_at,
        &r.hash,
        &bodies,
        losses
            .iter()
            .map(|x| (&x.inventory, &x.construction, &x.manufacturing))
            .collect::<Vec<_>>(),
    ));
    Ok(AbandonmentQuote {
        body: id,
        terms_hash,
        release_at,
        blockers,
        losses,
    })
}
pub(crate) fn abandon(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    id: BodyId,
    expected: &Hash,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    let Actor::Player(owner) = i.actor else {
        return Err(invariant("abandonment actor"));
    };
    let q = quote_abandonment(s, owner, id, i.at, r)?;
    if !q.blockers.is_empty() {
        return Err(GameError::AbandonmentBlocked.into());
    }
    if &q.terms_hash != expected {
        return Err(GameError::QuoteChanged.into());
    }
    for loss in &q.losses {
        for old in &loss.construction {
            let mut op = s.constructions[&old.id].clone();
            op.status = ConstructionStatus::BodyAbandoned;
            op.revision = op.revision.checked_add(1).ok_or(GameError::NumericRange)?;
            c.cancelled_events.push(ScheduledEvent::ConstructionDue {
                operation: op.id,
                generation: op.generation,
            });
            c.constructions.push(op);
        }
        for old in &loss.manufacturing {
            let mut op = s.manufacturing_batches[&old.id].clone();
            op.status = ManufacturingStatus::BodyAbandoned;
            op.revision = op.revision.checked_add(1).ok_or(GameError::NumericRange)?;
            c.cancelled_events.push(ScheduledEvent::ManufacturingDue {
                operation: op.id,
                generation: op.generation,
                expected_prefix: op.completed_prefix,
            });
            c.manufacturing_batches.push(op);
        }
        w.lots
            .retain(|lot| lot.location != AssetLocation::Body(loss.id));
        w.colonies.remove(&loss.id);
        w.activity.remove(&loss.id);
    }
    let coordinates = s.bodies[&id].coordinates;
    let record = Abandonment {
        body: id,
        owner,
        coordinates,
        removed_at: i.at,
        release_at: q.release_at,
        released: false,
        input: i.id,
        losses: q.losses,
    };
    let report = ReportId(derived_id(i.id, "planet-abandoned-report"));
    w.reports.insert(
        report,
        MissionReport {
            id: report,
            event: i.id,
            kind: "PlanetAbandoned".into(),
            at: i.at,
            fleet: None,
            rules_hash: r.hash.clone(),
            payloads: [(
                owner,
                serde_json::json!({"kind":"PlanetAbandoned", "abandonment":record}),
            )]
            .into(),
        },
    );
    w.abandonments.insert(id, record);
    c.events.push(NewEvent {
        id: InputId(derived_id(i.id, "abandoned-slot-release")),
        at: q.release_at,
        event: ScheduledEvent::AbandonedSlotDue {
            body: id,
            coordinates,
            owner,
        },
    });
    c.affected_viewers.insert(owner);
    Ok(())
}

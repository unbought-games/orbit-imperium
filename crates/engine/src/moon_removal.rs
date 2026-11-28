//! A destroyed moon releases its slot. Its identity and parent remain bound to
//! accepted flights and historical reports, including after a replacement forms.
use crate::transition::{Fault, invariant};
use crate::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DestroyedMoon {
    pub body: BodyId,
    pub parent: BodyId,
    pub owner: PlayerId,
    pub coordinates: Coordinates,
    pub input: InputId,
    pub at: Timestamp,
}

fn redirects_destination(mission: Mission) -> bool {
    matches!(
        mission,
        Mission::Deploy | Mission::Transport | Mission::Hold
    )
}

impl DestroyedMoon {
    fn parent_binding(&self) -> MissionDestination {
        MissionDestination::Body {
            id: self.parent,
            expected_owner: self.owner,
            expected_kind: BodyKind::Planet,
        }
    }
}

/// Only a documented physical removal may change either operational endpoint.
/// The accepted terms retain the complete original intent and its original hash.
pub(crate) fn valid_intent(fleet: &MissionFleet, losses: &BTreeMap<BodyId, DestroyedMoon>) -> bool {
    let accepted = &fleet.terms.intent;
    if &fleet.intent == accepted {
        return true;
    }
    let mut expected = accepted.clone();
    if expected.origin != fleet.intent.origin {
        let Some(loss) = losses.get(&accepted.origin) else {
            return false;
        };
        if loss.owner != fleet.owner
            || loss.coordinates != fleet.origin_coordinates
            || loss.at < fleet.launched_at
        {
            return false;
        }
        expected.origin = loss.parent;
    }
    if expected.destination != fleet.intent.destination {
        let MissionDestination::Body {
            id,
            expected_kind: BodyKind::Moon,
            expected_owner,
        } = accepted.destination
        else {
            return false;
        };
        let Some(loss) = losses.get(&id) else {
            return false;
        };
        if loss.owner != expected_owner
            || loss.coordinates != fleet.destination_coordinates
            || loss.at < fleet.launched_at
            || !redirects_destination(accepted.mission)
        {
            return false;
        }
        expected.destination = loss.parent_binding();
    }
    fleet.intent == expected
}

fn redirect_fleets(
    i: &OrderedInput,
    loss: &DestroyedMoon,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    let Input::Event(ScheduledEvent::FleetLegDue { fleet: wave, .. }) = i.payload else {
        return Err(invariant("destruction outside fleet arrival"));
    };
    let mut notices = Vec::new();
    for f in w.fleets.values_mut().filter(|f| f.active() && f.id != wave) {
        let home = f.intent.origin == loss.body;
        let target = matches!(f.intent.destination, MissionDestination::Body { id, .. } if id == loss.body)
            && f.leg == MissionLeg::Outbound;
        if !home && !target {
            continue;
        }
        if home {
            if f.owner != loss.owner {
                return Err(invariant("destroyed moon home owner mismatch"));
            }
            f.intent.origin = loss.parent;
        }
        let redirect = target && redirects_destination(f.intent.mission);
        if redirect {
            if f.authorization.target_owner != Some(loss.owner) {
                return Err(invariant("destroyed moon recipient mismatch"));
            }
            f.intent.destination = loss.parent_binding();
        }
        if home || redirect {
            f.revision = f.revision.checked_add(1).ok_or(GameError::NumericRange)?;
        }
        c.affected_viewers.insert(f.owner);
        notices.push((f.id, home, redirect, target && !redirect));
    }
    for (fleet, home, redirect, lost_target) in notices {
        let f = &w.fleets[&fleet];
        let kind = if lost_target {
            "MoonTargetLost"
        } else {
            "MoonFleetRedirected"
        };
        let payload = json!({
            "kind":kind, "fleet":fleet, "mission":f.intent.mission, "leg":f.leg,
            "body":loss.body, "parent":loss.parent, "coordinates":loss.coordinates,
            "home_redirected":home, "destination_redirected":redirect,
            "due_at":effective_fleet_due(w, f), "at":i.at
        });
        let id = ReportId(derived_id(i.id, &format!("report:{kind}:{fleet}")));
        w.reports.insert(
            id,
            MissionReport {
                id,
                event: i.id,
                kind: kind.into(),
                at: i.at,
                fleet: Some(fleet),
                rules_hash: i.profile_hash.clone(),
                payloads: [(f.owner, payload)].into(),
            },
        );
    }
    Ok(())
}

pub(crate) fn destroy(
    s: &GameState,
    i: &OrderedInput,
    id: BodyId,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
) -> Result<(), Fault> {
    if !s.coverage.moon_removal_bodies.contains(&id) {
        return Err(invariant("incomplete moon removal fleet membership"));
    }
    let genesis = w
        .moons
        .remove(&id)
        .ok_or_else(|| invariant("missing destroyed moon genesis"))?;
    let moon = c
        .bodies
        .iter()
        .find(|b| b.id == id && b.kind == BodyKind::Moon)
        .ok_or_else(|| invariant("missing post-combat moon stock"))?;
    let parent = s
        .bodies
        .get(&genesis.parent)
        .filter(|b| {
            b.kind == BodyKind::Planet && b.owner == moon.owner && b.coordinates == moon.coordinates
        })
        .ok_or_else(|| invariant("missing owned moon fallback"))?;
    let loss = DestroyedMoon {
        body: id,
        parent: parent.id,
        owner: moon.owner,
        coordinates: moon.coordinates,
        input: i.id,
        at: i.at,
    };
    let stocks = s.inventories.iter().filter(|x| x.body == id).map(|stock| {
        c.inventories
            .iter()
            .find(|x| x.body == id && x.owner == stock.owner && x.item == stock.item)
            .unwrap_or(stock)
    });
    let losses = crate::abandonment::resident_losses(s, moon, moon.checkpoint.amounts, stocks)?;
    let report = ReportId(derived_id(i.id, "moon-destroyed-report"));
    w.reports.insert(report, MissionReport {
        id: report, event:i.id, kind:"MoonDestroyed".into(), at:i.at, fleet:None,
        rules_hash:i.profile_hash.clone(), payloads:[(moon.owner, json!({
            "kind":"MoonDestroyed", "body":id, "parent":parent.id, "coordinates":moon.coordinates,
            "name":moon.name, "at":i.at, "diameter_km":genesis.diameter_km, "losses":losses,
        }))].into(),
    });
    crate::abandonment::terminate_jobs(
        s,
        c,
        &losses,
        ConstructionStatus::BodyDestroyed,
        ManufacturingStatus::BodyDestroyed,
    )?;
    c.affected_viewers.insert(loss.owner);
    c.bodies.retain(|b| b.id != id);
    c.inventories.retain(|stack| stack.body != id);
    w.lots.retain(|l| l.location != AssetLocation::Body(id));
    w.activity.remove(&id);
    w.gate_uses.remove(&id);
    redirect_fleets(i, &loss, c, w)?;
    if w.destroyed_moons.insert(id, loss).is_some() {
        return Err(invariant("duplicate moon destruction"));
    }
    Ok(())
}

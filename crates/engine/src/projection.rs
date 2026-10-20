use crate::*;
#[derive(Clone, Debug)]
pub struct ViewerSnapshot {
    pub world: Option<GameState>,
    pub progression: Option<GameState>,
    pub coverage: FactCoverage,
    pub fleets: Vec<Fleet>,
    pub reports: Vec<Report>,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub player: PlayerId,
    pub revision: i64,
    pub at: i64,
    pub rules: Ruleset,
    pub bodies: Vec<Body>,
    pub inventories: Vec<InventoryStack>,
    pub research: ResearchLevels,
    pub destinations: Vec<PublicDestination>,
    pub constructions: Vec<Construction>,
}
#[derive(Clone, Debug)]
pub struct Projection {
    pub fleets: Vec<Fleet>,
    pub reports: Vec<Report>,
    pub bodies: Vec<Body>,
    pub inventories: Vec<InventoryStack>,
    pub research: ResearchLevels,
    pub destinations: Vec<PublicDestination>,
    pub constructions: Vec<Construction>,
}
pub fn project(
    facts: &ViewerSnapshot,
    at: Timestamp,
    rules: &Ruleset,
) -> Result<Projection, InvariantError> {
    if at < facts.at
        || at > MAX_WIRE_MS
        || facts.at < 0
        || facts.revision < 0
        || rules.hash != facts.rules.hash
    {
        return Err(InvariantError("projection binding mismatch".into()));
    }
    if !facts.coverage.research_players.contains(&facts.player)
        || !facts.coverage.fleet_owners.contains(&facts.player)
    {
        return Err(InvariantError("incomplete viewer facts".into()));
    }
    validate_research_catalog(&facts.research, rules)?;
    if facts.research.owner != facts.player {
        return Err(InvariantError("foreign research".into()));
    }
    let mut bodies = facts.bodies.clone();
    for body in &mut bodies {
        if body.owner != facts.player || body.universe != facts.universe {
            return Err(InvariantError("foreign projection body".into()));
        }
        if !facts.coverage.bodies.contains(&body.id)
            || !facts
                .coverage
                .inventory_owners
                .contains(&(body.id, body.owner))
            || !facts.coverage.construction_bodies.contains(&body.id)
        {
            return Err(InvariantError("incomplete body view".into()));
        }
        body.checkpoint = if rules.progression() {
            settle_production(
                facts
                    .progression
                    .as_ref()
                    .or(facts.world.as_ref())
                    .ok_or_else(|| InvariantError("missing progression view facts".into()))?,
                body,
                at,
                rules,
            )?
        } else {
            settle_economy(body, at, rules)?
        };
    }
    if facts.inventories.iter().any(|s| {
        s.owner != facts.player
            || s.count < 0
            || s.revision < 0
            || !facts.bodies.iter().any(|b| b.id == s.body)
    }) || facts.constructions.iter().any(|c| c.owner != facts.player)
    {
        return Err(InvariantError("foreign private projection facts".into()));
    }
    if facts.fleets.iter().any(|f| f.owner != facts.player)
        || facts
            .reports
            .iter()
            .any(|r| !r.recipients.contains(&facts.player))
    {
        return Err(InvariantError("foreign fleet/report facts".into()));
    }
    Ok(Projection {
        fleets: facts.fleets.clone(),
        reports: facts.reports.clone(),
        bodies,
        inventories: facts.inventories.clone(),
        research: facts.research.clone(),
        destinations: facts.destinations.clone(),
        constructions: facts.constructions.clone(),
    })
}

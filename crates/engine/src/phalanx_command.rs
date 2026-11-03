//! One paid historical observation. Snapshot coverage is supplied by the ordered loader.
use crate::transition::{Fault, invariant, resources};
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PhalanxScanFacts {
    /// Complete active origin/destination fleet and destination missile membership,
    /// including absence, reloaded at commit under the target location scope.
    pub target: BodyId,
    pub endpoints: BTreeMap<FleetId, PhalanxEndpoints>,
    pub owners: BTreeMap<PlayerId, PhalanxPublicOwner>,
}
pub fn phalanx_enabled(r: &Ruleset) -> bool {
    r.artifact.world.as_ref().and_then(|w| w.phalanx.as_deref()) == Some(PHALANX_PROFILE_V1)
}
pub fn phalanx_report_id(input: InputId) -> ReportId {
    ReportId(derived_id(input, "report:phalanx:0"))
}
pub(crate) fn resolve(
    s: &GameState,
    i: &OrderedInput,
    r: &Ruleset,
    source: BodyId,
    target: BodyId,
) -> Result<ChangeSet, Fault> {
    if !phalanx_enabled(r) {
        return Err(GameError::UnavailableContent.into());
    }
    let Actor::Player(actor) = i.actor else {
        return Err(invariant("scan without player"));
    };
    let w = world_facts(s)?;
    let link = w
        .records
        .presence
        .get(&i.id)
        .ok_or(GameError::PresenceUnavailable)?;
    if link.player != actor || link.at != i.at || link.body != Some(source) {
        return Err(GameError::PresenceUnavailable.into());
    }
    let scan = w
        .phalanx
        .as_ref()
        .filter(|f| f.target == target)
        .ok_or_else(|| invariant("incomplete scan membership"))?;
    if !s.coverage.bodies.contains(&source) || !s.coverage.bodies.contains(&target) {
        return Err(invariant("incomplete scan body lookup"));
    }
    let mut source = s.bodies.get(&source).ok_or(GameError::NotFound)?.clone();
    let target = s.bodies.get(&target).ok_or(GameError::NotFound)?;
    let actor_policy = w
        .records
        .policies
        .get(&actor)
        .ok_or(GameError::PolicyUnavailable)?;
    let target_policy = w
        .records
        .policies
        .get(&target.owner)
        .ok_or(GameError::PolicyUnavailable)?;
    source.checkpoint = settle_production(s, &source, i.at, r)?;
    validate_phalanx_scan(
        actor,
        &source,
        target,
        actor_policy,
        target_policy,
        r.artifact
            .universe
            .as_ref()
            .ok_or(GameError::UnavailableContent)?,
    )?;
    let id = phalanx_report_id(i.id);
    if !w.covered_reports.contains(&id) || w.records.reports.contains_key(&id) {
        return Err(invariant("incomplete scan report absence"));
    }
    let mut rows = Vec::new();
    for fleet in w.records.fleets.values() {
        // Project checks unknown deployment returns before visibility. Map all
        // private fact diagnostics to the same unavailable player response.
        let endpoints = scan
            .endpoints
            .get(&fleet.id)
            .ok_or_else(|| invariant("incomplete scan endpoint identities"))?;
        if let Some(row) =
            project_phalanx_fleet(target.id, &w.records, fleet, endpoints, &scan.owners)
                .map_err(|_| GameError::UnavailableContent)?
        {
            rows.push(row);
        }
    }
    for flight in w.records.missiles.values() {
        if let Some(row) = project_phalanx_missile(target.id, flight, &scan.owners)
            .map_err(|_| GameError::UnavailableContent)?
        {
            rows.push(row);
        }
    }
    let report = PhalanxReport::V1(PhalanxReportV1 {
        id,
        at: i.at,
        source: PhalanxEndpoint::from_body(&source),
        target: PhalanxEndpoint::from_body(target),
        cost: PHALANX_COST_V1,
        rows,
    });
    source.checkpoint.amounts = resources(
        source.checkpoint.amounts,
        Resources {
            deuterium: PHALANX_COST_V1,
            ..Default::default()
        },
        false,
    )?;
    source.revision = source
        .revision
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    let mut c = ChangeSet::new(s, i, r);
    c.bodies.push(source);
    c.affected_viewers.insert(actor);
    let mut records = w.records.clone();
    records.reports.insert(
        id,
        MissionReport {
            id,
            event: i.id,
            kind: "Phalanx".into(),
            at: i.at,
            fleet: None,
            rules_hash: r.hash.clone(),
            payloads: BTreeMap::from([(
                actor,
                serde_json::json!({"kind":"Phalanx", "observation": report}),
            )]),
        },
    );
    c.world = Some(WorldChanges {
        records,
        score_deltas: vec![],
        audits: vec![],
    });
    Ok(c)
}

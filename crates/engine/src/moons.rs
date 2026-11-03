//! Battle-created moons. Lunar operations will follow in a later increment.
use crate::*;
use serde::{Deserialize, Serialize};

pub const MOON_PROFILE: &str = "oi-classic-moon-v1";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MoonGenesis {
    pub body: BodyId,
    pub parent: BodyId,
    pub diameter_km: u32,
    pub created_at: Timestamp,
    pub input: InputId,
    pub profile: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MoonCreationOutcome {
    pub chance_percent: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moon: Option<BodyId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diameter_km: Option<u32>,
}

pub fn validate_moons(s: &GameState) -> Result<(), InvariantError> {
    let mut parents = std::collections::BTreeSet::new();
    for (id, genesis) in &world_facts(s)?.records.moons {
        let moon = s
            .bodies
            .get(id)
            .ok_or_else(|| InvariantError("moon body missing".into()))?;
        let parent = s
            .bodies
            .get(&genesis.parent)
            .ok_or_else(|| InvariantError("moon parent missing".into()))?;
        if genesis.body != *id
            || *id != BodyId(derived_id(genesis.input, "moon:0"))
            || genesis.profile != MOON_PROFILE
            || !parents.insert(genesis.parent)
            || moon.kind != BodyKind::Moon
            || parent.kind != BodyKind::Planet
            || moon.owner != parent.owner
            || moon.coordinates != parent.coordinates
            || moon.fields != 1
            || !(3605..=8944).contains(&genesis.diameter_km)
            || genesis.created_at < 0
            || genesis.created_at > moon.checkpoint.at
        {
            return Err(InvariantError("invalid moon genesis".into()));
        }
    }
    Ok(())
}

/// Debris is already rounded by combat and expressed in resource micro-units.
pub fn moon_creation_chance(debris: Resources) -> Result<u32, GameError> {
    if debris.values().iter().any(|n| *n < 0) {
        return Err(GameError::NumericRange);
    }
    Ok(
        ((i128::from(debris.metal) + i128::from(debris.crystal)) / (100_000 * i128::from(SCALE)))
            .min(20) as u32,
    )
}

pub fn moon_diameter(chance: u32, size_draw: u64) -> Result<u32, GameError> {
    if !(1..=20).contains(&chance) || size_draw > 10 {
        return Err(GameError::NumericRange);
    }
    Ok((1_000_000 * (10 + size_draw + 3 * u64::from(chance))).isqrt() as u32)
}

// Uses the same atomic body, world and audit outputs as combat settlement.
#[allow(clippy::too_many_arguments)]
pub(crate) fn create_moon(
    s: &GameState,
    i: &OrderedInput,
    parent: &Body,
    debris: Resources,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
    audits: &mut Vec<serde_json::Value>,
) -> Result<Option<MoonCreationOutcome>, InvariantError> {
    if !r.artifact.world.as_ref().is_some_and(|w| w.moons) || parent.kind != BodyKind::Planet {
        return Ok(None);
    }
    let facts = world_facts(s)?;
    let at = parent.coordinates;
    if !facts
        .covered_coordinates
        .contains(&(at.galaxy, at.system, at.position))
        || !s.coverage.owned_body_players.contains(&parent.owner)
    {
        return Err(InvariantError("incomplete moon occupancy coverage".into()));
    }
    if s.bodies
        .values()
        .chain(c.bodies.iter())
        .any(|b| b.kind == BodyKind::Moon && b.coordinates == at)
    {
        return Ok(None);
    }
    let chance = moon_creation_chance(debris)?;
    let mut outcome = MoonCreationOutcome {
        chance_percent: chance,
        moon: None,
        diameter_km: None,
    };
    if chance == 0 {
        return Ok(Some(outcome));
    }
    let mut rng = RandomStream::new(&facts.secret, s.universe, s.epoch, i.id, "moon-create")?;
    let draw = rng.uniform_u64(100)?;
    let size_draw = if draw < u64::from(chance) {
        Some(rng.uniform_u64(11)?)
    } else {
        None
    };
    if let Some(size_draw) = size_draw {
        let id = BodyId(derived_id(i.id, "moon:0"));
        if !s.coverage.bodies.contains(&id)
            || s.bodies.contains_key(&id)
            || w.moons.contains_key(&id)
        {
            return Err(InvariantError(
                "duplicate or uncovered moon identity".into(),
            ));
        }
        let diameter_km = moon_diameter(chance, size_draw)?;
        let genesis = MoonGenesis {
            body: id,
            parent: parent.id,
            diameter_km,
            created_at: i.at,
            input: i.id,
            profile: MOON_PROFILE.into(),
        };
        c.bodies.push(Body {
            name: None,
            id,
            universe: s.universe,
            owner: parent.owner,
            kind: BodyKind::Moon,
            coordinates: at,
            fields: 1,
            max_temperature: 0,
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
        w.moons.insert(id, genesis);
        outcome.moon = Some(id);
        outcome.diameter_km = Some(diameter_km);
        let report = ReportId(derived_id(i.id, "moon-created-report"));
        w.reports.insert(report, MissionReport {
            id: report, event: i.id, kind: "MoonCreated".into(), at: i.at, fleet: None,
            rules_hash: r.hash.clone(),
            payloads: [(parent.owner, serde_json::json!({"kind":"MoonCreated", "at":i.at, "body":id, "parent":parent.id, "coordinates":at, "diameter_km":diameter_km}))].into(),
        });
        c.affected_viewers.insert(parent.owner);
    }
    audits.push(serde_json::json!({"kind":"MoonCreation", "profile":MOON_PROFILE, "chance_percent":chance, "draw":draw, "size_draw":size_draw, "cursor":rng.cursor()}));
    Ok(Some(outcome))
}

/// Temporary release boundary: selection and inspection work; mutation does not.
pub fn require_operational_body(body: &Body) -> Result<(), GameError> {
    if body.kind == BodyKind::Moon {
        Err(GameError::UnavailableContent)
    } else {
        Ok(())
    }
}

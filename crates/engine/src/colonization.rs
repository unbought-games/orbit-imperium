//! G06 approved reconstruction. Fields, diameter and temperature are independent
//! integer draws in that order. Failed arrival guards never open a random stream.
use crate::transition::{Fault, invariant, resources};
use crate::*;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const COLONY_PROFILE: &str = "oi-redesign-reconstructed-v1";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ColonizationRules {
    pub profile: String,
    pub enabled: bool,
}
impl ColonizationRules {
    pub fn validate(&self) -> Result<(), RulesError> {
        if self.profile != COLONY_PROFILE {
            return Err(RulesError::Unsupported);
        }
        Ok(())
    }
}

/// Covered occupancy and its public lifecycle revision. Neither research nor
/// private resource mutations alter this observation token.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanetSlot {
    pub coordinates: Coordinates,
    pub occupant: Option<BodyId>,
    pub revision: i64,
}

/// Immutable creation facts; fields and Tmax remain authoritative on Body.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ColonyGenesis {
    pub body: BodyId,
    pub diameter_km: u32,
    pub created_at: Timestamp,
    pub profile: String,
    pub input: InputId,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeneratedColony {
    pub fields: u32,
    pub diameter_km: u32,
    pub max_temperature: i32,
}

const LOW_FIELDS: [u32; 15] = [
    95, 97, 98, 123, 148, 148, 141, 163, 155, 151, 139, 134, 107, 81, 65,
];
const LOW_TEMPERATURE: [i32; 15] = [
    220, 170, 120, 70, 60, 50, 40, 30, 20, 10, 0, -10, -50, -90, -130,
];
pub const COLONY_WEIGHTS: &str = include_str!("../../../rules/content/colony-weights-v1.txt");

pub fn colony_field_weights(position: u32) -> Result<Vec<u64>, InvariantError> {
    if !(1..=15).contains(&position) {
        return Err(InvariantError("invalid colony position".into()));
    }
    COLONY_WEIGHTS
        .lines()
        .nth(position as usize - 1)
        .and_then(|line| line.split_once(':'))
        .ok_or_else(|| InvariantError("missing colony weights".into()))?
        .1
        .split(',')
        .map(|n| {
            n.parse()
                .map_err(|_| InvariantError("invalid colony weight".into()))
        })
        .collect()
}

pub fn colony_fields_for_draw(position: u32, draw: u64) -> Result<u32, InvariantError> {
    let mut remainder = draw;
    for (offset, weight) in colony_field_weights(position)?.into_iter().enumerate() {
        if remainder < weight {
            return Ok(LOW_FIELDS[position as usize - 1] + offset as u32);
        }
        remainder -= weight;
    }
    Err(InvariantError("colony field draw outside support".into()))
}

pub fn colony_diameter_range(fields: u32) -> (u32, u32) {
    let low_squared = u64::from(fields) * 1_000_000;
    let floor = low_squared.isqrt();
    let low = floor + u64::from(floor * floor != low_squared);
    let high = ((u64::from(fields) + 1) * 1_000_000 - 1).isqrt();
    (low as u32, high as u32)
}

pub fn generate_colony(
    position: u32,
    rng: &mut RandomStream,
) -> Result<GeneratedColony, InvariantError> {
    let total = colony_field_weights(position)?.iter().sum();
    let fields = colony_fields_for_draw(position, rng.uniform_u64(total)?)?;
    let (low, high) = colony_diameter_range(fields);
    let diameter_km = low + rng.uniform_u64(u64::from(high - low + 1))? as u32;
    let max_temperature = LOW_TEMPERATURE[position as usize - 1] + rng.uniform_u64(41)? as i32;
    Ok(GeneratedColony {
        fields,
        diameter_km,
        max_temperature,
    })
}

/// Validate persisted creation facts without opening a random stream or writing
/// anything. Temperature minimum and field capacity are derived by consumers.
pub fn validate_colonies(s: &GameState) -> Result<(), InvariantError> {
    for (id, genesis) in &world_facts(s)?.records.colonies {
        let b = s
            .bodies
            .get(id)
            .ok_or_else(|| InvariantError("colony body missing".into()))?;
        let p = b.coordinates.position;
        let weights = colony_field_weights(p)?;
        let low = LOW_FIELDS[p as usize - 1];
        let temperature = LOW_TEMPERATURE[p as usize - 1];
        if genesis.body != *id
            || genesis.profile != COLONY_PROFILE
            || b.kind != BodyKind::Planet
            || genesis.created_at < 0
            || genesis.created_at > b.checkpoint.at
            || b.fields < low
            || b.fields >= low + weights.len() as u32
            || u64::from(genesis.diameter_km).pow(2) / 1_000_000 != u64::from(b.fields)
            || !(temperature..=temperature + 40).contains(&b.max_temperature)
        {
            return Err(InvariantError("invalid colony genesis".into()));
        }
    }
    Ok(())
}

pub fn planet_slot(s: &GameState, coordinates: Coordinates) -> Result<&PlanetSlot, InvariantError> {
    let w = world_facts(s)?;
    if !w.covered_coordinates.contains(&(
        coordinates.galaxy,
        coordinates.system,
        coordinates.position,
    )) {
        return Err(InvariantError("uncovered colony coordinate".into()));
    }
    w.planet_slots
        .iter()
        .find(|slot| slot.coordinates == coordinates)
        .ok_or_else(|| InvariantError("missing colony occupancy facts".into()))
}

pub fn completed_astrophysics(s: &GameState, owner: PlayerId) -> Result<u32, InvariantError> {
    if !s.coverage.research_players.contains(&owner) {
        return Err(InvariantError("uncovered colony research".into()));
    }
    s.research
        .get(&owner)
        .and_then(|r| r.levels.get(&ResearchId::Astrophysics))
        .copied()
        .ok_or_else(|| InvariantError("missing Astrophysics".into()))
}

pub fn owned_planet_count(s: &GameState, owner: PlayerId) -> Result<u64, InvariantError> {
    if !s.coverage.owned_body_players.contains(&owner) {
        return Err(InvariantError("uncovered colony membership".into()));
    }
    Ok(s.bodies
        .values()
        .filter(|b| b.owner == owner && b.kind == BodyKind::Planet)
        .count() as u64)
}

pub(crate) fn colony_arrival(
    s: &GameState,
    i: &OrderedInput,
    f: &mut MissionFleet,
    r: &Ruleset,
    c: &mut ChangeSet,
    w: &mut WorldRecords,
    audits: &mut Vec<serde_json::Value>,
) -> Result<(), Fault> {
    let MissionDestination::EmptyPosition { coordinates, .. } = f.intent.destination else {
        return Err(invariant("colony target"));
    };
    // An activation may disable new launches, but cannot confiscate an accepted flight.
    if r.artifact
        .world
        .as_ref()
        .and_then(|w| w.colonization.as_ref())
        .is_none()
    {
        return Err(invariant("missing committed colony profile"));
    }
    let slot = planet_slot(s, coordinates)?;
    let astro = completed_astrophysics(s, f.owner)?;
    let failure = if slot.occupant.is_some() {
        Some("Occupied")
    } else if !colony_position_unlocked(astro, coordinates.position) {
        Some("PositionLocked")
    } else if !colony_capacity_available(astro, owned_planet_count(s, f.owner)?) {
        Some("ColonyCapacity")
    } else {
        None
    };
    if let Some(reason) = failure {
        crate::missions::mission_report(
            w,
            i,
            f,
            "ColonizationFailed",
            std::collections::BTreeMap::from([(
                f.owner,
                json!({"kind":"ColonizationFailed","reason":reason,"fleet":f.id,"origin":f.intent.origin,"destination_coordinates":coordinates,"at":i.at,"return_at":deadline(i.at, f.terms.duration_ms)?}),
            )]),
        );
        return Ok(());
    }
    let ship = f
        .ships
        .iter_mut()
        .find(|s| s.ship_type == ShipType::ColonyShip && s.count > 0)
        .ok_or_else(|| invariant("committed colony ship missing"))?;
    let mut rng = RandomStream::new(&world_facts(s)?.secret, s.universe, s.epoch, i.id, "colony")?;
    let generated = generate_colony(coordinates.position, &mut rng)?;
    let id = BodyId(derived_id(i.id, "colony:0"));
    if !s.coverage.bodies.contains(&id)
        || s.bodies.contains_key(&id)
        || w.colonies.contains_key(&id)
    {
        return Err(invariant("duplicate colony identity"));
    }
    let amounts = resources(
        f.cargo,
        Resources::from_values([500 * SCALE, 500 * SCALE, 0]),
        true,
    )?;
    ship.count -= 1;
    f.ships.retain(|s| s.count > 0);
    take_asset_lots(
        &mut w.lots,
        f.owner,
        CatalogKey::Ship(ShipType::ColonyShip),
        &AssetLocation::Fleet(f.id),
        1,
        None,
    )?;
    c.bodies.push(Body {
        id,
        universe: s.universe,
        owner: f.owner,
        kind: BodyKind::Planet,
        coordinates,
        fields: generated.fields,
        max_temperature: generated.max_temperature,
        retained_capacity: None,
        checkpoint: ResourceCheckpoint {
            amounts,
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
    w.colonies.insert(
        id,
        ColonyGenesis {
            body: id,
            diameter_km: generated.diameter_km,
            created_at: i.at,
            profile: COLONY_PROFILE.into(),
            input: i.id,
        },
    );
    audits.push(json!({"kind":"ColonyGeneration","input":i.id,"body":id,"profile":COLONY_PROFILE,"domain":"colony","cursor_before":[0,0],"cursor_after":rng.cursor(),"universe":s.universe,"epoch":s.epoch}));
    crate::missions::mission_report(
        w,
        i,
        f,
        "Colonized",
        std::collections::BTreeMap::from([(
            f.owner,
            json!({"kind":"Colonized","body":id,"fleet":f.id,"origin":f.intent.origin,"destination_coordinates":coordinates,"fields":generated.fields,"diameter_km":generated.diameter_km,"max_temperature":generated.max_temperature,"min_temperature":generated.max_temperature-40,"resources":wire_resources(amounts),"at":i.at,"return_at":if f.ships.is_empty(){None}else{Some(deadline(i.at,f.terms.duration_ms)?)}}),
        )]),
    );
    f.cargo = Resources::default();
    if f.ships.is_empty() {
        f.leg = MissionLeg::Colonized;
    }
    Ok(())
}

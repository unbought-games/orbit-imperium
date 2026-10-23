use crate::*;
use orbit_engine::{BodyKind, Building, Coordinates, PublicDestination, Resources};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub use orbit_engine::ViewerSnapshot;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResourceDto {
    pub metal: String,
    pub crystal: String,
    pub deuterium: String,
}
impl From<Resources> for ResourceDto {
    fn from(r: Resources) -> Self {
        Self {
            metal: r.metal.to_string(),
            crystal: r.crystal.to_string(),
            deuterium: r.deuterium.to_string(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BodyDto {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub id: BodyId,
    pub coordinates: Coordinates,
    pub kind: BodyKind,
    pub amounts: ResourceDto,
    pub capacity: ResourceDto,
    pub levels: BTreeMap<Building, u32>,
    pub fields: u32,
    pub fields_used: u32,
    pub fields_reserved: u32,
    pub production: ResourceDto,
    pub energy: EnergyDto,
    pub inventories: Vec<InventoryDto>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipDto {
    pub ship_type: String,
    pub count: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ViewSnapshot {
    pub profile_hash: Hash,
    pub catalog: Vec<orbit_engine::CatalogEntry>,
    pub research: Vec<ResearchDto>,
    pub capabilities: Vec<CapabilityState>,
    pub reports_truncated: bool,
    pub destinations_truncated: bool,
    #[serde(skip)]
    pub universe: UniverseId,
    #[serde(skip)]
    pub epoch: Epoch,
    #[serde(skip)]
    pub player: PlayerId,
    pub viewer_revision: String,
    pub sampled_at: i64,
    pub as_of_ms: i64,
    pub speed: i32,
    pub bodies: Vec<BodyDto>,
    pub destinations: Vec<PublicDestination>,
    pub constructions: Vec<ConstructionDto>,
    pub fleets: Vec<FleetDto>,
    pub reports: Vec<ReportDto>,
}
#[derive(Clone)]
pub struct GameService<S> {
    pub(crate) store: S,
}
impl<S> GameService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }
}
impl<S: GameStore> GameService<S> {
    pub async fn ready(&self) -> Result<(), ServiceError> {
        self.store.ready().await?;
        Ok(())
    }
    pub async fn view(
        &self,
        actor: Actor,
        universe: UniverseId,
    ) -> Result<ViewSnapshot, ServiceError> {
        let facts = self.store.load_view(actor, universe).await?;
        Self::project_view(facts)
    }
    pub(crate) fn project_view(facts: ViewerSnapshot) -> Result<ViewSnapshot, ServiceError> {
        let universe = facts.universe;
        let mut projection = orbit_engine::project(&facts, facts.at, &facts.rules)
            .map_err(|_| ServiceError::InvariantFailure)?;
        let reports_truncated = projection.reports.len() > 100;
        let destinations_truncated = projection.destinations.len() > 100;
        projection.reports.truncate(100);
        projection.destinations.truncate(100);
        Ok(ViewSnapshot {
            reports_truncated,
            destinations_truncated,
            profile_hash: facts.rules.hash.clone(),
            catalog: facts.rules.artifact.catalog.clone(),
            research: facts
                .research
                .levels
                .iter()
                .map(|(research, level)| ResearchDto {
                    research: *research,
                    level: *level,
                })
                .collect(),
            capabilities: [
                ("Construction", true),
                ("Transport", true),
                ("Research", false),
                ("Manufacturing", false),
            ]
            .into_iter()
            .map(|(capability, enabled)| CapabilityState {
                capability: capability.to_owned(),
                enabled,
                reason: if enabled {
                    "Available"
                } else {
                    "UnavailableContent"
                }
                .to_owned(),
            })
            .collect(),
            universe,
            epoch: facts.epoch,
            player: facts.player,
            viewer_revision: facts.revision.to_string(),
            sampled_at: facts.at,
            as_of_ms: facts.at,
            speed: facts.rules.speed,
            bodies: projection
                .bodies
                .iter()
                .map(|b| {
                    let energy = orbit_engine::energy_stats(b, &facts.rules)
                        .map_err(|_| ServiceError::InvariantFailure)?;
                    let production = orbit_engine::production_rates(b, &facts.rules)
                        .map_err(|_| ServiceError::InvariantFailure)?;
                    let fields_used = b
                        .levels
                        .values()
                        .try_fold(0u32, |sum, n| sum.checked_add(*n))
                        .ok_or(ServiceError::InvariantFailure)?;
                    let fields_reserved = u32::try_from(
                        projection
                            .constructions
                            .iter()
                            .filter(|c| c.body == b.id)
                            .count(),
                    )
                    .map_err(|_| ServiceError::InvariantFailure)?;
                    Ok(BodyDto {
                        fields_used,
                        fields_reserved,
                        production: production.into(),
                        energy: EnergyDto {
                            supply: energy.supply.to_string(),
                            demand: energy.demand.to_string(),
                            utilization: energy.utilization.to_string(),
                        },
                        id: b.id,
                        coordinates: b.coordinates,
                        kind: b.kind,
                        name: b.name.clone(),
                        amounts: b.checkpoint.amounts.into(),
                        capacity: orbit_engine::body_storage_capacity(b, &facts.rules)
                            .map_err(|_| ServiceError::InvariantFailure)?
                            .into(),
                        levels: b.levels.clone(),
                        fields: b.fields,
                        inventories: projection
                            .inventories
                            .iter()
                            .filter(|s| s.body == b.id)
                            .map(|s| InventoryDto {
                                item: s.item,
                                count: s.count.to_string(),
                            })
                            .collect(),
                    })
                })
                .collect::<Result<Vec<_>, ServiceError>>()?,
            fleets: projection
                .fleets
                .into_iter()
                .map(|f| FleetDto {
                    id: f.id.to_string(),
                    origin: f.origin,
                    target: f.target,
                    status: format!("{:?}", f.status),
                    due_at: f.due_at,
                    payload: f.payload.into(),
                    paid_fuel: f.paid_fuel.to_string(),
                    ships: f
                        .ships
                        .into_iter()
                        .map(|s| ShipDto {
                            ship_type: format!("{:?}", s.ship_type),
                            count: s.count.to_string(),
                        })
                        .collect(),
                })
                .collect(),
            reports: projection
                .reports
                .into_iter()
                .map(|r| ReportDto {
                    id: r.id.to_string(),
                    fleet: r.fleet.to_string(),
                    kind: format!("{:?}", r.kind),
                    at: r.at,
                    origin: r.origin,
                    target: r.target,
                    cargo: r.cargo.into(),
                })
                .collect(),
            destinations: projection.destinations,
            constructions: projection
                .constructions
                .into_iter()
                .map(|c| ConstructionDto {
                    id: c.id.to_string(),
                    body: c.body,
                    building: c.building,
                    target_level: c.target_level,
                    due_at: c.due_at,
                    paid: c.paid.into(),
                })
                .collect(),
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConstructionDto {
    pub id: String,
    pub body: BodyId,
    pub building: Building,
    pub target_level: u32,
    pub due_at: i64,
    pub paid: ResourceDto,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QuoteDto {
    pub fuel: String,
    pub capacity: String,
    pub maximum_payload: String,
    pub profile_hash: Hash,
    pub terms_hash: Hash,
    pub cost: ResourceDto,
    pub duration: i64,
    pub target_level: Option<u32>,
}
impl From<Quote> for QuoteDto {
    fn from(q: Quote) -> Self {
        Self {
            fuel: q.fuel.to_string(),
            capacity: q.capacity.to_string(),
            maximum_payload: q.maximum_payload.to_string(),
            profile_hash: q.profile_hash,
            terms_hash: q.terms_hash,
            cost: q.cost.into(),
            duration: q.duration,
            target_level: q.target_level,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FleetDto {
    pub id: String,
    pub origin: BodyId,
    pub target: BodyId,
    pub status: String,
    pub due_at: i64,
    pub payload: ResourceDto,
    pub paid_fuel: String,
    pub ships: Vec<ShipDto>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReportDto {
    pub id: String,
    pub fleet: String,
    pub kind: String,
    pub at: i64,
    pub origin: BodyId,
    pub target: BodyId,
    pub cargo: ResourceDto,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EnergyDto {
    pub supply: String,
    pub demand: String,
    pub utilization: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InventoryDto {
    pub item: orbit_engine::ManufacturedItem,
    pub count: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResearchDto {
    pub research: orbit_engine::ResearchId,
    pub level: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CapabilityState {
    pub capability: String,
    pub enabled: bool,
    pub reason: String,
}

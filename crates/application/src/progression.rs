use crate::*;
use orbit_engine::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CommandDto3 {
    Legacy(CommandDto),
    Progression(Command),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandEnvelopeV3 {
    pub protocol: i32,
    pub binding: Binding,
    pub command_id: CommandId,
    pub command: CommandDto3,
}
impl CommandEnvelopeV3 {
    pub fn domain(&self) -> Result<CommandEnvelope, ServiceError> {
        if self.protocol != 3 {
            return Err(ServiceError::UnsupportedProtocol);
        }
        let command = match &self.command {
            CommandDto3::Legacy(c) => {
                CommandEnvelope::try_from(CommandEnvelopeDto {
                    protocol: 3,
                    epoch: self.binding.epoch,
                    command_id: self.command_id,
                    command: c.clone(),
                })?
                .command
            }
            CommandDto3::Progression(c) => {
                if matches!(c, Command::LaunchTransport { .. } | Command::World { .. }) {
                    return Err(ServiceError::Malformed);
                }
                c.clone()
            }
        };
        let expected = match &command {
            Command::StartUpgrade {
                expected_terms_hash,
                ..
            }
            | Command::StartDemolition {
                expected_terms_hash,
                ..
            }
            | Command::StartResearch {
                expected_terms_hash,
                ..
            }
            | Command::StartManufacture {
                expected_terms_hash,
                ..
            }
            | Command::LaunchTransport {
                expected_terms_hash,
                ..
            } => Some(expected_terms_hash),
            _ => None,
        };
        if expected.is_some_and(|h| {
            h.0.len() != 64
                || !h
                    .0
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        }) {
            return Err(ServiceError::Malformed);
        }
        if let Command::SetProduction { settings, .. } = &command
            && settings
                .producers()
                .into_iter()
                .chain([settings.fusion_reactor, settings.solar_satellite])
                .any(|v| v > 100 || !v.is_multiple_of(10))
        {
            return Err(ServiceError::Malformed);
        }
        Ok(CommandEnvelope {
            protocol: 3,
            epoch: self.binding.epoch,
            command_id: self.command_id,
            command,
        })
    }
    pub fn intent_hash(&self) -> Result<Hash, ServiceError> {
        Ok(hash(
            &serde_json::json!({"protocol":3,"binding":self.binding,"command_id":self.command_id,"command":canonical_command(&self.domain()?.command)}),
        ))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum QuoteRequestDto3 {
    Legacy(QuoteRequestDto),
    Progression(QuoteRequest),
}
impl QuoteRequestDto3 {
    pub fn domain(self) -> Result<QuoteRequest, ServiceError> {
        match self {
            Self::Legacy(q) => q.try_into(),
            Self::Progression(q) => {
                if matches!(q, QuoteRequest::Transport { .. }) {
                    return Err(ServiceError::Malformed);
                }
                Ok(q)
            }
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuoteQuery3 {
    pub context: QueryContext,
    pub request: QuoteRequestDto3,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QuoteTerms3 {
    pub material: ProgressionMaterial,
    pub terms_hash: Hash,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundQuote3 {
    pub protocol: i32,
    pub binding: Binding,
    pub request_id: uuid::Uuid,
    pub viewer_revision: String,
    pub sampled_at: i64,
    pub as_of_ms: i64,
    pub request: QuoteRequestDto3,
    pub terms: QuoteTerms3,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundProgressionOptions {
    pub protocol: i32,
    pub binding: Binding,
    pub request_id: uuid::Uuid,
    pub viewer_revision: String,
    pub sampled_at: i64,
    pub as_of_ms: i64,
    #[serde(flatten)]
    pub inspection: ProgressionInspection,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BodyV3 {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colony: Option<ColonyDto>,
    pub id: BodyId,
    pub coordinates: Coordinates,
    pub kind: BodyKind,
    pub amounts: ResourceDto,
    pub capacity: ResourceDto,
    pub levels: BTreeMap<Building, u32>,
    pub fields: u32,
    pub fields_used: u32,
    pub fields_reserved: u32,
    pub energy: EnergyDto,
    pub inventories: Vec<InventoryDto>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ColonyDto {
    pub diameter_km: u32,
    pub min_temperature: i32,
    pub max_temperature: i32,
    pub created_at: i64,
    pub profile: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SignedRate {
    pub sign: String,
    pub magnitude: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SatelliteProductionDto {
    pub unit_energy: String,
    pub energy_supply: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProductionDto {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub solar_satellite: Option<SatelliteProductionDto>,
    pub body: BodyId,
    pub settings: ProductionSettings,
    pub settings_revision: String,
    pub editable: Vec<String>,
    pub gross_per_hour: ResourceDto,
    pub fuel_deuterium_per_hour: String,
    pub net_deuterium_per_hour: SignedRate,
    pub energy_supply: String,
    pub energy_demand: String,
    pub utilization: String,
    pub fuel_utilization: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResearchOperationDto {
    pub id: OperationId,
    pub host: BodyId,
    pub research: ResearchId,
    pub source_level: u32,
    pub target_level: u32,
    pub paid: ResourceDto,
    pub started_at: i64,
    pub due_at: i64,
    pub labs: Vec<LabTerm>,
    pub effective_lab: String,
    pub can_cancel: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ManufacturingBatchDto {
    pub id: OperationId,
    pub body: BodyId,
    pub item: ManufacturedItem,
    pub quantity: String,
    pub completed_prefix: String,
    pub remaining: String,
    pub paid: ResourceDto,
    pub accepted_at: i64,
    pub first_start_at: i64,
    pub next_due_at: i64,
    pub final_due_at: i64,
    pub unit_duration_ms: i64,
    pub state: String,
    pub can_cancel: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProgressionLimits {
    pub max_active_manufacturing_entries: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProgressionView {
    pub production: Vec<ProductionDto>,
    pub research_operation: Option<ResearchOperationDto>,
    pub manufacturing: Vec<ManufacturingBatchDto>,
    pub limits: ProgressionLimits,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundView3 {
    pub protocol: i32,
    pub binding: Binding,
    pub request_id: uuid::Uuid,
    pub viewer_revision: String,
    pub sampled_at: i64,
    pub as_of_ms: i64,
    pub profile_hash: Hash,
    pub speed: i32,
    pub catalog: Vec<crate::CatalogEntryView>,
    pub research: Vec<ResearchDto>,
    pub capabilities: Vec<CapabilityState>,
    pub bodies: Vec<BodyV3>,
    pub constructions: Vec<ConstructionDto>,
    pub fleets: Vec<FleetDto>,
    pub reports: Vec<ReportDto>,
    pub destinations: Vec<PublicDestination>,
    pub reports_truncated: bool,
    pub destinations_truncated: bool,
    pub progression: ProgressionView,
}
impl<S: GameStore> GameService<S> {
    pub async fn require_protocol(
        &self,
        account: AccountId,
        u: UniverseId,
        protocol: i32,
    ) -> Result<(), ServiceError> {
        self.store.current_binding(account, u).await?;
        if self.store.load_rules(u).await?.protocol() != protocol {
            return Err(ServiceError::UnsupportedProtocol);
        }
        Ok(())
    }
    pub async fn progression_options(
        &self,
        p: Principal,
        c: QueryContext,
        request: QuoteRequestDto3,
    ) -> Result<ReadSnapshot<BoundProgressionOptions>, ServiceError> {
        Self::principal(p, c.binding)?;
        let q = request.domain()?;
        let ReadSnapshot {
            facts: (facts, revision),
            progress,
        } = self.store.bound_quote(c.binding, &q).await?;
        if !facts.rules.progression() {
            return Err(ServiceError::UnsupportedProtocol);
        }
        let inspection = inspect_progression(
            &facts.state,
            Actor::Player(c.binding.player),
            &q,
            facts.at,
            &facts.rules,
        )
        .map_err(|_| ServiceError::InvariantFailure)?;
        if inspection
            .blockers
            .iter()
            .any(|x| matches!(x.code, GameError::NotFound | GameError::NotOwned))
        {
            return Err(ServiceError::NotFound);
        }
        Ok(ReadSnapshot {
            progress,
            facts: BoundProgressionOptions {
                protocol: facts.rules.protocol(),
                binding: c.binding,
                request_id: c.request_id,
                viewer_revision: revision.to_string(),
                sampled_at: facts.at,
                as_of_ms: facts.at,
                inspection,
            },
        })
    }
    pub async fn progression_quote(
        &self,
        p: Principal,
        c: QueryContext,
        request: QuoteRequestDto3,
    ) -> Result<ReadSnapshot<BoundQuote3>, ServiceError> {
        let ReadSnapshot { facts: x, progress } = self.progression_options(p, c, request).await?;
        if let Some(b) = x.inspection.blockers.first() {
            return Err(ServiceError::GameRejected(b.code.clone()));
        }
        Ok(ReadSnapshot {
            progress,
            facts: BoundQuote3 {
                protocol: x.protocol,
                binding: x.binding,
                request_id: x.request_id,
                viewer_revision: x.viewer_revision,
                sampled_at: x.sampled_at,
                as_of_ms: x.as_of_ms,
                request: QuoteRequestDto3::Progression(x.inspection.request),
                terms: QuoteTerms3 {
                    material: x.inspection.terms.ok_or(ServiceError::InvariantFailure)?,
                    terms_hash: x
                        .inspection
                        .terms_hash
                        .ok_or(ServiceError::InvariantFailure)?,
                },
            },
        })
    }
    pub async fn progression_submit(
        &self,
        p: Principal,
        e: CommandEnvelopeV3,
    ) -> Result<BoundReceipt, ServiceError> {
        Self::principal(p, e.binding)?;
        e.domain()?;
        Ok(self.store.bound_admit3(e).await?)
    }
    pub async fn progression_view(
        &self,
        p: Principal,
        c: QueryContext,
    ) -> Result<ReadSnapshot<BoundView3>, ServiceError> {
        Self::principal(p, c.binding)?;
        let facts = self.store.bound_view(c.binding).await?;
        if !facts.rules.progression() {
            return Err(ServiceError::UnsupportedProtocol);
        }
        facts.try_map(|facts| progression_projection(&facts, c))
    }
}

pub(crate) fn progression_projection(
    facts: &ViewerSnapshot,
    c: QueryContext,
) -> Result<BoundView3, ServiceError> {
    let s = facts
        .progression
        .as_ref()
        .or(facts.world.as_ref())
        .ok_or(ServiceError::InvariantFailure)?;
    let projection = orbit_engine::project(facts, facts.at, &facts.rules)
        .map_err(|_| ServiceError::InvariantFailure)?;
    let mut bodies = vec![];
    let mut production = vec![];
    for b in &projection.bodies {
        let settings = &s.production_settings[&b.id];
        let satellites = solar_satellite_count(s, b, &facts.rules)
            .map_err(|_| ServiceError::InvariantFailure)?;
        let energy = energy_with_settings(b, &settings.settings, satellites, &facts.rules)
            .map_err(|_| ServiceError::InvariantFailure)?;
        let rate = production_rates_with_settings(b, &settings.settings, satellites, &facts.rules)
            .map_err(|_| ServiceError::InvariantFailure)?;
        bodies.push(BodyV3 {
            colony: None,
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
            fields_used: b
                .levels
                .values()
                .try_fold(0u32, |a, v| a.checked_add(*v))
                .ok_or(ServiceError::InvariantFailure)?,
            fields_reserved: reserved_fields(s, b.id)
                .map_err(|_| ServiceError::InvariantFailure)?,
            energy: EnergyDto {
                supply: energy.supply.to_string(),
                demand: energy.demand.to_string(),
                utilization: energy.utilization.to_string(),
            },
            inventories: projection
                .inventories
                .iter()
                .filter(|x| x.body == b.id)
                .map(|x| InventoryDto {
                    item: x.item,
                    count: x.count.to_string(),
                })
                .collect(),
        });
        let solar_satellite = solar_satellite_rule(&facts.rules)
            .map(|_| {
                Ok::<_, ServiceError>(SatelliteProductionDto {
                    unit_energy: solar_satellite_unit_energy(b, &facts.rules)
                        .map_err(|_| ServiceError::InvariantFailure)?
                        .to_string(),
                    energy_supply: solar_satellite_energy(
                        b,
                        &settings.settings,
                        satellites,
                        &facts.rules,
                    )
                    .map_err(|_| ServiceError::InvariantFailure)?
                    .to_string(),
                })
            })
            .transpose()?;
        let satellite_editable = solar_satellite.is_some();
        production.push(ProductionDto {
            solar_satellite,
            body: b.id,
            settings: settings.settings.clone(),
            settings_revision: settings.revision.to_string(),
            editable: [
                "metal_mine",
                "crystal_mine",
                "deuterium_synthesizer",
                "solar_plant",
            ]
            .into_iter()
            .chain(satellite_editable.then_some("solar_satellite"))
            .map(str::to_owned)
            .collect(),
            gross_per_hour: rate.into(),
            fuel_deuterium_per_hour: "0".into(),
            net_deuterium_per_hour: SignedRate {
                sign: "Nonnegative".into(),
                magnitude: rate.deuterium.to_string(),
            },
            energy_supply: energy.supply.to_string(),
            energy_demand: energy.demand.to_string(),
            utilization: energy.utilization.to_string(),
            fuel_utilization: "0".into(),
        });
    }
    let research_operation = s
        .research_operations
        .values()
        .find(|x| x.status == ResearchStatus::Active)
        .map(|x| ResearchOperationDto {
            id: x.id,
            host: x.host,
            research: x.research,
            source_level: x.source_level,
            target_level: x.target_level,
            paid: x.commitment.paid.into(),
            started_at: x.commitment.started_at,
            due_at: x.commitment.due_at,
            labs: x
                .labs
                .iter()
                .map(|l| LabTerm {
                    body: l.body,
                    level: l.completed_level,
                })
                .collect(),
            effective_lab: x
                .labs
                .iter()
                .map(|l| i64::from(l.completed_level))
                .sum::<i64>()
                .to_string(),
            can_cancel: facts.at < x.commitment.due_at,
        });
    let mut batches: Vec<_> = s
        .manufacturing_batches
        .values()
        .filter(|x| x.status == ManufacturingStatus::Active)
        .collect();
    batches.sort_by_key(|x| (x.body, x.queue_sequence));
    let manufacturing = batches
        .into_iter()
        .map(|x| ManufacturingBatchDto {
            id: x.id,
            body: x.body,
            item: x.item,
            quantity: x.quantity.to_string(),
            completed_prefix: x.completed_prefix.to_string(),
            remaining: (x.quantity - x.completed_prefix).to_string(),
            paid: x.commitment.paid.into(),
            accepted_at: x.commitment.accepted_at,
            first_start_at: x.first_start_at,
            next_due_at: x.next_due_at,
            final_due_at: x.final_due_at,
            unit_duration_ms: x.unit_duration_ms,
            state: if facts.at < x.first_start_at {
                "PaidQueued"
            } else {
                "Producing"
            }
            .into(),
            can_cancel: false,
        })
        .collect();
    Ok(BoundView3 {
        protocol: facts.rules.protocol(),
        binding: c.binding,
        request_id: c.request_id,
        viewer_revision: facts.revision.to_string(),
        sampled_at: facts.at,
        as_of_ms: facts.at,
        profile_hash: facts.rules.hash.clone(),
        speed: facts.rules.speed,
        catalog: crate::catalog_view(&facts.rules)?,
        research: projection
            .research
            .levels
            .into_iter()
            .map(|(research, level)| ResearchDto { research, level })
            .collect(),
        capabilities: [
            ("Construction", true),
            ("Production", true),
            ("Demolition", true),
            ("Research", true),
            ("Manufacturing", true),
            ("Transport", false),
        ]
        .into_iter()
        .map(|(capability, enabled)| CapabilityState {
            capability: capability.into(),
            enabled,
            reason: if enabled {
                "Available"
            } else {
                "UnavailableContent"
            }
            .into(),
        })
        .collect(),
        bodies,
        constructions: projection
            .constructions
            .into_iter()
            .map(|x| ConstructionDto {
                id: x.id.to_string(),
                body: x.body,
                building: x.building,
                target_level: x.target_level,
                due_at: x.due_at,
                paid: x.paid.into(),
            })
            .collect(),
        fleets: vec![],
        reports: vec![],
        destinations: vec![],
        reports_truncated: false,
        destinations_truncated: false,
        progression: ProgressionView {
            production,
            research_operation,
            manufacturing,
            limits: ProgressionLimits {
                max_active_manufacturing_entries: 256,
            },
        },
    })
}

#[cfg(test)]
mod contract_tests {
    use super::*;
    #[test]
    fn progression_transport_cannot_fall_back_to_numeric_legacy_wire() {
        let request = serde_json::json!({"type":"Transport","origin":uuid::Uuid::nil(),"target":uuid::Uuid::nil(),"ships":[],"cargo":{"metal":0,"crystal":0,"deuterium":0},"speed_percent":100});
        let dto: QuoteRequestDto3 = serde_json::from_value(request).unwrap();
        assert!(matches!(dto.domain(), Err(ServiceError::Malformed)));
    }
    #[test]
    fn version_three_requires_exact_complete_settings_and_revision_strings() {
        let command = serde_json::json!({"type":"SetProduction","body":uuid::Uuid::nil(),"settings":{"metal_mine":50,"crystal_mine":100,"deuterium_synthesizer":100,"solar_plant":100,"fusion_reactor":100,"solar_satellite":100},"expected_settings_revision":"0"});
        assert!(serde_json::from_value::<CommandDto3>(command.clone()).is_ok());
        let mut missing = command.clone();
        missing["settings"]
            .as_object_mut()
            .unwrap()
            .remove("fusion_reactor");
        assert!(serde_json::from_value::<CommandDto3>(missing).is_err());
        let mut numeric = command;
        numeric["expected_settings_revision"] = serde_json::json!(0);
        assert!(serde_json::from_value::<CommandDto3>(numeric).is_err());
    }
}

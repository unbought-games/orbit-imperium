//! Authenticated private site projections; no production issuance or enrollment.
use crate::*;
use orbit_engine::*;
use serde::{Deserialize, Serialize};

/// Decimal resource/revision wire projection, without source facts or NPC secrets.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MissionSiteView {
    pub destination: SiteDestination,
    pub definition_id: String,
    pub definition_version: u32,
    pub remaining_stock: ResourceDto,
    pub retired: bool,
}
impl From<SiteView> for MissionSiteView {
    fn from(view: SiteView) -> Self {
        Self {
            destination: view.destination,
            definition_id: view.definition_id,
            definition_version: view.definition_version,
            remaining_stock: view.remaining_stock.into(),
            retired: view.retired,
        }
    }
}
impl<S: GameStore> GameService<S> {
    /// Only disclosed, active personal sites are actionable. Retained source
    /// histories are not leaked into public galaxy/body/report projections.
    pub async fn mission_sites(
        &self,
        principal: Principal,
        context: QueryContext,
    ) -> Result<ReadSnapshot<BoundWorld<Vec<MissionSiteView>>>, ServiceError> {
        Self::principal(principal, context.binding)?;
        self.store.bot_observe(context.binding).await?;
        let ReadSnapshot {
            facts: (facts, revision),
            progress,
        } = self.store.bound_world(context.binding).await?;
        let world = world_facts(&facts.state).map_err(|_| ServiceError::InvariantFailure)?;
        let data = world
            .records
            .mission_sites
            .values()
            .filter(|s| {
                s.creation.issuance.beneficiary == principal.player && s.disclosed() && !s.retired()
            })
            .map(|s| {
                s.view(
                    context.binding.universe,
                    context.binding.epoch,
                    principal.player,
                )
                .map(MissionSiteView::from)
                .map_err(site_error)
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ReadSnapshot {
            progress,
            facts: BoundWorld {
                protocol: 4,
                binding: context.binding,
                request_id: context.request_id,
                viewer_revision: revision.to_string(),
                sampled_at: facts.at,
                as_of_ms: facts.at,
                data,
            },
        })
    }
    /// Revalidate stable ID/revision privately. No accepted fleet terms are made.
    pub async fn resolve_mission_site(
        &self,
        principal: Principal,
        context: QueryContext,
        selection: SiteSelection,
    ) -> Result<ReadSnapshot<BoundWorld<MissionSiteView>>, ServiceError> {
        Self::principal(principal, context.binding)?;
        self.store.bot_observe(context.binding).await?;
        let ReadSnapshot {
            facts: (facts, revision),
            progress,
        } = self.store.bound_world(context.binding).await?;
        let site = world_facts(&facts.state)
            .map_err(|_| ServiceError::InvariantFailure)?
            .records
            .mission_sites
            .get(&selection.id)
            .ok_or(ServiceError::NotFound)?;
        site.resolve(
            context.binding.universe,
            context.binding.epoch,
            principal.player,
            selection,
        )
        .map_err(site_error)?;
        let data = site
            .view(
                context.binding.universe,
                context.binding.epoch,
                principal.player,
            )
            .map_err(site_error)?
            .into();
        Ok(ReadSnapshot {
            progress,
            facts: BoundWorld {
                protocol: 4,
                binding: context.binding,
                request_id: context.request_id,
                viewer_revision: revision.to_string(),
                sampled_at: facts.at,
                as_of_ms: facts.at,
                data,
            },
        })
    }
}
pub(crate) fn site_error(error: SiteError) -> ServiceError {
    match error {
        SiteError::NotFound => ServiceError::NotFound,
        SiteError::StaleRevision | SiteError::Retired => ServiceError::Conflict,
        _ => ServiceError::InvariantFailure,
    }
}

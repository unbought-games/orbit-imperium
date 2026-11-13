use crate::*;
use orbit_engine::ReportId;
use serde::{Deserialize, Serialize};

/// IDs identify the list already displayed by the caller, never a history scan.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportsReadRequest {
    pub context: QueryContext,
    pub reports: Vec<ReportId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReportsReadResult {
    pub binding: Binding,
    pub request_id: uuid::Uuid,
    pub viewer_revision: String,
    pub items: Vec<ReportHeader4>,
}

impl ReportsReadRequest {
    pub fn valid_size(&self) -> bool {
        (1..=10_000).contains(&self.reports.len())
    }
}

impl<S: GameStore> GameService<S> {
    pub async fn mark_reports_read(
        &self,
        principal: Principal,
        request: ReportsReadRequest,
    ) -> Result<ReportsReadResult, ServiceError> {
        Self::principal(principal, request.context.binding)?;
        if !request.valid_size() {
            return Err(ServiceError::Malformed);
        }
        self.store
            .mark_reports_read(request)
            .await
            .map_err(Into::into)
    }
}

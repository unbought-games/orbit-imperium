//! The runtime chooses CPU scheduling; the application owns transition lifecycle.
use crate::{ClaimSnapshot, ServiceError};
use orbit_engine::{OrderedInput, TransitionResult};

pub trait EngineExecutor: Send + Sync {
    fn execute(
        &self,
        snapshot: ClaimSnapshot,
        input: OrderedInput,
    ) -> impl Future<Output = Result<TransitionResult, ServiceError>> + Send;
}

/// Direct execution for embedded application callers. The server uses its bounded CPU executor.
#[derive(Clone, Copy)]
pub struct InlineEngine;
impl EngineExecutor for InlineEngine {
    async fn execute(
        &self,
        snapshot: ClaimSnapshot,
        input: OrderedInput,
    ) -> Result<TransitionResult, ServiceError> {
        Ok(orbit_engine::transition(
            &snapshot.state,
            &input,
            &snapshot.rules,
        ))
    }
}

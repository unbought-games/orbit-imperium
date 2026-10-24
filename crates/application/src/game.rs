use crate::*;
use orbit_engine::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandEnvelope {
    pub command_id: CommandId,
    pub epoch: Epoch,
    pub protocol: i32,
    pub command: Command,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum ReceiptStatus {
    Pending,
    Committed {
        result_ids: Vec<String>,
        minimum_viewer_revision: String,
    },
    Rejected {
        code: GameError,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    pub command_id: CommandId,
    pub epoch: Epoch,
    pub admitted_at: i64,
    pub executed_at: Option<i64>,
    #[serde(flatten)]
    pub status: ReceiptStatus,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Claim {
    pub input: OrderedInput,
    pub owner: WorkerId,
    pub fence: i64,
    pub token: uuid::Uuid,
    pub prior_cursor: i64,
    pub lease_until: i64,
}
#[derive(Clone, Debug)]
pub struct ClaimSnapshot {
    pub state: GameState,
    pub rules: Ruleset,
}
#[derive(Clone, Debug)]
pub struct QuoteSnapshot {
    pub state: GameState,
    pub at: i64,
    pub rules: Ruleset,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CommitOutcome {
    Committed {
        input_id: InputId,
        receipt: Option<Receipt>,
    },
    Conflict,
    StaleClaim,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StepOutcome {
    Idle,
    Committed { input_id: InputId },
    Retry,
    Blocked { input_id: InputId, reason: String },
}
impl<S: GameStore> GameService<S> {
    pub async fn submit(
        &self,
        actor: Actor,
        u: UniverseId,
        envelope: CommandEnvelope,
    ) -> Result<Receipt, ServiceError> {
        if !matches!(actor, Actor::Player(_)) {
            return Err(ServiceError::Forbidden);
        }
        if envelope.protocol != 2 {
            return Err(ServiceError::Malformed);
        }
        Ok(self.store.admit(actor, u, envelope).await?)
    }
    pub async fn receipt(
        &self,
        actor: Actor,
        u: UniverseId,
        id: CommandId,
    ) -> Result<Receipt, ServiceError> {
        Ok(self.store.receipt(actor, u, id).await?)
    }
    pub async fn quote(
        &self,
        actor: Actor,
        u: UniverseId,
        request: QuoteRequest,
    ) -> Result<Quote, ServiceError> {
        let snapshot = self.store.load_quote(actor, u, &request).await?;
        orbit_engine::quote(
            &snapshot.state,
            actor,
            &request,
            snapshot.at,
            &snapshot.rules,
        )
        .map_err(|e| match e {
            GameError::NotOwned | GameError::NotFound => ServiceError::NotFound,
            _ => ServiceError::Malformed,
        })
    }
    pub async fn step(&self, u: UniverseId, worker: WorkerId) -> Result<StepOutcome, ServiceError> {
        let Some(claim) = self.store.claim_next(u, worker).await? else {
            return Ok(StepOutcome::Idle);
        };
        self.resolve_claim(claim).await
    }
    pub async fn resolve_claim(&self, claim: Claim) -> Result<StepOutcome, ServiceError> {
        self.resolve_claim_with_executor(claim, &InlineEngine).await
    }
    pub async fn resolve_claim_with_executor<E: EngineExecutor>(
        &self,
        claim: Claim,
        executor: &E,
    ) -> Result<StepOutcome, ServiceError> {
        let resolution = async {
            let outcome =
                load_and_execute(self.store.load_claim(&claim), claim.input.clone(), executor)
                    .await?;
            // Serial resolution leaves lease cleanup to its caller. Preserve its error contract:
            // a stale commit outcome retries; a stale store error propagates.
            match self.store.commit_claim(&claim, outcome).await {
                Ok(CommitOutcome::Committed { input_id, .. }) => {
                    Ok(StepOutcome::Committed { input_id })
                }
                Ok(CommitOutcome::Conflict | CommitOutcome::StaleClaim) => Ok(StepOutcome::Retry),
                Err(error) => Err(ResolutionFailure::persisted(
                    error,
                    "invalid commit facts or schema",
                )),
            }
        }
        .await;
        finish_resolution(claim.input.id, resolution, |error| async move {
            self.store.fail_claim(&claim, &error).await
        })
        .await
    }
}

impl<S: ScopedGameStore> GameService<S> {
    pub async fn step_scoped<E: EngineExecutor>(
        &self,
        u: UniverseId,
        worker: WorkerId,
        executor: &E,
    ) -> Result<StepOutcome, ServiceError> {
        let Some(claim) = self.store.claim_scoped(u, worker).await? else {
            return Ok(StepOutcome::Idle);
        };
        self.resolve_scoped_claim(claim, executor).await
    }
    pub async fn resolve_scoped_claim<E: EngineExecutor>(
        &self,
        claim: ScopedClaim,
        executor: &E,
    ) -> Result<StepOutcome, ServiceError> {
        let resolution = async {
            let outcome = load_and_execute(
                self.store.load_scoped(&claim),
                claim.input.clone(),
                executor,
            )
            .await?;
            match self.store.commit_scoped(&claim, outcome).await {
                Ok(CommitOutcome::Committed { input_id, .. }) => {
                    Ok(StepOutcome::Committed { input_id })
                }
                Ok(CommitOutcome::StaleClaim) | Err(StoreError::StaleClaim) => {
                    Ok(StepOutcome::Retry)
                }
                // Scoped conflicts retain ownership until explicitly released.
                // Release failures are storage errors, not reasons to block the input.
                Ok(CommitOutcome::Conflict) => match self.store.release_scoped(&claim).await {
                    Ok(()) | Err(StoreError::StaleClaim) => Ok(StepOutcome::Retry),
                    Err(error) => Err(ResolutionFailure::Error(error.into())),
                },
                Err(error) => Err(ResolutionFailure::persisted(
                    error,
                    "invalid commit facts or schema",
                )),
            }
        }
        .await;
        finish_resolution(claim.input.id, resolution, |error| async move {
            self.store.fail_scoped(&claim, &error).await
        })
        .await
    }
}

// This policy describes a single resolution attempt, never durable scheduler state.
enum ResolutionFailure {
    Retry,
    Block(InvariantError),
    Error(ServiceError),
}
impl ResolutionFailure {
    fn persisted(error: StoreError, reason: &str) -> Self {
        match error {
            StoreError::CorruptData | StoreError::IncompatibleSchema => {
                Self::Block(InvariantError(reason.to_owned()))
            }
            error => Self::Error(error.into()),
        }
    }
}

async fn load_and_execute<E: EngineExecutor>(
    load: impl Future<Output = Result<ClaimSnapshot, StoreError>>,
    input: OrderedInput,
    executor: &E,
) -> Result<TransitionResult, ResolutionFailure> {
    let snapshot = load.await.map_err(|error| match error {
        StoreError::StaleClaim => ResolutionFailure::Retry,
        error => ResolutionFailure::persisted(error, "invalid persisted transition facts"),
    })?;
    match executor.execute(snapshot, input).await {
        Ok(TransitionResult::InvalidState(error)) => Err(ResolutionFailure::Block(error)),
        Ok(outcome) => Ok(outcome),
        Err(ServiceError::InvariantFailure) => Err(ResolutionFailure::Block(InvariantError(
            "engine execution invariant failure".into(),
        ))),
        Err(error) => Err(ResolutionFailure::Error(error)),
    }
}

async fn finish_resolution<F: Future<Output = Result<(), StoreError>>>(
    input_id: InputId,
    resolution: Result<StepOutcome, ResolutionFailure>,
    block: impl FnOnce(InvariantError) -> F,
) -> Result<StepOutcome, ServiceError> {
    match resolution {
        Ok(outcome) => Ok(outcome),
        Err(ResolutionFailure::Retry) => Ok(StepOutcome::Retry),
        Err(ResolutionFailure::Error(error)) => Err(error),
        Err(ResolutionFailure::Block(error)) => {
            let reason = error.0.clone();
            match block(error).await {
                Ok(()) => Ok(StepOutcome::Blocked { input_id, reason }),
                // Losing ownership while recording any invariant failure is a
                // retry. The stale worker must neither block nor consume input.
                Err(StoreError::StaleClaim) => Ok(StepOutcome::Retry),
                Err(error) => Err(error.into()),
            }
        }
    }
}

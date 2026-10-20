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
    async fn block_resolution(
        &self,
        claim: &Claim,
        reason: &str,
    ) -> Result<StepOutcome, ServiceError> {
        let error = InvariantError(reason.to_owned());
        match self.store.fail_claim(claim, &error).await {
            Ok(()) => Ok(StepOutcome::Blocked {
                input_id: claim.input.id,
                reason: reason.to_owned(),
            }),
            Err(StoreError::StaleClaim) => Ok(StepOutcome::Retry),
            Err(error) => Err(error.into()),
        }
    }
    pub async fn resolve_claim(&self, claim: Claim) -> Result<StepOutcome, ServiceError> {
        self.resolve_claim_with_executor(claim, &InlineEngine).await
    }
    pub async fn resolve_claim_with_executor<E: EngineExecutor>(
        &self,
        claim: Claim,
        executor: &E,
    ) -> Result<StepOutcome, ServiceError> {
        let snapshot = match self.store.load_claim(&claim).await {
            Ok(s) => s,
            Err(StoreError::StaleClaim) => return Ok(StepOutcome::Retry),
            Err(StoreError::CorruptData | StoreError::IncompatibleSchema) => {
                let error = InvariantError("invalid persisted transition facts".into());
                self.store.fail_claim(&claim, &error).await?;
                return Ok(StepOutcome::Blocked {
                    input_id: claim.input.id,
                    reason: error.0,
                });
            }
            Err(e) => return Err(e.into()),
        };
        let outcome = match executor.execute(snapshot, claim.input.clone()).await {
            Ok(result) => result,
            Err(ServiceError::InvariantFailure) => {
                return self
                    .block_resolution(&claim, "engine execution invariant failure")
                    .await;
            }
            Err(error) => return Err(error),
        };
        if let TransitionResult::InvalidState(ref error) = outcome {
            self.store.fail_claim(&claim, error).await?;
            return Ok(StepOutcome::Blocked {
                input_id: claim.input.id,
                reason: error.0.clone(),
            });
        }
        let committed = match self.store.commit_claim(&claim, outcome).await {
            Ok(committed) => committed,
            Err(StoreError::CorruptData | StoreError::IncompatibleSchema) => {
                return self
                    .block_resolution(&claim, "invalid commit facts or schema")
                    .await;
            }
            Err(error) => return Err(error.into()),
        };
        match committed {
            CommitOutcome::Committed { input_id, .. } => Ok(StepOutcome::Committed { input_id }),
            CommitOutcome::Conflict | CommitOutcome::StaleClaim => Ok(StepOutcome::Retry),
        }
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
    async fn block_scoped_resolution(
        &self,
        claim: &ScopedClaim,
        reason: &str,
    ) -> Result<StepOutcome, ServiceError> {
        match self
            .store
            .fail_scoped(claim, &InvariantError(reason.to_owned()))
            .await
        {
            Ok(()) => Ok(StepOutcome::Blocked {
                input_id: claim.input.id,
                reason: reason.to_owned(),
            }),
            Err(StoreError::StaleClaim) => Ok(StepOutcome::Retry),
            Err(error) => Err(error.into()),
        }
    }
    pub async fn resolve_scoped_claim<E: EngineExecutor>(
        &self,
        claim: ScopedClaim,
        executor: &E,
    ) -> Result<StepOutcome, ServiceError> {
        let snapshot = match self.store.load_scoped(&claim).await {
            Ok(snapshot) => snapshot,
            Err(StoreError::StaleClaim) => return Ok(StepOutcome::Retry),
            Err(StoreError::CorruptData | StoreError::IncompatibleSchema) => {
                return self
                    .block_scoped_resolution(&claim, "invalid persisted transition facts")
                    .await;
            }
            Err(error) => return Err(error.into()),
        };
        let outcome = match executor.execute(snapshot, claim.input.clone()).await {
            Ok(outcome) => outcome,
            Err(ServiceError::InvariantFailure) => {
                return self
                    .block_scoped_resolution(&claim, "engine execution invariant failure")
                    .await;
            }
            Err(error) => return Err(error),
        };
        if let TransitionResult::InvalidState(error) = &outcome {
            return self.block_scoped_resolution(&claim, &error.0).await;
        }
        match self.store.commit_scoped(&claim, outcome).await {
            Ok(CommitOutcome::Committed { input_id, .. }) => {
                Ok(StepOutcome::Committed { input_id })
            }
            Ok(CommitOutcome::StaleClaim) | Err(StoreError::StaleClaim) => Ok(StepOutcome::Retry),
            Ok(CommitOutcome::Conflict) => match self.store.release_scoped(&claim).await {
                Ok(()) | Err(StoreError::StaleClaim) => Ok(StepOutcome::Retry),
                Err(error) => Err(error.into()),
            },
            Err(StoreError::CorruptData | StoreError::IncompatibleSchema) => {
                self.block_scoped_resolution(&claim, "invalid commit facts or schema")
                    .await
            }
            Err(error) => Err(error.into()),
        }
    }
}

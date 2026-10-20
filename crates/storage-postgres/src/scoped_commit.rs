use crate::*;
use orbit_application::*;
use orbit_engine::TransitionResult;

impl ScopedGameStore for PgStore {
    async fn commit_scoped(
        &self,
        claim: &ScopedClaim,
        result: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        self.commit_transition(crate::commit::CommitClaim::Scoped(claim), result)
            .await
    }
}

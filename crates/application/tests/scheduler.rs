use orbit_application::*;
use orbit_engine::*;
use std::sync::{Arc, Mutex};
use uuid::Uuid;
#[derive(Clone)]
struct Memory {
    inner: Arc<Mutex<MemoryState>>,
    rules: Ruleset,
}
struct MemoryState {
    facts: GameState,
    claim: Option<Claim>,
    blocked: bool,
    corrupt: bool,
    commits: usize,
    corrupt_commit: bool,
    unavailable_commit: bool,
    unsupported_load: bool,
    scoped_claimed: bool,
    conflict_commit: bool,
}
fn legacy_claim(c: &ScopedClaim) -> Claim {
    Claim {
        input: c.input.clone(),
        owner: c.owner,
        token: c.token,
        lease_until: c.lease_until,
        prior_cursor: 0,
        fence: 0,
    }
}
impl ScopedOrderStore for Memory {
    async fn claim_scoped(
        &self,
        _u: UniverseId,
        worker: WorkerId,
    ) -> Result<Option<ScopedClaim>, StoreError> {
        let mut s = self.inner.lock().unwrap();
        if s.blocked || s.scoped_claimed {
            return Ok(None);
        }
        let Some(c) = s.claim.clone() else {
            return Ok(None);
        };
        let Actor::Player(player) = c.input.actor else {
            unreachable!("player fixture")
        };
        let scope = ScopeKey::Player(player);
        s.scoped_claimed = true;
        Ok(Some(ScopedClaim {
            input: c.input,
            scopes: std::collections::BTreeSet::from([scope.clone()]),
            owner: worker,
            token: c.token,
            scope_fences: std::collections::BTreeMap::from([(scope, 0)]),
            mode_generation: 0,
            lease_until: c.lease_until,
        }))
    }
    async fn load_scoped(&self, c: &ScopedClaim) -> Result<ClaimSnapshot, StoreError> {
        self.load_claim(&legacy_claim(c)).await
    }
    async fn renew_scoped(&self, c: &ScopedClaim) -> Result<ScopedClaim, StoreError> {
        Ok(c.clone())
    }
    async fn fail_scoped(
        &self,
        _c: &ScopedClaim,
        _error: &InvariantError,
    ) -> Result<(), StoreError> {
        let mut s = self.inner.lock().unwrap();
        s.blocked = true;
        s.scoped_claimed = false;
        Ok(())
    }
    async fn release_scoped(&self, _c: &ScopedClaim) -> Result<(), StoreError> {
        self.inner.lock().unwrap().scoped_claimed = false;
        Ok(())
    }
}
impl ScopedGameStore for Memory {
    async fn commit_scoped(
        &self,
        c: &ScopedClaim,
        result: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        if self.inner.lock().unwrap().conflict_commit {
            return Ok(CommitOutcome::Conflict);
        }
        let result = self.commit_claim(&legacy_claim(c), result).await;
        if result.is_ok() {
            self.inner.lock().unwrap().scoped_claimed = false;
        }
        result
    }
}
impl GameStore for Memory {
    async fn ready(&self) -> Result<(), StoreError> {
        if self.inner.lock().unwrap().blocked {
            Err(StoreError::CorruptData)
        } else {
            Ok(())
        }
    }
    async fn claim_next(&self, _u: UniverseId, _w: WorkerId) -> Result<Option<Claim>, StoreError> {
        let s = self.inner.lock().unwrap();
        if s.blocked {
            return Err(StoreError::CorruptData);
        }
        Ok(s.claim.clone())
    }
    async fn load_claim(&self, _c: &Claim) -> Result<ClaimSnapshot, StoreError> {
        let s = self.inner.lock().unwrap();
        if s.unsupported_load {
            Err(StoreError::UnsupportedState)
        } else if s.corrupt {
            Err(StoreError::CorruptData)
        } else {
            Ok(ClaimSnapshot {
                state: s.facts.clone(),
                rules: self.rules.clone(),
            })
        }
    }
    async fn renew_claim(&self, c: &Claim) -> Result<Claim, StoreError> {
        Ok(c.clone())
    }
    async fn commit_claim(
        &self,
        c: &Claim,
        result: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        let mut s = self.inner.lock().unwrap();
        if s.corrupt_commit {
            return Err(StoreError::CorruptData);
        }
        if s.unavailable_commit {
            return Err(StoreError::Unavailable);
        }
        match result {
            TransitionResult::Applied(changes) => changes
                .apply_to(&mut s.facts)
                .map_err(|_| StoreError::CorruptData)?,
            TransitionResult::Rejected(_) => {}
            TransitionResult::InvalidState(_) => return Err(StoreError::CorruptData),
        }
        s.claim = None;
        s.commits += 1;
        Ok(CommitOutcome::Committed {
            input_id: c.input.id,
            receipt: None,
        })
    }
    async fn fail_claim(&self, _c: &Claim, _e: &InvariantError) -> Result<(), StoreError> {
        self.inner.lock().unwrap().blocked = true;
        Ok(())
    }
    async fn load_rules(&self, _u: UniverseId) -> Result<Ruleset, StoreError> {
        Ok(self.rules.clone())
    }
    async fn admit(
        &self,
        _a: Actor,
        _u: UniverseId,
        _e: CommandEnvelope,
    ) -> Result<Receipt, StoreError> {
        Err(StoreError::Unavailable)
    }
    async fn receipt(
        &self,
        _a: Actor,
        _u: UniverseId,
        _id: CommandId,
    ) -> Result<Receipt, StoreError> {
        Err(StoreError::NotFound)
    }
    async fn load_quote(
        &self,
        _a: Actor,
        _u: UniverseId,
        _q: &QuoteRequest,
    ) -> Result<QuoteSnapshot, StoreError> {
        Err(StoreError::Unavailable)
    }
    async fn load_view(&self, _a: Actor, _u: UniverseId) -> Result<ViewerSnapshot, StoreError> {
        Err(StoreError::Unavailable)
    }
}
fn memory(corrupt: bool) -> (Memory, UniverseId) {
    let rules = Ruleset::from_json(include_bytes!("../../../rules/first-slice-v1.json")).unwrap();
    let u = UniverseId(Uuid::from_u128(1));
    let epoch = Epoch(Uuid::from_u128(2));
    let state = GameState {
        world: None,
        production_settings: Default::default(),
        research_operations: Default::default(),
        manufacturing_batches: Default::default(),
        progression_reservations: Default::default(),
        universe: u,
        epoch,
        profile_hash: rules.hash.clone(),
        bodies: Default::default(),
        players: Default::default(),
        inventories: vec![],
        research: Default::default(),
        constructions: Default::default(),
        fleets: Default::default(),
        reports: Default::default(),
        coverage: FactCoverage {
            production_bodies: Default::default(),
            research_operation_ids: Default::default(),
            research_slot_players: Default::default(),
            owned_body_players: Default::default(),
            lab_construction_players: Default::default(),
            manufacturing_operation_ids: Default::default(),
            manufacturing_bodies: Default::default(),
            reservation_bodies: Default::default(),
            operations: std::collections::BTreeSet::from([OperationId(Uuid::from_u128(5))]),
            ..Default::default()
        },
        collection_revisions: Default::default(),
    };
    let input = OrderedInput {
        schema_version: 2,
        id: InputId(Uuid::from_u128(3)),
        universe: u,
        epoch,
        actor: Actor::Player(PlayerId(Uuid::from_u128(4))),
        at: 0,
        phase: 1,
        sequence: 1,
        protocol: 1,
        profile_hash: rules.hash.clone(),
        payload: Input::Command(Command::CancelConstruction {
            operation: OperationId(Uuid::from_u128(5)),
        }),
    };
    let claim = Claim {
        input,
        owner: WorkerId(Uuid::from_u128(6)),
        fence: 1,
        token: Uuid::from_u128(7),
        prior_cursor: 0,
        lease_until: 15000,
    };
    (
        Memory {
            inner: Arc::new(Mutex::new(MemoryState {
                facts: state,
                claim: Some(claim),
                blocked: false,
                corrupt,
                commits: 0,
                corrupt_commit: false,
                unavailable_commit: false,
                unsupported_load: false,
                scoped_claimed: false,
                conflict_commit: false,
            })),
            rules,
        },
        u,
    )
}
#[test]
fn rejected_game_input_is_committed_once_then_idle() {
    futures::executor::block_on(async {
        let (store, u) = memory(false);
        let service = GameService::new(store.clone());
        let worker = WorkerId(Uuid::from_u128(6));
        assert!(matches!(
            service.step(u, worker).await.unwrap(),
            StepOutcome::Committed { .. }
        ));
        assert_eq!(service.step(u, worker).await.unwrap(), StepOutcome::Idle);
        assert_eq!(store.inner.lock().unwrap().commits, 1);
        assert!(store.ready().await.is_ok());
    });
}
#[test]
fn corrupt_port_facts_block_without_committing_or_skipping() {
    futures::executor::block_on(async {
        let (store, u) = memory(true);
        let service = GameService::new(store.clone());
        let worker = WorkerId(Uuid::from_u128(6));
        assert!(matches!(
            service.step(u, worker).await.unwrap(),
            StepOutcome::Blocked { .. }
        ));
        assert!(service.step(u, worker).await.is_err());
        assert_eq!(store.inner.lock().unwrap().commits, 0);
        assert!(store.ready().await.is_err());
    });
}

#[test]
fn corrupt_commit_blocks_but_transient_commit_failure_remains_retryable() {
    futures::executor::block_on(async {
        let (store, u) = memory(false);
        let service = GameService::new(store.clone());
        let worker = WorkerId(Uuid::from_u128(6));
        store.inner.lock().unwrap().corrupt_commit = true;
        assert!(matches!(
            service.step(u, worker).await.unwrap(),
            StepOutcome::Blocked { .. }
        ));
        assert!(store.ready().await.is_err());
        assert_eq!(store.inner.lock().unwrap().commits, 0);
        let (store, u) = memory(false);
        let service = GameService::new(store.clone());
        store.inner.lock().unwrap().unavailable_commit = true;
        assert!(matches!(
            service.step(u, worker).await,
            Err(ServiceError::Unavailable)
        ));
        assert!(store.ready().await.is_ok());
        store.inner.lock().unwrap().unavailable_commit = false;
        assert!(matches!(
            service.step(u, worker).await.unwrap(),
            StepOutcome::Committed { .. }
        ));
    });
}

#[test]
fn unsupported_claim_facts_are_distinct_from_retryable_unavailability() {
    futures::executor::block_on(async {
        let (store, u) = memory(false);
        store.inner.lock().unwrap().unsupported_load = true;
        let service = GameService::new(store.clone());
        let worker = WorkerId(Uuid::from_u128(6));
        let error = service.step(u, worker).await.unwrap_err();
        assert!(
            matches!(error, ServiceError::UnsupportedState),
            "capability mismatch was lost as transient unavailability"
        );
        assert!(!store.inner.lock().unwrap().blocked);
        assert_eq!(store.inner.lock().unwrap().commits, 0);
        store.inner.lock().unwrap().unsupported_load = false;
        assert!(matches!(
            service.step(u, worker).await.unwrap(),
            StepOutcome::Committed { .. }
        ));
    });
}

#[test]
fn scoped_conflict_releases_ownership_without_losing_the_order() {
    futures::executor::block_on(async {
        let (store, u) = memory(false);
        let service = GameService::new(store.clone());
        let worker = WorkerId(Uuid::from_u128(6));
        let claim = store.claim_scoped(u, worker).await.unwrap().unwrap();
        store.inner.lock().unwrap().conflict_commit = true;
        assert_eq!(
            service
                .resolve_scoped_claim(claim, &InlineEngine)
                .await
                .unwrap(),
            StepOutcome::Retry
        );
        assert_eq!(store.inner.lock().unwrap().commits, 0);
        let replacement = store
            .claim_scoped(u, worker)
            .await
            .unwrap()
            .expect("retry must be immediately claimable");
        store.inner.lock().unwrap().conflict_commit = false;
        assert!(matches!(
            service
                .resolve_scoped_claim(replacement, &InlineEngine)
                .await
                .unwrap(),
            StepOutcome::Committed { .. }
        ));
        assert_eq!(store.inner.lock().unwrap().commits, 1);
    });
}

#[test]
fn scoped_capability_mismatch_does_not_poison_a_durable_order() {
    futures::executor::block_on(async {
        let (store, u) = memory(false);
        let service = GameService::new(store.clone());
        let claim = store
            .claim_scoped(u, WorkerId(Uuid::from_u128(6)))
            .await
            .unwrap()
            .unwrap();
        store.inner.lock().unwrap().unsupported_load = true;
        assert!(matches!(
            service
                .resolve_scoped_claim(claim.clone(), &InlineEngine)
                .await,
            Err(ServiceError::UnsupportedState)
        ));
        assert!(!store.inner.lock().unwrap().blocked);
        assert_eq!(store.inner.lock().unwrap().commits, 0);
        store.inner.lock().unwrap().unsupported_load = false;
        assert!(matches!(
            service
                .resolve_scoped_claim(claim, &InlineEngine)
                .await
                .unwrap(),
            StepOutcome::Committed { .. }
        ));
    });
}

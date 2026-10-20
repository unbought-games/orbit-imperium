use orbit_application::*;
use orbit_engine::{Building, Input, TransitionResult};
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn durable_upgrade_receipt_exact_deadline_and_fencing() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4().into();
    let pw = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1_000_000, 1, &pw).await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &pw[0], None)
        .await
        .unwrap();
    let actor = Actor::Player(login.session.memberships[0].player);
    let service = GameService::new(store.clone());
    let view = service.view(actor, u).await.unwrap();
    let binding = Binding {
        account: login.session.account,
        player: login.session.memberships[0].player,
        universe: u,
        epoch: view.epoch,
    };
    let initial = store.read_updates(binding, None, 128).await.unwrap();
    assert!(matches!(initial.items[0].event, StreamEvent::Reset));
    let delivery_cursor = initial.items[0].cursor.clone().unwrap();
    let body = view.bodies[0].id;
    let quote = service
        .quote(
            actor,
            u,
            QuoteRequest::Upgrade {
                body,
                building: Building::MetalMine,
            },
        )
        .await
        .unwrap();
    let envelope = CommandEnvelope {
        command_id: Uuid::new_v4().into(),
        epoch: view.epoch,
        protocol: 2,
        command: Command::StartUpgrade {
            body,
            building: Building::MetalMine,
            expected_terms_hash: quote.terms_hash,
        },
    };
    let first = service.submit(actor, u, envelope.clone()).await.unwrap();
    assert!(matches!(first.status, ReceiptStatus::Pending));
    assert_eq!(
        first,
        service.submit(actor, u, envelope.clone()).await.unwrap()
    );
    // An accepted order is normal operation, not a reason for reads to fail.
    let pending_view = service.view(actor, u).await.unwrap();
    assert_eq!(
        pending_view.bodies[0].amounts.metal,
        view.bodies[0].amounts.metal
    );
    let worker = Uuid::new_v4().into();
    let claim = store.claim_next(u, worker).await.unwrap().unwrap();
    store.set_test_time(1_001_000).await.unwrap();
    assert_eq!(
        store.runtime_status(u).await.unwrap().oldest_pending_age_ms,
        Some(1000)
    );
    let claimed_view = service.view(actor, u).await.unwrap();
    assert_eq!(
        claimed_view.bodies[0].amounts.metal,
        view.bodies[0].amounts.metal
    );
    assert!(
        service
            .quote(
                actor,
                u,
                QuoteRequest::Upgrade {
                    body,
                    building: Building::MetalMine,
                }
            )
            .await
            .is_ok()
    );
    // Even an exclusive writer lock must not block a committed snapshot read.
    let pool = sqlx::PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let mut held = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM universes WHERE id=$1 FOR UPDATE")
        .bind(u.0)
        .fetch_one(&mut *held)
        .await
        .unwrap();
    let read =
        tokio::time::timeout(std::time::Duration::from_secs(1), service.view(actor, u)).await;
    held.rollback().await.unwrap();
    assert!(read.unwrap().is_ok());
    let facts = store.load_claim(&claim).await.unwrap().state;
    let rules = store.load_rules(u).await.unwrap();
    let result = orbit_engine::transition(&facts, &claim.input, &rules);
    assert!(matches!(result, TransitionResult::Applied(_)));
    store.set_test_time(1_016_000).await.unwrap();
    let replacement = store
        .claim_next(u, Uuid::new_v4().into())
        .await
        .unwrap()
        .unwrap();
    assert!(replacement.fence > claim.fence);
    assert_eq!(
        store.runtime_status(u).await.unwrap().oldest_pending_age_ms,
        Some(16000)
    );
    assert!(matches!(
        store.commit_claim(&claim, result.clone()).await.unwrap(),
        CommitOutcome::StaleClaim
    ));
    assert!(
        store
            .read_updates(binding, Some(&delivery_cursor), 128)
            .await
            .unwrap()
            .items
            .is_empty()
    );
    assert!(matches!(
        store.commit_claim(&replacement, result).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert!(matches!(
        service
            .receipt(actor, u, envelope.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    let status = store.runtime_status(u).await.unwrap();
    assert_eq!(
        status.oldest_due_lag_ms, None,
        "future scheduled events are not lag"
    );
    assert_eq!(status.oldest_pending_age_ms, None);
    let ReceiptStatus::Committed { result_ids, .. } = service
        .receipt(actor, u, envelope.command_id)
        .await
        .unwrap()
        .status
    else {
        panic!("start did not commit")
    };
    let operation = Uuid::parse_str(&result_ids[0]).unwrap().into();
    store.set_test_time(1_161_000).await.unwrap();
    let cancel = CommandEnvelope {
        command_id: Uuid::new_v4().into(),
        epoch: view.epoch,
        protocol: 2,
        command: Command::CancelConstruction { operation },
    };
    service.submit(actor, u, cancel.clone()).await.unwrap();

    let due = store.claim_next(u, worker).await.unwrap().unwrap();
    assert_eq!(due.input.at, 1_161_000);
    assert!(matches!(due.input.payload, Input::Event(_)));
    let facts = store.load_claim(&due).await.unwrap().state;
    store
        .commit_claim(&due, orbit_engine::transition(&facts, &due.input, &rules))
        .await
        .unwrap();
    service.step(u, worker).await.unwrap();
    assert!(matches!(
        service
            .receipt(actor, u, cancel.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Rejected {
            code: GameError::OperationNotActive
        }
    ));
    let view = service.view(actor, u).await.unwrap();
    assert_eq!(view.bodies[0].levels[&Building::MetalMine], 2);
    assert_eq!(view.bodies[0].amounts.metal, "912817500");
    assert!(matches!(
        service.submit(actor, u, envelope).await.unwrap().status,
        ReceiptStatus::Committed { .. }
    ));
    // Preparation is restartable while serial workers and new admissions continue.
    let mut pending = cancel.clone();
    pending.command_id = Uuid::new_v4().into();
    service.submit(actor, u, pending.clone()).await.unwrap();
    let old = store.claim_next(u, worker).await.unwrap().unwrap();
    let old_facts = store.load_claim(&old).await.unwrap();
    let old_result = orbit_engine::transition(&old_facts.state, &old.input, &old_facts.rules);
    // A pre-bridge writer may advance the revision without the newer timestamp metadata.
    sqlx::query("UPDATE viewer_heads SET revision=revision+1 WHERE universe=$1 AND player=$2")
        .bind(u.0)
        .bind(binding.player.0)
        .execute(&pool)
        .await
        .unwrap();
    let prepared = store.prepare_scoped_runtime(u, 1).await.unwrap();
    assert_eq!(prepared.mode, ExecutorMode::PreparingScoped);
    assert!(matches!(
        store.activate_scoped_runtime(u).await,
        Err(StoreError::Conflict)
    ));
    let mut later = pending.clone();
    later.command_id = Uuid::new_v4().into();
    service.submit(actor, u, later.clone()).await.unwrap();
    sqlx::query("DELETE FROM input_scopes WHERE universe=$1 AND input_id=$2")
        .bind(u.0)
        .bind(old.input.id.0)
        .execute(&pool)
        .await
        .unwrap();
    store.set_test_time(old.lease_until + 1).await.unwrap();
    assert!(matches!(
        store.activate_scoped_runtime(u).await,
        Err(StoreError::Conflict)
    ));
    assert_eq!(store.prepare_scoped_runtime(u, 1).await.unwrap(), prepared);
    let activated = store.activate_scoped_runtime(u).await.unwrap();
    assert_eq!(activated.mode, ExecutorMode::Scoped);
    assert!(
        store.snapshot_progress(binding, None).await.unwrap().scopes[0]
            .resolved
            .is_none(),
        "pre-cutover progress cannot certify a revision written by an older replica"
    );
    assert!(activated.generation > prepared.generation);
    assert_eq!(store.activate_scoped_runtime(u).await.unwrap(), activated);
    assert!(matches!(
        store.commit_claim(&old, old_result).await.unwrap(),
        CommitOutcome::StaleClaim
    ));
    assert!(store.claim_next(u, worker).await.unwrap().is_none());
    for id in [pending.command_id, later.command_id] {
        assert!(matches!(
            service.step_scoped(u, worker, &InlineEngine).await.unwrap(),
            StepOutcome::Committed { .. }
        ));
        assert!(matches!(
            service.receipt(actor, u, id).await.unwrap().status,
            ReceiptStatus::Rejected {
                code: GameError::OperationNotActive
            }
        ));
    }
    let updates = store
        .read_updates(binding, Some(&delivery_cursor), 128)
        .await
        .unwrap();
    assert!(updates.items.iter().any(|u| matches!(u.event, StreamEvent::Outcome { ref receipt } if matches!(receipt.status,ReceiptStatus::Committed { .. }))));
    assert!(updates.items.iter().any(|u| matches!(u.event, StreamEvent::Outcome { ref receipt } if matches!(receipt.status,ReceiptStatus::Rejected { .. }))));
    let outcomes = updates
        .items
        .iter()
        .filter_map(|u| match &u.event {
            StreamEvent::Outcome { receipt } => Some(receipt.command_id),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        outcomes.len(),
        outcomes
            .iter()
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        "commit retries must not duplicate delivery"
    );
    assert_eq!(
        serde_json::to_value(&updates).unwrap(),
        serde_json::to_value(
            store
                .read_updates(binding, Some(&delivery_cursor), 128)
                .await
                .unwrap()
        )
        .unwrap(),
        "another device can replay independently"
    );
    let foreign = Binding {
        player: Uuid::new_v4().into(),
        ..binding
    };
    assert!(
        store
            .read_updates(foreign, Some(&delivery_cursor), 128)
            .await
            .is_err()
    );
    let reset = store
        .read_updates(binding, Some(&"x".repeat(500)), 128)
        .await
        .unwrap();
    assert!(matches!(reset.items[0].event, StreamEvent::Reset));
    sqlx::query(
        "UPDATE game_updates SET created_at=clock_timestamp()-interval '8 days' WHERE universe=$1",
    )
    .bind(u.0)
    .execute(&pool)
    .await
    .unwrap();
    assert!(store.prune_game_updates().await.unwrap() > 0);
    assert!(matches!(
        store
            .read_updates(binding, Some(&delivery_cursor), 128)
            .await
            .unwrap()
            .items[0]
            .event,
        StreamEvent::Reset
    ));
    let key = serde_json::to_string(&orbit_engine::ScopeKey::Player(binding.player)).unwrap();
    sqlx::query(
        "UPDATE execution_scopes SET blocked='test diagnostic' WHERE universe=$1 AND key=$2",
    )
    .bind(u.0)
    .bind(&key)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        store.runtime_status(u).await.unwrap().blocked_scope_count,
        1
    );
    store
        .ready()
        .await
        .expect("scope lag/fault diagnostics do not revoke API readiness");
    sqlx::query("UPDATE execution_scopes SET blocked=NULL WHERE universe=$1 AND key=$2")
        .bind(u.0)
        .bind(key)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn bounded_candidate_scans_advance_past_many_contended_gates() {
    use orbit_engine::*;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| orbit_storage_postgres::MvpAccount {
        name: format!("scan-{u}-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1000, &accounts, &[91; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    let (epoch, profile_hash): (Uuid, String) =
        sqlx::query_as("SELECT epoch,profile_hash FROM universes WHERE id=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let mut hot_keys = Vec::new();
    let mut ready = None;
    // Synthetic due events isolate candidate selection from gameplay execution.
    // The last event shares the first gate: rotation must not overtake its predecessor.
    for sequence in 1..=34 {
        let key = serde_json::to_string(&ScopeKey::Location(Coordinates {
            galaxy: 1,
            system: 1,
            position: if sequence == 34 { 1 } else { sequence as u32 },
        }))
        .unwrap();
        let event = ScheduledEvent::DebrisCleanupDue {
            field: OperationId(Uuid::new_v4()),
            generation: 0,
        };
        let input = OrderedInput {
            schema_version: 4,
            protocol: 4,
            id: InputId(Uuid::new_v4()),
            universe: u,
            epoch: Epoch(epoch),
            actor: Actor::Scheduler,
            at: 1000,
            phase: 0,
            sequence,
            profile_hash: Hash(profile_hash.clone()),
            payload: Input::Event(event.clone()),
        };
        sqlx::query(
            "INSERT INTO execution_scopes(universe,key) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(u.0)
        .bind(&key)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event) VALUES($1,$2,1000,$3,$4,$5)").bind(input.id.0).bind(u.0).bind(sequence).bind(sqlx::types::Json(&input)).bind(sqlx::types::Json(event)).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO input_scopes(universe,input_id,scope_key) VALUES($1,$2,$3)")
            .bind(u.0)
            .bind(input.id.0)
            .bind(&key)
            .execute(&pool)
            .await
            .unwrap();
        if sequence <= 32 {
            hot_keys.push(key);
        }
        if sequence == 33 {
            ready = Some(input.id);
        }
    }
    let mut held = pool.begin().await.unwrap();
    sqlx::query(
        "SELECT key FROM execution_scopes WHERE universe=$1 AND key=ANY($2) FOR NO KEY UPDATE",
    )
    .bind(u.0)
    .bind(&hot_keys)
    .fetch_all(&mut *held)
    .await
    .unwrap();
    assert!(
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .is_none()
    );
    let claim = store
        .clone()
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .expect("the next bounded pass must advance beyond the first 32 contended candidates");
    assert_eq!(Some(claim.input.id), ready);
    assert!(
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .is_none(),
        "rotation cannot overtake earlier overlapping work"
    );
    held.rollback().await.unwrap();
    // Exhausting the continuation wraps on the following bounded pass.
    assert!(
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .is_none()
    );
    let resumed = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        resumed.input.sequence, 1,
        "scan wraps back to previously contended work"
    );
    store.release_scoped(&resumed).await.unwrap();
    store.release_scoped(&claim).await.unwrap();
}

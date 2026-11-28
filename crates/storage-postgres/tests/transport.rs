use orbit_application::*;
use orbit_engine::{FleetId, Resources, SCALE, ShipStack, ShipType};
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn delivery_return_recall_deadline_and_private_reports() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4().into();
    let pw = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1_000_000, 1, &pw).await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let sessions = SessionService::new(store.clone());
    let alpha = sessions.login("alpha", &pw[0], None).await.unwrap();
    let beta = sessions.login("beta", &pw[1], None).await.unwrap();
    let a = alpha.session.memberships[0].player;
    let b = beta.session.memberships[0].player;
    let service = GameService::new(store.clone());
    let av = service.view(Actor::Player(a), u).await.unwrap();
    let bv = service.view(Actor::Player(b), u).await.unwrap();
    let origin = av.bodies[0].id;
    let target = bv.bodies[0].id;
    let worker = Uuid::new_v4().into();
    let mut samples = Vec::new();
    let ships = vec![ShipStack {
        owner: a,
        ship_type: ShipType::SmallCargo,
        count: 2,
    }];
    let cargo = Resources {
        metal: 100 * SCALE,
        crystal: 50 * SCALE,
        deuterium: 10 * SCALE,
    };
    let q = service
        .quote(
            Actor::Player(a),
            u,
            QuoteRequest::Transport {
                origin,
                target,
                ships: ships.clone(),
                cargo,
                speed_percent: 100,
            },
        )
        .await
        .unwrap();
    let envelope = CommandEnvelope {
        command_id: command_id_at(1_000_000).into(),
        epoch: av.epoch,
        protocol: 2,
        command: Command::LaunchTransport {
            origin,
            target,
            ships,
            cargo,
            speed_percent: 100,
            expected_terms_hash: q.terms_hash,
        },
    };
    service
        .submit(Actor::Player(a), u, envelope.clone())
        .await
        .unwrap();
    let claim = store.claim_next(u, worker).await.unwrap().unwrap();
    let snapshot = store.load_claim(&claim).await.unwrap();
    let outcome = orbit_engine::transition(&snapshot.state, &claim.input, &snapshot.rules);
    samples.push((claim.input.clone(), snapshot, outcome.clone()));
    assert!(matches!(
        store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let launched = service.view(Actor::Player(a), u).await.unwrap();
    assert_eq!(launched.bodies[0].inventories[0].count, "0");
    assert_eq!(launched.fleets[0].paid_fuel, "3000000");
    let fleet = FleetId(Uuid::parse_str(&launched.fleets[0].id).unwrap());
    assert_ne!(fleet.0, envelope.command_id.0);
    assert!(
        service
            .receipt(Actor::Player(b), u, envelope.command_id)
            .await
            .is_err()
    );
    // Arrival wins over recall admitted at the exact same deadline.
    store.set_test_time(5_741_000).await.unwrap();
    let recall = CommandEnvelope {
        command_id: command_id_at(5_741_000).into(),
        epoch: av.epoch,
        protocol: 2,
        command: Command::RecallFleet {
            fleet: FleetId(envelope.command_id.0),
        },
    };
    service
        .submit(Actor::Player(a), u, recall.clone())
        .await
        .unwrap();
    // A recall naming the launch persisted the fleet identity on admission.
    // Retire the creator before the arrival and pending recall execute.
    let pool = sqlx::PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    sqlx::query("UPDATE command_admission_cutover SET legacy_until_ms=0")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE commands SET retention_since=to_timestamp(0)-interval '8 days' WHERE universe=$1 AND done")
        .bind(u.0).execute(&pool).await.unwrap();
    sqlx::query("UPDATE game_updates SET created_at=now()-interval '8 days' WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    store.prune_game_updates().await.unwrap();
    store.prune_terminal_history().await.unwrap();
    assert!(matches!(
        service
            .receipt(Actor::Player(a), u, envelope.command_id)
            .await,
        Err(ServiceError::CommandTime(CommandTimeError::HistoryExpired))
    ));
    let claim = store.claim_next(u, worker).await.unwrap().unwrap();
    let snapshot = store.load_claim(&claim).await.unwrap();
    let outcome = orbit_engine::transition(&snapshot.state, &claim.input, &snapshot.rules);
    samples.push((claim.input.clone(), snapshot, outcome.clone()));
    assert!(matches!(
        store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let claim = store.claim_next(u, worker).await.unwrap().unwrap();
    let snapshot = store.load_claim(&claim).await.unwrap();
    let outcome = orbit_engine::transition(&snapshot.state, &claim.input, &snapshot.rules);
    samples.push((claim.input.clone(), snapshot, outcome.clone()));
    assert!(matches!(
        store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert!(matches!(
        service
            .receipt(Actor::Player(a), u, recall.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Rejected {
            code: GameError::NotOutbound
        }
    ));
    let recipient = service.view(Actor::Player(b), u).await.unwrap();
    assert_eq!(recipient.bodies[0].amounts.deuterium, "1010000000");
    assert_eq!(recipient.reports[0].cargo.deuterium, "10000000");
    assert!(recipient.fleets.is_empty());
    let sender = service.view(Actor::Player(a), u).await.unwrap();
    assert_eq!(sender.bodies.len(), 1);
    assert_eq!(sender.reports[0].kind, "Delivered");
    store.set_test_time(10_482_000).await.unwrap();
    let claim = store.claim_next(u, worker).await.unwrap().unwrap();
    let snapshot = store.load_claim(&claim).await.unwrap();
    let outcome = orbit_engine::transition(&snapshot.state, &claim.input, &snapshot.rules);
    samples.push((claim.input.clone(), snapshot, outcome.clone()));
    assert!(matches!(
        store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert_eq!(
        service.view(Actor::Player(a), u).await.unwrap().bodies[0].inventories[0].count,
        "2"
    );
    // Simulate a lost acknowledgement for the return generation, then a very late
    // retry after the event's terminal grace. Neither repeats fleet delivery.
    let retry_result = samples.last().unwrap().2.clone();
    assert!(matches!(
        store
            .commit_claim(&claim, retry_result.clone())
            .await
            .unwrap(),
        CommitOutcome::Committed { .. }
    ));
    sqlx::query("UPDATE scheduled_events SET retention_since=to_timestamp(0)-interval '8 days' WHERE universe=$1 AND done")
        .bind(u.0).execute(&pool).await.unwrap();
    store.prune_terminal_history().await.unwrap();
    assert_eq!(
        store.commit_claim(&claim, retry_result).await.unwrap(),
        CommitOutcome::StaleClaim
    );
    let reopened = GameService::new(
        PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap(),
    );
    let restarted = reopened.view(Actor::Player(a), u).await.unwrap();
    assert_eq!(restarted.bodies[0].inventories[0].count, "2");
    assert_eq!(
        restarted.reports.len(),
        service
            .view(Actor::Player(a), u)
            .await
            .unwrap()
            .reports
            .len()
    );
    // Replay real pre-execution snapshots retained only in test-owned memory.
    assert_eq!(samples.len(), 4);
    for (input, snapshot, expected) in samples {
        assert_eq!(
            serde_json::to_value(orbit_engine::transition(
                &snapshot.state,
                &input,
                &snapshot.rules
            ))
            .unwrap(),
            serde_json::to_value(expected).unwrap()
        );
    }
}

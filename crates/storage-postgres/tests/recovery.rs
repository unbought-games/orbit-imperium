use orbit_application::*;
use orbit_engine::{Building, TransitionResult};
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn rollback_lost_ack_concurrent_spend_and_corrupt_head() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
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
    let body = view.bodies[0].id;
    let q = service
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
            expected_terms_hash: q.terms_hash,
        },
    };
    let mut other = envelope.clone();
    other.command_id = Uuid::new_v4().into();
    let (a, b) = tokio::join!(
        service.submit(actor, u, envelope.clone()),
        service.submit(actor, u, other.clone())
    );
    a.unwrap();
    b.unwrap();
    let claim = store
        .claim_next(u, Uuid::new_v4().into())
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_claim(&claim).await.unwrap().state;
    let rules = store.load_rules(u).await.unwrap();
    let result = orbit_engine::transition(&facts, &claim.input, &rules);
    assert!(matches!(result, TransitionResult::Applied(_)));
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer); INSERT INTO orbit_test_fault VALUES('before_commit','error',true,0),('after_commit','error',false,0)").execute(&pool).await.unwrap();
    assert!(store.commit_claim(&claim, result.clone()).await.is_err());
    let before: i64 = sqlx::query_scalar("SELECT count(*) FROM constructions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, 0);
    let balance: serde_json::Value = sqlx::query_scalar("SELECT amounts FROM bodies WHERE id=$1")
        .bind(body.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(balance["metal"], 1_000_000_000i64);
    sqlx::query("UPDATE orbit_test_fault SET enabled=true WHERE stage='after_commit'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.commit_claim(&claim, result.clone()).await.is_err());
    assert!(matches!(
        store.commit_claim(&claim, result).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    service.step(u, Uuid::new_v4().into()).await.unwrap();
    let receipts = [
        service
            .receipt(actor, u, envelope.command_id)
            .await
            .unwrap(),
        service.receipt(actor, u, other.command_id).await.unwrap(),
    ];
    assert_eq!(
        receipts
            .iter()
            .filter(|r| matches!(r.status, ReceiptStatus::Committed { .. }))
            .count(),
        1
    );
    assert_eq!(
        receipts
            .iter()
            .filter(|r| matches!(
                r.status,
                ReceiptStatus::Rejected {
                    code: GameError::ActiveConstruction
                }
            ))
            .count(),
        1
    );
    let before: i64 = sqlx::query_scalar("SELECT sum(revision)::bigint FROM bodies")
        .fetch_one(&pool)
        .await
        .unwrap();
    for _ in 0..20 {
        service.view(actor, u).await.unwrap();
    }
    let after: i64 = sqlx::query_scalar("SELECT sum(revision)::bigint FROM bodies")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, after);
    // A corrupt complete fact must stop this universe; it cannot be skipped to a later command.
    store.set_test_time(1_161_000).await.unwrap();
    sqlx::query("UPDATE bodies SET carry='{}'::jsonb WHERE id=$1")
        .bind(body.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        service.step(u, Uuid::new_v4().into()).await.unwrap(),
        StepOutcome::Blocked { .. }
    ));
    assert!(store.ready().await.is_err());
    assert!(service.step(u, Uuid::new_v4().into()).await.is_err());
}

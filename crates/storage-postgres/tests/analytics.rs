use orbit_application::{IdentityStore, StoreError};
use orbit_storage_postgres::PgStore;
use serde_json::json;
use uuid::Uuid;
#[tokio::test]
async fn authoritative_identity_and_enrollment_are_immutable_and_recoverable() {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable database required");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let subject = Uuid::new_v4().to_string();
    let identity = unbought_auth::Identity {
        issuer: "https://accounts.example/api/auth".into(),
        subject: subject.clone(),
        username: format!("analytics_{}", &subject[..8]),
        email_verified: false,
        supporter_tier: None,
        session_id: Uuid::new_v4().to_string(),
        issued_at: unbought_auth::now(),
        expires_at: unbought_auth::now() + 300,
    };
    let session = store
        .complete_oidc_login(
            unbought_auth::Tokens {
                client_id: "fixture".into(),
                identity: identity.clone(),
                access_token: "synthetic".into(),
                refresh_token: None,
                nonce: "synthetic".into(),
                validated_at: unbought_auth::now(),
            },
            &unbought_auth::digest(&subject),
            "csrf",
            None,
        )
        .await
        .unwrap();
    let property = Uuid::new_v4();
    let journey = json!({"visit_id":Uuid::new_v4(),"visitor_id":Uuid::new_v4()});
    let config = json!({"propertyId":property,"policyVersion":1,"environment":"test"});
    let subject = json!({"namespace":identity.issuer,"id":identity.subject});
    let a = store
        .capture_analytics(session.account, subject.clone(), &config, &journey)
        .await
        .unwrap();
    let b = store
        .capture_analytics(session.account, subject.clone(), &config, &journey)
        .await
        .unwrap();
    assert_eq!(a, b);
    let events = store.claim_analytics().await.unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["subject"], subject);
    assert_eq!(events[0]["category"], "custom");
    assert!(!events[0].to_string().contains("csrf"));
    assert!(store.claim_analytics().await.unwrap().is_empty());
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("UPDATE analytics_delivery SET retry_at=now() WHERE event_id=$1")
        .bind(a)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(store.claim_analytics().await.unwrap(), events);
    store
        .acknowledge_analytics(a, "delivered", None)
        .await
        .unwrap();
    assert!(store.analytics_delivered(a).await.unwrap());
    let universe = Uuid::new_v4().into();
    let policy = store
        .ensure_signup_universe(Some(universe), Default::default(), Some(10))
        .await
        .unwrap();
    store.enroll_oidc(session.account, policy).await.unwrap();
    store
        .capture_analytics(session.account, subject, &config, &journey)
        .await
        .unwrap();
    let enrolled = store.claim_analytics().await.unwrap();
    assert_eq!(enrolled.len(), 1);
    assert_eq!(enrolled[0]["category"], "enrollment");
    assert_eq!(enrolled[0]["properties"]["world"], universe.0.to_string());
    let id = Uuid::parse_str(enrolled[0]["event_id"].as_str().unwrap()).unwrap();
    store
        .acknowledge_analytics(id, "quarantined", Some("schema_mismatch"))
        .await
        .unwrap();
    assert!(!store.analytics_delivered(id).await.unwrap());
    assert!(store.claim_analytics().await.unwrap().is_empty());
    // The daily admission budget must not reject replay of retained facts.
    // Synthetic rows bring this account to the exact production boundary.
    sqlx::query("INSERT INTO analytics_delivery(event_id,fact_key,account,payload) SELECT gen_random_uuid(),'budget-fixture:' || $1::text || ':' || n::text,$1,'{}'::jsonb FROM generate_series(1,198) n")
        .bind(session.account.0)
        .execute(&pool)
        .await
        .unwrap();
    let repeat = store
        .capture_analytics(
            session.account,
            json!({"namespace":"ignored-on-replay","id":"ignored"}),
            &config,
            &journey,
        )
        .await
        .unwrap();
    assert_eq!(repeat, a);
    let new_journey = json!({"visit_id":Uuid::new_v4(),"visitor_id":Uuid::new_v4()});
    assert!(matches!(
        store
            .capture_analytics(session.account, json!({}), &config, &new_journey)
            .await,
        Err(StoreError::RateLimited)
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM analytics_delivery WHERE account=$1")
        .bind(session.account.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        count, 200,
        "replay and rejected admission must not add records"
    );
    let retained: serde_json::Value =
        sqlx::query_scalar("SELECT payload FROM analytics_delivery WHERE event_id=$1")
            .bind(a)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        retained, events[0],
        "replay must retain authoritative evidence"
    );
    // A batch requiring two new facts cannot partially consume the last slot.
    sqlx::query(
        "UPDATE analytics_delivery SET created_at=now()-interval '2 days' WHERE fact_key=$1",
    )
    .bind(format!("budget-fixture:{}:1", session.account.0))
    .execute(&pool)
    .await
    .unwrap();
    let second_policy = store
        .ensure_signup_universe(Some(Uuid::new_v4().into()), Default::default(), Some(10))
        .await
        .unwrap();
    store
        .enroll_oidc(session.account, second_policy)
        .await
        .unwrap();
    assert!(matches!(
        store
            .capture_analytics(session.account, json!({}), &config, &new_journey)
            .await,
        Err(StoreError::RateLimited)
    ));
    let after_rejected_batch: i64 =
        sqlx::query_scalar("SELECT count(*) FROM analytics_delivery WHERE account=$1")
            .bind(session.account.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        after_rejected_batch, 200,
        "failed batch must roll back its first insert"
    );
    assert_eq!(
        store
            .capture_analytics(session.account, json!({}), &config, &journey)
            .await
            .unwrap(),
        a,
        "replay still discovers the new authoritative enrollment"
    );
    let after_enrollment: i64 = sqlx::query_scalar("SELECT count(*) FROM analytics_delivery WHERE account=$1 AND created_at>now()-interval '1 day'").bind(session.account.0).fetch_one(&pool).await.unwrap();
    assert_eq!(after_enrollment, 200);
    pool.close().await;
}

#[tokio::test]
async fn server_auth_and_enrollment_capture_without_browser_bridge() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let subject = Uuid::new_v4().to_string();
    let property = Uuid::new_v4();
    let context = json!({"config":{"propertyId":property,"policyVersion":1,"environment":"test"},"journey":{"visit_id":Uuid::new_v4(),"visitor_id":Uuid::new_v4(),"source":{"page":"https://game.example/invite/:code","route":"https://game.example/invite/:code","referrer":null,"campaign":{"utm_source":"invitation","utm_medium":"referral"}}}});
    let tokens = unbought_auth::Tokens {
        client_id: "fixture".into(),
        identity: unbought_auth::Identity {
            issuer: "https://accounts.example/api/auth".into(),
            subject: subject.clone(),
            username: format!("server_{}", &subject[..8]),
            email_verified: false,
            supporter_tier: None,
            session_id: Uuid::new_v4().to_string(),
            issued_at: unbought_auth::now(),
            expires_at: unbought_auth::now() + 300,
        },
        access_token: "synthetic".into(),
        refresh_token: None,
        nonce: "synthetic".into(),
        validated_at: unbought_auth::now(),
    };
    let session = store
        .complete_oidc_login_attributed(
            tokens.clone(),
            &unbought_auth::digest(&subject),
            "csrf",
            None,
            Some(context.clone()),
        )
        .await
        .unwrap();
    let authentication: serde_json::Value = sqlx::query_scalar("SELECT payload FROM analytics_delivery WHERE account=$1 AND payload->>'name'='account_authenticated'")
        .bind(session.account.0).fetch_one(&pool).await.unwrap();
    assert_eq!(authentication["campaign"]["utm_source"], "invitation");
    assert_eq!(authentication["subject"]["id"], subject);
    let universe = Uuid::new_v4().into();
    let policy = store
        .ensure_signup_universe(Some(universe), Default::default(), Some(10))
        .await
        .unwrap();
    store
        .enroll_oidc_attributed(session.account, policy, None, None, Some(context.clone()))
        .await
        .unwrap();
    let payload: serde_json::Value = sqlx::query_scalar("SELECT payload FROM analytics_delivery WHERE account=$1 AND payload->>'category'='enrollment'")
        .bind(session.account.0).fetch_one(&pool).await.unwrap();
    assert_eq!(payload["subject"]["id"], subject);
    assert_eq!(
        payload["context"]["route"],
        "https://game.example/invite/:code"
    );
    assert_eq!(
        payload["campaign"],
        json!({"utm_source":"invitation","utm_medium":"referral"})
    );
    store
        .enroll_oidc_attributed(session.account, policy, None, None, Some(context.clone()))
        .await
        .unwrap();
    let again:Vec<serde_json::Value> = sqlx::query_scalar("SELECT payload FROM analytics_delivery WHERE account=$1 AND payload->>'category'='enrollment'")
        .bind(session.account.0).fetch_all(&pool).await.unwrap();
    assert_eq!(again, vec![payload]);
    let other = store
        .ensure_signup_universe(Some(Uuid::new_v4().into()), Default::default(), Some(10))
        .await
        .unwrap();
    // No request context means collection was disabled or not configured.
    store
        .enroll_oidc_attributed(session.account, other, None, None, None)
        .await
        .unwrap();
    let count:i64=sqlx::query_scalar("SELECT count(*) FROM analytics_delivery WHERE account=$1 AND payload->>'category'='enrollment'").bind(session.account.0).fetch_one(&pool).await.unwrap();
    assert_eq!(count, 1);
    assert!(!authentication.to_string().contains("synthetic"));
    pool.close().await;
}

#[tokio::test]
async fn gameplay_activity_commits_once_without_remote_analytics_and_obeys_admission_choice() {
    use orbit_application::*;
    use orbit_engine::{Building, TransitionResult};
    use orbit_storage_postgres::with_activity_collection;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let u = Uuid::new_v4().into();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1_000_000, 1, &passwords).await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &passwords[0], None)
        .await
        .unwrap();
    sqlx::query("INSERT INTO oidc_identity(issuer,subject,account) VALUES('https://accounts.example','synthetic-activity',$1)").bind(login.session.account.0).execute(&pool).await.unwrap();
    let actor = Actor::Player(login.session.memberships[0].player);
    let game = GameService::new(store.clone());
    let view = game.view(actor, u).await.unwrap();
    let body = view.bodies[0].id;
    let quote = game
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
    let config = json!({"propertyId":Uuid::new_v4(),"policyVersion":1,"environment":"test"});
    with_activity_collection(config, game.submit(actor, u, envelope.clone()))
        .await
        .unwrap();
    // A retry with a different choice cannot replace the original admission decision.
    with_activity_collection(
        json!({"reason":"collection_disabled"}),
        game.submit(actor, u, envelope.clone()),
    )
    .await
    .unwrap();
    let claim = store
        .claim_next(u, Uuid::new_v4().into())
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_claim(&claim).await.unwrap().state;
    let rules = store.load_rules(u).await.unwrap();
    let result = orbit_engine::transition(&facts, &claim.input, &rules);
    assert!(matches!(result, TransitionResult::Applied(_)));
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer); INSERT INTO orbit_test_fault VALUES('before_commit','error',true,0),('after_commit','error',false,0)")
        .execute(&pool).await.unwrap();
    assert!(store.commit_claim(&claim, result.clone()).await.is_err());
    let rolled_back: i64 =
        sqlx::query_scalar("SELECT count(*) FROM analytics_delivery WHERE event_id=$1")
            .bind(claim.input.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        rolled_back, 0,
        "a rolled-back gameplay transaction must not emit activity"
    );
    let captured: bool =
        sqlx::query_scalar("SELECT activity_captured FROM commands WHERE input_id=$1")
            .bind(claim.input.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!captured);
    sqlx::query("UPDATE orbit_test_fault SET enabled=true WHERE stage='after_commit'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.commit_claim(&claim, result.clone()).await.is_err());
    store.commit_claim(&claim, result).await.unwrap();
    let payload: serde_json::Value =
        sqlx::query_scalar("SELECT payload FROM analytics_delivery WHERE event_id=$1")
            .bind(claim.input.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(payload["name"], "committed_activity");
    assert_eq!(payload["logical_time"], "1000000");
    assert_eq!(payload["properties"]["action"], "StartUpgrade");
    assert!(payload.get("visit_id").is_none());
    assert!(!payload.to_string().contains("expected_terms_hash"));
    // Replaying projection/backfill and an interrupted transaction cannot duplicate facts.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("UPDATE commands SET activity_captured=false WHERE input_id=$1")
        .bind(claim.input.id.0)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("SELECT capture_committed_activity($1)")
        .bind(claim.input.id.0)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.rollback().await.unwrap();
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM analytics_delivery WHERE event_id=$1")
        .bind(claim.input.id.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
    // More than 200 eligible actions remain deliverable; history/outages do not age them out.
    sqlx::query("INSERT INTO commands(universe,epoch,actor,command_id,input_id,intent_hash,at_ms,sequence,input,receipt,done,activity_policy) SELECT universe,epoch,actor,gen_random_uuid(),gen_random_uuid(),intent_hash,at_ms,sequence,input,receipt,true,activity_policy FROM commands CROSS JOIN generate_series(1,205) WHERE input_id=$1")
        .bind(claim.input.id.0).execute(&pool).await.unwrap();
    sqlx::query("SELECT capture_committed_activity(input_id) FROM commands WHERE universe=$1 AND NOT activity_captured").bind(u.0).execute(&pool).await.unwrap();
    sqlx::query("UPDATE analytics_delivery SET created_at=now()-interval '100 days' WHERE payload->>'name'='committed_activity'").execute(&pool).await.unwrap();
    store.claim_analytics().await.unwrap();
    let n: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM analytics_delivery WHERE payload#>>'{properties,world}'=$1",
    )
    .bind(u.to_string())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(n, 206);
    // Explicit refusal and missing policy are coverage gaps, never consent defaults.
    for policy in [Some(json!({"reason":"collection_disabled"})), None] {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO commands(universe,epoch,actor,command_id,input_id,intent_hash,at_ms,sequence,input,receipt,done,activity_policy) SELECT universe,epoch,actor,gen_random_uuid(),$2,intent_hash,at_ms,sequence,input,receipt,true,$3 FROM commands WHERE input_id=$1")
            .bind(claim.input.id.0).bind(id).bind(policy).execute(&pool).await.unwrap();
        sqlx::query("SELECT capture_committed_activity($1)")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("SELECT capture_committed_activity($1)")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
    }
    let gaps: Vec<(String, i64)> = sqlx::query_as(
        "SELECT reason,events FROM activity_coverage_gaps WHERE universe=$1 ORDER BY reason",
    )
    .bind(u.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        gaps,
        vec![
            ("collection_disabled".into(), 1),
            ("collection_unknown".into(), 1)
        ]
    );
    let account: Uuid =
        sqlx::query_scalar("SELECT account FROM analytics_delivery WHERE event_id=$1")
            .bind(claim.input.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(account, login.session.account.0);
    sqlx::query("DELETE FROM analytics_delivery WHERE event_id=$1")
        .bind(claim.input.id.0)
        .execute(&pool)
        .await
        .unwrap();
    let removed:i64=sqlx::query_scalar("SELECT events FROM activity_coverage_gaps WHERE universe=$1 AND reason='source_deleted_without_ack'").bind(u.0).fetch_one(&pool).await.unwrap();
    assert_eq!(removed, 1);

    pool.close().await;
}

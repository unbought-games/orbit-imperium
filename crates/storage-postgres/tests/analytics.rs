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

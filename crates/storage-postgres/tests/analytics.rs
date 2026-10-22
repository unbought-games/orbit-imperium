use orbit_application::IdentityStore;
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
    pool.close().await;
}

use orbit_application::IdentityStore;
use orbit_storage_postgres::PgStore;
use uuid::Uuid;

#[tokio::test]
async fn oidc_mapping_enrollment_rename_and_logout_are_account_bound() {
    use orbit_application::{AccountId, SignupPolicy};
    use unbought_auth::{Identity, Tokens};
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let subject = Uuid::new_v4().to_string();
    let username = format!("oidc_{}", &subject[..8]);
    let identity = Identity {
        issuer: "https://accounts.example.test/api/auth".into(),
        subject: subject.clone(),
        username,
        email_verified: false,
        supporter_tier: None,
        session_id: Uuid::new_v4().to_string(),
        issued_at: unbought_auth::now(),
        expires_at: unbought_auth::now() + 300,
    };
    let tokens = Tokens {
        client_id: "orbit".into(),
        identity: identity.clone(),
        access_token: "fixture-access".into(),
        refresh_token: Some("fixture-refresh".into()),
        nonce: "fixture-nonce".into(),
        validated_at: unbought_auth::now(),
    };
    let digest = unbought_auth::digest(&Uuid::new_v4().to_string());
    let first = store
        .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
        .await
        .unwrap();
    assert!(
        first.memberships.is_empty(),
        "authentication cannot grant a homeworld"
    );
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let universe = Uuid::new_v4().into();
    let policy = store
        .ensure_signup_universe(Some(universe), Default::default(), Some(10))
        .await
        .unwrap();
    // A backwards wall clock must respect the universe's authoritative floor.
    sqlx::query("UPDATE universe_runtime SET ordering_floor=2000 WHERE universe=$1")
        .bind(universe.0)
        .execute(&pool)
        .await
        .unwrap();
    store.set_test_time(1500).await.unwrap();
    let (a, b) = tokio::join!(
        store.enroll_oidc(first.account, policy),
        store.enroll_oidc(first.account, policy)
    );
    a.unwrap();
    b.unwrap();
    let enrolled = store.lookup_session(&digest).await.unwrap().unwrap();
    assert_eq!(enrolled.memberships.len(), 1);
    let player = enrolled.memberships[0].player;
    assert_eq!(
        sqlx::query_scalar::<_, Option<i64>>(
            "SELECT joined_at_ms FROM universe_memberships WHERE universe=$1 AND account=$2"
        )
        .bind(universe.0)
        .bind(first.account.0)
        .fetch_one(&pool)
        .await
        .unwrap(),
        Some(2000)
    );
    store.set_test_time(3000).await.unwrap();
    let (a, b) = tokio::join!(
        store.enroll_oidc(first.account, policy),
        store.enroll_oidc(first.account, policy)
    );
    a.unwrap();
    b.unwrap();
    let mut renamed = tokens.clone();
    renamed.identity.username = format!("renamed_{}", &subject[..8]);
    renamed.identity.email_verified = true;
    let second_digest = unbought_auth::digest(&Uuid::new_v4().to_string());
    let second = store
        .complete_oidc_login(renamed, &second_digest, "csrf-2", None)
        .await
        .unwrap();
    assert_eq!(second.account, first.account);
    assert_eq!(second.memberships[0].player, player);
    assert_eq!(
        sqlx::query_scalar::<_, Option<i64>>(
            "SELECT joined_at_ms FROM universe_memberships WHERE universe=$1 AND account=$2"
        )
        .bind(universe.0)
        .bind(first.account.0)
        .fetch_one(&pool)
        .await
        .unwrap(),
        Some(2000)
    );
    // Existing unknown history must remain unknown on enrollment and login retries.
    sqlx::query(
        "UPDATE universe_memberships SET joined_at_ms=NULL WHERE universe=$1 AND account=$2",
    )
    .bind(universe.0)
    .bind(first.account.0)
    .execute(&pool)
    .await
    .unwrap();
    store.enroll_oidc(first.account, policy).await.unwrap();
    store
        .complete_oidc_login(tokens.clone(), &Uuid::new_v4().to_string(), "csrf", None)
        .await
        .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, Option<i64>>(
            "SELECT joined_at_ms FROM universe_memberships WHERE universe=$1 AND account=$2"
        )
        .bind(universe.0)
        .bind(first.account.0)
        .fetch_one(&pool)
        .await
        .unwrap(),
        None
    );
    let other = Uuid::new_v4().into();
    store
        .ensure_signup_universe(Some(other), Default::default(), Some(10))
        .await
        .unwrap();
    // Fail after the membership insert; the account predates enrollment and survives.
    sqlx::raw_sql("CREATE FUNCTION fail_oidc_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER fail_oidc_enrollment BEFORE INSERT ON building_levels FOR EACH ROW EXECUTE FUNCTION fail_oidc_enrollment();")
        .execute(&pool).await.unwrap();
    assert!(
        store
            .enroll_oidc(
                first.account,
                SignupPolicy {
                    universe: other,
                    max_players: 10
                }
            )
            .await
            .is_err()
    );
    let counts: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM universe_memberships WHERE universe=$1), (SELECT count(*) FROM players WHERE universe=$1), (SELECT count(*) FROM bodies WHERE universe=$1)")
        .bind(other.0).fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (0, 0, 0));
    sqlx::raw_sql("DROP TRIGGER fail_oidc_enrollment ON building_levels; DROP FUNCTION fail_oidc_enrollment();")
        .execute(&pool).await.unwrap();
    store.set_test_time(4000).await.unwrap();
    store
        .enroll_oidc(
            first.account,
            SignupPolicy {
                universe: other,
                max_players: 10,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .lookup_session(&digest)
            .await
            .unwrap()
            .unwrap()
            .memberships
            .len(),
        2
    );
    assert_eq!(
        sqlx::query_scalar::<_, Option<i64>>(
            "SELECT joined_at_ms FROM universe_memberships WHERE universe=$1 AND account=$2"
        )
        .bind(other.0)
        .bind(first.account.0)
        .fetch_one(&pool)
        .await
        .unwrap(),
        Some(4000)
    );
    let event = unbought_auth::Logout {
        iss: identity.issuer.clone(),
        aud: serde_json::json!("orbit"),
        sub: Some(subject),
        sid: identity.session_id,
        jti: Uuid::new_v4().to_string(),
        iat: unbought_auth::now(),
        exp: unbought_auth::now() + 120,
        events: serde_json::json!({"http://schemas.openid.net/event/backchannel-logout":{}}),
        nonce: None,
    };
    store
        .revoke_oidc(&identity.issuer, "other-client", event.clone())
        .await
        .unwrap();
    assert!(store.lookup_session(&digest).await.unwrap().is_some());
    store
        .revoke_oidc(&identity.issuer, "orbit", event.clone())
        .await
        .unwrap();
    store
        .revoke_oidc(&identity.issuer, "orbit", event)
        .await
        .unwrap();
    assert!(store.lookup_session(&digest).await.unwrap().is_none());
    assert!(
        store
            .lookup_session(&second_digest)
            .await
            .unwrap()
            .is_none()
    );
    let _account: AccountId = first.account;
}

#[tokio::test]
async fn oidc_display_name_reuse_and_swaps_preserve_subjects_and_local_credentials() {
    use unbought_auth::{Identity, Tokens};
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let prefix = Uuid::new_v4().to_string();
    let alice_name = format!("alice_{prefix}");
    let bob_name = format!("bob_{prefix}");
    let local = Uuid::new_v4();
    sqlx::query("INSERT INTO accounts(id,name,password_hash) VALUES($1,$2,'local-password')")
        .bind(local)
        .bind(&alice_name)
        .execute(&pool)
        .await
        .unwrap();
    let tokens = |subject: &str, name: &str| Tokens {
        client_id: "orbit".into(),
        identity: Identity {
            issuer: "https://accounts.example.test/api/auth".into(),
            subject: format!("{subject}_{prefix}"),
            username: name.into(),
            email_verified: true,
            supporter_tier: None,
            session_id: Uuid::new_v4().to_string(),
            issued_at: unbought_auth::now(),
            expires_at: unbought_auth::now() + 300,
        },
        access_token: "fixture-access".into(),
        refresh_token: None,
        nonce: "fixture-nonce".into(),
        validated_at: unbought_auth::now(),
    };
    let login = |tokens| {
        let store = store.clone();
        async move {
            store
                .complete_oidc_login(tokens, &Uuid::new_v4().to_string(), "csrf", None)
                .await
                .unwrap()
                .account
        }
    };
    let alice = login(tokens("alice", &alice_name)).await;
    let bob = login(tokens("bob", &bob_name)).await;
    assert_ne!(alice, bob);
    assert_ne!(alice.0, local);
    // Bob claims Alice's old username before Alice next returns to Orbit.
    assert_eq!(login(tokens("bob", &alice_name)).await, bob);
    assert_eq!(login(tokens("alice", &bob_name)).await, alice);
    // Reuse by a new subject and by a different issuer also remains independent.
    let newcomer = login(tokens("newcomer", &alice_name)).await;
    assert_ne!(newcomer, alice);
    assert_ne!(newcomer, bob);
    let mut other_issuer = tokens("alice", &alice_name);
    other_issuer.identity.issuer = "https://other.example.test/api/auth".into();
    assert_ne!(login(other_issuer).await, alice);
    assert_eq!(
        store
            .find_credentials(&alice_name)
            .await
            .unwrap()
            .unwrap()
            .account
            .0,
        local
    );
    assert!(store.find_credentials(&bob_name).await.unwrap().is_none());
    assert!(
        sqlx::query(
            "INSERT INTO accounts(id,name,password_hash) VALUES($1,$2,'another-local-password')"
        )
        .bind(Uuid::new_v4())
        .bind(&alice_name)
        .execute(&pool)
        .await
        .is_err(),
        "local credential names remain unique"
    );
}

fn refresh_fixture() -> unbought_auth::Tokens {
    unbought_auth::Tokens {
        client_id: "orbit".into(),
        identity: unbought_auth::Identity {
            issuer: "https://accounts.example.test/api/auth".into(),
            subject: Uuid::new_v4().to_string(),
            username: format!("refresh_{}", Uuid::new_v4().simple()),
            email_verified: true,
            supporter_tier: None,
            session_id: Uuid::new_v4().to_string(),
            issued_at: unbought_auth::now() - 61,
            expires_at: unbought_auth::now() + 300,
        },
        access_token: "old-access".into(),
        refresh_token: Some("old-refresh".into()),
        nonce: "fixture-nonce".into(),
        validated_at: unbought_auth::now() - 61,
    }
}

#[tokio::test]
async fn supporter_claims_follow_reauthentication_refresh_and_legacy_sessions() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let mut tokens = refresh_fixture();
    tokens.validated_at = unbought_auth::now();
    let mut previous = None;
    let mut account = None;
    for tier in [Some(1), Some(3), Some(2), None] {
        tokens.identity.supporter_tier = tier;
        let digest = Uuid::new_v4().to_string();
        let session = store
            .complete_oidc_login(tokens.clone(), &digest, "csrf", previous.clone())
            .await
            .unwrap();
        if let Some(account) = account {
            assert_eq!(session.account, account);
        }
        account = Some(session.account);
        if let Some(old) = previous {
            assert!(store.lookup_session(&old).await.unwrap().is_none());
        }
        let identity = store
            .revalidate_oidc_for_test(&digest, &tokens.identity.issuer, "orbit", |_| async {
                panic!("fresh login is already validated")
            })
            .await
            .unwrap();
        assert_eq!(identity.supporter_tier, tier);
        previous = Some(digest);
    }
    let digest = previous.unwrap();
    // Old serialized identities omit the new field; no migration or forced logout.
    sqlx::query(
        "UPDATE oidc_session SET payload=payload #- '{identity,supporter_tier}' WHERE digest=$1",
    )
    .bind(&digest)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        store
            .revalidate_oidc_for_test(&digest, &tokens.identity.issuer, "orbit", |_| async {
                panic!("legacy snapshot is still current")
            })
            .await
            .unwrap()
            .supporter_tier,
        None
    );
    for tier in [Some(3), None] {
        sqlx::query("UPDATE oidc_session SET payload=jsonb_set(payload,'{validated_at}',to_jsonb($2::bigint)) WHERE digest=$1").bind(&digest).bind(unbought_auth::now() - 61).execute(&pool).await.unwrap();
        let identity = store
            .revalidate_oidc_for_test(
                &digest,
                &tokens.identity.issuer,
                "orbit",
                move |mut tokens| async move {
                    tokens.identity.supporter_tier = tier;
                    tokens.validated_at = unbought_auth::now();
                    Ok(tokens)
                },
            )
            .await
            .unwrap();
        assert_eq!(identity.supporter_tier, tier);
        let persisted = store
            .revalidate_oidc_for_test(&digest, &tokens.identity.issuer, "orbit", |_| async {
                panic!("refreshed snapshot was persisted")
            })
            .await
            .unwrap();
        assert_eq!(persisted.supporter_tier, tier);
    }
}

async fn refresh_store(url: &str) -> PgStore {
    PgStore::connect_with_limits(
        url,
        orbit_storage_postgres::PoolLimits {
            admission: 1,
            reads: 1,
            refresh: 1,
            worker: 0,
            control: 2,
        },
    )
    .await
    .unwrap()
}

async fn responsive<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::time::timeout(std::time::Duration::from_secs(2), future)
        .await
        .expect("unrelated work must not wait for the blocked provider")
}

#[tokio::test]
async fn slow_refresh_is_isolated_and_rotates_once_across_replicas() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let first = refresh_store(&url).await;
    let second = refresh_store(&url).await;
    first.migrate().await.unwrap();
    let tokens = refresh_fixture();
    let digest = Uuid::new_v4().to_string();
    let session = first
        .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
        .await
        .unwrap();
    let (entered, started) = tokio::sync::oneshot::channel();
    let (release, held) = tokio::sync::oneshot::channel();
    let running = {
        let store = first.clone();
        let digest = digest.clone();
        let issuer = tokens.identity.issuer.clone();
        tokio::spawn(async move {
            store
                .revalidate_oidc_for_test(&digest, &issuer, "orbit", |mut tokens| async move {
                    entered.send(()).unwrap();
                    held.await.unwrap();
                    tokens.refresh_token = Some("rotated-refresh".into());
                    tokens.validated_at = unbought_auth::now();
                    Ok(tokens)
                })
                .await
        })
    };
    started.await.unwrap();
    let contended = responsive(second.revalidate_oidc_for_test(
        &digest,
        &tokens.identity.issuer,
        "orbit",
        |_| async { panic!("another replica must not consume the same rotating refresh token") },
    ))
    .await;
    assert!(matches!(
        contended,
        Err(orbit_application::StoreError::SessionRefreshing(1..=4000))
    ));

    // Both admission and fresh authentication on the blocked refresher's own
    // process remain usable with one connection reserved for each workload.
    let fresh_digest = Uuid::new_v4().to_string();
    let mut fresh = tokens.clone();
    fresh.validated_at = unbought_auth::now();
    responsive(first.complete_oidc_login(fresh, &fresh_digest, "csrf", None))
        .await
        .unwrap();
    responsive(first.revalidate_oidc_for_test(
        &fresh_digest,
        &tokens.identity.issuer,
        "orbit",
        |_| async { panic!("fresh identities must not acquire exhausted refresh capacity") },
    ))
    .await
    .unwrap();
    responsive(first.create_session(session.account, &Uuid::new_v4().to_string(), "csrf", None))
        .await
        .unwrap();
    release.send(()).unwrap();
    running.await.unwrap().unwrap();
    second
        .revalidate_oidc_for_test(&digest, &tokens.identity.issuer, "orbit", |_| async {
            panic!("a peer must reuse the already refreshed identity")
        })
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let saved: serde_json::Value =
        sqlx::query_scalar("SELECT payload FROM oidc_session WHERE digest=$1")
            .bind(&digest)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved["refresh_token"], "rotated-refresh");
    sqlx::query("UPDATE oidc_session SET payload=jsonb_set(payload,'{validated_at}',to_jsonb($2::bigint)) WHERE digest=$1")
        .bind(&digest).bind(unbought_auth::now()-61).execute(&pool).await.unwrap();
    second
        .revalidate_oidc_for_test(
            &digest,
            &tokens.identity.issuer,
            "orbit",
            |mut tokens| async move {
                assert_eq!(tokens.refresh_token.as_deref(), Some("rotated-refresh"));
                tokens.validated_at = unbought_auth::now();
                Ok(tokens)
            },
        )
        .await
        .unwrap();
}

#[tokio::test]
async fn peers_wait_for_one_rotation_without_holding_connections_or_replaying_tokens() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let first = refresh_store(&url).await;
    let second = refresh_store(&url).await;
    first.migrate().await.unwrap();
    let tokens = refresh_fixture();
    let digest = Uuid::new_v4().to_string();
    let session = first
        .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
        .await
        .unwrap();
    let (entered, started) = tokio::sync::oneshot::channel();
    let (release, held) = tokio::sync::oneshot::channel();
    let running = {
        let store = first.clone();
        let digest = digest.clone();
        let issuer = tokens.identity.issuer.clone();
        tokio::spawn(async move {
            store
                .revalidate_oidc_for_test(&digest, &issuer, "orbit", |mut tokens| async move {
                    entered.send(()).unwrap();
                    held.await.unwrap();
                    tokens.refresh_token = Some("rotated-refresh".into());
                    tokens.validated_at = unbought_auth::now();
                    Ok(tokens)
                })
                .await
        })
    };
    started.await.unwrap();
    let peer = |store: PgStore| {
        let digest = digest.clone();
        let issuer = tokens.identity.issuer.clone();
        tokio::spawn(async move {
            store
                .revalidate_oidc_for_test(&digest, &issuer, "orbit", |_| async {
                    panic!("peer must reuse committed rotation, never call provider")
                })
                .await
        })
    };
    let cancelled = peer(second.clone());
    let waiting = peer(second.clone());
    responsive(async {
        while second.oidc_refresh_waiter_count_for_test() < 2 {
            tokio::task::yield_now().await;
        }
    })
    .await;
    cancelled.abort();
    assert!(cancelled.await.unwrap_err().is_cancelled());
    assert_eq!(second.oidc_refresh_waiter_count_for_test(), 1);
    assert!(
        !waiting.is_finished(),
        "peer is waiting on the held provider"
    );

    // Both admission and fresh authentication on the blocked refresher's own
    // process remain usable with one connection reserved for each workload.
    let fresh_digest = Uuid::new_v4().to_string();
    let mut fresh = tokens.clone();
    fresh.validated_at = unbought_auth::now();
    responsive(first.complete_oidc_login(fresh, &fresh_digest, "csrf", None))
        .await
        .unwrap();
    responsive(first.revalidate_oidc_for_test(
        &fresh_digest,
        &tokens.identity.issuer,
        "orbit",
        |_| async { panic!("fresh identities must not acquire exhausted refresh capacity") },
    ))
    .await
    .unwrap();
    responsive(first.create_session(session.account, &Uuid::new_v4().to_string(), "csrf", None))
        .await
        .unwrap();
    // The peer's one ordinary read connection and one refresh connection are
    // both available while it waits. This catches connection-holding polling.
    responsive(second.oidc_refresh_pool_for_test().unwrap().acquire())
        .await
        .unwrap();
    responsive(second.lookup_session(&digest)).await.unwrap();
    release.send(()).unwrap();
    running.await.unwrap().unwrap();
    assert!(responsive(waiting).await.unwrap().is_ok());
    assert_eq!(second.oidc_refresh_waiter_count_for_test(), 0);
    second
        .revalidate_oidc_for_test(&digest, &tokens.identity.issuer, "orbit", |_| async {
            panic!("a peer must reuse the already refreshed identity")
        })
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let saved: serde_json::Value =
        sqlx::query_scalar("SELECT payload FROM oidc_session WHERE digest=$1")
            .bind(&digest)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved["refresh_token"], "rotated-refresh");
    sqlx::query("UPDATE oidc_session SET payload=jsonb_set(payload,'{validated_at}',to_jsonb($2::bigint)) WHERE digest=$1")
        .bind(&digest).bind(unbought_auth::now()-61).execute(&pool).await.unwrap();
    second
        .revalidate_oidc_for_test(
            &digest,
            &tokens.identity.issuer,
            "orbit",
            |mut tokens| async move {
                assert_eq!(tokens.refresh_token.as_deref(), Some("rotated-refresh"));
                tokens.validated_at = unbought_auth::now();
                Ok(tokens)
            },
        )
        .await
        .unwrap();
}

#[tokio::test]
async fn cancelled_caller_keeps_provider_and_persistence_rotation_alive() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = refresh_store(&url).await;
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    for persist in [false, true] {
        let tokens = refresh_fixture();
        let issuer = tokens.identity.issuer.clone();
        let digest = Uuid::new_v4().to_string();
        let session = store
            .complete_oidc_login(tokens, &digest, "csrf", None)
            .await
            .unwrap();
        let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
            .fetch_one(&store.oidc_refresh_pool_for_test().unwrap())
            .await
            .unwrap();
        let mut blocker = pool.begin().await.unwrap();
        if persist {
            sqlx::query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE")
                .bind(session.account.0)
                .fetch_one(&mut *blocker)
                .await
                .unwrap();
        }
        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, held) = tokio::sync::oneshot::channel();
        let running = {
            let store = store.clone();
            let digest = digest.clone();
            let issuer = issuer.clone();
            tokio::spawn(async move {
                store
                    .revalidate_oidc_for_test(&digest, &issuer, "orbit", |mut tokens| async move {
                        entered.send(()).unwrap();
                        held.await.unwrap();
                        tokens.validated_at = unbought_auth::now();
                        tokens.refresh_token = Some("surviving-rotation".into());
                        Ok(tokens)
                    })
                    .await
            })
        };
        started.await.unwrap();
        let mut release = Some(release);
        if persist {
            release.take().unwrap().send(()).unwrap();
            responsive(async {
                loop {
                    let blocked: bool = sqlx::query_scalar("SELECT COALESCE(wait_event_type='Lock',false) FROM pg_stat_activity WHERE pid=$1")
                        .bind(pid).fetch_one(&pool).await.unwrap();
                    if blocked { break; }
                    tokio::task::yield_now().await;
                }
            }).await;
        }
        running.abort();
        assert!(running.await.unwrap_err().is_cancelled());
        if let Some(release) = release {
            assert!(
                release.send(()).is_ok(),
                "caller cancellation must not drop the admitted provider request"
            );
        }
        blocker.commit().await.unwrap();
        responsive(store.revalidate_oidc_for_test(&digest, &issuer, "orbit", |_| async {
            panic!("a peer must reuse the committed rotation without replaying the provider request")
        })).await.unwrap();
        let saved: serde_json::Value =
            sqlx::query_scalar("SELECT payload FROM oidc_session WHERE digest=$1")
                .bind(&digest)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(saved["refresh_token"], "surviving-rotation");
        assert!(saved.get("rotation_claim_id").is_none());
        assert_eq!(
            store
                .lookup_session(&digest)
                .await
                .unwrap()
                .unwrap()
                .account,
            session.account
        );
    }
}

#[tokio::test]
async fn logout_wins_over_a_late_refresh_even_if_the_caller_cancelled() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let first = refresh_store(&url).await;
    let second = refresh_store(&url).await;
    first.migrate().await.unwrap();
    let tokens = refresh_fixture();
    for cancel in [false, true] {
        let digest = Uuid::new_v4().to_string();
        first
            .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
            .await
            .unwrap();
        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, held) = tokio::sync::oneshot::channel();
        let running = {
            let store = first.clone();
            let digest = digest.clone();
            let issuer = tokens.identity.issuer.clone();
            tokio::spawn(async move {
                store
                    .revalidate_oidc_for_test(&digest, &issuer, "orbit", |mut tokens| async move {
                        entered.send(()).unwrap();
                        held.await.unwrap();
                        tokens.validated_at = unbought_auth::now();
                        tokens.refresh_token = Some("late-refresh".into());
                        Ok(tokens)
                    })
                    .await
            })
        };
        started.await.unwrap();
        let peer = {
            let store = second.clone();
            let digest = digest.clone();
            let issuer = tokens.identity.issuer.clone();
            tokio::spawn(async move {
                store
                    .revalidate_oidc_for_test(&digest, &issuer, "orbit", |_| async {
                        panic!("waiting peer cannot replay or resurrect a revoked rotation")
                    })
                    .await
            })
        };
        responsive(async {
            while second.oidc_refresh_waiter_count_for_test() == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await;
        let mut running = Some(running);
        if cancel {
            let running = running.take().unwrap();
            running.abort();
            assert!(running.await.unwrap_err().is_cancelled());
        }
        responsive(second.revoke_session(&digest)).await.unwrap();
        assert!(first.lookup_session(&digest).await.unwrap().is_none());
        release.send(()).unwrap();
        if let Some(running) = running {
            assert!(matches!(
                running.await.unwrap(),
                Err(orbit_application::StoreError::Conflict)
            ));
        }
        // Wait for the admitted worker to release its single reserved slot,
        // then prove its late provider result did not resurrect the session.
        let _slot = responsive(first.oidc_refresh_pool_for_test().unwrap().acquire())
            .await
            .unwrap();
        assert!(first.lookup_session(&digest).await.unwrap().is_none());
        assert!(matches!(
            responsive(peer).await.unwrap(),
            Err(orbit_application::StoreError::Conflict)
        ));
        assert_eq!(second.oidc_refresh_waiter_count_for_test(), 0);
    }
}

#[tokio::test]
async fn oidc_session_rotation_wakes_the_revoked_accounts_streams() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let tokens = refresh_fixture();
    let previous = Uuid::new_v4().to_string();
    let old = store
        .complete_oidc_login(tokens.clone(), &previous, "csrf", None)
        .await
        .unwrap();
    let mut listener = sqlx::postgres::PgListener::connect(&url).await.unwrap();
    listener.listen("orbit_game_updates").await.unwrap();
    let next = Uuid::new_v4().to_string();
    store
        .complete_oidc_login(tokens, &next, "csrf-new", Some(previous.clone()))
        .await
        .unwrap();
    let notification = responsive(listener.recv()).await.unwrap();
    assert_eq!(notification.payload(), format!("account:{}", old.account.0));
    assert!(store.lookup_session(&previous).await.unwrap().is_none());
    assert!(store.lookup_session(&next).await.unwrap().is_some());
}

#[tokio::test]
async fn only_activity_renews_and_logout_or_expiry_wins_over_late_renewal() {
    use orbit_application::{SESSION_IDLE_SECONDS, StoreError};
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = refresh_store(&url).await;
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let tokens = refresh_fixture();
    let issuer = tokens.identity.issuer.clone();
    let digest = Uuid::new_v4().to_string();
    let session = store
        .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
        .await
        .unwrap();
    assert!(
        (session.expires_at / 1000 - unbought_auth::now() - i64::from(SESSION_IDLE_SECONDS)).abs()
            < 2
    );
    let old = (unbought_auth::now() + 60) * 1000;
    sqlx::query("UPDATE sessions SET expires_at=$2 WHERE digest=$1")
        .bind(&digest)
        .bind(old)
        .execute(&pool)
        .await
        .unwrap();
    store
        .revalidate_oidc_for_test(&digest, &issuer, "orbit", |mut tokens| async move {
            tokens.validated_at = unbought_auth::now();
            Ok(tokens)
        })
        .await
        .unwrap();
    assert_eq!(
        store
            .lookup_session(&digest)
            .await
            .unwrap()
            .unwrap()
            .expires_at,
        old
    );
    let deadline = unbought_auth::now() + i64::from(SESSION_IDLE_SECONDS);
    // Cached identity must not suppress foreground renewal.
    store
        .renew_oidc_for_test(&digest, &issuer, "orbit", move |tokens| async move {
            Ok((tokens, Some(deadline)))
        })
        .await
        .unwrap();
    assert_eq!(
        store
            .lookup_session(&digest)
            .await
            .unwrap()
            .unwrap()
            .expires_at,
        deadline * 1000
    );
    for expire in [false, true] {
        let digest = Uuid::new_v4().to_string();
        store
            .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
            .await
            .unwrap();
        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, held) = tokio::sync::oneshot::channel();
        let running = {
            let store = store.clone();
            let digest = digest.clone();
            let issuer = issuer.clone();
            tokio::spawn(async move {
                store
                    .renew_oidc_for_test(&digest, &issuer, "orbit", move |tokens| async move {
                        entered.send(()).unwrap();
                        held.await.unwrap();
                        Ok((tokens, Some(deadline)))
                    })
                    .await
            })
        };
        started.await.unwrap();
        if expire {
            sqlx::query("UPDATE sessions SET expires_at=0 WHERE digest=$1")
                .bind(&digest)
                .execute(&pool)
                .await
                .unwrap();
        } else {
            store.revoke_session(&digest).await.unwrap();
        }
        release.send(()).unwrap();
        assert!(matches!(running.await.unwrap(), Err(StoreError::Conflict)));
        assert!(store.lookup_session(&digest).await.unwrap().is_none());
        assert!(matches!(
            store
                .renew_oidc_for_test(&digest, &issuer, "orbit", |_| async {
                    panic!("expired sessions must not contact Accounts")
                })
                .await,
            Err(StoreError::Conflict)
        ));
    }
    // Local self-hosted login follows the same idle deadline without Accounts.
    let digest = Uuid::new_v4().to_string();
    store
        .create_session(session.account, &digest, "csrf", None)
        .await
        .unwrap();
    let until = store.renew_session(&digest, None).await.unwrap();
    assert!((until / 1000 - unbought_auth::now() - i64::from(SESSION_IDLE_SECONDS)).abs() < 2);
    store.revoke_session(&digest).await.unwrap();
    assert!(store.renew_session(&digest, None).await.is_err());
}

#[tokio::test]
async fn interrupted_activity_preserves_committed_rotation_and_retries_with_latest_token() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = refresh_store(&url).await;
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    for cancel in [true, false] {
        let tokens = refresh_fixture();
        let issuer = tokens.identity.issuer.clone();
        let digest = Uuid::new_v4().to_string();
        let before = store
            .complete_oidc_login(tokens, &digest, "csrf", None)
            .await
            .unwrap();
        let (entered, started) = tokio::sync::oneshot::channel();
        let running = {
            let store = store.clone();
            let digest = digest.clone();
            let issuer = issuer.clone();
            tokio::spawn(async move {
                store
                    .renew_oidc_after_revalidation_for_test(
                        &digest,
                        &issuer,
                        "orbit",
                        |mut tokens| async move {
                            tokens.refresh_token = Some("committed-refresh".into());
                            tokens.validated_at = unbought_auth::now();
                            Ok(tokens)
                        },
                        |tokens| async move {
                            assert_eq!(tokens.refresh_token.as_deref(), Some("committed-refresh"));
                            entered.send(()).unwrap();
                            // This pending remote operation models a stalled activity
                            // request. Its own timeout must leave rotation committed.
                            std::future::pending().await
                        },
                    )
                    .await
            })
        };
        started.await.unwrap();
        let saved: serde_json::Value =
            sqlx::query_scalar("SELECT payload FROM oidc_session WHERE digest=$1")
                .bind(&digest)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            saved["refresh_token"], "committed-refresh",
            "rotation must already be durable before activity starts"
        );
        if cancel {
            running.abort();
            assert!(running.await.unwrap_err().is_cancelled());
        } else {
            assert!(matches!(
                running.await.unwrap(),
                Err(orbit_application::StoreError::Unavailable)
            ));
        }
        assert_eq!(
            store
                .lookup_session(&digest)
                .await
                .unwrap()
                .unwrap()
                .expires_at,
            before.expires_at
        );
        let deadline = unbought_auth::now() + i64::from(orbit_application::SESSION_IDLE_SECONDS);
        store
            .renew_oidc_after_revalidation_for_test(
                &digest,
                &issuer,
                "orbit",
                |_| async { panic!("a recent committed validation should not rotate again") },
                move |tokens| async move {
                    assert_eq!(tokens.refresh_token.as_deref(), Some("committed-refresh"));
                    Ok((tokens, Some(deadline)))
                },
            )
            .await
            .unwrap();
        assert_eq!(
            store
                .lookup_session(&digest)
                .await
                .unwrap()
                .unwrap()
                .expires_at,
            deadline * 1000
        );
    }
}

#[tokio::test]
async fn ambiguous_rotation_never_replays_and_preserves_other_sessions() {
    use orbit_application::StoreError;
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = refresh_store(&url).await;
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    for persistence_failure in [false, true] {
        let tokens = refresh_fixture();
        let digest = Uuid::new_v4().to_string();
        let sibling = Uuid::new_v4().to_string();
        store
            .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
            .await
            .unwrap();
        let mut sibling_tokens = tokens.clone();
        sibling_tokens.refresh_token = Some("unrelated-session-refresh".into());
        store
            .complete_oidc_login(sibling_tokens, &sibling, "csrf", None)
            .await
            .unwrap();
        if persistence_failure {
            sqlx::raw_sql("CREATE FUNCTION fail_rotation_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'refresh_token' = 'provider-committed-rotation' THEN RAISE EXCEPTION 'controlled rotation commit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER fail_rotation_commit AFTER UPDATE ON oidc_session DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_rotation_commit();")
                .execute(&pool).await.unwrap();
        }
        let result = store
            .revalidate_oidc_for_test(
                &digest,
                &tokens.identity.issuer,
                "orbit",
                move |mut fresh| async move {
                    // The provider has committed here. Either its response is lost or
                    // Orbit's later account update makes the local transaction fail.
                    fresh.refresh_token = Some("provider-committed-rotation".into());
                    fresh.validated_at = unbought_auth::now();
                    if persistence_failure {
                        Ok(fresh)
                    } else {
                        Err(unbought_auth::Error::Unavailable)
                    }
                },
            )
            .await;
        if persistence_failure {
            assert!(matches!(result, Err(StoreError::Unavailable)));
            sqlx::raw_sql("DROP TRIGGER fail_rotation_commit ON oidc_session; DROP FUNCTION fail_rotation_commit();")
                .execute(&pool).await.unwrap();
        } else {
            assert!(matches!(result, Err(StoreError::Conflict)));
        }
        let saved: serde_json::Value =
            sqlx::query_scalar("SELECT payload FROM oidc_session WHERE digest=$1")
                .bind(&digest)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(
            saved.get("refresh_token").is_none(),
            "failed persistence must retain the committed claim"
        );
        assert!(saved.get("rotation_claim_id").is_some());
        let old_consumer: unbought_auth::Tokens = serde_json::from_value(saved).unwrap();
        assert!(
            old_consumer.refresh_token.is_none(),
            "rollback cannot restore replay capability"
        );
        assert_eq!(old_consumer.validated_at, 0);
        sqlx::query("UPDATE oidc_session SET payload=jsonb_set(payload,'{rotation_deadline_ms}','0') WHERE digest=$1")
            .bind(&digest).execute(&pool).await.unwrap();
        for _ in 0..3 {
            assert!(matches!(
                store
                    .revalidate_oidc_for_test(
                        &digest,
                        &tokens.identity.issuer,
                        "orbit",
                        |_| async {
                            panic!("ambiguous rotation must never send a repeated provider request")
                        }
                    )
                    .await,
                Err(StoreError::Conflict)
            ));
        }
        store
            .revalidate_oidc_for_test(
                &sibling,
                &tokens.identity.issuer,
                "orbit",
                |mut fresh| async move {
                    assert_eq!(
                        fresh.refresh_token.as_deref(),
                        Some("unrelated-session-refresh")
                    );
                    fresh.validated_at = unbought_auth::now();
                    Ok(fresh)
                },
            )
            .await
            .unwrap();
        assert!(store.lookup_session(&sibling).await.unwrap().is_some());
    }
}

#[tokio::test]
async fn blocked_provider_does_not_starve_game_reads_admission_or_worker_commits() {
    use orbit_application::*;
    use orbit_engine::Building;
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = PgStore::connect_with_limits(
        &url,
        orbit_storage_postgres::PoolLimits {
            admission: 1,
            reads: 1,
            refresh: 1,
            worker: 1,
            control: 2,
        },
    )
    .await
    .unwrap();
    store.migrate().await.unwrap();
    let universe = Uuid::new_v4().into();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store
        .seed(universe, 1_000_000, 1, &passwords)
        .await
        .unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &passwords[0], None)
        .await
        .unwrap();
    let actor = Actor::Player(login.session.memberships[0].player);
    let game = GameService::new(store.clone());
    let tokens = refresh_fixture();
    let digest = Uuid::new_v4().to_string();
    store
        .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
        .await
        .unwrap();
    let (entered, started) = tokio::sync::oneshot::channel();
    let (release, held) = tokio::sync::oneshot::channel();
    let running = {
        let store = store.clone();
        tokio::spawn(async move {
            store
                .revalidate_oidc_for_test(
                    &digest,
                    &tokens.identity.issuer,
                    "orbit",
                    |mut fresh| async move {
                        entered.send(()).unwrap();
                        held.await.unwrap();
                        fresh.validated_at = unbought_auth::now();
                        Ok(fresh)
                    },
                )
                .await
        })
    };
    started.await.unwrap();
    responsive(async {
        let snapshot = game
            .initial_game(&login.session, Uuid::new_v4())
            .await
            .unwrap();
        assert!(snapshot.is_some());
        let view = game.view(actor, universe).await.unwrap();
        let body = view.bodies[0].id;
        let quote = game
            .quote(
                actor,
                universe,
                QuoteRequest::Upgrade {
                    body,
                    building: Building::MetalMine,
                },
            )
            .await
            .unwrap();
        let receipt = game
            .submit(
                actor,
                universe,
                CommandEnvelope {
                    command_id: Uuid::new_v4().into(),
                    epoch: view.epoch,
                    protocol: 2,
                    command: Command::StartUpgrade {
                        body,
                        building: Building::MetalMine,
                        expected_terms_hash: quote.terms_hash,
                    },
                },
            )
            .await
            .unwrap();
        assert!(matches!(receipt.status, ReceiptStatus::Pending));
        let claim = store
            .claim_next(universe, Uuid::new_v4().into())
            .await
            .unwrap()
            .unwrap();
        let facts = store.load_claim(&claim).await.unwrap().state;
        let rules = store.load_rules(universe).await.unwrap();
        let result = orbit_engine::transition(&facts, &claim.input, &rules);
        assert!(matches!(
            store.commit_claim(&claim, result).await.unwrap(),
            CommitOutcome::Committed { .. }
        ));
    })
    .await;
    release.send(()).unwrap();
    running.await.unwrap().unwrap();
}

#[path = "support/oidc_provider.rs"]
mod provider_cases;

#[tokio::test]
async fn observer_metadata_changes_only_on_persisted_rotation_and_disappears_on_logout() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = refresh_store(&url).await;
    store.migrate().await.unwrap();
    let tokens = refresh_fixture();
    let digest = Uuid::new_v4().to_string();
    store
        .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
        .await
        .unwrap();
    let initial = store.oidc_session_metadata(&digest).await.unwrap().unwrap();
    assert_eq!(initial.identity_valid_until, tokens.identity.expires_at);
    store
        .revalidate_oidc_for_test(
            &digest,
            &tokens.identity.issuer,
            "orbit",
            |mut fresh| async move {
                fresh.validated_at = unbought_auth::now();
                fresh.identity.expires_at += 60;
                Ok(fresh)
            },
        )
        .await
        .unwrap();
    let rotated = store.oidc_session_metadata(&digest).await.unwrap().unwrap();
    assert_ne!(rotated.refresh_generation, initial.refresh_generation);
    assert_eq!(
        rotated.identity_valid_until,
        initial.identity_valid_until + 60
    );
    store
        .renew_oidc_for_test(
            &digest,
            &tokens.identity.issuer,
            "orbit",
            |fresh| async move { Ok((fresh, Some(unbought_auth::now() + 300))) },
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .oidc_session_metadata(&digest)
            .await
            .unwrap()
            .unwrap()
            .refresh_generation,
        rotated.refresh_generation
    );
    store.revoke_session(&digest).await.unwrap();
    assert!(
        store
            .oidc_session_metadata(&digest)
            .await
            .unwrap()
            .is_none()
    );
}

#[derive(Default)]
struct RefreshQueueObserver(tokio::sync::Notify);
impl orbit_application::RuntimeObserver for RefreshQueueObserver {
    fn duration(&self, stage: orbit_application::RuntimeStage, _: std::time::Duration) {
        if matches!(stage, orbit_application::RuntimeStage::PoolWait) {
            self.0.notify_one();
        }
    }
    fn event(&self, _: orbit_application::RuntimeEvent) {}
}

#[tokio::test]
async fn committed_rotation_claim_keeps_its_slot_ahead_of_a_queued_refresh() {
    use std::{future::Future, task::Poll};
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = refresh_store(&url).await;
    store.migrate().await.unwrap();
    let tokens = refresh_fixture();
    let digest = Uuid::new_v4().to_string();
    store
        .complete_oidc_login(tokens.clone(), &digest, "csrf", None)
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let mut held = pool.begin().await.unwrap();
    // The owner checks out the single refresh slot, then blocks writing its
    // durable claim. Queue a peer before allowing that claim to commit.
    sqlx::query("SELECT digest FROM oidc_session WHERE digest=$1 FOR UPDATE")
        .bind(&digest)
        .fetch_one(&mut *held)
        .await
        .unwrap();
    let observer = std::sync::Arc::new(RefreshQueueObserver::default());
    let refresh_pool = store.oidc_refresh_pool_for_test().unwrap();
    let owner = store.with_observer(observer.clone());
    let (entered, mut started) = tokio::sync::oneshot::channel();
    let (release, blocked) = tokio::sync::oneshot::channel();
    let running = tokio::spawn(async move {
        owner
            .revalidate_oidc_for_test(
                &digest,
                &tokens.identity.issuer,
                "orbit",
                |mut fresh| async move {
                    entered.send(()).unwrap();
                    blocked.await.unwrap();
                    fresh.validated_at = unbought_auth::now();
                    Ok(fresh)
                },
            )
            .await
    });
    observer.0.notified().await;
    // Poll the acquisition to Pending with cooperative yielding disabled: the
    // single slot is held, so this installs the fair pool's queued waiter. It
    // models another request reserving the slot, without a scheduler race.
    let mut peer = Box::pin(tokio::task::unconstrained(refresh_pool.acquire()));
    std::future::poll_fn(|cx| {
        assert!(peer.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
    held.commit().await.unwrap();
    responsive(async {
        tokio::select! {
            result = &mut started => result.unwrap(),
            result = &mut peer => {
                let _slot = result.unwrap();
                panic!("claim commit returned its reserved slot to a queued peer");
            },
        }
    })
    .await;
    release.send(()).unwrap();
    running.await.unwrap().unwrap();
    // The queued request receives capacity after the owner's durable result.
    let _peer_slot = responsive(peer).await.unwrap();
}

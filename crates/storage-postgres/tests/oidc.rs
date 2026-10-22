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
        Err(orbit_application::StoreError::Unavailable)
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
async fn logout_wins_over_a_late_refresh_and_cancelled_refresh_releases_its_lock() {
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
        if cancel {
            running.abort();
            assert!(running.await.unwrap_err().is_cancelled());
            // Reacquiring the owner's connection also completes SQLx's queued rollback.
            first
                .revalidate_oidc_for_test(
                    &digest,
                    &tokens.identity.issuer,
                    "orbit",
                    |mut tokens| async move {
                        assert_eq!(tokens.refresh_token.as_deref(), Some("old-refresh"));
                        tokens.validated_at = unbought_auth::now();
                        Ok(tokens)
                    },
                )
                .await
                .unwrap();
            second
                .revalidate_oidc_for_test(&digest, &tokens.identity.issuer, "orbit", |_| async {
                    panic!("the recovered result is visible across replicas")
                })
                .await
                .unwrap();
        } else {
            responsive(second.revoke_session(&digest)).await.unwrap();
            assert!(first.lookup_session(&digest).await.unwrap().is_none());
            release.send(()).unwrap();
            assert!(matches!(
                running.await.unwrap(),
                Err(orbit_application::StoreError::Conflict)
            ));
            assert!(first.lookup_session(&digest).await.unwrap().is_none());
        }
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
        .renew_oidc_for_test(&digest, &issuer, "orbit", |tokens| async move {
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
                    .renew_oidc_for_test(&digest, &issuer, "orbit", |tokens| async move {
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

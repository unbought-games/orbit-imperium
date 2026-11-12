use orbit_application::*;
use orbit_storage_postgres::PgStore;
use orbit_transport_http::{
    HttpConfig, router_with_auth,
    test_http::{Body, Request},
};
use tower::ServiceExt;
use uuid::Uuid;

const ISSUER: &str = "https://identity.example.test/api/auth";
async fn account(store: &PgStore) -> (AuthenticatedSession, String) {
    let token = unbought_auth::digest(&Uuid::new_v4().to_string());
    let now = unbought_auth::now();
    let session = store
        .complete_oidc_login(
            unbought_auth::Tokens {
                client_id: "orbit".into(),
                identity: unbought_auth::Identity {
                    issuer: ISSUER.into(),
                    subject: Uuid::new_v4().to_string(),
                    username: format!("inv_{}", &Uuid::new_v4().simple().to_string()[..12]),
                    email_verified: false,
                    supporter_tier: None,
                    session_id: Uuid::new_v4().to_string(),
                    issued_at: now,
                    expires_at: now + 300,
                },
                access_token: "fixture".into(),
                refresh_token: None,
                nonce: "fixture".into(),
                validated_at: now,
            },
            &unbought_auth::digest(&token),
            "fixture-csrf",
            None,
        )
        .await
        .unwrap();
    (session, token)
}
async fn universe(store: &PgStore) -> SignupPolicy {
    let id = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe: id,
            immutable: UniverseImmutable {
                systems_per_galaxy: 5,
                ..Default::default()
            },
            policy: UniversePolicy {
                signup_per_minute: 100,
                ..Default::default()
            },
        })
        .await
        .unwrap();
    SignupPolicy {
        universe: id,
        max_players: 100,
    }
}
#[tokio::test]
async fn invitation_issuance_and_http_enrollment_keep_the_bound_world_and_epoch() {
    let url =
        std::env::var("TEST_DATABASE_URL").expect("use make test-db DB_SUITES=game_invitations");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let a = universe(&store).await;
    let b = universe(&store).await;
    let (inviter, _) = account(&store).await;
    store.enroll_oidc(inviter.account, a).await.unwrap();
    store.enroll_oidc(inviter.account, b).await.unwrap();
    let (left, right) = tokio::join!(
        store.reserve_game_invitation(
            inviter.account,
            ISSUER,
            "issue-one",
            b.universe,
            "personal",
            None
        ),
        store.reserve_game_invitation(
            inviter.account,
            ISSUER,
            "issue-one",
            b.universe,
            "personal",
            None
        )
    );
    let bound = left.unwrap();
    assert_eq!(right.unwrap(), bound);
    assert!(matches!(
        store
            .reserve_game_invitation(
                inviter.account,
                ISSUER,
                "issue-one",
                a.universe,
                "personal",
                None
            )
            .await,
        Err(StoreError::Conflict)
    ));
    let code = format!("inv_{}", Uuid::new_v4().simple());
    store
        .finish_game_invitation(inviter.account, ISSUER, "issue-one", &code)
        .await
        .unwrap();
    store
        .finish_game_invitation(inviter.account, ISSUER, "issue-one", &code)
        .await
        .unwrap();
    assert!(
        store
            .finish_game_invitation(inviter.account, ISSUER, "issue-one", "different")
            .await
            .is_err()
    );
    assert_eq!(
        store
            .game_invitation_destination(&code, ISSUER)
            .await
            .unwrap(),
        Some(bound.clone())
    );
    assert!(
        store
            .game_invitation_destination("legacy-unbound", ISSUER)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .game_invitation_destination(&code, "https://another-issuer.test")
            .await
            .unwrap()
            .is_none()
    );
    let preview = store
        .game_invitation_universe(&bound)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(preview.id, b.universe.0);
    assert_eq!(preview.players, 1);
    assert_eq!(preview.admission(), "open");
    let (recipient, token) = account(&store).await;
    store.enroll_oidc(recipient.account, a).await.unwrap();
    assert!(
        store
            .reserve_game_invitation(
                recipient.account,
                ISSUER,
                "spoof",
                b.universe,
                "personal",
                None
            )
            .await
            .is_err()
    );
    let (_drain, rx) = tokio::sync::watch::channel(false);
    let app = router_with_auth(
        store.clone(),
        HttpConfig {
            origin: "https://game.example.test".into(),
            assets: "absent".into(),
            login_per_minute: 100,
            signup: None,
            signup_per_minute: 100,
            legacy_signup_enabled: false,
            wake: None,
            observer: None,
        },
        rx,
        Some(
            unbought_auth::RelyingParty::new(unbought_auth::Configuration {
                issuer: ISSUER.into(),
                client_id: "orbit".into(),
                client_secret: "fixture".into(),
                redirect_uri: "https://game.example.test/api/auth/callback".into(),
            })
            .unwrap(),
        ),
    );
    let request = |universe: UniverseId, invitation: &str, csrf: &str| {
        Request::post("/api/auth/enroll")
            .header("origin", "https://game.example.test")
            .header("cookie", format!("orbit_session={token}"))
            .header("x-csrf-token", csrf)
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({"universe":universe.0,"invitation_code":invitation}).to_string(),
            ))
            .unwrap()
    };
    assert_eq!(
        app.clone()
            .oneshot(request(a.universe, &code, "fixture-csrf"))
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        app.clone()
            .oneshot(request(b.universe, &code, "wrong"))
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        app.clone()
            .oneshot(request(b.universe, "legacy-unbound", "fixture-csrf"))
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        app.clone()
            .oneshot(request(b.universe, &code, "fixture-csrf"))
            .await
            .unwrap()
            .status(),
        204
    );
    let memberships: Vec<Uuid> = sqlx::query_scalar(
        "SELECT universe FROM universe_memberships WHERE account=$1 ORDER BY universe",
    )
    .bind(recipient.account.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(memberships.len(), 2);
    assert!(memberships.contains(&b.universe.0));
    let selected = app
        .clone()
        .oneshot(
            Request::get("/api/v1/bootstrap")
                .header("cookie", format!("orbit_session={token}"))
                .header("x-orbit-universe", b.universe.0.to_string())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bytes = axum::body::to_bytes(selected.into_body(), usize::MAX)
        .await
        .unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(
        payload["result"]["game"]["snapshot"]["candidate"]["binding"]["universe"],
        b.universe.0.to_string()
    );
    let unauthorized = app
        .clone()
        .oneshot(
            Request::get("/api/v1/bootstrap")
                .header("cookie", format!("orbit_session={token}"))
                .header("x-orbit-universe", Uuid::new_v4().to_string())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bytes = axum::body::to_bytes(unauthorized.into_body(), usize::MAX)
        .await
        .unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(payload["result"]["game"]["status"], "unavailable");
    let mut policy = store.universe_config(b.universe).await.unwrap();
    policy.policy.signup_enabled = false;
    store.apply_universe_config(&policy).await.unwrap();
    assert_eq!(
        app.clone()
            .oneshot(request(b.universe, &code, "fixture-csrf"))
            .await
            .unwrap()
            .status(),
        204,
        "existing membership is idempotent even when closed"
    );
    let (third, _) = account(&store).await;
    assert!(matches!(
        store
            .enroll_oidc_at_epoch(third.account, b, None, Epoch(bound.epoch_id))
            .await,
        Err(StoreError::SignupClosed)
    ));
    let mut policy = store.universe_config(b.universe).await.unwrap();
    policy.policy.signup_enabled = true;
    policy.policy.max_players = Some(2);
    store.apply_universe_config(&policy).await.unwrap();
    assert!(matches!(
        store
            .enroll_oidc_at_epoch(third.account, b, None, Epoch(bound.epoch_id))
            .await,
        Err(StoreError::UniverseFull)
    ));
    // Simulate a reset after a delivered preview. The mutation checks under the
    // enrollment lock, including the existing-member branch, not just on GET.
    sqlx::query("UPDATE universes SET epoch=$2 WHERE id=$1")
        .bind(b.universe.0)
        .bind(Uuid::new_v4())
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store
            .enroll_oidc_at_epoch(recipient.account, b, None, Epoch(bound.epoch_id))
            .await,
        Err(StoreError::Conflict)
    ));
    assert_eq!(
        app.oneshot(request(b.universe, &code, "fixture-csrf"))
            .await
            .unwrap()
            .status(),
        404
    );
}

#[tokio::test]
async fn alliance_public_binding_survives_creator_departure_without_personal_identity() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let policy = universe(&store).await;
    let (creator, _) = account(&store).await;
    let (successor, _) = account(&store).await;
    store.enroll_oidc(creator.account, policy).await.unwrap();
    store.enroll_oidc(successor.account, policy).await.unwrap();
    let player: Uuid = sqlx::query_scalar(
        "SELECT player FROM universe_memberships WHERE universe=$1 AND account=$2",
    )
    .bind(policy.universe.0)
    .bind(creator.account.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    let other: Uuid = sqlx::query_scalar(
        "SELECT player FROM universe_memberships WHERE universe=$1 AND account=$2",
    )
    .bind(policy.universe.0)
    .bind(successor.account.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    let epoch: Uuid = sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
        .bind(policy.universe.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let alliance = Uuid::new_v4();
    sqlx::query("INSERT INTO alliances(universe,epoch,id,name,tag,leader,recruitment,public_text,revision,roles,posts,audit,invitation) VALUES($1,$2,$3,'Fixture explorers','FIX',$4,'Open','',1,'[]','[]','[]',$5)").bind(policy.universe.0).bind(epoch).bind(alliance).bind(player).bind(Uuid::new_v4()).execute(&pool).await.unwrap();
    for member in [player, other] {
        sqlx::query("INSERT INTO alliance_memberships(universe,epoch,player,alliance,joined_at,roles) VALUES($1,$2,$3,$4,1,'[]')").bind(policy.universe.0).bind(epoch).bind(member).bind(alliance).execute(&pool).await.unwrap();
    }
    let public = store
        .reserve_game_invitation(
            creator.account,
            ISSUER,
            "public",
            policy.universe,
            "alliance_public",
            Some(alliance),
        )
        .await
        .unwrap();
    let combined = store
        .reserve_game_invitation(
            creator.account,
            ISSUER,
            "combined",
            policy.universe,
            "combined",
            Some(alliance),
        )
        .await
        .unwrap();
    store
        .finish_game_invitation(creator.account, ISSUER, "public", "inv_public")
        .await
        .unwrap();
    store
        .finish_game_invitation(creator.account, ISSUER, "combined", "inv_combined")
        .await
        .unwrap();
    assert_eq!(
        store.game_invitation_sponsor(&combined).await.unwrap(),
        Some(alliance)
    );
    sqlx::query("UPDATE alliances SET leader=$2 WHERE id=$1")
        .bind(alliance)
        .bind(other)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM alliance_memberships WHERE player=$1")
        .bind(player)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .game_invitation_sponsor(&combined)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store.game_invitation_sponsor(&public).await.unwrap(),
        Some(alliance)
    );
    sqlx::query("DELETE FROM universe_memberships WHERE account=$1 AND universe=$2")
        .bind(creator.account.0)
        .bind(policy.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .game_invitation_destination("inv_combined", ISSUER)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store
            .game_invitation_destination("inv_public", ISSUER)
            .await
            .unwrap(),
        Some(public.clone())
    );
    sqlx::query("UPDATE alliances SET invitation=NULL WHERE id=$1")
        .bind(alliance)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store
            .game_invitation_destination("inv_public", ISSUER)
            .await
            .unwrap()
            .is_none()
    );
}

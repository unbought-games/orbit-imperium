use orbit_application::*;
use orbit_engine::{Building, TransitionResult};
use orbit_storage_postgres::PgStore;
use serde_json::Value;
use uuid::Uuid;

#[tokio::test]
async fn evidence_recovery_and_award_sources_are_transactional() {
    let url =
        std::env::var("TEST_DATABASE_URL").expect("use make test-db DB_SUITES=community_rewards");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    let before_midnight = 1767311999000_i64;
    store
        .seed(universe, before_midnight, 1, &passwords)
        .await
        .unwrap();
    store.set_test_time(before_midnight).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &passwords[0], None)
        .await
        .unwrap();
    let account = login.session.account;
    let subject = format!("opaque-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO oidc_identity(issuer,subject,account) VALUES('https://accounts.test/api/auth',$1,$2)")
        .bind(&subject).bind(account.0).execute(&pool).await.unwrap();
    let actor = Actor::Player(login.session.memberships[0].player);
    let game = GameService::new(store.clone());
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
    let envelope = CommandEnvelope {
        command_id: CommandId(Uuid::new_v4()),
        epoch: view.epoch,
        protocol: 2,
        command: Command::StartUpgrade {
            body,
            building: Building::MetalMine,
            expected_terms_hash: quote.terms_hash,
        },
    };
    game.submit(actor, universe, envelope.clone())
        .await
        .unwrap();
    let claim = store
        .claim_next(universe, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_claim(&claim).await.unwrap();
    let rules = store.load_rules(universe).await.unwrap();
    let outcome = orbit_engine::transition(&facts.state, &claim.input, &rules);
    assert!(matches!(&outcome, TransitionResult::Applied(_)));
    // Recovery after midnight retains the durable input date and cannot award twice.
    store.set_test_time(before_midnight + 2000).await.unwrap();
    store.commit_claim(&claim, outcome.clone()).await.unwrap();
    store.commit_claim(&claim, outcome).await.unwrap();
    let days: Vec<String> =
        sqlx::query_scalar("SELECT date::text FROM community_participation WHERE account=$1")
            .bind(account.0)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(days, vec!["2026-01-01"]);
    let day_events: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM community_outbox WHERE account=$1 AND kind='qualifying_day'",
    )
    .bind(account.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(day_events, 1);
    let events = store
        .claim_community_events("https://accounts.test/api/auth")
        .await
        .unwrap();
    let day = events
        .iter()
        .find(|e| e["kind"] == "qualifying_day")
        .unwrap();
    assert_eq!(day["subject"], subject);
    let id = serde_json::from_value(day["id"].clone()).unwrap();
    let lease = serde_json::from_value(day["lease"].clone()).unwrap();
    store
        .acknowledge_community_event(id, Uuid::new_v4(), false, None)
        .await
        .unwrap();
    let state: String = sqlx::query_scalar("SELECT state FROM community_outbox WHERE id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(state, "pending", "stale lease cannot acknowledge");
    store
        .acknowledge_community_event(id, lease, false, None)
        .await
        .unwrap();
    let award = CommunityDelivery {
        operation: DeliveryOperation::Grant,
        grant_award_id: None,
        award_id: format!("award:{}", Uuid::new_v4()),
        subject: subject.clone(),
        reward_id: "fixture:emblem".into(),
        kind: "emblem".into(),
        item_id: "uninstalled-fixture".into(),
        source_id: "fixture-milestone".into(),
        rule_version: "v1".into(),
        awarded_at: "2026-01-01T00:00:00Z".into(),
    };
    let (one, two) = tokio::join!(
        store.deliver_community_award("https://accounts.test/api/auth", &award),
        store.deliver_community_award("https://accounts.test/api/auth", &award)
    );
    one.unwrap();
    two.unwrap();
    let mut alternate = award.clone();
    alternate.award_id = format!("award:{}", Uuid::new_v4());
    alternate.source_id = "fixture-manual".into();
    store
        .deliver_community_award("https://accounts.test/api/auth", &alternate)
        .await
        .unwrap();
    let counts:(i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM cosmetic_grants WHERE account=$1 AND item_id='uninstalled-fixture'),(SELECT count(*) FROM cosmetic_grant_sources WHERE account=$1 AND item_id='uninstalled-fixture')").bind(account.0).fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (1, 2));
    let mut conflict = award.clone();
    conflict.item_id = "other-fixture".into();
    assert!(matches!(
        store
            .deliver_community_award("https://accounts.test/api/auth", &conflict)
            .await,
        Err(StoreError::Conflict)
    ));
    assert_eq!(
        store
            .community_pending_receipts()
            .await
            .unwrap()
            .iter()
            .filter(|r| r["award_id"] == award.award_id)
            .count(),
        1
    );
    store
        .acknowledge_community_receipts(std::slice::from_ref(&award.award_id))
        .await
        .unwrap();
    assert!(
        !store
            .community_pending_receipts()
            .await
            .unwrap()
            .iter()
            .any(|r| r["award_id"] == award.award_id)
    );
    let mut revoke = alternate.clone();
    revoke.operation = DeliveryOperation::Revoke;
    revoke.grant_award_id = Some(alternate.award_id.clone());
    revoke.award_id = format!("revoke:{}", Uuid::new_v4());
    store
        .deliver_community_award("https://accounts.test/api/auth", &revoke)
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM cosmetic_grants WHERE account=$1 AND item_id='uninstalled-fixture'",
    )
    .bind(account.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1, "another legitimate source preserves ownership");
    let mut late = award.clone();
    late.award_id = format!("late:{}", Uuid::new_v4());
    late.item_id = "late-fixture".into();
    let mut tombstone = late.clone();
    tombstone.operation = DeliveryOperation::Revoke;
    tombstone.grant_award_id = Some(late.award_id.clone());
    tombstone.award_id = format!("revoke:{}", Uuid::new_v4());
    store
        .deliver_community_award("https://accounts.test/api/auth", &tombstone)
        .await
        .unwrap();
    let (replayed, revoked) = tokio::join!(
        store.deliver_community_award("https://accounts.test/api/auth", &late),
        store.deliver_community_award("https://accounts.test/api/auth", &tombstone)
    );
    replayed.unwrap();
    revoked.unwrap();
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM cosmetic_grants WHERE account=$1 AND item_id='late-fixture'",
    )
    .bind(account.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0, "late grant cannot resurrect revoked source");
    // Deleting a current empire does not erase the first retained join.
    sqlx::query("UPDATE empire_profiles SET joined_at=NULL WHERE player=$1")
        .bind(login.session.memberships[0].player.0)
        .execute(&pool)
        .await
        .unwrap();
    store.community_capture_history(account).await.unwrap();
    let established: Value = sqlx::query_scalar(
        "SELECT payload FROM community_outbox WHERE account=$1 AND kind='established_player'",
    )
    .bind(account.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(established["existed_before"].is_string());
    assert!(established.get("joined_at").is_none());
    let callback = InvitationEvidenceRequest {
        contract_version: 1,
        operation_id: format!("operation:{}", Uuid::new_v4()),
        recipient_ref: "unlinked-new-account".into(),
        invitation_id: "fixture-link".into(),
        issuer_subject: None,
        alliance: CommunityAllianceIdentity {
            universe_id: universe.0,
            epoch_id: view.epoch.0,
            alliance_id: Uuid::new_v4(),
        },
        proposed_type: "alliance_public".into(),
    };
    let receipt = store
        .community_invitation_evidence("https://accounts.test/api/auth", &callback)
        .await
        .unwrap();
    assert_eq!(receipt["alliance_active"], false);
    assert_eq!(receipt["contract_version"], 1);
    assert_eq!(
        store
            .community_invitation_evidence("https://accounts.test/api/auth", &callback)
            .await
            .unwrap(),
        receipt
    );
    let mut mismatch = callback.clone();
    mismatch.recipient_ref = "another-account".into();
    assert!(matches!(
        store
            .community_invitation_evidence("https://accounts.test/api/auth", &mismatch)
            .await,
        Err(StoreError::Conflict)
    ));

    let empty_snapshot = AllianceSnapshotRequest {
        contract_version: 1,
        operation_id: format!("empty-snapshot:{}", Uuid::new_v4()),
        alliance: callback.alliance.clone(),
        honor_id: "fixture-empty-honor".into(),
        reached_at: "2026-01-02T00:00:00Z".into(),
    };
    let empty = store
        .community_alliance_snapshot("https://accounts.test/api/auth", &empty_snapshot)
        .await
        .unwrap();
    assert_eq!(
        empty["recipients"],
        serde_json::json!([]),
        "a valid empty eligibility set is durable, not a delivery failure"
    );
    assert_eq!(
        store
            .community_alliance_snapshot("https://accounts.test/api/auth", &empty_snapshot)
            .await
            .unwrap(),
        empty
    );
    pool.close().await;
}

#[tokio::test]
async fn automatic_title_delivery_preserves_the_players_selected_title() {
    let url =
        std::env::var("TEST_DATABASE_URL").expect("use make test-db DB_SUITES=community_rewards");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    // Unique retained identity rows keep this case independent of seeded gameplay.
    let account = AccountId(Uuid::new_v4());
    let player = PlayerId(Uuid::new_v4());
    let profile = Uuid::new_v4();
    sqlx::query("INSERT INTO accounts(id,name,password_hash) VALUES($1,$2,'unused-test-password')")
        .bind(account.0)
        .bind(format!("title-{}", account.0))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO orbit_profiles(id,account) VALUES($1,$2)")
        .bind(profile)
        .bind(account.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO empire_profiles(player,profile,universe,epoch,universe_name,recorded_name,joined_at) VALUES($1,$2,$3,$4,'Fixture universe','Fixture commander',1767311999000)")
        .bind(player.0).bind(profile).bind(Uuid::new_v4()).bind(Uuid::new_v4()).execute(&pool).await.unwrap();
    let subject = format!("automatic-title-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO oidc_identity(issuer,subject,account) VALUES('https://accounts.test/api/auth',$1,$2)")
        .bind(&subject).bind(account.0).execute(&pool).await.unwrap();
    for (selected, earned) in [
        ("commander", "sample-pathfinder"),
        ("consul", "sample-stargazer"),
    ] {
        sqlx::query("UPDATE empire_profiles SET title_id=$2 WHERE player=$1")
            .bind(player.0)
            .bind(selected)
            .execute(&pool)
            .await
            .unwrap();
        let before: (String, i64) =
            sqlx::query_as("SELECT title_id,revision FROM empire_profiles WHERE player=$1")
                .bind(player.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        let award = CommunityDelivery {
            operation: DeliveryOperation::Grant,
            grant_award_id: None,
            award_id: format!("title-award:{}", Uuid::new_v4()),
            subject: subject.clone(),
            reward_id: format!("fixture:title:{earned}"),
            kind: "title".into(),
            item_id: earned.into(),
            source_id: "fixture-renown-threshold".into(),
            rule_version: "v1".into(),
            awarded_at: "2026-01-01T00:00:00Z".into(),
        };
        for _ in 0..2 {
            store
                .deliver_community_award("https://accounts.test/api/auth", &award)
                .await
                .unwrap();
        }
        let after: (String, i64) =
            sqlx::query_as("SELECT title_id,revision FROM empire_profiles WHERE player=$1")
                .bind(player.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            after, before,
            "an automatic grant never equips or revises the displayed identity"
        );
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM cosmetic_grants WHERE account=$1 AND kind='title' AND item_id=$2",
        )
        .bind(account.0)
        .bind(earned)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            count, 1,
            "the permanent title grant survives duplicate delivery"
        );
    }
    pool.close().await;
}

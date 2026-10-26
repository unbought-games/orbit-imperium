use super::*;
use orbit_engine::{UniverseId, UniverseOptions};

fn create(speed: i32) -> UniverseCreate {
    UniverseCreate {
        universe: UniverseId(Uuid::new_v4()),
        immutable: UniverseImmutable {
            speed,
            systems_per_galaxy: 2,
            ..Default::default()
        },
        policy: UniversePolicy::default(),
    }
}
fn registration(universe: UniverseId) -> Registration {
    Registration {
        name: format!("config-{}", Uuid::new_v4()),
        password_hash: "test-hash".into(),
        policy: SignupPolicy {
            universe,
            max_players: u32::MAX,
        },
        digest: Uuid::new_v4().to_string(),
        csrf: Uuid::new_v4().to_string(),
        previous: None,
    }
}
#[tokio::test]
async fn universe_configuration_transactions_and_live_enrollment() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    for speed in [1, 5, 10, 100] {
        let request = create(speed);
        let (a, b) = tokio::join!(
            store.create_universe(&request),
            store.create_universe(&request)
        );
        assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
        let doc = store.universe_config(request.universe).await.unwrap();
        assert_eq!(doc.immutable.speed, speed);
        assert_eq!(doc.base_revision, 0);
        let counts: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM universe_runtime WHERE universe=$1),(SELECT count(*) FROM world_heads WHERE universe=$1),(SELECT count(*) FROM bodies WHERE universe=$1)")
            .bind(request.universe.0).fetch_one(&pool).await.unwrap();
        assert_eq!(counts, (1, 1, 0));
    }
    let request = create(5);
    let mut doc = store.create_universe(&request).await.unwrap();
    let u = request.universe;
    let retained: (Uuid, String, Vec<u8>) = sqlx::query_as("SELECT epoch,profile_hash,secret FROM universes JOIN mvp_bootstraps ON id=universe WHERE id=$1").bind(u.0).fetch_one(&pool).await.unwrap();
    let mut invalid = doc.clone();
    invalid.immutable.speed = 10;
    assert!(
        store
            .apply_universe_config(&invalid)
            .await
            .unwrap_err()
            .contains("immutable.speed")
    );
    doc.policy.max_players = Some(1);
    let changed = store.apply_universe_config(&doc).await.unwrap();
    assert!(changed.changed);
    assert_eq!(changed.document.base_revision, 1);
    assert!(!store.apply_universe_config(&doc).await.unwrap().changed);
    let mut stale = doc.clone();
    stale.policy.signup_enabled = false;
    assert!(
        store
            .apply_universe_config(&stale)
            .await
            .unwrap_err()
            .contains("export again")
    );
    let (a, b) = tokio::join!(
        store.register(registration(u)),
        store.register(registration(u))
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(matches!(
        a.err().or(b.err()),
        Some(StoreError::UniverseFull)
    ));
    let mut doc = store.universe_config(u).await.unwrap();
    doc.policy.max_players = None;
    doc.policy.signup_enabled = false;
    store.apply_universe_config(&doc).await.unwrap();
    let blocked = registration(u);
    let name = blocked.name.clone();
    assert!(matches!(
        store.register(blocked).await,
        Err(StoreError::SignupClosed)
    ));
    assert!(store.find_credentials(&name).await.unwrap().is_none());
    let audit: Vec<(i64, String)> = sqlx::query_as("SELECT revision,provenance FROM universe_policy_changes WHERE universe=$1 ORDER BY revision").bind(u.0).fetch_all(&pool).await.unwrap();
    assert_eq!(
        audit,
        vec![
            (0, "create".into()),
            (1, "apply".into()),
            (2, "apply".into())
        ]
    );
    let after: (Uuid, String, Vec<u8>) = sqlx::query_as("SELECT epoch,profile_hash,secret FROM universes JOIN mvp_bootstraps ON id=universe WHERE id=$1").bind(u.0).fetch_one(&pool).await.unwrap();
    assert_eq!(retained, after);
    let mut reopened = store.universe_config(u).await.unwrap();
    reopened.policy.signup_enabled = true;
    store.apply_universe_config(&reopened).await.unwrap();
    store.register(registration(u)).await.unwrap();
    let mut below_population = store.universe_config(u).await.unwrap();
    below_population.policy.max_players = Some(1);
    store
        .apply_universe_config(&below_population)
        .await
        .unwrap();
    assert!(matches!(
        store.register(registration(u)).await,
        Err(StoreError::UniverseFull)
    ));
    let retained_population: i64 =
        sqlx::query_scalar("SELECT count(*) FROM universe_memberships WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(retained_population, 2);
    let mut reset = store.universe_config(u).await.unwrap();
    reset.policy.max_players = None;
    store.apply_universe_config(&reset).await.unwrap();
    assert_eq!(store.signup_policy(u).await.unwrap().max_players, 18);
    store.register(registration(u)).await.unwrap();
    store.check_legacy_speed(10).await.unwrap();
    let worker = PgStore::connect_with_limits(
        &url,
        orbit_storage_postgres::PoolLimits {
            refresh: 2,
            admission: 0,
            reads: 0,
            worker: 2,
            control: 2,
        },
    )
    .await
    .unwrap();
    assert_eq!(worker.universe_config(u).await.unwrap().immutable.speed, 5);
    assert!(worker.has_universe_policy(u).await.unwrap());

    store.check_serving_compatibility(None).await.unwrap();
    // Legacy initialization preserves identity and is explicitly idempotent.
    let legacy = UniverseId(Uuid::new_v4());
    store
        .ensure_signup_universe(Some(legacy), UniverseOptions::default(), None)
        .await
        .unwrap();
    let legacy_doc = UniverseConfigDocument {
        version: 1,
        universe: legacy,
        base_revision: 0,
        immutable: store.universe_immutable(legacy).await.unwrap(),
        policy: UniversePolicy::default(),
    };
    let (first_init, second_init) = tokio::join!(
        store.initialize_universe_config(&legacy_doc),
        store.initialize_universe_config(&legacy_doc)
    );
    assert_eq!(
        usize::from(first_init.unwrap().changed) + usize::from(second_init.unwrap().changed),
        1
    );
    assert!(
        !store
            .initialize_universe_config(&legacy_doc)
            .await
            .unwrap()
            .changed
    );
    let mut different = legacy_doc.clone();
    different.policy.signup_enabled = false;
    assert!(store.initialize_universe_config(&different).await.is_err());
}

async fn wait_for_query(pool: &PgPool, needle: &str) {
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let waiting: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1)")
                .bind(format!("%{needle}%")).fetch_one(pool).await.unwrap();
            if waiting { return; }
            tokio::task::yield_now().await;
        }
    }).await.unwrap();
}

#[tokio::test]
async fn universe_policy_lock_ordering_rollbacks_and_competing_edits() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let request = create(5);
    let u = request.universe;
    let doc = store.create_universe(&request).await.unwrap();
    let mut a = doc.clone();
    a.policy.max_players = Some(2);
    let mut b = doc.clone();
    b.policy.signup_per_minute = 15;
    let (a, b) = tokio::join!(
        store.apply_universe_config(&a),
        store.apply_universe_config(&b)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(a.err().or(b.err()).unwrap().contains("export again"));
    // Failure in the ledger rolls back creation as well as effective policy changes.
    sqlx::raw_sql("CREATE FUNCTION fail_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER fail_policy_audit BEFORE INSERT ON universe_policy_changes FOR EACH ROW EXECUTE FUNCTION fail_policy_audit();").execute(&pool).await.unwrap();
    let failed = create(10);
    assert!(store.create_universe(&failed).await.is_err());
    assert!(!store.universes().await.unwrap().contains(&failed.universe));
    let old = store.universe_config(u).await.unwrap();
    let mut updated = old.clone();
    updated.policy.signup_enabled = false;
    assert!(store.apply_universe_config(&updated).await.is_err());
    assert_eq!(store.universe_config(u).await.unwrap(), old);
    sqlx::raw_sql("DROP TRIGGER fail_policy_audit ON universe_policy_changes; DROP FUNCTION fail_policy_audit();").execute(&pool).await.unwrap();
    // Pause after HTTP/password work, before enrollment's placement serialization.
    let pending = registration(u);
    let name = pending.name.clone();
    let mut gate = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,901324))")
        .bind(u.to_string())
        .execute(&mut *gate)
        .await
        .unwrap();
    let task = tokio::spawn({
        let store = store.clone();
        async move { store.register(pending).await }
    });
    wait_for_query(&pool, "901324").await;
    let mut closed = store.universe_config(u).await.unwrap();
    closed.policy.signup_enabled = false;
    store.apply_universe_config(&closed).await.unwrap();
    gate.commit().await.unwrap();
    assert!(matches!(task.await.unwrap(), Err(StoreError::SignupClosed)));
    assert!(store.find_credentials(&name).await.unwrap().is_none());
    // Enrollment that already holds FOR SHARE completes before closure can commit.
    let mut open = store.universe_config(u).await.unwrap();
    open.policy.signup_enabled = true;
    open.policy.max_players = None;
    store.apply_universe_config(&open).await.unwrap();
    sqlx::raw_sql("CREATE FUNCTION hold_config_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(901330); RETURN NEW; END $$; CREATE TRIGGER hold_config_enrollment BEFORE INSERT ON accounts FOR EACH ROW EXECUTE FUNCTION hold_config_enrollment();").execute(&pool).await.unwrap();
    let mut hold = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(901330)")
        .execute(&mut *hold)
        .await
        .unwrap();
    let enrollment = tokio::spawn({
        let store = store.clone();
        async move { store.register(registration(u)).await }
    });
    wait_for_query(&pool, "INSERT INTO accounts").await;
    let mut close = store.universe_config(u).await.unwrap();
    close.policy.signup_enabled = false;
    let closure = tokio::spawn({
        let store = store.clone();
        async move { store.apply_universe_config(&close).await }
    });
    wait_for_query(&pool, "FROM universe_policies").await;
    assert!(!closure.is_finished());
    hold.commit().await.unwrap();
    enrollment.await.unwrap().unwrap();
    closure.await.unwrap().unwrap();
    sqlx::raw_sql(
        "DROP TRIGGER hold_config_enrollment ON accounts; DROP FUNCTION hold_config_enrollment();",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        store.register(registration(u)).await,
        Err(StoreError::SignupClosed)
    ));
}

#[tokio::test]
async fn universe_command_policy_serial_scoped_and_paired_accounting() {
    use orbit_engine::*;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    for scoped in [false, true] {
        let mut request = create(if scoped { 100 } else { 1 });
        request.policy.commands_per_minute = 1;
        store.create_universe(&request).await.unwrap();
        let u = request.universe;
        let session = store.register(registration(u)).await.unwrap();
        let game = GameService::new(store.clone());
        let binding = game
            .current_binding(session.account, u, Uuid::new_v4())
            .await
            .unwrap()
            .binding;
        let body: Uuid = sqlx::query_scalar("SELECT id FROM bodies WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
        if scoped {
            store.prepare_scoped_runtime(u, 100).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        let presence = || CommandEnvelope {
            command_id: CommandId(Uuid::new_v4()),
            epoch: binding.epoch,
            protocol: 4,
            command: Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(BodyId(body)),
                    cause: PresenceCause::AccountVisit,
                    paired_command_id: None,
                },
            },
        };
        let first = presence();
        let receipt = store
            .admit(Actor::Player(binding.player), u, first.clone())
            .await
            .unwrap();
        assert_eq!(
            store
                .admit(Actor::Player(binding.player), u, first.clone())
                .await
                .unwrap()
                .command_id,
            receipt.command_id
        );
        assert!(matches!(
            store
                .admit(Actor::Player(binding.player), u, presence())
                .await,
            Err(StoreError::RateLimited)
        ));
        let make_pair = || {
            let command_id = CommandId(Uuid::new_v4());
            ForegroundAction {
                gameplay: CommandEnvelopeV4 {
                    protocol: 4,
                    binding,
                    command_id,
                    command: CommandDto3::Progression(Command::SetProduction {
                        body: BodyId(body),
                        settings: ProductionSettings::default(),
                        expected_settings_revision: 0,
                    }),
                },
                presence: CommandEnvelopeV4 {
                    protocol: 4,
                    binding,
                    command_id: CommandId(Uuid::new_v4()),
                    command: CommandDto3::Progression(Command::World {
                        action: WorldAction::RecordForegroundPresence {
                            body: Some(BodyId(body)),
                            cause: PresenceCause::GameplayGesture,
                            paired_command_id: Some(command_id),
                        },
                    }),
                },
            }
        };
        let pair = make_pair();
        store.admit_scoped(pair.clone()).await.unwrap();
        store.admit_scoped(pair.clone()).await.unwrap();
        assert!(matches!(
            store.admit_scoped(make_pair()).await,
            Err(StoreError::RateLimited)
        ));
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM commands WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 3, "paired path retains its two-record accounting");
        let mut doc = store.universe_config(u).await.unwrap();
        doc.policy.commands_per_minute = 4;
        store.apply_universe_config(&doc).await.unwrap();
        store
            .admit(Actor::Player(binding.player), u, presence())
            .await
            .unwrap();
        let mut lower = store.universe_config(u).await.unwrap();
        lower.policy.commands_per_minute = 1;
        store.apply_universe_config(&lower).await.unwrap();
        store
            .admit(Actor::Player(binding.player), u, first)
            .await
            .unwrap();
        store.admit_scoped(pair).await.unwrap();
        assert!(matches!(
            store.admit_scoped(make_pair()).await,
            Err(StoreError::RateLimited)
        ));
        if scoped {
            game.step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap();
        } else {
            game.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
        }
        // Limits and hashes belong to each world even with mixed saved speeds.
        let other = create(5);
        store.create_universe(&other).await.unwrap();
        let other_session = store.register(registration(other.universe)).await.unwrap();
        let other_binding = game
            .current_binding(other_session.account, other.universe, Uuid::new_v4())
            .await
            .unwrap()
            .binding;
        for _ in 0..2 {
            let mut next = presence();
            next.epoch = other_binding.epoch;
            next.command = Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: None,
                    cause: PresenceCause::AccountVisit,
                    paired_command_id: None,
                },
            };
            store
                .admit(Actor::Player(other_binding.player), other.universe, next)
                .await
                .unwrap();
        }
    }
}

#[tokio::test]
async fn universe_policy_two_http_instances_refresh_and_fail_closed() {
    use http_body_util::BodyExt;
    use orbit_transport_http::{
        HttpConfig, router,
        test_http::{Body, Request},
    };
    use tower::ServiceExt;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let other = PgStore::connect(&url).await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let request = create(5);
    store.create_universe(&request).await.unwrap();
    let u = request.universe;
    let config = HttpConfig {
        origin: "https://game.example".into(),
        assets: "missing".into(),
        login_per_minute: 30,
        signup: Some(SignupPolicy {
            universe: u,
            max_players: 1,
        }),
        signup_per_minute: 1,
        legacy_signup_enabled: false,
        trusted_fly_proxies: vec![],
        wake: None,
        observer: None,
    };
    let apps = [router(store.clone(), config.clone()), router(other, config)];
    let get = |path| Request::builder().uri(path).body(Body::empty()).unwrap();
    for enabled in [true, false, true] {
        let mut doc = store.universe_config(u).await.unwrap();
        doc.policy.signup_enabled = enabled;
        store.apply_universe_config(&doc).await.unwrap();
        for app in &apps {
            for (path, field) in [
                ("/api/v1/registration", "enabled"),
                ("/api/v1/bootstrap", "signup_enabled"),
            ] {
                let response = app.clone().oneshot(get(path)).await.unwrap();
                assert_eq!(response.status(), 200);
                assert_eq!(
                    response.headers()["cache-control"],
                    if field == "signup_enabled" {
                        "private, no-store"
                    } else {
                        "no-store"
                    }
                );
                let json: serde_json::Value = serde_json::from_slice(
                    &response.into_body().collect().await.unwrap().to_bytes(),
                )
                .unwrap();
                assert_eq!(json[field], enabled);
            }
        }
    }
    let signup = || {
        Request::builder()
            .uri("/api/v1/registration")
            .method("POST")
            .header("Origin", "https://game.example")
            .header("Content-Type", "application/json")
            .body(Body::from(
                serde_json::json!({"name":format!("http-config-{}",Uuid::new_v4()),"password":"p"})
                    .to_string(),
            ))
            .unwrap()
    };
    let response = apps[0].clone().oneshot(signup()).await.unwrap();
    assert_eq!(response.status(), 201);
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    sqlx::query("ALTER TABLE universe_policies RENAME TO unavailable_universe_policies")
        .execute(&pool)
        .await
        .unwrap();
    for app in &apps {
        assert_eq!(
            app.clone()
                .oneshot(get("/api/v1/registration"))
                .await
                .unwrap()
                .status(),
            503
        );
        assert_eq!(app.clone().oneshot(signup()).await.unwrap().status(), 503);
        let bootstrap = app.clone().oneshot(get("/api/v1/bootstrap")).await.unwrap();
        let json: serde_json::Value =
            serde_json::from_slice(&bootstrap.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(json["signup_enabled"], false);
        let session = Request::builder()
            .uri("/api/v1/session")
            .header("Cookie", &cookie)
            .body(Body::empty())
            .unwrap();
        assert_eq!(app.clone().oneshot(session).await.unwrap().status(), 200);
    }
    sqlx::query("ALTER TABLE unavailable_universe_policies RENAME TO universe_policies")
        .execute(&pool)
        .await
        .unwrap();
    // DDL contention is bounded inside the read transaction and frees the read pool.
    let mut ddl = pool.begin().await.unwrap();
    sqlx::query("LOCK TABLE universe_policies IN ACCESS EXCLUSIVE MODE")
        .execute(&mut *ddl)
        .await
        .unwrap();
    for app in &apps {
        let response = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            app.clone().oneshot(get("/api/v1/registration")),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(response.status(), 503);
        let session = Request::builder()
            .uri("/api/v1/session")
            .header("Cookie", &cookie)
            .body(Body::empty())
            .unwrap();
        assert_eq!(app.clone().oneshot(session).await.unwrap().status(), 200);
    }
    ddl.rollback().await.unwrap();
}

#[tokio::test]
async fn control_plane_policy_changes_remain_available_for_blocked_worlds() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let mut doc = store.create_universe(&create(5)).await.unwrap();
    sqlx::query("UPDATE universe_runtime SET blocked='test diagnostic' WHERE universe=$1")
        .bind(doc.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.check_serving_compatibility(None).await.is_err());
    let administration = store.check_universe_config_schema().await;
    doc.policy.signup_enabled = false;
    let closed = store.apply_universe_config(&doc).await.unwrap();
    assert!(!closed.document.policy.signup_enabled);
    sqlx::query("UPDATE universe_runtime SET blocked=NULL WHERE universe=$1")
        .bind(doc.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(administration.is_ok(), "{administration:?}");
}

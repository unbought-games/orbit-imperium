use orbit_application::*;
use orbit_engine::Building;
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn malformed_head_schema_errors_and_invalid_rules_block_without_advancing() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let u = Uuid::new_v4().into();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    for (index, phase) in ["head", "schema", "rules"].into_iter().enumerate() {
        if index == 0 {
            store.seed(u, 1000000, 1, &passwords).await.unwrap()
        } else {
            store.reset(u, 1000000, 1, &passwords).await.unwrap()
        };
        store.set_test_time(1000000).await.unwrap();
        let login = SessionService::new(store.clone())
            .login("alpha", &passwords[0], None)
            .await
            .unwrap();
        let actor = Actor::Player(login.session.memberships[0].player);
        let game = GameService::new(store.clone());
        let view = game.view(actor, u).await.unwrap();
        let body = view.bodies[0].id;
        let q = game
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
        game.submit(
            actor,
            u,
            CommandEnvelope {
                command_id: Uuid::new_v4().into(),
                epoch: view.epoch,
                protocol: 2,
                command: Command::StartUpgrade {
                    body,
                    building: Building::MetalMine,
                    expected_terms_hash: q.terms_hash,
                },
            },
        )
        .await
        .unwrap();
        let original_command: (Uuid, serde_json::Value, serde_json::Value, bool) =
            sqlx::query_as("SELECT input_id,input,receipt,done FROM commands")
                .fetch_one(&pool)
                .await
                .unwrap();
        if phase == "head" {
            sqlx::query("UPDATE commands SET input='{}'::jsonb")
                .execute(&pool)
                .await
                .unwrap();
        } else if phase == "schema" {
            // A real SQL error aborts the selecting transaction, unlike JSON decoding.
            sqlx::query("ALTER TABLE scheduled_events RENAME COLUMN input TO damaged_input")
                .execute(&pool)
                .await
                .unwrap();
        } else {
            sqlx::query("UPDATE rulesets SET profile='{}'::jsonb")
                .execute(&pool)
                .await
                .unwrap();
        }
        let _ = game.step(u, Uuid::new_v4().into()).await;
        assert!(
            store.ready().await.is_err(),
            "{phase} corruption must fail readiness"
        );
        let (blocked, cursor): (Option<String>, i64) =
            sqlx::query_as("SELECT blocked,cursor FROM universe_runtime")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(blocked.is_some(), "{phase} must persist diagnostic");
        assert_eq!(cursor, 0);
        let done: i64 = sqlx::query_scalar("SELECT count(*) FROM commands WHERE done")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(done, 0);
        assert!(game.step(u, Uuid::new_v4().into()).await.is_err());
        if phase == "schema" {
            let retained_command: (Uuid, serde_json::Value, serde_json::Value, bool) =
                sqlx::query_as("SELECT input_id,input,receipt,done FROM commands")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(retained_command, original_command);
            let (fence, claim_input): (i64, Option<Uuid>) =
                sqlx::query_as("SELECT fence,claim_input FROM universe_runtime")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!((fence, claim_input), (0, None));
            let journal_count: i64 = sqlx::query_scalar("SELECT count(*) FROM transition_journal")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(journal_count, 0);
            sqlx::query("ALTER TABLE scheduled_events RENAME COLUMN damaged_input TO input")
                .execute(&pool)
                .await
                .unwrap();
        }
    }
}

#[tokio::test]
async fn newer_rules_or_ordered_formats_do_not_poison_the_shared_universe() {
    use orbit_engine::*;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&pool)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1000000, 1, &passwords).await.unwrap();
    store.set_test_time(1000000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &passwords[0], None)
        .await
        .unwrap();
    let actor = Actor::Player(login.session.memberships[0].player);
    let game = GameService::new(store.clone());
    let view = game.view(actor, u).await.unwrap();
    game.submit(
        actor,
        u,
        CommandEnvelope {
            command_id: Uuid::new_v4().into(),
            epoch: view.epoch,
            protocol: 2,
            command: Command::RecallFleet {
                fleet: FleetId::default(),
            },
        },
    )
    .await
    .unwrap();
    let original: serde_json::Value =
        sqlx::query_scalar("SELECT input FROM commands WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("UPDATE commands SET input=input || '{\"schema_version\":9,\"protocol\":9}'::jsonb WHERE universe=$1").bind(u.0).execute(&pool).await.unwrap();
    assert!(store.claim_next(u, Uuid::new_v4().into()).await.is_err());
    let state: (Option<String>, Option<Uuid>, i64) =
        sqlx::query_as("SELECT blocked,claim_input,fence FROM universe_runtime WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        state,
        (None, None, 0),
        "unsupported format must not globally block or claim work"
    );
    sqlx::query("UPDATE commands SET input=$2 WHERE universe=$1")
        .bind(u.0)
        .bind(original)
        .execute(&pool)
        .await
        .unwrap();
    let hash: String = sqlx::query_scalar("SELECT profile_hash FROM universes WHERE id=$1")
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let saved: serde_json::Value = sqlx::query_scalar("SELECT profile FROM rulesets WHERE hash=$1")
        .bind(&hash)
        .fetch_one(&pool)
        .await
        .unwrap();
    // Unknown semantics with a valid original digest are an unsupported release;
    // modifying content under an unchanged digest is corruption instead.
    let mut future = saved.clone();
    future["artifact"]["future_mechanic"] = serde_json::json!(true);
    let future_hash = orbit_engine::hash(&(&future["artifact"], &future["speed"]));
    future["hash"] = serde_json::json!(future_hash);
    sqlx::query("INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3)")
        .bind(&future_hash.0)
        .bind(future["artifact"]["id"].as_str().unwrap())
        .bind(&future)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE universes SET profile_hash=$2 WHERE id=$1")
        .bind(u.0)
        .bind(&future_hash.0)
        .execute(&pool)
        .await
        .unwrap();
    let readiness = store.ready().await;
    let claim = store.claim_next(u, Uuid::new_v4().into()).await;
    let state: (Option<String>, Option<Uuid>, i64) =
        sqlx::query_as("SELECT blocked,claim_input,fence FROM universe_runtime WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("UPDATE universes SET profile_hash=$2 WHERE id=$1")
        .bind(u.0)
        .bind(hash)
        .execute(&pool)
        .await
        .unwrap();
    assert!(readiness.is_err());
    assert!(
        claim.is_err(),
        "unsupported active content must refuse before claiming"
    );
    assert_eq!(state, (None, None, 0));
}

#[tokio::test]
async fn newer_policy_identifiers_refuse_locally_but_invalid_numbers_still_block() {
    use orbit_engine::*;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&pool)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = store
        .ensure_signup_universe(None, Default::default(), None)
        .await
        .unwrap()
        .universe;
    let original = store.load_rules(u).await.unwrap();
    let paths = [
        "/artifact/universe/id",
        "/artifact/universe/homeworld_policy",
        "/artifact/world/combat/id",
        "/artifact/world/combat/strategy",
        "/artifact/world/detector",
        "/artifact/world/rng",
        "/artifact/world/protection",
        "/artifact/world/debris_cleanup",
        "/artifact/world/raiding",
        "/artifact/progression/building_formula",
        "/artifact/progression/demolition_formula",
    ];
    for path in paths {
        let mut saved = serde_json::to_value(&original).unwrap();
        *saved.pointer_mut(path).unwrap() = serde_json::json!("future-policy-v99");
        saved["hash"] = serde_json::json!(hash(&(&saved["artifact"], &saved["speed"])));
        let rules: Ruleset = serde_json::from_value(saved).unwrap();
        sqlx::query("INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3)")
            .bind(&rules.hash.0)
            .bind(&rules.artifact.id)
            .bind(sqlx::types::Json(&rules))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE universes SET profile_hash=$2 WHERE id=$1")
            .bind(u.0)
            .bind(&rules.hash.0)
            .execute(&pool)
            .await
            .unwrap();
        assert!(store.ready().await.is_err(), "{path}");
        assert!(
            store.claim_next(u, Uuid::new_v4().into()).await.is_err(),
            "{path}"
        );
        let state: (Option<String>, Option<Uuid>, i64) = sqlx::query_as(
            "SELECT blocked,claim_input,fence FROM universe_runtime WHERE universe=$1",
        )
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(state, (None, None, 0), "{path} must not globally block");
    }
    let mut saved = serde_json::to_value(&original).unwrap();
    saved["artifact"]["world"]["combat"]["max_rounds"] = serde_json::json!(0);
    saved["hash"] = serde_json::json!(hash(&(&saved["artifact"], &saved["speed"])));
    let invalid: Ruleset = serde_json::from_value(saved).unwrap();
    sqlx::query("INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3)")
        .bind(&invalid.hash.0)
        .bind(&invalid.artifact.id)
        .bind(sqlx::types::Json(&invalid))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE universes SET profile_hash=$2 WHERE id=$1")
        .bind(u.0)
        .bind(&invalid.hash.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.claim_next(u, Uuid::new_v4().into()).await.is_err());
    assert!(
        sqlx::query_scalar::<_, Option<String>>(
            "SELECT blocked FROM universe_runtime WHERE universe=$1"
        )
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap()
        .is_some()
    );
}

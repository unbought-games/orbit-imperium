use orbit_application::*;
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;

async fn fresh() -> (PgStore, PgPool) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&pool)
        .await
        .unwrap();
    (PgStore::connect(&url).await.unwrap(), pool)
}
fn create(universe: UniverseId) -> UniverseCreate {
    UniverseCreate {
        universe,
        immutable: UniverseImmutable::default(),
        policy: UniversePolicy::default(),
    }
}
async fn key(pool: &PgPool, name: &str) -> String {
    sqlx::query_scalar("SELECT universe_name_key($1)")
        .bind(name)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn migration_names_existing_worlds_without_changing_identity_or_rules() {
    let (store, pool) = fresh().await;
    let mut previous = sqlx::migrate!("./migrations");
    previous.migrations = previous
        .iter()
        .filter(|m| m.version < 12)
        .cloned()
        .collect::<Vec<_>>()
        .into();
    store.migrate_with_for_test(&previous).await.unwrap();
    sqlx::raw_sql("INSERT INTO rulesets VALUES ('kept','kept','{}'); INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000022',false,5,123,'kept'),('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',true,10,456,'kept')")
        .execute(&pool).await.unwrap();
    let before: Vec<(Uuid, Uuid, bool, i32, i64, String)> = sqlx::query_as(
        "SELECT id,epoch,development,speed,started_at,profile_hash FROM universes ORDER BY id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let after: Vec<(Uuid, Uuid, bool, i32, i64, String)> = sqlx::query_as(
        "SELECT id,epoch,development,speed,started_at,profile_hash FROM universes ORDER BY id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(before, after);
    let names: Vec<String> = sqlx::query_scalar("SELECT name FROM universes ORDER BY id")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(names, ["Andromeda", "Triangulum"]);
}

#[tokio::test]
async fn creation_update_and_sessions_share_unique_authoritative_names() {
    let (store, pool) = fresh().await;
    store.migrate().await.unwrap();
    let first = create(Uuid::from_u128(1).into());
    let second = create(Uuid::from_u128(2).into());
    let (a, b) = tokio::join!(
        store.create_universe(&first),
        store.create_universe(&second)
    );
    a.unwrap();
    b.unwrap();
    let a = store.universe_summary(first.universe).await.unwrap();
    let b = store.universe_summary(second.universe).await.unwrap();
    assert_ne!(a.name, b.name);
    let names = store.universe_summaries().await.unwrap();
    assert_eq!(names.len(), 2);
    let signup = store
        .register(Registration {
            name: "named-player".into(),
            password_hash: "test".into(),
            policy: SignupPolicy {
                universe: first.universe,
                max_players: 100,
            },
            digest: "session".into(),
            csrf: "csrf".into(),
            previous: None,
        })
        .await
        .unwrap();
    assert_eq!(signup.memberships[0].universe_name, a.name);
    let before = store.universe_config(first.universe).await.unwrap();
    let update = UniverseUpdate {
        universe: first.universe,
        name: "My World / 宇宙 🌌".into(),
    };
    store.update_universe(&update).await.unwrap();
    store.update_universe(&update).await.unwrap();
    assert_eq!(store.universe_config(first.universe).await.unwrap(), before);
    let session = store.lookup_session("session").await.unwrap().unwrap();
    assert_eq!(session.memberships[0].universe_name, update.name);
    assert_eq!(session.memberships[0].player, signup.memberships[0].player);
    let renamed = store
        .universe_summaries()
        .await
        .unwrap()
        .into_iter()
        .find(|u| u.universe == first.universe)
        .unwrap();
    assert_eq!(renamed.name, update.name);
    // Exercise the real HTTP metadata response, including local signup scoping.
    use http_body_util::BodyExt;
    use orbit_transport_http::{
        HttpConfig, router,
        test_http::{Body, Request},
    };
    use tower::ServiceExt;
    let app = router(
        store.clone(),
        HttpConfig {
            origin: "https://game.example".into(),
            assets: "missing".into(),
            login_per_minute: 30,
            signup: Some(SignupPolicy {
                universe: first.universe,
                max_players: 100,
            }),
            signup_per_minute: 5,
            legacy_signup_enabled: false,
            trusted_fly_proxies: vec![],
            wake: None,
            observer: None,
        },
    );
    let response = app
        .oneshot(
            Request::get("/api/auth/config")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let json: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(
        json["universes"],
        serde_json::json!([{ "universe": first.universe, "name": update.name }])
    );

    let duplicate = UniverseUpdate {
        universe: second.universe,
        name: "my-world / 宇宙 🌌".into(),
    };
    assert!(
        store
            .update_universe(&duplicate)
            .await
            .unwrap_err()
            .contains("name or URL")
    );
    assert_eq!(
        store.universe_summary(second.universe).await.unwrap().name,
        b.name
    );
    let name = "Concurrent name".to_string();
    let update_a = UniverseUpdate {
        universe: first.universe,
        name: name.clone(),
    };
    let update_b = UniverseUpdate {
        universe: second.universe,
        name,
    };
    let (a, b) = tokio::join!(
        store.update_universe(&update_a),
        store.update_universe(&update_b)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(
        store
            .update_universe(&UniverseUpdate {
                universe: Uuid::new_v4().into(),
                name: "Missing".into()
            })
            .await
            .unwrap_err()
            .contains("not found")
    );
    for invalid in ["", " ", " padded", "control\nname"] {
        assert!(
            sqlx::query("UPDATE universes SET name=$2 WHERE id=$1")
                .bind(first.universe.0)
                .bind(invalid)
                .execute(&pool)
                .await
                .is_err()
        );
    }
}

#[tokio::test]
async fn url_keys_match_browser_encoding_and_catalog_exhaustion_is_explicit() {
    let (store, pool) = fresh().await;
    store.migrate().await.unwrap();
    for (name, expected) in [
        ("Andromeda", "andromeda"),
        ("Milky Way", "milky-way"),
        ("My / Universe? #1", "my-~2f~-universe~3f~-~23~1"),
        ("宇宙 🌌", "~5b87~~5b99~-~1f30c~"),
        ("..", "~2e~~2e~"),
        ("~2f~", "~7e~2f~7e~"),
    ] {
        assert_eq!(key(&pool, name).await, expected);
    }
    // Small controlled pool tests exhaustion without hundreds of world fixtures.
    sqlx::raw_sql("CREATE OR REPLACE FUNCTION universe_default_names() RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT ARRAY['Andromeda']::text[] $$").execute(&pool).await.unwrap();
    let first = create(Uuid::new_v4().into());
    store.create_universe(&first).await.unwrap();
    let second = create(Uuid::new_v4().into());
    assert!(
        store
            .create_universe(&second)
            .await
            .unwrap_err()
            .contains("no unused galaxy names remain")
    );
    assert_eq!(store.universe_summaries().await.unwrap().len(), 1);
    store
        .update_universe(&UniverseUpdate {
            universe: first.universe,
            name: "Custom".into(),
        })
        .await
        .unwrap();
    store.create_universe(&second).await.unwrap();
    assert_eq!(
        store.universe_summary(second.universe).await.unwrap().name,
        "Andromeda"
    );
}

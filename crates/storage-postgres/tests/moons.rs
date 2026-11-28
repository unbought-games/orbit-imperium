//! Regression: one lunar slot per parent and one body per coordinate/kind must
//! survive failed inserts. Destruction must terminalize paid work atomically
//! and prevent stale completion from restoring assets.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::json;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

async fn insert_body(tx: &mut Transaction<'_, Postgres>, parent: Uuid, moon: Uuid) {
    sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,revision) SELECT $2,universe,owner,'Moon',galaxy,system,position,1,0,amounts,carry,checkpoint_at,0 FROM bodies WHERE id=$1")
        .bind(parent).bind(moon).execute(&mut **tx).await.unwrap();
}

#[tokio::test]
async fn lunar_slot_constraints_preserve_planets_and_rollback_partial_inserts() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let scenario: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"lunar-slot-a","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"lunar-slot-b","password":"password","planet":"1:1:9"}
    ]}))
    .unwrap();
    store
        .apply_world_scenario(universe, &scenario, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let parents: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM bodies WHERE universe=$1 ORDER BY position")
            .bind(universe.0)
            .fetch_all(&pool)
            .await
            .unwrap();
    let before: serde_json::Value = sqlx::query_scalar(
        "SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bodies b WHERE universe=$1",
    )
    .bind(universe.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    let input = InputId(Uuid::new_v4());
    let moon = BodyId(derived_id(input, "moon:0"));
    let genesis = MoonGenesis {
        body: moon,
        parent: BodyId(parents[0]),
        diameter_km: 8366,
        created_at: 1_790_000_000_000,
        input,
        profile: MOON_PROFILE.into(),
    };
    let mut tx = pool.begin().await.unwrap();
    insert_body(&mut tx, parents[0], moon.0).await;
    sqlx::query("INSERT INTO moon_genesis(universe,id,parent,data) VALUES($1,$2,$3,$4)")
        .bind(universe.0)
        .bind(moon.0)
        .bind(parents[0])
        .bind(sqlx::types::Json(&genesis))
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let duplicate = Uuid::new_v4();
    let mut tx = pool.begin().await.unwrap();
    let error = sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,revision) SELECT $2,universe,owner,'Moon',galaxy,system,position,1,0,amounts,carry,checkpoint_at,0 FROM bodies WHERE id=$1")
        .bind(parents[0]).bind(duplicate).execute(&mut *tx).await.unwrap_err();
    assert_eq!(
        error.as_database_error().unwrap().code().as_deref(),
        Some("23505")
    );
    tx.rollback().await.unwrap();

    for (parent, code) in [(parents[0], "23505"), (Uuid::new_v4(), "23503")] {
        let candidate = Uuid::new_v4();
        let mut tx = pool.begin().await.unwrap();
        insert_body(&mut tx, parents[1], candidate).await;
        let error =
            sqlx::query("INSERT INTO moon_genesis(universe,id,parent,data) VALUES($1,$2,$3,$4)")
                .bind(universe.0)
                .bind(candidate)
                .bind(parent)
                .bind(json!({}))
                .execute(&mut *tx)
                .await
                .unwrap_err();
        assert_eq!(
            error.as_database_error().unwrap().code().as_deref(),
            Some(code)
        );
        tx.rollback().await.unwrap();
        assert!(
            !sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM bodies WHERE id=$1)")
                .bind(candidate)
                .fetch_one(&pool)
                .await
                .unwrap()
        );
    }
    let after: serde_json::Value = sqlx::query_scalar("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bodies b WHERE universe=$1 AND kind='Planet'")
        .bind(universe.0).fetch_one(&pool).await.unwrap();
    assert_eq!(after, before);
    let reopened = PgPool::connect(&url).await.unwrap();
    let records: Vec<sqlx::types::Json<MoonGenesis>> =
        sqlx::query_scalar("SELECT data FROM moon_genesis WHERE universe=$1")
            .bind(universe.0)
            .fetch_all(&reopened)
            .await
            .unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].0, genesis);
}

#[tokio::test]
async fn scoped_rename_persists_an_existing_moons_public_name() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let at = 1_790_000_000_000;
    store.set_test_time(at).await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let mut scenario: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"moon-owner","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"moon-observer","password":"password","planet":"1:1:9"}
    ]}))
    .unwrap();
    scenario.rules =
        Some(standard_signup_rules(UniverseProfile::signup(2, 100).unwrap(), 100).unwrap());
    store
        .apply_world_scenario(universe, &scenario, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let (owner, parent) = player(&store, universe, "moon-owner", &pool).await;
    let (observer, _) = player(&store, universe, "moon-observer", &pool).await;
    let moon = seed_moon(&pool, owner, parent, at).await;
    store.prepare_scoped_runtime(universe, 100).await.unwrap();
    store.activate_scoped_runtime(universe).await.unwrap();
    gameplay::command(
        &store,
        owner,
        Command::World {
            action: WorldAction::RenamePlanet {
                body: moon,
                name: "  Selene  ".into(),
            },
        },
    )
    .await;

    let reopened = PgStore::connect(&url).await.unwrap();
    let game = GameService::new(reopened);
    let viewer = |binding: Binding| Principal {
        account: binding.account,
        player: binding.player,
        universe: binding.universe,
    };
    let context = |binding| QueryContext {
        binding,
        request_id: Uuid::new_v4(),
    };
    let owned = game
        .world_view(viewer(owner), context(owner))
        .await
        .unwrap();
    let name = |id| {
        owned
            .progression
            .bodies
            .iter()
            .find(|b| b.id == id)
            .unwrap()
            .name
            .as_deref()
    };
    assert_eq!(name(moon), Some("Selene"));
    assert_eq!(name(parent), None);
    let galaxy = game
        .world_query(
            viewer(observer),
            WorldQuery {
                context: context(observer),
                query: WorldQueryKind::Galaxy {
                    galaxy: 1,
                    system: 1,
                },
            },
        )
        .await
        .unwrap();
    let position = galaxy.data["positions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|position| position["body"]["id"] == parent.to_string())
        .unwrap();
    assert_eq!(position["moon"]["id"], moon.to_string());
    assert_eq!(position["moon"]["name"], "Selene");
}

// Seed body creation so the tests can exercise commands against an existing moon.
async fn seed_moon(pool: &PgPool, b: Binding, parent: BodyId, created_at: i64) -> BodyId {
    let input = InputId(Uuid::new_v4());
    let id = BodyId(derived_id(input, "moon:0"));
    let mut tx = pool.begin().await.unwrap();
    insert_body(&mut tx, parent.0, id.0).await;
    sqlx::query("INSERT INTO building_levels(body,building,level) SELECT $2,building,0 FROM building_levels WHERE body=$1")
        .bind(parent.0).bind(id.0).execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO production_settings(body,revision,data) SELECT $2,0,jsonb_set(jsonb_set(data,'{body}',to_jsonb($2::text)),'{revision}','0') FROM production_settings WHERE body=$1")
        .bind(parent.0).bind(id.0).execute(&mut *tx).await.unwrap();
    for kind in [
        "constructions".to_owned(),
        "manufacturing".into(),
        "production".into(),
        format!("inventory:{}", b.player),
    ] {
        sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
            .bind(b.universe.0)
            .bind(kind)
            .bind(id.0)
            .execute(&mut *tx)
            .await
            .unwrap();
    }
    let genesis = MoonGenesis {
        body: id,
        parent,
        diameter_km: 8100,
        input,
        created_at,
        profile: MOON_PROFILE.into(),
    };
    sqlx::query("INSERT INTO moon_genesis(universe,id,parent,data) VALUES($1,$2,$3,$4)")
        .bind(b.universe.0)
        .bind(id.0)
        .bind(parent.0)
        .bind(sqlx::types::Json(genesis))
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    id
}

async fn player(
    store: &PgStore,
    u: UniverseId,
    username: &str,
    pool: &PgPool,
) -> (Binding, BodyId) {
    let account = SessionService::new(store.clone())
        .login(username, "password", None)
        .await
        .unwrap()
        .session
        .account;
    let b = GameService::new(store.clone())
        .current_binding(account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let id: Uuid = sqlx::query_scalar("SELECT id FROM bodies WHERE owner=$1 AND kind='Planet'")
        .bind(b.player.0)
        .fetch_one(pool)
        .await
        .unwrap();
    (b, BodyId(id))
}

#[path = "moons/destruction.rs"]
mod destruction;
#[path = "support/gameplay.rs"]
mod gameplay;

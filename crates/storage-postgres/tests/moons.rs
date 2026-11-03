//! Regression: one lunar slot per parent and one body per coordinate/kind must
//! survive failed inserts. Combat and lunar progression use deterministic engine
//! coverage; this database test does not compose a full game journey.
use orbit_application::{ScenarioMode, WorldScenario};
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

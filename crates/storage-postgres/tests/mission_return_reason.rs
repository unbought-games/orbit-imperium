//! Regression: a disabled feature must not prevent mixed-version writers or
//! startup with unknown causes, including old serde losing fields on replacement.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;
#[path = "support/legacy_mission_fleet.rs"]
mod legacy_writer;
use legacy_writer::LegacyMissionFleet;

async fn fixture() -> (PgStore, PgPool, UniverseId, Vec<MissionFleet>) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&pool)
        .await
        .unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    store.set_test_time(1_790_000_000_000).await.unwrap();
    let scenario: WorldScenario = serde_json::from_value(json!({"version":1,"edits":[
        {"op":"add-player","user":"return-owner","password":"password","planet":"1:1:8"},
        {"op":"add-player","user":"return-host","password":"password","planet":"1:1:9"},
        {"op":"set","user":"return-owner","planet":"1:1:8","ships":{"SmallCargo":4}},
        {"op":"transport","from":"1:1:8","planet":"1:1:9","returning":true,"return_reason":"VoluntaryRecall","arrives_in":"1h"},
        {"op":"transport","from":"1:1:8","planet":"1:1:9","returning":true,"arrives_in":"1h"},
        {"op":"transport","from":"1:1:8","planet":"1:1:9","arrives_in":"1h"}
    ]}))
    .unwrap();
    store
        .apply_world_scenario(universe, &scenario, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let rows: Vec<Value> = sqlx::query_scalar("SELECT data FROM mission_fleets ORDER BY id")
        .fetch_all(&pool)
        .await
        .unwrap();
    let fleets: Vec<MissionFleet> = rows
        .into_iter()
        .map(|v| serde_json::from_value(v).unwrap())
        .collect();
    assert_eq!(
        fleets
            .iter()
            .filter(|f| f.return_reason == Some(MissionReturnReason::MissionComplete))
            .count(),
        1,
        "editor explicitly records returning fixture provenance"
    );
    let exported = store.export_world_scenario(universe).await.unwrap();
    assert_eq!(
        exported
            .edits
            .iter()
            .filter(|e| e.return_reason == Some(MissionReturnReason::VoluntaryRecall))
            .count(),
        1,
        "scenario export preserves recall provenance"
    );
    (store, pool, universe, fleets)
}
async fn legacy(pool: &PgPool, f: &mut MissionFleet) {
    f.intent.mission = Mission::Deploy;
    let mut terms = (*f.terms).clone();
    terms.intent = f.intent.clone();
    f.terms = terms.seal();
    f.leg = MissionLeg::Returning;
    f.return_reason = None;
    f.generation = 1;
    f.revision = 1;
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(f.id.0)
        .bind(sqlx::types::Json(&f))
        .execute(pool)
        .await
        .unwrap();
}

// Exact changed-fleet persistence statement from the pre-cause world::save.
// The before/after comparison matters: unchanged old reads do not rewrite rows.
async fn save_old(
    pool: &PgPool,
    u: UniverseId,
    before: &LegacyMissionFleet,
    after: &LegacyMissionFleet,
) {
    if before != after {
        sqlx::query("INSERT INTO mission_fleets(universe,id,owner,data) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE mission_fleets.universe=excluded.universe")
            .bind(u.0).bind(after.id.0).bind(after.owner.0).bind(sqlx::types::Json(after)).execute(pool).await.unwrap();
    }
}
async fn read(pool: &PgPool, fleet: FleetId) -> Value {
    sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
        .bind(fleet.0)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn rolling_startup_and_legacy_full_record_writes_accept_unknown_causes_with_scans_disabled() {
    let (store, pool, u, mut fleets) = fixture().await;
    legacy(&pool, &mut fleets[0]).await;
    let f = &fleets[0];
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM transition_journal")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    // Missing historical evidence is an activation concern, never a startup task.
    store.migrate().await.unwrap();
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    reopened.migrate().await.unwrap();
    assert_eq!(read(&pool, f.id).await, serde_json::to_value(f).unwrap());
    assert_eq!(
        validate_phalanx_scan_readiness(true, [f]),
        Err(PhalanxReadinessError::UnknownDeploymentReturn)
    );

    // A new writer emits the causal field using the same JSON persistence format.
    let mut known = f.clone();
    known.return_reason = Some(MissionReturnReason::VoluntaryRecall);
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(known.id.0)
        .bind(sqlx::types::Json(&known))
        .execute(&pool)
        .await
        .unwrap();
    let saved = read(&pool, f.id).await;
    let before: LegacyMissionFleet = serde_json::from_value(saved.clone()).unwrap();
    assert!(
        serde_json::to_value(&before)
            .unwrap()
            .get("return_reason")
            .is_none()
    );
    save_old(&pool, u, &before, &before).await;
    assert_eq!(
        read(&pool, f.id).await,
        saved,
        "an unchanged fleet is not written by world::save"
    );

    // Actual old FleetLegDue/terminal_return mutates these three fleet fields.
    // It can read a new fleet, settle it normally, and erase the unknown field.
    let mut after = before.clone();
    after.leg = MissionLeg::Returned;
    after.generation += 1;
    after.revision += 1;
    save_old(&pool, u, &before, &after).await;
    let rewritten = read(&pool, f.id).await;
    assert_eq!(rewritten, serde_json::to_value(&after).unwrap());
    assert!(
        rewritten.get("return_reason").is_none(),
        "full JSON replacement really loses the cause"
    );
    let terminal: MissionFleet = serde_json::from_value(rewritten).unwrap();
    assert_eq!(terminal.terms, known.terms);
    assert_eq!(validate_phalanx_scan_readiness(true, [&terminal]), Ok(()));

    // Old outbound recall persists an active unknown return without schema failure.
    let mut outbound = before.clone();
    outbound.leg = MissionLeg::Outbound;
    outbound.generation = 0;
    outbound.revision = 0;
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(f.id.0)
        .bind(sqlx::types::Json(&outbound))
        .execute(&pool)
        .await
        .unwrap();
    let mut recalled = outbound.clone();
    recalled.leg = MissionLeg::Returning;
    recalled.generation += 1;
    recalled.revision += 1;
    save_old(&pool, u, &outbound, &recalled).await;
    let unknown: MissionFleet = serde_json::from_value(read(&pool, f.id).await).unwrap();
    assert_eq!(unknown.return_reason, None);
    assert_eq!(
        validate_phalanx_scan_readiness(true, [&unknown]),
        Err(PhalanxReadinessError::UnknownDeploymentReturn)
    );
    store.migrate().await.unwrap();
}

#[tokio::test]
async fn new_writer_causes_round_trip_through_bound_world_and_schema_has_no_history_backfill() {
    let (store, pool, u, fleets) = fixture().await;
    let auth = SessionService::new(store.clone())
        .login("return-owner", "password", None)
        .await
        .unwrap();
    let binding = GameService::new(store.clone())
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let loaded = store.bound_world(binding).await.unwrap();
    for f in &fleets {
        assert_eq!(
            loaded.facts.0.state.world.as_ref().unwrap().records.fleets[&f.id],
            *f
        );
    }
    let before: Vec<Value> = sqlx::query_scalar("SELECT data FROM mission_fleets ORDER BY id")
        .fetch_all(&pool)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, Value>("SELECT data FROM mission_fleets ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap(),
        before
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM _sqlx_migrations WHERE version=33")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0,
        "unpublished backfill migration is removed"
    );
}

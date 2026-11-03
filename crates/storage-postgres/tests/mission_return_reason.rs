//! Regression: legacy deployment returns must not disclose recalls or hide failed
//! arrivals. Migration uses exact successful journal evidence, never timing/reports.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;
const MIGRATION: &str = include_str!("../migrations/0033_mission_return_reason.sql");

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
    // Model the retained pre-upgrade table, not an edit of immutable journals.
    sqlx::raw_sql("ALTER TABLE mission_fleets DROP CONSTRAINT mission_return_reason_valid")
        .execute(&pool)
        .await
        .unwrap();
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
async fn evidence(
    pool: &PgPool,
    universe: UniverseId,
    f: &MissionFleet,
    recall: bool,
    cursor: i64,
) {
    let mut before = f.clone();
    before.leg = MissionLeg::Outbound;
    before.generation = 0;
    before.revision = 0;
    let payload = if recall {
        Input::Command(Command::World {
            action: WorldAction::RecallMission { fleet: f.id },
        })
    } else {
        Input::Event(ScheduledEvent::FleetLegDue {
            fleet: f.id,
            generation: 0,
            expected_leg: MissionLeg::Outbound,
        })
    };
    let input = json!({"payload":payload});
    sqlx::query("INSERT INTO transition_journal(universe,cursor,input_id,input,facts,outcome) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(universe.0).bind(cursor).bind(Uuid::new_v4()).bind(input)
        .bind(json!({"world":{"records":{"fleets":{f.id.to_string():before}}}}))
        .bind(json!({"Applied":{"world":{"records":{"fleets":{f.id.to_string():f}}}}}))
        .execute(pool).await.unwrap();
}
#[tokio::test]
async fn exact_journal_causes_backfill_only_active_deployments_and_preserve_history() {
    let (store, pool, u, mut fleets) = fixture().await;
    for (i, f) in fleets.iter_mut().take(2).enumerate() {
        legacy(&pool, f).await;
        evidence(&pool, u, f, i == 0, i as i64 + 1).await;
    }
    let before: Value = sqlx::query_scalar(
        "SELECT jsonb_agg(to_jsonb(j) ORDER BY cursor) FROM transition_journal j",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let untouched: Value = sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
        .bind(fleets[2].id.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    sqlx::raw_sql(MIGRATION).execute(&mut *tx).await.unwrap();
    tx.commit().await.unwrap();
    for (i, f) in fleets.iter_mut().take(2).enumerate() {
        let value: Value = sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
            .bind(f.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
        let restored: MissionFleet = serde_json::from_value(value).unwrap();
        f.return_reason = Some(if i == 0 {
            MissionReturnReason::VoluntaryRecall
        } else {
            MissionReturnReason::InvalidTarget
        });
        assert_eq!(
            &restored, f,
            "only the causal fact changes; terms, deadlines and revisions stay intact"
        );
        let mut invalid = serde_json::to_value(&restored).unwrap();
        invalid.as_object_mut().unwrap().remove("return_reason");
        assert!(
            sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
                .bind(f.id.0)
                .bind(invalid)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    assert_eq!(
        sqlx::query_scalar::<_, Value>(
            "SELECT jsonb_agg(to_jsonb(j) ORDER BY cursor) FROM transition_journal j"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        before
    );
    assert_eq!(
        sqlx::query_scalar::<_, Value>("SELECT data FROM mission_fleets WHERE id=$1")
            .bind(fleets[2].id.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        untouched
    );
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
    for f in fleets.iter().take(2) {
        assert_eq!(
            loaded.facts.0.state.world.as_ref().unwrap().records.fleets[&f.id],
            *f
        );
    }
    // A reopened storage connection reads exactly the migrated record format.
    let reopened = PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let restored: Value = sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
        .bind(fleets[0].id.0)
        .fetch_one(&reopened)
        .await
        .unwrap();
    assert_eq!(
        serde_json::from_value::<MissionFleet>(restored).unwrap(),
        fleets[0]
    );
}
#[tokio::test]
async fn missing_stale_or_conflicting_evidence_blocks_atomically_without_timing_guess() {
    for mode in ["missing", "stale", "conflicting"] {
        let (_store, pool, u, mut fleets) = fixture().await;
        legacy(&pool, &mut fleets[0]).await;
        evidence(&pool, u, &fleets[0], true, 1).await;
        legacy(&pool, &mut fleets[1]).await;
        if mode == "stale" {
            let mut stale = fleets[1].clone();
            stale.revision += 1;
            evidence(&pool, u, &stale, false, 2).await;
        } else if mode == "conflicting" {
            evidence(&pool, u, &fleets[1], false, 2).await;
            evidence(&pool, u, &fleets[1], true, 3).await;
        }
        let mut tx = pool.begin().await.unwrap();
        let error = sqlx::raw_sql(MIGRATION)
            .execute(&mut *tx)
            .await
            .unwrap_err();
        assert!(
            error
                .to_string()
                .contains("Unclassified active returning deployment"),
            "{error}"
        );
        tx.rollback().await.unwrap();
        let untouched: Value = sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
            .bind(fleets[0].id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(
            untouched.get("return_reason").is_none(),
            "classification must roll back with unresolved evidence"
        );
    }
}

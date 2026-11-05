use orbit_application::StoreError;
use orbit_storage_postgres::PgStore;
use std::time::Duration;

async fn store() -> PgStore {
    PgStore::connect(&std::env::var("TEST_DATABASE_URL").expect("use make test-db"))
        .await
        .unwrap()
}

// A live SQL connection is not evidence that the retained reset fence still exists.
#[tokio::test]
async fn actual_fence_loss_is_rejected_without_reacquiring_it() {
    let store = store().await;
    let mut guard = store.acquire_server_guard().await.unwrap();
    guard.check().await.unwrap();
    assert!(matches!(
        store
            .activate_tutorial(orbit_engine::UniverseId(uuid::Uuid::new_v4()), true)
            .await,
        Err(StoreError::Conflict)
    ));
    sqlx::query("SELECT pg_advisory_unlock_all()")
        .execute(guard.test_connection())
        .await
        .unwrap();
    assert!(matches!(guard.check().await, Err(StoreError::Unavailable)));
    let mut independent = sqlx::PgConnection::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let available: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(901321)")
        .fetch_one(&mut independent)
        .await
        .unwrap();
    assert!(
        available,
        "failed check must never silently restore an uncertain fence"
    );
}

// A terminated retained backend must not be replaced from the otherwise healthy pool.
#[tokio::test]
async fn broken_retained_connection_fails_closed() {
    let store = store().await;
    let mut guard = store.acquire_server_guard().await.unwrap();
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(guard.test_connection())
        .await
        .unwrap();
    let mut killer = sqlx::PgConnection::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let killed: bool = sqlx::query_scalar("SELECT pg_terminate_backend($1)")
        .bind(pid)
        .fetch_one(&mut killer)
        .await
        .unwrap();
    assert!(killed);
    assert!(guard.check().await.is_err());
}

// Slow DB work on the retained session must not leave an uncertain writer serving.
#[tokio::test]
async fn slow_retained_connection_hits_the_existing_probe_deadline() {
    let store = store().await;
    let mut guard = store.acquire_server_guard().await.unwrap();
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(guard.test_connection())
        .await
        .unwrap();
    let mut observer = sqlx::PgConnection::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    // Observe the backend executing the delayed query before cancelling the Rust
    // future. A wall-clock delay could cancel SQLx preparation instead.
    {
        let query = sqlx::query("SELECT pg_sleep(10)").execute(guard.test_connection());
        let executing = async {
            loop {
                let sleeping: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event='PgSleep')")
                    .bind(pid).fetch_one(&mut observer).await.unwrap();
                if sleeping {
                    break;
                }
                tokio::task::yield_now().await;
            }
        };
        tokio::select! {
            result = query => panic!("slow query completed before observation: {result:?}"),
            observed = tokio::time::timeout(Duration::from_secs(5), executing) => observed.expect("backend must enter PgSleep"),
        }
    }
    assert!(matches!(guard.check().await, Err(StoreError::Unavailable)));
}

use sqlx::Connection;

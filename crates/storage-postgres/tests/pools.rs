use orbit_storage_postgres::{PgStore, PoolLimits};
use sqlx::{Connection, Executor, PgPool};
use std::time::Duration;

// Regression: cancellation after PostgreSQL executes BEGIN but before SQLx
// observes its response must not contaminate a later request's transaction.
// Gate that exact driver await with a database lock, never a timing sleep.
async fn cancelled_begin(store: PgStore, pool: PgPool, url: &str) {
    // Reserve other slots so an asynchronous return cannot be hidden by a
    // newly opened connection in the shared-store constructor's larger pool.
    let mut reservations = Vec::new();
    for _ in 1..pool.options().get_max_connections() {
        reservations.push(pool.acquire().await.unwrap());
    }
    let mut control = sqlx::PgConnection::connect(url).await.unwrap();
    control
        .execute("SELECT pg_advisory_lock(918833)")
        .await
        .unwrap();
    let mut connection = pool.acquire().await.unwrap();
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *connection)
        .await
        .unwrap();
    drop(connection);
    let running = tokio::spawn(async move {
        store
            .begin_refresh_with_for_test("BEGIN; SELECT pg_advisory_xact_lock(918833)")
            .await
    });
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let waiting: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock')")
                .bind(pid).fetch_one(&mut control).await.unwrap();
            if waiting { break; }
            tokio::task::yield_now().await;
        }
    }).await.expect("backend must reach the controlled BEGIN await");
    running.abort();
    assert!(running.await.unwrap_err().is_cancelled());
    control
        .execute("SELECT pg_advisory_unlock(918833)")
        .await
        .unwrap();

    let mut next = pool.acquire().await.unwrap();
    let reused: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *next)
        .await
        .unwrap();
    assert_eq!(
        pid, reused,
        "exercise the same physical connection, not replacement"
    );
    let mut transaction = sqlx::Transaction::begin(next, None).await.unwrap();
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        .execute(&mut *transaction)
        .await
        .expect("a cancelled BEGIN must not leave the next transaction inside an old snapshot");
    transaction.rollback().await.unwrap();

    // Cleanup must preserve committed work and rollback unfinished work.
    sqlx::query("CREATE TEMP TABLE pool_cleanup_probe(value integer)")
        .execute(&pool)
        .await
        .unwrap();
    let mut committed = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO pool_cleanup_probe VALUES(1)")
        .execute(&mut *committed)
        .await
        .unwrap();
    committed.commit().await.unwrap();
    let mut abandoned = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO pool_cleanup_probe VALUES(2)")
        .execute(&mut *abandoned)
        .await
        .unwrap();
    drop(abandoned);
    let rows: Vec<i32> = sqlx::query_scalar("SELECT value FROM pool_cleanup_probe ORDER BY value")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(rows, vec![1]);
    drop(reservations);
    pool.close().await;
}

#[tokio::test]
async fn cancelled_begin_does_not_poison_role_reserved_pool() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = PgStore::connect_with_limits(
        &url,
        PoolLimits {
            control: 2,
            admission: 0,
            reads: 0,
            worker: 0,
            refresh: 1,
        },
    )
    .await
    .unwrap();
    cancelled_begin(
        store.clone(),
        store.oidc_refresh_pool_for_test().unwrap(),
        &url,
    )
    .await;
}

#[tokio::test]
async fn cancelled_begin_does_not_poison_shared_store_refresh_pool() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = PgStore::connect(&url).await.unwrap();
    cancelled_begin(
        store.clone(),
        store.oidc_refresh_pool_for_test().unwrap(),
        &url,
    )
    .await;
}

//! Daily snapshots run independently of readers. The database records which
//! universes still need today's capture, including after downtime or a reset.
use orbit_storage_postgres::PgStore;
use std::time::Duration;
use tokio::sync::watch;

pub async fn run(store: PgStore, mut drain: watch::Receiver<bool>) {
    while !*drain.borrow() {
        tokio::select! {
            _ = drain.changed() => return,
            _ = capture_missing(&store) => {}
        }
        tokio::select! {
            _ = drain.changed() => return,
            _ = tokio::time::sleep(Duration::from_secs(60)) => {}
        }
    }
}

async fn capture_missing(store: &PgStore) {
    let status = match store.ranking_snapshot_status().await {
        Ok(status) => status,
        Err(error) => {
            orbit_application::orbit_log!(WARN, event = "ranking_snapshot_scan_failed", error_code = %error);
            return;
        }
    };
    for (universe, complete) in status {
        if complete {
            continue;
        }
        match store.capture_ranking_snapshot(universe).await {
            Ok(true) => {
                orbit_application::orbit_log!(INFO, event = "ranking_snapshot_captured", universe = %universe)
            }
            Ok(false) => {}
            Err(error) => {
                orbit_application::orbit_log!(WARN, event = "ranking_snapshot_failed", universe = %universe, error_code = %error)
            }
        }
    }
}

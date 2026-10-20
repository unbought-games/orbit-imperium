use axum::{
    Router,
    extract::State,
    http::{StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use orbit_application::{
    GameStore, RuntimeEvent, RuntimeObserver, RuntimeStage, RuntimeStatusStore,
};
use orbit_storage_postgres::PgStore;
use std::{
    fmt::Write,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

const BUCKETS: [(u64, &str); 11] = [
    (1000, "0.001"),
    (5000, "0.005"),
    (10000, "0.01"),
    (50000, "0.05"),
    (100000, "0.1"),
    (250000, "0.25"),
    (500000, "0.5"),
    (1000000, "1"),
    (5000000, "5"),
    (30000000, "30"),
    (u64::MAX, "+Inf"),
];
struct Histogram {
    buckets: [AtomicU64; 11],
    sum_micros: AtomicU64,
}
impl Default for Histogram {
    fn default() -> Self {
        Self {
            buckets: std::array::from_fn(|_| AtomicU64::new(0)),
            sum_micros: AtomicU64::new(0),
        }
    }
}
pub struct RuntimeMetrics {
    durations: [Histogram; 10],
    events: [AtomicU64; 8],
}
impl RuntimeMetrics {
    pub fn new() -> Self {
        Self {
            durations: std::array::from_fn(|_| Histogram::default()),
            events: std::array::from_fn(|_| AtomicU64::new(0)),
        }
    }
    pub fn render(&self) -> String {
        let mut text = String::from("# TYPE orbit_runtime_seconds histogram\n");
        for stage in RuntimeStage::ALL {
            let histogram = &self.durations[stage as usize];
            for ((_, bound), counter) in BUCKETS.iter().zip(&histogram.buckets) {
                writeln!(
                    text,
                    "orbit_runtime_seconds_bucket{{stage=\"{}\",le=\"{}\"}} {}",
                    stage.name(),
                    bound,
                    counter.load(Ordering::Relaxed)
                )
                .unwrap();
            }
            writeln!(
                text,
                "orbit_runtime_seconds_sum{{stage=\"{}\"}} {}",
                stage.name(),
                histogram.sum_micros.load(Ordering::Relaxed) as f64 / 1000000.0
            )
            .unwrap();
            writeln!(
                text,
                "orbit_runtime_seconds_count{{stage=\"{}\"}} {}",
                stage.name(),
                histogram.buckets[10].load(Ordering::Relaxed)
            )
            .unwrap();
        }
        text.push_str("# TYPE orbit_runtime_events_total counter\n");
        for event in RuntimeEvent::ALL {
            writeln!(
                text,
                "orbit_runtime_events_total{{event=\"{}\"}} {}",
                event.name(),
                self.events[event as usize].load(Ordering::Relaxed)
            )
            .unwrap();
        }
        let started = self.events[RuntimeEvent::EngineStarted as usize].load(Ordering::Relaxed);
        let finished = self.events[RuntimeEvent::EngineFinished as usize].load(Ordering::Relaxed);
        writeln!(
            text,
            "# TYPE orbit_engine_active gauge\norbit_engine_active {}",
            started.saturating_sub(finished)
        )
        .unwrap();
        text
    }
}
impl RuntimeObserver for RuntimeMetrics {
    fn duration(&self, stage: RuntimeStage, elapsed: Duration) {
        let micros = u64::try_from(elapsed.as_micros()).unwrap_or(u64::MAX);
        let histogram = &self.durations[stage as usize];
        histogram.sum_micros.fetch_add(micros, Ordering::Relaxed);
        for ((bound, _), counter) in BUCKETS.iter().zip(&histogram.buckets) {
            if micros <= *bound {
                counter.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
    fn event(&self, event: RuntimeEvent) {
        self.events[event as usize].fetch_add(1, Ordering::Relaxed);
    }
}
#[derive(Clone)]
struct MetricsState {
    store: PgStore,
    metrics: Arc<RuntimeMetrics>,
}
async fn scrape(State(state): State<MetricsState>) -> impl IntoResponse {
    let mut text = state.metrics.render();
    let result = async {
        for universe in state.store.universes().await? {
            let status = state.store.runtime_status(universe).await?;
            for (name, value) in [
                ("oldest_pending_age", status.oldest_pending_age_ms),
                ("oldest_due_lag", status.oldest_due_lag_ms),
            ] {
                writeln!(
                    text,
                    "orbit_{name}_seconds{{universe=\"{universe}\"}} {}",
                    value.unwrap_or(0) as f64 / 1000.0
                )
                .unwrap();
            }
            writeln!(
                text,
                "orbit_blocked_scopes{{universe=\"{universe}\"}} {}",
                status.blocked_scope_count
            )
            .unwrap();
        }
        Ok::<_, orbit_application::StoreError>(())
    }
    .await;
    for pool in state.store.pool_snapshots() {
        for (kind, count) in [
            ("open", u64::from(pool.size)),
            ("idle", pool.idle as u64),
            ("maximum", u64::from(pool.maximum)),
        ] {
            writeln!(
                text,
                "orbit_db_pool_connections{{pool=\"{}\",state=\"{kind}\"}} {count}",
                pool.name
            )
            .unwrap();
        }
    }
    writeln!(
        text,
        "orbit_runtime_status_available {}",
        u8::from(result.is_ok())
    )
    .unwrap();
    (
        if result.is_ok() {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        },
        [
            (header::CONTENT_TYPE, "text/plain; version=0.0.4"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        text,
    )
}
async fn ready(State(state): State<MetricsState>) -> StatusCode {
    if state.store.ready().await.is_ok() {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}
pub async fn serve(
    listener: tokio::net::TcpListener,
    store: PgStore,
    metrics: Arc<RuntimeMetrics>,
    mut drain: tokio::sync::watch::Receiver<bool>,
) -> Result<(), std::io::Error> {
    let app = Router::new()
        .route("/metrics", get(scrape))
        .route("/health/ready", get(ready))
        .route("/health/live", get(|| async { StatusCode::NO_CONTENT }))
        .with_state(MetricsState { store, metrics });
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            while !*drain.borrow() {
                if drain.changed().await.is_err() {
                    break;
                }
            }
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_application::{RuntimeEvent, RuntimeObserver, RuntimeStage};
    #[test]
    fn exposition_has_bounded_labels_and_cumulative_duration_buckets() {
        let metrics = RuntimeMetrics::new();
        metrics.duration(
            RuntimeStage::Admission,
            std::time::Duration::from_millis(12),
        );
        metrics.event(RuntimeEvent::ClaimRecovered);
        let text = metrics.render();
        assert!(text.contains("orbit_runtime_seconds_bucket{stage=\"admission\",le=\"0.05\"} 1"));
        assert!(text.contains("orbit_runtime_seconds_count{stage=\"admission\"} 1"));
        assert!(text.contains("orbit_runtime_events_total{event=\"claim_recovered\"} 1"));
        assert!(!text.contains("player"));
    }
}

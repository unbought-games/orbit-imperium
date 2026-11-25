use crate::request_metrics::Histogram;
use orbit_application::{ServiceError, StepOutcome, diagnostics::wall_time_us};
use orbit_engine::{InputId, OrderedInput, UniverseId, WorkerId};
use orbit_storage_postgres::worker_observation::{Phase, WorkerSample};
use std::{
    collections::BTreeMap,
    fmt::Write,
    sync::Mutex,
    time::{Duration, Instant},
};

#[derive(Clone, Default)]
struct Work {
    phases: BTreeMap<Phase, Histogram>,
    rows: [u64; 4],
    stacks: [u64; 3],
}

const ROWS: [&str; 4] = ["fact_read", "revalidation_read", "insert", "delete"];

#[derive(Clone, Default)]
struct State {
    // Both keys originate in exhaustive matches on the claim and engine input.
    work: BTreeMap<(&'static str, &'static str), Work>,
    backoffs: BTreeMap<(&'static str, bool, &'static str), Histogram>,
}

#[derive(Default)]
pub struct WorkerMetrics(Mutex<State>);

impl WorkerMetrics {
    fn observe(&self, mode: &'static str, action: &'static str, sample: &WorkerSample) {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let work = state.work.entry((mode, action)).or_default();
        for phase in Phase::ALL {
            if let Some(elapsed) = sample.duration(phase) {
                work.phases.entry(phase).or_default().observe(elapsed);
            }
        }
        for (total, rows) in work.rows.iter_mut().zip([
            sample.fact_lots_read,
            sample.revalidation_lots_read,
            sample.lots_inserted,
            sample.lots_deleted,
        ]) {
            *total += rows;
        }
        for (total, rows) in work.stacks.iter_mut().zip([
            sample.fact_stacks_read,
            sample.revalidation_stacks_read,
            sample.stacks_written,
        ]) {
            *total += rows;
        }
    }

    pub fn wait(
        &self,
        worker: WorkerId,
        reason: &'static str,
        active_inputs: usize,
        wake: &'static str,
        elapsed: Duration,
    ) {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .backoffs
            .entry((reason, active_inputs > 0, wake))
            .or_default()
            .observe(elapsed);
        if active_inputs > 0 && elapsed >= Duration::from_millis(50) {
            orbit_application::orbit_log!(INFO, event = "worker_active_wait", %worker, reason, wake, active_inputs, elapsed_us = elapsed.as_micros() as u64);
        }
    }

    pub fn render(&self, text: &mut String) {
        let state = self.0.lock().unwrap_or_else(|e| e.into_inner()).clone();
        text.push_str("# TYPE orbit_worker_phase_seconds histogram\n# TYPE orbit_worker_asset_lot_rows_total counter\n# TYPE orbit_worker_inventory_stack_rows_total counter\n# TYPE orbit_worker_scheduler_wait_seconds histogram\n");
        for ((mode, action), work) in state.work {
            let labels = format!("mode=\"{mode}\",action=\"{action}\"");
            for (phase, histogram) in work.phases {
                histogram.render(
                    text,
                    "orbit_worker_phase_seconds",
                    &format!("{labels},phase=\"{}\"", phase.name()),
                );
            }
            for (op, count) in ROWS.iter().zip(work.rows) {
                writeln!(
                    text,
                    "orbit_worker_asset_lot_rows_total{{{labels},operation=\"{op}\"}} {count}"
                )
                .unwrap();
            }
            for (op, count) in ["fact_read", "revalidation_read", "write"]
                .iter()
                .zip(work.stacks)
            {
                writeln!(
                    text,
                    "orbit_worker_inventory_stack_rows_total{{{labels},operation=\"{op}\"}} {count}"
                )
                .unwrap();
            }
        }
        for ((reason, active, wake), histogram) in state.backoffs {
            histogram.render(
                text,
                "orbit_worker_scheduler_wait_seconds",
                &format!("reason=\"{reason}\",active_inputs=\"{active}\",wake=\"{wake}\""),
            );
        }
    }
}

pub struct ObservedClaim {
    worker: WorkerId,
    mode: &'static str,
    action: &'static str,
    universe: UniverseId,
    input_id: InputId,
    logical_at_ms: i64,
    gameplay: bool,
    wall_us: Option<u64>,
    monotonic: Instant,
}

impl ObservedClaim {
    pub fn new(input: &OrderedInput, mode: &'static str, worker: WorkerId) -> Self {
        let wall_us = wall_time_us();
        let monotonic = Instant::now();
        let action = orbit_application::diagnostics::action(&input.payload);
        let gameplay =
            matches!(input.payload, orbit_engine::Input::Command(_)) && action != "presence";
        if gameplay {
            // This also survives a worker dying before it returns an attempt sample.
            orbit_application::orbit_log!(INFO, event = "worker_input_claimed", %worker, universe = %input.universe,
                input_id = %input.id, mode, action, claim_ack_us = wall_us);
        }
        Self {
            wall_us,
            monotonic,
            mode,
            worker,
            action,
            gameplay,
            universe: input.universe,
            input_id: input.id,
            logical_at_ms: input.at,
        }
    }

    pub fn finish(
        &self,
        metrics: &WorkerMetrics,
        sample: &WorkerSample,
        result: &Result<StepOutcome, ServiceError>,
    ) {
        let Self {
            input_id,
            worker,
            universe,
            action,
            mode,
            logical_at_ms,
            ..
        } = *self;
        let elapsed = self.monotonic.elapsed();
        metrics.observe(mode, action, sample);
        let outcome = sample.terminal.unwrap_or(match result {
            Ok(StepOutcome::Committed { .. }) => "existing",
            Ok(StepOutcome::Retry) => "retry",
            Ok(StepOutcome::Blocked { .. }) => "blocked",
            Ok(StepOutcome::Idle) => "idle",
            Err(_) => "error",
        });
        // Keep every gameplay order for admission-time cohorts, including fast
        // ones. Other input types identify work ahead of an admitted dispatch.
        let phase_us = |phase| sample.duration(phase).map(|d| d.as_micros() as u64);
        macro_rules! record { ($level:ident) => {
            orbit_application::orbit_log!($level, event = "worker_input_attempt", %worker, %universe, %input_id, mode, action, outcome,
                logical_at_ms, claim_ack_us = self.wall_us, commit_ack_us = sample.commit_ack_us,
                attempt_us = elapsed.as_micros() as u64,
                fact_load_us = phase_us(Phase::FactLoad), cpu_queue_us = phase_us(Phase::CpuQueue),
                cpu_execution_us = phase_us(Phase::CpuExecution), commit_revalidation_us = phase_us(Phase::Revalidation),
                alliance_wait_us = phase_us(Phase::AllianceWait), alliance_hold_us = phase_us(Phase::AllianceHold),
                persistence_us = phase_us(Phase::Persistence), scoped_fence_us = phase_us(Phase::ScopedFence), commit_round_trip_us = phase_us(Phase::Commit),
                fact_lots_read = sample.fact_lots_read, revalidation_lots_read = sample.revalidation_lots_read,
                lots_inserted = sample.lots_inserted, lots_deleted = sample.lots_deleted,
                fact_stacks_read = sample.fact_stacks_read, revalidation_stacks_read = sample.revalidation_stacks_read,
                stacks_written = sample.stacks_written)
        } }
        let logically_late = self
            .wall_us
            .is_some_and(|us| i128::from(us) - i128::from(logical_at_ms) * 1000 >= 250_000);
        if self.gameplay
            || elapsed >= Duration::from_millis(250)
            || logically_late
            || sample.terminal.is_none()
        {
            record!(INFO);
        } else {
            record!(DEBUG);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_storage_postgres::worker_observation::{collect, duration};

    #[tokio::test]
    async fn attempt_histograms_keep_modes_isolated_and_leave_unvisited_phases_absent() {
        let metrics = crate::metrics::RuntimeMetrics::new();
        let (serial, scoped) = tokio::join!(
            collect(async {
                duration(Phase::FactLoad, Duration::from_millis(250));
                tokio::task::yield_now().await;
                duration(Phase::Commit, Duration::from_millis(1));
            }),
            collect(async {
                duration(Phase::FactLoad, Duration::from_micros(250_001));
                tokio::task::yield_now().await;
            })
        );
        metrics
            .worker
            .observe("serial", "fleet_dispatch", &serial.1);
        metrics
            .worker
            .observe("scoped", "fleet_dispatch", &scoped.1);
        let worker = WorkerId(uuid::Uuid::from_u128(77));
        metrics.worker.wait(
            worker,
            "barrier_no_progress",
            3,
            "notification",
            Duration::from_millis(23),
        );
        metrics.worker.wait(
            worker,
            "barrier_no_progress",
            0,
            "timer",
            Duration::from_millis(101),
        );
        let text = metrics.render();
        assert!(text.contains("orbit_worker_phase_seconds_bucket{mode=\"serial\",action=\"fleet_dispatch\",phase=\"fact_load\",le=\"0.25\"} 1"));
        assert!(text.contains("orbit_worker_phase_seconds_bucket{mode=\"scoped\",action=\"fleet_dispatch\",phase=\"fact_load\",le=\"0.25\"} 0"));
        assert!(
            !text.contains("mode=\"scoped\",action=\"fleet_dispatch\",phase=\"commit_round_trip\"")
        );
        assert!(text.contains("orbit_worker_scheduler_wait_seconds_sum{reason=\"barrier_no_progress\",active_inputs=\"true\",wake=\"notification\"} 0.023"));
        assert!(text.contains("orbit_worker_scheduler_wait_seconds_count{reason=\"barrier_no_progress\",active_inputs=\"false\",wake=\"timer\"} 1"));
        assert!(!text.contains(&worker.to_string()));
    }
}

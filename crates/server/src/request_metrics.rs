//! Request aggregates and a bounded, private recent-slow-request buffer.
use orbit_application::{AdmissionOutcome, RequestAction, RequestObservation, RequestPhase};
use std::{
    collections::{BTreeMap, VecDeque},
    fmt::Write,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const BOUNDS: [(u64, &str); 14] = [
    (5_000, "0.005"),
    (10_000, "0.01"),
    (25_000, "0.025"),
    (50_000, "0.05"),
    (100_000, "0.1"),
    (150_000, "0.15"),
    (250_000, "0.25"),
    (500_000, "0.5"),
    (1_000_000, "1"),
    (2_500_000, "2.5"),
    (5_000_000, "5"),
    (10_000_000, "10"),
    (30_000_000, "30"),
    (u64::MAX, "+Inf"),
];
const MAX_SERIES: usize = 4096;
const MAX_RECENT: usize = 64;
#[derive(Clone, Default)]
pub(super) struct Histogram {
    buckets: [u64; BOUNDS.len()],
    sum: f64,
}
impl Histogram {
    pub(super) fn observe(&mut self, elapsed: Duration) {
        self.sum += elapsed.as_secs_f64();
        for ((bound, _), count) in BOUNDS.iter().zip(&mut self.buckets) {
            if *bound == u64::MAX || elapsed.as_nanos() <= u128::from(*bound) * 1000 {
                *count += 1;
            }
        }
    }
    pub(super) fn render(&self, text: &mut String, name: &str, labels: &str) {
        for ((_, bound), count) in BOUNDS.iter().zip(self.buckets) {
            writeln!(text, "{name}_bucket{{{labels},le=\"{bound}\"}} {count}").unwrap();
        }
        writeln!(text, "{name}_sum{{{labels}}} {}", self.sum).unwrap();
        writeln!(
            text,
            "{name}_count{{{labels}}} {}",
            self.buckets[BOUNDS.len() - 1]
        )
        .unwrap();
    }
}
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Key {
    route: String,
    method: &'static str,
    action: RequestAction,
    outcome: &'static str,
    phase: Option<RequestPhase>,
}
#[derive(Clone, Default)]
struct State {
    requests: BTreeMap<Key, Histogram>,
    admissions: BTreeMap<(RequestAction, bool, AdmissionOutcome), Histogram>,
    recent: VecDeque<(u64, RequestObservation)>,
    dropped: u64,
}
#[derive(Default)]
pub struct RequestMetrics(Mutex<State>);
impl RequestMetrics {
    pub fn observe(&self, sample: RequestObservation) {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        for (phase, elapsed) in std::iter::once((None, Some(sample.elapsed))).chain(
            RequestPhase::ALL
                .into_iter()
                .map(|phase| (Some(phase), sample.phases[phase as usize])),
        ) {
            let Some(elapsed) = elapsed else { continue };
            let key = Key {
                route: sample.route.clone(),
                method: sample.method,
                action: sample.action,
                outcome: sample.outcome(),
                phase,
            };
            if state.requests.len() >= MAX_SERIES && !state.requests.contains_key(&key) {
                state.dropped += 1;
                continue;
            }
            state.requests.entry(key).or_default().observe(elapsed);
        }
        if sample.elapsed >= Duration::from_millis(250) {
            if state.recent.len() == MAX_RECENT {
                state.recent.pop_front();
            }
            let at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            state.recent.push_back((at, sample));
        }
    }
    pub fn admission(
        &self,
        action: RequestAction,
        machine: bool,
        outcome: AdmissionOutcome,
        elapsed: Duration,
    ) {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .admissions
            .entry((action, machine, outcome))
            .or_default()
            .observe(elapsed);
    }
    pub fn render(&self, text: &mut String) {
        // Formatting a scrape must not hold up requests while building text.
        let state = self.0.lock().unwrap_or_else(|e| e.into_inner()).clone();
        text.push_str("# HELP orbit_http_request_seconds API entry to response creation; cancelled requests included.\n# TYPE orbit_http_request_seconds histogram\n# HELP orbit_http_phase_seconds Nested phase duration within a request; phases overlap.\n# TYPE orbit_http_phase_seconds histogram\n# HELP orbit_command_admission_seconds Storage admission through commit acknowledgement, replay or failure.\n# TYPE orbit_command_admission_seconds histogram\n");
        for (key, histogram) in &state.requests {
            // JSON quoting also escapes quotes, backslashes and newlines in label values.
            let mut labels = format!(
                "route={},method=\"{}\",action=\"{}\",outcome=\"{}\"",
                serde_json::to_string(&key.route).unwrap(),
                key.method,
                key.action.name(),
                key.outcome
            );
            let name = if let Some(phase) = key.phase {
                write!(labels, ",phase=\"{}\"", phase.name()).unwrap();
                "orbit_http_phase_seconds"
            } else {
                "orbit_http_request_seconds"
            };
            histogram.render(text, name, &labels);
        }
        for ((action, machine, outcome), histogram) in &state.admissions {
            let labels = format!(
                "action=\"{}\",source=\"{}\",outcome=\"{}\"",
                action.name(),
                if *machine { "machine" } else { "foreground" },
                outcome.name()
            );
            histogram.render(text, "orbit_command_admission_seconds", &labels);
        }
        writeln!(text, "# TYPE orbit_http_observations_dropped_total counter\norbit_http_observations_dropped_total {}", state.dropped).unwrap();
    }
    pub fn recent(&self) -> serde_json::Value {
        let recent = self
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .recent
            .clone();
        let samples: Vec<_> = recent.iter().rev().map(|(at, sample)| {
            let phases: BTreeMap<_, _> = RequestPhase::ALL.into_iter()
                .filter_map(|phase| sample.phases[phase as usize].map(|elapsed| (phase.name(), elapsed.as_secs_f64()))).collect();
            serde_json::json!({"observed_at_unix_seconds": at, "route": sample.route, "method": sample.method,
                "action": sample.action.name(), "status": sample.status, "outcome": sample.outcome(),
                "duration_seconds": sample.elapsed.as_secs_f64(), "phases_seconds": phases,
                "admission": sample.admission.map(AdmissionOutcome::name)})
        }).collect();
        serde_json::json!({"schema": 1, "threshold_seconds": 0.25, "capacity": MAX_RECENT,
            "retention": "process-local; latest samples only; cleared on restart", "samples": samples})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample(elapsed: Duration) -> RequestObservation {
        RequestObservation {
            route: "/api/v4/universes/{id}/commands".into(),
            method: "POST",
            action: RequestAction::ShipOrder,
            status: Some(202),
            elapsed,
            phases: [None; RequestPhase::ALL.len()],
            admission: Some(AdmissionOutcome::Committed),
        }
    }
    #[test]
    fn exact_slo_boundary_failures_replays_and_overlapping_phases_are_exported() {
        let metrics = RequestMetrics::default();
        let mut first = sample(Duration::from_millis(250));
        first.phases[RequestPhase::PoolWait as usize] = Some(Duration::from_millis(20));
        metrics.observe(first);
        metrics.observe(sample(Duration::from_millis(250) + Duration::from_nanos(1)));
        let mut failed = sample(Duration::from_secs(2));
        failed.status = Some(503);
        failed.admission = None;
        metrics.observe(failed);
        metrics.admission(
            RequestAction::ShipOrder,
            false,
            AdmissionOutcome::Committed,
            Duration::from_millis(100),
        );
        metrics.admission(
            RequestAction::ShipOrder,
            false,
            AdmissionOutcome::Replay,
            Duration::from_millis(10),
        );
        let mut text = String::new();
        metrics.render(&mut text);
        let labels =
            "route=\"/api/v4/universes/{id}/commands\",method=\"POST\",action=\"ship_order\"";
        assert!(text.contains(&format!(
            "orbit_http_request_seconds_bucket{{{labels},outcome=\"accepted\",le=\"0.25\"}} 1"
        )));
        assert!(text.contains(&format!(
            "orbit_http_request_seconds_count{{{labels},outcome=\"accepted\"}} 2"
        )));
        assert!(text.contains(&format!(
            "orbit_http_request_seconds_count{{{labels},outcome=\"server_error\"}} 1"
        )));
        assert!(text.contains(&format!(
            "orbit_http_phase_seconds_count{{{labels},outcome=\"accepted\",phase=\"pool_wait\"}} 1"
        )));
        for outcome in ["committed", "replay"] {
            assert!(text.contains(&format!("orbit_command_admission_seconds_count{{action=\"ship_order\",source=\"foreground\",outcome=\"{outcome}\"}} 1")));
        }
    }
    #[test]
    fn slow_samples_are_bounded_and_series_overflow_is_visible() {
        let metrics = RequestMetrics::default();
        metrics.observe(sample(Duration::from_millis(249)));
        assert!(metrics.recent()["samples"].as_array().unwrap().is_empty());
        for i in 0..MAX_SERIES + 1 {
            let mut request = sample(Duration::from_millis(300));
            request.route = format!("/fixture-{i}");
            metrics.observe(request);
        }
        let recent = metrics.recent();
        assert_eq!(recent["samples"].as_array().unwrap().len(), MAX_RECENT);
        assert_eq!(
            recent["samples"][0]["route"],
            format!("/fixture-{MAX_SERIES}")
        );
        let mut text = String::new();
        metrics.render(&mut text);
        assert!(text.contains("orbit_http_observations_dropped_total 2\n"));
    }
}

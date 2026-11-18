use axum::{
    extract::{MatchedPath, Request, State},
    middleware::Next,
    response::Response,
};
use orbit_application::*;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

tokio::task_local! {
    static CURRENT: Arc<Mutex<RequestObservation>>;
    static CORRELATION: Arc<Mutex<Option<(UniverseId, CommandId)>>>;
}

/// Wrap the shared storage/HTTP observer to associate existing phase timers with
/// the request being polled. Task-local scope cannot leak across concurrent calls.
pub struct RequestTimingObserver(pub Arc<dyn RuntimeObserver>);
impl RuntimeObserver for RequestTimingObserver {
    fn retention(
        &self,
        universe: Option<UniverseId>,
        kind: &'static str,
        sample: (i64, i64),
        scan_limited: bool,
    ) {
        self.0.retention(universe, kind, sample, scan_limited);
    }

    fn request(&self, sample: RequestObservation) {
        self.0.request(sample);
    }
    fn duration(&self, stage: RuntimeStage, elapsed: Duration) {
        self.0.duration(stage, elapsed);
        let phase = match stage {
            RuntimeStage::PoolWait => RequestPhase::PoolWait,
            RuntimeStage::OrderingWait => RequestPhase::OrderingWait,
            RuntimeStage::OrderingHold => RequestPhase::OrderingHold,
            RuntimeStage::AdmissionCommit => RequestPhase::AdmissionCommit,
            _ => return,
        };
        let _ = CURRENT.try_with(|sample| add_phase(sample, phase, elapsed));
    }
    fn event(&self, event: RuntimeEvent) {
        self.0.event(event);
    }
    fn auth_duration(&self, phase: AuthPhase, outcome: AuthOutcome, elapsed: Duration) {
        self.0.auth_duration(phase, outcome, elapsed);
    }
    fn bootstrap(&self, outcome: BootstrapOutcome) {
        self.0.bootstrap(outcome);
    }
    fn admission(
        &self,
        action: RequestAction,
        machine: bool,
        outcome: AdmissionOutcome,
        elapsed: Duration,
    ) {
        self.0.admission(action, machine, outcome, elapsed);
        let _ = CURRENT.try_with(|sample| {
            add_phase(sample, RequestPhase::Admission, elapsed);
            sample.lock().unwrap_or_else(|e| e.into_inner()).admission = Some(outcome);
        });
    }
}

fn add_phase(sample: &Mutex<RequestObservation>, phase: RequestPhase, elapsed: Duration) {
    let mut sample = sample.lock().unwrap_or_else(|e| e.into_inner());
    let slot = &mut sample.phases[phase as usize];
    *slot = Some(slot.unwrap_or_default().saturating_add(elapsed));
}

pub(super) fn action(action: RequestAction) {
    let _ = CURRENT.try_with(|sample| {
        sample.lock().unwrap_or_else(|e| e.into_inner()).action = action;
    });
}

pub(super) fn correlate(universe: UniverseId, command: CommandId) {
    let _ = CORRELATION
        .try_with(|ids| *ids.lock().unwrap_or_else(|e| e.into_inner()) = Some((universe, command)));
}

pub(super) struct AuthenticationTimer {
    sample: Option<Arc<Mutex<RequestObservation>>>,
    started: Instant,
}
impl AuthenticationTimer {
    pub fn new() -> Self {
        Self {
            sample: CURRENT.try_with(Arc::clone).ok(),
            started: Instant::now(),
        }
    }
}
impl Drop for AuthenticationTimer {
    fn drop(&mut self) {
        if let Some(sample) = &self.sample {
            add_phase(sample, RequestPhase::Authentication, self.started.elapsed());
        }
    }
}

struct Completion {
    sample: Arc<Mutex<RequestObservation>>,
    observer: Arc<dyn RuntimeObserver>,
    started: Instant,
    legacy_stage: Option<RuntimeStage>,
    correlation: Arc<Mutex<Option<(UniverseId, CommandId)>>>,
}
impl Drop for Completion {
    fn drop(&mut self) {
        let mut sample = self
            .sample
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        sample.elapsed = self.started.elapsed();
        // Preserve the existing completed-request stage counters.
        if sample.status.is_some() {
            if let Some(stage) = self.legacy_stage {
                self.observer.duration(stage, sample.elapsed);
            }
            if sample.status.is_some_and(|code| code >= 500) {
                self.observer.event(RuntimeEvent::HttpFailure);
            }
        }
        if sample.status.is_some_and(|s| s >= 500)
            || tracing::enabled!(target: "orbit", tracing::Level::DEBUG)
        {
            let ids = *self.correlation.lock().unwrap_or_else(|e| e.into_inner());
            let universe = ids.map(|(u, _)| u.to_string());
            let command = ids.map(|(_, c)| c.to_string());
            let status = sample.status;
            let outcome = sample.outcome();
            // Routine reads/polls are debug-only. Expected 4xx are not errors.
            if status.is_some_and(|s| s >= 500) {
                orbit_application::orbit_log!(
                    ERROR,
                    event = "http_request_failed",
                    stage = "http",
                    route = sample.route,
                    method = sample.method,
                    action = sample.action.name(),
                    universe,
                    command_id = command,
                    status,
                    outcome,
                    commit_outcome = "unknown",
                    duration_ms = sample.elapsed.as_millis() as u64
                );
            } else {
                orbit_application::orbit_log!(
                    DEBUG,
                    event = "http_request_completed",
                    stage = "http",
                    route = sample.route,
                    method = sample.method,
                    action = sample.action.name(),
                    universe,
                    command_id = command,
                    status,
                    outcome,
                    duration_ms = sample.elapsed.as_millis() as u64
                );
            }
        }
        self.observer.request(sample);
    }
}

pub(super) async fn observe(
    State(observer): State<Arc<dyn RuntimeObserver>>,
    request: Request,
    next: Next,
) -> Response {
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str())
        .unwrap_or("unmatched")
        .to_owned();
    let legacy_stage = route.contains("/universes/").then(|| {
        if route.ends_with("/commands") || route.ends_with("/presence") {
            RuntimeStage::Admission
        } else {
            RuntimeStage::Read
        }
    });
    let method = match request.method().as_str() {
        "GET" => "GET",
        "POST" => "POST",
        "PUT" => "PUT",
        "PATCH" => "PATCH",
        "DELETE" => "DELETE",
        "HEAD" => "HEAD",
        "OPTIONS" => "OPTIONS",
        _ => "OTHER",
    };
    let sample = Arc::new(Mutex::new(RequestObservation {
        route,
        method,
        action: RequestAction::Unknown,
        status: None,
        elapsed: Duration::ZERO,
        phases: [None; RequestPhase::ALL.len()],
        admission: None,
    }));
    let correlation = Arc::new(Mutex::new(None));
    let completion = Completion {
        correlation: correlation.clone(),
        sample: sample.clone(),
        observer,
        started: Instant::now(),
        legacy_stage,
    };
    let response = CORRELATION
        .scope(
            correlation,
            CURRENT.scope(sample.clone(), next.run(request)),
        )
        .await;
    sample.lock().unwrap_or_else(|e| e.into_inner()).status = Some(response.status().as_u16());
    drop(completion);
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        http::{Request as HttpRequest, StatusCode},
        routing::get,
    };
    use tower::ServiceExt;
    #[derive(Default)]
    struct Recorder(Mutex<Vec<RequestObservation>>);
    impl RuntimeObserver for Recorder {
        fn duration(&self, _: RuntimeStage, _: Duration) {}
        fn event(&self, _: RuntimeEvent) {}
        fn request(&self, sample: RequestObservation) {
            self.0.lock().unwrap().push(sample);
        }
    }
    fn request(path: &str) -> HttpRequest<Body> {
        HttpRequest::get(path).body(Body::empty()).unwrap()
    }

    #[tokio::test]
    async fn concurrent_requests_keep_phases_actions_and_route_templates_separate() {
        let recorder = Arc::new(Recorder::default());
        let observer: Arc<dyn RuntimeObserver> = Arc::new(RequestTimingObserver(recorder.clone()));
        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        let app = Router::new()
            .route(
                "/api/{id}/commands",
                get({
                    let observer = observer.clone();
                    move |axum::extract::Path(id): axum::extract::Path<String>| {
                        let observer = observer.clone();
                        let barrier = barrier.clone();
                        async move {
                            let (kind, ms) = if id == "secret-a" {
                                (RequestAction::ShipOrder, 17)
                            } else {
                                (RequestAction::BuildingUpgrade, 43)
                            };
                            action(kind);
                            let _auth = AuthenticationTimer::new();
                            barrier.wait().await;
                            observer.duration(RuntimeStage::PoolWait, Duration::from_millis(ms));
                            observer.admission(
                                kind,
                                false,
                                AdmissionOutcome::Committed,
                                Duration::from_millis(ms + 1),
                            );
                            StatusCode::ACCEPTED
                        }
                    }
                }),
            )
            .layer(axum::middleware::from_fn_with_state(observer, observe));
        let (a, b) = tokio::join!(
            app.clone()
                .oneshot(request("/api/secret-a/commands?token=secret")),
            app.oneshot(request("/api/secret-b/commands"))
        );
        assert_eq!(a.unwrap().status(), StatusCode::ACCEPTED);
        assert_eq!(b.unwrap().status(), StatusCode::ACCEPTED);
        let samples = recorder.0.lock().unwrap();
        assert_eq!(samples.len(), 2);
        for sample in samples.iter() {
            assert_eq!(sample.route, "/api/{id}/commands");
            assert_eq!(sample.outcome(), "accepted");
            let ms = if sample.action == RequestAction::ShipOrder {
                17
            } else {
                43
            };
            assert_eq!(
                sample.phases[RequestPhase::PoolWait as usize],
                Some(Duration::from_millis(ms))
            );
            assert_eq!(
                sample.phases[RequestPhase::Admission as usize],
                Some(Duration::from_millis(ms + 1))
            );
            assert!(sample.phases[RequestPhase::Authentication as usize].is_some());
        }
    }

    #[tokio::test]
    async fn cancellation_records_partial_auth_and_never_manufactures_acceptance() {
        let recorder = Arc::new(Recorder::default());
        let observer: Arc<dyn RuntimeObserver> = Arc::new(RequestTimingObserver(recorder.clone()));
        let entered = Arc::new(tokio::sync::Notify::new());
        let app = Router::new()
            .route(
                "/commands",
                get({
                    let entered = entered.clone();
                    let observer = observer.clone();
                    move || {
                        let entered = entered.clone();
                        let observer = observer.clone();
                        async move {
                            action(RequestAction::FleetDispatch);
                            let _auth = AuthenticationTimer::new();
                            let _pool = RuntimeTimer::new(observer, RuntimeStage::PoolWait);
                            entered.notify_one();
                            std::future::pending::<StatusCode>().await
                        }
                    }
                }),
            )
            .layer(axum::middleware::from_fn_with_state(observer, observe));
        let call = tokio::spawn(app.oneshot(request("/commands")));
        entered.notified().await;
        call.abort();
        assert!(call.await.unwrap_err().is_cancelled());
        let samples = recorder.0.lock().unwrap();
        assert_eq!(samples.len(), 1);
        assert_eq!(samples[0].outcome(), "cancelled");
        assert_eq!(samples[0].action, RequestAction::FleetDispatch);
        assert!(samples[0].admission.is_none());
        assert!(samples[0].phases[RequestPhase::PoolWait as usize].is_some());
        assert!(samples[0].phases[RequestPhase::Authentication as usize].is_some());
    }

    #[tokio::test]
    async fn errors_and_unknown_methods_are_bounded_without_uri_labels() {
        let recorder = Arc::new(Recorder::default());
        let observer: Arc<dyn RuntimeObserver> = recorder.clone();
        let app = Router::new()
            .route(
                "/service",
                get(|| async { StatusCode::SERVICE_UNAVAILABLE }),
            )
            .layer(axum::middleware::from_fn_with_state(observer, observe));
        app.clone()
            .oneshot(request("/service?password=secret"))
            .await
            .unwrap();
        app.clone()
            .oneshot(request("/missing-secret"))
            .await
            .unwrap();
        app.oneshot(
            HttpRequest::builder()
                .method("PRIVATE-SECRET")
                .uri("/service")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
        let samples = recorder.0.lock().unwrap();
        assert_eq!(samples.len(), 3);
        assert_eq!(samples[0].outcome(), "server_error");
        assert_eq!(samples[1].route, "unmatched");
        assert_eq!(samples[2].method, "OTHER");
        assert!(!format!("{samples:?}").contains("secret"));
    }
}

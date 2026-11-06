//! Bounded authentication telemetry: no identity, credential or request labels.
use crate::{RuntimeObserver, StoreError};
use std::{sync::Arc, time::Instant};

#[derive(Clone, Copy)]
#[repr(usize)]
pub enum AuthPhase {
    Read,
    Claim,
    Provider,
    Persist,
    BootstrapAuth,
    BootstrapGame,
}
impl AuthPhase {
    pub const ALL: [Self; 6] = [
        Self::Read,
        Self::Claim,
        Self::Provider,
        Self::Persist,
        Self::BootstrapAuth,
        Self::BootstrapGame,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Claim => "claim",
            Self::Provider => "provider",
            Self::Persist => "persist",
            Self::BootstrapAuth => "bootstrap_auth",
            Self::BootstrapGame => "bootstrap_game",
        }
    }
}
#[derive(Clone, Copy)]
#[repr(usize)]
pub enum AuthOutcome {
    Success,
    Unavailable,
    SigninRequired,
    Cancelled,
    Refreshing,
}
impl AuthOutcome {
    pub const ALL: [Self; 5] = [
        Self::Success,
        Self::Unavailable,
        Self::SigninRequired,
        Self::Cancelled,
        Self::Refreshing,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Unavailable => "unavailable",
            Self::SigninRequired => "signin_required",
            Self::Cancelled => "cancelled",
            Self::Refreshing => "refreshing",
        }
    }
    pub fn from_store<T>(result: &Result<T, StoreError>) -> Self {
        match result {
            Ok(_) => Self::Success,
            Err(StoreError::Conflict | StoreError::NotFound) => Self::SigninRequired,
            Err(StoreError::SessionRefreshing(_)) => Self::Refreshing,
            Err(_) => Self::Unavailable,
        }
    }
}
#[derive(Clone, Copy)]
#[repr(usize)]
pub enum BootstrapOutcome {
    Authenticated,
    Anonymous,
    AuthUnavailable,
    GameUnavailable,
}
impl BootstrapOutcome {
    pub const ALL: [Self; 4] = [
        Self::Authenticated,
        Self::Anonymous,
        Self::AuthUnavailable,
        Self::GameUnavailable,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::Authenticated => "authenticated",
            Self::Anonymous => "anonymous",
            Self::AuthUnavailable => "auth_unavailable",
            Self::GameUnavailable => "game_unavailable",
        }
    }
}
pub struct AuthTimer {
    observer: Arc<dyn RuntimeObserver>,
    phase: AuthPhase,
    outcome: AuthOutcome,
    started: Instant,
}
impl AuthTimer {
    pub fn new(observer: Arc<dyn RuntimeObserver>, phase: AuthPhase) -> Self {
        Self {
            observer,
            phase,
            outcome: AuthOutcome::Cancelled,
            started: Instant::now(),
        }
    }
    pub fn finish(&mut self, outcome: AuthOutcome) {
        self.outcome = outcome;
    }
}
impl Drop for AuthTimer {
    fn drop(&mut self) {
        self.observer
            .auth_duration(self.phase, self.outcome, self.started.elapsed());
    }
}
pub async fn observe_auth_store<T>(
    observer: Arc<dyn RuntimeObserver>,
    phase: AuthPhase,
    future: impl Future<Output = Result<T, StoreError>>,
) -> Result<T, StoreError> {
    let mut timer = AuthTimer::new(observer, phase);
    let result = future.await;
    timer.finish(AuthOutcome::from_store(&result));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RuntimeEvent, RuntimeStage};
    use std::{sync::Mutex, time::Duration};
    #[derive(Default)]
    struct Observer(Mutex<Vec<(&'static str, &'static str)>>);
    impl RuntimeObserver for Observer {
        fn duration(&self, _: RuntimeStage, _: Duration) {}
        fn event(&self, _: RuntimeEvent) {}
        fn auth_duration(&self, phase: AuthPhase, outcome: AuthOutcome, _: Duration) {
            self.0.lock().unwrap().push((phase.name(), outcome.name()));
        }
    }
    #[test]
    fn refresh_contention_is_distinct_from_store_failure_and_signin() {
        let observer = Arc::new(Observer::default());
        for error in [
            StoreError::SessionRefreshing(1000),
            StoreError::Unavailable,
            StoreError::NotFound,
        ] {
            let result: Result<(), StoreError> = futures::executor::block_on(observe_auth_store(
                observer.clone(),
                AuthPhase::Read,
                async { Err(error) },
            ));
            assert!(result.is_err());
        }
        assert_eq!(
            *observer.0.lock().unwrap(),
            vec![
                ("read", "refreshing"),
                ("read", "unavailable"),
                ("read", "signin_required"),
            ]
        );
    }
    #[test]
    fn cancelled_and_failed_phases_are_distinct() {
        let observer = Arc::new(Observer::default());
        let timer = AuthTimer::new(observer.clone(), AuthPhase::Provider);
        drop(timer);
        let result: Result<(), StoreError> = futures::executor::block_on(observe_auth_store(
            observer.clone(),
            AuthPhase::Persist,
            async { Err(StoreError::Unavailable) },
        ));
        assert!(result.is_err());
        assert_eq!(
            *observer.0.lock().unwrap(),
            vec![("provider", "cancelled"), ("persist", "unavailable")]
        );
    }
}

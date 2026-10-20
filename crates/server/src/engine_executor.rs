use orbit_application::{
    ClaimSnapshot, EngineExecutor, NoopRuntimeObserver, RuntimeEvent, RuntimeObserver,
    RuntimeStage, RuntimeTimer, ServiceError,
};
use orbit_engine::{OrderedInput, TransitionResult};
use std::sync::Arc;
use tokio::sync::Semaphore;

#[derive(Clone)]
pub struct BoundedEngine {
    permits: Arc<Semaphore>,
    observer: Arc<dyn RuntimeObserver>,
}
impl BoundedEngine {
    pub fn new(parallelism: usize) -> Result<Self, &'static str> {
        if !(1..=128).contains(&parallelism) {
            return Err("CPU parallelism must be between 1 and 128");
        }
        Ok(Self {
            permits: Arc::new(Semaphore::new(parallelism)),
            observer: Arc::new(NoopRuntimeObserver),
        })
    }
    pub fn with_observer(mut self, observer: Arc<dyn RuntimeObserver>) -> Self {
        self.observer = observer;
        self
    }
    async fn blocking<T: Send + 'static>(
        &self,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> Result<T, ServiceError> {
        let waiting = RuntimeTimer::new(self.observer.clone(), RuntimeStage::EngineQueue);
        let permit = self
            .permits
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| ServiceError::Unavailable)?;
        drop(waiting);
        let observer = self.observer.clone();
        tokio::task::spawn_blocking(move || {
            let _held = permit;
            observer.event(RuntimeEvent::EngineStarted);
            let _active = EngineActivity(observer.clone());
            let _duration = RuntimeTimer::new(observer, RuntimeStage::Engine);
            work()
        })
        .await
        .map_err(|_| ServiceError::Unavailable)
    }
}
impl EngineExecutor for BoundedEngine {
    async fn execute(
        &self,
        snapshot: ClaimSnapshot,
        input: OrderedInput,
    ) -> Result<TransitionResult, ServiceError> {
        self.blocking(move || orbit_engine::transition(&snapshot.state, &input, &snapshot.rules))
            .await
    }
}

struct EngineActivity(Arc<dyn RuntimeObserver>);
impl Drop for EngineActivity {
    fn drop(&mut self) {
        self.0.event(RuntimeEvent::EngineFinished);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn blocking_work_keeps_io_live_and_aborting_awaiter_does_not_release_cpu_permit() {
        let executor = BoundedEngine::new(1).unwrap();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let first = executor.clone();
        let task = tokio::spawn(async move {
            first
                .blocking(move || {
                    started_tx.send(()).unwrap();
                    release_rx.recv().unwrap();
                    1
                })
                .await
        });
        started_rx.await.unwrap();
        task.abort();
        let _ = task.await;
        let (second_tx, mut second_rx) = tokio::sync::oneshot::channel();
        let second = executor.clone();
        let queued = tokio::spawn(async move {
            second
                .blocking(move || {
                    second_tx.send(()).unwrap();
                    2
                })
                .await
        });
        tokio::task::yield_now().await;
        assert!(second_rx.try_recv().is_err());
        assert_eq!(executor.permits.available_permits(), 0);
        // This async task runs while the CPU lane is held by a blocking job.
        assert_eq!(tokio::spawn(async { 42 }).await.unwrap(), 42);
        release_tx.send(()).unwrap();
        assert_eq!(queued.await.unwrap().unwrap(), 2);
        second_rx.await.unwrap();
        assert_eq!(executor.permits.available_permits(), 1);
    }
}

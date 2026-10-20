use std::sync::Arc;
use tokio::{
    sync::{Semaphore, TryAcquireError},
    task::JoinHandle,
};

/// Admit password work without queuing requests, and hold its capacity until
/// the worker exits even if the request awaiting it is cancelled.
pub(super) fn spawn<F, T>(limit: &Arc<Semaphore>, work: F) -> Result<JoinHandle<T>, TryAcquireError>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    let permit = limit.clone().try_acquire_owned()?;
    Ok(tokio::task::spawn_blocking(move || {
        // A started blocking task outlives a cancelled request. The worker must
        // own the permit, including while queued and during panic unwinding.
        let _permit = permit;
        work()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn detached_worker_holds_capacity_until_it_finishes() {
        let limit = Arc::new(Semaphore::new(1));
        let (started, entered) = tokio::sync::oneshot::channel();
        let (release, blocked) = std::sync::mpsc::channel();
        let worker = spawn(&limit, move || {
            started.send(()).unwrap();
            let _ = blocked.recv();
        })
        .unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(10), entered)
            .await
            .unwrap()
            .unwrap();
        drop(worker);
        assert!(matches!(
            spawn(&limit, || panic!("saturated work must not run")),
            Err(TryAcquireError::NoPermits)
        ));
        release.send(()).unwrap();
        // Acquiring capacity synchronizes with the detached worker's exit.
        let permit = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            limit.clone().acquire_owned(),
        )
        .await
        .unwrap()
        .unwrap();
        drop(permit);
        assert_eq!(spawn(&limit, || 42).unwrap().await.unwrap(), 42);
    }

    #[tokio::test]
    async fn completion_and_service_failure_return_the_result_and_release_capacity() {
        let limit = Arc::new(Semaphore::new(1));
        for result in [Ok(42), Err("service failure")] {
            assert_eq!(
                spawn(&limit, move || result).unwrap().await.unwrap(),
                result
            );
            assert_eq!(limit.available_permits(), 1);
        }
    }

    #[tokio::test]
    async fn panicking_worker_releases_capacity_and_reports_join_failure() {
        let limit = Arc::new(Semaphore::new(1));
        let failure = spawn(&limit, || panic!("worker failure"))
            .unwrap()
            .await
            .unwrap_err();
        assert!(failure.is_panic());
        assert_eq!(limit.available_permits(), 1);
        assert_eq!(spawn(&limit, || 42).unwrap().await.unwrap(), 42);
    }
}

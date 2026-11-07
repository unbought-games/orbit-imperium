//! Bounded peer coordination, never ownership of a refresh token. PostgreSQL
//! remains authoritative across replicas. No connection is held between reads.
use orbit_application::StoreError;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::time::Instant;

const WAIT_BUDGET: Duration = Duration::from_millis(500);
const MAX_WAITERS: usize = 64;
const MAX_SESSION_WAITERS: usize = 8;

#[derive(Default)]
pub(crate) struct Waiters(Mutex<HashMap<String, usize>>);

pub(crate) struct Wait {
    owner: Arc<Waiters>,
    digest: String,
    deadline: Instant,
    delay: Duration,
    retry_ms: u64,
}

impl Waiters {
    #[cfg(feature = "test-support")]
    pub(crate) fn count(&self) -> usize {
        self.0.lock().unwrap().values().sum()
    }

    fn enter(self: &Arc<Self>, digest: &str, retry_ms: u64) -> Result<Wait, StoreError> {
        let mut sessions = self.0.lock().map_err(|_| StoreError::Unavailable)?;
        if sessions.values().sum::<usize>() >= MAX_WAITERS
            || sessions.get(digest).copied().unwrap_or(0) >= MAX_SESSION_WAITERS
        {
            return Err(StoreError::SessionRefreshing(retry_ms));
        }
        *sessions.entry(digest.to_owned()).or_default() += 1;
        Ok(Wait {
            owner: self.clone(),
            digest: digest.to_owned(),
            deadline: Instant::now() + WAIT_BUDGET,
            delay: Duration::from_millis(25),
            retry_ms,
        })
    }
}

impl Drop for Wait {
    fn drop(&mut self) {
        // Cancellation and every error path release capacity; no session cache.
        let mut sessions = self.owner.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(count) = sessions.get_mut(&self.digest) {
            *count -= 1;
            if *count == 0 {
                sessions.remove(&self.digest);
            }
        }
    }
}

pub(crate) async fn retry(
    owner: &Arc<Waiters>,
    digest: &str,
    waiting: &mut Option<Wait>,
    retry_ms: u64,
) -> Result<(), StoreError> {
    if waiting.is_none() {
        *waiting = Some(owner.enter(digest, retry_ms)?);
    }
    let wait = waiting.as_mut().expect("entered wait");
    wait.retry_ms = retry_ms;
    let now = Instant::now();
    if now >= wait.deadline {
        return Err(StoreError::SessionRefreshing(retry_ms));
    }
    tokio::time::sleep_until((now + wait.delay).min(wait.deadline)).await;
    wait.delay = (wait.delay * 2).min(Duration::from_millis(200));
    Ok(())
}

pub(crate) async fn read_before_deadline<T>(
    wait: &Wait,
    read: impl std::future::Future<Output = Result<T, StoreError>>,
) -> Result<T, StoreError> {
    tokio::time::timeout_at(wait.deadline, read)
        .await
        .unwrap_or(Err(StoreError::SessionRefreshing(wait.retry_ms)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capacity_is_bounded_per_session_and_process_and_released_on_drop() {
        let owner = Arc::new(Waiters::default());
        let mut waits = Vec::new();
        for session in 0..8 {
            for _ in 0..8 {
                waits.push(owner.enter(&session.to_string(), 1000).unwrap());
            }
            assert!(matches!(
                owner.enter(&session.to_string(), 1000),
                Err(StoreError::SessionRefreshing(1000))
            ));
        }
        assert!(matches!(
            owner.enter("independent", 1000),
            Err(StoreError::SessionRefreshing(1000))
        ));
        waits.pop();
        let other = owner.enter("independent", 1000).unwrap();
        drop(waits);
        drop(other);
        assert!(owner.0.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn exhausted_deadline_does_not_wait_or_accept_a_late_read() {
        let owner = Arc::new(Waiters::default());
        let mut wait = owner.enter("session", 1000).unwrap();
        wait.deadline = Instant::now() - Duration::from_millis(1);
        let mut waiting = Some(wait);
        assert!(matches!(
            retry(&owner, "session", &mut waiting, 250).await,
            Err(StoreError::SessionRefreshing(250))
        ));
        let result: Result<(), _> =
            read_before_deadline(waiting.as_ref().unwrap(), std::future::pending()).await;
        assert!(matches!(result, Err(StoreError::SessionRefreshing(250))));
        drop(waiting);
        assert!(owner.0.lock().unwrap().is_empty());
    }
}

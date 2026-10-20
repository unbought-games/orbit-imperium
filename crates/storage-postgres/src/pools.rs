//! Per-role connection reservations. Zero disables a workload instead of borrowing
//! another workload's reserved connections. Pools connect lazily during preparation.
use crate::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PoolLimits {
    pub admission: u32,
    pub reads: u32,
    pub worker: u32,
    pub control: u32,
    pub refresh: u32,
}
impl PoolLimits {
    pub fn validate(self) -> Result<(), StoreError> {
        if !(2..=32).contains(&self.control)
            || [self.admission, self.reads, self.worker, self.refresh]
                .iter()
                .any(|n| *n > 128)
            || self.admission + self.reads + self.worker + self.control + self.refresh > 256
        {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
}
#[derive(Clone)]
pub(crate) struct WorkloadPools {
    pub admission: Option<PgPool>,
    pub reads: Option<PgPool>,
    pub worker: Option<PgPool>,
    pub refresh: Option<PgPool>,
}
impl WorkloadPools {
    pub(crate) fn shared(pool: &PgPool, refresh: PgPool) -> Self {
        Self {
            admission: Some(pool.clone()),
            reads: Some(pool.clone()),
            worker: Some(pool.clone()),
            refresh: Some(refresh),
        }
    }
}
impl PgStore {
    pub async fn connect_with_limits(url: &str, limits: PoolLimits) -> Result<Self, StoreError> {
        limits.validate()?;
        let options: sqlx::postgres::PgConnectOptions = url.parse().map_err(db_error)?;
        // Named sessions let pg_stat_activity attribute database time to a workload.
        let pool = |size, name: &str| {
            PgPoolOptions::new()
                .max_connections(size)
                .acquire_timeout(std::time::Duration::from_secs(3))
                .connect_lazy_with(options.clone().application_name(&format!("orbit-{name}")))
        };
        let optional = |size, name| (size > 0).then(|| pool(size, name));
        Ok(Self {
            pool: pool(limits.control, "control"),
            workloads: WorkloadPools {
                admission: optional(limits.admission, "admission"),
                reads: optional(limits.reads, "reads"),
                worker: optional(limits.worker, "worker"),
                refresh: optional(limits.refresh, "refresh"),
            },
            admission_limit: 60,
            legacy_universe_config: false,
            update_hub: Default::default(),
            scan_cursors: Default::default(),
            observer: std::sync::Arc::new(orbit_application::NoopRuntimeObserver),
        })
    }
    pub(crate) fn admission_pool(&self) -> Result<&PgPool, StoreError> {
        self.workloads
            .admission
            .as_ref()
            .ok_or(StoreError::Unavailable)
    }
    pub(crate) fn read_pool(&self) -> Result<&PgPool, StoreError> {
        self.workloads.reads.as_ref().ok_or(StoreError::Unavailable)
    }
    pub(crate) fn refresh_pool(&self) -> Result<&PgPool, StoreError> {
        self.workloads
            .refresh
            .as_ref()
            .ok_or(StoreError::Unavailable)
    }
    pub(crate) fn worker_pool(&self) -> Result<&PgPool, StoreError> {
        self.workloads
            .worker
            .as_ref()
            .ok_or(StoreError::Unavailable)
    }
}

pub struct PoolSnapshot {
    pub name: &'static str,
    pub size: u32,
    pub idle: usize,
    pub maximum: u32,
}
impl PgStore {
    pub fn with_observer(
        mut self,
        observer: std::sync::Arc<dyn orbit_application::RuntimeObserver>,
    ) -> Self {
        self.observer = observer;
        self
    }
    pub fn observe_event(&self, event: orbit_application::RuntimeEvent) {
        self.observer.event(event);
    }
    pub(crate) fn timer(
        &self,
        stage: orbit_application::RuntimeStage,
    ) -> orbit_application::RuntimeTimer {
        orbit_application::RuntimeTimer::new(self.observer.clone(), stage)
    }
    pub(crate) async fn acquire_pool(
        &self,
        pool: &PgPool,
    ) -> Result<sqlx::pool::PoolConnection<sqlx::Postgres>, StoreError> {
        let _waiting = self.timer(orbit_application::RuntimeStage::PoolWait);
        pool.acquire().await.map_err(db_error)
    }
    pub(crate) async fn begin_tx(
        &self,
        pool: &PgPool,
    ) -> Result<crate::ordering::Tx<'static>, StoreError> {
        let connection = self.acquire_pool(pool).await?;
        // Keep SQLx's owned pooled connection in the native transaction. Timing
        // checkout separately excludes the BEGIN round-trip from pool waiting.
        sqlx::Transaction::begin(connection, None)
            .await
            .map_err(db_error)
    }
    pub fn pool_snapshots(&self) -> Vec<PoolSnapshot> {
        [
            ("control", Some(&self.pool)),
            ("admission", self.workloads.admission.as_ref()),
            ("reads", self.workloads.reads.as_ref()),
            ("worker", self.workloads.worker.as_ref()),
            ("refresh", self.workloads.refresh.as_ref()),
        ]
        .into_iter()
        .filter_map(|(name, pool)| {
            pool.map(|pool| PoolSnapshot {
                name,
                size: pool.size(),
                idle: pool.num_idle(),
                maximum: pool.options().get_max_connections(),
            })
        })
        .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn lazy_pools_reserve_capacity_without_opening_inactive_workloads() {
        let store = PgStore::connect_with_limits(
            "postgres://localhost/unused",
            PoolLimits {
                admission: 2,
                reads: 3,
                worker: 0,
                control: 2,
                refresh: 1,
            },
        )
        .await
        .unwrap();
        assert_eq!(store.pool.size(), 0);
        assert_eq!(store.read_pool().unwrap().size(), 0);
        assert_eq!(
            store
                .admission_pool()
                .unwrap()
                .options()
                .get_max_connections(),
            2
        );
        assert!(store.worker_pool().is_err());
        assert!(
            PoolLimits {
                admission: 1,
                reads: 1,
                worker: 1,
                control: 1,
                refresh: 0,
            }
            .validate()
            .is_err()
        );
    }
}

//! Durable publication claims coordinate replicas; this loop never runs on GET.
use orbit_application::{PublicFeed, StoreError, publication_retry_ms};
use orbit_storage_postgres::{PgStore, PublicationClaim};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::watch;

pub async fn run(
    store: PgStore,
    metrics: Arc<crate::metrics::RuntimeMetrics>,
    mut drain: watch::Receiver<bool>,
) {
    let mut tick = tokio::time::interval(Duration::from_secs(1));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        if *drain.borrow() {
            return;
        }
        tokio::select! {
            _ = drain.changed() => return,
            _ = tick.tick() => {},
        }
        tokio::select! {
            _ = drain.changed() => return,
            _ = scan(&store, &metrics) => {},
        }
    }
}
async fn scan(store: &PgStore, metrics: &crate::metrics::RuntimeMetrics) {
    let universes = match store.universes().await {
        Ok(universes) => universes,
        Err(error) => {
            metrics.publication_scan_failed();
            eprintln!("level=error event=public_feed_scan_failed error={error:?}");
            return;
        }
    };
    for universe in universes {
        // Each feed gets its own task outcome: a failed player feed cannot suppress planets.
        for feed in PublicFeed::ALL {
            match store.claim_publication(universe, feed).await {
                Ok(Some(claim)) => publish(store, metrics, claim).await,
                Ok(None) => {}
                Err(error) => {
                    metrics.publication_event(universe, feed, "claim_failed", Duration::ZERO);
                    eprintln!(
                        "level=error event=public_feed_claim_failed universe={universe} feed={} error={error:?}",
                        feed.name()
                    );
                }
            }
        }
    }
}
async fn publish(
    store: &PgStore,
    metrics: &crate::metrics::RuntimeMetrics,
    claim: PublicationClaim,
) {
    let started = Instant::now();
    metrics.publication_event(claim.universe, claim.feed, "attempt", Duration::ZERO);
    eprintln!(
        "level=info event=public_feed_attempt universe={} epoch={} feed={} boundary={} attempt={}",
        claim.universe,
        claim.epoch,
        claim.feed.name(),
        claim.boundary,
        claim.attempt
    );
    // Operational I/O guard, shorter than the durable lease; not a test deadline.
    let result = tokio::time::timeout(Duration::from_secs(60), async {
        let observation = store.sample_publication(&claim).await?;
        store.commit_publication(&claim, &observation).await?;
        Ok::<_, StoreError>(observation.sampled_at)
    })
    .await
    .unwrap_or(Err(StoreError::Unavailable));
    match result {
        Ok(sampled_at) => {
            metrics.publication_event(claim.universe, claim.feed, "success", started.elapsed());
            eprintln!(
                "level=info event=public_feed_published universe={} epoch={} feed={} boundary={} attempt={} sampled_at={} duration_ms={}",
                claim.universe,
                claim.epoch,
                claim.feed.name(),
                claim.boundary,
                claim.attempt,
                sampled_at,
                started.elapsed().as_millis()
            );
        }
        Err(error) => {
            let retry = publication_retry_ms(claim.attempt, &error);
            let outcome = if retry.is_some() {
                "retry"
            } else {
                "exhausted"
            };
            metrics.publication_event(claim.universe, claim.feed, outcome, started.elapsed());
            eprintln!(
                "level={} event=public_feed_{outcome} universe={} epoch={} feed={} boundary={} attempt={} retry_delay_ms={retry:?} duration_ms={} error={error:?}",
                if retry.is_some() { "warn" } else { "error" },
                claim.universe,
                claim.epoch,
                claim.feed.name(),
                claim.boundary,
                claim.attempt,
                started.elapsed().as_millis()
            );
            if let Err(error) = store.fail_publication(&claim, &error).await {
                metrics.publication_event(
                    claim.universe,
                    claim.feed,
                    "record_failed",
                    Duration::ZERO,
                );
                eprintln!(
                    "level=error event=public_feed_failure_record_failed universe={} feed={} error={error:?}",
                    claim.universe,
                    claim.feed.name()
                );
            }
        }
    }
}

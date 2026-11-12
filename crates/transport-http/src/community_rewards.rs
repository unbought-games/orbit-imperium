//! Bounded thin account observations; no private owner history in profile reads.
use orbit_application::{AccountCosmeticObservation, CommunityObservations};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Mutex,
    time::Duration,
};
#[derive(Clone)]
struct CachedObservation {
    value: Option<AccountCosmeticObservation>,
    expires_at: i64,
}
#[derive(Default)]
struct ObservationCache {
    generation: u64,
    entries: BTreeMap<String, CachedObservation>,
    retry_at: i64,
}
pub struct AccountRewardsClient {
    endpoint: String,
    credential: String,
    http: reqwest::Client,
    observations: Mutex<ObservationCache>,
    refresh: tokio::sync::Mutex<()>,
}
impl AccountRewardsClient {
    pub fn new(endpoint: &str, credential: &str) -> Result<Self, reqwest::Error> {
        Ok(Self {
            endpoint: endpoint.trim_end_matches('/').into(),
            credential: credential.into(),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            observations: Default::default(),
            refresh: Default::default(),
        })
    }
    pub fn invalidate(&self, subject: &str) {
        let mut cache = self.observations.lock().unwrap();
        cache.generation = cache.generation.wrapping_add(1);
        cache.entries.remove(subject);
        cache.retry_at = 0;
    }
    fn current(
        &self,
        subjects: &[String],
        now: i64,
    ) -> BTreeMap<String, AccountCosmeticObservation> {
        let cache = self.observations.lock().unwrap();
        subjects
            .iter()
            .filter_map(|subject| {
                cache
                    .entries
                    .get(subject)
                    .filter(|e| e.expires_at > now)
                    .and_then(|e| e.value.clone())
                    .map(|value| (subject.clone(), value))
            })
            .collect()
    }
    fn store_batch(
        &self,
        subjects: &[String],
        mut values: BTreeMap<String, AccountCosmeticObservation>,
        generation: u64,
        now: i64,
    ) {
        let mut cache = self.observations.lock().unwrap();
        if cache.generation != generation {
            return;
        }
        cache.entries.retain(|_, entry| entry.expires_at > now);
        for subject in subjects {
            let value = values.remove(subject);
            let expires_at = value.as_ref().map_or(now + 30, |v| v.expires_at);
            cache
                .entries
                .insert(subject.clone(), CachedObservation { value, expires_at });
        }
        while cache.entries.len() > 4096 {
            cache.entries.pop_first();
        }
    }
    async fn fetch(&self, subjects: &[String]) -> Option<CommunityObservations> {
        let mut response = self
            .http
            .post(format!(
                "{}/api/community/v1/service/observations",
                self.endpoint
            ))
            .bearer_auth(&self.credential)
            .json(&serde_json::json!({"contract_version":1,"subjects":subjects}))
            .send()
            .await
            .ok()?;
        if !response.status().is_success() {
            return None;
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.ok()? {
            if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                return None;
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).ok()
    }
    pub async fn resolve(&self, subject: &str) -> Option<AccountCosmeticObservation> {
        self.resolve_many(&[subject.to_owned()])
            .await
            .remove(subject)
    }
    pub async fn resolve_many(
        &self,
        subjects: &[String],
    ) -> BTreeMap<String, AccountCosmeticObservation> {
        self.resolve_with_clock(subjects, unbought_auth::now).await
    }
    async fn resolve_with_clock(
        &self,
        subjects: &[String],
        now: impl Fn() -> i64,
    ) -> BTreeMap<String, AccountCosmeticObservation> {
        let subjects: Vec<_> = subjects
            .iter()
            .filter(|s| !s.is_empty() && s.len() <= 255)
            .cloned()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let needed = |cache: &ObservationCache| {
            subjects
                .iter()
                .filter(|s| {
                    cache
                        .entries
                        .get(*s)
                        .is_none_or(|entry| entry.expires_at <= now())
                })
                .cloned()
                .collect::<Vec<_>>()
        };
        {
            let cache = self.observations.lock().unwrap();
            if needed(&cache).is_empty() || cache.retry_at > now() {
                drop(cache);
                return self.current(&subjects, now());
            }
        }
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        let Ok(_guard) = tokio::time::timeout_at(deadline, self.refresh.lock()).await else {
            return self.current(&subjects, now());
        };
        let missing = needed(&self.observations.lock().unwrap());
        for chunk in missing.chunks(100) {
            let generation = self.observations.lock().unwrap().generation;
            let response = tokio::time::timeout_at(deadline, self.fetch(chunk))
                .await
                .ok()
                .flatten()
                .and_then(|r| r.validate(chunk, now()));
            if let Some(values) = response {
                self.store_batch(chunk, values, generation, now());
            } else {
                let mut cache = self.observations.lock().unwrap();
                if cache.generation == generation {
                    cache.retry_at = now() + 30;
                }
                break;
            }
        }
        self.current(&subjects, now())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_pre_claim_response_cannot_restore_the_invalidated_observation() {
        let client = AccountRewardsClient::new("https://example.test", "fixture-only").unwrap();
        let generation = client.observations.lock().unwrap().generation;
        let observation = AccountCosmeticObservation {
            expires_at: 100,
            membership: false,
            items: vec![],
        };
        client.invalidate("owner");
        client.store_batch(
            &["owner".into()],
            BTreeMap::from([("owner".into(), observation.clone())]),
            generation,
            50,
        );
        assert!(client.current(&["owner".into()], 50).is_empty());
        let current = client.observations.lock().unwrap().generation;
        client.store_batch(
            &["owner".into()],
            BTreeMap::from([("owner".into(), observation)]),
            current,
            50,
        );
        assert!(client.current(&["owner".into()], 50).contains_key("owner"));
    }
    #[tokio::test]
    async fn visible_subjects_are_batched_and_unknown_links_are_not_repeated_full_owner_reads() {
        use axum::{Json, Router, extract::State, routing::post};
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        let calls = Arc::new(AtomicUsize::new(0));
        let router=Router::new().route("/api/community/v1/service/observations",post(|State(calls):State<Arc<AtomicUsize>>,Json(body):Json<serde_json::Value>|async move {
            calls.fetch_add(1,Ordering::SeqCst);assert_eq!(body["subjects"],serde_json::json!(["missing","one","two"]));
            Json(serde_json::json!({"contract_version":1,"observed_at":"2026-01-01T00:00:00Z","observations":[{"subject":"one","expires_at":"2026-01-01T00:01:00Z","membership":{"active":true},"entitlements":[{"kind":"dye","item_id":"sample-blue"}]},{"subject":"two","expires_at":"2026-01-01T00:01:00Z","membership":{"active":false},"entitlements":[]}]}))
        })).with_state(calls.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let client =
            AccountRewardsClient::new(&format!("http://{address}"), "fixture-only").unwrap();
        let subjects = vec!["two".into(), "one".into(), "one".into(), "missing".into()];
        let result = client.resolve_with_clock(&subjects, || 1767225600).await;
        assert_eq!(result.len(), 2);
        assert!(result["one"].membership);
        assert!(!result["two"].membership);
        assert_eq!(
            client
                .resolve_with_clock(&subjects, || 1767225601)
                .await
                .len(),
            2
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        server.abort();
        let _ = server.await;
    }
}

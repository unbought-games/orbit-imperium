//! Bounded account-owned cosmetic observations. Only the narrow derived view is cached.
use orbit_application::AccountCosmeticObservation;
use serde_json::Value;
use std::{collections::BTreeMap, sync::Mutex, time::Duration};

pub struct AccountRewardsClient {
    endpoint: String,
    credential: String,
    http: reqwest::Client,
    observations: Mutex<(u64, BTreeMap<String, AccountCosmeticObservation>)>,
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
        cache.0 = cache.0.wrapping_add(1);
        cache.1.remove(subject);
    }
    fn observe(
        &self,
        subject: &str,
        owner: &Value,
        generation: u64,
    ) -> Option<AccountCosmeticObservation> {
        let observation =
            orbit_application::account_cosmetic_observation(owner, unbought_auth::now())?;
        self.store_observation(subject, observation, generation)
    }
    fn store_observation(
        &self,
        subject: &str,
        observation: AccountCosmeticObservation,
        generation: u64,
    ) -> Option<AccountCosmeticObservation> {
        let mut cache = self.observations.lock().unwrap();
        if cache.0 != generation {
            return None;
        }
        cache.1.insert(subject.into(), observation.clone());
        while cache.1.len() > 4096 {
            cache.1.pop_first();
        }
        Some(observation)
    }
    fn cached(&self, subject: &str) -> Option<AccountCosmeticObservation> {
        self.observations
            .lock()
            .unwrap()
            .1
            .get(subject)
            .filter(|o| o.expires_at > unbought_auth::now())
            .cloned()
    }
    pub async fn resolve(&self, subject: &str) -> Option<AccountCosmeticObservation> {
        if let Some(found) = self.cached(subject) {
            return Some(found);
        }
        let _guard = tokio::time::timeout(Duration::from_secs(5), self.refresh.lock())
            .await
            .ok()?;
        if let Some(found) = self.cached(subject) {
            return Some(found);
        }
        let generation = self.observations.lock().unwrap().0;
        let mut response = self
            .http
            .post(format!("{}/api/community/v1/service/owner", self.endpoint))
            .bearer_auth(&self.credential)
            .json(&serde_json::json!({"contract_version":1,"subject":subject}))
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
        let owner: Value = serde_json::from_slice(&bytes).ok()?;
        self.observe(subject, &owner, generation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_pre_claim_response_cannot_restore_the_invalidated_observation() {
        let client = AccountRewardsClient::new("https://example.test", "fixture-only").unwrap();
        let generation = client.observations.lock().unwrap().0;
        let observation = AccountCosmeticObservation {
            expires_at: unbought_auth::now() + 60,
            membership: false,
            items: vec![],
        };
        client.invalidate("owner");
        assert!(
            client
                .store_observation("owner", observation.clone(), generation)
                .is_none()
        );
        assert!(client.cached("owner").is_none());
        let current = client.observations.lock().unwrap().0;
        assert!(
            client
                .store_observation("owner", observation, current)
                .is_some()
        );
    }
}

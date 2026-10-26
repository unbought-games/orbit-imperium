use super::*;
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    future::Future,
    sync::Mutex as StdMutex,
};
use unbought_auth::{ProfileError, ProfileSnapshot, PublicProfile, PublicProfileClient};

#[derive(Clone, Serialize)]
pub struct PlayerDisplay {
    pub(super) kind: PlayerKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    alliance: Option<AllianceIdentity>,
    player: PlayerId,
    pub(super) username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) supporter_tier: Option<u8>,
    observed_at: i64,
    expires_at: i64,
}
#[derive(Serialize)]
struct PlayerProfiles {
    binding: Binding,
    request_id: uuid::Uuid,
    players: Vec<PlayerDisplay>,
}

// Cached Accounts observations, never persisted game state. A missing profile
// is a successful negative observation and is retried after one minute.
#[derive(Clone)]
struct Cached {
    profile: Option<PublicProfile>,
    observed_at: i64,
}
impl Cached {
    fn expires_at(&self) -> i64 {
        self.profile
            .as_ref()
            .map_or(self.observed_at.saturating_add(60), |p| p.expires_at)
    }
}
#[derive(Default)]
struct CacheState {
    entries: BTreeMap<String, Cached>,
    retry_at: i64,
    generation: u64,
}
#[derive(Default)]
struct ProfileCache {
    state: StdMutex<CacheState>,
    refresh: Mutex<()>,
}
impl ProfileCache {
    fn invalidate(&self, subject: &str) {
        let mut state = self.state.lock().unwrap();
        state.entries.remove(subject);
        // Fence a response already in flight when a new sign-in completes.
        state.generation = state.generation.wrapping_add(1);
    }
    fn current(&self, subjects: &[String], now: i64) -> BTreeMap<String, Cached> {
        let state = self.state.lock().unwrap();
        subjects
            .iter()
            .filter_map(|subject| {
                state
                    .entries
                    .get(subject)
                    .filter(|entry| entry.expires_at() > now)
                    .map(|entry| (subject.clone(), entry.clone()))
            })
            .collect()
    }
    async fn resolve<F, Fut>(
        &self,
        subjects: &[String],
        now: impl Fn() -> i64,
        fetch: F,
    ) -> BTreeMap<String, Cached>
    where
        F: Fn(Vec<String>) -> Fut,
        Fut: Future<Output = Result<ProfileSnapshot, ProfileError>>,
    {
        let current = self.current(subjects, now());
        if subjects.iter().all(|s| current.contains_key(s)) {
            return current;
        }
        // These requests are separate from gameplay. Briefly share the active
        // refresh so simultaneous self/Galaxy reads both receive fresh profiles.
        let Ok(_permit) =
            tokio::time::timeout(std::time::Duration::from_secs(5), self.refresh.lock()).await
        else {
            return self.current(subjects, now());
        };
        let (missing, retry_at) = {
            let mut state = self.state.lock().unwrap();
            state.entries.retain(|_, entry| entry.expires_at() > now());
            let missing = subjects
                .iter()
                .filter(|s| !state.entries.contains_key(*s))
                .cloned()
                .collect::<Vec<_>>();
            (missing, state.retry_at)
        };
        if retry_at > now() {
            return self.current(subjects, now());
        }
        for chunk in missing.chunks(100) {
            let generation = self.state.lock().unwrap().generation;
            match fetch(chunk.to_vec()).await {
                Ok(snapshot) => {
                    let mut profiles: BTreeMap<_, _> = snapshot
                        .profiles
                        .into_iter()
                        .map(|p| (p.subject.clone(), p))
                        .collect();
                    let mut state = self.state.lock().unwrap();
                    if state.generation != generation {
                        continue;
                    }
                    for subject in chunk {
                        let entry = Cached {
                            profile: profiles.remove(subject),
                            observed_at: snapshot.observed_at,
                        };
                        if entry.expires_at() > now() {
                            state.entries.insert(subject.clone(), entry);
                        }
                    }
                    // Each router owns exactly one issuer/client/credential scope.
                    while state.entries.len() > 4096 {
                        state.entries.pop_first();
                    }
                }
                Err(error) => {
                    let delay = match error {
                        ProfileError::RateLimited { retry_after } => {
                            retry_after.as_secs().max(1).min(i64::MAX as u64) as i64
                        }
                        _ => 30,
                    };
                    self.state.lock().unwrap().retry_at = now().saturating_add(delay);
                    break;
                }
            }
        }
        self.current(subjects, now())
    }
}

pub struct AccountProfiles {
    issuer: String,
    client: PublicProfileClient,
    cache: ProfileCache,
}
impl AccountProfiles {
    pub(super) fn signed_in(&self, identity: &unbought_auth::Identity) {
        if identity.issuer == self.issuer {
            self.cache.invalidate(&identity.subject);
        }
    }
    pub fn new(api_url: &str, issuer: &str, credential: &str) -> Result<Self, ProfileError> {
        Ok(Self {
            issuer: issuer.into(),
            client: PublicProfileClient::new(api_url, issuer, credential)?,
            cache: ProfileCache::default(),
        })
    }
    pub(super) async fn display(&self, identities: Vec<PlayerIdentity>) -> Vec<PlayerDisplay> {
        let subjects: Vec<_> = identities
            .iter()
            .filter(|i| i.issuer.as_deref() == Some(&self.issuer))
            .filter_map(|i| i.subject.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let cached = self
            .cache
            .resolve(&subjects, unbought_auth::now, |subjects| {
                let client = self.client.clone();
                async move { client.batch(&subjects).await }
            })
            .await;
        let now = unbought_auth::now();
        identities
            .into_iter()
            .map(|identity| {
                let remote =
                    identity.issuer.as_deref() == Some(&self.issuer) && identity.subject.is_some();
                let source = if remote {
                    identity.subject.as_ref().and_then(|s| cached.get(s))
                } else {
                    None
                };
                let profile = source.and_then(|entry| entry.profile.as_ref());
                PlayerDisplay {
                    kind: identity.kind,
                    alliance: None,
                    player: identity.player,
                    username: profile.map_or(identity.username, |p| p.username.clone()),
                    supporter_tier: profile.and_then(|p| p.supporter_tier),
                    observed_at: source
                        .map_or(if remote { 0 } else { now }, |entry| entry.observed_at),
                    expires_at: source.map_or(now + 30, Cached::expires_at),
                }
            })
            .collect()
    }
}

pub(super) async fn query<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    ApiJson(q): ApiJson<PlayerProfilesQuery>,
) -> Result<Response, Problem> {
    let session = authenticate(&s, &h, true).await?;
    let universe = UniverseId(id);
    bound_api::path_binding(universe, q.context.binding)?;
    let principal = bound_api::principal(&session, universe)?;
    let binding = q.context.binding;
    let request_id = q.context.request_id;
    let players = s.game.visible_profile_players(principal, q).await?;
    let mut alliances = s
        .game
        .player_alliances(principal, binding, players.clone())
        .await?;
    // Release database resources before making any Accounts HTTP request.
    let mut identities = s
        .updates
        .player_identities(universe, players.clone())
        .await
        .map_err(ServiceError::from)?;
    let mapped: BTreeSet<_> = identities.iter().map(|i| i.player).collect();
    identities.extend(
        players
            .into_iter()
            .filter(|p| !mapped.contains(p))
            .map(|player| PlayerIdentity {
                kind: PlayerKind::Human,
                player,
                username: format!("Player {}", &player.0.to_string()[..8]),
                issuer: None,
                subject: None,
            }),
    );
    let mut players = if let Some(profiles) = &s.profiles {
        profiles.display(identities).await
    } else {
        let now = unbought_auth::now();
        identities
            .into_iter()
            .map(|i| PlayerDisplay {
                kind: i.kind,
                alliance: None,
                player: i.player,
                username: i.username,
                supporter_tier: None,
                observed_at: now,
                expires_at: now + 60,
            })
            .collect()
    };
    for player in &mut players {
        player.alliance = alliances.remove(&player.player);
    }
    Ok(bound_api::no_store_json(PlayerProfiles {
        binding,
        request_id,
        players,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
    fn snapshot(subject: &str, tier: Option<u8>, at: i64) -> ProfileSnapshot {
        ProfileSnapshot {
            issuer: "issuer".into(),
            observed_at: at,
            profiles: vec![PublicProfile {
                subject: subject.into(),
                username: "player".into(),
                supporter_tier: tier,
                expires_at: at + 60,
            }],
        }
    }
    #[tokio::test]
    async fn reauthentication_invalidates_old_profiles_and_fences_in_flight_responses() {
        let cache = ProfileCache::default();
        let subjects = vec!["a".into()];
        cache
            .resolve(
                &subjects,
                || 100,
                |_| async { Ok(snapshot("a", None, 100)) },
            )
            .await;
        cache.invalidate("a");
        let updated = cache
            .resolve(
                &subjects,
                || 101,
                |_| async { Ok(snapshot("a", Some(3), 101)) },
            )
            .await;
        assert_eq!(
            updated["a"].profile.as_ref().unwrap().supporter_tier,
            Some(3)
        );
        cache.invalidate("a");
        let stale = cache
            .resolve(
                &subjects,
                || 102,
                |_| async {
                    cache.invalidate("a");
                    Ok(snapshot("a", Some(1), 100))
                },
            )
            .await;
        assert!(stale.is_empty());
    }
    #[tokio::test]
    async fn caches_batches_expires_and_clears_removed_tiers_and_omissions() {
        let cache = ProfileCache::default();
        let clock = AtomicI64::new(100);
        let calls = AtomicUsize::new(0);
        let subjects = vec!["a".into()];
        let now = || clock.load(Ordering::SeqCst);
        let first = cache
            .resolve(&subjects, now, |_| {
                calls.fetch_add(1, Ordering::SeqCst);
                async { Ok(snapshot("a", Some(3), 100)) }
            })
            .await;
        assert_eq!(first["a"].profile.as_ref().unwrap().supporter_tier, Some(3));
        cache
            .resolve(&subjects, now, |_| async {
                panic!("fresh cache must avoid network")
            })
            .await;
        clock.store(160, Ordering::SeqCst);
        let removed = cache
            .resolve(&subjects, now, |_| async { Ok(snapshot("a", None, 160)) })
            .await;
        assert_eq!(removed["a"].profile.as_ref().unwrap().supporter_tier, None);
        clock.store(220, Ordering::SeqCst);
        let omitted = cache
            .resolve(&subjects, now, |_| async {
                Ok(ProfileSnapshot {
                    issuer: "issuer".into(),
                    observed_at: 220,
                    profiles: vec![],
                })
            })
            .await;
        assert!(omitted["a"].profile.is_none());
        cache
            .resolve(&subjects, now, |_| async { panic!("negative cache") })
            .await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
    #[tokio::test]
    async fn failures_expiry_and_rate_limit_never_extend_a_badge() {
        let cache = ProfileCache::default();
        let subjects = vec!["a".into()];
        cache
            .resolve(
                &subjects,
                || 100,
                |_| async { Ok(snapshot("a", Some(1), 100)) },
            )
            .await;
        let mixed = vec!["a".into(), "b".into()];
        let kept = cache
            .resolve(
                &mixed,
                || 120,
                |_| async {
                    Err(ProfileError::RateLimited {
                        retry_after: std::time::Duration::from_secs(100),
                    })
                },
            )
            .await;
        assert_eq!(kept.len(), 1);
        assert!(
            cache
                .resolve(&mixed, || 160, |_| async { panic!("respect Retry-After") })
                .await
                .is_empty()
        );
        assert!(
            cache
                .resolve(&mixed, || 220, |_| async { Err(ProfileError::Unavailable) })
                .await
                .is_empty()
        );
    }
    #[tokio::test(start_paused = true)]
    async fn concurrent_wait_is_bounded_and_batches_are_bounded() {
        let cache = ProfileCache::default();
        let permit = cache.refresh.lock().await;
        assert!(
            cache
                .resolve(&["a".into()], || 100, |_| async { panic!("single flight") })
                .await
                .is_empty()
        );
        drop(permit);
        let subjects: Vec<_> = (0..205).map(|i| format!("s{i}")).collect();
        let calls = AtomicUsize::new(0);
        cache
            .resolve(
                &subjects,
                || 100,
                |batch| {
                    assert!(batch.len() <= 100);
                    calls.fetch_add(1, Ordering::SeqCst);
                    async {
                        Ok(ProfileSnapshot {
                            issuer: "issuer".into(),
                            observed_at: 100,
                            profiles: vec![],
                        })
                    }
                },
            )
            .await;
        assert_eq!(calls.load(Ordering::SeqCst), 3);
    }
}

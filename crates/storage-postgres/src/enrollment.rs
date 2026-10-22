//! Empty-world setup and atomic online enrollment, independent of simulation backlog.
use crate::{
    bootstrap::{Manifest, Member, insert_member, load_manifest},
    ordering, *,
};
use orbit_application::*;
use orbit_engine::*;
use rand::{RngCore, rngs::OsRng};
use uuid::Uuid;

impl PgStore {
    /// Requires a prepared schema. With no explicit ID, reuse the only world or create one.
    /// The serving caller retains its operator guard across provisioning and HTTP lifetime.
    pub async fn ensure_signup_universe(
        &self,
        requested: Option<UniverseId>,
        topology: UniverseOptions,
        max_players: Option<u32>,
    ) -> Result<SignupPolicy, StoreError> {
        topology.validate().map_err(|_| StoreError::Conflict)?;
        if requested.is_some_and(|id| id.0.is_nil()) {
            return Err(StoreError::Conflict);
        }
        // The caller owns schema preparation. Existing worlds use only metadata reads.
        let mut tx = self.begin_tx(&self.pool).await?;
        for setting in [
            "SET LOCAL lock_timeout='250ms'",
            "SET LOCAL statement_timeout='1500ms'",
        ] {
            sqlx::query(setting)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        let (universe, existing) = select_universe(&mut tx, requested).await?;
        if existing {
            let policy = existing_policy(&mut tx, universe, topology, max_players).await?;
            tx.commit().await.map_err(db_error)?;
            return Ok(policy);
        }
        // Only creation serializes. Recheck after acquiring the lock: another starter
        // may have created the default world while we were waiting.
        // Allow a peer creator to finish without extending ordinary metadata/DDL
        // waits. The serving caller still enforces its five-second total deadline.
        for setting in [
            "SET LOCAL lock_timeout='3s'",
            "SET LOCAL statement_timeout='3s'",
        ] {
            sqlx::query(setting)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        sqlx::query("SELECT pg_advisory_xact_lock(901323)")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        for setting in [
            "SET LOCAL lock_timeout='250ms'",
            "SET LOCAL statement_timeout='1500ms'",
        ] {
            sqlx::query(setting)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        let (universe, existing) = select_universe(&mut tx, requested).await?;
        if existing {
            let policy = existing_policy(&mut tx, universe, topology, max_players).await?;
            tx.commit().await.map_err(db_error)?;
            return Ok(policy);
        }
        let profile = topology.resolve(None).map_err(|_| StoreError::Conflict)?;
        let policy = admission_policy(universe, &profile, max_players)?;
        let rules = Ruleset::signup(profile).map_err(|_| StoreError::CorruptData)?;
        provision(&mut tx, universe, &rules).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(policy)
    }

    pub(crate) async fn enroll(
        &self,
        request: Registration,
    ) -> Result<AuthenticatedSession, StoreError> {
        self.enroll_account(request, None).await
    }

    pub(crate) async fn enroll_account(
        &self,
        request: Registration,
        existing: Option<AccountId>,
    ) -> Result<AuthenticatedSession, StoreError> {
        let Registration {
            name,
            password_hash,
            policy,
            digest,
            csrf,
            previous,
        } = request;
        let u = policy.universe;
        loop {
            let (mut tx, scoped) = self.begin_enrollment(u).await?;
            let floor: i64 = sqlx::query_scalar(
                "SELECT greatest(frontier,ordering_floor) FROM universe_runtime WHERE universe=$1",
            )
            .bind(u.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
            let mut at = ordering::now(&mut tx).await?.max(floor);
            let rules = crate::facts::rules(&mut tx, u).await?;
            let profile = signup_profile(&rules)?;
            if let Some(account) = existing
            && sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM universe_memberships WHERE universe=$1 AND account=$2)").bind(u.0).bind(account.0).fetch_one(&mut *tx).await.map_err(db_error)? {
                tx.commit().await.map_err(db_error)?;
                return self.create_session(account, &digest, &csrf, previous).await;
        }
            if existing.is_none()
            && sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM accounts WHERE name=$1 AND password_hash <> '!oidc')",
            )
            .bind(&name)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?
        {
            return Err(StoreError::Conflict);
        }
            let (secret, mut manifest) = load_manifest(&mut tx, u).await?;
            let homeworld = if profile.id == "mvp-v1"
                && rules
                    .artifact
                    .world
                    .as_ref()
                    .and_then(|w| w.colonization.as_ref())
                    .is_none()
            {
                homeworlds(&secret, u, manifest.epoch, manifest.members.len() + 1)
                    .map_err(|_| StoreError::UniverseFull)?
                    .pop()
                    .ok_or(StoreError::CorruptData)?
            } else {
                let homes: Vec<_> = manifest
                    .members
                    .iter()
                    .map(|m| m.homeworld.coordinates)
                    .collect();
                let slots: Vec<(i32, i32, i32)> = sqlx::query_as(
                "SELECT galaxy,system,position FROM bodies WHERE universe=$1 AND kind='Planet' ORDER BY galaxy,system,position"
            ).bind(u.0).fetch_all(&mut *tx).await.map_err(db_error)?;
                let occupied: Vec<_> = slots
                    .into_iter()
                    .map(|(galaxy, system, position)| Coordinates {
                        galaxy: galaxy as u32,
                        system: system as u32,
                        position: position as u32,
                    })
                    .collect();
                if profile.id == "mvp-v1" {
                    frontier_homeworld(
                        &secret,
                        u,
                        manifest.epoch,
                        profile,
                        manifest.members.len(),
                        &occupied,
                    )
                } else {
                    balanced_homeworld(
                        &secret,
                        u,
                        manifest.epoch,
                        profile,
                        manifest.members.len(),
                        &homes,
                        &occupied,
                    )
                }
                .map_err(|_| StoreError::UniverseFull)?
            };
            let member = Member {
                name: name.clone(),
                account: existing.map(|a| a.0).unwrap_or_else(Uuid::new_v4),
                player: Uuid::new_v4(),
                body: Uuid::new_v4(),
                homeworld,
            };
            let _scope_hold = if scoped {
                let scopes = std::collections::BTreeSet::from([
                    ScopeKey::Player(PlayerId(member.player)),
                    ScopeKey::Location(member.homeworld.coordinates),
                ]);
                let (stamped, held) =
                    crate::admission::stamp(&mut tx, u, &scopes, self.observer.clone()).await?;
                at = stamped.max(at);
                Some(held)
            } else {
                None
            };
            if rules
                .artifact
                .world
                .as_ref()
                .and_then(|w| w.colonization.as_ref())
                .is_some()
                && crate::colonization::enrollment_predecessor(
                    &mut tx,
                    u,
                    member.homeworld.coordinates,
                    at,
                    scoped,
                )
                .await?
            {
                // Release both admission and location locks while ordered gameplay
                // resolves. Recompute placement from current occupancy on retry.
                tx.rollback().await.map_err(db_error)?;
                tokio::time::sleep(std::time::Duration::from_millis(25)).await;
                continue;
            }
            // A claim may have committed after placement was sampled but before its
            // location ordering lock was acquired. Never insert into that stale slot.
            let occupied: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM bodies WHERE universe=$1 AND kind='Planet' AND galaxy=$2 AND system=$3 AND position=$4)")
            .bind(u.0).bind(member.homeworld.coordinates.galaxy as i32).bind(member.homeworld.coordinates.system as i32).bind(member.homeworld.coordinates.position as i32)
            .fetch_one(&mut *tx).await.map_err(db_error)?;
            if occupied {
                tx.rollback().await.map_err(db_error)?;
                continue;
            }
            let current = self.read_policy(&mut tx, u, true).await?;
            let max_players = if let Some(current) = current {
                if !current.policy.signup_enabled {
                    return Err(StoreError::SignupClosed);
                }
                current.policy.effective_max_players(&current.immutable)
            } else {
                admission_policy(u, profile, Some(policy.max_players))?.max_players
            };
            if manifest.members.len() >= max_players as usize {
                return Err(StoreError::UniverseFull);
            }
            insert_member(&mut tx, u, &member, &password_hash, at, &rules).await?;
            let account = AccountId(member.account);
            let player = PlayerId(member.player);
            manifest.members.push(member);
            sqlx::query("UPDATE mvp_bootstraps SET manifest=$2 WHERE universe=$1")
                .bind(u.0)
                .bind(sqlx::types::Json(manifest))
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            if !scoped {
                sqlx::query("UPDATE world_heads SET revision=revision+1 WHERE universe=$1")
                    .bind(u.0)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
                sqlx::query("UPDATE universe_runtime SET frontier=$2 WHERE universe=$1")
                    .bind(u.0)
                    .bind(at)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
            }
            if let Some(old) = previous {
                sqlx::query("WITH revoked AS (DELETE FROM sessions WHERE digest=$1 RETURNING account) SELECT pg_notify('orbit_game_updates','account:'||account::text) FROM revoked")
                .bind(old)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            }
            let expires_at: i64 = sqlx::query_scalar("INSERT INTO sessions(digest,account,csrf,expires_at) VALUES($1,$2,$3,floor(extract(epoch FROM clock_timestamp())*1000)::bigint+28800000) RETURNING expires_at")
            .bind(digest).bind(account.0).bind(&csrf).fetch_one(&mut *tx).await.map_err(db_error)?;
            let universe_name = sqlx::query_scalar("SELECT name FROM universes WHERE id=$1")
                .bind(u.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
            tx.commit().await.map_err(db_error)?;
            return Ok(AuthenticatedSession {
                account,
                csrf,
                expires_at,
                memberships: vec![Membership {
                    universe_name,
                    universe: u,
                    player,
                }],
            });
        }
    }
}

fn admission_policy(
    universe: UniverseId,
    profile: &UniverseProfile,
    requested: Option<u32>,
) -> Result<SignupPolicy, StoreError> {
    let capacity = profile
        .homeworld_capacity()
        .map_err(|_| StoreError::CorruptData)?;
    let max_players = requested.unwrap_or(capacity);
    if !(1..=capacity).contains(&max_players) {
        return Err(StoreError::Conflict);
    }
    Ok(SignupPolicy {
        universe,
        max_players,
    })
}

/// Admission uses the saved, validated catalog and topology rather than bundled defaults.
pub(crate) fn signup_profile(rules: &Ruleset) -> Result<&UniverseProfile, StoreError> {
    let profile = rules
        .artifact
        .universe
        .as_ref()
        .ok_or(StoreError::Conflict)?;
    rules.validate().map_err(|_| StoreError::CorruptData)?;
    if !rules.world() || !rules.attacks() {
        return Err(StoreError::Conflict);
    }
    Ok(profile)
}

async fn select_universe(
    tx: &mut ordering::Tx<'_>,
    requested: Option<UniverseId>,
) -> Result<(UniverseId, bool), StoreError> {
    if let Some(u) = requested {
        let exists = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM universes WHERE id=$1)")
            .bind(u.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
        return Ok((u, exists));
    }
    let ids: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM universes ORDER BY id LIMIT 2")
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?;
    match ids.as_slice() {
        [] => Ok((UniverseId(Uuid::new_v4()), false)),
        [id] => Ok((UniverseId(*id), true)),
        _ => Err(StoreError::Conflict),
    }
}
async fn existing_policy(
    tx: &mut ordering::Tx<'_>,
    universe: UniverseId,
    topology: UniverseOptions,
    max_players: Option<u32>,
) -> Result<SignupPolicy, StoreError> {
    let rules = crate::facts::rules(tx, universe).await?;
    let profile = signup_profile(&rules)?;
    topology
        .resolve(Some(profile))
        .map_err(|_| StoreError::Conflict)?;
    admission_policy(universe, profile, max_players)
}

impl PgStore {
    async fn begin_enrollment(
        &self,
        u: UniverseId,
    ) -> Result<(ordering::Tx<'_>, bool), StoreError> {
        loop {
            let mut tx = self.begin_tx(self.admission_pool()?).await?;
            let scoped = crate::admission::is_scoped(&mut tx, u).await?;
            if !scoped {
                ordering::gate(&mut tx, u).await?;
            }
            crate::runtime_barriers::enrollment_gate(&mut tx, u).await?;
            let actual: bool = sqlx::query_scalar(
                "SELECT executor_mode='scoped' FROM universe_runtime WHERE universe=$1 FOR SHARE",
            )
            .bind(u.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
            if actual != scoped {
                tx.rollback().await.map_err(db_error)?;
                continue;
            }
            let barrier: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM runtime_barriers WHERE universe=$1 AND NOT done)",
            )
            .bind(u.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
            if !barrier {
                return Ok((tx, scoped));
            }
            // Configuration may change initialization terms. Wait outside SQL so
            // gameplay admission and the worker applying the boundary stay runnable.
            tx.rollback().await.map_err(db_error)?;
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }
}

/// Common empty-world creation; the caller owns the atomic policy transaction.
pub(crate) async fn provision(
    tx: &mut ordering::Tx<'_>,
    universe: UniverseId,
    rules: &Ruleset,
) -> Result<(), StoreError> {
    let epoch = Epoch(Uuid::new_v4());
    let at = ordering::now(tx).await?;
    let mut secret = [0; 32];
    OsRng.fill_bytes(&mut secret);
    sqlx::query("INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(&rules.hash.0)
        .bind(&rules.artifact.id)
        .bind(sqlx::types::Json(&rules))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash) VALUES($1,$2,false,$3,$4,$5)")
            .bind(universe.0).bind(epoch.0).bind(rules.speed).bind(at).bind(&rules.hash.0).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("INSERT INTO universe_runtime(universe,frontier) VALUES($1,$2)")
        .bind(universe.0)
        .bind(at)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO world_heads(universe) VALUES($1)")
        .bind(universe.0)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    let manifest = Manifest {
        epoch,
        members: vec![],
        production_settings: [100; 6],
        cursor: Coordinates {
            galaxy: 1,
            system: 1,
            position: 4,
        },
    };
    sqlx::query("INSERT INTO mvp_bootstraps(universe,secret,manifest) VALUES($1,$2,$3)")
        .bind(universe.0)
        .bind(secret.as_slice())
        .bind(sqlx::types::Json(manifest))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}

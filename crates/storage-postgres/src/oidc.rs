use crate::*;
use orbit_application::*;
use unbought_auth::{Identity, LoginTransaction, Logout, RelyingParty, Tokens};

// Finish before the HTTP bootstrap's five-second deadline. A durable claim
// protects the provider commit boundary even if any caller cancels earlier.
const REVALIDATION_BUDGET: std::time::Duration = std::time::Duration::from_secs(4);
const PROVIDER_BUDGET: std::time::Duration = std::time::Duration::from_secs(2);
impl PgStore {
    pub(crate) async fn oidc_metadata(
        &self,
        digest: &str,
    ) -> Result<Option<OidcSessionMetadata>, StoreError> {
        let row: Option<(i64, String)> = sqlx::query_as("SELECT (o.payload->'identity'->>'expires_at')::bigint, o.payload->>'refresh_generation' FROM oidc_session o JOIN sessions s USING(digest) WHERE o.digest=$1 AND s.expires_at>floor(extract(epoch FROM clock_timestamp())*1000)::bigint AND NOT o.payload ? 'rotation_claim_id' AND o.payload->>'refresh_generation' IS NOT NULL")
            .bind(digest).fetch_optional(self.read_pool()?).await.map_err(db_error)?;
        Ok(row.map(
            |(identity_valid_until, refresh_generation)| OidcSessionMetadata {
                identity_valid_until,
                refresh_generation,
            },
        ))
    }

    pub(crate) async fn oidc_save_login(&self, t: LoginTransaction) -> Result<(), StoreError> {
        sqlx::query("INSERT INTO oidc_login(issuer,client_id,state_hash,browser_hash,expires_at,payload) VALUES($1,$2,$3,$4,$5,$6)").bind(&t.issuer).bind(&t.client_id).bind(&t.state_hash).bind(&t.browser_hash).bind(t.expires_at).bind(sqlx::types::Json(&t)).execute(self.admission_pool()?).await.map_err(db_error)?;
        Ok(())
    }
    pub(crate) async fn oidc_consume_login(
        &self,
        issuer: &str,
        client: &str,
        state: &str,
        browser: &str,
        now: i64,
    ) -> Result<Option<LoginTransaction>, StoreError> {
        let row:Option<serde_json::Value>=sqlx::query_scalar("DELETE FROM oidc_login WHERE issuer=$1 AND client_id=$2 AND state_hash=$3 AND browser_hash=$4 AND expires_at>$5 RETURNING payload").bind(issuer).bind(client).bind(state).bind(browser).bind(now).fetch_optional(self.admission_pool()?).await.map_err(db_error)?;
        row.map(|v| serde_json::from_value(v).map_err(|_| StoreError::CorruptData))
            .transpose()
    }
    pub(crate) async fn oidc_complete(
        &self,
        tokens: Tokens,
        digest: &str,
        csrf: &str,
        previous: Option<String>,
    ) -> Result<AuthenticatedSession, StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        let identity = &tokens.identity;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("{}:{}", identity.issuer, identity.subject))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let existing: Option<uuid::Uuid> =
            sqlx::query_scalar("SELECT account FROM oidc_identity WHERE issuer=$1 AND subject=$2")
                .bind(&identity.issuer)
                .bind(&identity.subject)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?;
        let account = existing.unwrap_or_else(uuid::Uuid::new_v4);
        sqlx::query("INSERT INTO accounts(id,name,password_hash) VALUES($1,$2,'!oidc') ON CONFLICT(id) DO UPDATE SET name=excluded.name").bind(account).bind(&identity.username).execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("INSERT INTO oidc_identity(issuer,subject,account) VALUES($1,$2,$3) ON CONFLICT DO NOTHING").bind(&identity.issuer).bind(&identity.subject).bind(account).execute(&mut *tx).await.map_err(db_error)?;
        if let Some(old) = previous {
            sqlx::query("WITH revoked AS (DELETE FROM sessions WHERE digest=$1 RETURNING account) SELECT pg_notify('orbit_game_updates','account:'||account::text) FROM revoked")
                .bind(old)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        let expires_at = (unbought_auth::now() + i64::from(SESSION_IDLE_SECONDS)) * 1000;
        sqlx::query("INSERT INTO sessions(digest,account,csrf,expires_at,authenticated_at) VALUES($1,$2,$3,$4,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)")
            .bind(digest)
            .bind(account)
            .bind(csrf)
            .bind(expires_at)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        // The transaction supplies the configured client ID, not a token-controlled value.
        let client_id = tokens.client_id.clone();
        sqlx::query("INSERT INTO oidc_session(digest,issuer,client_id,sid,subject,payload) VALUES($1,$2,$3,$4,$5,$6 || jsonb_build_object('refresh_generation',$7::text))").bind(digest).bind(&identity.issuer).bind(client_id).bind(&identity.session_id).bind(&identity.subject).bind(sqlx::types::Json(&tokens)).bind(uuid::Uuid::new_v4().to_string()).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        self.lookup_session(digest)
            .await?
            .ok_or(StoreError::CorruptData)
    }
    pub(crate) async fn oidc_revalidate(
        &self,
        digest: &str,
        rp: &RelyingParty,
    ) -> Result<Identity, StoreError> {
        self.oidc_revalidate_using(
            digest,
            &rp.configuration().issuer,
            &rp.configuration().client_id,
            false,
            |tokens| async move { rp.revalidate(&tokens).await.map(|tokens| (tokens, None)) },
        )
        .await
    }

    async fn oidc_revalidate_using<F, Fut>(
        &self,
        digest: &str,
        issuer: &str,
        client: &str,
        activity: bool,
        refresh: F,
    ) -> Result<Identity, StoreError>
    where
        F: FnOnce(Tokens) -> Fut + Send,
        Fut: std::future::Future<Output = unbought_auth::Result<(Tokens, Option<i64>)>> + Send,
    {
        tokio::time::timeout(REVALIDATION_BUDGET, async {
            let tokens = observe_auth_store(self.observer.clone(), AuthPhase::Read,
                read_tokens(self.read_pool()?, digest, issuer, client)).await?;
            if !activity && cached_identity(&tokens, issuer, client, unbought_auth::now())? {
                return Ok(tokens.identity);
            }
            // Only the reserved refresh pool waits on the provider. The claim
            // transaction commits BEFORE remote work, never after it.
            let (tokens, claim, tx) = observe_auth_store(self.observer.clone(), AuthPhase::Claim, async {
            let mut tx = self.begin_tx(self.refresh_pool()?).await?;
            let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,901324))")
                .bind(digest).fetch_one(&mut *tx).await.map_err(db_error)?;
            if !acquired {
                return Err(StoreError::Unavailable);
            }
            let tokens = read_tokens(&mut *tx, digest, issuer, client).await?;
            if !activity && cached_identity(&tokens, issuer, client, unbought_auth::now())? {
                tx.commit().await.map_err(db_error)?;
                return Ok((tokens, None, None));
            }
            let claim = if activity { None } else { Some(uuid::Uuid::new_v4().to_string()) };
            if let Some(claim) = &claim {
                // Remove the capability, not just an advisory flag: even an old
                // binary cannot replay this refresh token after a rollback.
                let claimed = sqlx::query("UPDATE oidc_session o SET payload=(o.payload - 'refresh_token') || jsonb_build_object('validated_at',0,'rotation_claim_id',$2::text,'rotation_deadline_ms',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+$3) FROM sessions s WHERE o.digest=$1 AND s.digest=o.digest AND s.expires_at>floor(extract(epoch FROM clock_timestamp())*1000)::bigint")
                    .bind(digest).bind(claim).bind(REVALIDATION_BUDGET.as_millis() as i64)
                    .execute(&mut *tx).await.map_err(db_error)?;
                if claimed.rows_affected() != 1 { return Err(StoreError::Conflict); }
                tx.commit().await.map_err(db_error)?;
                // Retain refresh-pool capacity during the provider call. There
                // are no token-row locks, so logout can still complete promptly.
                tx = self.begin_tx(self.refresh_pool()?).await?;
            }
            Ok((tokens, claim, Some(tx)))
            }).await?;
            let Some(mut tx) = tx else { return Ok(tokens.identity); };
            let remote = observe_auth_store(self.observer.clone(), AuthPhase::Provider, async {
                tokio::time::timeout(PROVIDER_BUDGET, refresh(tokens)).await
                    .map_err(|_| StoreError::Unavailable)?
                    .map_err(revalidation_error)
            }).await;
            let (fresh, renewed_until) = match remote {
                Ok(fresh) => fresh,
                // Rotation might have committed. A new sign-in is conclusive;
                // restoring or retrying the consumed capability is never safe.
                Err(_) if claim.is_some() => return Err(StoreError::Conflict),
                Err(error) => return Err(error),
            };
            observe_auth_store(self.observer.clone(), AuthPhase::Persist, async {
                if let Some(expires) = renewed_until {
                    sqlx::query("UPDATE sessions SET expires_at=$2 WHERE digest=$1 AND expires_at>floor(extract(epoch FROM clock_timestamp())*1000)::bigint")
                        .bind(digest).bind(expires * 1000).execute(&mut *tx).await.map_err(db_error)?;
                }
                // UPDATE only and compare the durable attempt. Logout/expiry
                // wins; no late response can recreate a session or a claim.
                let account: Option<uuid::Uuid> = sqlx::query_scalar("UPDATE oidc_session o SET payload=$2 || jsonb_build_object('refresh_generation',COALESCE($3::text,o.payload->>'refresh_generation')) FROM sessions s WHERE o.digest=$1 AND s.digest=o.digest AND s.expires_at>floor(extract(epoch FROM clock_timestamp())*1000)::bigint AND ($3::text IS NULL OR o.payload->>'rotation_claim_id'=$3) RETURNING s.account")
                    .bind(digest).bind(sqlx::types::Json(&fresh)).bind(claim.as_deref()).fetch_optional(&mut *tx).await.map_err(db_error)?;
                let account = account.ok_or(StoreError::Conflict)?;
                sqlx::query("UPDATE accounts SET name=$2 WHERE id=$1")
                    .bind(account).bind(&fresh.identity.username).execute(&mut *tx).await.map_err(db_error)?;
                tx.commit().await.map_err(db_error)?;
                Ok(fresh.identity)
            }).await
        }).await.map_err(|_| StoreError::Unavailable)?
    }

    pub(crate) async fn oidc_renew(
        &self,
        digest: &str,
        rp: &RelyingParty,
    ) -> Result<Identity, StoreError> {
        let config = rp.configuration();
        self.oidc_renew_using(
            digest,
            &config.issuer,
            &config.client_id,
            |tokens| async move { rp.revalidate(&tokens).await },
            |tokens| async move {
                let client = reqwest::Client::builder()
                    .timeout(PROVIDER_BUDGET)
                    .redirect(reqwest::redirect::Policy::none())
                    .build()
                    .map_err(|_| unbought_auth::Error::Unavailable)?;
                let response = client
                    .post(format!(
                        "{}/game-session/renew",
                        config.issuer.trim_end_matches('/')
                    ))
                    .basic_auth(&config.client_id, Some(&config.client_secret))
                    .form(&[(
                        "token",
                        tokens
                            .refresh_token
                            .as_deref()
                            .ok_or(unbought_auth::Error::Invalid)?,
                    )])
                    .send()
                    .await
                    .map_err(|_| unbought_auth::Error::Unavailable)?;
                if response.status().is_server_error() || response.status().as_u16() == 429 {
                    return Err(unbought_auth::Error::Unavailable);
                }
                if !response.status().is_success() {
                    return Err(unbought_auth::Error::Invalid);
                }
                #[derive(serde::Deserialize)]
                struct Renewal {
                    session_expires_at: i64,
                }
                let renewal: Renewal = response
                    .json()
                    .await
                    .map_err(|_| unbought_auth::Error::Invalid)?;
                let now = unbought_auth::now();
                if renewal.session_expires_at <= now {
                    return Err(unbought_auth::Error::Invalid);
                }
                // Renewal never rotates tokens: cancellation here leaves the
                // previously committed refresh token usable on the next request.
                Ok((
                    tokens,
                    Some(
                        renewal
                            .session_expires_at
                            .min(now + i64::from(SESSION_IDLE_SECONDS)),
                    ),
                ))
            },
        )
        .await
    }

    // Keep token rotation and its durable commit within their original budget.
    // Only after that commit may the separately bounded, non-rotating activity
    // request begin. Never nest these phases inside one cancellation deadline.
    async fn oidc_renew_using<R, RFut, N, NFut>(
        &self,
        digest: &str,
        issuer: &str,
        client: &str,
        revalidate: R,
        renew: N,
    ) -> Result<Identity, StoreError>
    where
        R: FnOnce(Tokens) -> RFut + Send,
        RFut: std::future::Future<Output = unbought_auth::Result<Tokens>> + Send,
        N: FnOnce(Tokens) -> NFut + Send,
        NFut: std::future::Future<Output = unbought_auth::Result<(Tokens, Option<i64>)>> + Send,
    {
        self.oidc_revalidate_using(digest, issuer, client, false, |tokens| async move {
            revalidate(tokens).await.map(|tokens| (tokens, None))
        })
        .await?;
        // Reacquire and reread under the same advisory lock: a peer can rotate
        // between phases, and logout can delete the local session at any point.
        self.oidc_revalidate_using(digest, issuer, client, true, renew)
            .await
    }

    #[cfg(feature = "test-support")]
    pub async fn renew_oidc_after_revalidation_for_test<R, RFut, N, NFut>(
        &self,
        digest: &str,
        issuer: &str,
        client: &str,
        revalidate: R,
        renew: N,
    ) -> Result<Identity, StoreError>
    where
        R: FnOnce(Tokens) -> RFut + Send,
        RFut: std::future::Future<Output = unbought_auth::Result<Tokens>> + Send,
        N: FnOnce(Tokens) -> NFut + Send,
        NFut: std::future::Future<Output = unbought_auth::Result<(Tokens, Option<i64>)>> + Send,
    {
        self.oidc_renew_using(digest, issuer, client, revalidate, renew)
            .await
    }

    #[cfg(feature = "test-support")]
    pub async fn renew_oidc_for_test<F, Fut>(
        &self,
        digest: &str,
        issuer: &str,
        client: &str,
        refresh: F,
    ) -> Result<Identity, StoreError>
    where
        F: FnOnce(Tokens) -> Fut + Send,
        Fut: std::future::Future<Output = unbought_auth::Result<(Tokens, Option<i64>)>> + Send,
    {
        self.oidc_revalidate_using(digest, issuer, client, true, refresh)
            .await
    }

    /// Controlled remote boundary for deterministic storage/concurrency tests.
    #[cfg(feature = "test-support")]
    pub async fn revalidate_oidc_for_test<F, Fut>(
        &self,
        digest: &str,
        issuer: &str,
        client: &str,
        refresh: F,
    ) -> Result<Identity, StoreError>
    where
        F: FnOnce(Tokens) -> Fut + Send,
        Fut: std::future::Future<Output = unbought_auth::Result<Tokens>> + Send,
    {
        self.oidc_revalidate_using(digest, issuer, client, false, |tokens| async move {
            refresh(tokens).await.map(|tokens| (tokens, None))
        })
        .await
    }
    pub(crate) async fn oidc_revoke(
        &self,
        issuer: &str,
        client: &str,
        event: Logout,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        let fresh=sqlx::query("INSERT INTO oidc_logout_replay(issuer,client_id,jti,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(issuer).bind(client).bind(event.jti).bind(event.exp).execute(&mut *tx).await.map_err(db_error)?.rows_affected()>0;
        if fresh {
            sqlx::query("WITH revoked AS (DELETE FROM sessions WHERE digest IN(SELECT digest FROM oidc_session WHERE issuer=$1 AND client_id=$2 AND sid=$3) RETURNING account) SELECT pg_notify('orbit_game_updates','account:'||account::text) FROM revoked").bind(issuer).bind(client).bind(event.sid).execute(&mut *tx).await.map_err(db_error)?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
}

fn revalidation_error(error: unbought_auth::Error) -> StoreError {
    match error {
        unbought_auth::Error::Unavailable => StoreError::Unavailable,
        _ => StoreError::Conflict,
    }
}

async fn read_tokens<'e, E: sqlx::Executor<'e, Database = sqlx::Postgres>>(
    executor: E,
    digest: &str,
    issuer: &str,
    client: &str,
) -> Result<Tokens, StoreError> {
    let row: Option<(serde_json::Value, i64)> = sqlx::query_as("SELECT o.payload, floor(extract(epoch FROM clock_timestamp())*1000)::bigint FROM oidc_session o JOIN sessions s USING(digest) WHERE digest=$1 AND s.expires_at>floor(extract(epoch FROM clock_timestamp())*1000)::bigint AND o.issuer=$2 AND o.client_id=$3")
        .bind(digest).bind(issuer).bind(client).fetch_optional(executor).await.map_err(db_error)?;
    let (value, now_ms) = row.ok_or(StoreError::Conflict)?;
    if value.get("rotation_claim_id").is_some() {
        return Err(
            if value
                .get("rotation_deadline_ms")
                .and_then(serde_json::Value::as_i64)
                .is_some_and(|deadline| now_ms < deadline)
            {
                StoreError::Unavailable
            } else {
                StoreError::Conflict
            },
        );
    }
    serde_json::from_value(value).map_err(|_| StoreError::CorruptData)
}

// Match the pinned unbought-auth revalidation contract without starting network
// work on the ordinary read pool. The locked path rechecks the authoritative row.
fn cached_identity(
    tokens: &Tokens,
    issuer: &str,
    client: &str,
    now: i64,
) -> Result<bool, StoreError> {
    if tokens.client_id != client
        || tokens.identity.issuer != issuer
        || tokens.validated_at > now + 5
    {
        return Err(StoreError::Conflict);
    }
    Ok(now - tokens.validated_at < 60 && now < tokens.identity.expires_at)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cached_identity_checks_issuer_client_clock_skew_age_and_expiry() {
        let mut tokens = Tokens {
            client_id: "orbit".into(),
            identity: Identity {
                issuer: "issuer".into(),
                subject: "subject".into(),
                username: "player".into(),
                email_verified: true,
                supporter_tier: None,
                session_id: "sid".into(),
                issued_at: 900,
                expires_at: 1100,
            },
            access_token: "access".into(),
            refresh_token: None,
            nonce: "nonce".into(),
            validated_at: 941,
        };
        assert!(cached_identity(&tokens, "issuer", "orbit", 1000).unwrap());
        tokens.validated_at = 940;
        assert!(!cached_identity(&tokens, "issuer", "orbit", 1000).unwrap());
        tokens.validated_at = 1005;
        assert!(cached_identity(&tokens, "issuer", "orbit", 1000).unwrap());
        tokens.validated_at = 1006;
        assert!(cached_identity(&tokens, "issuer", "orbit", 1000).is_err());
        tokens.validated_at = 1000;
        tokens.identity.expires_at = 1000;
        assert!(!cached_identity(&tokens, "issuer", "orbit", 1000).unwrap());
        assert!(cached_identity(&tokens, "other", "orbit", 1000).is_err());
        assert!(cached_identity(&tokens, "issuer", "other", 1000).is_err());
    }
    #[test]
    fn transient_provider_failures_are_distinct_from_invalid_identity() {
        assert!(matches!(
            revalidation_error(unbought_auth::Error::Unavailable),
            StoreError::Unavailable
        ));
        for error in [
            unbought_auth::Error::Invalid,
            unbought_auth::Error::AccountChanged,
            unbought_auth::Error::Transaction,
        ] {
            assert!(matches!(revalidation_error(error), StoreError::Conflict));
        }
    }
}

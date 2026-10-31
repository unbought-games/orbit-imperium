use crate::*;
use orbit_application::*;
use sqlx::Row;
async fn memberships(
    connection: &mut sqlx::PgConnection,
    account: AccountId,
) -> Result<Vec<Membership>, StoreError> {
    sqlx::query(
        "SELECT universe,player,u.name FROM universe_memberships m JOIN universes u ON u.id=m.universe WHERE account=$1 ORDER BY universe",
    )
    .bind(account.0)
    .fetch_all(&mut *connection)
    .await
    .map_err(db_error)?
    .into_iter()
    .map(|r| {
        Ok(Membership {
            universe_name: r.try_get("name").map_err(db_error)?,
            universe: r
                .try_get::<uuid::Uuid, _>("universe")
                .map_err(db_error)?
                .into(),
            player: r
                .try_get::<uuid::Uuid, _>("player")
                .map_err(db_error)?
                .into(),
        })
    })
    .collect()
}
impl IdentityStore for PgStore {
    async fn insignia_library(&self, b: Binding) -> Result<InsigniaLibrary, StoreError> {
        self.read_insignia_library(b).await
    }
    async fn change_insignia(
        &self,
        b: Binding,
        a: InsigniaAction,
        catalog: &InsigniaCatalog,
        p: CosmeticPolicy,
        e: SupporterEvidence,
    ) -> Result<(), ServiceError> {
        self.write_insignia(b, a, catalog, p, e).await
    }
    async fn equipped_insignias(
        &self,
        u: UniverseId,
        p: Vec<PlayerId>,
    ) -> Result<EquippedInsignias, StoreError> {
        self.read_equipped_insignias(u, p).await
    }

    async fn authenticate_machine(
        &self,
        digest: &str,
    ) -> Result<Option<AuthenticatedSession>, StoreError> {
        self.machine_session(digest).await
    }
    async fn bot_status(&self, p: Principal) -> Result<BotStatus, StoreError> {
        self.read_bot_status(p).await
    }
    async fn retire_bot(&self, p: Principal, reason: &str) -> Result<(), StoreError> {
        self.read_bot_status(p).await?;
        self.retire_bot_player(p.universe, p.player, reason).await
    }

    async fn player_identities(
        &self,
        universe: UniverseId,
        players: Vec<PlayerId>,
    ) -> Result<Vec<PlayerIdentity>, StoreError> {
        sqlx::query("SELECT m.player,a.name,i.issuer,i.subject,EXISTS(SELECT 1 FROM bot_participation b WHERE b.universe=m.universe AND b.player=m.player) AS bot FROM universe_memberships m JOIN accounts a ON a.id=m.account LEFT JOIN oidc_identity i ON i.account=a.id WHERE m.universe=$1 AND m.player=ANY($2)")
            .bind(universe.0).bind(players.iter().map(|p|p.0).collect::<Vec<_>>())
            .fetch_all(self.read_pool()?).await.map_err(db_error)?
            .into_iter().map(|row| Ok(PlayerIdentity {
                kind: if row.try_get::<bool,_>("bot").map_err(db_error)? {PlayerKind::Bot}else{PlayerKind::Human},
                player: PlayerId(row.try_get("player").map_err(db_error)?),
                username: row.try_get("name").map_err(db_error)?,
                issuer: row.try_get("issuer").map_err(db_error)?,
                subject: row.try_get("subject").map_err(db_error)?,
            })).collect()
    }
    async fn universe_summaries(&self) -> Result<Vec<UniverseSummary>, StoreError> {
        sqlx::query("SELECT universe, u.name FROM universe_policies_v2 p JOIN universes u ON u.id=p.universe ORDER BY u.name")
            .fetch_all(self.read_pool()?).await.map_err(db_error)?
            .into_iter().map(|r| Ok(UniverseSummary {
                universe: UniverseId(r.try_get("universe").map_err(db_error)?),
                name: r.try_get("name").map_err(db_error)?,
            })).collect()
    }
    async fn save_oidc_login(&self, t: unbought_auth::LoginTransaction) -> Result<(), StoreError> {
        self.oidc_save_login(t).await
    }
    async fn consume_oidc_login(
        &self,
        issuer: &str,
        client: &str,
        state: &str,
        browser: &str,
        now: i64,
    ) -> Result<Option<unbought_auth::LoginTransaction>, StoreError> {
        self.oidc_consume_login(issuer, client, state, browser, now)
            .await
    }
    async fn complete_oidc_login(
        &self,
        tokens: unbought_auth::Tokens,
        digest: &str,
        csrf: &str,
        previous: Option<String>,
    ) -> Result<AuthenticatedSession, StoreError> {
        self.oidc_complete(tokens, digest, csrf, previous).await
    }
    async fn revalidate_oidc(
        &self,
        digest: &str,
        rp: &unbought_auth::RelyingParty,
    ) -> Result<unbought_auth::Identity, StoreError> {
        self.oidc_revalidate(digest, rp).await
    }
    async fn renew_session(
        &self,
        digest: &str,
        rp: Option<&unbought_auth::RelyingParty>,
    ) -> Result<i64, StoreError> {
        if let Some(rp) = rp {
            self.oidc_renew(digest, rp).await?;
            return self
                .lookup_session(digest)
                .await?
                .map(|s| s.expires_at)
                .ok_or(StoreError::Conflict);
        }
        sqlx::query_scalar("UPDATE sessions SET expires_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+$2 WHERE digest=$1 AND expires_at>floor(extract(epoch FROM clock_timestamp())*1000)::bigint RETURNING expires_at")
            .bind(digest).bind(i64::from(SESSION_IDLE_SECONDS) * 1000)
            .fetch_optional(self.admission_pool()?).await.map_err(db_error)?.ok_or(StoreError::Conflict)
    }
    async fn revoke_oidc(
        &self,
        issuer: &str,
        client: &str,
        event: unbought_auth::Logout,
    ) -> Result<(), StoreError> {
        self.oidc_revoke(issuer, client, event).await
    }
    async fn enroll_oidc(
        &self,
        account: AccountId,
        policy: SignupPolicy,
    ) -> Result<(), StoreError> {
        let mut c = self.acquire_pool(self.read_pool()?).await?;
        let name: String = sqlx::query_scalar("SELECT name FROM accounts WHERE id=$1")
            .bind(account.0)
            .fetch_one(&mut *c)
            .await
            .map_err(db_error)?;
        drop(c);
        let digest = unbought_auth::digest(&unbought_auth::random_secret());
        self.enroll_account(
            Registration {
                name,
                password_hash: "!oidc".into(),
                policy,
                digest: digest.clone(),
                csrf: unbought_auth::random_secret(),
                previous: None,
            },
            Some(account),
        )
        .await?;
        self.revoke_session(&digest).await
    }

    async fn universe_policy(
        &self,
        universe: UniverseId,
    ) -> Result<Option<UniversePolicy>, StoreError> {
        let mut tx = self.bounded_policy_tx(self.read_pool()?).await?;
        Ok(self
            .read_policy(&mut tx, universe, false)
            .await?
            .map(|d| d.policy))
    }

    async fn register(
        &self,
        registration: Registration,
    ) -> Result<AuthenticatedSession, StoreError> {
        self.enroll(registration).await
    }
    async fn find_credentials(&self, name: &str) -> Result<Option<Credentials>, StoreError> {
        let mut connection = self.acquire_pool(self.read_pool()?).await?;
        sqlx::query(
            "SELECT id,password_hash FROM accounts WHERE name=$1 AND password_hash NOT LIKE '!%'",
        )
        .bind(name)
        .fetch_optional(&mut *connection)
        .await
        .map_err(db_error)?
        .map(|r| {
            Ok(Credentials {
                account: r.try_get::<uuid::Uuid, _>("id").map_err(db_error)?.into(),
                password_hash: r.try_get("password_hash").map_err(db_error)?,
            })
        })
        .transpose()
    }
    async fn create_session(
        &self,
        account: AccountId,
        digest: &str,
        csrf: &str,
        previous: Option<String>,
    ) -> Result<AuthenticatedSession, StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        if let Some(old) = previous {
            sqlx::query("WITH revoked AS (DELETE FROM sessions WHERE digest=$1 RETURNING account) SELECT pg_notify('orbit_game_updates','account:'||account::text) FROM revoked")
                .bind(old)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        let expires:i64=sqlx::query_scalar("INSERT INTO sessions(digest,account,csrf,expires_at) VALUES($1,$2,$3,floor(extract(epoch FROM clock_timestamp())*1000)::bigint+2592000000) RETURNING expires_at").bind(digest).bind(account.0).bind(csrf).fetch_one(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        let mut connection = self.acquire_pool(self.read_pool()?).await?;
        Ok(AuthenticatedSession {
            account,
            csrf: csrf.into(),
            expires_at: expires,
            memberships: memberships(&mut connection, account).await?,
        })
    }
    async fn lookup_session(
        &self,
        digest: &str,
    ) -> Result<Option<AuthenticatedSession>, StoreError> {
        let mut connection = self.acquire_pool(self.read_pool()?).await?;
        let row=sqlx::query("SELECT account,csrf,expires_at FROM sessions WHERE digest=$1 AND expires_at>floor(extract(epoch FROM clock_timestamp())*1000)::bigint").bind(digest).fetch_optional(&mut *connection).await.map_err(db_error)?;
        let Some(r) = row else { return Ok(None) };
        let account = AccountId(r.try_get("account").map_err(db_error)?);
        Ok(Some(AuthenticatedSession {
            account,
            csrf: r.try_get("csrf").map_err(db_error)?,
            expires_at: r.try_get("expires_at").map_err(db_error)?,
            memberships: memberships(&mut connection, account).await?,
        }))
    }
    async fn revoke_session(&self, digest: &str) -> Result<(), StoreError> {
        let mut connection = self.acquire_pool(self.admission_pool()?).await?;
        sqlx::query("WITH revoked AS (DELETE FROM sessions WHERE digest=$1 RETURNING account) SELECT pg_notify('orbit_game_updates','account:'||account::text) FROM revoked")
            .bind(digest)
            .execute(&mut *connection)
            .await
            .map_err(db_error)?;
        Ok(())
    }
}

use crate::*;
use argon2::{
    Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version,
    password_hash::SaltString,
};
use rand::{RngCore, rngs::OsRng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Copy, Debug)]
pub struct SignupPolicy {
    pub universe: UniverseId,
    pub max_players: u32,
}
/// Hashed credentials and new session are committed with the starter grant.
pub struct Registration {
    pub name: String,
    pub password_hash: String,
    pub policy: SignupPolicy,
    pub digest: String,
    pub csrf: String,
    pub previous: Option<String>,
}
#[derive(Clone)]
pub struct Credentials {
    pub account: AccountId,
    pub password_hash: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Membership {
    pub universe: UniverseId,
    pub player: PlayerId,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthenticatedSession {
    pub account: AccountId,
    pub csrf: String,
    pub expires_at: i64,
    pub memberships: Vec<Membership>,
}
pub struct LoginResult {
    pub token: String,
    pub session: AuthenticatedSession,
}
#[derive(Clone)]
pub struct SessionService<S> {
    store: S,
}
fn argon() -> Argon2<'static> {
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(19456, 2, 1, None).expect("fixed parameters"),
    )
}
pub fn hash_password(password: &str) -> Result<String, ServiceError> {
    argon()
        .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
        .map(|h| h.to_string())
        .map_err(|_| ServiceError::InvariantFailure)
}
fn secret() -> String {
    let mut bytes = [0; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}
pub fn token_digest(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
impl<S: IdentityStore> SessionService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }
    pub async fn signup(
        &self,
        name: &str,
        password: &str,
        policy: SignupPolicy,
        previous: Option<&str>,
    ) -> Result<LoginResult, ServiceError> {
        let name = name.trim().to_lowercase();
        if name.is_empty()
            || name.len() > 80
            || name.chars().any(char::is_control)
            || password.is_empty()
            || password.len() > 1024
        {
            return Err(ServiceError::Malformed);
        }
        let token = secret();
        let session = self
            .store
            .register(Registration {
                name,
                password_hash: hash_password(password)?,
                policy,
                digest: token_digest(&token),
                csrf: secret(),
                previous: previous.map(token_digest),
            })
            .await?;
        Ok(LoginResult { token, session })
    }
    pub async fn login(
        &self,
        name: &str,
        password: &str,
        previous: Option<&str>,
    ) -> Result<LoginResult, ServiceError> {
        if name.len() > 80 || password.len() > 1024 {
            return Err(ServiceError::Unauthenticated);
        }
        let record = self
            .store
            .find_credentials(&name.trim().to_lowercase())
            .await?;
        // Unknown names take the same expensive verification path and share the same error.
        let dummy = "$argon2id$v=19$m=19456,t=2,p=1$c2VjdXJlLWR1bW15LXNhbHQ$viR7acPyMSzcjhJhJyznSGOCGE5MrIHcHE93AKYsKtY";
        let encoded = record
            .as_ref()
            .map(|r| r.password_hash.as_str())
            .unwrap_or(dummy);
        let parsed = PasswordHash::new(encoded).map_err(|_| ServiceError::InvariantFailure)?;
        let verified = argon()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok();
        let record = record
            .filter(|_| verified)
            .ok_or(ServiceError::Unauthenticated)?;
        let token = secret();
        let csrf = secret();
        let session = self
            .store
            .create_session(
                record.account,
                &token_digest(&token),
                &csrf,
                previous.map(token_digest),
            )
            .await?;
        Ok(LoginResult { token, session })
    }
    pub async fn authenticate(&self, token: &str) -> Result<AuthenticatedSession, ServiceError> {
        if token.len() != 64 {
            return Err(ServiceError::Unauthenticated);
        }
        self.store
            .lookup_session(&token_digest(token))
            .await?
            .ok_or(ServiceError::Unauthenticated)
    }
    pub async fn logout(&self, token: &str) -> Result<(), ServiceError> {
        self.store.revoke_session(&token_digest(token)).await?;
        Ok(())
    }
}

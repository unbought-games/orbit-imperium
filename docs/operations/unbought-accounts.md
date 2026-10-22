# Shared Unbought accounts

Official Orbit uses `ORBIT_AUTH_MODE=oidc` and the issuer
`https://accounts.unbought.games/api/auth`. Set `ORBIT_OIDC_CLIENT_ID` and
`ORBIT_OIDC_CLIENT_SECRET` through runtime environment, plus the existing
`ORBIT_ORIGIN`, secure-cookie and PostgreSQL settings. Register the exact
`ORBIT_ORIGIN/api/auth/callback` and `ORBIT_ORIGIN/api/auth/backchannel-logout`
URLs at the accounts service. Its verification-return URL is
`ORBIT_ORIGIN/api/auth/login?verify=true`.

Players choose their shared username centrally. OIDC maps `(issuer, subject)` to
an immutable local account, then the player explicitly joins a universe. Multiple
universes and simultaneous enrollment remain supported. New memberships obey
the live universe signup rate limit; retries for existing memberships succeed
even after admissions close. OIDC display names may overlap stale claims or local
credential names without changing identity ownership. Unverified accounts may
play; the shared Rust crate exposes `require_verified` for future explicit game
rules, but this release adds no gameplay restriction. Email verification returns
through a fresh OIDC exchange, preserves the page, and never replays a command.

Cookies, CSRF, membership and gameplay authorization remain Orbit-owned. Local
sign-out revokes only this game's cookie session. Central sign-out/password reset/
suspension also reaches the back-channel endpoint and is enforced by a maximum
60-second revalidation interval. If accounts is unreachable after that interval,
commands fail closed while simulation continues. Back-channel replay processing
and login transaction consumption are atomic in PostgreSQL. Stale refreshes use
the separately bounded `ORBIT_POOL_REFRESH` reservation (default two connections
per API process) and never occupy admission/read capacity while waiting on
Accounts. A per-session PostgreSQL advisory lock serializes token rotation across
replicas; logout can still revoke the session during a refresh. See the
[connection budget](concurrent-runtime.md#configuration-and-connection-budget).
If a remote token rotation succeeds but its response or local transaction is
lost, the current provider contract may require the player to sign in again.

Self-hosted installations can use `ORBIT_AUTH_MODE=local` (the default) or their own
OIDC configuration. The official origin refuses local authentication. No old
account credentials or progress are imported for the official launch.

The shared crate is published as `unbought-auth` on crates.io, with its source in
the public `https://github.com/unbought-games/unbought-rs` workspace. Orbit pins
version `=0.1.3` and commits the registry checksum in `Cargo.lock`. Native builds
use `cargo build --locked -p orbit-server`; no private repository, sibling checkout
or GitHub credentials are required. Temporary local Cargo overrides may be used
for coordinated library development, but must not enter release manifests.
Ordinary accounts-service releases need not change this library version.

Docker builds use the same public dependencies:

```sh
docker build -t orbit-imperium:local .
```

OIDC client credentials belong in the runtime environment only. Local
authentication needs no account service or OIDC configuration. The internal
Orbit workspace crates remain local path dependencies and are not published
individually.

The new `oidc` database test stays in the existing native PostgreSQL test class.
The cross-origin two-web/two-worker/Orbit/second-client acceptance lives in the
accounts repository and runs only when explicitly requested. The existing Orbit
full-system policy is unchanged.

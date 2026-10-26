# Shared Unbought accounts

Official Orbit uses `ORBIT_AUTH_MODE=oidc` and the issuer
`https://accounts.unbought.games/api/auth`. Set `ORBIT_OIDC_CLIENT_ID` and
`ORBIT_OIDC_CLIENT_SECRET` through runtime environment, plus the existing
`ORBIT_ORIGIN` and PostgreSQL settings. HTTPS origins always use Secure cookies.
The [HTTP opt-in](../architecture/deployment.md#browser-origin-http-and-https)
does not relax the OIDC library’s HTTPS/loopback requirements for issuers and callbacks. Register the exact
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
version `=0.2.1` and commits the registry checksum in `Cargo.lock`. Native builds
use `cargo build --locked -p orbit-server`; no private repository, sibling checkout
or GitHub credentials are required. Temporary local Cargo overrides may be used
for coordinated library development, but must not enter release manifests.
Ordinary accounts-service releases need not change this library version.

The optional `https://unbought.games/supporter_tier` claim is carried by the
verified identity in the existing session token payload; no migration or separate
supporter column is needed. Fresh sign-in and normal token refresh replace the
snapshot, including clearing a removed tier. Older stored sessions without the
field continue to work.

`/api/auth/identity` continues to expose a limited current identity projection,
without OAuth tokens or provider session IDs. In-game player names now use the
public-profile API below, including the signed-in player's own name.

## Public recognition for every player

Set `ORBIT_ACCOUNTS_PROFILE_CREDENTIAL` on API/combined processes to a dedicated
Accounts profile-service credential bound to the same OIDC client as Orbit.
Provision it with Accounts' `provision-profile-credential` operator command and
place it directly in the runtime secret store. It is distinct from the OAuth
client secret and never reaches browsers. Restart API processes after rotation;
each process owns one issuer/client-scoped cache. Worker-only processes ignore
these settings.

`ORBIT_ACCOUNTS_API_URL` optionally overrides the Accounts API base URL. The
default is the configured issuer without its `/api/auth` suffix. The expected
response issuer remains the configured OIDC issuer. Production uses HTTPS;
loopback HTTP supports local integration tests. Supplying a URL without a
credential, or a credential without OIDC, fails startup. With no credential,
local/self-hosted games still show their stored usernames with no supporter badge.

Accounts must have its public-profile migration and endpoint deployed and the
credential provisioned. Existing users need one successful Accounts sign-in
after that deployment to establish durable client linkage. Their public badges
then remain available while they are offline or signed out; Orbit never needs
another player's session or refresh token.
A fresh verified sign-in invalidates that player's cached public snapshot and
fences any older response already in flight, while still honoring upstream rate
limits.

Orbit's `POST /api/v1/universes/{universe}/player-profiles` takes a normal bound
query context and a source: `SelfAccount`, `Galaxy` (galaxy/system), `Incoming`,
or `Report` (report ID). It authenticates the requester, checks CSRF, current
membership and epoch, and resolves identities through the same authorized game
read as the source view. Private reports and unrevealed combat participants cannot
be queried. The browser cannot submit arbitrary player IDs or Accounts subjects.

The endpoint batches Accounts lookups in groups of at most 100 after releasing
database resources. A process shares up to 4,096 source snapshots, removes expired
entries, and caches successful omissions for one minute. Refresh work is shared
with a bounded five-second wait; Accounts HTTP uses the library's five-second
request timeout. Failures back off for 30 seconds; rate limits honor `Retry-After`.
Unexpired snapshots remain usable. No failure extends a badge's expiry. A
successful omission clears support and falls back to the stored game username.
Database records contain no additional supporter flag or billing copy.

These cosmetic requests are separate from gameplay reads and commands. On an
Accounts outage, Orbit returns local usernames without expired badges, while the
game continues. Browsers share a session-scoped Zustand snapshot cache, schedule the next
active-view refresh within one minute of a response (sooner at expiry), and remove expired
display data at its deadline, including when returning from a background tab.
If Orbit itself is unreachable, the UI falls back to player identifiers. Session
and account switches discard the previous cache.

The shared player-name component covers the menu, account settings, Galaxy,
incoming fleets and overview arrivals, espionage targets/contacts, and all visible
combat participant sections. Starlight colors are ice, rose, and apricot for
tiers 1–3, with the same star badge. Ordinary players keep their normal names
without a badge. Report combat facts remain historical; displayed names and
supporter recognition reflect current profiles.

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

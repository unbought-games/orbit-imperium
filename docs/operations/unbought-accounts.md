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

Set `ORBIT_ACCOUNT_URL=https://accounts.unbought.games/account` on the official
API to show **Unbought Games account** in the desktop player menu. The URL is
runtime configuration, exposed as `account_url` by `/api/auth/config`; restart
the API after changing it. Unset or blank hides the link, so local development
and self-hosted servers do not advertise official Accounts by default. An
explicit absolute HTTP(S) URL can point a development instance at a local account
service. URLs containing credentials or other schemes are rejected at startup.
This setting controls a navigation link only; it does not change authentication.

Homepage account links use `/api/auth/entry` (`?signup=true` for registration).
Only the configured origin `https://orbitimperium.com` together with the official
Accounts issuer starts authentication immediately. Community installations keep
their existing `/login` and `/signup` screens, including installations using OIDC.
The hosted registration request adds `prompt=create` to the normal authorization
request so Accounts opens its registration page. No Accounts release is required.

The hosted entry stores `/join/<universe UUID>` as the authentication return path,
using the API's existing signup universe binding (selected with `ORBIT_UNIVERSE_ID`
when multiple universes exist). After authentication, existing members enter the
game without another enrollment request. The verified authentication callback
enrolls other players through the same admission service as the ordinary CSRF-protected enrollment endpoint, rechecking
current policy and capacity. A recovery-page GET never enrolls a player; retries
require an explicit click and use the CSRF-protected endpoint. Closed, full,
rate-limited or unavailable universes leave the account signed in and offer retry or universe selection. A missing or changed
binding falls back to the ordinary home/universe-selection flow. Direct login,
verification, deep-link returns and local sign-out retain their existing behavior.

Players choose their shared username centrally. OIDC maps `(issuer, subject)` to
an immutable local account, then the player joins a universe (automatically after
the hosted homepage invitation). Multiple universes and simultaneous enrollment
remain supported. New memberships obey
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
Before any rotation request, Orbit commits a claim that removes the stored refresh
token and invalidates its cached validation time. The provider call has a two-second
sub-budget inside a four-second revalidation budget; bootstrap retains its existing
five-second budget. A committed response replaces only the matching claim on a live
session. If the response or local commit is lost, cancellation leaves the claim
intact. Peers return unavailable while the claim deadline is live, then require a
new sign-in. No recovery path restores or retries the old token, including rollback
to the previous binary. Other browser sessions remain untouched and the provider's
replay-attack defenses remain enabled. Logout and session expiry always win.

The private metrics listener exports `orbit_auth_seconds` with fixed `phase`
(`read`, `claim`, `provider`, `persist`, `bootstrap_auth`, `bootstrap_game`) and
`outcome` (`success`, `unavailable`, `signin_required`, `cancelled`) labels.
`orbit_bootstrap_total` distinguishes `authenticated`, `anonymous`,
`auth_unavailable` and `game_unavailable`, even when bootstrap returns HTTP 200.
No user, session, token or request identifiers appear in these metrics.

A non-privileged authenticated observer can request `GET /api/v1/bootstrap` with
`X-Orbit-Auth-Metadata: 1`. Only authenticated OIDC cookie responses may contain
`result.authentication.identity_valid_until` (Unix seconds, the current verified
identity expiry, distinct from the idle cookie deadline) and
`result.authentication.refresh_generation` (an opaque random generation changed
only on successful persisted rotation or fresh sign-in). The same generation must
survive ordinary cached reads and nonrotating activity. Old rows without a generation
omit metadata until their next rotation. Anonymous, unavailable, machine and local
sessions omit it. A metadata read failure or exhausted bootstrap budget also omits
it while preserving the authenticated game response; observers must treat missing
opted-in metadata as unavailable telemetry. Keep the observer's cookie private; use generation and expiry to
prove the same retained session crosses an identity-expiry boundary. This opt-in
preserves compatibility with older clients' strict bootstrap schemas.

Run `make test-db DB_SUITES=oidc` for deterministic storage/cancellation coverage.
Explicit cross-service acceptance uses `make test-oidc-provider` with
`ORBIT_OIDC_PROVIDER_FIXTURE` pointing to a private manifest from the companion
Accounts disposable provider fixture. Use a fresh fixture for each invocation;
never share its single-use grants between concurrent test runs. Optional
`ORBIT_AUTH_EVIDENCE` retains sanitized phase timings and request counts. This suite
is deliberately excluded from routine CI and never uses production credentials.

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

## Server-side acquisition analytics

When optional analytics is configured, application middleware records HTML page
requests and preserves the first eligible source in a signed HttpOnly cookie.
Recognized invitation routes supply `invitation` / `referral` without changing
share links. Existing explicit campaign labels take precedence; otherwise an
external referrer is retained and missing evidence stays unknown.

Normal OAuth redirects carry bounded source metadata to the configured Accounts
origin. They do not depend on a browser analytics script or a browser-issued
handoff. Accounts snapshots source and signup method with account creation. Orbit
captures authenticated login and new membership analytics in their respective
transactions, using verified issuer/subject mappings. Retries and the optional
browser identity bridge share stable fact keys. GPC, DNT and the application
collection-disable cookie prevent request capture; sign-out clears the journey.

The browser SDK suppresses initial document views already recorded by the server
and continues observing SPA navigation. `scripts/analytics-routes.mjs` derives
patterns from actual file routes, public page dispatch patterns and server routes;
`npm run routes` and the build regenerate the shared manifest. Named patterns
appear in `context.route`; `context.page` retains ordinary entity paths and
unmatched paths. Invite/credential parameters keep their names (`:code`, `:token`)
instead of their values, including referrers. Queries and fragments are omitted.

Server page requests include repeat visits and link previews; they do not by
themselves count unique people. Capture failures/saturation are logged, while
committed auth/enrollment facts are retained in the transactional outbox.
Migration 0046 permits anonymous page entries in that outbox. Its existing worker
handles bounded batches, retries and quarantine. Deploy [analytics collector PR #7](https://github.com/unbought-games/analytics/pull/7)
and the Accounts server-acquisition change before depending on the new fields.
No release or deployment is performed by this implementation.

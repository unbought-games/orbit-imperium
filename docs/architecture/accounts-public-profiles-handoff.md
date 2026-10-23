# Accounts public profiles: Orbit API handoff

Status: proposed implementation contract for Accounts and `unbought-auth`.
Requested by Orbit Imperium, 2026-10-22. This endpoint does not exist yet.

## Outcome

Other players must see a supporter's colored username and star badge in Orbit,
including while that supporter is offline or signed out. Start with Galaxy;
the same public identity will serve fleet activity, reports, and future player
lists. Supporter recognition is public within the game.

Accounts remains the source of truth for usernames and supporter eligibility.
Orbit derives colors and badges from the returned tier. This API grants no
gameplay privileges and performs no billing operations.

## Existing integration

- Orbit uses the published `unbought-auth = "=0.2.0"` crate from `unbought-rs`.
- Accounts exports `https://unbought.games/supporter_tier` in verified ID tokens
  and UserInfo. The library exposes `Identity.supporter_tier: Option<u8>`.
- Orbit maps `(issuer, subject)` to its local account and universe players.
  Lookup inputs must use the same opaque `sub` issued to the requesting OIDC
  client, including any client-specific subject mapping.
- Token claims currently color the signed-in player's own identity. ID tokens
  are short-lived snapshots, and Orbit removes session records on logout.
  Other players' public recognition therefore cannot depend on those sessions
  or on holding their refresh tokens.
- Accounts currently enables authorization-code and refresh-token grants, not
  client credentials. Do not assume a machine-token flow already exists.

## Authentication and authorization

For v1, provide a dedicated, read-only service credential bound to an existing,
operator-approved OIDC client. The proposed wire format below uses a Bearer
credential. This is a service API credential, not a user's OAuth access token.

- Generate a high-entropy secret, store only its digest, and provide an operator
  path to provision, rotate, and revoke it. Never log the secret.
- Limit it to public-profile reads for its bound client. It must not authorize
  account administration, billing changes, or user impersonation.
- Disabling the client or revoking the credential must stop new API requests.
- Require HTTPS outside local development. Credentials stay on game servers;
  browser cookies, player tokens, and a caller-supplied client ID do not authorize
  this endpoint. Do not enable cross-origin browser access.

**A credential alone must not allow lookup of every Accounts user.** Resolve
only subjects linked to the credential's client through a successful Accounts
authentication/authorization exchange. Client A cannot read client B's users
unless those users are also linked to A.

That association must survive ordinary logout and token expiry. Reuse a durable
authorization record if its lifecycle supports this; otherwise record successful
client authorization as a fact. Do not infer linkage from an arbitrary subject
submitted to this lookup endpoint. Explicit unlinking, account deletion, or
client-access revocation removes lookup access. Suspended accounts are omitted.

For existing users, backfill only from reliable Accounts-owned authorization
evidence. If such evidence is unavailable, a new successful sign-in can establish
the association. Document the chosen migration behavior. No copied supporter flag
is needed in the association.

## Proposed HTTP contract

```http
POST /api/game-profiles/v1/batch
Authorization: Bearer <game-profile-service-credential>
Content-Type: application/json
```

Request:

```json
{
  "subjects": ["subject-a", "subject-b", "subject-c"]
}
```

- Accept 1–100 subject strings, each 1–255 characters. Treat them as opaque and
  case-sensitive; do not interpret them as usernames, emails, or Orbit player IDs.
- Deduplicate inputs; enforce the 100-item limit before deduplication.
- Apply a request-body size limit and configurable per-client and source rate
  limits. A starting client limit of 300 requests/minute is sufficient for v1;
  document the deployed limits so Orbit can respect them.

Successful response:

```json
{
  "issuer": "https://accounts.unbought.games/api/auth",
  "observed_at": 1803240000,
  "profiles": [
    {
      "subject": "subject-a",
      "username": "StellarNomad",
      "supporter_tier": 2,
      "expires_at": 1803240300
    },
    {
      "subject": "subject-b",
      "username": "Wayfarer",
      "expires_at": 1803240300
    }
  ]
}
```

- Timestamps are integer Unix seconds in UTC. `observed_at` is the Accounts
  snapshot time; `expires_at` is the latest time a consumer may use that profile
  snapshot, not an OAuth token expiry.
- Return at most one profile per requested, authorized subject. Ordering is
  unspecified. Return no unrequested profiles.
- Omit unknown, unlinked, deleted, and suspended subjects identically. In this
  example, `subject-c` is omitted. Do not distinguish whether it exists elsewhere
  in Accounts. A successful empty result is `"profiles": []`.
- A returned profile always has its current username. Omit `supporter_tier` for
  a non-supporter; do not use `0`, `false`, strings, or `null`.
- Allowed tier values are `1` ($10/month), `2` ($25/month), and `3` ($100/month).
  All three mean supporter. Return the highest currently eligible tier.
- Return only these public fields. Exclude email, verification state, real name,
  session IDs, OAuth tokens, Stripe IDs, subscription records, and payment dates.
- Send `Cache-Control: no-store` to prevent intermediary caching. The explicit
  expiry contract permits Orbit's bounded application cache described below.

Errors use a small JSON body such as `{"code":"InvalidRequest"}`:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `InvalidRequest` | Malformed JSON, invalid subjects, or batch limit exceeded |
| 401 | `Unauthenticated` | Missing, invalid, or revoked service credential |
| 403 | `Forbidden` | Authenticated client is disabled or lacks profile-read permission |
| 413 | `PayloadTooLarge` | Request-body size limit exceeded |
| 429 | `RateLimited` | Include `Retry-After` in integer seconds |
| 503 | `Unavailable` | Accounts cannot reliably read the requested snapshot |

Errors must not reveal account existence, credentials, or internal database
details. A billing/database read failure must not become a successful response
that silently removes everyone’s supporter tier. Prefer a whole-batch 503 to an
ambiguous partial result. Missing individual profiles are not per-user errors;
validly shaped but unavailable subjects follow the omission rule above.

## Eligibility and freshness

Reuse the billing eligibility function that supplies the existing OIDC claim,
including configured billing scope, recognized amounts, subscription status,
invoice-backed paid-through time, and highest-tier selection. Derive the tier
from those records at request time; do not introduce another stored supporter
flag. Batch database reads instead of querying once per requested user.

This endpoint reads Accounts' local billing snapshot. It must not call Stripe
for each profile lookup. Billing disabled means valid public usernames with no
supporter tier, matching the existing claim behavior.

Use a maximum profile cache lifetime of **five minutes**. Shorten it to the next
known eligibility boundary when necessary: a tier that ends in thirty seconds
must not receive five minutes of validity. The calculation must handle a higher
tier expiring while a lower tier remains eligible. Return a snapshot with future
expiry; do not advertise validity beyond a known tier transition.

New memberships, upgrades, downgrades, username changes, and revocations become
visible on the next lookup after Accounts has processed the change. Existing
cached views may lag by at most their remaining validity. This is a bounded
display snapshot, not a promise of a live Stripe check. No webhook integration
between Accounts and Orbit is required for v1.

## Rust library deliverable

Add a typed public-profile batch client to `unbought-auth` and publish a new
compatible release. Keep the existing OIDC login/refresh API and claim behavior.

The client should accept an explicit Accounts API base URL, expected issuer, and
the separate service credential; use existing HTTP transport conventions and
bounded network timeouts. Do not forward credentials across redirects or expose
them in errors/debug output. It must not need a player's access or refresh token.

Expose typed profiles, snapshot/expiry timestamps, and distinguish authentication,
authorization, rate limiting (including retry delay), unavailable service, and
invalid response errors. Reject issuer mismatches, duplicate/unrequested subjects,
and malformed required fields. Unknown optional tier values should produce no
badge, consistent with `Identity.supporter_tier`; they must not prevent ordinary
gameplay. Include usage and credential-rotation documentation.

## Orbit's side after delivery

Orbit will collect the players already visible in a game view, map them to their
Accounts subjects, and perform batched lookups. Only public username/tier data
will be attached to Orbit's existing authorized game responses. Orbit will not
provide an arbitrary Accounts-user lookup proxy.

Orbit will cache returned source snapshots by issuer, client, and subject, never
past their explicit expiry. Repeated views should share cache entries and batch
requests. A successful response replaces requested entries, including clearing
entries omitted from that response. A failed request may retain only an unexpired
snapshot. After expiry, the name falls back to existing Orbit identity data and
the badge disappears until a fresh response arrives. Accounts outages must not
block Galaxy browsing or ordinary play.

The browser derives Starlight colors and the star icon from the current tier.
It must also respect snapshot expiry in an already-open view. Local-auth and
other-provider installations keep working without this integration.

## Acceptance checks

1. Missing/revoked credentials and disabled clients are rejected. A credential
   cannot obtain another client's unlinked profiles or use account/billing APIs.
2. Successful sign-in establishes access; logout and token expiry preserve it;
   explicit unlinking and deletion remove it. Exercise client-specific subjects.
3. A mixed batch returns supporters at all three tiers and ordinary users, with
   identical omissions for unknown, unauthorized, deleted, and suspended subjects.
4. The profile and OIDC claim agree for the same billing snapshot. Cover multiple
   subscriptions, scheduled cancellation, unpaid renewal, expiry, scope isolation,
   and billing disabled. Use controlled clocks at paid-through boundaries.
5. Expiry never exceeds five minutes or a known tier transition. Refresh replaces
   removed/upgraded/downgraded tiers and renamed usernames, including offline users.
6. Enforce input/body/batch limits, deduplication, rate limits and retry headers.
   Database failures produce an unavailable response rather than false negatives.
7. Responses and logs exclude private account/billing fields and credentials.
   The Rust client handles wrong issuer, bad responses, expiry, errors, and redirects.
8. Deliver endpoint documentation, operator provisioning/rotation instructions,
   migration behavior for existing linked users, and the published crate version.

## Accounts implementation references

Paths below are relative to the Accounts repository:

- `packages/server/lib/billing/claims.ts`: current shared tier eligibility.
- `packages/server/lib/auth/create.ts`: OIDC claims and enabled grants.
- `packages/server/lib/integrations/provision.ts`: registered client provisioning.
- `packages/server/lib/db/schema.ts`: client and authorization storage.
- `docs/supporter-billing.md`: current billing and supporter claim semantics.

Rust library source: `unbought-rs/crates/unbought-auth`.

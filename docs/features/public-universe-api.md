# Public universe APIs

Status: implemented. See the [consumer and operator guide](../operations/public-universe-api.md).

Give players and community tools equal access to basic universe information for
maps, player lookup and historical tracking. Ship two public, read-only JSON
feeds with a shared publication cadence. No account, universe membership, API
key, service token or operator approval is required.

## Endpoints and data

Paths are relative to the game server. Public API versioning is independent of
the authenticated gameplay protocol.

| Endpoint | Published data | Refresh schedule |
| --- | --- | --- |
| `GET /api/public/v1/universes/{universe}/players` | All current players: stable player ID, username, total points, rank, and nullable alliance identity (ID, name, tag) | Hourly, at each UTC hour boundary |
| `GET /api/public/v1/universes/{universe}/planets` | All occupied planets: stable planet ID, nullable name, galaxy/system/position coordinates, and owner's player ID | Daily, at 00:00 UTC |

Both endpoints return the complete respective roster. Include zero-point players.
Use the existing [High Scores](../architecture/high-scores.md) valuation and tie
rules; points are decimal strings. Planet IDs establish identity, not coordinates.
Exclude moons and empty or abandoned slots. The feeds refresh independently, so
a planet owner may be absent from the current player feed; consumers must retain
the owner ID and tolerate that missing lookup.

These fields are an explicit allowlist. Do not include activity timestamps,
online/offline or inactivity status, vacation status, resources, buildings,
research, ships, defenses, fleets, debris, or any espionage-report information.
Planet data is limited to the identity, location and ownership visible through
ordinary galaxy browsing. Never enrich it from spy reports or private game state.

## Freshness contract

Every response includes `schema_version`, `universe`, `epoch`, `sampled_at`,
`next_refresh_at`, and the endpoint's `players` or `planets` array. Timestamps are
UTC Unix milliseconds. `sampled_at` is the actual source observation time;
`next_refresh_at` is the next scheduled publication boundary, not a guarantee
that publication has succeeded.

Publish one complete observation per feed at each boundary, independently of
requests. All callers receive the same observation until the next publication;
polling faster, changing query parameters or supplying credentials cannot reveal
fresher data. A rename, ownership change or score change appears at the next
successful publication for its feed. This cadence applies only to these public
APIs; existing in-game views retain their current freshness.

Read each observation from one consistent, committed database snapshot without
settling gameplay or recording player/bot participation. It represents committed
facts at the sample time, not a promise that all due gameplay has been processed.
Preserve publication source facts and derive scores/ranks with existing domain
logic; do not persist derived totals, ranks or duplicate authoritative game state.

Transient publication failures receive bounded retries with backoff. After retry
exhaustion, wait for the next scheduled boundary. Emit structured diagnostics and
metrics for investigation, including retry exhaustion and publication freshness.

If publication fails, keep serving the last complete observation with its original
timestamps; a passed `next_refresh_at` makes the delay visible. Never label old
data fresh or return a partial/empty success for a failure. Return `503` if no
observation exists, including before the first scheduled publication after launch
or reset. A universe reset invalidates previous-epoch publications. Consumers
must separate history by universe and epoch. Unknown universes return `404`.

Support anonymous cross-origin GETs and conditional requests with `ETag`. HTTP
caching must not extend freshness beyond the next scheduled boundary, and reset
handling must invalidate previous-epoch responses. Ordinary availability limits
may return `429` with `Retry-After`; credentials do not unlock a faster feed.

## Delivery and acceptance

Implement this independently; do not adopt or merge bmick's tracker implementation.
The useful concepts are narrow public projections, consistent snapshots, stable
identifiers and explicit epoch boundaries. No credential issuance, tracker UI,
historical-query API or documentation website is part of this scope.

At implementation time, add OpenAPI contracts, generated types and repository
documentation with example requests/responses, field definitions, UTC schedules,
timestamp meanings, independent-feed joins, delayed publication and reset behavior.
Link the guide from the repository documentation index. A docs site follows after
shipping; it is not a release prerequisite. Consumers maintain their own history.

Acceptance coverage must prove unauthenticated access, the exact field allowlists,
score/rank parity for the same source facts, identical observations between refresh
boundaries, hourly/daily rollover under a controlled clock, atomic publication,
failure freshness, epoch invalidation, and absence of gameplay/presence side effects.

# Public universe data API

Community maps, player lookups and trackers can read two complete JSON feeds from
any game server. No account, membership, token or operator approval is required.
Public API version 1 is independent of the authenticated gameplay protocol.

| GET path | Publication schedule |
| --- | --- |
| `/api/public/v1/universes/{universe}/players` | Every UTC hour, at `HH:00` |
| `/api/public/v1/universes/{universe}/planets` | Every day at `00:00 UTC` |

`universe` is the universe UUID. There is no pagination, filtering or historical
query endpoint. Query parameters and credentials do not alter the observation.
Consumers retain their own history. In-game views retain their existing freshness.

## Requests and responses

```sh
curl -i 'https://game.example/api/public/v1/universes/00000000-0000-4000-8000-000000000001/players'
curl -i 'https://game.example/api/public/v1/universes/00000000-0000-4000-8000-000000000001/planets'
```

Example player feed (illustrative UUIDs and timestamps):

```json
{
  "schema_version": 1,
  "universe": "00000000-0000-4000-8000-000000000001",
  "epoch": "00000000-0000-4000-8000-000000000002",
  "sampled_at": 3601000,
  "next_refresh_at": 7200000,
  "players": [{
    "player_id": "00000000-0000-4000-8000-000000000003",
    "username": "Nova",
    "points": "123456789012345",
    "rank": 1,
    "alliance": {
      "id": "00000000-0000-4000-8000-000000000004",
      "name": "Free Stars",
      "tag": "STAR"
    }
  }]
}
```

Example planet feed:

```json
{
  "schema_version": 1,
  "universe": "00000000-0000-4000-8000-000000000001",
  "epoch": "00000000-0000-4000-8000-000000000002",
  "sampled_at": 86400000,
  "next_refresh_at": 172800000,
  "planets": [{
    "planet_id": "00000000-0000-4000-8000-000000000005",
    "name": null,
    "coordinates": { "galaxy": 1, "system": 2, "position": 3 },
    "owner_player_id": "00000000-0000-4000-8000-000000000003"
  }]
}
```

| Field | Meaning |
| --- | --- |
| `schema_version` | Integer `1`; the public representation version. |
| `universe`, `epoch` | UUIDs. A reset changes the epoch; separate history by both. |
| `sampled_at` | Actual source observation time, UTC Unix milliseconds, including on a successful retry. |
| `next_refresh_at` | Next scheduled boundary after this publication's boundary, UTC Unix milliseconds. This is not a guarantee that publication succeeded. |
| `player_id` | Stable universe player UUID. All current members, including zero-point players, are present. |
| `username` | Account label at the observation time. Renames appear in the next successful player publication. |
| `points` | Nonnegative whole points as a decimal string; use exact integer parsing. Same completed-asset valuation as High Scores. |
| `rank` | Positive competition rank; equal whole-point totals share rank (`1, 1, 3`). Rows sort by points descending, then player UUID. |
| `alliance` | Observed alliance `{id, name, tag}`, or explicit `null`. No private roster or other alliance fields. |
| `planet_id` | Stable body UUID. Coordinates do not establish identity; a new planet at old coordinates has a new ID. |
| `name` | Observed planet name, or explicit `null`. |
| `coordinates` | Integer galaxy, system and position, as in ordinary galaxy browsing. Rows sort by these coordinates, then planet UUID. |
| `owner_player_id` | Observed owner UUID. Retain this even when the player lookup is missing. |

The feeds refresh independently. A planet owner can be absent from the current
player feed. Join only observations from the same universe and epoch, tolerate
missing players, and preserve the raw owner ID. Only occupied planets are
included; moons, empty slots and abandoned slots are absent.

The allowlist excludes activity timestamps, presence/inactivity and vacation
status, resources, buildings, research, ships, defenses, fleets, debris and all
espionage information. Source reads observe committed facts without settling due
gameplay or recording player/bot participation. A publication does not promise
that every due gameplay event has been processed.

## Caching, failures and resets

All callers receive the same complete observation between successful scheduled
publications. Polling faster does not sample gameplay. Send `If-None-Match` with
the returned `ETag` to receive `304` when the current observation is unchanged.
Weak validators, validator lists and `*` are supported. Anonymous cross-origin
GETs and conditional-request preflights are supported, and browsers can read
`ETag` and `Retry-After`. Do not send browser credentials.

Responses require cache revalidation (`public, no-cache, max-age=0,
must-revalidate`), including before the next boundary. This prevents an HTTP
cache from hiding a reset. The server checks the current epoch before evaluating
a conditional response. Error responses use `Cache-Control: no-store`.

| Status | Meaning |
| --- | --- |
| `200` | Latest complete observation; it may be delayed. A genuinely empty roster is valid. |
| `304` | Validator matches the current epoch's observation; no response body. |
| `400` | Malformed universe UUID. |
| `404` | Unknown universe. |
| `429` | Availability limit; wait for the `Retry-After` seconds. Credentials do not increase the budget. |
| `503` | No complete observation in the current epoch, or storage unavailable. |

Errors use `application/problem+json` with `type`, `status` and `code` fields.
For example: `{"type":"about:blank","status":503,"code":"Unavailable"}`.

Transient publication failures receive three retries after 1, 5 and 30 seconds
(four attempts total). If these fail, the next scheduled boundary gets a new
attempt budget. Nontransient source/schema errors end that boundary's attempts
immediately. Failed publication preserves the last complete observation and its
original timestamps; a passed `next_refresh_at` exposes the delay. It never
returns an empty success as a substitute for failed sampling.

On initial launch or reset, each feed waits for its first scheduled boundary and
returns `503` until successful publication. A planet feed can therefore be
unavailable until the next UTC midnight. On restart, existing current-epoch
observations remain available. Missed intervals are not reconstructed: a late
worker samples current committed facts for the current interval and records the
actual sample time.

## Operation and observability

Apply migration `0027_public_universe.sql` through the normal migration workflow.
The publisher runs in `worker` and combined server roles; API-only replicas serve
the shared PostgreSQL observations. Keep at least one worker running. Worker
polling is once per second; publication is scheduled on UTC boundaries but can
complete slightly later. No API request triggers a publication.

PostgreSQL claims coordinate replicas and persist the retry budget across
restarts. Each attempt has a 120-second lease and a 60-second I/O guard. An
abandoned lease consumes an attempt and becomes retryable after expiry; stale
claim tokens cannot overwrite a newer observation. Publication atomically
replaces source facts after validation and checks epoch and boundary at commit.
Only the latest observation of each feed is retained; point totals and ranks are
derived using existing domain logic, never stored.

The existing private metrics listener (`ORBIT_METRICS_BIND`) exposes:

| Metric | Meaning |
| --- | --- |
| `orbit_public_feed_events_total{universe,feed,event}` | Attempts, successes, scheduled retries, exhausted failures, claim failures and failure-recording failures. Event values: `attempt`, `success`, `retry`, `exhausted`, `claim_failed`, `record_failed`. |
| `orbit_public_feed_duration_seconds_sum/count{universe,feed}` | Attempt duration, including failed attempts. |
| `orbit_public_feed_scan_failures_total` | Failures to enumerate universes for scheduling. |
| `orbit_public_feed_available{universe,feed}` | Whether a current-epoch observation exists. |
| `orbit_public_feed_age_seconds{universe,feed}` | Age derived from the actual observation time; zero when unavailable (check `available`). |
| `orbit_public_feed_delayed{universe,feed}` | Whether the next expected publication boundary has passed. Also detects a stopped publisher after an existing observation. |
| `orbit_public_feed_attempts{universe,feed}` | Current durable attempt budget consumed; terminal source failures consume the remaining budget. |

Counters are process-local; scrape all workers and aggregate them for alerts.
Freshness and availability come from shared database facts. Investigate increases
in exhausted/claim/record/scan failures and delays persisting beyond the retry
window. Missing observations are expected before the first boundary after launch
or reset; alert according to those documented schedules.

Structured `key=value` logs name the event, universe, feed, epoch and boundary
where available, attempt number, duration and safe error category. Exhausted
retries log at error level; scheduled retries at warning level. Correlate these
with database diagnostics and connection-pool metrics. No private source payloads
or credentials are logged.

## Contracts and verification

The source contract is [OpenAPI](../../contracts/openapi.json); TypeScript types
are generated with `npm run contracts`. The [product specification](../features/public-universe-api.md)
defines the scope. Run `make check` and `make _db-public_universe` with the
[documented isolated PostgreSQL setup](../development.md#testing). Tests use a
controlled clock and cover field limits, score parity, consistent committed
reads, publication atomicity, retry exhaustion/recovery, independent schedules,
replica claims, HTTP caching, reset fencing and unchanged gameplay tables.

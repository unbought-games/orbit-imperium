# Gameplay action latency and SLO proposal

Status: proposed measurement contract, November 15, 2026. Server instrumentation
accompanies this plan; see [request latency operations](../operations/request-latency.md).
Production collection, client timing and rollout remain pending. Thresholds are provisional,
not claims of achieved performance or permission to activate new alarms.

## Player promise and acceptance boundary

For ship orders, building upgrades and fleet dispatches, distinguish four milestones:

1. The client starts submitting the player's action.
2. PostgreSQL acknowledges the transaction containing its durable order.
3. The client receives and validates the acceptance receipt.
4. The client incorporates the authoritative game-rule outcome.

Milestone 2 fixes the order in the system. A Pending receipt is durable admission,
not a promise that game-rule execution will succeed. A fleet's travel time or a
building's construction time is not command-processing latency. Ordering remains
based on the existing authoritative scope/sequence rules, not client clocks or
telemetry. Fast responses alone do not prove ordering correctness.

The current implementation commits in `PgStore::admit_pair_inner` before
`transport-http/src/v4.rs::commands` returns HTTP 202. An idempotent retry can
return an existing receipt without a new commit. A lost response remains uncertain
from the client's perspective; recovery must keep the original command ID.

## What exists and what is missing

- `orbit_runtime_seconds{stage="admission"}` measures HTTP handling, including
  authentication, but combines command/presence routes, protocols and outcomes.
  It cannot isolate building upgrades, ship orders or fleet launches.
- Ordering wait/hold, pool wait, engine queue/work, settlement and delivery metrics
  already provide useful diagnostic components. Preserve these.
- Settlement currently uses a timestamp read before commit minus logical input
  time; it is not an exact physical commit-to-commit measurement. Logical admission
  timestamps can be constrained by ordering frontiers. Do not relabel this metric
  as exact time since durable acceptance.
- Delivery measures reading replay rows, including old cursors; it does not prove
  client receipt or rendering. Do not use it as a player-visible confirmation SLI.
- The existing proxy histogram aggregates traffic across the application. It
  cannot isolate command latency, even though status counts include HTTP 202.
- The client persists an attempt locally before sending it. Start client timing
  before this persistence so a local delay is not misattributed to the API.

## Measurement contract

Use monotonic clocks within each process. Never subtract browser and server wall
clocks to estimate network delay. Record bounded histograms, counts and outcomes;
never label metrics with player, body, command ID, payload, raw URL or credentials.
Telemetry failure must never prevent or delay command admission.

| Measurement | Start | End | Purpose |
| --- | --- | --- | --- |
| API command response | API request middleware, before decoding/authentication | Handler produces response | Primary first-rollout latency, including auth and admission |
| Durable admission | Entry to storage admission, before pool checkout | Successful commit acknowledgement | Separates database admission from authentication/response work |
| Client acceptance | Submission begins, before local persistence | Validated receipt enters authoritative client state | Captures local storage, network, retries and API latency |
| Client outcome | Same submission start | Terminal receipt and required authoritative revision incorporated | Explains accepted actions that still look unresolved |

API response timing ends before the socket finishes delivering the response. Keep
proxy measurements and client timing as distinct boundaries. Server admission
success is recorded only after commit acknowledgement; drop/error paths never
record acceptance. An interrupted commit can be uncertain, not proven rejected.
Existing-receipt lookups get a separate `replay` outcome and lookup duration.

Initial action classes: `ship_order`, `building_upgrade`, `fleet_dispatch`,
`research`, `cancel`, `other`, and `unknown`. Classify typed commands, including
ship versus defense manufacturing; do not parse arbitrary payload text. Include
fleet recall under an explicit fixed class if its behavior warrants a separate
objective. Every other command still contributes to `other`.

Keep foreground and machine traffic separate using the authenticated transport
contract. Presence calls, health checks, static files and reads are not gameplay
submission attempts. Foreground is a transport population, not proof of a unique
human. Preserve unknown/legacy traffic rather than silently attributing it.

API outcomes must distinguish accepted, expected rejection, authentication
required, rate limited, service error, cancelled/unknown, and unexpected response.
Malformed requests and authentication failures before action classification still
count under `unknown`. Record cancellation through a guard, not solely after
`next.run()` returns. Hard process death and failures before the API require proxy
coverage; an in-memory observer cannot be a lossless request ledger.

Count one HTTP observation per attempt. Retries are separate attempts; do not
present these as unique player actions. Client journey timing spans retries under
the original identity and records acceptance once. Reloads without a trustworthy
monotonic start are recovery observations, not invented short latency samples.
Track abandoned/unfinished journeys and client reporting coverage so completion-only
samples cannot make a broken experience look healthy.

Histogram boundaries in seconds: .005, .01, .025, .05, .1, .15, .25, .5, 1, 2.5,
5, 10, +Inf. Include the exact SLO thresholds. Aggregate counts across processes
before computing percentiles or compliance; never average percentiles. Publish
sample counts, failures and missing telemetry alongside latency.

## Provisional objectives

Evaluate each primary action class separately over a rolling 28-day window, with
5-minute, hourly and daily diagnostic views. A healthy overall average must not
hide slow fleet dispatches. These targets need a representative baseline and
owner agreement before becoming operational commitments.

| Objective | Proposed target |
| --- | --- |
| API acceptance response | At least 99% of eligible attempts accepted within 250 ms |
| API acceptance availability | At least 99.9% of eligible attempts return durable acceptance |
| Client confirmation | At least 99% of observed eligible foreground journeys confirmed within 1 second |
| Authoritative outcome visibility | Baseline separately before choosing a target |

For the API fast-acceptance objective, numerator = accepted responses within
250 ms; denominator = accepted + service failures + rate-limited + cancelled/unknown
eligible attempts. Report existing-receipt retries separately as well as in the
attempt-level objective. Exclude only positively identified invalid/unauthorized
requests and expected gameplay refusals; do not exclude outages, session-refresh
503s or capacity throttling. Retain all excluded categories in the dashboard.
Failures whose eligibility is unknown remain visible and cannot be presumed
invalid. The same denominator supports acceptance availability, with all accepted
responses in its numerator. Define the proxy-only failure population separately
until route-specific evidence can join it without double counting API failures.

For the client objective, count valid observed journeys that fail, remain unknown,
or miss the deadline as bad; do not use only successfully reported completions as
the denominator. State sampling, background-tab handling, connectivity exclusions
and reporting loss explicitly. Client timing is complementary to the authoritative
server SLI, not a replacement for it.

The concurrent-runtime runbook already lists admission p99 above 150 ms as a
starting operational objective to calibrate. It is not evidence of an installed
alarm or a ratified action SLO. Reconcile that text with the chosen measured
population and final target; do not silently claim the two thresholds are equivalent.

Use threshold counts for error-budget arithmetic, and p50/p95/p99 for diagnosis.
Show no-traffic as no samples and missing collection as unknown, never 100% success.
The good-event/total-event approach follows the
[Google SRE SLO workbook](https://sre.google/workbook/implementing-slos/).

## Delivery sequence and completion criteria

1. **Orbit server instrumentation:** extend the existing observer/exporter with
   bounded action/outcome histograms. Instrument request entry and real storage
   acceptance, including failures, cancellation and replay. Preserve protocol,
   persistence and ordering behavior. No extra database query per request.
2. **Hosted collection and dashboard:** in the infrastructure repository, scrape
   every API process and relevant worker privately. Retain histogram deltas and
   outcomes with process/restart identity, schema version and collection coverage.
   Detect resets, missing exporters and partial publication. Size retention to
   support the 28-day SLO; the current 14-day histogram retention is insufficient.
   Show each action, traffic population, success/error counts, threshold compliance,
   tail latency, ordering/pool/auth diagnostics and pending-work age. Review actual
   series count, retention and price before production infrastructure activation.
3. **Client measurement:** add lightweight first-party timing in the command
   coordinator, including local persistence, receipt validation and outcome
   reconciliation. Batch asynchronously; reporting cannot gate gameplay. No browser
   analytics SDK is required. Use bounded payloads, ingestion controls and explicit
   coverage diagnostics. This requires its own tested data contract.
4. **Baseline and ratification:** retain at least seven representative days,
   including busy periods, ordinary releases and failure intervals. Compare action
   classes and foreground/machine populations; identify which phase dominates.
   Ratify targets based on desired experience and the cost of meeting them, rather
   than weakening targets until the current system appears green. Start the full
   28-day compliance view with its actual partial-window coverage labelled.
5. **Enforcement:** define warning/page and error-budget responses after baseline
   review. Use sustained budget consumption with short/long windows and a low-volume
   policy; retain availability and telemetry-health backstops. No new latency page
   is enabled merely by adding these histograms.

Validation follows the repository test-design skill: deterministic observer tests
for bucket boundaries, bounded labels and outcomes; HTTP tests for timing that
includes authentication, malformed requests, cancellation and failures; PostgreSQL
coverage that proves no accepted sample before commit, rollback/unknown behavior,
and no new-admission count on replay. Collector tests cover reset/missing/mixed
exporters, arithmetic, partial publication and retention. Client controller tests
use controlled promises and a monotonic clock for local delays, retries, recovery,
SSE-before-response and abandoned journeys. Avoid expanding the browser merge gate.

Completion requires verified production collection and action-specific graphs,
not just a new `/metrics` export. Record deployed revisions, valid interval counts,
traffic samples, coverage gaps and approved targets. Deployment and alarm activation
must follow their existing release/operations workflows. No artificial failures or
load generation on live players are required for commissioning.

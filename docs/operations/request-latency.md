# Request and command latency

Orbit exposes request/action latency through its existing private Prometheus
listener (`ORBIT_METRICS_BIND`). It does not currently install OpenTelemetry,
OTLP export, a collector or a distributed tracing backend. These metrics require
a running version containing the instrumentation and a collector configured to
retain the new families. Adding the exporter does not activate hosted collection,
a dashboard or latency alarms.

## Measurements

| Metric | Boundary and labels |
| --- | --- |
| `orbit_http_request_seconds` | HTTP middleware entry to response creation, or cancellation; `route`, `method`, `action`, `outcome` |
| `orbit_http_phase_seconds` | Cumulative time spent in each observed phase of that request; same labels plus `phase` |
| `orbit_command_admission_seconds` | V4 storage admission entry through acknowledged commit, existing-receipt lookup, failure or cancellation; `action`, `source`, `outcome` |
| `orbit_http_observations_dropped_total` | Request/phase observations omitted after reaching the bounded series limit; nonzero increases invalidate complete-coverage claims |

`route` is Axum's matched template, such as
`/api/v4/universes/{id}/commands`, never a raw URI. Unmatched/static fallback
requests use `unmatched`. Methods have a fixed allowlist, with other verbs grouped
as `OTHER`. Action labels distinguish upgrades, ship/defense/missile orders,
research, dispatches, recalls, cancellations and presence. Other commands use
`other`; requests not decoded as commands use `unknown`. V2/V3 command HTTP
responses are classified too; the dedicated storage-admission metric covers V4.
Machine command routes remain separate from ordinary command routes.

HTTP outcomes distinguish `accepted` (202), `success`, `redirect`, `unauthorized`,
`rate_limited`, `rejected`, `server_error`, `cancelled` and `unexpected`. They are
transport results, not final gameplay results. Bootstrap semantic failures can
return HTTP 200; retain `orbit_bootstrap_total` for that contract.

Admission outcomes distinguish `committed`, `replay`, `rejected`, `rate_limited`,
`error` and `cancelled`. A committed order is recorded immediately after database
commit acknowledgement. An existing receipt produces `replay`, even if its final
game outcome is rejected. A later lost/failed HTTP response does not revoke the
committed observation. Error/cancellation during commit can mean unknown outcome;
it is never proof the order was rolled back. Recover with the original command ID.
`source=foreground|machine` describes the admission entry point, not unique people.

Phases are `authentication`, `pool_wait`, `ordering_wait`, `ordering_hold`,
`admission_commit`, `admission_alliance_wait`, `admission_alliance_hold` and
`admission`. They are nested and can overlap: **do not add
them together**. Authentication timing covers the shared HTTP authentication helper;
not every specialized auth/bootstrap endpoint uses that helper. Pool waits are
observed checkouts, not every SQL round-trip. Ordering waits cover the existing
scope-stamp instrumentation. The two admission alliance phases cover the
universe/epoch advisory lock when the admitted action requires it.
A phase with no observation is absent, not a measured zero. Child/background tasks
are not attributed to the request; no task context crosses process boundaries.

Response creation excludes delivery over the network and response-body streaming.
An open SSE measures time to producing its headers, not the lifetime of the stream.
No new browser timing is installed. Process death and failures before the API
cannot be completely counted by in-memory metrics; retain proxy and collector
health evidence alongside application measurements.

Histograms include exact 150/250/500 ms and 1-second boundaries. Request and phase
series are created on first observation and capped at 4,096 combined series per
process. Admission series use only fixed enum labels. All counters reset on process
restart. Sum histogram deltas/rates across replicas before computing quantiles;
do not average per-instance percentiles or treat missing scrapes as healthy zeroes.
The existing stage/auth histogram boundaries are unchanged.

## Finding slow operations

For a Prometheus-compatible collector, p99 API response time by route/action:

```promql
histogram_quantile(0.99,
  sum by (route, action, le) (rate(orbit_http_request_seconds_bucket[5m]))
)
```

Show outcome counts and traffic volume next to that graph. The following measures
fast acceptance among accepted requests only; it is a latency diagnostic, **not**
an availability-adjusted SLO:

```promql
sum by (route, action) (rate(orbit_http_request_seconds_bucket{outcome="accepted",le="0.25"}[5m]))
/
sum by (route, action) (rate(orbit_http_request_seconds_count{outcome="accepted"}[5m]))
```

Inspect `orbit_http_phase_seconds` for that route/action, keeping request outcome
separate when comparing failures and successes. Use
`orbit_command_admission_seconds{source="foreground",outcome="committed"}` to
inspect fresh durable admissions, and graph replay/error/cancelled counts beside it.
The [SLO proposal](../plans/2026-11-15-action-latency-slos.md) defines the broader
population, failure handling and proposed targets; none are installed alarms.

## Recent slow calls

The same **private** metrics listener serves `GET /diagnostics/slow-requests`.
It returns the latest 64 requests taking at least 250 ms, newest first, with:

- Observation timestamp, route template, bounded method/action and HTTP status.
- Total handler duration and observed phase durations, in seconds.
- Durable admission outcome when one was observed, independently of HTTP status.

Responses use `Cache-Control: no-store`. The buffer is per process, overwritten
as newer slow calls arrive, and cleared on restart. It is diagnostic evidence,
not sampled population statistics or durable retention. No player IDs, request
IDs, bodies, query strings, headers or credentials are captured. Do not expose
this listener through a public proxy. Fetch from each API instance; the worker's
private listener cannot report requests served by another process.

Example on a host with its private listener bound to loopback:

```sh
curl --fail http://127.0.0.1:9091/diagnostics/slow-requests
curl --fail http://127.0.0.1:9091/metrics
```

Long-term hosted collection, 28-day retention, action dashboards and client-visible
confirmation remain separate rollout steps. Verify exporter revision, all API
instances, scrape coverage and reset handling before claiming a production SLO.

## Validation

```sh
make test-http
make test-request-metrics
make test-db DB_SUITES=request_metrics DB_JOBS=1
```

The database suite requires the disposable Compose setup used by other PostgreSQL
tests. It verifies rollback before admission, committed admission despite a later
response failure, and replay without a second committed observation. HTTP tests
cover concurrent task isolation, cancellation, malformed commands, authentication
failures, matched route templates and bounded method labels. Exporter tests cover
exact SLO bucket boundaries, outcomes, phases, bounded retention and series overflow.

## Worker latency after durable acceptance

On November 24, 2026, the serial production worker took up to **19.53 seconds**
to acknowledge a fleet outcome after the API acknowledged admission. In the
six-hour admission cohort, 121 foreground dispatches had a p95 of 13.02 seconds.
The 114 machine dispatches had a p95 of 0.71 seconds. The historical records
establish those intervals. They do not contain the phase breakdown of that
19.53-second launch.

### Reconstruct a dispatch

1. Find the API's `command_admitted` record by command ID. Take its universe,
   input ID, `admission_ack_us`, and `source`. V4 pair admission labels the
   actual entry point `foreground` or `machine` and supplies `paired_input_id`
   for the presence command. Single admissions use `unpaired`. Both members of a
   pair share one admission acknowledgement. A receipt replay produces no fresh
   admission record. For a dispatch, the gameplay admission record also carries
   `admission_alliance_wait_us` and `admission_alliance_hold_us` for its admission
   transaction.
2. Find `worker_input_claimed` and `worker_input_attempt` by universe and
   input ID. Subtract admission acknowledgement from the **first observed
   claim** to measure the wait through the successful claim transaction.
   The separate claim record can survive a worker that never finishes.
   Each attempt names the executing mode (`serial` includes preparation for
   cutover), worker instance, and its own `claim_ack_us`. A recovered input
   can have multiple claims.
3. On the terminal attempt, subtract `admission_ack_us` from `commit_ack_us`
   for wall time to durable outcome. Only a newly acknowledged transaction
   supplies the latter. Both applied and game-rule rejected orders have terminal
   receipts. Existing receipts, retries and failures can have timing samples,
   but cannot supply another terminal acknowledgement.
4. Read the attempt's phase durations and row counts below. To explain time
   before claim, inspect the paired presence input, earlier committed inputs in
   the universe, and `worker_active_wait` records from the same worker instance
   during that interval. Overlapping a scheduler wait establishes that the loop
   waited. Establishing that a specific pending input was eligible throughout
   also requires its ordering dependencies.

| Attempt field | Measured boundary |
| --- | --- |
| `fact_load_us` | Worker snapshot checkout, validation, fact reads and snapshot transaction completion |
| `cpu_queue_us` | Request for a CPU lane through entry to the blocking closure, including blocking-thread scheduling |
| `cpu_execution_us` | Wall duration spent in the blocking calculation and engine decision diagnostics |
| `commit_revalidation_us` | Commit entry through pool checkout, initial locks, claim checks, fact reload and change-set hash/revision checks |
| `alliance_wait_us` | Round trip to acquire the universe/epoch alliance advisory lock during worker revalidation |
| `alliance_hold_us` | Successful acquisition response through worker COMMIT acknowledgement or exit from the attempted transaction |
| `persistence_us` | Subsequent state/receipt/update work, including the final scoped publication fence, through the last pre-commit statement |
| `scoped_fence_us` | Time within persistence spent acquiring final scoped gates and checking ownership. Included in `persistence_us`; present only in scoped execution |
| `commit_round_trip_us` | Sending COMMIT through its return to the worker. A failed call can have a duration and unknown disposition |
| `attempt_us` | Monotonic wall time from the scheduler receiving the claim through resolution return, including task scheduling and application overhead |
| `fact_lots_read`, `revalidation_lots_read`, `lots_deleted`, `lots_inserted` | Asset-lot rows loaded before normalization at each read and rows affected by the bulk delete and insert |
| `fact_stacks_read`, `revalidation_stacks_read`, `stacks_written` | Rows returned by the inventory stack loader at each read and rows affected by stack inserts and updates during change-set persistence |

A fleet launch acquires this alliance lock twice, once in each transaction.
Compare its admission and worker wait/hold distributions separately. Worker wait
is part of revalidation. Worker hold overlaps the remaining revalidation,
persistence and COMMIT. The database grants/releases the lock inside those
round trips. Hold on an early return ends when the application leaves the
transaction path, and can exclude an asynchronous rollback. For observed waits
across independent orders, inspect both transactions and other users of the
same advisory lock. To estimate dispatch lock occupancy during a burst in one
universe and epoch, reconstruct each acknowledged hold interval as
`[ack_us - hold_us, ack_us]` on its own API or worker clock. Clip to the burst
window and divide the duration of the **union** by the window length. State
clock uncertainty and coverage. Other alliance/social transactions may hold
the same lock without a dispatch record.

A missing phase means the worker did not return a measurement for it. SQL row
counts describe work performed even on a later rollback. They exclude database
pages scanned, triggers and cascading deletes. The existing aggregate
`engine_queue` stage ends at semaphore acquisition. CPU execution here measures
elapsed time on the blocking thread, which includes preemption.

Wall timestamps are UTC microseconds on the acknowledging API or worker host.
Verify host clock synchronization and bound clock uncertainty before using
cross-host differences. A worker can see committed work before the API process
resumes from COMMIT. A claim timestamp earlier than the API acknowledgement
is reported separately and omitted from the queue distribution. An independently
ordered admission-to-terminal interval still contributes. Phase durations
use monotonic clocks within a worker. `logical_at_ms`, receipt timestamps,
`settlement`, and `dependency_wait` use game ordering or its logical frontier.
An update row's creation time precedes COMMIT. Client receipt and rendering
have separate boundaries.

The backend objective ends at the worker's acknowledged terminal commit. To
measure player-visible launch confirmation, record browser-monotonic milestones
for submission, receipt of the terminal SSE event **before queuing it for
processing**, application of that event to the authoritative client state, and
the first rendered confirmation. A previously queued overview refresh can delay
applying an event the browser already has. Record that refresh start/completion
and show receive-to-apply separately from apply-to-render. Distinguish SSE,
receipt polling and reconnect/replay when joining by command ID. Worker logs
cannot supply these browser timings. Do not subtract browser and server clocks.

### Private worker metrics

| Family | Labels and use |
| --- | --- |
| `orbit_worker_phase_seconds` | Histogram by bounded engine action, execution mode and phase. Includes observed phases of returned attempts, including retries |
| `orbit_worker_asset_lot_rows_total` | Counter by action, mode and operation (`fact_read`, `revalidation_read`, `insert`, `delete`) |
| `orbit_worker_inventory_stack_rows_total` | Counter by action, mode and operation (`fact_read`, `revalidation_read`, `write`) |
| `orbit_worker_scheduler_wait_seconds` | Histogram by `reason`, whether unjoined input tasks existed (`active_inputs`), and `wake`. Measures actual elapsed 100 ms no-progress backoffs, including early notifications/drain, and 25 ms poll timers that fired |

For example, this query estimates p95 fact-load time for dispatches by mode.
Sum bucket deltas across worker instances before computing percentiles.

```promql
histogram_quantile(0.95,
  sum by (le, mode) (rate(orbit_worker_phase_seconds_bucket{
    action="fleet_dispatch",phase="fact_load"
  }[1h]))
)
```

For the scheduler issue, inspect the count and sum for
`reason="barrier_no_progress",active_inputs="true"`. Compare with
`input_no_progress` and `poll_interval`. Active includes inputs whose results
are waiting to be joined. The scheduler can sleep concurrently with useful
work. Adding those seconds to phase durations double-counts overlapping time.

### Admission cohorts and a candidate SLO

A candidate worker objective is **99% of newly accepted foreground fleet
dispatches receive an authoritative terminal outcome within one second over a
rolling 28 days**. This threshold is proposed for evaluation. Keep machine
traffic, other actions, and API response/client confirmation objectives separate.

Export private application JSON records (one object per line) for
`command_admitted`, `worker_input_claimed`, and `worker_input_attempt` from
every API and worker. Include terminal and recovery records after the window
closes. Set `START_UTC` and `END_UTC` to UTC timestamps ending in `Z` for a
window covered by the instrumented release, then run the report:

```sh
node scripts/worker-latency.mjs "$START_UTC" "$END_UTC" fleet_dispatch < events.jsonl
```

The report selects by admission acknowledgement in the half-open interval and
joins by universe and input ID. It reports cumulative histogram buckets in
milliseconds, exact nearest-rank p50/p95/p99 and maximum for observed times by source and executor mode. Phase distributions use
the newly committed attempt per order. The worker Prometheus phase histograms also
include earlier attempts. Admission lock distributions use the fresh admission
record and can include orders with a missing terminal. INFO records cover fast and slow gameplay orders.
Scheduled inputs and presence have per-attempt INFO detail after 250 ms of
worker execution or logical lateness, and on nonterminal outcomes. Active
scheduler waits of at least 50 ms carry an INFO record. Faster waits remain in
the histogram. Input and worker IDs are confined to private logs.

For the candidate SLO, sum `within_1s` across **all** foreground mode groups
and divide by the sum of `admitted`, including the unknown-mode group. Each
new admission counts once across duplicate deliveries and retries. Timely
game-rule rejection counts as a timely resolution. Report applied, rejected,
missing-terminal and invalid-terminal-clock counts alongside latency. Missing terminal
evidence and invalid timing get no success credit. Reconcile fresh admission
counts by action/source with the API admission counters and durable receipts.
The report separately flags terminal records in the window whose admission is
absent from the export. Look back across the start boundary to distinguish an
earlier admission from a lost log.
An incomplete export, clock uncertainty near the threshold, or missing
admission evidence prevents certification of a complete SLO window.

### Production retention and collection

At the time of the investigation, production retained INFO gameplay admission
and terminal logs in its private gameplay log group (configured for 14 days),
host/database pressure metrics, due lag, blocked scopes, and allowlisted
auth/bootstrap/pool snapshots. The private endpoints also exposed cumulative
process-local runtime and HTTP histograms. A point-in-time scrape cannot
reconstruct their history. PostgreSQL commit timestamp tracking and statement
statistics were disabled in the investigated deployment.

The worker families and explicit acknowledgement fields require a release
containing this instrumentation. Existing INFO forwarding can carry the new
records after rollout. Verify ingestion from both roles, configured retention,
clock offsets, writer/collector drops, duplicates and restarts. The current
allowlisted metrics collection needs explicit coverage for these worker families
on every worker and fresh admission counters on every API. Retain reset-aware
bucket/count/sum deltas or joined, deduplicated cohorts and their coverage
evidence for at least 28 days plus the completion lookahead. A 14-day log
window alone cannot establish the proposed objective.

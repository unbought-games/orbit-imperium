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
`admission_commit` and `admission`. They are nested and can overlap: **do not add
them together**. Authentication timing covers the shared HTTP authentication helper;
not every specialized auth/bootstrap endpoint uses that helper. Pool waits are
observed checkouts, not every SQL round-trip. Ordering waits cover the existing
scope-stamp instrumentation; other lock/query time remains inside admission.
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

# Structured logging verification

Scope: logging bundle L01–L06, prepared against Orbit
`3e5540e1d9834ca45ecd007f853b3f793720431b`. No UI change; screenshots not applicable.
No deployment, merge, database migration, retention change or journal removal.
The infra companion owns host forwarding, retention, query/export and the private
coordinator handoff. Production acceptance remains pending.

## Implementation and shared integration

The callable API and semantics are documented in [logging](../operations/logging.md).
`application/game.rs` wraps the existing serial/scoped commit calls without changing
results/retries; it retains the journal implementation. Runtime and transport own
lifecycle, execution and HTTP summaries. Disabled debug does not format fields or
walk world facts. Logs select the first changed body's numeric values without its
name or any full-state serialization.

Narrow shared hunks requiring coordinator integration review:

- `storage-postgres/world.rs`: retain a static gameplay action name, then emit
  paired command/input mappings after admission acknowledgement. No persistence,
  whole-world loading or commit refactor.
- `server/analytics.rs` and `server/analytics/attribution.rs`: convert existing
  fixed-vocabulary diagnostic calls only. The concurrent activity-analytics bundle
  owns all delivery/reporting logic; reconcile these logging calls into its final
  implementation. No analytics functionality is changed here.

The next journal-independence bundle consumes `diagnostics::commit_result` and
preserves the acknowledgement/unknown distinctions. It must not use logs as a
replacement commit receipt. The coordinator owns integration and production gates.

## Checks

- Four thresholds and INFO default; invalid/trace/filter settings rejected;
  third-party targets suppressed; lazy DEBUG arguments not evaluated.
- Redaction at every threshold using secret-bearing command text/profile material,
  free-text invariant errors and blocked reasons; correlated IDs remain searchable.
- Expected game rejections stay debug decisions plus informational durable outcomes.
- Standard nonblocking writer tested with a deliberately blocked sink and a full
  buffer; callers finish and dropped-line counter increases.
- Metrics recorded at every threshold. Existing request-phase tests cover concurrent
  task-local isolation, route-template privacy and cancellation behavior.
- `cargo nextest run -p orbit-server -p orbit-transport-http -j 2`: 150 passed,
  33.238 seconds execution after 40.36 seconds preparation (before final sizing fixture).
- Final focused logging tests: 9 passed, 0.093 seconds execution (16.05 seconds preparation); sizing below.
- `cargo clippy -p orbit-server -p orbit-application -p orbit-transport-http
  -p orbit-storage-postgres --lib --bins --tests --features orbit-server/test-support
  -j 2 -- -D warnings`: passed, 44.29 seconds.
- `cargo fmt --all --check` and `git diff --check`: passed before submission.
- Required exact-head CI and review status are recorded in the PR and final handoff.
  Browser/database integration are left to required CI; no redundant local browser
  build/typecheck was launched on the shared machine.

Development failures were compilation feedback, not failing behavior tests: an
initial check overlapped the extraction of `command_action`; two new fixture names
(`Actor::System`, `PresenceCause::Navigation`) were corrected to existing enum
variants. No existing tests were deleted, weakened or retried to hide failures.

CI run `44102373661` at `0cbe7d8e` found a build integration defect in the new
change note: missing required YAML frontmatter stopped the news builder before
browser execution. Added the standard id/title/date metadata. `npm run news:build`
and the two `scripts/news.test.mjs` tests passed with the pinned Node 24.18.0 /
npm 11.16.0 before pushing the correction. No browser test changed.


## Representative volume

`logging::tests::representative_info_and_debug_volume` emits one synthetic minute:
60 gameplay actions, their paired foreground presence, engine/commit records and
seven HTTP responses per action (one submission plus six reads). It uses real
formatter/helper calls, synthetic UUIDs and the package-version release label.
This is a sizing scenario, not observed player traffic or a performance benchmark.

| Threshold | Events/min | JSON bytes/min | JSON MB/day at the same sustained rate |
| --- | ---: | ---: | ---: |
| INFO | 120 | 45,840 | 66.01 |
| DEBUG | 780 | 260,520 | 375.15 |

The fixture includes durable rejection receipts and their command IDs. Scheduled
work without a command receipt logs `completed`, never an inferred `applied`.
The official image identity adds bytes to every record; event framing adds more.
Budget a conservative additional 200 bytes per record for release identity and
service framing: about 101 MB/day INFO or 600 MB/day DEBUG for this scenario, before
publication/error/retry bursts. Fourteen days is about 1.41 GB/8.40 GB uncompressed;
actual retained/compressed/billed volume must be measured after commissioning.
Scheduled transitions and errors add records; presence/read-heavy traffic changes
the ratio. DEBUG remains enabled until explicitly changed.

## Remaining acceptance and rollback

The coordinator must verify actual API/worker env changes through recreation,
production INFO/debug retrieval, secret exclusion, ordinary latency and metrics,
real Docker rotation/replacement, collector restart/outage/saturation/recovery,
private CloudWatch permissions and 14-day retention, finite ingestion/cost and
protected evidence export/readback. Local tests do not establish these live facts.

Return to INFO by changing the environment and recreating normally. Application
rollback follows the existing release and schema compatibility rules. This change
adds no migration and does not alter or remove the existing journal. Retain selected
incident evidence and do not purge data as part of logging rollback.

## Review follow-up

Automated review correctly identified that the generic sanitized process exit
hid startup/supervision causes. Added `serve_phase_failed` records at configuration,
database, DNS, asset preparation, migration, compatibility, bind, timeout and task
boundaries. They preserve fixed stage/cause codes and typed I/O kinds while returning
the original error for control flow; raw error text remains excluded. Scheduler
store failures retain the safe StoreError category. The generic exit is now a
summary accompanied by these actionable records.

Fourteen focused logger/serving tests passed (13.77 s preparation, 0.090 s execution),
including safe cause/redaction checks and existing shutdown/guard behavior. Scoped
server Clippy with warnings denied passed (5.43 s). The prior nine logger tests
also cover the correction that receipt-less scheduled completion must not claim
an applied action; committed command receipts now carry their command ID in logs.

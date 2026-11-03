# Sensor Phalanx command backend — 2026-11-03

> Historical validation record for `5e0b4b8`. Its writer-exclusion blocker and
> scenario restriction are superseded by the [activation repair](sensor-phalanx-activation-repair.md).

Base: `af52565b4e334e2dde3ef63aa36f69d002ad4e63`.
Local branch: `emick/sensor-phalanx-command`.
Final source SHA-256:
`516493511812f41b1a8d16d2a264a19b720ef7d7df8e2738b1f8ecbe70ff1a89`.

The digest covers the 31 changed code/contract/test paths relative to the base,
including new files and excluding `docs/`. For sorted relative paths, hash path
bytes plus NUL, then `present` plus NUL, file bytes and NUL (or `deleted` plus NUL).
The manifest and all retained command logs are in ignored
`test-results/sensor-phalanx/command/`. The final focused database suite and Clippy
used this source; no implementation changes followed those checks. Core engine
and application code was unchanged during the later database-test additions.
The broader compatibility/migration/rules run preceded the final scan-admission
fence; that fence has its own final database test.

## Implemented boundary

The command reuses protocol-4 foreground admission, actor/body binding, ordered
execution, deduplication, atomic persistence and receipt recovery. A successful
scan spends 5,000 local deuterium and stores one recipient-only versioned report.
Its ID is the sole committed `result_ids` entry. Empty scans pay; rejected scans
produce no debit or report. Historical reads use existing recipient authorization,
pagination, retention and metadata handling. They do not refresh observation
contents or names; sharing remains unsupported.

Endpoint indexes select origin and destination ship traffic across owners,
including holds, plus destination missiles. Group membership lookup includes
initiators without `intent.attack_group`. Foreign origins load identity columns,
not foreign economies. The actor's normal economy closure supplies the source;
there is no universe-wide economy/fleet load per scan. Existing scopes order the
scan against its endpoints and owner policies, and commit reloads complete
candidate membership and absence. Private membership and revisions are not
serialized to the recipient or converted into target viewer updates.

Standard rules and construction remain disabled. The current runtime cannot
establish exclusion of incompatible writers; activation consequently refuses
with a private typed blocker. This is an explicit remaining integration blocker,
not an implemented attestation or a claim that live activation is ready. There is
no readiness bit, process registry, startup history traversal, backfill or new
fleet constraint. Migration 0033 stays absent; migration 0034 adds indexes only.
See the [activation and rollback guide](../operations/sensor-phalanx.md).

New scan admission refuses while disabled or after a deactivation barrier is
queued. Active and pending rules are read in one statement, after existing-ID
recovery and before persisting the new command. This prevents new vocabulary
from reaching incompatible workers during disabled deployment or rollback.
Prior admitted scans remain ordered before deactivation, and historical receipts
remain recoverable afterward. An external enforceable writer-exclusion boundary
is still required before activation can succeed.

## Validation and timing

- `make test-phalanx`: 227 engine and 88 application tests passed. Final Cargo
  preparation/startup: 0.07s and 0.16s; execution: 5.948s and 0.195s; wall: 7.24s.
  No build-lock wait occurred in this final core run.
- `make test-db DB_SUITES=phalanx DB_JOBS=1`: all 10 final PostgreSQL/application/
  HTTP tests passed. Preparation: 5.08s; native runner startup: 0.25s; execution:
  41.734s; wall including disposable database creation/cleanup: 49.76s. Remaining
  database/shell/reporting overhead was 2.70s and was not separately subdivided.
- `make test-db DB_SUITES='phalanx mission_return_reason migrations rules_updates'
  DB_JOBS=2`: 7 then-current scan tests, both legacy-writer compatibility tests,
  all 16 migration tests, and all 40 rules-update tests passed. Preparation:
  4.64s. Suite execution: 32.543s, 3.790s, 12.034s and 401.999s respectively;
  wall: 430.12s. Runner startup was 0.16–0.26s per binary. Cargo reported package
  cache lock waits during parallel runner startup; their individual durations
  were not separately measured. The final scan suite supersedes the earlier
  seven-test result with admission fencing, selective lookup and actual missile
  impact coverage. Each binary used an isolated disposable database and ran its
  tests serially.
- `cargo clippy --workspace --all-targets --features orbit-server/test-support
  -- -D warnings`: passed on final source; 2.11s Cargo / 2.23s wall.
- `make _static`: formatting, lint, generated contracts and workspace/browser
  boundaries passed in 11.16s. Final Rust formatting and `git diff --check`
  passed after the later Rust-only additions. No player-facing UI changed.

Database coverage includes serial/scoped competing scans with fuel for one,
duplicate and uncertain delivery, recipient/cross-epoch authorization,
immutable report/receipt recovery after movement, rename and reload, no target
viewer update, unknown hidden deployment refusal, hidden-versus-empty output,
rollback after writes, and recovery after an uncertain commit. Ordered recall,
same-time fleet arrival and actual same-time missile impact precede the applicable
scan. Deterministic mutations between load and commit exercise new/removed fleet
membership, ACS delay, hold extension and missile terminalization conflicts.
These injected mutations test snapshot revalidation; they are not a multi-process
ACS/depot stress test. Existing engine mission tests exercise the real transitions.

The lookup regression fixture contains 10,001 active records and verifies that
the real scan query returns only its one bound candidate using fewer than 100
shared buffers. Existing owner/incoming lookup checks remain passing. This is a
fixture-level selectivity check, not production-volume benchmarking.

Deployment tests retain actual old-format serde/full-record write compatibility,
startup with unknown causes and natural terminal settlement. Rules tests cover
stale proposals, claims, publication races, idempotent retry and rollback. Scan
activation cannot pass without writer exclusion, even for an empty/healthy
universe. Natural settlement resolves unknown-return blockers but cannot supply
the independently missing writer-exclusion proof.

## Failed attempts and repair record

No assertions, execution deadlines or retry policies were weakened; no tests were
deleted. Four test runs failed during implementation, each with an explained
single repair:

1. The new empty-scan engine test reached `RulesError::InvalidReference`: custom
   Sensor Phalanx building definitions were absent from the supported building
   allowlist. Adding definition support repaired it; standard construction remains
   disabled. The new test had no prior history.
2. The new group/hold/missile loader test compared deadlines to the wrong JSON
   representation. Inspection of the existing tagged enum showed `{kind, at}`.
   The assertions and OpenAPI schema were corrected together; the repaired test
   passed. It had no prior history.
3. The existing return compatibility test rejects any migration numbered 0033.
   Its history (`fe5e869`, `a5a5f11`) records removal of the unpublished causal
   migration. The new index migration was moved to 0034; the existing assertion
   remains unchanged and passes.
4. The existing migration selectivity test observed 196 buffers for an owner
   lookup, above its unchanged limit of 100. EXPLAIN showed the new destination
   index being used as a broad universe-only active-fleet scan. Endpoint-presence
   partial predicates exclude these indexes from unrelated owner/incoming plans,
   while bound endpoint equality implies the predicates for scans. The repaired
   existing test passes, and the new 10,001-record scan test verifies its intended
   access path. All three new endpoint indexes received the same restriction.

The repository history and available performance-audit records were inspected;
the separate owner Test Czar ledger was not available, consistent with the
existing audit's note. This is the local repair record. Three preparation calls
also failed: one workspace check omitted the required test-support feature, and
two new-test compilations used an incorrect method/enum name or moved through a
snapshot dereference. Corrected invocations/types compiled without suppressions.
Earlier successful runs were repeated only as implementation or coverage changed.
One earlier core run waited on a concurrent Clippy build lock; the final core run
above avoided it. Failed broad database attempts and their completed sibling
suites are retained in the logs rather than counted as successful full runs.

## Environment, cleanup and limits

PostgreSQL used the repository-pinned 16.10 image in the dedicated Compose project
`orbit-phalanx-command`, port 55439. Initial setup found an overlapping Docker
subnet; an unused explicit subnet was selected without altering other networks.
Successful image/container startup was not separately timed. Test scripts removed
every disposable database, verified with an empty `orbit_test_%` inventory at
completion. The dedicated container, network and volume were removed; cleanup
wall time was 0.34s. Other services were unchanged.

No production data/access/deployment, full-system or rolling-container acceptance,
browser test, image hosting, push, PR, merge or scheduled monitor was performed.
Queue removals and merge delay are not applicable. The originating integration
checkout was not modified.

Part 3 must first resolve the documented writer-exclusion blocker, then enable
standard lunar construction/rules, implement the explicit paid scan UI and
immutable report rendering, and perform desktop/mobile visual validation. Use
the committed report ID directly. Do not infer it from an inbox refresh, add live
observation queries, or treat route refresh as a paid action.

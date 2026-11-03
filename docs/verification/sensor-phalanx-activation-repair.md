# Sensor Phalanx activation repair — 2026-11-03

Base: `5e0b4b87ee9df77fd8496e923397046b8c6b02de`.
Branch: `emick/sensor-phalanx-command`.
Tested source SHA-256:
`56655d1174705c75fa1ed1c7c9b67657cab4d3b0b6331548dee4d5870f8a5622`.

The digest covers the ten changed source/test paths relative to the base, excluding
documentation. For each sorted path, hash its bytes plus NUL, `present` plus NUL,
file bytes and NUL (or `deleted` plus NUL). The source manifest and logs are retained
locally in ignored `test-results/sensor-phalanx/activation-repair/`. No source
changes followed final focused database validation and Clippy. The original
[command validation record](sensor-phalanx-command.md) remains historical; this
repair supersedes its permanent activation blocker and enabled-scenario restriction.

## Corrected deployment contract

The authoritative [rules rollout](../operations/rules-updates.md#official-production-rollout)
and [runtime operations](../operations/concurrent-runtime.md) already assign
binary-rollout completion to deployment tooling/operator. After updating every
API, worker and operator, use that same image's normal rules upgrade. The game
does not attest replica versions or database credential exclusion. This repair
removes `LegacyWritersMayWrite`, its readiness argument, the unconditional preview
rejection and the hardcoded false activation proof. It adds no registry, checkbox,
override, credential procedure or orchestration service.

The backend now activates successfully through existing serial and scoped rules
prepare/apply. Standard content, construction and player UI remain disabled until
part 3. All paid-scan test fixtures now activate custom rules through the public
operator `RulesService` prepare/apply path rather than inserting the active rules
with SQL. Fabricated moon/asset facts remain explicit disposable test data.

The readiness validator checks actual complete active fleet membership and return
facts. Serial publication uses the universe fence. Scoped apply checks before
queuing and rechecks independently after earlier inputs finish at the publication
boundary. A preview is not a saved readiness approval. Unknown active returning
Deploy rejects with a concise message to keep workers running until it settles,
then retry normal rules activation. Natural settlement preserves committed terms,
deadlines and omitted causes; terminal unknowns need no classification.

If an earlier input creates a blocker after scoped queuing, publication retains a
private `PhalanxRejected` outcome and marks that boundary done with rules unchanged.
This is necessary to let later return events settle: a failed proposal must not
permanently obstruct its own prerequisite. The ordinary rules caller receives the
typed rejection, and workers can continue. Retry after natural settlement uses the
normal rules path. Existing stale-revision and original-receipt behavior remains.

Disabled and pending-deactivation admission gates remain. Earlier paid claims can
commit before deactivation; no new scan vocabulary is admitted after its boundary
is queued. Historical receipts still recover after deactivation. Scan-time unknown
return refusal remains generic, atomic, without partial rows, debit or report.

## Enabled scenarios

The unconditional enabled-artifact rejection in `world_edit::install_rules` is
removed. Create/replace installs rules and performs all edits as before; final
complete return facts are validated before commit under the existing exclusive
world-edit transaction. The same final guard protects edits of an enabled world.
Patch rules-change restrictions remain unchanged.

A new planet-only scenario test creates an enabled world, exports it, and replaces
it directly from that export, preserving enabled rules and exported asset data.
No rules-file surgery or subsequent activation command is needed. Existing moon
and active Deploy/Hold export limitations are respected, not expanded. Another
test retains an actual unknown deployment return, attempts a supported scenario
write, verifies rollback of the account and edit receipt, then succeeds with the
same operation after natural settlement. This exercises the final-state guard;
the current scenario format itself cannot fabricate an unknown returning Deploy.

## Migration review

Migration 0034 is unchanged, including its checksum. Its three endpoint indexes
use the existing transactional index pattern; their presence predicates retain
the selective owner/incoming plans checked by migration tests. It adds no fleet
constraint or history traversal. Removed migration 0033 remains absent.

Ordinary preparation bounds remain 10 seconds overall, 5 seconds per statement
and 1 second for DDL locks, with the existing bounded SQLx coordination wait.
There is no new manual index-preparation requirement, prebuilt-index gate or
raised timeout. The populated-table migration fixtures and scan selectivity check
pass under the existing implementation. Production-size index build time and lock
contention have not been measured; a large/busy deployment may fail those bounds
and must be diagnosed through the normal schema-preparation process. No claim of
unbounded or zero-lock startup is made.

## Validation

- `make test-phalanx`: 227 engine and 88 application tests passed. Preparation:
  6.03s and 8.86s; execution: 5.534s and 0.189s; total wall: 26.47s.
- `make test-db DB_SUITES='phalanx mission_return_reason migrations' DB_JOBS=2`:
  all 12 then-current phalanx tests, both legacy-writer compatibility tests and all
  16 migration tests passed. Preparation: 19.86s; execution: 56.366s, 3.843s and
  11.709s; total wall including database setup/cleanup: 81.17s. Native runner
  startup: 0.16–0.35s. Cargo reported package/build-lock waits; individual wait
  durations were not separately instrumented.
- After the scenario review correction, final `make test-db DB_SUITES=phalanx
  DB_JOBS=1`: all 14 tests passed. Preparation: 2.23s; runner startup: 0.15s;
  execution: 65.738s; total wall including disposable database setup/cleanup:
  70.26s. This supersedes the earlier twelve-test result.
- `make test-persistence-db test-rules-impact-db`: four focused historical/claim
  tests and five rules-publication/rollback tests passed. Execution: 5.126s and
  12.498s; Cargo preparation/startup: 17.17s (including a reported build-lock wait)
  and 0.16s; total wall: 37.33s. These existing focused selections skip unrelated
  content suites rather than repeating the previous full rules test run.
- `make _static`: formatting, lint, contracts and boundaries passed in 11.35s.
  Final Rust formatting and `git diff --check` passed after the later Rust-only
  scenario changes.
- Final workspace/all-targets Clippy with `orbit-server/test-support` and warnings
  denied passed: 8.86s Cargo / 8.96s wall.

The new activation tests cover both serial and scoped successful publication,
original-proposal retry, unknown-return refusal followed by natural-settlement
success, stale preparation, and a queued scoped publication whose earlier recall
loses its return cause through simulated old-format field loss. The latter checks
that publication revalidates, persists rejection, releases the boundary and later
activates normally. Existing paid-command, authorization, membership, deactivation,
rollback, receipt and HTTP tests continue passing.

One new scenario rollback test initially failed before reaching the new guard:
the existing resource editor counts the fixture's moon toward colony capacity,
so its resource edit returned `Astrophysics is too low for existing colonies`.
Git history and the available Test Czar/performance-audit record were inspected;
no separate owner ledger was available. The single repair used a supported
add-player scenario write, retained the test name and atomic-rollback assertions,
and passed. The unrelated resource-editor behavior was not changed. This is the
local repair record. No assertions/timeouts were weakened, no tests were deleted,
and no green retry was used to dismiss a failure. Obsolete writer-attestation
expectations were replaced as the requested contract correction, not as a test
stabilization measure.

## Cleanup and limits

The dedicated Compose project `orbit-phalanx-repair` used the repository-pinned
PostgreSQL 16.10 image, port 55439 and an explicit unused subnet. Setup took 3.02s.
Each database binary used its own disposable database with serial tests. An empty
`orbit_test_%` inventory confirmed database cleanup; the dedicated container,
network and volume were removed in 0.30s. Other services were unchanged.

No production access, deployment, browser/full-system/rolling-container test,
push, PR or merge occurred. Queue/merge delay is not applicable. The integration
checkout was not modified. Part 3 can proceed with standard content and UI using
the established deployment/activation flow; no writer-attestation project remains.

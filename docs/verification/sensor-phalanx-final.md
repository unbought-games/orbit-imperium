# Sensor Phalanx final integration validation — 2026-11-03

Final source revision: `9ebb8f48f612d5e632c238c58e9b90d826c60983`.
Part 3 was integrated from `1427ff5e0a5a18596cb5fd2cd331ac6ac92bd588`.
Main's bulk-report-read change `25d0db7` was merged because it intersects the
command/report paths. Both independent test additions and contract checks were
preserved when resolving the two append conflicts.

## Passing validation

- Tooling: 122 passed, one existing explicit-only Docker isolation check skipped;
  total 14.921s. Frontend: 1,318 tests across 137 files passed in 5.22s.
- Native full suite: 704 passed in 25.243s, bridge suite 46 passed in 0.863s,
  storage unit checks seven passed in 0.014s. Successful `make _server` wall time
  was 29.77s after initial preparation. Following the equivalent single-element
  catalog-loop cleanup, final `make test-phalanx` passed 231 engine and 88
  application checks, including historical replay: execution 4.296s/0.165s,
  preparation 23.62s/11.54s, wall time 46.72s including build-lock waiting.
- PostgreSQL: 13 retained phalanx/HTTP tests passed in 64.245s and both legacy
  writer compatibility checks passed in 3.595s. Final moon-constraint check passed
  in 1.154s, all 16 migrations in 12.126s, and all 40 rules updates in 364.966s.
  The final three-suite Make run took 390.18s, including preparation (15.34s),
  runner startup/build waits, disposable database creation and cleanup. Make owned
  two-way concurrency and each binary ran serially in its own database.
- Workspace/all-targets Clippy with test support and warnings denied passed:
  36.89s Cargo, 37.02s wall. Static formatting/lint/contracts/boundaries passed
  in 21.47s; final Rust formatting and whitespace checks passed after test edits.
- Production web build passed in 13.70s, including 3.84s Vite and 0.383s SSR builds.
- Browser fixtures: explicit scan, receipt navigation, historical reload and
  facility rendering passed at 1440×900 and 390×900; two tests, 5.9s runner and
  10.90s wall including module preparation. Fresh full-page captures of facility,
  scan confirmation and historical report at both viewport sizes were inspected
  and displayed in the originating integration chat. No subsequent UI changes
  occurred. Images are local, not PR attachments.

Local logs and captures are retained under ignored `test-results/`; this is not
full-system or production rollout validation. Setup and execution are reported
separately where measured. Concurrent Cargo cache/build waits appeared in logs;
their individual durations were not instrumented and remain included in wall time.

## Failures, repairs and retired coverage

The initial `make check` failed after 542 native passes because the archived
storage-capacity journal used current output serialization instead of its
pre-return-cause replay adapter. History (`298608c`) and the available repair
records were checked. The single repair explicitly selects the existing legacy
mission replay adapter, preserving exact archived assertions and restart fences.
The replay binary is now part of `make test-phalanx`. The complete native rerun
and final focused run passed. Initial failed-check wall time was 218.27s.

Standard activation exposed a shared fixture assumption: phalanx database setup
expected `Applied` even though fresh standard rules now already enabled it.
The fixture now explicitly establishes disabled rules before testing publication,
preserving the `Applied` assertion for every caller. The caller audit also updated
the fusion upgrade's exact building list to include Sensor Phalanx. Its running
pre-edit binary failed on the old expected list; the final 40-test run passed.

Two previously repaired expensive scenarios were retired under AGENTS.md:

- `enabled_scenario_final_return_check_rolls_back_all_edits_on_unknown_return`
  had its prior resource-editor fixture repair recorded in
  `sensor-phalanx-activation-repair.md`; this run failed again in shared setup.
  It was removed, not renamed or stabilized again. Retained coverage includes
  pure unknown-return readiness, serial/scoped unknown-return activation and
  natural settlement, scan atomic rollback, enabled scenario export/load, and
  existing world-editor transaction rollback checks.
- `simultaneous_battles_create_one_moon_with_atomic_restart_and_view_delivery`
  aborted again with stack overflow. Commit `34c36a1` and the moon-fleet plan
  record its earlier stack-overflow repair. The accumulated full moon journey and
  its private helpers were removed instead of adding more boxing or stack limits.
  The database binary now has a small, distinct relational test of coordinate/kind
  uniqueness, parent uniqueness, foreign keys, partial-insert rollback, unchanged
  planetary rows and reopened genesis reads. Engine moon creation, same-time
  battle/replay, lunar fleet, holding and progression tests remain. No full-game
  journey has been recreated under a different name.

The first database command failed at fixture setup after 0/14 phalanx tests;
both compatibility tests passed. Its wall time was 61.34s. The next command passed
all 13 retained phalanx checks, hit the moon stack overflow, and failed the
pre-edit fusion expectation (15/40 rules tests passed); wall time was 189.06s.
Failed partial runs are not counted as successful whole runs.

Clippy also rejected the now-single-element Jump Gate placeholder loop. Replaced
it with the identical direct catalog entry; no lint suppression or gameplay change.
The first failed Clippy run took 22.10s. Final Clippy passed. No test assertions,
timeouts, retries, protection rules or execution limits were weakened. The
available repository history and repair records were inspected; no separate
external Test Czar ledger was available. This document records the caller audit,
removals and retained protection.

## Cleanup and delivery

PostgreSQL used pinned 16.10 in dedicated Compose project `orbit-phalanx-final`,
port 55439 and an unused explicit subnet. Setup took 2.91s. The runner dropped
each disposable database; an empty `orbit_test_%` inventory was verified before
removing the project's container, volume and network. Other services were unchanged.
Browser fixtures closed their Vite/browser processes. No production data or
deployment was involved. PR/queue validation and merge timing are recorded in
the originating chat after this local verification record.

## First PR CI revision

PR #327 head `32bdd0787510bab3150d4950ac101df96829f9f3`, run
`41718588991`: native checks, all eight browser shards, rules PostgreSQL and
world-editor PostgreSQL passed. The remaining PostgreSQL group stopped on a
Linux stack overflow in
`holding_supply_combat_scope_growth_and_durable_retries_in_both_runtimes`
(job `126205315518`, 6.872s before SIGABRT). No queue enrollment had occurred.

The test history (`b5cd9cc`, `bc93670`, `5b529e4`) and vacation verification record
were inspected. Its previous fixture repair is documented in
`docs/verification/vacation.md` (command/input identity corrections). Under the
one-repair policy the combined journey and its private social/launch helpers were
removed, not boxed or given another stabilization patch. The shared drain/binding/
command helpers remain for the independent vacation persistence regression.

Retained deterministic holding coverage includes launch fuel, owner/cargo/slot
preservation, original return commitments, supply budgets and rounding, stale
events, combat participants, host blocks, and lunar parent-depot separation in
`crates/engine/tests/missions/holding.rs`. The phalanx database suite covers held
deadline projection and changed hold membership revalidation. Existing group
database checks cover participant scope expansion; they passed in the failed
group before its remaining running binaries completed. No production behavior
changed in this repair.

The retained `holding` database binary passed locally (one test, 1.947s execution,
6.82s wall); focused all-warning Clippy passed in 15.00s wall. This repair reused
only the dedicated disposable Compose project and cleaned it up afterward. A
new PR revision must pass CI; the earlier group's partial result is not success.

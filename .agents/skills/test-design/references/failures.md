# Classify a failure before acting

Record repository/SHA, workflow run, attempt, job, failing step and test name.
Keep original attempts visible even when the latest attempt is green. Inspect
logs, traces or other retained diagnostics before changing code.

| Classification | Evidence | Response |
|---|---|---|
| Product regression | Intended behavior is violated by production code with valid inputs | Fix the product; retain or improve regression coverage. |
| Test/fixture defect | Wrong fixture, missed delivery boundary, uncontrolled ordering, incorrect expected result, unsupported timing assumption | Check history and apply the one-repair policy; audit shared callers. |
| Infrastructure incident | Evidenced runner failure, GitHub internal error, unavailable package/artifact service, or another failure outside the test contract | Preserve evidence; retry affected work when appropriate and authorized. No test repair is consumed. |
| Cancelled or superseded | New revision, queue change, explicit cancellation or dependency cancellation ended work | Record incomplete validation and the reason; investigate preceding failures separately. |
| Unclassified | Insufficient evidence to distinguish the above | State uncertainty, inspect more evidence, and keep validation incomplete. Do not retry instead of diagnosing. |

An aggregate gate reporting `abandoned`, `skipped`, or missing outputs describes
its dependency state. Inspect upstream jobs and attempts before assigning cause.
A reported GitHub outage does not automatically explain an assertion on a runner
that continued executing normally. A runner terminated during a test does not
prove that test is faulty.

For suspected hangs, identify the outstanding test/action and pending operation.
The last completed test in a concurrent log is not necessarily the hung test.
Do not infer a stuck assertion from silence alone. Capture available evidence
before task-scoped cancellation and resource cleanup.

## Repair history and disposition

Inspect Git history, the repository [repair ledger](../../../../docs/runbooks/test-performance-audit.md),
and relevant feature verification records. If a separate owner ledger is not
available, record that limitation; it does not prove there was no earlier repair.
Do not reset the repair count by renaming, moving or parametrizing a scenario.

For a defective test, the repository permits one explained repair. If inspection
cannot explain its test failure, or it fails again after repair, remove it under
AGENTS.md. Preserve worthwhile invariants in deterministic coverage and record
exactly what browser protection is lost. Do not recreate the removed browser
journey under another name. A shared harness fix does not silently reset the
repair history of affected scenarios.

A passing unchanged retry establishes inconsistent outcomes, not their cause.
Count test failures separately from infrastructure incidents, cancelled work,
queue removals and rerun attempts. Report setup, execution and runner wait
separately where available. GitHub may carry successful jobs into a rerun's
result; do not count carried results as newly executed work or sum their duration
twice. Do not call every failed run a flaky test.

For an infrastructure retry, preserve original evidence, identify the condition
being retried, and prefer failed jobs when prerequisites remain valid. If GitHub
lost prerequisite outputs, a full rerun may be necessary. Check the new attempt
and stop on success or renewed failure requiring diagnosis; never create a
rerun-until-green loop or bypass required checks.

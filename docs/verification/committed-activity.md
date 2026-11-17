# Committed activity verification

Implementation branch: feat/committed-activity, based on
3e5540e1d9834ca45ecd007f853b3f793720431b. No UI changes.

Scope: admission-scoped collection policy, a minimal commit hook, additive schema,
existing outbox throughput/ack handling, bounded historical migration tools and the
[activity contract](../analytics/committed-activity.md). No journal removal,
command retry/expiry change, command cleanup or production operation.

Local checks on this implementation:

- `cargo check -p orbit-server -j 2`: passed (61 seconds including dependency checks).
- `CARGO_BUILD_JOBS=2 cargo clippy -p orbit-server -p orbit-storage-postgres --all-targets --features orbit-server/test-support -- -D warnings`: passed.
- `TEST_DATABASE_URL=<disposable> CARGO_BUILD_JOBS=2 cargo nextest run -p orbit-storage-postgres --features test-support --test analytics --test-threads=1`: 3 passed, 2.506 seconds execution after 4.50 seconds build. Real admission/commit, pre-commit rollback, lost-ack retry, 206 facts without the optional daily cap, 100-day outage retention and preference/unknown gaps are covered.
- `python3 -m unittest discover -s scripts/activity -p 'test_*.py'`: 6 passed. Stable envelopes, unknown/refused historical policy, bounded extraction/resume, bounded disk-backed resumable exact-key reconciliation and HTTP lost-ack/resumed delivery with 205 facts.
- Formatting and diff whitespace checks passed. Required PR CI is tracked in the originating chat; full local/browser validation was not duplicated.

Initial failures: a gap-path PL/pgSQL variable shadowed a conflict-key column; the
implementation was corrected and the same PostgreSQL fixture passed. Clippy found
an item after a test module; it was moved. Docker Compose setup could not allocate
a network because the host's address pools were exhausted. No other task's
resources were removed. Tests instead used an isolated database in this task's
disposable PostgreSQL container. An initial nextest invocation supplied conflicting
thread flags and executed no tests; the corrected invocation passed.

Private cross-repository CMO acceptance tests compare frozen old baseline and
completed-week queries against the actual activity projection. Their synthetic
fixtures cover exclusions, all actions, other universes/epochs, exact cutoff and
return boundaries, delayed delivery and backfill/live overlap. They pass and remain
stable after fixture command deletion. This is local parity evidence, not live
historical reconciliation or permission to purge commands.

Production state: not deployed, no migration/backfill/analytics write/source-view
activation/retention change/purge performed. Historical command history remains
required until the operator completes live reconciliation and the independent
receipt/client/stream/dependency gates in the activity contract.

# Journal-independent execution and removal

The bridge stops reading and writing `transition_journal`. Immutable admitted
`commands.input` / `scheduled_events.input` plus terminal state identify a retry;
commands return their original receipt. Cancelled events are not completed work.
Current state, terminal outcomes, committed-activity capture, game updates and
other delivery obligations still commit atomically. Both serial and scoped
execution retain their fences, claims and accepted scheduled deadlines.

The bridge release (PR #451) deliberately does not drop the table and runs with
the relation present or absent. The separate removal release adds migration 0051.
Deploy that removal release only after every writer is on the verified bridge.
Fresh installations apply the published CREATE followed by the forward DROP and
finish without the journal. There is no replacement full-state history.

Request IDs, acceptance, receipts, scheduled events and cleanup are unchanged.
There is no UUIDv7 requirement or 15-minute expiry in this bridge. Retained
terminal rows must not be purged until the separately reviewed request-window,
delivery, analytics and cleanup contracts are active. Delivered human-action
outbox retention is a separate cleanup workstream. Active growth reports remain
on command history until their explicitly accepted analytics cutover.

## Deployment and separate forward migration

The release coordinator owns activation and final removal. This document is a
review packet, not authorization to run production SQL.

1. Review and integrate logging, committed activity and this bridge. Pin the
   tested release and immutable image digest. Verify migration numbering against
   current main before building. In this integration, the **unpublished** activity
   migration moved from `0048_committed_activity.sql` to
   `0050_committed_activity.sql`, byte-for-byte, because published main uses 0048
   and 0049 for ship appearance. Do not apply the old activity bundle at version
   0048. Never renumber or edit a migration already applied to a retained database.
2. Deploy the bridge to **every** API, worker, CLI/maintenance writer and standby
   that can reconnect. Finish draining the old release; verify actual processes
   and image digests, remove restart/rollback paths that could launch old writers,
   and exclude old-writer credentials where applicable. A healthy new replica does
   not prove all old writers are gone. Commission info-default logging, its finite
   collector retention, metrics and committed-activity delivery independently.
3. While the table still exists, verify real admissions, terminal receipts,
   accepted scheduled work, state effects, reconnect delivery and restart/retry.
   Verify the retired table receives no writes. Re-run the dependency inventory
   and catalog preflight at the actual cutover revision: inbound foreign keys,
   views/materialized views, triggers, functions, policies, publications and grants.
   November 16 measurements are historical evidence, not current health.
4. Prepare a **separate reviewed forward SQLx migration** at the next unused
   version after the final integrated bundle (0051 in the removal release). Preserve all published SQL and checksums. Its removal statement is:

   ```sql
   DROP TABLE transition_journal RESTRICT;
   ```

   Do not use CASCADE, a preceding TRUNCATE, receipt cleanup, or a replacement
   journal. Rehearse that exact bundle against populated disposable pre-removal
   state and a fresh install. Verify the SQLx ledger/checksums, retained rows,
   post-drop startup, retry and scheduled work. Then apply through the separately
   authorized migration/deployment process **after** the bridge rollout. The
   migration must not be included in the first bridge's automatic startup bundle.
5. Verify table, owned indexes, row type and TOAST relation absence using their
   preflight OIDs; verify retained-state invariants and real runtime operations.
   Record reclaimed relation storage separately from RDS allocated storage, which
   does not automatically shrink. Backups keep their existing lifecycle.

## Rollback boundaries

Before the first bridge commit, normal compatible-binary rollback applies while
its required schema remains. Once bridge commits have occurred, old binaries
cannot use journal rows to identify those completions: retain a bridge-capable
rollback build even while the empty/retained table still exists. Do not infer
retry safety from recreating a table. After DROP, any journal-dependent binary
is explicitly incompatible. Binary rollback is limited to reviewed bridge-capable
versions with compatible migration-history handling. Disaster restore requires a
consistent database backup and matching binary, with the coordinator accounting
for lost later writes; it is not a table recreation or forward-history replay.

## Offline evidence and diagnostic retention

Frozen input/facts/outcome fixtures and historical hash adapters remain supported
as **supplied artifacts**. Keep their producing release, rules, original bytes,
checksums and trusted provenance. New continuous snapshots are not generated.
Ordinary info/debug logs are finite, may be suppressed or lost, and cannot prove
commit completion, drive retry decisions, replace analytics, or reproduce full
historical state. Legacy unknown mission returns normally settle through current
state; optional repair requires a previously captured complete trusted artifact.
Current vacation policy remains authoritative; indefinite vacation history is no
longer promised. Supported old live formats and immutable accepted terms remain.

## Capacity fixture v2

`make qualify-runtime` remains isolated to disposable loopback databases. Specify
`QUALIFY_ASSET_LOTS` per active player and `QUALIFY_HISTORY_ROWS` completed
command/event pairs. Half the synthetic terminal population is recent and half
is older backlog; this models pressure, not an implemented expiry/cleanup policy.
The fixture verifies terminal receipts, action/operation counts and completed
building levels with the journal absent. It exercises mature inventory lineage
rather than filling an unrelated journal with empty JSON.

Output `workload_version: 2` reports live-state relation bytes, completed-operation
relation bytes, recent completed payload bytes and older backlog payload bytes.
Relation measurements include indexes/TOAST and are not additive to payload bytes.
The direct-service harness installs no diagnostic subscriber: `emitted_log_bytes`
is zero, not a production log-volume estimate. Use the logging commissioning
procedure for real emitted/ingested volume. Old evidence JSON remains unchanged;
its synthetic-journal workload cannot establish this workload's operating envelope.

# Sensor Phalanx deployment and activation

The command backend is implemented, but live activation is blocked. Standard
rules omit `world.phalanx`, and standard Sensor Phalanx construction remains
disabled. New scan admission rejects while disabled, so ordinary mixed-version
workers never receive this new command vocabulary. Historical receipt recovery
runs before that admission gate. This release can be deployed through the ordinary rolling process.
It requires no fleet drain, historical journal scan, return-cause backfill, or
classification of unknown active deployment returns.

Migration `0034_phalanx_endpoint_indexes` adds candidate indexes for active ship
origins, ship destinations, and missile destinations. It adds no data constraint
and changes no fleet JSON. Index creation uses the normal transactional migration
path; schedule schema preparation with the usual write-lock allowance. Its
production build time has not been measured. The unpublished causal migration 0033 remains absent; its number is not reused.

Old full-record fleet writers remain compatible while scans are disabled. They
can erase `return_reason` or create unknown returns. New workers settle these
returns at their existing deadlines; terminal unknown returns need no repair.

## Why activation currently refuses

The existing universe gate, scoped claims, runtime generation, world-edit gate,
and durable rules barriers order work and fence claims. They cannot prove that
all incompatible admission/API processes, editors, tools, and rollback binaries
have lost database write access or cannot reacquire work. No process registry,
operator checkbox, or stored derived readiness flag has been introduced.

Rules preparation reports `PhalanxActivationBlocked(LegacyWritersMayWrite)`.
Serial apply independently checks at the publication boundary. Scoped apply
refuses before creating an unfulfillable barrier; queued barrier publication also
independently checks. The publication check loads complete active fleet membership
under the existing boundary and invokes the readiness validator with writer
exclusion **unproven**. A healthy worker or an empty fleet collection does not
change this result. Scenario rules installation cannot bypass the boundary.

An enforceable writer-exclusion contract is therefore an explicit integration
blocker before enabling standard rules. Do not enable the feature with direct
SQL or edited startup data. Disposable tests install custom rules directly to
exercise the command; that fixture technique is not an operator activation path.

When exclusion is enforceable, activation must still rederive complete membership
under the apply barrier, wait for/fence outstanding claims using existing runtime
controls, and check every active deployment return. Unknown returns block
activation until natural settlement, or a separately authorized repair with
conclusive Applied journal evidence. The existing pure classifier is read-only;
this release adds no repair service and performs no automatic history traversal.
Prepare output is advisory and must never replace the apply-time check.

## Deactivation and rollback

Remove `world.phalanx` through the existing rules export/prepare/apply workflow.
Wait for the actual `Applied` outcome (a durable pending barrier is not success),
and verify the active rules revision. A scan ordered before deactivation may
complete and charge normally. Admission refuses new scans as soon as a
deactivation barrier is queued, and reads active/queued rules atomically to close
the publication race; later scans reject without charging. The boundary
must complete and old claims must be fenced before incompatible writers or tools
are admitted. Rolling back while scans are enabled is unsupported even if the
older binary can read other saved JSON. Keep historical reports and receipts;
deactivation does not reinterpret or delete them.

## Paid observation contract

Clients submit `WorldAction::ScanPlanet { source_moon, target_planet }` through the
protocol-4 foreground command pair, with the presence body bound to the source
moon. IDs are stable body identities; coordinates do not resolve or replace them.
There is no live scan query and navigation or report refresh never scans.

A committed receipt has exactly one `result_ids` entry: the recipient-only report
ID. Fetch it through the existing authenticated report-detail API. An uncertain
submission recovers that same receipt by command ID. Reopening it is free and
historical; a new paid observation requires a new command ID. Pagination,
retention, read/hide/star preferences, and recipient authorization use the existing
report store. Scan payload sharing is unsupported. Names in observation rows are
historical snapshots and are not enriched from current account names on reopen.

Relevant unknown return facts reject the complete scan as `UnavailableContent`,
without a debit, report, partial rows, or fleet-dependent player diagnostic.
Operators can inspect the private retained facts with existing tools; do not
publish those facts or infer a return cause from timing or reports.

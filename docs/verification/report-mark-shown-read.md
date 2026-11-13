# Mark shown reports read — November 12, 2026

## Scope and root cause

Base revision: `3040d3fccd1ab74bc15b3f0bab066dc4ce6f3f57`; validation includes
the uncommitted changes in this checkout. No production access or deployment.

The former action fetched every report, including already-read and archived
history, in pages of 50. It then submitted every unread UUID in one gameplay
command. The command's 16 KiB body limit is exceeded at 400 UUIDs with the
current foreground envelope. A local reproduction made 100 page requests for
5,000 reports before the oversized command, left all reports unread on a 413,
and retained an uncertain action. This establishes the defect in source; the
original player's specific request trace was not captured.

The owner confirmed that “current page” means the already-loaded filtered list,
not just the rows inside the viewport. The HUD action uses only report entries
actually rendered in its locally paginated list, excluding messages and fleets.

## Implementation

- The client sends the IDs shown when clicked to `POST /api/v4/universes/{id}/reports/read`.
  It never retrieves more pages to construct the mutation and does not decide
  which reports need a database update. The label is **Mark shown as read**.
- The application verifies the principal and request bounds. The database checks
  the binding, locks all requested recipient rows in report-ID order, rejects a
  mixed unauthorized selection atomically, and sets `read=true` in one SQL update.
- Stars, archive flags, shared links, other recipients, and unselected reports
  remain unchanged. The transaction advances the viewer revision and publishes
  an invalidation only when read state changes. Already-read selections are safe
  to repeat. Existing bot admission/accounting and receipt conventions apply.
- The response contains committed authoritative headers. The client rejects
  incomplete or wrong-context responses and merges headers by revision, then
  refreshes counts and list membership. There is no speculative read state or
  durable gameplay action for this UI operation.
- The dedicated request accepts up to 10,000 IDs with a 512 KiB body limit. Other
  routes retain their existing limits. No schema migration is required.

## Coverage and validation

- `report-reads.test.ts`: real coordinator/HTTP adapter, a 5,000-item displayed
  selection with exactly one mutation, no history requests, committed-only UI
  state, deduplication, empty selection, failure, incomplete confirmation,
  context loss, and delayed responses versus newer preferences.
- PostgreSQL `report_reads`: actual HTTP router and disposable database; CSRF,
  foreign bindings/epochs, mixed authorized/foreign IDs, empty/oversized input,
  50-item and 5,000-item selections, unchanged other recipients and unloaded
  history, preserved flags/shares, retry idempotency, cross-tab invalidation,
  and explicitly ordered concurrent archive/star writes.
- Existing PostgreSQL `report_sharing` retains compatibility coverage for legacy
  gameplay read/archive/star commands and concurrent sharing.
- Six fixture browser cases cover Reports and HUD at 1280×900 and 390×900,
  loaded-list membership, the unread badge, active filters and archive folder,
  rejected writes and a successful explicit retry. Pending confirmation is held
  at the response boundary to verify the disabled control and unchanged rows.
- Final focused client run: 107 tests passed in 919 ms. Client typecheck, ESLint,
  focused Prettier check, Rust formatting, generated-contract checks, dependency
  boundary checks, and Clippy for the three changed libraries passed.
- Initial native preparation took 50.71 s. Database suites passed in 3.883 s
  (`report_reads`) and 8.436 s (`report_sharing`), with no runner allocation wait.
- Six browser cases passed in 18.0 s after 5.351 s bundle preparation. Desktop
  and mobile action, success, filter/error, archive, and pending screenshots were
  inspected. Screenshot files are local `test-results/reports-*.png` artifacts.
- After adding the known-foreign-report authorization case, the affected database
  suite passed again in 4.349 s after 14.79 s preparation. After adding controlled
  pending-state assertions/captures, the two affected browser cases passed in
  9.5 s after 8.816 s preparation. No unchanged green suite was rerun for luck.

## Failed attempts and disposition

- One new client test exposed a product defect: a response was accepted after
  `ready` became false. Added the ready-context check; the unchanged regression
  passes. A separate TypeScript error in the deferred test mock was corrected
  with an explicit function type.
- Four browser variants initially failed the new selected-ID assertion because
  the pre-existing fixture's second report was older than all 76 appended rows.
  The assertion assumed fixture insertion order equalled display order. Inspected
  the source history and test-performance ledger; this is distinct from the
  previously retired desktop range-selection journey. One repair gives this
  local scenario explicit timestamp ordering before navigation. The shared
  fixture and its other callers retain their original timestamps. All four
  variants then passed. No sleeps, timeout changes or retry-for-luck were used.
- Docker initially could not allocate another default subnet. A task-local
  Compose override used an unused subnet; no other project's networks were
  removed. This was setup failure, not a test repair.
- Obsolete full-history cursor tests were removed with the collector. Context,
  failure and completeness protection now lives in the coordinator tests;
  ownership, persistence and atomicity live at the real HTTP/database boundary.
  The browser coverage mapping is updated in `test-migration-reports.md`.

## Cleanup

Browser runners close their servers and remove temporary bundles automatically.
Database runners drop each isolated test database. The task-owned Compose
container, network, volume and temporary override are removed after validation.
The temporary dependency symlink is removed; screenshots remain for chat review.
This record covers local implementation validation. PR checks and merge-queue
validation are tracked on the pull request; deployment is separate.

## PR review repair

Review of `c9068b52` identified a real response-ordering defect: a newer
archive/star receipt could carry the cached unread flag, causing the older
database read confirmation to be discarded by the full-header revision check.
The coordinator regression was strengthened to reproduce that exact schedule
and failed against the original implementation. Shared header reconciliation
now retains confirmed read state monotonically within the binding while still
choosing archive/star/share fields by revision. A pure regression also checks a
later partial preference snapshot cannot restore unread state.

The affected coordinator, report state/engine, and sharing tests passed: 126 tests
in 1.02 s. TypeScript and ESLint passed. Current desktop/mobile screenshots were
refreshed after the repair; the six Reports/HUD cases are revalidated before push.
All six passed in 18.8 s after 5.587 s bundle preparation.

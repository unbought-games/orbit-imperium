# Report pagination and query filtering

Initial implementation validated on 2026-11-05 against base revision
`2d6f226ac76cab528d6c820ea18ffa9eea87d2b7` plus the uncommitted implementation in
this chat. The SHA-256 of the sorted changed-source manifest is
`c15b1f93ef2816023605c51f813110f3d8c562903c4e6c7976f3f21502aa5676`;
individual hashes are retained locally in `test-results/reports-tested-source.json`.
This note is outside that initial source manifest. No production changes were
performed. Subsequent PR and queue verification is recorded below.

## Behavior

- The list requests 50 reports, with folder, type, unread/starred status and sort
  applied on the server before the limit. The Inbox excludes archived reports.
- Scrolling to the bottom requests the next cursor. A keyboard-accessible Load
  more button remains available. Errors retain loaded rows and stop automatic
  continuation until an explicit retry. Invalid missing/repeated cursors fail.
- Each query owns its membership, cursor and request/error state. Headers and
  details remain authoritative shared facts in Zustand. A response for one filter
  cannot replace another filter's membership.
- Selection operates on loaded matching rows. The explicitly opened Archive
  cleanup dialog has a separate unfiltered Inbox query and may traverse the Inbox
  to review all eligible reports; ordinary controls do not trigger that traversal.
- Unread badge counts come from a capped server count. The closed HUD refreshes
  one unread page, even after previously reaching the end. An open HUD preserves
  its explicitly loaded window. Its 20-row display batches can span 50-row API
  boundaries. Optimistic removals derive from shared headers/preferences.
- Legacy requests without `filter` retain `include_hidden` behavior. Existing
  chronological cursors receive a compatible default filter in migration 0038.
  New cursors bind the filter, kind, recipient/session binding and ordering key.
- Resource and investment ordering uses authorized historical observations and
  active unit costs. Unknown observations remain last; numeric values do not pass
  through floating point or persist as derived report fields.

## Index review and rollout

The existing `mission_history(recipient,created_revision,report)` index finds a
recipient's history but cannot narrow it by hidden/read/starred preferences. The
existing universe/time index does not itself scope recipient membership.

The new recipient-first candidate query filters keys before building previews.
Migration 0038 adds:

- `mission_report_folder(recipient,hidden,read,report) INCLUDE(created_revision,starred)`.
- `mission_report_starred(recipient,hidden,report) INCLUDE(created_revision,read) WHERE starred`.

For a populated installation, run `scripts/prepare-report-indexes.sql` with psql
and `ON_ERROR_STOP=1`, outside a transaction, before deploying migration 0038.
It creates the indexes concurrently. Inspect `pg_index.indisvalid`; if preparation
was interrupted, drop only an invalid listed index concurrently before retrying.
Startup refuses missing/invalid indexes on retained membership and reports the
preparation script. Empty databases create the indexes transactionally.

A disposable PostgreSQL 16 dataset contained 50,000 reports, 100 recipients and
500 reports per recipient. EXPLAIN ANALYZE/BUFFERS of the candidate and count
queries selected the new indexes without disabling sequential scans:

| Query | Before buffer hits | After buffer hits | Before ms | After ms |
| --- | ---: | ---: | ---: | ---: |
| Inbox candidate page | 776 | 404 | 0.859 | 0.376 |
| Capped unread count | 536 | 83 | 0.408 | 0.058 |
| Starred candidate page | 521 | 62 | 0.446 | 0.051 |

These are local warm-cache observations, not production end-to-end benchmarks.
The plan JSON is retained locally in `test-results/report-query-plans.json`.
The main improvement also removes serial network traversal: the original loader
made ten requests for 500 mostly-read reports; the list now publishes its first
50-row response and waits for a pagination gesture.

## Validation

- `npm ci`: 4 seconds. Dependencies were absent at initial investigation.
- Final `npm test`: 1,393 cases in 146 files passed, 7.97 seconds.
- Final report/HUD browser suite: 91 cases passed, about 2.4 minutes; module
  preparation 7.80 seconds while other checks were compiling. No test timeout
  or assertion deadline was raised. Report-glance's five existing cases also
  passed (29.3 seconds including runner time, 2.04 seconds preparation).
- PostgreSQL suites `report_pages`, `world`, `report_sharing`,
  `public_player_names`, and `migrations`: 22 cases passed. Compilation was
  5.72 seconds; binary execution respectively 5.09, 22.73, 12.70, 5.47 and
  14.31 seconds with two Make workers and serial tests inside each binary.
- The additional retained-report migration test passed after the error mapping
  fix (0.73 seconds execution, 4.32 seconds compilation). It verifies online
  preparation, retained membership and compatibility of legacy cursors.
- Final expanded `report_pages` case passed (9.36 seconds execution, 5.80 seconds
  compilation, 0.47 seconds runner preparation). It covers 600 reports, combined
  filters, every sort, tied timestamps, unknown metrics, out-of-range historical
  unit counts, cursor isolation and recipient privacy.
- TypeScript, ESLint, Prettier, OpenAPI generation/contract checks, architecture
  boundaries, `cargo fmt --check`, and storage/application Clippy passed.
- Production frontend build passed; client bundling took 3.84 seconds and
  prerender bundling 0.35 seconds. Existing chunk-size/circular-dependency warnings
  remain unrelated to this change.
- Final running implementation inspected at 1440x900 and 390x900: first page,
  scrolling, filters, archived folder, loading, error/retry and filtered empty
  state. A 600-report fixture yielded 50 initial list rows and 100 after one
  scroll, with independent bounded unread requests. Captures are delivered in
  the originating chat, not uploaded to a PR.

PostgreSQL used the disposable Compose project `orbit-reports-19a8`, port 55439.
The default Docker address pool was exhausted; an explicit private subnet was
used for this project without modifying other containers or networks. The test
runner dropped its per-binary databases, and the standalone plan database was
also dropped. The project, volume and network are removed at completion. Browser
and Vite processes used by validation close after their work. Queue and merge
wait are not applicable.

## Failure and coverage ledger

Repository history was inspected (including report changes #258, #279, #281,
#293, #306, #307 and the available verification records). No separate owner Test
Czar ledger was available. Failures and removals are recorded here rather than
hidden by retries.

- Two coordinator assertions initially expected the old three-argument port and
  eager continuation. One repair verifies the new optional query argument and
  explicit pagination failure retaining the published first page; 44 cases passed.
- Two new browser pagination cases first matched HTML navigation instead of POST
  API responses. Their one repair narrowed the response matcher. They then failed
  on a malformed Espionage preview fixture. Both new cases were deleted under
  the one-repair rule, not renamed or retried. Bounded requests/query ownership
  are covered by deterministic client/database tests; real scrolling and states
  were exercised separately for visual inspection.
- Two existing detail-return cases expected all 24 one-row mock pages without
  scrolling. One repair gave that navigation fixture a realistic 50-row page and
  response-gated initial navigation. Both passed, preserving scroll/focus and
  receipt-controlled return assertions.
- The first full report suite had 34 passes and 11 failures. Its shared fixture
  ignored the new filters, several assertions required a single shared archive
  request chain, an archived folder assumed prefetched rows, and the cleanup
  loading gate could be consumed by list pagination. One batched repair made the
  fixture filter/sort server responses, preserved incomplete-list loading and
  explicit cleanup gating, and kept one-RPC, failure, selection and focus checks.
  All 12 targeted cases passed, then the complete final report suite passed.
- The first combined report/HUD run had 79 passes and 15 failures. Thirteen HUD
  cases still assumed the old badge-driven 100-row buffer, missing-cursor handling
  or shared complete archive. Updating the fixture count/filter behavior exposed
  two real integration details: 20-row HUD batches crossing a 50-row page and
  preserving an open HUD's loaded window. Both were fixed, and the ten retained
  targeted cases passed. Two rate-limit cases in that run were invalidated by
  source edits triggering Vite navigation during the run; this was an execution
  mistake. The final 91-case run held source fixed and passed. No green retry is
  used as a substitute for diagnosing those failures.
- The new migration test first exposed sanitization of the online-index error.
  The mapper now recognizes the new named constraint and emits the actionable
  script instruction. Its single repair passed.

Fifteen obsolete browser cases were removed intentionally:

- Report triage eager complete loading (two viewport cases).
- Shared-cache folder switching and shared partial-archive discovery (four).
- Desktop/mobile shared-background selection cases (two).
- Selection through the old full-archive timer refresh and cleanup inputs through
  a failed shared archive refresh (four).
- HUD badge traversal (one) and tab/orb shared complete archive pages (two).

They asserted the eager/shared membership behavior that caused the performance
bug, or duplicated its state permutations in the browser. Retained cheap coverage
includes report-inbox and engine tests for bounded hydration, explicit extension,
revision fencing, preference reconciliation, failures, query isolation and open
versus closed refresh windows; report-state tests for count caps and immediate
removals; report-triage/selection/cleanup tests; and PostgreSQL pagination/privacy
coverage. Existing browser controls, archive actions, focus, touch, retries,
HUD observer races and navigation remain tested. The common fixture changes
cover their callers; no separate follow-up work is required.

## PR and merge-queue follow-through

PR #354 initially passed its full PR matrix and automated review at
`96434ad2245c564037c05e5e1c19028f928376f3`. Queue run `42099838500` tested the
identical tree in integration commit `fcd8395f132333de8bf02eca7ff3f352d59f9d47`.
Browser shard 7 (job `127499527396`) failed once: `bulk older cleanup hides all
reports before one RPC completes at 390px`, at the assertion that every report
request after a captured baseline had a null cursor. The other 140 shard cases
passed. This is one failed queue attempt, not a successful retry.

The baseline was captured after opening the cleanup dialog but before its
complete Inbox response. Waiting for the enabled Archive button subsequently
allowed the dialog's legitimate continuation request into that earlier baseline.
The assertion incorrectly classified this pre-command work as post-command
pagination. This same scenario had already received its one repair during local
implementation, so it was removed outright, without another stabilization patch,
a timeout change, or retrying unchanged code. Auditing the parameterized callers
found the same timing-based assertion in the other three variants. All four
redundant browser cases were removed instead of retaining a known shared defect.

Coverage remains in `report-cleanup.test.ts` (one batch, deduplication, protected
reports and refused submissions) and `report-state.test.ts` (every batch member
updates immediately, rollback, unaffected reports, atomic receipt reconciliation
and stale-response protection). Existing browser archive-all review/submission,
rejection/uncertainty, focus/touch and navigation cases remain. No product code or
visual output changed in this queue repair; the captured screenshots remain
current. This chat owns validation, pushing and re-enqueueing the repaired head.

Local validation of the queue repair: all 23 report-state/cleanup unit cases
passed (149 ms runner duration), and all 41 retained report-deletion browser
cases passed (1.4 minutes, 1.82 seconds module preparation). GitHub removed the
failed queue entry after the integration run finished. Queue removals so far: 1.

### Integration with main

The repaired PR head `89d4853f04f53fb217520c469200e37f8d4483c3` passed its full
PR matrix and automated review. Its second queue entry was marked unmergeable
behind PR #353: both changes appended API schema definitions and claimed
migration number 0037. No second integration test run was created for this entry.
After #353 merged as `c199b79841da35168101d4ec245ea058b10b39ee`, this branch
merged that confirmed main revision. The schema resolution preserves the new
identity definitions and the report-filter additions; TypeScript was regenerated
from the combined OpenAPI document. The report migration is now **0038**, and
its retained-data migration test includes the preceding identity migration.
Queue removals so far: 2 (one failed test run, one integration conflict).

Local integrated validation passed: 1,409 client cases (6.76 seconds), all 92
report/HUD/glance browser cases (2.9 minutes; module preparation 5.26 seconds),
and all 18 report-page/migration database cases (25.53 seconds compilation;
15.35 seconds report execution and 33.78 seconds migration execution with two
Make workers). TypeScript contract generation/checks, lint, formatting and
Clippy also passed (27.89 seconds for the integrated storage Clippy check).
The disposable PostgreSQL project was removed after these checks. The production frontend build passed (4.01 seconds client bundling and 0.32
seconds prerender bundling). Current desktop/mobile screenshots were refreshed
and inspected against the integrated main UI before publishing.

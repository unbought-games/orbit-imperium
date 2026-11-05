# Report pagination and query filtering

Validated on 2026-11-05 against base revision
`2d6f226ac76cab528d6c820ea18ffa9eea87d2b7` plus the uncommitted implementation in
this chat. The SHA-256 of the sorted changed-source manifest is
`c15b1f93ef2816023605c51f813110f3d8c562903c4e6c7976f3f21502aa5676`;
individual hashes are retained locally in `test-results/reports-tested-source.json`.
This note is outside that source manifest. No production changes, PR, queue, or
merge were requested or performed.

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
  chronological cursors receive a compatible default filter in migration 0037.
  New cursors bind the filter, kind, recipient/session binding and ordering key.
- Resource and investment ordering uses authorized historical observations and
  active unit costs. Unknown observations remain last; numeric values do not pass
  through floating point or persist as derived report fields.

## Index review and rollout

The existing `mission_history(recipient,created_revision,report)` index finds a
recipient's history but cannot narrow it by hidden/read/starred preferences. The
existing universe/time index does not itself scope recipient membership.

The new recipient-first candidate query filters keys before building previews.
Migration 0037 adds:

- `mission_report_folder(recipient,hidden,read,report) INCLUDE(created_revision,starred)`.
- `mission_report_starred(recipient,hidden,report) INCLUDE(created_revision,read) WHERE starred`.

For a populated installation, run `scripts/prepare-report-indexes.sql` with psql
and `ON_ERROR_STOP=1`, outside a transaction, before deploying migration 0037.
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

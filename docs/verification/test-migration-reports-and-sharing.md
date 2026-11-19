# Reports, sharing, deletion and history

This is the stream 08 handoff for the audit on `emick/test-migration-audit`.
The pre-migration baseline is `a119915ffaeb881a7f54d65542478f4788bd4210`.
The frozen inventory at `0c235fd6d27422374abf61ea44e39c015a9c1675`
contains 59 application and seven component cases. At this branch's base
`7449be126307cf788c2f47083922c73e70f582f4` the five application files
contain 61 cases, the four original component files contain eight, and
`report-readability.spec.ts` adds one. The inventories preserve expansions,
historical titles, and IDs. The resulting cohort has 24 application cases
and 25 component cases. Anonymous token entry stays in the journey gate.

- [Original baseline](test-migration-reports-and-sharing/baseline.csv)
- [Frozen stream inventory](test-migration-reports-and-sharing/current.csv)
- [Main changes since the snapshot](test-migration-reports-and-sharing/delta.csv)
- [Final collected cases](test-migration-reports-and-sharing/final-cases.csv)
- [Triage controls and report rows](report-stream-08-triage.md)
- [Outcomes and recovery](report-stream-08-outcomes.md)
- [Private and public readers](report-stream-08-readers.md)

## Read, archive and restore

`opening a report marks it read after loading, clears the inbox badge and does
not resubmit after refresh` holds one detail response and observes the real
`useReports` effect sending the single `MarkReportRead` command. The response
gate checks that operation. `failed or abandoned report loads do not mark
reports read` delivers a 503, retries, leaves the route, then delivers the
held report after React has committed the inbox. The read side effect must
remain absent. The bulk “Mark shown as read” control introduced by #404 uses
the separate `/reports/read` endpoint. #452 removed success notices for read
acknowledgements.

`archiving a row and restoring its detail survive authoritative reloads`
archives one unread row, reloads the list, enters the archived detail directly,
restores from its toolbar, follows the accessible Back control, and reloads the
restored list. Both mutations wait for the visibility command response. Fixtures
supply headers across document loads. Assertions about recipient scope, replay
and atomic effects come from the server tests below. The removed second
archive/restore cycle repeated those controls. The accepted-detail return and
empty/disabled selection branches have separate cases. Assertions about old
“Show deleted reports”, manual refresh, and explanatory copy described controls
removed from the product. Independent optimistic interaction has its own tests.

`E archives the selection and confirms revocation in the shared detail`
exercises the list shortcut and separate route-scoped detail handler. A real
confirmation dialog starts with Cancel focused, returns focus on dismissal,
and requires explicit confirmation to archive a public report. The pending
gesture stays in detail. The committed gesture returns to the inbox. Reloading
its archived detail recovers the confirmed state. The phone exercises its
selection control and document containment. Desktop had repeated the same
command, dialog and route sequence. The component shortcut case exercises
typing, modal ownership, modifiers and duplicate input.

## Server evidence

| Boundary | Passing test and protected fact |
| --- | --- |
| HTTP router to PostgreSQL | `report_reads::displayed_reports_are_atomic_private_idempotent_and_not_limited_to_400` sends real requests with CSRF/session, foreign recipient IDs, duplicate IDs, replay and concurrent preferences. |
| PostgreSQL report query | `report_pages::filtered_pages_are_bounded_ordered_private_and_cursor_scoped` exercises authorized membership, ordering and cursor validation. |
| Application and PostgreSQL | `report_sharing::shares_are_explicit_recipient_scoped_revocable_historical_and_preserved_when_archived` covers publish, redacted historical snapshots, replays, recipient protection, bulk preferences, stale unconfirmed archive, confirmed archive and link revocation. |
| HTTP/public preview | `public_reports_need_no_session_but_sharing_management_requires_auth_origin_and_csrf` and the three `shared_report_preview::tests` cover anonymous access, management authorization and escaped preview metadata. |
| Public projection | All six `orbit_application::report_sharing::tests` exercise the privacy allowlist, local identities, hidden sections, consent, contact loss and stored missile intelligence. |

#431 changed timestamps, #439 replaced overlays, #445 made pending order retries
memory-only and #470 added revocation confirmation on detail archive. The orb's
report outcomes and ages (#484) and both moon-destruction outcomes (#483) use
the current glance and observation models. Fixture receipts and durable
assertions are independent of the retired transition journal.

## Earlier failures and ownership

The [original report migration](test-migration-reports.md), [repair ledger](../runbooks/test-performance-audit.md),
[displayed-read record](report-mark-shown-read.md), and [journey review](test-migration-journey-review.md)
carry earlier repairs forward. The historical glance/range/bulk-read tours stay
retired, including their cross-screen focus, scroll, and multistep selection
sequences. #382 retired the three-report identity/dossier focus and Escape
tour. #431 retired the unexplained 390px combined delete/restore/reload hang.
#439 retired opening the explosion explanation on the full report via
hover, keyboard and touch. The deterministic explosion count, trigger and
shared popover tests cover their own boundaries. The missile intelligence
navigation/share tour remains retired after its earlier repair. Static
projections preserve observed and unknown values. The former native sequences
remain gaps.

05 owns [shell badge navigation](test-migration-shell-navigation.md). 06 owns
[HUD list, observer, retry, focus and deletion across Reports and the open HUD](test-migration-startup-hud-tutorial.md).
07 owns the [live profile and historical alliance-link routes](test-migration-social-identity.md).
The marks on the HUD and Reports are distinct controls. The report-specific
fixture and gallery registrations stay within 08. Shared harness/acceptance
and final gate selection stay with 09 and 10. The broad feature cohort
continues to select surviving application integrations.

## Local validation and failure record

One validation owner serialized browser bundles, browser runs and full static
checks. Preparation used Node 24.18.0 and npm 11.16.0, with 35 s for
`npm ci --ignore-scripts`. The first implementation commit is
`bf088cb345ef0ca4dc7d822271a0b3657d6eb806`. During authoring, commands
used base 7449be12 plus the then-current diff. No local runner allocation wait.

| Command or boundary | Bundle/compile | Execution and result |
| --- | --- | --- |
| PostgreSQL setup and three report binaries | Compose healthy in 2.854 s, compile 44.37 s | 3 passed. Paging 4.511 s, read 3.179 s, sharing 7.102 s. Make total 71.90 s. |
| `make test-http` | 23.77 s | 94 passed in 25.248 s. |
| Application sharing projection | 18.24 s | 6 passed in 0.013 s. |
| Initial four archive/read journeys | 5.519 s | 2 passed, 2 fixture failures in 11.5 s. Corrected two passed in 6.4 s after a 4.914 s build. |
| Readers, sharing and outcome journeys | 4.810 s | 11 passed, 3 failed in 17.3 s. Corrected reader fixtures and geometry passed 3 in 4.3 s after 4.554 s prep. See repair dispositions. |
| Retained app row targets and displayed reads | 4.543 s | 6 passed in 7.4 s. |
| First triage/recovery mounts | 4.200 s | 10 passed, 2 invalid proposed touch replacements failed in 13.3 s. Remaining triage 8 passed in 6.6 s after 4.229 s prep; separate desktop HUD geometry passed in 1.3 s after 4.129 s prep. |
| Reader, sharing and legacy components | 4.110 s | 13 passed, 1 failed in 7.8 s. Reader/recovery after edits passed 5 in 3.0 s after 4.062 s prep. |
| Report state, Coordinator, adapters, facts, runtime and world tests | Vitest | 346 passed, 31 files in 1.33 s. |
| `make _static`, scoped ESLint and inventory policy | Existing native tools | Static checks passed in 25.799 s. Both policy tests passed in 10.542 s, including disjoint, exhaustive browser shard selection. |

The first Compose setup stopped before tests when Docker's default address pool
was exhausted. An unused subnet in an ephemeral override allowed the same
disposable Compose project to start. Each database was dropped by its runner;
Compose removed the project's container, volume and network. Playwright closed
its Chromium workers and Vite servers. Browser diagnostics were preserved for
review. No product UI changed.

The first archive/read fixture incorrectly treated opening one report as a bulk
read and refused the actual `MarkReportRead` command. Restoring that explicit
command and gating its own receipt fixed the authoring regression. Bulk reads
still require the database endpoint. Two proposed mounted touch cases selected
the wrong row among tied timestamps. Those replacements were discarded and
their healthy original touch assertions retained. The large reader initially
included an aria-hidden checkmark in its role-name selector. The corrected
assertions cover the accessible name and the visible text independently.

The first migrated small and deuterium combat routes received schema-invalid
recovery counts with participant-only fields. Schema validation stopped the UI
before the expected controls. The private espionage toolbar also read related
rectangles across separate layout frames. Its correction measures the same
bounds in one browser evaluation with the original numeric limits. See the
reader handoff for the individual histories. No Playwright retries, deadline
changes, unexplained green retries or changes to production rendering.

## Independent browser review

A fresh, read-only `browser_test_reviewer` loaded the repository TOML with
`fork_turns="none"`. Its packet specified the absolute stream checkout, base
7449be126307cf788c2f47083922c73e70f582f4, head
bf088cb345ef0ca4dc7d822271a0b3657d6eb806, raw application, gallery,
controller, fixture and configuration diffs, the frozen inventory, server
tests, repair ledgers and first-attempt logs. All code under review was
committed. The reviewer returned changes requested.

| Finding | Disposition in `8cbf442e2615656dabe7fa735c5b61839afc8123` |
| --- | --- |
| The shortened small-combat successor failed after its original readiness repair. | Discarded that rewrite. Restored the original small case title, payload, clock, response gate, force and round assertions, and coordinate-menu journey. The first-pass green retry of the replacement is superseded. The deuterium case had received the common readiness audit and had no recorded independent failure before the new schema error. |
| A global disabled flag could block the second row during an independent archive. | The mounted recovery now holds A, submits B via Enter while A is absent, observes uncertainty, then settles A and uses the real Retry control. Controller tests still own the alternate completion schedules. |
| A's delivered receipt alone could precede execution of its navigation observer. | B starts read. The test waits for the successful overview requested with A's committed minimum revision, then verifies B's exact URL and visible observation. |
| Text could clip inside the research label while its container still fit. | At 320px the mounted case verifies multiple text lines and each line's bounds, and checks the long row's lazy image decoded. |
| Read re-entry clicked an unrelated, already-read row. | Re-enters the exact previously opened report by its canonical link and checks the read submissions. Foreground invalidation remains the responsibility of the shell/Coordinator coverage. |
| The pending HUD fixture had no unread continuation page. | Renamed the integration to its actual observable contract, showing the unread row in the open HUD after settlement. Stream 06 and the report engine own continuation requests. |
| Excess overview-document setup and collection tag | New private reader and sharing entries install fixtures before direct navigation. The original healthy small-combat case keeps its setup. Corrected the CSV to reflect Playwright's normalized journey tag on anonymous entry. |

The other cases and server boundary assignments passed the first review.
Serial validation of the corrections passed the five affected private reader
and share journeys, the held-row recovery, the settled detail navigation, and
the long-label check. Browser checks use the prebuilt test bundles.

At source revision `8cbf442e2615656dabe7fa735c5b61839afc8123`, the
entire owned application inventory passed 24/24 on one execution with two
workers (4.786 s bundle, 23.8 s runner). All 25 owned mounted cases passed
together (4.290 s bundle, 11.0 s runner). The final component typecheck took
9.374 s. Scoped ESLint, formatting and Git whitespace checks passed.

A second independent reviewer ran with fresh context against `bf088cb3..8cbf442e`.
The packet included the raw diff, original main revision, exact checkout,
source, fixtures, repair history and artifacts. It passed all changed cases
and callers. Its optional correction identified an unused bulk-read handler
in the small-combat fixture. Source revision
`b00ada16dabe6e7a3ffe7b759153b57aaf9b45cd` removes the handler and
keeps the single-read receipt supplied by the shared fixture. Both affected
combat application cases passed (4.706 s bundle, 3.3 s runner).
A third fresh reviewer checked `8cbf442e..b00ada16`, the exact one-file
diff, both combat callers, the real read effect and the scoped runner evidence.
It passed both cases with no outstanding findings. Each reviewer worked
read-only and received the source packet independently.

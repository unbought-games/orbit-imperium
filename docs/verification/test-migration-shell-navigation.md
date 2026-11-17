# Stream 05 — Shell, navigation, public layout and primitives

Implementation base: `3e5540e1d9834ca45ecd007f853b3f793720431b` (PR #446).
Owner chat: `01a1e9c6-d23e-7fe2-8118-f85d3787a333`; branch
`emick/test-migration-shell-navigation`. The separate audit is at
`7e4ecab03c5b6d3abcb1da744dcf36c292961d86` on
`origin/emick/test-migration-audit`, frozen at `0c235fd6`. Other streams' status
and inventories are not changed or imported here.

## Complete accounting

- [Current ledger](test-migration-shell-navigation/current.csv): all **206**
  frozen cases, preserving IDs, projects, full title ancestry and repair pointers
  (154 application and 52 components).
- [Historical ledger](test-migration-shell-navigation/baseline.csv): all **246**
  pre-migration application cases. This includes the 12 action-sheet cases and
  48 detail previews already migrated in phase one; their exact current names
  are reconciled, without migrating them again.
- [Delta ledger](test-migration-shell-navigation/delta.csv): **50** records for
  additions, changed identities and retirements since the frozen audit, including
  the 23 new component cases in this change. No frozen CSV is rewritten.
- [Final required cases](test-migration-shell-navigation/final-cases.csv): **137
  application and 89 component cases**, each with its reason for remaining at
  that boundary. Current main started with 158 application and 66 component
  cases. The 21-case application reduction is coverage consolidation, not a
  target or a claim that the global merge-gate migration is complete.

Every current/historical row has a final disposition and named coverage or an
explicit retirement. No test was quarantined, skipped, made optional or moved to
scheduled validation. The existing required components/application partition and
production-homepage release-artifact checks are unchanged.

## Production boundary and assertion mapping

`resolveShellRoute` extracts the existing GameShell context resolution and
canonicalization decision without changing its behavior. It receives route
parameters, validated search, current authoritative view and universe name; it
stores nothing. GameShell still owns navigation effects, hash/search preservation,
replace semantics, route focus, application identity, HUD and subscriptions.
The new model matrix checks 13 page families, path precedence over legacy input,
foreign/removed context, owned defaults, planetless account pages, location routes,
alliance sections and retained invitation/message queries. Existing router tests
still check concrete `routeTarget` URLs. History, reload, native links and actual
route registration remain browser contracts.

| Source assertions | Exact replacement boundary | Remaining application contract |
| --- | --- | --- |
| Both coordinate input scenarios | `components/form.spec.ts`: `coordinates are one tab stop with colon and space advancement`; `coordinate input offers a numeric keyboard and a touch separator control` | Dispatch wires all four numeric controls; coordinate clipboard/URL/target intent remains in coordinate-links |
| Construction/research completion date popup | `components/form.spec.ts`: `completion details include day, year and semantic time across midnight`, mounting their shared production `ActiveWorkDetails` | Actual open-cancellation removal on delivered completion stays in detail-playground; active work consumers remain required |
| Tablet pinned header and nine-world roster | Same full test titles in `shell-layout.component.spec.ts`, same 768px input, scroll positions, alignment, focus and selection | Actual Develop/Fleet/Galaxy destinations, body history and reload remain in shell/desktop-navigation |
| Body-label 1280/768/390/320 and 200% text matrix | `selected body labels truncate on phones and remain complete at larger widths and text scales` | Accessible route-heading focus, visually hidden title, and visible unavailable heading remain in shell |
| Six Menu badge width/text-scale variants | `shell-menu.component.spec.ts`: `unread menu badges fit at …px with …% text`, with real MenuScreen, Navigation and report store selectors | One 390px application journey preserves real report delivery, count/cap changes, keyboard Menu activation, Back, reload and reconciliation; desktop resize is retained there |
| Three queue layout/state tours | `shell-manufacturing.component.spec.ts`: same `shipyard and defense show every batch and total completion at …px` titles | One 390px application case still mounts Overview, Shipyard and Defense and checks their actual queue consumers |
| Public image/header layout variants | `public-layout.component.spec.ts`: same four image-layout and two registration-flag titles, real HomeLanding/PublicFrame | Native signup/login redirects, studio/home activation, disabled registration, authenticated entry, metadata and standalone homepage bootstrap remain application tests |
| Touch/desktop detail-and-sheet selection tour | `content-selection.component.spec.ts`: `detail descriptions, quantity editing, technology tabs and sheet notes retain native selection` in both modes | Five original catalog/Galaxy/HUD copying modes and both public-list selection modes remain. Screenshot-only popup tour preparation is removed; shell route identity and catalog heading/navigation checks remain in named ledger cases |
| Mobile replays of Alliance/High Scores/Simulator routing | `shell-route.test.ts` context matrix plus the same desktop application scenarios | Messages and Settings retain both responsive navigation compositions; public alliance/login/query/hash, Menu/Rewards and every gameplay destination keep their unique actual router contracts |

The queue scene reuses stream 04's real Coordinator and `WorkSummaries`, with the
original batch values and external delivered snapshots. It preserves ordering,
body filtering, 12-row/large-integer layout, artwork decoding, pointer/keyboard
popup re-entry, relative timing, progress, elapsed-but-unconfirmed and empty states.
Only the small manufacturing summary is mounted. This does **not** resurrect any
of stream 04's four exhausted whole-page Empire/fleet geometry replacements.
Its original application layout coverage remains untouched.

The Menu scene uses the existing shell frame and actual MenuScreen. Controlled
report-inbox snapshots are test inputs to the real selectors/subscriptions; it
neither mocks `hasUnreadReports` nor claims to test HTTP reconciliation. There are
no production fixture switches, fake components or new persistent/derived game
state. The gallery additions are lazy and excluded from production assets.

Existing deterministic `manufacturing-summary-model`, `manufacturing-summary`,
`work-summary-timing`, `work-cancellation`, `navigation-activity`,
`navigation-model`, `navigation-motion`, `page-search`, `coordinate-input-model`,
`loading-presence` and `resource-mark` tests passed. They retain arithmetic,
elapsed confirmation boundaries, pending-state projections, loading delays and
resource semantics without reproducing their implementations in fixtures.

## Retained browser risks and current-main contracts

Density retains actual shell first-viewport/layout contracts for Fleet inventory,
report follow-up, catalogs, legacy transport, title focus and subscribed threat
countdowns. Prepared standalone props do not prove those callers fit beneath the
pinned header/dock. The original complete-shell inventory/long-fleet-name and
intermediate-width cases retained by stream 04 remain unchanged.

Mixed shell cases retain command admission/receipt-to-consumer wiring, uncertain
Dispatch action notices, disconnected route access, legacy fleet trajectory/
recall, report loading/failure and native app identity. Streams 06 and 08 own the
wider HUD/recovery/report migrations; this record does not pretend static output
replaces their asynchronous subscribed consumers. Stream 03 explicitly required
retaining the legacy shell trajectory caller; its fleet-card/model evidence is
reused as supporting coverage, not permission to remove it.

All existing primitive cases are audited and validated: ActionSheet snap/drag,
focus/scroll locking, resize/keyboard viewport and reduced motion; native forms;
LoadingRegion delay/inert/focus geometry; Base UI popover hover gaps, independent
touch, Escape/re-entry, native-dialog containment, link semantics and guidance;
resource colors/accessibility/copying; shell selection across input capabilities.
No combined keyboard/touch scenario retired in phase one was recreated.

New-main deltas preserve #439 Base UI overlays, #399 fixed-header overscroll,
#443 account new-tab links, #444 Empire identity and #445 in-memory-only retries.
No persistence/replay restoration is added. All generated destinations use
canonical body paths; legacy queries are explicit compatibility/rejection inputs.
The profile badge/outage tour removed by #436 remains retired after its recorded
repair and recurrence (`persistent-player-emblems.md`). Deterministic profile/cache
and isolated identity coverage do not claim that exact 301-second shell tour.
The normal-motion blanket prohibition remains retired after #369/#384; precise
sidebar CSS and both surviving reduced-motion application cases are retained.
The retired energy modifier/new-tab scenario also remains a browser gap; account
new-tab checks do not replace its exact energy consumer.

## Failure and repair record

1. Initial component collection stopped at duplicate `selectBody`/`id` imports
   added to an existing spec. Removed the duplicate imports. No scenario executed
   in this attempt; it is an authoring/collection error, not a flaky-test repair.
2. Component typecheck found a missing `as_of_ms` on the prepared report inbox and
   an unsupported top-level Playwright `reducedMotion` option copied from an older
   application spec. Added the required snapshot field and used `emulateMedia`
   before mounting. Native no-preference behavior is explicit and passed.
3. The broad application run had **137 passed / 2 failed**. The unread Menu case
   sampled badge/label/chevron rectangles in separate browser calls immediately
   after resizing to desktop: it reported a 10px center difference, while retained
   screenshot showed aligned controls. The empty-report case captured its baseline
   immediately after restoring the root font size: pinned-header measurement then
   moved the content by 28.390625px. These are explained measurement/fixture
   schedules, not product or infrastructure incidents. History located the
   measurement introductions at `a0a3b7d1` and `9bae201b`; no earlier repair to
   these measurements was found in the repair ledger.
4. **One repair for that geometry family:** sample all Menu row rectangles in one
   browser task; after resetting text scale, require the original empty-state
   rectangle before recording its refresh baseline. No bounds, equality, widths
   or tolerances were weakened. Both original assertions passed in the focused
   repair run and the subsequent final capture run. Audit of owned callers also
   applies atomic row measurement to the new Menu component test. Do not add a
   second stabilization patch if these cases recur.
5. A formatting-cleanup attempt caused an adjacent-import syntax error during
   final component collection. Restored the newline and passed component
   TypeScript before running the suite. No scenario ran in that collection
   attempt. This is retained separately from the two assertion failures.

First failed application evidence is retained at
`/tmp/stream05-evidence/application-first`, including JSON, screenshots and error
contexts. Logs are `/tmp/stream05-application.log`,
`/tmp/stream05-geometry-repair.log`, `/tmp/stream05-app-final.log`,
`/tmp/stream05-components-first.log`, `/tmp/stream05-components-final.log` and
`/tmp/stream05-components-verified.log`. Historical phase-one shared-startup and
selector repairs remain in `test-migration-shell-components.md` and the combined
verification record; this migration does not reset their allowances.

## Validation and ownership

This chat is the validation owner. Machine inspection found an unrelated idle
browser process, with no other browser runner/build/typecheck; it was left alone.
All browser suites, full typechecks and builds run serially. Node 24.18.0 and npm
11.16.0 use the installed pinned dependencies. No dependency or timeout policy
changed. The ordinary Make/npm runners own setup and cleanup; no process registry,
scheduler or subprocess wrapper was introduced.

| Local check | Result | Preparation / execution |
| --- | --- | --- |
| Initial form/tablet replacement batch | 21 passed | 3.9s / 6.1s |
| Menu and body-label replacement batch | 24 passed | see log / 7.3s |
| Public layout and native selection | 6 passed | see log / 2.8s |
| Header and completion-date/form batch | 11 passed | see log / 3.1s |
| Shell route, router, access and coordinate models | 61 passed | 3.21s total |
| Existing primitive/queue/cancellation models | 114 passed | 0.974s total |
| First owned application run | 137 passed, 2 failed | see log / 2.5 minutes |
| Geometry repair | 2 passed | see log / 3.8s |
| Manufacturing replacement | 3 passed | 3.970s / 2.2s |
| Final changed application/capture cases | 4 passed | see log / 6.8s |
| Final complete owned component suite, captures enabled | 89 passed | see log / 48.3s |

The broad application run included the two subsequently removed duplicate queue
widths. All **137 final surviving application cases** passed either there or in
the focused repair/final narrowing run. Source formatting afterward changes no
behavior. A passing retry is not the diagnosis: both failures and the specific
repairs above remain part of the result. Full-check, exact source revision and CI
results are appended below.

Final actual running shell/Menu captures at desktop 1440×900 and phone 390×844 /
390×900 were inspected. Full-page shell captures retain the actual viewport-fixed
dock location; the apparent middle-of-image dock is the full-page screenshot,
not an extra in-page navigation bar. No intended UI design changes were made.
Images are local under `test-results/stream05-final` and displayed in the
originating chat, not uploaded to a PR.

The server boundary is unchanged. `bootstrap_html` retains script-terminator
escaping; `home_seo` retains self-hosted origin/structured-data escaping;
`static_assets` retains anonymous-only lightweight entry, initial-response
metadata, no-bootstrap public documents, uncached history routes and deep-link
HEAD semantics. These native suites are included in the repository check; no
fixture image/layout test substitutes for production asset validation. Real
server authorization, persistence and recovery acceptance remain owned by their
existing suites. No database, container or explicit acceptance change is made.

Handoffs: 06 retains actual HUD/recovery consumers and its prior main-run caption
failure; 08 retains report state/loading/error consumer migration; 09 retains
unexpected-API diagnostics and production-homepage acceptance; 10 consumes these
ledgers for final gate selection and five natural subsequent PR lifecycles.
No shared-source repair is pending with those owners. Registry additions are
limited to stream-owned scenes. No deployment, repository-protection change,
paid cosmetic content, CHANGELOG edit or new external contributor claim is part
of this change.

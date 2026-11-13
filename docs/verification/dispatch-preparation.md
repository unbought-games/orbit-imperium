# Dispatch preparation and cargo planning

Scope: owner-selected feedback #135, #136 and #166. Base revision:
`7d57e0532827fffe2bde0da65f03e8045b460dda`. No merge or deployment authorized.

## Root causes and implementation

- Cargo fill called `FleetQuote`, which checks occupied fleet slots before the
  cargo edit. It now requests `FleetEstimate` with zero carried cargo, then
  derives the fill from current origin balances, payload capacity and reserved
  fuel. Review still obtains a fresh legal quote; launch is unchanged.
- Simulator preparation carried the draft through router history but had no
  review intent. `reviewOnOpen` now triggers one fresh review; identity,
  protection, inventory, fuel and fleet-slot failures leave the draft editable.
  Editing/back never silently launches or reopens review.
- Dispatch had no resource-observation lookup. A recipient-authorized target-body
  report filter runs before pagination. A limit-one, newest espionage query
  includes archives without marking anything read. It never uses another
  recipient's payload. Report age remains visible and unknown resources are not
  replaced with zero or an older report.
- Cargo needs use whole-unit half-stock caps and the engine's five-pass allocation
  order. The displayed estimate assumes victory and surviving capacity; it does
  not predict combat or project live stock. Current cargo and fuel reduce the
  fleet's displayed free space. Target owner/kind and account binding changes
  fence historical evidence.

## Coverage

- `dispatch-requests.test.ts`: all/max cargo with a slot-rejecting quote port;
  bounded capacity, fuel reserve and unchanged review rejection. Existing tests
  retain stale completion, observation replacement and resource-error coverage.
- `dispatch-loot-model.test.ts`: zero/unknown distinctions, fractional stock,
  skewed-resource allocation, large integer precision and target identity.
- `report-reads.test.ts`: bounded target query, archived observations and no read
  mutation through Coordinator's actual HTTP adapter.
- PostgreSQL `report_pages`: target filter before limit, archive inclusion,
  recipient payload isolation, empty results and target-bound cursors, alongside
  existing sorting/privacy cases.
- Dispatch component cases: one-time prepared review, blocked prepared draft and
  cargo editing while quotes reject occupied slots.
- Existing simulator application journey: real Prepare attack navigation now
  verifies final review and carried intent before returning to edit.

## Validation record

Implementation validation is in progress. Final revision, command results,
phase timings, visual evidence and cleanup will be recorded before handoff.

First component run: 80/81 passed; preparation 3.581s, execution 1.5m.
The Attack schedule case counted all `time` elements in the review, now including
the added historical-observation timestamp (expected 2, received 3). Inspected
its history and the repair ledger; scoped all three schedule time queries in
that case to the named Flight schedule region. Other timing callers already
use their owning regions. No timeout or behavioral assertion was weakened.
Original evidence remains in `test-results/components/dispatch-review-clearly-id-75357-oute-and-conditional-return/`.
The new cargo regression probe failed all four cases against the original
FleetQuote path and passed all four after restoring FleetEstimate.

The repaired schedule cases and new behaviors passed together (8/8; bundle
3.485s, execution 5.9s). The real simulator-to-Dispatch application journey passed
(1/1; bundle 4.284s, execution 6.0s). App and component typechecks passed. The full
client suite passed 211 files / 1,886 cases in 19.86s with two workers; later
preparation-refresh cases passed in the focused 42-case controller file.

Preparation now refreshes the empire before obtaining the legal quote. A controlled
promise test covers edits during refresh, and refresh failures keep confirmation
closed. These final handoff changes require a fresh focused browser pass.

The disposable database's first setup attempt hit Docker's exhausted automatic
address pools. Inspected existing subnets and assigned task-owned
`orbit-dispatch-check` the unused `10.253.243.0/28` subnet. No existing networks,
containers or volumes were removed. The database is bound to localhost port 55069.

Final local checks (same source changes as the implementation commit):

- `make test-db DB_SUITES=report_pages DB_JOBS=1`: passed 1/1 integration test;
  native preparation 32.69s using the existing Cargo cache with two build jobs,
  execution 5.237s. Disposable database, container, volume and network removed.
- Final Node 24 component selection: 8/8 passed; preparation 4.124s, execution
  5.9s. Final simulator handoff: 1/1 passed; preparation 4.272s, execution 5.9s.
- `make _static`: passed Rust formatting, ESLint, source formatting, component
  typecheck, contract drift and boundary checks.
- `npm run build`: passed app typecheck, production build and homepage prerender.
  Restored unrelated generated analytics-route drift; no source change to that
  route generator belongs to this package.
- Shared-machine runner wait was interleaved with implementation and not measured
  as one contiguous interval. Builds/browser suites ran at one worker after
  process checks; temporary fixture bundles cleaned themselves up.

Final running component captures were inspected at 1440×1000 and 390×1000:
`test-results/dispatch-visuals/{editor,review,full-slots}-<width>x1000.png`;
unknown/error observation details use cropped component captures from both
viewports. The editor, final confirmation, resource colors, cargo fields and
slot rejection fit without horizontal overflow. One optional capture script
initially queried Cargo capacity as a region instead of its actual group role;
corrected that selector and completed fresh captures. No production defect or
behavior-test failure was involved in that optional capture attempt.

Screenshots stay local and are displayed in the originating implementation chat,
not hosted or attached to the PR. CI/review follow-through continues on the pushed
revision; no merge or deployment is authorized.

## PR review follow-through

PR #430 revision `e360b79daf9122c96f6e292b539c28f6030ffecc` passed all
14 required CI jobs/gates. Bugbot identified a real advisory-state defect:
a failed refresh replaced an already loaded observation with an error-only read.
The repair preserves evidence only for the same Coordinator, account binding
and target, with an explicit failed-refresh label. A successful Unknown response
still clears known amounts. Pure tests cover source isolation; an interactive
case covers retained amounts, age, failure label and successful Unknown recovery.

Repair validation: 7/7 loot-model cases, both affected observation component
cases (bundle 4.430s; execution 2.8s), app/component typechecks and focused lint
passed. Refreshed captures include `retained-1440x1000.png` and
`retained-390x1000.png`; both retain readable historical values beneath the
explicit refresh-error message. No validation failure occurred during this repair.

## Owner browser review: cargo-first Dispatch

The owner reviewed the full local game and requested ten refinements. These
supersede the initial observation-age/disclaimer presentation above:

- Move raid planning below the cargo controls; show potential loot and how much
  the selected fleet can carry, with an all-loot fit result or shortfall.
- Replace observation prose/age and disclaimer paragraphs with a right-aligned
  Report link carrying the espionage icon. Keep authorization and target-identity
  checks; expose the report date in the link title.
- Remove generic attack-protection prose and the advisory Attack blocker. The
  legal quote and launch still report actual protection rejection. Espionage's
  existing known blocker behavior remains unchanged.
- Use aligned resource columns, canonical ship artwork, plain available counts,
  a visible field surface for Hold duration, and disable Review with no ships.

Validation on `f794ff77` plus these changes:

- 84/84 Dispatch components passed in 95.5s, bundle preparation 5.365s, one worker.
  Includes cargo fit/shortfall, report link, aligned icon/value centers at both
  widths, empty fleet disablement, and keyboard Hold duration selection.
- 211 client files / 1,897 tests passed in 26.00s with two workers.
- Three application cases passed in 13.3s (preparation 5.242s): edited report to
  deployment journey, moon-link/reload intent, and simulator-to-final-review.
- `make _static` and production build passed. Unrelated generated analytics-route
  drift was restored again.
- The first focused unit run had three obsolete copy expectations (loading,
  empty position and historical ownership). Updated the expected copy once;
  retained former-colony ownership distinction as "Last known owner: you".
  All 22 focused model/presentation cases then passed. No flaky retries or lost
  behavior assertions.
- Updated existing browser expectations for intentionally removed prose/actions;
  preserved review-time protection rejection and launch-race receipt coverage.

Full-game visual checks used the real local Rust server and isolated playground
at port 59452, signed in as `user`. Home's Small Cargo inventory was set to 400
through the local world CLI to exercise both insufficient and sufficient cargo;
no fleets were launched. The first CLI invocation used an unsupported hyphenated
item spelling and was rejected without mutation; the canonical SmallCargo name
succeeded. Verified the Report link opens the actual espionage report and its
Attack action returns to Dispatch. Hold selection, empty/partial/sufficient
cargo and final confirmation were inspected at 1440×1000 and 390×1000.

Final screenshots are under `test-results/dispatch-owner-full-game/`. Browser
viewport restored; the full local game stays running for owner review. The
pre-existing floating mobile HUD can overlap underlying controls; this package
does not alter the shared HUD. A build-triggered development refresh interrupted
one optional Hold capture; reselected Hold. Another capture expected a reset
editor after resizing but correctly retained review; returned through the visible
Back to edit mission button. These were capture-state mistakes, not test failures.

Integration: main advanced to `356028d3` with simulator PR #429 and related
owner-reviewed packages. A real conflict in SimulationFlight required integration.
Kept main's collapsible Plan attack and Review attack action, including its
`reviewOnOpen: true` handoff. The ReportFilter and simulator contract additions
merged together. All seven simulator application cases passed (bundle 5.199s,
execution 17.9s); component types, `make _static`, and production build passed.
No rebase or merge to main was performed; this is a normal base integration on
the feature branch. New dependencies were installed in this worktree after
removing only its dependency symlink; the shared checkout was not modified.

CI run `43516168967`, feature shard 4 (job `132198659687`) found four additional
old-requirement expectations in the moon suites, two viewport instances each.
`moon dispatch shows observed attack and espionage protection before review`
expected the removed early Attack warning. `selects a moon and inspects buildings
while lunar construction stays unavailable` expected Review enabled with no ships
selected (both lunar and same-coordinate planet-origin states). Inspected file
history and repair ledger; these are intentional contract changes, not flakes.
Updated the same cases, retained known Espionage warnings, added a response-gated
422 quote rejection for Attack, and asserted disabled Review for both empty
selections. Audited all browser Review-enabled and protection-text assertions;
remaining expectations have selected ships or belong to different contexts.
No retry, deadline change, or deleted coverage.

The four updated moon cases passed locally on the first repair run (bundle
5.080s; execution 9.6s, one worker). Product source and final screenshots were
unchanged by this test-contract correction.

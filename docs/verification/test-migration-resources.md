# Stream 01 — resources, quotes and production controls

Date: 2026-11-10. Owner chat: `01a1c830-b10b-7d70-a7b1-a96a254133af`.
Branch: `emick/resources-test-migration`. **Implementation complete; PR validation pending.**
No enqueue, merge or deployment is authorized for this handoff.

## Scope and provenance

This is the focused status handoff for stream 01 of the
[published audit](https://github.com/unbought-games/orbit-imperium/tree/fab5943199603e26d440ec32f73edcda3dad8961/docs/verification/e2e-migration).
The audit is on its separate branch, so this PR does not import or alter other
streams' status. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`.
Implementation base: `ea180d7f038c2d6a8e7f96a8b724f356513efb3c`.
The five owned application specs and their progression dependencies had no
changes between those revisions. No new-main cases needed reassignment.

All **108 current cases and 124 historical cases** have final dispositions:

- [Current case ledger](test-migration-resources-cases.csv): audit IDs, full source
  title paths/project, exact replacement names or retained application contracts,
  and explicit lost browser protection. 52 application cases are removed after
  replacement validation; one retained case is narrowed/renamed. 56 remain.
- [Historical ledger](test-migration-resources-baseline.csv): all 124 original
  identities, including the 16 already absent at the audit snapshot. Prior
  retirements and repair allowances remain in force.
- 43 new isolated cases mount real ResourcesPage, TechnologyPage, Production,
  BuildingQuickBuild, inspection/autosave hooks and cancellation controls. A small
  memory router mounts the real useCatalogSelection hook without application
  bootstrap. The scene mocks only the external game/storage ports; the real
  Coordinator owns projection, subscriptions, command admission and receipts.
- Existing deterministic selectors/controllers remain the main protection for
  price/affordability, pending reservations, canceled inspection ordering, elapsed
  cancellation boundaries and production draft/restoration permutations. Added
  three server-restriction cases assert retained eligibility blockers and actual
  rendered labels; a late-confirmation feedback case pins the three-second
  boundary independently of browser scheduling.

No production UI, shared runner, CI selection, dependency, changelog or other
stream's existing component file changed. Visual review is not applicable to
production UI in this PR. Component geometry, keyboard, touch and focus assertions
remain required. Diagnostic captures do not establish readiness, and optional
capture preparation is disabled when capture is off.

## Slice 1 — quotes, prices and quick build

The current-case ledger maps all building-quotes identities. Energy/cost/benefit
layouts, authoritative fusion/crystal forecasts, active storage, loading, error
Retry and metadata-refresh focus now run in the isolated scene at their original
widths. Exact assertions for whole shortages, fuel, output, energy tooltips,
cancellation review and final confirmed targets are preserved.

Quick-build restriction permutations and early/late/rejected feedback schedules
are deterministic. The mounted component checks same-task competing clicks,
reservation-disabled siblings, target typography/position, acknowledgment CSS,
countdown/summary agreement and reduced motion. The retained HTTP rejection case
still owns the global error banner. Exact browser sampling of all timing schedules
is deliberately retired; it is not claimed as equivalent animation scheduling.

The selected-planet case now reads `quick build submits for the selected planet
after catalog navigation`. It awaits the matching selected body's options before
checking the URL and submitted command body. Canceled/late completion permutations
live in progression-inspection tests, rather than a held application response.
The removed open-quote completion tours retain active/blocked state and confirmed
target changes in components; due reconciliation remains real Coordinator/model
coverage, not a mocked scene claim.

## Slice 2 — production, details and cancellation

Production tests retain native pointer movement, Home/End/arrow bounds, accessible
percentages, final saved commands and single-line percentages at 1440/390/320.
The real autosave hook displays saving/error/saved states and retries while
preserving unrelated confirmed changes. Untouched controls follow authoritative
settings; rules/fuel/unavailable-source text remains asserted.

All four healthy application autosave/restoration cases remain unchanged:
rapid edits plus route remount, rejection plus Retry, restored production command,
and restored legacy upgrade command. Component/controller tests do not replace
browser persistence, reload or shell error wiring.

Resource detail hover/keyboard and touch remain independent scenarios. The failed
phase-one combined tooltip test was not revived. Both cancellation consumers now
have isolated safe-default focus, Escape return, actual confirmation handlers and
rejection recovery. The application construction case at 29,999ms remains for the
HTTP command plus click-time crossing of the confirmation boundary. Deterministic
work-cancellation tests retain both consumers' complete elapsed-time matrix.

The exact held MetalMine inspection/CrystalMine navigation tour and the hour-long
accrual/503-overview/HUD-63 tour are retired as listed in the ledger. Inspection
cleanup, selected request identity, monotonic accrual, precise affordability and
mounted live controls have named lower-layer protection; no equivalent complete
HTTP/HUD tour is claimed. Previously retired modifier/new-tab energy navigation
remains explicitly lost.

## Retained application contracts and ownership

56 application cases remain required. Each has a named contract in the current
ledger: selected-body and prerequisite navigation/history, protocol-2 legacy
adapters, protocol capability routing, representative real command/receipt and
bulk-options wiring, durable storage restoration, global error/cooldown consumers,
and whole-shell responsive/enlarged-text composition. Independent desktop/touch
and legacy/modern consumers remain where isolated controls cannot establish their
wiring. These are explicit retained dispositions, not unclassified migration work.

Stream 02's catalog-pages and existing detail/progression scenes/specs are untouched.
The only registry change is the `resources` scenario. No shared production seam
change or unaccepted implementation handoff is required. Stream 09 retains the
published audit's shared unexpected-API-diagnostics responsibility. Stream 10
owns final global journey classification/CI cutover and can reconcile these CSV
deltas without re-auditing source. This PR makes no global cutover or future
reliability-rate claim.

## Actual engine and persistence invariants

Browser and component ports do not prove server payment, authorization or durability.
Existing real-boundary tests are retained and independently executed:

| Boundary | Named protection |
| --- | --- |
| Engine economy | `one_hour_and_read_frequency_have_exact_seed_totals`, `shortage_base_income_and_over_cap_are_preserved`, `exact_capacity_boundary_discards_excess_and_spending_resumes`, `level_two_cost_and_duration_are_independently_rounded` |
| Engine progression terms | `independent_cost_time_and_storage_vectors`, `redesign_threshold_is_applied_after_speed_and_raw_floor` |
| Engine progression | `settings_settle_old_rates_noop_and_missing_coverage_fail_closed`, `cancellation_refunds_stored_payment_releases_fields_and_cannot_resurrect`, `locks_are_bidirectional_and_other_work_is_concurrent`, `disabled_known_categories_numeric_bounds_and_field_limit_reject_before_mutation` |
| PostgreSQL progression | `concurrent_spend_deadline_ordering_and_restart_preserve_state`: durable competing spending, revision-fenced due work, exact-deadline cancellation, foreign-principal view rejection, storage upgrade/demolition across restart |
| PostgreSQL progression | `competing_construction_and_dome_admissions_derive_capacity_after_restart`: competing admission, derived fields/capacity and restart |

These are the actual assertions at those boundaries; the foreign-view rejection
is not described as a new cancellation-authorization test. No backend behavior or
server-test selection changed, so no new HTTP authorization claim is introduced.

## Validation and repair history

Implementation revision and final PR evidence are appended below. Local runs
initially exercised Node 23 through npm's child PATH despite `node` resolving to
24 interactively; final runs explicitly export Node 24.18.0/npm 11.16.0. Earlier
runs are exploratory evidence, not the final pinned-toolchain result.

| Final local check | Result | Preparation / execution |
| --- | --- | --- |
| Focused 12 client files (options, feedback, inspection, tile/availability, autosave, insights, scene contracts, coordinator, production rates, cancellation, game projection) | 326 passed | Vitest total 0.948s |
| Added rendered restriction-label assertions | 38 options tests passed | Vitest total 0.472s |
| Resource component spec | 43 passed | bundle 4.298s; runner 16.6s |
| Five retained application specs | 56 passed | bundle 5.094s; runner 53.3s |
| Component TypeScript | Passed | elapsed not separately retained |
| Full source ESLint / Prettier / whitespace | Passed | elapsed not separately retained |
| Engine economy/progression/progression_terms | 87 passed | compile 21.84s; execution 7.432s |
| PostgreSQL progression | 2 passed | compilation 39.60s + runner preparation 0.30s; execution 8.543s |

Local runner allocation wait was not independently instrumented. These phase
timings are not a controlled before/after performance comparison. No sleeps,
retry-for-luck, timeout increases, quarantine or CI execution deadlines were added.
No explicit full-system acceptance or deployment was requested or executed.

Authoring/check failures and their disposition:

1. Initial component typecheck: fixture receipt needed a contextual BoundReceipt
   return type; route context lacked required fields. Corrected before browser use.
2. Energy component batch: 3 failed / 3 storage passed, bundle 3.892s, runner 5.3s.
   The prepared scene incorrectly supplied the full catalog, adding an extra
   research `<dl>` absent from the original building fixture. Matched the original
   catalog exactly. No assertion change. All three passed in the next relevant
   run (11 cases, bundle 3.477s; runner 4.6s), and final 43 passed.
3. Cancellation component batch: 2 failed / 3 passed, bundle 4.407s, runner 4.7s.
   Expected operation ID incorrectly assumed hexadecimal formatting; `id(20)`
   uses decimal. Corrected expected ID to `...020`. Both consumers then passed,
   including the final pinned run. Native assertions were unchanged.
4. Unavailable-building migration: 3 failed / 2 cancellation cases passed,
   bundle 4.219s, runner 15.0s. The scene's local selection callback omitted the production
   caller's return-focus behavior. Replaced it with the real useCatalogSelection
   hook under a minimal memory RouterProvider, rather than mocking focus. The
   original application cases remained selected until all replacements passed.
   Full 42-case run then passed in 20.0s; final 43-case run passed in 16.6s.
5. Final typecheck found the DOM handle union needs an HTMLElement cast for the
   deliberate same-task click pair. The first textual edit did not match the
   formatter's indentation, so that check failed twice before the effective
   cast correction. No browser assertion failed; final component types passed.
6. Disposable DB preparation initially failed before any test: Docker's automatic
   subnet pool was exhausted by existing projects. Inspected allocated networks
   and gave only this task's Compose project an unused explicit /28 subnet through
   a temporary override. No other project's containers/networks/volumes were pruned.

Git history and the existing Test Czar repair ledger were read before disposition.
The prior quick-build layout readiness repair remains in force. The old combined
keyboard/touch failure and retired modifier/new-tab case were not renamed or
recreated. The 8 component failures above are explained authoring/fixture defects,
not product failures or infrastructure excuses. Each family received one repair;
none recurred after it. All application runs passed. No CI/queue attempt has yet
been discarded, and no queue enrollment is requested.

Native browser runners closed their browsers/servers and removed temporary
bundles. Failure logs remain in `/tmp/stream01-components-{2,5,6}.log`; final
run logs use `/tmp/stream01-*-final.log`. Docker/database cleanup and exact commit
identities are recorded with the final evidence below.


PostgreSQL validation used `make test-db DB_SUITES=progression DB_JOBS=1` with
`COMPOSE_PROJECT_NAME=orbit-resources-validation`, an ephemeral published port,
and the existing test-db.sh disposable database. Its trap dropped the test DB;
`docker compose down -v` removed this task's container, network and named volume.
Other projects were preserved. Engine validation used the installed native
Nextest runner for `economy`, `progression_terms` and `progression` only. No server
suite or real auth journey was substituted with mocked successful commands.

## Implementation revision and exact commands

Validated implementation: `7005cdb25e177c501157dfa8bf40c5dba2f97ef0`.
This commit records the same implementation exercised in the local runs; the
following commit adds only these ledgers/status notes. Full web TypeScript also
passed. After gating screenshot-only scrolling, the three affected energy cases
passed again (runner 3.1s); no unrelated green browser suite was repeated for that
small change. The initial exploratory 57-case application run passed in 60s before
the selected-body narrowing and final affordability migration; the final 56-case
pinned run is the authoritative application result above.

Commands, run from this checkout with the pinned Node directory first in PATH:

```sh
npm test -- apps/web/src/features/progression/{options,quick-build-feedback,progression-inspection,catalog-tile-model,building-availability,production-autosave,detail-insights,resource-scene}.test.ts apps/web/src/client-model/{coordinator,production-rates,work-cancellation,game-projection}.test.ts
npm test -- apps/web/src/features/progression/options.test.ts
npm run test:component-types
node node_modules/typescript/bin/tsc --noEmit -p apps/web
npm run lint
npm run format:check
npm run test:components -- resources.component.spec.ts --workers=2
npm run test:ui -- resources.spec.ts building-quotes.spec.ts locked-buildings.spec.ts catalog-affordability.spec.ts progression-cancellation.spec.ts --workers=2
npm run test:components -- resources.component.spec.ts -g 'building quotes distinguish' --workers=2
cargo nextest run -p orbit-engine --test economy --test progression_terms --test progression
make test-db DB_SUITES=progression DB_JOBS=1
git diff --check
```

The owned inventory was collected once after edits, with no browser execution,
and checked against both CSV ledgers: 108 unique current IDs, 124 historical
rows, 55 unchanged retained cases, one split/renamed retained case, 30 direct
component dispositions and 22 split/lower-layer dispositions. No source scenario
is silently deselected. Required global CI will validate integration with all
other streams' existing tests; no broader local suite was duplicated.

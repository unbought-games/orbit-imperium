# Report test migration

Base: `a119915ffaeb881a7f54d65542478f4788bd4210`. Scope: report-glance,
report-deletion, report-sharing, combat-reports, espionage-reports,
harvest-reports and colonization. The parent overhaul owns global gate selection,
the shared component runner and fixture policy. This change does not alter CI,
Make, deadlines, retries, the command HUD, dispatch production logic, or the
numbered-release changelog.

## Boundary decisions

`ReportObservation` and the combat/preview models already separate report facts
from application data loading. No duplicate observation model was needed.
`ReportPreviewFacts` extracts the existing row markup verbatim so static tests
exercise the actual resource names, icons, colors, quantities and separators.
`useReportCleanup` now declares its actual `store`/`send` dependency, allowing
its real async selection behavior to run with a controlled command transport.
Neither change alters rendered markup or player behavior.

The component tests use the parent's `components/fixture.ts` and component Vite /
Playwright runner. A report-specific test-only HTML entry prepares actual
production components without router, application bootstrap, session or API
clients. The shared isolated fixture rejects API calls and page errors. There
is no production route or test flag. The HTML entry requires no additions to
the parent's scenario registry.

Static markup is used only for content and semantics. Real component browsers
retain geometry/color checks; application browsers retain routing, keyboard,
focus, selection, sharing, confirmation, durable retry and cross-surface wiring.
The original viewport variants below are included in each row unless explicitly
listed otherwise. A retained case keeps its existing assertions.

## Original scenario dispositions

### report-glance.spec.ts

| Original scenario | Disposition and named coverage |
| --- | --- |
| delivered detail preserves recorded endpoint names at 1440px / 390px | Move to `components/delivered-report.spec.ts`, same two names and overflow assertions. Static facts: `report-presentation.test.ts` → `keeps recorded delivery names and coordinates independently of current planets`. |
| compact report tools combine filters and preserve their controls at 1280px / 390px | Retain application. Actual popover vs sheet focus, select geometry, dismiss focus return, stable controls, mobile selection entry and custom-age edit across viewport transitions. Filter/sort arithmetic remains `report-triage.test.ts` (`combines report type and status within the active folder`, `sorts exact resources, with stable newest/id ties and unknowns last in both directions`). |
| report glances expose historical mission facts in compact rows on desktop and phone | Previously retired, absent at base, **not recreated**. Keep November 9 recurrence record and existing report-preview/fleet-summary/model protection. |

### harvest-reports.spec.ts

| Original scenario | Disposition and named coverage |
| --- | --- |
| harvest reports distinguish new collections, zero collections and historical cargo at desktop and mobile sizes | Split. `report-preview-facts.test.ts` → `harvest row renders collected/zero/legacy facts without presenting carried cargo as a collection` checks the production row fragment, exact text, absence of carried cargo, resource count, accessible full names, tooltips and canonical color styles. `report-presentation.test.ts` → `renders collected/zero harvest quantities and canonical resource symbols without carried cargo`; existing `report-observation.test.ts` → `labels historical harvest cargo honestly without inventing a collection amount`. `components/harvest-report.spec.ts` → `harvest resources and ships stay grouped at desktop and phone widths` retains actual alignment, 12–32px gaps, colors and overflow at 1440/390. Report-list → detail → back is already retained by `delete and restore reports persist across list, detail and reload`; the harvest permutations add no route behavior. |

### combat-reports.spec.ts

| Original scenario | Disposition and named coverage |
| --- | --- |
| capture current small combat report | Retain as `combat small report preserves layout and contextual navigation`. Exact same fixture/assertions: coordinate context menu, Escape, moon navigation, actual disclosure and table geometry. **Retains its earlier readiness repair history.** |
| capture current huge combat report | Retain as `combat huge report preserves layout and contextual navigation`. Large forces, multiple tables/rounds and long unbroken names exercise distinct narrow-screen layout; exact quantities also belong to `combat-report-model.test.ts`. |
| capture current deuterium combat report | Retain as `combat deuterium report preserves layout and contextual navigation`. Prepare harvest must enter Dispatch with Harvest selected; this is application wiring. |
| capture current defender combat report | Move facts to `report-presentation.test.ts` → `renders defeat relative to the defender and separates ships from defenses`; moon identity already covered by `report-observation.test.ts` → `renders Combat historical body identity with shared fallbacks`; outcome permutations by `combat-report-model.test.ts` → `combat outcome is relative to the viewer`. Shared force layout is retained in small/huge and isolated shared-force checks. |
| capture current legacy combat report | Move to `report-presentation.test.ts` → `renders legacy combined fire without inventing participant damage or attacker locations`. Covers combined-only fire, counts, missing origin, recorded defender location, disclosure markup. Actual disclosure opening remains small/huge and explosion tests. Model: `attributes round fire by shooter identity, never infers it from casualties`, `uses only recorded target evidence for legacy defenders and never invents an attacker origin`. |
| capture current espionage combat report | Move to `report-presentation.test.ts` → `explains detected espionage combat and lost probes without showing loot`. Resource/model permutations: `only displays nonzero loot for the victorious attacker`. Force-table geometry is shared and retained. |
| explosion counter explanation / preserves the counter and explains it on hover, keyboard focus, and mobile tap | Retain application until its profile/focus context is separately isolated. Native hover, sequential Tab, Escape, touch dismissal and popup viewport containment cannot be proved by static markup. |
| shared combat participant locations visible / redacted | Move both unchanged geometry/force-card assertions to `components/shared-combat-report.spec.ts`; real production component with prepared participants, including two fleets of one owner. Deterministic model: `preserves explicit sharing redaction, unnamed coordinates, and missing location evidence` and `keeps historical locations with each force, including multiple fleets of one owner`. Public route loading remains report-sharing. |

### espionage-reports.spec.ts

| Original scenario | Disposition and named coverage |
| --- | --- |
| groups expanded espionage buildings and research at desktop and mobile widths | Retain application. Header/back/archive/time geometry and responsive level/art alignment, image loading, target actions, font hierarchy, canonical resource colors and footer ordering at 1440/768/390/320 remain actual UI assertions. |
| groups legacy espionage buildings and research at desktop and mobile widths | Consolidate geometry into retained expanded case. Facts: `report-observation.test.ts` → `renders observed research in report groups without inventing missing levels`, `renders only observed building levels under their subsection headings`, historical target fallbacks; `report-buildings.test.ts` → `keeps mines, power, storage and related facilities on separate titled rows`; `report-research.test.ts` → `groups all current research in explicit report order regardless of payload order`. |
| groups hidden espionage buildings and research at desktop and mobile widths | Move conditional content to `report-observation.test.ts` → `keeps hidden buildings distinct from an observed empty section`, `never renders research groups for unrevealed intelligence`. These assert that hidden payload values do not produce groups/names. Header/resource/footer geometry remains expanded. |
| long observed names wrap without moving levels or revealing hidden intelligence | Retain application. Native image loading, translated long-label wrapping, label/value alignment and overflow require a rendered layout; no static substitute claimed. |

### report-sharing.spec.ts

| Original scenario | Disposition and named coverage |
| --- | --- |
| public report is readable without game initialization at 390px / 1440px | Retain application. Public deep link, document title, exactly one API request and absent game initialization; independent public page layout. |
| a revoked report has a clear unavailable state | Retain application. Real failed public load must expose retry and withhold old report content. |
| sharing stars reports and warns before unstar at 390px / 1440px | Retain application. Keyboard open/focus, publication, clipboard fallback, shared-link restoration, cancellation/confirmation of unstar and revocation; distinct sheet/popover layouts. |
| public combat shows loot and keeps historical names without a profile session | Move to `report-presentation.test.ts` → `public combat preserves published names and loot without a profile session`, rendering actual `ReportObservation` with `shared` and no profile provider. Public fetch/render wiring remains public deep-link cases. |
| included coordinates and names work without account navigation | Retain application. Public coordinate context menu offers Copy but no account-only Galaxy action. |
| public espionage keeps building rows and paired research without planet moon entries at 1440px / 390px | Retain application. Public page has distinct available width; real desktop stacked labels vs mobile paired labels and art delivery remain asserted. Body-kind filtering also has deterministic coverage. |
| shared reports follow bot display at 1440px / 390px | Move to `report-presentation.test.ts` → `public espionage uses the published human/bot identity`, using real `PlayerKinds` provider and `ReportObservation`, no profile session. Static badge semantics do not need navigation or viewport repetition. |

### colonization.spec.ts

| Original scenario | Disposition and named coverage |
| --- | --- |
| colony position gates and full-capacity warning lead to an empty-position quote and one launch | Retain; shared startup failure remains unresolved for the parent validation owner (see below). Unique Galaxy menu → Dispatch → review/submit/reload command path; rules already covered in `client-model/colonization.test.ts`. |
| colonization success links to a usable colony | Retain application with its already-repaired report response boundary and `installGameFixture` startup. Open colony resources must select the newly founded body. |
| colonization failure explains conserved return | Move to `report-presentation.test.ts` → `explains Occupied/PositionLocked/ColonyCapacity/FutureReason colonization failure and conserved ships/cargo`. Adds all reason fallbacks, return-present and success return-absent coverage (`renders founding resources, colony facts and released slot without inventing a return`). No action was exercised in the removed failure case. Success retains the responsive report integration. |
| occupied colony positions retain the actionable error through shared dispatch validation | Retain application. Failed explicit review retains actionable UI while editing the destination. |
| dispatch blocks a known locked colony position and enables an eligible position | Retain application until dispatch owner's component validation migration lands; editable destination/disabled button wiring is not replaced by rule tests alone. |
| authoritative colony quote rejection explains the position research requirement | Retain existing controlled-clock behavior and its prior repair history. Checks advisory completion cannot replace the authoritative error. Dispatch owner controls further migration. |

### report-deletion.spec.ts

| Original scenario (all existing input/viewport variants) | Disposition and browser-specific rationale |
| --- | --- |
| archive and restore respond at the target edge without opening the row (320/390/800/1440) | Retain. Actual touch/pointer target geometry, glyph size, list/detail action edges and route independence. |
| delete and restore reports persist across list, detail and reload (1440/390) | Retain. Canonical/legacy deep link, reload, unread badge and folder/detail/back navigation. |
| failed and uncertain deletion roll back and offer durable recovery | Retain. Actual unified banner, row rollback, disabled control and durable Retry button wiring. |
| shared inbox preserves other reports during a pending deletion via click / Enter | Retain. Pointer and keyboard activation, pending UI and badge. State permutations also covered by report-state/engine tests. |
| opening a report marks it read after loading, clears the inbox badge and does not resubmit after refresh | Retain. Delivered-detail effect, badge, reload and re-entry are application wiring. |
| failed or abandoned report loads do not mark reports read | Retain. Retry and navigation away while a specific detail response is held. |
| independent deletes are optimistic and each failure rolls back only its report | Retain. Independent rows and unified expandable error stack interaction. Model rollback: `report-state.test.ts` → `projects deletion immediately and rolls back failures without mutating the source`. |
| a successful HTTP response confirms deletion before the game view refreshes | Retain. Detail returns while unrelated overview delivery is explicitly held. Model receipt: `reconciles a receipt without a game snapshot and resists stale list/detail responses`. |
| triage selection follows filters and rejected bulk cleanup restores reports | Retain. Actual filter controls reset selection; rejection stays visible. Filter calculations themselves remain unit-tested. |
| bulk cleanup restores every report after rejected / uncertain response at 1440px / 390px | Move four application cases to two `components/report-cleanup.spec.ts` cases: `bulk rejected/uncertain result restores every report and preserves the selection for review`. Mounts actual selection bar and cleanup hook; transport completion is explicitly delivered. Asserts optimistic hiding, protected row survival, unchanged authoritative source, retained selection, error and exactly one submission. The original viewport loop had no distinct layout assertion. Unified banner wording/durable Retry remains the single/detail failure cases above. Model batch permutations: `report-state.test.ts` → `projects every batch member immediately, rolls back the whole batch on failure and leaves other reports alone`. |
| report whitespace opens the report while controls and keyboard stay independent (1280/390) | Retain. Row hit areas, keyboard activation, nested controls and route behavior. |
| delete edges stay independent from row navigation (320/390/820, touch) | Retain. Four padded corners, disabled/starred edges, confirmation cancellation and submission. Prior disabled-control repair remains applicable. |
| HUD infinite paging waits for a pending report preference, then resumes | Retain. Actual HUD loading region and resumed shared list; engine permutations already in `pauses shared refresh/pagination for preferences, then resumes without losing optimistic reconciliation`. No HUD implementation edits. |
| bulk cleanup rate limit requires a player retry (1280/390) | Retain. Countdown/live-region behavior, explicit retry, notice portal identity across HUD/main, refresh pause and network recovery. Existing November 5 copy repair remains applicable. |
| a lost delete response is checked but retried only by the player (1280/390) | Retain. Durable state across document reload, same command identity on explicit retry, HUD portal notice/announcement behavior. |
| archive folder discovers old hidden reports and restores single and bulk selections (1440/390) | Retain. Folder navigation discovers history and selection actions actually restore it. Pagination/filter permutations remain report-engine/inbox/query tests. |
| Archive all reviews the entire Inbox and protects starred reports across filters (1440/390) | Retain. Actual review dialog scope and confirmation plus archived folder restoration. Protection arithmetic remains `report-cleanup.test.ts` → `submits one batch, deduplicating IDs and rechecking live protection`. |
| Archive all waits for complete history and preserves retry after rejection (1440/390) | Retain. Real disabled review action while history is held, dialog error and explicit second gesture. |
| detail archive returns only after acceptance with list context (1440/390) | Retain. Router history, saved scroll, filter/sort and originating folder restoration. |
| detail archive rejection and uncertainty stay recoverable (1440/390) | Retain. Failure must keep detail route and explicit durable Retry returns only on acceptance. |
| detail archive rate limit stays in detail and allows a fresh gesture (1440/390) | Retain. Cooldown cannot navigate; fresh gesture must navigate after acceptance. |
| leaving detail during archive does not pull the player back after acceptance | Retain. Late receipt must not override a newer report navigation. |
| archive age survives navigation and reopening without submitting (1280/390) | Retain. UI edit persistence through actual dialog dismissal/reopening and reload. Storage parsing permutations remain report-age-preference tests. |
| mark all read from reports / orb includes unloaded and archived reports (1280/390) | Retain. Distinct menu and HUD controls, action placement/size, shared badge update and navigation. Full-history batching remains `mark-all-reports-read.test.ts`; not re-creating retired range-selection journeys. |

## Repair history and validation

The November 9 historical-glance recurrence and November 3 unexplained desktop
range/bulk-read stalls remain retired. Do not recreate either under new names.
Combat readiness was repaired in the recovery work (CI run 41757041553); moving
or renaming a case here does not reset its repair count. Colony success had its
own overview-startup repair; authoritative colony rejection had an earlier
controlled-debounce repair in `3a2307b0`. The colony launch journey received
Galaxy-response gating in `3c4651a3`. Report reload/detail callers received the
shared response-boundary audit in `6292946b`. No GitHub incident is being used
to excuse a local assertion failure. A separate owner Test Czar ledger was not
available; this record and the repository repair ledger/history were read.

### Local checks and outstanding integration validation

Checks ran at the base SHA plus this scoped migration diff. The final handoff
commit records the exact source. No push, PR, merge or external publication was
performed. No execution timeout, assertion timeout or retry setting changed.

- Dependency preparation: `npm ci --ignore-scripts`, 21s. Initial shell used
  Node 23.3/npm 10.9 and emitted engine warnings; subsequent validation explicitly
  used `PATH=/opt/homebrew/opt/node@24/bin:$PATH` (Node 24.18). No dependency edits.
- Focused content/model run: 6 files / 87 tests, 12.40s. One **new-test authoring
  error** expected the `data-coordinate` marker to contain coordinate text; actual
  production markup intentionally uses an empty marker and nested coordinate
  text. Corrected the assertion to two markers while retaining both exact
  historical coordinate strings. Not a product defect or unexplained retry.
- Follow-up focused run: report-presentation, report-cleanup, report-visibility,
  report-selection, report-state, report-triage, report-engine and colonization:
  **8 files / 84 tests passed**, 7.87s. This includes the corrected content test.
- New report-preview-facts run: two **new-test authoring errors** expected
  capitalized resource names, while the existing row contract uses full lowercase
  names (the original browser assertions did too). Corrected case only; retained
  exact full names, icon counts, tooltips, colors and quantities. Final **4 tests
  passed**, 3.06s. The initial failed run took 1.71s. No production output changed.
- Isolated delivered, harvest and shared-combat browser checks: **5 passed**, one
  worker; 6.403s preparation and 8.7s runner time. Real geometry and canonical
  color assertions executed without API requests.
- Isolated cleanup hook/selection checks: **2 passed**, one worker; 20.481s
  preparation and 12.1s runner time. Both controlled completions settled.
- Focused ESLint (changed production files, new component specs/entry and scoped
  application specs) passed. Two pre-existing unused imports/bindings in the
  scoped browser files were cleaned up without changing fixture data.
- Root TypeScript and component TypeScript passed. A duplicate component typecheck
  started before the parent's resource coordination notice completed successfully
  before the attempted task-scoped stop. No further browser/build/typecheck run
  was started after that notice.
- Formatting passed for all changed production files and new component files;
  existing application spec formatting was preserved to keep review scoped.

Application browser command:

```
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run test:ui -- report-glance.spec.ts report-deletion.spec.ts report-sharing.spec.ts combat-reports.spec.ts espionage-reports.spec.ts colonization.spec.ts --workers=1
```

Preparation: 24.957s; Playwright: 493.199s. **27 passed, 3 failed at shared
startup, 1 interrupted, 33 not run**. No retries. Parent reported host load 45.5
on 12 cores with concurrent Vite/Chromium/TypeScript workers and requested a
serial validation window. This run was stopped with SIGINT to its own runner;
its Vite/browser cleanup completed. The interrupted HUD case was waiting for
`requestfinished` when cancellation occurred; it is not an assertion failure.

All three actual failures are the same `shellFixture` assertion at
`apps/web/tests/fixtures/game.ts:487`, before the test reaches its own report or
colony interactions: `main h1` did not exist within the unchanged 5-second
assertion. Names:

1. `colony position gates and full-capacity warning lead to an empty-position quote and one launch`
2. `report whitespace opens the report while controls and keyboard stay independent at 1280px`
3. `delete edges stay independent from row navigation at 390px`

The retained failure snapshots subsequently show the populated Empire overview.
Evidence is under this worktree's `test-results/browser-ui/results.json` and each
named failure directory (error context plus PNG). Host contention is observed;
it is **not by itself a demonstrated cause** of these assertion failures. No
scenario was deleted or given another repair on that inference. Parent owns the
shared fixture and serial classification/follow-through, including its existing
repair history. The migration cannot be called fully browser-validated yet.

A separate known fixture defect appeared in passing coverage: the locked-colony
position scenario allowed advisory Galaxy requests to reach a real localhost
backend. It now explicitly fulfills only typed Galaxy queries and still asserts
that no ResolveDestination/FleetQuote requests occur. This final fixture change
needs the parent's serial browser validation; it was not rerun here.

No visible UI behavior/style change is intended. The row fragment extraction
preserves the original markup. Current desktop/mobile visual captures for that
extraction remain pending because the parent paused additional browser work.
The seven isolated checks above verified their actual geometry, but they are
not claimed as final application screenshot review.

Integration instructions: use the parent's component runner/fixture already in
progress; no scenario registry edit is needed. Remove the now-deleted
`harvest-reports.spec.ts` entry from the parent-owned routine application list,
and include the four new component spec files through the component runner.
The complete 82-case original inventory becomes 64 application cases plus 7
isolated component cases and deterministic/static replacements. This scoped
inventory does not claim the entire application's small gate is configured.
The parent owns final gate selection and full validation. Explicit acceptance
was not run. No database, Docker project or backend server process was started. Task-owned Vite
servers were closed by their runners. Copies of the parent's in-progress component
runner, fixture and entry scaffold were used locally for validation and removed
afterward; none is included in this scoped commit.

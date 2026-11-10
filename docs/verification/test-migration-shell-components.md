# Shell component test migration

Base: `a119915ffaeb881a7f54d65542478f4788bd4210`. Owner: shell component migration chat. The inventory below was expanded by Playwright 1.56.1 before editing: **102 application cases** (77 shell, 16 desktop navigation, 9 mobile selection). The first migration (`37ce097e`) retained 85 application cases and authored 35 isolated component cases (19 passed locally, 16 pending parent validation). The separately prepared consolidation below retains 80 application cases; apply it only after the parent verifies all 16 replacements. This is a bounded migration, not a claim that the remaining application suite is now the desired small gate.

## Production seam

`GameShellFrame` owns the existing shell DOM, sticky-header measurement, Navigation, BodySelector and ResourceStrip composition. `GameShell` retains route resolution, canonicalization, focus, presence recording, session effects, ScreenContext, content and CommandHud. No CSS, resource-settings implementation, router core, HUD or progression production modules changed. The prepared story uses the real frame, real Coordinator store, real tutorial state and a minimal memory router for production links; it starts no transport clients. Its content and navigation callback output are fixture slots, not replacements for application routing. The original application journeys retain that coverage.

## Integrated selection failure: single explained repair

The parent's first integrated Node 24 component run reported 257 passed / 15
failed in 287.222 s with one worker. Evidence is preserved in
`test-results/test-strategy/components-integrated/results.json` and the
corresponding per-case errors/screenshots; runner log:
`/tmp/orbit-components-integrated.log`. All 30 other shell component cases
passed. Each of the five `shell-selection.component.spec.ts` input modes failed
at the same strict locator check, before its selection-CSS assertion:
`getByText('Available', { exact: false })` matched both the available-amount
paragraph (`Available 6,661`) and `Flow unavailable` in the production-rate
paragraph. The prepared story intentionally has no production-rate observation;
this is valid state, not a product defect or a timing/infrastructure failure.

History: this selector was introduced in `37ce097e`; no previous repair to these
five selection cases appears in their Git history or the repository repair
ledger. The prior inactive-tutorial repair concerned the separately executed
layout/control cases, not these then-unrun selection cases. The original
application fixture supplies production rates, which explains why its substring
selector did not expose this ambiguity. Auditing the current test tree found no
other equivalent substring selector; the catalog test uses an exact match in a
different table and is unaffected.

**One explained test repair:** select the actual paragraph whose text starts
with the `Available` label:
`details.locator('p').filter({ hasText: /^Available\b/ })`.
The existing helper still requires that paragraph to be visible and its
`-webkit-user-select` value not to be `none`. No `.first()`, assertion removal,
fixture alteration, production change, timeout change or retry was introduced.
The five-mode copying/selection contract and remaining interactions are intact.

Only source syntax/format/whitespace checks run in this chat. The parent owns
serial browser validation; this record does not claim the repair passes.
Apply this repair before evaluating the pending application consolidation
`1b5c9afeec973a1c1b036868d9b57ecf56a69a5b`. Keep the original five application
selection cases and their shell assertions until all five repaired replacements
pass. The consolidation's 11 navigation replacements passed in the integrated
run; its selection prerequisite remains open. A repeated test failure must be
handled under the one-repair rule, not another stabilization patch.

## Parent integration

Register these imports from `./shell.story` in `apps/web/tests/components/main.tsx`:

```tsx
import {
  ShellDefault, ShellNamed, ShellWorlds, ShellRoster,
  ShellBadges, ShellLargeStocks, ShellWideStocks,
} from './shell.story'

'shell-default': ShellDefault,
'shell-named': ShellNamed,
'shell-worlds': ShellWorlds,
'shell-roster': ShellRoster,
'shell-badges': ShellBadges,
'shell-large-stocks': ShellLargeStocks,
'shell-wide-stocks': ShellWideStocks,
```

The parent-owned main/fixture/index/tsconfig, Vite/Playwright configs and runner were copied temporarily for local execution and are not part of this commit. No package, Make, CI or shared-fixture changes are included.

## Validation and remaining integration

- Focused component run: `npm run test:ui -- --components shell-layout.component.spec.ts shell-controls.component.spec.ts --workers=1`: **19 passed**, 20.676 s module preparation and 84.421 s Playwright elapsed. No retries. This ran on host Node 23.3.0 before the parent requested pinned Node 24.18.0; repeat under the pinned runtime in the serial integration window.
- Initial component run: 3 passed, one interrupted, 7 not run; 12.637 s module preparation and approximately 2.3 min Playwright elapsed. The stopped action was `Develop navigation` → `Defense` → `locator.focus`. The screenshot showed only Resources in the submenu. Cause: the prepared protocol-4 store lacked the inactive tutorial response supplied by the original HTTP fixture; production `tutorialPages(null, view)` intentionally hides Defense while guidance is loading. One story repair prepared the typed inactive full-interface tutorial state. The complete affected run then passed. This is a fixture defect, not an inferred infrastructure failure; no test was deleted to hide it. The first trace/screenshot were inspected; the runner reset its output directory on the second run, so the original retained evidence is the originating chat tool output plus this record.
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH npm test -- apps/web/src/shell/navigation-activity.test.ts apps/web/src/shell/navigation-model.test.ts`: **18 passed**, 1.39 s Vitest elapsed. Existing deterministic cases cover per-body resource/facility construction, account-wide research, producing/queued batches, remaining-zero entries, missile categories, pending/uncertain/rejected work, lab/yard/nanite blockers, and reconciliation.
- Focused ESLint for both changed production files and Prettier for both production files/all five shell component files passed. An initial component TypeScript check passed before the inactive tutorial setup and later component tests; the final typecheck was stopped at the parent’s host-contention request. Final typecheck is pending.
- **Parent validation gate for the separate consolidation:** `shell-navigation.component.spec.ts` (11 viewport/layout cases) and `shell-selection.component.spec.ts` (5 input-mode cases) were not rerun in this chat. The parent is validating the integrated component suite serially on Node 24. The follow-up application consolidation is prepared, not validation-approved; apply only after all 16 replacement cases pass. It preserves unrelated catalog/HUD/public/content assertions.
- Revised application journeys (body default/dossier/history/reload; touch sidebar Settings/Facilities) and the retained cross-route identity test must run in the parent’s serial window. No application cases were moved to nonblocking suites or disabled.
- Required desktop/mobile visual capture and inspection of the final running application remain **pending** because the parent explicitly paused new browser/build/typecheck launches after measuring host load 45.5 on 12 cores. Optional component captures are wired through the existing diagnostic helper (no preparation when disabled), with screen/state/dimensions in their filenames. Run with `ORBIT_TEST_SCREENSHOTS=1`; also capture the actual application shell at desktop and phone widths before accepting this UI seam. No final visual-correctness claim is made.
- Both local component runner processes exited and released their Vite/browser resources. The pending full typecheck was terminated only after verifying its worktree. No other chat’s process was stopped. Runner wait and merge delay are not applicable (local-only; no push/PR/merge).

## Separate application consolidation (prepared after `37ce097e`)

**Apply only after all 16 replacement cases pass in the parent integration run.**
No production, component, runner, shared fixture, or configuration file changes
are included in this follow-up. No browser, build, or typecheck was launched.
The parent owns validation of the resulting application journeys as well.
Local preparation checks: both edited specs parsed without TypeScript syntax
diagnostics under pinned Node 24; the new desktop blocks were formatted with
the repository Prettier configuration; `git diff --check` passed. These are
source checks, not browser or typecheck results.

The four desktop geometry/text-scale scenarios consolidate into
`desktop navigation preserves body history, reload and report refresh` at
1440×900. It retains the nine-world fixture, actual Develop/Research routing,
keyboard activation and destination heading focus, current-page semantics,
colony selection, Back, canonical body URLs, response-gated reload, post-reload
pinned shell/account focus, live unread-report refresh, Reports routing,
reconciliation and zero purchases. The four matching component cases retain
sidebar position/height, viewport containment, sidebar/world separation,
brand/navigation content, scroll behavior, account access/focus, and badge
containment at 1024×600/100%, 1440×900/100%, 1440×700/200%, and 2560×1100/100%.

The two desktop-only breakpoint cases (1024 and 1440px) move completely to
`navigation uses exactly one bottom bar or sidebar` at the same widths.
The five bottom-bar cases (390, 767, 768, 961, 1023px) remain as
`command HUD stays above bottom navigation and Menu opens at …px`: the fixture
component omits CommandHud and the real Menu screen, so every original
HUD-to-dock bound, Menu activation, and post-Menu overflow assertion stays.
The seven matching component cases own fixed bar/sidebar position, bottom/edge
alignment, exactly-one navigation, scrolling stability and shell overflow.

All five selection modes remain application cases. Only the matching shell
subset moves: Develop/desktop brand/energy-link selection CSS, Metal trigger
selection, opening Metal details and copyable Available content, body selector
and option selection CSS, and popup dismissal. The component has the same five
input configurations, including installed-iOS preparation. Original coordinate
copying, catalog-tile selection/touch-callout, actual detail route and Back,
figcaption copying, Galaxy fleet-slot tooltip, and HUD control/content selection
remain in the application cases. Their media-capability guards and all four
other public/content/editing cases are unchanged. Cross-route shell identity,
logout/session, touch Settings/Facilities, tablet energy navigation, mobile menu
history and body dossier/history/reload tests are untouched.

Result: 61 shell + 10 desktop navigation + 9 mobile selection = **80 application
cases** (five fewer than the first commit). This is coverage consolidation,
not deletion under the failure policy; no repair history is reset. The 13
baseline failures below are untouched and remain unresolved by this follow-up.

## Dispositions

Every expanded original case appears once below. “Retained pending” means the original application test remains selected. Rows marked “Prepared consolidation” describe the separate conditional follow-up above, whose replacement validation is owned by the parent. The parent owns integration and coordination with the named feature owner.

| Original file:line | Expanded scenario | Disposition / named replacement |
| --- | --- | --- |
| `desktop-navigation.spec.ts:8` | desktop navigation preserves context, scrolling and alerts at 1024x600, 100% text | Prepared consolidation: matching `shell-navigation.component.spec.ts` → `desktop navigation keeps its geometry, scrolling and alerts` at this exact size/text scale; actual route focus/body history/reload/live refresh remain once in `desktop navigation preserves body history, reload and report refresh` (1440×900). Parent must verify replacements before applying. |
| `desktop-navigation.spec.ts:8` | desktop navigation preserves context, scrolling and alerts at 1440x900, 100% text | Prepared consolidation: matching `shell-navigation.component.spec.ts` → `desktop navigation keeps its geometry, scrolling and alerts` at this exact size/text scale; actual route focus/body history/reload/live refresh remain once in `desktop navigation preserves body history, reload and report refresh` (1440×900). Parent must verify replacements before applying. |
| `desktop-navigation.spec.ts:8` | desktop navigation preserves context, scrolling and alerts at 1440x700, 200% text | Prepared consolidation: matching `shell-navigation.component.spec.ts` → `desktop navigation keeps its geometry, scrolling and alerts` at this exact size/text scale; actual route focus/body history/reload/live refresh remain once in `desktop navigation preserves body history, reload and report refresh` (1440×900). Parent must verify replacements before applying. |
| `desktop-navigation.spec.ts:8` | desktop navigation preserves context, scrolling and alerts at 2560x1100, 100% text | Prepared consolidation: matching `shell-navigation.component.spec.ts` → `desktop navigation keeps its geometry, scrolling and alerts` at this exact size/text scale; actual route focus/body history/reload/live refresh remain once in `desktop navigation preserves body history, reload and report refresh` (1440×900). Parent must verify replacements before applying. |
| `desktop-navigation.spec.ts:88` | sidebar uses full touch targets on a large touch viewport | Split: `shell-controls.component.spec.ts` → `sidebar and account menu retain full touch targets` (passed); `desktop-navigation.spec.ts` → `touch sidebar opens Settings and Facilities in the application` retains actual route wiring. |
| `desktop-navigation.spec.ts:112` | tablet brand keeps a full touch target without overlapping resource controls | Retained application: same named case, real resource-settings/menu/history/logout wiring and current geometry assertions. |
| `desktop-navigation.spec.ts:156` | navigation always uses a bottom bar or sidebar at 390px | Prepared split: matching `shell-navigation.component.spec.ts` → `navigation uses exactly one bottom bar or sidebar` owns fixed geometry and scroll stability. Application `command HUD stays above bottom navigation and Menu opens at 390px` preserves HUD placement, real Menu activation and post-Menu overflow. Parent must verify replacement before applying. |
| `desktop-navigation.spec.ts:156` | navigation always uses a bottom bar or sidebar at 767px | Prepared split: matching `shell-navigation.component.spec.ts` → `navigation uses exactly one bottom bar or sidebar` owns fixed geometry and scroll stability. Application `command HUD stays above bottom navigation and Menu opens at 767px` preserves HUD placement, real Menu activation and post-Menu overflow. Parent must verify replacement before applying. |
| `desktop-navigation.spec.ts:156` | navigation always uses a bottom bar or sidebar at 768px | Prepared split: matching `shell-navigation.component.spec.ts` → `navigation uses exactly one bottom bar or sidebar` owns fixed geometry and scroll stability. Application `command HUD stays above bottom navigation and Menu opens at 768px` preserves HUD placement, real Menu activation and post-Menu overflow. Parent must verify replacement before applying. |
| `desktop-navigation.spec.ts:156` | navigation always uses a bottom bar or sidebar at 961px | Prepared split: matching `shell-navigation.component.spec.ts` → `navigation uses exactly one bottom bar or sidebar` owns fixed geometry and scroll stability. Application `command HUD stays above bottom navigation and Menu opens at 961px` preserves HUD placement, real Menu activation and post-Menu overflow. Parent must verify replacement before applying. |
| `desktop-navigation.spec.ts:156` | navigation always uses a bottom bar or sidebar at 1023px | Prepared split: matching `shell-navigation.component.spec.ts` → `navigation uses exactly one bottom bar or sidebar` owns fixed geometry and scroll stability. Application `command HUD stays above bottom navigation and Menu opens at 1023px` preserves HUD placement, real Menu activation and post-Menu overflow. Parent must verify replacement before applying. |
| `desktop-navigation.spec.ts:156` | navigation always uses a bottom bar or sidebar at 1024px | Prepared consolidation: matching `shell-navigation.component.spec.ts` → `navigation uses exactly one bottom bar or sidebar` at this width owns sidebar visibility/fixed position, exactly-one navigation and shell overflow. No HUD/Menu assertions existed in this desktop branch. Parent must verify replacement before applying. |
| `desktop-navigation.spec.ts:156` | navigation always uses a bottom bar or sidebar at 1440px | Prepared consolidation: matching `shell-navigation.component.spec.ts` → `navigation uses exactly one bottom bar or sidebar` at this width owns sidebar visibility/fixed position, exactly-one navigation and shell overflow. No HUD/Menu assertions existed in this desktop branch. Parent must verify replacement before applying. |
| `desktop-navigation.spec.ts:189` | shrinking the desktop account menu closes its portal and focuses the mobile menu | Moved: `shell-controls.component.spec.ts` → `shrinking the account menu closes its portal and returns focus to the mobile menu` (passed). Enter-to-menu destination wiring remains in both `menu page preserves tab navigation, history and settings access` cases. |
| `desktop-navigation.spec.ts:210` | menu page preserves tab navigation, history and settings access at 390px | Retained application: same named case, real resource-settings/menu/history/logout wiring and current geometry assertions. |
| `desktop-navigation.spec.ts:210` | menu page preserves tab navigation, history and settings access at 320px | Retained application: same named case, real resource-settings/menu/history/logout wiring and current geometry assertions. |
| `mobile-selection.spec.ts:155` | mobile browser / controls suppress touch selection while content and desktop copying remain available | Prepared split: `shell-selection.component.spec.ts` → `shell controls suppress touch selection while resource details remain copyable` in this exact mode owns the shell selection/popup subset. Same original application case retains coordinate/catalog/detail/Galaxy/HUD selection, actual route changes, media guard and installed-mode setup. Parent must verify replacement before applying. |
| `mobile-selection.spec.ts:155` | installed iOS / controls suppress touch selection while content and desktop copying remain available | Prepared split: `shell-selection.component.spec.ts` → `shell controls suppress touch selection while resource details remain copyable` in this exact mode owns the shell selection/popup subset. Same original application case retains coordinate/catalog/detail/Galaxy/HUD selection, actual route changes, media guard and installed-mode setup. Parent must verify replacement before applying. |
| `mobile-selection.spec.ts:155` | landscape tablet / controls suppress touch selection while content and desktop copying remain available | Prepared split: `shell-selection.component.spec.ts` → `shell controls suppress touch selection while resource details remain copyable` in this exact mode owns the shell selection/popup subset. Same original application case retains coordinate/catalog/detail/Galaxy/HUD selection, actual route changes, media guard and installed-mode setup. Parent must verify replacement before applying. |
| `mobile-selection.spec.ts:155` | desktop / controls suppress touch selection while content and desktop copying remain available | Prepared split: `shell-selection.component.spec.ts` → `shell controls suppress touch selection while resource details remain copyable` in this exact mode owns the shell selection/popup subset. Same original application case retains coordinate/catalog/detail/Galaxy/HUD selection, actual route changes, media guard and installed-mode setup. Parent must verify replacement before applying. |
| `mobile-selection.spec.ts:155` | narrow desktop / controls suppress touch selection while content and desktop copying remain available | Prepared split: `shell-selection.component.spec.ts` → `shell controls suppress touch selection while resource details remain copyable` in this exact mode owns the shell selection/popup subset. Same original application case retains coordinate/catalog/detail/Galaxy/HUD selection, actual route changes, media guard and installed-mode setup. Parent must verify replacement before applying. |
| `mobile-selection.spec.ts:277` | touch editing and visual audit / mixed navigation content and public links retain native selection | Retained pending cross-feature component integration: same input mode/case remains. Public footer, rankings, alliance, detail editing, technology tabs, HUD and action-sheet behavior are not replaced by the shell story. Parent coordinates their feature owners; all existing assertions remain selected. |
| `mobile-selection.spec.ts:373` | touch editing and visual audit / game screens and popup content retain their intended selection behavior | Retained pending cross-feature component integration: same input mode/case remains. Public footer, rankings, alliance, detail editing, technology tabs, HUD and action-sheet behavior are not replaced by the shell story. Parent coordinates their feature owners; all existing assertions remain selected. |
| `mobile-selection.spec.ts:277` | desktop editing and visual audit / mixed navigation content and public links retain native selection | Retained pending cross-feature component integration: same input mode/case remains. Public footer, rankings, alliance, detail editing, technology tabs, HUD and action-sheet behavior are not replaced by the shell story. Parent coordinates their feature owners; all existing assertions remain selected. |
| `mobile-selection.spec.ts:373` | desktop editing and visual audit / game screens and popup content retain their intended selection behavior | Retained pending cross-feature component integration: same input mode/case remains. Public footer, rankings, alliance, detail editing, technology tabs, HUD and action-sheet behavior are not replaced by the shell story. Parent coordinates their feature owners; all existing assertions remain selected. |
| `shell.spec.ts:20` | supporter claims color the shared account identity after sign-in and clear on refresh | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:88` | work summary links stay contextual with idle construction | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:88` | work summary links stay contextual with MetalMine construction | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:88` | work summary links stay contextual with ResearchLab construction | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:195` | cold Defense navigation retains named universe and planet through preloading, switching and direct loads | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:247` | mobile resource stock uses icons and compact balances with capacity details on tap | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:333` | mobile planet selector grows into free space while resource widths stay fixed | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:368` | mobile top bar stays pinned while content scrolls beneath it and details remain usable | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:413` | mobile Develop submenu spans the 320px viewport and stays below resources while scrolling | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:413` | mobile Develop submenu spans the 390px viewport and stays below resources while scrolling | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:470` | desktop header dividers align with content at 768px | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:470` | desktop header dividers align with content at 1440px | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:470` | desktop header dividers align with content at 1920px | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:494` | Fleets navigation helper opens the fleet list with protocol 3 | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:494` | Fleets navigation helper opens the fleet list with protocol 4 | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:507` | mobile planet box is one tap target with rich planet and moon labels | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:536` | small phone resource row fits large stocks and negative energy without stacking | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:585` | shipyard and defense show every batch and total completion at 320px | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:585` | shipyard and defense show every batch and total completion at 390px | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:585` | shipyard and defense show every batch and total completion at 1440px | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:865` | overview cancels active construction after 0ms and prevents duplicate cancellation | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:865` | overview cancels active construction after 60000ms and prevents duplicate cancellation | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:865` | research page cancels active research after 0ms and prevents duplicate cancellation | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:865` | research page cancels active research after 60000ms and prevents duplicate cancellation | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:975` | compact shell exposes resource details and switches bodies without purchases | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1016` | planet ledger retains its borders beside the desktop sidebar | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:1071` | shell fits desktop and touch viewports with keyboard menu navigation | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1148` | touch energy navigation and resource details remain usable with enlarged text | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1187` | world shell omits the utility row and opens defense production from its summary | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1232` | phone keeps the thumb dock and world controls usable on the menu page | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1267` | mobile menu page signs out through the existing account session | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1284` | overview preserves rich work, exact inventory, incoming visibility and responsive composition | Retained pending next shell/overview slice: same named case and all motion/image/tablet/content assertions remain. Parent integration owns the follow-up; do not deselect from this commit. |
| `shell.spec.ts:1384` | navigation retains the ledger through cold art, rapid routes and reduced motion | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1411` | large world rosters scroll and retain funding context on player-wide routes | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1433` | navigation keeps shell identity mounted through rapid route changes | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1497` | disconnection preserves selected world, ledger and urgent fleet navigation | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1522` | fleet trajectory retains exact mission facts and requires recall review | Retained pending Dispatch/HUD/fleet-owner integration: same named case remains; browser gesture/trajectory/recall and model permutations need distinct replacements. |
| `shell.spec.ts:1689` | secondary pages retain empty, unavailable and settings states at phone width | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:1738` | dispatch fences changed drafts and keeps uncertain launch recovery in action notices | Retained pending Dispatch/HUD/fleet-owner integration: same named case remains; browser gesture/trajectory/recall and model permutations need distinct replacements. |
| `shell.spec.ts:1937` | legacy fleets retain trajectory, exact arrival and reviewed recall | Retained pending Dispatch/HUD/fleet-owner integration: same named case remains; browser gesture/trajectory/recall and model permutations need distinct replacements. |
| `shell.spec.ts:1991` | selected body context truncates on phones and retains full labels and accessible route focus | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:2071` | construction stays in queues and details without a shared footer at 390px | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:2071` | construction stays in queues and details without a shared footer at 1440px | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:2107` | phone Develop navigation keeps full-size links on one keyboard-scrollable row | Moved: `shell-layout.component.spec.ts`, same expanded scenario title; real DOM/geometry assertions retained. Passed. |
| `shell.spec.ts:2141` | failed world images settle without browser broken-image borders or lost controls | Retained pending next shell/overview slice: same named case and all motion/image/tablet/content assertions remain. Parent integration owns the follow-up; do not deselect from this commit. |
| `shell.spec.ts:2167` | server recall eligibility survives an elapsed client countdown | Retained pending Dispatch/HUD/fleet-owner integration: same named case remains; browser gesture/trajectory/recall and model permutations need distinct replacements. |
| `shell.spec.ts:2251` | navigation limits motion to desktop hover colors at 390px with no-preference | Retained pending next shell/overview slice: same named case and all motion/image/tablet/content assertions remain. Parent integration owns the follow-up; do not deselect from this commit. |
| `shell.spec.ts:2251` | navigation limits motion to desktop hover colors at 1280px with no-preference | Retained pending next shell/overview slice: same named case and all motion/image/tablet/content assertions remain. Parent integration owns the follow-up; do not deselect from this commit. |
| `shell.spec.ts:2251` | navigation limits motion to desktop hover colors at 390px with reduce | Retained pending next shell/overview slice: same named case and all motion/image/tablet/content assertions remain. Parent integration owns the follow-up; do not deselect from this commit. |
| `shell.spec.ts:2251` | navigation limits motion to desktop hover colors at 1280px with reduce | Retained pending next shell/overview slice: same named case and all motion/image/tablet/content assertions remain. Parent integration owns the follow-up; do not deselect from this commit. |
| `shell.spec.ts:2324` | unread reports light the menu and report link at 320px with 100% text and reconcile | Retained pending reports-owner integration: same named case remains. ShellBadges is representative rendering only; it does not replace report-response reconciliation or report-page navigation. |
| `shell.spec.ts:2324` | unread reports light the menu and report link at 320px with 200% text and reconcile | Retained pending reports-owner integration: same named case remains. ShellBadges is representative rendering only; it does not replace report-response reconciliation or report-page navigation. |
| `shell.spec.ts:2324` | unread reports light the menu and report link at 390px with 100% text and reconcile | Retained pending reports-owner integration: same named case remains. ShellBadges is representative rendering only; it does not replace report-response reconciliation or report-page navigation. |
| `shell.spec.ts:2324` | unread reports light the menu and report link at 390px with 200% text and reconcile | Retained pending reports-owner integration: same named case remains. ShellBadges is representative rendering only; it does not replace report-response reconciliation or report-page navigation. |
| `shell.spec.ts:2324` | unread reports light the menu and report link at 768px with 100% text and reconcile | Retained pending reports-owner integration: same named case remains. ShellBadges is representative rendering only; it does not replace report-response reconciliation or report-page navigation. |
| `shell.spec.ts:2324` | unread reports light the menu and report link at 768px with 200% text and reconcile | Retained pending reports-owner integration: same named case remains. ShellBadges is representative rendering only; it does not replace report-response reconciliation or report-page navigation. |
| `shell.spec.ts:2423` | tablet header pins identity and resources above the bottom navigation at 768px | Retained pending next shell/overview slice: same named case and all motion/image/tablet/content assertions remain. Parent integration owns the follow-up; do not deselect from this commit. |
| `shell.spec.ts:2480` | tablet brand stays aligned with a large world roster at 768px | Retained pending next shell/overview slice: same named case and all motion/image/tablet/content assertions remain. Parent integration owns the follow-up; do not deselect from this commit. |
| `shell.spec.ts:2543` | active building and research cards retain timing and touch targets at 320px | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:2543` | active building and research cards retain timing and touch targets at 390px | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:2543` | active building and research cards retain timing and touch targets at 1440px | Retained pending progression-owner integration: same named case and assertions remain; no progression module changed here. |
| `shell.spec.ts:2583` | empty reports wait for a successful response and offer planet-aware navigation at every size | Retained pending reports-owner integration: same named case remains. ShellBadges is representative rendering only; it does not replace report-response reconciliation or report-page navigation. |
| `shell.spec.ts:2677` | failed report requests do not claim the archive is empty | Retained pending reports-owner integration: same named case remains. ShellBadges is representative rendering only; it does not replace report-response reconciliation or report-page navigation. |
| `shell.spec.ts:2696` | incoming attacks stay in the phone viewport when there are no outgoing fleets | Retained pending Dispatch/HUD/fleet-owner integration: same named case remains; browser gesture/trajectory/recall and model permutations need distinct replacements. |
| `shell.spec.ts:2736` | rich planet selector shows acquisition order and supports keyboard and pointer at 320px | Split: `shell-controls.component.spec.ts` → `body selector preserves labels, keyboard, pointer and focus` at the same width (passed); `shell.spec.ts` → `body selection retains its default dossier, history and reload at 390px` retains route/default-dossier/history/reload/purchase invariants once. |
| `shell.spec.ts:2736` | rich planet selector shows acquisition order and supports keyboard and pointer at 390px | Split: `shell-controls.component.spec.ts` → `body selector preserves labels, keyboard, pointer and focus` at the same width (passed); `shell.spec.ts` → `body selection retains its default dossier, history and reload at 390px` retains route/default-dossier/history/reload/purchase invariants once. |
| `shell.spec.ts:2736` | rich planet selector shows acquisition order and supports keyboard and pointer at 1440px | Split: `shell-controls.component.spec.ts` → `body selector preserves labels, keyboard, pointer and focus` at the same width (passed); `shell.spec.ts` → `body selection retains its default dossier, history and reload at 390px` retains route/default-dossier/history/reload/purchase invariants once. |
| `shell.spec.ts:2844` | rich planet selector scrolls a large roster and selects by touch in a short viewport | Moved: `shell-controls.component.spec.ts` → `body selector scrolls a large roster and selects by touch`. Passed; isolated API rejection replaces the irrelevant purchase counter. |
| `shell.spec.ts:2889` | mobile hostile fleet pulse follows incoming Attack across planets and clears on reconciliation | Retained pending Dispatch/HUD/fleet-owner integration: same named case remains; browser gesture/trajectory/recall and model permutations need distinct replacements. |
| `shell.spec.ts:2889` | mobile hostile fleet pulse follows incoming Espionage across planets and clears on reconciliation | Retained pending Dispatch/HUD/fleet-owner integration: same named case remains; browser gesture/trajectory/recall and model permutations need distinct replacements. |
| `shell.spec.ts:2966` | Develop activity badges follow each planet and account-wide research at 390px | Split: `shell-controls.component.spec.ts` → `navigation renders work and blocked badges and clears alerts` at the same width (passed). Domain permutations: `navigation-activity.test.ts` → `marks account-wide research on either planet and independently marks producing and queued units`, `marks %s construction only in %s on its planet until the server clears it`, and `derives categories blocked by %s until construction is cleared` (passed). Blocked-link activation, badge colors/labels and clearing remain browser checks. |
| `shell.spec.ts:2966` | Develop activity badges follow each planet and account-wide research at 1440px | Split: `shell-controls.component.spec.ts` → `navigation renders work and blocked badges and clears alerts` at the same width (passed). Domain permutations: `navigation-activity.test.ts` → `marks account-wide research on either planet and independently marks producing and queued units`, `marks %s construction only in %s on its planet until the server clears it`, and `derives categories blocked by %s until construction is cleared` (passed). Blocked-link activation, badge colors/labels and clearing remain browser checks. |
| `shell.spec.ts:2524` | planet-scoped gameplay routes retain context and redirect old query URLs / research | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:2524` | planet-scoped gameplay routes retain context and redirect old query URLs / fleets | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:2524` | planet-scoped gameplay routes retain context and redirect old query URLs / galaxy | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:2524` | planet-scoped gameplay routes retain context and redirect old query URLs / dispatch | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |
| `shell.spec.ts:2524` | planet-scoped gameplay routes retain context and redirect old query URLs / reports | Retained application: same named case; covers route/session/focus/history or cross-route wiring. |

## Parent baseline failure audit

The parent supplied `test-results/test-strategy/baseline-a119915f/results.json`: 1,167 passed and 16 failed across the full baseline. Thirteen failures belong to this inventory. I inspected each error and its `error-context.md`; the failure records refer to these preserved `test-results/browser-ui/` directories:

| Baseline failures | Evidence and classification | Disposition |
| --- | --- | --- |
| Fleet trajectory recall: 1 | `shell-fleet-trajectory-ret-85e30--and-requires-recall-review`: the 5-second assertion saw zero ship-composition items after an art-failure reload; the captured DOM later contains the expanded Transport fleet and `Small Cargo 4`. | Unclassified late rendering, not proof of an invalid selector or product defect. Keep the test; fleet/Dispatch owner and parent own a component/detail split and serial verification. |
| Construction stays in queues: 390px and 1440px | `shell-construction-stays-i-d3dc9-ut-a-shared-footer-at-390px` and `shell-construction-stays-i-be3c9-t-a-shared-footer-at-1440px`: missing `main h1` after successful bootstrap delivery; captured DOM later has Research and Resources respectively. | Startup/render boundary failure before the footer assertions. Keep both pending progression-owner decomposition and parent serial validation. |
| Motion: desktop/no-preference and 390px/reduce | `shell-navigation-limits-mo-552fa-t-1280px-with-no-preference` and `shell-navigation-limits-mo-fe262-colors-at-390px-with-reduce`: failed inside shared `shellFixture`, not a motion assertion; captured DOM has the expected Empire heading. | Keep both; no motion defect demonstrated. Parent owns shared startup investigation. |
| Unread reports: 320/200%, 390/200%, 768/100%, 768/200% | `shell-unread-reports-light-{37483,bc733,4cea5,18b09}-…`: all failed inside `shellFixture` before badge/count/reconciliation assertions; each captured DOM has the expected Empire heading. | Keep all original count/geometry/refresh/history assertions; representative ShellBadges does not justify deleting this coverage. Parent/reports owner owns serial validation and response/render diagnosis. |
| Tablet header: 768px | `shell-tablet-header-pins-i-95dac--bottom-navigation-at-768px`: shared startup assertion failed, later DOM has the expected Empire heading. | Keep; no geometry defect demonstrated. |
| Legacy query URL: research and fleets | `shell-planet-scoped-gamepl-a3066-ect-old-query-URLs-research` and `shell-planet-scoped-gamepl-4a126-irect-old-query-URLs-fleets`: URL assertion still saw legacy query URLs; later DOM shows canonical body links and the expected route heading. | Keep application journeys. No router changes within this ownership; parent owns serial verification and exact redirect-timing evidence. |
| Foreign body: galaxy | `shell-planet-scoped-gamepl-2bc95-irect-old-query-URLs-galaxy`: missing unavailable heading at assertion; captured DOM contains `Destination unavailable`, the inaccessible-planet reason and the recovery link. | Keep; no authorization or unavailable-state regression demonstrated. |

These failures overlap the parent-measured load of 45.5 on 12 cores. Late snapshots are consistent with delayed rendering but do **not** establish infrastructure causation, retry success, or an explained test defect. There is no per-request/React commit timing trace establishing a new readiness repair. Therefore this commit adds no speculative wait, timeout increase, retry or deletion for these failures. Shared fixtures remain parent-owned. Their original failure evidence and required serial verification remain open; the 19 component passes do not close this baseline.

## Repair history audit

Read `docs/runbooks/test-performance-audit.md`, including the unexplained sidebar account-identity stall and removal around lines 880–910, and inspected `git log` for the three owned browser specs (notably fixture response gating `6292946b`, desktop-topbar `eb935120`, and navigation motion `b2f6b479`). The removed long-name account-identity browser case is not recreated. The separate Test Czar owner ledger is unavailable locally; that is not proof of no prior repairs. The one explained story setup repair above is recorded without resetting any inherited scenario’s repair history.


## Integrated verification

The parent integrated this group and completed serial validation. See the
[combined verification record](test-strategy-overhaul.md) for final inventory,
passing runs, repairs, retained failures, visual evidence and cleanup. Earlier
“pending parent validation” entries above describe the historical handoff.

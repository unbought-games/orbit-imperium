# Command HUD test migration

## Scope and boundaries

Base: `a119915ffaeb881a7f54d65542478f4788bd4210`. This is the local HUD
portion of the coordinated test-strategy change. The parent owns shared test
fixtures, the component entry, runner configuration, CI selection and final
integrated validation. No tests were moved to a nonblocking suite. The remaining
36 command-HUD browser cases are still selected by the existing fixture runner;
this bounded change does not claim that the final small application gate is
configured.

The production boundaries are now:

- `notification-history.ts`: initial threats, event history, dismissal IDs and
  seven-second expiry. It stores only interaction history and derives toast
  content, server time and free fleet slots from current game state.
- `intelligence-refresh.ts`: concurrent refresh coalescing, availability checks,
  mailbox error recovery and disposal fencing. The hook owns DOM wake listeners
  and its existing 15-second polling interval.
- `inbox-pagination.ts`: display-limit intent, explicit page requests, captured
  observer batches, hidden/disconnected callbacks and canceled completion.
  Report data and requests remain in the shared report engine. The hook only
  connects current inputs, subscriptions and the native IntersectionObserver.
- `toast-swipe.ts`: gesture intent and animation completion ordering. The hook
  connects Motion values and animations; deterministic tests explicitly complete
  or cancel animations. A second pointer cannot interrupt a committed exit and
  leave the card permanently noninteractive, and stale completion cannot dismiss
  after cleanup.
- `hud-toasts.tsx`: independently mountable presentation with prepared notices
  and callbacks. It has no session, router or coordinator provider dependency.
  Existing markup, CSS, motion parameters and resource components are retained.

`HudToastsProps` accepts `notices: readonly HudToastView[]`,
`onOpen(target)`, `onDismiss(target)` and optional `focusFallback()`. Each view
contains `target`, `content`, `now`, and `freeFleetSlots` (a decimal string or
null). The live app calls `hudToastViews(state, hud.toasts)` and supplies orb
focus restoration. The parent component harness can prepare these values
without starting any application API clients. Use the existing `surface` and
`hudLayer` classes from `hud.module.css` around the fixture to supply the same
positioning and color scope as the live app (plus the shared global styles).
The component uses the actual
swipe hook, inert covered cards and focus promotion. Static rendering tests
assert markup only, not gesture/focus/layout behavior.

## Scenario inventory

Names below are the original names in `command-hud.spec.ts`; viewport/type
families include every original variant. Retained scenarios keep their existing
assertions unless a change is stated explicitly. This inventory deliberately
records remaining component migration work instead of claiming that a static
render replaces native browser behavior.

| Original scenario | Disposition and exact protection |
| --- | --- |
| desktop orb anchors its panel, preserves details across resize and restores focus (768, 1024, 1440, 2560, 3440px) | Retained: application shell anchoring, dialog position, instance continuity across resize and focus restoration. |
| live mobile HUD receives reports, messages and threats across navigation and preserves server truth | Retained integration: source subscriptions produce real controls, detail/read commands, message links, threat dismissal and fleet navigation. Optional capture now includes the same toast at 1440x900; it does no viewport preparation when capture is disabled. |
| initial unread persists and mailbox failures remain recoverable; desktop retains the HUD | Retained integration: retry action and app wiring. Refresh failure/coalescing permutations now also have `intelligence-refresh.test.ts` coverage. |
| real quick-build only acknowledges committed orders and leaves rejection visible | Retained representative command submission/reload/rejection journey. `model.test.ts` covers pending/rejected/restored command transitions without a browser. |
| real research / defense confirmation shows the quoted action in the mobile HUD | Retained: actual confirmation-control wiring and quoted result/resource markup. These remain candidates for parent integration consolidation; neither is silently deselected. |
| orb boots from its center, types the complete label and clears it without moving | Retained browser CSS geometry and reveal contract. Caption lifetime/typing bounds already live in `caption-engine.test.ts`; static rendering does not prove layout. |
| report and long message capture gestures; backdrop and boundaries cannot move the game | Retained: native touch scrolling and scroll ownership. |
| HUD espionage attack action respects capability false / true and prepares the observed target | Retained: real report action to Dispatch navigation/draft wiring. |
| HUD back button is a ghost with hover, focus and pressed states (390, 1440px) | Retained: native pointer/focus/pressed appearance and touch target geometry. |
| HUD details return to the list without closing, even after scrolling a report | Retained: dialog continuity and actual scroll restoration. |
| HUD list infinitely loads past the badge cap, retries in place, and restores the list after detail (390, 1440px) | Retained native observer/scroll/retry integration. Removed injected observer callback and MutationObserver race schedules from this journey. Those exact hidden, disconnected and later-batch schedules now run in `inbox-pagination.test.ts`. Native scrolling, double retry, retained rows, list position, end state and modal cleanup assertions remain. |
| HUD ignores queued pagination observations after opening a report (390, 1440px) | Moved to `inbox-pagination.test.ts`: `queued observations cannot page hidden content, including before observer cleanup`. It delivers before cleanup, after disconnect/reopen and then through a fresh observation, asserting limits 20/20/40 and no network request. The retained native list journey covers actual detail/back and scrolling. |
| stale HUD intersection callbacks cannot consume a later pagination batch | Moved to `inbox-pagination.test.ts`: `old observations retain their original page boundary even before cleanup after a later batch`; explicitly delivers the original callback after limits 40 and 60, without browser frames or timing. |
| captions explain once, joke only on confirmed new losses, and keep humor separate from regular feedback | Retained for session navigation, addressed caption rendering and narrow long-line clipping. Event classification, hydration silence, expiry, quiet delay, cooldown, interruption, duplication and line rotation are already deterministic in `caption-events.test.ts` and `caption-engine.test.ts`. Further removal needs the parent's prepared-caption component coverage; these tests do not claim text length alone proves geometry. |
| every orb surface blends through the shared palette, including rapid retargets and reduced motion | Retained native CSS-composition coverage. This samples controlled CSS timelines, not transient wall-clock frames. The parent can move it to an isolated orb mount; no equivalent pure-model test can prove computed CSS interpolation. |
| orb symbols overlap in a holographic dissolve, settle after rapid changes, and switch immediately with reduced motion | Removed under one-repair policy; see failure record below. `model.test.ts` retains symbol/tone priorities and adds `retargets the orb from attack to success to unread to idle using current facts`. Other retained UI cases cover active attack and reduced-motion semantics. The transient two-layer overlap-frame claim is deliberately retired, not re-created in another suite. |
| orb hover charges every layer, preserves its hit area and palette, and supports keyboard and reduced motion | Retained: native hover/focus/press geometry and reduced-motion CSS. |
| touch press compresses then releases without sticky hover or lost taps | Retained: actual touch event dispatch and dialog activation. |
| a missing report cursor offers retry without an observer render loop | Retained error-control integration. Shared report-engine tests own invalid cursor handling; `inbox-pagination.test.ts` owns exhausted history/request intent. |
| spy contacts are regular unread notifications and only active attacks make the orb red | Retained existing browser source/render wiring. Exact source permutations also remain in `model.test.ts` (`treats historical and newly received spy contacts…`, `reserves red for active attacks…`); a prepared orb/inbox harness can consolidate the rendered part later. |
| fleet accordion shows empire-wide flight paths, live timing, massive manifests and compact navigation | Retained: accordion, rendered paths/manifests and links. `fleet-summary.test.ts` owns authoritative timing, arbitrary-size sums, return legs, recall progress and deduplication. |
| enemy attacks appear only for incoming attacks (390, 1440px) | Retained: actual conditional region and origin labeling in both layouts. `fleet-summary.test.ts` owns filtering and origin identity; these are not assertions of server authorization. |
| enemy attacks open above fleets, use red, keep hidden intelligence hidden, and collapse independently | Retained: accordion composition, initial expansion and independent controls. Hidden intelligence and ordering remain in `fleet-summary.test.ts`. |
| HUD dismissal keeps exiting content inert and modal, then restores focus and scroll | Retained: native modal inertness through exit, focus return, document scroll restoration and interrupted close/reopen. |
| foreground refresh confirms an accepted response with accessible reduced motion | Retained single visibility → held HTTP response → accessible UI boundary. `return-refresh.test.ts` and `caption-engine.test.ts` own five-minute threshold, failure/recovery ordering, expiry and one-shot behavior. |
| return refresh animation preview at mobile and desktop sizes | Retained native CSS/geometry checks and explicitly opt-in visual frames. Temporal confirmation policy stays in the deterministic tests above; this is still a required fixture test, not a silently moved preview job. |
| shared inbox removes reports deleted elsewhere from badge and panel (390, 1440px) | Retained cross-surface subscription wiring. `model.test.ts` covers ignoring cached reports outside current inbox membership; report engine/state tests own reconciliation. |
| background HUD refresh preserves settled status and focus (1440, 390px) | Retained: focus and interactive DOM remain stable during an intentionally held refresh. |
| background HUD refresh allows buffered entries and queues the next page (1440, 390px × success/failure) | Moved: `inbox-pagination.test.ts` (`buffered pages stay available…`, `failed pagination leaves the settled limit…`) plus `intelligence-refresh.test.ts` (`coalesces concurrent wakes…`, `mailbox failures remain recoverable…`). Existing `report-engine.test.ts` `pagination waits through consecutive passive refreshes (first fails: %s)` proves success/failure ordering, one requested cursor, deduplication and settled membership at the actual shared engine boundary. Native focused controls during refresh remain in the preceding retained scenario; native loading/retry presentation remains in the list journey. |
| reading a HUD item does not request more history (1440, 390px) | Moved: `inbox-pagination.test.ts` changes the target count below the settled limit without producing a request, then proves a new gesture requests exactly one next page. Shared report-engine reconciliation coverage remains; the list/detail browser journey still reads a real item and returns without losing pages/position. |

The only owned Galaxy scenario was `rapid Galaxy spying keeps a compact
actionable toast stack at 1440x900`. It is retired under the one-repair rule.
`notification-history.test.ts` proves fourteen rapid arrivals, newest-three
ordering, batch overflow, dismissal promotion without reclaiming the history
slot, precise expiry and missing-content filtering before depth. `toast-swipe.test.ts`
proves tap/drag distinction, travel/velocity intent, cancellation, direction,
exactly-once completion and cleanup. `hud-toasts.test.ts` proves real prepared
markup, top/covered semantics, resource names and presence/absence of timing.
The retained live HUD and quick-build journeys prove actual actions produce
notifications. The fourteen-launch Galaxy obstruction/gesture journey itself
is not replaced. The parent owns the isolated real-browser toast stack's hit
areas, focus promotion and gesture wiring using the exposed production API;
static render tests do not claim those checks have passed.

## Failure and repair evidence

- Galaxy: [main run 42732047022, job 129552404085](https://github.com/unbought-games/orbit-imperium/actions/runs/42732047022/job/129552404085),
  attempt 1 at `a119915ffaeb881a7f54d65542478f4788bd4210`. Downloaded job logs show `Expected: 1`, `Received: 2` after the
  second `swipe(-95)` at original line 2375. The runner completed 147 other
  cases; this is an assertion failure, not evidence of infrastructure loss.
  The prior repair and mobile removal are recorded in
  [compact-toast-stack.md](compact-toast-stack.md). The desktop case also
  exhausts that repair and is now removed, without a retry or renamed journey.
- Orb symbols: [run 42690568978, attempt 2, job 129415845233](https://github.com/unbought-games/orbit-imperium/actions/runs/42690568978/job/129415845233).
  Revision `47b76c363e773b392c1e2f238b3a2be345668f04`.
  Downloaded logs show overlap sampler expected 2, received 0 at the
  `expect.poll` for `symbolOverlap`. The runner completed 146 other cases.
  `git log -S symbolOverlap -- apps/web/tests/command-hud.spec.ts` identifies
  `c9b4f404` (#199); its squashed commit explicitly includes
  `test: sample orb transition layers atomically`, and the existing test
  documents the earlier detached-element sampling failure. This is a failure
  after its repair. Remove it rather than introducing another frame sampler.
- Pagination migration retains the product protections described in
  `docs/runbooks/test-performance-audit.md` under runs `41210620800`,
  `41211753555` and the #259 integration: hidden callbacks, disconnected
  observers and callbacks that capture their original next limit. These
  scheduled races are now explicit controller calls rather than native-frame
  probes. The actual native scroll journey remains.

The repository ledger and Git history were inspected. A separate owner Test
Czar ledger was unavailable. No routine timeout, retry, sleep or CI exclusion
was added. The two retired journeys were not rerun locally. A deliberate local
fault removing the pagination visibility guard made its replacement test fail
with limit 40 instead of 20; the fault was immediately restored. That negative
control is expected test evidence, not a flaky-test repair attempt.

## Local validation and handoff

Commands use the existing Node 24 binary and pinned packages. Dependency setup
(`npm ci --ignore-scripts --no-audit --no-fund`) took 8 seconds. The worktree is
isolated; the parent's baseline runner and files were untouched.

- Before extraction, the focused initial-unread/retry browser case passed:
  preparation 5.738s, runner 6.2s, case 4.3s. Its desktop screenshot was
  inspected as the existing appearance reference.
- Focused deterministic HUD/swipe tests passed during extraction (59, then 69
  tests); prepared-toast rendering and existing shared report-engine tests
  passed (27 tests). Final combined HUD/swipe/report-engine validation passed
  all 97 tests in 11 files (8.26s Vitest runner). The chat records the commit
  containing that exact tested source tree; these intermediate runs are not
  additional distinct coverage.
- Source ESLint and TypeScript checks passed. Formatting checks cover all
  changed source files; browser specs retain their existing formatting.
  Individual final lint/TypeScript/format phase timings were not recorded.
- Seven focused application cases passed with one worker: live mobile HUD,
  initial unread/retry, real quick-build, both native list viewports, and both
  focus-during-refresh viewports. Module preparation 5.827s; browser runner
  35.2s (includes runner startup/teardown), summed case execution 32.6s.
- A separate requested visual capture of live mobile HUD, including its new
  desktop toast capture, passed: module preparation 10.264s, runner 10.7s,
  case 7.8s. It is a visual-validation invocation, not an unchanged retry
  presented as reliability evidence.
- After removing injected races from the native list journey, both final
  viewport cases passed with screenshots: preparation 12.466s, runner 22.0s,
  case execution 8.3s + 8.1s. This verifies the changed native journey.
- Inspected actual toast and inbox screenshots at 390x844 and 1440x900,
  including loaded, pending and restored-list states. No CSS or geometry was
  changed. Captures remain local under `test-results/live-hud/` and are shown
  in the implementation chat; they are not hosted or included in a PR.
- No unintended local assertion failures, external infrastructure retries or
  queue removals occurred. The deliberate negative control is recorded above.
  Hosted runner wait and merge delay are not applicable: no push/PR/merge was
  authorized. No Docker/database resources were started. Each focused UI
  runner and its Vite server exited; no shared process was terminated.

The parent must integrate this commit, validate its combined revision and add
its owned prepared-toast browser cases before declaring the component harness
or reduced application gate complete. Remaining native component cases in the
inventory have not been silently dropped to achieve a test-count target.

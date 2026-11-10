# Command HUD test migration

## Scope and boundaries

Base: `a119915ffaeb881a7f54d65542478f4788bd4210`. This is the local HUD
portion of the coordinated test-strategy change. The parent owns shared test
fixtures, the component entry, runner configuration, CI selection and final
integrated validation. No tests were moved to a nonblocking suite. The remaining
37 command-HUD browser cases are still selected by the existing fixture runner;
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
| background HUD refresh allows buffered entries and queues the next page (1440, 390px × success/failure) | Restored the 1440px/success application variant after review: only the actual hook/DOM case proves that passive refresh leaves Load more enabled and aria-busy false while buffered entries exist, then becomes busy for an explicit unavailable page. The remaining viewport/failure permutations move to: `inbox-pagination.test.ts` (`buffered pages stay available…`, `failed pagination leaves the settled limit…`) plus `intelligence-refresh.test.ts` (`coalesces concurrent wakes…`, `mailbox failures remain recoverable…`). Existing `report-engine.test.ts` `pagination waits through consecutive passive refreshes (first fails: %s)` proves success/failure ordering, one requested cursor, deduplication and settled membership at the actual shared engine boundary. Native focused controls during refresh remain in the preceding retained scenario; native loading/retry presentation remains in the list journey. |
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

## Follow-up: changing reduced-motion preference

The parent isolated-component run exposed a product defect when the OS motion
preference changes after mount. Inspection of the installed
`framer-motion/dist/es/utils/reduced-motion/use-reduced-motion.mjs` confirmed
that its hook returns a `useState(prefersReducedMotion.current)` value without
subscribing React to subsequent preference changes. Toast swipe now imports the
existing `ui/use-reduced-motion.ts` subscription hook instead. The existing
latest-value ref supplies the current preference when starting either dismissal
or spring-back, without recreating gesture intent or animation controllers.

This is a shared product fix, not a failing test's repair attempt. The parent
owns the shared component harness's preference-change regression and the
sheet/popover fixes. Local focused swipe and prepared-toast tests passed (9
tests, 7.79s runner), as did source ESLint and formatting. The final browser
capture rechecks the toast consumer, not the parent's sheet regression.

The follow-up browser capture did **not** pass. On `9fbe08d6` plus the shared-hook
import change, Vite preparation took 41.068s, then the initial orb attribute
assertion failed after five seconds with no matching element (case 11.7s).
The failure screenshot is a blank background; the subsequently recorded DOM
snapshot contains the loaded game and command HUD. Vite also logged
`ECONNREFUSED 127.0.0.1:8080` for world/reports/social/profile/update requests.
These observations preserve a startup/readiness failure; contention alone does
not classify it as an infrastructure failure or prove the proxy messages caused
it. No retry, timeout change, test repair or deletion was attempted.

The parent then coordinated exclusive validation after observing host load
45.5 on 12 cores. This task's browser/Vite processes have exited. No further
browser/build/typecheck run was launched. Parent-owned serial validation must
resolve this failure and refresh visual evidence for the follow-up. Local
results JSON, screenshot and error context are preserved both under
`test-results/browser-ui/` and `/tmp/orbit-hud-reduced-motion-20261109/` on the
implementation host. Previous screenshots belong to the earlier validated
controller commit, not this failed follow-up capture.

## Follow-up: pointer movement before Motion drag callbacks

The parent's baseline at `a119915ffaeb881a7f54d65542478f4788bd4210` recorded a
second distinct outcome in the retired rapid-Galaxy journey: after the second
swipe, line 2375 expected one toast but found zero, and the locator call log
records navigation to the canonical body-scoped Galaxy route. The case lasted
11.330s. This differs from main job `129552404085`, which found two cards at
that same assertion. Baseline evidence remains in the parent's
`test-results/test-strategy/baseline-a119915f/results.json` and matching Galaxy
error context. Neither outcome is silently replaced by the other or explained
solely by machine load. The exhausted journey remains retired.

Inspection found a concrete activation vulnerability in the toast consumer:
`canOpen()` depended on Motion's `onDragStart`. The installed `PanSession`
queues movement using `frame.update`, ends the session on pointerup, and can
end without ever starting a pan. `VisualElementDragControls` also schedules
`onDragStart` on `frame.update` and `onDragEnd` after render. Consequently a
native click can be handled before our drag flag is set. This demonstrates a
possible product mechanism; it does not establish that this mechanism caused
all of the baseline navigation or earlier retained-card failures.

The controller now records the primary pointer's starting coordinates and
synchronously observes movement and release. Travel reaching Motion's default
three-pixel pan threshold blocks opening even if Motion callbacks have not run.
Moving back to the origin cannot erase that intent. Jitter below the threshold
remains a tap; unrelated pointers are ignored, cancellation blocks activation,
and a new tap resets the guard. Motion still owns drag animation and dismissal;
raw input does not invent velocity, force a dismissal or change its thresholds.

Focused deterministic regressions exercise raw move/up before any drag callback,
release-only displacement, vertical travel, out-and-back movement, tap jitter,
pointer identity and cancellation. Parent-owned isolated browser checks must
verify real event wiring and final pixels after integration. This task launched
no further browser, build or full typecheck under the validation-coordination
restriction.

Validation of this follow-up on `15085e5f` plus the pointer-guard diff:
`npm test -- src/ui/toast-swipe.test.ts src/features/command-hud/hud-toasts.test.ts`
passed all 14 tests in 0.511s. Focused ESLint and source formatting passed.
No local test failure or retry occurred in this follow-up; no browser resources
were started. The chat records the local commit containing that tested diff.


## Follow-up: isolated toast contracts and review corrections

Six isolated component cases are authored in
`apps/web/tests/components/hud-toasts.component.spec.ts`, using the real
`HudToasts` and three prepared notices from `hud-toasts.scenarios.tsx`:

- Compact bounds, covered-card inertness, programmatic focus rejection, tab
  order and top-card hit testing at 390x844 and 1440x900.
- Keyboard dismissal promotes focus twice and invokes the supplied fallback
  exactly once when the final card is dismissed.
- Pointer cancellation followed by native Enter opens once without dismissal.
- Mouse short-drag suppression, subsequent native click and a deliberate swipe
  that dismisses once without an extra opening callback.
- Independent real touch swipe and a native tap on the promoted card.

The scene has no app bootstrap, game store or event expiry clock. Interaction
records are the sole fixture state; remaining notices and callback output are
derived from those records. Tests use the supported reduced-motion preference
to leave decorative lifetime CSS out of focus/geometry/input contracts. They
do not override CSS or Motion, and require the actual drag transform to reach
its intended displacement before release. Normal-motion animation behavior is
not claimed by these component cases. No raw pre-frame race permutation or
retired rapid-Galaxy command journey is recreated.

The parent must register the existing async scene-loader map entry:
`'hud-toasts': async () => (await import('./hud-toasts.scenarios')).HudToastsScenario`.
This task did not change the shared entry, fixture or runner configuration.

Review also found that a prior canceled/dragged pointer blocked a fresh keyboard
activation. `canOpen` now accepts an explicit pointer/keyboard activation kind;
non-pointer native clicks (`detail === 0`, including assistive activation) bypass
only the previous pointer guard and still cannot open an exiting card. Both
consumers, production `HudToasts` and the dev HUD playground, classify their
native click. There is no synthesized keydown click and no double-activation
path. Two deterministic controller cases cover fresh keyboard activation after
drag/cancel while preserving pointer suppression and the exit lock.

The earlier migration overstated replacement of the buffered-refresh browser
case: the controller tests do not exercise `useHudInbox`'s derived loading
calculation. One original 1440px/success case is restored with its assertions
intact; the table above is corrected. The deterministic shared-report-engine
success/failure permutations remain. Removal of this last browser case requires
an actual hook/component replacement, not the separate one-entry focus case.

Validation: focused swipe/prepared-toast unit checks passed (16 tests, 0.527s)
on `31bd0953` plus this follow-up diff. Source lint, formatting and syntax-only
parsing of the two new component files are checked locally. Browser, component
typechecking, production build and current screenshot validation remain pending
the parent's serial validation window. No browser/build/typecheck was launched
and no failure/retry occurred in this follow-up.

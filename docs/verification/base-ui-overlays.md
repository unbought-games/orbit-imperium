# Base UI overlay migration

Verified locally on 2026-11-15 against `6eafeb0c8397eb49ea4b2e1a0b75ed198b801784`
plus this migration. The implementation checks below preceded PR publication.
Deployment is outside this change.

## Implementation

- Removed the direct `@floating-ui/react` dependency and every application import.
  The lockfile also drops its standalone `tabbable` dependency. Base UI 1.9.0
  continues to own its transitive `@floating-ui/react-dom`, DOM/core and utils
  packages; removing those would break Base UI.
- `AnchoredPopover` composes Base UI's root, trigger, portal, positioner, popup,
  arrow, title, description and close parts. It owns shared collision defaults,
  Escape handling inside native dialogs, and dismissal filtering for synthetic
  clicks (which are not pointer interactions).
- `Popover` retains hover, focus, click/tap, link navigation, accessible
  descriptions, trigger refs, nested native-dialog portals, keyboard re-entry,
  and close-on-content-link activation. Restoring focus after dismissal must not
  reopen its details.
- `ActionPopover` retains external anchors, explicit initial/return focus,
  scroll containment, form state and reduced-motion changes. CSS transitions
  let Base UI own exit retention; closed controls are inert. Reduced motion
  releases the popup immediately.
- `AdvisorBubble` owns the common orb-message presentation, arrow, nonmodal
  focus policy and dismissal rules. Tutorial and release announcements compose
  their own content inside it. Neither outside clicks nor outside focus mark
  guidance as dismissed. Unmount cleanup restores focus even on announcement
  withdrawal, without acknowledging it.
- Native dialogs and the custom draggable ActionSheet were outside the four
  direct Floating UI implementations and retain their existing behavior.

## Coverage

Existing component coverage exercises responsive harvest actions, popover/sheet
switches, form submission, exact focus restoration, live fleet updates, resource
explanations and player dossiers. New isolated cases cover native-dialog Escape,
hovering interactive content, keyboard re-entry, links and accessible description
association, touch navigation, and unsolicited messages allowing outside focus.
The existing reduced-motion test retains its controlled clock and assertions.

All existing tutorial and announcement application scenarios remain selected.
The announcement geometry test additionally requires long content to remain
above the orb on desktop and mobile, rather than accepting a lateral fallback.
The initial migration retained every test. The later retirement of one
unexplained CI journey and its remaining coverage are documented below.

## Validation history

All browser suites used one worker and ran serially. Preparation is the runner's
bundle timing; execution includes its Playwright startup/teardown. Local runner
allocation and CI/merge-queue waits do not apply. Initial npm setup took about 4s.

| Run                                    | Preparation | Execution | Result                           |
| -------------------------------------- | ----------: | --------: | -------------------------------- |
| Original advisor/announcement baseline |      5.102s |   38.802s | 18 passed                        |
| Initial migrated components            |      4.211s |   64.824s | 87 passed, 2 product regressions |
| Focused migrated components            |      3.999s |   31.143s | 10 passed, 4 product regressions |
| Corrected popover cases                |      4.434s |    4.057s | 5 passed                         |
| Initial migrated application flows     |      4.785s |   44.115s | 17 passed, 1 product regression  |
| Corrected withdrawal/application flows |      4.645s |   36.512s | 18 passed                        |
| Broader component validation           |      3.686s |   66.119s | 94 passed                        |

The component failures exposed synthetic outside-click dismissal, delayed focus
return, reduced-motion exit retention, and focus-return reopening. Application
coverage exposed announcement withdrawal losing focus. Each failure caused a
production-code correction, not a test repair or unchanged retry. Visual review
then found Base UI's default perpendicular collision fallback; the common
positioner now preserves the old vertical placement.

One intermediate fixture build failed after 2.01s on an editing syntax error;
that was fixed before running assertions. One selection attempt built in 4.079s
but selected no tests due to an over-anchored regex; the selector was corrected.
Initial TypeScript validation caught ref/attribute typing errors, then passed
following correction. Existing fixture bundle warnings about mixed JSON import
attributes remain unrelated to this migration.

## Final checks

- `npm run test:ui -- tutorial-advisor.spec.ts release-announcement.spec.ts --workers=1`:
  18 passed after the placement correction; preparation 5.013s, execution 37.399s.
- `npm run test:components -- 'popover.component.spec.ts$|profile-display.component.spec.ts$|galaxy-fleet.component.spec.ts$|detail.component.spec.ts$' --workers=1`:
  94 passed. The selector also includes progression-detail coverage.
- After the final accessible-description association, reran
  `npm run test:components -- 'popover.component.spec.ts$|profile-display.component.spec.ts$' --workers=1`:
  8 passed; preparation 5.080s, execution 7.1s.
- `npm test -- apps/web/src/features/tutorial/advisor.test.ts apps/web/src/features/announcements/model.test.ts apps/web/src/features/announcements/feed.test.ts apps/web/src/adapters/announcements.test.ts apps/web/src/ui/info-tooltip-state.test.ts`:
  24 tests passed in 0.604s.
- `npx tsc --noEmit -p apps/web`: passed, 12.969s wall time.
- `npm run test:component-types`: passed, 10.773s wall time.
- `npm run lint`: passed. Prettier checked every changed source, test, dependency
  and documentation file; the new verification document needed formatting first.
- `git diff --check`: passed. Source/package scans confirm no application
  `@floating-ui` imports or direct dependencies and no standalone
  `node_modules/@floating-ui/react` lock entry.

## Visual review and cleanup

Captured and inspected the running details and action popovers at 1280×900 and
390×900; tutorial guidance at 1440×900 and 390×900; announcements open/scrolled
at 1440×900 and 390×844. Also captured responsive Harvest at 1280×844 and 390×844.
The action popover close button was manually exercised at both viewport sizes,
with focus restoration and absence of browser errors checked.

The originating chat displays labeled desktop/mobile screenshot sheets. Full
captures are retained in the chat's local artifact directory, not hosted or
attached to a PR. Browser tests closed their contexts, preview servers and
scratch bundles. The task-owned development preview was stopped after capture.
No database or backend processes were started. No test execution timeout,
assertion relaxation, retry setting or CI selection changed.

## PR follow-through: immediate details dismissal

CI run `43786501841`, attempt 1, head
`8dd3a6dac8c83072c94866cf7213b432b6c949c0` exposed the same production
regression in two jobs:

- Job `133035324207` (features 6/6): 107 passed, three production-queue cases
  failed at 320/390/1440px after Escape.
- Job `133035324198` (components): 404 passed, three Galaxy traffic cases failed
  at 320/390/1280px during dismissal/hover re-entry.

Base UI retained a closed details popup until its next animation frame, although
this surface has no exit animation. The existing controlled-clock cases exposed
that changed lifecycle. `Popover` now unmounts its content immediately when
closed and composes the existing shared focus-return hook. No tests were removed,
relaxed, or retried unchanged. A new isolated paused-clock case verifies immediate
Escape dismissal, restored focus, and keyboard reopening.

Local repair verification:

- Popover, profile-display, and galaxy-fleet component suites: 18 passed;
  preparation 4.567s, execution 9.5s.
- Original shell production-queue cases: 3 passed; preparation 4.795s,
  execution 18.9s. Captures cover Overview, Shipyard and Defense.
- Original Galaxy traffic component cases: 3 passed; preparation 5.629s,
  execution 5.1s. Captures cover flight details at mobile and desktop sizes.

Refreshed and inspected the affected details captures. The application and
component typechecks, focused ESLint/Prettier checks, and diff whitespace checks
also pass for the repair. Test-runner previews and contexts were cleaned up.

## Review findings

- Thread `PRRT_kwDOVRgPYs63wS2g` (hover offset gap): false positive. Base UI
  1.9.0's `Popover.Trigger` uses `safePolygon()` for `openOnHover`. Strengthened
  the existing hover cases with an eight-step pointer path into the gap and
  onward into the popup, checking the original popup stays mounted. Both
  desktop/mobile geometry cases passed on the reviewed code before any repair.
- Thread `PRRT_kwDOVRgPYs63wS2l` (narrow native dialogs): confirmed with a 240px
  dialog that establishes a containing block and clips its descendants. The
  popup's right edge was 805px against the allowed 748px. Details now cap their
  width using Base UI's `--available-width`, which accounts for clipping
  ancestors, as well as the viewport cap. The sizing rule belongs to the popup
  and does not constrain unrelated popover placement.

Review reproduction: preparation 4.305s, execution 3.5s; two hover cases passed
and the narrow-width regression failed as expected. An intermediate attempt also
set the dialog as an explicit collision boundary. It unnecessarily flipped
ordinary details above their trigger, causing two pointer-path failures and a
blocked outside-tap action. That task-owned run was interrupted (14 passed,
2 failed, 1 interrupted, 5 not run). Removed that overconstraint; no assertions
were relaxed. A focused recheck passed all three cases (4.165s preparation,
3.2s execution).

Final review repair validation: 23 component cases passed, including both narrow
viewport captures, stepped hover paths, touch, immediate dismissal, player
profiles, and Galaxy/Harvest interactions (3.951s preparation, 14.8s execution).
The component typecheck, changed-file formatting, and diff checks passed.
Refreshed the affected desktop/mobile screenshots after the width repair.

## Report interaction follow-through

The superseded run `43787322768` at `feadefa55` left features job
`133037939866` incomplete. Its cancelled log recorded three density-report
assertion failures and 107 passed cases out of 111; the remaining case was
the explosion-counter interaction. The job was cancelled by the subsequent
source push, not by a new execution deadline.

The density failures reproduced at all three widths (4.538s bundle preparation).
After clicking the report timestamp and dismissing it with Escape, the test
called `hover()` while the mouse was still over the trigger. Base UI correctly
suppresses hover reopening until the pointer leaves. The first repair of this
pointer-path assumption explicitly moves outside before re-entering. It retains
the dismissal and hover assertions. History points to the original interaction
in #70; no earlier repair for this assumption was found. Audited the other
Escape-to-hover sequence in Galaxy traffic: its mouse starts on a different
control, so its existing path already enters the trigger. No shared helper or
other scenario needed changing.

The explosion-counter case was inspected with Playwright API diagnostics on the
current width-constrained source. All hover, sequential keyboard, 390/320px touch,
outside dismissal, and unchanged counter assertions passed (2.3s test, 2.9s
runner). The cancelled CI log does not identify its outstanding action, so this
is a current-revision result, not a claim that an unchanged retry repaired a
known defect. No change to that test was made.

The combined report validation passed all four cases with captures enabled
(4.451s preparation, 12.1s execution). Assertions, timeouts, and test selection
remain unchanged; only the real pointer re-entry is established explicitly.

## Unexplained CI journey retirement

The same explosion-counter journey remained unfinished in run `43789378496`
(head `d302847a`, job `133044296898`) while every other applicable check and
Bugbot passed. Investigation included the exact current-main integration
snapshot (temporary merge, then aborted), macOS API-level browser diagnostics,
and a disposable Linux/arm64 Playwright 1.56.1 Noble container. The isolated
Linux case passed; its initial diagnostic used the image's Node 22. The full
features-2 shard reproduction used pinned Node 24.18.0, three workers
and the same integration snapshot. The explosion journey passed there too.
An initial two-worker setup was stopped to match CI's worker count. No CI policy
or deadline was changed. GitHub's running-job log endpoint returned 404, and the
live browser view required sign-in; no claim is made about the missing action.

The failure remains unexplained, not a confirmed product defect or infrastructure
incident. Following AGENTS.md's explicit instruction to delete a failing test
when inspection cannot explain it, retired only
`combat-reports.spec.ts` → `explosion counter explanation / preserves the counter
and explains it on hover, keyboard focus, and mobile tap`. This is not a renamed
journey or an assertion relaxation. Its earlier shared report-response readiness
repair (recorded in the audit) remains part of its history.

Retained protection:

- `report-presentation.test.ts` → `keeps zero random explosions separate from
33 destroyed defenders` renders the real observation component and requires
  34 → 1 defenders, zero explosions, and the named explanation trigger. The
  new assertion initially omitted the rendered separating space; corrected that
  literal. All 44 report presentation/observation tests then passed.
- Existing model/engine tests own damage, loss and explosion arithmetic.
- Shared `popover.component.spec.ts` retains real hover paths, sequential
  keyboard entry, Escape, touch opening/outside dismissal, focus return,
  and viewport/native-dialog containment.
- The small/huge/deuterium report journeys still exercise report routing,
  disclosures, scale/layout, coordinate actions and harvest navigation.

Lost browser coverage is explicit: opening this exact explanation from the
full report, the precise explanatory paragraphs, and the Tab path through
preceding player dossiers are no longer in routine CI. Their current behavior
was manually exercised by the traced Mac/Linux runs; static rendering does not
claim to replace those interactions. The coverage map records this disposition.

## Queue scroll-boundary repair

The first queue attempt used integration SHA
`e79173220cfb752159075f1fd1300fa3ed591f37`, run `43793514964`, job
`133057138222`. Features 2/6 finished with 110 passed and one failure in
`HUD touch scroll ownership / report and long message capture gestures;
backdrop and boundaries cannot move the game`: after a touch swipe followed by
an immediate programmatic scroll-to-bottom, the panel remained 63px above its
new endpoint. The original screenshot and context show a scrolled report, not
an unavailable page or failed HTTP response.

History traces the case to #199; no prior repair for this completion-boundary
assumption was found in its history, HUD migration record, or repair audit.
The test awaited positive scroll movement, which does not establish the end of
wheel delivery or compositor touch scrolling. Its first repair registers native
`scrollend` completion before positive gestures and programmatic scroll changes,
then retains every existing scroll-lock, movement, endpoint, dismissal and
resize assertion. No sleeps, retries, force clicks, or increased deadlines.
The same sequence is used for both report and message scrolling. Audited other
scroll-position writes in this file: none follows an unsettled touch fling;
the other CDP touch case verifies press/cancel styling without a scroll gesture.

The original case passes locally after repair (4.873s bundle preparation,
4.3s test / 5.2s runner). Its DOM completion marker is test-only, removed by the
one-shot scroll event; contexts and listeners are released by fixture cleanup.
This is a test-only correction; overlay source and screenshots are unchanged.

The focused scroll repair also passed in the disposable Linux/arm64 Chromium
container with Node 24.18.0 (7.624s preparation, 4.6s test / 5.5s runner). The
container and preview cleaned up normally. The earlier full Linux diagnostic
completed with 103 passed and 8 HUD/navigation setup failures; those same eight
cases passed in the d302847a GitHub run on identical production code. That
supplemental diagnostic was not treated as clean full validation.

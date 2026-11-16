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
No tests were removed or assertions weakened.

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

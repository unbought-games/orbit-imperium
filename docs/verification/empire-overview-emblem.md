# Empire overview emblem entry

Validated on base `47cb209e` plus these uncommitted changes.

The overview uses the shared player-profile observation and EmpireInsignia
renderer. A separate 44×44px link precedes the name: a dashed slot with a plus when
confirmed unequipped, the current appearance when equipped, and a neutral slot
while the initial profile is unknown. No library request is added to the overview.
Both states link through `routeTarget` to the body-specific identity settings
route and the `empire-insignia` fragment. Existing fallback rendering is retained.

The editor receives initial identity readiness from its parent. Fragment focus
waits for both identity and library content, and the game shell does not redirect
fragment navigation to its page heading. This keeps the editor visible after the
identity form loads above it. The editor itself retains its existing controls.

## Checks

- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- insignias.spec.ts empire-identity.spec.ts -g 'overview emblem|overview name popover' --workers=1`: 4 passed initially, including independent rename behavior and mobile long-name wrapping.
- Visual inspection found that merely seeing the editor heading at the viewport bottom was insufficient: the New design action remained below the mobile viewport. Strengthening the visibility assertion exposed this product navigation defect (1 passed, 1 failed; preparation 4.687s, execution 9.7s). Tests were retained; no test repair, deletion, timeout changes, or retries for luck.
- After the focus/readiness fix, the two emblem journeys passed. Added controlled response ordering to hold the identity form until the library arrives, asserting editor focus and the fully visible New design button.
- Final `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- insignias.spec.ts -g 'overview emblem' --workers=1`: 2 passed. Preparation 4.874s. Desktop 1440×1000 and touch 390×1000 cover the empty slot, selected appearance, body-preserving navigation, equipment refresh on return, and re-entry.
- Focused ESLint, Prettier, `npx tsc --noEmit -p apps/web`, and `git diff --check` passed.
- Inspected `test-results/empire-emblem-{empty,equipped,destination}-{1440,390}x1000.png` and the long-name mobile capture. Verified the link and return in the running local development browser.

Fixture requests do not prove server persistence. Validation ran serially; no
CI queue was involved and allocation time was not recorded separately. Fixture
servers, browsers, and temporary bundles were cleaned up by the runner. The
user-requested development server remains running.

## Header scale and hover refinement

The heading is now 2rem. Emblems and empty slots use a compact 36×40px
appearance within the 44px target. The empty slot has no visible word, and
hover has no outline; keyboard focus retains its visible ring. The accessible
Create/Edit labels and tooltips remain. Refreshed and inspected the desktop and
mobile empty/equipped captures. The four focused header journeys passed after
resizing (preparation 5.080s; execution 10.1s), and the two emblem journeys passed
after removing the word/hover outline (preparation 4.950s; execution 5.4s).
Focused lint, formatting, and frontend typecheck passed for the size changes.

## PR integration validation

Merged main's Base UI overlay update into this branch because the rename popover
uses that changed shared component. Tested code revision `bb2376ac`:

- Four focused desktop/mobile overview journeys passed (bundle preparation
  4.786s; browser execution 9.8s), with refreshed and inspected screenshots.
- Identity validation, player-profile observations, and settings-navigation unit
  checks: 22 passed in 3.01s.
- Full frontend lint and formatting, frontend typecheck, and diff whitespace
  checks passed. No integration conflicts or new validation failures.

# Galaxy arrow shortcuts

Validated on 2026-11-13 at base revision
`f1231cd8745238e0ad1ebe12fd2162095d613ed4` plus the uncommitted Galaxy hotkey,
dependency, component scenario and browser test changes in this worktree.

- `npm test -- src/features/galaxy-navigation.test.ts`: 1 passed (318ms).
- `npm run test:components -- galaxy-navigation.component.spec.ts --workers=1`:
  2 passed; preparation 4.129s, runner 1.8s. Covers both boundaries, current
  coordinates, discarded unfinished edits, unmount cleanup, editable fields,
  modifier keys, menus, dialogs and already-handled events.
- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- galaxy-cards.spec.ts -g 'Galaxy arrow shortcuts|galaxy controls stay compact|typed coordinates commit' --workers=1`:
  5 passed; preparation 4.657s, runner 8.3s. Covers hotkey-to-URL wiring, delivered
  system rows, leaving Galaxy, existing coordinate/history behavior and touch
  controls at 320px, 390px and 1280px.
- Focused ESLint and Prettier checks passed for both production files.
- `npx tsc --noEmit -p apps/web` and `npm run test:component-types` passed.
- `git diff --check` passed.

Before implementation, the three existing compact-control tests passed
(preparation 4.785s, runner 5.2s); desktop/mobile captures were inspected.
Final screenshots were inspected at 1280×844 and 390×844:
`test-results/galaxy-hotkeys-desktop-1280x844.png` and
`test-results/galaxy-hotkeys-mobile-390x844.png`. Focus remains visible and the
mobile controls retain their layout. Captures stay local for inline chat review.

No test failures or repairs. Dependency installation took 5s; typecheck and
lint timings were not separately measured. No runner queue, PR or merge delay
applies. Browser runs were serialized and their servers/temp bundles cleaned
up by the existing runner. Only fixture-backed frontend behavior was tested;
no backend, production or deployment changes were made.

## PR follow-through

PR #418, initial head `e943c0643c937b1c3150d1dc5d4c7472c99de288`:
CI run `43488361389`, attempt 1, failed in the journeys job
`132102802345` during `make test-homepage-built`. The news builder rejected
this change's note because its required YAML metadata was missing. Browser
assertions did not start; this is an authored content/build defect, not a test
repair. Added the required id, title and date metadata.

Bugbot review thread `PRRT_kwDOVRgPYs63PfWT` identified repeated Galaxy requests
when an arrow key is held. Native repeat keydown events reached the browse
callback without a guard. Ignore repeated events and retain deliberate repeated
presses after key release. A new isolated browser regression covers both arrows.
The updated component suite passed all 3 cases (preparation 4.874s, runner 2.4s),
and focused lint/format checks passed. No assertions were removed or weakened.

The initial build/lint/unit job `132102802026` also failed on the same missing
news metadata. After repair, `make test-homepage-built` passed, including the
production build and all 10 homepage browser cases (preview preparation 321ms,
runner 3.6s). The focused Galaxy journey passed again (bundle preparation 4.915s,
runner 3.0s), and both final viewport captures were refreshed and inspected.
Build-generated unrelated analytics route drift was discarded. Test servers and
temporary bundles were cleaned up by their runners.

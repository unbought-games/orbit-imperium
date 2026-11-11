# Full-width resource bar — 2026-11-10

Tested `ea180d7f038c2d6a8e7f96a8b724f356513efb3c` plus the uncommitted
shell CSS and test changes in this working tree, using Node 24.18.0.

The sticky header extends over the horizontal gutters and desktop orb lane.
Controls retain their content alignment. Opaque desktop/mobile surfaces hide the
Briefing glow when it scrolls underneath. No resource calculations changed.

## Validation

- `npm run test:components -- shell-layout.component.spec.ts --workers=1`:
  12 passed. Final bundle preparation 5.017s, runner 7.2s. The new regression
  checks the sticky surface's right edge, hit testing and absence of horizontal
  overflow at 390, 768, 1024, 1440 and 2200px.
- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- tutorial.spec.ts -g 'Empire briefing icon opens' --workers=1`:
  2 passed. Final bundle preparation 6.472s, runner 11.3s. Existing keyboard,
  pointer, acknowledgement and animation assertions remain intact. Additional
  screenshot scrolling is inactive when captures are disabled.
- Focused ESLint, Prettier for the CSS/component spec/build note, and
  `git diff --check` passed. The application spec's existing unrelated formatting
  was preserved.
- Inspected Empire at 1440×900 and 390×900: unread at the top, crossing the
  sticky edge, and fully hidden beneath it. Captures are in local `test-results/`
  as `briefing-{unread,crossing,hidden}-{width}x900.png`.

## Earlier attempts and coverage changes

The initial component run had 8 passes and 4 failures (4.799s preparation,
9.5s runner). The mobile test required `blur(4px)`; three divider cases required
the header to end at the content edges. Those expectations describe the old
presentation and conflict with this requested change. After inspecting Git
history, the repair ledger and the shell migration record, they were updated to
require an opaque mobile surface and a header spanning from the sidebar/viewport
edge to the right screen edge. Submenu alignment, borders, pinned scrolling,
resource popovers and body selection remain covered. No scenarios were deleted.
The original failure evidence is retained in `test-results/full-width-initial/`.

One intermediate run was cancelled after five passes (6.772s preparation): its
loaded test queried the CSS-hidden desktop sidebar at tablet width. The source
was corrected to query the sidebar only at desktop sizes; the task-owned runner
was stopped so it could load that correction. This is incomplete validation,
not a passing attempt. The final serial run passed all 12 cases.

Before the changes, both focused Briefing cases also passed (16.970s preparation,
12.4s runner), confirming that their old coverage did not expose the narrow bar.
The component build reported an existing mixed JSON import-attributes warning.

Browser suites ran serially after another local validation run finished. Their
runners cleaned up their temporary bundles, browsers and port leases. No
production build, deployment or PR was requested. CI wait and merge delay are
not applicable; end-to-end local duration was not separately measured.

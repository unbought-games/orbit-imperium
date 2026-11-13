# Settings navigation first pass

Base revision: `3040d3fc`, plus uncommitted settings changes.

Desktop settings uses real section paths and replaces the game sidebar through a
composable sidebar slot. Identity and insignia share the first destination;
vacation is under Game settings; universe rules are under Help & community.
Mobile retains ordinary game navigation, with a Settings index and individual
section pages. Desktop opens Empire identity with the focused sidebar.

## Coverage and failure record

- Deterministic route tests cover section matching, canonical links, unknown
  sections and rejected foreign bodies.
- Static navigation rendering checks every settings path for exactly one active
  link, catching the duplicate explicit Identity selection reported in preview.
- Existing vacation, deletion and insignia scenarios enter their new owning paths;
  their behavioral assertions remain unchanged. The touch navigation case returns
  through Back to game before opening Facilities.
- New mobile wiring/layout coverage checks loaded identity fields and unchanged
  mobile navigation without horizontal overflow.
- Removed the new desktop “settings sidebar has one active route and preserves
  identity saves across navigation” test under the one-repair rule. First run
  failed importing JSON in the shared Node fixture (missing import attribute).
  The fixture was repaired using the existing filesystem JSON-loading pattern.
  Second run failed because the unscoped status locator matched several shell
  live regions. No retries or stabilization patches were added. The mobile case
  passed after the fixture fix. Active selection is retained at the static
  render boundary; profile edit behavior already has deterministic identity and
  existing mobile profile coverage. Manual preview checks cover the new desktop
  navigation and embedded save flow; they are not an automated regression gate.
- First browser preparation: 5.867s; second preparation: 5.838s. Failed desktop
  executions: 0.357s (import), 1.9s (ambiguous locator); mobile: 0.154s (import),
  then 1.1s passing. Local runner; remote allocation/queue time not applicable.

No production data, services or deployment were changed. The local preview uses
free fixture content. Its server is retained for the requested browser review;
browser-suite servers and disposable bundles clean up through the npm runner.

- The broader run passed five cases before the legacy Settings path case stalled
  in `openNavigation`: the shared helper waited for Main navigation even though
  desktop Settings now replaces it. Interrupted that task-owned runner and fixed
  both entry points in the common helper to use Back to game first. Audited the
  affected settings suites; planet-page-routing was the sole direct caller in
  those suites. Updated its Settings link expectation to the new canonical path.
  This is the first adaptation/repair for the new contextual sidebar contract;
  existing assertions and body/history coverage remain intact.

## Final checks

- 40 focused deterministic/render tests passed (routes, settings actions, empire
  identity, and single-active-link rendering). The new static render check was
  also typechecked after supplying its required provider children prop.
- 10 distinct focused application scenarios passed across the scoped runs:
  touch sidebar transitions; mobile settings; deletion request/cancel; desktop
  and mobile insignia collection; desktop and mobile legacy normalization/body
  switching/history; two vacation flows; screenshot-preparation contract.
- The repaired navigation run prepared its bundle in 5.511s and passed all five
  selected cases in 11.4s. A final mobile capture run after visual adjustments
  prepared in 6.442s and passed in 2.5s (test execution 1.5s).
- `npx tsc --noEmit -p apps/web`, `npm run lint`, changed-source Prettier checks,
  and `git diff --check` passed. Full builds/backend acceptance were not run.
- Manually exercised every desktop destination, verified one active item each,
  saved identity twice, reloaded the saved tagline, and opened/discarded an
  insignia draft. Inspected desktop 1440×1000 and mobile 390×844 captures,
  including the editor. Browser tab viewport override was reset afterward.
- Final screenshots and labeled review sheets are in ignored
  `test-results/settings-preview/`. Preview server: local ports 5177/5178.

## Heading consistency follow-up

- Introduced shared DestinationLayout and DestinationHeading components. Each of
  the six desktop destinations rendered its first title at y=89px with a 24px,
  weight-400, 28.8px-line-height heading and 0/0/16px margin. The layout adds 24px
  top padding. Rewards body/subheading sizes now match the other settings pages.
- Removed Open Beta from Help & community. Confirmed no matching notice remains
  in the rendered mobile page. Universe settings and preview dimensions were not
  changed; production values were confirmed by the user to already be correct.
- TypeScript, ESLint, formatting, and diff checks passed. The focused mobile
  navigation/layout scenario passed (6.504s bundle preparation; 1.6s execution;
  2.7s runner total). No new test was added for this presentation-only refinement.
- Captured and inspected all six desktop destinations at 1440×1000 and mobile
  settings/rewards at 390×844. Fresh evidence is in
  `test-results/settings-preview/headings/`. Reset the browser viewport override
  and left the preview open. Changes remain uncommitted on base `3040d3fc`.

## Native select spacing follow-up

The shared native Select now has a decorative 16px chevron inset 14px from the
inline end, with 44px text padding to reserve its space. It retains native form,
keyboard and mobile picker behavior; multiple/size-listbox controls retain native
presentation. Saved designs now uses that shared component too. Base UI
RichSelect remains the existing separate rich-menu control.

TypeScript, lint, formatting and diff checks passed. The existing mobile identity
journey passed (5.627s preparation, 1.2s execution, 2.0s runner total), covering
selection/save, stale drafts, and unavailable saved choices. Desktop/mobile
screenshots are in `test-results/settings-preview/select-spacing/`; desktop DOM
measurements confirmed the 14px inset and 16px icon. Browser viewport override
was reset, and the preview remains available. The current user draft was retained.

## Mobile section navigation

- `/settings` now opens the shared settings navigation as a mobile/tablet menu.
  Every detail route mounts only its own section. Back to Settings uses the
  canonical parent route and preserves the selected body, including on Rewards.
  Desktop entry replaces the index with `/settings/identity`; resizing a menu
  across the 1024px sidebar breakpoint resolves to the same desktop layout.
- Extended the healthy mobile wiring case for Menu → Settings → detail, browser
  Back, explicit parent links, reload, Rewards return, and desktop entry. Existing
  Menu/legacy body-routing/planetless and shell settings cases were adapted to
  the new index/detail contract without removing their coverage.
- 27 deterministic route/navigation checks passed. Seven focused navigation
  browser cases passed first attempt (8.593s preparation, 19.1s runner total),
  including 320px and 390px Menu entry plus desktop/mobile canonicalization.
  The adapted shell case also passed (11.887s preparation, 4.2s execution, 6.3s
  runner total). TypeScript, lint, formatting and diff checks passed.
- Visually inspected the mobile Settings menu and all six detail destinations at
  390×844, confirmed no horizontal overflow, checked the 800px tablet menu and
  1440×1000 desktop transition. Captures are in
  `test-results/settings-preview/mobile-sections/`. Reset the viewport override
  and retained the local preview. Runner servers/bundles cleaned up normally.
- Universe settings and backend behavior are unchanged. Base remains `3040d3fc`
  with the accumulated, uncommitted settings implementation.

## Pre-PR integration review

The remaining community/support, account identity and Galaxy probe scenarios now
enter the corresponding section routes. The retired Settings beta-notice
expectation was replaced by explicit absence, preserving public-enrollment beta
coverage. All nine affected browser cases passed (6.151s preparation, 26.3s runner
total). The parent Back to Settings link now uses exact active matching so it
isn't announced as the current page on a detail route; the mobile journey verifies
that contract.

The first production build found missing YAML metadata in the new change note.
Added the required identity/title/date metadata and reran successfully. Production
build, source/component typechecks, ESLint, full source formatting, contract and
boundary checks passed. Vite production asset generation took 5.09s and homepage
SSR generation 0.819s; total build wall timing was not captured. Browser checks use
fixture HTTP boundaries and do not claim production/server persistence coverage.

## Main integration for PR #408

Integrated main `823a7187` into implementation head `1ae47b58` because GitHub
reported a real Settings conflict. Preserved main's Orders awaiting confirmation
control under Game settings, updated its existing desktop/mobile recovery journey
and change-note destination, and retained the remaining main changes unchanged.
The integrated fixture run passed all three selected cases (5.240s preparation,
21.2s runner total), including retrying the same durable order after dismissing
and reloading its notice at 1280px and 390px. Thirty focused unit/render cases
passed. Component types, production build, lint, formatting, boundary and contract
checks passed. Inspected fresh recovery screenshots at 1280×900 and 390×900 and
showed them in the originating chat before queue enrollment. No new test repair
attempts or queue removals were needed during this integration.

## PR checks and review repair, head `15f754c3`

CI run `43355456151`, job `131656385040`, failed one of 126 feature-shard cases:
“failed saves preserve the draft and the library can recover.” The page-wide alert
locator matched the intentional insignia-save error and an unrelated 404 from the
new empire identity read. This is a deterministic fixture/selector defect, not an
infrastructure failure. History and the repair ledger were checked; this is its
first repair. The shared identity fixture is now installed by both Settings and
insignia fixtures, and the error assertion is scoped to the insignia region.
Explicit response boundaries retain failure and reload ordering. All insignia
callers were audited and the complete insignia file passed with the shared fix.
The aggregate gate failure was downstream of this browser failure; native checks
had passed. No tests or assertions were deleted and no timeout/retry was added.

Validated both automated findings: retired `#galaxy-espionage` bookmarks now
replace-navigate to the real game-settings route and discard that fragment;
protocols 2/3 omit Empire deletion and reject direct deletion routes. Static
navigation and deterministic route tests cover protocol gating. The existing
legacy-routing journey covers migration at both desktop and mobile widths.
Its first desktop run exposed a real new redirect race: the outgoing index saw
the cleared fragment before the lazy game route mounted and redirected again to
Identity. Guarding redirects to the index pathname fixed the product defect;
the unchanged regression assertion was retained and passed. This did not consume
a test repair attempt.

34 unit/render checks passed. The first browser run prepared in 4.897s and finished
in 47.8s (15 passed, one product-regression failure); the affected migration run
then passed both cases (4.614s preparation, 5.8s runner total). Types, lint,
formatting and diff checks passed. Inspected old-universe navigation at desktop
1280×900 and mobile 390×844 plus direct-link rejection; captures are under
`test-results/settings-preview/compatibility/`. The temporary protocol-3 preview
server/tab were cleaned up; the original review preview remains available.

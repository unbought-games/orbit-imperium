# Remaining planet-path migration — November 4, 2026

Worktree: `/Users/ethan/.codex/worktrees/d840/orbit-imperium`.
Base revision: `611d7c156c612a38ef778eb35bc19536ff19dbc7`, with the existing uncommitted onboarding/Briefing work preserved.
Tested dirty-worktree SHA-256: `756f0b69be418fb0563901f24f7081acf59c95d9014ee525ceb3efcd28530a1b`.
The digest covers sorted changed/untracked `apps/web/` files and changed `playwright.config.ts`, each path and content NUL-delimited (49 paths).

## Behavior

Messages, Alliance, High Scores, Settings and Combat Simulator now use `/u/$universe/b/$body/<page>` when a planet is selected. Shared navigation targets, message selection, profile shortcuts, HUD conversation links and Settings notices retain the selected planet. Planet switching and legacy normalization preserve non-body query parameters and hashes. Canonicalization replaces history and waits to mount the page until the canonical route is ready, avoiding duplicate initial requests.

Universe-level routes remain valid entry points for legacy URLs and planetless memberships. Explicit inaccessible planets still fail authorization without selecting a fallback. Player/alliance query validation is shared by old and new routes. Public alliance universe-ID entry links preserve planet, alliance and hash while resolving the current universe name. Anonymous canonical direct links retain their entire return destination at the login gate. Briefing's planet path and separate navigation selection remain intact.

## Validation and repair record

- `npm run routes`: generated the route tree, retaining Briefing routes.
- `npm test -- apps/web/src/router.test.ts apps/web/src/shell/routes.test.ts apps/web/src/shell/page-search.test.ts apps/web/src/shell/navigation-model.test.ts apps/web/src/client-model/universe-name.test.ts`: 32 passed; final run 2.47s. Initial run also passed (6.26s).
- `npm run lint`, `npx tsc --noEmit -p apps/web`, `npm run format:check`, and `git diff --check`: passed on the final source.
- Browser runs used `ORBIT_TEST_SCREENSHOTS=0 npm run test:ui -- ...`, isolated HTTP fixtures and the existing response-aware readiness helper. No live account authentication or gameplay was used.

Browser execution history:

| Run | Coverage | Module preparation | Runner | Result |
| --- | --- | --- | --- | --- |
| 1 | Initial routing suite | 3.514s | 15.6s | 12 passed, 1 failed |
| 2 | Settings repair, message selection, profile link, recruitment link, simulator, High Scores | 2.065s | 8.9s | 7 passed, 1 failed |
| 3 | Public alias, redundant body query, anonymous direct link | 2.017s | 2.3s | 3 passed |
| 4 | All 15 routing cases, High Scores, desktop/mobile Briefing | 1.953s | 22.1s | 18 passed |
| 5 | Existing HUD scenario with canonical conversation-link assertion | 2.896s | 4.8s | 1 passed |
| 6 | Profile shortcut, public recruitment and desktop/mobile simulator on final source | 1.964s | 4.8s | 4 passed |

Final coverage comprises 23 distinct browser cases. Routing cases cover desktop 1440×900 and mobile 390×900, legacy redirects, direct refresh, back/forward, body selection, menu hrefs, meaningful queries/hashes, absent planets, inaccessible planets and login return URLs.

Failure 1 was an ambiguous shared mobile navigation helper: searching for Settings also matched Resource settings. Inspected helper history (`c56a159c`, `1181001f` and earlier changes) and repository repair records; no separate Test Czar ledger was available. One repair makes Settings an exact accessible-name match while preserving partial matching for badge-bearing destinations. Audited Settings callers in shell, routing, foundation, desktop-navigation and web-app tests; direct callers already used exact names. This repair covers all helper callers and passed on both viewports. No follow-up owner is required.

Failure 2 was the existing High Scores single-snapshot assertion observing two requests instead of one. Inspected test history (`906e18a8`, `fac5c25b`, `1181001f`, `68aa2e78`, `1e470d0d`) and the rankings controller lifecycle. Switching from a legacy route ID to a canonical route ID mounted the page twice. One application repair defers Outlet mounting until normalization finishes. Audited the shared effect and all five migrated screens; the regression assertion is unchanged and passes. No assertions weakened, tests deleted, timeouts increased or lucky retries used.

Some fixture runs logged refused overview-proxy requests to the unused default backend at port 8080; all registered response-gated assertions completed successfully. The final targeted link run had no proxy warnings. The requested live development server at port 55102 was not used for those fixtures.

Browser scheduling wait and cleanup were not separately instrumented; runner totals include scheduling. Lint/type/format setup and execution were not separately timed. No CI, queue removals or merge delay apply. Fixture servers and browsers exited through the existing runner cleanup. The original dev server still returns HTTP 200. No commits, pushes, PRs, database resets, grants or gameplay orders were issued.

## Visual limitation

The owner explicitly requested no more screenshots. No screenshots were captured or delivered, including failures; the screenshot helper now honors explicit `ORBIT_TEST_SCREENSHOTS=0` while retaining normal failure diagnostics by default. Browser DOM, navigation and existing layout assertions passed, but fresh pixel-level visual inspection was intentionally omitted.

## PR integration on current main

Publication isolates the routing commit from the unpublished onboarding, Briefing and advisor work. The original checkout remains unchanged. The publication base is `a0a3b7d1` (main); only routing changes were applied in a separate checkout. Current main's standalone Menu page retains its existing URL and selected-body behavior. Its destination links use the new canonical routes. Alliance routes reuse the current recruitment validator, preserving welcome and invitation intent; the obsolete alliance body-query generator was removed.

Validation used the pinned Node 24.18.0/npm 11.16.0. Dependency installation took 3s. All 37 focused unit cases passed across the main six-file run and the repaired two-file run. The initial new invitation route assertion failed because TanStack's server-mode memory router redirects numeric `welcome=1` to the validated string serialization; the assertion now uses the router's standard query serialization, while browser coverage keeps the raw legacy input. The repair passed (13 cases, 1.40s). History and the existing parser normalization test were inspected; no separate Test Czar ledger was available.

The adapted 21-case browser suite passed (preparation 3.406s, runner 19.1s). Two additional recruitment-manager cases passed. Expanding the two Alliance navigation cases to include welcome/invitation initially failed their literal URL expectations for the same numeric-to-string serialization. One expectation repair retained the raw legacy input and asserted the exact canonical encoded string; both passed (preparation 2.069s, runner 4.2s). No assertions were dropped, tests deleted, deadlines increased or retries used to conceal intermittency. Current final browser coverage is 23 distinct cases. Original Briefing behavior remains in its untouched source checkout and is not included in this standalone PR.

Final formatting, lint, TypeScript and whitespace checks passed. Fixtures were cleaned up by the test runner. Screenshots remained explicitly disabled. Scheduling and cleanup time were not independently instrumented. Some fixture teardown requests still logged connection refusals to the unused default backend at port 8080; response-gated assertions passed. The app's managed-worktree creation request did not return; a separate local clone was used instead, with no source-checkout or live-account mutation.

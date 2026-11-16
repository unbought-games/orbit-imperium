# Player support links — November 15, 2026

Implementation base: `6eafeb0c8397eb49ea4b2e1a0b75ed198b801784`, plus the
uncommitted support-links component, settings integration, focused navigation
journey, and accompanying notes. No release or deployment performed.

## Destinations and scope

The CMO thread **Find verified vote callbacks** and its November 14 listing
inventory identify the four live directory destinations below. The current
request explicitly excludes Renown, superseding that thread's earlier proposed
self-report reward. This change adds ordinary external links only.

- [BrowserGamesTop voting](https://browsergamestop.com/vote/orbit-imperium)
  and its [FAQ](https://browsergamestop.com/faq) were retrieved November 15.
  The FAQ confirms anonymous voting once per 24 hours.
- [Foundplay](https://foundplay.io/games/orbit-imperium) was retrieved November
  15 with its Upvote control. No vote was submitted, so copy does not promise
  that completing the action is account-free.
- [IndieDB](https://www.indiedb.com/games/orbit-imperium) and
  [ModDB](https://www.moddb.com/games/orbit-imperium) follow controls were
  verified in the November 14 CMO browser review. November 15 HTTP retrieval
  returned 403 and the connected browser inventory was empty. Login requirements
  remain conservatively labeled; this change does not ask for ratings.
- [Orbit's GitHub repository](https://github.com/unbought-games/orbit-imperium)
  and [Unbought Games](https://github.com/unbought-games) were retrieved November
  15. The repository explicitly requires sign-in to star it.

Pending/unverified listings (Top Web Games, NewRPG, PBBG) and the non-voting
browsergames.top directory are excluded.

## Navigation and validation

The existing Help & community destination now begins with Help Orbit grow.
The shareable entry URL is `/u/<universe>/settings/support`, without a sender’s
body, search or fragment. Existing routing
resolves the recipient's owned body and replaces the URL with
`/u/<universe>/b/<recipient-body>/settings/support`.

- `npm ci --no-audit --no-fund`: successful; 3 seconds reported.
- `npm test -- src/router.test.ts src/shell/routes.test.ts src/shell/settings-navigation-model.test.ts src/shell/settings-navigation.test.ts`:
  36 tests passed, 2.77 seconds.
- `npx tsc --noEmit -p apps/web`: passed; phase timing unavailable.
- Focused ESLint and Prettier checks for the changed source files: passed.
- `git diff --check`: passed.
- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- desktop-navigation.spec.ts -g 'support links share' --workers=1`:
  final run passed, 4.146 seconds bundle preparation, 6.3 seconds test execution,
  6.9 seconds total browser runner. No remote runner wait or merge queue.

The browser journey covers all six destinations and external-link semantics,
a new tab with an intercepted external page, preserved game URL,
mobile touch-target size/overflow,
a recipient with a different owned body, and reload. It never sends a vote,
star, follow or external campaign visit. The existing inactive tutorial fixture
and account/reward responses remain unchanged.

Desktop (1440×1000) and mobile (390×844) screenshots were inspected before and
after implementation. Mobile actions were moved below descriptions to keep
buttons clear of the floating command orb. Current captures are retained locally
in `test-results/support-links/`: `desktop-1440x1000.png`,
`mobile-top-390x844.png`, and `mobile-follows-390x844.png`. Earlier clipboard
captures represent the superseded design.

## First-attempt failure and one repair

The new journey's first run passed its support-link, clipboard and mobile
assertions, then failed in recipient setup: `shellFixture` always opens the
fixture's default body before a test's target navigation. Giving it only a
different body correctly produced **Destination unavailable**, so its expected
Empire heading never appeared. This was a deterministic test setup defect,
not a product failure or infrastructure incident.

Reviewed `fixtures/game.ts` history and the existing shellFixture entries in
`docs/runbooks/test-performance-audit.md`. This new scenario had no earlier
repair. Its one repair uses `installGameFixture` for the recipient, then enters
the copied URL directly through `withBootstrapResponse`. Other callers that
need the default overview retain `shellFixture`; no shared helper was changed.
The failed run's output and screenshots are preserved locally under
`test-results/support-links/first-attempt/` (4.175 seconds preparation, 6.8 seconds
failed test). The repaired run passed (4.153 seconds preparation, 6.9 seconds
browser runner); the final rerun followed the mobile layout fix.

The fixture runner closed its browsers/server, released its port and removed
its temporary bundle after each run. No task-owned test processes remain.

## Heading cleanup

Removed the redundant visible Help & community destination title at the owner's
request. The page now starts with Help Orbit grow; the shell's accessible H1
remains. Refreshed and inspected all four desktop/mobile captures. The focused
browser journey passed again (6.315 seconds preparation, 7.5 seconds test,
8.5 seconds runner), and focused formatting/lint plus diff checks passed.

## Copy control and explanatory copy removal

At the owner’s request, removed the new-tab explanatory sentence and the entire
copy-link interface, including clipboard state, fallback field, imports and CSS.
Removed obsolete clipboard assertions from the existing journey; direct-entry
canonicalization, reload and external-tab checks remain. The earlier failure and
one-repair history above still apply to this scenario. The no-Renown sentence
remains. Refreshed desktop and mobile captures after the cleanup.

The updated journey passed (5.793 seconds preparation, 7.0 seconds test execution,
8.0 seconds runner). Focused lint, formatting and diff checks passed. The runner
cleaned up its browser, server and temporary bundle.

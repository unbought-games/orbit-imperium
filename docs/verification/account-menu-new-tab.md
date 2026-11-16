# Account links on desktop and mobile

Validated on `13e4d5c07cfab017d65b821036eee6979395e467` with the local
account-menu changes in this checkout.

The desktop player menu and mobile Menu → Account use the same configured
account URL. Both open a separate tab with no opener. An absent URL hides the
link. The mobile row uses the existing navigation styling and company symbol.

## Validation

- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- desktop-navigation.spec.ts -g 'menu page preserves' --workers=1`:
  two passed, covering the configured mobile destination and an unconfigured
  server, retained navigation/history, touch-target geometry, and narrow layout.
  Bundle preparation: 4.735 seconds; runner: 11.9 seconds.
- `ORBIT_TEST_SCREENSHOTS=1 npm run test:components -- shell-navigation.component.spec.ts -g 'account link' --workers=1`:
  two passed, covering keyboard activation into a new tab, breakpoint dismissal,
  and the unconfigured desktop menu. Bundle preparation: 4.264 seconds;
  runner: 2.0 seconds.
- `npx tsc --noEmit -p apps/web`, focused ESLint, Prettier and
  `git diff --check` passed.
- Inspected final captures: desktop player dropdown at 1440×900, mobile Menu at
  390×844, and the Menu page at 1440×900. Captures remain local in `test-results/`
  and are displayed in the implementation chat.

The initial baseline runner could not start because this fresh checkout had no
dependencies. `npm ci --no-audit --no-fund` installed them; baseline browser
checks then passed. No assertion failures or test repairs occurred. The browser
runner closed its browser/server and removed temporary bundles. No CI, queue or
deployment was requested; runner allocation time was not measured separately.

## Rewards-enabled preview correction

The first screenshots used a standalone-server fixture with rewards disabled.
They did not represent the full hosted Account section. No production change was
needed: Rewards already precedes Settings when the rewards program is active.
The existing rewards-navigation checks now include the account URL and assert
the mobile order: Rewards, Settings, Unbought Games account.

`ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- community-rewards.spec.ts -g 'rewards opens from account navigation' --workers=1`
passed both desktop and mobile cases, including opening Rewards. Final bundle
preparation took 5.362 seconds; the runner took 13.6 seconds. Screenshot-only
preparation waits for the existing welcome caption to finish. Final 1440×900
and 390×900 captures were inspected and replace the earlier preview for review.
Formatting and diff checks passed. The runner cleaned up its browser and server.

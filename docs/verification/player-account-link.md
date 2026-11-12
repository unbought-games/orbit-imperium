# Player account link verification

November 12, 2026. Base revision `5b2770a6059372cbdfcabb690af0a515b22b806b`
plus uncommitted account-link changes. Concurrent header changes were preserved during work and subsequently removed
by their owner; final captures use the current checkout.

## Behavior

`ORBIT_ACCOUNT_URL` is optional runtime configuration. Missing/blank values hide
the desktop player-menu link. Absolute HTTP(S) destinations without credentials
are accepted, including explicit local development destinations. Official infra
sets `https://accounts.unbought.games/account` in its runtime deployment recipe.
There is no frontend build-time official-server default and no deployment here.
The link uses the approved light company symbol, copied unchanged from brand.

## Checks

- Focused server configuration and HTTP auth-config tests: 2 passed; compilation
  18.52 seconds, execution 0.547 seconds. The earlier broad Rust run reported
  123 passes before the chat interruption; its final result was not recovered.
- Account menu component tests: 2 passed; final bundle preparation 4.116 seconds,
  browser execution 2.1 seconds, one worker. Covers configured/unconfigured
  display, image delivery, keyboard navigation to the configured destination,
  popup geometry and closing when the desktop sidebar becomes hidden.
- First component attempt: configured case failed an arbitrary minimum-width
  assertion (218.7px versus 220px), while the unconfigured case passed. Inspection
  showed no overflow. Replaced that assertion with actual scroll/client-width
  containment; the focused rerun passed. No timeout/retry changes.
- OIDC adapter tests: 6 passed, 160ms.
- Application TypeScript, ESLint, affected Prettier files and Rust formatting pass.
- Shared component TypeScript initially encountered a concurrent unrelated
  `Node.remove` error in `shell-layout.component.spec.ts`. That concurrent change
  was removed; the final component TypeScript check passes.
- PostgreSQL test fixtures compile with `cargo check -p orbit-storage-postgres
  --tests --features test-support` (19.14 seconds). The initial invocation omitted
  the required `test-support` feature and failed on gated fixture helpers; no
  product/test changes were needed. No database tests were run.
- Infra runtime Caddy tests: 11 passed, 0.014 seconds. No AWS or Docker operations.
- Company SVG byte comparison passes.

## Visual evidence

Inspected final running component-gallery captures:

- `test-results/account-link/desktop-1440x900.png`: configured menu open.
- `test-results/account-link/unconfigured-1440x900.png`: default menu without link.
- `test-results/account-link/mobile-390x844.png`: desktop menu dismissed and hidden.

The fixtures render real shell/menu components with prepared game data. External
account navigation is intercepted at the network boundary; this does not claim a
live Accounts sign-in test. The browser runner cleans up its server/assets.

Follow-up: added the standard 16px profile icon beside “My Orbit profile”.
Focused menu checks (2), file lint and formatting pass; all three captures were
refreshed and inspected after the icon addition.

## PR preparation

Moved the scoped changes onto main base
`de9b8336` without the
unrelated source branches. ESLint, application/component TypeScript and both
menu cases pass again; browser preparation 4.670 seconds, execution 2.4 seconds.

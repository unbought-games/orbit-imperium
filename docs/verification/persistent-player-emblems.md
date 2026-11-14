# Persistent player emblems

Initial local validation on base `6eafeb0c8397eb49ea4b2e1a0b75ed198b801784`
plus this change, 2026-11-14, before committing or opening the PR. No deployment.

## Cause and behavior

The shared profile controller scheduled renewal at the same deadline that made
`currentPlayer` return undefined. Any network latency could therefore remove and
restore the emblem. Account cosmetic observations cap that deadline at 60 seconds.
The standalone empire profile had a separate timer hiding the same display.

Profile expiry now schedules refresh without hiding the last confirmed display.
Explicit refresh fences earlier requests without clearing visible profiles.
Successful observations replace complete profiles, including emblem removals.
Session disposal still clears the controller, cancels requests and fences replies.

Game profile snapshots persist in local storage under the complete account,
universe, epoch and player binding, and are schema-validated before restoration.
They are display observations, never eligibility/authorization evidence. Storage
failures preserve the in-memory experience. The browser may evict or disable
persistent storage; it is not a guarantee of permanent offline availability.

Immutable, content-addressed SVGs use private one-year caching for installed
external artwork; bundled artwork already had public immutable caching. Network
requests still require authentication for external artwork and an installed
catalog entry. Previously downloaded bytes can outlive logout/catalog changes.

## Validation

- `npm test -- player-profiles player-profile-cache player-name player-alliance`:
  34 tests passed in 0.666s on the final source. Cases cover held requests through expiry, outages,
  source sharing, response fencing, removal, immediate restoration, binding
  isolation and malformed/unavailable storage. Existing expiry assertions were
  updated to the requested stale-display contract, not removed as unreliable.
- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- insignias.spec.ts -g
  'Galaxy emblems remain visible' --workers=1`: passed. Application preparation
  5.525s; test execution 3.1s; runner total 4.1s. Two fixture players remain visible
  during held refresh and reload responses; a successful removal is reflected.
- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- empire-history.spec.ts -g
  'keeps its loaded emblem' --workers=1`: intentionally failed against the
  original standalone-profile expiry logic after advancing 61 seconds. After
  removing the product's hiding timer, passed: preparation 5.428s, test 0.863s,
  runner total 1.7s. No test repair, retry workaround or timeout change.
- `make test-db DB_SUITES=insignias DB_JOBS=1`: passed the real HTTP/PostgreSQL
  integration, including external-media authentication and private immutable
  headers. Compilation 39.30s; second preparation 0.27s; execution 3.916s.
  Used an isolated Compose project and disposable database. Initial Compose
  preparation failed because Docker's automatic address pools were exhausted;
  an inspected, nonoverlapping explicit subnet resolved that infrastructure
  failure. The task's container, volume and network were removed afterward.
- `npm run lint`, `npx tsc --noEmit -p apps/web`, `npm run format:check`,
  `cargo fmt --all --check`, `node scripts/check-boundaries.mjs` and
  `git diff --check`: passed.

Browser preparation and execution ran serially. There was no external runner
queue or merge delay; setup/cleanup timings not listed above were not separately
measured. Browser runners closed their servers and removed temporary bundles.

Desktop (1440×1000) and mobile (390×1000) screenshots were inspected for Galaxy
with refresh pending, Galaxy restored after reload with responses pending, and
the standalone profile after expiry. Images remain local under `test-results/`
and are displayed in the implementation chat, not hosted in a PR.

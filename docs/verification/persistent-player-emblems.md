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

## PR follow-through

PR #436, initial head `07af7df4b30c9e24afdb1ab176640eae9cf2462b`, CI run
`43630589536`, attempt 1:

- Journey job `132556169346` failed during homepage preparation because the new
  change note lacked the YAML frontmatter required by `scripts/news.mjs`.
  This was a packaging defect in this change. Added the note ID, title and date;
  `npm run news:build` and both `scripts/news.test.mjs` tests passed.
- Feature job `132556169403` failed the final assertion in `shell.spec.ts` case
  "supporter claims color the shared account identity after sign-in and clear on
  refresh": it expected zero badges after a 301-second outage, but two remained.
  The assertion encoded the superseded expire-and-hide contract. The one repair
  attempted to require the last confirmed badge and gate complete 503 delivery.
  That run then stalled at `withFixtureResponseStatus` after the 301-second
  fake-clock jump. It was interrupted after 1.2 minutes; the failure stack names
  `shell.spec.ts:83`, waiting for `requestfinished`. No completed matching
  response arrived; the precise timer/network ordering was not established.
  History traces the outage expectation to `f4a3dc24`; the repair ledger has no
  prior repair for this assertion. Per the one-repair rule, retired the entire
  broad scenario instead of another timing patch or retry.

  Retained coverage: `player-profiles.test.ts` covers tier replacement/removal,
  outages, expiry and stale-response fencing; `player-profile-cache.test.ts`
  covers account/universe/epoch/player isolation; `supporter-identity.test.ts`
  covers tier labels and ordinary markup; the existing
  `profile-display.component.spec.ts` verifies all three actual badge colors,
  accessible labels, ordinary identities and mounted consumer updates. The new
  Galaxy cache journey covers the actual provider's reload/refresh wiring.
  Lost browser wiring: this exact account-menu → Settings sequence and its
  supporter thank-you text after polling. The old test changed only a username,
  not the account binding, so it did not prove real cross-account isolation.

- The native build job `132556169299` failed for the same missing note
  frontmatter, after its client/server/static checks passed. The complete
  `npm run build` subsequently passed locally (Vite client build 4.67s).
- Review thread `PRRT_kwDOVRgPYs63iDQx` flags removal of the 1024-entry cap.
  Retaining every previously visited player for the client's lifetime, including
  across reloads when browser storage permits, is the explicitly requested
  behavior. Expiry-based or count-based eviction would contradict that contract.
  The cache contains public display observations for one binding, no game state
  or access grants. Storage errors are caught and do not interrupt the in-memory
  client; persistence under browser quota/eviction is already documented above.
  Disposition: intentional retention policy and accepted growth tradeoff, not a
  reason to reintroduce eviction or change the requested behavior.
- Repair validation: 30 focused profile/cache/supporter tests passed (0.383s).
  Both existing profile-display component cases passed (preparation 4.326s,
  execution 0.490s and 0.315s, runner total 1.6s). No product rendering changed
  during the CI repair; the inspected desktop/mobile captures remain current.

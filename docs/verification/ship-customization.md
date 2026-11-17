# Ship customization first slice

The integrated implementation is prepared for owner acceptance and UX review on
one PR. The new UI is development-only. No production deployment is included.

## Scope and ownership

The approved contract is [IMPLEMENTATION.md](../plans/asset-customization/IMPLEMENTATION.md).
The accepted source studies are retained in `tools/ship-livery`; the production
package/renderer is in `packages/ship-appearance` and `tools/ship-appearance`.

Four implementation lanes were integrated: empire identity/backend, asset runtime,
Shipyard/inventory, and full-screen hangar. The integration owner serialized browser,
production build and full typecheck work; the backend owner held the shared
validation slot for focused Rust/database preparation and execution.

## Validation evidence

- Client suite: **226 files / 2,004 tests passed**, 12.70 s total, four workers.
- Tooling: **130 passed / one explicit Docker opt-in skipped**, 13.83 s; production
  renderer **13 passed**, 2.01 s. Renderer tests include a fourteen-package registry,
  exact protected pixels/raw map decoding, malformed inputs, restricted asset
  fetching, cancellation, disconnect and retry behavior.
- Full frontend and component typechecks, ESLint, Prettier, Cargo formatting,
  generated OpenAPI drift and architecture boundary checks passed.
- Production frontend build passed; inspected emitted JS contains neither the
  hangar entry nor ship-appearance API calls. Public free asset bytes may be packaged
  without being requested/displayed. The gate requires DEV and local opt-in.
- Six focused browser scenarios passed (8.5 s execution, 4.55 s bundle preparation).
  They cover ordering/navigation, owner-bound inventory art, keyboard focus/discard,
  live recoloring/emblem changes, consecutive saves and mobile overflow. Affected
  hangar scenarios were rerun after visual fixes: three passed in 5.2 s, 4.43 s setup.
- The real renderer service produced eight transparent image variants in 1.73 s
  from an actual game emblem. The resulting pixels were inspected.
- Real HTTP/PostgreSQL/renderer/browser flow passed at clean revision
  `d0aa53fe6442b578e17d8a576ba57c80b453e975`: preparation 29.288 s, execution 24.480 s.
  It saved/equipped through the UI, verified transparent images and anonymous media
  rejection, survived reload and API restart, and changed the current emblem without
  saving another ship revision. The artwork UUID changed and ship revision stayed 1.
  Desktop/mobile captures and current fleet inventory were inspected; zero page errors.
  The earlier run at `22657f10` also passed (30.223 s setup, 24.022 s execution).
- Backend source `18f31e75` passed five ship HTTP/DB tests, the migration upgrade test
  and existing insignias test (11.477/0.762/3.700 s), plus two renderer adapter tests.
  Clippy passed in 17.00 s. See [backend handoff](../plans/asset-customization/backend-handoff.md)
  for compilation, runner startup, failure evidence and later review followups.

The live verification entry point is `make test-ship-customization-live`, explicitly
invoked with an isolated Compose project and `ORBIT_TEST_DB_PORT`. It remains outside
routine CI. Routine CI adds only deterministic renderer tests and focused component
cases to the existing coverage layers.

## Failures and corrections

- Initial client test invocation preceded dependency setup and could not locate
  Vitest; no assertions ran. `npm ci` installed pinned packages in approximately 3 s.
- First native frontend build rejected the new build note's missing YAML frontmatter;
  the note was corrected and the build passed.
- The first browser pass completed the focus case, then waited on the emblem select's
  exact label. Its surrounding label included option text. The run was interrupted
  after 1.4 minutes, evidence retained, and explicit accessible names were applied to
  all four new selects. The unchanged behavior assertions then passed.
- Visual inspection found workspace/footer overlap, then oversized preview content;
  the desktop now reserves footer space and independently scrolls controls. Mobile
  uses natural scrolling. Narrow order actions and emblem selectors were stacked
  to retain complete labels. Affected images were refreshed.
- First backend DB fixture reused a universe name across scenarios. Its one repair
  uses UUID-derived names and audited the sibling migration fixture. Two cases were
  canceled by fail-fast; subsequent focused runs passed. No assertion was weakened.
- Docker's default network pool was exhausted on this host. The task used an explicit
  unused subnet in its disposable Compose override. Other projects were untouched.

## Review and remaining boundary

Integration review identified a save-confirmation error message that survived a
successful refresh, plus lease-expiry recovery and access-expiry publication races.
These require focused regression checks before PR readiness. CI and automated
review evidence will be recorded on the PR at its final head.

Native worker execution is verified. Container packaging is supplied but is not a
claim of production-container smoke validation or deployment. The first installed
backend skin is Light Fighter; no other canonical ship assets or AI generation are
included. A process crash during blob publication can leave unreferenced bytes;
only completed authorized artifact records can serve images.

## Artifacts and cleanup

Local evidence is under `test-results/ship-customization`: live verification receipt,
API/renderer logs, final desktop/mobile images, the initial interrupted component
trace, renderer output variants, and tooling/build logs. Images are displayed in the
originating chat, not uploaded to the PR.

Each live run closes its browser, Vite, API and renderer and removes its disposable
database and temporary asset directory. Database suites use the standard per-binary
cleanup. The integration owner owns final removal of the task-only Compose project.

# Empire customization verification — 2026-10-30

The initial record below predates publication. Rebased PR validation is recorded at the end.

## Tested source

- Base commit: `c98fedfd4296be237735bab2c04c13741f5ac8d6` plus the current uncommitted customization changes.
- Source manifest SHA-256: `28b6247c1f5da1f288cbab529eeb29f79f2e87fc311dbb7216c9c7a7ff937cb9`.
- Manifest: `test-results/insignia-source-manifest.json`, containing hashes of 1533 source, contract, artwork, test, dependency, and build/configuration files. Documentation and generated test outputs are excluded. The manifest was rechecked after final validation.
- No commit, push, PR, production deployment, or AWS mutation was performed.

## Results

| Validation | Result | Measured execution |
| --- | --- | --- |
| `make check` tooling | 110 passed, 1 explicit-only Docker check skipped | 5.79 s |
| `make check` client | 1,116 passed across 120 files | See retained command log |
| `make check` server | 549 passed | 27.665 s |
| Bridge configuration suite | 42 passed | 0.480 s |
| PostgreSQL adapter unit suite | 7 passed | 0.016 s |
| Clippy, Rust/TS formatting, ESLint, contracts, architecture boundaries, production web build | Passed | Final web build: 3.45 s |
| Focused insignia application/HTTP tests | 4 passed | 0.014 s |
| Filesystem and signed S3-compatible adapter tests | 3 passed | 0.030 s |
| Focused insignia browser tests | 3 passed | 9.1 s |
| Existing Galaxy/profile browser regression tests | 58 passed | 45.5 s |
| PostgreSQL insignia HTTP integration | Passed | Final expanded case: 3.355 s |
| Existing PostgreSQL public-profile integration | Passed | 2.486 s |
| PostgreSQL migration regression | 16 passed | 11.132 s |
| Explicit `make test-insignias-live` | Passed | 31.110 s excluding compile/web preparation |

The last PostgreSQL insignia case covers owner isolation, CSRF, stale epochs,
optimistic revision conflicts, cross-universe collection reuse, separate
per-universe equipment, collection limits, another player's authorized view,
legacy profile response shape, immutable media from another release, corrupted
blob rejection, real Accounts-client calls to a deterministic local fixture,
known non-supporter versus unavailable evidence, permanent grants through an
outage, deletion fallback, and unchanged simulation state.

The S3-compatible fixture verifies signed path-style GET/PUT requests and shared
objects across clients. It does not prove an AWS bucket or IAM configuration is
deployed. Publication also has a regression for stores that deny inspection of
missing keys: originals are written first, then read back, avoiding a need for
S3 bucket-list permission.

## Real browser/server run

The explicit run used the native Rust binary, the normal playground loader, a
disposable PostgreSQL database, and a temporary filesystem asset store. It saved
and equipped a recolored design through the browser, checked the actual database
row, verified Galaxy identity and artwork delivery, and restarted the API before
checking that the collection, selected appearance, and asset remained available.
No browser exceptions or horizontal overflow were observed.

Measured phases:

- Database/world/server preparation: 24.383 s.
- Browser editing, reload, Galaxy, and screenshots: 5.315 s.
- API restart and persistence checks: 1.270 s.
- Browser/server/database/asset cleanup: 0.141 s.

## Visual review

Inspected Settings and Galaxy at **1440 × 1000** and **390 × 1000** viewports.
Some desktop captures crop the editor within that viewport. The collection's
empty, editing, supporter, verification-unavailable, and permanent-grant states
were captured from the running UI with controlled HTTP fixtures. Saved Settings
and Galaxy were also captured against the real server/database. Mobile controls
were separately inspected after scrolling, with the existing fixed command HUD
present. The preview is compact on mobile, symbol choices fit without horizontal
overflow, and the permanent-unlock label does not split awkwardly.

Local captures are retained in `test-results/insignia-*.png` and
`test-results/insignia-live-*.png`. They are displayed in the originating chat,
not uploaded or embedded in a PR.

## Failures resolved

- The initial browser run had two test failures: an ambiguous global status
  locator and a detached Galaxy row during scrolling. Locators were scoped and
  the existing asynchronous row transition was awaited; assertions remain intact.
- ESLint rejected a control-character regex. Validation now checks character
  codes explicitly, retaining server-side validation.
- Adding the rolling-upgrade opt-in header required updating the existing exact
  request-header assertion. The final complete client suite passes.
- Visual review found an awkward mobile permanent-unlock label; it now reads
  “Unlocked” with the full accessible label and tooltip. A preserved but
  unavailable selected design explicitly states that the default is displayed.
- The S3 missing-key permission issue was found in review and fixed with a
  regression test. No validation timeout was accepted as a passing result.

## Cleanup and remaining operational work

All live-run browsers and native server processes were stopped. Each database
runner dropped its own disposable database. The explicit live run removed its
asset directory. Compose project `orbit-insignia-validation`, its database
container, network, and volume were removed after checks. Unrelated Docker
projects and retained development data were left intact. Logs, screenshots, and
the source manifest remain under local test outputs for review.

Production deployment still needs its dedicated private S3 bucket/runtime IAM
configuration and the settings in the operator guide. No live AWS validation or
production rollout was requested or claimed. Player uploads, generation,
payment fulfillment, and historical report artwork remain outside this slice.

## PR rebase validation — 2026-10-30

Tested implementation commit `4f0138f35a4b02cbad9258303df23b412f42680c` rebased onto fetched main `7b9bbbe6f7d27824fcffb1129c79d31f0d962164`.
Preserved main's persistence targets, colony-abandonment contracts, and desktop
navigation tests. Regenerated TypeScript contracts from the combined OpenAPI
schema. Renumbered the unpublished insignia migration to `0026_insignias.sql`
to follow main's `0025_colony_abandonment.sql`. No released migration was edited.

- `make check`: passed; 1,155 client tests, 559 server tests (27.361 s),
  42 bridge tests (1.005 s), 7 storage unit tests (0.013 s), tooling, Clippy,
  formatting, lint, contract/boundary checks, and production build.
- Isolated PostgreSQL: insignias (2.803 s), public profiles (2.426 s), and
  all 16 migration checks (12.432 s) passed.
- Browser integration: insignia, public-profile, and desktop-navigation suites
  passed (13 tests, 21.6 s). Captures refreshed for main's sidebar.
- Real-server/browser restart acceptance passed: preparation 25.063 s,
  browser 4.590 s, restart 1.435 s,
  cleanup 0.122 s; total 31.210 s.
- Inspected refreshed Settings and Galaxy captures at 1440×1000 and 390×1000,
  including the controlled access states. No product/UI fix was needed.

This appended record is a documentation-only follow-up to the tested commit.
The live runner removed its database and asset directory and stopped its browser
and server. Disposable Compose project `orbit-insignia-pr` is cleaned up before
publication; unrelated development projects are retained.

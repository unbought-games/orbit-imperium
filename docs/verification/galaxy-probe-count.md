# Galaxy probe count — issue #110

Validated on 2026-11-10 against base `6b485ba076cfb7541df0f8adece72252ef313e79`
plus the uncommitted changes in this implementation. No PR, CI run, or merge was
requested. Local runner allocation and merge-queue time are not applicable.

## Behavior and boundaries

- A positive decimal integer is stored on the universe membership, defaulting to
  `1`. The setting is independent of inventory, planets, moons, and JavaScript
  number precision. Each player/universe has one saved value.
- The authenticated endpoint checks origin, CSRF, account/player, universe, and
  epoch. Both reads and writes return `no-store` responses with request identity.
  PostgreSQL tests prove persistence and isolation; browser fixtures do not.
- The session-owned Zustand controller publishes confirmed values, serializes
  saves/loads, preserves the last confirmed value on failure, and ignores old
  responses after disposal. Edits live in the form. Failed saves require a reload
  before resubmission because the server may have received an interrupted write.
- The saved count is configured in Settings; Galaxy adds no text block. Inventory
  after pending departures determines availability. Spy quotes and launches exactly
  that count; it never silently reduces it.

## Validation

- `npm ci`: 26 seconds to prepare the initially empty frontend checkout.
  Installed environment: Node 24.14.0/npm 11.9.0 (package engine warning for the
  repository's 24.18.0/11.16.0 pins). Rust checks used the installed pinned 1.99.0
  toolchain through `$HOME/.cargo/bin`.
- `npm test -- src/client-model/player-preferences.test.ts src/client-model/game-projection.test.ts`:
  59 passed; final execution 138 ms. Covers positive counts, exact quote/launch
  quantities, insufficient inventory, request serialization, save failure, and
  disposal fencing.
- `cargo nextest run -p orbit-application --lib -E 'test(player_preferences)'`:
  1 passed; cold preparation 28.09 seconds, execution 13 ms.
- `make test-db DB_SUITES=player_preferences DB_JOBS=1`: 1 real HTTP/PostgreSQL
  test passed. Preparation 39.30 seconds; cached runner preparation 240 ms;
  execution 3.314 seconds. Covers defaults, large counts, persistence through a
  new connection, a second universe for the same account, another player, bad
  counts, stale epochs, wrong universe, missing authentication, origin, and CSRF.
- Fixture browser checks: saved count/reload/exact Spy submission and failed-save
  recovery at 390×844 and 1280×844 passed. Final bundle preparation 3.202 seconds,
  Playwright run 7.9 seconds. The existing no-probes and independent-target Spy
  checks also passed in the preceding run (3.479-second preparation, 8.6-second
  execution for four cases).
- ESLint, source formatting, application and component/fixture TypeScript,
  OpenAPI drift/classification checks, workspace/browser boundaries,
  `cargo fmt --all --check`, and `git diff --check` passed.
- `cargo clippy -p orbit-application -p orbit-transport-http -p orbit-storage-postgres --lib --features orbit-storage-postgres/test-support -- -D warnings`:
  passed in 18.76 seconds.
- Full `make check`, production build, and explicit full-system acceptance were
  not run. Application fixtures exercised the real frontend with HTTP fixtures;
  the database test exercised the real endpoint and storage separately.

## Findings and repairs

- Initial browser setup could not import Vite because dependencies were absent;
  resolved with `npm ci`. Docker was initially stopped; started it and used a
  disposable Compose project rather than a development database.
- A temporary baseline screenshot probe had an ambiguous Settings heading
  locator. Its failure screenshot supplied the baseline; the temporary probe
  was removed. It was diagnostic code, not retained regression coverage.
- The first new browser journey was interrupted after 48.9 seconds while waiting
  for a preferences response. Its screenshot showed an unavailable destination:
  the new Settings link used a display universe name instead of its route slug.
  Fixed the product link with `universeSlug`; subsequent runs passed. No timeout
  increases, weakened assertions, or test repair attempts were used.
- Contract validation caught missing bot-accounting metadata on the new route.
  Added the appropriate `recovery-or-metadata` classification; the check passed.
- Visual inspection caught the Settings section heading hidden under the fixed
  header after hash navigation. Added the existing shell-aware scroll margin,
  switched the Galaxy link to the shared Link component, and refreshed captures.

## Visual evidence and cleanup

Captured and inspected the running frontend at 390×844 and 1280×844 for:
Settings loading, invalid input, saved confirmation, failed save/reload; Galaxy
ready, insufficient inventory, and pending departure. Current captures are
`test-results/probe-{settings,galaxy}-<state>-<width>x844.png` and are displayed
in the implementation chat. Images were not uploaded or added to a PR.

The browser runner removed its temporary bundles and stopped its owned servers.
The database runner dropped its test database. Compose project
`orbit-probes-50ae`, its container, network, and volume were removed successfully.
No existing tests were deleted or removed from CI selection.

## Owner follow-up and PR preparation

The owner requested removal of the Galaxy count summary and all accompanying
text, then explicitly invoked the PR workflow. Removed the entire summary,
settings link, status/error text and reload control from Galaxy without adding
replacement text. The Settings form and existing Spy button tooltips remain.
Updated the browser journeys to enter Settings directly and assert that Galaxy
contains no count summary or settings link. All four focused browser cases
passed (3.516-second bundle preparation, 9.4-second Playwright execution), and
Galaxy captures were refreshed at both sizes.

Main advanced to `fba82df` during implementation. Its alliance migration occupies
0042, so this change uses 0043 for player preferences before rebasing.

Rebased implementation `4d2278f` on `fba82df` passed the same 59 client tests
(155 ms), all four focused browser cases (3.220-second preparation, 9.2-second
execution), and the real HTTP/PostgreSQL test with migration 0043 (21.00-second
preparation, 230-ms runner preparation, 3.211-second execution). Source lint,
formatting, both TypeScript checks, contracts, boundaries and Rust formatting
passed again. Current screenshots were inspected and shown before PR creation.

## PR CI repair

PR #393 run `42957288650`, attempt 1, head `2cfa706e50d1e481bdb10a86c941098d7b26eeba`:
the journey job `130315339375` failed during `news:build`, before browser
assertions, because the new change note lacked required YAML frontmatter.
This was a product build defect, not a test defect or infrastructure failure.
Added the existing id/title/date metadata format and ran `npm run build`
successfully (Vite client build 2.83 seconds, prerender bundle 207 ms; whole-command
timing not recorded). No test was removed or relaxed. Other unfinished checks on
the superseded head may be cancelled by the workflow's normal concurrency policy.

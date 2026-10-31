# Bulk progression requests — 2026-10-31

## UI request audit

| UI collection | Read path | Outcome |
| --- | --- | --- |
| Resource buildings and facilities | `ProgressionTile` cost inspection plus `BuildingQuickBuild` eligibility inspection | Coalesce and deduplicate through the shared HTTP adapter. One request for the visible catalog, including completion refreshes. |
| Research, shipyard, defenses, and missiles | `ProgressionTile` cost inspection | The same bulk loader covers every progression catalog and its sections. |
| Empire, body selectors, resource settings, work summaries, fleet inventory | Shared overview/settings snapshots and pure selectors | Already collection reads. No per-body, per-resource, or per-unit HTTP lookup. |
| Galaxy and mission fleets | World queries returning a system or fleet collection | Already collection reads. Player display data uses a source-wide profiles query. |
| Reports | Paginated report headers with previews; one selected report detail | Already collection reads. Rows use previews, rather than fetching each detail. |
| Rankings | Rankings snapshot and profiles query for the displayed player collection | Already collection reads. |
| Social and alliances | Paginated conversations, circulars, members, applications, and search results | Already collection reads. Profile lookups take arrays (bounded to 50 by the existing API). |
| Player names, badges, and insignias | Shared `PlayerProfilesController` and insignia collection | Display components select existing observations. They do not make per-row requests. |

Pagination, command receipts, a selected item's detail/action validation, and
sequential destination resolution followed by a fleet quote have different
purposes from repeated per-item catalog inspection. Their existing boundaries
are retained. The mailbox reads conversations and circulars as separate paginated
collections; it does not retrieve one request per message.

## API and client behavior

`POST /api/v3/universes/{universe}/progression-options/bulk` and its v4 equivalent
accept `{ context, requests }`, with 1–128 upgrade, demolition, research, or
manufacturing requests. The service loads one complete player progression
snapshot and returns ordered `options` with the same revision and observation
time. Every subject is checked for ownership. An invalid subject fails the whole
batch; normal build blockers remain per-item inspection results. Session, CSRF,
protocol, universe binding, and bot observation gates match the single endpoint.

The HTTP adapter groups calls in a render's effect pass and deduplicates identical
requests, including the separate cost and quick-build consumers. It validates the
whole response before resolving any consumer. It retains no response cache and
therefore cannot serve stale eligibility after completion, cancellation, or a
structural change. The coordinator's existing binding/generation fencing remains
in force. A single unique inspection uses the existing single-item endpoint.
Every current catalog fits in one batch; unusually large callers split at the
server's 128-item bound.

## Validation

Tested base: `48f7a4ed5739d1e5787a2c310bde8cd638730c6f` plus the working-tree
changes in this implementation. The final source manifest covers 1,205 code,
contract, test, dependency, and configuration files (documentation and generated
outputs excluded): `test-results/bulk-progression-source-manifest.json`, SHA-256
`a01e7d8189f2e19216f0ee7f502d645861d7acc0193eb52e6ec7df8da76cab11`.

| Validation | Result | Measured execution |
| --- | --- | --- |
| `make test-tooling` | 113 passed; 1 explicit-only Docker check skipped | 22.524 s |
| `npm test` | 1,211 passed across 125 files | 11.23 s |
| Focused transport/coordinator tests | 66 passed | 0.461 s |
| `make test-server` core | 574 passed | 41.069 s |
| Server bridge configuration | 42 passed | 0.982 s |
| PostgreSQL adapter unit tests | 7 passed | 0.014 s |
| `make test-db DB_SUITES='progression world'` | 5 passed, including bulk checks in both protocol journeys | 20.724 s progression; 36.276 s world |
| Browser catalog request-count and visual capture checks | 10 passed at desktop and mobile sizes | 12.1 s |
| Final browser regression (18 affected spec files) | 352 passed, no skips or retries | 262.008 s |
| TypeScript, ESLint, Prettier, Rust formatting, Clippy | Passed | Final Clippy: 6.49 s |
| Contract schemas/generated types and architecture boundaries | Passed | — |
| Production web build | Passed | 9.08 s client bundling; 0.417 s SSR |

Cold Rust preparation took 84 s for core server tests, 68 s for bridge tests,
and 28.77 s for storage unit tests. The final database preparation compiled in
5.55 s, then waited about 82 s for the shared Cargo build lock before execution.
These are observed setup times, not execution deadlines.

The focused checks assert one HTTP request per catalog, one new bulk request
after building completion, deduplication of cost/action lookups, no refetch for
balance-only updates, and fail-closed handling of missing, reordered, incorrectly
bound, or inconsistent response entries. PostgreSQL checks compare mixed bulk
inspections with the existing single-item results, retain normal per-item
blockers, and reject empty, oversized, inaccessible-subject, and wrong-player
requests.

## Visual review and cleanup

Inspected resources, facilities, research, shipyard, and defense at **1440 × 900**
and **390 × 900**, including resource construction active/completed states,
affordability hatching, locked items, and unavailable items. Captures are retained
under `test-results/bulk-resources-*.png` and `test-results/affordability-*.png` and
displayed in the originating chat. No visual defects or horizontal overflow were
observed.

Database validation used the disposable Compose project `orbit-bulk-be68` on an
automatically allocated local port. Each database binary's database was dropped
by `scripts/test-db.sh`; the project container, network, and volume were removed
with scoped `docker compose down -v`. Browser runners own and close their Vite
servers and browser processes. No production service or persistent database was used.

## Failures resolved

- Initial browser setup lacked installed dependencies; `npm ci` completed before
  validation.
- A new transport test used a bootstrap fixture without a body. Its request now
  uses a deterministic body ID.
- The new request counter initially matched a Vite source-module URL; it now
  counts only HTTP POST requests to progression endpoints.
- Database tests caught an inaccessible later bulk subject reaching an engine
  coverage invariant. Every bulk subject now receives an explicit ownership
  check and the same NotFound result as a single request. Both suites passed on
  rerun.
- Clippy required the extracted helpers to precede the test module; they were
  moved and Clippy passed.
- The first broad browser run passed 351/352 tests. The resource-row fixture
  sampled wall time separately per item, occasionally creating mixed timestamps
  rejected by the new strict loader. The bulk fixture assembler now publishes a
  single observation time, matching the real endpoint. One preparatory rerun was
  interrupted before this fixture correction and is not counted as validation.
  The full affected browser coverage passed on the final rerun (352/352).

The browser tests use controlled HTTP fixtures; PostgreSQL tests exercise the
real service/store. Full-system acceptance and production-container validation
were not run.

Final browser results: `test-results/bulk-progression-browser-results.json`. The
source manifest was rechecked after validation with no source-file changes.

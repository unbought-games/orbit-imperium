# Alliance validation — 2026-10-25

Implementation revision: `f699a8a124b734ff19ad6650b5f684ea667adcc0` (`feat: add alliances and delegated roles`), based on main `308785d86af4d5fb361c24f0e7f9fbeaea0c98e2`. The final documentation-only commit records these results without changing implementation. Work was split across backend, frontend and rankings threads with fixed OpenAPI/table interfaces; the originating thread integrated identity/report history and performed final verification.

## Local checks

| Check | Result | Measured elapsed time |
| --- | --- | --- |
| Final `npm test` | 873 tests across 90 files passed | 6.13 s overall; 5.30 s runner |
| `make test-server` | 372 workspace + 32 bridge + 7 storage unit tests passed | 154.04 s including native preparation; test phases 16.480 s, 0.594 s, 0.017 s |
| Final transport static-assets filter | All 9 tests passed, including public alliance HTML bypassing authenticated bootstrap | 27.88 s including preparation; 0.033 s tests |
| `make test-tooling` | 93 passed; one explicitly enabled Docker infrastructure test skipped | 5.94 s overall; 5.859 s runner |
| Final `make _static` | Rust formatting, ESLint, Prettier, generated contract drift, schema and architectural boundaries passed | 14.21 s |
| Final `npm run build` | TypeScript and production Vite build passed | 12.51 s overall; 4.32 s Vite |
| Final workspace/all-target Clippy with test-support and `-D warnings` | Passed | 3.46 s |
| Frozen full fixture-browser suite | All 533 tests passed without interruption on the committed source | 423.87 s overall; 7.0 minutes reported by runner |
| Final affected browser suites (alliances, identity, player profiles, High Scores) | All 22 cases passed on the committed implementation | 32.81 s overall; 31.2 s runner |

The complete server run includes the final no-op Update authorization regression. The subsequent server change was the public document bootstrap exclusion; all static-assets tests were rerun afterward. Final client/unit/build/static checks cover the immediate identity refresh and response fencing changes. No assertions were weakened and no restrictive routine execution deadlines were introduced.

## PostgreSQL and HTTP

All 31 selected PostgreSQL integration tests passed across eight native suites:

| Native suite | Passed | Measured phase time |
| --- | --- | --- |
| `_db-alliances` | 6 | 6.95 s preparation; 20.519 s execution on second run |
| `_db-rankings` | 2 | 8.66 s preparation; 4.333 s execution |
| `_db-alliance_identity` | 1 | 10.12 s total; 5.84 s preparation; 3.247 s execution |
| `_db-player_profiles` | 1 | 2.457 s execution |
| `_db-report_sharing` | 1 | 3.699 s execution |
| `_db-world` | 3 | 13.609 s execution |
| `_db-migrations` | 16 | 15.347 s execution |
| `_db-foundation` | 1 | 3.115 s execution |

The profile/sharing/world group took 65.77 s including preparation and shared Cargo lock waits. Migration/foundation took 26.77 s. Make limited database-suite concurrency to two; each binary ran serially in a distinct disposable database.

Coverage includes competing joins/accepts, one membership and five pending applications, global pending withdrawal, name/tag uniqueness, unchanged-intent retries after disband, changed-intent rejection, revision conflicts, delegated permission grants/revocation and superiority checks, private roster/activity/application/audit omission, board pin/cap/cursor invariants, public summary scores, and historical ranking membership. The delayed espionage scenario changes alliance identity after arrival but before event processing, then disbands: the report and permitted shared copy retain the event-time tag; redacted and legacy reports never acquire current affiliation.

## Findings and repairs

- Concurrent development initially left the engine module unavailable to compilation. A worker's workspace restriction was resolved by staging its prepared source and applying it through the authorized worktree. Compilation then succeeded.
- A report-sharing integration edit inserted an extra argument into the existing status projection; removed it. A transport test fixture also needed its new empty affiliation map.
- The delayed-espionage fixture initially violated beginner protection because only the observer had a valued probe. Added an equivalent defender probe and its matching source asset value; did not change protection rules. The complete scenario then passed.
- Browser verification found the report reducer omitted the new historical affiliation map. Preserved that source field and reran the report-state and historical-tag checks successfully.
- Independent permission review reproduced an unauthorized no-op Update that advanced revision/audit. Added an explicit management-permission guard and mutation-free denial coverage. Separate delegation tests verify a manager can revoke a permission they may grant even when they cannot personally perform that action. No actionable review findings remain.
- Updated the intended navigation expectations for the new Alliance destination. Resolved an ambiguous role-editor test locator using visible fields and explicit accessible labels.
- Visual review at 390/768/1440 pixels found and corrected public-page CTA contrast. Board, recruitment page and ranking layouts fit their tested widths; existing High Scores tests also cover 320 pixels.
- Production static routing originally initialized a personalized bootstrap for the new public URL. It now uses an anonymous document without calling the game bootstrap, tested even with a session cookie present.

## Full-browser interruption and frozen rerun

The first broad fixture run was intentionally interrupted after 508.27 s: 532 tests passed and one existing desktop technical-data test was stuck waiting to click a modal summary after that element detached. This run overlapped live source writes at 15:15:13 and 15:15:59; the detachment is consistent with Vite hot reload, rather than evidence of an alliance behavior defect. That test passed unchanged in isolation (6.44 s total, 3.9 s runner). The interrupted run was not counted as a suite pass.

All implementation threads then stopped editing. The full 533-test suite was rerun on clean commit `f699a8a124b734ff19ad6650b5f684ea667adcc0`, with no source writes during execution, and passed in 423.87 s. There were no test deadline expirations, assertion weakening, or skipped browser cases. The browser runner exited successfully and stopped its temporary Vite/Chromium processes.

## Cleanup and scope

PostgreSQL used only Compose project `orbit-alliances-1025`, dynamically allocated host port `55025`. Each native test script dropped its own database. A final query found no `orbit_test_%` databases, and `docker compose down --volumes` removed the project container/network/volume in 0.45 s. A subsequent project listing was empty. Browser runners clean their own Vite/Chromium processes.

Validation used routine native server/client/tooling, PostgreSQL, migration, and fixture-browser layers. No full-system acceptance, production-container test, deployment, push, or pull request was performed. The feature and validation record are local commits on `feat/alliances`.

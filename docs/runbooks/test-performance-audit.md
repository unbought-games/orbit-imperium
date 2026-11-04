# PR and main test performance audit

## November 2, 2026: creation-only moon expectations

PR #321 CI run 41573755527 exposed two obsolete browser expectations after moon
creation was enabled. The simulator journey expected an operational moon-bound
fleet estimate after entering Dispatch; the creation-only boundary correctly
returned “Moon fleet operations are not available yet.” The empire viewport
case looked for “Planet resources” on all four bodies, including its moon.

Inspected both scenarios and their history before this single repair. The
simulator journey now uses a planet while preserving its hypothetical estimates,
response ordering, draft transfer and authoritative launch rejection assertions.
The existing pure draft test retains observed-moon identity coverage. The moon
browser journey additionally checks that a planet cannot dispatch to its moon;
engine coverage checks both moon quotes and estimates. The empire case uses each
fixture body's exact kind for its resource label and retains all viewport and
content assertions.

The caller audit also found two existing `dispatch-validation.spec.ts` moon
scenarios awaiting `ResolveDestination` or clicking a now-disabled Review
control. Shard 4 remained running because those requests cannot occur in this
release. Cancelled that obsolete run and replaced both waits with explicit moon
identity, blocked-state, no-quote/no-launch assertions. The coordinate-edit case
still switches back to a real colony. No timeout or retry was added. This PR
owns this one repair attempt and focused verification for all four scenarios;
no separate follow-up is left unassigned.

## November 2, 2026: startup lock-isolation checks

PR #319 merge-group run 41563892537 failed
`restart_checks_metadata_without_gameplay_locks_or_reads` at
`bootstrap.rs:235` with `startup waited for gameplay data/locks: Elapsed(())`.
The test wrapped three successful-path startup operations in one 500 ms budget
while four database binaries ran concurrently. Its prior PR-head run passed.
History shows no earlier repair (introduced in `88a55aa`; the later `7e578e6`
change only added enrollment assertions elsewhere in the file).

This is the test's one repair attempt: retain the exclusive gameplay table locks,
universe row lock and successful startup assertions, but remove the aggregate
wall-clock cutoff. Each production operation already bounds lock acquisition,
so forbidden reads or provisioning gates still reject while the locks are held.
No functional lock/statement/network timeout was increased or removed.

Audited neighboring startup checks for the same pattern. Removed redundant
outer deadlines from the explicit-audit gate check in `bootstrap.rs` and the
current-schema migration/readiness check in `migrations.rs`; both retain held
locks and their existing production bounds. Intentional migration cancellation,
coordination, timeout and corruption tests remain unchanged. This PR owns the
repair and focused bootstrap/migrations validation; no independent follow-up is
left unassigned. If the repaired test fails again, remove it under AGENTS.md and
retain the useful deterministic protection at a cheaper layer.

## November 2, 2026: simulator flight fixture authoring

Removed the newly authored `estimates manual hypothetical flights at 1440px`
case after its single repair attempt. The first attempt navigated to a nonexistent
body-scoped simulator route and was interrupted while waiting for a ship input.
After correcting the route to the universe-scoped simulator, its duration
assertion expected `2m 0s`; the actual shared formatter displays `2m`.
No execution timeout or retry was added. The mobile case encountered only the
format assertion failure and passed after that correction.

Retained coverage: the mobile browser case exercises manual planet/moon
coordinates, absent ships, invalid input and unavailable destinations; deterministic
simulation-flight-model tests cover origin/speed changes, coordinate bounds and
stationed-inventory gating; the existing report case covers late responses,
research isolation, report destinations and Dispatch validation. Engine mission
tests prove a hypothetical estimate cannot bypass inventory or fuel at launch.
Desktop appearance is captured during optional visual review without duplicating
the mobile behavior scenario. All new screenshot-only viewport preparation is
inactive when captures are disabled.

## October 31, 2026: independent database groups and eight browser shards

Baseline checkout: `906e18a8d78b49f68f5cd50970407d23f5645551`.
Sampled completed main runs and the current reports PRs (different revisions,
not a controlled benchmark):

| Run | Total workflow | Native job | Slowest browser job |
| --- | ---: | ---: | ---: |
| [main, 41167688116](https://github.com/unbought-games/orbit-imperium/actions/runs/41167688116) | 17m 07s | 16m 46s, including PostgreSQL | 14m 29s |
| [main, 41159434654](https://github.com/unbought-games/orbit-imperium/actions/runs/41159434654) | 19m 26s | 5m 28s, PostgreSQL unselected | 19m 04s |
| [PR #257, 41208029996](https://github.com/unbought-games/orbit-imperium/actions/runs/41208029996) | 19m 38s | 4m 10s, PostgreSQL unselected | 18m 47s |
| [PR #258, 41207718052](https://github.com/unbought-games/orbit-imperium/actions/runs/41207718052) | 16m 47s | 5m 31s, PostgreSQL unselected | 16m 25s |

The latest main run spent 243s in `make check`, then 661s in PostgreSQL
preparation/execution. Database compilation took 153s; the `rules_updates`
binary took 375s and `world_edit` took 249s, both starting late in the
alphabetical Make queue. The slowest cases were the world-edit round trip
(95.6s) and battlecruiser activation/restart (78.2s). These exercise persistence,
real prerequisite chains, replay/audit and both runtime modes; keep that coverage.

Browser tests took 465s, 650s and 787s across three shards on that main run;
PR #257's third shard reached 1,046s. There is no single dominant browser test:
main's report-glance case took 50.6s, missile warfare 35.9–37.0s and selection
audits 26.4–28.4s. Repeated route/bootstrap work across 928 tests dominates.
Native build/lint/unit checks alone were already below six minutes.

Implemented changes:

- Eight native Playwright shards retain all cases, viewports, assertions and
  the three-worker-per-host ceiling. This adds five VM setups to shorten the
  critical path; it trades runner overhead for latency.
- Three database groups run beside native checks. `rules_updates` and
  `world_edit` each start independently; the remaining group automatically
  includes every other binary. Compile only each group's selected binaries.
- Keep Make's bounded execution, serial tests within each database binary,
  per-binary disposable databases and group-specific Compose projects.
- Share the existing trusted-main native dependency cache across Rust jobs,
  retaining its namespace. Only the native main job writes it.
- Extend the aggregate gate and executable tooling regressions to check
  failures/cancellations/skips, exact-once inventory coverage, compilation
  selection, new database suites and isolated cleanup.

The scheduling changes introduced no execution deadlines, retries, test removal,
production behavior or explicit-only acceptance changes. Build, lint, client and
server tests, default/bridge configurations, production homepage checks and
all relevant PostgreSQL/browser tests remain required.

Hosted validation: [run 41209899129](https://github.com/unbought-games/orbit-imperium/actions/runs/41209899129),
revision `39f73930597d7b9af0962cbdebddaf5d90f36010`, attempt 1, passed in
**8m 09s** from workflow creation to completion (14:23:20–14:31:29 UTC).
The following documentation-only commit records that measured implementation.

| Phase/job | Wall time including setup/cleanup | Execution details |
| --- | ---: | --- |
| Native checks | 5m 39s | `make check`: 243s |
| PostgreSQL rules | 5m 46s | compilation 16.7s; 37 tests 246.9s |
| PostgreSQL world | 4m 06s | compilation 16.5s; 10 tests 152.5s |
| PostgreSQL rest | 6m 52s | compilation 159s; 113 tests across bounded parallel binaries |
| Browser shards | 3m 56s–7m 47s | 116 cases each; fixture preparation/execution 167–381s |
| Production homepage (inside shard 1) | 27s | build plus 10 browser tests |

All 928 fixture-browser tests, 160 PostgreSQL tests, 623 native Rust tests,
1,173 client tests and the tooling suite passed. The only tooling skip is the
existing explicit-only Docker isolation test. All database cleanup steps passed,
removing their scoped containers, networks and volumes. Browser runners exited
and lockfiles remained unchanged. Visual validation is not applicable: no UI
implementation changed.

Local validation passed: full tooling (112 passed, one explicit-only skip,
9.21s before the cache-policy regression was added), then all 17 targeted
workflow/database/inventory/policy checks (7.98s) on the final implementation.
The first exploratory run `41209803481` was intentionally cancelled after
identifying the job-key cache miss; it is not successful validation evidence.

This is latency optimization with a compute tradeoff: summed job wall time
increased from 3,159s to 4,492s (about 53 to 75 runner-minutes) in these two
samples. Per-host variability remains visible; this is not a guarantee about
queue delays or cold-cache runs. Further reductions in total work should target
repeated browser bootstraps, with special care for the dev-served hook harness
and anonymous-landing entry tests. PR integration run `41210620800` then found a HUD pagination race against the
newly merged shared-reports engine: returning from detail showed 129 rows where
120 were expected. It is failed validation, despite all other jobs passing.
Integrated base `fc3f68f3f3b2c8ada60a3e90395fd5c067584ba6` locally to investigate.

A controlled browser regression delivered a queued intersection notification
after leaving the inbox and reproduced an unwanted page advance at both 390px
and 1440px. The repair ignores notifications from disconnected observers and
blocks pagination while the inbox is hidden. Both regressions failed before the
repair, then passed five repetitions per viewport (10 tests, 11.4s). They also
verify that later genuine scrolling still loads the next page. The original
pagination assertions remain unchanged.

The original case passed 30 normal-speed diagnostic repetitions (36.1s).
A separate sixfold CPU-throttling probe had eight passes and one initial badge
readiness failure; it was not counted as passing validation or used for timings.
Final normal-speed verification of the original case plus both regressions
passed (3 tests, 4.1s), with desktop/mobile screenshots captured and inspected
in the implementation chat. All 1,183 client tests, lint, formatting and the
production build passed locally after the repair. Browser runners stopped and
released their ports. The latest PR checks verify the pushed repair; their
results are the authoritative readiness evidence.

Run `41211753555` exposed a second delivery window during retry completion:
100 rows advanced to 130 instead of 120. The observer's latest-callback ref
could pick up a new render's limit before the old effect cleaned up. Bind the
observer to a memoized callback for its original page intent, retaining the
inactive-observer guard. The original case and both controlled regressions then
passed five repetitions each (15 tests, 16.3s), with current desktop/mobile
captures refreshed. No pagination assertions were weakened.

Review then identified the hide-before-passive-cleanup window. Observer setup
and retirement now run in a layout effect, using the already-mounted enclosing
dialog when its parent ref has not attached yet. The regression also delivers
notifications through a mutation observer at the DOM-hide boundary. An initial
local layout-effect attempt failed because the parent ref was not yet attached;
the ancestor fallback restored native scrolling. All 15 repeated pagination
cases passed afterward (15.7s), and desktop/mobile captures were refreshed and
inspected again.

### Merge-queue integration

The verified PR head `f9ae18524d3d66df8d9b36674019a4eb41af9920` passed
[full CI in 8m50s](https://github.com/unbought-games/orbit-imperium/actions/runs/41213275927),
including queueing/setup and all 923 fixture-browser cases. Automated review
passed and the actionable observer-cleanup thread was resolved.

Queue integration with PR #259 exposed overlapping repairs to the same HUD
pagination hook and tests. Integrating its queued revision
`7e41993e1ff7638a446179b842909db62bda9d8f` retains its explicitly captured next
limit and latest-render visibility check, together with this PR's disconnected
observer guard. This combination closes both delivery windows with the existing
passive effect; the earlier layout-effect implementation is no longer needed.
Both sets of regressions are retained. The original pagination case and all
three regressions passed five repetitions each (20 tests, 17.4s), with refreshed
and inspected desktop/mobile captures. The new pushed revision must pass PR and
merge-group checks before merging.

The owner then requested clearing the queue and landing CI optimization first.
Removed the queued dispatch/navigation feature changes from this PR's tree,
while retaining the combined HUD fix and all three regressions. PR #259 remains
open with its feature changes intact; it is not being merged through this PR.

## October 24 audit

Audited October 24, 2026, against checkout
`42e03e89afd4e2b813837e4c326f21c87c09d0fe`. Recommendations below preserve
the existing assertions, viewport cases, test selection and isolation.
The diagnostic screenshot change and the first browser optimization pass below
are implemented. CI now uses three browser shards as described in the
[runner runbook](ci-runners.md); the measurements below predate sharding.
Database timing changes and compilation-cache work remain follow-up experiments.

## Implemented diagnostic capture policy

All 113 explicit screenshot call sites in 27 browser-test files/helpers now use
`diagnosticScreenshot()`, which does nothing unless `ORBIT_TEST_SCREENSHOTS=1`.
The 36 spec files use a shared failure fixture. All layout, image-load,
accessibility, route, viewport and control assertions remain in place, including
the catalog helper's image decoding assertions. Named captures retain their
existing paths for visual inspection. The hosted visual smoke script remains
explicitly visual.

An initial experiment with Playwright's native `screenshot: 'only-on-failure'`
revealed an important performance trap in the pinned 1.56.1 implementation:
`SnapshotRecorder.captureTemporary()` in `node_modules/playwright/lib/index.js`
captures pages when contexts close even if the test passed; it then discards
those images. No PNGs in the final output directory does not prove that no
screenshots were taken. That experiment passed all tests but did not improve
local runtime.

The final implementation leaves native capture off. A shared automatic fixture
checks the actual result before capturing open pages, before context teardown.
The two tests that close contexts in `finally` also capture inside their error
handlers before rethrowing the original error. Screenshot errors are recorded
as annotations and cannot replace the original test failure. Failed CI browser
runs upload their output directory for seven days.

Use `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- catalog-pages.spec.ts` for named
visual evidence. Routine runs produce no named screenshots on success.

## Screenshot-only validation

Host: macOS arm64, Node 24.18.0, npm 11.16.0, pinned Playwright/Chromium,
three workers. `npm ci` completed successfully. These are sequential single-run
measurements on a shared development host with warm caches after the first run,
not a controlled CI benchmark.

| Browser mode                                     | Command wall time | Result     |             PNG files under `test-results` |
| ------------------------------------------------ | ----------------: | ---------- | -----------------------------------------: |
| Original checkout, unconditional named captures  |           203.24s | 353 passed |                     322 (81,534,411 bytes) |
| Discarded native `only-on-failure` experiment    |           211.04s | 353 passed | 0 retained, temporary captures still occur |
| Final shared failure fixture, named captures off |           200.49s | 353 passed |                                          0 |
| Final fixture, `ORBIT_TEST_SCREENSHOTS=1`        |           208.01s | 353 passed |           Same 322 named paths as baseline |

The final run's Playwright duration was 198.57s; the command time includes Vite
startup and shutdown. The 2.75s difference from the original run is too small to
claim a reliable speedup. The verified benefit is eliminating unconditional
capture calls and about 77.8 MiB of named image output in this suite. This also
shows why larger browser execution improvements matter more than assuming
screenshot gating alone will solve CI latency.

All four runs have the same 353 file/title entries, zero skipped tests and zero
unexpected failures. For the screenshot-only change, a parsed-token comparison against HEAD confirmed every
original assertion and test statement is preserved, apart from capture wrappers,
fixture imports and the two catch/rethrow handlers that retain failure evidence.

The two final modes differ by 7.52s in these individual samples. Treat that as
preliminary local evidence, not a promised CI reduction.

Additional validation on the final changes:

- `make test-tooling`: 85 passed, one existing explicit-only Docker isolation
  test skipped, no failures; 7.26s command time.
- `make test-client`: 521 passed in 60 files; 6.15s command time (4.29s Vitest).
- Strict TypeScript checking of `apps/web/tests/fixtures/test.ts` and its imported
  helper: passed, 1.59s.
- An isolated real-browser probe deliberately failed an assertion: the runner
  returned failure and attached an existing PNG file. Its passing companion had
  no screenshot attachment or named image. Final probe duration: 2.12s. An early
  probe exposed that a buffer attachment alone did not create a downloadable
  PNG, so the helper was changed to file attachments and the probe rerun.
- `git diff --check` and lockfile checks passed. No Rust, PostgreSQL, production
  container or full-system acceptance suite was rerun for this browser/tooling
  change; their audit timings above come from existing CI runs.

Tested base: `42e03e89afd4e2b813837e4c326f21c87c09d0fe` plus the uncommitted
implementation. SHA-256 of the 43 changed/new non-documentation files (sorted
relative path, NUL, file bytes, NUL):
`0c7ede632448900c6886b730d43c6cfbb6cea1b5242d68f26ae1f24fe4b6d880`.

Every browser runner exited and stopped its Vite/browser processes. No Docker
project, database, or server instance was started. Audit logs, JSON reports,
generated visual evidence and the intentionally failing probe artifacts are
retained outside the checkout in `/tmp/orbit-test-audit/`; the probe was not
added to the suite. Lockfiles remain unchanged.

## CI evidence

Sample: the latest 12 successful CI runs available when the audit began,
October 23–24 (five PR runs, seven main pushes). Durations come from GitHub's
job/step timestamps, rounded to seconds. These runs contain different changes;
they are operational measurements, not controlled before/after comparisons.

| Phase                                                | PR median (range), seconds | Main median (range), seconds |
| ---------------------------------------------------- | -------------------------- | ---------------------------- |
| Workflow elapsed, including scheduling               | 600 (495–1681)             | 701 (485–753)                |
| Browser job                                          | 579 (477–810)              | 678 (466–731)                |
| Browser test step                                    | 531 (431–759)              | 630 (425–679)                |
| Native job                                           | 413 (150–430)              | 287 (125–428)                |
| `make check`                                         | 126 (99–142)               | 108 (79–134)                 |
| PostgreSQL compile + integration step, when selected | 225.5 (182–227), n=4       | 167.5 (135–227), n=4         |
| Chromium + Linux dependencies                        | 28 (27–30)                 | 26 (23–34)                   |

Browser execution is the critical path in all 12 sampled runs. The browser job
already runs independently of native compilation. PR and main use the same test
commands and changed-path integration selection; main alone saves the Rust cache.

The 28-minute [latest successful PR run](https://github.com/unbought-games/orbit-imperium/actions/runs/40058054380)
includes a scheduling gap: scope finished at 03:22:54 UTC but the browser job did
not start until 03:37:07 (14m13s). Its browser job then took 13m30s. This is not
28 minutes of tests, and test optimization will not remove that scheduling gap.
The timestamps establish the gap, not its provider-side cause.

A separate [failed PR run](https://github.com/unbought-games/orbit-imperium/actions/runs/40057277147)
reported a real layout assertion mismatch in the 320px dispatch destination:
the Add all button's vertical position was 913.59375 versus 807.59375 for the
cargo boxes. This is not evidence of a timeout or of flakiness; the succeeding
run tested a different revision. Keep the assertion and use failure artifacts
to diagnose such cases rather than hiding them with retries or weaker checks.

Sample run IDs: `40058054380`, `40057634386`, `40056370506`, `40050933592`,
`40049613673`, `40048152055`, `40048027386`, `40047135032`, `40044663798`,
`40044394627`, `40044310849`, `40040046318`.

## Where the time goes

The [main run at the audited checkout](https://github.com/unbought-games/orbit-imperium/actions/runs/40050933592)
passed 353 browser tests in 499 seconds. Summing the per-test durations gives
1462 worker-seconds (three workers overlap, so these are not wall-clock seconds):

| Browser file                | Tests | Summed test seconds |
| --------------------------- | ----: | ------------------: |
| `shell.spec.ts`             |    70 |               291.5 |
| `catalog-pages.spec.ts`     |    65 |               283.0 |
| `resources.spec.ts`         |    41 |               179.8 |
| `bootstrap-ui.spec.ts`      |    34 |               108.2 |
| `detail-playground.spec.ts` |    34 |                61.8 |

The first three files account for 51.6% of worker time. The slowest individual
case is shell route/context/history coverage (16.3s), followed by responsive
catalog coverage (14.1s) and catalog refresh/history cases (13.9s and 13.5s).
In the newer 375-test PR run, the same first three files account for 47.6% of
2229.9 worker-seconds. There is no single giant test causing the entire tail.

On the audited main run, the native job took 362 seconds:

- `make check`: 108s. Tooling plus client testing took about 12s (client Vitest
  itself: 6.33s, 521 tests); Rust test preparation about 54s; Rust test execution
  about 11.5s; Clippy about 10.4s; static checks about 8.7s; web build about 11.5s.
- PostgreSQL startup: 12s.
- PostgreSQL step: 196s, comprising 73.3s compilation and 123.4s execution/setup/
  cleanup across 28 database binaries with `make -j2`.
- Rust dependency-cache restoration: 17s, approximately 721 MiB compressed.
  The log confirms `cache-workspace-crates: false` despite a full cache-key hit.

Largest summed database test durations were rules updates (23.6s), signup
(16.7s), colonization (16.0s), bootstrap (15.9s), world (15.4s) and migrations
(14.0s). Individual database tests still run serially within each isolated
database binary. These totals do not isolate migration, seed, query, or password
hashing costs; profiling is needed before changing their setup.

## Prioritized follow-up experiments

1. **Use two native Playwright shards on separate disposable runners.** Keep
   three CPU-bounded workers per runner, `fullyParallel`, the full test list,
   and the required aggregate gate. Pass `--shard=1/2` and `--shard=2/2` through
   `npm run test:ui -- ...`; no custom scheduler is needed. Require both shards,
   preserve failures, and compare the union of test IDs against the unsharded
   list. For the 499s reference run, ideal balanced test execution is about
   250s per shard plus roughly 60s job setup. The 362s native job would then
   become the floor: an optimistic workflow improvement from 580s toward
   roughly 380s, not a guaranteed 2x speedup. Measure after screenshot removal.
   Tradeoff: duplicated setup/runner minutes and possibly additional queueing.

2. **Avoid extra application bootstraps in pure layout cases.**
   `shellFixture()` always navigates to overview; many tests immediately navigate
   again to their actual target. Allow an initial target path for cases that do
   not assert overview-to-target navigation, and reuse the mounted route across
   viewport changes. Existing catalog tests already do some of this. Preserve
   dedicated startup, routing, deep-link, reload, history and reconciliation
   tests exactly. Instrument setup/navigation versus assertions first; the
   51.6% concentration identifies where to investigate, not the removable share.

3. **Measure Vite serving overhead separately.** The browser runner uses the Vite
   development server and creates fresh contexts. Benchmark its transform/startup
   costs and repeated document loading before deciding between Vite warmup and
   serving a prebuilt fixture app. A production preview experiment must retain
   sandbox routes, fixture interception, routing fallbacks and all assertions;
   include build time in the comparison. Do not assume a production build is
   faster overall or move real-backend acceptance into routine CI.

4. **Improve native compilation reuse once browsers are faster.** Compilation
   dominates Rust execution on a warm dependency cache. Benchmark workspace
   artifact caching or a Rust compiler cache on trusted-main writes, measuring
   restore/save overhead, archive size, and frontend-only versus Rust-changing
   PRs. Simply setting `cache-workspace-crates: true` is not enough evidence:
   confirm the cache key permits fresh main artifacts to be saved and restored
   instead of permanently reusing an old immutable dependency-key entry.
   Keep both default and bridge feature builds; their configuration tests differ.

5. **Profile database preparation and binary scheduling.** Break out migration,
   fixture seeding and execution timings in the slow binaries. The alphabetical
   Make target list leaves `world` (15.4s) near the end; trying expensive binaries
   earlier can reduce the tail while preserving `-j2` and serial per-database
   execution. Compare repeated runs before changing the order. Do not share a
   mutable seeded database or skip migrations in tests that verify migration
   behavior. Increasing `-j2` without CPU/I/O measurements risks making it slower.

6. **Replace deliberate real-time waits only with equivalent clock coverage.**
   The routine bootstrap suite has 1000ms and 700ms waits to assert that recovery
   polling does not happen during/after an in-flight submit. Use controlled page
   clocks only if the same polling window and absence assertions are exercised.
   Do not delete these waits outright. They offer a small improvement compared
   with browser bootstraps and sharding. Explicit backend-retry waits remain
   outside the routine optimization target.

7. **Make the remaining diagnostic video opt-in.** The shell navigation identity
   test creates a context with unconditional `recordVideo` in
   `test-results/foundation-motion`. Its assertions check DOM identity and route
   history, not video frames. Gate the recording for visual inspection while
   keeping those assertions and the held-request cleanup. This is a small,
   separate follow-up; screenshot gating does not disable this video.

Lower priorities: Chromium installation costs only 23–34s and npm installs take
single-digit seconds in this sample. A browser cache or dependency-install
change cannot explain or recover the minutes spent inside tests. Splitting native
checks into more jobs adds setup/cache overhead and does not improve the current
browser-dominated critical path. The hosted smoke script intentionally remains a
visual capture tool. Main's release-image publication is separate from CI tests;
do not remove its exact-main-SHA CI gate or substitute PR evidence for main tests.

## Measurement and coverage contract

For each follow-up, compare at least three runs of the same revision with the
same test IDs, worker/shard count and cache conditions. Record queued time, job
setup, compilation, test execution, artifact handling and cleanup separately.
Retain `results.json` with test IDs and durations for analysis; verify both shards
and retries rather than comparing only successful subsets. Report median and
range, and distinguish total runner-minutes from developer wait time.

Keep all viewport, accessibility, image-load and layout assertions. Keep the
existing integration selection, default/bridge server coverage, PostgreSQL
isolation and the always-run required aggregate check. Leave routine runners
without execution deadlines and explicit system/container/signup suites manual.

## First browser optimization pass

This pass addresses repeated setup and timer work on the browser critical path.
It leaves the database timeout, password hashing, Rust compilation and native CI
job unchanged. In particular, it does not shorten the production OIDC timeout or
assume that database I/O can safely run under a paused clock.

| Change                                                                      | Coverage retained or added                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Separate HTTP fixture installation from opening Overview                    | Resource and Galaxy fixtures open their actual target directly after installing their endpoint handlers. Shell/navigation tests still use the original ready-overview wrapper.                                     |
| Install catalog layout fixtures before navigating to the target             | The responsive and blocked-decision matrices retain their categories, widths, dialogs and control assertions without an initial Overview load.                                                                     |
| Keep resource ledgers and active-facility details mounted across widths     | All prior viewport and image-loading checks remain. Resource cases return through the real Back link between list/detail checks instead of reloading the application.                                              |
| Advance countdowns with five seconds of normal callbacks, then fast-forward | The intermediate countdown-change assertion, refund icons, completed level and next-level heading checks remain. Hundreds of unasserted intermediate 250ms ticks are avoided.                                      |
| Advance the login-presence polling windows with the page clock              | Both original 1000ms/700ms windows and the no-receipt/no-discovery/no-view assertions remain, including cached-page restoration and eventual refresh.                                                              |
| Parameterize planet routing into four independent tests                     | Research, fleets, galaxy and dispatch each retain legacy redirect, planet switch, reload, unavailable destination and zero-purchase assertions. This is the only change to test identities: one case becomes four. |
| Check 200% text in every catalog category                                   | The old final-category overflow check now runs for all four categories, with additional dialog overflow, Back-link operation and focus-restoration checks.                                                         |
| Record the navigation video only during visual inspection                   | The DOM identity, route history, held-request and cleanup assertions remain. `ORBIT_TEST_SCREENSHOTS=1` also enables this diagnostic video.                                                                        |

An AST comparison of the seven changed source files found no removed original
`expect` call expressions. This is supplemented by the scenario mapping above:
counts alone would not prove preservation of viewport or routing coverage.
The browser suite grows from 353 to 356 cases solely because the four routing
scenarios now have independent identities. No case is skipped, filtered or
retried to produce these measurements, and worker count remains three.

### Repeated measurements

Six full runs alternated the saved screenshot-only baseline and the updated
source: before 1, after 1, before 2, after 2, before 3, after 3. Each used
`npm run test:ui`, three workers, diagnostic capture off, the same dependencies
and warm local caches. No other validation command ran concurrently with these
benchmark commands. The development host itself was shared: a load average of
15.43 was observed on its 12 logical CPUs during the second pair.

| Pair   | Before command wall time | After command wall time | Before aggregate CPU time | After aggregate CPU time |
| ------ | -----------------------: | ----------------------: | ------------------------: | -----------------------: |
| 1      |                  198.79s |                 184.08s |                  1062.95s |                  989.22s |
| 2      |                  259.92s |                 306.40s |                  1098.61s |                 1099.17s |
| 3      |                  194.84s |                 203.87s |                  1030.29s |                 1022.84s |
| Median |                  198.79s |                 203.87s |                  1062.95s |                 1022.84s |

Aggregate CPU time is `/usr/bin/time` user plus system time across child
processes; it is not elapsed time. Playwright itself measured 196.668, 258.574
and 193.243 seconds before, and 182.733, 299.038 and 202.419 seconds after.
The command times include Vite preparation and normal runner cleanup.

**No reliable whole-suite wall-time improvement was established.** The median
was 5.08s (2.6%) slower after the change, with ranges of 194.84–259.92s before
and 184.08–306.40s after. The first pair's 7.4% improvement did not hold across
the repeat runs and must not be presented as a CI speedup. Median CPU time fell
40.11s (3.8%). Keep the full data, including the slower second pair; verify
end-to-end latency on GitHub runners before making a PR/main throughput claim.

The targeted cases improved in every pair despite the host variation. Medians
of per-test elapsed time from the same full-suite reports:

| Case                                                                          | Before |  After |
| ----------------------------------------------------------------------------- | -----: | -----: |
| Research countdown and completion                                             | 3.749s | 0.764s |
| Mine countdown and completion                                                 | 1.860s | 0.713s |
| Resource catalog/decision viewport matrix                                     | 3.156s | 1.420s |
| Active facility across viewport widths                                        | 2.346s | 1.224s |
| Login presence with cached-page restoration                                   | 2.626s | 1.031s |
| Catalog responsive matrix, now with enlarged-text coverage for all categories | 5.581s | 7.484s |

The expanded catalog check costs more because it now verifies three additional
categories at 200% text and exercises their controls. Routing parameterization
also has a tradeoff: median summed routing time increased from 6.527s to 8.792s,
while the longest individual case fell from 6.527s to 2.292s. Its benefit is
independent failures and finer parallel scheduling, not lower total work.

### Verification and reproducibility

- Every baseline run passed all 353 cases; every updated run passed all 356.
  All six reports have zero skipped, flaky or unexpected-failure cases.
  Full file/title inventories differ only by the documented one-to-four route
  split. No test assertion failed during the focused or full validation runs.
- The focused changed-behavior run passed 12 cases (10.92s command time).
- `make test-tooling`: 85 passed, one pre-existing explicit-only Docker probe
  skipped, no failures; 7.19s command time.
- `make test-client`: 521 passed in 60 files; 5.27s command time.
- Strict TypeScript checking of the split game fixture passed (2.91s).
- Visual mode passed the four affected capture/video cases and produced 36 PNGs
  plus one navigation video (10.61s command time). This verification ran alongside
  tooling/client/type checks and is not part of the performance comparison.
- A separate normal-mode navigation run passed in 3.70s command time and
  produced no PNG or video files, confirming that recording is opt-in.
- Lockfile and whitespace checks passed. No production behavior, test execution
  deadline, CI worker count, sharding or integration-selection rule changed in
  this pass. Rust/database suites were not rerun because this pass changes only
  browser test setup and execution.

The tested base remains `42e03e89afd4e2b813837e4c326f21c87c09d0fe` with the earlier
screenshot changes and this uncommitted first pass. The seven-file before/after
snapshot hashes (sorted relative path, NUL, file bytes, NUL; SHA-256) are:

- Before: `d16f8795a218e118bb0b1556e75e2f34cc0f98b77a773cc54efdf55318c220b2`.
- After: `222ac9689e83b24b8d981827ae0f1d701723627ca19720b5bd97b04762050206`.

The full final set of 44 changed/new non-documentation source files hashes to
`3eea7977b08035fe989cb15b220e224b22e1c26cf9c38c07a83b95c8bf246b28` using the same
method. Saved variants were checked before every swap to avoid overwriting any
unexpected edit, and the updated variant is restored in the working tree.
Logs, source snapshots, assertion inventories, JSON results and generated
evidence are retained in `/tmp/orbit-perf-first-pass/`. Each runner shut down
its Vite/browser processes; no database or Docker project was created.

## PR integration

Preparing the PR required merging main at
`46310a352bad22e594114077fbace123d01c2d2a` to resolve conflicts in the density,
galaxy, report-deletion and shell tests. Main's new assertions and report
navigation behavior are retained, including Reports as a fifth independent
planet-routing case. The newly added report-glance spec uses the same failure
fixture and optional diagnostic helper. The integrated suite contains 389
fixture-browser cases in 24 files; 37 spec files use the failure fixture and
121 named capture calls are opt-in.

The benchmark tables above describe their recorded pre-integration snapshots.
They are not measurements of the integrated PR revision; its validation and CI
results are tracked separately on the PR.

## Desktop account menu validation — 2026-11-02

The sidebar account-menu change updates existing navigation coverage for Settings,
logout, keyboard focus, touch targets, long names, and supporter/insignia identity.
The first local command could not start because this checkout had no dependencies;
`npm ci --no-audit --no-fund` completed in 3s.

A newly authored combined scenario, `desktop account menu supports keyboard settings
navigation, dismissal and logout`, was interrupted after 40.1s when it tried to click
the visually hidden route H1 underneath the sticky HUD. Its one repair clicked
visible content. The next run was interrupted after 40.4s when the absolute-positioned
popup detached during scrolling. Removed that new scenario rather than stabilizing
it again. Fixed the product popup to use fixed positioning, matching its sidebar
anchor. Existing touch navigation, long-name/logout, and account-identity keyboard
checks retain the browser wiring protection. No existing test was deleted, assertion
weakened, timeout increased, or retry added.

Adding the insignia fixture initially failed both account-identity viewport cases
(7.4s each): its asset URL did not match the contract's content-hash URL pattern.
The single repair uses the actual bundled free asset's SHA-256 URL. Both cases passed
(2.5s/2.9s; 1.821s module preparation; 3.9s runner time). Profile reloads subscribe to
successful complete responses before checking identity. Screenshot-only scrolling
remains gated by `ORBIT_TEST_SCREENSHOTS`.

Final pre-publication verification on base `d3dab11936a8d9767e41d6673c646aaf2fcac9ea`
plus this change: 18 focused browser checks passed (2.148s module preparation,
15.6s runner time); 18 navigation unit tests passed (0.704s runner time); TypeScript,
canonical lint/format and whitespace checks passed. The browser run logged refused
local API connections during fixture teardown without failing assertions. Desktop
1440×900 and mobile 390×900 captures, plus touch and long-name states, were inspected
and displayed in the implementation chat. Each runner closed its Vite server,
browsers and port lease; no database or Docker setup was used. Remote CI and queue
verification are tracked on the PR, separately from these local timings.

PR #320 review follow-up closes the portaled account menu when the sidebar's
1024px breakpoint is crossed, restoring focus to the visible mobile Menu button.
Settings now composes `Menu.LinkItem` with the router link and only records an
ordinary unmodified navigation as a visit. Five focused browser cases passed,
including both resize directions, Settings activation, keyboard focus and refreshed
identity captures (1.875s preparation, 5.1s runner time). No failed attempts in this
repair round; canonical lint/format, TypeScript and whitespace checks passed.

Full CI exposed two stale account-control selectors outside the initial focused
set: the shared ghost-style check still targeted desktop Sign out, and the dispatch
recovery layout check still targeted the standalone Settings link. Update those
references to Account menu while retaining every style, focus, hit-testing and
layout assertion. Remove the account button's redundant foreground override so
shared ghost hover/focus styles apply. The selector audit found the other direct
Settings/Sign out references are mobile dialogs or connection-error actions and
remain valid. Stopped the obsolete CI run after six browser shards and native
checks passed; the two remaining shards were still running. This is a product-
change selector update, not a timeout/retry repair. Four focused cases passed
(7.163s preparation, 12.6s runner time), including both affected checks and refreshed
desktop/mobile identity captures. Canonical lint/format, TypeScript and whitespace
checks passed; no test was removed and no assertion weakened.

### Unexplained account-identity browser stall

At `609af48f1ac4af1861b31463e3d497d0e909a220`, CI run `41569110377`
job `125697932668` completed 136 of its 137 cases by 03:03:43 UTC on
2026-11-03. Only case 134, `sidebar account identity wraps inside its full-width
menu trigger`, had no result. Cancellation completed at 03:17:19 UTC; the logs
contain no failing assertion or stack for its pending wait. The exact shard
passed all 137 cases locally (1.859s preparation, 2.3m runner time), which shows
intermittency and is not a repair. All other PR jobs and automated review passed.

History: introduced in `1181001` (#235), then adapted to player dossiers in
`906e18a` (#256). This PR updated its obsolete Sign out selector, containment
assertion and profile-response readiness in `669a9ef`. No explanatory failure
stack or prior reliability repair was found in that history or the repository
performance audit; the separate owner Test Czar ledger was not available in the
local workspace/automation inventory. The earlier local failed combined scenario
recorded above was a different, newly authored case and remains removed.

Removed this unexplained expensive scenario under the repository's deletion rule.
Do not rename/recreate it or treat its local green run as closure. Retained coverage:
`player-profiles.test.ts` deterministically checks authoritative identity/tier
refresh and expiry; `runtime-controller.test.ts` and `optional-services.test.ts`
check logout and session cleanup; shell account-identity cases check shield and
supporter containment and keyboard access; desktop touch and breakpoint cases
check menu Settings navigation/focus; mobile logout and explicit login/routing
suites retain session/browser wiring. The inspected 1024×600 long-name image stays
in this chat's local evidence. No timeout, retry, product authorization, or other
case's assertion changed.

After removing that scenario, all 15 remaining desktop-navigation browser cases
passed (2.066s preparation, 12.5s runner time), along with 41 deterministic
profile/session/logout tests (0.534s runner time). Whitespace checks passed;
production source was unchanged by this removal. Runners closed all local resources.

### Unexplained bulk-read browser stalls (PR #326)

At `3d9045d3b7bcfaeb54ec38c301870db4dd44db38`, CI run `41685651722`,
job `126091330296`, completed 137 of 139 cases. Only cases 95 and 96,
`desktop report ranges and bulk read preserve navigation and archive protection`
at 1440px and 800px, had no result. The last other test completed at 17:47:11 UTC
on 2026-11-03. Cancellation was requested at 17:58:58 and completed at 18:00:24;
logs contain no assertion failure or stack identifying either pending operation.
The exact shard passed all 139 cases locally in 2.2 minutes. This demonstrates
intermittency, not a repair. All other PR CI jobs and automated review passed.

History: the scenarios originated in `b1c639f` (#275), with later report action
changes in `ee4e174` (#303) and `0ff7504` (#307). This PR adapted their command
fixture and assertions to atomic read batches and added response-aware navigation.
No prior reliability repair or explanatory failure evidence was found in Git
history or this audit; the separate owner Test Czar ledger was unavailable.
No stabilization attempt was made. The newly added response predicate also
matched the document URL, so it did not establish API readiness, but the logs do
not establish that as the cause of the hang. Removing these scenarios removes
that predicate too; the shared response helper remains unchanged.

Removed both unexplained expensive scenarios under the repository deletion rule.
Do not rename/recreate them or treat a green rerun as closure. Retained protection:
`report-selection.test.ts` covers range selection, one-command batching, filtering,
context validation, refusal, rejection and uncertainty; `report-state.test.ts`
covers atomic receipt reconciliation, stale responses and failure supersession;
engine and PostgreSQL tests cover whole-batch authorization, recipient isolation,
duplicate IDs, replay, vacation access and persistence. Existing report-deletion,
compact report-tools and report-sharing browser scenarios retain navigation,
selection, keyboard actions, archive protection and responsive coverage. Final
inspected desktop/mobile captures remain in the originating chat. No timeout,
retry setting, product behavior or other scenario's assertions changed.

### Quick-build layout assertions before delivered options (PR #326)

At `b54f6fac35b79f1c95289ba6499264d22ac1ade7`, run `41690156497`
failed only `quick build stays inside the row with keyboard and touch-sized
controls at 320px`: `Build Metal Mine level 2` was absent during the 5s assertion,
then present in the saved failure snapshot. Shard 2 completed 138 other cases in
7.3 minutes; all other CI jobs and automated review passed, including shard 7.
The failure occurred on the first post-navigation control assertion, before any
keyboard or layout interaction; HTML load did not establish quote readiness.

History: introduced by `e1af116` (#197). Commit `9780e03` (#311) repaired this
same response-readiness pattern for the separate touch and keyboard scenarios,
but not this parameterized layout test. This is the layout test's first repair.
The separate owner Test Czar ledger was unavailable; Git history and the local
audit were checked before editing.

Reuse `openQuickBuildCatalog` for ordinary quote-dependent entry and implement it
with the shared `withProgressionResponse` helper. Audit covered every caller of
`quickBuildFixture`: submit/progress, affordability, server-blocker, layout,
competing-command, touch/keyboard and acknowledgement cases now await their
matching successful complete response before observable UI assertions. The
intentional gated-options and aborted-options cases retain their distinct
request/error gates. All keyboard, touch-size, containment, submission and
negative/race assertions remain unchanged; no timeout increase or retry was added.
No independent caller work remains deferred.

### Desktop account identity stalled in merge queue (PR #326)

Queue revision `1b65898fc1b00c55eca92b3bfe0c1ff708d7ee42` combined PR head
`30b747d4d9de066f3034c99e9627ed6e1ea775ee` with main `cfe36bc`.
Run `41694784070`, job `126123955968`, completed 137 of 138 shard-8 cases by
18:42:46 UTC on 2026-11-03. Only case 53, `account username appears in navigation
at 1440px`, had no result. The test step had started at 18:37:57; cancellation
completed at 19:11:58 after the heartbeat observed the prolonged stall. No failing
assertion or stack identified its pending operation. All other merge-group jobs
passed. Cancellation removed the PR from the queue; this is the first queue removal.

History: account identity coverage originated in `680b70c` (#14), was extended by
`1181001` (#235), and gained desktop account-menu/insignia checks plus explicit
profile-response readiness in `c56a159` (#320). The preceding audit's unexplained
account-identity stall concerned a different desktop-navigation scenario that
remains removed. Git history and the local audit supplied no explanation for this
scenario's pending wait; the separate owner Test Czar ledger was unavailable.
No speculative stabilization attempt or unchanged retry was made.

Removed only the stalled 1440px scenario and its now-unused desktop branch under
the repository deletion rule. The same named 390px case remains intact. Retained
coverage includes client/adaptor player-profile identity and supporter state,
runtime/session cleanup, the mobile username/insignia scenario, desktop-navigation
account-menu touch targets and Settings navigation, and desktop-to-mobile menu
focus/portal cleanup. The independent desktop-navigation scenario is not a renamed
replacement. No product source, timeout, retry, or surviving assertion changed.

This was the third CI repair round in this PR. Reassessment found all changes
outside bulk report reads are confined to test reliability and its audit: two
unexplained report scenarios removed, quote delivery awaited in an existing
quick-build fixture, and this unexplained desktop identity scenario removed.
No speculative product changes or additional feature scope were introduced.

### Remaining mobile account-identity variant also stalled (PR #326)

At `0158d4b006f85031f270ae95e55250c4ebf0f419`, PR run `41701378152`,
job `126147030648`, completed 137 of 138 shard-8 cases by 19:26:35 UTC on
2026-11-03. Only case 53, the retained `account username appears in navigation
at 390px`, lacked a result. The test step began at 19:21:32; after the next
heartbeat identified the prolonged isolated wait, cancellation completed at
19:41:42. All other jobs and Bugbot passed. This was a PR run, not a second queue
removal. Again there was no failing assertion or stack identifying the wait.

This is the same parameterized identity scenario whose desktop variant was
removed above, with the same `c56a159` profile-response readiness change and no
subsequent stabilization patch. Its local green result on the previous removal
was not evidence of reliability. Removed the mobile variant and imports used only
by that scenario under the unexplained-test rule; did not recreate or rename it.
The two variants' shared scenario is now removed in full. Audit of response-helper
reload callers found no other player-profile reload caller; the separate bootstrap
reload in combat simulation has a different data boundary and no matching failure
evidence, so neither that case nor the shared helper was speculatively changed.

Retained tests cover profile source/binding validation, identity/supporter expiry,
refresh and session cleanup deterministically. The separate shell supporter-claims
case, desktop account-menu navigation/touch and resize-focus cases, mobile menu and
logout cases, and player-profile UI cases retain browser wiring. No product code,
execution deadline, retry, or surviving assertion changed. This additional removal
addresses recorded failure evidence after the third-round reassessment, rather
than expanding feature scope or retrying unchanged intermittent cases.

## Mobile menu page design — 2026-11-03

Validated the uncommitted design on base
`34c36a1e63198ee0dd7988f813bc0eca063f5cd1`. SHA-256 of the sorted changed
`apps/web` file names and contents (NUL separated) was
`a203df31230690b90166e3fbca15776a2786d16ff05b0fe2c342753dc44ea8ae`.
The menu now owns a route; primary and Develop links are no longer duplicated.
Updated the common navigation fixture and audited its callers, including the
explicit-only signup, MVP and responsive journeys. Those explicit suites were
not run. The implementation owner owns these fixture changes in this working tree.

Removed the obsolete mobile-dialog resize/focus-lock case because there is no
navigation dialog. Retained route persistence on resize, keyboard activation,
Back, Settings, logout, touch targets and desktop account-menu focus in the
navigation tests. Replaced the unit assertion that every destination appears in
the menu with assertions that secondary destinations appear once and primary
navigation is excluded. Capability and universe checks remain deterministic.

The initial browser command could not start without node_modules; npm ci completed
in 2s. Two before-change visual-reference cases passed (1.326s Vite preparation,
3.1s browser runner). Initial new-page checks passed twice (1.218s preparation,
6.5s runner). The broader navigation/iOS run had 22 passes and one failure
(1.314s preparation, 18.5s runner): the dossier test still asserted containment
inside the removed dialog, comparing the viewport popup's x=12 against the main
column's x=18. Inspected the failure pixels and history through #320, #259 and
#256 and this repair ledger; the separate Test Czar ledger was unavailable.
Its one repair asserts viewport containment while preserving visible content,
clickability and Escape dismissal. No timeout or retry was added.

The affected navigation, protocol, identity, unread, text-size and motion set then
passed all 23 cases (1.293s preparation, 22.2s runner). Fifteen deterministic
navigation/route cases passed (0.111s); TypeScript, canonical ESLint and Prettier
checks passed. Inspected fresh mobile 320×844 and 390×844, desktop 1440×900,
unread 390×900 and player-dossier 390×1000 captures. Browser runners close their
Vite server, contexts and port lease. No Docker/database setup, CI queue wait,
push or merge was involved; queue and merge delay are not applicable.

The remaining changed resource-settings entry and dispatch recovery callers passed
all three focused cases (1.253s preparation, 4.2s runner), preserving form saves
and pending-order recovery without navigating away from local edits. Final
whitespace validation passed. No additional failures or repairs occurred.

PR preparation rebased onto `283c5be` and validated
`86a1a6698ea55ecf78d9fc316e7b25e250dd6ee5`. Preserved main's deliberate removal of
the account-identity cases when resolving the shell-test conflict, and retained
both audit entries. The 15 affected navigation/iOS/browser checks passed (2.509s
preparation, 20.7s runner); 29 navigation/route/report-state unit cases passed
(0.217s). Production build, TypeScript, lint, formatting and whitespace checks
passed. Refreshed and inspected desktop/mobile and relevant interaction captures.
No new test failures; test servers, browsers and port leases were cleaned up.

PR #330 run `41754058662` on `e3ae1cba8c91316a3adc5df5424ab4bc96d34351`
exposed three stale Galaxy navigation expectations (320/390/768px), all in shard
5 job `126325923358`. Each expected four mobile links and received the same four
plus Menu, which changed from a button to a route link. History traces the
scenario to `ad9e6e6` (#207); no earlier reliability repair for it appears in this
ledger. Updated the one shared expected list, retaining all Galaxy/Fleets/Dispatch
routing, history, focus and layout assertions. Audited other main-navigation
link/count and Menu-button expectations; no further stale lists found.
The four viewport cases passed locally (1.401s preparation, 7.1s runner). Product
source and inspected screenshots are unchanged. This is the scenario's one
repair; no timeout/retry adjustment or test deletion. The first CI attempt had
five green browser shards and one failed shard (136 passing, three failing cases;
7.5m browser execution), with shards 6/7 still executing when the corrected head
was prepared. Native setup took 82s and checks 249s; runners started 13–51s after
workflow creation. No merge queue enrollment or removal had occurred.

### Unexplained planet-rename browser stall found during PR #330

After the corrected head superseded run `41754058662`, its shard 7 job
`126325923557` logs showed 137/138 cases completed. Only
`rename persists in the shell and public galaxy at 390px` had no result; its
1280px counterpart finished at 01:28:40 UTC, the last other case at 01:34:25,
and cancellation completed at 01:38:05 on 2026-11-04 UTC (November 3 locally).
There is no failing assertion, locator stack or diagnostic identifying the pending
operation. Read the scenario and history: introduced in `6296d14` (#50), with
Galaxy response-readiness repair in `996bfc5` (#305). This ledger contains no
further repair; the separate Test Czar ledger is unavailable. Do not treat a
passing run on the next head as closure of this unexplained stall.

Removed the shared two-viewport scenario under the repository's unexplained-test
rule, rather than recreating the same journey or adding timeouts/retries. Retained
`planet-name.test.ts` for Unicode trimming, scalar limits, command/presence pairing
and pending/reconciled saves; engine `planet_renaming_is_public_free_repeatable_and_owner_only`
for authorization/public projection; PostgreSQL
`planet_names_survive_restart_publish_to_other_players_and_retry_once` for persistence
and idempotency. The five surviving planet-name browser cases cover rejection and
preserved edits, current names in fleets, explicit fallback naming, closed edits
after reconciliation and shared control states. All five passed (1.610s preparation,
6.0s runner); the two deterministic client cases passed (0.163s). No product code
or surviving assertion changed. Local browser/Vite resources closed normally.
The second CI run `41755257641` is superseded by this documented removal; no queue
entry or removal has occurred. This PR's implementation owner owns the repair
and retained-coverage audit; there is no independent follow-up to hand off.

### Catalog bootstrap boundary repair — PR #330

Run `41755590187` on `04fe49aa948bff4a82f4a35bb433b1d23c89a2c3` completed with
native checks and seven browser shards green. Shard 3 (`126331427547`) had 137
passes and two failures in `manufacturing stacks every exact resource cost in
compact rows` at 320/390px (6.9m execution). Both failed in shared catalog `setup`,
before the scenario assertions: the H1 was still `Opening your universe.` and
then absent. Failure images show the empty shell during startup. The fixture
awaited HTML navigation and immediately began its five-second rendered assertion,
without establishing successful complete bootstrap delivery.

History: layout scenario introduced in `af980a1` (#176); shared setup introduced
in `19ee32c` (#80). No earlier repair for this scenario appears in history or this
ledger. Its one repair registers the existing `withFixtureResponse` helper before
navigation and verifies `/api/v1/bootstrap` success/completion, then retains the
same observable heading assertion. Audited all 46 setup call sites: they require
healthy startup and install held/error/command overrides after it; intentional
negative and race cases are unchanged. This common fixture repair belongs to this
PR's implementation owner; no separate caller follow-up is outstanding.

All 116 catalog cases passed locally (1.242s preparation, 1.9m runner), including
all three manufacturing viewports and the preserved submission/race/error checks.
No timeout, retry, assertion or product code changed. This is a response-readiness
repair, not a green retry of the same fixture. Reassessed after three CI repair
rounds: the changes remain one menu implementation, its stale-selector updates,
one documented unexplained-test deletion and this shared bootstrap boundary;
no feature expansion or speculative product change. Browser/Vite resources closed
normally; whitespace checks passed. The complete prior CI result is retained;
there were still zero merge-queue entries or removals.

# PR and main test performance audit

## November 10, 2026: PR #384 queue startup failures

Queue run `42837687421` tested integration `946cd964c7256c1d0b9b079ee6e037dc4baac28d`
for PR head `b7c4c918`. Native/database checks passed, but two browser cases
failed and GitHub removed the PR from the queue once. This is not a successful
merge or an infrastructure-outage diagnosis.

- `client-update.spec.ts`: `a click during quiet session recovery is explicitly
  refused (1440x1000)` failed its initial Empire-heading assertion before reaching
  session recovery. Job `129904355451`, artifact `13775915646`. The failure
  snapshot already contains the heading. This scenario originated in PR #348;
  unlike the separate session-rotation scenario retired in PR #355, no prior
  repair was found for this case. Bootstrap delivery is already response-gated;
  the evidence does not establish the precise cause of the late render. Removed
  this desktop variant under the unexplained-failure rule rather than applying
  a speculative wait or rerunning unchanged.
- `vacation.spec.ts`: `vacation review, commitment, minimum and return at 1280px`
  failed to find Leave vacation mode after its final reload. Job `129904355556`,
  artifact `13774304482`. The snapshot contains the enabled button. The journey
  previously received the screenshot-helper repair documented in
  `docs/verification/vacation.md` and the later response-gating sweep. Removed
  the failed desktop variant outright; did not repair it again.

The mobile variants remain, and vacation blocker/rejection coverage remains at
both widths. The shared bootstrap-response helper is already used at both
failure sites; inspection established no new helper defect to patch or delegate.
Do not infer a diagnosed race or successful repair from these deletions.
Retained deterministic protection includes coordinator tests for explicit refusal
without sending, queueing or persistence, and engine vacation tests for exact
minimum duration, production preservation, blockers and exit behavior.

Validation: four retained browser cases passed (1.981s module preparation, 6.4s
runner; cases 2.0–5.6s), 71 coordinator tests passed (0.684s runner), and eight
engine vacation tests passed (0.39s preparation, 0.26s execution). No browser
timeouts, assertions, production behavior or CI protections changed. Task-owned
fixture servers and browsers exited; no database or Docker resources were started.

## November 10, 2026: obsolete normal-motion shell assertions

PR #384 run `42831197283` at head `519dec7c` failed the 390px and 1280px
`navigation limits motion to desktop hover colors ... with no-preference` cases
in browser job `129882198228`. Each recorded nine animation-start events and
expected none. The integration includes main's intentional Briefing animation
from PR #382; the test observes the entire document, not just navigation.
The two reduced-motion variants passed, as did the native checks and databases.

History confirms the same scenario already consumed its repair in PR #369
(`17778e49704c9b54ccb00ab66a5648a1c78f82bd`), documented in
`docs/verification/sidebar-hover-transitions.md`: its blanket no-motion assertion
was expanded to allow requested sidebar color transitions. Removed the two
failing normal-motion cases outright under the one-repair policy. Kept the two
reduced-motion cases and all their assertions unchanged. No new exemptions,
timeouts or unchanged retries were added. No production animation was changed.

Retained cheap coverage in `navigation-motion.test.ts` checks the desktop and
no-reduced-motion media guard, eligible sidebar controls, color-only 150ms
transitions, and the required override of the global reset. Its first run hit
Vitest's CSS-module stub through a raw import; after checking this ledger and
its absent prior history, its one repair reads the stylesheet with Node instead.
It passed in 0.145s. The two retained browser cases passed (1.992s preparation,
3.4s runner total, 2.4s each). Briefing's dedicated browser cases already cover
its intended animation and reduced-motion behavior. Audit found no other
`uiMotionEvents` observer outside this scenario. There is no independent
follow-up or shared helper defect left open.

## November 10, 2026: espionage missile disclosure fixtures

New deterministic tests caught two fixture-authoring mistakes on their first
runs: the world editor requires `op: "set"` before deserialization, and simulator
input counts are numbers rather than the report's decimal strings. Checked this
ledger and file history; neither new case had a prior repair. Added the missing
operation and corrected the expected simulator input type. Both passed their
single repair runs, retaining exact missile visibility and combat exclusion
assertions.

Removed both new `missile intelligence survives report navigation and sharing
at {1440,390}px` browser cases after their second failure. First attempt: an
inbox fixture incorrectly supplied the full report as its preview, and its
locator expected the exact accessible link name `Espionage`. The single repair
projected the preview's allowed fields. Second attempt: the report rendered
correctly, but the locator still missed the actual name `Espionage · Nova Roma`.
Both runs failed at the first inbox assertion; neither established successful
browser validation. No timeout increases or third repair were made. Existing
browser tests remain unchanged.

Retained coverage is deterministic: real engine arrival tests across twelve
probe/technology combinations, the shared engine-produced defenses fixture,
client report/preview schema checks, static report rendering and hidden-section
checks, separate preview totals, shared-report projection, and simulator
exclusion. A separate disposable capture-only browser session inspected inbox,
detail, unknown, and public report screens at both viewport sizes; it is not a
replacement regression test or a claim that the removed cases passed. Failure
evidence and measured phase timings are recorded in
`docs/verification/espionage-missiles.md`. There is no outstanding shared fixture
defect or independent follow-up work from these local authoring mistakes.

## November 9, 2026: fixture navigation readiness sweep

The report-glance and missile-report failures shared one test-design defect:
a bare `page.goto` or `page.reload` followed by assertions on lazily fetched
data, so the assertion deadline started at HTML load. Audited every bare
navigation in the routine fixture browser suite (`uiFiles`): 341 sites in 53
specs now wait for the response their next assertion depends on. Each site
uses a named helper in `fixtures/responses.ts` or the existing
`withGalaxyResponse`:

- In-game screens gate on `GET /api/v1/bootstrap`, which carries the initial
  game snapshot on a direct load. `/overview` is not requested on that path.
- Report lists gate on the list POST with `filter.unread_only === false`, not
  the shell's unread-badge query. Report details gate on `POST /reports/{id}`
  and shared reports on `GET /api/v4/shared-reports/{token}`.
- Galaxy, High Scores, Messages, Alliance and insignia screens gate on their
  own Galaxy, rankings, social, alliance and insignia requests.

Left bare on purpose: intentional loading, error and held-response scenarios;
static playgrounds without API data; public, auth and bootstrap-failure flows
in `bootstrap-ui`, `home` and `hosted-auth`; and sites that already await
their own response or request. No sleeps, retries, timeouts or product behavior
changed.

Routine browser tests have no per-test deadline, so a matcher that never fires
stalls its shard. Local validation therefore ran all 53 changed specs with a
temporary `--timeout=90000`: 1007/1007 passed in 15.6m on three workers with
no retries, so every gate matched a request its page makes. TypeScript over
`src` and `tests` reported no new errors, the test-policy and
diagnostic-screenshot script tests passed, and `git diff --check` was clean.
The runner stopped Vite and Chromium; no Docker was used.

## November 9, 2026: colony report readiness without the overview visit

PR #375 run [42678831678](https://github.com/unbought-games/orbit-imperium/actions/runs/42678831678)
browser shard 3/8 failed `colonization success links to a usable colony` inside
`shellFixture`: the bootstrap response completed, but `main h1` did not render
within the assertion deadline on a loaded runner. The failure snapshot contained
the ready overview heading. The other 147 shard cases passed.

No prior repair for this scenario exists in Git history or this audit; the
separate owner Test Czar ledger was unavailable. This is its one repair attempt.
The scenario never used the overview: it immediately navigated to the report.
Both report variants now install the game fixture without visiting the overview
and wait for their report POST with `withFixtureResponse` before asserting
rendered content. No sleeps, retries, timeouts or product behavior changed.
Local validation: all six colonization cases passed with three workers and no
retries. The cross-spec audit of ungated navigations has its own owner.

## November 9, 2026: missile report lazy-response readiness

PR #373 run [42678837519](https://github.com/unbought-games/orbit-imperium/actions/runs/42678837519)
browser shard 6/8 failed `missile inventory launch and reports at 390px`: after
`page.goto` to the impact report, the `Missile impact report` region was absent
for the assertion deadline, although the failure snapshot contained it with the
expected text. The scenario ran 1.2m on a loaded runner; the other 146 shard
cases passed. Earlier runs of the same PR source passed.

Git history and this audit show no prior repair for this scenario; the separate
owner Test Czar ledger was unavailable. This is its one repair attempt, matching
the report-glance repair: the report list and report detail navigations now wait
for their own report POST with `withFixtureResponse` before asserting rendered
content. No sleeps, retries, timeouts or product behavior changed. Local
validation: both viewport variants passed with two workers and no retries.

About 25 other report navigations in fixture browser specs still assert after a
bare `page.goto`. Auditing them is independent follow-up outside PR #373.

## November 9, 2026: retire report-glance after its one repair

The readiness repair above passed locally but did not establish reliability.
PR-head run [42659657516](https://github.com/unbought-games/orbit-imperium/actions/runs/42659657516)
at `8c1de6c83f041e0d7b7f73508e280a8f0449b15c` stalled in browser shard 7/8.
The authenticated live job log and subsequently downloaded log contain successful
completion for all 145 other cases (test numbers 1–146 except 76), but no
completion for `report glances expose historical mission facts in compact rows
on desktop and phone`. Its four neighboring report-glance cases completed.
The last other case finished at 17:04:57 UTC; cancellation at 17:20:39 UTC
ended more than fifteen minutes of no progress. This is failed validation, not
a pass, even though all other PR jobs and automated review passed.

Removed that entire browser scenario under the one-repair rule. It is not
renamed, skipped, recreated, given a longer timeout, or stabilized again.
The previous section records its first failure, history search and repair.
No root cause beyond the stalled scenario is claimed for this second failure.
The four independent delivered-detail/report-tools browser cases remain with
their response gates, and existing report-deletion tests retain row navigation,
keyboard actions, selection and archive interactions.

Retained deterministic protection in report-preview, report-fleet-summary,
combat-report-model and resource-mark tests covers historical report facts,
known/unknown data, names, fleet counts, viewer-relative outcomes and canonical
resource symbols/colors. Added a focused reportListTitle test for selecting the
viewer's participant when another participant appears first, historical reports
without participant/outcome knowledge, and the Contact Lost fallback. The
removed broad visual scenario's exact layout/contrast permutations are no
longer claimed as covered. No product UI changes were needed.

Validation: `8c1de6c8` plus the two test-file diff SHA-256
`cf8d2bdafc760bc2ac42269e5a43e9772a263c41b96197a185fec49b6eee105c` (this audit entry is documentation-only).
All 55 deterministic tests passed in 0.259s. All four retained browser cases
passed in 10.9s after 1.903s module preparation, one worker, no retries or local
runner queue. ESLint, TypeScript and whitespace checks passed. The runner
closed its browser/Vite server and released its port; no Docker was used.

Counts so far: one original integration assertion failure, one post-repair
PR-head stall canceled after inspection, one canceled superseded integration
run, and one failed queue entry removal. The stalled job prepared its runner
from 16:57:54 to 16:58:58 UTC; test execution ran until cancellation at
17:20:39 UTC, followed by GitHub cleanup of its orphan processes. No unchanged
CI retry was requested. The implementation owner retains this repair/removal
and latest-revision follow-through in PR #374; no independent follow-up is
unassigned. Final CI and merge timing are recorded on that PR.

## November 9, 2026: report-glance lazy-response readiness

PR #374 merge-group run [42653338937](https://github.com/unbought-games/orbit-imperium/actions/runs/42653338937)
tested integration `6ea33c8be8f8a3f84472118c403ad73d9a1869e4` over source
`d457faaae7daad25dcb15b76f6178923c727ab97`. Browser shard 7/8 failed
`report glances expose historical mission facts in compact rows on desktop and phone`
at the ContactLost color assertion: after `page.reload()`, the first row's
`strong` element was absent for the assertion deadline. The failure snapshot
already contained the expected Contact Lost row. HTML readiness did not wait
for the lazy report POST or its complete body. The other 145 shard cases passed.

Inspected the scenario, its Git history (including #158, #354 and #365), and this
audit. No prior readiness repair was found for this scenario; #158's separately
named disabled-control repair changed report-deletion.spec.ts, not this test.
The separate owner Test Czar ledger was not available. This is the scenario's
one repair attempt: use the existing `withFixtureResponse` helper before each
navigation/reload, matching the report POST (not the HTML GET), then retain all
existing observable content, layout, focus, color and contrast assertions.

Audited all eight report navigation/reload sites in report-glance.spec.ts,
including the delivered details and responsive tools cases, and applied the
same response boundary to all five scenarios. The PR #374 owner delivers this
common-pattern repair in this chat; no independent follow-up remains. No
product behavior, sleeps, retries or timeout settings changed. Existing
report-preview and fleet-summary unit tests retain deterministic report facts,
missing data, identities and fleet-summary arithmetic.

Validation: source `d457faaa` plus the test-only diff SHA-256
`c13511dd4a72d5a18cc2021837c4bc7553c5b1030f7d9028ada6c5f792b69678` (this ledger entry is documentation-only).
The initial local pass was 5/5 in 23.1s with 2.050s module preparation. Inspection
then tightened the response matcher to POST so an HTML response cannot satisfy
it; final validation passed 5/5 in 23.2s with 1.734s preparation. Both used one
worker, no retries and no local runner queue. The 29 report-preview/fleet-summary
unit tests passed in 0.245s; ESLint and whitespace checks passed. No UI changed,
so the previously inspected defense screenshots remain current.

One remote failed scenario, zero local assertion failures. The first integration
run was superseded when a preceding PR left the queue; its obsolete workflow
42652228544 was canceled to free runner capacity. No blind CI rerun occurred.
The failed shard's runner wait was 17m 2s after scope selection, setup was
1m 22s, browser execution 10.2m, and cleanup/artifact upload about 4s. The UI
runner stopped Vite and Chromium and released its port; no Docker was started.
Final pushed-head and merge-group results are recorded on PR #374.

## November 5, 2026: recovery fixture teardown after its first repair

[Main CI run 42114714101](https://github.com/unbought-games/orbit-imperium/actions/runs/42114714101)
tested `8fcb4dcff5771c10bbce5027fef098ab1c982600`. Browser shard 3/8 failed
`session rotation recovers quietly but a refused action remains explicit
(1440x1000)` with `Error: Test ended.` at `fixtures/responses.ts:59`, inside
`response.finished()`. The scenario ran for 11.318s; the other 140 shard cases
passed. Native checks, all database groups, and the other seven browser shards
passed. The final required-check failure only propagated that browser failure.
The downloaded JSON report contains no assertion failure, retry or attachment.

Inspected Git history and the available repair records, including
[`empire-identity-pr.md`](../verification/empire-identity-pr.md). No separate
owner Test Czar ledger was available in this checkout. PR #353 (`c199b798`) had
already repaired this scenario's response-phase ordering while repairing the
foreground-recovery case. **Removed the failing desktop variant outright** under
the one-repair rule. It was not rerun, renamed, skipped or replaced with another
browser scenario. The passing mobile variant remains.

The shared defect was an unowned promise: the page-lifetime `request` listener
started `request.response().then(response.finished)` for every matching request,
even after the last awaited drain. Its `finally` removed the promise but did not
handle rejection when Playwright ended the test. A new request racing with
teardown could therefore fail an otherwise completed scenario.

The caller audit found exactly two call sites: foreground recovery (both
viewports) and session rotation (now mobile only). This change owns the entire
audit and repair; no independent follow-up remains. For these retained callers,
the helper now tracks `requestfinished`/`requestfailed` events instead of creating
background response promises. It waits for terminal delivery, including requests
started during a drain, removes listeners at page close, and rejects any active
drain on close rather than claiming success. HTTP and rendered-state assertions
remain in the callers. Intentional 503 responses, failed-request handling,
recovery, and action-refusal assertions remain intact. No sleep, retry, timeout
increase or CI deadline was introduced.

Four deterministic tooling tests cover held body delivery, requests arriving
during a drain, concurrent drains, intentional failures, subsequent phases, and
teardown with/without an active drain. Existing coordinator tests retain quiet
rotation, server-deadline recovery and action-admission coverage. Extended the
existing refused-action unit test with a controlled clock to assert that a
healthy refresh preserves its message, sends no second command and leaves no
queued or persisted action. The remaining browser case covers form edits and
rendered error persistence; separate desktop/mobile click-during-recovery cases
remain.

Validation used base `8fcb4dcff5771c10bbce5027fef098ab1c982600` plus the four-file
implementation/test diff with SHA-256
`c82eaedbf49af66a0f98641361f6e544a533be68761197dffa452d52a0e7a108`
(`git diff --` the coordinator test, client-update browser test, response helper,
and response-readiness tooling test). This ledger entry is documentation-only.

- Dependency setup: `npm ci`, 3.99s.
- `make test-tooling`: 129 passed, zero failed, 12.74s wall time. The one existing
  explicit-only Docker isolation test remained skipped; no Docker suite was
  requested or run.
- `npm test -- apps/web/src/client-model/coordinator.test.ts
  apps/web/src/client-model/delivery.test.ts`: 81 passed, 0.708s runner duration,
  1.66s wall time.
- `npm run test:ui -- client-update.spec.ts --workers=3`: all 13 retained cases
  passed on their first attempt, zero retries/skips; 2.155s module preparation,
  13.3s browser execution, 16.39s wall time including runner setup/cleanup.
- `npm run lint`: passed, 5.04s. `npm run format:check`: passed, 7.18s.
  Changed fixture/tooling files were formatted; `git diff --check` passed.
- Local runner queue wait: none. Original CI runner wait after scope selection:
  3s; shard setup 84s, browser step 496s, cleanup/artifact tail 3s. Original total
  workflow elapsed time: 10m 53s. One original failed case; zero local failed
  attempts. No rerun-for-luck, queue entry, queue removal or merge occurred.
- Cleanup: the UI runner exited successfully after stopping its browser and Vite
  and releasing its port. No persistent server or disposable database was started.
  Logs remain locally in `/tmp/orbit-main-ci-*.log`, the downloaded CI report in
  `/tmp/orbit-ci-42114714101`, and the focused browser JSON in
  `test-results/browser-ui/results.json`. Remote main has not been rerun by this
  local repair. No product UI changed; visual validation is not applicable.

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

## Deployment recovery validation (2026-11-03)

- The new deterministic keepalive-only reconnect test exposed initialization
  overwriting the immediate reconnect poll. Queue the initial idle poll before
  opening delivery. The existing healthy-stream test now explicitly opens the
  connection and asserts the new initial reconciliation before its unchanged
  idle cadence/disposal checks. History: delivery tests last changed in #32;
  no previous repair for this scenario was found in this ledger. No retries or
  timeouts were added.
- The new asset-build test initially failed on macOS because Vite resolved
  `/var` to `/private/var`, making the HTML output appear outside the temporary
  root. Resolve the temporary root with `realpathSync` before invoking Vite.
  This is the first repair of this new test; both independent-build identity
  and bundle/metadata agreement assertions remain.
- The new deployment browser scenario was interrupted after 54 seconds while
  awaiting its first overview response: foregrounding schedules a zero-delay
  reconciliation, but the test had paused the page clock without running that
  scheduled task. Its first repair advances one millisecond after foregrounding,
  with the response listener already registered, then awaits the HTTP response
  and visible update notice before advancing to the reload. The unpaused
  cooldown scenarios passed. Existing paused bootstrap recovery callers already
  run their scheduled tasks before awaiting responses; no shared helper change
  is needed. The implementation owner retains this fix in the deployment
  recovery PR, with deterministic controller coverage of the quiet period.
- Final local coverage: 1,328 client tests, 68 HTTP tests, and 124 tooling tests
  passed (one tooling test deliberately skipped). Client execution was 7.21s;
  HTTP preparation 10.66s and execution 16.34s; tooling execution 14.91s.
  Six browser checks passed in 9.2s after module preparation, including real
  reload navigation and manual recovery at 1440×1000 and 390×844. Screenshots
  remain local chat artifacts. A later button-layout correction reran the two
  affected incompatible-data browser scenarios and refreshed their captures.
- Explicit local browser validation used the real Rust server, PostgreSQL and
  production frontend. Same-build SIGTERM/restart recovered in 1.29s without a
  browser reload. A replacement frontend build took 16.66s; after server restart,
  version detection and automatic reload restored the authenticated URL in 3.07s.
  The first direct-server harness attempt incorrectly awaited the proxy's HTTP
  500 instead of a failed TCP request; that diagnostic assumption was corrected
  before successful validation. Both server processes exited and the isolated
  Compose project's container, network and volume were removed. Local setup
  phases preceding the measured builds were not separately instrumented.
- Final bundle inspection found the public recovery notice pulling in the full
  OpenAPI validator through its shared error text. Extracted dependency-free
  contract error definitions; the public shared chunk fell from 586.96kB to
  259.28kB. The production build, 137 affected unit tests (0.85s), and all ten
  built-homepage checks (0.66s preparation, 3.2s execution) passed after this fix.
- Automated review identified successful auth mutations being reported as failures
  when their response advertised a new build. Bodyless 204 responses now still
  announce the update but preserve the confirmed result; login/signup suspend any
  previous account and await readable bootstrap data without credential errors.
  Added deterministic real-adapter logout and login/signup controller coverage.
  All 1,331 client tests passed in 4.46s, followed by lint, formatting and a
  production build. No browser test was added for this state/authorization rule.
- CI run 41755598283 at 2dbad15 failed the two hosted-enrollment retry viewports
  in browser shard 6: `getByRole('status')` matched the new empty update region
  as well as “Joining the current universe.” The source fix retains a primed
  aria-live region but exposes its status role only while a message exists.
  The original enrollment assertions are unchanged. History: the scenarios came
  from #300, with no prior repair recorded here. Audited global status-role
  callers (including Galaxy and action-sheet notices); other callers are scoped
  to their component or text, and the shared inactive-role fix covers the
  affected surface. All 18 recovery/hosted-auth browser cases passed in 21.4s,
  with fresh screenshots and explicit inactive/active status-role coverage.
- CI run 41757041553 at cb612b9 exposed an existing combat-report navigation
  readiness race: the “capture current small combat report” heading assertion
  expired after HTML navigation, while the failure screenshot/error context
  already contained the expected Victory report. The fixture never awaited the
  lazy report response. History (#315 diagnostic gating and #292 participant
  locations) and this ledger showed no prior readiness repair for that scenario.
  Its first repair uses `withFixtureResponse` with the exact API detail URL before
  navigation, verifies HTTP success and complete delivery, then retains every
  content/layout assertion. Audited all three report-navigation sites in this
  file and applied the same boundary to the six combat variants, explosion
  interaction and two shared-redaction cases. No sleeps, retries, deadline
  changes, or screenshot-based readiness were added. The implementation owner
  delivers this shared fixture repair in the current recovery PR.
  All nine cases passed after the exact-API response boundary in 8.8s. The other
  seven CI browser shards, native checks and all PostgreSQL groups passed on the
  preceding head; this was its only failed test. No production code changed in
  the repair.

## 2026-11-05 — Discord #126 connection lifecycle

Isolated base `e8a96d81`; implementation/evidence are in
[connection-recovery-126.md](connection-recovery-126.md). No production mutations.
No CI deadline, routine acceptance job, or scheduled monitor was added.

- Preparation: locked npm install took 3 s (the host default Node 23 emitted engine
  warnings; all validation then used pinned Node 24.18.0). Two-job Rust build took
  122 s. Existing competing browsers/VM workloads were inspected; browser runs
  used one worker. No other task's processes were stopped.
- Baseline deployment/contract browser cases: 6 passed in 11.8 s.
- First focused unit run: 94 passed, 2 failed in 0.697 s. New code unnecessarily
  woke startup delivery and omitted exporting the shared Retry-After parser.
  Inspected test history/ledger and repaired those implementation mistakes.
- First full client run: 1,347 passed, 6 failed in 5.66 s. Five failures were a
  broad helper edit accidentally spreading a nonexistent test variable; the
  sixth was the old connection copy expectation. Removed the stray edits and
  updated that expectation. The affected 72 tests passed in 0.615 s. These were
  explained implementation/edit mistakes, not flaky retries; no tests deleted.
- Subsequent full client runs passed (1,353 in 3.71 s; 1,354 in 3.65 s) as focused
  lifecycle/selector coverage was added. Initial formatting check found one
  unformatted long expectation; formatted it before the final check.
- Desktop/mobile fixture recovery runs: 10 passed in 16.1 s, then 10 passed in
  18.7 s after adding HUD portal/recovery assertions. Module preparation was
  1.745 s and 1.709 s respectively. Existing shell disconnection/navigation
  regression passed in 2.5 s (1.7 s test execution).
- Real local setup initially failed because Docker's default network pools were
  exhausted. Inspected allocated ranges and used a local Compose override for
  `10.253.126.0/28`, scoped to this worktree's disposable project. No pruning or
  changes to competing projects. The second setup succeeded.
- Initial real Rust/PostgreSQL/built-client interruption run: 9.444 s total;
  desktop warning after 615 ms and recovery in 2,517 ms; mobile warning after
  500 ms and recovery in 2,438 ms. Same-build SIGTERM/restart and real browser
  offline/online passed at both sizes with zero document reloads. All script-owned
  browsers and servers exited in its finally cleanup.
- Only final source revision/CI status establishes PR readiness. Exact head,
  refreshed screenshot inspection, final validation, Compose cleanup, and CI
  waiting are recorded in the originating implementation chat. No queue or merge
  was authorized, so enqueue/merge delay and queue removals are not applicable.
- Deeper retained auth-counter inspection found 62 read-unavailable results,
  including intervals near the report. This led to the typed live-rotation
  response; healthy public checks alone were not treated as proof of no failures.
  HTTP tests: 71 passed, 24.0 s execution after 44.15 s preparation. OIDC database
  suite: 12 passed, 1 existing explicit-only skip; 30.70 s compilation, 0.23 s
  warm runner preparation, 6.745 s execution. Its disposable test database was
  dropped by the existing script trap. Clippy passed in 56.67 s.
- The new session-rotation browser case was interrupted after 2.3 minutes: its
  paused clock advanced 1,001 ms, before the first 250 ms tick after the response's
  one-second deadline, so it awaited an unscheduled snapshot indefinitely. Ten
  earlier cases had passed, one was interrupted, and one had not run. History
  and this ledger were checked. The single repair uses normal browser time and
  response-gated recovery; precise deadline permutations remain in unit tests.
  Both repaired viewport cases passed in 8.2 s. No timeout/retry setting changed.
- Audited the added fake-clock sites: only these two new viewport variants used
  that deadline assumption. Existing deployment tests use their own explicit
  reload timer and response gate. No independent follow-up is required for this
  local test-design defect. HUD capture preparation now waits for final opacity
  only when screenshots are enabled; behavior assertions remain independent.
- Latest full client run: 1,362 passed in 3.68 s. Build, lint, format, contract drift,
  boundary checks and Rust formatting passed. Rebuilt the final Rust binary in
  25.84 s after the server response change. Final screenshot/real-service checks
  and PR CI are recorded against the committed revision in the chat.
- Final combined fixture run: 13 passed in 29.8 s (one worker), covering the
  recovery/update/rotation cases and existing shell navigation during failure.
  Final real-service run after the Rust change: 12.191 s total; desktop detection
  638 ms/recovery 1,635 ms and mobile detection 406 ms/recovery 2,447 ms, with
  zero reloads. The script's server/browser cleanup completed. The isolated
  Compose project, container, network and volume were then removed explicitly.
  Screenshots are retained under `test-results/connection-126-evidence` locally.
- PR #348 first head `dd26274f` received one valid automated finding: a prior
  quiet SessionRefreshing deadline made `send` return without feedback. Added
  explicit unsent-action feedback both before persistence and when a concurrent
  deadline starts during persistence; background presence stays quiet. Two
  deterministic tests cover the orderings. Coordinator tests passed (71 in
  0.597 s); both desktop/mobile click-during-recovery browser cases passed in
  3.2 s with a frozen clock and applied-state assertion, never advancing across
  the retry deadline.
- First PR CI run `42051661889` failed two report-cleanup viewport cases because
  they still required the removed literal “Connection lost. Reconnecting…”.
  Downloaded/retained failure artifacts, inspected history and this ledger, and
  updated the expected notice while retaining countdown, explicit retry, portal
  identity and live-region assertions. Both repaired cases passed in 18.8 s.
  Audited all remaining old-copy references: updated the incompatible-data
  negative assertion and the explicit-only malformed-response expectation.
  The full explicit core suite was not rerun; HTTP/unit and fixture schema
  coverage passed. No test was deleted, retried for luck, or given more time.

## November 5, 2026: response-gated shared shell startup

PR #347 queue run `42065953092`, integration revision
`5a143f0cc1e8e79f4994bbc664a4d2808d798404`, failed the existing `Heavy Fighter
submits the selected build quantity` case before reaching manufacturing. Shard 6
job `127380132646` reported no `main h1` within its unchanged five-second UI
assertion in `shellFixture`; the captured page context and screenshot then showed
the expected Empire heading and fully populated overview. The test entered that
assertion after `page.goto` without awaiting bootstrap delivery. This is the
shared missing-response-readiness pattern prohibited by AGENTS.md, not evidence
of a combat or manufacturing arithmetic defect.

Inspected the helper's history back to `88a55aa`, the scenario's history through
`527fdd6f`, `b66dfdaa` and `c9b4f404`, and this repair ledger. No previous repair of
this scenario's startup boundary was found; a separate owner Test Czar ledger was
not available. Its one repair wraps the shared helper's overview navigation in
`withFixtureResponse`, subscribing before navigation and checking successful,
complete bootstrap delivery before the existing observable heading assertion.
The six subsequent document navigations in the Heavy Fighter suite use the same
helper. No timeout, sleep, retry, screenshot readiness, or assertion weakening
was added.

The caller audit found the shared ready-overview wrapper in 47 spec files (48
files including its definition). Its contract already requires successful
startup; intentional loading/error/race tests retain `installGameFixture` and
their own controlled responses. This PR owns the shared repair and its focused
Heavy Fighter/shell verification; no separate common-helper repair is deferred.
Existing deterministic manufacturing quantity, affordability, authorization and
replay coverage remains unchanged. If the repaired browser scenario fails again,
remove it under AGENTS.md rather than applying another stabilization patch.

The failed queue shard passed 142 other cases and failed one; its test step ran
16:37:08–16:46:59 UTC (591s), after preparation from 16:35:34–16:37:08 (94s).
The failure is retained as failed validation. Queue removal and fresh-head/queue
results are recorded in the implementation chat's validation artifact.

Focused validation after the single repair: all 84 Heavy Fighter/shell browser
cases passed with one worker (2.466s module preparation, 2.9m runner). Static
checks passed. The runner closed its server/browser and released its port.

## November 6, 2026: remove the Dispatch fixture's unrelated overview visit

PR #358 queue run `42261264895`, integration revision
`68981c1dea671dfb85aba8d3c440fd8dccfe07ea`, failed
`Dispatch shows available ships with a reversible all-rows disclosure at 390px`
in job `128041648092`. It failed in the shared Dispatch setup's call to
`shellFixture`, waiting five seconds for the overview heading before the test
navigated to Dispatch. The failure artifact already contains the correct Empire
heading and populated overview. The test never reached its ship disclosure.
The PR-head run had passed; that is evidence of intermittency, not a repair.

Inspected the scenario history (`89096d8d`), Dispatch setup/navigation history
(`#346`, `3c8613a1`), the November 5 shared-shell repair above and this ledger.
No previous repair of this disclosure scenario was recorded. Its one repair
replaces the shared Dispatch setup's ready-overview wrapper with the existing
`installGameFixture`. All Dispatch handlers are now installed before its one
navigation, whose existing `withFixtureResponse` still verifies successful,
complete bootstrap delivery before the Dispatch assertion. This removes an
unrelated screen and one full bootstrap from every caller. It does not add a
wait, retry, sleep or timeout, nor weaken any Dispatch assertion.

The caller audit covers every test using this file's shared `setup`, including
both controlled `beforeNavigation` profile handlers. They all require Dispatch,
not Overview; their intended target state and negative/race controls are retained.
The generic `shellFixture` remains for actual shell/navigation tests. This PR owns
the complete Dispatch fixture repair and full-file verification; no independent
follow-up is deferred. Ship visibility and zero-inventory selection continue to
have deterministic coverage in `client-model/ship-selection.test.ts`.

Queue failure timing: runner requested at 17:23:55 UTC and started at 17:24:15
(20 seconds allocation wait); setup completed at 17:25:57 (102 seconds); test step
ended at 17:33:22 (445 seconds). It passed 144 cases and failed one. GitHub removed
the PR from the queue once (first enrollment was 17:23:37). This remains failed
validation; a changed revision must pass PR and queue CI before merge.

Local repair validation: the full Dispatch file ran 105 cases in 1.2 minutes
(1.975 seconds module preparation). The repaired desktop/mobile disclosure cases
and 101 others passed. Two standalone fixtures failed with `ReferenceError:
shellFixture is not defined` after the import changed; this was a repair editing
error, not another intermittent scenario failure. Audited both and converted
their same redundant overview/Dispatch sequence to direct, response-gated fixture
navigation as well. Both passed on their single repair (3.3 seconds runner).
The 13 deterministic ship-selection tests passed in 0.342 seconds. No assertions,
scenario names or timeouts were changed. All fixture servers/browsers stopped
with their runners. Final queue verification follows the new pushed revision.

## November 6, 2026: await self-profile delivery after Dispatch reload

PR #358's second queue run `42266085978`, integration revision
`135135501254a122cbcd6e3a49448e6eca71f67b`, passed the repaired disclosure scenario
but failed `Dispatch origin follows authoritative self identity through loading
refresh and navigation at 1440px`. Job `128058356679` asserted Captain Nova directly
after `page.reload()`. The assertion first saw the expected unresolved “You” state,
then timed out; the captured page context already contains Captain Nova in both
the shell and Dispatch origin. Reload/HTML completion did not establish delivery
of the separately loaded self-profile response.

Inspected this scenario's history back to `89096d8d` and this ledger; no earlier
repair for its profile-reload boundary was recorded. Its one repair uses the
shared `withFixtureResponse`, matching `source.type === 'SelfAccount'`, before
releasing the deliberate loading gate, triggering pageshow refresh and reloading.
It verifies successful complete delivery before the existing identity assertions.
The initial “You” assertions remain deliberately before release; navigation,
stale-name exclusion and layout assertions remain. The caller audit found this
as the only reload in the Dispatch file; both viewport instances receive the
same repair. Other profile tests already have source-specific response listeners.
This PR owns the complete repair; no additional follow-up is deferred.

Both viewport scenarios passed in 4.1 seconds; the 14 player-profile model/adapter
tests passed in 0.231 seconds. No sleep, retry, timeout change, assertion removal
or product change was made. Runners cleaned up their servers and browsers.

Second queue failure timing: requested at 17:55:47 UTC, runner started at
17:56:03 (16 seconds allocation); tests began at 17:57:25 (82 seconds setup),
ended at 18:05:15 (470 seconds), with 144 passed and one failed. GitHub removed
the PR a second time. The changed revision must pass fresh PR and queue CI.

## RCA77 session-refresh coordination and CI follow-through — 2026-11-07 UTC

Orbit PR360 initially tested `f24f67c4159558dd111848c4b266bf4d68d26de7`.
Local real PostgreSQL OIDC coverage passed 13 tests (one existing opt-in provider
cutpoint test skipped), with final preparation 9.70s and execution 8.097s; two
wait-limiter unit tests passed in0.016s. Final storage all-target clippy took4.52s.
One newly added assertion initially failed compilation because StoreError was
unqualified; correcting its name preserved the assertion. Disposable Docker
setup exhausted the default network pools; an inspected non-overlapping
10.253.177.0/28 network was used for this task's own Compose project. No other
containers, volumes or networks were changed.

CI42329970501 passed Rust/unit/static, all PostgreSQL jobs and seven browser
shards. Shard7/job128274052871 failed `incoming fleets and overview arrivals
identify the same supporter` at the exact-text Visitor assertion. Its retained
DOM explicitly contains the correct `Visitor profile details` link and supporter
badge, but the rendered name is split into `Visito` and a final `r` grouped with
the badge. The exact text locator assumes a different DOM structure; this is
unrelated to the server authentication change.

History was checked with `git log -L` and the repository repair ledger. The case
originated in `f4a3dc24` and gained dossier/navigation assertions in `906e18a8`;
no prior repair of these name assertions was found. The separate owner Test Czar
ledger was not present in the available workspace. This is its one repair:
assert the complete accessible profile-link name, retaining supporter, tooltip,
desktop/mobile and navigation checks. The caller audit found the same pattern
in three report-observer assertions; they were changed together. The alliance
role named Observer is not a player identity and remains untouched. The existing
plain-name baseline measurement remains a deliberate typography assertion.

The two affected browser scenarios passed: module preparation2.281s, individual
cases3.3s/4.1s, runner8.3s. No sleeps, retries, timeout increases, UI production
changes or deleted tests. Vite/browser processes closed through the standard
runner. The initial failed CI remains recorded; the new pushed revision requires
fresh CI/review. Queue removals so far:0; merge/queue delay pending.

Second CI run `42331233137` on `5f400ca3` passed the repaired profile scenario,
all native checks, all database jobs and seven browser shards. Shard 1 failed
`public recruitment bypasses bootstrap, exposes only public data and opens the
authenticated alliance route`. The URL assertion began immediately after clicking
Continue and spent its five-second window traversing login and the legacy welcome
entry. The artifact shows the authenticated alliance welcome and application form;
the test had not gated this navigation on bootstrap delivery before asserting the
canonical address. No server authentication code is exercised by this fixture.

History (`68aa2e78`, `9415a56a`, `e8a96d81`) and the local ledger were reviewed.
The public-page fetch already has response readiness, but the authenticated
continuation did not; no earlier repair of that boundary was found. Its one repair
uses the existing `withFixtureResponse` helper around the click, requiring a
successful, completely delivered bootstrap before the unchanged canonical URL and
application-form assertions. The Continue-link caller audit found only this case.
No sleeps, retries, timeout changes, production UI changes or removed assertions.
The focused scenario passed: preparation 2.018 s, execution 1.6 s, runner 2.4 s.
This is repair evidence, not a claim that an unchanged rerun fixed intermittency.
A recurrence of this repaired case must follow the repository deletion rule.

The task's disposable database/container/network/volume were removed after OIDC
validation. All unrelated Docker resources remain intact. Two CI failures and
zero merge-queue removals are recorded so far; fresh CI is required for this push.

Review `PRRT_kwDOVRgPYs60xblI` correctly invalidated the recruitment repair:
Continue first navigates to login and obtains one bootstrap, then the recruitment
entry performs another document navigation and bootstrap for the game. Matching
the first response does not establish readiness of the final welcome route. The
focused pass therefore did not close the demonstrated boundary defect.

Removed `public recruitment bypasses bootstrap, exposes only public data and
opens the authenticated alliance route` under the one-repair policy instead of
making a second stabilization patch or renaming/recreating the scenario. This is
an unsuccessful repair disposition, not another observed CI failure of that case.
Retained deterministic protection: `recruitment.test.ts` checks safe auth return
intent and welcome construction; `router.test.ts` checks canonical/legacy alliance
query and welcome/invitation preservation; `markdown.test.ts` rejects scripts,
embeds and unsafe URLs. Existing PostgreSQL alliance tests enforce the exact
four-field public allowlist without leader/member data, discovery privacy and
public preview/revocation. Existing recruitment browser cases retain desktop/mobile
discovery and invitation-management wiring. No production routing or auth behavior
changed. This removal does not claim an end-to-end replacement for the deleted
multi-document journey.

After removal, the retained recruitment/router/markdown unit checks passed all
14 cases (2.96 s runner duration). The existing public-discovery browser cases
passed at 1440 px and 390 px (2.099 s preparation, 2.0 s runner, individual
0.697/0.413 s). Standard runners closed their resources. No replacement browser
journey was added and the original review finding is addressed by removal.

Review `PRRT_kwDOVRgPYs60xg1v` found a cleanup error in that removal: the remaining
`discovery applications preserve rejected drafts, withdraw and create an alliance`
case still calls `withFixtureResponse`. Restored its import; no second repair or
replacement of the retired journey was made. The remaining caller passed with
2.042 s preparation, 2.3 s execution and 3.1 s runner time. This introduced error
and its correction are recorded separately from the original flaky scenarios.


## 2026-11-07: incident repair PR #359 browser recurrence

Run `42263214249`, head `6f8f0e7d0ca3c5bee82db2fb858e208d2e3ee7dd`,
failed both Dispatch origin/self-identity navigation cases (390px and 1440px)
after reload: expected Captain Nova, received You, then the origin was absent.
The Test Czar ledger records their consumed repair in PR #346 (`9a49645`),
recurrence in PR #358 queue `42266085978`, and a second stabilization in
`8ed04706`. That later green run does not restore the repair budget.

Delete both width variants and their scenario-local profile-response predicate,
per the one-repair policy. Preserve shared fixture response gates and all other
Dispatch scenarios. Deterministic protection remains in
`apps/web/src/client-model/player-profiles.test.ts` and
`apps/web/src/adapters/player-profiles.test.ts`: source-bound identity, refresh,
stale completion, cache invalidation and typed profile request contracts.
No product behavior, network timeout or retry changed; UI captures do not apply.

The existing Test Czar deletion handoff `01a1b220-cc7f-7491-bac6-8a777d0cbf82`
was recorded as waiting for worktree creation through 00:32Z Nov 7. No separate
deletion PR was open at reconciliation. This owned incident repair PR now carries
the required removal; no second chat or edit to that operator's workspace was
created. The PR's final source diff and this record provide the reconciliation
point for the original handoff. Local/CI results are recorded in PR #359 and
incident evidence; the original failed attempt remains counted.


## 2026-11-07: PR #359 queue recurrence after the profile test repair

Protected merge-group run `42343139593`, integration
`71e9aabdbd05dae233bbf79e6264aab3fd0f0544` for PR head `b97597a`, passed all
native and PostgreSQL checks and seven browser shards. Shard 7 failed the
`incoming fleets and overview arrivals identify the same supporter` scenario
at its overview profile-link assertion after reload; 144 shard cases passed.
The retained synthetic DOM subsequently includes the Visitor profile link and
supporter badge. This does not establish a production identity defect.

The RCA77 audit above and commit `bb6d316a` record this scenario's one repair
in PR #360, after run `42329970501`: replace the split exact-text locator with
the accessible profile-link name. The new failure occurs after that repair.
Per the repository's hard one-repair rule, remove this scenario outright; do not
add another response gate, timeout, retry, or renamed copy. `inspectIdentity`,
shared profile fixtures, report identity navigation, Galaxy supporter coverage
and deliberate loading/error scenarios remain in use and unchanged.

Deterministic protection remains in `client-model/player-profiles.test.ts`
(profile refresh, support changes, source identity and stale-response fencing)
and `adapters/player-profiles.test.ts` (source-bound transport contracts).
No product source/UI changed and no new screenshot requirement is introduced.
The original queue failure/removal is counted alongside the initial PR failure;
fresh PR/review and integration checks are required for the updated head.

## November 9, 2026: Alliance PR #362 feedback

Reviewed failing CI run 42434513400 at head 54e6f6fb. Native build/lint/unit checks passed; the separate aggregate “Build, lint and unit tests” gate failed because database/rest and browser shard 1 failed. No top-level CI conversation comments were present.

- Validated Bugbot thread PRRT_kwDOVRgPYs608nmU: welcome retry called the controller directly, bypassing navigation, profile invalidation and recruitment tracking. First submissions, ordinary retries and welcome retries now share one successful-completion path; retry captures the original pending action before the controller clears it. New Join/Apply welcome browser cases verify home destination, resulting board/application list and identical retried command ID/payload after an explicit 503.
- Browser failure `open and closed recruitment and existing membership drive the available controls`: the five-second assertion began after HTML navigation through two route transitions, before both Mine/public data were known delivered. The failure artifact already contained the expected closed-recruitment text. Inspected test history and this ledger; no prior repair to this scenario was found. This is its one repair: a shared response helper registers both required listeners before navigation/reload, then asserts actual content. The scenario's directory transition is also response-gated. Audited the other public-profile caller and applied the same readiness helper to uncertain retry; all original assertions remain. No sleep, timeout change or rerun-for-luck.
- Database failures `alliance_identity::delayed_espionage_preserves_event_affiliation_through_rename_disband_and_sharing` and `alliances::accept_join_create_compete_and_withdraw_all_pending` occurred in fresh schema preparation at the existing ten-second production deadline, before domain assertions. Four cold database binaries started together; resource contention is the working diagnosis. Limit CI database work to two binaries using Make's existing DB_JOBS setting. All binaries share this limit; each still has its own disposable database and serial tests. No production migration/lock/statement timeout, database durability, assertion or suite selection changed. The same first four suites are the local validation batch; CI must confirm the runner-capacity repair.
- Integrated main 901cad85 because GitHub reported a conflict; combined the arrival/loading browser suite entries and regenerated contracts/routes.

Local validation after repair: 4 focused browser tests passed (preparation 4.978s; runner 8.1s); 18 relevant units passed in 321ms; 129 tooling tests passed with one existing skip in 16.510s; full static checks and production build passed (17.94s). All 17 PostgreSQL tests across alliance_identity, alliances, analytics and attack_groups passed with DB_JOBS=2 (compile 30.97s, total 105.64s; alliance suite 46.177s and attack_groups 60.483s). Native runners cleaned up browser servers and disposable databases. No repair validation failures or removals. This chat owns the first repair and its CI follow-through; there is no unassigned independent follow-up. Implementation screenshots remain deferred under the user's standing instruction.

### November 9: unknown Empire alliance membership

Validated the second Bugbot finding, thread PRRT_kwDOVRgPYs61UJl6. An absent/expired player profile was treated like confirmed nonmembership and routed to discovery. Unknown membership now opens Alliance home with the neutral “Open alliance” label; only a delivered profile without an alliance offers discovery. Held-response browser scenarios cover member and nonmember profile arrivals without sleeps or clock assumptions.

Initial new-scenario run: member passed; nonmember failed because the authored fixture sent `alliance: null`, but PlayerDisplay permits an omitted field rather than null. Checked the schema, scenario history and repair ledger: this newly added case had no previous repair. Its single repair omits the absent field and types the fixture with PlayerDisplay. Focused nonmember repair passed (1.9s test, 3.7s runner, 4.148s preparation); initial run was 10.6s with 5.484s preparation. No production workaround or assertion relaxation. TypeScript, scoped ESLint and whitespace checks passed.

### November 9: merge-queue route readiness repair

Queue attempt 1: enqueued 15:59:15 UTC at PR head c4eb74de; merge-group tree 61f2297c, CI run 42650189371. All native and database checks passed. Browser shard 7 failed `public alliance entry keeps its query and hash when resolving the universe name`: the URL assertion started after bootstrap delivery while the lazy Alliance redirect still had work pending. The error records the intermediate /alliance URL; the subsequent failure DOM shows Discover alliances with public-profile loading. This is asynchronous route readiness, not a wrong retained query/hash.

History shows the test was introduced in e8a96d81 with no previous repair; the earlier task only changed its expected destination. Single repair: register membership/public-profile response listeners before navigation and verify rendered content before the exact final URL. Audited the shared bootstrap-only helper callers: the two Alliance history/planet-switching cases now also wait for Mine on initial navigation and reload. Their exact URL/query/hash/history assertions remain intact; non-Alliance cases are unchanged. No sleep, timeout increase, removed assertion or duplicate scenario. The implementation chat owns this bounded repair and its queue verification.

Focused repair validation: all 3 affected cases passed (1.925s preparation, 3.7s runner); whitespace checks passed. The native fixture runner cleaned up. Previous PR-head CI run 42645503712 was entirely green on c4eb74de, including automated review; queue failures are recorded separately and are not erased by that earlier success. Screenshots remain deferred at user request.


## November 9, 2026: PR #382 report identity browser recurrence

Run `42744590303`, head `56d9ba378400f31590daa32ebef67976fc049cfe`,
failed `espionage and combat observations use current public identities without
changing historical facts` in browser shard 7, job `129593612602`. All native
checks and the other browser shards passed. This case failed inside its initial
`shellFixture` overview visit, before any report/profile assertion: `main h1`
was absent during the unchanged five-second assertion. The retained failure
snapshot includes `Empire — Planet [1:371:12]` and the fully populated overview.
The shard passed 147 other cases and ran for 10.0 minutes.

Inspected Git history, the failure PNG/context and the RCA77 entry above.
Commit `bb6d316a` already repaired this report scenario's three profile-name
locators as part of the same repair of incoming/profile observations in PR #360.
That entry records the two affected scenarios passing; a green pass does not
restore the repair allowance. Remove this recurring scenario under the hard
one-repair policy, with its now-unused `inspectIdentity` helper and type imports.
Do not rename it, add another stabilization or increase a timeout.

Retained deterministic coverage lives in `client-model/player-profiles.test.ts`
(refresh, supporter expiry, current identities versus older observations and
session fencing), `adapters/player-profiles.test.ts` (bound source contracts)
and `features/report-preview.test.ts` (historical names, facts, uncertainty and
public identities). This is not an end-to-end replacement for the deleted
three-report browser journey. Remaining Galaxy, bot/profile refresh and identity
alignment browser tests retain their interaction coverage and diagnostics.

This is the already documented unnecessary-overview-startup pattern. Audited the
remaining callers in this file: Galaxy exercises navigation from overview,
rankings/profile refresh installs fixtures directly, and alignment retains its
existing setup. No shared helper or deliberate loading/error/race case changed.
This PR owns the deletion, retained-suite validation and follow-through; there
is no separate deferred repair. No product source or UI changed in this step.

After removal, all 32 retained deterministic cases passed in 0.289s and all four
remaining profile browser cases passed (2.248s module preparation, 5.8s runner;
individual cases 2.2s, 2.2s, 2.5s and 4.8s). The runner closed Chromium/Vite and
released its port; no Docker or database setup was used. The original CI failure
remains counted; the new head still requires fresh CI and merge-queue validation.


### 2026-11-10 alliance presentation — new component cases retired

Owner: alliance identity/recruitment implementation chat, branch
`emick/alliance-identity-recruitment` (base `ea180d7f`).

The new desktop/mobile cases `alliance templates retain invitation and gallery
content without overflow at 1440px` and `... at 390px` were removed under the
one-repair rule. Initial execution stalled on an exact label selector: the select's
accessible combobox name was Template, while its wrapping label text included the
option text. Inspected the rendered page, interrupted the task-owned runner, and
made one repair to use the role/name selector. The next run failed both cases on
an unscoped exact-text assertion matching the draft textarea and rendered paragraph.
This was a test defect, not a product regression or infrastructure incident.
No timeout increase, stabilization patch, or renamed browser replacement was used.

Retained content, gallery, and private-data projection protection at deterministic
model/static-render boundaries in `presentation-model.test.ts`. Actual responsive
layout is inspected and captured in the implementation chat. The separate passing
preview interaction case retains native dialog, unsaved content, Escape, and focus
restoration coverage. Existing alliance component cases passed (23 total including
the preview case in the second run). Application editor/arrival journeys remain
separate integration coverage; the implementation chat owns their validation.

## Alliance PR routing expectations — 2026-11-10

PR #390 at `d29847f3`, CI run `42945292507`, job `130276602039`, failed the two
Alliance viewport cases in `planet-page-routing.spec.ts` at the removed Selected
body selector. This is an obsolete interaction expectation following the approved
removal of the alliance planet/resource bar, not a timing failure. The first
update retains legacy route/query/hash normalization, reload, absence of the bar,
and no-command checks. In-place planet switching/history stay covered for the
other four destinations; that interaction intentionally no longer exists inside
alliance pages. Both updated cases passed locally in the 20-test routing/arrival/
recruitment run. No retry, wait extension or selector fallback was introduced.

That run also exposed a product defect in the new incoming-threat fleet link on a
planetless account. The account-pages test was retained unchanged; guarding the
planet-only link fixed it. The final affected run passed 20/20 in 13.7 seconds.

## November 11, 2026: Community rewards initial CI repair batch

PR #394, revision `e3a22bee`, run `43121596082` reported four failed jobs.
These findings are distinct and do not establish infrastructure failure:

- `adapters/player-profiles.test.ts` retained the previous reader header assertion.
  Update the exact expectation to insignia reader 5 and rewards reader 1, preserving
  the binding/CSRF and no-subject/no-credential assertions. No earlier repair for
  this assertion was found in its file history or this ledger.
- Four alliance component cases exposed a newly introduced production dependency
  on GameSession inside the previously props-driven InvitationSettings. Move the
  optional rewards link content to the live screen's composition boundary and
  pass it as a slot through Settings. Keep the isolated fixtures and assertions;
  do not install application sessions/network clients merely to silence them.
- Both new rewards journeys could mistake the prior intentional 503 completion
  for the later successful refresh. They waited for response headers rather than
  complete delivery before changing the fixture policy. Their first behavioral
  fixture repair uses the shared request-finished boundary with an expected error
  status, then matches successful recovery explicitly. No sleep, timeout increase,
  retry or screenshot-dependent readiness. Prior routing failure was a product
  defect; earlier retired named-editor scenarios are separate and remain retired.
- The existing empty-color-group browser cases caught a production accessibility
  regression: the visible guidance lost its aria-describedby association when
  color controls became shared. Restore that association for both native color
  inputs and named-dye selects, with unique IDs. Preserve the browser assertions;
  add cheap static semantic coverage for the shared control variants.

Audited explicit failed-response waits in client-update, tutorial and alliance
journeys: those callers await response.finished before their corresponding state
transition; the rewards case omitted that delivery boundary. The new helper keeps
existing success-only helpers strict and gives intentional errors an explicit
status assertion. No broad fixture rewrite or test deselection is included.

This batch is source-ready with formatting/diff checks only. Focused client,
component and browser execution, screenshot spot checks, and CI verification are
pending the coordinator's validation slot. Neither the previous local green run
with optional captures nor an unchanged retry closes the known rewards test race.

### Initial features shard 1: alliance catalog fixture contract

The same run's job `130863238872` was canceled as superseded after 122 of its
123 selected tests completed. The full log identifies missing test 36 as
`alliance presentation previews unsaved edits and publishes them through the real
editor`, not the mobile atlas case. Desktop atlas was test 123 and passed; mobile
atlas was outside this shard. The last completed test alone was misleading.
No failure artifact was uploaded for this canceled job. Its exact pending action
was not captured, so cancellation remains incomplete validation rather than an
assertion failure or proven runner incident.

Source inspection nevertheless establishes a fixture contract defect introduced
by this PR: the editor now requests `/api/alliance-presentation/catalog?alliance=…`,
while both the recruitment fixture route and its response listener matched the
old URL ending at `/catalog`. The route therefore misses the request, and the
listener cannot complete. First explained repair: match the catalog pathname and
verify the expected alliance query parameter in both places. Retain all preview,
command, revision, public projection and content assertions. An audit found these
were the only fixture route/listener callers of that endpoint. History points to
PR #390 (`fba82df4`); no prior repair of this application journey was found in its
history or ledger. The separately retired presentation component cases remain
retired. No timeouts, retries, atlas changes or test deselection were added.

Evidence: initial PR head `e3a22bee`, CI merge revision
`bc4653ff4f749b639d2f83ab1b4bd805caea1844`, run attempt 1. Bundle preparation was
8.210 s; browser runner started 23:42:12 UTC, last completion 23:45:20 UTC,
cancellation 00:02:41 UTC. Validation of the repair belongs to the coordinator's
serialized browser slot; collection-only inspection is not a passing test run.

### Treatment component media setup type correction

Required `make check` at `d75dff21` passed 131 tooling, 1,809 client, the 791-test
main Rust group, 50 bridge tests and 10 storage-library tests, Clippy, Rust
formatting, ESLint and source formatting. Component typechecking then rejected
`test.use({ reducedMotion: ... })` in the new treatment gallery: reducedMotion is
not a top-level fixture option in the pinned Playwright version. File history and
ledger show no earlier repair of this case. Its first correction uses the supported
`page.emulateMedia` API before mounting, matching its existing reduced-motion
transition and other component callers. All interaction and appearance assertions
remain. This was a typecheck failure, not an observed browser assertion failure.
The failed full command took 304.63 seconds; remaining static/build checks and the
affected component case must pass before qualification.

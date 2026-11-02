# Vacation mode verification — 2026-11-01

Base revision: `11dd5b98aa410c0f9c7e679e19ff2cfcba06bd2c`, the committed empire
cleanup/alliance-attack integration. Vacation changes remain uncommitted on
`codex/vacation-mode`. Final code/configuration/test SHA-256:
`0972ffa85cbba8be1641ecb4b53d20fa1616a4eaf251fcb27260b9465a03a815`.

The manifest covers 49 changed tracked or nonignored untracked files, excluding
`docs/`. Hash sorted relative paths followed by NUL, file bytes, and NUL. The exact
file list is retained in `test-results/vacation-source-manifest.json`.

## Results

Native Rust used the installed repository toolchain, Rust 1.99.0, through
`PATH=/Users/admin/.cargo/bin:$PATH`. Frontend checks used the host's Node 24.14.0
and npm 11.9.0; npm reported that these differ from the package's pinned 24.18.0 /
11.16.0 engines. Dependencies and engine requirements were not modified.

| Validation | Result | Measured phases |
| --- | --- | --- |
| `make _server`, after the initial `make test-server` preparation | 638 workspace tests, 43 bridge tests, 7 storage unit tests passed | Builds 16.83s / 11.84s / 2.55s; suites 24.626s / 1.913s / 0.021s |
| `make test-client test-tooling` | 1,280 client tests across 131 files; 116 tooling tests passed, 1 existing skip | Client 12.04s; tooling 17.302s |
| `make test-db DB_SUITES=empire_deletion` after the scheduler race fix | 11 PostgreSQL/HTTP tests passed | Preparation 5.52s; suite 24.796s |
| PostgreSQL public_universe / holding | 2 / 1 passed | Suites 5.131s / 9.293s |
| PostgreSQL rules_updates | 40 passed | Suite 313.529s |
| PostgreSQL world_edit | 11 passed | Suite 271.659s; two tests reported slow at 63.394s and 89.710s, both passed |
| `npm run test:ui -- vacation.spec.ts empire-deletion.spec.ts` | 12 passed | Suite 24.5s |
| Final vacation capture/interaction follow-up | 4 passed | Suite 9.4s |
| Workspace/all-target Clippy with `-D warnings` | Passed | 10.45s |
| `make _static`, final lint/format follow-ups, `git diff --check` | Passed: Rust/frontend formatting, lint, contracts and dependency boundaries | No aggregate timer recorded |
| `npm run build` | Type checking, production bundle and prerender passed | Vite 5.62s; prerender build 0.192s |

Broad suites preceded the final scoped-scheduler dependency repair and UI copy/
capture refinements. The final PostgreSQL/HTTP run covers that scheduler repair;
Clippy and the browser/build follow-ups cover the final implementation. Routine
runner limits and assertions were not weakened. Full-system acceptance,
production-container and rolling-deployment validation were not run.

## Cases covered

- Exact 48-hour exit boundary; normal production before entry, base-only production
  while away, saved settings on return, fusion fuel suppression and zero moon income.
- Complete collection coverage, construction/research/manufacturing blockers,
  paid future batches, owned fleets and missiles, and foreign fleets already holding.
- Previously accepted transports, attacks and inbound allied holds retain their
  effects and prepaid stay; new missions fail the existing vacation guards.
- A 100-day vacation survives automatic cleanup. Return establishes a fresh
  28-day warning and 35-day removal check, with one live timer. Voluntary deletion
  still finalizes during vacation. Exact admission retries retain receipts.
- Both launch-first and vacation-first admission at one controlled time have one
  serialized winner. Newly created dependencies extend already admitted lifecycle
  commands before they can execute.
- Authenticated HTTP entry, unauthenticated rejection, private own-view status,
  and unchanged public-feed field allowlists.
- Legacy flag migration, interval boundary segmentation, preservation of production
  settings, and combined operator resource/vacation edits.
- Browser entry blockers and links, review/cancel focus, pending state, minimum
  lockout, reload after the minimum, exit, server rejection, persistent threat
  indicator, and disabled production settings with base-only income.

## Failures diagnosed and corrected

The initial command selected Homebrew Rust 1.97.1 and failed the repository's 1.99
version requirement; the installed matching toolchain was then selected.
Compilation exposed new-type fixture initializers, module/signature wiring and a
scenario-mode enum name; those were corrected. Initial engine fixtures omitted
asset valuation lineage and assumed speed 1 despite using speed 10. They now use
normal fixture authoring and assert the configured rates. Application fixtures
were extended with explicit complete policy/collection coverage after three
projection/bootstrap failures; missing facts are still errors in production.

The new database race fixture initially lacked ships. After creating a real fleet,
it exposed an actual persisted-fact failure: vacation's required scopes grew after
an earlier launch, but its admitted scope set had not. The fix extends pending
vacation/deletion command scopes in the source mutation transaction, using the
existing scheduler. Both orderings now pass. Clippy's nested-if finding was fixed.
A browser test refreshed before route bootstrap completed; the controlled
48-hour-return scenario now reloads the page before asserting exit eligibility.

An aggregate database invocation exited nonzero because the initial race test
failed; its public, holding and world-edit suites passed. The failed suite was
rerun successfully after the repair. No partial aggregate run is counted as a
passing command.

## Visual review and cleanup

Inspected the rendered Settings pattern before implementation. Final browser
interactions ran at desktop 1280×900 and mobile 390×900. Detailed section captures
use 1280×1200 and 390×1200 so long blocker/production sections can be inspected;
active shell captures retain the 900px height. Captures include ready, review,
submitting, blocked, active/minimum, exit-ready, returned, rejected and production
states. Transient HUD toasts were dismissed with their real Escape control;
the persistent hostile-fleet indicator remains visible. Screenshots stay local
in `test-results/vacation-*.png` and are displayed in the implementation chat.

Database tests ran in the disposable Compose project
`orbit-vacation-validation`, bound to localhost port 55438. Each native test binary
created and dropped its isolated database through the existing runner. After all
runs, `docker compose down --volumes` removed only that project, its network and
volume. Browser runners closed their Vite servers and contexts. The temporary
integration stash was removed after restoration was verified. No push, PR, merge
to main, or deployment was performed for Vacation Mode.

Deployment requires the coordinated API/worker upgrade and legacy-flag behavior
in [the feature guide](../features/vacation.md).

## PR integration follow-up — 2026-11-01

Vacation implementation was committed as
`b7982cdce1be1ab9deab9bb3cfde9df5b39e63a2` and published as PR #299, initially
stacked on cleanup PR #297. Integrated cleanup's leadership-invalidation repair
`1476a8bc94d1d802b4e2bd9b36752545946f22b0` into tested revision
`56d1746eb79d4d6c788c397052a22712694a2ea2` without conflicts or UI changes.
`make test-db DB_SUITES='empire_deletion alliances' DB_JOBS=2` passed all 18 tests:
preparation 9.19s, alliance suite 20.553s, deletion/vacation suite 24.631s. No
failures occurred in this follow-up. Its disposable Compose project
`orbit-vacation-pr` and volume were removed after validation. Existing screenshots
still match the implementation. Remote CI and review remain separate checks of
the pushed head; publication is not evidence of merge or deployment.

## Review repair — 2026-11-01

Bugbot thread `PRRT_kwDOVRgPYs6ydiqr` identified local entry-confirmation state
surviving a complete vacation cycle on the same mounted Settings screen. Two new
browser regressions reproduced the failure at 1280px and 390px: after leaving,
`Confirm vacation mode` was still present. The component now retires that local
review when the authoritative vacation state becomes active, preserving the
confirmation on a rejected entry. Re-entering requires opening a fresh review.

Against published head `73359328787d9e62aec2d4d77824ac848a9462e8` plus this repair,
all six vacation browser tests passed in 12.5s. Production build (3.31s and 0.182s
prerender), TypeScript and lint passed. Refreshed and inspected the desktop/mobile
same-mount returned-state captures; no backend or policy changes were needed.

After #297 squash-merged as `e6392c20f60b7a3d3587444f54fb270d52f8dee9`, replayed
only the three Vacation Mode commits onto `main`. Tested rebased code revision
`8af9efd84000ff1be1cfe3e7a4cb271b6ef46387`; the tree differs from its pre-rebase
counterpart only by the six identity-presentation files from merged PR #296.
All 18 vacation, deletion and player-profile browser tests passed in 37.1s.
Production build (20.76s plus 0.700s prerender), TypeScript, lint and diff checks
passed. Refreshed screenshots and inspected both same-mount returned-state
captures again. The browser runner closed its server and contexts normally.

## CI screenshot-helper race — 2026-11-01

CI run `41342823824`, browser shard 8 job `124956968558`, failed one vacation
scenario while 131 other shard tests passed. All other native, database and
browser shards passed; Bugbot completed successfully. The failed assertion was
inside screenshot preparation: dismissing a HUD toast did not reduce the total
count because a new notification replaced it. The game-flow assertions did not
fail.

Added a deterministic browser fixture that synchronously replaces the dismissed
toast while keeping the count at one. It reproduced the original helper failure.
The helper now waits for the specific dismissed DOM node to disconnect, then
handles any replacement separately; it still verifies dismissal and retains the
existing assertion deadlines. No production UI, gameplay, or CI configuration
changed, and existing screenshots remain current.

Tested parent `11325e0fabdfb1f7dea6b381abb87be45952cb68` plus the test-only repair;
SHA-256 of `apps/web/tests/vacation.spec.ts` is
`a8c84edd04010e8d02062fdaeeeb5645f47f807145e018b921e8673f0f4229b5`.
`npm run test:ui -- vacation.spec.ts --repeat-each=3` passed all 21 executions
(seven scenarios repeated three times) in 35.7s. The original deterministic
regression failed before the repair. The runner closed all browser contexts and
its Vite server; no database resources were needed.

## Merge-queue Settings integration — 2026-11-01

Head `50c475e987090053c45defd26c1773b20c167cdd` passed every PR CI check and
Bugbot review. Queue enrollment then reported `UNMERGEABLE` behind PR #298:
both features inserted a section immediately after Settings' beta notice.
Removed #299 from the queue while preparing its replacement head.

Integrated #298's queued prospective-main commit
`4a1cb2542d8f843c7732edcbfbdd2a0c7cbf3004` (source PR head
`cdcbd761cf6c3605124d1ffd08d576d94bd5eece`). The sole conflict resolution keeps
Vacation Mode first, followed by Community, and preserves empire deletion. The
resulting tested Git tree is `f2ed5e15e8f50ae36596e9148d601c0a958543ff` before this
verification-note update. Integrating the queued main candidate produces the same
tree as resolving against the source branch.

All 52 vacation, deletion and bootstrap/community browser tests passed in 41.0s.
Production build (7.96s plus 0.523s prerender), TypeScript, lint and diff checks
passed. Refreshed vacation captures and inspected the combined Settings view at
desktop/mobile sizes, plus the community keyboard/touch captures. Runners closed
their Vite servers and browsers; no database setup was needed. #299 must finish
new-head CI/review and follow #298 through the normal queue; this integration is
not a merge or deployment claim.

## Hosted-account main integration — 2026-11-01

Head `1ab01644bc60dd22ae60571b9d99b9379c581af1` passed all PR CI and Bugbot checks.
New main revision `e817ee7ffd59f07f7dfae1af1b91686ec414a8b4` (#300) then conflicted
with our browser-suite manifest. Merged it while retaining both `vacation.spec.ts`
and `hosted-auth.spec.ts`; no test suite was removed. The automatically combined
homepage retains the queued community-link work and the new account-entry flow.

The resolved tree `34e6cd85395d4ac595050b22ebae1a1e434114f3` passed all 76 vacation,
empire-deletion, hosted-auth, bootstrap and home browser tests in 52.1s. Production
build (8.63s plus 0.396s prerender), TypeScript, lint and diff checks passed.
Refreshed and inspected desktop/mobile Vacation Mode captures.

Also retained PR #298's subsequent test-only forecast-response synchronization
fix from `45b7fdf9b65de61df9fc1e5b65bcadd2e76c1c9b`, avoiding reintroduction of its
known CI race. All 42 building-quote browser tests passed in 32.4s. The resulting
tested tree, before this documentation update, is
`e38dd1ed446c945c89e09bac8ab1f70b4a9b333f`. Both runners closed their servers and
browser contexts. No database resources were created. Remote checks of the new
head and PR #298's merge remain pending; no queue or merge completion is claimed.

## Operator-policy review follow-up — 2026-11-01

Reviewed Bugbot threads `PRRT_kwDOVRgPYs6ye80t` (operator exit/cleanup,
comment 4437567478) and `PRRT_kwDOVRgPYs6ye80u` (combined-edit revisions,
comment 4437567481).

The alleged combined-edit persistence failure is a false positive: shared
persistence in `crates/storage-postgres/src/commit.rs` compares the database with
the original loaded `previous.revision`, not the new revision minus one. A new
PostgreSQL regression passed before any implementation change, proving that a
combined vacation/resource/building edit persists all values, preserves lineage,
and returns the same result without duplicate changes on operation-ID retry.
The two revision increments therefore did not need a speculative rewrite.

Raw operator edits deliberately preserve activity unless explicitly changed;
`world set` changes only listed source values and is not a foreground player
`ExitVacation`. Clearing protection on an already overdue empire does not imply
player activity. Documented this distinction and how to restore an empire with
`vacation: false` plus `activity: "active"` (or `presence_age_ms: 0`). Normal player
exit continues to use its paired foreground-presence action.

Found and reproduced a real related scheduler defect: an operator ending a
100-day vacation with explicit active presence retained an old check at day 133,
missing the new day-128 warning. Policy edits now schedule from their final source
facts after explicit activity-age overrides; overdue source deadlines wake at the
next safe ordered instant. Existing persistence replaces the prior live check.
Voluntary deletion keeps its original source deadline. No new presence is
invented, and saved/exported activity ages are preserved.

Tested base `a9877ba03dba352cf1deac8f7b778af4c5f3f7a6` plus the two code/test files
listed in `test-results/vacation-operator-source-manifest.json`, SHA-256
`dbf6ad8b9770d1487eeca0378a8ba15ea9018cb0cfae5e16faa45e9a367ea870`.
The explicit-activity regression failed before the repair (8 prior tests passed;
remaining tests were not run after failure). After repair:

- `make test-db DB_SUITES='empire_deletion world_edit' DB_JOBS=2`: 15 lifecycle
  tests passed in 81.717s and 11 world-edit tests passed in 243.274s; preparation
  7.44s. One 78.976s round-trip test reported slow and passed.
- Native missions: 128 passed in 6.609s; engine library: 47 passed in 1.649s;
  storage library: 7 passed in 0.056s, via the existing Make runner.
- Workspace/all-target Clippy with warnings denied passed in 24.43s; Rust
  formatting and diff checks passed. No test assertions or deadlines weakened.

The new database cases cover explicit return activity and timer replacement,
exact operation retry, combined edits, explicit presence-age precedence, voluntary
request preservation, and raw flag-only removal without fabricated foreground
presence. Disposable Compose project `orbit-vacation-operator` on localhost port
55438 and its volume were removed after all suites completed. UI and gameplay
entry/exit behavior are unchanged, so existing screenshots remain current.

## Queue Galaxy-readiness repair — 2026-11-01

Merge-group run `41360443615` on `d2d9f989c6b27511c76aa165283616eb60f76aae`
failed browser shards 5/6/7, one Galaxy assertion each: an alliance badge at 390px,
initial debris contents, and a renamed public planet after reload at 390px. Native,
database and the other browser shards passed, including Vacation Mode. Downloaded
the three failure artifacts and inspected their error contexts. Each contained the
expected data immediately after the rendering assertion timed out; the assertions
started after document load, before the Galaxy/profile response boundary.

Merged main `bf3f60d1510738ca017da5a8645f7f3a01eb2ed2` to reproduce the exact queue
integration. Before the repair, its tree was
`9cf30625c7d9ec1c47b9a88a74aaf6f02d47b5a6`, identical to the failed merge-group tree.
Added a small test-fixture helper that waits for the real Galaxy response (and
Galaxy profile response for alliance assertions), verifies HTTP 200 and body
completion, then runs the original rendering assertions. The renamed-planet
fixture also pins its intended 1:371 query coordinates. Domain assertions and
all assertion/network/suite timeout settings remain unchanged; no production UI
or gameplay code was changed by this repair.

The five affected viewport cases passed three times each (15 executions, 21.8s;
module preparation 1.611s). The full Galaxy-card, planet-name and player-profile
suites passed all 73 tests in 65.386s (module preparation 1.331s), including main's
bot-display coverage. `make _static`, TypeScript and production build passed
(Vite 7.44s, prerender 0.785s). Final tested tree before this note:
`9f7768dad97709fcdddb4e21e955ba52d3b1a9b0`. Browser runners closed their servers
and contexts. No database resources were created. Existing Vacation Mode
screenshots remain current. The failed queue entry was removed by GitHub; the
repaired head must pass fresh checks before requeueing.

## Read-model and passive-holding review follow-up — 2026-11-01

Evaluated Bugbot threads `PRRT_kwDOVRgPYs6yftH0` / 4437883082 (migration rates with
old checkpoints) and `PRRT_kwDOVRgPYs6yftH5` / 4437883088 (visitor facts). Both are
false positives against the actual consumers; no production behavior changed.

For rates, `progression_projection` first calls `orbit_engine::project`, which
settles a copy of each body to the observation time. Rates, energy and satellite
output are then calculated from those projected bodies, not the stored checkpoint.
The checkpoint-time condition is necessary when calculating the pre-vacation
segment of an interval-only migration; ignoring it would erase earned production.
Added a PostgreSQL/read-model regression with productive mines, a fueled fusion
reactor and two normally manufactured satellites. It writes only a vacation
interval while keeping the old body checkpoint, then observes an hour later.
The actual authenticated view reports base-only income, zero energy/fusion fuel/
satellite supply, correct pre-entry plus vacation balances, and unchanged saved
settings. A fresh raw snapshot confirms the original checkpoint and revision were
never persisted forward by the read.

For holding, ordinary host-only commands need the visiting fleet's presence, not
its owner's private policy/economy. Fact coverage deliberately remains limited to
the declared participants; valuation includes active fleets only for covered
owners. Extended the real serial/scoped holding regression to change host
production while a visitor is holding. The scoped execution snapshot contains the
fleet but explicitly lacks visitor policy/owner coverage, validates lineage and
commits safely without changing visitor ships/cargo. EnterVacation still rejects
with HostedFleet; existing view, Depot supply, combat, return and retry assertions
continue to pass. Operations that act on visitors declare their full participant
scopes; the incoming viewer path separately loads the policies needed to display
supply eligibility. Loading extra unscoped private facts for an unrelated host
command is unnecessary.

Tested parent `866c1466ceab71b9b8da2c92cbe104cefd782ccf` plus
`crates/storage-postgres/tests/holding.rs`, SHA-256
`32debacefb65cf4904b61965bc671ca91d33ab4c47a1124d162337b2192cb9b4`.
`make test-db DB_SUITES=holding` passed both tests (including both executor modes)
in 10.349s, after 2.91s compilation. Targeted Clippy with warnings denied passed in
10.41s; formatting and diff checks passed. Initial fixture wiring incorrectly
compared independent scheduler input IDs with command IDs, then tried granting
stationary satellites through the mobile-ship authoring field. Corrected the ID
lookup and manufactured satellites through normal commands; no assertions or
catalog restrictions were weakened. Disposable Compose project
`orbit-vacation-snapshots`, its network and volume were removed after validation.
Existing UI captures remain current because no production/UI code changed.

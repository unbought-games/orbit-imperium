# Empire deletion verification — 2026-11-01

Base revision: `398aa2fafab9f8031cd584f2023aff7ddd582e01`, with the uncommitted
implementation in this worktree. Tested code/configuration SHA-256:
`2febbc22fdac340a78c5d210fe9adf0cb21246b8e7557e421b9627dffec3e5cb`.

The digest covers 58 changed code/configuration files, including untracked
implementation files. Compute SHA-256 over sorted relative paths followed by NUL,
file bytes, and NUL; enumerate tracked differences plus nonignored untracked files,
excluding `docs/`. The local file list is in
`test-results/empire-deletion-source-manifest.json`. No commit, push, PR, or deployment
had been performed at that initial checkpoint.

## Coverage and results

Native tests used installed Rust 1.99.0. After disk recovery, builds used
`CARGO_INCREMENTAL=0`, `CARGO_PROFILE_DEV_DEBUG=0`, and
`CARGO_PROFILE_TEST_DEBUG=0`. These only reduce rebuildable artifacts; assertions,
runner semantics, and routine no-deadline settings were unchanged.

| Validation | Result | Measured phases |
| --- | --- | --- |
| `make test-server` | 617 workspace checks, 43 bridge checks, 7 storage unit checks passed | Preparation 20.01s / 15.64s / 2.88s; suites 21.969s / 0.674s / 0.014s; bridge rebuild 13.02s |
| Final engine lib, missions, and policy follow-up through `make _server` | 162 passed | Preparation 12.67s; suite 3.148s |
| `make test-db` with empire_deletion, alliances, social, holding, colonization, signup, frontend_bootstrap, ordering, world, migrations, world_edit; `DB_JOBS=3` | 65 tests across 11 binaries passed | Preparation 18.76s; individual suites 2.341–166.481s; slowest was world-edit export/replacement coverage |
| Final empire-deletion PostgreSQL/HTTP follow-up through `make _db-empire_deletion` | 6 passed | Preparation 6.58s; suite 10.179s |
| Legacy vacancy follow-up: empire_deletion, bootstrap, signup, colonization | 23 passed | Preparation 39.54s; suites 9.531s / 7.214s / 10.288s / 9.884s |
| HTTP adapter follow-up after local reenrollment routing | 56 passed | Preparation 15.38s; suite 16.346s |
| Signup follow-up after authentication timestamp change | 8 passed | Suite 10.085s |
| `npm test` on final client code | 1,273 passed across 129 files | 4.06s |
| `npm run test:ui -- empire-deletion.spec.ts` | 8 passed | 9.2s; desktop 1280×900 and mobile 390×900 |
| `cargo clippy --workspace --all-targets --features orbit-server/test-support -- -D warnings` | Passed | Final native check 4.17s |
| `make _static` | Formatting, lint, OpenAPI generation/validation and dependency boundaries passed | No aggregate timer recorded |
| `npm run build` | Type checking and production frontend build passed | Vite 2.93s; prerender build 0.175s |

The broad runs preceded the last focused changes. Follow-ups covered final removal
coverage guards, the 28-day private warning update, signup authentication time,
repeated succession, retry safety, and the automatic **Keep my empire** action.

Meaningful cases include exact inactivity/grace boundaries; vacation exemption;
foreground cancellation without canceling voluntary requests; destruction of owned
flights even when launched just before removal; intact foreign inbound flights;
foreign holds returning once with their cargo; stale event replay; incomplete fact
coverage failing closed; source-derived status with historical JSON compatibility;
recent-member/tenure/UUID succession, vacation eligibility and missing-policy
failure; cancellation/restart/retry identity; account and other-universe
preservation; new player identity on reenrollment; historical conversations;
leadership acquisition restrictions; and fresh authentication versus rolling
session renewal. Browser fixtures exercise explicit review, safe initial focus,
submission, cancellation, leader blockers, authentication errors, automatic cleanup
cancellation, shell notices, and horizontal fit.

## Visual review

Inspected the running Settings interface before editing. Captured and inspected
final screenshots at both 1280×900 and 390×900 for Settings, review dialog,
submission, requested deletion, game-shell notice, alliance-leader restriction,
sign-in rejection, and automatic cleanup. The automatic state offers **Keep my
empire**; it does not offer another destructive action. Added spacing below the
actions and refreshed the affected captures. Images remain local under
`test-results/empire-deletion-<state>-<width>x900.png` and are displayed in the
implementation chat. No images were uploaded or attached to a PR.

## Intermediate failures and recovery

- The shell initially selected Rust 1.97.1; validation used the installed 1.99.0
  toolchain after that version mismatch.
- Initial compilation/lint exposed fixture ownership/import issues and a redundant
  struct field. These were corrected before passing runs.
- New policy reads exposed older minimal projection/alliance fixtures without
  player-policy facts. Added the required source facts instead of weakening guards.
- Current-state audit initially treated every historical player as a live member.
  Retained immutable creation records, counted live memberships for capacity, and
  verified removed-player tombstones separately. A reenrollment test initially used
  a deliberately signup-disabled legacy profile; it now uses the supported raid
  profile and proves a fresh player ID while retaining the account.
- Initial UI navigation used a hidden/ambiguous Settings selector. The interrupted
  harness was corrected to navigate directly and scope assertions. Later UI checks
  exposed uncertain-status handling for an unadmitted sign-in rejection. First
  deliveries can be discarded on that named rejection; uncertain retries retain
  their IDs because an earlier request may still commit.
- Final reenrollment review found a legacy placement path based on total historical
  signups. It now chooses a vacant position from the same seeded pool; audit still
  verifies physical creation facts. The regression checks coordinate reuse with
  new player/body IDs and preserved account/other-universe membership.
- Local-account HTTP enrollment had been restricted to shared Accounts. The
  initial local reenrollment regression returned 403 because it also needed the
  existing local signup policy resolver. The route now uses that resolver and
  remains restricted to the configured local universe; shared-account policy,
  authentication, CSRF, capacity and rate limits remain enforced. Six PostgreSQL
  feature tests and all 56 HTTP adapter tests pass after this fix.
- Review identified that a promoted leader's future cleanup needed the remaining
  alliance members as scheduling dependencies. Refreshing those declarations is
  atomic with succession; a second automatic leadership transfer is tested.
- Compilation exhausted the Mac Mini's host filesystem (116 MiB free), interrupting
  PostgreSQL and its disposable-database cleanup. The affected run did not pass.
  Cleared rebuildable Rust artifacts and npm/Go/Homebrew caches, restored about
  22 GiB free, restarted Docker Desktop without a factory reset, recreated only
  this task's disposable Compose database, and reran the affected validation.

## Cleanup and limits

The disposable Compose project was `orbit-empire-deletion`; each PostgreSQL binary
used a separate database and the Make runner removed it. Final
`docker compose down --volumes` removed the task container, network, and volume
in 0.272s. Source code, personal files, shared account data, and other database
volumes were preserved. Frontend fixture servers exited after their suites. Rebuildable artifacts from
this worktree were removed with native `cargo clean` after validation, preserving
the screenshots and source manifest in `test-results/`.

Only routine/native PostgreSQL and fixture-browser validation was run. Full-system
acceptance, production-container validation, rolling deployment, and external
signup journeys were not run. Older workers do not understand the new deletion
event vocabulary; deploy this feature with a coordinated worker upgrade. Existing
35-day-inactive empires are eligible when cleanup is adopted, as documented in the
feature guide. This work has not changed any running game universe.

## PR integration — 2026-11-01

Integrated `main` at `3f59e2147f1f905bb9d63bcf2a647175038c977b` after implementation commit
`bd0327d`. The base added alliance attacks and migration 0029, so empire deletion
now uses migration 0030. Removed owners' grouped fleets are destroyed while foreign
members retain their committed shared arrival; groups with no remaining attackers
close and cancel their due event. Active invitations for a removed player are
revoked. Cleanup scopes include group participants and existing event dependencies.

The merged code/configuration snapshot relative to that base covers 60 files,
with SHA-256 `a3940a302154aeb7a2545bec49d89382d4742edc12af0e2bc0c317c91befb872` using the same path/NUL/content/NUL algorithm.
Its file list is `test-results/empire-deletion-pr-source-manifest.json`.

- `make test-server`: 630 workspace tests, 43 bridge tests and seven storage unit
  tests passed; suites 22.873s, 0.650s and 0.012s.
- `make test-db DB_SUITES='empire_deletion attack_groups' DB_JOBS=2`: six deletion
  tests and three group-attack tests passed; suites 16.623s and 45.802s. The added
  regression covers partial and complete group removal in the real scoped runtime,
  then settles the original arrival and audits the resulting state.
- `make test-tooling test-client _static`: 117 tooling tests (8.061s), 1,280 client
  tests (4.18s), formatting, lint, contracts and boundaries passed. The first tooling
  run caught raw screenshot calls; the specs now use the repository's gated helper.
- Production build and warning-free Clippy passed; Clippy 21.27s.
- Browser regression: 16 deletion/alliance-attack cases passed in 20.9s. The final
  gated screenshot run (`ORBIT_TEST_SCREENSHOTS=1`) passed all eight deletion cases
  in 9.7s and refreshed desktop/mobile captures for this implementation.

The additional group handling repairs an interaction with newly merged code;
successor nominations and other feature scope remain deferred.

## PR review repair — leadership invalidation

Addressed review comment `4436925279` on PR #297. Alliance create, transfer and
disband now increment affected leaders' view revisions and publish the existing
durable invalidation stream atomically with the source mutation. Automatic
succession also invalidates the new leader's view. No foreground presence or
gameplay time is synthesized; unchanged leadership and exact retries do not
publish extra updates. Report sharing reuses the same publication helper.

Tested on parent `11dd5b98aa410c0f9c7e679e19ff2cfcba06bd2c` plus the repair,
whose changed-code SHA-256 is `d33b5663530e586400a3aa4ec8d4fd8aee244b4f1a5b9efaaff7f514096990ad` using the path/NUL/content/NUL
algorithm above. `make test-db DB_SUITES='alliances empire_deletion report_sharing'
DB_JOBS=3` passed all 14 tests: 7 alliance (18.491s), 6 deletion (11.064s), and one
report-sharing test (3.774s). New assertions cover the published minimum revision,
both transfer participants, disband, idempotent replay, unrelated recipients,
unchanged presence, and automatic succession. Workspace Clippy passed in 5.10s.
Presentation is unchanged; the refreshed desktop/mobile screenshots remain current.

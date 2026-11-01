# Empire deletion verification — 2026-11-01

Base revision: `398aa2fafab9f8031cd584f2023aff7ddd582e01`, with the uncommitted
implementation in this worktree. Tested code/configuration SHA-256:
`2febbc22fdac340a78c5d210fe9adf0cb21246b8e7557e421b9627dffec3e5cb`.

The digest covers 58 changed code/configuration files, including untracked
implementation files. Compute SHA-256 over sorted relative paths followed by NUL,
file bytes, and NUL; enumerate tracked differences plus nonignored untracked files,
excluding `docs/`. The local file list is in
`test-results/empire-deletion-source-manifest.json`. No commit, push, PR, or deployment
was performed.

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

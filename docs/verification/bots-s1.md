# Bot server contract S1 validation — 2026-10-26

Implementation revision: `7e643406ee2a6de1ed8dc36b6f8c1f6fbe374ce5`
(`feat: add identified bot participation and machine access`), based on
`22fd8bf4b597b213f7fe396c5969339e473372e2`. Final explicit acceptance ran on
that clean implementation commit; its worktree-diff SHA-256 was the empty digest
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
This subsequent documentation-only record does not change the tested implementation.

## Checks

| Check | Result | Measured test/build phase |
| --- | --- | --- |
| `make test-server` | 425 workspace, 37 bridge, 7 storage unit tests passed | 11.118 s, 0.450 s, 0.014 s |
| Focused PostgreSQL bots binary | All 6 tests passed | 4.746 s |
| PostgreSQL setup/signup/identity/player-profiles | 4/7/1/1 tests passed | 2.584 s / 13.481 s / 3.634 s / 2.360 s |
| PostgreSQL alliances/report-sharing/migrations | 6/1/16 tests passed | 20.478 s / 3.884 s / 10.463 s |
| `npm test` | 914 tests across 94 files passed | 3.10 s |
| `npm run build` | TypeScript and production build passed | Vite 6.80 s |
| Workspace/all-target Clippy, test-support, `-D warnings` | Passed | 2.26 s |
| Rust format, ESLint, Prettier, OpenAPI generation/schema/route classifications, architecture boundaries, Git whitespace | Passed | No separate phase timing recorded |
| Final `make test-bots` | Actual pre-S1/current binaries, HTTP, worker and disposable PostgreSQL scenario passed | Previous build 24.82 s; current build 0.42 s; scenario wrapper 9.08 s |

Database binaries ran serially within separate disposable databases; Make bounded
cross-binary parallelism to two. The bot tests include independent `PgStore`
connections with the scoped executor, concurrent last-unit spending, duplicate
command recovery, ordinary construction/cancellation participation, charged deferred
engine rejection, exact sleep and rolling-window edges, negative tactical result
replay, lowered-allowance eligibility, social retries, cap/ceiling admission,
credential rotation, marked cookie accounts, existing stream closure, inactive
catalog access and credentialed public-page gates. Existing engine tests cover
ordinary presence/contact/return semantics; the engine itself was not modified.

The final acceptance used the real pre-S1 production binary from
`22fd8bf4b597b213f7fe396c5969339e473372e2`. It proved that binary starts before
migration and accepts ordinary construction, then stops it, migrates without
changing universe/epoch/rules identity, and proves pre-S1 API, worker and combined
roles fail before serving. The current worker settles the pre-upgrade paid work.
Two fresh bots receive ordinary grants, costs and public profile labels. The
scenario discards an accepted HTTP response, recovers it without duplicate work,
spends/replays tactical allowance, crosses both sleep boundaries and the exact
24-hour expiry, retires a bot, settles its paid construction without new presence,
and verifies state/receipts after process restart.

Final cumulative acceptance phases (milliseconds):

| Phase completed | Elapsed |
| --- | ---: |
| Pre-S1 server and accepted work | 2,382 |
| Migration and old-binary refusal | 4,502 |
| Provisioning and preserved old work | 5,905 |
| Growth, policy and retirement assertions | 8,449 |
| Restart and final assertions | 8,890 |
| Cleanup | 8,916 |

The exact final disposable database was `orbit_bots_1de80975dd57`. The harness
stopped its processes, dropped its database, released its port and removed its
scratch policy directory. A subsequent database inventory found no `orbit_bots_*`
databases. Native database test traps also dropped their disposable databases.
Generated Cargo artifacts remain under ignored `target/`; no production services
or databases were changed.

## Findings and repairs

- End-to-end growth exposed missing planet-specific participation in the initial
  machine adapter (`PresenceUnavailable`). Body/host/origin resolution now occurs
  inside admission, after receipt recovery, using the same engine participation
  contract. Focused tests cover construction, cancellation and scoped settlement.
- Coordinate resolution could bypass paid galaxy observation, and progression's
  fleet-quote route offered another coordinate discovery path. Resolution is now
  metered with retained positive/negative results; both quote routes require prior
  paid resolution for coordinate-addressed destinations. Ordinary body-ID quotes
  retain ordinary visibility and costs.
- Adding policy JSON alone would leave old binaries ignoring enforcement. The
  versioned relation boundary and coordinated-upgrade instructions replace that
  unsafe assumption. Real old binaries were exercised, not just mocked errors.
- Initial migration regression fixtures referenced the old relation name; updated
  their failure-injection/restore queries and reran the complete affected suites.
- The initial previous-binary builder shared Cargo outputs with the current source,
  causing stale cross-revision library artifacts. The builder now uses a separate
  target directory. Affected current-project artifacts were cleaned and rebuilt.
- Harness corrections included the normal 201 signup status, comparing quote terms
  after substituting only the distinct planet ID, hydrating the React SSR fixture's
  initial store snapshot, and using a valid-format stale hash to test deferred engine
  rejection rather than admission-level malformed input. Assertions remain intact.
- The expanded upgrade scenario initially attempted enrollment before starting the
  new worker, while pre-upgrade work was pending. That run was explicitly interrupted
  at about 164 seconds and counted as failed, not as a pass. The harness now starts
  the worker before enrollment, preserving ordinary ordering rather than bypassing
  it. The complete named acceptance target subsequently passed on the clean commit.
- Earlier compile/test fixture mistakes were repaired before final validation. No
  test deadline expired; no assertions were weakened or tests skipped for a pass.

## Boundaries

S1 is locally validated; no PR, push, merge or deployment was performed. Deployment
requires stopping all old processes/connections, backing up, migrating and starting
only the current release. Binary-only rollback is unsupported; see
[operator instructions](../operations/bots.md).

Anonymous public pages remain public. Identified bot requests obey policy, including
when credentials accompany public routes; the server cannot identify an anonymous
visitor. Retained usage/query evidence has no automated purge in S1. Bot-runner
adoption must preserve command journals and defer fresh overview after inactive
receipt recovery. S2 population maintenance/shared cleanup, S3 personality lifecycle,
lab work and strategy changes are outside this implementation.

## PR integration — 2026-10-26

Integrated main `f9ea405b3f988d20fd06e89e5f98ef9cc0e57504` for PR #163.
The only content conflict was the appended Make targets; both `test-homepage`
and the explicit bot acceptance targets were retained. The HTTP module merged
cleanly. On that combined tree, 46 transport tests passed (9.657 s), 916 client
tests passed (5.34 s), and the production web build passed (Vite 3.12 s).
`make test-bots` also passed: previous/current build phases were 29.20/15.13 s;
scenario 9.042 s and cleanup completed at 9.073 s. The disposable database
`orbit_bots_123f90c8b97a` was dropped. The tested candidate was based on `3a6fb28`
with worktree SHA-256 `72f9cff6ce6e6dd398e93a64ef65cb8fc43835dfdcf6f500079b7e32875e9eb7`;
this evidence paragraph was added afterward. Remote CI will validate the pushed
merge commit and the merge queue's integration revision separately.

## PR review repairs

Validated Bugbot threads `PRRT_kwDOVRgPYs6wV8tC` and
`PRRT_kwDOVRgPYs6wV8tN` against head `b0aedf0747fd7a655f009dde1795a3c70995e258`.
Shared-report kinds were incorrectly looked up after UUIDs had become local aliases;
the projection now localizes kinds with names and omits kinds when identity is
redacted. Human world reads unnecessarily entered the admission pool; classification
now uses the read pool, while the actual unmetered snapshot rejects a newly marked
bot's tactical read. Metered reads retain atomic admission and replay semantics.

Repair validation: 107 application/HTTP tests passed in 9.516 s, all eight focused
bot database tests passed in 6.324 s, report-sharing integration passed in 3.784 s,
and workspace Clippy passed. Tests explicitly cover an unavailable admission pool,
a held policy write lock, marking between classification and the actual snapshot,
shared-report alias joins and identity redaction. The tested diff SHA-256 was
`a9ed841067bae991f0ce729236808abf539e59c7d1d7d5dfd412fd35f30d7603` before this
paragraph was added.

The first local database attempt could not create its disposable database because
the shared Docker disk was full. Validation instead used the existing PostgreSQL
image in project `orbit-bot-pr163-review` with an isolated tmpfs data directory.
Both test databases, the container and its network were removed afterward; other
projects' images, volumes and data were untouched. Separately, CI's first browser
shard 2 runner shut down after 42 passing tests without an assertion failure; a
single-job retry was requested after the workflow finished. The repair push requires
fresh CI and review on its new revision before queue enrollment.

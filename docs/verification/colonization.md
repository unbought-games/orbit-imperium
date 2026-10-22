# Colonization validation — October 22, 2026

Implementation source: `63c9b9b4452b7e1a50b1007753b2cd545e82cebb`, based on
`cf0a8fe11b08a388cadaddcdf195dd1c7ae2e922`, on `emick/colony-ships`.
Final source: `cabe57c3d6559692c45f45662939946019c24730`, tree
`3281a55ddf8b37ff99573706544ceb08771b1cdf`.

The final source adds only a dispatch-text correction: successful deployment
ends at its destination, and return estimates are conditional. It was committed
during the final aggregate run. Server/database code, contracts, rules, scripts
and Makefile are byte-identical to the implementation revision (verified with
`git diff --exit-code`). Static checks, production build and the colony browser
workflow were then rerun on the clean final source revision. This record is a
subsequent documentation-only change; no uncommitted implementation changes
remain. No production service or beta state was changed.

## Final results

| Command / phase | Result | Measured wall time |
| --- | --- | --- |
| `make check` | Passed: 54 tooling tests, 248 client tests, 246 workspace tests, 32 bridge tests, 6 storage unit tests; clippy, formatting, lint, contracts, boundaries and production build | 150.83 s |
| Tooling execution in aggregate | 54 passed; 1 Docker packaging case explicitly excluded by the existing runner | 8.554 s |
| Client execution in aggregate | 248 passed | 4.04 s |
| Workspace / bridge / storage unit execution | 246 / 32 / 6 passed | 5.070 / 0.509 / 0.019 s |
| `make -j2 _db-colonization _db-migrations _db-bootstrap _db-world _db-rules_updates _db-signup _db-recovery` | All 46 PostgreSQL tests passed | 130.24 s |
| Colony database binary | All 4 passed | 21.290 s |
| Migration / bootstrap / world database binaries | 16 / 5 / 3 passed | 18.194 / 9.908 / 12.701 s |
| Rules / signup / recovery database binaries | 10 / 7 / 1 passed | 10.635 / 12.939 / 1.977 s |
| `npm run test:ui -- colonization.spec.ts galaxy-cards.spec.ts catalog-pages.spec.ts` | All 39 fixture browser tests passed | 44.80 s total; 42.5 s browser execution |
| Final `make _static` | Passed on `cabe57c` | 14.89 s |
| Final `npm run build` | Passed on `cabe57c` | 19.32 s; 2.35 s Vite build |
| Final `npm run test:ui -- colonization.spec.ts` | All 3 passed on `cabe57c` | 12.43 s total; 6.4 s browser execution |

Independent checks ran concurrently, so measured totals include shared-machine
and Cargo-lock contention. They are observations, not performance targets.
The production build retained existing router circular-dependency and chunk-size
warnings. No timeout or partial suite was counted as successful validation.

## Coverage

- The complete ordinary starter journey builds mines, power, storage, Robotics,
  Lab and Shipyard; researches Energy, Impulse, Espionage and Astrophysics;
  manufactures a Colony Ship; launches and establishes a colony without grants.
- Explicit shipyard/research locks, exact manufacturing charge/time, base impulse
  propulsion and mixed manifests, fuel/cargo accounting, recall, one-ship terminal
  success, escort/extra-ship return, transport and owned deployment.
- All positional field-weight boundaries, certified artifact SHA-256 and row
  totals, exact RNG/generation/cursor vector, all temperature envelopes and integer
  diameter relationships. The offline generator uses rational interval bounds.
- Occupied and invalid targets, position gates, launch at full count capacity,
  current arrival capacity, capacity gained in flight, competing owners/locations
  and same-owner arrivals. No reservation or extra random draw on failed arrival.
- Database player/location claim exclusion; signup competing for the last eligible
  position; retry-safe enrollment; legacy frontier allocation and manifest audit
  after colonies exist.
- Atomic rollback after staged writes, stale-worker fencing and takeover,
  serialized state/input replay, duplicate commit, reconnect/reopen, preserved
  origin/colony identities and exact ship/cargo/asset lineage.
- Additive activation for an existing account and initialization of a later signup;
  immutable retained rules; disabled new launches with accepted flights still
  resolving; schema upgrade from the actual previous migration bundle, old-writer
  compatibility, no startup population backfill and no private-state slot-token
  changes.
- Owner-only colony metadata and private inventories, public galaxy occupancy,
  generated protocol-4 contracts, empty-position resolver/quote/launch, report
  links and usable body routing. Browser tests cover 320, 390, 768 and 1440 px,
  reload without duplicate launch, full-cap warning and locked-position reasons.

## Failures found and corrected

- An early engine continuation test returned `PolicyUnavailable` when targeting
  the newly created colony. In-memory ChangeSet application was missing the new
  body's collection-head metadata. Added that metadata and reran the affected
  journeys, then the complete workspace suite. The failed native test run executed
  16/32 cases before fail-fast, in 0.838 s; that partial run was not a pass.
- The initial database test helper used `unwrap_err()` on a success type without
  `Debug`; corrected the helper and its unused import before execution.
- PostgreSQL rejected a successful one-ship arrival with `mission_leg_valid`.
  Migration 13 now admits Colonized/Deployed while preserving validation of new
  writes and avoiding a historical table scan. That failed test run took 5.647 s
  of native execution; the entire affected binary and migration suite were rerun.
- Clippy rejected three nested conditionals; corrected them without allowances.
  The final aggregate and final static checks pass.
- Review found legacy admission/audit assumptions that every planet was a
  homeworld. Added occupancy-aware legacy frontier allocation and separate colony
  audit accounting, with parity and real PostgreSQL regressions.
- One early nextest run emitted a `LEAK` diagnostic for the pure weight-boundary
  test. Subsequent focused runs and the final full run emitted none. No runner
  deadline or assertion was relaxed.

## Isolation, cleanup and limits

Database tests used disposable Compose project `orbit-colonization-validation`,
with an automatically allocated localhost PostgreSQL port, `55308`. Each native
binary used a fresh `orbit_test_*` database and serial tests through
`scripts/test-db.sh`; the script dropped its database after success or failure.
A final catalog query returned no remaining test databases. The project container,
network and volume were removed with:

```sh
COMPOSE_PROJECT_NAME=orbit-colonization-validation docker compose down --volumes --remove-orphans
```

Cleanup completed successfully in 0.72 s. A subsequent project-label container
query returned no containers. The browser runner shut down its Vite/browser
processes. No shared or production database was reset.

Logs remain in `/tmp/orbit-colony-final-{check,db,ui,static,build,colony-ui}.log`
and `/tmp/orbit-colony-cleanup.log`. Browser screenshots/results are ignored local
artifacts under `test-results/`.

Not run: full-system acceptance, actual process-recovery harness, rolling release
validation, production-container validation, live signup or live colonization,
and the unselected PostgreSQL binaries. Native database fault/reopen tests and
fixture browser tests do not claim those explicit-only checks passed. Physical
mobile devices and screen-reader testing were not performed.

See [the rollout plan](../operations/colonization.md) for the sole beta universe,
release and activation commands, compatibility, validation and recovery steps.

## PR #23 CI stack-overflow correction — October 22, 2026

[CI run 39800731273](https://github.com/unbought-games/orbit-imperium/actions/runs/39800731273)
failed on published revision `6089ebb19968aa6abdec729393e649f906ceca01`.
Build/lint/unit and fixture browser checks passed. The PostgreSQL `world` binary
aborted in `paired_admission_rejected_gameplay_restart_and_passive_reads` with
SIGABRT after 8.547 s: its test thread overflowed the stack. This was a failed
run, not a gameplay assertion failure or execution deadline.

Fix source: `eadb94f564a2a62843c67ff50398262a4cd525ad`. The long async test now
executes seven sequential, heap-backed scenarios. Each scenario drops its local
snapshots before the next while retaining the same database history, bindings,
connection pools, assertions, ordering and functional timeout checks. Production
code, CI configuration, test deadlines and default thread-stack settings are
unchanged. Clippy's additional `large_futures` check passes as well.

The original test also reproduced the overflow locally with a 1 MiB thread
stack. An initial coarser split still overflowed at that size; the final smaller
scenario boundaries pass. This stress setting was used only for diagnosis and
verification, and was not added to CI or repository configuration.

Validation on the clean fix revision:

| Command | Result | Measured wall time |
| --- | --- | --- |
| `RUST_MIN_STACK=1048576 make _db-world` | All 3 tests passed; formerly failing journey 7.067 s | 16.32 s total; 11.963 s native test execution |
| `cargo clippy -p orbit-storage-postgres --test world --features test-support -- -D warnings -D clippy::large_futures` | Passed | 1.50 s |
| `cargo fmt --all --check` and `git diff --check` | Passed | Not separately timed |

A normal-stack run also passed before the final redundant-borrow lint cleanup.
The published Linux rerun is tracked by [PR #23's checks](https://github.com/unbought-games/orbit-imperium/pull/23/checks).

Tests used disposable Compose project `orbit-colony-ci-fix`, localhost port
55309, with per-binary serial disposable databases. The temporary debugger
database was dropped, and a final query found no remaining test/debug databases.
The project's container, network and volume were removed successfully. Logs are
`/tmp/orbit-ci-stack-{before,small,final,default,clippy-final,cleanup}.log`.
No shared or production database was changed.

The initial fix push was blocked from starting PR CI by a concurrent `main`
update. Merge commit `33ee6ae5283d76e4a2c1bd974d5eede79fa1fd28` incorporates
`cd92b508c03507ef0ac2910dae892c648b7434da`, including the Empire overview and
unbought-auth 0.1.3. Conflict resolution keeps both browser suites and displays
colony diameter/temperature in the new Empire dossier; the removed overview was
not restored. An Empire browser assertion verifies those colony attributes.

Validation on that clean merge revision: `make check` passed in 96.91 s (253
client tests, 246 workspace tests, 32 bridge tests, 6 storage unit tests, tooling,
clippy/static checks and production build). The 1 MiB `make _db-world` run passed
all 3 tests in 33.09 s total / 14.849 s test execution. The colony and Empire
browser suites passed all 7 tests in 10.11 s total / 7.1 s browser execution.
The recreated disposable project used port 55312; no test databases remained,
and its container, network and volume were removed successfully afterward.
Logs: `/tmp/orbit-ci-merge-{check,db,ui,cleanup}.log`. These documentation additions
do not change the tested implementation.

## Requested rebase and force-push — October 22, 2026

Rebased the feature commits onto main revision
`a899fb5dd55aca47146118dcbcef28eef2beb901`. The prior published head was
`adbe4d3e340d3fb73179f3cd661ff479f5c3fbd7`; its CI was green. The rebase retains
the async-stack fix and the Empire colony attributes, incorporates public player
names and current dispatch validation, and combines all browser suite selections.
The occupied-position explanation now goes through the shared dispatch error
mapper, covered by unit and fixture-browser regressions. The immutable colony
rules, generation implementation, persistence helper and migration are unchanged
from the previously tested branch.

Exact clean source tested after rebase:
`9577e5397cb156deafabed96c0893353c7378612`.

| Command | Result | Measured wall time |
| --- | --- | --- |
| `make check` | Passed: tooling, 311 client tests, 250 workspace tests, 32 bridge tests, 6 storage unit tests, clippy/static checks and production build | 135.29 s |
| `npm run test:ui -- colonization.spec.ts dispatch-validation.spec.ts galaxy-cards.spec.ts empire.spec.ts` | All 20 passed | 24.97 s total; 22.0 s browser execution |
| `make -j2 _db-colonization _db-world _db-public_player_names` | All 8 passed, including the previously overflowing world journey | 32.47 s total |

Docker was initially stopped, so the installed Docker Desktop was started for
these checks. PostgreSQL ran only in disposable Compose project
`orbit-colony-rebase`, allocated port 55000. Native runners removed their test
databases; a final query found none remaining. The project's container, network
and volume were then removed successfully. No production/shared database or
runner limit was changed. Logs remain in `/tmp/orbit-rebase-{check,ui,db,cleanup}.log`.

This entry is documentation-only after the tested source. The force-push uses
an explicit lease against the prior published head; a local recovery branch,
`emick/colony-ships-before-rebase`, retains that history. Published CI results are
tracked by PR #23's checks for the new commit rather than inherited from the old
head.

# Sensor Phalanx foundations verification — 2026-11-03

Base: `cfe36bccf8d80c77ed2897cb3e2a0bcde74aeb6c`.
Local branch: `emick/sensor-phalanx-foundations`.
Tested source SHA-256:
`2a78b174420be5bf6f2e929882aa47ba543abdc305dd7d1393480d32ba2c8364`.

The digest covers the 21 changed code/configuration files, including new files,
excluding `docs/`. Hash sorted relative paths followed by NUL, file bytes, and NUL.
The manifest and logs are retained locally under ignored
`test-results/sensor-phalanx/validation/`. The final documentation records this
working-tree digest; source was not changed after the final relevant checks.

## Passing checks

- `make test-phalanx`: 222 engine unit/mission/projection/persistence/debris checks
  and 87 application unit checks passed. Preparation: 6.35s and 5.05s; execution:
  5.682s and 0.181s; total wall time: 22.61s. No runner-lock wait was reported in
  this final run.
- `make test-db DB_SUITES='mission_return_reason world' DB_JOBS=2`: two migration
  tests and three existing world persistence tests passed. Preparation: 7.92s;
  suites: 7.523s and
  13.870s; total wall time including preparation/setup/cleanup: 24.91s.
  Make owned concurrency, each binary used its own disposable database and tests
  within each binary ran serially. The two runner startups reported Cargo cache/
  build lock waits, which were not measured separately.
- The earlier `make test-db DB_SUITES='mission_return_reason world_edit'` passed
  both migration tests and all 11 scenario-editor tests. Preparation: 17.41s;
  suites: 6.776s and 269.856s. The final migration tests additionally cover explicit
  editor recall causes, exported causes, the bound-world loader and reopening
  storage. The final engine library run covers editor shape validation.
- `cargo clippy --workspace --all-targets --features orbit-server/test-support -- -D warnings`:
  passed; 27.70s Cargo time / 27.82s total wall time.
- `make _static`: rustfmt, ESLint, Prettier, generated contracts and workspace/browser
  boundaries passed; 14.41s wall time. `git diff --check` passed.

Database setup used the repository's pinned PostgreSQL 16.10 image in a dedicated
`orbit-phalanx-foundations` Compose project, with host port 55439. Each database
runner removed its disposable database. After all suites, no `orbit_test_%`
databases remained; the dedicated container, volume and network were removed (0.33s cleanup).
Setup was not timed separately. No queue/merge time applies: no push or PR was
requested or performed. No full-system, acceptance, production-image validation,
UI change or screenshot capture was performed.

## Failures and repairs

1. Initial test invocation named a nonexistent engine `world_edit` test binary.
   Cargo rejected the command before running tests. The Make target was corrected;
   editor integration ran in its actual PostgreSQL binary.
2. The first focused suite ran 17 of 171 tests: 16 passed and
   `historical_replay_keeps_stale_event_hashes_and_rejects_inconsistent_counters`
   failed. The new replay helper used mutable JSON indexing, which inserted an
   absent `world` object on a historical no-op. Inspected this test's Git history;
   no separate Test Czar repair ledger was found in the available repository,
   documentation or skill files. One repair replaced indexing with `pointer_mut`,
   which does not create missing fields. Both replay adapters use the same helper;
   their deterministic replay tests passed on the repaired and final runs. No
   assertions, tests, timeouts or retries were weakened or removed.
3. Initial Docker setup failed because default address pools were exhausted.
   Read existing network allocations, then gave only the disposable Compose
   project an unused explicit subnet through a local temporary override. Existing
   networks and services were not changed. The next setup succeeded.

The editor export and Terraformer round-trip tests reported slow execution
(70.358s and 77.505s) and passed without timeout changes or retries. Early build
commands contended for Cargo locks; their wait was not measured separately. Final
reported wall times include any runner overhead. No failed attempt is counted as
successful validation.

## Coverage and remaining boundaries

Deterministic tests exhaust enabled mission/phase/endpoint visibility, exact
ship disclosure, local fuel/range/actor policies, equal endpoints, ACS delayed
arrival and independent return durations, hold extensions, future home fallback
privacy, colonization binding, missile disclosure, overflow, and hidden/empty
serialized equivalence. Engine transitions cover recalled and invalid-target
Deploy, inline recall, restart, terminal return, legacy replay and deleted-host
hold returns. Persistence tests exercise exact journal classification, unchanged
terms/deadlines/revisions/journals, missing/stale/conflicting evidence rollback,
storage constraints, fixture/export causes and fresh-connection loading.

The building stays disabled. Paid command/loading/ordering/atomic charge and report
storage are part 2; UI and activation are part 3. Production retained history was
not accessed. Migration deliberately blocks an active returning deployment
without conclusive journal evidence; quiesce pre-cause writers before upgrading.
Destroyed-moon endpoint fallback is a documented future integration boundary.
See [the integration contract](../architecture/sensor-phalanx.md).

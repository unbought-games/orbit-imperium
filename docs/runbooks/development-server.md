# Development server operations

The same release binary runs locally and in the container. PostgreSQL stores every authoritative checkpoint, ordered input, operation, report, receipt and journal entry. Application disks are disposable. `db-init` prepares schema and `universe create` explicitly creates a production world before serving. `serve` applies compatible pending SQLx migrations and validates existing worlds. It never creates player accounts or resets retained gameplay. Explicit seed/bootstrap commands are test-only and prepare schema before creating fixture data.

## Initialize and operate locally

Follow the [local setup instructions](../development.md#running-locally). Compose uses `orbit` for the local database username, password, and name, with PostgreSQL bound to `127.0.0.1:55432`. Set `ORBIT_DB_PASSWORD` to override the password. Create player accounts through the browser.

`make dev` serves on localhost:8080; stop with Ctrl-C. It retains state. The independent Vite proxy on localhost:5173 requires `ORBIT_ORIGIN=http://localhost:5173` on the backend. `make test-db`, `make test-migrations`, `make test-e2e` and `make test-recovery` create and delete only their own disposable databases. Test time and commit barriers exist only behind the `test-support` Cargo feature; production images do not enable it.

`make dev-reset` recreates this checkout’s playground with the current standard rules. For operator editing and explicit replacement, use [world management](../operations/world-management.md). The old binary `dev-reset` and `dev-seed` commands are retired. Do not reset retained data to troubleshoot an ordinary restart.

## Fresh database cutover

The earlier fresh-baseline release squashed the previous migration chain into `0001_fresh.sql`, which creates the final schema directly. It contains no data conversions or backfills. That historical cutover intentionally restarted the game with an empty database; pre-baseline SQLx checksums and legacy schemas are rejected without modification. The concurrent-runtime upgrade retains databases already on this baseline: use the online preparation and scoped activation below, not a reset.

1. Stop every old application instance and worker connected to the game database.
2. Retain a backup if the previous game is needed for reference or rollback, then explicitly recreate the exact game database. For disposable local development, `make db-destroy db-up` removes the local database volume and creates a new one. For hosting, recreate only the selected game's database or dedicated volume using the deployment's database procedure.
3. Run `orbit db-init`, then `orbit universe create --universe UUID` against that empty database. Start the server and create new accounts for the restarted game. This is the historical baseline cutover, separate from the additive [universe configuration bridge upgrade](../operations/universe-configuration.md).
4. Verify `/health/ready` and signup/login before restoring traffic.

`make dev-reset` only replaces the local playground and cannot perform this cutover. Do not delete migration ledger rows or edit their checksums to bypass the reset. Older binaries cannot use the fresh database; rollback requires restoring the old database and its matching binary together. Future migrations start after this new baseline and must be reviewed for compatibility as usual.

## Hosted server operation

Set `ORBIT_ORIGIN` to the browser-facing origin. HTTPS always uses Secure cookies, including behind a TLS-terminating proxy. HTTP requires `ORBIT_ALLOW_INSECURE_HTTP=1`; remove the retired `ORBIT_LOCAL_INSECURE` key. See the [origin and migration guidance](../architecture/deployment.md#browser-origin-http-and-https).

Use the [deployment guide](../architecture/deployment.md) for hosting requirements and the [universe configuration guide](../operations/universe-configuration.md) for explicit database initialization and world creation. Ordinary deploys never reseed or reset a universe.

Keep the scheduler running when all browsers close. Start the database before the application. Stopping does not pause logical time; on restart, workers process overdue work in canonical order while APIs serve committed snapshots.

`/health/live` says only that the HTTP process runs; `/health/ready` checks storage and structural compatibility independently of backlog. A blocked universe needs investigation of `universe_runtime.blocked` and its head, not removal of the head. Never skip a corrupt input.

## Migration operation

The application role needs DDL privileges in the existing target database. SQL lives in immutable numbered files embedded at build time, and `_sqlx_migrations` records application and checksums. SQLx's lock coordinates migration runners independently from world-reset locks. A migration and its ledger entry commit together; failure rolls back that step and the new instance exits. Older compatible instances keep serving. Startup/readiness never runs down migrations or repairs changed checksums.

Migration sessions enable PostgreSQL `client_connection_check_interval=1s` so the Linux PostgreSQL host detects a disconnected migrator even while SQL is blocked; the application pool is unaffected. This socket check is supported on Linux, macOS and BSD-family hosts, not every PostgreSQL platform. Network partitions may still require host TCP keepalive policy. See [PostgreSQL connection checks](https://www.postgresql.org/docs/16/runtime-config-connection.html#GUC-CLIENT-CONNECTION-CHECK-INTERVAL).

Keep migration SQL short and backward compatible with the previous deployed binary. DDL can briefly wait on table locks even when the schema change is compatible. Use staged changes for representation changes, and keep long backfills outside startup. A previous baseline-managed binary accepts later migration entries but still checks its own checksums. This does not guarantee compatibility with arbitrary older releases or upgrade world rules.

Allow readiness checks to accommodate schema preparation; an instance exposes no ready HTTP endpoint while preparing schema. Multiple existing hosts permit rolling availability; a single host still has a restart window. World bootstrap/reset remains an explicit operator action, with stopped servers required for initial MVP creation. The scheduler discovers worlds at startup.

## Retention and teardown

Stop/start and database deletion are distinct. Back up retained data before explicitly deleting a development volume. The local `make db-destroy` command deletes the Compose database volume and all data in it; use it only for a disposable development database.

## Limits

The test suite demonstrates slice correctness, not 1,000 concurrent players, production capacity, recovery from volume loss, or a public competitive launch. Database backup/restore drills, stronger operational monitoring and abuse controls remain full-launch work. The squashed SQLx baseline requires a fresh database, including for prior SQLx installations; legacy databases are never converted or deleted automatically. Subsequent migrations preserve data; rolling upgrades require compatibility with the previous deployed release. The fresh database cutover above is an intentional game restart. Same-version and compatible-upgrade durability are required and tested.

Operational request budgets are configured with `ORBIT_LOGIN_PER_MINUTE` (default 30 per source and normalized account, with a process-wide ceiling ten times larger) and database-owned `commands_per_minute` (default 60 per player/universe), edited through `universe config export/diff/apply`. Argon2 work is bounded to two simultaneous verifications per process with no waiting queue; rate-limit responses consistently include `Retry-After`. Source/account maps expire after one minute and are capped at 4096 entries each. Sources use the actual socket peer. Forwarded client-IP headers are ignored, so clients behind the same reverse proxy share its IP-based request budget. Unknown and wrong-password login responses are identical. Password hashing uses Argon2id m=19456 KiB, t=2, p=1; sessions expire after eight hours and are revoked on logout.


## Concurrent runtime development

`make dev` uses the combined role. For separate processes, build with `cargo build -p orbit-server`, then use the same `DATABASE_URL` with `ORBIT_ROLE=api` and `ORBIT_ROLE=worker` in separate terminals. The worker has no public game listener. API and worker memory are independent; PostgreSQL carries orders, leases, outcomes, and notification replay. Stop them with Ctrl-C to drain, or rely on durable lease recovery after an unexpected process loss.

For an existing database before the first runtime upgrade, prepare the indexes with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/prepare-runtime-indexes.sql`. This is separate from startup. Once all processes run the bridge, use the built binary's `runtime prepare --universe UUID` and `runtime activate --universe UUID` commands. Repeating either completed operation is safe. Do not reset the world to enable concurrency.

Set `ORBIT_METRICS_BIND=127.0.0.1:9091` on a local process to inspect its metrics privately; choose a different metrics port for a second local process. No metrics listener is opened when unset. Readiness stays independent of backlog. Pool and CPU configuration, repair constraints, and the production connection budget are in the [concurrent runtime runbook](../operations/concurrent-runtime.md).

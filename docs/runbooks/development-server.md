# Development server operations

The same release binary runs locally and in the container. PostgreSQL stores every authoritative checkpoint, ordered input, operation, report, receipt and journal entry. Application disks are disposable. `db-init` prepares schema and `universe create` explicitly creates a production world before serving. `serve` applies compatible pending SQLx migrations and validates existing worlds. It never creates player accounts or resets retained gameplay. Explicit seed/bootstrap commands are test-only and prepare schema before creating fixture data.

## Initialize and operate locally

Follow the [local setup instructions](../development.md#running-locally). Compose uses `orbit` for the local database username, password, and name, with PostgreSQL bound to `127.0.0.1:55432`. Set `ORBIT_DB_PASSWORD` to override the password. Create player accounts through the browser.

`make dev` serves on localhost:8080; stop with Ctrl-C. It retains state. The independent Vite proxy on localhost:5173 requires `ORBIT_ORIGIN=http://localhost:5173` on the backend. `make test-db`, `make test-migrations`, `make test-e2e` and `make test-recovery` create and delete only their own disposable databases. Test time and commit barriers exist only behind the `test-support` Cargo feature; production images do not enable it.

`dev-reset --universe EXACT_UUID --at UNIX_MS` requires all application processes stopped and a development-marked universe. It preserves neither old epochs nor old sessions. It deletes and reseeds the exact universe in one transaction, and refuses while any server holds the shared operator lock. Credentials come from `ORBIT_SEED_PASSWORD_FILE`. Do not reset an existing database to troubleshoot an ordinary restart.

## Fresh database cutover

The earlier fresh-baseline release squashed the previous migration chain into `0001_fresh.sql`, which creates the final schema directly. It contains no data conversions or backfills. That historical cutover intentionally restarted the game with an empty database; pre-baseline SQLx checksums and legacy schemas are rejected without modification. The concurrent-runtime upgrade retains databases already on this baseline: use the online preparation and scoped activation below, not a reset.

1. Stop every old application instance and worker connected to the game database.
2. Retain a backup if the previous game is needed for reference or rollback, then explicitly recreate the exact game database. For disposable local development, `make db-destroy db-up` removes the local database volume and creates a new one. For hosting, recreate only the selected game's database or dedicated volume using the deployment's database procedure.
3. Run `orbit db-init`, then `orbit universe create --universe UUID` against that empty database. Start the server and create new accounts for the restarted game. This is the historical baseline cutover, separate from the additive [universe configuration bridge upgrade](../operations/universe-configuration.md).
4. Verify `/health/ready` and signup/login before restoring traffic.

`dev-reset` only resets a world and cannot perform this cutover. Do not delete migration ledger rows or edit their checksums to bypass the reset. Older binaries cannot use the fresh database; rollback requires restoring the old database and its matching binary together. Future migrations start after this new baseline and must be reviewed for compatibility as usual.

## Dedicated Fly development deployment

Use organization `personal`, region `ewr`, a dedicated application and a separate dedicated PostgreSQL app. The selected development option is one self-managed PostgreSQL 16 Machine (256 MB) with a 1 GB encrypted persistent volume and one application Machine (512 MB). This avoids a managed-database minimum for disposable development. It is not a competitive-launch backup/availability plan.

The October 2026 published rates imply roughly $6/month if these two Machines run continuously, before egress and other account usage; time while running is prorated and volumes remain billable while stopped. Managed Postgres is a separate alternative starting at $38/month plus storage. [Fly pricing update](https://fly.io/pricing-update/).

1. Create exact new app names with `fly apps create NAME --org personal`. Do not reuse another project's app.
2. Import a generated `POSTGRES_PASSWORD` using `fly secrets import --app DB_APP` via stdin. Never include secret values in Git, command arguments or logs.
3. Create `orbit_pgdata` with `fly volumes create orbit_pgdata --app DB_APP --region ewr --size 1`. Deploy `deploy/postgres.fly.toml` with `--ha=false --strategy immediate`. No public database service/IP is configured.
4. Import application secrets: `DATABASE_URL=postgres://orbit:PASSWORD@DB_APP.internal:5432/orbit`, `ORBIT_ORIGIN=https://APP.fly.dev`. HTTPS always uses Secure cookies; no HTTP opt-in is needed. Remove the retired `ORBIT_LOCAL_INSECURE` key if present.
5. Build the production image, then run `orbit db-init` and `orbit universe create --universe UUID` from an operator host/container with access to the dedicated database. Follow the exact [universe setup and retained-world bridge commands](../operations/universe-configuration.md); a final server cannot start against an empty database or a world without policy.
6. Deploy with `make fly-deploy FLY_APP=APP`, retaining `ORBIT_UNIVERSE_ID` when multiple worlds exist. Restart workers after adding a universe before routing signup. Create accounts through the browser. Ordinary deploys never reseed or reset.
7. Verify `/health/ready`, then run `scripts/hosted-smoke.mjs` with the URL, credential file and exact application Machine ID. The smoke uses real login forms and a real application restart.

The application configuration disables traffic-based autostop and autostart. The scheduler must keep running when all browsers close. Stop explicitly with `fly machine stop ID --app APP`; start with `fly machine start ID --app APP`. Start the database before the application. Stopping does not pause logical time. On restart the worker drains overdue heads in `(time, phase, sequence)` order before returning a fresh overview.

Use `fly machine list --app APP`, `fly status --app APP`, `fly checks list --app APP`, and `fly logs --app APP` for diagnosis. `/health/live` says only that the HTTP process runs; `/health/ready` fails for storage/schema/blocking invariants. Repeated `503` during downtime catch-up is expected briefly. A blocked universe needs investigation of `universe_runtime.blocked` and its head, not removal of the head. Never skip a corrupt input.

## Migration operation

The application role needs DDL privileges in the existing target database. SQL lives in immutable numbered files embedded at build time, and `_sqlx_migrations` records application and checksums. SQLx's lock coordinates migration runners independently from world-reset locks. A migration and its ledger entry commit together; failure rolls back that step and the new instance exits. Older compatible instances keep serving. Startup/readiness never runs down migrations or repairs changed checksums.

Migration sessions enable PostgreSQL `client_connection_check_interval=1s` so the Linux PostgreSQL host detects a disconnected migrator even while SQL is blocked; the application pool is unaffected. This socket check is supported on Linux, macOS and BSD-family hosts, not every PostgreSQL platform. Network partitions may still require host TCP keepalive policy. See [PostgreSQL connection checks](https://www.postgresql.org/docs/16/runtime-config-connection.html#GUC-CLIENT-CONNECTION-CHECK-INTERVAL).

Keep migration SQL short and backward compatible with the previous deployed binary. DDL can briefly wait on table locks even when the schema change is compatible. Use staged changes for representation changes, and keep long backfills outside startup. A previous baseline-managed binary accepts later migration entries but still checks its own checksums. This does not guarantee compatibility with arbitrary older releases or upgrade world rules.

Fly's startup check grace is 60 seconds. Review that interval before introducing a longer migration; an instance exposes no ready HTTP endpoint while preparing schema. Multiple existing hosts permit rolling availability; a single host still has a restart window. World bootstrap/reset remains an explicit operator action, with stopped servers required for initial MVP creation. The scheduler discovers worlds at startup.

## Retention and teardown

Stop/start and destroy are distinct. Stopped Machine root filesystems and retained database volumes can still cost money. `make fly-destroy FLY_APP=EXACT_APP` removes only that named app and its app-owned resources; a separately named database remains. Database teardown is a separate deliberate operation. Back up desired fixtures before explicitly deleting a development volume. No teardown should name an unrelated app.

## Limits

The test suite demonstrates slice correctness, not 1,000 concurrent players, production capacity, recovery from volume loss, or a public competitive launch. Database backup/restore drills, stronger operational monitoring and abuse controls remain full-launch work. The squashed SQLx baseline requires a fresh database, including for prior SQLx installations; legacy databases are never converted or deleted automatically. Subsequent migrations preserve data; rolling upgrades require compatibility with the previous deployed release. The fresh database cutover above is an intentional game restart. Same-version and compatible-upgrade durability are required and tested.

Operational request budgets are configured with `ORBIT_LOGIN_PER_MINUTE` (default 30 per source and normalized account, with a process-wide ceiling ten times larger) and database-owned `commands_per_minute` (default 60 per player/universe), edited through `universe config export/diff/apply`. Argon2 work is bounded to two simultaneous verifications per process with no waiting queue; rate-limit responses consistently include `Retry-After`. Source/account maps expire after one minute and are capped at 4096 entries each. Sources use the actual socket peer by default. The Fly config explicitly allows the observed proxy socket peer with `ORBIT_TRUSTED_FLY_PROXIES=172.19.0.129` to supply Fly-Client-IP. This exact gateway was verified from the dedicated Machine's `/proc/net/tcp`; verify it after hosting/network changes. Arbitrary Internet peers and X-Forwarded-For are never trusted. Leave this comma-separated IP allowlist empty on a direct/local deployment. [Fly HTTP headers](https://fly.io/docs/networking/services/). Unknown and wrong-password login responses are identical. Password hashing uses Argon2id m=19456 KiB, t=2, p=1; sessions expire after eight hours and are revoked on logout.


## Concurrent runtime development

`make dev` uses the combined role. For separate processes, build with `cargo build -p orbit-server`, then use the same `DATABASE_URL` with `ORBIT_ROLE=api` and `ORBIT_ROLE=worker` in separate terminals. The worker has no public game listener. API and worker memory are independent; PostgreSQL carries orders, leases, outcomes, and notification replay. Stop them with Ctrl-C to drain, or rely on durable lease recovery after an unexpected process loss.

For an existing database before the first runtime upgrade, prepare the indexes with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/prepare-runtime-indexes.sql`. This is separate from startup. Once all processes run the bridge, use the built binary's `runtime prepare --universe UUID` and `runtime activate --universe UUID` commands. Repeating either completed operation is safe. Do not reset the world to enable concurrency.

Set `ORBIT_METRICS_BIND=127.0.0.1:9091` on a local process to inspect its metrics privately; choose a different metrics port for a second local process. No metrics listener is opened when unset. Readiness stays independent of backlog. Pool and CPU configuration, repair constraints, and the production connection budget are in the [concurrent runtime runbook](../operations/concurrent-runtime.md).

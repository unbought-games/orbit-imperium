# Development deployment and Fly.io

This guide describes the repository’s Fly.io deployment examples and the server’s hosting requirements. The server manages backward-compatible schema migrations during startup and supports rolling deployments. The game also runs on other container hosts with PostgreSQL; these examples do not prescribe the official hosting platform.

## Production and development roles

Production uses separately replicated API and worker OS processes sharing PostgreSQL, with scoped chronological ownership rather than one universe-wide gameplay writer. The same image supports `ORBIT_ROLE=api|worker|combined`; combined is the development default. Use the [concurrent runtime runbook](../operations/concurrent-runtime.md) for the retained-world cutover, connection budget, private metrics, and durability requirements. The example production templates are configuration, not a measured capacity claim or provisioned resources.

Fly Managed Postgres is the simplest supported Fly database option operationally; it offers backups, recovery and high availability. Provisioning and costs are separate from the application. Select the database plan at deployment time; no resources have been provisioned by this document. A disposable self-managed PostgreSQL container with a persistent Fly Volume is an alternative for development if lower running cost is more important than managed operations. Standard PostgreSQL connectivity keeps that choice outside the engine. [Managed Postgres](https://fly.io/docs/mpg/)

Package the same application image for local development, Fly and other container hosts. Fly-specific configuration belongs in deployment files, not engine rules, database entities or public protocol types. Environment variables provide process configuration such as `ORBIT_BIND`; database credentials belong in deployment secrets. Universe creation and admission policy belong to the database and explicit CLI. See the [configuration rollout](../operations/universe-configuration.md) before upgrading retained worlds. Supply a health/readiness endpoint and graceful shutdown that stops admission and safely finishes or abandons the active claim.

## Explicit server lifetime

From the `orbit-imperium` directory, use:

```sh
make fly-launch FLY_APP=your-game-app FLY_ORG=your-org FLY_REGION=your-region
make fly-deploy FLY_APP=your-game-app
make fly-destroy FLY_APP=your-game-app
```

Launch creates the app and deploys it; deploy updates an existing app. Both use `Dockerfile` and `deploy/fly.toml`. Launch does not automatically provision PostgreSQL or other add-ons. Configure the separate database and required app secrets before a healthy game deployment is possible. The development template defaults to `FLY_HA=false` and rolling replacement. The marked API/worker production templates require `FLY_HA=true`, which permits spare Machines; verify actual replica counts. Multiple existing hosts can retain availability during deployment, while a single host still has a restart window. `FLY_ORG` and `FLY_REGION` are optional launch arguments; `FLY_APP` is always required.

Destroy permanently deletes the explicitly named Fly app and its app-owned resources without an additional prompt. It is not a stop command. A separate PostgreSQL app or managed database is not deleted; it must be managed separately. For an ordinary development shutdown, stop the app's Machines instead of destroying the app. The `FLY` and `FLY_CONFIG` variables can override the CLI executable and config path.

For a combined API/scheduler Machine, use `auto_stop_machines = "off"` and `auto_start_machines = false`. Operate it explicitly with start/stop commands during testing. Request-driven sleeping is unsuitable for an active universe: due events must resolve without a browser request. Fly's default launch configuration enables traffic-based stopping, so override it deliberately. [Autostop and autostart](https://fly.io/docs/launch/autostop-autostart/)

Stopping an app process does not implicitly pause game time or reset the database. If retained state is resumed, serve committed snapshots immediately while workers process overdue work in canonical order. Starting a new test run can instead explicitly recreate and seed a disposable universe. A deliberate test pause, if later needed, must be an explicit test-clock feature; do not infer it from process downtime or carry it into competitive play.

Store durable data in PostgreSQL, not the app Machine's ephemeral root filesystem. Self-managed PostgreSQL requires persistent storage. Fly Volumes are local to a host and do not provide database replication by themselves. [Volumes](https://fly.io/docs/volumes/overview/)

## Development schema and rules changes

The SQLx migration baseline is created automatically by `serve` and explicit seed/bootstrap commands. The database itself must exist. There is no release initializer. New instances first inspect migration history without a migration lock. Only pending schema work acquires SQLx's migration lock, rechecks history, and applies bounded transactional migrations before HTTP and scheduling; old instances continue serving. Existing-world validation and readiness use metadata reads without the gameplay gate. Production universes require explicit `db-init` and `universe create` before serving; startup never provisions worlds. Population-dependent backfills and game-state conversions are explicit maintenance operations, not startup migrations. Applied SQL and checksums are immutable and tracked in `_sqlx_migrations`.

This first release intentionally rejects legacy schema-1 through schema-5 databases unchanged. Use a fresh database for that cutover. Later migrations preserve data and must support the previous deployed release, including an older server restarting against a later compatible migration tail. Game configurations remain independently selected per universe; startup validates the saved catalog rather than comparing it with bundled MVP bytes. It checks required singleton state but does not audit player collections or historical records. See the [startup and audit contract](../operations/rules-updates.md#fast-startup-and-explicit-integrity-inspection) for failure behavior and deadlines. No automatic reset, downgrade, or legacy conversion is supplied.

Same-version durability remains part of the first end-to-end slice: refresh/reconnect, duplicate requests, concurrent resource spending, interrupted transitions, due-job recovery and restart must behave correctly. A disposable world is not permission to keep authoritative state only in memory.

Normal operation supports rolling deployments across N instances sharing PostgreSQL. Complete the rollout before using `orbit rules apply` to activate content; there is no capability registry. Deploying code or migrating the schema does not change the selected universe configuration. In scoped mode the update is a durable global ordering boundary; admission and committed reads continue while it waits. Legacy serial mode retains its idle-boundary compatibility behavior. Job/flight commitments are preserved. See [operator instructions](../operations/rules-updates.md).

Speed can change at an ordered rules boundary while paid work retains its original terms. The rules-update command preserves topology and protocol family; structural changes need their own implemented transition. Ordinary configuration/content updates do not require a reset.

## Before competitive launch

Choose and exercise backup/restore, migration recovery, monitoring and an operational shutdown/recovery procedure before promising persistent player progress. Rolling schema compatibility does not replace an availability or backup plan. Development resets are not seasons or a planned public reset policy.

Before opening a deployment, verify browser action → server authorization → engine transition → atomic PostgreSQL commit → visible client update, plus scheduled completion and restart recovery on the chosen host.

Before the first retained-world runtime migration, run the online index preparation described in the [runtime rollout](../operations/concurrent-runtime.md#retained-world-rollout). Startup refuses a populated table index build instead of taking long write-blocking DDL locks.

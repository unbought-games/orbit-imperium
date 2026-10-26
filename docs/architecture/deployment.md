# Deployment

The server runs as a container or release binary with PostgreSQL. It manages backward-compatible schema migrations during startup and supports rolling deployments.

## Browser origin, HTTP and HTTPS

Set `ORBIT_ORIGIN` to the URL players open, as an absolute `http://` or `https://`
origin: hostname or IPv4/bracketed IPv6 address, with an optional nonzero port.
Do not include credentials, a trailing slash, a path, a query, or a fragment.
Startup rejects malformed origins. Host casing, internationalized hostnames and
default ports are normalized to the browser's origin representation. This same
origin controls request-origin checks, shared-link URLs and OIDC callbacks.

| Browser-facing configuration | Cookie behavior |
| --- | --- |
| `ORBIT_ORIGIN=https://game.example` | Secure cookies; no HTTP opt-in needed |
| `ORBIT_ORIGIN=http://game.example` and `ORBIT_ALLOW_INSECURE_HTTP=1` | Cookies without Secure |
| `ORBIT_ORIGIN=http://192.168.50.48:8080` and `ORBIT_ALLOW_INSECURE_HTTP=1` | Cookies without Secure |
| `ORBIT_ORIGIN=http://203.0.113.10` or `http://[2001:db8::10]:8080`, with `ORBIT_ALLOW_INSECURE_HTTP=1` | Cookies without Secure |
| Any HTTP origin without the opt-in | Startup error |

HTTP opt-in accepts exactly `1`; unset or `0` disables it, and other values fail
startup. It supports public and private hosts without a local-network allowlist
or mandatory explicit port. HTTP sends browser traffic, including credentials
and session cookies, without TLS encryption. HTTPS is recommended for public
hosting and required for the official production service. An opt-in left set to
`1` with an HTTPS origin never removes Secure.

Orbit serves HTTP internally. The operator provides TLS, certificates and any
reverse proxy. For HTTPS terminated at a proxy, keep
`ORBIT_ORIGIN=https://game.example` even when the proxy connects to Orbit over
HTTP. Neither the listener's connection nor `Forwarded`/`X-Forwarded-Proto`
changes cookie security. `ORBIT_BIND` controls the listening address separately.
Both the session and OIDC browser cookies retain `HttpOnly`, `SameSite=Lax`,
`Path=/` and their existing lifetimes. Exact origin checks and CSRF-token checks
remain enabled in HTTP mode.

Local authentication supports either scheme. OIDC keeps the provider library's
independent HTTPS requirement for both issuer and callback, with its existing
loopback HTTP exception only (`localhost`, `127.0.0.1`, `[::1]`). HTTP opt-in does
not relax that requirement or the Accounts profile API transport restrictions.
Register callback URLs using the canonical origin.

### Migration and local development

`ORBIT_LOCAL_INSECURE` is retired, with no compatibility alias. API/combined
processes reject it whenever present, including `0` or an empty value and even
when the new flag is also supplied. Remove it from environment files, service
settings and secret stores. For HTTP, replace it with
`ORBIT_ALLOW_INSECURE_HTTP=1`; for HTTPS, remove it without a replacement.
Worker-only processes ignore these unused HTTP settings.

The fallback origin remains `http://localhost:8080`, but direct `orbit serve`
now needs the explicit HTTP opt-in even for that default. `make dev` and the
local wrapper supply the opt-in, preserving normal local/Vite/LAN development;
explicit environment overrides still win. `.env.example` and test launchers use
the new flag. Supply each binary's matching environment during a mixed-version
rollout; do not pass the retired flag to the new API binary.

### Official production implications

Read-only inspection of the infrastructure repository's
`services/production/runtime/deploy.py` shows that it constructs
`ORBIT_ORIGIN=https://<orbit_hostname>` and routes Caddy to `orbit-api:8080` over
HTTP. Its release example names `orbitimperium.com`; the Accounts registration
uses `https://orbitimperium.com/api/auth/callback`. No application environment
change is needed for that configuration, provided the merged runtime secrets do
not contain `ORBIT_LOCAL_INSECURE`. If that retired key is present, remove it
before upgrading the API. Leave the HTTPS origin and OIDC configuration intact;
do not add an HTTP opt-in for the proxy's internal connection. This assessment
uses checked-in deployment code, not a read of live secrets or a deployment.

## Process roles and configuration

Production uses separately replicated API and worker OS processes sharing PostgreSQL, with scoped chronological ownership rather than one universe-wide gameplay writer. The same image supports `ORBIT_ROLE=api|worker|combined`; combined is the development default. Use the [concurrent runtime runbook](../operations/concurrent-runtime.md) for the retained-world cutover, connection budget, private metrics, and durability requirements.

Package the same application image for local development and container hosts. Environment variables provide process configuration such as `ORBIT_BIND`; database credentials belong in deployment secrets. Universe creation and admission policy belong to the database and explicit CLI. Follow the [production signup setup](../operations/signup.md) and [universe configuration guide](../operations/universe-configuration.md) to initialize a database and create a world before serving. Set `ORBIT_ORIGIN` to the public browser origin using the HTTPS or explicit HTTP configuration above.

## Explicit server lifetime

Keep workers running while the universe is active: due events must resolve without a browser request. Use explicit start/stop operations instead of request-driven sleeping. Configure readiness checks and graceful shutdown that stops admission and safely finishes or abandons the active claim. Multiple existing hosts can retain availability during deployment, while a single host still has a restart window.

Stopping an app process does not implicitly pause game time or reset the database. If retained state is resumed, serve committed snapshots immediately while workers process overdue work in canonical order. Starting a new test run can instead explicitly recreate and seed a disposable universe. A deliberate test pause, if later needed, must be an explicit test-clock feature; do not infer it from process downtime or carry it into competitive play.

Store durable data in PostgreSQL, not the application container's ephemeral filesystem. Self-managed PostgreSQL requires persistent storage and a backup/restore procedure. A persistent volume alone does not provide database replication. Stop/start and database deletion are separate operations; back up retained player progress before deliberately removing database storage.

## Development schema and rules changes

The SQLx migration baseline is created automatically by `serve` and explicit seed/bootstrap commands. The database itself must exist. There is no release initializer. New instances first inspect migration history without a migration lock. Only pending schema work acquires SQLx's migration lock, rechecks history, and applies bounded transactional migrations before HTTP and scheduling; old instances continue serving. Existing-world validation and readiness use metadata reads without the gameplay gate. Production universes require explicit `db-init` and `universe create` before serving; startup never provisions worlds. Population-dependent backfills and game-state conversions are explicit maintenance operations, not startup migrations. Applied SQL and checksums are immutable and tracked in `_sqlx_migrations`.

This first release intentionally rejects legacy schema-1 through schema-5 databases unchanged. Use a fresh database for that cutover. Later migrations preserve data and must support the previous deployed release, including an older server restarting against a later compatible migration tail. Game configurations remain independently selected per universe; startup validates the saved catalog rather than comparing it with bundled MVP bytes. It checks required singleton state but does not audit player collections or historical records. See the [startup and audit contract](../operations/rules-updates.md#fast-startup-and-explicit-integrity-inspection) for failure behavior and deadlines. No automatic reset, downgrade, or legacy conversion is supplied.

Same-version durability remains part of the first end-to-end slice: refresh/reconnect, duplicate requests, concurrent resource spending, interrupted transitions, due-job recovery and restart must behave correctly. A disposable world is not permission to keep authoritative state only in memory.

Normal operation supports rolling deployments across N instances sharing PostgreSQL. Complete the rollout before using `orbit rules apply` to activate content; there is no capability registry. Deploying code or migrating the schema does not change the selected universe configuration. In scoped mode the update is a durable global ordering boundary; admission and committed reads continue while it waits. Legacy serial mode retains its idle-boundary compatibility behavior. Job/flight commitments are preserved. See [operator instructions](../operations/rules-updates.md).

Speed remains fixed for a universe run under the selected policy. This rules-update command also preserves topology and protocol family; structural changes need their own implemented transition. Ordinary configuration/content updates do not require a reset.

## Before competitive launch

Choose and exercise backup/restore, migration recovery, monitoring and an operational shutdown/recovery procedure before promising persistent player progress. Rolling schema compatibility does not replace an availability or backup plan. Development resets are not seasons or a planned public reset policy.

Before opening a deployment, verify browser action → server authorization → engine transition → atomic PostgreSQL commit → visible client update, plus scheduled completion and restart recovery on the chosen host.

Before the first retained-world runtime migration, run the online index preparation described in the [runtime rollout](../operations/concurrent-runtime.md#retained-world-rollout). Startup refuses a populated table index build instead of taking long write-blocking DDL locks.

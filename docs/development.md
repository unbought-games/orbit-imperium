# Development and self-hosting

[Back to Orbit Imperium](../README.md) · [Documentation index](README.md)

The backend is written in Rust with PostgreSQL for persistent game state. A React and TypeScript frontend is served by the same application process. Run the commands below from the repository root.

## Requirements

- Rust 1.99.0, with rustfmt and Clippy (configured in `rust-toolchain.toml`)
- Node.js 24.18.0 and npm 11.16.0
- Make
- Docker with Docker Compose
- PostgreSQL 16.10 (provided by Docker Compose)

## Running Locally

From the repository root:

```sh
npm ci
make dev-setup UNIVERSE=00000000-0000-4000-8000-000000000001
make dev
```

`make dev-setup` explicitly initializes the database and creates one universe at the default 5× speed. Choose a UUID for your installation; repeating setup with that UUID conflicts without resetting it. `make dev` starts PostgreSQL, builds the application, and starts the existing world. Open [localhost:8080](http://localhost:8080) and choose **Create an account** to play.

Run `make dev` again to restart. Game data persists in the Docker volume. The local database uses `orbit` for its username, password, and database name and listens on `127.0.0.1:55432`. Set `ORBIT_DB_PASSWORD` to override the local password.

## Development

For frontend hot reload, start the backend with the development frontend origin:

```sh
ORBIT_ORIGIN=http://localhost:5173 make dev
```

In another terminal, start Vite:

```sh
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite proxies API requests to the Rust server.

For a phone on the same Wi-Fi, use your computer's private LAN IP as the frontend
origin and expose Vite on the network:

```sh
ORBIT_ORIGIN=http://192.168.50.48:5173 make dev
# In another terminal:
npm run dev -- --host 0.0.0.0
```

Replace the example IP with your computer's address, then open that URL on both
devices. Local development enables `ORBIT_ALLOW_INSECURE_HTTP=1`, which explicitly permits HTTP
cookies for the configured origin. Public/private hostnames and IPs work, with or
without an explicit port. Official production uses HTTPS; see the
[origin and migration guidance](architecture/deployment.md#browser-origin-http-and-https). The backend can remain bound to loopback behind Vite.

The project is organized into these components:

| Directory | Responsibility |
| --- | --- |
| `apps/web` | React frontend |
| `crates/engine` | Game rules and calculations |
| `crates/application` | Signup, login, player authorization, game commands, and game-state queries |
| `crates/storage-postgres` | PostgreSQL persistence and migrations |
| `crates/transport-http` | HTTP API |
| `crates/server` | Server configuration and startup |
| `contracts` | OpenAPI specification and API schemas |

After changing the OpenAPI specification, run `npm run contracts` to regenerate the frontend types.

## Deploying and enabling content

Fresh installations require `db-init` and `universe create` before serving. Retained installations require the separate configuration bridge before activating database policy. See [universe configuration](operations/universe-configuration.md) for exact creation, live policy, two-artifact rollout and rollback commands.

Roll out the updated server/frontend to all instances, then use the server's `rules export`, `rules diff`, and `rules apply` commands to activate content per universe. Existing configurations and player progress survive deployment; new content stays disabled until applied. See [rules updates](operations/rules-updates.md) for the operator workflow.

## Testing

GitHub Actions runs [CI](../.github/workflows/ci.yml) on pull requests and pushes to `main`. It runs tooling, client and server tests; client changes also run fixture-only browser tests, and backend/shared/unknown changes run database and browser tests. Documentation-only changes skip those two integration classes. Unknown diff bases conservatively run both. Fixture browser tests run on a separate disposable Ubuntu VM in parallel with the native checks and PostgreSQL tests, so browser feedback does not wait for Rust compilation. The existing `Build, lint and unit tests` check passes only when every selected job passes.

Routine CI has **no configured job, step, suite or per-test execution deadlines**. Node uses its unlimited default, Vitest explicitly sets test/hook timeouts to zero, Nextest only reports slow tests, and fixture Playwright tests use zero test/global timeouts. The continuous release-image workflow also has no custom job deadline. GitHub-hosted jobs still have the platform's six-hour maximum; removing YAML limits cannot remove that cap.

Use controlled clocks and deterministic fixtures, investigate slow setup, and retain every assertion. Functional network timeouts and checks that verify timeout behavior remain in place. Native runners report durations and failures normally; no automatic failure retries are enabled.

| Routine class | Local command | Configuration |
|---|---|---|
| Tooling | `make test-tooling` | Make's Node test command |
| Client | `npm test` | `apps/web/vite.config.ts` |
| Server without PostgreSQL | `make test-server` | `.config/nextest.toml` |
| PostgreSQL integration | `make test-db` | `.config/nextest.toml` |
| Browser with HTTP fixtures | `npm run test:ui` | `playwright.config.ts` |

Install the pinned Node/npm/Rust tools and npm dependencies. Rust tests additionally need **cargo-nextest 0.9.114** (`cargo install cargo-nextest --version 0.9.114 --locked`, or the [official prebuilt binary](https://nexte.st/docs/installation/pre-built-binaries/)). CI installs that pinned prebuilt version. `make test-tooling` uses Node’s built-in test runner for all tooling tests; no separate environment or test dependencies are needed. No custom test scheduler or timing framework is used.

`make check` runs the three unit classes, static/contract/boundary checks and one frontend build. It does not compile a release binary or start a database. Nextest prepares test binaries before execution; Make runs database suites two at a time, each against its own disposable database, with tests inside each suite serial. Database commands require PostgreSQL already running. CI sets up its own Compose project and removes it in an `always()` step. Install Chromium with `npx playwright install chromium` before browser validation.

Full-system and container validation remain **explicit-only**. Generous guards allow cold builds and full journeys: Rust and container-image preparation each get 15 minutes, web preparation 5 minutes, individual suites 10 minutes (recovery 15 minutes), combined acceptance 30 minutes, container behavior tests 10 minutes, and database startup/cleanup 3 minutes each. The manual workflow's outer job guard is two hours. The [deadline helper](../scripts/test-timeout.mjs) and [named durations](../scripts/test-budgets.json) apply only to explicit validation, preparation and cleanup. Image building completes under its own preparation guard before the container smoke/isolation deadline begins.

After [disposable database setup](runbooks/ci-runners.md#disposable-test-resources), use `make test-explicit SUITE=signup` for signup alone, or choose `core`, `mvp`, `progression`, `missions`, `raiding`, `recovery`, `migrations`, `rules-updates`, `acceptance`, `container`, or `all`. `all` runs acceptance then container validation. The [explicit workflow](../.github/workflows/explicit-tests.yml) requires an exact `expected_sha` and has no push/PR/schedule trigger. Report real failures and cleanup results; do not omit coverage or claim success from a partial run.


## Deployment

Trusted `main` revisions publish one API/worker image to private ECR after CI
passes. The [image release contract](operations/image-releases.md) describes
OIDC setup, license and dependency notice inspection, and the commit/digest record.

Hosting requires PostgreSQL, a `DATABASE_URL`, and an `ORBIT_ORIGIN` matching the browser URL. Use HTTPS for public hosting, or explicitly opt into unencrypted HTTP as documented above. See the [production setup guide](operations/signup.md) for build commands and configuration, and the [operator runbook](runbooks/development-server.md) for deployment and database maintenance.

For Fly.io deployments:

```sh
make fly-launch FLY_APP=<app-name>
make fly-deploy FLY_APP=<app-name>
```

Provision PostgreSQL separately before launching the application.

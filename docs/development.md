# Development and self-hosting

[Back to Orbit Imperium](../README.md) · [Documentation index](README.md)

The backend is written in Rust with PostgreSQL for persistent game state. A React and TypeScript frontend is served by the same application process. Run the commands below from the repository root.

## Requirements

- Rust 1.99.0, with rustfmt and Clippy (configured in `rust-toolchain.toml`)
- Node.js 24.18.0 and npm 11.16.0
- Make
- Docker with Docker Compose
- PostgreSQL 16.10 (provided by Docker Compose)

## Running locally

```sh
make dev
```

This prepares dependencies, starts PostgreSQL in a Compose project isolated to this checkout, builds the server, creates a rich playground if missing, and starts the backend and hot-reloading frontend. The command prints the actual URL. Sign in with **user/password**. Ports and the frontend proxy are configured automatically.

Run `make dev` again to resume retained progress. Use `make dev-reset` to restore the current playground and standard rules. Reset affects only this checkout's development database. An existing running local stack sees the replacement; when stopped, reset starts the stack. `make dev-setup` prepares the world without serving it.

Edit the running world with the built-in CLI:

```sh
./orbit world show
./orbit world set ships 1:50:8 cruiser=100 --user user
./orbit world scenario apply edits.json
```

See [world management](operations/world-management.md) and [scenario recipes](../scenarios/README.md). `dev-seed` is retired; no password files or universe UUIDs are needed for the default playground.

For phone testing, bind to your computer's LAN address, which is also used for the frontend origin:

```sh
ORBIT_DEV_HOST=192.168.50.48 make dev
```

Replace the example address with your computer's address. Open the printed URL on both devices. Local development enables HTTP cookies with `ORBIT_ALLOW_INSECURE_HTTP=1`. Explicit `ORBIT_ORIGIN` selects the frontend origin and port; `ORBIT_DEV_HOST` controls the interface Vite binds to.

For a separately managed database, use the `orbit` binary with `DATABASE_URL`, `orbit setup`, and `orbit serve`. Make's local lifecycle refuses an ambient `DATABASE_URL` so resetting a playground cannot target a production database.

## Deploying and enabling content

Fresh installations use `orbit setup` before `orbit serve`. Setup applies migrations and creates the first universe, and is safe to repeat. Legacy retained installations without database-owned policy still require the separate configuration bridge; setup does not replace that upgrade. See [universe configuration](operations/universe-configuration.md) for exact setup, live policy, two-artifact rollout and rollback commands.

Fresh worlds include the installed binary's standard content. Roll out the updated server/frontend to all instances, then run `orbit rules upgrade` to activate standard content in existing universes; `--dry-run` previews the changes. Existing configurations and player progress survive deployment. The `rules export`, `rules diff`, and `rules apply` commands remain available for custom/individual changes. See [rules updates](operations/rules-updates.md) for conflict handling and the same workflow on the official hosted server.

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

`make test-world-local` explicitly exercises two isolated checkout roots, login, live CLI/JSON edits, retained restart, reset, and cleanup. It creates and removes its own disposable Compose projects.

Full-system and container validation remain **explicit-only**. Generous guards allow cold builds and full journeys: Rust and container-image preparation each get 15 minutes, web preparation 5 minutes, individual suites 10 minutes (recovery 15 minutes), combined acceptance 30 minutes, container behavior tests 10 minutes, and database startup/cleanup 3 minutes each. The manual workflow's outer job guard is two hours. The [deadline helper](../scripts/test-timeout.mjs) and [named durations](../scripts/test-budgets.json) apply only to explicit validation, preparation and cleanup. Image building completes under its own preparation guard before the container smoke/isolation deadline begins.

After [disposable database setup](runbooks/ci-runners.md#disposable-test-resources), use `make test-explicit SUITE=signup` for signup alone, or choose `core`, `mvp`, `progression`, `missions`, `raiding`, `recovery`, `migrations`, `rules-updates`, `acceptance`, `container`, or `all`. `all` runs acceptance then container validation. The [explicit workflow](../.github/workflows/explicit-tests.yml) requires an exact `expected_sha` and has no push/PR/schedule trigger. Report real failures and cleanup results; do not omit coverage or claim success from a partial run.


## Deployment

Trusted `main` revisions publish one API/worker image to private ECR after CI
passes. The [image release contract](operations/image-releases.md) describes
OIDC setup, license and dependency notice inspection, and the commit/digest record.

Hosting requires PostgreSQL, a `DATABASE_URL`, and an `ORBIT_ORIGIN` matching the browser URL. Use HTTPS for public hosting, or explicitly opt into unencrypted HTTP as documented above. See the [production setup guide](operations/signup.md) for build commands and configuration, and the [operator runbook](runbooks/development-server.md) for deployment and database maintenance.


Provision PostgreSQL before starting the application. See [deployment requirements](architecture/deployment.md) for process lifetime, persistence, and migration behavior.

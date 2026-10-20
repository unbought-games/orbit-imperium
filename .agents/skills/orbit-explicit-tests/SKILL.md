---
name: orbit-explicit-tests
description: Use when the user explicitly requests Orbit Imperium full-system, signup, migration, process-recovery, or production-container validation locally or in CI. Do not use for ordinary edits or routine PR checks.
---

# Explicit Orbit Imperium validation

Run only the validation the user requested. This skill does not authorize deployment, merging, schedules, or adding test classes. Default to local execution unless the user requests CI. A general request to fix code or run routine tests does not authorize full-system validation.

Work from the intended Orbit Imperium checkout. Read its `scripts/test-budgets.json` and Makefile targets; they are authoritative. `scripts/test-timeout.mjs` is only a deadline wrapper; Cargo, Vitest and Playwright run the tests. Do not replace the bounded runner with a raw harness command, increase a budget, retry a failed suite automatically, or expand scope to make a result look green.

## Local

Identify the checkout's HEAD and dirty state. Ensure the pinned Node/npm/Rust tools, npm dependencies, Docker and (for browser suites) Playwright Chromium are available. Preparation installs are not test results. Do not delete development resources to make room.

Run `make test-explicit SUITE=<suite>` from that checkout. Supported selections are `core`, `mvp`, `progression`, `missions`, `raiding`, `recovery`, `migrations`, `signup`, `container`, `acceptance` (all full-system suites), and `all` (acceptance plus container). An explicit signup request means `SUITE=signup`, not `all`. Ask only if the requested suite or location is genuinely ambiguous.

Database-backed commands require an existing test PostgreSQL instance. For a local explicit run, prepare one with ordinary Compose commands in a shell with an EXIT trap:

1. Create a private temporary directory and set `ORBIT_TEST_SECRET_DIR` to it for fixture files. PostgreSQL uses `ORBIT_DB_PASSWORD` (default `orbit`); set a random override if needed. No database password file is required. Generate a unique `COMPOSE_PROJECT_NAME`, set `ORBIT_DB_PUBLISHED_PORT=0`, and choose a unique `ORBIT_TEST_IMAGE` tag. Clear inherited `DATABASE_URL`, `TEST_DATABASE_URL`, `COMPOSE_FILE`, `CARGO_TARGET_DIR`, and stale `ORBIT_*` test overrides before setting these run-specific values.
2. Install a cleanup trap before starting resources. It must remove containers only on `${COMPOSE_PROJECT_NAME}_default`, run `docker compose down --volumes --remove-orphans`, remove the two `${COMPOSE_PROJECT_NAME}-probe-0/1` isolation-probe projects if present, remove only this run's image tag, and delete only this run's temporary directory. Keep cleanup bounded with the named `cleanup` deadline. Preserve the test exit status and report any cleanup failure as well.
3. Start PostgreSQL with `node scripts/test-timeout.mjs database-start make db-up`. Read `docker compose port db 5432` and export its host port as `ORBIT_TEST_DB_PORT`.
4. Run the requested `make test-explicit SUITE=<suite>` target. Make compiles prerequisites separately; the wrapper enforces class/suite deadlines and Playwright applies its own global timeout.

Never substitute `make db-destroy`, `dev-reset`, or an unscoped Compose cleanup. Do not connect to the development database or use its Compose project. There is no resource manifest or automatic hard-kill recovery service: if the shell itself is forcibly killed, inspect and clean only its recorded project/tag and owned processes. Do not claim cleanup succeeded without checking.

A tool yielding a process session is not a timeout: continue observing the same run. A budget failure is failed validation even if some assertions passed. Preserve logs/artifacts, report the timeout, and diagnose it; do not retry automatically or increase the limit.

## CI

Use `.github/workflows/explicit-tests.yml`, never routine `ci.yml` to approximate a selected explicit suite. GitHub dispatch requires this workflow to exist on the default branch; if it is not available yet, report that limitation and offer the same local command without merging or changing scope.

Verify the requested remote branch/tag resolves to the intended commit. Do not use the branch's upstream as the ref: a feature branch can track `origin/main`. Uncommitted local changes cannot be tested by CI. Pushing a task-owned feature branch is appropriate when already authorized by the task; never push or merge a shared branch merely to enable validation.

Dispatch the verified ref and full SHA, for example:

```sh
gh workflow run explicit-tests.yml --repo unbought-games/orbit-imperium \
  --ref <verified-ref> -f suite=signup -f expected_sha=<full-commit-sha>
```

Record the dispatch time, identify its workflow_dispatch run by ref/SHA/time, and verify `headSha` before following it. If multiple runs match, disambiguate instead of claiming the newest unrelated run. Follow that run to completion with bounded waits. The workflow rejects a ref that moved to another SHA. Report queue time separately from execution.

## Report

Signup screenshots are `target/signup-form-mobile.png` and `target/signup-mobile.png`; its browser output is `target/signup-browser`. Other browser outputs are under `test-results/`. Preserve relevant failure artifacts without exposing temporary credentials.

State selected suite, local checkout or CI URL, commit SHA (and dirty state locally), pass/fail, measured budget lines, and whether cleanup succeeded. Do not claim CI verification from a local run, success from a dispatch acknowledgment, or full coverage from one selected suite. Failed or timed-out validation needs diagnosis; new classes and increased limits require Ethan's approval.

# CI runner isolation

Routine CI (including every pull request) and dispatch-only explicit validation
run on GitHub-hosted `ubuntu-24.04` VMs. Each job gets a disposable host, including
Docker and Chromium's Linux dependencies. Explicit suites remain opt-in with
generous preparation and execution guards.

Routine fixture-browser tests run in three Playwright shards on separate VMs,
in parallel with the native build/lint/unit and database job, after a short
changed-path selection job. This gives browser feedback without waiting for
Rust compilation or sharing its CPU
load. Make still limits database execution to two isolated binaries at a time.
The existing `Build, lint and unit tests` check is an always-run aggregate gate:
scope selection and native checks must succeed, and every selected browser shard
must pass. Shards finish independently even if another fails. An intentionally
unselected browser job may be skipped; failures, cancellations, and unexpected
skips cannot pass the gate.

Routine and continuous image-publication jobs have no custom job or step timeout.
Routine Node, Vitest, Nextest and fixture Playwright execution has no per-test or
suite deadline. GitHub-hosted jobs retain the platform's six-hour cap. Functional
network timeouts and assertions about timeout behavior remain unchanged.
Each browser shard uses at most three workers, bounded by available CPUs.
Playwright's `fullyParallel` mode partitions individual tests across shards.
`make test-ui` still runs the whole suite locally; use `make test-ui UI_SHARD=2/3`
to reproduce one CI shard. No test selection or assertion changes with sharding.
Responsive catalog checks keep routes mounted across viewport changes to avoid redundant
application startup while retaining every viewport and control assertion.

Browser screenshots are diagnostic, not snapshot assertions. Routine runs skip
named captures and the shared test fixture captures open pages after an unexpected
failure into the selected browser output directory. Playwright's built-in
`only-on-failure` mode is disabled because version 1.56 also captures successful
contexts before discarding their images. CI uploads fixture-browser failure
diagnostics for seven days, with a separate artifact name for each shard.
For visual inspection, opt in to the existing named page and element
captures (including viewport loops):

```sh
ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- catalog-pages.spec.ts
```

This flag also enables the shell navigation test's diagnostic video. Normal
runs keep its DOM identity and history assertions without recording video.

The same flag works with explicit browser suites. Layout, accessibility and image
loading assertions run with or without it. See the
[test performance audit](test-performance-audit.md) for measurements and the
prioritized follow-up experiments.

## Merge queue

Changes to `main` go through GitHub's merge queue after PR checks pass. Add a
ready PR with the GitHub **Merge when ready** control or `gh pr merge NUMBER`.
Do not bypass the queue with an administrator merge. Branches do not need to be
rebased or updated after every merge; resolve actual conflicts when necessary.

CI handles `merge_group: checks_requested` and checks out GitHub's temporary
integration commit. Test selection compares that commit with the group's
`base_sha`, including changes from every preceding PR in the group. Queue,
PR and main-push runs have separate concurrency groups. The same required
`Build, lint and unit tests` gate covers each integration commit. Image
publication still requires successful main-push CI, never queue CI.

The repository queue uses squash merges, up to three concurrent integration
builds, and requires every queued entry's checks to pass. It can merge up to
five ready entries together, with a minimum of one so it does not wait to fill
a batch. Its check-response window is six hours; this does not add a job or test
execution deadline. Existing branch protections remain in force, with the
up-to-date branch requirement disabled.

GitHub removes failing or conflicting entries and rebuilds affected later
combinations. Diagnose the removal reason in the PR timeline, fix the PR, and
enqueue it again after its checks pass. Avoid jumping the queue, which rebuilds
the combinations behind it.

## Public repository runner isolation

The public repository has no registered self-hosted runners, verified on
October 20, 2026. Keep it excluded from organization runner groups that expose
persistent hosts. Workflow routing alone does not enforce that isolation.

Do not register persistent self-hosted runners with this repository.
A PR can change workflow routing; labels, read-only tokens, and
workflow conditions do not protect a host that is available to the repository.
See GitHub's [self-hosted runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).

The repository runner list must remain empty:

```sh
gh api repos/unbought-games/orbit-imperium/actions/runners \
  --jq '{total_count, runners: [.runners[] | {id, name, status, busy}]}'
```

Remove old repository registrations in Settings > Actions > Runners. Removing a
registration disconnects it; it does not erase its host or working directory.
If the macOS machines are reused elsewhere, an organization administrator must
put them in a runner group restricted to explicitly selected trusted private
repositories, exclude this repository, and leave public-repository access
disabled. Do not restore repository registrations as a workaround for queueing
or cold-cache runtime. Runner-group administration requires organization-level
permissions, separate from repository admin access.

## Disposable test resources

The workflows scope Compose projects and image tags by run ID and attempt.
Never share the development image tag between CI builds.

CI sets `ORBIT_DB_PUBLISHED_PORT=0` before starting PostgreSQL. Docker assigns the
host port; the integration job reads it with `docker compose port db 5432` and
passes it to tests as `ORBIT_TEST_DB_PORT`. Local development still defaults to
`127.0.0.1:55432`.

Signup and container smoke tests reserve ephemeral HTTP ports by default. For
explicit overrides, use `ORBIT_TEST_SIGNUP_PORT`, `ORBIT_TEST_SIGNUP_PEER_PORT`,
and `ORBIT_TEST_CONTAINER_PORT`; occupied overrides fail rather than probing
another job's server. The signup peer has an independent port, not the next
integer after the primary port.

`make test-container ORBIT_TEST_IMAGE=orbit-imperium:unique-tag` builds and tests
the same image. CI removes only its own image tag, containers, networks, and
volumes, including the database isolation probes if the job is canceled.

Run the real two-project database regression with:

```sh
ORBIT_TEST_CI_DOCKER=1 node --test scripts/ci-isolation.test.mjs
```

The test starts two databases concurrently, checks their distinct loopback ports
and credentials, and verifies that removing one leaves the other operational.
The container CI job runs this test automatically.

Do not reconnect an old runner pool to service stale workflow revisions.

## Image publication

The [release image workflow](../../.github/workflows/release-image.yml) uses
separate trusted-main gates and short-lived AWS OIDC credentials. See the
[image release contract](../operations/image-releases.md) for the CI identity,
repository variables, packaged-source inspection and immutable digest records.

## Explicit validation

Use `make test-explicit SUITE=<suite>` locally against an isolated disposable
PostgreSQL instance, or manually dispatch the workflow with the intended ref and
matching full `expected_sha`. Never use the development or production database.
Record the tested SHA, dirty state, selected suites, results, timing and cleanup.

The manual workflow has a two-hour outer guard. Named limits live in
`scripts/test-budgets.json`: image/Rust preparation 900s, web preparation 300s,
individual suites 600s (recovery 900s), combined acceptance 1800s, container
smoke/isolation 600s, database startup and cleanup 180s each. Container image
preparation runs before the behavior-test deadline, using the same run-specific
image tag. The prior 120s combined container allowance expired during cold AMD64
compilation; an existing successful cold release-image build measured 179s.

For local runs, clear inherited database/Compose/test overrides, create a private
temporary secret directory and unique Compose project/image tag, publish the
PostgreSQL port dynamically, and install an EXIT cleanup trap before starting
resources. Cleanup removes only containers on that project's network, its Compose
volumes/network, its two isolation-probe projects, its image tag and its temporary
secrets. Keep cleanup under the named guard and preserve both test and cleanup
exit status. The workflow provides the corresponding scoped CI cleanup.

Failures and timeouts remain failures. Diagnose and fix actual problems, then
rerun affected validation. Full-system/container suites stay manual; changing
execution guards does not promote them into routine CI.

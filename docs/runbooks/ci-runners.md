# CI runner isolation

Routine CI (including every pull request) and dispatch-only explicit validation
run on GitHub-hosted `ubuntu-24.04` VMs. Each job gets a disposable host, including
Docker and Chromium's Linux dependencies. Explicit suites remain opt-in with
generous preparation and execution guards.

Routine browser validation uses eight disposable VMs: one for tagged application
journeys, one for isolated components, and six for remaining required feature
integrations. These run in parallel with native build/lint/unit checks and three
PostgreSQL groups after changed-path selection. Unmigrated feature assertions
remain required; the inventory check rejects omissions and duplicate execution
across all three browser classes. The two measured longest database
binaries, `rules_updates` and `world_edit`, each get a group; the `rest` group
includes every other binary automatically. Each group compiles only its selected
binaries. Run them locally with `make test-db-rules`, `make test-db-world`, or
`make test-db-rest`; `make test-db` still runs everything.

Make limits database execution to four isolated binaries at a time;
`make test-db DB_JOBS=2` can lower that bound on smaller hosts. Tests within each
binary remain serial, and each binary retains its own disposable database.
Compose project names include the matrix group. The Rust jobs restore the same
trusted-main dependency cache (`shared-key: check-native`); only native checks
on main write it. The cache's environment hash includes both Cargo debug-profile
overrides, so neither exact nor fallback restoration mixes full-debug artifacts
with the smaller CI artifacts.

The existing `Build, lint and unit tests` check is an always-run aggregate gate:
scope selection and native checks must succeed, and every selected browser shard
and database group must pass. Matrix jobs finish independently even if another
fails. An intentionally unselected integration job may be skipped; failures,
cancellations, and unexpected skips cannot pass the gate. Tooling tests verify
that both matrices cover the complete test inventory exactly once, including
new database binaries.

Routine and continuous image-publication jobs have no custom job or step timeout.
Routine Node, Vitest, Nextest and fixture Playwright execution has no per-test or
suite deadline. GitHub-hosted jobs retain the platform's six-hour cap. Functional
network timeouts and assertions about timeout behavior remain unchanged.
Each browser shard uses at most three workers, bounded by available CPUs.
Playwright's `fullyParallel` mode partitions individual tests across shards.
`make test-ui` runs all application fixture tests locally. Use `make test-journeys`
for the `@journey` cohort, `make test-features UI_SHARD=2/6` for one remaining
feature shard, and `make test-components` for the isolated gallery. All three
classes block the aggregate gate. Browser case placement follows the
[testing strategy](../architecture/testing-strategy.md), with explicit mappings
in `docs/verification/test-migration-*.md`.

Both application and component fixture runners build temporary bundles before
opening a browser. Lazy module compilation therefore cannot consume an
assertion's wait. The component build includes both the gallery and independent
report-observation entrypoint.
The bundle deliberately retains development previews and React development
checks; it is not a release artifact. The separate built-homepage check still
validates production assets. The runner removes its temporary bundle and closes
its server/browser on exit. Components use a test-only Vite entry with prepared
real components and fail on unexpected API requests or page errors. Neither
runner hot-reloads changing source during validation.

On a shared development machine, one owner serializes browser suites, builds
and full typechecks across collaborating chats. Separate worktrees and one
worker per chat do not isolate CPU/memory. Preserve interrupted/failing evidence
and record resource contention separately from a diagnosed test defect.

Responsive catalog checks keep routes mounted across viewport changes to avoid redundant
application startup while retaining every viewport and control assertion.
Countdown tests exercise a normal one-second tick before fast-forwarding to
expiry; they do not replay every animation frame over several simulated minutes.

Routine and explicit CI set `CARGO_PROFILE_DEV_DEBUG` and
`CARGO_PROFILE_TEST_DEBUG` to `line-tables-only` before restoring the Rust cache.
This retains filenames and line numbers in failure backtraces while avoiding
full dependency type and variable information in every linked test binary.
Both profiles use the same setting so development builds used by explicit suites
and test builds can reuse artifacts. Optimizations, debug assertions, overflow
checks and test selection are unchanged. These workflow-only overrides do not
change local debugging defaults or release builds.

Rust jobs report remaining disk space and Cargo/target sizes after execution.
When investigating disk exhaustion, preserve the failing attempt and compare
cache keys, runner images and actual extracted/build sizes. A compressed cache
size or a passing retry alone does not identify the cause or prove a repair.

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

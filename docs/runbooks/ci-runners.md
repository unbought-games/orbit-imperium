# CI runner isolation

Routine CI (including every pull request) and dispatch-only explicit validation
run on GitHub-hosted `ubuntu-24.04` VMs. Each job gets a disposable host, including
Docker and Chromium's Linux dependencies. Explicit suites remain opt-in and keep
their existing deadlines.

Routine fixture-browser tests run on their own VM in parallel with the native
build/lint/unit and database job, after a short changed-path selection job. This
gives browser feedback without waiting for Rust compilation or sharing its CPU
load. Make still limits database execution to two isolated binaries at a time.
The existing `Build, lint and unit tests` check is an always-run aggregate gate:
scope selection and native checks must succeed, and selected browser tests must
pass. An intentionally unselected browser job may be skipped; failures,
cancellations, and unexpected skips cannot pass the gate.

The native job has a thirty-minute outer runaway guard; the independent browser
job has a fifteen-minute guard. The October 20 cold
Ubuntu run spent 6m51s in build/lint/unit checks and 5m14s in database preparation
and tests, both passing, then hit the old fifteen-minute job cap during browser
validation. The longer job guard accommodates cold compilation and cache setup;
it does not extend any native test limit or establish a performance target.
Fixture browsers use at most three workers, bounded by available CPUs. Responsive
catalog checks keep routes mounted across viewport changes to avoid redundant
application startup while retaining every viewport and control assertion.

## Required access changes before public release

Workflow migration does not remove runner registrations. As verified on
October 20, 2026, `mini-orbit-imperium` and `mini-orbit-imperium-2` are still
registered. Disconnecting them and excluding this repository from shared runner
groups is the next operational step, before publication. This PR changes workflow
routing only; it does not establish that the repository is safe to publish.

Do not register persistent self-hosted runners with this repository, even while
it is private. A PR can change workflow routing; labels, read-only tokens, and
workflow conditions do not protect a host that is available to the repository.
See GitHub's [self-hosted runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).

Before publication, the repository runner list must be empty:

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

After the access changes, older workflow revisions targeting the macOS pool can
remain queued. Run the updated workflow revision to use GitHub-hosted machines;
do not reconnect the old pool to service those revisions.

## Explicit validation

The dispatch-only workflow uses a twenty-minute outer job guard and removes the
former one-minute browser-only installation cap for Chromium's Linux system
dependencies. This changes setup headroom, not test or build deadlines. The `all`
path already permits three 120-second preparations, a 15-second web build,
180-second acceptance and 120-second container validation: 675 seconds before
dependency setup, database startup and cleanup, exceeding the old ten-minute job
guard. The previous hosted routine run also took 11m47s overall, including 4m49s
of database compilation, demonstrating the difference from a warm local host.

Test and build deadlines in `scripts/test-budgets.json` remain unchanged. This
does not prove that cold full-system/container validation fits those individual
deadlines, including the 120-second compile/container limits. Run those suites
only when explicitly requested; any deadline recalibration is a separate decision
supported by measurements.

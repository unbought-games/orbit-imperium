# Request latency instrumentation verification

November 15, 2026. Base revision `6eafeb0c8397eb49ea4b2e1a0b75ed198b801784`
plus the accompanying implementation and tests, which were uncommitted during
validation. The sorted changed
Rust paths and Makefile, hashed as path + NUL + contents + NUL, have SHA-256
`518e69ffdc67ed07bd6bac9b084956115d6369dcc2cf7a11e8e0fdcce1cde2cd` (17 files).

## Results

| Check | Result | Reported preparation / execution |
| --- | --- | --- |
| `make test-http` | 89 passed | 11.53 s compilation; 27.309 s tests |
| `make test-request-metrics` HTTP selection | 4 passed | 8.12 s compilation; 0.023 s tests |
| Same target, application selection | 2 passed | 0.17 s preparation; 0.014 s tests |
| Same target, server selection | 5 passed | 6.69 s compilation; 0.052 s tests |
| `make test-db DB_SUITES=request_metrics DB_JOBS=1` | 1 passed | 5.34 s compilation; 0.29 s runner preparation; 2.740 s tests |
| Clippy, application/HTTP/server all targets with server test-support | Passed with warnings denied | 22.17 s |
| Clippy, PostgreSQL request_metrics test with test-support | Passed with warnings denied | 12.01 s |
| `cargo fmt --all --check`, `git diff --check`, architecture boundary checker | Passed | Not separately timed |

The focused HTTP selection was rerun after strengthening cancellation coverage to
assert that storage-phase timers still observe task-local context during drop.
It overlaps the complete HTTP run; these counts are not additive unique tests.
The final server selection covers snapshot formatting outside the request mutex.
No production build, browser suite or full-system acceptance was requested/run.
There are no visible UI changes. Runner queue wait and complete wall-clock setup
were not measured separately. Existing compiled dependencies were reused, with
Cargo compilation limited to two jobs.

## Failure evidence and corrections

- The initial disposable Compose setup failed because Docker's automatic address
  pools were exhausted. An inspected, unused explicit subnet was assigned to this
  task's isolated project. Existing networks/containers were not removed.
- New HTTP fixture compilation initially supplied an integer for the UUID-backed
  Epoch type. Corrected the fixture to use a UUID. The complete HTTP run passed.
- New PostgreSQL fixture compilation initially supplied a one-account slice to the
  existing five-account bootstrap helper. Corrected the fixture to its declared
  array contract. The database test passed on its first execution.
- A formatting check detected the latest snapshot-clone edit before formatting;
  `cargo fmt` was applied and the final check passed.
- No assertion failures, timeout increases, retry-for-luck runs, or repairs to
  pre-existing tests occurred. No runtime test was removed or weakened.

## Protected behavior

HTTP coverage verifies action classification before authentication, malformed
request visibility, route-template redaction, bounded method labels, concurrent
request isolation, and partial authentication/storage phases on cancellation.
Exporter coverage verifies the exact 250 ms histogram threshold (including a
sample one nanosecond above it), distinct failures/replays, phase counts, a bounded
64-sample diagnostic buffer and visible series overflow.

The real PostgreSQL test injects failure before admission commit and checks both
absence of a receipt and absence of committed metrics. It then injects failure
after commit, checks the durable receipt and committed metric despite the failed
response, and retries that identity to prove replay does not count as another
committed order.

The disposable database, container, volume and network were removed. Production
was not mutated. The private exporter and diagnostic buffer are implemented;
hosted collection/dashboard activation, durable retention and client timing remain
pending. No performance SLO compliance or production overhead claim follows from
these functional tests.

## PR validation correction

PR #441 run `43792888635`, attempt 1, journey job `133055169011` failed during
`make test-homepage-built`, before browser execution. `npm run news:build` rejected
the new change note with `News needs YAML frontmatter`. This was a build-input
defect in this PR, not a browser-test failure or infrastructure outage. Added the
required id/title/date metadata and verified news generation locally. Existing
tests and assertions remain unchanged.

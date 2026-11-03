# CI disk footprint, November 3, 2026

Repeated PostgreSQL `rest` compilation failures exhausted hosted-runner disk,
including [queue run 41723551629](https://github.com/unbought-games/orbit-imperium/actions/runs/41723551629).
No test assertion caused those failures. Workspace-only line-table overrides
still left full dependency type/variable debug information in each test binary.

[Comparison 41727022748](https://github.com/unbought-games/orbit-imperium/actions/runs/41727022748)
ran `make test-db-rest` twice on source `d09c7fa68754382e7dfc234e8cefc983d8a4a994`
(main `25d0db7` plus a temporary branch-only measurement workflow). Both used
Rust 1.99.0, disabled incremental compilation, and cold dependency builds. Both
passed the same 147 tests in 45 binaries and cleaned up their disposable database.

| Measurement                        | Existing profiles | CI line tables for dev/test |
| ---------------------------------- | ----------------: | --------------------------: |
| Allocated `target` size (`du -sk`) |     9,363,256 KiB |               5,976,448 KiB |
| HTTP test executable               | 233,408,736 bytes |           148,041,504 bytes |
| Alliances test executable          | 227,535,088 bytes |           142,168,944 bytes |
| Cold compilation                   |              210s |                        192s |

The measured target reduction is 3.23 GiB (36%). Both hosts had about 84 GiB
available initially, so this did not reproduce disk exhaustion. Their image
revisions differed (`20261101.360.1` and `20261025.353.1`); timings are observations,
not a controlled speedup claim. This measures a concrete contributor and mitigation,
not the exact occupied-byte breakdown of the lost failing hosts.

Routine and explicit CI set both Cargo debug profiles to `line-tables-only`
before cache restoration. The existing cache action hashes these environment
values into its exact and fallback keys, preventing old full-debug artifacts
from occupying disk alongside rebuilt dependencies. Source backtrace locations,
assertions, overflow checks, test inventory and local/release defaults remain
unchanged. Rust jobs report disk and artifact sizes for subsequent validation.
The temporary comparison workflow is removed; normal required gates are restored.

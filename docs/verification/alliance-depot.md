# Alliance Depot validation

Validated October 31, 2026 (America/New_York). Scope: planet allied holding,
Alliance Depot construction/resupply, combat and espionage participation,
owner-specific reports, client flows, persistence and explicit rules activation.
Coordinated group attacks and lunar activation remain separate features.

## Exact source

Base revision: `a5934bc662b26338bcb8e47f92a55351ced6e4c0` plus the implementation working tree.
Changed-file manifest SHA-256: `7f3fd4a69ba5c780618dec53d1f19e52f642adb586d39eabe5cd49c2df1a7369`.
The manifest hashes every changed tracked/new file except this verification
record; it is retained locally as `test-results/depot/source-manifest.json`.
Generated build outputs and screenshots are excluded. Tests run against the
implementation source, not a claim that the unchanged base commit contains it.

Toolchains: Rust 1.99.0, Node 24.18.0, npm 11.16.0. The initial host Cargo
selected Rust 1.97.1 and refused the manifest; subsequent Rust runs used the
repository-pinned rustup toolchain. Final checks used the matching isolated Node
and npm installation without changing project dependencies.

## Passing checks

| Check | Result | Measured execution |
| --- | --- | --- |
| `make check`: tooling | 117 passed | 6.902 s |
| Client Vitest | 128 files, 1,244 tests passed | 3.49 s |
| Native server/application/engine/transport | 602 passed | 37.607 s |
| Configuration bridge | 43 passed | 1.443 s |
| PostgreSQL library | 7 passed | 0.035 s |
| Clippy, rustfmt, ESLint, Prettier, contract generation and boundaries | Passed | Clippy 11.57 s in preceding complete check; final check also passed |
| Production frontend and SSR build | Passed | See local final check log for transform/build phases |
| PostgreSQL rules updates | 39 passed | 291.331 s |
| PostgreSQL migrations, including selective query plans | 16 passed | 16.722 s |
| PostgreSQL holding journey, both runtimes | Passed | Final rerun 56.993 s; compilation 17.01 s |
| PostgreSQL world | 3 passed | 10.548 s |
| PostgreSQL ordering | 2 passed | 3.016 s |
| PostgreSQL fact bounds | 1 passed | 1.194 s |
| PostgreSQL deadline ordering | 1 passed | 1.677 s |
| PostgreSQL social | 7 passed | 18.615 s |
| Depot, industrial buildings and mission-fleet browser journeys | 25 passed | 22.1 s |
| Depot plus Empire browser journeys | 33 passed initially; two copy assertions corrected and both rerun successfully | Initial run 1.1 min; affected rerun 3.0 s |

Native build preparation in the final `make check` took 13.14 s, 6.70 s and
2.60 s for its three preparation commands. Concurrent compilation sometimes
waited for Cargo's existing build lock. Routine suite deadlines were not added
or reduced. The existing Make scheduler ran database binaries with three jobs;
tests within each database binary remained serial.

The holding database journey exercises a hostile arrival scheduled before the
visitor launches, explicit friendship, launch/arrival, two competing supplies,
one accepted budget debit, exact retries, restart, participant reports, social
revocation, recall and return. Both serial and scoped runtimes pass. The
activation test previews and applies retained-world initialization, builds a
Depot through normal commands, reconnects, and demolishes it. Engine tests also
cover rounding, drive snapshots, zero-hour holds, foreign-owner capacity,
relationship/block rules, same-player participation on both sides, stale events,
rolling boundaries, numeric overflow and sub-millisecond rejection. Report loss
totals can exceed a single stock limit without widening spendable resources.

## Failures found and resolved

- Historical replay initially gained an empty coverage field. Omitting the empty
  field restored the original serialized records; all three replay tests pass.
- The original database constraint rejected Holding. Migration 0028 adds the
  explicit leg and updates the active predicates.
- The expanded fleet predicate made the destination lookup touch 209 buffers,
  exceeding the existing under-100 assertion. Updating its partial index restored
  selective lookup; the original assertion and full migration suite now pass.
- Existing upgrade assertions omitted the newly released Depot. Their exact
  expected building lists and release number were updated, preserving assertions.
- The larger current bootstrap variant crossed Clippy's enum-size threshold;
  boxing that internal variant keeps its public serialized shape unchanged.
- Test setup mistakes (friend-request lookup, scenario edit metadata, protection
  balance, demolition helper support, and the building action's accessible name)
  were corrected. One browser run was manually interrupted while waiting for the
  wrong action name; it is not counted as successful validation.
- The Empire wording changed to include held fleets. Two exact text assertions
  were updated from “On fleets in transit” to “On active fleets” and passed on
  rerun; no quantity, geometry or accessibility assertions were removed.
- Visual review found the old quote budget remaining after successful supply.
  The completed state now shows the authoritative updated budget and receipt.

## Visual review and cleanup

Captured and inspected the running browser implementation at 1440×900 and
390×900: Depot facility/empty state, active construction, Hold dispatch, dispatch
review, held-fleet recall, supply review, successful supply and Empire holdings.
Images are retained in `test-results/depot/` and displayed in the implementation
chat, not hosted or attached to a pull request. Longer pages use full-page
captures from those viewport sizes.

Each database runner removed its disposable test database through its existing
cleanup trap, including failed attempts. Before final shutdown, no `orbit_test_*`
databases remained in the isolated `orbit-depot-82e8` Compose project. Its
container, network and database volume were then removed; no other Compose
project or database was touched. Browser runners closed their Vite servers and
browser processes. Source, ignored logs/captures and build caches are retained.

No routine CI categories, schedules, deadlines or production services were
changed. Existing universes require the deployment and activation sequence in
[the operator guide](../operations/alliance-depot.md).

## PR lock-order repair — November 1, 2026

Publishing review found that fleet admission acquired bot participation before
the alliance/social lock, opposite to social-command charging. The new scoped
PostgreSQL regression holds the social lock, observes the actual admission wait
through PostgreSQL blocking facts, and attempts the bot row with `NOWAIT`. It
failed against `ec0e20486fac9d266d89baae56a493a107c9e327` with SQLSTATE 55P03,
then passed after moving the social lock before bot participation. No UI changed.

Tested code patch SHA-256 (binary Git diff of the two Rust files against that
revision): `0ce401dc14a5a281b77256cf15c224b1ab18e482f863b72d974b37e3400653f5`. The full bot suite passed 10 tests in
5.814 s, including the regression in 0.345 s; the serial/scoped holding journey
passed in 7.805 s. Focused Clippy with warnings denied passed in 11.42 s.
The existing database runner removed its disposable databases after both the
expected pre-fix failure and the successful rerun. The isolated PR validation
Compose project is removed after these checks.

## Main/Terraformer integration — November 1, 2026

The first queue enrollment encountered six additive conflicts with Terraformer
PR 284. After its confirmed merge, this branch merged main revision
`40d2fe8788d193a33ba74c3eb121f02bee48621c`, preserving both catalog entries,
technical data, building support, upgrade expectations and browser registrations.
The combined standard content release is 0.14.0. The validated integrated Git tree
before this audit note is `4bb73b9e1597e92e01b1f5942efa79c91e367562`.

`make check` passed: 117 tooling tests (11.002 s), 1,261 client tests in 129 files
(3.27 s), 610 native tests (24.628 s), 43 bridge tests (0.797 s), seven database
library tests (0.011 s), Clippy, formatting, contracts, boundaries and production
build. All 40 PostgreSQL rules-upgrade tests passed in 259.948 s, including both
Terraformer and Depot activation. The holding journey passed in 13.932 s. Six
refreshed desktop/mobile Depot browser journeys passed in 5.9 s; affected captures
were inspected again. The isolated integration Compose project and its test
databases are removed after validation. No CI assertions or checks were bypassed.

## Review and CI repair — November 1, 2026

Review thread PRRT_kwDOVRgPYs6yZ8o4 correctly identified actor-only error codes
being returned for visitor restrictions. Host vacation/deletion retains actor
errors; a restricted visitor now returns HoldingUnavailable without attributing
the visitor's private account status to the host. The engine regression covers
both participants and both restrictions.

CI run 41304205667 failed identity reset validation with Conflict immediately
after dropping retained server guards. Those sessions close asynchronously. The
test now waits for PostgreSQL's actual exclusive advisory-lock acquisition after
the failed startup check, before asserting reset succeeds. A ten-second lock
readiness guard detects broken release; it is not a suite execution deadline.
The existing protection, revocation and epoch assertions remain intact.

Tested patch against `57ed0532d690fec2d040114e433c27ed729a7724`, SHA-256
`3a99421908a559bb3957ae4f8c0786db48cff29c62e1b1d8076cf555a6bb4aef` over the binary Git diff of the three Rust files.
All nine holding engine tests passed in 0.116 s, identity integration passed in
3.312 s, the serial/scoped holding integration passed in 7.830 s, and workspace
Clippy passed in 5.81 s. Disposable databases were removed by the runner and the
isolated review Compose project is removed after validation. No UI layout or
copy changed; previously refreshed screenshots remain current.

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

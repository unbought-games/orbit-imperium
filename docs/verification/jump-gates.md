# Jump Gate verification

## Revision and coverage

Product code: `2e176d65b4970987ba4f6c240295484b20bbeada`, based on
`3b97e6ffec92c372100e41bbdc6da5939f304c78`. Subsequent changes add the
paid-construction database scenario, complete its fixture, update the existing
Hyperspace disable fixture, and refine screenshot preparation; no product code
changed after that revision. PR and merge-queue CI validate the final commit.

- Pure engine tests cover lunar prerequisites/fields/cost growth, ship and value
  conservation, unchanged resources, no flight/event/slot, unavailable local fuel,
  invalid endpoints/manifests/policies, missing coverage, stale terms, competing
  prequoted transfers, exact cooldown boundaries at speeds 1/4/7/100, serialization
  and upgrades without shortening a cooldown.
- PostgreSQL tests run real ordered commands in serial and scoped runtimes. They
  cover simultaneous submissions, original receipt recovery after reconnecting,
  gate cooldown persistence, exact reverse-jump readiness, jump-versus-launch
  contention, ordinary rules activation/deactivation, and parent abandonment.
  A further scenario pays for a gate, proves it cannot operate while building,
  completes it after reconnecting, verifies payment/field accounting, then jumps.
- Client model tests cover exact large counts, stationary exclusions, stale edits,
  source-only pending reservations, shared endpoint locking, unchanged resources
  and fleet slots, rejection recovery and deadline eligibility.
- The two application journeys protect desktop/mobile facility navigation,
  construction submission, explicit quote review, foreground moon binding, transfer
  submission, refreshed inventories/cooldowns and canonical reload. Browser
  fixtures do not establish server correctness; the database cases above do.

## Results

| Check | Result | Measured execution / preparation |
|---|---|---|
| `make check` on integrated product revision | Passed: 130 tooling tests, 1 intentional tooling skip; 1,924 client tests; 813 Rust tests; 57 bridge tests; 10 storage unit tests; Clippy, formatting, lint, component types, contracts, boundaries, production build | Client 7.51s; Rust 27.813s; bridge 2.072s; storage units 0.014s. Rust compilation reported separately by Cargo. |
| `make test-db DB_SUITES=jump_gates DB_JOBS=1` with final construction scenario | 5 passed | Compilation 3.61s; test execution 15.453s |
| Existing `moons`, `phalanx`, `migrations` PostgreSQL suites | 1 / 13 / 17 passed | 1.076s / 52.379s / 12.180s |
| Existing `rules_updates` suite, partitioned after assertion updates | All 40 cases covered by passing results; no cases removed | Initial attempt 162.694s (15 passed, 1 outdated assertion, 24 unrun); remaining selection 246.326s (25 passed, 1 dependent-content fixture failure, 14 skipped); repaired Hyperspace case 15.420s |
| `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- jump-gates.spec.ts` | 2 passed at 1440×900 and 390×900 | Bundle preparation 4.182s; browser run 3.3s |

Local runner allocation and merge-queue residence are separate from execution.
There was no hosted-runner allocation for these local checks. Compose setup and
total local wall time were not separately instrumented. The PR timeline records
hosted CI and queue timing. Validation used Rust 1.99.0 and Node 24.18.0. Local
PostgreSQL used the dedicated `orbit-jump-gates` Compose project and port 55437;
test runner traps removed each disposable database.

## Failures and repairs retained

- Enabling the building exposed two engine allowlists that still rejected Jump
  Gate definitions. Both product omissions were fixed; the tests were retained.
- Existing standard-upgrade and Fusion tests listed the previous complete set of
  buildings. Their exact expected lists now include Jump Gate. Earlier lunar
  fixture reconstruction also disables/removes the newly dependent gate before
  removing Lunar Base. Assertions remain exact.
- The Hyperspace disable fixture must now disable Jump Gate construction along
  with the other dependent content. Its failure was a catalog-reference rejection,
  not an intermittent database failure. The engine's separate legacy Hyperspace
  fixture does not enable gates and needed no change. History and the repair ledger
  were checked; no prior repair entry was found for these named cases.
- New deterministic fixtures initially omitted current research or inventory-head
  coverage; each affected fixture was completed once. The new rules-toggle test
  initially reused a stale exported revision; it now obtains a current document
  for each explicit activation. No production revision checks were weakened.
- Browser integration first exposed a missing `JumpShips` capability schema,
  which was fixed. The journey then used the visible build text instead of the
  existing accessible name `Confirm upgrade`; that locator was corrected once.
  Five task-owned diagnostic browser runs were interrupted while diagnosing the
  missing capability/locator and an optional screenshot toast-dismiss loop. The
  optional loop was removed. No execution deadline, sleep or retry was added.
- The first production build rejected missing news frontmatter; the next caught
  two strict TypeScript annotations in new tests. Both were corrected. The final
  integrated `make check` completed successfully.

No test was deleted, quarantined or weakened. Full browser authentication and
production deployment were not run locally. Normal schema/rules activation,
restart recovery and real construction/transfer are covered at PostgreSQL rather
than being inferred from successful HTTP mocks.

## Visual evidence

Final running fixture UI was captured and inspected for construction, transfer
review/confirmation and cooldown at desktop 1440×900 and mobile 390×900. Captures
are delivered in the implementation chat, not hosted or attached to the PR.
Desktop captures include the full document; mobile captures show the viewport,
with a separate confirmation capture for the longer form. Optional capture
preparation is inactive unless `ORBIT_TEST_SCREENSHOTS=1`.

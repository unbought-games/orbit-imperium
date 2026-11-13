# Catalog, manufacturing and technical details: stream 02

This is the completion handoff for stream 02 of the
[published audit](https://github.com/unbought-games/orbit-imperium/blob/63330c051ab13fa7cef58253d9a310a2cc3259df/docs/verification/e2e-migration/workstreams/02-catalog-and-progression.md).
Implementation started from main `c39cb5df489e12f557c4acb7e1163846064560db`.
The audit's original source was `0c235fd6d27422374abf61ea44e39c015a9c1675`.
There were no changed, added or removed cases in the 19 owned specs between
those revisions. Stream 01's prepared resource scenes, lower-level tests and
[handoff](test-migration-resources.md) are unchanged. Stream 03 still owns
launch migration; the existing Cruiser attack and Large Cargo transport
launch tests remain required and are untouched. No other stream's selection
or status was changed.

## Coverage disposition

- [Frozen current cases](test-migration-catalog-progression-cases.csv): 131
  application cases and 67 component cases, with their original IDs, full
  title paths, projects, dispositions and exact destination tests.
- [Historical cases](test-migration-catalog-progression-baseline.csv): 211
  pre-migration rows linked to the current IDs or their prior disposition.
  [Phase one](test-migration-progression.md) and the [catalog content
  ledger](test-migration-catalog-content.md) remain the sources for prior
  repair history and assertion-level context.
- [New components](test-migration-catalog-progression-delta.csv): 28 new
  required cases, for 95 total owned component cases. The result is 60
  required application cases (four tagged journeys and 56 retained
  integrations), down from 131. One journey is narrowed in place. No
  project, test timeout, retry, quarantine or CI scope rule changed.

Comparison checkbox/disclosure and keyboard behavior exercise real components.
Prepared item profiles cover effective speed, drive, cargo and containment;
the model holds independent exact vectors and the Bomber transition. The
previously retired mobile ship comparison application tour remains absent.
The isolated inspector preserves long timer geometry, dialog tabs and focus
return, failed art, gate visibility, bound quote delivery, live affordability
and receipt handling. It runs the real selection hook on a memory router,
the real production selectors and the existing Coordinator with a prepared
snapshot and controlled external ports. Comparison props do not import the
inspector runtime. The development detail preview resolves its real links
without importing the application router. The live game routes and rendered
components are unchanged.

Defense cases now assert exact gates, costs, command shape, inventory and
fully decoded published responsive art below the application. The isolated
Ion Cannon batch verifies the return to the catalog and a delivered inventory
change. The representative order journeys verify protocol 3 ship and defense
submissions and protocol 4 paired Battleship submission. Actual
selected-planet, Back/Forward/reload, native new-tab, and moon routing are
retained. Technical-data application focus is split from keyboard disclosure:
the historical repair is preserved in the record, isolated cases await the
real panel focus, and the retained application tests check shell route focus.

Each surviving application's separate contract is in the current-case ledger.
Examples that cannot be proved by prepared props include selected-planet
research submission and prerequisite navigation, protocol command envelopes
and response handling, live queue summaries while navigating, satellite
production versus fleet eligibility, and the linked network operation across
two bodies. Repeated viewport lifecycles are consolidated where the same
contract still runs and the shared controls are exercised at both sizes.
The remaining feature cohort and final global cutover are owned by stream 10.

## Server boundaries

No Rust code or server test selection changed. The prepared component and
application receipts are frontend contract evidence only. The named real
tests executed independently include:

| Boundary | Contract and test |
| --- | --- |
| Engine terms and admission | `impulse_prerequisites_costs_duration_and_unbounded_progression`, `astrophysics_requires_all_completed_gates_and_complete_facts`, `astrophysics_completion_and_refund_keep_committed_terms_across_rules_changes`, `laser_research_and_defense_require_completed_local_and_player_prerequisites`, `full_queue_is_bounded_and_rejected_without_payment` |
| Engine paid work and replay | `ion_cannon_paid_fifo_survives_disable_and_restart_without_duplicate_credit`, `gauss_cannon_paid_fifo_survives_disable_and_restart_without_duplicate_credit`, `heavy_laser_paid_fifo_survives_disable_and_restart_without_duplicate_credit`, `plasma_turret_paid_fifo_survives_disable_and_restart_without_duplicate_credit`, `shield_domes_have_independent_capacity_and_paid_work_survives_restart_and_disable`, `full_playthrough_replays_after_every_input_boundary` |
| Engine research and production | `network_stale_remote_changes_and_incomplete_facts_fail_without_spending`, `network_remote_lab_start_wins_against_a_previously_quoted_research_command`, `nanite_locks_all_paid_manufacturing_in_both_orders_including_demolition`, `satellite_counts_require_complete_inventory_and_validate_settings_by_profile`, `gates_construction_completion_throttle_and_demolition` |
| HTTP with PostgreSQL | `real_http_origin_csrf_cookie_and_privacy`, `versioned_binding_authorization_queries_and_response_contracts` verify origin/cookie, binding, query and admitted command/receipt authorization. They are shared HTTP boundary evidence, not proof of every manufacturing item gate. |
| PostgreSQL progression | `concurrent_spend_deadline_ordering_and_restart_preserve_state` and `competing_construction_and_dome_admissions_derive_capacity_after_restart` verify durable ordering, conflicting payment and derived capacity. |

## Verification and repair record

Executable implementation: `71e2aafa77daf12f9deb25d69f681c3403c12439`.
Local Node 24.18.0, npm 11.16.0, Rust 1.99.0, Nextest 0.9.114.
All 60 surviving application cases passed in the 63-case run before deleting
the three redundant research application cases. Their replacement tests
then passed; the narrowed Battleship fixture and selected-planet check
passed in a focused follow-up. The component suite and unit suites were not
rerun unnecessarily after removal-only changes.

| Check | Result | Preparation / execution |
| --- | --- | --- |
| 21 focused client test files (progression, artwork and client model) | 384 passed | 1.67s Vitest total |
| Added deterministic Impulse, Astrophysics and Laser research contracts | 26 passed in the affected file, including the three added cases | 1.42s Vitest total |
| Four owned component specs, with final preview captures | 95 passed | 4.148s bundle; 39.6s runner |
| Twelve retained application specs | 63 passed before three deletion-only dispositions | 5.185s bundle; approximately 72s runner |
| Battleship and Heavy Fighter after narrowing the Battleship fixture | 2 passed | 8.906s bundle; 4.8s runner |
| Engine progression, terms, ship activation/profile, production and replay binaries | 110 passed | 34.41s compilation; 8.533s runner |
| PostgreSQL progression and real HTTP | 4 passed | 3.155s database preparation; 58.78s compile; 9.138s progression + 10.013s HTTP runner |
| Application/component TypeScript, ESLint, source formatting and diff whitespace | Passed | Typecheck/static elapsed not separately recorded |
| CI workflow and selection policy | 12 passed | 1.002s runner |

The selected PostgreSQL rules-update run (Nextest
`699c5fb2-e200-413b-a160-f2786d034060`) uses the existing serial disposable
runner. Its independent results and cleanup, plus exact PR/merge-group
attempts and timings, belong to the PR validation record. Local runner
allocation wait was not separately instrumented. These figures do not
establish a future flake rate. No explicit full-system acceptance or
deployment was performed.

Five local component failures were explained fixture/locator defects:

1. Both initial confirmed-order cases found the correct announcement in the
   mounted error banner but incorrectly scoped the status locator to the
   detail region. Assert the same exact announcement at page scope. Both
   passed after correction.
2. The initial income scene had a rate but lacked the snapshot progress
   metadata required by the real local projection. Add the authoritative
   metadata; retain the same exact threshold and disabled/enabled assertions.
   It passed after correction.
3. Both initial building countdown cases searched inside the catalog link.
   The confirmed timer belongs to its adjacent quick-build control. Select
   by the same accessible name at page scope; keep the original relative
   geometry and keyboard assertions. Both passed after correction.

The affected first attempts, stacks and traces were retained locally under
`/tmp/orbit-stream02-evidence` and the log files `orbit-stream02-orders.log`
and `orbit-stream02-controls.log`. One repair per affected family; all passed
on the repaired revision and final suite. No test was weakened, retried for
luck or given more time. Initial typecheck identified the narrow router's
function-component type and a nullable receipt return; both were corrected.
No server failures, product regressions or canceled local validation are
claimed in this record. The earlier Heavy Fighter submission recurrence
remains retired; no same-item replacement submission was created.

The component and application runners closed their browsers and released
their preview servers/bundles. PostgreSQL uses task-owned
`orbit-catalog-validation`, an ephemeral port and an unused /28 Compose
network because the host's default pool is allocated. Individual
test databases are removed by the existing runner, with project removal
verified in PR follow-through. No other checkout, database or network
was removed. Screenshots stay in the implementation chat.

Commands (from the repository root):

```sh
npm run test:components -- detail.component.spec.ts progression-comparison.component.spec.ts progression-detail.component.spec.ts progression-forms.component.spec.ts --workers=2
npm run test:ui -- catalog-pages.spec.ts battleship.spec.ts cruiser.spec.ts fusion-reactor.spec.ts heavy-fighter.spec.ts hyperspace-drive.spec.ts hyperspace-technology.spec.ts industrial-buildings.spec.ts large-cargo.spec.ts research-network.spec.ts solar-satellite.spec.ts terraformer.spec.ts --workers=2
npm run test:component-types
node node_modules/typescript/bin/tsc --noEmit -p apps/web
npm run lint
npm run format:check
node --test scripts/ci-workflows.test.mjs
cargo nextest run -p orbit-engine --test progression --test progression_terms --test battleship --test battlecruiser --test bomber --test destroyer --test hyperspace_drive --test solar_satellite --test fusion --test replay
make test-db DB_SUITES='progression http' DB_JOBS=1
sh scripts/test-db.sh rules_updates 'test(hyperspace) | test(battleships_activate) | test(battlecruisers_activate) | test(bombers_activate) | test(destroyers_activate) | test(nanite_activation) | test(terraformer_activation) | test(activation_preserves_paid_work_and_retained_defenses)'
```

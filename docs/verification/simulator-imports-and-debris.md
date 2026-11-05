# Simulator imports and debris verification

Approved scope: Discord feedback #127 (Gh0stP1rate's owned-world defender import)
and #128 (sampled debris results). Based on main
`e8a96d81b47a06e7d06e441ee9716fc4a5b46be3` in an isolated managed worktree.
The final tested head and CI run are recorded in the PR and implementation chat.

## Behavior and boundaries

- Import is an explicit replacement of primary defender inputs. Ships default to
  zero unless included. Attacker and allied edits are retained. The accepted
  import's source description and values form a user draft, not a live copy of
  game state. Selection changes do not refresh it.
- Only bodies in the authenticated owned-world view are eligible. Stale/missing
  collections and unsupported included forces block imports. Complete sparse
  inventories and research retain their documented zero semantics. Moons use
  their own inventory and empire research. Oversized counts are never truncated.
- Importing over a report removes its loot observation from the battle draft;
  explicit report replacement restores observed/unknown defaults. Flight targets
  and Dispatch validation retain their existing behavior.
- Debris calls live `destroyed_ship_debris` for each battle's destroyed forces.
  Coverage checks custom valuation, percentages 0/3333/10000, deuterium on/off,
  aggregation before rounding across participants, varying casualties on both
  sides, and defenses excluded regardless of recovery probability. No live
  combat, moon creation, or harvesting rules changed.

## Local validation

The machine had competing browsers/builds. Used two Rust compilation workers,
two client-test workers and one browser worker. No other task's process was
stopped. Dependencies installed in 3s. No Docker project was started.

- All 1,348 client tests passed across 142 files (14.39s).
- All 11 application simulator tests passed (2.34s incremental compilation,
  0.05s execution after the fixture repair below).
- New contract test passed (0.149s process duration).
- Ten browser cases passed (1.826s module preparation; 24.6s browser runner),
  covering report imports/restoration, observed/unknown boundaries, errors,
  standalone manual drafts, allied technologies, flight estimates, Dispatch
  validation, and owned planet/moon imports at 1440×1000 and 390×1000.
- Static checks passed: Rust formatting, ESLint, Prettier, generated OpenAPI
  drift/schema checks and transport/workspace boundaries.
- Application Clippy with warnings denied passed (20.78s).
- Production web build passed (3.91s client Vite build, 0.274s prerender build;
  full command setup/type-check wall time was not separately captured).

Fresh desktop/mobile captures of planet import, moon import, report replacement
and debris results were inspected. Source metadata was moved beside the import
action after visual review, then all affected captures were refreshed. Images
stay in the implementation chat, not the PR description. Browser servers and
leased ports were cleaned up by the test runner. Full PostgreSQL coverage and
workspace server checks run in required CI; no local database result is claimed.
No queue enrollment, merge, deployment or recurring monitoring is authorized.

## Failure and repair record

The first new deterministic debris fixture failed during rules construction with
`RulesError::Range`: it set a zero shield, which violates the engine's nonzero
shield-quantum invariant. Inspection also identified that its custom ship cost
must match the progression catalog. Inspected simulator test history and
`docs/runbooks/test-performance-audit.md`; this new test had no prior repair and
no separate owner Test Czar ledger was available. One repair retained the valid
shield and updated both construction valuations. The repaired test and all
existing simulator tests passed. No retries, timeout changes, removed assertions
or test deletions were used. The first cold compilation duration was not retained.

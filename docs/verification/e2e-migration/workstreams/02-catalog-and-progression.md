# 02 — Catalog, manufacturing and technical details

Status: **merged in PR #406** (`7b2fa061`); implementation by chat `01a1d2ad-3969-7510-85ea-d05e9a356ab3` for the whole stream through PR and confirmed merge; see [assignment record](../STATUS.md#2026-11-12-rebase-and-stream-02-assignment). Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

catalog-pages still has 82 application cases, while the isolated detail gallery already has 48 and progression has 19 more. Several ship/item files retain identical comparison or form variants. manufacturing-order already covers changed prices and stale validation; repeating those schedules through the browser adds cost. The detail/progression scenes import createAppRouter and Coordinator, so their bundle still includes more application code than their visual contracts require.

Current owned inventory: **131 application cases and 67 component cases**. Full expanded identities: [current CSV](../inventory/02-current.csv). Original pre-migration cases: [baseline CSV](../inventory/02-baseline.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/battlecruiser.spec.ts` | 2 | 0 |
| `apps/web/tests/battleship.spec.ts` | 7 | 0 |
| `apps/web/tests/bomber.spec.ts` | 2 | 0 |
| `apps/web/tests/catalog-pages.spec.ts` | 82 | 2 |
| `apps/web/tests/components/detail.component.spec.ts` | 48 | 0 |
| `apps/web/tests/components/progression-comparison.component.spec.ts` | 4 | 0 |
| `apps/web/tests/components/progression-detail.component.spec.ts` | 13 | 0 |
| `apps/web/tests/components/progression-forms.component.spec.ts` | 2 | 0 |
| `apps/web/tests/cruiser.spec.ts` | 1 | 0 |
| `apps/web/tests/destroyer.spec.ts` | 2 | 0 |
| `apps/web/tests/fusion-reactor.spec.ts` | 2 | 0 |
| `apps/web/tests/heavy-fighter.spec.ts` | 4 | 0 |
| `apps/web/tests/hyperspace-drive.spec.ts` | 4 | 0 |
| `apps/web/tests/hyperspace-technology.spec.ts` | 4 | 0 |
| `apps/web/tests/industrial-buildings.spec.ts` | 4 | 0 |
| `apps/web/tests/large-cargo.spec.ts` | 3 | 0 |
| `apps/web/tests/research-network.spec.ts` | 6 | 0 |
| `apps/web/tests/solar-satellite.spec.ts` | 6 | 0 |
| `apps/web/tests/terraformer.spec.ts` | 2 | 0 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `features/progression/manufacturing-order`.
- `features/progression/catalog-tile-model`.
- `features/progression/technology-tree`.
- `features/progression/ship-comparison-model`.
- `dev/detail-playground`.

Existing coverage and repair ledgers:

- [test-migration-progression](../../test-migration-progression.md).
- [test-migration-catalog-content](../../test-migration-catalog-content.md).

## Work to complete

1. Use existing catalog-content contracts for per-item prerequisites, statistics, artwork decoding and exact costs; enumerate unique missing facts rather than replicate a generic item tour.
2. Move quantity, feedback, comparison, disclosure and technical-tree controls into the existing real-component scenes; trim full-router/provider dependencies where a smaller real provider is sufficient.
3. Keep essential catalog deep-link/history/context changes and representative manufacturing confirmation. Split assertions from multi-purpose tests before deleting their application source.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/storage-postgres/tests/progression.rs`.
- `crates/storage-postgres/tests/rules_updates`.
- `crates/engine/tests`.

## First bounded session

Start with the Battlecruiser/Bomber/Destroyer comparison-control cases and the existing progression-comparison scene. Keep every selection, keyboard and overflow assertion; consolidate only identical item permutations already covered by catalog-content contracts.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

01 owns resources/building-quotes and production autosave. 03 owns launching the ships. Do not change their specs to claim completion of catalog migration.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
npm test -- apps/web/src/features/progression/manufacturing-order.test.ts apps/web/src/features/progression/catalog-content-migration.test.ts apps/web/src/features/progression/ship-comparison-model.test.ts
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 02 in `docs/verification/e2e-migration/workstreams/02-catalog-and-progression.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

# 01 — Resources, quotes and production controls

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

52 resource and 42 building-quote cases still combine live balances, receipts, elapsed time, controls and navigation. The production-autosave controller already protects rapid edits, restored commands and rejected drafts; the four healthy application autosave/restoration cases were deliberately retained because mounted sliders, Retry and browser-storage restoration were not replaced. Quick-build timing and competing-command schedules still appear inside application tests.

Current owned inventory: **108 application cases and 0 component cases**. Full expanded identities: [current CSV](../inventory/01-current.csv). Original pre-migration cases: [baseline CSV](../inventory/01-baseline.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/building-quotes.spec.ts` | 42 | 0 |
| `apps/web/tests/catalog-affordability.spec.ts` | 2 | 0 |
| `apps/web/tests/locked-buildings.spec.ts` | 7 | 0 |
| `apps/web/tests/progression-cancellation.spec.ts` | 5 | 0 |
| `apps/web/tests/resources.spec.ts` | 52 | 0 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `features/progression/production-autosave`.
- `features/progression/progression-inspection`.
- `features/progression/use-building-quick-build`.
- `client-model/production-rates`.
- `client-model/work-cancellation`.

Existing coverage and repair ledgers:

- [test-migration-shell-profiles](../../test-migration-shell-profiles.md).
- [test-migration-progression](../../test-migration-progression.md).

## Work to complete

1. Move live affordability, changed quotes, competing orders and delayed inspection schedules to existing selectors/controllers; extract only missing quick-build lifecycle logic.
2. Mount real production controls for sliders, saved/error states, resource detail focus/tap, active cancellation and geometry. Preserve route-remount/storage restoration until equivalent wiring protection exists.
3. Consolidate application coverage to selected-body settings/history and representative paid/cancelled orders; coordinate catalog entry overlap with 02.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/storage-postgres/tests/progression.rs`.
- `crates/engine/tests/economy.rs`.
- `crates/engine/tests/progression_terms.rs`.

## First bounded session

Start with the quick-build restriction-code family and held-quote/body-switch cases in building-quotes. Reuse progression-inspection/options coverage, add meaningful missing controller cases, then move one prepared catalog-row interaction. Leave autosave/storage journeys untouched in this first slice.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

02 owns catalog-pages and the existing detail/progression component files. Coordinate shared quick-build/detail production edits before changing them.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
npm test -- apps/web/src/features/progression/production-autosave.test.ts apps/web/src/features/progression/progression-inspection.test.ts apps/web/src/client-model/work-cancellation.test.ts
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 01 in `docs/verification/e2e-migration/workstreams/01-resources-and-quotes.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

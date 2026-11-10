# 04 — Empire, lifecycle and settings

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

31 Empire cases mix wealth/inventory semantics with layout and route controls. Settings action and presentation seams exist. The mobile vacation journey was restored from main after the desktop version exhausted its repair; do not reverse that decision. The shared tutorial-settings component file contains both lifecycle and tutorial cases; this stream owns that existing file to avoid conflicting edits.

Current owned inventory: **56 application cases and 13 component cases**. Full expanded identities: [current CSV](../inventory/04-current.csv). Original pre-migration cases: [baseline CSV](../inventory/04-baseline.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/active-work-summary.spec.ts` | 11 | 0 |
| `apps/web/tests/components/tutorial-settings.component.spec.ts` | 13 | 0 |
| `apps/web/tests/empire-deletion.spec.ts` | 2 | 1 |
| `apps/web/tests/empire-history.spec.ts` | 2 | 1 |
| `apps/web/tests/empire.spec.ts` | 31 | 0 |
| `apps/web/tests/planet-abandonment.spec.ts` | 2 | 0 |
| `apps/web/tests/planet-names.spec.ts` | 5 | 0 |
| `apps/web/tests/vacation.spec.ts` | 3 | 1 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `features/empire-model`.
- `features/settings-action`.
- `features/arrival/model`.
- `features/active-work-card`.
- `features/tutorial`.

Existing coverage and repair ledgers:

- [test-migration-tutorial-settings](../../test-migration-tutorial-settings.md).
- [test-migration-galaxy-fleets](../../test-migration-galaxy-fleets.md).

## Work to complete

1. Move wealth, present-vs-carried units, history and work-label permutations to authoritative selectors/static presentation; isolate responsive Empire/active-work controls.
2. Preserve destructive-action review, stale drafts, pending/rejected/uncertain states, cancellation and focus in actual settings controls.
3. Keep distinct real route/command/storage journeys and map deletion, abandonment, vacation minimum/exit and identity revision invariants to server tests. Audit existing tutorial component cases without taking ownership of tutorial application migration.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/storage-postgres/tests/empire_deletion.rs`.
- `crates/storage-postgres/tests/empire_history.rs`.
- `crates/storage-postgres/tests/planet_names.rs`.
- `crates/engine/tests/missions/vacation.rs`.

## First bounded session

Start with Empire present-vs-carried resources, stationed ships and present defenses. Use empire/fleet models and real overview fragments; retain one overview layout/navigation case and all destructive-action journeys.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

06 owns tutorial application cases. It may add a dedicated tutorial component file; changes to the existing tutorial-settings file need a serial handoff from this owner.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
npm test -- apps/web/src/features/empire-model.test.ts apps/web/src/features/settings-action.test.ts apps/web/src/features/arrival/model.test.ts
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 04 in `docs/verification/e2e-migration/workstreams/04-empire-and-settings.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

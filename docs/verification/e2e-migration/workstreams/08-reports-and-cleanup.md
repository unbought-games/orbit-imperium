# 08 — Reports, sharing, deletion and history

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

43 of 59 application cases are report-deletion. Many cover explicit optimistic/uncertain/rate-limit schedules already partly represented by the report engine. Actual selection, loaded/unloaded history, list/detail return and browser-storage reload remain distinct contracts. Report facts already have static rendering/model coverage and seven isolated browser cases. Preserve the newly merged stored-missile visibility contract.

Current owned inventory: **59 application cases and 7 component cases**. Full expanded identities: [current CSV](../inventory/08-current.csv). Original pre-migration cases: [baseline CSV](../inventory/08-baseline.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/combat-reports.spec.ts` | 4 | 0 |
| `apps/web/tests/components/delivered-report.spec.ts` | 2 | 0 |
| `apps/web/tests/components/harvest-report.spec.ts` | 1 | 0 |
| `apps/web/tests/components/report-cleanup.spec.ts` | 2 | 0 |
| `apps/web/tests/components/shared-combat-report.spec.ts` | 2 | 0 |
| `apps/web/tests/espionage-reports.spec.ts` | 2 | 0 |
| `apps/web/tests/report-deletion.spec.ts` | 43 | 1 |
| `apps/web/tests/report-glance.spec.ts` | 2 | 0 |
| `apps/web/tests/report-sharing.spec.ts` | 8 | 1 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `client-model/report-engine`.
- `client-model/report-state`.
- `client-model/report-sharing-state`.
- `features/report-observation`.
- `features/report-preview-facts`.
- `features/use-report-cleanup`.

Existing coverage and repair ledgers:

- [test-migration-reports](../../test-migration-reports.md).

## Work to complete

1. Move independent rollback, bulk selection, request ordering and rate-limit state to engine/controllers with controlled transport; retain actual UI retry and durable reload semantics until equivalent integration exists.
2. Mount report tools, row actions, selection and confirmation; preserve focus, scroll anchors, contextual navigation and hidden-intelligence behavior.
3. Retain public report entry and representative durable delete/share journeys; map redaction, ownership, revocation and idempotency to real server tests.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/storage-postgres/tests/report_pages.rs`.
- `crates/storage-postgres/tests/report_sharing.rs`.
- `crates/application/src/report_sharing.rs`.
- `crates/transport-http/src/shared_report_preview.rs`.

## First bounded session

Start with independent-delete rollback and archive acceptance/rejection/uncertainty permutations. Extend report-engine/state tests and real cleanup component coverage; do not remove the durable reload/same-command-identity journey.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

06 owns HUD list/observer wiring and 05 owns shell unread badges. Send exact coverage handoffs rather than editing their specs.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
npm test -- apps/web/src/client-model/report-engine.test.ts apps/web/src/client-model/report-state.test.ts apps/web/src/features/report-observation.test.ts apps/web/src/features/report-preview.test.ts
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 08 in `docs/verification/e2e-migration/workstreams/08-reports-and-cleanup.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

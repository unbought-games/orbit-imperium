# 10 — Final journey gate, CI cutover and agent guidance

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

39 cases are currently tagged journey but tags were a phase-one candidate set. Some are component-like (alliance loading, bulk selection rollback, expired cursor recovery), while others protect native route/history/entry. Final required selection must derive from unique integration contracts, not keep the current number by fiat. PostgreSQL rest was the final PR CI critical path; browser-only savings cannot establish end-to-end merge savings.

Current owned inventory: **0 application cases and 0 component cases**. The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| Final policy/selection only; no independent browser file ownership | 0 | 0 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `playwright.config.ts`.
- `playwright.components.config.ts`.
- `.github/workflows/ci.yml`.
- `scripts/test-policy.test.mjs`.
- `Makefile`.
- `.agents/skills/test-design`.

## Work to complete

1. Review each journey candidate and any newly justified wiring contract, using the completed owner maps. Remove the temporary feature cohort only when every case has a validated disposition; retain required deterministic/component checks.
2. Reconcile case ownership, retirement gaps, explicit acceptance results, Make/npm commands, selection-union checks, failure diagnostics and the test-design skill. Delete obsolete migration-only scaffolding with rationale.
3. Verify exact PR/merge-group/main revisions, record first-attempt results and phase timings across the next five naturally occurring merged PR lifecycles, and close every actionable reliability defect with an owner.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `scripts/ci-workflows.test.mjs`.
- `scripts/test-policy.test.mjs`.
- `.github/workflows/explicit-tests.yml`.

## First bounded session

Begin with the 39-row journey shortlist and the coverage gaps in AUDIT.md. Write the final contract matrix and identify which domain owner supplies each missing replacement; keep current required selection unchanged. The final cutover waits for 01–09.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

Owns final required-check selection and global guidance. Do not change branch protections, move unfinished tests to optional/scheduled jobs, introduce a scheduler, or auto-retry failures.

Final completion depends on 01, 02, 03, 04, 05, 06, 07, 08, 09. Initial matrix/design work can start immediately.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
node --test scripts/test-policy.test.mjs scripts/ci-workflows.test.mjs
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 10 in `docs/verification/e2e-migration/workstreams/10-cutover-and-reliability.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

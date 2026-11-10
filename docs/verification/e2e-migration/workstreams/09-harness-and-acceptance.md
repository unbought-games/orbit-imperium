# 09 — Shared harness, contracts and explicit acceptance

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

Both routine boundaries now precompile fixtures. Components reject API requests/page errors, but application game fixtures return a generic 404 for unknown API calls without independently failing the test. The base fixture wraps browser.newContext for default announcements; audit its scope/cleanup before changing it. Core and other explicit browser suites contribute 22 cases; recovery, migrations, rolling updates and container checks are scripts rather than Playwright counts. Built-homepage contributes 10 separate cases.

Current owned inventory: **0 application cases and 0 component cases**. Full expanded identities: [current CSV](../inventory/09-current.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/bootstrap.spec.ts` | 2 | 0 |
| `apps/web/tests/construction.spec.ts` | 1 | 0 |
| `apps/web/tests/homepage-built.spec.ts` | 10 | 0 |
| `apps/web/tests/login.spec.ts` | 1 | 0 |
| `apps/web/tests/missions.spec.ts` | 2 | 0 |
| `apps/web/tests/mvp.spec.ts` | 1 | 0 |
| `apps/web/tests/progression.spec.ts` | 1 | 0 |
| `apps/web/tests/raiding.spec.ts` | 2 | 0 |
| `apps/web/tests/reconnect.spec.ts` | 4 | 0 |
| `apps/web/tests/responsive.spec.ts` | 3 | 0 |
| `apps/web/tests/routing.spec.ts` | 2 | 0 |
| `apps/web/tests/signup.spec.ts` | 1 | 0 |
| `apps/web/tests/transport.spec.ts` | 1 | 0 |
| `apps/web/tests/zfoundation.spec.ts` | 1 | 0 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `tests/fixtures/test`.
- `tests/fixtures/game`.
- `tests/fixtures/responses`.
- `tests/components/fixture`.
- `scripts/ui-e2e.mjs`.
- `scripts/*-e2e.mjs`.
- `scripts/recovery.mjs`.
- `scripts/container-smoke.mjs`.

## Work to complete

1. Implement justified shared fixture hardening once: explicit unexpected-operation diagnostics and deliberate negative-test opt-outs, complete response matching and cleanup, extra-context scope. Audit every affected caller; do not install blanket successful mocks.
2. Validate actual production/API contract boundaries and the explicit acceptance matrix in AUDIT.md; retain unique signup, persistence, recovery, migration, rolling-update, production-image and homepage assertions.
3. Measure setup/build duplication and make bounded native-runner improvements only with evidence. Preserve Make-owned parallelism, disposable database isolation, routine no-deadline policy and explicit-suite guards.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/transport-http/src/bound_api.rs`.
- `crates/storage-postgres/tests/http.rs`.
- `crates/storage-postgres/tests/security.rs`.
- `crates/storage-postgres/tests/ordering.rs`.
- `crates/storage-postgres/tests/migrations.rs`.

## First bounded session

Start with application unknown-API handling in fixtures/game.ts. Inventory intentional 404/error tests, introduce a diagnostic failure contract with explicit expected failures, and run only its affected callers before broader integration. Do not combine this with acceptance/CI optimization in one slice.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

Sole owner of shared fixture files, Vite/Playwright configs and runner implementation. Domain owners may supply registry entries; integrate them serially. Coordinate with 10 before changing required selection.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
node --test scripts/test-policy.test.mjs scripts/ci-workflows.test.mjs scripts/fixtures/response-readiness.test.mjs
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

Acceptance commands and prerequisites are enumerated in [AUDIT.md](../AUDIT.md#explicit-acceptance-and-production-artifacts). Run only the affected explicit suites while iterating; complete the final agreed acceptance matrix before closing this stream. No production deployment or real account action is part of this work.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 09 in `docs/verification/e2e-migration/workstreams/09-harness-and-acceptance.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

---
name: test-design
description: Design, write, review, migrate, or repair Orbit Imperium tests and diagnose CI failures. Use when choosing regression coverage or changing test fixtures, runners, or CI test selection. Distinguish product regressions, test defects, and infrastructure incidents.
---

# Test design

Read the applicable [AGENTS.md](../../../AGENTS.md) and
[testing strategy](../../../docs/architecture/testing-strategy.md). The strategy
defines the intended layers and migration status; existing tests are evidence
of behavior, not automatically examples of good test placement.

## Choose the boundary before writing the test

Name the concrete regression: **given this state, when this action occurs, this
observable result must hold**. Identify the production code that owns it and
the smallest boundary that can expose its failure. Check existing coverage.
Do not add a test merely because a file changed or to increase a count.

| Regression | Preferred boundary |
|---|---|
| Arithmetic, eligibility, formatting, state transitions | Pure function, selector, or model |
| Expiry, stale completion, cancellation, retry ordering | Controller with controlled time and explicitly resolved promises |
| Authorization, replay, idempotency, persistence races | Real HTTP/application/database boundary appropriate to the invariant |
| Labels, conditional content, semantic markup | Component render; static rendering only for static claims |
| Form interactions, keyboard, focus, gestures, layout | Smallest interactive component; real browser for browser-dependent behavior |
| Route history, reload, deep links, application wiring | Short application browser journey |
| Real authentication, client/server compatibility, deployment/recovery | Explicit full-system acceptance |

Move permutations below the browser. Use viewport variants only where a distinct
layout or input mode can break; do not multiply domain cases by screen size.
Mock the external boundary, not the production behavior under test. A mocked
successful command cannot prove server authorization or persistence. A static
render cannot prove focus, event handlers, hydration, or layout.

Before adding or migrating browser coverage, read
[examples and browser contracts](references/browser-contracts.md). The intended
small merge gate does not authorize silently deselecting existing tests. Follow
the coverage-preserving migration in the strategy.

## Make the test explain its failure

- Arrange required state directly using typed, minimal fixtures. Navigate
  through setup only when that navigation is the regression being tested.
- Assert the result from the requirement or a fixed example, not by calling
  the same implementation to calculate both actual and expected values.
- Drive public behavior of the chosen boundary. Checking only a mock invocation
  or private representation is insufficient unless that interaction is the
  contract being protected.
- For races, choose completion order explicitly. For time, establish a known
  epoch and advance only after the previous asynchronous phase has settled.
  Sleeping and advancing a fake clock do not establish HTTP or React readiness.
- Keep scenarios independent. Release subscriptions, handlers, held responses,
  timers and task-owned resources. Avoid global mocks leaking between cases.
- Demonstrate that the assertion detects the regression when practical: run it
  against known broken behavior or make a narrow temporary fault locally, then
  restore it. Do not add mutation infrastructure for a routine change.

## Diagnose before repairing or rerunning

Read [failure classification](references/failures.md) when investigating a
failure. Inspect the exact revision, workflow attempt, failing step and retained
evidence. An aggregate gate failure is not a root cause. An outage overlapping
an assertion failure does not by itself explain that assertion.

Apply the repository's one-repair rule to defective tests, after checking their
history and the [repair ledger](../../../docs/runbooks/test-performance-audit.md).
Record the disposition there or in the feature's verification record. Proven
runner/service infrastructure failures do not consume a test repair attempt.
Do not delete a test exposing a real product regression to make CI pass.

## Use installed runners and report what passed

When several agents or chats share a machine, parallelize implementation and
assign one owner to expensive validation. Serialize browser suites, production
builds and full typechecks across the collaborating tasks; one worker per chat
does not bound their combined load. Before launching, check what the other tasks
are running. Hand off pending checks to the validation owner instead of duplicating
them. Keep preparation, runner wait and execution timings separate. Stop only
task-owned processes, preserve interrupted-run evidence, and never treat resource
contention as permission to retry an unexplained failure until it passes.

Inspect Make/npm targets and pinned versions before invoking new APIs or adding
dependencies. Current entrypoints include:

| Scope | Command |
|---|---|
| Focused client tests | `npm test -- src/path/example.test.ts` |
| Client, server, tooling and static/build checks | `make check` |
| HTTP | `make test-http` |
| Focused PostgreSQL binary | `make test-db DB_SUITES=<binary> DB_JOBS=2` |
| Focused fixture browser | `npm run test:ui -- example.spec.ts -g 'scenario'` |
| Isolated components | `npm run test:components -- example.component.spec.ts` |
| Essential application journeys | `make test-journeys` |
| Remaining required feature integrations | `make test-features` |
| Explicit acceptance | `make test-explicit SUITE=<suite>` |

Commands run from the repository root. PostgreSQL and explicit suites require
the disposable setup in the [runner guide](../../../docs/runbooks/ci-runners.md).
Full-system acceptance remains explicit-only. This skill grants no additional
permission to publish, deploy, modify protections, or send external messages.

Run the affected layer first, then required integration/static checks. Stop
repeating green checks without new evidence. Do not add retries, sleeps, timeout
increases, or routine execution deadlines as a reliability repair. Preserve the
repository's existing timeout policy and functional timeout assertions.

Report the revision plus uncommitted test changes, actual commands/results,
failures and repair history, setup/execution/runner-wait timings when available,
and cleanup. Say when timings or evidence are unavailable. A green retry is not
a repair. Automated assertions do not replace the UI skill's visual review.

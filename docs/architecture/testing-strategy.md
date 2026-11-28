# Testing strategy

Use the smallest boundary that can fail for the same reason as the player’s workflow. Economy calculations belong with the model, an unauthorized mutation belongs at the server, and native focus belongs on a real control. Going through login and application bootstrap to arrange any of those conditions makes failures harder to diagnose.

| Boundary | What it protects | Execution |
| --- | --- | --- |
| Node, Vitest and Rust | Tooling, schema, calculations, action decisions, view projection and state transitions. Controllers use held completions and a controlled clock for ordering, expiry and retry. | Required on PRs, merge groups and main |
| HTTP and PostgreSQL | Request identity, authentication, binding, admission, payment, replay, isolation, durable outcomes and restart invariants | HTTP in native checks, PostgreSQL under the changed-path selector |
| Mounted components | Production views, hooks and controllers with prepared external inputs. Native controls, focus, touch, layout, subscriptions and observers run in Chromium. | `make test-components` on relevant changes |
| Application journeys | Real client entry, browser history and reload, modal ownership, selected worlds, cross-screen delivery and representative submitted actions | `make test-journeys` on relevant changes |
| Production assets | Built homepage documents and native assets, including hydration and install metadata. The separate release-image job builds and inspects the distributable artifact. | Built homepage alongside relevant journeys, image packaging under its own relevance selector |
| Explicit acceptance | Real signup and authentication, client/server/database compatibility, process recovery, old/new migration overlap, rolling updates and container startup/restart | Explicit Make targets and the manual workflow |

## Adding or changing coverage

Name the user action, production owner and observable result first. Use a fixed example or an independently prepared expected result. Test a shared selector’s state permutations once, then exercise the real control that consumes it. An isolated render can protect labels and semantics. Keyboard activation, scroll ownership, observation of a new store value and return of focus require an interactive consumer.

Application cases have a [reviewed contract](../../apps/web/tests/journey-contracts.json) identifying the defect each one catches. When changing a case, update its complete title path and risk. Keep its case ID and repair history in the migration evidence when moving or consolidating it. The application config selects the files from this contract list. Native discovery independently enumerates the test directory and verifies the complete union against CI’s actual boundaries. Each browser job also checks its completed Playwright report, so a skipped case or misrouted npm command cannot satisfy the gate.

Fixture bundles are prebuilt, contain the development client, and run against controlled external ports. Validate complete successful delivery before relying on the resulting UI state. Gate intentional refusals by their expected status and operation. The shared fixture fails unexpected application operations in the default and auxiliary contexts. Record the server or explicit acceptance test for claims about authorization or persisted results.

Use the [test-design skill](../../.agents/skills/test-design/SKILL.md) and its [fresh adversarial review procedure](../../.agents/skills/test-design/references/browser-review.md) for material browser changes. The [runner guide](../runbooks/ci-runners.md) covers commands, isolation and diagnostics.

## Reliability

Fix demonstrated product defects and keep the tests that expose them. A defective test gets one evidence-based repair. After a recurrence, preserve the failed attempts, retire the defective sequence and document any browser coverage that was lost. Retain sound original coverage when a proposed replacement fails to establish the same behavior. Infrastructure failures and cancellations have separate evidence and do not consume a test repair.

Routine CI uses the native no-execution-deadline settings. Keep functional request and readiness timeouts, and use the separate generous guards for explicit runs. On shared hardware one owner serializes browser suites, full typechecks and production builds. Record preparation, execution, runner wait and queue residence separately where the evidence supports it.

## Migration record

Phase one established the mounted harness and inventory in #385. The domain migrations and final cutover are reconciled in the [completion record](../verification/test-migration-cutover.md), including exact identities and retired browser-specific gaps. The original [phase-one plan](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/docs/architecture/testing-strategy.md) preserves the former file ownership and temporary broad cohort.

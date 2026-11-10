# Examples and browser contracts

## Split coverage by what can actually fail

| Request | Deterministic protection | Browser protection that earns its cost |
|---|---|---|
| Compact toast stack | Event order, promotion, dismissal thresholds, expiry | Mount prepared notices; verify covered cards cannot intercept input, dismiss the top card, verify promotion/focus. Separately verify one application action produces a notice. |
| Supporter badge refresh | Profile controller: expiry, unavailable refresh, changed tiers, stale response fencing | One representative identity renders in its actual consumer; viewport cases only for distinct layout behavior. |
| Manufacturing affordability | Boundary arithmetic, selected body, quote validity, balance changes | Submit a representative order through actual controls; observe pending and completed states. |
| Resource-settings navigation | Route/query normalization | Enter through the real link, verify destination and focus; retain history/reload in the scenario responsible for that contract. |
| Unauthorized cancellation | HTTP auth and database ownership/idempotency | Browser proves the error is communicated; a fixture rejection does not prove server authorization. |

Examples are decomposition guidance, not permission to recreate a scenario
retired under the one-repair rule. Preserve the removal record and use the
appropriate lower layer for retained invariants.

When moving a healthy interaction test, preserve its inputs and interaction
scope before adding new coverage. Combining previously separate touch/keyboard
phases or changing the response schedule creates a different scenario; validate
that separately. Keep the original required assertions until their replacement
passes. A failed migration is not a reason to discard healthy source coverage.

## Current tooling versus the target

Client tests in `apps/web/src/**/*.test.ts` use Vitest; `renderToStaticMarkup`
covers static output only. Interactive components use the shared test-only
[gallery](../../../../apps/web/tests/components/main.tsx) and
[fixture](../../../../apps/web/tests/components/fixture.ts), through
`npm run test:components`. Register a lazy scenario, import `test` and `expect`
from `./fixture`, and call `await mount('scenario-name')`. The mount contract
waits for the actual render; unexpected game API requests and page errors fail.

Mount the real component with necessary providers and prepared inputs. Use the
actual hook/controller with controlled external ports when that boundary is
under test. Keep application bootstrap, routing and unrelated network clients
out unless required by the behavior. Do not create a production test backdoor.
DOM simulation cannot prove geometry, native focus or pointer interactions.

Preserve structural layout inputs too: shell gutters, container-query boundaries,
and article/list semantics are part of a component's caller contract. Keep
diagnostic outputs from adding their own overflow. Fix an incomplete scene rather
than changing production CSS or weakening its geometry assertions.

Keep Node-side test data (IDs, records, timestamps) separate from browser-only
factories and views. Use type-only imports for scene control interfaces. A Node
spec must not import a component or Coordinator factory just to obtain an ID:
that pulls browser dependencies into collection before a browser exists.

Application fixture tests use a prebuilt test bundle, preserving development
previews without compiling routes during assertions. The separate production
homepage check still owns release-asset validation. Never claim the fixture
bundle is the production release artifact. Check pinned versions before using
APIs from newer Playwright documentation.

Useful existing deterministic examples:

- [toast-swipe.test.ts](../../../../apps/web/src/ui/toast-swipe.test.ts): swipe intent thresholds.
- [player-profiles.test.ts](../../../../apps/web/src/client-model/player-profiles.test.ts): controller expiry and stale completion.
- [resource-mark.test.ts](../../../../apps/web/src/ui/resource-mark.test.ts): static component output.

## Application browser contracts

State the browser-specific reason in the name or a short nearby comment. Start
at the closest valid application state; avoid tours through unrelated pages.
Keep one coherent journey per case. Preparing a toast through fourteen fleet
launches mixes command execution, refresh, scrolling, notification history and
gestures into one failure path; prepare notices for the component test instead.

For routine HTTP fixtures:

1. Install routes/data before navigation. Type fixtures against the actual
   contract; preserve binding, revision and request identity where required.
   Invalid fixtures belong only in tests of invalid input handling.
2. Register the appropriate response listener before the action. Match the
   operation, identity, body and revision needed by the next assertion where
   applicable. An unrelated poll or unread-count query is not report-list
   readiness. Multi-document navigation must reach the final document, not
   merely finish an earlier bootstrap.
3. Require successful complete delivery, then assert the rendered result.
   Use the existing [response helpers](../../../../apps/web/tests/fixtures/responses.ts)
   where they express that exact boundary. Do not wrap every navigation in an
   indiscriminate bootstrap wait; some pages do not request it.
4. For loading/error cases, hold or fail the specific response, assert the
   intermediate state, then release it and assert recovery. Register completion
   listeners before releasing. Settle earlier requests before changing fixture
   policy or advancing to another scenario.

Fixture-only tests must not depend on an actual backend or third-party service.
Unexpected API requests need explicit diagnostic failures, including their
method/path/operation; do not silence them with blanket successful responses.
Distinguish expected static/module requests and intentional network errors.
When the shared fixture lacks this enforcement, implement it once and audit its
callers; do not add a different network interceptor to every spec.

## Interaction and time

- Assert user-visible results and semantic controls. Avoid broad CSS snapshots
  or DOM-shape assumptions unless that shape is the regression contract.
- A prior navigation can still move focus. Establish its destination and focus
  before sending keyboard input; verify the resulting route/state.
- Establish the clock at a known epoch before time-dependent behavior starts.
  Do not install a running clock then pause it at an already-past timestamp.
  Await asynchronous completion separately from time advancement.
- Keep animation curves and timing permutations below the application layer.
  Browser checks prove meaningful start/end behavior, focus and hit targets.
  Where motion matters, use a controlled component scenario; do not depend on
  catching a fleeting intermediate frame on a loaded runner.
- Use reduced motion only when motion is not the tested contract. It must not
  conceal broken normal-motion interactions.
- Do not weaken assertions to accept the wrong state, rerun until lucky, or use
  screenshots as a delay. Optional capture must do no preparation when disabled;
  retain failure diagnostics independently.

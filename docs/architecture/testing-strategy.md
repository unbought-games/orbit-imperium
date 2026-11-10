# Testing strategy

## Decision and implementation status

The agreed direction is a small, deliberate browser merge gate, with most
behavior covered by deterministic tests and isolated component tests. Broad
full-system acceptance remains explicit-only.

The [test-design skill](../../.agents/skills/test-design/SKILL.md) defines the
authoring workflow. An isolated component gallery and tagged application journey
cohort are implemented. CI partitions required browser work into journeys,
components, and remaining feature integrations; its inventory check rejects
omissions and duplicates. Remaining feature cases stay required until verified
replacements exist. This is not permission to quarantine valuable assertions.
See [current runner behavior](../runbooks/ci-runners.md) and the individual
`docs/verification/test-migration-*.md` coverage maps.

## Coverage boundaries

| Layer | Responsibility | Execution policy |
|---|---|---|
| Unit, model and controller | Calculations, state permutations, eligibility, expiry, response ordering and cancellation | Routine required checks |
| HTTP and PostgreSQL | Authorization, contracts, transactions, replay, idempotency and persistence races | Routine checks with existing relevance selection and isolation |
| Isolated components | Static semantics and interactive controls; real browser where layout, focus or gestures require it | Focused local feedback and relevant required checks as the shared harness is implemented |
| Application browser journeys | Essential routing, deep links, reload/history and representative command wiring | Small required gate; each case justified by unique browser protection |
| Full-system acceptance | Actual client/server/database integration, auth journeys, recovery and deployment compatibility | Explicit Make/manual workflow validation |

Fixture browser tests are frontend integration tests. They cannot establish that
the server accepts a valid command, rejects an unauthorized one, or persists a
result. Component tests exercise actual components with prepared state; they
must not reproduce the component implementation in a mock.

The application gate covers distinct integration risks, not every game item,
resource amount or viewport permutation. Candidates are application entry,
canonical deep links, navigation/history, a submitted command and its observable
result, and materially different mobile navigation. The inventory must identify
which cases provide this protection; selection and validation remain work.

## Migration and completion criteria

1. Inventory existing browser scenarios by protected behavior and owning
   production code. Record each disposition: retain in the application gate,
   move to a lower layer, consolidate with named coverage, retain only in
   explicit acceptance, or remove as obsolete/defective. Include repair history.
   Do not equate cancellations or infrastructure incidents with flaky tests.
2. Build a shared interactive component foundation using existing tools. Prove
   it on representative notification interaction, controlled asynchronous state
   and form submission before broad conversion. Keep test entrypoints out of
   production delivery and test-only state out of production components.
3. Migrate bounded groups. Every removed assertion needs a named retained test
   or an explicit explanation of why it is obsolete or unsuitable. Static
   markup cannot replace keyboard/focus/layout assertions. Use known broken
   behavior when available to demonstrate that replacements protect it.
4. Reduce CI selection only after replacement coverage passes. Preserve required
   checks and merge-queue protections. Update selection checks, Make/npm commands
   and runner documentation with the actual change. Do not merely move an
   unreliable suite to a nonblocking or scheduled job.
5. Verify resulting layers locally and on exact PR/integration revisions.
   Compare first-attempt reliability, preparation/execution/queue time and merge
   delay. Report infrastructure incidents and incomplete runs separately.
   A green retry alone does not close a known reliability defect.

Parallel implementation shares one validation owner on a shared machine. Run
browser suites, production builds and full typechecks serially across chats;
separate checkouts and per-chat worker limits do not isolate CPU or memory.
Preserve failed/interrupted-run evidence and report pending checks in handoffs.

Migration is complete when every existing scenario has a recorded disposition,
replacement coverage has passed, the small gate is actually configured, and
authoring guidance matches the installed harness. An arbitrary test-count target
does not substitute for these criteria.

## Failure handling and operating constraints

Classify product, test, infrastructure, cancellation and unknown failures before
acting. Fix product regressions without deleting protection. Apply the existing
one-repair rule to defective tests. Confirmed GitHub/runner/service failures do
not consume that repair attempt; preserve evidence and use an appropriate
bounded retry. Outage timing alone cannot excuse a failed assertion.

Preserve the existing no-execution-deadline policy for routine CI, functional
timeout behavior, database isolation and Make-owned parallelism. Changing those
policies requires an explicit request; this strategy adds no custom scheduler
or automatic retry system. Diagnose unresolved waits at the outstanding operation
instead of increasing timeouts or depending on sleeps.

Keep PR, merge-group and main validation responsibilities explicit. Any future
reuse of results must establish equivalent revision, environment and coverage
and preserve release-image prerequisites; do not skip main checks merely because
queue CI was green.

## Completing the migration after phase one

Phase one is PR #385. Its main-integrated inventory contains 816 application
cases (39 tagged journeys and 777 other required cases), plus 271 isolated
component cases after the documented CI retirement of one recurring touch
scenario. These counts are a starting inventory, not a target for how
many replacements to write. New tests added after this snapshot also need an
owner and disposition.

Use two implementation chats with disjoint application-spec ownership and one
integration/validation owner. Start their branches from the merged phase-one
revision. Inventory each owned case by full title path/project, protected
behavior, production owner, repair history, and proposed destination before
removing coverage. Review the existing 39 journeys too: a tag is not proof that
a case earns its place in the final gate.

| Chat | Scope | Initial application inventory | First useful batches |
| --- | --- | --- | --- |
| Gameplay | Economy, progression, Dispatch, fleets/Galaxy, Empire actions | 415 cases in 40 files, including existing journeys | Catalog/quote/resource permutations, then fleet/Galaxy and command wiring |
| Shell, social and reports | Bootstrap/recovery, HUD/navigation, tutorial, profiles/alliances and report interactions | 401 cases in 33 files, including existing journeys | Shell/bootstrap/HUD state permutations, then report deletion/sharing and social flows |
| Integration owner | Shared harness, fixture registry, runner/CI selection, complete coverage map and validation | No independent migration batch | Review replacements, integrate bounded batches, run expensive checks serially |

Production edits follow the owning feature. Shared store/provider/API and
navigation/identity changes must be coordinated with the integration owner
before either chat edits them. The integration owner owns shared component
registry/fixture changes, Make/npm, Playwright/Vite configuration, workflows and
strategy documentation. Each chat supplies its registry additions in its
handoff, avoiding competing edits. Do not launch builds, browser suites or full
typechecks concurrently; cheap focused deterministic tests can run independently.

Each batch must deliver:

- Real production seams where needed, with behavior and authoritative state
  ownership preserved; fixtures mock external ports rather than the logic under test.
- Passing replacements at the cheapest valid boundary. Pure/controller tests
  cover rules and race schedules; interactive components cover real handlers,
  focus, gestures and layout. Keep a short application journey only for a unique
  integration risk. Use HTTP/database tests for actual server invariants.
- A named mapping from every removed assertion to retained protection, or a
  justified obsolete/duplicate/defective disposition. Explicitly identify any
  lost browser wiring; do not describe a mocked component as server coverage.
- Exact revision, focused test results, outstanding expensive validation, and
  failure/repair evidence. Preserve deliberate loading/error/race coverage.

Deliver small independently reviewable batches; do not wait for another giant
all-at-once migration. The integration owner verifies each replacement before
removing the original selection, incorporates other main changes, and owns the
PR/merge-queue follow-through.

The final cutover is complete only when all application cases have a disposition,
all worthwhile replacements pass, and every remaining routine application case
has a named unique journey risk. Remove the temporary broad feature cohort only
then. Continue requiring deterministic and relevant component coverage; do not
move unfinished work to optional/scheduled suites. Verify the selection union,
PR checks, merge-group checks, and resulting main revision. Reconcile authoring
guidance with the final commands and keep explicit full-system acceptance separate.

Measure preparation, execution, runner allocation, queue residence and total
merge delay separately. Retain every failed attempt and queue removal, classified
as product, test, infrastructure, cancellation or unknown. Compare first-attempt
results across actual PR/queue/main runs; a single green run cannot establish a
new flake rate. No arbitrary test-count reduction or green retry closes the work.

### Initial file ownership

Names below are `apps/web/tests/<name>.spec.ts`. The manifest covers all 73
application spec files in the phase-one integrated inventory.

Gameplay:

- `active-work-summary`, `alliance-attacks`, `alliance-depot`, `arrival`, `battlecruiser`.
- `battleship`, `bomber`, `building-quotes`, `catalog-affordability`, `catalog-pages`.
- `colonization`, `combat-simulation`, `cruiser`, `destroyer`, `dispatch-validation`.
- `empire`, `empire-deletion`, `empire-history`, `fleet-inventory`, `fusion-reactor`.
- `galaxy-cards`, `heavy-fighter`, `hyperspace-drive`, `hyperspace-technology`, `industrial-buildings`.
- `large-cargo`, `locked-buildings`, `missile-warfare`, `mission-fleets`, `moon-fleets`.
- `moons`, `planet-abandonment`, `planet-names`, `progression-cancellation`, `research-network`.
- `resources`, `sensor-phalanx`, `solar-satellite`, `terraformer`, `vacation`.

Shell, social and reports:

- `alliance-identity`, `alliances`, `bootstrap-ui`, `client-update`, `combat-reports`.
- `command-hud`, `content-updates`, `coordinate-links`, `density`, `desktop-navigation`.
- `detail-playground`, `empire-identity`, `espionage-reports`, `high-scores`, `home`.
- `hosted-auth`, `hud-playground`, `insignias`, `loading-region`, `mobile-selection`.
- `number-input`, `planet-page-routing`, `player-profiles`, `recruitment`, `release-announcement`.
- `report-deletion`, `report-glance`, `report-sharing`, `shell`, `social`.
- `tutorial`, `tutorial-advisor`, `web-app`.

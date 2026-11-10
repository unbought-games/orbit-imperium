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

Phase one merged as PR #385 at `0c235fd6`. The up-front audit and complete
remaining plan now live in [e2e migration workstreams](../verification/e2e-migration/README.md).
That durable handoff supersedes the initial two-chat proposal with ten bounded,
resumable workstreams, a frozen case/file inventory, known coverage gaps,
explicit acceptance obligations and a status log. Use the selected brief rather
than repeating the repository-wide audit in each new chat.

The audited snapshot has 816 required application cases (39 journey candidates
and 777 feature integrations), 271 isolated component cases, ten production
homepage cases and 22 browser cases in explicit acceptance. Script/native
acceptance is inventoried separately. The original 1,183 application cases are
also indexed for historical reconciliation. See the audit for exact revisions,
provenance, evidence limits and completion criteria.

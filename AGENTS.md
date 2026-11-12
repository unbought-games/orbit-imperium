# Global Rules

- Never store derived state. Derived state creates a whole class of errors that can easily be avoided by deriving the values from the source of truth. This is a global pattern and should never be broken.
- React components should be light-weight with no heavy inline logic. Simple value transformations are acceptable. Heavy logic should be extracted into custom hooks and functions and thoroughly tested.
- Server functions, API routes should be treated the same way - no heavy logic. All logic should be pulled out into functions and either thoroughly tested with unit or integration tests.

# Cosmetic content and distribution

- Game customization content shipped in this public repository is free content for self-hosted servers and free accounts on official servers. Keep it covered by the applicable repository license; do not bundle paid or supporter-only originals.
- Paid and supporter-only content belongs in a separate private content repository and is published separately for official servers. This includes artwork, titles, mottos, catalog text, previews, and authoring sources. Do not copy it into public source, fixtures, frontend bundles, binaries, or community release artifacts.
- Keep catalog loaders, editors, access rules, and reusable formats open source. Self-hosters can install their own content without contacting Unbought. An unrestricted access policy only unlocks installed content; it must never fetch official paid content.
- Use independently authored, freely licensed fixtures to test restricted content. Preserve saved selections and permanent grants when content is unavailable; derive a free fallback instead of deleting player choices.
- Before changing cosmetic content or its delivery, read [ADR 002](docs/architecture/adr-002-hosted-cosmetic-content.md) and the [operator guide](docs/operations/empire-customization.md). Keep private repository names, URLs, and deployment details out of public guidance.

# Brand name

Write **Unbought Games** with capital U and G in all text. The lowercase
**unbought games** styling is reserved for the logo only.

# UI design

Before designing, implementing, reviewing, or fixing UI, use the repository
[ui-design skill](.agents/skills/ui-design/SKILL.md) and read the
[UI design guide](apps/web/src/ui/README.md). This includes small styling, copy,
layout, and interaction changes. Follow the guide's component links only when
implementation details are needed.

# Pull requests

All pull request titles must follow Conventional Commits (for example, `fix: correct database initialization` or `feat: add universe seeding`). Pull requests are squash-merged, so the PR title becomes the commit title. Verify the title before creating or updating a PR.

## Changelog

`CHANGELOG.md` is an index of numbered releases, updated only during release
preparation. Never add an `Unreleased` section or unreleased change entries.
Feature and fix PRs must leave it untouched. Keep change-specific notes and
contributor acknowledgments in individual files under `docs/news/changes/`;
assemble the version's complete notes from those files and Git/PR history during
release preparation.

## Contributor credit

Credit every external contributor in the release notes for their included work,
including coauthors and documentation, testing, artwork, translation, and verified
reports or reviews that led to a change. Preserve attribution when integrating or
squashing their work. Add credit to the relevant build note when the contribution
lands, then carry it into the numbered release notes during release preparation.
Follow the [contributor credit process](docs/operations/open-source-releases.md#contributor-credit)
when preparing or refreshing notes; editorial filtering must not drop contributors.

## UI screenshots

For every user interface change, capture and inspect the final running
implementation at both desktop and mobile viewport sizes. Cover each changed
screen and relevant interaction state, label each image with its screen/state
and viewport dimensions, and fix visible defects. Refresh affected captures
after subsequent UI fixes.

Display these screenshots inline in the originating implementation chat's final
response using absolute local image paths. Show current screenshots in that chat
before enqueueing or merging a UI PR as well.

Screenshots belong in the chat, not the PR description. Do not upload or host
images for a PR or use browser drag-and-drop to attach them unless the user
explicitly requests it. Image hosting is not a readiness or merge requirement.
If capture or inline display in the chat is blocked, report the concrete blocker
rather than silently omitting visual review. PRs without UI changes may mark
visual validation as not applicable.

# Frontend state

- Selected planets and moons belong in the URL path: `/u/<universe>/b/<body>/<page>`.
  This applies to every game destination, including Menu and Rewards. Never
  generate `?body=` or store selected-body context in search parameters. Use the
  shared `routeTarget` helper for links and navigation. Planetless entry points
  may resolve an owned body and replace the URL with its canonical path. Legacy
  body queries are input-only compatibility: validate ownership, immediately
  replace them with the path form, and remove the query before rendering a page.
  Ordinary tests and examples must use canonical paths; legacy queries belong
  only in explicitly named migration/rejection tests.

- Use Zustand for shared game state. Keep one authoritative source for each value; derive affordability, eligibility, counts, and other computed values with pure selectors.
- Jotai is approved for shared UI atoms accessed from multiple places. Do not duplicate game state in atoms or component state.
- Keep local interaction state local. Store selection IDs and user edits, not copies of objects or values available from the game store.

# Test coverage and execution

Before designing, writing, reviewing, migrating, or repairing tests, or changing
test fixtures/runners/CI selection, use the repository
[test-design skill](.agents/skills/test-design/SKILL.md). Follow the
[testing strategy](docs/architecture/testing-strategy.md): retain a small,
deliberate browser merge gate and put most behavior at deterministic or isolated
component boundaries. The strategy records migration status; do not assume the
existing broad browser suite has already been replaced.

- Add meaningful coverage for changed behavior at the cheapest useful layer. Prefer deterministic fixtures and controlled clocks. Do not omit tests or weaken assertions to obtain a passing run.
- Every expensive test must name the regression it catches. Delete obsolete or redundant tests with a recorded rationale; replace worthwhile coverage at a cheaper layer. Test count is not the goal.
- Keep arithmetic, authorization, replay, idempotency, state permutations and race schedules in deterministic unit/HTTP/database tests. Browser tests earn their cost through navigation, focus, submission, responsive layout or essential browser wiring.
- Browser fixture navigation must establish the data needed by the next assertion. Register the matching response listener before navigation/reload, verify successful complete delivery, then assert observable UI state. `page.goto`, `page.reload`, HTML load and fake-clock advancement do not prove that lazy route data is ready. Reuse response-aware fixture helpers; do not duplicate ad hoc waits or make diagnostic screenshots establish readiness. Keep intentional loading/error tests explicitly response-gated.
- A failing test gets one repair attempt. Search its history and the Test Czar repair ledger first. If inspection of the test and failure evidence cannot explain it, delete it. If it fails again after repair, delete it outright; do not rename the scenario, add another stabilization patch, increase timeouts or rerun for luck. Retain clearly useful protection in deterministic unit/HTTP tests and record the removed test, failure evidence, prior repair and retained coverage.
- Classify failures before applying that rule. Confirmed GitHub, runner or external-service infrastructure failures do not consume a test repair attempt; retain evidence and distinguish them from assertion failures, product regressions and cancellations. Outage timing alone does not explain a failed assertion. Fix product regressions without deleting the test that exposes them; an unchanged green retry does not close a known test defect.
- When failures reveal a shared test-design defect, record the pattern and audit the other callers of that fixture or pattern. Fix the common cause, preserve deliberate negative/race coverage, and give independent follow-up work an explicit owner and delivery path. A green retry never closes a known reliability defect.
- A fake clock does not wait for HTTP or React. Do not advance to another scenario with earlier requests still in flight. Control response ordering and await observable state; never use sleeps, retries or timeout increases to hide a race. A passing retry is evidence of intermittency, not a repair.
- Optional screenshot/video preparation must be inactive when capture is disabled. Retain failure diagnostics and independent behavior/layout/accessibility assertions.
- Run applicable formatting, lint and focused checks before pushing. Measure setup, execution, runner wait and end-to-end merge delay separately; remove duplicate work before adding parallel jobs. Count failed attempts and queue removals even when the final run is green.
- During parallel agent work on a shared machine, assign one validation owner and serialize browser suites, production builds and full typechecks across chats. Per-chat worker limits do not bound aggregate load. Parallelize implementation; hand off pending expensive checks instead of launching duplicate validation. Stop only task-owned processes and retain evidence for interrupted or contended runs.
- Review findings need a concrete defect and failure mechanism. Batch real fixes, distinguish pre-existing issues and nits, and reassess after three repair rounds. Do not churn commits to satisfy speculative findings or use a round cap to ignore a real defect. Prioritize economy, auth, concurrency, migrations, deletion and CI/release risks; preserve existing approval and queue rules.
- Routine CI has no configured job, step, suite or per-test execution deadlines. Use native no-limit settings explicitly where omission would restore a finite default. GitHub-hosted jobs remain subject to the platform's six-hour cap. Do not reintroduce restrictive CI deadlines without an explicit request.
- Keep functional network timeouts, readiness failures and assertions that verify timeout behavior. Diagnose actual failures and slow setup; report results honestly.
- Routine CI runs tooling/client/server tests plus relevant PostgreSQL and fixture-only browser tests. Full-system acceptance, process recovery, rolling-deployment validation, signup journeys and production-container validation remain explicit-only through Make or the manual workflow. Do not promote them into routine CI or add scheduled validation without a request.
- Explicit validation uses generous preparation, suite and cleanup guards in `scripts/test-budgets.json`. Adjust these when needed to complete requested validation; they are runaway guards, not performance targets or a separate approval gate.
- Keep test commands in Make/npm. Separate image preparation from container tests, use native runners, and let Make own bounded parallelism. Preserve database isolation and serial tests inside each database test binary. Keep Docker setup/cleanup explicit and scoped to the disposable Compose project. Do not add a custom scheduler, process registry, resource manifest or subprocess monkeypatch.
- Record the exact tested revision, failures, measured phase timings and cleanup. A timeout is failed validation; fix the cause and rerun the affected validation rather than claiming success from partial assertions.

# Global Rules

- Never store derived state. Derived state creates a whole class of errors that can easily be avoided by deriving the values from the source of truth. This is a global pattern and should never be broken.
- React components should be light-weight with no heavy inline logic. Simple value transformations are acceptable. Heavy logic should be extracted into custom hooks and functions and thoroughly tested.
- Server functions, API routes should be treated the same way - no heavy logic. All logic should be pulled out into functions and either thoroughly tested with unit or integration tests.

# Pull requests

All pull request titles must follow Conventional Commits (for example, `fix: correct database initialization` or `feat: add universe seeding`). Pull requests are squash-merged, so the PR title becomes the commit title. Verify the title before creating or updating a PR.

# Frontend state

- Use Zustand for shared game state. Keep one authoritative source for each value; derive affordability, eligibility, counts, and other computed values with pure selectors.
- Jotai is approved for shared UI atoms accessed from multiple places. Do not duplicate game state in atoms or component state.
- Keep local interaction state local. Store selection IDs and user edits, not copies of objects or values available from the game store.

# Test speed and useful coverage

- Add meaningful coverage for changed behavior. Use the cheapest test layer that proves the requirement; prefer deterministic fixtures and controlled clocks over real waiting. Do not omit tests, weaken assertions, or split scenarios merely to satisfy a timing limit.
- Routine CI has per-test limits, not fixed aggregate class budgets. Native runner configuration is authoritative: the Node command in Make for tooling, `apps/web/vite.config.ts` for client tests, `.config/nextest.toml` for server/database tests, and `playwright.config.ts` for fixture-browser tests. A timeout is a ceiling, not a target duration.
- Add useful tests to existing routine classes without seeking permission for aggregate runtime growth. Diagnose slow tests and expensive repeated setup. Limit changes need measured timings and a rationale in the change; do not disable timeouts or automatically retry failures to make a run green. Use native timing reports to investigate suite growth rather than trading away coverage.
- Routine CI runs tooling/client/server tests plus relevant PostgreSQL and fixture-only browser tests. Full-system acceptance, process recovery, rolling-deployment validation, signup journeys, and production-container validation remain explicit-only. New routine test classes or promoting explicit validation into routine CI require Ethan's approval.
- For explicitly requested full validation, use [orbit-explicit-tests](.agents/skills/orbit-explicit-tests/SKILL.md), locally or through the dispatch-only workflow. Its existing deadlines in `scripts/test-budgets.json` remain unchanged; recalibrating them requires a separate request. Do not add scheduled/asynchronous validation without a separate request.
- Keep test commands in Make/npm. Build preparation is separate from test execution. Native runners own discovery, per-test termination and diagnostics; Make owns dependencies and bounded parallelism. Preserve database isolation and serial tests inside each database test binary. Keep Docker setup/cleanup explicit and scoped to the disposable Compose project. Do not add a custom scheduler, process registry, resource manifest, or subprocess monkeypatch.
- A generous CI job timeout catches runaway work; it is not a performance target. Report failures and timeouts truthfully, along with the slow test or setup phase and relevant timing evidence.

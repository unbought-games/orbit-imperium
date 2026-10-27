# Global Rules

- Never store derived state. Derived state creates a whole class of errors that can easily be avoided by deriving the values from the source of truth. This is a global pattern and should never be broken.
- React components should be light-weight with no heavy inline logic. Simple value transformations are acceptable. Heavy logic should be extracted into custom hooks and functions and thoroughly tested.
- Server functions, API routes should be treated the same way - no heavy logic. All logic should be pulled out into functions and either thoroughly tested with unit or integration tests.

# Pull requests

All pull request titles must follow Conventional Commits (for example, `fix: correct database initialization` or `feat: add universe seeding`). Pull requests are squash-merged, so the PR title becomes the commit title. Verify the title before creating or updating a PR.

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

- Use Zustand for shared game state. Keep one authoritative source for each value; derive affordability, eligibility, counts, and other computed values with pure selectors.
- Jotai is approved for shared UI atoms accessed from multiple places. Do not duplicate game state in atoms or component state.
- Keep local interaction state local. Store selection IDs and user edits, not copies of objects or values available from the game store.

# Test coverage and execution

- Add meaningful coverage for changed behavior at the cheapest useful layer. Prefer deterministic fixtures and controlled clocks. Do not omit tests or weaken assertions to obtain a passing run.
- Routine CI has no configured job, step, suite or per-test execution deadlines. Use native no-limit settings explicitly where omission would restore a finite default. GitHub-hosted jobs remain subject to the platform's six-hour cap. Do not reintroduce restrictive CI deadlines without an explicit request.
- Keep functional network timeouts, readiness failures and assertions that verify timeout behavior. Diagnose actual failures and slow setup; report results honestly.
- Routine CI runs tooling/client/server tests plus relevant PostgreSQL and fixture-only browser tests. Full-system acceptance, process recovery, rolling-deployment validation, signup journeys and production-container validation remain explicit-only through Make or the manual workflow. Do not promote them into routine CI or add scheduled validation without a request.
- Explicit validation uses generous preparation, suite and cleanup guards in `scripts/test-budgets.json`. Adjust these when needed to complete requested validation; they are runaway guards, not performance targets or a separate approval gate.
- Keep test commands in Make/npm. Separate image preparation from container tests, use native runners, and let Make own bounded parallelism. Preserve database isolation and serial tests inside each database test binary. Keep Docker setup/cleanup explicit and scoped to the disposable Compose project. Do not add a custom scheduler, process registry, resource manifest or subprocess monkeypatch.
- Record the exact tested revision, failures, measured phase timings and cleanup. A timeout is failed validation; fix the cause and rerun the affected validation rather than claiming success from partial assertions.

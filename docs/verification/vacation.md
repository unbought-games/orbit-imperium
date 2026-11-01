# Vacation mode verification — 2026-11-01

Base revision: `11dd5b98aa410c0f9c7e679e19ff2cfcba06bd2c`, the committed empire
cleanup/alliance-attack integration. Vacation changes remain uncommitted on
`codex/vacation-mode`. Final code/configuration/test SHA-256:
`0972ffa85cbba8be1641ecb4b53d20fa1616a4eaf251fcb27260b9465a03a815`.

The manifest covers 49 changed tracked or nonignored untracked files, excluding
`docs/`. Hash sorted relative paths followed by NUL, file bytes, and NUL. The exact
file list is retained in `test-results/vacation-source-manifest.json`.

## Results

Native Rust used the installed repository toolchain, Rust 1.99.0, through
`PATH=/Users/admin/.cargo/bin:$PATH`. Frontend checks used the host's Node 24.14.0
and npm 11.9.0; npm reported that these differ from the package's pinned 24.18.0 /
11.16.0 engines. Dependencies and engine requirements were not modified.

| Validation | Result | Measured phases |
| --- | --- | --- |
| `make _server`, after the initial `make test-server` preparation | 638 workspace tests, 43 bridge tests, 7 storage unit tests passed | Builds 16.83s / 11.84s / 2.55s; suites 24.626s / 1.913s / 0.021s |
| `make test-client test-tooling` | 1,280 client tests across 131 files; 116 tooling tests passed, 1 existing skip | Client 12.04s; tooling 17.302s |
| `make test-db DB_SUITES=empire_deletion` after the scheduler race fix | 11 PostgreSQL/HTTP tests passed | Preparation 5.52s; suite 24.796s |
| PostgreSQL public_universe / holding | 2 / 1 passed | Suites 5.131s / 9.293s |
| PostgreSQL rules_updates | 40 passed | Suite 313.529s |
| PostgreSQL world_edit | 11 passed | Suite 271.659s; two tests reported slow at 63.394s and 89.710s, both passed |
| `npm run test:ui -- vacation.spec.ts empire-deletion.spec.ts` | 12 passed | Suite 24.5s |
| Final vacation capture/interaction follow-up | 4 passed | Suite 9.4s |
| Workspace/all-target Clippy with `-D warnings` | Passed | 10.45s |
| `make _static`, final lint/format follow-ups, `git diff --check` | Passed: Rust/frontend formatting, lint, contracts and dependency boundaries | No aggregate timer recorded |
| `npm run build` | Type checking, production bundle and prerender passed | Vite 5.62s; prerender build 0.192s |

Broad suites preceded the final scoped-scheduler dependency repair and UI copy/
capture refinements. The final PostgreSQL/HTTP run covers that scheduler repair;
Clippy and the browser/build follow-ups cover the final implementation. Routine
runner limits and assertions were not weakened. Full-system acceptance,
production-container and rolling-deployment validation were not run.

## Cases covered

- Exact 48-hour exit boundary; normal production before entry, base-only production
  while away, saved settings on return, fusion fuel suppression and zero moon income.
- Complete collection coverage, construction/research/manufacturing blockers,
  paid future batches, owned fleets and missiles, and foreign fleets already holding.
- Previously accepted transports, attacks and inbound allied holds retain their
  effects and prepaid stay; new missions fail the existing vacation guards.
- A 100-day vacation survives automatic cleanup. Return establishes a fresh
  28-day warning and 35-day removal check, with one live timer. Voluntary deletion
  still finalizes during vacation. Exact admission retries retain receipts.
- Both launch-first and vacation-first admission at one controlled time have one
  serialized winner. Newly created dependencies extend already admitted lifecycle
  commands before they can execute.
- Authenticated HTTP entry, unauthenticated rejection, private own-view status,
  and unchanged public-feed field allowlists.
- Legacy flag migration, interval boundary segmentation, preservation of production
  settings, and combined operator resource/vacation edits.
- Browser entry blockers and links, review/cancel focus, pending state, minimum
  lockout, reload after the minimum, exit, server rejection, persistent threat
  indicator, and disabled production settings with base-only income.

## Failures diagnosed and corrected

The initial command selected Homebrew Rust 1.97.1 and failed the repository's 1.99
version requirement; the installed matching toolchain was then selected.
Compilation exposed new-type fixture initializers, module/signature wiring and a
scenario-mode enum name; those were corrected. Initial engine fixtures omitted
asset valuation lineage and assumed speed 1 despite using speed 10. They now use
normal fixture authoring and assert the configured rates. Application fixtures
were extended with explicit complete policy/collection coverage after three
projection/bootstrap failures; missing facts are still errors in production.

The new database race fixture initially lacked ships. After creating a real fleet,
it exposed an actual persisted-fact failure: vacation's required scopes grew after
an earlier launch, but its admitted scope set had not. The fix extends pending
vacation/deletion command scopes in the source mutation transaction, using the
existing scheduler. Both orderings now pass. Clippy's nested-if finding was fixed.
A browser test refreshed before route bootstrap completed; the controlled
48-hour-return scenario now reloads the page before asserting exit eligibility.

An aggregate database invocation exited nonzero because the initial race test
failed; its public, holding and world-edit suites passed. The failed suite was
rerun successfully after the repair. No partial aggregate run is counted as a
passing command.

## Visual review and cleanup

Inspected the rendered Settings pattern before implementation. Final browser
interactions ran at desktop 1280×900 and mobile 390×900. Detailed section captures
use 1280×1200 and 390×1200 so long blocker/production sections can be inspected;
active shell captures retain the 900px height. Captures include ready, review,
submitting, blocked, active/minimum, exit-ready, returned, rejected and production
states. Transient HUD toasts were dismissed with their real Escape control;
the persistent hostile-fleet indicator remains visible. Screenshots stay local
in `test-results/vacation-*.png` and are displayed in the implementation chat.

Database tests ran in the disposable Compose project
`orbit-vacation-validation`, bound to localhost port 55438. Each native test binary
created and dropped its isolated database through the existing runner. After all
runs, `docker compose down --volumes` removed only that project, its network and
volume. Browser runners closed their Vite servers and contexts. The temporary
integration stash was removed after restoration was verified. No push, PR, merge
to main, or deployment was performed for Vacation Mode.

Deployment requires the coordinated API/worker upgrade and legacy-flag behavior
in [the feature guide](../features/vacation.md).

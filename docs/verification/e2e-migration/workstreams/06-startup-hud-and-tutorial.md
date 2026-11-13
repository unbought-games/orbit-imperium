# 06 — Startup, authentication, recovery, HUD and tutorial

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

Bootstrap/auth/recovery and notification scenarios still use browser time and network schedules for many controller behaviors. HUD pagination, refresh and history already have deterministic seams, but mounted loading regions, focus, buffered rows and native observer wiring were intentionally preserved. The native touch swipe/promoted-tap case exhausted its repair in #385; do not recreate it. Auth fixtures cannot prove actual OAuth enrollment or server authorization.

Current owned inventory: **139 application cases and 5 component cases**. Full expanded identities: [current CSV](../inventory/06-current.csv). Original pre-migration cases: [baseline CSV](../inventory/06-baseline.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/bootstrap-ui.spec.ts` | 37 | 5 |
| `apps/web/tests/client-update.spec.ts` | 9 | 0 |
| `apps/web/tests/command-hud.spec.ts` | 37 | 1 |
| `apps/web/tests/components/hud-toasts.component.spec.ts` | 5 | 0 |
| `apps/web/tests/content-updates.spec.ts` | 4 | 0 |
| `apps/web/tests/hosted-auth.spec.ts` | 12 | 2 |
| `apps/web/tests/hud-playground.spec.ts` | 5 | 0 |
| `apps/web/tests/release-announcement.spec.ts` | 5 | 0 |
| `apps/web/tests/tutorial-advisor.spec.ts` | 11 | 0 |
| `apps/web/tests/tutorial.spec.ts` | 19 | 2 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `client-model/bootstrap`.
- `client-model/client-update`.
- `client-model/coordinator`.
- `client-model/use-hosted-join`.
- `features/command-hud/notification-history`.
- `features/command-hud/intelligence-refresh`.
- `features/command-hud/inbox-pagination`.
- `features/tutorial`.

Existing coverage and repair ledgers:

- [test-migration-hud](../../test-migration-hud.md).
- [test-migration-shell-profiles](../../test-migration-shell-profiles.md).
- [test-migration-tutorial-settings](../../test-migration-tutorial-settings.md).

## Work to complete

1. Separate startup/configuration/enrollment/session/refresh ordering from actual entry and recovery wiring. Preserve exact return paths, user edits and unsent-action semantics.
2. Mount the real HUD and caption/orb surfaces with prepared state; move expiry, refresh and pagination schedules into existing controllers; retain observer/focus/modal integration where it is unique.
3. Move tutorial/reward/acknowledgement permutations to its engine/model; retain representative Briefing route, full-experience and accessibility interactions. Record live-auth acceptance obligations for 09.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/storage-postgres/tests/oidc.rs`.
- `crates/storage-postgres/tests/signup.rs`.
- `crates/storage-postgres/tests/recovery.rs`.
- `crates/storage-postgres/tests/tutorial.rs`.
- `crates/transport-http/src/auth_worker_tests.rs`.

## First bounded session

Start with HUD buffered pagination and refresh states using inbox-pagination/intelligence-refresh plus a real prepared list. Preserve the existing loading-region, native scrolling and retry assertions until the replacement passes.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

05 owns shell.spec.ts. 04 owns existing tutorial-settings components. 09 owns actual signup/recovery acceptance and shared fixtures. No native-touch stabilization or renamed resurrection.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
npm test -- apps/web/src/client-model/client-update.test.ts apps/web/src/client-model/coordinator.test.ts apps/web/src/features/command-hud/inbox-pagination.test.ts apps/web/src/features/command-hud/notification-history.test.ts
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 06 in `docs/verification/e2e-migration/workstreams/06-startup-hud-and-tutorial.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

## Known failure evidence from stream 02

Before migration, reconcile main run `43359549586`, job `131669658426`, artifact
`14007912034`: `foreground refresh confirms an accepted response with accessible
reduced motion` did not expose its caption after the overview response was
released. The mechanism was unconfirmed and stream 02 applied no repair. Read
PR #406's evidence and current source/history; do not count a later green retry
as resolution or infer that this remains broken after subsequent main changes.

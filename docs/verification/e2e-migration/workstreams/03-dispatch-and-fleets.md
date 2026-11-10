# 03 — Dispatch, Galaxy, fleets and mission controls

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

50 Galaxy and 12 Dispatch application cases remain alongside 72 Dispatch and 27 fleet/Galaxy components. Request-order/eligibility permutations overlap existing deterministic seams. Important application contracts remain: LaunchFleet transport admission and receipt wiring, origin/destination context, history, and distinct desktop/mobile Harvest entry. The old create/invite/join/recall tour was retired and cannot be recreated as a replacement.

Current owned inventory: **120 application cases and 99 component cases**. Full expanded identities: [current CSV](../inventory/03-current.csv). Original pre-migration cases: [baseline CSV](../inventory/03-baseline.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/alliance-attacks.spec.ts` | 6 | 0 |
| `apps/web/tests/alliance-depot.spec.ts` | 6 | 0 |
| `apps/web/tests/arrival.spec.ts` | 2 | 0 |
| `apps/web/tests/colonization.spec.ts` | 5 | 0 |
| `apps/web/tests/combat-simulation.spec.ts` | 8 | 0 |
| `apps/web/tests/components/dispatch.spec.ts` | 72 | 0 |
| `apps/web/tests/components/fleet-card.component.spec.ts` | 10 | 0 |
| `apps/web/tests/components/galaxy-fleet.component.spec.ts` | 9 | 0 |
| `apps/web/tests/components/galaxy-position.component.spec.ts` | 8 | 0 |
| `apps/web/tests/dispatch-validation.spec.ts` | 12 | 2 |
| `apps/web/tests/fleet-inventory.spec.ts` | 1 | 0 |
| `apps/web/tests/galaxy-cards.spec.ts` | 50 | 3 |
| `apps/web/tests/missile-warfare.spec.ts` | 5 | 0 |
| `apps/web/tests/mission-fleets.spec.ts` | 9 | 0 |
| `apps/web/tests/moon-fleets.spec.ts` | 10 | 0 |
| `apps/web/tests/moons.spec.ts` | 4 | 0 |
| `apps/web/tests/sensor-phalanx.spec.ts` | 2 | 1 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `features/dispatch`.
- `client-model/dispatch-timing`.
- `client-model/dispatch-validation`.
- `client-model/galaxy-harvest`.
- `features/fleet-inventory-model`.
- `features/attack-group-model`.

Existing coverage and repair ledgers:

- [test-migration-dispatch](../../test-migration-dispatch.md).
- [test-migration-galaxy-fleets](../../test-migration-galaxy-fleets.md).
- [test-migration-shell-profiles](../../test-migration-shell-profiles.md).

## Work to complete

1. Separate estimate/quote/protection/error ordering and reservations from form feedback; use controlled ports and promise completion rather than repeated page navigation.
2. Audit the 99 existing component cases for duplicated mission/viewport permutations; preserve real destination picker, native input, focus, disclosure and popover/sheet behavior.
3. Retain short launch, Spy/Harvest and paid-scan journeys for distinct wiring; map real fleet authorization, inventory reservations and group command invariants to engine/PostgreSQL tests.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/storage-postgres/tests/attack_groups.rs`.
- `crates/storage-postgres/tests/missile_warfare.rs`.
- `crates/storage-postgres/tests/phalanx.rs`.
- `crates/storage-postgres/tests/colonization.rs`.
- `crates/engine/tests/missions`.

## First bounded session

Start with Dispatch submitting/Pending/Rejected/uncertain feedback. Reuse the request/submission controllers and mount actual feedback with controlled completions; keep one actual reviewed launch journey required.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

06 owns HUD notices and shell-level launch recovery; request a handoff instead of editing command-hud/shell. 08 owns observation/report facts.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
npm test -- apps/web/src/client-model/dispatch-validation.test.ts apps/web/src/client-model/dispatch-timing.test.ts apps/web/src/features/attack-group-model.test.ts
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 03 in `docs/verification/e2e-migration/workstreams/03-dispatch-and-fleets.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

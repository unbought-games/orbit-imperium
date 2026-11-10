# 05 — Shell, navigation, public layout and primitives

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

shell.spec.ts remains a mixed integration file with 59 cases, including domain assertions owned conceptually by other streams. Route semantics are genuine application risks, while roster sizes, text scales, positioning and control permutations generally belong to existing shell components. Main retired normal-motion blanket assertions because Briefing intentionally animates; preserve the precise navigation-motion unit contract instead.

Current owned inventory: **154 application cases and 52 component cases**. Full expanded identities: [current CSV](../inventory/05-current.csv). Original pre-migration cases: [baseline CSV](../inventory/05-baseline.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/components/action-sheet.component.spec.ts` | 12 | 0 |
| `apps/web/tests/components/form.spec.ts` | 2 | 0 |
| `apps/web/tests/components/loading.spec.ts` | 2 | 0 |
| `apps/web/tests/components/popover.component.spec.ts` | 1 | 0 |
| `apps/web/tests/components/shell-controls.component.spec.ts` | 8 | 0 |
| `apps/web/tests/components/shell-layout.component.spec.ts` | 11 | 0 |
| `apps/web/tests/components/shell-navigation.component.spec.ts` | 11 | 0 |
| `apps/web/tests/components/shell-selection.component.spec.ts` | 5 | 0 |
| `apps/web/tests/coordinate-links.spec.ts` | 18 | 0 |
| `apps/web/tests/density.spec.ts` | 18 | 0 |
| `apps/web/tests/desktop-navigation.spec.ts` | 10 | 2 |
| `apps/web/tests/detail-playground.spec.ts` | 3 | 0 |
| `apps/web/tests/home.spec.ts` | 12 | 1 |
| `apps/web/tests/loading-region.spec.ts` | 1 | 1 |
| `apps/web/tests/mobile-selection.spec.ts` | 9 | 0 |
| `apps/web/tests/number-input.spec.ts` | 3 | 0 |
| `apps/web/tests/planet-page-routing.spec.ts` | 15 | 4 |
| `apps/web/tests/shell.spec.ts` | 59 | 3 |
| `apps/web/tests/web-app.spec.ts` | 6 | 1 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `shell/navigation`.
- `shell/navigation-model`.
- `shell/body-selector`.
- `ui/action-popover`.
- `ui/use-action-sheet`.
- `ui/coordinate-input-model`.
- `ui/loading-region`.

Existing coverage and repair ledgers:

- [test-migration-shell-components](../../test-migration-shell-components.md).

## Work to complete

1. Extract shell-specific layout/input permutations into prepared components; move route/query normalization permutations to routing models while retaining native href/history/deep-link contracts.
2. Split mixed shell cases: receive model/controller coverage from 01/03/06/08, retain unique cross-surface wiring, and remove domain duplicates only after that coverage lands.
3. Audit primitives, action sheets, tooltip/popover, resource marks, loading and native form behavior; preserve keyboard, touch, reduced-motion and accessibility contracts without redundant viewport multiplication.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/transport-http/src/bootstrap_html.rs`.
- `crates/transport-http/src/home_seo.rs`.
- `crates/transport-http/src/static_assets.rs`.

## First bounded session

Start with density/mobile-selection and existing shell-layout/selection components. Map text-scale/viewport permutations to distinct layout branches before consolidating; leave shell.spec.ts cross-domain cases until their owners hand back evidence.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

This stream alone edits shell.spec.ts. Other domain owners supply exact title paths and replacement evidence. 09 owns shared fixtures/runner and built-homepage acceptance.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
npm test -- apps/web/src/shell/navigation-model.test.ts apps/web/src/shell/navigation-motion.test.ts apps/web/src/ui/coordinate-input-model.test.ts
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 05 in `docs/verification/e2e-migration/workstreams/05-shell-and-navigation.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

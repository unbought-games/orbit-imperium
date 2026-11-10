# 07 — Social, alliances, recruitment and identity

Status: **not started**. Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. This brief is implementation-ready triage, not permission to remove assertions without passing replacements.

## Scope and evidence

Existing real-component views/controllers already cover composer focus, layout and directory filtering. Application cases still cover real polling, unread acknowledgement, uncertain command identity, lost membership and expired cursor recovery. Earlier review restored the expired-cursor live region and mounted bot-to-human refresh because their proposed replacements omitted observable behavior. Preserve these distinctions.

Current owned inventory: **49 application cases and 28 component cases**. Full expanded identities: [current CSV](../inventory/07-current.csv). Original pre-migration cases: [baseline CSV](../inventory/07-baseline.csv). The [file audit](../FILES.md) records source signals and the manifest records hashes.

| Owned browser file | Current cases | Tagged journeys |
| --- | ---: | ---: |
| `apps/web/tests/alliance-identity.spec.ts` | 3 | 0 |
| `apps/web/tests/alliances.spec.ts` | 11 | 2 |
| `apps/web/tests/components/alliance.component.spec.ts` | 11 | 0 |
| `apps/web/tests/components/identity.component.spec.ts` | 3 | 0 |
| `apps/web/tests/components/profile-display.component.spec.ts` | 2 | 0 |
| `apps/web/tests/components/recruitment.component.spec.ts` | 3 | 0 |
| `apps/web/tests/components/social.component.spec.ts` | 9 | 0 |
| `apps/web/tests/empire-identity.spec.ts` | 3 | 1 |
| `apps/web/tests/high-scores.spec.ts` | 7 | 0 |
| `apps/web/tests/insignias.spec.ts` | 13 | 0 |
| `apps/web/tests/player-profiles.spec.ts` | 2 | 0 |
| `apps/web/tests/recruitment.spec.ts` | 2 | 0 |
| `apps/web/tests/social.spec.ts` | 8 | 1 |

Production seams to inspect first (paths relative to `apps/web/src` unless otherwise shown):

- `features/social/messages-view`.
- `features/alliances/recruitment-directory-view`.
- `features/alliances/sections`.
- `client-model/player-profiles`.
- `client-model/social-mailbox`.
- `client-model/recruitment`.

Existing coverage and repair ledgers:

- [test-migration-social-components](../../test-migration-social-components.md).
- [test-migration-shell-profiles](../../test-migration-shell-profiles.md).

## Work to complete

1. Move permissions/state/filter/expiry/order permutations to existing controllers and real view components; keep mounted identity refresh and composer/selection/focus where behavior depends on subscriptions.
2. Consolidate real polling/read/retry/route journeys only after explicit observable-state coverage exists; preserve the original command identity for uncertain retries and reject edited duplicates.
3. Map private data access, membership transitions, identity revision and social blocking to HTTP/database tests, using free independently authored cosmetic fixtures.

Server/contract evidence to reconcile (existing test files are starting evidence, not a claim that every required invariant is covered):

- `crates/storage-postgres/tests/alliances.rs`.
- `crates/storage-postgres/tests/social.rs`.
- `crates/storage-postgres/tests/alliance_identity.rs`.
- `crates/storage-postgres/tests/identity.rs`.
- `crates/transport-http/src/player_profiles.rs`.

## First bounded session

Start with alliance directory search/filter compact-control variants against the existing recruitment component scene; preserve input focus and empty results. Leave access-denied clearing and uncertain retry journeys intact.

Budget the session around **one behavior family**, typically one or two source test templates and their replacements. Stop after a coherent validated slice; leave all unconverted tests required. The stream may need several daily sessions. Do not infer that its entire case count fits one token budget.

## Ownership and dependencies

03 owns alliance attacks/depot, 04 owns Empire lifecycle, 06 owns auth entry. Read ADR 002/operator guidance before touching cosmetic loading or delivery.

No hard prerequisite on another domain migration. Reconcile changes since the snapshot and coordinate shared production files before editing.

09 owns shared fixtures and runner code; 10 owns final CI selection/global guidance. For a serial daily session, this chat is its validation owner. If chats overlap, nominate one owner and serialize browser suites, production builds and full typechecks. Do not create a process registry or scheduler.

## Validation and completion

Start with the exact affected unit files; this relevant existing command is a starting point, not an obligation to repeat every green check:

```sh
npm test -- apps/web/src/client-model/player-profiles.test.ts apps/web/src/client-model/social-mailbox.test.ts apps/web/src/client-model/recruitment.test.ts
```

Run changed isolated specs with `npm run test:components -- <spec> --workers=2`, and changed application specs with `npm run test:ui -- <spec> --workers=2`. Use the repository test-design skill for applicable static checks and real server/DB tests. Record setup, execution, failures and cleanup. UI source changes require final desktop/mobile visual review.

A slice is done only when every changed/removed assertion has a named passing replacement or justified retirement, remaining browser wiring is explicit, no test is silently deselected, and the handoff records the exact revision. A stream is done when all its current rows, baseline-ledger gaps and existing component cases have final dispositions, and its cross-owner handoffs are accepted.

## Resume and handoff

Update this status and append a slice record to [STATUS.md](../STATUS.md): completed case IDs/title paths, source files, replacement test names, validation revision/results, failure/repair history, pending items and next smallest slice. Do not edit the frozen snapshot CSVs; record additions/renames/deletions in the status delta. The final cutover owner reconciles that delta.

Launch prompt:

> Work on stream 07 in `docs/verification/e2e-migration/workstreams/07-social-and-identity.md`. Read its status and the relevant inventory rows. Continue the next bounded slice using the repository test-design skill. Preserve required coverage until replacements pass. Do not re-audit the whole repository or start other streams. Coordinate shared files, validate serially, and leave a complete resume record if the session ends.

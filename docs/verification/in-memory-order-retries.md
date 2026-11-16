# In-memory order retries — November 16, 2026

Base revision: `73f5656e01427cee7518fdd05ea805efbbf6b2c3`, plus the uncommitted
changes in this checkout. No production access, deployment, or database changes.

## Behavior

Command attempts and optimistic inputs exist only in the current Coordinator's
Zustand store. The current action error callout still offers an explicit retry:
first read the server receipt, then resend the identical envelope/command ID only
if the receipt is missing. Background receipt polling never resends commands.
Server admission, receipts, and duplicate prevention remain authoritative.

Reload, new runtime, logout, or rebinding discards client attempts and starts from
the server snapshot. The Game settings recovery list is removed. The client no
longer serializes attempts, restores commands, queues storage writes, quarantines
old sessions, or refuses gameplay when command storage is unavailable.

A deletion-only migration clears `orbit:attempts:`, `orbit:history:`, and
`orbit:session:` keys from both sessionStorage and localStorage. Other preferences
remain untouched. Blocked storage does not prevent gameplay; old records are
never loaded even if deletion fails.

## Coverage changes

- `legacy-order-storage.test.ts` replaces the deleted adapter tests with cleanup
  of all supported legacy versions, both browser stores, unrelated preference
  preservation, no writes, and usable actions when storage is blocked.
- `runtime.test.ts` now verifies that a fresh runtime has no commands to recover
  or resend. Coordinator tests retain immediate retry identity, rejected and
  accepted outcomes, receipt binding/revision checks, optimistic payment,
  throttling, session rotation, late callbacks, and reconciliation.
- `world.test.ts` verifies exact protocol-4 gameplay/presence envelope reuse in
  memory, no automatic resend, and no retry available after reconstruction.
- `report-deletion.spec.ts` retains desktop/mobile callout retry, HUD relocation,
  keyboard/touch dismissal and focus. Its reload/Settings assertions now require
  no stored commands and no recovery list, including seeded legacy leftovers.
- `resources.spec.ts` retains queued edits and unrelated server changes while an
  in-memory production/upgrade command resolves. Restoring a legacy command and
  quote metadata after reload is deliberately no longer a supported scenario.
- Explicit-only `reconnect`, `zfoundation`, `progression`, `missions`, and `raiding`
  scenarios now assert authoritative gameplay state after reload and absence of
  browser command storage. Storage-envelope assertions are removed; immediate
  immutable envelope coverage remains in deterministic `world.test.ts`.

Removed obsolete coordinator cases:

| Previous case | Disposition / retained protection |
| --- | --- |
| removes the optimistic queue and restores payment after a persistence failure | No command persistence exists. Server-rejection rollback and optimistic affordability tests remain. |
| restored uncertain attempts block a competing purchase without needing restored quote metadata | Restoring attempts is intentionally removed; immediate competing-spend exclusion remains. |
| blocks sending if persistence fails | Replaced with blocked-storage gameplay regression in the legacy cleanup tests. |
| invalidation during reconciliation cannot resurrect a second old attempt | The held storage-write race no longer exists. Late receipt/session callbacks remain covered. |
| does not queue an unsent order behind a concurrent rate limit | The pre-send storage wait no longer exists; rate-limit refusal, cooldown and no automatic resend remain covered. |
| a failed local cleanup cannot cause a throttled order to resend after reload | Per-order cleanup is gone. Runtime reconstruction and throttled-order tests cover no replay. |
| blocks concurrent clicks as soon as 429 arrives, before local cleanup finishes | The cleanup wait no longer exists; cooldown admission tests remain. |
| explains a session refresh that starts while an unsent action is being saved | The save phase is gone; pre-send and first-delivery session-refresh refusal tests remain. |

The three former `attempt-storage.test.ts` cases tested quarantine failure,
blocked session markers, and persisted protocol envelopes; those mechanisms were
removed. The report-failure pruning test retains its behavioral assertions but
no longer multiplies them by storage write/remove failure modes.

## Validation

- Dependency setup: `npm ci --ignore-scripts`, 3 seconds reported.
- `npx tsc --noEmit -p apps/web`: passed.
- `npm run test:component-types`: passed.
- `npm run lint` and `npm run format:check`: passed.
- Initial focused client run: 186 passed, 3 failed in 0.954 seconds. All failures
  were in this change's test edits: an unstubbed browser online flag prevented a
  submission in Node, an overly broad replacement altered an unrelated pending
  assertion, and a former persisted-record count became a contradictory ledger
  assertion. Corrected those fixtures/assertions once; 64 affected tests passed
  in 0.628 seconds. No assertion was weakened to hide a product failure.
- `npm test`: all 1,943 tests in 219 files passed, 8.50 seconds.
- Fixture browser: report immediate retry/reload at 1280×900 and 390×900 plus two
  pending production-edit cases: all 4 passed. Bundle preparation 4.627 seconds;
  Playwright run 11.8 seconds.
- Refreshed the two report screenshots with unrelated hostile fleet notices
  absent and viewport captures for Settings. Both cases passed; bundle preparation
  4.446 seconds, Playwright run 7.1 seconds. Inspected desktop/mobile Settings,
  immediate error callouts and HUD error states.
- Isolated manufacturing Pending/Rejected/uncertain behavior and immediate retry:
  all 3 passed. Bundle preparation 3.692 seconds, Playwright run 3.0 seconds.

- Fixture fleet dispatch submitting → uncertain → immediate receipt recovery:
  passed without a second launch. Bundle preparation 4.470 seconds; Playwright
  run 3.6 seconds.

Validation was serial on this machine; no runner queue or merge delay. Browser
runners removed their temporary bundles and stopped their own preview servers.
The explicit full-system/database suites were not run; their source assertions
were updated for the new storage contract. No backend behavior changed.

# Mobile menu page validation

## Mobile menu page design — 2026-11-03

Validated the uncommitted design on base
`34c36a1e63198ee0dd7988f813bc0eca063f5cd1`. SHA-256 of the sorted changed
`apps/web` file names and contents (NUL separated) was
`a203df31230690b90166e3fbca15776a2786d16ff05b0fe2c342753dc44ea8ae`.
The menu now owns a route; primary and Develop links are no longer duplicated.
Updated the common navigation fixture and audited its callers, including the
explicit-only signup, MVP and responsive journeys. Those explicit suites were
not run. The implementation owner owns these fixture changes in this working tree.

Removed the obsolete mobile-dialog resize/focus-lock case because there is no
navigation dialog. Retained route persistence on resize, keyboard activation,
Back, Settings, logout, touch targets and desktop account-menu focus in the
navigation tests. Replaced the unit assertion that every destination appears in
the menu with assertions that secondary destinations appear once and primary
navigation is excluded. Capability and universe checks remain deterministic.

The initial browser command could not start without node_modules; npm ci completed
in 2s. Two before-change visual-reference cases passed (1.326s Vite preparation,
3.1s browser runner). Initial new-page checks passed twice (1.218s preparation,
6.5s runner). The broader navigation/iOS run had 22 passes and one failure
(1.314s preparation, 18.5s runner): the dossier test still asserted containment
inside the removed dialog, comparing the viewport popup's x=12 against the main
column's x=18. Inspected the failure pixels and history through #320, #259 and
#256 and this repair ledger; the separate Test Czar ledger was unavailable.
Its one repair asserts viewport containment while preserving visible content,
clickability and Escape dismissal. No timeout or retry was added.

The affected navigation, protocol, identity, unread, text-size and motion set then
passed all 23 cases (1.293s preparation, 22.2s runner). Fifteen deterministic
navigation/route cases passed (0.111s); TypeScript, canonical ESLint and Prettier
checks passed. Inspected fresh mobile 320×844 and 390×844, desktop 1440×900,
unread 390×900 and player-dossier 390×1000 captures. Browser runners close their
Vite server, contexts and port lease. No Docker/database setup, CI queue wait,
push or merge was involved; queue and merge delay are not applicable.

The remaining changed resource-settings entry and dispatch recovery callers passed
all three focused cases (1.253s preparation, 4.2s runner), preserving form saves
and pending-order recovery without navigating away from local edits. Final
whitespace validation passed. No additional failures or repairs occurred.

PR preparation rebased onto `283c5be` and validated
`86a1a6698ea55ecf78d9fc316e7b25e250dd6ee5`. Preserved main's deliberate removal of
the account-identity cases when resolving the shell-test conflict, and retained
both audit entries. The 15 affected navigation/iOS/browser checks passed (2.509s
preparation, 20.7s runner); 29 navigation/route/report-state unit cases passed
(0.217s). Production build, TypeScript, lint, formatting and whitespace checks
passed. Refreshed and inspected desktop/mobile and relevant interaction captures.
No new test failures; test servers, browsers and port leases were cleaned up.

PR #330 run `41754058662` on `e3ae1cba8c91316a3adc5df5424ab4bc96d34351`
exposed three stale Galaxy navigation expectations (320/390/768px), all in shard
5 job `126325923358`. Each expected four mobile links and received the same four
plus Menu, which changed from a button to a route link. History traces the
scenario to `ad9e6e6` (#207); no earlier reliability repair for it appears in this
ledger. Updated the one shared expected list, retaining all Galaxy/Fleets/Dispatch
routing, history, focus and layout assertions. Audited other main-navigation
link/count and Menu-button expectations; no further stale lists found.
The four viewport cases passed locally (1.401s preparation, 7.1s runner). Product
source and inspected screenshots are unchanged. This is the scenario's one
repair; no timeout/retry adjustment or test deletion. The first CI attempt had
five green browser shards and one failed shard (136 passing, three failing cases;
7.5m browser execution), with shards 6/7 still executing when the corrected head
was prepared. Native setup took 82s and checks 249s; runners started 13–51s after
workflow creation. No merge queue enrollment or removal had occurred.

### Unexplained planet-rename browser stall found during PR #330

After the corrected head superseded run `41754058662`, its shard 7 job
`126325923557` logs showed 137/138 cases completed. Only
`rename persists in the shell and public galaxy at 390px` had no result; its
1280px counterpart finished at 01:28:40 UTC, the last other case at 01:34:25,
and cancellation completed at 01:38:05 on 2026-11-04 UTC (November 3 locally).
There is no failing assertion, locator stack or diagnostic identifying the pending
operation. Read the scenario and history: introduced in `6296d14` (#50), with
Galaxy response-readiness repair in `996bfc5` (#305). This ledger contains no
further repair; the separate Test Czar ledger is unavailable. Do not treat a
passing run on the next head as closure of this unexplained stall.

Removed the shared two-viewport scenario under the repository's unexplained-test
rule, rather than recreating the same journey or adding timeouts/retries. Retained
`planet-name.test.ts` for Unicode trimming, scalar limits, command/presence pairing
and pending/reconciled saves; engine `planet_renaming_is_public_free_repeatable_and_owner_only`
for authorization/public projection; PostgreSQL
`planet_names_survive_restart_publish_to_other_players_and_retry_once` for persistence
and idempotency. The five surviving planet-name browser cases cover rejection and
preserved edits, current names in fleets, explicit fallback naming, closed edits
after reconciliation and shared control states. All five passed (1.610s preparation,
6.0s runner); the two deterministic client cases passed (0.163s). No product code
or surviving assertion changed. Local browser/Vite resources closed normally.
The second CI run `41755257641` is superseded by this documented removal; no queue
entry or removal has occurred. This PR's implementation owner owns the repair
and retained-coverage audit; there is no independent follow-up to hand off.

### Catalog bootstrap boundary repair — PR #330

Run `41755590187` on `04fe49aa948bff4a82f4a35bb433b1d23c89a2c3` completed with
native checks and seven browser shards green. Shard 3 (`126331427547`) had 137
passes and two failures in `manufacturing stacks every exact resource cost in
compact rows` at 320/390px (6.9m execution). Both failed in shared catalog `setup`,
before the scenario assertions: the H1 was still `Opening your universe.` and
then absent. Failure images show the empty shell during startup. The fixture
awaited HTML navigation and immediately began its five-second rendered assertion,
without establishing successful complete bootstrap delivery.

History: layout scenario introduced in `af980a1` (#176); shared setup introduced
in `19ee32c` (#80). No earlier repair for this scenario appears in history or this
ledger. Its one repair registers the existing `withFixtureResponse` helper before
navigation and verifies `/api/v1/bootstrap` success/completion, then retains the
same observable heading assertion. Audited all 46 setup call sites: they require
healthy startup and install held/error/command overrides after it; intentional
negative and race cases are unchanged. This common fixture repair belongs to this
PR's implementation owner; no separate caller follow-up is outstanding.

All 116 catalog cases passed locally (1.242s preparation, 1.9m runner), including
all three manufacturing viewports and the preserved submission/race/error checks.
No timeout, retry, assertion or product code changed. This is a response-readiness
repair, not a green retry of the same fixture. Reassessed after three CI repair
rounds: the changes remain one menu implementation, its stale-selector updates,
one documented unexplained-test deletion and this shared bootstrap boundary;
no feature expansion or speculative product change. Browser/Vite resources closed
normally; whitespace checks passed. The complete prior CI result is retained;
there were still zero merge-queue entries or removals.

### Menu dossier scenario failed again — PR #330

Run `41757174049` on `692b921821b2a44e26fde1202cd000aae1a895a9` had native checks
and seven browser shards green. In shard 3 job `126335971279`, 138/139 cases
completed; only `menu page keeps the player dossier accessible above its rows`
(case 134) never returned. All catalog cases, including the three manufacturing
viewports from the previous repair, passed. The last other case completed at
02:00:41 UTC; cancellation finished at 02:09:37 on 2026-11-04 UTC (November 3
locally). The logs contain no locator stack or failing assertion for the pending
scenario. Live logs were unavailable from the API before cancellation; the browser
view required sign-in. Cancellation was diagnostic, not a configured execution
deadline, and this attempt is failed validation.

The dossier scenario originated with #256 and was adapted in #320. Its one repair
in this task changed obsolete dialog containment to viewport containment; it
passed locally and earlier CI, then stalled here. Removed it outright under the
repeat-failure rule, without another stabilization change or renamed recreation.
Retained the inspected mobile dossier capture in the chat. Ten player-profile
unit cases cover source refresh, expiry, out-of-order responses, binding/session
fences and affiliation refresh. Existing player-profile browser cases retain
profile/identity wiring, while all 16 remaining desktop-navigation cases cover
sidebar access, mobile routes, keyboard/touch, history, resize, settings and logout.
Those 16 cases passed (1.543s preparation, 13.1s runner), and all ten profile unit
cases passed (0.427s). No production source, timeout, or surviving assertion changed.
Runners cleaned up their browser/Vite resources. No merge-queue entry or removal.

## Merge-queue integration

PR #330 head `4c8a55f` passed CI run `41759089890` and automated review, and
was enqueued at 2026-11-04T02:23:26Z. Queue position 2 became UNMERGEABLE against
preceding PR #329. A read-only `git merge-tree --write-tree HEAD origin/pr-329`
identified exactly one conflict: both PRs appended their independent validation
records to `docs/runbooks/test-performance-audit.md`. Moved this PR's record into
this dedicated verification file, leaving the shared audit unchanged. Production
source, tests and screenshots are unchanged. This is a necessary integration fix;
no other PR's source or records were changed. The new head must pass checks and
be enqueued again before merge.

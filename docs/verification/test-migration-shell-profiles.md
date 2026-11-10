# Shell, profile, resource and alliance browser migration

## Scope and status

Base: `a119915ffaeb881a7f54d65542478f4788bd4210`. Owned browser files:
`resources.spec.ts`, `player-profiles.spec.ts`, `client-update.spec.ts`, and
`alliance-attacks.spec.ts`. No production code, global runner, dependency, shared
fixture or changelog changes. This is a bounded migration, not a claim that the
repository's small application gate is complete. Retained cases remain selected
by the existing runner until the parent integrates its component harness and
selection changes. No scenario has been silently moved to nonblocking CI.

The original inventory below includes every test declaration and all its loop
variants. A retained name is also the exact retained coverage name. Widths and
protocols remain unchanged unless stated. The new static supporter test checks
markup only; it does not claim to replace layout, computed colors or focus.

## Failure evidence and repair decisions

Downloaded job logs and error-context artifacts from the following attempt-1
runs. Logs identify assertion failures in the fixture browser step, not an
infrastructure outage. Git history and `docs/runbooks/test-performance-audit.md`
were inspected; no separate owner Test Czar ledger was available. Artifact
inspection did not establish a production regression.

| Scenario | Exact evidence | Decision |
| --- | --- | --- |
| Resource-settings history, 1440 | Runs `42712613473` / job `129485942628` and `42712933918` / job `129487488425`; tested `fcf1fa5866d313837dbdbab8a558aa9cd8c835a5` and `5e4c7480b37e3ab989dfc78dd231dd217058762c`, respectively. After Enter, H1 remained Empire; artifact has Empire H1 active. | Explained focus race: the test clicks Empire then immediately focuses the persistent energy link while `game-shell.tsx`'s route layout effect still owes focus to Empire. Complete that route's heading/focus before moving focus to the link, assert link focus, then send Enter. First repair of this keyboard boundary. Introduced in `dee958da`; `1181001f` adapted sidebar navigation; `6292946b` gated a later reload, not this preceding route transition. Both failures predate this repair. |
| Resource-settings usable controls, 1440 | Run `42691140362` / job `129413010760`, SHA `4d87b6250cb342348063e6b4c82d4ce53b52923a`; energy link absent after bare `goto`; artifact subsequently contains Empire and the energy link. | Prior shared repair `6292946b` already gates bootstrap before the link assertion. Preserve that repair and validate it; no additional stabilization patch. |
| Galaxy supporter levels | Runs `42691219166` / job `129412823098`, SHA `12cff4ad380feb338f8ecbd4979d68b7c05edf90`; `42698757279` / job `129438535877`, SHA `d0689602294006f93045da5e600cd5e4f952c4a8`. First badge absent at assertion; latter artifact includes all three badges and correct names. | Retire entire broad scenario. It starts a running fake clock after shell startup, overrides identities, navigates another document, and later advances time through asynchronous refreshes. `6292946b` gated Galaxy world data but not separately loaded profiles. Evidence supports a readiness defect but does not isolate the outstanding profile phase; do not add another broad readiness patch. Tier transitions, outage expiry and bot/human permutations are controller coverage; static tier/ordinary markup added below. Lost: Galaxy-specific badge/CSS-color and three-width overflow checks. Other profile consumers retain browser identity/layout/focus wiring. |
| Deployment reload startup, mobile | Run `42652228544` / job `129281517892`, SHA `d1f4be636486c22d5378b51dcd47365c549ffc07`: after manual reload bootstrap headers, paused message absent; artifact subsequently includes that message and Updating your universe. | Remove both viewport variants of this scenario, without renaming/recreating it. `a4b2dcab` and ledger section "startup" already record its one clock-scheduling repair (`runFor(1)`). This is a subsequent test readiness failure. Controller covers single reload, quiet period, page recreation and manual recovery. Lost: real multi-document route preservation and startup live-region identity wiring. Remaining recent-reload case protects visible recovery action and focus. |
| Session rotation, mobile | Run `42690568978` / job `129409032323`, SHA `7aee4cff078e8790ee16b8e4f4f235ada546fdcf`: H1 absent after bootstrap boundary; artifact subsequently includes Empire. | Remove remaining mobile variant. `c199b798` consumed phase-ordering repair; `5f61be69` removed desktop after recurrence and repaired shared teardown tracking. Do not reset repair count for mobile. Coordinator tests retain quiet recovery and explicit admission refusal, and remaining quiet-recovery click browser case retains unsent edit/error wiring. |
| Alliance create/invite/join/recall, 390 | Run `42652228544` / job `129281517942`, SHA `d1f4be636486c22d5378b51dcd47365c549ffc07`: expected Joining closed, saw Joining open and two fleets. Artifact says "Recall Mission: Action committed; awaiting updated view." | Remove both variants under unexplained-test-defect rule. Mock mutates group closed synchronously before receipt; artifact proves receipt processing, but does not explain why revision reconciliation was late. No prior recall repair found (introduced `bc93670b`; `6292946b` only gates navigation). Do not invent a second poll or increase assertion time. Engine/database coverage protects actual invite/join/recall semantics; surviving invitation and simulator cases retain independent browser controls. Lost: chained create/invite/join/requote/recall browser command wiring and recall layout. |

Eight failing jobs are retained as evidence: two resource-history, one resource
entry, two Galaxy, one startup reload, one session rotation and one alliance.
No GitHub reruns or queue changes were requested. A later DOM snapshot is
readiness evidence, not proof that any unchanged rerun repairs the test.

## Deterministic retained and replacement coverage

- `features/progression/production-autosave.test.ts`: "serializes rapid edits,
  waits for reconciliation and merges into current confirmed settings";
  "retains rejected edits and retries only edited fields against a refreshed
  revision"; "waits for a restored command before rebasing new edits"; "queues
  behind a restored body command without an intent and resumes automatically";
  "shows restored %s settings, with newer local edits taking precedence"; and
  "does not overlay restored production when %s". These protect controller
  invariants alongside the restored browser cases; they do not replace mounted
  sliders after route remount, live saving/error banners, Retry wiring or real
  browser-storage reload restoration. All four healthy production settings cases
  remain unchanged from the base until interactive replacements exist.
- `client-model/player-profiles.test.ts`: "shares a source request, refreshes
  changed tiers and clears removed support", "expires at the exact deadline
  even during an outage", "fences old responses on navigation and session
  disposal", and "$type replaces a public bot identity with human on foreground
  refresh" for Rankings/Galaxy/Incoming/Report. Adapter tests preserve source and
  binding validation. `features/supporter-identity.test.ts` now checks each tier's
  accessible label and palette selector, plus absent decoration for ordinary
  players. Actual computed RGB colors are no longer checked by the retired test.
- `client-model/client-update.test.ts`: "ignores absent/matching headers and
  reserves one reload across concurrent responses and page recreation", "fails
  closed on blocked storage, invalid timestamps, and clocks moving backward,
  while allowing manual reload", and "does not reload incompatible data without
  evidence of a new build or hide an already scheduled update". Adapter coverage
  checks mismatching build headers before incompatible data decoding.
- `client-model/coordinator.test.ts`: "does not queue a gameplay action refused
  before admission by session rotation", "explains an action blocked by an
  earlier quiet session refresh without queueing it", and "explains a session
  refresh that starts while an unsent action is being saved".
- `features/attack-group-model.test.ts`: "derives distinct owners and closes
  joining at the shared deadline" and "waits for the shared arrival and keeps an
  independent return". Existing engine tests `invitations_are_initiator_only_respect_blocks_and_invalidate_join_quotes`,
  `recall_keeps_delay_closes_joining_and_uses_uncapped_elapsed_time`, and
  `joined_fleets_fight_once_and_return_independently` cover the domain. Existing
  PostgreSQL `invited_group_join_restart_battle_reports_and_returns_in_both_runtimes`
  covers persistence. Rust tests are retained but not rerun in this browser-only
  migration. Browser mocks never proved server authorization or persistence.

## Original scenario inventory

### resources.spec.ts

| Original scenario (all original variants) | Disposition and retained protection |
| --- | --- |
| resource rows retain detail inspection alongside quick build | Detail navigation versus quick-build submission and pending feedback. |
| unaffordable building tiles show resource shortages before opening and update with live balances | Live balances reach both tile tooltip and open confirm controls; component migration candidate. |
| unaffordable tiles stay striped when another building starts and quote refresh is slow | Construction/grid and affordability wiring during unavailable quotes; component migration candidate. |
| Improve and resource blockers follow current balances while the quote stays open | Open-confirm controls subscribe to live balances; component migration candidate. |
| an open quote refreshes when a confirmed building level changes | Open detail refreshes after authoritative level changes; component migration candidate. |
| resource settings keep production rules and fuel figures without repeated helpers | Production/fuel labels at desktop and mobile; component migration candidate. |
| unedited production controls follow current saved settings | Untouched sliders follow refreshed authoritative settings; component migration candidate. |
| resource cost images expose live details on hover and keyboard focus | Hover and keyboard focus expose resource details. |
| resource cost details open by tap and fit a phone viewport | Touch details fit phone viewport. |
| level zero buildings offer upgrades without a tear-down option | Upgrade-only control visibility for level zero; component migration candidate. |
| building tiles open top details, preserve quoted commands, and restore keyboard focus | Detail route, command confirmation and returned keyboard focus. |
| production autosaves rapid edits after reconciliation and keeps confirmed totals | Retain unchanged from base: pending sliders across route remount, live saving status and reconciled totals; controller tests supplement these browser bindings. |
| production rejection retains edits and retry preserves unrelated server changes | Retain unchanged from base: live rejection banner, retained edits and actual Retry wiring preserving unrelated server settings. |
| production edits survive a restored ${restoredCommand} command | Retain both variants unchanged from base: actual browser-storage reload restoration and mounted pending-slider projection; controller tests supplement restored-command ordering. |
| resources fit compact and touch layouts in all three states | Scene/building/settings geometry at 1440/768/390/320. |
| a late inspection cannot overwrite another building or reopen dismissed details | Late response versus selected/dismissed detail wiring; component migration candidate. |
| blocked quotes cannot purchase and details remain usable with reduced motion and enlarged text | Disabled submission plus reduced-motion/enlarged-text usability. |
| legacy resource catalogs retain cancellation and refresh the open upgrade after completion | Legacy catalog cancellation/detail reconciliation wiring. |
| stockpiles, energy, and signed hourly rates round down to whole units | Actual strip/popover rate formatting and Escape behavior; component migration candidate. |
| construction cancels from ${pageName} building details without an upgrade quote | Cancel without loading an upgrade quote, resources and facilities. |
| building grid shows confirmed construction on ${pageName} protocol ${protocol} | Confirmed construction indicators across page/protocol consumers; component migration candidate. |
| mobile construction starts visibly before the server responds and rejection rolls back | Mobile optimistic construction and rollback wiring. |
| construction cancellation is reachable in the building queue and recovers on rejection | Queue cancellation button and rejected-action recovery. |
| resource accrual enables an open quote even while the next server snapshot is delayed | Accrued balance propagates to an open confirm control; component migration candidate. |
| active construction stays visible without covering current work at enlarged text sizes | Construction geometry under enlarged text. |
| new local errors and older rejections stay visible and dismiss independently (${dismissFirst} first) | Independent error dismissal in both orders; component migration candidate. |
| an accepted construction can be cancelled before its engine outcome arrives | Cancel an accepted pending construction via rendered control. |
| resource catalog and exact decision ledger fit desktop and narrow phones | Catalog/ledger geometry at desktop and narrow widths. |
| fractional balances stay whole in the ledger and tooltip without enabling an unaffordable upgrade | Fractional amounts agree across ledger/tooltip and disabled purchase; component migration candidate. |
| legacy item links inspect other buildings during construction without stale or endless loading | Legacy item deep links during active construction. |
| resource list Settings opens the selected planet's controls at ${width}px | Selected planet link, Enter activation and Back at 1440/390/320. |
| resource settings navigation preserves history and reload support at ${width}px | Keyboard entry, focus, active navigation, reload and browser history; repair described above. |
| resource settings follows the selected planet on protocol 4 | Body selection preserves resource-settings route and corresponding production. |
| resource settings navigation opens production controls for supported protocols on protocol ${protocol} | Retain provisionally: protocol 2 unavailable route and protocol 3/4 actual controls. Additional parent-baseline protocol-3 failure is unclassified; evidence and pending disposition recorded below. |
| production sliders support mouse, keyboard bounds and final saves | Mouse input, keyboard bounds and final save plus compact controls. |
| energy links retain details and native modifier and keyboard navigation | Retire after local repair attempt failed in shared startup; see final local disposition. Native modifier/new-tab assertion is lost. Resource-settings history retains keyboard entry and route/focus behavior; touch case retains energy-link activation. |
| touch taps navigate to energy settings and set a production slider | Touch-context tap and slider interaction. |
| full-storage warnings open the selected planet's matching storage at ${width}px | Storage deep link activation in desktop and touch contexts. |
| production throttling has one cooldown message and waits for retry at ${width}px | Error banner uniqueness and explicit retry control; timing permutations belong to controller, component migration candidate. |
| resource settings opens usable controls and saves changes at ${width}px | Protocol 4 real slider, command receipt, saved status and persisted reload value; shared bootstrap repair retained. |

### player-profiles.spec.ts

| Original scenario (all original variants) | Disposition and retained protection |
| --- | --- |
| Galaxy shows all three supporter levels and ordinary players, then removes changed and expired badges | Retire defective broad scenario; deterministic and static replacements plus explicitly lost coverage above. |
| espionage and combat observations use current public identities without changing historical facts | Retain Report-source identity link/tooltip focus, Escape and historical-report consumer wiring for spy/espionage/combat. |
| bot profile labels follow authoritative refresh at ${width}px | Retain "bot profile labels follow authoritative refresh at 390px", including bot-to-human refresh on the already-mounted consumer, removal of Bot and updated dossier. Consolidate only the duplicate desktop variant; source permutations remain in controller tests, desktop popup/geometry in attachments/report cases. |
| player attachments align together and long identities stay within narrow rows | Retain measured baseline, narrow-cell containment and tooltip access at 1440/390/320; wait for Rankings identity delivery, and do screenshot-only scrolling only when capture is enabled. |

### client-update.spec.ts

| Original scenario (all original variants) | Disposition and retained protection |
| --- | --- |
| deployment reload preserves the route and stops a repeated update at startup (${size}) | Retire both widths after recorded repair; deterministic replacement and exact lost wiring above. |
| a recent reload keeps the empire visible with an accessible recovery action (${size}) | Retain recovery control focus, preserved Empire and overflow at desktop/mobile. |
| unreadable snapshots offer recovery without claiming the connection is lost (${viewport.width}x${viewport.height}) | Retain incompatible payload to visible recovery-action wiring; component migration candidate. |
| foreground recovery preserves edits and only announces verified failures (${size}) | Retain foreground lifecycle, preserved edits and live-region wiring; controller owns response permutations; component migration candidate. |
| offline actions and uncertain orders stay actionable after recovery (${size}) | Retain offline form/uncertain-command retry wiring and preserved draft; component migration candidate. |
| session rotation recovers quietly but a refused action remains explicit (${viewport.width}x${viewport.height}) | Retire remaining mobile variant after recorded repair; coordinator and quiet-recovery browser coverage above. |
| a click during quiet session recovery is explicitly refused (${viewport.width}x${viewport.height}) | Retain actual unsent form action, draft and refusal message through quiet recovery at desktop/mobile; component migration candidate. |

### alliance-attacks.spec.ts

| Original scenario (all original variants) | Disposition and retained protection |
| --- | --- |
| create invite join and recall group ${width} | Retire both widths as unexplained defect; engine/model/database coverage retained and precise browser loss recorded above. |
| allied simulation preserves separate technologies ${width} | Retain separate allied form input groups, submit and result invalidation at desktop/mobile; simulation-allies controller covers technology/limit permutations. |
| group combat reports show individual returns ${width} | Retain deep-link report consumer and separate own-return rows at desktop/mobile; component migration candidate. |
| invitation and hostile group visibility ${width} | Retain invitation route controls, hostile unknown-composition view and HUD invitation link at desktop/mobile. |

## Integration ownership and limits

Parent chat `01a1c30e-5f41-7b80-954c-8327ee15dcf4` owns the shared response
fixtures, component harness and routine CI selection. Integrate this commit by
cherry-pick; this worktree does not touch its baseline checkout. The source-aware
profile consumers now reuse `withFixtureResponse` for successful completed
Report/Rankings identity delivery rather than headers or unrelated world/ranking
data. The parent should retain this operation/identity-specific contract when
changing the shared helper. No separate interceptor was added.

The inventory explicitly marks retained component-migration candidates. Those
are still application browser tests, not completed component migrations. The
parent owns their next placement through the shared harness; do not exclude them
from CI before equivalent interaction/geometry coverage exists. This commit does
not recreate retired scenarios in that harness. In particular, preserved
controller invariants must not be presented as restored multi-document startup,
Galaxy color/layout or chained alliance-command browser protection.

## Validation

- Tested base `a119915ffaeb881a7f54d65542478f4788bd4210` plus this commit's owned
  changes. Existing pinned node_modules were reused via a temporary symlink;
  no install or lockfile change. First targeted pass used the shell's Node
  23.3.0/npm 10.9.0; final validation explicitly used installed Node 24.18.0.
- Initial controller/adapter pass: 116 tests in 8 files passed, 3.00s runner.
  Initial focused browser pass: 13 cases passed, 6.097s module preparation and
  35.3s Playwright runner. No failure or retry. The final pass adds static tier
  tests and source-complete profile response gates and validates the pinned runtime.
- Final deterministic command: `npm test -- src/client-model/player-profiles.test.ts
  src/adapters/player-profiles.test.ts src/client-model/client-update.test.ts
  src/adapters/client-update.test.ts src/client-model/coordinator.test.ts
  src/features/progression/production-autosave.test.ts
  src/features/attack-group-model.test.ts src/features/simulation-allies.test.ts
  src/features/supporter-identity.test.ts src/shell/routes.test.ts
  src/shell/catalog-routes.test.ts`: 136 tests / 11 files passed, 4.62s runner.
- Scoped ESLint across the four browser files and new supporter test, TypeScript
  `tsc --noEmit -p apps/web`, new-test Prettier, and `git diff --check` passed.
  Static-check wall time was not independently captured.
- No production UI changes: screenshot requirement is not applicable. Existing
  independent layout/focus assertions remain active with capture disabled.
- No full browser suite, database setup, GitHub rerun, push, PR or merge. Remote
  queue/merge wait and database execution are not applicable. Local runner wait
  outside reported preparation/execution was not independently captured.

### Local teardown defect found during migration

The expanded run emitted refused real-backend connections after the resource
accrual and both independent-dismissal scenarios, although assertions passed.
The accrual test removed *all* interception with `unrouteAll` while its live
coordinator could retry `/overview`. The dismissal tests restored online state
immediately before context teardown, starting `/updates` and `/overview` work
with no further assertion. Both patterns originated in `88a55aac`; history and
the repair ledger contained no earlier repair for these boundaries. Their first
repair keeps interception installed and drains held overview delivery with the
existing `trackFixtureResponses`, and leaves the isolated offline contexts
offline until close. No negative network assertions were removed. An audit of
all four owned files found no other `unrouteAll` or terminal `setOffline(false)`
caller. Parent owns the broader shared-fixture audit and unexpected-API guard.

A further refused overview request appeared around the touch-slider test, which
closed its explicit context as soon as the fixture observed command submission.
The test now requires the rendered saved status before closing, so submission
observation cannot substitute for reconciliation. Parent should keep auditing
shared fixture teardown and popup interception: a green local assertion alone
does not establish that every browser API stayed inside the fixture.

- Expanded focused command: `npm run test:ui -- resources.spec.ts
  player-profiles.spec.ts client-update.spec.ts alliance-attacks.spec.ts
  --workers=1`: all 68 retained cases passed, 12.005s module preparation and
  4.7 minutes runner. This is the four owned files, not the full repository suite.
  The refused-backend teardown observations above were retained and investigated
  despite that green result; final teardown edits are validated separately below.

- Teardown follow-up: five selected resource cases passed, 13.474s preparation,
  29.7s runner. Accrual, both offline dismissal variants and touch save emitted
  no backend proxy error; the adjacent modifier-click case exposed a distinct
  `/api/v1/bootstrap` leak from its new tab. Page routes do not cover that tab's
  first navigation. Its first repair provides an explicit inert document for the
  exact new-tab URL at context scope and asserts that URL. The source page stays
  at its original URL, and Enter still opens the real production controls. This
  tests native modifier navigation without pretending the popup is fixture-backed
  application acceptance. No blanket API success handler is added. History
  (`241daf66` introduction and later navigation selector updates) contains no
  earlier popup-interception repair. Parent's shared-fixture audit should cover
  other popup callers.

### Final local disposition: native modifier scenario removed

The explicit popup-boundary repair attempt failed before reaching that boundary:
`setup` expected `main h1` Resources and found no element within the existing
five-second assertion. Retained error-context subsequently contains Resources
with focus and the correct energy link. Preparation was 26.596s; the failing
scenario was 8.4s. This is an observed assertion failure, not an inferred
infrastructure incident; no unchanged retry was run. Since the scenario failed
after its repair attempt, remove `energy links retain details and native modifier
and keyboard navigation` outright, including the attempted inert popup fixture.
Do not reset the repair budget because the new failure occurred before the
changed boundary. The exact evidence is retained in the task-local
`test-results/browser-ui/resources-energy-links-ret-fa73f-ier-and-keyboard-navigation/`
artifact.

Lost: the native Control/Meta new-tab check and the energy tooltip's supplied-text
check in this scenario. Remaining `resource settings navigation preserves history
and reload support` protects Enter, H1 focus and history; `touch taps navigate to
energy settings and set a production slider` protects the real energy destination;
resource-cost hover/focus and tap tests still exercise the shared tooltip control.
Route tests preserve canonical resource-settings route parsing. Those checks do
not claim to replace the deleted native modifier behavior. Final inventory is
67 retained browser cases, down from 79; the expanded 68-case pass predates this
last deletion. Local assertion failures: one, recorded here; local unchanged
retries: zero. The final remaining source edits were covered by the five-case
follow-up pass; no second test-design repair was made for the deleted case.

All task-owned Vite/Playwright/Vitest runners exited. Temporary node_modules symlink removed after validation; cached dependencies were not modified. Local failure artifacts remain ignored for inspection. No task-owned database/container resources were created.

## Additional parent baseline evidence: protocol-3 resource settings

Received after commit `3c20de64153f38e8559a111e69d806327c4c4236`.
The parent baseline tests base `a119915ffaeb881a7f54d65542478f4788bd4210`;
it is a separate execution from this worktree's validation above.

- Exact scenario: `resource settings navigation opens production controls for
  supported protocols on protocol 3`.
- Source assertion: `resources.spec.ts:1825:43`, immediately after
  `withBootstrapResponse` wraps the direct resource-settings navigation.
  Expected `main h1` text `Resource settings`; no matching element within the
  existing 5000ms assertion. Test duration 13.621s, retry index 0, worker index 3,
  parallel index 2, start `2026-11-10T02:23:16.402Z` (November 9, 21:23:16 EST).
- The retained error-context subsequently shows the focused `Resource settings`
  H1, `Production controls`, metal slider value 100, and saved status. The
  inspected PNG also visibly shows Resource settings and the metal slider at
  100%. Thus the retained artifacts show the intended eventual UI; they do not
  identify which asynchronous phase delayed the earlier assertion.
- Protocol 2 passed in 7.088s and protocol 4 passed in 15.526s in that baseline.
  These outcomes do not erase the protocol-3 failure or establish its cause.
- Parent reported host load 45.5 on 12 cores with concurrent Vite/Chromium/tsc
  work and other startup-heading failures. This is relevant environmental
  evidence, not proof of an infrastructure cause. The report contains no trace
  establishing main-thread scheduling, module loading, or response-to-render
  ordering during the assertion interval. Product, fixture and infrastructure
  classification therefore remains unresolved.
- History inspected again: `6292946b` already added `withBootstrapResponse` to
  this exact direct-navigation boundary. Do not silently reset that repair
  history. No further repair, timeout increase, browser run, production build or
  full typecheck was attempted in response to this evidence.

Evidence locations (read-only inspection; originals preserved in parent):

- `/Users/ethan/.codex/worktrees/c478/orbit-imperium/test-results/test-strategy/baseline-a119915f/results.json`
- `/Users/ethan/.codex/worktrees/c478/orbit-imperium/test-results/browser-ui/resources-resource-setting-26cdc-ted-protocols-on-protocol-3/error-context.md`
- `/Users/ethan/.codex/worktrees/c478/orbit-imperium/test-results/browser-ui/resources-resource-setting-26cdc-ted-protocols-on-protocol-3/attachments/failure-1-00cd08e47ac7a98d3fe36507d8d461fea38d8f25.png`

Disposition: preserve the current scenario provisionally while the parent owns
classification and serial integrated validation. This is an explicit unresolved
finding, not a completed repair or a reliable-pass claim. If classified as a
post-repair test defect, apply the one-repair retirement rule; do not recreate
its journey under another name. If classified as an infrastructure failure,
record the concrete causal evidence separately. This adds one parent-baseline
assertion failure to the evidence inventory, without changing the previously
reported local failure count or the 67 retained-case count.

## Static-review correction: restore healthy mounted-consumer coverage

Parent review identified concrete coverage loss in the initial consolidation.
Controller tests cannot establish React subscriptions, route remount behavior,
rendered saving/error banners, Retry event wiring or browser-storage reload
restoration. No failure justified retiring these healthy scenarios.

Restored byte-for-byte from base `a119915ffaeb881a7f54d65542478f4788bd4210`:

- `production autosaves rapid edits after reconciliation and keeps confirmed totals`
- `production rejection retains edits and retry preserves unrelated server changes`
- `production edits survive a restored production command`
- `production edits survive a restored legacy upgrade command`

Also restored the original mobile `bot profile labels follow authoritative
refresh at 390px` live-update assertions. After a source-specific complete
Rankings-profile response on page restoration, the already-mounted identity must
remove Bot, retain Harvester, and open a dossier showing Commander without Bot or
Automated player. The desktop duplicate remains consolidated. The shared
`withFixtureResponse` helper continues to gate both initial and refresh delivery.

The earlier initial-consolidation narrative and case counts are historical, not
the final disposition. Final inventory is **71 retained browser cases** (four
restored production cases added to the prior 67). Failure-driven retirements,
resource-history keyboard ordering and recorded unresolved protocol-3 baseline
failure are unchanged. No retired failing scenario was recreated.

Validation for this follow-up is limited to exact source comparison of the
restored production block and mobile refresh assertions, diff review and
`git diff --check`. No browser, production build, full typecheck or other runner
was launched. Parent owns serial integrated validation of all 71 retained cases,
including the restored production cases and live mobile profile refresh. Earlier
136-unit and browser results are historical checks, not validation of this
follow-up revision.

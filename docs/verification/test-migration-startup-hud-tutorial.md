# Stream 06 — Startup, authentication, recovery, HUD and tutorial

Stream 06 starts from main `73e865124518c02fb69a10f476e816d1f9b419a1`.
The independent audit branch `emick/test-migration-audit` records this assignment at
`e1ab5a459c17ee33e7720c7cdd89214b3d1ba4e2` against the frozen `0c235fd6` inventory.
Stream 06 covers nine application specs and the original isolated HUD toast spec.

| Inventory | Rows | Use |
| --- | ---: | --- |
| [Historical baseline](test-migration-startup-hud-tutorial/baseline.csv) | 150 | Pre-phase-one application IDs and original full title paths, including exhausted repairs |
| [Frozen current](test-migration-startup-hud-tutorial/current.csv) | 144 | 139 application and five component cases at the audit snapshot |
| [Delta](test-migration-startup-hud-tutorial/delta.csv) | 155 | Five removed and seven added identities between snapshot and implementation base. Another 87 removed and 56 added between base and final collection. Renames have both records. |
| [Final cases](test-migration-startup-hud-tutorial/final-cases.csv) | 115 | 69 application and 46 isolated cases, each with its actual Playwright ID, full title and protection |

Main started with 141 application and five component cases. The scoped journey/feature
collections are disjoint. Their union exactly matches the 69 required application
cases (10 journeys and 59 features). All 115 final titles have an observed local
browser pass. Stream 10 owns the final global gate.

## Boundaries

| Area | What the lower layer exercises | What the application still proves |
| --- | --- | --- |
| Public entry and enrollment | Real Login and HomeLanding layouts without game startup. The runtime controller owns held bootstrap completion/backoff. OIDC config has an abortable request boundary. The hosted join predicate checks local mode, missing/mismatched bindings and current hosted target. | Document/bootstrap entry, safe canonical return, native form edits, rejection and busy feedback, hosted redirect, recovery URL without automatic enrollment, deliberate retry and stable geometry. |
| Client recovery | The coordinator owns receipt polling, superseded startup and stale outcomes. A committed Login receipt used to schedule a one-second overview poll before clearing its satisfied minimum revision. Scheduling against the accepted state removes the extra fetch. | Focus/visibility, offline editing, a refused click with no outgoing order, an actionable uncertain order in the current session, unreadable payloads and client-version recovery. |
| HUD and captions | Real Coordinator, report engine, useCommandHud, orb, toasts, panel and native IntersectionObserver use prepared data and controlled external ports. The list keeps its buffered rows, enabled control, focus and aria-busy state during passive refresh. Explicit outstanding pagination shows loading. Real scroll, retry, modal exit/inertness and focus return run in Chromium. Model tests own expiry, coalescing, queued observations, stale batches, quote projection and caption timing. | The shell anchors the same panel across sizes. Actual subscription/route changes deliver notifications, report deletion, espionage targeting and fleet navigation. A real quick-build crosses submission, quote and HUD. Returning to the foreground delivers an overview and updates the orb. |
| Tutorial | The mounted Briefing, advisor, icon and Develop navigation receive actual store updates. Tests exercise late acknowledgement, chapter order, out-of-order and final receipts, full-interface suspension, canonical chapter links and Facilities promotion. Existing stream 04 cases cover disclosure, rewards and modal focus. | The real Briefing route, catalog destinations, same mounted orb, touch/keyboard handoff, account preference reload and no-order navigation. |
| Release announcements | The real announcement bubble and orb render long lazy editorial content, handle nested scrolling, keep actions visible and restore focus after Got it. Stored-account history, windows, ordering and parsing have deterministic tests. | A live client revalidates its feed, suppresses it for a threat, responds to external withdrawal, restores Command uplink and remembers Escape dismissal across reload. |

The runtime announcement tests intercept `/api/announcements` as an external
input. Compiling the fixture application is insufficient evidence of publication.
The real operator CLI test publishes, edits, withdraws, restores and serves
content from temporary files. The HTTP revalidation test exercises ETag, cache
expiry and unavailable/recovered feed responses. No content was published to a server.

The current-base deltas include the #391 split between reward dismissal and
next-job navigation, #392 direct-address captions, #394 universe-bound entry,
#407 fleet-card Galaxy activation, #408 section-specific settings and #435/#440
homepage, beta and support changes. Base UI placement follows #439, account
links follow #443 and Empire identity follows #444. Orders use #445's in-memory
retry semantics. #452 removed report-read confirmation copy. Commands and
recovery consume the current authoritative state after #451/#454.

## Failure and retirement history

- **Foreground refresh.** Main run [43359549586](https://github.com/unbought-games/orbit-imperium/actions/runs/43359549586), job `131669658426`, artifact `14007912034`, failed after the test released its gated overview. We retrieved the original results, screenshot and accessible page snapshot. Empire rendered without a caption. The request flag showed interception only. The artifact contains no accepted-state timeline distinguishing a rejected/superseded snapshot, a rendering issue or expiry. PR #406 made no repair. Later address and overlay changes do not establish a cause. Under the unexplained-failure rule we removed that exact held-HTTP/reduced-motion case. The existing ordinary-motion application case observes foreground overview delivery and the visible confirmation. Independent real-orb cases check atomic live text, a decorative pulse and reduced-motion CSS. The return-refresh controller tests require a fresh accepted view, including unchanged revision, and wait through stale/failure states. The combined held-response/reduced-motion browser sequence is a recorded loss.
- **Earlier retirements.** The #385 native swipe followed by tapping a promoted card stays retired. Mouse, keyboard, deterministic swipe handling and independent prototype touch gestures still run. Startup reload/session rotation, desktop quiet recovery and transient orb overlap retain their historical dispositions. The mobile refusal case still verifies the draft and zero submissions. Normal-motion blanket assertions remain retired in stream 05. [HUD repair history](test-migration-hud.md) and [entry and shell repair history](test-migration-shell-profiles.md).
- **Product regression.** The deterministic slow Login case counted two overview reads after a committed receipt satisfied the minimum. Moving scheduling after revision/stale reconciliation fixed the reproduced request count. Committed, pending and invalidated schedules passed. The separate historical missing-caption failure has no proven connection to this defect.
- **HUD fixture authoring.** Thirteen first attempts stopped before the gallery mount because its Attack capability supplied a reason outside the real schema. The other nine prototype/toast cases passed. Corrected the prepared external data, exercised the actual initialization/report/mailbox validation, then ran all 19 command-HUD/intelligence cases successfully. A new unit expectation also used “1m 0s” where the canonical duration suppresses zero seconds. Correcting it to “1m” preserved the submitted quote assertions. The original application assertions stayed available during migration.
- **OIDC error fixture.** In the 55-case entry/tutorial batch, 54 passed. We interrupted the remaining config test at 1.8 minutes. The screenshot showed its error and Try again button. The runner was waiting for requestfinished on a bodyless 503, which the adapter rejects on its headers. Its one repair waits for fulfillment of the intended refusal and the rendered alert, then requires complete successful config delivery on retry. The repaired case passed with the five recovery cases. The test carries this repair history forward.
- **Local PostgreSQL setup.** Docker's default address pools were exhausted. A task-local Compose override allocated the inspected unused `10.253.206.0/28`. With two concurrent fresh migration binaries, both OIDC and signup hit the existing ten-second schema preparation failure before their first domain assertion. The logs establish the operation and elapsed time, but cannot isolate the contribution of host I/O. We checked host connectivity and server health, enabled slow-statement diagnostics in the disposable instance, and ran with one Make database worker. All four binaries passed with the original migration guards. Each had its own database and serial tests. Cleanup removed only the task's container, network and volume.

## Validation

The source and tests ran on the implementation whose tree is
`9d40fff10b13728540ddca812d07ce971bf3340d`. The final source revision
`d44c06e79e9750c2053864cf8cb39d198580ab13` moves the missing-artwork check
after interaction with the mounted form. That affected case passed again. The
ledger and verification commit adds documentation only. Runs used Node 24.18.0,
npm 11.16.0 and the repository's native runners. Local package setup took 3.94s.
One validation owner serialized browser bundles, browser suites, builds and full
typechecks. Runner allocation is inapplicable locally.

| Local check | Result | Preparation / execution |
| --- | --- | --- |
| Entry, coordinator, delivery and config units | 264 passed across 14 files | 2.16s Vitest |
| Tutorial engine/model and HUD controllers | 36 tutorial and 121 HUD cases passed in focused runs. Updated model suites also passed. | 4.08s / 3.12s Vitest |
| All client units | 2,062 passed across 228 files | 14.22s Vitest |
| Initial isolated tutorial and editorial | 8 passed | 15.656s / 8.5s |
| Isolated public entry and two additional Develop cases | 7 and 2 passed | 16.556s / 10.3s and 7.475s / 3.1s |
| HUD gallery and native inputs | First run 13 mount failures and 9 passes. Repaired command HUD and additional intelligence cases 19 passed | 13.913s / 1.1m and 7.293s / 20.4s |
| Final observer, buffered loading, long/reduced-motion captions and stream 04 tutorial controls | 11 passed | 6.427s / 6.8s |
| Final mounted-form readiness assertion | 1 passed | 5.333s / 1.7s |
| Entry, recovery, content and tutorial application | 54 passed, 1 interrupted. Repaired config and five client-update cases passed | 5.813s / 2.0m and 6.716s / 6.2s |
| Retained command HUD and playground application | 11 passed | 6.176s / 16.0s |
| Release announcements and running-app visual check | Three retained application cases and both original long-content viewports passed. Desktop/mobile captures of open, scrolled and dismissed states inspected in implementation chat | 7.874s / 7.4s |
| PostgreSQL OIDC, signup, recovery, tutorial | 14 + 8 + 1 + 3 passed. Three existing explicit-only cases excluded | 2m18s initial compile. Final suite executions 16.727s, 27.040s, 4.539s, 14.960s |
| Real HTTP transport | 92 passed, including enrollment policy, origin/CSRF, session cookies, activity renewal and cancellation | 55.25s / 26.371s |
| Real announcement CLI, persisted files and HTTP | 1 passed | 46.09s / 2.891s |
| Static checks | Component TypeScript, client production build/typecheck, ESLint, Prettier, boundary checks and git diff checks passed | Vite build 5.48s, prerender bundle 0.782s |

The database suites exercise concurrent signup/capacity/restart, OIDC mapping,
rotation across replicas, logout against late refresh, lost acknowledgement and
concurrent spend, and one-time tutorial rewards. The artwork and consent fixtures
stay local. Generated analytics-route drift encountered during build was excluded.
Browser fixtures released their preview servers and temporary bundles.

## Cross-stream handoff

- **04 and 05.** Reuse the five existing tutorial/settings component cases and shared shell/public-layout surfaces. Stream 05 owns shell.spec.ts and its route/focus contracts.
- **07 and 08.** The alliance noticeboard's expired-cursor live region remains in the original running screen. Reports retains full reader and sharing behavior. Stream 06 retains report deletion across the Reports route and the open HUD, plus the native HUD list, retry and settled focus. [Social handoff](test-migration-social-components.md) and [reports handoff](test-migration-reports.md).
- **09.** Live identity-provider signup, restart and recovery remain explicit-only. The scoped fixture document reset/error distinction is retained. No suite was added to routine CI.
- **10.** Reconcile the four CSVs with the global inventory. The 59 remaining required feature cases and ten tagged journeys have individually named contracts. PR, merge-group and subsequent main run outcomes are distinct GitHub records.

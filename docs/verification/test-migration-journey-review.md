# Stream 10 interim journey reconciliation

On November 18, 2026, collection at main `03fd2a622acec3a99eda582c959d7783f274b87f` selected **53 journeys, 537 other required application cases and 515 isolated component cases**. No browser tags, selectors, shards or deadlines change in this slice. The broad feature cohort remains required. The production homepage and explicit acceptance have separate runners.

## What changed since the shortlist

The [candidate ledger](test-migration-journey-candidates.csv) has one row per selected application case, with full title ancestry, current Playwright ID, frozen predecessor IDs where available, domain owner and proposed cutover treatment. The source is the configured `journeys` selection. Its regex also matches two community-rewards titles without tag metadata. All 53 have the unnamed application project. The [frozen inventory](https://github.com/unbought-games/orbit-imperium/blob/0f68a762399cc6d7497230fb92137c2695613c69/docs/verification/e2e-migration/inventory/journeys.csv) uses its own ID scheme.

- **37** of the frozen 39 keep their full titles. Two tagged predecessors now run as consolidated cases across widths. The hosted-enrollment recovery and tutorial confirmation rows include their untagged sibling IDs as well. See the [06 disposition ledger](test-migration-startup-hud-tutorial/current.csv).
- **Eight** previously collected feature cases now appear in the journey cohort. They include the representative manufacturing submissions and the narrowed Resources, Empire and lifecycle cases. **Six** selected cases are new since the snapshot: Alliance deep links (#414), Galaxy arrow navigation (#418), both Rewards choice widths (#394) and both Jump Gate widths (#433).
- Current collection also found three application files absent from the frozen file list. `community-rewards.spec.ts` and `jump-gates.spec.ts` account for four of those six journeys. `game-invitations.spec.ts` remains in the required feature cohort. Stream 07 reconciles invitation/social behavior. Stream 10 owns final inclusion and evidence for post-snapshot Rewards and Jump Gate cases, consulting their feature implementations. No domain migration is reassigned here.

Reproduce the shortlist from the repository root with the pinned dependencies:

```sh
ORBIT_UI_E2E=1 ORBIT_BROWSER_SUITE=journeys node node_modules/@playwright/test/cli.js test --list --reporter=json
node --test scripts/test-policy.test.mjs scripts/ci-workflows.test.mjs
```

The second command checks actual job/shard selectors against the full application and component inventories. Collection verifies membership only. The numbers above exclude the separate built-homepage check.

## Decisions still needed for the final gate

| Owner and landed evidence | Contract to reconcile before cutover |
| --- | --- |
| [01 Resources and quotes, #387](test-migration-resources.md) | No tagged row from its owned files. Keep the required production autosave/rejection/restoration and selected-body Settings link/history cases. Compare the unique submission and reconciliation wiring with generic quick-build and Messages history before selecting a final gate. Four autosave/restoration cases were deliberately protected. |
| [02 Catalog and progression, #406](test-migration-catalog-progression.md) | Distinguish protocol-3 ship/defense submissions from the protocol-4 paired Battleship command. Pure quoted costs, quantity gates and item permutations already have owners. The retired Heavy Fighter toast/orb sequence stays a gap. |
| [03 Dispatch and fleets, #417](test-migration-dispatch-fleets.md) | Historical Deploy, reviewed launch/reset, Spy, mobile Harvest, desktop Enter and paid scan exercise different callers. Retain representative real submissions. Keep ownership, debit and idempotency below the browser. The later Galaxy shortcut case exercises route cleanup. Preserve both retired moon-reopening histories. |
| [04 Empire and settings, #446](test-migration-empire-settings.md) | Keep real review/confirm/cancel, selected-body navigation and the confirmed reload. Cargo values belong below routing; the retained case also opens an actual fleet detail. Four failed whole-page layout replacements exhausted their allowance; the original healthy shell cases remain required. Desktop vacation and rename/prune closures retain their recorded losses. |
| [05 Shell and navigation, #448](test-migration-shell-navigation.md) | Compare the Messages desktop/mobile selectors with Menu and desktop navigation before counting another history trip. Native destinations, document identity and responsive menu compositions can fail independently. The Alliance loading case now checks a real submitted search, held query, focused control and settled result. The shared component owns inertness and geometry. The old page-wide animation and badge/outage tours stay retired. |
| [06 Startup, HUD and tutorial, #456](test-migration-startup-hud-tutorial.md) | Keep embedded-state vs fetched startup, hosted return vs deliberate recovery, login/signup native entry, Quick Build receipt-to-HUD and tutorial navigation/preference reload. Mounted buffered HUD loading and focus moved to the real panel. The held-response reduced-motion caption and native swipe/promoted-tap sequence remain gaps. |
| [07 Social and identity](test-migration-social-components.md) | Active domain owner reconciles create/deep links, DM send/return, invitations and editor save. Retain the mounted bot-to-human publication and expired-cursor live announcement until equivalent production-consumer proof passes. The latter is a mounted-screen candidate. Do not recreate the old three-report/profile tours. |
| [08 Reports](test-migration-reports.md) | Keep anonymous public token entry. For rejected bulk cleanup, prove filtering/rollback below routing and observe actual restored rows and selection in the mounted triage surface. Reconcile privacy, revocation and durable deletion at HTTP/DB. Historical report-range/bulk-read stalls stay retired. |
| 09 Harness and acceptance | Account for unexpected API methods/paths/operations and earlier in-flight responses in shared fixtures. Reconcile the explicit signup, recovery, persistence, compatibility, deployment and production-artifact runners with actual revision-bound evidence. |
| 10 Final selection | Compare the paired Rewards/Jump Gate viewports and separate native layout/activation from duplicated command permutations. Use 07–09 handoffs and subsequent main deltas, including untagged cases, to account for every retained contract. Only then resolve remaining feature selection and verify the required union and the protected PR, queue and main revisions. |

All dispositions here are evidence for a later selection change. Current contracts govern replacements: generate canonical body paths through `routeTarget`; exercise Base UI overlays, in-memory order retries and confirmed reload data. Report-read confirmation messaging and the transition journal were removed. Restricted cosmetic fixtures must be independently authored and freely licensed.

The [audit owner's retrospective](https://github.com/unbought-games/orbit-imperium/blob/0f68a762399cc6d7497230fb92137c2695613c69/docs/verification/e2e-migration/RELIABILITY-2026-11-18.md) covers naturally occurring post-merge main workflows. It supplies neither per-test failure rates nor complete PR/queue attempts.

## Reviewer validation

The [review procedure](../../.agents/skills/test-design/references/browser-review.md) records the invocation and the required dispositions. On Codex CLI 0.145.0 the registration probe's spawn used `agent_type=browser_test_reviewer` and `fork_turns=none`. The resulting child session metadata recorded `agent_role=browser_test_reviewer`. The desktop collaboration surface used the role-file recipe with `fork_turns=none`.

In a disposable clone of the main revision above, a fresh reviewer received two behavioral requirements and the raw test diff from `b73349f6` to `99085387`. The anonymous Messages case was restored verbatim from main. The constructed work-summary example used a headers-only bootstrap wait, an early fake-clock advance, a fixed sample time and identical assertions at two widths. Neither verdict was supplied to the reviewer.

- **Anonymous entry passed.** The reviewer traced the protected route, complete bootstrap and login URL assertion. It identified losing the return fragment as a real defect caught by this case.
- **Work summary blocked at both widths.** The reviewer traced clock advancement before snapshot acceptance and the resulting late projection anchor, and identified the duplicate desktop run. It pointed to the existing 1440px component and deterministic projection tests, and kept the mobile Buildings-to-Metal Mine navigation that the example had dropped.

Both findings apply to the disposable example. The sound test and the corrected mobile journey already exist on main. This was a read-only behavioral trial without browser execution. The source handoffs retain domain validation, failures and repair history.

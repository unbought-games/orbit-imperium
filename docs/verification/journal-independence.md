# Journal independence bridge verification

Implementation and review record for the journal-independence bundle. Production
activation, final table removal, retention changes and incident closure are pending.
The [operator packet](../operations/journal-removal.md) separates bridge deployment
from the later destructive migration. No automatic DROP migration is included.

## Dependency arrangement

The isolated `feat/journal-independence` branch starts with reviewed activity PR
[#450](https://github.com/unbought-games/orbit-imperium/pull/450),
`902a0b1ad7d5a5496903bfad4ff3ef2e9e01f6f6`, merges reviewed logging PR
[#449](https://github.com/unbought-games/orbit-imperium/pull/449),
`ca506500b81b6db2582c6bb89945665497695a0b`, and integrates current main
`21128056` without changing either dependency branch. Integration baseline:
`22b3a926c0d9035ab6b948cb2d42e2a4149dbb57`. Before main integration, the combined
logging/activity tree matched the coordinator’s `e7d538b0756e00a4bbe4d5bc053fd31cf6c0eb6b`
exactly. The Makefile conflict retained both
activity Python and ship-appearance tooling tests. Compare this baseline to the
bridge head for the Chat 2-only diff; the main-targeted PR includes the inherited
PRs until the coordinator integrates them. Neither dependency PR is merged by
this work. Reconcile the stack against main before eventual merge.

The integrated migration collision was found by PostgreSQL before gameplay:
unpublished activity 0048 conflicts with main's published ship-appearance 0048
and 0049. This branch renumbers only the unapplied activity file to 0050, with
identical SQL contents. The coordinator must carry this numbering arrangement
into the final release. Published migrations and five frozen unmanaged-schema
fixtures are unchanged. This is not permission to renumber an applied migration.

## Individual dependency dispositions

The inventory was repeated against actual integrated source, including semantic
`journal` references, not only SQL. Source names below are repository-relative.

| ID | Disposition and protected evidence |
| --- | --- |
| J01 | `commit.rs` reads and locks the immutable command/event row. Exact OrderedInput equality covers identity, actor, universe, epoch, time, sequence, protocol, rules and payload. Done commands return their original terminal receipt; cancelled events return stale, not completed. `journal_independence` covers both modes and table states, duplicate attempts, changed inputs, rejection, reconnect, expired claims and lost scheduled acknowledgement. Existing recovery/ordering coverage remains. |
| J02 | Removed only the full-state insert. Current state, receipts/done, activity capture, updates and claim/cursor changes remain in one transaction. `journal_independence` asserts no table-present writes and identical effects on retries; explicit process recovery drops the table before all 18 crash/overlap scenarios. |
| T01 | `corruption.rs` retains input/receipt/done, cursor and fence assertions, adds exact body-row comparison and zero constructions for schema failure. |
| T02 | `mission_return_reason.rs` drops the table in its disposable fixture; startup/restart preserve exact unknown-cause fleet bytes and scan activation refuses unknowns. |
| T03 | `progression.rs` loads the real claim snapshot before each journey transition and asserts Body serialization omits capacity. Upgrade/demolition, restart, derived capacities and zero legacy capacity rows remain. |
| T04 | The same real pre-execution boundary checks facts/coverage and returned outcome for legacy reservation fields; queue, restart, output and absent legacy-table assertions remain. |
| T05 | `rules_updates.rs` captures input/facts rules identities before scheduled completion, then asserts original payment/deadline/profile and Completed state independently. |
| T06 | `tutorial.rs` reads original input and terminal receipt from the command row; exact input equality and one objective credit remain in both execution modes. |
| T07 | `transport.rs` retains real claim input/snapshot/result in test memory before each commit, replays all four independently and preserves balance, fuel, ships, reports, privacy, ordering and reopened-store checks. No substitute database history exists. |
| T08 | `bootstrap.rs` drops the table and keeps exclusive locks on all remaining live gameplay tables while proving metadata-only startup/readiness. |
| T09 | `rules_updates/impact.rs` removes only the retired table from raising-view sentinels; remaining forbidden gameplay reads/writes and exact unchanged-state comparisons remain. |
| T10 | `fixtures/progression.mjs` checks commands, terminal events, serial cursor/sequence consistency, resolved/current scopes, scoped sequence use, inventories, levels, research and fixture clock. Initial future events are allowed. `progression-e2e` proves an empty-history world with an advanced cursor is rejected before genuine pristine setup. |
| T11 | `migrations-e2e.mjs` checks the exact command and ConstructionDue terminal row, completed construction and final level after concurrent migration/killed migrator/restart. The additive migration probe remains; destructive cutover is separate. |
| T12 | `recovery.mjs` captures each due event ID before moving the controlled clock, or uses the exact submitted command ID, and waits for its terminal state. |
| T13 | Recovery retains exact balances, inventory, report counts, no pending work, four committed commands/four completed events and the separate overlap rejection. Before/after-commit worker kills and duplicate API/stream replay remain. |
| F01 | `missions-e2e.mjs` imports the guarded fixture, which drops the retired table only after disposable-name/pristine checks. Original mission assertions remain. UUIDv7 fixture changes belong to the later expiry bundle. |
| F02 | `progression-e2e.mjs` runs the same absent-table fixture and adds cleaned-history refusal. Original persistence, ordering, payment, output, interruption and retry assertions remain. UUIDv7 is deferred. |
| F03 | `raiding-e2e.mjs` uses the absent-table fixture. Combat/state/world_evidence assertions remain; world_evidence is not removed. UUIDv7 is deferred. |
| F04 | `rules-updates-e2e.mjs` uses the absent-table fixture; independent second-world creation now follows the single-world pristine guard. Its two compatible bridge builds must both be journal-independent. UUIDv7 is deferred. |
| F05 | `speed-updates-e2e.mjs` uses the absent-table fixture and retains speed/deadline/payment/isolation/restart checks. UUIDv7 is deferred. |
| B01 | `qualify_runtime.rs` builds mature live inventory/paid asset lots plus a bounded synthetic population of terminal commands/events in an independent fixture universe. Recent and older populations exercise retry/backlog index pressure without claiming implemented cleanup. The measurement runs with the table absent. |
| B02 | Workload v2 separately reports live and terminal relation bytes, recent and backlog payload bytes, and zero emitted logs for this subscriber-free direct-service harness. Previous evidence JSON is unchanged; it is not comparable journal storage. Production log measurement remains commissioning work. |
| B03 | Capacity verifies done/terminal receipts, paired presence/action counts, no duplicate admission, one construction per action and exact completed-level effects, without joining the journal. |
| S07 | All five frozen legacy refusal fixtures remain unchanged and the migrations suite still rejects them. Populated bridge present/absent startup and exact ledger preservation are covered by `journal_independence`. Rehearsal of the eventual forward DROP bundle remains the separate coordinator stage. |
| S08 | SQLx bundle/startup remain intact; the unapplied dependency migration number is reconciled. Bridge absence tests do not modify SQLx history. The coordinator owns the separate forward removal migration, fresh-install/upgrade rehearsal and old-writer exclusion. |
| H01 | Frozen storage-capacity snapshot and replay assertions remain unchanged; supplied artifacts require no live SQL history. |
| H02 | Legacy debris adapter remains offline, with original fixture bytes and expected hashes unchanged. The historical runbook now points to the current evidence contract. |
| H03 | Mission replay remains a supplied-snapshot/producing-release boundary, with original adapters and fixtures intact. Ordinary logs cannot reconstruct it. |
| H04 | Phalanx repair diagnostics require a previously captured complete trusted artifact; unknown/missing/conflicting evidence remains unknown. Current fleet return_reason and natural settlement remain authoritative. |
| H05 | Vacation documentation retires indefinite interval-history promises. Current policy, economy, minimum stay and scheduling are unchanged and independent of logging. |
| H06 | Runtime/persistence/development conventions now describe atomic completion/delivery and finite diagnostic history. Receipt expiry/cleanup are explicitly not implemented in this bridge. |
| H07 | Legacy/hash-stable state, progression and mission shapes remain supported; no fields or immutable accepted terms/rules were removed. Compatibility/replay checks protect them separately from journal retention. |
| H08 | Historical sensor-phalanx, alliance-depot and moon-fleet records retain their original evidence and gain a current-contract pointer; no old validation is represented as new bridge evidence. |

Additional semantic references in engineering conventions, development startup,
jump-gate rollback and mission-site test comments were updated under H06/H07.
Analytics source-journal terminology is a separate outbox contract and stays.

## Compatibility seams and final scan

`orbit_application::diagnostics`, `orbit_log!`, post-ack `admitted`, and serial/scoped
`commit_result` are inherited unchanged. Applied/rejected/completed/unknown outcomes,
info default and error/warn/info/debug thresholds remain. No trace, timers, hot
reload, logging framework or log-driven correctness was added. Chat 4's admission
activity policy, atomic `capture_committed_activity`, async delivery and retention
remain unchanged; no CMO/report definition or source cutover is included.

The final direct-reference scan permits only the published CREATE, five frozen
unmanaged schema snapshots, and explicit disposable-test DROP/presence/no-write
assertions. There is no serving runtime SQL reference. Offline artifact filenames,
legacy decoder comments, historical records and the separate analytics/world
outbox terminology are intentionally retained. Frozen fixtures/checksums remain
unchanged. No production query or write was needed.

## Validation record

Results and exact final revision are finalized after PR checks. Local runs use a
private Compose project and disposable per-binary databases, serial within each
binary. The explicit local network uses its own subnet after automatic pool
exhaustion; no foreign network/container was removed.

### Explicit browser repair ledger

The first F02 run failed five of six legacy browser scenarios before reaching
its process-recovery tail. History was checked (`responsive.spec.ts` last changed
by #330/#304/#140; progression also by #445), along with the Test Czar ledger.
This was not an infrastructure retry. One explained repair corrected link versus
button semantics, heading level, retired-control expectations and detail versus
catalog expectations. Keyboard orders and routing then passed. Three cases failed
again and were removed under AGENTS.md's one-repair rule; they were not renamed,
quarantined or recreated. Routine fixture selection was not reduced (these are
explicit-only cases).

| Retired case | Failure/repair evidence | Retained protection and limit |
| --- | --- | --- |
| `progression.spec.ts`: mobile/desktop controls, blocked purchases, pending work, private relogin | Missing unavailable fusion control; repaired to absence and correct queue location; next run expected retired “Required to improve” text. | Real keyboard facility/research/ship/defense orders remain in `responsive.spec.ts`; F02 HTTP schema/privacy/payment/output/restart and crash cutpoints remain. `coordinator.test.ts` owns lost-ack same-ID retry and uncertain-order persistence; session tests own private relogin. The combined browser tour no longer runs. |
| `responsive.spec.ts`: six-viewport route/geometry/history/stress tour | Generic DOM-sized-control audit included a noninteractive backing control; visibility-aware repair did not correct the overbroad geometry contract. | Required resource layout/touch tests, navigation component tests, shell-route unit cases and the real routing test remain. Their scoped contracts replace arbitrary every-node minimums; the single six-viewport tour and artificial 50-row stress chain are retired. |
| `responsive.spec.ts`: keyboard purchase/offline countdown/reconnect | Obsolete Buildings/detail expectation; repair exposed focus/input sent before quote loading settled (snapshot still shows unsubmitted quote). | Real keyboard order test awaits enabled controls. `game-projection.test.ts` proves elapsed time cannot complete authoritative work, and active-work UI tests cover waiting/focus states. F02 and process recovery prove durable output/reconnect. The compound offline browser choreography is retired. |

No product UI was changed to satisfy these tests. Original and second-attempt failure logs are retained in the private handoff.
The runner replaces screenshot directories on subsequent runs; original image
paths in those logs are not a promise that those files remain available.

F01 also exposed the legacy `missions.spec.ts` “galaxy, dispatch, original-pair
recovery, recall and authorized reports across G11 widths” tour waiting forever
for a removed `<summary>` control. The task-owned Playwright process was
interrupted after 2.6 minutes; its call log identifies that exact wait. One repair
used the current Galaxy menu and ship input. The tour then failed on the retired
“Mission history” heading and was retired under the same rule. The paginated
inbox/pending-detail browser regression remains. Real paired admission, original-ID
recovery, dispatch/delivery/report/return, detected combat/debris/harvest, privacy
and duplicate-spend assertions all remain in `missions-e2e.mjs`; required Galaxy,
fleet and report fixture/component tests retain focused browser wiring. The old
single five-viewport tour is no longer claimed. No product UI was altered.

F03's legacy “scout report → attack with lost acknowledgement → incoming → combat
→ return → harvest” browser tour also required retirement. Its first interrupted
wait assumed a scouting report was on the first inbox page after the HTTP crash
journeys. One repair supplied the actual scouting artifact and updated ship-input
selectors. The repaired tour reached combat but then waited for a missing harvest action
after archiving/navigating reports. It never reestablished that the exact current
fleet report was rendered; the broader browser choreography remained defective. The task-owned browser was
interrupted with its exact pending locator recorded. Under the one-repair rule,
the broad tour was removed, not recreated. The separate zero-debris harvest
visibility browser regression remains. `raiding-e2e.mjs` continues to assert the
exact report by fleet ID, private payload, survivor/loot conservation, harvest,
score delta and world_evidence, before/after-commit kills and original-ID retries.
Required dispatch/combat-report components and deterministic controller tests own
input/quote/lost-ack/presentation permutations. The removed combined browser tour
and six-viewport combat chain are explicitly no longer claimed.

F05 exposed a retired `ORBIT_LOCAL_INSECURE` fixture setting (replaced with the
supported HTTP setting), then a distinct shared-fixture corruption: only explicitly
listed research rows advanced revision, leaving newer supported technologies at
zero. The production loader requires one collection revision. `prepareProgression`
now updates all research revisions together; no integrity check was weakened.
Its callers were audited: legacy catalogs already updated every row, while the
current signup catalog exposed the defect. The settings browser fragment then
failed on its old Settings destination and still failed after one canonical-route
repair. That two-assertion fragment was retired under the same rule, replaced
with real bound HTTP settings assertions at 5× and 3×. The already-passing
`coordinator.test.ts` cases retain atomic rules/settings refresh, races and logout
coverage; `shell.spec.ts` retains the support-page UI wiring. Live browser refresh
inside this particular speed acceptance script is no longer claimed. All paid
work, economy, cutover, isolation, recall, restart, signup and audit checks remain.

### Completed local checks

Runtime implementation was first committed as `567825dcacd9124ee802337a4856bc4fa1c9c6e0`.
The follow-up revision adds validation repairs described here, strengthens identity
and receipt checks, and preserves the existing stale-commit metric on the new
cancelled/missing-row paths. The private handoff pins its exact commit and check
runs. No UI implementation changed; visual product acceptance is not applicable.

| Check | Result / timing |
| --- | --- |
| PostgreSQL initial affected binaries | 74 passed, two explicitly ignored tutorial experiments; recovery, transport, corruption, bootstrap, mission_return_reason, progression, rules_updates, tutorial, migrations and four-way journal matrix. Preparation 31.91s on the first build; rules_updates execution 415.980s, remaining binaries 2–17s each. |
| Strengthened PostgreSQL follow-up | 10 passed, two same ignored experiments across journal_independence, transport, tutorial, analytics and ordering; execution 7.651 / 1.979 / 6.670 / 2.474 / 3.830s. Final metric-path edit receives a focused journal/ordering recheck. |
| Offline engine compatibility | 266 passed across replay, debris, missions (including vacation), progression, phalanx and policy; 8.712s execution. Frozen fixture bytes and expected hashes were not regenerated. |
| Controlled client boundaries | 150 passed across coordinator, game projection, session and shell routes; 0.683s. Includes uncertain-ID retry and coherent rules/settings refresh races. |
| Tooling | 130 passed, one explicit-only skip, 11.405s; test selection and fixture-name refusal included. |
| Rust Clippy / formatting | Scoped engine/storage all-targets with test-support and warnings denied passed (19.19s); formatting and whitespace passed. |
| Server and production web build | Passed; server preparation 50.17s. Web typecheck, news/routes, Vite and prerender passed; Vite phase 4.76s, total setup timing not separately captured. Existing chunk-size advisory only. |
| Process recovery | All 18 absent-table scoped scenarios passed, including every before/after-commit cut point, independent replicas and stream replay; 86.69s total. Each scenario reports setup/execution/cleanup separately in the raw log. |
| F02 progression | Passed, including three retained browser cases and exact manufacturing crash/restart/payment/output checks; 24.01s total, browser 15.1s. |
| F01 missions | Passed, including the retained paginated-inbox case, admission/dispatch/combat/debris/harvest/privacy/concurrency and crash recovery; 35.15s total, browser 3.1s. |
| F03 raiding | Passed, including retained zero-debris browser case, exact score/world_evidence and both commit cut points; 23.70s total, browser 3.1s. |
| F05 speed | Passed 5×→3× cutover, exact old-rate settlement, unchanged paid work, new quotes/terms, bound settings, recall, restart, signup and audit; 23.44s total. |
| F04 rolling rules | Passed two compatible bridge builds, serial→scoped handover, killed activation with durable boundary, old commitments, active arrival rules, isolated second universe, new content, browser refresh/dispatch and restart; 20.72s. |
| T11 / S08 additive migration | Passed fresh/repeat/hostname startup, invalid-input no-mutation, explicit bootstrap, overlapping servers, concurrent migrations, killed migrator, exact command/event outcomes and older compatible restart; 47.92s. Final destructive migration remains a separate stage. |
| B01–B03 workload v2 smoke | Six actors × 64 live lots, 100 retained completed command/event pairs, 60.354s measured workload plus 2.046s fixture preparation (66.71s including build/cleanup). Six upgrades and six paired presence commands, zero rejected actions, 71 read iterations. Live relations 442,368 bytes; completed relations 360,448; recent payload 56,282; backlog payload 54,902. Synthetic loopback OAuth refresh fixture: not real provider or production capacity qualification. |

The first pushed revision passed all required native, three PostgreSQL groups,
journeys, components, six feature groups, aggregate gate and Cursor Bugbot, with
no review findings. Final revision status is recorded on PR #451 and in the
private handoff; earlier green checks are not substituted for a changed head.
Local runner allocation wait was not separately measured. No execution deadlines
were raised, no retries were added, and no production/container deployment ran.

Other failed development attempts are retained in the private logs:

- Docker automatic subnet pool exhausted; used a task-owned explicit subnet,
  without removing any unrelated resources.
- Duplicate migration 0048 rejected the integrated bundle before gameplay;
  renumbered only the unapplied activity migration. Its SHA-256 remains
  `4797f7f703b9135665fc77c071a455ae44153c655949d6331cfcfb9d3ca2c317`.
- New test initially tried serializing a non-Serialize CommitOutcome; changed to
  its existing equality contract. Its first level assertion expected 1 despite
  the foundation seed already starting at 1; corrected the single-upgrade result
  to 2. No product test was removed for exposing a defect.
- Capacity's independent retained bot fixture initially omitted its required
  positive allowance; supplied a fixture allowance and reran successfully.
- Legacy browser failures/interruptions and exact retirements are detailed above.
  Interrupted waits were task-owned processes, not passing tests. A preliminary
  missions attempt overlapped alternate-binary preparation and is not final
  evidence; the final normal-binary mission run occurred after preparation ended.
- Speed fixture repairs are recorded above. Removing its failed browser fragment
  initially left a browser.close call; corrected that ReferenceError before the
  successful complete run.
- Rules setup's old literal policy omitted the current disabled-bot defaults;
  retained full equality with those explicit defaults. Its setup was also audited
  for canonical routes, new instance ports and current dispatch controls before
  the successful run. No gameplay assertion was relaxed.
- Migration rolling setup invoked retired dev-seed; replaced that single setup
  call with test-foundation-create, retaining the separate alias-refusal checks.

Final source scan also checked current infra, bots and analytics repositories.
Only infra's dated November 7 storage incident mentions the retired relation;
that historical evidence is preserved. Active CMO command-history reports are
unchanged. Published migration SQL, frozen unmanaged schemas and historical
engine artifacts remain byte-for-byte intact.

The private CMO source scan found two additional documentation references.
`sources.md` explicitly labels its journal reconciliation as October 21 historical
inventory (preserved under H08). The current-looking code paragraph in private
`analytics-requirements.md` received a narrow H06 note marking it historical and
pointing to this proposed bridge. Its original bytes are backed up in the private
handoff. No collection script/SQL referenced the table, and no report definition,
active source, cutover setting, or shared Page register was changed.

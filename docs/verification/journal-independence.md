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
`22b3a926c0d9035ab6b948cb2d42e2a4149dbb57`. The Makefile conflict retained both
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

No product UI was changed to satisfy these tests. Original failure logs and
screenshots, and the second-attempt failures, are retained in the private handoff.

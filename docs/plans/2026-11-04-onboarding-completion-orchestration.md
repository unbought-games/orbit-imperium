# Onboarding completion orchestration

**Final status: complete.** Chats 4–6 implemented and validated the remaining scope;
root verified the final 141-file source fingerprint and all 58 canonical images.
The supplemental early-storage experiment passed at both speeds. All ownership
and task services are released/cleaned. See [final delivery](2026-11-04-onboarding-delivery.md).
The instructions and status transitions below are the orchestration history.

The owner explicitly requested orchestration of all remaining chats through
completion: spawn them, check them, guide integration, and do not stop early.
This supersedes prior stopping points after Chats 1–2 and Chat 3. The deliverable
is the complete specified onboarding feature, tested and visually reviewed in the
existing checkout. No production deployment, push, PR or merge was requested.

## Current authority and workspace

Root remains active until Chats 4–6 and any necessary fixes are complete. All work
uses `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium`, detached HEAD
`a4b2dcab0847182244c0afae1f5783c6a9a27b33` plus the integrated uncommitted work.
Preserve the 3x default and Chats 1–3. Do not reset, stash, clean, switch branches,
commit or push. No additional chats/subagents unless root delegates them.

Chat 4 initially owns all shared code, migrations (0038 onward after inspection),
contracts and build/test execution. Chat 6 begins with a read-only foundation audit
and may write only its own report until root transfers implementation ownership.
Chat 5 starts implementation after Chat 4 provides stable APIs and measured content.
No concurrent edits to shared files or independent Cargo/npm/build/test jobs.
Each chat owns its report; root owns main spec/handoff/orchestration status.

## Completion requirements

1. Chat 4 implements three economy-first chapters, exact staged rewards, safe two-site
   content, generic accomplishments, presentation preference, lazy human beginner
   issuance/retirement, usable guidance projections, and 2x/3x engine-backed journeys.
   New humans in enabled worlds can begin guided; existing empires and bots remain
   full-interface. All can earn from new qualifying activity without history scans.
2. Provide a supported, tested operator activation path and automatic enrollment for
   eligible empires in enabled worlds. No raw-SQL-only or test-only integration left
   for production. Respect the all-binaries-ready barrier, pending input scope
   coverage and once-only identity; keep existing worlds disabled until explicit
   operator activation. Validate activation locally, not on a live server.
3. Chat 5 implements the whole player experience: chapters, next actions, safe
   progressive disclosure with escape, site briefing/dispatch, reports/returns,
   automatic reward receipts/history and transition to full UI. Preserve essential
   threat/fleet/accessibility navigation. Finish previously deferred Site destination
   rendering and fix the mobile HUD obstruction recorded by Chat 3.
4. Chat 6 verifies complete guided and independent paths, bot/existing-player policy,
   2x/3x pacing and resource sufficiency, race/idempotency/compatibility, activation
   and final desktop/mobile behavior. Review concrete defects, route them to the
   current code owner, and retest relevant changes. No speculative framework churn.
5. Root inspects final running screenshots and validation evidence, confirms no
   required feature is a stub, updates durable handoff and cleans task resources.
   Final response displays current screenshots inline and names limitations honestly.

Keep the scope to the three initial chapters. No later defense/espionage/colonization
content, full Orion implementation, unrelated economic rebalancing, paid content,
fake wins, recovery grants, skip payout, manual claim bank or tutorial-name branches
through generic mechanics. Presentation changes have no economic/flight effect.

## Coordination and validation

Use the existing tools and repository Make/npm runners. Keep heavy game logic out
of React/API handlers, all derived values derived, authoritative client game state
in Zustand. Apply the repository UI skill/guide for any UI work; canonical resource
symbols/colors and complete accessible names are mandatory.

Every UI screen/state changed needs inspected desktop/mobile running screenshots.
Use response-aware fixture helpers for focused browser tests. Tests do not replace
pixel inspection. Preserve essential behavior tests when screenshot capture is off.
Provide root exact absolute screenshot paths, dimensions/states and any caveats.

Follow AGENTS test repair rules, record failures and retained/replaced coverage.
Each expensive test needs a concrete regression purpose. Routine backend, relevant
database and fixture-browser checks are in scope. Full-system/container/recovery/
rolling-deployment suites remain explicit-only; do not introduce recurring jobs.

Each active implementation owner manages a uniquely named disposable Compose project,
checks network availability, discovers the current mapped port, and cleans only its
own services/volumes. Old task services are removed; old ports are not reusable
assumptions. Existing development containers must remain untouched. Report exact
source fingerprints, setup/build/execution/wait timings, failures and cleanup.

## Status and chat links

Chat 4: [Chapters, guidance and balance](codex://threads/01a1a8a9-8618-70d2-84e3-c6a9fd53f3c2), complete and idle; shared ownership released after focused validation and cleanup.
Chat 5: [Guided player experience](codex://threads/01a1a8aa-c28c-7c00-8b07-088d9ff8c6d5), complete and idle; 224 focused units, 11 retained browser tests, build/static checks and inspected canonical captures passed; services cleaned.
Chat 6: [Integration review and validation](codex://threads/01a1a8a9-cee0-7ef0-b0ba-ea18c159e2b8), complete and idle after final acceptance and supplemental choice experiment; ownership released.
Root must not end the task after creating chats or reporting that they are running.

Read-only preparations completed: Chat 5's report lists concrete UI/API needs and
Chat 6's report contains its acceptance matrix. Both chats are idle awaiting root's
next assignment. Chat 4 retains shared implementation ownership.

Open audit findings assigned to Chat 4: F1 dynamic attack-group/holding/lifecycle
scope expansion must include enrolled homeworlds (and the tutorial scopes introduced
by this phase); F2 empire removal must hold Site cancellation scopes and settle
destroyed fleets' accepted site references. Both need deterministic regression proof
and subsequent Chat 6 review. These block final completion until resolved.

Subsequent review: F1/F2 and the additional F3 idle-signup cleanup ordering gap
are closed in source with passing focused logs independently checked by Chat 6.
Its report retains three small final acceptance assertions (pre-join invitation
declarations, activation rollback, presentation-only economic invariance); Chat 6
will add/verify those during final validation. Do not resurrect deleted broad tests.

Chat 4's real-signup measured content now completes guided reinvestment at about
86.9 minutes at 2x and 58.9 minutes at 3x, using early Robotics2 and Shipyard2 and
normal overlapping queues. Initial resources are 1000 metal/1000 crystal/0 deuterium;
no ships or levels are granted. Guided loot totals 2385 metal, 1520 crystal and 510
deuterium across the two actual returns. Independent normal-target journeys earn
the same milestone grants and issue no sites. Final response-contract corrections
cover fighter recommendations, decimal receipt ordinals and SiteEncounter previews.
These are handoff facts, not a claim that the UI/final integration is complete.

While Chat 5 implements frontend, Chat 6 may prepare the three bounded remaining
backend assertions in **only** `crates/storage-postgres/tests/tutorial.rs` and
`crates/storage-postgres/tests/attack_groups.rs`, plus its report. It may format
those exact files but run no Cargo/npm/build/test jobs and edit no shared production
code/contracts. Chat 5 owns frontend files and runtime jobs and must not run broad
Rust formatting over Chat 6's work. This narrow file ownership is the only parallel
code-edit exception; full integrated validation remains after Chat 5 completion.

Final acceptance checkpoint: `make check` and affected reruns, 66 PostgreSQL tests
and 24 retained browser tests passed. F4 keyboard escape visibility was fixed and
both keyboard/pointer interactions verified; canonical inventory is now Chat 6's
29-state/58-image manifest. All services were cleaned. Root requested one bounded
supplemental nonoptimal-spend experiment at 2x/3x to close that explicit matrix item;
Chat 6 resumed solely for the test/Make/report work and its isolated DB cleanup.
No production/UI changes or broad reruns are requested for that supplement unless
it exposes a real defect. Root must finish final documentation and verify hashes
before delivering completion.

# Chat 3: fleet and NPC execution

Completed chat: [Onboarding 3: Real fleets and NPC encounters](codex://threads/01a1a887-0679-7001-9072-f8bc85663a87), host `local`.

Root status verification: completed/idle, final backend/database/client logs passed,
current source fingerprint matches `83bf9194a96b8b930211a217bdf87ec7b9fbfb27d93120e6d6159da27a0152ba`,
and the task database service/volume were removed. See the [completion report](2026-11-04-chat-3-fleet-report.md).
Production readiness is default-off. Chat 4 has not been started. This status check
verified delivery evidence; it is not a claim of a separate exhaustive code review.

The owner explicitly requested “Start chat 3” after the completed Chats 1–2
checkpoint. Chat 3 alone is now authorized. Chats 4–6, production tutorial
activation, commits/pushes/PRs and deployment are not part of this dispatch.

Read the operations spec, implementation handoff, foundation checkpoint and both
foundation reports. The foundation orchestration document is a historical record;
its restriction against starting Chat 3 is superseded by this owner request.

## Workspace and ownership

Use `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium`, regardless of the launching
project directory. HEAD is `a4b2dcab0847182244c0afae1f5783c6a9a27b33` with integrated
uncommitted foundations and the earlier 3x default change. Preserve everything.
Chats 1 and 2 are idle. Chat 3 owns shared implementation files for this phase;
no simultaneous shared-file edits or Cargo jobs are authorized in those chats.
Do not switch branches, reset, stash, clean, or commit the existing work.

Use migration 0037 if needed after checking current numbering. Do not rewrite
existing migrations or historical persisted wire/hash fixtures. Root owns the main
spec/handoff status; Chat 3 maintains `2026-11-04-chat-3-fleet-report.md` in this
directory, including concrete design decisions, progress, failures, validation,
cleanup and final entry points for Chat 4.

## Required result

Implement the full backend round trip using existing real fleet authority:
private site selection/quotation, accepted launch, arrival, explicit NPC combat
participants, ordinary plunder, real cargo, recall and return. Keep current player
battles deterministic and historical accepted terms unchanged. Persist force losses
and actual site-local debris/report evidence; never recreate destroyed forces or
credit debris as cargo. No public debris harvesting or moon creation for these sites.

Declare site/beneficiary/homeworld and other required scopes during atomic admission
and successor scheduling. The test-only scope declaration helper is not runtime
admission. Debit site stock and credit surviving real fleet cargo in one commit.
Retirement rejects new launches while preserving accepted operations and their
normal resolution/return. Enforce configured one-active-operation admission and
preserve retries without resetting stock or forces.

Emit generic objective evidence for eligible real attacks and positive attributable
raid-loot returns, including normal player targets. Do not require tutorial target
IDs, credit recalled dispatches, or treat ordinary transport as raid proceeds.
Milestone grants remain separate automatic homeworld issuance via Chat 1's API.

Keep production program enrollment, automatic site issuance, beginner presentation,
chapter content and economic tuning in Chat 4. Use independent authored test fixtures
now. Test the proposed one-fighter/satellite and fighter-plus-cargo safe encounters
under supported parameters; favorable sampled rolls alone do not establish safety.
Normal failures remain real, with no tutorial insurance or hidden movement boosts.
3x and 2x use ordinary distance/speed, including near-orbital targets.

Add backend transport contracts/projections needed for this complete flow and keep
generated types coherent, but do not start the player-facing tutorial UI. Unsupported
site missions must fail closed through all alternate routes. Document the explicit
activation/readiness boundary so old workers never receive unsupported site orders.

## Validation and handoff

Follow AGENTS.md; use meaningful deterministic engine/HTTP/PostgreSQL tests for
authorization, conservation, historical replay, immutable terms, stale revisions,
recall/arrival/retirement, deletion/vacation, retries and unknown commits. Verify
both supported serial and scoped persistence paths. Run focused Make targets,
appropriate backend regressions, formatting, Clippy and contracts. No unsolicited
full-system/rolling-deployment/container acceptance or browser suites.

Chat 3 owns its disposable PostgreSQL setup and cleanup. Previous task containers
were removed. Docker default pools were exhausted in the prior phase; inspect current
networks before using a task-only Compose subnet override. Use a unique Compose
project and dynamically discover its mapped database port. Never reuse stale port
55034 or remove existing development containers/networks. The standard test runner
creates/removes a database per binary. Record source fingerprint, setup/build/test
timings separately, failed attempts and cleanup.

Completion requires a tested real backend round trip, not only destination structs
or mock outcomes. Report concrete remaining limitations and the Chat 4 consumer
contracts. Do not create Chat 4 or additional chats/subagents.

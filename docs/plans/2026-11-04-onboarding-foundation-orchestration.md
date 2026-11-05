# Onboarding foundations: active orchestration

The owner explicitly authorized implementation of Chats 1 and 2 on 2026-11-04,
then a checkpoint before any remaining chats. The originating chat owns integration.
This supplements the specification and handoff; it is not authorization to activate
the tutorial, start Chat 3, push, open a PR, or deploy.

**Final status:** both chats completed and released ownership to root. Integrated
review and focused/existing regression checks passed. Task-only PostgreSQL
container/network/volume were removed. See the [final checkpoint](2026-11-04-onboarding-foundation-checkpoint.md)
for APIs, source fingerprint, validation, cleanup and exact continuation boundary.
The ownership/setup instructions below are the execution record, not active locks.

## Working defaults and scope

Proceed with the specification's proposed per-empire reward identity. One-lesson
retirement and temporary site-local debris remain configurable policies for the
later tutorial consumer, not universal site behavior. No account-wide reset
prevention, NPC combat execution, tutorial content, UI, or campaign integration now.

Both foundations must be real integrated and tested persistence/engine seams,
not standalone utilities with no authority boundary. No production enrollment,
site issuance, or milestone payment is enabled by this phase. Activation is explicit
and absent by default; old stored JSON and accepted fleet terms remain unchanged.

## Shared contracts

- Use existing UniverseId, Epoch, PlayerId, InputId, OperationId, FleetId, BodyId,
  Coordinates, Resources and engine ordering conventions. Resource amounts use
  the existing fixed-point units. Avoid introducing a second currency representation.
- Chat 1 owns versioned program definitions, run bindings, typed gameplay evidence,
  objective completion records, homeworld grants and authorized receipt projections.
  Stable objective IDs are namespaced by program identity, independent of version.
  Once-only identity includes universe, epoch and empire, not active body or UI mode.
- Evidence carries causal input/order, actor and beneficiary separately. Building,
  research and manufacture completion can be wired now; resolved attack/attributable
  raid return have typed contracts for Chat 3. Never treat arbitrary cargo as raid loot.
  A reinvestment prerequisite compares causal ordering with the qualifying return.
- Chat 2 owns SiteId, versioned site definitions/instances, issuance key, persisted
  placement, access/disclosure, source stock, extraction facts and retirement facts.
  A selected destination is SiteId plus expected revision; an anchor is not identity.
  Domain selection may exist now while actual fleet launch remains explicitly unsupported
  until Chat 3. Do not create partially functioning player-facing launch routes.
- Site issuance is idempotent by universe/epoch/beneficiary/authored issuance key.
  Keep NPC encounter identity distinct from PlayerId. Retain definition version and
  chosen placement. Typed orbital and bounded candidate placement suffice now.
- Milestone issuance and conserved stock transfer are different effects. Chat 1 alone
  mints milestone resources. Chat 2 extraction produces a bounded transfer tied to a
  causal input and operation/fleet reference; applying cargo and stock must be atomic
  at the eventual encounter boundary. No public extract/award endpoint.
- Initial stock minus extraction facts is remaining stock; do not persist a second
  mutable balance. Disclosure and retirement are explicit source events. Views,
  eligibility, totals and effective visibility are derived.
- Scope coverage must include the authoritative homeworld for cross-body grants,
  and a distinct site conflict scope for site mutations. Do not weaken fences or
  bypass the serial/scoped atomic commit paths with an independent worker/transaction.
- Empty optional records use backward-compatible serde defaults/omission. Additive
  tables stay unused until explicit activation with all workers capable. Document
  the readiness boundary; do not expose new variants to old workers accidentally.

Names may adapt to existing code conventions. Record concrete API names in each
chat's completion report. Changes to these semantics require integration review.

## Ownership and execution

Active implementation chats:

- [Chat 1: Objectives and milestone rewards](codex://threads/01a1a867-27ec-7bb1-ad60-11071560f376)
- [Chat 2: Mission sites and finite stock](codex://threads/01a1a867-554e-7682-9bd1-218f321036c4)

Both run on host `local`. These are user-owned implementation chats created on the
owner's explicit orchestration request. Root monitors them through desktop thread
tools and their durable report files.

Checkout: `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium`.
Base: `a4b2dcab0847182244c0afae1f5783c6a9a27b33` (detached HEAD).
Existing uncommitted 3x default and design documents must be preserved.
Both chats work in this checkout, regardless of their project's launch directory.
Do not switch branches, reset, clean, stash, commit, push, or format another chat's
in-progress files. Originating chat will own final Git packaging if requested.

Chat 1 owns `objectives`/`programs`/`milestone_rewards` modules and focused tests,
and migration **0035_onboarding_objectives.sql** if needed.
Chat 2 owns `mission_sites` modules and focused tests,
and migration **0036_mission_sites.sql** if needed.
Do not modify existing published migrations.

Shared-file edit token initially belongs to **Chat 1**. It can edit shared engine,
application, storage, scope, commit, module-export and Makefile integration files.
Chat 2 may create its own modules/tests/migration in parallel, and must write its
integration plan/status to `docs/plans/2026-11-04-chat-2-sites-report.md`. It must
not edit existing shared files until the originating chat explicitly transfers the
token. Chat 1 records status in `docs/plans/2026-11-04-chat-1-objectives-report.md`.
Neither chat edits the main specification/handoff/orchestration document.

Only the token owner runs workspace-mutating formatting and integration builds.
No overlapping Cargo validation jobs; communicate pending commands through reports.
Before releasing the token, record shared files changed, API seam, tests, remaining
risks and whether further edits are expected. Any later shared fix is serialized.

Run focused deterministic tests and relevant PostgreSQL tests via Make/npm targets.
The originating chat coordinates disposable Compose setup and cleanup. Existing
AGENTS test repair/history rules apply. Record exact commands, timing, failures,
repairs and cleanup. No full-system/container acceptance or UI suites for this phase.

## Completion gate

Validation environment prepared by root: Compose project `orbit-onboarding-d2d8`,
`COMPOSE_FILE=compose.yaml:/tmp/orbit-onboarding-d2d8/compose-network.yaml`,
`ORBIT_DB_PUBLISHED_PORT=0`, `ORBIT_TEST_DB_PORT=55034`. Database became healthy.
Initial `make db-up` failed because Docker's default address pools were exhausted;
the temporary override assigns unused subnet `10.247.83.0/24`. No existing network
or container was removed. Root must remove this task's container/network/volume
at completion. Individual `scripts/test-db.sh` runs clean their own databases.

Chat 1 completed its implementation and released the shared token. Root transferred
it to **Chat 2** for site integration. Chat 1 report records 8 engine/compatibility
tests, 2 PostgreSQL tests, focused clippy and formatting passing. Broad all-target
clippy awaits Chat 2's integration because its standalone test files are already in
the checkout. Do not resume Chat 1 shared edits concurrently with Chat 2.

Both chat reports must demonstrate their handoff's acceptance cases, including
atomic/idempotent grants, covered homeworld delivery, finite stock conservation,
authorization, restart/rollback and stale revision behavior. Root reviews the
combined diff, resolves concrete defects and verifies focused integration checks.
Then update the main handoff with API names, limitations and exact Chat 3 entry
points. Stop before creating or implementing Chat 3.

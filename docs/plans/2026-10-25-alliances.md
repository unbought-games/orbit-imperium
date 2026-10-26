# Alliances Implementation Plan

**Goal:** Build complete alliance membership, delegated custom roles, public recruitment pages, a private noticeboard and roster, rankings, and alliance identity throughout the game.

**Architecture:** Pure policy functions own permissions and mutations, application services own authorization and DTO projections, and PostgreSQL commits social state plus retry receipts atomically. The existing query/identity/ranking pipelines consume authoritative membership facts; historical reports and daily observations capture source affiliations. The browser uses generated OpenAPI DTOs, adapters and screen-scoped Zustand controllers.

**Tech Stack:** Rust, PostgreSQL/sqlx, Axum, React, Zustand, TanStack Router, TypeScript, Vitest, Playwright.

## Global Constraints

- Never store derived state.
- React components should be light-weight with no heavy inline logic.
- Use Zustand for shared game state.
- Keep local interaction state local. Store selection IDs and user edits, not copies of objects or values available from the game store.
- Add meaningful coverage for changed behavior at the cheapest useful layer.
- Free creation/joining; one alliance per player per universe; at most five pending applications. Joining or creating withdraws all pending applications.
- Recruitment modes: Open (instant join), Application (apply for approval), Closed (no new joins/applications). Existing applications may still be processed.
- Public shareable page without authentication; only existing authenticated universe members can join/apply. Public content includes name/tag, Markdown recruitment text, recruitment mode, member count and ranking. No roster, leader identity, private roles or activity in public page payloads.
- Member-only roster requires ViewMembers. Coarse activity requires ViewActivity, granted only to leader by default: Recent <15 minutes, Away <7 days, Inactive otherwise. Never expose exact presence times.
- Custom roles are named sets of permissions and grantable permissions. Multiple role assignments combine. Leader owns all present capabilities and exclusive transfer/disband authority. Explicit delegation cannot exceed the actor's grantable authority, including role edits, assignments, deletions, and attempts to change one's own authority.
- Default Member grants ViewMembers and PublishPosts. Recruiter adds ViewApplications and ProcessApplications. Officer has ordinary administration but no ViewActivity, ManageRoles, AssignRoles, or grantable rights by default. All roles except the implicit leader are customizable; an undeletable default Member role supplies baseline membership permissions.
- Leadership transfer is immediate to an existing member; old leader becomes Member. Leader must transfer or disband to leave. No acceptance, costs, minimum scores or switching cooldown.
- Markdown only with safe links; no raw HTML, images, embeds, uploads, comments, chat, or custom styling. Name 3–48 characters, tag 3–8 ASCII alphanumeric, case-insensitive uniqueness within universe; public text/post body max 8000 characters, post title max 120, application max 4000.
- Noticeboard holds 100 posts including at most five pinned posts. Oldest unpinned post rolls off on insert. Newest-first pages of 20, pinned first on initial page; stable cursor prevents duplicates. Authors edit/delete their own posts while members; other management and pinning require explicit permissions.
- Rankings derive totals and average from exact member asset values at the same observation, sum before floor. Daily comparison matches yesterday's first UTC observation, with New/unavailable/unchanged distinctions. No historical roster is public.
- Alliance tags appear wherever players are identified. Current screens use current affiliation; historical reports capture event-time affiliation. Missing legacy history remains unknown, never backfilled using current membership.
- Defer richer customization, onboarding invitation flow, messaging/buddies, wars/treaties, divisions, gameplay bonuses and gameplay relationship effects.
- No deployment, push, PR or merge requested. Keep all development in this shared worktree; no branch switching by workers.

---

## Shared ownership and interfaces

Canonical wire shapes are already defined in `contracts/openapi.json` under `Alliance*` and `PublicAlliance`, and generated in `apps/web/src/contracts.ts`. Every field, discriminant, optional omission and enum in that schema is the interface contract. Coordinator owns modifications to OpenAPI and regeneration; workers request contract changes rather than editing it independently.

API endpoints:
- POST `/api/v4/universes/{universe}/alliances/query`: `AllianceQueryRequest -> AllianceView` (Directory, Mine, Detail).
- POST `/api/v4/universes/{universe}/alliances/commands`: `AllianceCommandRequest -> AllianceCommandResult`.
- GET `/api/v4/universes/{universe}/alliances/{alliance}`: `PublicAlliance` with no session requirement.
- Public browser URL `/alliances/{universe}/{alliance}`. In-game route `/u/$universe/alliance`, optional `alliance` search parameter selects detail; no parameter means own alliance/directory.

The complete action union is Create, Join, Apply, Withdraw, Accept, Reject, Leave, Kick, Update, SaveRole, DeleteRole, AssignRoles, Transfer, Disband, CreatePost, EditPost, DeletePost, PinPost. Commands carry stable command_id and expected_revision (nullable for create/join/apply/withdraw). A mismatched reused ID is conflict; an identical retry returns its original result, including after leave/disband. Authorized state changes return synchronously after durable commit. Revision conflicts have no partial effects.

Backend worker owns engine/application alliance modules, PostgreSQL alliance modules/migration 0019, new HTTP alliance handlers, focused database tests, and minimal module/port/router registration edits. Frontend worker owns alliance adapters/controller/screens/routes/navigation/public bootstrap and tests. A third ranking thread owns ranking files and High Scores UI. Coordinator owns contracts, identity/profile/report integration, migration 0020, and integrated validation. Shared lib/ports files are additive edits only, read before changing.

Required source table contract for integration:
```sql
-- Backend may add columns; these names/types/meanings are stable.
alliances(universe uuid, epoch uuid, id uuid PRIMARY KEY, name text, tag text,
          leader uuid, recruitment text, public_text text, revision bigint)
alliance_memberships(universe uuid, epoch uuid, player uuid, alliance uuid,
                     joined_at bigint)
-- Unique current membership by universe/epoch/player; alliance FK and same-scope checks.
```
Do not persist counts, scores, ranks, effective permissions or HTML. Retain source role assignments and Markdown. Backend publishes its implementation details in `docs/features/alliances.md`.

### Task 1: Membership and permission domain (backend thread)

**Files:**
- Create: `crates/engine/src/alliances.rs` (split focused submodules if useful)
- Modify: `crates/engine/src/lib.rs`
- Create: `crates/application/src/alliances.rs`
- Modify: `crates/application/src/lib.rs`, `crates/application/src/ports.rs`
- Test: engine alliance tests and application projection tests

**Signatures:**
Application exports Rust DTOs matching every Alliance schema exactly, including `AllianceAction`, `AllianceQueryRequest`, `AllianceCommandRequest`, `AllianceCommandResult`, `AllianceView`, `PublicAlliance`, `AllianceIdentity`, `AllianceScore`. Engine owns pure permission/state transition functions; application reexports shared pure enums when needed. Public service/port boundary:
```rust
// GameService<S>, with authenticated principal checks before store access:
async fn alliance_query(&self, p: Principal, q: AllianceQueryRequest) -> Result<AllianceView, ServiceError>;
async fn alliance_command(&self, p: Principal, q: AllianceCommandRequest) -> Result<AllianceCommandResult, ServiceError>;
async fn public_alliance(&self, universe: UniverseId, alliance: uuid::Uuid) -> Result<PublicAlliance, ServiceError>;
// GameStore has equivalent query/command methods without Principal,
// public_alliance takes universe and alliance; use default UnsupportedProtocol
// bodies for existing test stores, as existing additive ports do.
```

**Behavior:**
- Named commands enforce membership/recruitment, normalized identity uniqueness, delegation ceilings, founder invariants and board limits.
- Separate act permissions from grantable permissions; users cannot silently promote themselves or strip a superior's rights to kick them. Role labels/order never confer authority.
- Permission dependencies are enforced: ViewActivity requires ViewMembers; ProcessApplications requires ViewApplications. Implicit leader cannot be edited as a custom role.
- Read projection omits private fields entirely unless authorized; unallied Detail may expose public details but no leader/member/private fields (return alliance null and directory summary, or use public endpoint).

**Tests must prove:**
- All recruitment modes, application cap and atomic withdrawal, immediate transfer and founder leave guard.
- Combined roles, edits/removals, default fallback, delegated administration, self-escalation/superior-target denial, dependencies, immediate revocation.
- Roster/activity/application/audit privacy and bounded board rolloff with pins.

### Task 2: Durable backend and HTTP (backend thread)

**Files:**
- Create: `crates/storage-postgres/migrations/0019_alliances.sql`
- Create: `crates/storage-postgres/src/alliances.rs`, `crates/transport-http/src/alliances.rs`
- Modify: relevant module declarations/trait implementations in application/storage/transport
- Create: `crates/storage-postgres/tests/alliances.rs`, `docs/features/alliances.md`
- Modify: Makefile only to add focused native test target if needed

**Signatures:** Exact endpoints, DTOs and table columns from Shared ownership and interfaces. Backend handles private/public basic summaries; coordinator adds score enrichment after integration using authoritative tables.

**Behavior:**
- Serialize conflicting membership/application/role/post changes; commit state, bounded audit facts, and command receipt together. Idempotency is scoped to account/player/universe/epoch and immutable intent hash.
- Revalidate membership/epoch and permissions inside transaction. Never allow public endpoint to leak private JSON or trigger presence; bound public work and use existing HTTP throttling patterns.
- Historical names/tags in deleted alliances remain available in already captured reports. Disband deletes live membership and pending applications, not immutable old command receipts.
- Read-only queries do not update activity; stale role or membership access fails closed. Do not implement user deletion or a separate messaging retention system as a dependency.

**Tests must prove:**
- Real PostgreSQL concurrent accept/join/create uniqueness, pin limits and rolloff, name collision, exact retry after mutation, mismatched command intent, stale revisions and rollback.
- HTTP session/Origin/CSRF/scope validation and unauthenticated public page privacy.
- Leaving, kicking, demotion and disband immediately remove access on subsequent reads.

### Task 3: Alliance UI and public recruitment (frontend thread)

**Files:**
- Create: `apps/web/src/adapters/alliances.ts`, `apps/web/src/client-model/alliances.ts`, their test files
- Create: `apps/web/src/features/alliances/` focused screens/hooks/components/styles and tests
- Create: `apps/web/src/routes/u.$universe.alliance.tsx`
- Modify: `apps/web/src/main.tsx`, navigation/routes/game-shell registrations and generated route tree
- Create: `apps/web/tests/alliances.spec.ts`

**Signatures:**
```ts
// DTO aliases come exclusively from components['schemas'].
allianceQuery(binding: Binding, csrf: string, query: AllianceQuery): Promise<AllianceView>
allianceCommand(binding: Binding, csrf: string, request: Omit<AllianceCommandRequest, 'context'>): Promise<AllianceCommandResult>
readPublicAlliance(universe: string, alliance: string, signal: AbortSignal): Promise<PublicAlliance>
export function AllianceScreen(): React.ReactNode
export function PublicAlliancePage(props: { universe: string; alliance: string }): React.ReactNode
```
Controller accepts injected read/command ports; no fetch inside model/features. Use existing runtime/model binding/session handling. Backend command response only acknowledges commit; refresh authoritative view afterwards.

**Behavior:**
- Discovery/search, create/join/apply/withdraw, own-alliance board/roster/applications/role management/settings/leadership/audit all have complete usable flows driven by permissions.
- Role editor exposes permission and grantable checkboxes with plain labels; member role assignment supports multiple roles. No inactive placeholder actions.
- Preserve failed drafts within session, reuse command ID for uncertain retries, block accidental double submits, clear private data on access/session loss. Clear view before refresh after own membership/permission changes.
- Public page bypasses authentication bootstrap like shared reports. Existing players use a link to the in-game route for action; out-of-game onboarding is deferred with honest copy. Markdown preview/render disables HTML, images and dangerous URL protocols.
- Mobile/keyboard layouts and accessible controls, delete/disband/transfer target review, and board pagination. Ranking stats render when summary.ranking exists.

**Tests must prove:**
- Contract adapter validation, controller stale-request suppression and command identity retry, permission-derived controls and source-only state.
- Fixture browser flows for recruitment/application administration, custom delegated role editing, board pin/rolloff/page loading, leadership transfer, public privacy, and 390/768/1440 layouts with no overflow.

### Task 4: Alliance scores and daily movement (ranking thread)

**Files:**
- Modify: application/storage rankings modules and tests, contracts/openapi.json, generated contracts
- Modify: `apps/web/src/client-model/rankings.ts`, `apps/web/src/features/high-scores.tsx` and related tests/styles
- Modify: `crates/storage-postgres/src/alliances.rs` only score enrichment after worker completion

**Signatures:**
Extend `Rankings` with optional `alliances: Vec<RankingAlliance>` and `alliance_baseline_at: Option<i64>`. `RankingAlliance` contains `alliance: AllianceIdentity`, `member_count: u32`, `points: String`, `average_points: String`, `rank: u32`, `previous_rank: Option<u32>`. Historical `RankingObservation` adds optional `alliances: Vec<AllianceRankingObservation>` where each observation contains identity and member PlayerIds. Optional history distinguishes unavailable legacy alliance baseline from a genuinely new alliance.

**Behavior:**
- Read source memberships and asset lots in the same repeatable-read observation; persist only historical source affiliation/membership facts, never computed scores.
- Shared rank rules and yesterday-baseline behavior; deleted alliances count in historic ranking but not live rows.
- High Scores switches between Players/Alliances, retaining search/pagination and supporting own-alliance navigation. Public summaries derive rank/points/average from authoritative ranking function.

**Tests must prove:**
- Sum-before-floor and exact large values, ties, membership switching, no invented baseline for legacy observations, new/disbanded alliances, public summary consistency.

### Task 5: Player and report alliance identity (coordinator)

**Files:**
- Modify: transport/application public player profile interfaces and storage lookup
- Modify: `apps/web/src/features/player-name.tsx`, adapters/profile DTOs and tests
- Modify: storage world report commit, application report/share projections and report UI contexts
- Create: `crates/storage-postgres/migrations/0020_report_alliances.sql` if report metadata needs a dedicated table

**Signatures:**
Optional `alliance: AllianceIdentity` on PlayerDisplay and RankingPlayer. Optional `player_alliances: Record<PlayerId, AllianceIdentity>` on report detail/shared report DTOs. Absence for old reports means unknown affiliation. Live name rendering uses profile alliance; report rendering explicitly overrides with the historical map and disables live alliance fallback.

**Behavior:**
- Public membership tags follow existing authorized identity lookup; no separate endpoint dumps private roster.
- Capture visible report actors' alliance identity at report commit and preserve it through rename, leave, switch and disband. Shared report redaction removes affiliation along with player identity.
- All live player labels use shared PlayerName rendering; report and shared report paths use observation-scoped identity. Alliance tags link to public page.

**Tests must prove:**
- Current tags appear in Galaxy/rankings/incoming fleets, report affiliation stays historical, legacy unknown never guesses, redacted shared reports expose no affiliation, no private roster or activity leaks.

### Task 6: Integrated verification (coordinator)

**Files:**
- Modify: `docs/features/alliances.md`, this plan's validation record, relevant existing navigation/contract fixtures

**Behavior:**
- Integrate all three workstreams; exercise complete client/server contracts and correct privacy/authorization gaps before completion.
- Run native routine client/server/static tooling checks and relevant isolated PostgreSQL and fixture browser suites; record exact source revision plus working-tree diff digest, failures, elapsed phases, and cleanup.
- Full-system acceptance, rolling deployments and production-container validation remain explicit-only. No deployment/push/PR/merge.

**Tests must prove:**
- The complete create → recruit → join → delegate → post → transfer/leave flow works with real service persistence and browser contract fixtures.
- Public share pages, rankings and player labels work without exposing the private roster or activity.

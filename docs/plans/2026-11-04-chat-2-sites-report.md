# Chat 2 mission sites — implementation report

Status: foundation complete and focused validation passed. Chat 2 releases the
shared-file edit token to root; no Cargo jobs or further edits pending. Earlier
checkpoints below are retained as implementation/validation history.
Base a4b2dcab0847182244c0afae1f5783c6a9a27b33 (detached), unchanged.

## Concrete integration request

Planned dedicated modules: `crates/engine/src/mission_sites.rs`, its tests,
`crates/storage-postgres/src/mission_sites.rs`, PostgreSQL tests, migration
`0036_mission_sites.sql`. All economic quantities use `Resources` micro-units.

On token transfer Chat 2 needs to edit these shared seams, preserving Chat 1:

- Engine exports; `WorldRecords.mission_sites` (empty omitted/defaulted),
  `WorldFacts.covered_sites` (covered absence), `ScopeKey::Site(SiteId)`.
- Scoped selection: preserve Site scopes in `Selection`, load explicit IDs and
  owned personal-site records, serial loading includes all records.
- `world::load_selected` / `world::save` and common `commit::persist_changes`:
  validate append-only site facts, causal input, revision, coverage and claimed
  Site scope before saving in the same fenced transaction as other world changes.
- A typed `SiteSelection { id, expected_revision }` resolves privately to
  `SiteDestination`; no executable `MissionDestination` wire variant yet. Actual
  fleet quotation/launch remains unsupported (Chat 3), avoiding accidental new
  destination variants reaching old workers or unsupported routes.
- Dedicated internal composition function attaches trusted site mutations to an
  existing ordered transition ChangeSet. No client-callable issuance/extraction
  command or independent worker/transaction. Chat 4 must explicitly invoke issuance.
- Make targets for focused engine and PostgreSQL suites; module registration.

Contracts being implemented: stable ID derived from universe/epoch/beneficiary/
issuance key; retained versioned definition; orbital or bounded sorted candidate
placement using versioned private deterministic choice; explicit disclosure and
retirement causal facts; immutable extraction facts tied to input+operation+fleet;
remaining stock derived from initial stock minus extraction facts. Retirement
retains references and history. Source transfer facts are separate from Chat 1's
milestone issuance. Final atomic cargo integration belongs to Chat 3.

No production activation, UI, fleet/combat execution, replenishment or fake players.

## Validation

Pending token. No Cargo or formatting jobs started. PostgreSQL setup/cleanup is
owned by originating chat; request connection/Make invocation details on transfer.

## Dedicated files now present (not compiled yet)

- Engine API: `SiteId`, `SiteEncounterId`, `SiteIssuanceKey::id`,
  `SiteDefinition::validate`, `create_mission_site`, `issue_mission_site`,
  `MissionSite::{append,view,resolve,remaining_stock,active_references,validate_history}`,
  `SiteSelection`, `SiteDestination`, `mission_site_scopes`,
  `validate_site_changes`, `attach_mission_sites`.
- Typed event source: disclosure, operation accepted/settled, finite raid extraction,
  retirement. Expected revision derives from event sequence. Persisted initial stock
  minus extraction facts is the only balance authority. No saved derived balance.
- Explicit `authorize_mission` rejects every mission until Chat 3. No new serialized
  fleet-destination variant, preserving legacy accepted terms and public routes.
- Storage module uses append-only history validation and exact prior-JSON CAS in the
  shared commit transaction. Required shared fields: `WorldRecords.mission_sites`,
  `WorldFacts.covered_sites`, `WorldFacts.covered_site_players`, `Selection.sites`.
  Covered owned-site collection proves issuance absence; Site scope + beneficiary
  Player scope are required for every scoped mutation.
- Migration 0036 retains records independent of player deletion (no player cascade).
- Seven deterministic engine tests authored, covering independent fixture definitions,
  once-only issuance, shared anchor, private access, stale selection, bounded placement,
  half-loot/capacity/retry/exhaustion, retirement with live references, fail-closed content.

PostgreSQL environment supplied by root: COMPOSE_PROJECT_NAME=orbit-onboarding-d2d8,
COMPOSE_FILE=compose.yaml:/tmp/orbit-onboarding-d2d8/compose-network.yaml,
ORBIT_DB_PUBLISHED_PORT=0, ORBIT_TEST_DB_PORT=55034. Root owns final cleanup.

## Ready for shared-token transfer

Dedicated files are authored; no builds or formatting run. PostgreSQL test binary
`crates/storage-postgres/tests/mission_sites.rs` now exercises ordinary admitted
presence transitions plus trusted site effects through `commit_claim` and
`commit_scoped`. A test-support-only helper declares Site scopes before any worker
claims; production admission must declare them atomically in Chat 3/4's consumer.
Tests cover rollback after writes, unknown commit result/retry, restart load,
retirement preserving references, missing-scope rejection and stale claim fencing.

Exact integration edits on transfer:
1. Engine `lib.rs`: export mission_sites; `world.rs`: add omitted/defaulted maps
   and coverage fields; constructors elsewhere need explicit default fields.
2. `scheduling.rs`: add Site scope variant (no serialized destination changes).
3. Storage `lib.rs`: register mission_sites; `scoped_facts.rs`: Selection.sites,
   preserve variant in scopes/from_scopes/load_execution, `world.rs`: load site
   records and covered_site_players/covered_sites. `commit.rs`: call dedicated
   mission_sites::save before world::save with claimed scopes and execution rules.
4. Makefile targets: `test-mission-sites` (engine unit filter) and
   `test-db-mission-sites` (`test-db DB_SUITES=mission_sites`).

Still NOT COMPLETE: integration and all validation pending shared token.

Token-wait checkpoint: dedicated files complete for initial integration. Root may
resume Chat 2 on transfer. No remaining independent work warrants touching shared
files or running Cargo while Chat 1 is active. No completed-validation claim is
made. No branch changes, commits, PRs, deployments, chats or subagents created.

## Integration progress after explicit token transfer

Shared token received from root; Chat 1 idle. Integrated engine/module/state/scope
fields, complete selected-owner/explicit-site storage loading, and site save in
`commit::persist_changes`' fenced transaction before world save. Added authenticated
`GameService::{mission_sites,resolve_mission_site}` with ResourceDto decimal stock
and decimal revision. Active list excludes undisclosed/retired sites; stable-ID
resolution checks binding, beneficiary and expected revision. No route added.

New issuance validator requires loaded player, authoritative homeworld, Active
policy and covered owner collection. Retained sites bypass new-issuance lifecycle
checks, preserving pending references after removal. Append documentation now
explicitly permits several distinct facts in one input while rejecting semantic
duplicates (e.g. duplicate operation extraction).

First engine compilation failed on two new-code type errors (i32 order phase versus
u8 and moving a hash through Persisted); corrected casts/clone. Build failure 6.02 s
wall, no test execution. `make test-mission-sites` then passed 7 tests: 6.56 s build,
0.606 s execution, 7.82 s wall. No runtime failures/repairs so far. All-target check
for application/storage currently running. Root requested integrated objective/site
atomic composition regression; adding it before DB run.

First PostgreSQL attempt: build 18.17 s, runner preparation 0.26 s; scoped test
passed (3.324 s), serial test failed (2.446 s) on its new privacy assertion expecting
Forbidden instead of the established principal helper's NotFound. Composition
case did not execute due fail-fast. Total wall 26.31 s; runner removed its DB.
Inspected test history (new file, no history), `binding::principal` and existing
objective privacy caller. No Test Czar ledger found in repository; owner ledger
not available. One repair changes that exact expected error to NotFound, retaining
the explicit deny assertion. Wrong epoch remains explicitly EpochChanged per
storage binding validator. No timeout/retry/assertion weakening.

Also addressed root's concrete row-integrity review: migration constraints bind
universe/epoch/beneficiary/issuance key to retained JSON, and loader compares SQL
id/beneficiary/key to derived source identity. Added one constraint plus one corrupt
physical-ID assertion in restart coverage; rollback restores test corruption.

Second PostgreSQL execution passed all 3 tests: build 3.41 s, runner preparation
0.16 s, execution 9.109 s (3.288 scoped / 3.284 serial / 2.537 composition), wall
14.11 s. No further failure/repair. This includes private application queries,
ResourceDto/revision wire strings, stale/wrong-epoch/outsider rejection, live-empire
issuance rejection, identity integrity, and root's requested shared-ChangeSet
objective grant plus disclosure rollback/retry with exact homeworld credit.

Final review added enabled-catalog validation for authored NPC forces (a combat
rule alone does not prove content is enabled), explicit queued retirement while
extraction holds the Site scope, and retained settlement validation after player
removal. Final engine/DB rerun is warranted for those changes. All-workspace,
all-target Clippy is currently running; no parallel Cargo jobs are active.

Final all-target Clippy first stopped on one `collapsible_if` warning in the new
placement validator (6.80 s wall); collapsed the conditional, then full
`cargo clippy --workspace --all-targets --features orbit-server/test-support -- -D warnings`
passed: 16.23 s compiler, 16.36 s wall. All-target application/storage check had
previously passed: 14.96 s compiler, 15.03 s wall.

Final `make test-mission-sites test-objectives`: 15 tests passed. Sites: 2.58 s
build / 0.624 s execution (7 tests). Objectives + historical persistence/replay:
10.25 s build / 0.156 s execution (8 tests). Combined wall 15.73 s. Full
`cargo fmt --all --check` and `git diff --check` passed (0.98 s combined).

Final combined DB command is now running serially with root's environment:
`make test-db DB_SUITES='mission_sites onboarding_objectives' DB_JOBS=1`.
Root explicitly retains broader backend regression target and DB world/ordering/
migrations suites; Chat 2 will not duplicate them.


## Final handoff — shared-file token released

Chat 2 foundation is integrated and complete for this phase. **Token released to
root; no Cargo jobs remain and no further edits are planned.** Root owns broader
backend regression / DB world, ordering and migrations validation, main handoff
updates, and final disposable Compose cleanup. No Chat 3 implementation started.

### Final validation

Final combined DB command: `make test-db DB_SUITES='mission_sites onboarding_objectives' DB_JOBS=1`
with the recorded isolated Compose environment. **5 passed**. Preparation build
7.87 s; per-binary runner preparation 0.27 / 0.16 s; site execution 9.260 s
(3.391 scoped / 3.323 serial / 2.546 combined atomic composition), objective
execution 8.216 s (2.737 scoped / 5.478 serial). End-to-end wall 28.68 s. Each test
binary's isolated database was dropped by the runner trap. No queue/merge delay:
no PR or merge exists. Root retains the Compose service and volume.

Final engine/compatibility result: 15 passed as recorded above. Full-workspace
all-target Clippy, workspace Rust formatting check and diff whitespace check all
passed. All attempted compilations/tests, the one runtime assertion repair, and
lint correction are recorded above. No tests were removed. No UI validation is
applicable; no browser/full-system/container acceptance was run.

Exact tested base: `a4b2dcab0847182244c0afae1f5783c6a9a27b33` plus the preserved
uncommitted source state. SHA-256 over sorted relative path + NUL + contents + NUL
for the union of `git diff --name-only` and `git ls-files --others --exclude-standard`,
filtered to Makefile and .rs/.sql/.toml files, is
`2c8ecf4f22f2eeb61919a557f5607df86b1af336fbc71c343a763cc79e7fe079`
(32 files, including Chat 1 and prior 3x-default work). No branch change, commit,
push, PR, deployment, new chat or subagent was created.

### Concrete API and ownership

- Engine `mission_sites.rs` and `mission_sites/tests.rs`: stable `SiteId`, distinct
  `SiteEncounterId`, `SiteIssuanceKey`, pinned `SiteDefinition`, typed placement,
  access/admission/debris policy, force catalog validation, retained creation and
  `SiteEvent` source history. `SiteSelection` uses ID and decimal-wire expected
  revision; `SiteDestination` is domain selection, not an executable fleet variant.
- `issue_mission_site` returns an existing issuance unchanged across retry, content
  version, origin and secret changes. `create_mission_site` deterministically picks
  an eligible bounded anchor or orbital origin and persists that choice. No valid
  candidate produces NoPlacement; no body occupancy is consumed. Different site
  IDs can share the same occupied planetary anchor.
- `MissionSite::{append,view,resolve,authorize_mission,remaining_stock,active_references,validate_history}`
  derives remaining stock/revision/visibility from immutable source facts. Ordinary
  `raid_loot` enforces whole-unit per-resource half stock and bounded free capacity.
  Extraction records bind causal input/order and operation/fleet/actor. Repeated
  same-fact retry is a no-op; a second extraction for the same operation/fleet is
  rejected. No replenishment/initial-stock mutation is permitted by commit validation.
- `mission_site_scopes(key)` returns beneficiary Player plus distinct Site scopes.
  `validate_site_changes` enforces covered absence/existing facts, immutable creation,
  append-only causally bound history and live-empire issuance. `attach_mission_sites`
  composes site effects into an existing ordinary ChangeSet and preserves objective
  maps/body changes. New issuance requires an Active loaded player and homeworld;
  existing source histories remain eligible for pending-reference settlement after
  player removal. Retirement rejects new admission while preserving accepted refs.
- Application `mission_sites.rs`: `MissionSiteView` uses ResourceDto strings.
  `GameService::{mission_sites,resolve_mission_site}` authenticate binding and return
  only authorized, disclosed active sites or an exact ID/revision selection. Retired
  sites disappear from active listings. No HTTP route or mutation endpoint is added.
- Storage `mission_sites.rs` and migration 0036: selected-owner/explicit-ID load,
  JSON/history/SQL identity consistency, append-only exact prior-JSON CAS. Records
  do not cascade on player removal; explicit universe teardown owns final retention.
  Save participates in ordinary `commit::persist_changes`, with required Site and
  beneficiary scopes plus existing journal, transaction and claim fences.
- Shared files changed by Chat 2: engine lib/world/scheduling, application lib,
  storage lib/world/scoped_facts/commit/Cargo manifest, Makefile. Added default
  coverage fields to constructors in engine missions/objectives tests, application
  bootstrap/projection tests. Chat 1 objective hooks, save, homeworld scopes and all
  pre-existing speed-default/design changes preserved.

### Chat 3/4 entry points and activation limits

There is deliberately no executable Site MissionDestination, quote, launch,
combat, public extract/award endpoint, production site definition or automatic
issuance. `authorize_mission` rejects every current mission explicitly. Existing
accepted fleet terms/wire variants remain unchanged; empty new record/coverage
fields have serde defaults/omission. All workers must understand records and Site
scopes before a consumer is activated; do not send these scopes to old workers.

Chat 3 must resolve SiteSelection under authenticated context, declare
`mission_site_scopes` during atomic admission, and bind actual accepted fleet work
to `OperationAccepted`. It must produce Extracted only from authoritative encounter
results and actual surviving free capacity, apply the returned transfer to real
cargo in the SAME ChangeSet/commit, settle refs on normal terminal work, and emit
objective encounter/return evidence through Chat 1. This phase tests trusted seam
composition; synthetic operation/fleet references in fixtures are not claims of
live NPC fleet/combat execution. No actual ship/cargo balance is changed here.

Chat 4 can call issuance/disclosure from a future explicitly activated ordered
consumer; new issuance must hold declared scopes and covered beneficiary facts.
The test-support-only `declare_site_scope_for_test` adds scope declarations at a
quiescent fixture point before claiming; it is not production admission and must
not be used as a future runtime model. No separate worker/transaction establishes
site truth. Definition migration, replenishment, collectible debris/combat
consequences and cleanup of historical sites are not implemented in this phase.

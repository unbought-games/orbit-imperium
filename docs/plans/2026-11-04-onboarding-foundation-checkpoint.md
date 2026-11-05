# Onboarding foundations checkpoint

Historical Chats 1–2 checkpoint. All six phases are now complete; see [final delivery](2026-11-04-onboarding-delivery.md)
for current acceptance, source identity and activation. The snapshot below is retained
as provenance, not an instruction to restart or wait for already completed work.

Status: **Chats 1 and 2 complete; ready for Chat 3 when requested.** Combined
review, focused checks and existing backend/database regressions passed. Chat 3
has not started. This is the owner's requested stopping point.

Subsequent continuation: the owner requested Chat 3. It is now [running](codex://threads/01a1a887-0679-7001-9072-f8bc85663a87)
under the [Chat 3 assignment](2026-11-04-onboarding-chat-3-orchestration.md).
The results below remain the completed foundation checkpoint, not Chat 3 results.

## Implementation and ownership

- [Chat 1 — objectives and milestone rewards](codex://threads/01a1a867-27ec-7bb1-ad60-11071560f376)
  completed its foundation; [implementation/validation report](2026-11-04-chat-1-objectives-report.md).
- [Chat 2 — mission sites and finite stock](codex://threads/01a1a867-554e-7682-9bd1-218f321036c4)
  integrated the site foundation; [implementation/validation report](2026-11-04-chat-2-sites-report.md).
- Both work in `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium`. Root owns the
  combined review and this checkpoint. No other implementation chats were created.

The initial 3x default changes remain in this checkout as a distinct logical change.
No production tutorial is active. No commit, push, PR or deployment was requested
or performed during foundation orchestration.

## Chat 3 entry points

### Objectives and rewards

`crates/engine/src/objectives.rs` supplies `ObjectiveProgram`, typed
`ObjectivePredicate`, `ObjectiveRun`, `ObjectiveEvidence` and `MilestoneReceipt`.
Building, research and manufacture completion are connected to the authoritative
transition. Other activity is not inferred from UI navigation or old inventory.

`apply_objective_evidence` composes grants into the same `ChangeSet`. Encounter
settlement must provide `AttackResolved` only after an eligible real outcome.
Return settlement must provide `RaidReturned` only after delivery of positive,
attributable raid loot, with surviving ship requirements as authored. Neither
dispatch/recall nor ordinary transport cargo is sufficient evidence. NPC target
identity is not mandatory for these generic predicates.

The evaluator grants to the authoritative homeworld, settles its production at
logical completion time and records a once-only receipt. `enroll_objective_program`
binds a program through an authorized ordered change. Program/objective identities
are stable across definition versions; the bound definition stays pinned.
`GameService::milestone_receipts` returns an authenticated projection with decimal
resource strings. No claim bank, reward endpoint or production enrollment exists.

### Sites and stock

`crates/engine/src/mission_sites.rs` supplies `SiteId`, `SiteEncounterId`,
`SiteIssuanceKey`, `SiteDefinition`, `MissionSite`, `SiteSelection` and
`SiteDestination`. An anchor is separate from identity and colony occupancy.
Orbital and bounded candidate placement use normal topology/distance. The selected
placement and definition are retained; duplicate issuance cannot reroll them.

`issue_mission_site`, `MissionSite::append`, `mission_site_scopes`,
`validate_site_changes` and `attach_mission_sites` provide trusted composition
seams. Disclosure, accepted/settled operation references, extraction and retirement
are source facts. Remaining stock and active references are derived. Extraction
uses ordinary half-plunder and free capacity; stock never replenishes on retry.

`GameService::{mission_sites,resolve_mission_site}` authenticates the caller and
projects decimal resource/revision values. Actionable lists exclude undisclosed
and retired sites. Selecting an ID/revision still does not create accepted fleet
terms. `authorize_mission` rejects missions until Chat 3 implements their handlers.

### Shared authority

Both maps live in `WorldRecords` and load/save through the existing world storage
and fenced serial/scoped commit transaction. Migrations 0035 and 0036 are additive.
Objective writes require the beneficiary and homeworld location scopes. Site writes
require the beneficiary and `ScopeKey::Site`, including absence coverage on issuance.
Retirement retains accepted references instead of deleting pending work.

Chat 3 must declare all required scopes before admission, resolve SiteId/revision
under authorization, extend the accepted destination schema compatibly, integrate
explicit NPC participants into existing combat, debit stock and credit real cargo
atomically, and emit objective facts at the correct encounter/return boundaries.
Do not copy fleet balances/timers into site records or invent a second movement
engine. Tests composing site and objective changes exercise transaction composition,
not a claim that live NPC combat already exists.

## Activation and remaining boundaries

- Definitions/runs and sites are dormant until an explicit consumer creates them.
  All serving/worker binaries must understand new records and scopes first.
- Enrolling existing empires must account for accepted work that predates homeworld
  scope expansion: drain it or implement an ordered barrier that safely updates its
  scopes. An arbitrary insert while old scoped work is pending is not a rollout plan.
- New-player initialization and existing-player/bot enrollment are Chat 4 work.
  Site scopes must be declared atomically by the future admission consumer; the
  current declaration helper is compiled only for tests.
- Existing runs do not silently adopt revised definitions. Adding objectives to an
  existing program needs an explicit version migration preserving IDs/receipts.
  The initial three chapters can be authored in one pinned definition; additional
  independently identified programs can use this engine. No migration of an already
  enrolled program's version is implemented in this phase.
- NPC combat, force depletion, real cargo/return linkage, actual site-local debris,
  retirement triggers, lazy beginner issuance, tutorial content/balance, browser UI
  and campaign integration remain later work. The foundation does not simulate them.
- Later milestone content, alliance/collective beneficiaries, account-wide reset
  prevention and public/cooperative site policies remain explicit extensions.

## Final validation

Chat-specific reports retain the exact focused commands, initial failures,
repairs/removals and final results. Combined final checks:

| Check | Result | Timing |
| --- | --- | --- |
| `make test-mission-sites test-objectives` | 15 engine/compatibility tests passed | See Chat 2 report for per-target setup/execution |
| `make test-db DB_SUITES='mission_sites onboarding_objectives' DB_JOBS=1` | 5 PostgreSQL tests passed, including combined site/reward atomicity | 7.87s build, 17.476s test execution, 28.68s wall |
| `make test-server` | 715 normal + 47 compatibility-server + 7 storage unit tests passed | 61.36s preparation builds; 30.694s test execution; 117.32s wall including runner/link/coordination overhead |
| `make test-db DB_SUITES='world ordering migrations' DB_JOBS=1` | 3 world + 2 ordering + 16 migration tests passed | 3.21s preparation build; 30.529s execution; 38.06s wall |
| Workspace all-target Clippy | Passed, warnings denied | Chat 2: 16.36s wall |
| Rust formatting and diff whitespace | Passed | Chat 2: 0.98s combined; root final whitespace rechecked |
| Contract/generated-type and architecture boundary scripts | Passed | Contract check initially could not load missing `ajv`; after dependency setup it passed |

Root's backend/database regression runs had no failures. Prior foundation fixture
failures, one-repair removals and replacement protection are documented in the
chat reports; those were not hidden by retries. No full-system, rolling-deployment,
production-container or browser/UI suite was run. No UI changed. No PR, merge or
queue delay exists.

Tested base is `a4b2dcab0847182244c0afae1f5783c6a9a27b33` plus the uncommitted source
in this checkout. Root's reproducible source fingerprint is
`7ff1ecf72f7f40ee74200f42a57b7adc6fad65c74cd0ebd7f51f765e3d4e7a94`:
SHA-256 of compact, key-sorted JSON mapping each changed/untracked non-`docs/`
file path to the SHA-256 of its bytes (34 source/config files). No code changed
after this fingerprint or the regression runs. The manifest and full root logs
are retained locally in `/tmp/orbit-onboarding-d2d8/`.

Dependency preparation: `npm ci --ignore-scripts` completed in 29.48s for the
contract checker, without lockfile changes. Normal local build caches and ignored
`node_modules` remain. The first Docker setup failed because default address pools
were exhausted; a task-only subnet override resolved it without touching existing
containers/networks. Every test runner removed its disposable database. Root then
ran scoped `make db-destroy` for Compose project `orbit-onboarding-d2d8`; its
container, network and volume were removed successfully. No test server remains.

# Chat 6 — foundation audit and integrated acceptance

**Final status: integrated acceptance complete; sole implementation/runtime
ownership released to root, 2026-11-04 (America/New_York).** All source findings
F1–F4 are resolved. Required checks and concrete follow-ups are handled; task
resources are cleaned. No commit, push, PR, merge, deployment, new chat or subagent
was created. The final acceptance/evidence section at the end supersedes earlier
in-progress statuses while preserving the complete failure/repair history.

## Authority and status

Read-only foundation audit complete, 2026-11-04 22:28 UTC; awaiting root's follow-up
and later explicit validation ownership. Working only in
`/Users/ethan/.codex/worktrees/d2d8/orbit-imperium`; detached base
`a4b2dcab0847182244c0afae1f5783c6a9a27b33` plus preserved uncommitted Chats 1–3
and 3x defaults. Chat 4 owns implementation and validation execution. This report
is Chat 6's only writable file. No Cargo/npm/build/test job has been run, and no
code, migration, shared contract, branch, commit or other chat has been changed.

Initial checkpoint at 22:25 UTC had no confirmed findings. Subsequent tracing of
dynamic scope extensions and empire removal found F1 and F2 below. Completed review
covers objective evaluator/storage fences, homeworld settlement and causal ordering,
site admission/contact/retirement/recall/return, NPC losses/stock/cargo, private query/
report/phalanx boundaries, ordinary and grouped attacks, and accepted terms/replay.
Chat 4 work in progress is excluded from defect conclusions. This is not final
feature acceptance; both findings require integration-owner fixes and execution.

## Findings

Latest review, 2026-11-04 23:00 UTC: **F1, F2 and F3 mechanisms are closed in
source, with focused passing execution logs inspected.** Chat 6 did not rerun
jobs. Final UI/integrated acceptance remains pending. Earlier descriptions below
are retained as defect/repair history, not open source findings. See the latest
checkpoint at the end for exact evidence and small remaining acceptance assertions.

### F1 — P1, confirmed by source: late participant scope extension omits enrolled homeworlds

`crates/storage-postgres/src/attack_groups.rs:90–108` extends already pending
inputs with invitees/member Player scopes and flight endpoints, but does not apply
`objectives::add_homeworld_scopes`. `crates/storage-postgres/src/holding.rs:78–86`
has the same defect for a newly launched holding visitor. Normal initial admission
and successor creation do apply that expansion through `scoped_facts::select:88`.

Reproduction sequence (scoped executor, enabled objectives): A creates a normal
player-target attack group; its arrival event is scheduled. A then invites enrolled
B, whose homeworld is distinct from the existing group's flight endpoints. The
invitation does not replace the arrival event. `attack_groups::save` adds Player B
to the existing event, but not B's homeworld Location. When the group event is
claimed, `scoped_ordering.rs:336–345` recomputes required scopes, including B's
homeworld, and returns `StoreError::CorruptData` because they are not a subset of
the declaration. No combat or objective settlement can occur. This does not require
B to join or receive a reward. The related Hold sequence is: an attack is already
scheduled against a host; enrolled B subsequently launches Hold from a colony to
that host. Its late participant extension adds B/origin but omits B/homeworld, so
the existing hostile encounter fails the same scope revalidation.

Minimal fix: expand homeworld scopes before registering each dynamic participant
dependency set, auditing other direct `admission::register` extension paths. Preserve
the existing ordering/fencing checks. Add focused deterministic PostgreSQL coverage
for invite-after-schedule and holding-visitor-after-schedule with distinct homes;
verify the pending event loads and resolves. No jobs run by Chat 6; runtime proof
is pending integration-owner validation.

#### Root-requested extension-call audit (follow-up)

The exhaustive `admission::register`/`INSERT INTO input_scopes` source search found
one additional affected family under F1, rather than a duplicate finding:

- `empire_deletion::refresh_checks` (`empire_deletion.rs:98–104`) directly registers
  `empire_deletion::scopes` without homeworld expansion. That scope builder covers
  the subject's owned bodies, but foreign held-fleet owners and alliance members
  are only Player dependencies (plus held flight endpoints). An enrolled foreign
  player's distinct homeworld is therefore missing. This path is called after
  gameplay changes and also by `alliances.rs:183–189`. Concrete additional sequence:
  A has an already scheduled cleanup event, creates/leads an alliance, then enrolled
  B joins. The social transaction extends A's existing cleanup/lifecycle inputs with
  Player B but not B's homeworld. Their next `load_scoped` recomputes B's homeworld
  and rejects the missing declaration. Likewise an enrolled visitor dispatched
  from a colony introduces the same missing foreign home into a host's pending
  lifecycle commands/checks. This happens before actual removal and is distinct
  from F2's Site cancellation fence.
- `empire_deletion::seed_check` (`empire_deletion.rs:166–168`) is initial registration
  rather than extension, but uses the same unexpanded builder. Fresh bootstrap with
  only the new player's own home does not trigger the foreign-home defect. Startup
  `ensure_empire_cleanup` can seed a missing check for a retained alliance leader or
  hosting empire, and then encounters it. Its preceding ordering stamp at
  `empire_deletion.rs:205–208` uses the same builder. Expanding dependencies inside
  that builder covers refresh, seed, and stamp consistently; include that family
  in F1's fix and a focused regression rather than fixing only two callers.

Remaining callers inspected: normal `ordering.rs` admission and `commit.rs`
successors use `scoped_facts::select`; paired `world.rs` presence already explicitly
expands homeworlds and gameplay uses the selector; `runtime_control.rs` preparation
also uses the selector. `mission_sites.rs` registration is a test-support-only
incremental Site declaration on an already admitted command, not a production
activation path. The new Chat 4 `tutorial.rs` activation registration uses the
selector in the currently written code, but its in-progress implementation is not
treated as final reviewed activation evidence. No other production direct writer
to `input_scopes` was found outside the shared registration helper.

Root acknowledged F1/F2 and forwarded them to Chat 4 before this follow-up audit;
Chat 6 remains read-only and has not applied or tested fixes.

### F2 — P1, confirmed by source: empire removal cannot cancel an active Site flight under scoped execution

`crates/storage-postgres/src/empire_deletion.rs:29–39` adds active fleet Player and
Location scopes but omits `ScopeKey::Site` for Site destinations. At removal,
`crates/engine/src/empire_deletion.rs:199–217` cancels each active fleet event and
destroys its ships/cargo. Cancellation is fenced by
`crates/storage-postgres/src/commit.rs:450–458`: the cancelled Site leg event has a
Site scope, which is absent from the removal claim, so commit fails with
`StoreError::CorruptData` and rolls back. Because removal is earlier than the fleet
event on their shared Player scope, the later return/contact cannot simply clear
the problem first.

Reproduction: request deletion, then shortly before its seven-day due time launch
an otherwise authorized Site attack whose contact or return lies after deletion.
`policy.rs:177–192` rejects DeletionDraining/Removed, but a pending deletion request
does not set either state and does not itself prohibit launch. At the deadline the
removal event hits the cancellation fence above. The same lifecycle route in serial
mode destroys the fleet without appending OperationSettled, leaving a dangling
active Site reference forever (`MissionSite::active_references` derives solely
from accepted/settled events). No reward is claimed to leak; this is an execution
stall and retained lifecycle inconsistency.

Minimal fix: include each affected Site identity in lifecycle scope calculation
and settle its accepted reference when destruction is caused by empire removal,
within the same transaction. Retain the site/history instead of erasing it. Add
focused removal tests with outbound and returning Site fleets and verify cancelled
events, zero active references, no payout, and successful scoped commit. Runtime
proof is pending integration-owner validation.

These findings were found in completed foundation paths, not Chat 4 work in
progress. Reported prior test passes are historical evidence, not a substitute for
these missing cross-boundary schedules or final integration tests.

## Other source conclusions

- The normal completion path composes objective evidence, stable receipt identity
  and homeworld resource credit into the same ChangeSet and storage transaction.
  The grant settles production first, adds over-cap resources normally, and uses
  the authoritative homeworld rather than client body selection. Evidence is later
  than enrollment and Reinvest requires an ordered building completion later than
  the qualifying RaidReturn. Manufacturing counts completed prefixes, not inventory.
  No UI-driven reward endpoint or manual claim bank was found.
- Attack proof is produced from newly recorded raid provenance at actual contact,
  including defeats. A returned-loot proof follows terminal delivery with positive
  attributed loot and surviving ships; recall before contact has no provenance.
  Player attacks and group attackers use the same producer. Old/disabled contacts
  have no invented raid provenance. `site_fleets_enabled` currently controls both
  Site admission and recording new ordinary attack provenance; Chat 4's activation
  path must enable the compatible whole feature, not merely enroll objective runs.
- Site authorization binds universe/epoch/beneficiary, disclosure, ID and revision.
  Only Attack is admitted. Creating an attack group from a Site flight is also
  explicitly rejected by the Body destination match in `attack_groups.rs:176`.
  Retirement closes admission without rerunning admission on an accepted flight.
  Ordinary recall and return settle the accepted reference. F2 identifies the
  missing non-combat destruction path.
- Contact uses normal combat with explicit NPC identity, derives NPC remaining
  forces from gross losses, retains only surviving cargo capacity, and transfers
  ordinary half-plunder from finite stock. Storage cross-checks the resulting fleet,
  cargo, extraction, loot provenance and debris. No public debris field, planetary
  defense recovery, fake player assets or moon creation is used for a Site.
- Site lists/resolution authorize the beneficiary; incoming fleet projection only
  accepts Body destinations; report sharing positively allows only ordinary report
  kinds; phalanx SQL excludes Site flights even when their origin is the scanned
  planet. Site anchors do not reserve colony slots. No additional concrete privacy
  or conservation defect was found in these paths.
- Accepted travel duration/fuel/hash stay on FleetTerms; returns use those terms.
  Current contact combat rules are ordinary game behavior, and the issued site
  definition stays pinned. The migration defaults new admission off and the written
  compatibility boundary correctly requires all readers/writers upgraded before
  activation. The supported production operator/enrollment barrier is Chat 4 work,
  so its absence in the foundation is not reported as a new defect.

## Existing evidence inspected

Read the earlier reports and actual final log summaries in
`/tmp/orbit-chat3-d2d8/`. `engine-final.log` records 3 Site fleet tests, 7 Site tests,
and 8 objective/persistence/replay tests passed. `backend.log` records 718 normal,
47 compatibility-server, and 7 storage unit tests passed. `db-regression.log`
records 31 tests across Site fleets, sites, objectives, world, ordering, migrations
and mission-return provenance. `client-tests.log` records 156 passed. These match
the earlier report, including its documented failures/removals and narrower
replacement coverage. They were not rerun here.

Important limits: the foundation Site fixture seeds ships/resources and is not a
three-chapter economic journey. Its analytical safety test uses one satellite and
zero technology, proving a worst-case fight for that fixture; final authored
content must be checked against the same proof assumptions. The ordinary-player
test proves one attack/return's generic evidence, not the complete independent
tutorial. Existing serial retirement/retry tests and scoped contact tests do not
cover the F1/F2 schedules.

## Bounded final acceptance checklist

Every item below is pending final integrated acceptance. Reuse valid upstream
evidence for unchanged sources; run new/focused tests for actual gaps and changed
paths. The table maps to the operations spec sections rather than inventing a
larger campaign or production rollout.

| Gate | Spec | Required evidence and cheapest useful layer |
| --- | --- | --- |
| Activation and eligible identities | §§2.9, 4, 8, 10 | Exercise the actual operator command on a disposable world: disabled saved world remains unchanged; explicit enable is idempotent; pending/claimed pre-enrollment work is drained or safely expanded under the barrier; enabled world enrolls new humans, independent humans, existing empires and bots without history scans. Existing/bot presentation is full; new-human beginner preference is explicit. Verify the documented all-binaries-ready precondition and no raw-SQL-only production path. PostgreSQL/CLI tests. |
| Complete 3x and 2x journeys | §§3, 10 | Real engine transitions from the ordinary starting economy through all three authored chapters, exact construction/research/manufacture, both real launches/contacts/returns, and reinvestment. Record actual time of fighter completion, cargo completion, each contact/return, chapter completion, all grant/loot/cost amounts and ending production/balances. No injected post-start resources, prebuilt fleet, invented timer or fully-funded arithmetic estimate presented as journey evidence. Use Chat 4's retained deterministic harness. |
| Economic continuation and choices | §§2.5–7, 5, 10 | At both speeds, show a productive post-grant upgrade funded by remaining stock plus normal production and quantify the wait; check one reasonable nonoptimal build order, out-of-order work, recall and overlapping construction/research/manufacture. No replacement/loss grants or special tutorial speed. Derive resource affordability and explain any measured pacing limitation. Engine tests/experiments, not browser time travel. |
| Independent and existing-player parity | §§2.2–4, 3, 4 | Complete the same stable objectives with ordinary player targets; use new high-level upgrades to satisfy minimum-level predicates, real manufacture rather than old ship ownership, new attack and actual delivered raid loot. Full-interface and bot activity earns the same grant amounts/IDs; changing display mode yields no evidence/reward/flight effect. Engine/HTTP fixtures; no forced NPC identity predicate. |
| Grant consistency and causal order | §§4–5 | Retain the existing objectives rollback/unknown-commit coverage; verify multiple same-input milestones, offline completion, colony/moon action with homeworld grant, over-cap resources, no repeated payout on reconnect/duplicate input, and reinvest completion only after the relevant return. Validate retained identity/epoch/deletion policy. Add focused scope regressions for F1. |
| Safe authored encounters and conserved loss/loot | §§5–7, 10 | Match final Site A/B force/technology/rules to full-range analytical safety evidence for the recommended fleets. Check an unsuitable fleet's actual loss/draw behavior, half-plunder/whole-unit rounding/free capacity with launch cargo, no NPC replenishment, and no public debris or cargo credited from debris. Reuse foundation engine/DB tests where exact content assumptions match. |
| Site opportunity and lifecycle | §§2.8/10, 6–7 | Lazy issuance only for human beginner at the needed uncompleted lesson; equivalent ordinary accomplishment suppresses unused issuance. Mode exit stops future automatic issuance without cancelling existing work. A retires at first-combat lesson, B at qualifying loaded haul, delivery waits for return. Recall/failure/undersized preliminary raid preserves a feasible unfinished opportunity without replenishment. Stale quotes/duplicate dispatch/one-active admission and accepted flight retirement race preserve cargo/identity. Add F2 outbound/returning deletion tests. |
| Privacy and protocol compatibility | §§6, 8, 10 | Keep private Site list/resolve/quote/dispatch/report/share/phalanx checks; verify no Galaxy marker or incoming fleet leakage and reject unsupported missions. Existing historical FleetTerms hashes, battle ordering, replay and optional raid omissions remain unchanged. Rule/drive changes do not retime accepted flights. Relevant engine, HTTP and persistence checks only. |
| Guided browser journey and dispatch | §§3, 10 | Navigation through chapters/next actions, full-interface escape including a directly opened hidden route, real Site briefing → quote → dispatch submission, active fleet → contact report → return report, receipt history and completion transition. Resume after reload/offline state and handle deliberate slow/error responses. Register matching response listeners before navigation and await successful complete delivery plus observable UI; no sleeps or retries. Focused fixture-only browser cases supplied by Chat 5. |
| UI invariants and accessibility | §§2–3, 5, 7 | No Collect/skip payout or UI-held game-state copy. ResourceMark carries canonical color/icons and full accessible names. Separate homeworld grant from physical fleet loot and from noncollectible Site debris. Preserve incoming threats, active fleets, account/accessibility routes, keyboard focus, touch targets and reduced motion during disclosure. Review final running implementation under UI skill/guide when ownership transfers. |
| Desktop/mobile visual acceptance | §10 and AGENTS | Inspect final 1440×900 and 390×900 captures for chapter/next action, full-interface escape, Site briefing, dispatch review/submitted fleet, encounter/return report, automatic receipt/history and completion; include changed loading/error state where relevant. Verify the Chat 3 floating command HUD no longer obstructs the mobile dispatch button or lower content. Refresh affected captures after fixes. Give root absolute paths and dimensions/state labels for inline display in the originating chat; no hosting required. |
| Final checks and provenance | §10 and AGENTS | After sole validation ownership, record HEAD plus a sorted changed-source hash manifest; use `make check`, focused relevant `make test-db DB_SUITES=... DB_JOBS=1`, and `make test-ui`/existing npm filtering for the final changed surface. Avoid duplicate upstream checks without changes. Include F1/F2 affected suites (attack_groups, holding, empire_deletion) plus new onboarding activation/content suites. No full-system/container/recovery/rolling-deployment acceptance unless separately requested. Report all failed attempts/repairs, setup/build/execution/wait separately, task-owned Compose cleanup and screenshot paths. |

The existing Make entry points `test-site-fleets`, `test-mission-sites`,
`test-objectives`, `test-server`, `test-client`, `test-db`, `test-ui`, `_static` and
`check` were inspected. Final exact filters depend on Chat 4/5's test names. This
is a bounded verification plan, not authorization to start concurrent validation.

## Source review provenance

At 22:27:59 UTC the audited-source subset fingerprint was
`0e594f1af7f88a108beea6590435eb0509472b01aa6dff0728b7520815e57d2e`.
This is SHA-256 of compact sorted-key JSON mapping these paths to their byte
SHA-256: engine `objectives.rs`, `mission_sites.rs`, `site_encounter.rs`,
`missions.rs`, `encounter.rs`, `combat.rs`, `scheduling.rs`, `empire_deletion.rs`;
storage-postgres `objectives.rs`, `mission_sites.rs`, `scoped_facts.rs`,
`scoped_ordering.rs`, `scope_references.rs`, `commit.rs`, `attack_groups.rs`,
`holding.rs`, `empire_deletion.rs`, `phalanx.rs`; application
`world/projection.rs`, `report_sharing.rs` (each relative to `crates/<crate>/src/`).
This identifies inspected source, not a tested candidate or a frozen whole-checkout
snapshot; the integration owner is concurrently authorized to change other files.

## Validation execution and cleanup

No validation jobs or services started in this phase. Setup/build/execution/runner
wait/CI/merge timing: not applicable. No cleanup needed; all existing resources and
uncommitted work preserved.

## Follow-up: F1/F2 repair and activation source review

Root resumed Chat 6 read-only after the foundation fixes landed; Chat 4 retains
implementation/test ownership. Reviewed the actual changed helpers, all their
registration callers, enrollment/activation/CLI wiring, guard/fence readers and
the emerging database test assertions. No build/test job ran in this follow-up.

### F1 source closure

`admission::register` now clones and expands its dependency set before any
`input_scopes` insert (`admission.rs:173–183`). Its single
`expand_player_scopes` boundary applies generic objective homeworlds and then
tutorial-owned Site scopes. The normal selector and paired presence use the same
boundary. `empire_deletion::scopes` expands before returning, covering the ordering
stamp as well as refresh/seed registrations. Therefore late group invite/member,
holding visitor, alliance-member/lifecycle refresh and cleanup seeding all obtain
the same required homeworld/Site closure. The original missing-scope mechanism is
closed; the generic objective implementation remains independent of tutorial IDs.

The current `invited_group_join_restart_battle_reports_and_returns_in_both_runtimes`
test activates tutorial before the group and late holding visitor, and executes
both runtimes through contact/return. This exercises the added tutorial Site
dependencies for the late visitor. Coverage limitation: its invitee joins before
the original event executes, which reschedules the group with complete scopes,
and each launched fleet originates at its owner's home. It therefore does not
directly isolate the original invite-without-joining missing-home failure or a
holding visitor whose origin differs from home. A cheap precise assertion after
InviteAttackGroup, before joining, should verify the existing pending group event
declares the invitee's homeworld (and Site scopes). For the shared lifecycle caller,
checking the host's pending cleanup dependencies after the late visitor would also
cover the previously omitted refresh path without another long journey. These
are coverage limits, not a remaining source defect in the reviewed F1 fix.

### F2 source closure

`empire_deletion::scopes` now adds the actual Site selection identity for each
active Site fleet (`empire_deletion.rs:39–41`). The engine removal loop appends
OperationSettled before clearing owned ships/cargo and setting Destroyed
(`engine/empire_deletion.rs:214–231`). Both occur in the existing transaction;
site history remains retained. This closes both the scoped cancellation fence and
serial dangling-reference mechanism.

The new
`empire_removal_settles_outbound_and_returning_site_references_without_delivery_grants`
test covers the four serial/scoped × outbound/returning combinations. It uses a
generic fixture site rather than relying on the new tutorial scope expansion,
verifies empty active references, Destroyed/empty ships/cargo, no pending fleet
event and no delivery grant. Its repaired deadline selection is player-scoped.
Those assertions directly cover F2. Chat 4 reports all four Site tests passed in
22.795s and the expanded group case passed in 17.362s; Chat 6 has inspected test
source and report evidence, not independently rerun them or verified final logs.
The reported stack-overflow repair in a different existing group scenario remains
Chat 4's execution follow-through; no pass is inferred here.

### Maintenance activation: preserved boundaries

The supported `tutorial activate --universe UUID --all-binaries-ready` CLI calls
`PgStore::activate_tutorial` (not a raw SQL operator recipe). It requires explicit
readiness and obtains the database-wide exclusive server guard, which conflicts
with serving/worker processes' shared guard. It serializes with enrollment,
locks the universe/runtime, rejects pending rules barriers, validates authored
content against current rules, and computes the enrollment timestamp at least as
large as runtime/scope frontiers and the global ordering floor.

Within one transaction it enables both runtime gates, increments serial and scope
fences, clears old claim identities/leases, creates pinned empty objective runs
and full-interface preferences for existing identities, and expands every pending
input through the common selector/registration boundary. Pending IDs, input JSON,
orders, event generations and accepted paid terms are not rewritten. Current
claim validation compares scope declarations, tokens and fences, so retained
pre-maintenance claims cannot commit after this change. The feature's idempotent
second activation leaves runs/receipts/preferences intact. Evidence at/before
enrollment is still filtered by the objective evaluator; later logical completion
can qualify. No additional concrete activation-transaction defect was found.

The activation test checks false readiness, live server-guard refusal, rollback
after an injected post-enrollment pending-input decode failure, idempotence,
preserved pending count, future completion and new human/bot preferences. It does
not yet directly assert a previously loaded claim becomes stale or compare exact
pending input/accepted-terms bytes across activation. Those remain bounded final
acceptance assertions, not source defects. Updating admission scopes for a new
player after activation has the separate concrete gap below.

### F3 — P2, confirmed by source: new enrollment leaves its pre-seeded cleanup input without tutorial scopes

`bootstrap::insert_member` seeds EmpireDeletionDue at the inactivity warning
deadline (`bootstrap.rs:512–518`). Online enrollment calls `insert_member` at
`enrollment.rs:301` and only afterwards calls `tutorial::enroll` at 318–327.
`world_edit/players.rs:140–150` has the same ordering. At initial cleanup
registration, the player has no objective run, so even the fixed common expansion
cannot add their two tutorial Site scopes. `tutorial::enroll` currently inserts the
run/preference and returns without refreshing already seeded pending dependencies.

Reproduction: enable tutorial in a scoped world, sign up a human or create a bot,
then perform **no gameplay/presence action** for that new identity. Advance the
controlled clock to its initial inactivity-warning event (28 days). The event's
declaration contains Player/homeworld but neither opening Site scope. Recomputed
required scopes now see the objective run, add both Site IDs, and
`scoped_ordering::load_scoped:336–345` rejects it as CorruptData. No Site issuance
or actual site visit is needed. A subsequent action would normally refresh the
cleanup dependencies, which is why active journeys can conceal this defect;
the completely idle signup case remains broken. Startup cleanup sees an existing
pending check and does not reseed it. The current activation/signup regression
only reads the newcomer/bot projection and never loads that initial cleanup event.

Minimal fix: after inserting a new objective run, refresh that player's existing
lifecycle dependencies in the same enrollment transaction (or seed the cleanup
only after objective enrollment). Apply the correction through the common path
used by online human/bot and scenario enrollment. Add a focused deterministic DB
assertion that an untouched new scoped identity's initial cleanup claim loads and
commits at its deadline, with both tutorial scopes declared and no grant/issued
site. This finding is on the now-implemented enrollment boundary specifically
requested for review; UI/content/balance work remains excluded.

Small concrete operator-guide correction: `docs/operations/onboarding.md` currently
says `orbit-server tutorial activate ...`, but `crates/server/Cargo.toml` declares
the executable as `orbit`, and Docker installs `/usr/local/bin/orbit`. The documented
command should use `orbit tutorial activate ...` (or its actual binary path); the
current command is not provided by the build. No separate gameplay finding is
created for this correction.

## Latest read-only checkpoint — F1/F2/F3 closed, 23:00 UTC

### F3 fix and actual retained regression

The common `tutorial::enroll` now calls `refresh_enrollment_scopes` after inserting
the objective run/preference. That helper uses the corrected lifecycle refresh
and shared expansion in the same transaction. Both online human/bot enrollment and
operator `add-player` now persist the full manifest **before** calling this helper,
so authoritative homeworld lookup can resolve the new identity. Maintenance
activation also uses this common function and still performs its complete pending
input expansion afterwards. No subsequent foreground action is needed to repair
newborn cleanup scopes. The F3 source mechanism is closed across those callers.

The retained `idle_signup_cleanup_loads_its_original_enrollment_scopes` regression
creates an enabled scoped universe, signs up a human, and executes its two original
warning/removal checks without foreground repair actions. It asserts an opening
Site declaration, successfully loads/commits both events (which revalidates both
required Site IDs), then asserts Removed and empty objective receipts. The final
schema-key assertion repair did not change that lifecycle schedule. Inspected
`/tmp/chat4-db7.log`: PASS **1.137s**, plus the loaded-claim test PASS **3.343s**;
combined tutorial execution **4.481s**. Preparation was **8.85s** for the requested
multi-binary build and **1.24s** for the tutorial runner's rebuild. That same overall
invocation later failed the separate colony-fixture group test; the log is not
represented as an entirely green multi-suite run.

### F1/F2 verified evidence and bounded coverage

The group regression now selects the guard's authoritative homeworld, creates a
distinct colony, asserts origin differs from home, and launches the late Hold from
that colony. Thus its original-homeworld scope failure is directly exercised,
alongside absent tutorial-Site dependencies. Inspected `/tmp/chat4-db8.log`: this
test passed **18.442s**, group deletion passed **12.090s** (group execution total
**30.533s**). The group fixture's missing Astrophysics prerequisite failed once in
the prior run and received the documented one repair; the pass is not a luck retry.

The same log shows F2's serial/scoped × outbound/returning removal test passing
**11.834s**, and all four Site tests passing **22.846s** total. Build preparation
for this invocation was **1.31s**, then runner preparation **0.16s** (groups) and
**0.15s** (sites). Eleven bot tests passed **9.989s**, including the established
noon-clock bot fixture's added tutorial-run/full-interface/no-site assertions;
three server-guard tests passed **1.358s**, including live-guard rejection of
tutorial activation. The later server-guard compile was **2.81s**. These are
upstream measured execution logs read by Chat 6, not new jobs started here.

The separate retained `activation_fences_loaded_attempt_without_rewriting_paid_terms`
test covers serial and scoped runtimes, computes a result from an already loaded
pre-activation claim, activates, compares exact pending-input JSON text and complete
paid construction rows, observes StaleClaim on the old attempt, then processes the
same event freshly and verifies the level/grant. This closes the previously listed
runtime-proof gap for activation claim fencing and retained pending/paid bytes.
The operator guide now correctly uses `orbit tutorial activate ...`.

### Small assertions to retain in final acceptance after deleted combined scenarios

Do not reconstruct deleted broad journeys or revive the removed stack-overflow
visibility test. Current narrow tests/logs already establish F1/F2/F3, bot policy,
live guard, stale claim and retained paid/input data. Remaining small checks can be
attached to the relevant supported layer during final sole ownership:

1. After a late invitation, **before joining/rescheduling**, assert the original
   pending group event includes the invitee's homeworld and tutorial Site scopes.
   This is a small declaration assertion in the existing group fixture, not a
   second journey. The distinct-colony Hold execution already covers its own path.
2. Restore focused activation transaction rollback protection lost when the broad
   activation/HTTP test was deleted: one controlled failure after enrollment writes
   must leave runtime gates, runs, preferences, fences and pending input data
   unchanged. Keep it an isolated DB transaction assertion rather than bundling
   signup, bots, HTTP and progression. Repeated activation/receipt preservation is
   already asserted by the retained explicit real-signup experiment.
3. Preserve the presentation-only invariant through a small authoritative command
   assertion (resources, objective runs/receipts, sites and accepted active flight
   unchanged across SetTutorialPresentation), plus the final browser escape/resume
   submission checks. The deleted combined test had carried the direct storage
   invariant; browser fixtures alone cannot prove it. Authenticated Tutorial/mode
   route wiring can be checked narrowly alongside those final integration checks.

No additional open source defect was found in this checkpoint. The latest source
subset fingerprint is
`c5ecb910f4a7d8f5efdfc72aac50924da6883ffd43052142f72f452cb32f72b7`, using the same
compact sorted path→byte-SHA256 JSON algorithm over storage source `tutorial.rs`,
`enrollment.rs`, `world_edit/players.rs`, `admission.rs`, `empire_deletion.rs`;
engine source `empire_deletion.rs`; and storage tests `tutorial.rs`,
`attack_groups.rs`, `site_fleets.rs`, `bots.rs`, `server_guard.rs`. Base HEAD remains
the detached revision recorded above. This is a review snapshot, not a claim that
all concurrent Chat 4/5 work has been tested at that fingerprint.

Chat 6 edited only this report, started no jobs/services, and has no new cleanup
obligation. Awaiting root's explicit final UI/integration validation ownership.

## Narrow test preparation — authored, unrun (23:16 UTC)

Root explicitly reserved only `crates/storage-postgres/tests/tutorial.rs` and
`crates/storage-postgres/tests/attack_groups.rs`, plus this report, for the three
small assertions above. Chat 5 retains frontend and runtime-validation ownership.
The following edits are now authored; **none have been compiled or executed**:

- Existing
  `invited_group_join_restart_battle_reports_and_returns_in_both_runtimes` now
  asserts the still-pending original group event declares the invitee homeworld
  and both tutorial Site scopes immediately after invitation, before join can
  replace/reschedule that event. No new journey, fixture or database is introduced.
- That existing test also invokes the boxed helper
  `assert_presentation_preserves_flight` immediately after its first real launch.
  At the fixed clock, it executes both beginner/full commands with a null presence
  body, verifies the preference actually changed, and compares all stored body,
  asset-lot, objective/receipt, site and fleet records. The accepted outbound
  MissionFleet is explicitly compared in full after each toggle, including terms,
  cargo, ships, generation, leg and deadline. The separate boxed future avoids
  embedding its SQL/command state in the larger group test future.
- New isolated
  `activation_decode_failure_rolls_back_enrollment_and_scope_fences` in
  `tutorial.rs` uses the established create-universe/signup/scoped-preparation
  path. It changes only the decoder schema of the existing seeded cleanup input,
  producing UnsupportedState from enrollment's pending-scope refresh after the
  activation gates/fences/run/preference writes. It compares the runtime row,
  execution scopes/fences, declarations, objective runs, preferences, exact pending
  input JSON text and viewer/world heads before/after failure. It restores the
  injected input before its final assertions. No successful journey, bot/HTTP
  fixture, repeat-failure workaround or revival of the deleted combined tests is
  included.

Formatting performed only with:

```sh
rustfmt --edition 2024 crates/storage-postgres/tests/tutorial.rs crates/storage-postgres/tests/attack_groups.rs
```

It passed in 0.031s measured command wall time. A scoped `git diff --check` for
those two files passed. No Cargo/npm/build/test job, service, migration, production
source, contract, Makefile, frontend or shared document was modified/run. No new
test failure or repair attempt exists yet for these authored assertions.

Pending execution after root grants sole final validation ownership, using the
new task's own disposable Compose project and dynamically discovered port:

```sh
make test-db DB_SUITES='tutorial attack_groups' DB_JOBS=1
```

This runs the existing Make/database runner, including the new rollback test and
modified group test; it leaves the ignored economic experiment outside routine
execution. Existing prior failure/repair history in Chat 4's report still applies;
inspect any failure once and follow AGENTS rather than stabilizing with retries.
No separate command is needed for the presentation helper or invitation assertions
because they run inside the named existing group regression in both runtimes.

Prepared file SHA-256 at 23:16:00 UTC:

| File | SHA-256 |
| --- | --- |
| `crates/storage-postgres/tests/tutorial.rs` | `c2f25af4ba97709f2205a6ff1da149c9fad3fe6759cea7b9fd0af359ec7b9f3d` |
| `crates/storage-postgres/tests/attack_groups.rs` | `0e9b819f963cc6b88c7cc5e82c2826ef4b0850dd465f42da8de2dddea9717214` |

No task resources were started, so there is nothing to clean up. Waiting for root's
full validation/UI integration handoff; the three checklist assertions are now
prepared, not marked passing.

## Final integrated validation in progress (sole ownership transferred)

Root transferred full implementation/runtime validation ownership after Chats 4/5
became idle. Read their final reports, orchestration and UI skill/guide. Dedicated
Compose project `orbit-chat6-d2d8` uses inspected-unused subnet 10.239.46.0/24 and
dynamically assigned port **55037**. Configuration and logs are in
`/tmp/orbit-chat6-d2d8/`; unrelated Docker resources were untouched.

First `make test-db DB_SUITES='tutorial attack_groups' DB_JOBS=1`: tutorial rollback,
loaded-claim fencing and idle cleanup all passed (1.042/2.830/1.106s; total 4.980s).
Group deletion passed 11.675s, but the expanded
`invited_group_join_restart_battle_reports_and_returns_in_both_runtimes` aborted
with stack overflow after 4.363s. Preparation 6.33s, runner preparations 0.15/0.14s,
command wall 31.16s. Full failure evidence: `db-assertions.log`.

Inspected its history (`e6392c2`, `bc93670`), Chat 4's existing one-repair fixture
record, and repository phalanx repair records. This scenario already used its
repair attempt, so it was deleted outright. No thread-stack increase, retry or
renamed restart/battle/return journey was introduced. Existing deterministic
engine group tests and the retained successful PostgreSQL group-deletion test
still cover real encounter/recall/return behavior. Historical successes of the
removed journey are not current retained passing tests.

The new invitation and presentation protections now live in **two small scoped
command/storage tests that stop with the flight pending**: no join, combat,
restart, report or return sequence. They share an ordinary operator-created
three-player fixture and actual quote/launch, with no hand-maintained GameState.
`pending_invitation_declares_homeworld_before_any_join` checks the original event
ID's homeworld/two-Site declarations after invitation. The other,
`presentation_commands_preserve_pending_flight_and_economy`, compares complete
economic/objective/site/fleet rows across both mode commands. The isolated
activation rollback test remains unchanged and passed.

`make test-db DB_SUITES=attack_groups DB_JOBS=1` passed all three retained tests:
group deletion 11.576s, pending invitation 4.265s, presentation invariant 4.058s.
Preparation 1.86s, runner prep 0.15s, execution 19.900s, wall 23.62s. Evidence:
`db-boundaries.log`. Both database invocations cleaned their per-binary databases.

`make check` is now running (`make-check.log`); no completion is claimed yet.
Verified every path/hash in Chat 5's 74-file UI source manifest matches current
source and all **56 canonical image hashes** match their 28-state inventory.
Initial pixel inspection confirms private destination labels, unobscured mobile
launch controls, reward/history acknowledgment and focus framing, truthful separate
loot/debris/payment descriptions, retained returning fleet labels, completion and
hidden-route escape. Remaining final checks/inspection follow below when complete.

## Final acceptance and ownership release

### Final defects, repairs and retained protection

F1/F2/F3 remain closed. The new activation rollback and two small command/storage
assertions passed. A boxed assertion in the existing group-deletion scenario now
loads the surviving member's bound world and verifies its unresolved group retains
the terminal initiator. This exercises the same SQL member-loading branch that
rescues Returned/Destroyed members excluded by the ordinary active-fleet query,
using the existing Destroyed state without recreating the deleted returned-recall
journey. It passed in the integrated database run. The precise old returned-recall
chronology is no longer claimed as retained database coverage; deterministic
engine tests retain group recall/delay/inline-return and independent-return rules.

The first `make check` used ambient Node **23.3.0**, causing two TypeScript fixture
module-loading failures and missing `process.execve` in the local-command test
(114 passed, 3 failed, 1 skipped; 12.61s wall). Inspected the test history and
package engines. Re-executing with installed pinned **Node 24.18.0 / npm 11.16.0**
passed; no test/source repair or assertion relaxation was needed for that invalid
toolchain run. Subsequent validation explicitly used that PATH.

The integrated database run passed nine suites before phalanx's
`scan_candidate_indexes_do_not_read_unrelated_universe_traffic` failed finding its
SQL specimen. Its source-string prefix assumed `data->>'leg'` immediately followed
the universe predicate; the legitimate private-Site exclusion now precedes it.
History (`023650f`) and phalanx repair records were inspected. Its one repair
retains the universe/origin query identification but permits the inserted Site
predicate. The exact one-row and fewer-than-100-buffer assertions remain intact.
All 13 phalanx tests then passed. This was a test-selector defect, not a production
index or privacy defect. No other matching source-query caller was found.

**F4 — keyboard escape hidden by pinned navigation, resolved.** The first combined
browser run passed 25 cases and failed the opening mobile case's hit test. Direct
inspection established that an unfocused `scrollIntoViewIfNeeded` considers a
button at y=47–91 inside the viewport even though pinned resources/subnavigation
cover it. That geometric-scroll assumption is not proof of pointer actionability.
It also exposed a real keyboard problem: focusing the control did not reveal it.
The first repair added a focus reveal with nearest alignment and retained the
focused hit-test assertion; the same scenario failed again. Under AGENTS the
entire opening-navigation scenario was deleted at both widths, not renamed or
rerun. Four other onboarding browser cases remain. Earlier scenario passes are
historical only.

The production correction was completed through direct rendered diagnosis:
GuidanceBar centers **keyboard-visible** focused controls above the pinned chrome.
Nearest alignment remained occluded. Centering every focus initially moved pointer
targets between pointerdown/click, which the additional mobile history inspection
caught; restricting the handler to `:focus-visible` fixes that without delays,
timers or repeated attempts. No layout/color redesign or game-state change was made.
The original temporary scroll-margin edit was removed.

Final manual evidence explicitly covers both interaction modes, not just the now
deleted test:

- Keyboard: after response delivery and progression rendering, move into keyboard
  modality, focus the escape, assert focused plus center-point hit testing, press
  Enter, observe the committed presentation response and unchanged receipt count.
  Desktop escape top y=95, mobile y=237; both are unobscured.
- Pointer: wait for the actual catalog's focus handoff, scroll the resource page
  down, then use an ordinary upward mouse wheel. Observe native scroll completion
  and `scrollY=0` before hit-testing. Click the actual visible center coordinates
  with `page.mouse.click`, rather than relying on locator auto-scroll, and observe
  the committed mode change with no grant. Centers are desktop (1200.09,117) and
  mobile (195,259), both clear. A preceding manual probe had observed an earlier
  scroll-end while the catalog's focus handoff was pending; serializing those real
  observable boundaries corrected that diagnostic, without sleeps/timeouts.
- Pointer reward-history link from progression and repeated use on an already-open
  full overview: both widths open the correct disclosure, focus its summary and
  pass hit testing. No presentation/reward command is required by those links.

The escape is an ordinary page control, so a user who scrolls past it scrolls back
to reach it; it is not a new floating control. No unresolved pointer occlusion or
broken click remains. Logs are `escape-history-verified.log` and
`escape-pointer-final.log`. Manual scripts live in `test-results/chat-6/` and close
their browser/Vite in finally blocks. They are **manual inspection**, not passing
persistent regression suites. Earlier manual diagnostics and failures remain in
the log directory and are not silently counted as successful checks.

### Final executed checks

All logs below are under `/tmp/orbit-chat6-d2d8/`. Database suites use the repository
Make runner and serial execution within each disposable database. Browser checks
use the fixture-only npm runner with response-aware helpers; no full-system,
container acceptance, recovery or rolling-deployment suite ran.

| Check | Final evidence | Measured phases |
| --- | --- | --- |
| `make check` with pinned Node | 124 tooling passed, 1 explicit-Docker skip; 1,346 client tests/141 files passed; 721 normal +48 compatibility-server +7 storage unit tests passed; Clippy/static/contracts/build passed | Tooling 10.016s; Vitest 5.28s; native builds 26.25+22.11+4.38s; runner prep 0.18+0.16+0.15s; native execution 29.283+1.019+0.014s; Clippy 1.48s; total 158.94s wall (`make-check-node24.log`) |
| Prepared tutorial assertions | Rollback, stale claim/paid input preservation and idle cleanup all passed | Build 6.33s shared with initial group run; tutorial runner 0.15s; execution 4.980s (`db-assertions.log`; subsequent group failure documented above) |
| Small replacement command/storage checks | Invitation declarations, presentation invariance and existing group deletion all passed | Build 1.86s; runner 0.15s; execution 19.900s; wall 23.62s (`db-boundaries.log`) |
| `make test-db DB_SUITES='site_fleets mission_sites onboarding_objectives attack_groups empire_deletion holding world ordering migrations phalanx' DB_JOBS=1` | First nine suites: **50 passed**, including final terminal-group loading assertion. Initial phalanx: 7 passed, 1 selector failure, 5 not run | Build 14.32s; nine-suite execution 155.815s; initial failed phalanx execution 32.561s; invocation wall 220.20s (`db-integrated.log`) |
| `make test-db DB_SUITES=phalanx DB_JOBS=1` after its one repair | **13 passed**; combined final ten-suite coverage is **63 distinct passed**, plus 3 tutorial tests above | Build 4.30s; runner 0.15s; execution 63.922s; wall 70.93s (`db-phalanx-repair.log`) |
| Final selected fixture-browser regression | **24 distinct retained tests passed**: 4 onboarding, shared navigation at multiple widths/200% text, shell dock/focus/resource bar, HUD live alerts/dismissal, ordinary dispatch stale responses/reset, report previews/detail/tools | Module prep 4.284s; runner 37.0s; wall 42.52s (`browser-final.log`) |
| Final 4 onboarding tests after keyboard-only focus guard | All 4 passed (subset of the 24, not additional distinct cases) | Runner 7.3s; wall 10.09s (`browser-tutorial-final.log`) |
| `make test-client _static` after initial focus correction | All 1,346 client tests plus Rust formatting, lint, Prettier, real contracts and boundaries passed | Wall 25.59s (`client-static-final.log`) |
| Final `make _static`; final production build after keyboard-only guard | Both passed on final production source | Static 11.86s; build/TypeScript 12.41s (SSR 0.268s), `static-verified.log`/`build-verified.log` |
| Final all-target workspace Clippy, warnings denied | Passed on final Rust source/tests | 1.37s compiler, 1.58s wall (`clippy-final.log`) |
| Final whitespace check | Passed | No benchmark claimed |

The initial browser run was 25 passed/1 failed, 36.0s runner/38.96s wall. Its one
repair run was 5 passed/1 failed, 8.4s runner/11.05s wall. Those partial runs are
not final success. The later successful 24-test selection excludes the two deleted
opening cases. It also excludes Chat 5's previously deleted dispatch/return/report
and receipt/history cases; none is counted as passing. Final manual captures cover
their required visual interactions as described in the Chat 5 handoff and above.

The combined `make check` preceded the final focus-only UI correction and the
small terminal-group assertion. Final affected client/static/build/browser and
Rust/database/Clippy checks cover those changes; no unchanged full backend rerun
was done merely to repeat evidence. No CI/queue/merge wait occurred. Process/link/
runner overhead is included in command wall totals; it is not misreported as game
simulation time. Browser and DB jobs overlapped for part of the final pass, so wall
timings are observations, not isolated performance benchmarks.

### Acceptance matrix closure

| Requirement | Evidence / conclusion |
| --- | --- |
| Activation, enrollment, causal scopes | Source-reviewed guarded maintenance CLI, additive default-off migration, exact pending/paid preservation and stale-claim test, isolated rollback test, idle scoped cleanup. F1/F2/F3 resolved; ordinary signup/bot/operator paths share the corrected enrollment boundary. |
| Guided and independent 2x/3x completion | Inspected all four unchanged real-signup PgStore experiment artifacts and their final successful log; 27 objectives and 41 paid operations/launches each. No rerun of the 112.403s experiment solely to reconstruct history. Runtime economy/content files still match Chat 4's manifest. |
| Economy after grants / ordinary choices | All four paths complete Metal Mine 10 with no additional grant. Ordinary progression/production tests pass at supported speeds, including the ungifted starter journey; out-of-order/minimum-level/manufacture and causal reinvestment tests remain. The supplemental early-Metal-Storage purchase is directly validated at 2x/3x below. Pacing values are controlled-engine evidence, not human playtesting or an exhaustive spending study. Ordinary waiting/loss consequences remain intact. |
| Automatic grants and true raid delivery | Objectives/stock/fleet atomic rollback and unknown-commit cases, real serial/scoped contact/return, independent player-target evidence, and authored loaded-vs-delivered predicate separation pass. Client mode invariant compares unchanged economy/sites/receipts/accepted real flight. |
| Bot/existing-player parity | Existing identities enroll full-interface with empty evidence; new qualifying events count. Chat 4's noon-clock bot regression (11-test passing bot suite) remains unchanged. Identity derives from bot participation. No historical backfill or automatically issued bot sites. |
| Encounter safety / finite resources | Worst-case authored one-satellite analytical proof remains passing in the full engine suite. Current Site stock, actual loss and surviving capacity reuse ordinary formulas; no replacement grant, regeneration, public debris, fake player or moon side effect. |
| Site lifecycle / private identity | Active-only discovery, private revision selection, unsupported action rejection, retirement preserving accepted flights, real recall/return, both-leg deletion and operation settlement passed. Reports and phalanx exclude unauthorized site identities; canonical UI preserves named retired destinations. |
| Historical compatibility / activation races | Historical terms/hash/replay cases in full backend checks; migration and ordering suites; final phalanx/index/readiness checks; current loaded-claim fencing/retained bytes regression. New admission stays off until explicit operator activation. |
| Browser wiring, freshness and disclosure | 24 retained browser tests plus passing deterministic TutorialEngine/dispatch/report/receipt models; manual final launch/report/return/history evidence from unchanged Chat 5 source, and final keyboard/pointer escape/history inspection after F4. Request generation/binding/revision checks reviewed. No UI-owned completion or claim action. |
| Responsive/accessibility and truthful accounting | All 56 original canonical images inspected; 8 affected opening/detail/full-guidance/history images refreshed and inspected; new keyboard/pointer escape captures inspected. Normal mobile HUD has its own row, controls are not obstructed, resource icons/names/colors are canonical, loot/grants/noncollectible debris are separately explained. |
| Final verification and cleanup | Required combined checks executed, focused failures repaired/removed per policy, final changed areas rechecked, final manifest recorded below, disposable resources removed. No unresolved functional defect or required placeholder remains in the authorized three-chapter scope. |

### Exact economic evidence retained

Every path starts at 1,000 Metal /1,000 Crystal /0 Deuterium with zero levels and
ships. Every path earns **25,700 Metal /16,550 Crystal /5,500 Deuterium** in grants.
Paid progression plus fuel through the extra mine is **24,295 /10,333 /3,302** for
guided play and **24,295 /10,333 /3,307** for the independent target fixture.

| Path | Reinvestment completion | Mine 10 completion | Delivered loot (Metal /Crystal /Deuterium) | Ending balances |
| --- | ---: | ---: | --- | --- |
| Guided 2x | 86.90 min | 96.92 min | 2,385 /1,520 /510 | 5,932.702641 /9,189.493228 /2,816.656160 |
| Guided 3x | 58.92 min | 65.10 min | 2,385 /1,520 /510 | 5,891.592718 /9,172.074388 /2,823.375779 |
| Independent 2x | 188.97 min | 198.98 min | 2,295 /2,058 /508 | 7,695.081021 /10,380.724624 /3,041.941823 |
| Independent 3x | 127.18 min | 133.37 min | 2,295 /2,067 /508 | 7,660.020670 /10,386.078702 /3,108.228327 |

The arithmetic reconciliation `ending − initial − grants − loot + paid` is
positive in every resource/path, consistent with ordinary credited production.
For guided 2x it is 1,142.702641 /452.493228 /108.656160; guided 3x is
1,101.592718 /435.074388 /115.375779. Balances include residual earned grants;
no claim is made that fungible grant resources disappear at tutorial completion.
Independent longer travel comes from its normal target distance, not hidden
tutorial timing. These are the exact `/tmp/orbit-chat4-d2d8/balance-*.json` results.

### Final source, screenshots and cleanup

Detached base remains `a4b2dcab0847182244c0afae1f5783c6a9a27b33`. Final **141-file**
changed/untracked non-doc source fingerprint:
`652cd5ef1865cf01e68c76a222faf82d7d69d224892313fe7d97e04a9640895f`.
Algorithm is the compact sorted path→byte-SHA256 JSON map used throughout. Exact
manifests: `/tmp/orbit-chat6-d2d8/source-manifest.json` and
`test-results/chat-6/source-manifest.json`. No source edit follows this fingerprint;
report/evidence updates are excluded. Chat 6 production changes are limited to the
guidance keyboard-focus handler; other Chat 6 edits are focused tests and the
documented test retirement/selector repair. All earlier uncommitted work remains.

Final image inventory: absolute paths/dimensions/hashes in
`test-results/chat-6/canonical-screenshots.json` (29 states, 58 images). The original
Chat 5 canonical inventory's affected hashes were refreshed too. Chat 5's source
manifest remains historical; final current source provenance is Chat 6's manifest.
All unrefreshed screenshot-relevant production source matches Chat 5's original
manifest; the focus handler has no idle-layout effect. Refreshed pairs are
`opening-viewport-*`, `building-detail-viewport-*`, `full-guidance-viewport-*`, and
`history-link-focused-viewport-*` in the existing Chat 5 directory. Newly verified
focused escape pairs are:

- `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-6/escape-focused-1440x900.png`
- `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-6/escape-focused-390x900.png`
- Supplemental pointer evidence: same directory, `escape-pointer-1440x900.png` and
  `escape-pointer-390x900.png`.

Compose setup took **3.05s**. The final per-project database inventory contained
no `orbit_test_%` databases. Scoped `make db-destroy` removed only
`orbit-chat6-d2d8` container/network/volume in **0.32s**. Final process inventory
shows no task browser/Vite/test job; every manual script closes browser/server.
Normal caches/build output and ignored local evidence remain. No unrelated Docker
service was changed, and nothing was uploaded or deployed.

**Ownership is released to root now.** Root can inspect the final source manifest,
acceptance table and canonical images and deliver its originating-chat final.

## Supplemental nonoptimal-spending experiment — complete

Root explicitly reopened only the economic validation item: one unnecessary early
Metal Storage 1 purchase after Metal Mine 4 /Crystal Mine 3 /Deuterium Synthesizer 2
and before Robotics Factory 1–2, at 2x and 3x. Reused the successful real-signup
PgStore harness via a minimally factored case function. Existing baseline entry
still selects its original four cases. New ignored-by-default
`signup_early_storage_experiment`, invoked by
`make experiment-tutorial-early-storage`, selects only the two guided perturbations.
No production/UI/rule/grant/content code changed. No hand-maintained GameState or
deleted failed journey was revived.

The variant asserts the same 27 stable objective keys, exact original grant totals,
two real positive-loot Returned sorties, both retired/settled sites, reinvestment and
Metal Mine 10 with unchanged receipt count after completion. It verifies exactly
one completed Metal Storage 0→1 purchase for 1,000 Metal and no Crystal/Deuterium,
42 paid actions rather than 41, and total payments exactly 1,000 Metal above the
accepted guided baseline. Every request still uses ordinary inspection/quote and
authenticated submission; nothing is injected into the measured player's economy.

Dedicated Compose project `orbit-chat6-balance-d2d8`, inspected-unused subnet
10.239.47.0/24, dynamically mapped port 55038. Logs and distinct
`balance-{2,3}-guided-early-metal-storage.json` outputs are under
`/tmp/orbit-chat6-balance-d2d8/`. SHA-256 values for all four existing baseline
artifacts were saved before execution; those files are not output targets. Results,
phase timing, updated final source manifest and cleanup will follow here.

### Supplemental result and final handoff

**Both real-signup perturbation cases passed.** They retained exactly the same 27
objective keys and **25,700 Metal /16,550 Crystal /5,500 Deuterium** grants, with
two actual returned sorties, **2,385 Metal /1,520 Crystal /510 Deuterium** delivered
loot, retired/settled sites, causal reinvestment, and the subsequent Metal Mine 10
upgrade without another grant. There are 42 paid operations/launches versus the
baseline's 41. Total paid cost including fuel is **25,295 Metal /10,333 Crystal
/3,302 Deuterium**, exactly **1,000 Metal** above the guided baseline.

| Guided case | Storage starts | Storage build time | Raid loot delivered | Reinvestment complete | Mine 10 complete | Added completion time vs baseline |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2x, early Metal Storage 1 | 14.85 min | 10.50 min | 91.22 min | 97.40 min | 107.42 min | +10.50 min |
| 3x, early Metal Storage 1 | 11.40 min | 6.50 min | 61.80 min | 65.42 min | 71.60 min | +6.50 min |

Robotics 1 starts at 25.35 minutes (2x) /17.90 minutes (3x), immediately after the
unnecessary storage completes. The added ordinary construction time accounts for
the entire observed delay; this particular diversion caused no additional
shortage-driven wait beyond that queue delay. This does not promise optimum pacing
or recovery time for arbitrary spending. End balances remain positive:

- 2x: **4,963.463663 Metal /9,203.952783 Crystal /2,828.664092 Deuterium**.
- 3x: **4,920.156524 Metal /9,185.501118 Crystal /2,846.856078 Deuterium**.

Exact outputs (distinct from every baseline artifact):

- `/tmp/orbit-chat6-balance-d2d8/balance-2-guided-early-metal-storage.json`
- `/tmp/orbit-chat6-balance-d2d8/balance-3-guided-early-metal-storage.json`

All four accepted `/tmp/orbit-chat4-d2d8/balance-*.json` files are byte-for-byte
unchanged against the saved pre-run SHA-256 map. No baseline case was re-executed.
This closes the previously indirect **reasonable nonoptimal spend/build order**
acceptance item with actual ordered-engine evidence. No production defect, extra
grant, stock injection, insurance, formula change or UI change was required.

Validation ledger for this supplemental pass:

- First preparation failed before any test executed: the new early-cost inspection
  needed an explicit `Vec<serde_json::Value>` type for the existing operations
  journal. Added that annotation; no assertion changed. Failed wall **6.11s**,
  logged in `experiment.log`.
- `make experiment-tutorial-early-storage`: **1 ignored-by-default experiment
  passed**, executing exactly two guided cases; four other test entries were
  filtered out. Build **2.78s**, execution **54.504s**, command wall **58.81s**.
  No runtime failure or runtime repair occurred. Log: `experiment-compiled.log`.
- Focused Clippy initially flagged the existing `is_some`/`unwrap` combination in
  the factored helper (**9.49s** wall). Replaced it with the equivalent `if let`
  binding; no behavioral/assertion change. Final focused tutorial-test Clippy with
  warnings denied passed (**0.77s** compiler, **0.84s** wall), with exact-file
  rustfmt check and `git diff --check` also passing. No broad suite was rerun for
  these test-only changes.
- Task DB setup **2.81s**. Every runner dropped its disposable database, including
  the preparation failure. Final `orbit_test_%` inventory was empty. Scoped
  `make db-destroy` removed only `orbit-chat6-balance-d2d8` service/network/volume
  in **0.35s**. No task process or container remains.

The successful experiment executed source fingerprint
`7f9b79a6b3db89e52da0eb01228483f14c8268ce7209cf6119a608e24d023d75`;
its exact manifest is `runtime-source-manifest.json` in the supplemental directory.
The final lint-only binding change produces the new **final 141-file fingerprint**
`dc7e33ca1161c43c3681c3815a66493a71b8a1f5573bbb3e53d62982dbc7542e`.
Final manifests are updated in `/tmp/orbit-chat6-balance-d2d8/source-manifest.json`,
`/tmp/orbit-chat6-d2d8/source-manifest.json`, and
`test-results/chat-6/source-manifest.json`. Only **Makefile** and
**crates/storage-postgres/tests/tutorial.rs** differ from the previously accepted
full-validation source; production, UI, contracts, screenshots and prior check
coverage are unchanged. The earlier accepted manifest is retained separately as
`source-manifest-before-early-storage.json`. This fingerprint supersedes
`652cd5ef…0895f` above without invalidating its unchanged production/UI evidence.

**Supplemental ownership is released to root.** The explicit nonoptimal-spending
item is now directly validated, cleanup is complete, and no further work remains
in this supplemental assignment.

# Chapter onboarding and reusable NPC operations

Status: all six chats complete and integrated acceptance passed. Product decisions explicitly agreed in conversation are requirements; proposed defaults below were implemented as working defaults under the owner's orchestration authorization. See [final delivery](2026-11-04-onboarding-delivery.md), [measured content/API handoff](2026-11-04-chat-4-tutorial-report.md) and [final acceptance](2026-11-04-chat-6-validation-report.md). No live universe has been activated.

This specification supersedes conflicting proposals in the [research notes](2026-11-04-npc-operations-research.md) and [decision log](2026-11-04-onboarding-decisions.md). The [implementation outline and fresh-context handoff](2026-11-04-onboarding-implementation-handoff.md) records the delivery sequence and local work already completed.

## 1. Product objective and scope

Help new and genre-familiar players develop a productive empire, understand why their actions matter, and reach a satisfying fleet loop: build, launch, fight, bring resources home, and reinvest. A long campaign depends on the economy; the tutorial must teach that economy rather than bypass it with a gifted fleet.

Build reusable sites, authored operations, NPC combat integration, objective evaluation, and reward transfers. The tutorial is the only initial gameplay consumer. Future campaigns must reuse these contracts; new mechanics may require additive code and migrations. Do not promise arbitrary future scenarios can be expressed without code.

Initial content comprises three chapters, two personal NPC sites, and the complete economy/fleet/reinvestment loop. Later defense, espionage, PvP strategy, and colonization chapters are planned directions, not deliverables in this release. Scanners, new currencies, waves, cooperative settlement, site capture, factions, projects, artifacts, expeditions, victory, epilogues, and migration are also outside this release.

## 2. Non-negotiable behavior

1. **Full interface is always an available choice.** Leaving beginner presentation changes only guidance and visible complexity. It grants no resources, completes no objectives, and cancels no orders.
2. **Objectives recognize ordinary gameplay.** Building a Light Fighter counts regardless of navigation route. A qualifying attack on an eligible player target can count instead of the recommended outpost. The suggested target is guidance, not an implicit requirement.
3. **Rewards are earned once.** The same qualifying accomplishment earns the same milestone grant in either presentation mode. No upfront starter package, skip payout, manual claim bank, or replayable reward route exists.
4. **Milestone grants are automatic and go to the homeworld.** They commit at authoritative completion, including when the player is offline. Selecting a colony or moon does not change payment. A visible receipt explains what happened; any Continue control changes presentation only.
5. **Loot remains cargo.** Actual raid loot stays aboard surviving ships and reaches the flight's committed return destination normally. Milestone grants and loot are separately identified and budgeted.
6. **Normal game rules apply.** Use real ships, research, fuel, speed, slots, cargo capacity, combat, recall, and returns. No hidden immunity, forced wins, automatic replacement ships, or loss reimbursement.
7. **Author the intended encounters to be very safe.** Validate that the recommended beginner fleets cannot lose through ordinary combat randomness under supported content. Deliberately unsuitable fleets and unrelated attacks retain ordinary consequences.
8. **Sites are personal and nearly orbital for this tutorial.** They do not occupy colonizable slots. Other players cannot exploit a personal site's identity or resources.
9. **Existing players and ordinary bots are eligible.** Credit qualifying new activity after feature launch. Do not reconstruct history or backfill previous actions. Existing players retain the full interface; bots receive no beginner presentation or automatic introductory sites.
10. **Retire introductory sites promptly.** Remove completed opportunities from navigation and reject new launches while preserving committed flights, cargo, reports, and required historical references. Exact retirement trigger defaults are in section 7.
11. **3x is the fresh-universe default; 2x is a primary balance case.** Existing saved worlds keep their speed. There is no secret tutorial fleet-speed multiplier.

## 3. Player experience

### Beginner presentation

New human empires can start in the simplified presentation. Reveal relevant parts of the interface as chapters progress. Offer an obvious Show full interface action throughout. Existing empires and bots start outside beginner presentation. After the opening chapters, use the full interface with optional lighter guidance.

This is progressive disclosure, not another authorization system. Preserve essential navigation, account/accessibility controls, current fleet status, and consequential incoming threats. Do not hide an incoming attack because its screen belongs to a later lesson. Direct navigation to a hidden area should offer entry into the full interface rather than falsify a gameplay prohibition.

Store explicit presentation preferences and selected IDs. Derive visible areas and progress from those preferences and authoritative chapter facts. Shared game state remains in Zustand; do not duplicate it in local state or UI atoms. Follow the repository UI design skill and guide, including ResourceMark's canonical resource colors, accessible full names, focus, touch targets, reduced motion, and desktop/mobile verification.

### Chapters

| Chapter | Content | Player outcome |
| --- | --- | --- |
| 1. Establish the colony | Metal, crystal, deuterium, energy balance, repeated production upgrades, Robotics Factory | A productive economy and understanding of construction investment |
| 2. Build the first fleet | Research Lab, Energy Technology, Combustion Drive, Shipyard, Light Fighter | Own infrastructure and a manufactured combat ship |
| 3. Operate and reinvest | First NPC combat/report/debris; continue cargo research/manufacture; attack another outpost with fighter and cargo; receive loot; improve production | Understand the complete economic and fleet loop |

These are working titles/groupings. Construction, research, and ship manufacture should overlap where ordinary rules permit. Do not force artificial serial waits merely because text appears in chapters. Tutorial guidance can suggest the next prerequisite while other work runs.

The first three chapters are closely guided. Future rewarded chapters progressively reduce hand-holding. The objective engine must accommodate later additions without granting their rewards to players who have not accomplished them.

### Independent play

Objective evaluation does not depend on opening or following the tutorial. A player who reveals the full interface can satisfy the same economic, manufacturing, attack, and delivery predicates through normal play. The opening does not require visiting the exact tutorial site.

Leaving beginner presentation does not recall a fleet, despawn an issued site, or settle rewards. It stops further automatic beginner-site issuance. Reopening explanations does not reset any gameplay record.

## 4. Objective semantics and credit

Each objective definition names a stable identity, typed predicate, completion scope, reward, and explanatory text. Display order and chapter visibility are separate from gameplay evidence. Evaluate against authoritative engine facts/transitions, not reports, analytics, UI callbacks, or a timer that polls the database.

Initial predicate families:

| Predicate | Qualifying evidence | What must not count |
| --- | --- | --- |
| Building reaches minimum level | Completed qualifying upgrade and resulting owned-body level at or above threshold | Merely starting/canceling a build; requiring an established player to demolish and hit an exact level |
| Research reaches minimum level | Completed qualifying research and resulting empire research level | Queuing then canceling research |
| Manufacture a ship | Completed manufacture of the requested type/quantity | Selecting a ship in the UI or receiving unrelated inventory without the required manufacturing event |
| Complete an attack | Resolved eligible attack with actual combat/raid outcome | Dispatch followed by recall before contact; failure to reach a target |
| Return with raid loot | Committed return carrying positive, attributable raid loot, with any explicitly authored fleet requirement | Own resource transfers, arbitrary cargo, or contact before delivery |
| Reinvest after a haul | A completed productive upgrade after the relevant loot return | Claiming to identify the exact fungible resource units spent; an upgrade completed before the qualifying return |

For the first-combat lesson, a resolved attack is an experience objective, not necessarily a victory objective. A future Defeat target objective can require victory and a specific target explicitly. Determine exact predicates and reward thresholds in typed content, with deterministic tests; no inference from the chapter's English title.

The independent path must be able to complete the same initial predicate set without an NPC site ID. Tutorial recommendations may require fighter plus cargo for the demonstrated second operation; the delivery predicate can recognize an equivalent qualifying player-target sortie.

### Out-of-order and existing-player behavior

Recognize qualifying events after activation even when the corresponding chapter is not currently displayed. Retain causal completion evidence when it drives grants or later prerequisites; derive progress percentages and recommendations. A player must not repeat an accomplished post-activation objective merely because its lesson was hidden.

No scan of pre-feature history is required. Evaluate relevant new actions and their resulting current state. An existing metal mine upgraded from 20 to 21 can satisfy an at-least-8 objective; old ship ownership alone does not prove a post-activation manufacturing event. This rollout compromise is deliberate for the small existing population.

Ordinary bots use exactly the same predicates and rewards. NPC encounter forces are not player empires and are ineligible.

## 5. Rewards and accounting

### Milestone grants

Completion evidence and its once-only grant commit consistently with the causative gameplay input. If the input settles several independently satisfied milestones, each gets one stable grant identity. Repeated input delivery, reconnects, client mode changes, and changing content presentation must not duplicate payment.

Grant to the authoritative homeworld, not a mutable client selection. The current game prevents homeworld abandonment. Include the destination's facts and execution scope when a qualifying action happens on another planet. Respect ordered production/resource settlement and existing over-capacity resource semantics; do not discard a reward silently because storage is full. Empire deletion and universe closure follow explicit lifecycle rules and must never redirect payment to another account or a replacement identity.

Offline completion grants immediately at its logical gameplay time. On return, the client shows the receipt/history. Granted resources join the normal economy and can be spent or raided; there is no protected unclaimed balance.

**Proposed simple grant scope for review:** one grant per stable objective ID, player/empire ID, universe and epoch. New content versions do not repay an existing objective ID. A newly enrolled empire is a new player identity and can earn its objectives again; this proposal does not add account-wide anti-reenrollment machinery. Repeated deletion/funding abuse is a limitation of this simple policy, not something idempotency alone prevents. The owner has asked to keep rollout simple; change this scope explicitly if stricter account-level policy is desired.

### Site stock and loot

Use ordinary raid plunder for the introductory attacks: at most half of each available resource stock, rounded by the existing whole-unit algorithm, bounded by actual surviving free cargo capacity. Reuse `raid_loot`/allocation behavior rather than implementing a different tutorial formula.

NPC stock is a finite authored source, independent of milestone grants. Persist issuance and extraction facts; derive remaining stock. Commit stock removal and fleet cargo addition together. Returns deliver previously extracted cargo; they are not new resource issuance.

With enough cargo and no replenishment, repeated raids can recover approximately 50%, then 25%, then 12.5% of the original stock. This is a real future use case for persistent NPC sites. Tutorial retirement need not adopt it. Size the intended first haul using the actual per-resource and capacity calculation; doubling the intended resource quantities is a starting point, not a substitute for evaluating cargo and rounding.

Budget milestone resources, NPC loot, and any collectible debris together. Their sources remain distinct in records and explanation. No NPC site stock regenerates on refresh, repeated disclosure, mode changes, or retry.

## 6. Sites, NPCs, placement, and disclosure

### First-class site identity

A site is a destination with its own stable ID, definition version, placement, authorization policy, and source facts. It is not a fake player-owned planet. A real planet, moon, debris field, and several private sites may share a coordinate anchor without sharing identity or colony occupancy.

Server-side selection and quotation resolve the requested ID and expected revision. Coordinates alone do not authorize a personal destination. Preserve site identity if an adjacent empty planet slot is later colonized.

### Placement contract

Creation receives a typed placement policy, relative origin or allowed region, and validity/reachability constraints. Implement the tutorial's orbital policy and bounded valid selection needed now; keep the contract extensible to regional campaign placement.

Use existing valid topology and distance rules. The tutorial can anchor separate sites at the home coordinate, which has ordinary orbital-distance travel, rather than inventing position 16 or overriding time. Random placement is selected only among eligible candidates using private, versioned deterministic randomness, then persisted as the chosen creation fact. Retrying the same issuance key cannot reroll the location. An empty eligible set produces a defined unavailability outcome, not unbounded random retries or a silent distant fallback.

### Issuance and visibility

Issue the two introductory sites lazily when a human in beginner presentation reaches the relevant uncompleted lesson. Full-interface existing players, independent newcomers, and bots do not automatically create them. Ordinary equivalent accomplishments can remove the need to issue a site at all.

Keep creation separate from disclosure: future campaigns can generate before revealing. Enforce visibility and access in query, quote, dispatch, arrival, reports, sharing, streams, and every alternate target path. Private site IDs must not become a backdoor through scanning, missiles, harvesting, transport, deployment, or colonization. Reject unsupported actions explicitly.

### NPC forces

NPC identity, units, and combat technology are encounter facts. They have no login, research queue, vacation status, ranking entry, or player asset ledger. Ordinary player fleets retain real ownership and acquisition lineage.

Reuse combat arithmetic with an explicit NPC-capable participant/target boundary. Preserve deterministic ordering and historical serialized identities for existing player battles. Do not copy simulation-only synthetic UUID tricks into persistent player records.

Versioned encounter content defines initial forces, stock, and applicable consequences. Actual battle results persist; retries and later visits must not recreate destroyed forces. Site combat needs explicit debris, defense recovery, and moon policies instead of automatically inheriting all planetary raid side effects.

## 7. Introductory content and retirement

### Site A: first combat

Suggested opposition: one solar satellite, defeated by one Light Fighter under ordinary rules. The fleet travels, combat resolves, a report explains the result, debris is shown, and any legitimate small raid loot remains aboard until return. Verify the recommended outcome against all relevant combat randomness and supported parameters.

### Site B: combat plus cargo

A separate outpost has an approachable force and a stockpile that makes bringing Small Cargo valuable. Intended fleet: Light Fighter plus Small Cargo. Author and validate the recommended fleet so an unlucky roll cannot turn the introduction into a costly loss. The return funds another productive upgrade. Exact force and resource values are balance parameters.

### Retirement: agreed direction and proposed trigger

**Agreed:** retire sites quickly to avoid confusing obsolete targets. Do not keep depleted introductory sites indefinitely.

**Proposed default for review:** each site is a one-lesson opportunity. Close Site A to new launches once its first-combat lesson has been achieved. Close Site B once a qualifying successful sortie has loaded the intended useful loot into its surviving cargo fleet; the generic delivery milestone still waits for actual return. Qualifying ordinary gameplay can also make an unused introductory site unnecessary. Stop displaying retired sites as actionable targets immediately and keep the flight/report context available as historical information.

A failed attempt, voluntary recall, or undersized/nonqualifying sortie must not consume the opportunity automatically. Persist actual losses and depletion. Allow the player to attempt the unfinished lesson again without restoring losses or refreshing its stock. Avoid an exact haul threshold that a small preliminary raid makes permanently unreachable: the content contract must define a feasible cumulative/remaining-stock rule or a qualifying cargo-fleet condition. These edge cases are content/engine acceptance checks, not special refunds.

**Proposed admission policy for these two templates:** one active attack operation per site at a time, so a beginner cannot accidentally queue several farming waves while the first encounter retires the target. This limit is site policy, not a restriction on ordinary player targets or future cooperative sites. Recalling/failed attempts can be retried after their existing flights settle.

Any already accepted flight retains a defined normal resolution and return. Retirement is not hard deletion. Retain identity, placement, source facts, tombstones, and reports until pending references and replay/retention requirements permit cleanup. Never erase a due event or silently cancel an accepted attack to make the marker disappear.

Briefing and reports should explain these are finite introductory opportunities; don't teach players that ordinary planets universally disappear after one raid. The generic site model must allow a later persistent finite-stock NPC base that remains raid-able; repeated-wave farming and replenishment are not tutorial objectives.

### Debris

Show the actual computed destruction/debris result. Small Cargo collects stockpile loot, not ordinary debris; a Recycler is the relevant later ship. Do not add the recycler prerequisite chain to this release's tutorial.

**Proposed default for review:** keep beginner debris site-local, non-public, and retire it with the temporary site, with clear unavailable/expired presentation and report history. Do not leave an actionable public debris marker that beginners cannot use, fabricate collectible material, or silently credit debris as cargo. A later reusable site-harvesting handler can make persistent NPC debris collectible. No moon creation at these introductory sites.

## 8. Reusable architecture

The tutorial is a program built from typed objectives, definitions, placement, encounters, and rewards. It must not inject tutorial-name checks throughout the generic engine.

| Concept | Authoritative responsibility |
| --- | --- |
| Versioned definition | Authored rules, objectives, rewards, forces, placement/presentation parameters |
| Program/run | Definition binding and causal facts for one enrollment/campaign |
| Objective completion evidence | Actual input/event, qualifying facts, actor, credited beneficiary |
| Site | Stable destination, placement, visibility/admission/hostility policy, retirement facts |
| Operation | Links the objective/site to accepted real fleets; does not copy fleet balances or timers |
| NPC force | Encounter identity, authored/generated units and technology, actual outcome |
| Milestone grant | Once-only resource issuance to the homeworld with receipt |
| Stock extraction | Conserved transfer from finite site stock to real cargo |

Keep actor, fleet owner, access permissions, and credited beneficiary distinct. The tutorial uses an individual beneficiary; later alliance/collective credit is an explicit extension. Historical credit must never move when a player changes alliances.

Use small typed definition schemas and handlers. Validate unknown or unsupported mechanics closed. No arbitrary embedded scripting language, unbounded expression engine, or plugin registry is required. Validate definitions against enabled content and topology. Retain issued definition versions and actual combat rules identities; updating authoring files cannot silently modify an in-flight commitment.

Derived state stays derived: UI progress, affordability, aggregate stock remaining, counts, recommendation ranking, and effective visibility are projections. Explicit preferences, selected/generated locations, accepted orders, transfers, outcomes, and causally meaningful completions are source facts.

### Existing integration points

- [World destinations/fleets](../../crates/engine/src/world.rs): add site destination without changing existing destination meanings.
- [Mission execution](../../crates/engine/src/missions.rs): share quotation, fuel, slots, launch, recall, cargo, and return.
- [Combat](../../crates/engine/src/combat.rs) and [encounter settlement](../../crates/engine/src/encounter.rs): reuse calculations; isolate body-specific production/loot/moon consequences from sites.
- [Raid allocation](../../crates/engine/src/raiding.rs): preserve per-resource 50% limits and actual capacity behavior.
- [Scheduling](../../crates/engine/src/scheduling.rs): declare site, participant, homeworld-grant, and physical-location conflict scopes as needed.
- [Scoped storage](../../crates/storage-postgres/src/scoped_facts.rs), [scope references](../../crates/storage-postgres/src/scope_references.rs), and [commit](../../crates/storage-postgres/src/scoped_commit.rs): load complete facts and publish one fenced atomic result.
- [Persisted compatibility](../persistence-compatibility.md): preserve historical JSON, accepted terms, hashes, and deterministic replay.

All state changes use the existing ordered commands/events and storage authority. No separate mission worker, browser timer, progress polling job, or reward sweep establishes gameplay truth. Add site scopes to isolate unrelated personal instances and serialize competing extraction/retirement. Use normal generation fences for stale scheduled events and preserve accepted work across rule activation and restarts.

Readiness must include both serial/scoped paths where still supported and feature activation only after all serving/worker binaries can read the new records. Unknown new variants cannot be handed to old workers. Do not rewrite historical fleet terms merely to normalize new schema defaults.

## 9. Campaign compatibility, without implementing campaigns

The owner-linked [win-mode discussion](codex://threads/01a179e0-77a5-7d80-bb5f-30f9ebf7a1a9) describes configurable objectives, regional sites, projects, surveys, and alliance/shared beneficiaries. Preserve those extension boundaries here.

Later decisions there replaced an immediate game freeze with a seven-day epilogue followed by closure. Cooperative campaigns may lose; ordinary PvP remains enabled. Program completion and universe lifecycle must stay separate so completing this tutorial cannot close a universe. Migration, eternal universes, external rewards, project funding, capture, artifacts, and surveys are not implemented now.

The older chat's code inventory is historical: current Orbit has holding/allied holding. This does not make arbitrary sites holdable or attackable automatically.

## 10. Balance and acceptance

Candidate economy endpoint: Metal Mine 8, Crystal Mine 6, Deuterium Synthesizer 4, Solar Plant 9. These are adjustable starting values, not owner-approved fixed numbers. Required standard progression includes Robotics 2, Lab 1, Energy Technology 1, Combustion 1 for Light Fighter, then Shipyard 2 and Combustion 2 for Small Cargo.

An illustrative fully funded overlapping schedule gives fighter/cargo/second-orbital-return at approximately 39/49/53 minutes at 3x and 57/73/79 minutes at 2x. It is neither optimized nor an engine playthrough and excludes reading, clicks, and shortages. No 30-minute guarantee was agreed. Short flights are required; build/research pacing and staged rewards must be tuned with actual engine experiments before final content is frozen.

Implementation measurement supersedes that preliminary arithmetic: the authored
27-objective program was exercised through real signup, stored quotes, paid orders,
normal production, grants and actual fleets. Guided first contact/delivery/final
reinvestment are 42.15/55.30/58.92 minutes at 3x and 60.98/80.72/86.90 at 2x.
Both continue to Metal Mine 10 without another grant. The [Chat 4 report](2026-11-04-chat-4-tutorial-report.md)
records exact amounts, strategies, resource accounting, independent player-target
paths and limitations. These automated execution timings are not promises about
human reading/clicking time. Production formulas and speed rules were not accelerated.

Validate normal rules at both speeds, nonoptimal spending, recall, alternative objective order, existing advanced empires, and a transition after rewards stop. Completion should leave ongoing production worth caring about. Don't tune solely to tutorial completion rate or reward volume.

Required checks:

- Correct generic event predicates; out-of-order credit; no pre-feature history reconstruction; existing high-level upgrades qualify; bots match human rewards.
- Same milestone grant once through any path; no reward from interface changes; offline completion; correct homeworld destination despite colony/moon selection; retry after unknown commit.
- Full-range safety evidence for intended encounters, plus honest defeat/draw/recall outcomes for other choices.
- Stock conservation, per-resource half-loot, survivor capacity, partial extraction, no replenishment, and physical return without double issuance.
- Duplicate issuance/dispatch, stale quotes/generations, overlapping arrival/retirement, mode changes in flight, and absent/retired target handling.
- Authorization for personal sites across every query/action/report route; unsupported action rejection; distinct sites at one anchor; colonization does not change site identity.
- Historical accepted terms and battle replay; content/rules updates during active work; source/empire deletion, vacation, and eventual cleanup preserve existing lifecycle obligations.
- Content definition validation and a second authored test definition prove reuse without creating another production integration.
- Focused HTTP/database/engine tests carry arithmetic, authorization, replay, and race coverage. Browser tests cover actual navigation, focus, dispatch, receipts, responsive layout, and resumed sessions with response-aware fixtures.
- Capture and inspect final desktop/mobile screens and relevant interaction states. Show screenshots in the originating implementation chat before a UI PR is queued/merged; no image hosting is required.

## 11. Working defaults and remaining content decisions

The main requirements are settled. These were proposed defaults before orchestration;
root stated them as working defaults when the owner authorized Chats 1 and 2. This
records implementation judgment, not a claim that each received separate approval:

1. One-lesson site retirement, rather than deliberately teaching repeated diminishing raids; precise success/admission semantics in section 7.
2. Site-local temporary debris presentation and retirement, with no introductory recycler step.
3. Per-empire objective grant identity, allowing a newly enrolled empire to earn again, rather than account-wide anti-reset policy.

Initial amounts, one-satellite encounters, chapter titles, thresholds and a viable overlapping build order are now authored and measured in Chat 4. Chat 6 also verified an unnecessary early storage purchase at both speeds without extra rewards. All required implementation/acceptance is complete; later content and tuning are future work. Do not start further chats solely because these historical plans exist.

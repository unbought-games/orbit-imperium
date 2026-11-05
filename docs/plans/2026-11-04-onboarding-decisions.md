# Onboarding and operations: product decision log

Status: all six chats and final acceptance are complete under the owner's later instruction to orchestrate through completion. See [final delivery](2026-11-04-onboarding-delivery.md). This log preserves product decision provenance; earlier stopping points below are historical. The [specification](2026-11-04-onboarding-operations-spec.md) and [handoff](2026-11-04-onboarding-implementation-handoff.md) record the implemented scope. No live activation/deployment occurred.

## Requested workflow

Continue settling consequential product decisions with the owner, one question at a time. When sufficient decisions are settled, write a consolidated specification. Review it with the owner, then record the implementation-chat outline and orchestration handoff. Do not create implementation chats merely from this checklist. User-owned chat creation requires an explicit request.

The final handoff must name dependencies, contract ownership, acceptance checks, existing local changes, remaining decisions, and the exact next action. Keep unresolved proposals distinct from approved requirements.

## Agreed direction

- Serve players who understand the genre but need progress and direction during the slow opening.
- Build reusable sites, operation execution, NPC combat integration, reward accounting, and objective/campaign foundations. The tutorial is the only initial gameplay integration. Future features can require additive code; existing mechanics should not need replacement for every scenario.
- Teach the economy before fleet play. Players build mines, energy, deuterium production, Robotics Factory, laboratory, research, shipyard, and their own first ships. Do not substitute a gifted starter fleet by default.
- Rewards fund the next useful actions. The eventual loop is develop colony, build ships, operate fleets, bring proceeds home, and reinvest.
- **Superseding owner decision:** there is no skip-and-collect action or upfront starter reward package. Players can reveal the full interface and disregard tutorial directions; rewards still require actual accomplishments. Generic objective checks recognize equivalent ordinary gameplay, including attacks on eligible player targets instead of the suggested NPC outposts. Both presentation modes have the same objective rewards, earned once. Changing presentation grants nothing and does not complete objectives.
- Use real fleet movement, fuel, cargo capacity, combat, recall, and return. Resources carried by a fleet become planetary resources on return.
- Tutorial encounters use ordinary combat and are authored so the intended introductory fleets win reliably, ideally without any possible loss under supported rules. Validate that safety in the engine rather than forcing outcomes or giving hidden immunity. Losses caused by different player choices remain real; no tutorial insurance, automatic replacement, or special recovery grant. Attacking unrelated planets is ordinary gameplay with ordinary consequences.
- Use two distinct introductory sites: first fighter combat (solar satellite/debris is the current candidate), then a cargo-oriented operation with useful stockpile proceeds. These are suggested learning targets, not mandatory targets for generic milestone credit. Finite NPC loot and milestone grants are distinct economic sources and must both be budgeted.
- Initial targets are nearly orbital, with short flights. Site placement must be configurable and capable of random selection within valid constraints so future campaigns can create suitable targets elsewhere. Chosen positions remain stable after issuance.
- Fresh-universe default speed is 3x; 2x is common and must be a primary balance case. Existing worlds retain saved settings.
- Keep this a bounded feature built in dependency order. Reusable contracts are required; unused faction systems, wave execution, scanners, currencies, artifacts, projects, and endgame integrations are not initial deliverables.

## Chapter structure and guidance: owner direction

The tutorial is chapter-based and can eventually extend far into progression. The first few chapters provide close guidance and progressively reveal interface areas to minimize complexity. Players can break free at any time. After the introductory chapters the full game becomes available in the presentation, while optional rewarded objectives can continue with less hand-holding.

Current implementation scope is the opening economy/fleet/operation loop, not the entire later progression. Proposed grouping of that agreed content:

1. **Build the colony:** metal, crystal, deuterium, energy, repeated useful upgrades, and Robotics Factory.
2. **Prepare the first fleet:** laboratory, Energy Technology, Combustion Drive, shipyard, and first Light Fighter. Economy development continues concurrently.
3. **Operate and reinvest:** first combat/report/debris, cargo research/manufacture while fleet activity proceeds, second site, useful haul, return, and reinvestment. Some chapter objectives can overlap in time.

Future rewarded chapters cover planetary defense, espionage, evaluating/attacking other players, and the first additional colony. These are planned directions, not content deliverables for this implementation. Exact chapter titles, groupings, levels, and rewards remain authoring/balance details. Completion of the opening does not mean removing all future guidance.

Presentation restrictions reduce visible complexity; they do not change server authorization, combat rules, or permanently lock gameplay. Follow the existing UI design guide.

- **Show the full interface:** exit beginner presentation immediately while keeping chapter progress, recommendations, and objective reward eligibility. No economic grant or completion occurs from changing presentation.
- **After the opening:** automatically expose the full interface and offer lighter optional guidance. Earlier explanations remain accessible without paying rewards again.
- Derive revealed areas from chapter facts and the user's presentation preference; do not persist duplicate gameplay unlocks. Preserve essential navigation, account/accessibility controls, fleet status, and real incoming-threat information.
- Objectives recognize ordinary gameplay regardless of navigation route or whether the player follows the tutorial. Building a fighter is credited even if no tutorial screen was opened. The tutorial recommends an outpost; a qualifying attack on another eligible target also counts.
- Define each objective's actual success predicate: manufacturing completion, resolved attack, successful resource delivery, etc. Clicking dispatch then recalling is not equivalent to a resolved battle. A generic first-combat objective must not quietly require the tutorial's exact target ID. Future campaigns may still explicitly target named sites when that is their objective.
- Turning off guidance neither recalls fleets nor retires sites or creates rewards. It is presentation state only.
- Keep chapter reward definitions and once-only grants separate from tutorial navigation. Chapter order can guide disclosure, but qualifying accomplishments made out of order after this feature is enabled must still be recognized. Rollout does not reconstruct pre-feature activity.

### Reward delivery: approved

The owner explicitly locked in automatic milestone grants to the homeworld at authoritative objective completion, with a clear reward receipt and no claim button or deferred claim balance. An optional acknowledgement/continue control affects presentation only; it never releases resources. Selecting a different planet or moon, switching devices, or signing out does not affect destination or timing. Show receipts for offline completions when the player returns; payment does not wait for that visit. Retain the receipt with chapter history and distinguish milestone grants from mission cargo.

Mission loot remains physical cargo credited at the fleet's actual return destination through ordinary movement. Keep it distinct from milestone rewards; a completed attack can earn its fixed milestone grant in addition to whatever loot that particular attack legitimately recovered. NPC stockpiles are finite, not another way to redeem or reset milestone grants. The owner approved prompt retirement of introductory sites; the spec proposes retirement when the corresponding lesson is satisfied, including through equivalent ordinary gameplay. Exact one-lesson/repeated-raid semantics are flagged for review.

The current engine forbids abandoning the homeworld (`crates/engine/src/abandonment.rs`), which makes homeworld grant delivery stable for an active empire. Empire deletion and future migration still require explicit lifecycle treatment; never redirect to whichever body happens to be selected in one client.

## Existing empires and introductory site creation

Owner decision: existing empires are eligible for all milestone rewards, stay in the full interface, and earn rewards as they perform qualifying ordinary activities after launch. There are only about five current players; do not build a historical scan, replay/backfill, or retroactive migration to reconstruct old accomplishments. Once-only grant records begin with this feature. Automatic payment to the homeworld remains the approved delivery rule.

Use minimum thresholds rather than requiring an exact early level. For example, an existing player's metal mine upgrade above the beginner target can qualify on completion; they must not demolish and rebuild to hit the exact target. This is normal evaluation of a new activity and its resulting authoritative state, not a historical reconstruction. Distinguish current-state milestones from events such as completing combat or returning with loot.

Recommended implementation of the owner's site suggestion:

- Create a beginner site lazily only when the player is in beginner interface mode, the relevant lesson is available, and its objective still needs doing.
- Existing full-interface players and new players who choose the full interface do not get these two sites automatically. Their ordinary attacks and deliveries can satisfy generic milestone checks.
- Do not gate objective evaluation or reward payment on interface mode. Only the introductory teaching aid is conditional.
- Use one stable issuance key per introductory site/empire under the eventual grant/lifecycle scope. UI refreshes and repeated mode changes cannot spawn more sites or refresh stockpiles.
- Showing the full interface stops further automatic beginner-site creation. It does not cancel orders or teleport fleets/cargo. Already issued sites follow normal finite-stock and retirement rules; do not create a separate mode-switch cleanup subsystem.

Owner decision: retire introductory sites promptly to avoid confusing the player. The owner asked whether repeated 50% raids would be useful. They can yield diminishing loot; the spec recommends one-lesson retirement for beginner content while retaining a future persistent-site policy. The exact trigger and retry exceptions are proposed for review. Do not seed tiny outposts for every existing empire.

Owner decision: ordinary player-like bots earn the same once-only milestone rewards through the same normal gameplay checks as humans. They do not get beginner presentation or introductory outposts. Do not confuse these bots with site-owned NPC forces, which are not reward-eligible player empires.

## Campaign compatibility

The owner asked us to read [Brainstorm Configurable Win Modes](codex://threads/01a179e0-77a5-7d80-bb5f-30f9ebf7a1a9). Read in this chat on 2026-11-04.

Carry forward separation of definitions, run facts, and authorized views; configurable placement and disclosure; actor versus beneficiary; authoritative objective credit; typed objective handlers; and program lifecycle versus universe lifecycle. Future alliance or collective credit must not depend on a tutorial-only player-owner assumption. Scope only the first implemented policies now.

Later decisions in that other discussion supersede its original freeze-at-victory proposal: play continues through a seven-day epilogue before closure. Cooperative scenarios may fail; ordinary PvP remains enabled. Projects, surveys, artifacts, control, migration, and universe endings are future integrations. The other chat's code inventory is historical; this checkout already has holding/allied holding, but arbitrary site holding and combat still need explicit rules.

## Evidence and provisional balance

See [research and architecture notes](2026-11-04-npc-operations-research.md) for sources and code references. Key verified standard prerequisites:

- Robotics Factory 2 unlocks Shipyard 1.
- Research Lab 1 unlocks Energy Technology 1; Energy Technology 1 is required for Combustion Drive 1.
- Light Fighter requires Shipyard 1 and Combustion Drive 1.
- Small Cargo requires Shipyard 2 and Combustion Drive 2.
- Light Fighter capacity is 50; Small Cargo capacity is 5,000. Small Cargo retrieves stockpile resources, not ordinary debris; recycling is a separate mechanic.

Mine levels 8/6/4 with Solar Plant 9 are a candidate endpoint, not approved fixed requirements. An illustrative fully funded overlapping schedule gives first fighter / cargo / second orbital return at approximately 39/49/53 minutes at 3x and 57/73/79 minutes at 2x. These are arithmetic calculations, not optimized engine playthroughs. Rewards remove affordability waits, not normal construction/research/manufacturing durations.

## Specification review items

Enough product direction is settled to write the spec. Review these clearly labeled defaults in its section 11:

1. One-lesson retirement for introductory sites, rather than intentionally teaching repeated diminishing raids; retain coherent retries for unfinished lessons and preserve accepted fleets.
2. Site-local temporary debris that retires with the teaching opportunity; no introductory recycler progression.
3. A simple per-empire/per-objective grant scope, allowing a newly enrolled empire to earn again, rather than account-wide anti-reset logic.

Exact mine levels, resource amounts, enemy composition, and efficient build order are implementation/balance work at 2x/3x. No fixed single-session duration is promised.

Earlier proposals for upfront skip payouts, paying an unissued remainder, automatic recall on skip, a shared skip/loot entitlement, retroactive historical reward reconstruction, and bypassing ordinary half-stock raid plunder are superseded. Do not reinstate them from old conversation history. Automatic homeworld rewards, new-activity eligibility for existing players, bot parity, short-flight placement, and prompt retirement are agreed.

## Work already done locally

- No NPC/tutorial gameplay implementation or implementation chats have started. The consolidated spec and rough chat-by-chat handoff have now been written for review.
- Requested 3x creation-default change is implemented locally in application defaults and CLI behavior/help, with updated operator documentation and focused tests. CLI uses the application default as its source. Explicit speeds remain supported.
- Existing 5x-to-3x validation fixtures explicitly request their 5x starting speed. No live universe was changed or deployment performed.
- `make test-universe-config` passed 8 application and 9 CLI/setup tests. One initially failing duplicate-JSON-key fixture was repaired once after history inspection: it depended on the previous default; it now pins its independent fixture value and verifies the injection target. Formatting, whitespace, and adjusted script syntax checks passed. Database/full-system tests were not run. Details and source digests are in the research note.
- Base checkout revision when inspected: `a4b2dcab0847182244c0afae1f5783c6a9a27b33`. Changes are uncommitted. Inspect current status before future work; do not reset them.

## Provisional chat breakdown

This originating chat owns contract agreement and integration. Final recommended implementation chats: (1) reusable objectives and milestone rewards, (2) sites/placement/disclosure/finite stock, (3) fleet/NPC execution, (4) tutorial chapters/progression/balance, (5) player experience, (6) integrated validation/compatibility. Chats 1 and 2 can run in parallel after shared contracts. Moving reusable objectives into the first foundation avoids inventing completion semantics after fleet integration. Downstream integrations consume settled contracts in dependency order. Each chat owns its focused tests; the final validation chat checks cross-system behavior.

This outline must be reconciled with the final specification before handoff; it is not authorization to start those chats now.

## Next action

Review the consolidated spec and its three explicit default choices with the owner. Answer the repeated-raid question using the actual per-resource 50% loot rule and cargo constraints. Prompt retirement is agreed; one-lesson retirement is the current recommendation. Incorporate review feedback, tighten shared types/contract ownership, then orchestrate only when the owner explicitly asks to start implementation chats. The handoff names the exact documents, local changes, tests, dependencies, and resume steps.

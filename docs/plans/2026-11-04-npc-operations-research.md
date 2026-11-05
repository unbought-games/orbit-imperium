# NPC operations: Orion research and Orbit foundations

Research date: 2026-11-04. Status: product direction accepted in discussion, including equally rewarded actual accomplishments in guided and full-interface modes (no skip payout). Technical details below remain proposed; this is not an accepted ADR or a claim of completed implementation.

The [consolidated specification](2026-11-04-onboarding-operations-spec.md) and [implementation handoff](2026-11-04-onboarding-implementation-handoff.md) are now the current review artifacts. The [decision log](2026-11-04-onboarding-decisions.md) records owner decisions. Those documents take precedence over unresolved or older proposals in these research notes.

Orbit source inspected at `a4b2dcab0847182244c0afae1f5783c6a9a27b33`. No gameplay changes or live-server experiments were made for this research.

## Recommendation

Introduce a first-class **mission site** as a destination for real player fleets. The first site can be presented as an abandoned planetary outpost, with one approachable encounter and a finite stockpile. Its resources travel home in the surviving fleet and fund the player's next upgrade.

Keep the site separate from a player-owned planet, and keep the onboarding campaign separate from encounter execution. That leaves room for later salvage sites, peaceful recovery, cooperative operations, and contested objectives. It does not require implementing a scanner, new currency, NPC empire simulation, procedural mission generator, or multi-wave battles now.

This recommendation borrows product concepts from Orion. It makes no claim about Gameforge's internal architecture, which is not public.

## Accepted scope: guided or independent play, earned rewards only

The owner explicitly corrected the earlier skip-and-collect proposal. There is **no upfront starter package, skip payout, or automatic objective completion** when guidance is disabled. Players may show the full interface and ignore tutorial directions. Generic objective predicates recognize real gameplay wherever it occurs, with the same once-only milestone rewards in either presentation mode.

The tutorial suggests safe NPC outposts, but a qualifying attack against an eligible player target can satisfy the same first-combat objective. Building a fighter counts regardless of whether it was built for the tutorial. Specific campaign-site objectives remain possible later, but must be explicit rather than baked into the generic checks.

Leaving beginner presentation does not recall fleets, retire sites, change reward timing, or reset progress. Guidance and game permissions are separate. No quiz or special gameplay unlock is required to use the full interface.

### Separate milestone grants and mission loot

Each milestone has an authored reward and a well-defined authoritative completion predicate. Its grant must happen at most once. Presentation changes, spending awarded resources, reconnects, or revisiting a chapter cannot create new eligibility. The owner approved automatic milestone delivery to the homeworld at authoritative completion, with a clear receipt and no claim button. Payment does not depend on the selected body, opening the guide, or being online. Optional acknowledgement advances presentation only. Mission cargo remains separate and follows ordinary return settlement.

A finite NPC stockpile is a separate source of mission loot. Extraction moves it into fleet cargo; return delivers that cargo normally. A generic combat milestone can also be accomplished against a player target with whatever loot normal combat yields. Do not treat outpost loot as an alternative redemption of the milestone grant. Budget both NPC-created resources and objective grants when calibrating the opening.

The owner chose safely authored tutorial encounters under ordinary combat rules, real consequences for other choices, and no automatic ship replacements or special recovery grants.

### Dependency order and delivery boundary

| Order | Piece | Dependency and concrete completion condition |
| --- | --- | --- |
| 1 | Objective reward accounting | Define completion evidence, grant scope, and once-only payout; UI mode changes cannot grant rewards. |
| 2 | Personal sites and placement | Add stable identities, immutable content, authorization, disclosure, constrained placement, and finite stockpiles outside colony slots. |
| 3 | Real fleet operations | Extend dispatch/arrival, NPC combat, extraction, recall, and return; preserve resource conservation and actual outcomes. |
| 4 | Reusable chapters and player experience | Recognize ordinary equivalent gameplay, guide new players, and offer full-interface mode without changing economic eligibility. |
| 5 | Integrated validation and balance | Exercise guided and independent journeys, out-of-order accomplishments, short flights, and progression at 3x/2x. |

These are dependencies within one bounded release. Generic contracts support later campaigns; unused scenario mechanics are not additional deliverables. Each implementation owns its focused tests, with shared integration verification afterward.

## Opening progression: economy first, then two sorties

The owner prefers players to build their first fleet through rewarded economy, facilities, and research progression. The economy is the lasting foundation of the empire; the fleet operation demonstrates what that foundation enables. Do not substitute granted ships for this progression by default. Independent players choose their own build order and earn the same milestone rewards as they satisfy the same generic objectives.

Proposed content, not final balanced quantities:

1. Establish metal, crystal, deuterium, and adequate energy. Early illustrative levels are Metal Mine 3, Crystal Mine 2, Deuterium Synthesizer 1, and Solar Plant 4.
2. Fund Robotics Factory 1 and 2 early. Explain its construction-time role and that level 2 unlocks the Shipyard.
3. Build Research Lab 1. Research Energy Technology 1, then Combustion Drive 1. Build Shipyard 1 and then 2 while research runs.
4. Keep growing production alongside research and manufacturing. A candidate endpoint is Metal Mine 8, Crystal Mine 6, Deuterium Synthesizer 4, Solar Plant 9; it is a starting balance proposal, not an optimal build order or a permanent requirement.
5. Build one Light Fighter and dispatch it to the first personal NPC site. The owner's suggested encounter is a solar satellite: a small real combat, visible damage/destruction, and debris.
6. Complete Combustion Drive 2 and manufacture one Small Cargo while the fighter travels. The cargo ship can finish before the fighter returns.
7. Send fighter and cargo together to a second personal NPC site, recover a useful resource stockpile, and invest the returned proceeds into further economic growth. Its opposition can be authored separately from the first site.

Current standard prerequisites, verified in `rules/mvp-v1-slice-5.json` and the standard-content patch builder:

- Research Lab 1 unlocks Energy Technology 1.
- Combustion Drive 1 additionally requires Energy Technology 1.
- Shipyard 1 requires Robotics Factory 2.
- Light Fighter requires Shipyard 1 and Combustion Drive 1.
- Small Cargo requires Shipyard 2 and Combustion Drive 2.

At standard full production, the candidate 8/6/4 economy consumes approximately 395 energy; Solar Plant 9 supplies approximately 424. At 3x speed it produces approximately 1,633 metal and 683 crystal per hour; at 2x, approximately 1,089 metal and 455 crystal, plus temperature-dependent deuterium. These values use existing formulas, not live server measurements.

### Speed and pacing requirements

The owner selected **3x as the new fresh-universe default** and explicitly expects **2x to be common**. Both are primary onboarding balance cases. Existing universes retain their saved speeds. Initial targets are nearly orbital with short flights, selected through the reusable placement system rather than hardcoded tutorial coordinates or a secret travel-time multiplier.

An illustrative schedule using exact rational building costs and the current duration formulas, with every cost funded when needed:

| Milestone (elapsed minutes) | 3x default | 2x |
| --- | --- | --- |
| Initial economy and Robotics 2 | 14.3 | 22.3 |
| Research Lab 1 | 15.9 | 23.2 |
| Shipyard 2 | 19.2 | 27.4 |
| Combustion Drive 1 | 27.9 | 41.2 |
| Combustion Drive 2 | 35.9 | 53.2 |
| First fighter | 38.6 | 57.2 |
| Target economy | 43.5 | 64.5 |
| Small Cargo | 49.3 | 73.2 |
| Second return, with both sites at the home coordinate | 52.9 | 78.7 |

The yard builds the fighter first, then cargo; research and unrelated construction run concurrently. Robotics affects construction, while laboratory and shipyard levels govern research and manufacturing. The first fighter launches at Combustion 1 and retains its accepted flight terms even if Combustion 2 completes during flight.

At full fleet speed, the current same-coordinate distance-5 formula gives round trips of about 2.5 minutes for the fighter and 3.7 for the combined fleet at 3x; at 2x these are about 3.7 and 5.5 minutes. Distinct sites can share a coordinate anchor without sharing identity or occupying a colony slot. The first return can precede cargo readiness; do not delay it artificially. Continue building/researching during that gap.

These are illustrative fully funded schedules, not minimal build orders or playable-engine validation. They exclude reading, clicks, HTTP/worker latency, and resource shortages. Rewards remove resource waits but do not remove construction, research, or manufacturing waits. The slower speeds make the full introduction roughly an hour or more with this schedule; short flights alone cannot guarantee a 30-minute opening. The content/sequence should be tuned at 2x and 3x before fixing a session-length promise.

Reward amounts and delivery points must actually make the assumed spending possible. Total construction/research/one-fighter/one-cargo expenditure is 20,452 metal, 9,373 crystal, and 3,300 deuterium before launch fuel, starting balances, and production.

### Two sorties, two distinct sites

Use two independently issued sites from the same reusable system. Site A teaches a first combat against a small known target, with the suggested solar satellite and debris. Site B teaches fleet composition, cargo capacity, and recovering useful resources. Exact opposition and stockpiles remain balance choices. Each site has a finite authored stockpile. Their loot is budgeted separately from once-only milestone grants; neither presentation choice nor milestone completion regenerates a stockpile.

A fighter has 50 cargo capacity and a Small Cargo has 5,000 under current standard rules. Permit any legitimate small haul from Site A and deduct it from its allocation. A second site lets us author a distinct purpose and opposition without requiring the player to revisit the first.

Debris and the resource stockpile are different sources. Small Cargo retrieves stockpile resources; a Recycler harvests ordinary debris. Explain the distinction without adding recycler research/manufacture to this opening. If the debris lesson is adopted, scope debris to the personal site and define its authorization and budget explicitly; do not leak it into an ordinary public field. Whether it remains harvestable later is still a content choice. Never present it as collectible by a cargo ship.

Author the intended Light Fighter and Light Fighter-plus-Small-Cargo encounters to be safely winnable under ordinary combat rules; validate the full possible outcome range rather than relying only on favorable sample battles. Do not force victory or secretly restore ships. Mistakes and attacks on unrelated player planets have ordinary consequences.

Persist each site's actual outcomes, and never regenerate enemies or rewards on refresh. Repeat visitation is not a required tutorial objective; attempts after recall, partial recovery, or a failed encounter still require coherent persistent state. This requires two content definitions and site instances, not two execution systems.

## Alignment with configurable win modes and campaigns

Read the owner's [Brainstorm Configurable Win Modes](codex://threads/01a179e0-77a5-7d80-bb5f-30f9ebf7a1a9) discussion on 2026-11-04. The later decisions supersede the initial freeze-at-victory idea: the universe continues for a seven-day epilogue and then closes. Cooperative scenarios may genuinely fail, and ordinary PvP remains enabled. Migration, results, projects, surveys, artifacts, control, and endgame closure are future consumers/mechanics, not additional tutorial-release deliverables.

The shared architecture must serve that direction:

- **Reusable objective/program definitions:** separate versioned definitions, run facts, and authorized views. The tutorial is the first concrete program. Use typed objective handlers for construction/research/manufacture milestones, designated encounter outcomes, and actual delivery. Future survey, project, control, artifact, and survival handlers extend the same contract rather than creating another campaign engine. Implement only composition needed by this opening, with defined extension points.
- **Configurable placement:** creation receives a placement policy, bounded eligible region or relative anchor, and reachability constraints. Resolve valid candidates against topology and enabled content; use private versioned randomness when selection is random, then persist the chosen site/anchor as a creation fact. Retries reuse the result. Tutorial placement selects nearby orbital anchors; campaigns may later select sites across specified regions. Never depend on an empty planet slot remaining empty, or invent an invalid position 16.
- **Separate creation and disclosure:** a site can be generated before it is revealed. Persist disclosure/issuance causes and enforce visibility server-side. A future campaign can reveal sites at a stage boundary without inventing new destination machinery.
- **Separate actor, participant, and beneficiary:** the player sending a fleet need not always be the entity credited by a future objective. Tutorial credit goes to its player; an alliance/shared beneficiary is an extension of the model, not a fake player owner. Preserve beneficiary attribution at the causally defined credit event. Do not derive historical credit from today's alliance membership.
- **Consume authoritative gameplay facts:** battle, extraction, delivery, and milestone consequences must be coordinated in the existing ordered transitions and committed atomically where they affect gameplay. Do not award progress by polling reports, reading analytics, or trusting client callbacks.
- **Optional hosts and capabilities:** a site is a location with supported interactions. A future restoration project can attach to a site, and an ark project can attach to a real planet; neither makes every site a project or ordinary building. These capabilities can be added explicitly without changing site identity.
- **Program lifecycle remains separate from world lifecycle:** finishing or hiding tutorial guidance cannot close a universe. Future scenario resolution, epilogue, and closure may observe the same objective outcomes through an explicit universe-level integration. No victory, migration, or eternal-universe behavior is implemented in this release.

The older discussion's engine inventory is historical. Current Orbit already has holding and allied holding mechanics, but this does not automatically make arbitrary sites holdable or fleets at sites attackable. Those integrations still require explicit policies and settlement.

Chat ownership should reflect these requirements: the sites chat owns placement and disclosure; the rewards chat owns resource fulfillment; the campaign/objectives chat owns reusable definitions/evaluation and tutorial content. Fleet execution publishes typed outcomes without depending on tutorial names. Contract agreement here precedes those implementations.

## Research scope and evidence quality

Read the publisher announcement, launch notice, official rollout page, staff changelogs through the November 2 release candidate, the community-authored FAQ reposted by administrators, a firsthand PTS bug report, and a November 3 developer interview. Compared overlapping English, German, and Italian announcements where dates or behavior conflicted.

No authenticated PTS playthrough was performed. Public documentation establishes announced behavior and recorded fixes, not verified launch behavior or retention improvements. Some Gameforge news URLs returned only their page shell when opened; the indexed announcement text was available. The main PTS feedback thread returned 403, so this document does not claim to summarize community sentiment. An independently published guide conflated peaceful/combat activity with PvE/PvP exposure and was not used as authority for that distinction.

### Release status

- The September 30 publisher release announced public testing, a November 6 launch on new universes, and a November 30 global rollout. It advertised more than 25 mission types. [Publisher release][press]
- The October 28 launch notice confirms the initial release is limited to new universes. [Launch notice][launch]
- The current rollout FAQ distinguishes the November 5 game-version deployment from enabling Orion on November 6 new universes; activation elsewhere will be announced separately. Treat November 30 as an earlier announced plan, not a currently reconfirmed deadline. [Rollout FAQ][rollout]
- Staff posts document release-candidate changes on October 30 and November 2. [Latest PTS posts][late-patches]

### What Orion adds

| System | Documented behavior | Relevance to Orbit |
| --- | --- | --- |
| Discovery | An Interstellar Anomaly Scanner finds opportunities; the player selects a mission to activate. Activated sites appear in the galaxy. | A reusable destination can be offered by onboarding today and exploration later. |
| Activities | Combat involves holding against NPC waves. Peaceful cargo assignments also exist. | Fleet play can serve combat and economic interests. |
| Difficulty | Enemy formations and potential loot scale with scanner investment. | Separate authored content from difficulty selection. |
| Cooperation | Up to five commanders can participate; the owner's Alliance Depot constrains group size. | Several fleets must eventually be able to participate in one operation. |
| Progression | A Control Center contains nine upgradeable structures. | An extensive progression layer is optional for our first operation. |

These are publisher-announced capabilities, not a complete verified catalog of all mission variants. [Publisher release][press]

Activated missions can be claimed by other players. Orion distinguishes cooperative PvE from PvP objectives with additional exposure and potentially double rewards. Holding also consumes deuterium, so oversized fleets can reduce profit. [Launch notice][launch]

Lithium is an account-wide resource converted from existing resources, including lifeform food; it cannot be traded or stolen. [Publisher release][press] The early FAQ describes lithium costs for scanning and claiming rewards, per-wave or end-of-mission claims, a one-hour claim deadline, system delivery flights, and cooperative shares based on contributed fleet value. These are **early PTS descriptions**; exact launch behavior needs rechecking. The FAQ credits Dr. Gilderoy and NiNN rather than being an independently authored specification from the developers. [FAQ][faq]

The November 3 developer interview frames Orion as an opportunity to learn which missions players value. Further encounters that change fleet choice and cooperation are expressed as an aspiration, not an announced roadmap. [Developer interview][interview]

### Changes that matter more than the marketing

| Evidence | Consequence for our design |
| --- | --- |
| October 8 added lithium purchases with Dark Matter and changed high-investment scaling. | Separate the useful encounter concept from monetization and balance constants. |
| October 8 fixed full rewards for partial participation. | Define reward eligibility from actual participation facts. |
| October 13 added a lithium storage cap, contradicting the initial FAQ. | Date mechanics and prefer later explicit changes. |
| October 16 changed lithium reward behavior and added cleanup of stuck missions. | Specify terminal states and recovery before adding repeatable encounters. |
| October 21 rebalanced ship rewards. | Newly issued assets require deliberate economic treatment. |

The dated changes above are from the [official Orion changelog][orion-patches].

October 2 fixed rewards going to planets instead of moons, contradicting the original FAQ. October 27 fixed cleanup skipping NPC waves. October 30 corrected a reward overlay that concealed the total lithium cost when the player lacked enough lithium; November 2 included further anomaly-report sorting fixes. [Staff changelogs][late-patches]

A PTS tester reported comparing roughly 90 missions at each of two scan ranges and finding no reward advantage for the longer range despite the tooltip. This is an unverified player report, not a confirmed rule or representative study. [Original report][range-report]

Our inference: distance, time, risk, and reward must produce understandable choices, and the explanation must agree with the actual calculation. A large mission catalog will not compensate for one obviously dominant choice.

### Remaining unknowns

The reviewed sources do not establish a reliable final list of all 25-plus mission types or all nine upgrade effects; final reward tables; generation formulas; exact claim and takeover races; complete departure/partial-participation rules; or long-term economic impact. Early documentation is inconsistent about delivery destination and storage. Do not encode those details as requirements for Orbit.

## Product concepts to adopt, adapt, and defer

### Adopt

- **Purposeful destinations.** A fleet travels somewhere to accomplish an understandable objective.
- **Combat and peaceful operations.** The system can eventually serve both without forcing every player into raiding.
- **Briefing before commitment.** Explain known opposition, expected duration, fuel, cargo, and exposure before dispatch.
- **A visible relationship between risk and proceeds.** Evaluate net benefit, not just a large reward number.
- **One destination, several possible origins.** Design identities so cooperation can be added without pretending everyone shares a fleet or a home planet.

### Adapt for onboarding

- The first site is personal and reserved. Public competition is a later, explicit policy.
- A scripted opening replaces scanner construction and resource conversion.
- Fixed, readable opposition precedes procedural variation. A repeat visit must not secretly regenerate a stronger fleet.
- Ordinary metal, crystal, and deuterium return in the player's fleet. The first lesson is cargo logistics, not a separate reward-claim economy.
- Onboarding opportunities survive logging out. No one-hour reward claim deadline.
- Reward amounts support a next player-chosen upgrade. Tune them with actual starting economies and universe speeds.
- Gradually remove guidance: supplied intelligence, then player scouting and choice, then independent operations.

### Defer

Scanner buildings, lithium or another currency, nine parallel upgrade structures, premium rewards, random loot boxes, infinite scaling, recurring mission generation, public takeovers, alliance reward splits, multiple waves, roaming NPC factions, and autonomous NPC empires. None is required to establish the first reusable site and full return loop.

## The key distinctions

These are Orbit proposals, not descriptions of Orion's implementation.

### Site, operation, and opponent are different things

- **Site:** where an activity happens; stable identity, location, visibility, and admission policy.
- **Operation:** a player's accepted attempt, linking an objective and its settlement to real fleet movement.
- **NPC force:** the units and technology encountered there, independent of a player account.
- **Campaign:** when to offer an operation, how to explain it, and which subsequent goals to suggest.

A planetary or orbital outpost is one presentation for a site. A wreck, orbital installation, or convoy rendezvous could use the same destination mechanism. A future NPC empire that owns productive planets would be a different feature with different needs.

### Visibility, participation, and hostility are separate policies

| Dimension | First release | Possible later extension |
| --- | --- | --- |
| Who can discover or inspect it? | Assigned player | Invited group, alliance, public |
| Who may participate? | Assigned player | Authorized group, open claim, contested claim |
| Can players attack participants there? | No | Explicitly contested operation |
| What activity occurs? | One combat-and-recovery objective | Recovery, delivery, defense, scouting |
| How long does it remain available? | Until resolved or deliberately retired | Announced expiry, event window |
| What funds the reward? | Finite authored stockpile | Contract budget, generated opportunity, shared pool |

Implement only the first column now with typed policies that reject unsupported values. Do not expose a matrix of switches to players or implement unused policy combinations. In particular, one `is_pve` flag cannot represent all these distinctions.

## Where Orbit already helps

| Existing code | What can be reused | Boundary that needs work |
| --- | --- | --- |
| [World types](../../crates/engine/src/world.rs) | Fleet intents, accepted terms, outbound/holding/returning legs | Destinations currently cover bodies, debris, and empty colony positions. |
| [Mission engine](../../crates/engine/src/missions.rs) | Fleet quotations, fuel, speed, slots, recall, cargo, return | Launch and arrival dispatch explicitly match destination and mission variants. |
| [Combat calculation](../../crates/engine/src/combat.rs) | Combat rules, rounds, losses, mixed participants | Participant and target metadata use player/body identities. |
| [Encounter settlement](../../crates/engine/src/encounter.rs) | Existing battle settlement patterns | Assumes a body and its owner; planet raids also handle production, loot, debris, and moon creation. |
| [Simulation](../../crates/application/src/simulation.rs) | The same combat calculation already accepts hypothetical forces | Synthetic IDs are local to simulation; they are not a model for persistent NPC ownership. |
| [Scheduling](../../crates/engine/src/scheduling.rs) | Ordered commands/events and conflict scopes | Scopes currently identify players and coordinates; site references must participate. |
| [Valuation](../../crates/engine/src/valuation.rs) | Player asset provenance and score accounting | Future ship grants need explicit acquisition value and lineage. |
| [Persistence compatibility](../persistence-compatibility.md) | Immutable original rules/terms and explicit interpretation | New variants must preserve historical bytes, hashes, ordering, and replay. |

The arithmetic is reusable, but the current planetary raid settlement cannot simply be invoked against a site. Its side effects would give us unwanted assumptions about accounts, planet production, loot, public debris, and moons.

## Minimum durable foundation

### 1. Add an explicit site destination

Extend the destination model with a site identity and revision. Resolve its coordinates server-side for ordinary distance, fuel, and travel calculation. A valid coordinate alone does not identify or authorize access to a personal site.

Keep sites in their own domain, outside colony-slot occupancy and signup placement. An orbital/planetary visual anchor can reuse a coordinate for travel without turning the site into a colonizable planet. Several private sites can coexist at an anchor. Galaxy presentation must preserve their distinct IDs; never resolve a site request by silently selecting an ordinary body at its coordinates.

Each introductory destination is created once for the assigned player under its own issuance key. Retrying the creation command does not generate another stockpile. Keep the ID across reconnects and failed attempts. A later replacement requires an explicit causal operation, not deletion and respawn.

### 2. Keep authoring separate from accepted gameplay facts

Use a small versioned definition with an objective kind, authored opposition, finite resource budget, participation policy, and presentation keys. No general-purpose scripting language or quest interpreter is needed.

Retain an immutable definition version with each issued site. Snapshot generated opposition when issuance/generation becomes authoritative, if procedural generation is introduced later. Do not regenerate enemies from whatever the latest template says when a fleet arrives.

Persist source facts: issuance, authorization, accepted terms, actual battle outcomes, transfers, and explicit cancellation. Derive completion, remaining stock, recommendation, affordability, and progress from those facts. Do not add duplicated mutable tutorial counters or `reward_claimed` booleans beside authoritative transfers.

Pin authored reward and opposition commitments. Continue the engine's existing rules-activation semantics for combat; whether future site combat should instead pin the entire combat ruleset needs an explicit decision, not an accidental consequence of pinning content. Retain the actual rules identity used for every settlement.

### 3. Reuse real movement; isolate objective resolution

The ordinary fleet remains authoritative for ships, fuel, cargo, origin, dates, and movement. The operation references it rather than copying those values. Add a narrowly typed site-resolution path at arrival, reusing common movement/return functions and the combat calculation.

Conceptual first-operation flow:

```mermaid
flowchart LR
    A[Campaign offers objective] --> B[Personal site issued]
    B --> C[Player reviews and dispatches]
    C --> D[Ordinary outbound fleet]
    D --> E[Resolve site encounter]
    E --> F[Load available cargo]
    F --> G[Ordinary return flight]
    G --> H[Credit home planet]
    H --> I[Campaign recognizes delivery]
```

This diagram shows behavior, not a second persisted state machine. Flight legs stay in the existing fleet model. The site resolver handles objective-specific effects; the campaign observes authoritative outcomes.

A battle victory, resources loaded, resources delivered, and an upgrade purchased are distinct facts. The campaign must not claim success at the first if it promised the complete loop.

### 4. Give NPCs honest combat identities

Introduce a typed NPC force/participant identity at the combat boundary rather than creating a fake player account. Preserve current player participant encoding and deterministic ordering through a compatibility adapter or explicitly versioned format. Old battle inputs must yield the same participant ordering and random sequence.

NPC composition and technology are site facts. They do not require research rows, signup, last-active timestamps, vacation state, alliances, profile pages, or rankings. Player ships retain their real ownership and asset lineage.

Extract only the shared assembly/calculation pieces needed by the first encounter. Keep planetary raid consequences separate. Site policy must explicitly handle debris, defense recovery, and moon eligibility; do not inherit them merely because the combat formula is shared. For the first site, propose no public debris and no moon creation, with any site-local recoverable material counted in the finite economic budget. Communicate this distinction in the operation rules.

### 5. Make rewards an atomic transfer

For a site operation, the source is a finite authored stockpile. Successful recovery transfers resources into surviving fleet cargo, capped by actual remaining capacity. Those extracted resources reach the fleet origin through ordinary return settlement. Milestone rewards use a separate once-only grant tied to authoritative objective completion; a generic milestone can be satisfied by equivalent ordinary gameplay. The frontend awards neither. Existing empires participate through new qualifying activities after launch; no historical reward reconstruction or replay backfill is required.

Derive recoverable stock from the site issuance budget, committed extraction facts, and retirement policy. Commit an extraction fact and cargo mutation together with one stable operation/input identity. Exact retries and repeated event delivery return the original result without extracting twice. Returning ships do not create an additional reward merely because the UI displays a success message.

The owner selected prompt retirement of introductory sites. The consolidated spec proposes one-lesson retirement, with finite persistent stock for nonqualifying/failed attempts and explicit handling of accepted flights. Repeatable diminishing raids are a future persistent-site policy, not a requirement to keep beginner targets indefinitely. Exact retirement/admission semantics are marked for owner review.

Use ordinary raid plunder for these introductory attacks: at most half of each available resource, subject to surviving cargo and existing whole-unit allocation. Size the first intended haul accordingly. A future peaceful recovery handler can have a different explicit rule; do not introduce a special 100% recovery rule into this combat lesson.

Later reward categories need their own settlement rules. Ships require asset provenance and an explicit score valuation; don't invent them by incrementing inventory. Multiple participants require per-participant entitlements and conservation of the total budget. Those are extension boundaries, not functionality to implement in the first release.

### 6. Use existing scheduling and transaction authority

Site admission, fleet dispatch, encounter resolution, stock extraction, recall, and retirement must be ordered in the existing command/event system. No browser timers, separate mission daemon, periodic reward sweeper, or parallel scheduler.

Add site identity to conflict scopes and complete-fact loading. Serialize two fleets competing for the same stock even when they belong to the same player. Keep unrelated personal sites independently schedulable; an anchor coordinate is not a substitute for site identity. Include shared coordinate scope as well when an effect actually touches public debris or a physical body there.

Use generation/version fences for stale events. Define same-time arrival/recall/retirement behavior explicitly in the existing ordering rules. A cleanup operation must never skip an unresolved due encounter or erase an accepted return obligation. Preserve site references/tombstones until fleets, receipts, reports, and replay retention no longer require them.

If waves are added later, they become ordinary durable due events referencing the same site and participants. Their order and retreat semantics will need new rules, but fleet travel and reward delivery need not be replaced.

### 7. Enforce protection at every access path

Personal visibility and participation are enforced server-side in lookup, quotes, dispatch, arrival, scanning, reports, sharing, and streams. Hiding a galaxy marker is insufficient. Missile targeting, deployment, harvesting, and colonization must reject unsupported site actions.

Keep site access policy separate from the existing player-versus-player beginner-protection policy. Evaluate ordinary player protections on ordinary player targets. A protected introductory site must not accidentally become a general-purpose indefinite fleet refuge: v1 allows outbound, one encounter, and return; arbitrary holding and reinforcement are unsupported.

Future public visibility must not imply hostility. Cooperative eligibility, public takeover, and PvP exposure require separate explicit rules. Unsupported values fail closed.

## First release boundary

Build one complete vertical slice:

1. The player can use progressive guided presentation or show the full interface. Both earn milestone grants only through real accomplishments. Two personal sites are issued lazily only for players in beginner interface mode who reach their relevant uncompleted lessons; full-interface players earn the same milestones through ordinary activity without automatic site creation.
2. A briefing presents known opposition, finite stock, and the intended learning goal.
3. The player dispatches owned ships using real fuel, slots, travel, and cargo limits.
4. One encounter resolves with ordinary combat calculations.
5. Survivors recover resources and return normally.
6. Generic objective checks recognize actual manufacture, resolved attacks, and returned loot from qualifying NPC or player targets; guidance suggests an affordable upgrade using current state.
7. Changing presentation, recall, defeat, partial cargo, and reconnect preserve actual progress without duplicate grants. Actual ship losses are not refunded.

Implement one objective resolver. Keep travel, combat calculation, reward transfer, and campaign observation separated because this slice already needs each. Do not build unused stage graphs, plug-in registries, faction services, wave tables, or procedural authoring tools.

Validate the boundary with a second small authored definition during development, not a second production system. Different text, forces, and stock should require content changes only; genuinely new mechanics should still require code and tests.

### Decisions that must be settled before implementation

| Decision | Recommended starting position | What still needs evidence |
| --- | --- | --- |
| First activity | Combat followed by recovery of a finite supply cache | Whether players understand the distinction from ordinary raid plunder. |
| Fleet access | Owner prefers building a fighter and cargo ship through rewarded economy/research progression | Validate the proposed overlapping schedule and grant amounts in the engine. |
| Travel duration | Owner selected nearly orbital, short flights through configurable site placement | Validate full opening pacing at 3x and 2x, including time waiting for ships. |
| Combat safety and losses | Owner chose safe authored tutorial encounters under ordinary combat, with real losses and no replacement grants for mistakes | Prove intended fleets cannot lose under the supported encounter rules; make unsuitable choices understandable. |
| Grant scope | Once per milestone within an explicitly chosen eligibility scope | Existing empires qualify through new activity after launch, without historical backfill. Ordinary bots earn the same rewards without beginner sites; deletion/re-enrollment grant scope remains open. |
| Content versioning | Pin issued content and settled outcomes | Compatibility with operator rule changes that disable a referenced unit. |
| Protection | Personal destination; no third-party access or indefinite holding | Precise explanatory copy and interactions with any future fleet-observation features. |

Account-level grant uniqueness may belong in the admission/storage layer rather than expanding the engine's concept of an account. It is a proposal, not an existing capability. Do not promise that idempotency alone prevents multi-account farming. Model ordinary rewards, losses, and any salvage together; no special loss-recovery entitlement is planned.

## Expansion without replacing the foundation

| Future feature | Existing foundation it uses | New work still required |
| --- | --- | --- |
| A different NPC outpost | Definition version, site identity, combat/recovery | Authored content and balance |
| Peaceful cargo recovery | Site, fleet movement, transfer accounting | Peaceful objective resolver |
| Discovery/scanning | Site issuance and visibility | Search rules, discovery costs, distribution |
| Cooperative missions | Stable operation/site IDs, real fleets | Membership, multi-party scopes, contribution and payout rules |
| Wave defense | Site-local forces, scheduler, combat | Wave events, holding fuel, reinforcement and retreat semantics |
| Public contested sites | Separate visibility/admission/hostility policies | Claim races, PvP eligibility, observation, interference |
| NPC factions and campaigns | Explicit NPC identities, versioned definitions | Narrative state, relationships, encounter selection |
| NPCs owning productive planets | Shared combat and movement calculations | A separate persistent actor/economy model; not a free consequence of mission sites |

The objective is to preserve the expensive invariants and identities. It is not a promise that every later feature becomes configuration-only or needs no migration.

## Required validation when implemented

These are planned checks, not results from this research task.

- Deterministic engine tests: victory/defeat/draw, losses, capacity, partial recovery, retreat, depleted stock, exact event ordering, and unsupported site actions.
- Conservation tests: each site budget equals extractions plus remaining stock; milestone grants occur once for actual completion; returns do not count as new issuance; ships and cargo never duplicate across battle/return/retry.
- Route parity tests: full-interface selection grants nothing; equivalent manufacture/combat/delivery in ordinary gameplay earns the same milestone credit; spending previous grants or reopening help never resets eligibility. Changing presentation during flight has no gameplay effect.
- Controlled concurrency/database tests: duplicate issuance, duplicate dispatch, two arrivals, retry after unknown commit, stale generations, and cleanup against due events.
- Authorization/HTTP tests: cross-player and cross-universe site IDs, hidden-site queries, forged reports, scans, and reward access.
- Compatibility tests: historical fleet terms and battle replay unchanged; new destination/event decoding supported before feature activation; mid-flight content and rules changes handled explicitly.
- Lifecycle tests: vacation, empire deletion, removed origin protection, operator retirement, and site retention while flights remain active. Reuse existing lifecycle invariants; do not quietly redirect committed cargo.
- Economic experiments: first-flight time, full-loop time, fuel/loss-adjusted value, repeat-grant farming, and transition to ordinary play across universe speeds.
- Focused browser checks: full-interface entry without a grant, followed by earning rewards through ordinary actions; guided briefing to dispatch to report to returned resources; leaving guided presentation after starting; response-aware fixture readiness, mobile controls, focus, and resumed sessions. Capture desktop/mobile only when implementing the UI.
- Product observations: can players explain cargo/fuel/return, make an independent next choice, and continue after the grant budget ends? Track completion and return behavior without treating them as proof of learning by themselves.

## Research validation

The initial research inspected repository code and public documentation without changing gameplay or accessing private accounts. Orion was not validated by playing. Subsequent requirements discussions added the requested 3x creation-default change in code and documentation; its focused validation is recorded below. The NPC/tutorial system remains a design proposal, and timing estimates are arithmetic calculations rather than measured playthroughs.

### Requested 3x default: validation record

- Base revision: `a4b2dcab0847182244c0afae1f5783c6a9a27b33`, with local changes to the creation default, CLI, related fixtures, and documentation. No deployment or live-world speed change.
- `make test-universe-config`: 8 application configuration tests and 9 CLI/setup tests passed. Server runner filtered out 34 unrelated tests. Application rebuild: 0.38 seconds; execution: 0.068 seconds. Server build: 42.11 seconds; execution: 0.017 seconds. Runner wait and total wall time were not separately instrumented; no merge was requested.
- First attempt: one application test failed because its duplicate-field injection searched for literal speed 5 in a default-generated document now containing speed 3. History was inspected (latest relevant change `bf3f60d`); no Test Czar repair ledger was found in this checkout. One repair pinned that fixture's speed and asserted the injection target exists. The only `raw.replace` pattern found in the audited application tests/server sources was this caller. The repaired suite passed; no test was removed.
- Tested code/test diff SHA-256 before a subsequent formatting-only change: `3b45c0c235ebc0d6c2eab8ac08154d4b49837368a1749d756a4ec0564f8ed2f5`. Final formatted code/test diff SHA-256: `a9f82bf09041e6e9fa0a0ac91542e270f8da97a35836a40ab29f160f0d2a88bd`. Digests cover `git diff -- Makefile crates scripts`.
- Rust formatting, diff whitespace, and syntax checks for the two adjusted explicit-validation scripts passed after formatting the repaired assertion. Database and full-system/browser suites were not run for this default-only change. Existing 5x-to-3x cutover fixtures now explicitly request their 5x starting speed.
- No disposable databases, containers, or servers were started. Compiler artifacts remain in the normal local build cache. UI visual validation is not applicable to this default/configuration change.

[press]: https://www.gamespress.com/it/OGame-Announces-Project-Orion-with-Wave-Defense-Battles-and-Cooperativ
[launch]: https://gameforge.com/lv-LV/play/ogame/news/a5a8fa6a-d1c4-4726-b6bd-e2039d0141b6
[rollout]: https://ogame.comastuff.com/merges2026.html
[faq]: https://board.us.ogame.gameforge.com/index.php?postID=747913&thread%2F108128-orion-faq%2F=
[orion-patches]: https://forum.origin.ogame.gameforge.com/forum/thread/568-orion-version-13-1/?postID=1640
[late-patches]: https://board.en.ogame.gameforge.com/index.php?postID=7277905&thread%2F856579-pts-version-13-0-0-singularity%2F=
[range-report]: https://forum.origin.ogame.gameforge.com/forum/thread/583-system-range-doesnt-affect-loot-value-orion-update/
[interview]: https://www.space.com/entertainment/space-games/ogame-developers-explain-how-the-browser-based-sci-fi-game-has-lasted-24-years-ahead-of-the-huge-orion-update

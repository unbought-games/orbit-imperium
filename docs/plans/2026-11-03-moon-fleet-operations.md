# Moon Fleet Operations Implementation Plan

**Goal:** Make existing moons usable for every currently implemented fleet mission, with independent stationed ships/resources, ordinary warfare, allied defense, and correct fleet UI.

**Architecture:** Extend the existing body-ID-based mission state machine and settlement paths. Keep moon construction disabled; use deployment and transport to establish lunar fleets and fuel. Reuse inventory, asset lineage, research, policy, ordering, and receipts rather than introducing a lunar fleet subsystem.

**Tech Stack:** Rust engine/application, PostgreSQL/sqlx, React/TypeScript/Zustand, existing unit/database/Playwright fixture tests.

## Global Constraints

- Never store derived state.
- Use Zustand for shared game state.
- Keep local interaction state local. Store selection IDs and user edits, not copies of objects or values available from the game store.
- Add meaningful coverage for changed behavior at the cheapest useful layer.
- Full-system acceptance, process recovery, rolling-deployment validation, signup journeys and production-container validation remain explicit-only through Make or the manual workflow.
- For every user interface change, capture and inspect the final running implementation at both desktop and mobile viewport sizes.
- Before UI implementation, use `.agents/skills/ui-design/SKILL.md` and `apps/web/src/ui/README.md`.
- Historical internal specifications inform this plan; this increment does not implement their entire competitive-launch scope.

---

## Research basis and boundary

Read against `dc6cd74cb230984efa096da79928752b9acfec70`. Source references are the internal documentation's `original-docs/game/moons.md`, `original-docs/specs/moon-strategy.md` (G15), and `original-docs/specs/fleet-missions.md` (G07). The resolution specifications supersede conflicting proposals in the earlier research draft. Current mission implementations remain authoritative for already-shipped travel, fuel, group recall, and protection behavior.

Creation is already implemented: qualifying planetary combat can create one empty moon; new metal/crystal debris determines a capped 20% chance; debris remains collectible. This increment makes that body operational for fleets.

| Existing mission | Moon origin | Moon destination |
| --- | --- | --- |
| Transport | Yes | Yes, subject to existing recipient policy |
| Deploy | Yes | Yes, owned destination only |
| Attack, including alliance attacks | Yes | Yes, normal hostile-action policy |
| Espionage | Yes | Yes, including counterespionage combat |
| Hold / allied defense | Yes | Yes, normal alliance/friendship policy |
| Harvest | Yes | No; retain coordinate debris identity |
| Colonize | Yes | No; retain empty planetary-slot identity |

Includes recall, natural return, stationed fleet presentation, incoming warnings, reports, and parent-planet depot supply to lunar holdings. Hold limits remain per target body; depot budget is shared between the parent planet and its moon.

Excluded: lunar building/manufacturing unlocks, research on moons, phalanx, jump gates, DestroyMoon, voluntary moon abandonment, lunar missile expansion, and expeditions (not an existing Mission variant). Ordinary attacks destroy stationed fleets and raid resources but do not remove the moon. Lunar defenses cannot be manufactured in this increment.

The complete design eventually adds destruction after combat, independent moon/fleet-loss rolls, body removal, and mission-specific fallback. Friendly arrivals and home returns can redirect to the parent; hostile flights must never attack the parent or a replacement moon. That is a separate lifecycle increment. Do not preemptively add stored effective endpoints or a generic coordinate fallback here. The internal docs still require destruction and the other moon systems before the full competitive-launch milestone.

## Existing foundation and gaps

- `MissionDestination::Body` already binds ID, kind, and expected owner; `resolve_destination` already resolves Moon separately from Planet.
- `missions.rs` explicitly rejects Moon origins/targets in both estimation and quotation. Hold additionally requires a Planet target.
- Deploy, transport, return, combat, espionage, and `held_at` principally select by body ID. These paths need lunar coverage and corrections where evidence exposes assumptions, not replacement state machines.
- `galaxy_distance` returns 5 for equal coordinates. A planet and its moon are distinct valid endpoints; sending to the exact same body remains invalid.
- Moon economy already produces zero resources. Imported resources must remain available above nominal storage; local deuterium pays ordinary launches.
- `quote_depot_supply` currently requires `held_at(fleet, source_planet)`, preventing parent-funded moon supply. The UI also reads depot level from the selected body.
- Owned destination shortcuts filter out moons; foreign destination previews inspect only `GalaxyPosition.body`; coordinate actions reject moons and Galaxy moon controls are inspection-only.
- Generic delivery/contact reports omit endpoint kinds and their links default to planets. Identical planet/moon coordinates make this observable once fleet operations are enabled.
- Parent abandonment already groups both bodies and checks moon-origin/holding dependencies. Storage participant coverage and missing-target handling need explicit moon cases before enabling flights.

### Task 1: Enable lunar movement and stationed inventory

**Files:**
- Modify: `crates/engine/src/missions.rs`
- Modify: `crates/engine/src/moons.rs` (clarify the remaining progression-only restriction)
- Test: `crates/engine/tests/missions/moons.rs`
- Test: `crates/engine/tests/missions/colonization.rs`

**Signatures:** Preserve `estimate_fleet(s: &GameState, owner: PlayerId, intent: &FleetIntent, r: &Ruleset) -> Result<FleetEstimate, GameError>` and `quote_fleet(s: &GameState, owner: PlayerId, intent: &FleetIntent, at: Timestamp, r: &Ruleset) -> Result<FleetTerms, GameError>`. Preserve `Mission`, `FleetIntent`, `MissionDestination`, and `MissionFleet`.

**Behavior:**
- Remove fleet-specific blanket moon denial while retaining `require_operational_body` in construction/research/manufacturing/production-setting paths. Do not globally disable this guard.
- Use existing inventory debit, asset-lot transfer, cargo credit, fleet slots, research, fuel, and return lifecycle for lunar origins and destinations.
- Permit all existing legal body combinations, including same-coordinate Planet→Moon and Moon→Planet; reject same-ID dispatch and invalid mission/destination combinations.
- Keep Harvest/Colonize destination contracts unchanged and allow moon origins. Deploy requires no destination Shipyard and stations ships permanently; Transport unloads cargo and returns.

**Tests must prove:**
- Planet↔Moon and Moon↔Moon transport/deployment conserve ships, cargo, paid fuel, deployment fuel credit, and asset lineage; planet stock is unchanged by operations local to its moon.
- Transport/deploy above moon storage capacity loses no delivered resources; time advances without lunar production.
- Moon-origin launches spend local fuel and fail on insufficient fuel even when the parent is rich; current research and shared fleet-slot limits apply.
- Recall/natural return restore the correct moon exactly once; duplicate due events cannot duplicate inventory or credit.
- Lunar Harvest and Colonize complete and return as appropriate; neither mission can target a Moon body. Existing construction-denial assertions remain, while obsolete fleet-denial assertions become positive coverage.

### Task 2: Lunar warfare, espionage, and endpoint evidence

**Files:**
- Modify: `crates/engine/src/encounter.rs`
- Modify: `crates/engine/src/missions.rs`
- Test/modify where required: `crates/engine/src/attack_groups.rs`
- Modify: `crates/application/src/report_sharing.rs`
- Test: `crates/engine/tests/missions/moons.rs`
- Test: `crates/engine/tests/missions/attack_groups.rs`

**Signatures:** Preserve `settle_encounter(s: &GameState, i: &OrderedInput, f: &MissionFleet, r: &Ruleset) -> Result<EncounterSettlement, InvariantError>` and existing group APIs. Add optional historical `origin_kind: BodyKind` / `target_kind: BodyKind` fields to applicable body-to-body report payloads (including Delivered and SpyContact); preserve older payload readability. Existing own-report destination bindings remain authoritative for non-body targets.

**Behavior:**
- Resolve ordinary attacks, alliance attacks, and counterespionage against the target moon's inventory and holdings, with each participant's own research and current policy rules.
- Raid only lunar resources; accumulate ordinary battle debris in the existing coordinate debris field. A lunar battle never invokes a new moon-creation roll.
- Keep moon combat and intelligence separate from the parent's inventory, defenders, resources, and body activity. Incoming hostile warnings remain visible to the moon owner.
- Record endpoint kind in historical report evidence where it is currently missing; preserve it through authorized sharing without adding hidden inventory or private state.

**Tests must prove:**
- Strong parent defenses do not defend its moon, lunar defenders do not defend the planet, and loot/casualties affect only actual participants.
- Mixed planet/moon-origin alliance attackers resolve once at the bound moon; grouping cannot confuse that moon with its parent.
- Espionage observes lunar stocks/buildings and applicable research, includes actual lunar holding defenders, and retains normal disclosure/counterespionage policy.
- Moon combat debris remains harvestable without creating another moon; surviving attackers return to the correct home body.
- New reports distinguish endpoints at identical coordinates, and retained historical reports still render safely.

### Task 3: Lunar holding and parent depot support

**Files:**
- Modify: `crates/engine/src/missions.rs`
- Modify: `crates/engine/src/holding.rs`
- Modify: `crates/application/src/world/projection.rs`
- Test: `crates/engine/tests/missions/holding.rs`
- Test: `crates/application/src/world/projection/tests.rs`

**Signatures:** Preserve `quote_depot_supply(s: &GameState, owner: PlayerId, intent: &DepotSupplyIntent, at: Timestamp, r: &Ruleset) -> Result<DepotSupplyQuote, GameError>`, `DepotSupplyIntent { source_planet, fleet, deuterium }`, `HeldFleetView`, and `DepotView`. Add `pub fn depot_source_for_body(s: &GameState, body: BodyId) -> Result<BodyId, GameError>` in `holding.rs`: a planet maps to itself, a moon maps through its authoritative genesis parent; missing coverage yields `PolicyUnavailable`.

**Behavior:**
- Allow Hold to target a Moon body. Preserve prepaid duration/fuel, owner separation, capacity limits, combat participation, recall, and expiry.
- Authorize depot supply only when the holding target is the source planet or its actual moon, with matching host ownership and existing relationship/lifecycle checks.
- Debit source-planet deuterium and retain one rolling source-planet budget across both targets. Lunar depot construction remains unavailable.
- Derive eligibility/source from current bodies and genesis; do not persist another parent relationship or remaining-budget counter.

**Tests must prove:**
- Holdings at planet and moon have separate participation/capacity; holding ships cannot be launched or spent by the host.
- Expiry versus battle at the same timestamp follows canonical event order; recall returns lunar-origin visitors to their moon.
- Supply to either location consumes one shared budget and only parent resources; unrelated moons/planets and missing or mismatched parents reject without debit.
- Supply prices surviving ships, replaces the departure event once, and retains existing no-refund rules.

### Task 4: Persistence, ordering, and existing removal safety

**Files:**
- Test/modify where required: `crates/storage-postgres/src/world.rs`
- Test/modify where required: `crates/storage-postgres/src/scoped_facts.rs`
- Modify: `crates/storage-postgres/src/scope_references.rs`
- Modify: `crates/storage-postgres/src/holding.rs`
- Test/modify where required: `crates/engine/src/abandonment.rs`
- Test/modify where required: `crates/engine/src/empire_deletion.rs`
- Test: `crates/storage-postgres/tests/moons.rs`
- Test: `crates/storage-postgres/tests/holding.rs`
- Test: `crates/storage-postgres/tests/attack_groups.rs`
- Test: `crates/engine/tests/missions/empire_deletion.rs`

**Signatures:** Preserve existing scoped loader, `ChangeSet`, commit, and scheduler interfaces. No new fleet table, parallel scheduler, or moon-specific inventory table is planned.

**Behavior:**
- Cover lunar inventories, genesis parents, visiting owners, and both body identities at shared coordinates for launch, arrival, combat, depot supply, and abandonment.
- Ensure parent-abandonment scope discovery includes visitors targeting its moon, matching the engine's existing combined planet/moon guard.
- Preserve current planet-abandonment semantics: block origin dependencies and inbound/held allied defenders; other removed-target flights follow existing missing-target return behavior. Do not import DestroyMoon fallback rules.
- Preserve empire-deletion policy with lunar ships/holdings and correctly invalidate stale obligations. Missing committed return identity remains an invariant failure, never a coordinate-based transfer.

**Tests must prove:**
- Real PostgreSQL launch/deploy/return and quote-to-commit paths work with battle-created moons; loading a fresh snapshot preserves stationed inventory and genesis.
- Concurrent launch attempts cannot double-spend the same lunar ships/fuel; duplicate delivery/return applies once.
- Same-coordinate battles/arrivals preserve identity and ordering; parent and moon holdings never merge.
- Parent abandonment cannot strand moon-origin fleets or bypass inbound/held lunar defenders; allowed removal followed by arrival returns cargo/ships without binding to a replacement.
- Parent and moon depot supply races serialize against the same resource balance and budget.

### Task 5: Fleet UI, public projections, and contracts

**Files:**
- Modify: `crates/engine/src/galaxy.rs`
- Modify: `contracts/openapi.json` and regenerate `apps/web/src/contracts.ts`
- Modify: `apps/web/src/features/dispatch-destination.ts`
- Modify: `apps/web/src/features/use-dispatch-destination.ts`
- Modify: `apps/web/src/features/dispatch-destination-preview.tsx`
- Modify: `apps/web/src/features/use-dispatch.ts`
- Modify: `apps/web/src/features/game-screens.tsx`
- Modify: `apps/web/src/features/coordinate-actions.ts`
- Modify: `apps/web/src/features/galaxy-moon.tsx`
- Modify: `apps/web/src/features/galaxy-position.tsx`
- Modify: `apps/web/src/features/galaxy-mission-actions.ts`
- Modify: `apps/web/src/features/use-galaxy-espionage.ts`
- Modify: `apps/web/src/features/alliance-depot.tsx`
- Modify: `apps/web/src/features/empire-overview.tsx`
- Modify: `apps/web/src/features/report-observation.tsx`
- Test/modify where required: `apps/web/src/features/command-hud/fleet-summary.ts`
- Test: existing adjacent destination/action/fleet-summary unit tests
- Test: `apps/web/tests/moons.spec.ts` and `apps/web/tests/dispatch-validation.spec.ts`

**Signatures:** Rename `ownedDestinationPlanets` to `ownedDestinationBodies(bodies: S['BodyV3'][], origin: string): S['BodyV3'][]`; exclude only the exact origin. Preserve `destinationBody`'s call signature while adding foreign moon resolution from `GalaxyPosition.moon`. Extend `PublicMoon` with optional `name: Option<String>` and `activity: PublicActivity`; derive owner/protection from its parent public body, while activity is read for the moon ID. Keep additions backward-readable in clients. Rename chooser props/results consistently from planets/selectedPlanet/onSelectPlanet to bodies/selectedBody/onSelectBody.

**Behavior:**
- Make moon selection open the normal fleet inventory and dispatch flow. Destination shortcuts show body kind alongside identical coordinates; selection changes both body ID and target kind.
- Give Galaxy moons mission actions and probe dispatch using the moon ID/kind. Reuse existing action policies; never accidentally invoke the parent's quick action.
- Display moon local stock, stationed ships, incoming fleets, holds, and routes. Remove blanket fleet-unavailable copy while retaining accurate construction-unavailable copy.
- On a moon, derive the parent depot from existing body/genesis data, show its source and shared budget, and submit that planet ID for supply. Report links use historical endpoint kinds with legacy fallback.

**Tests must prove:**
- Own and foreign moon destinations resolve correctly; same-coordinate parent/moon choices remain distinct; changed quotes preserve edits and uncertain attempts preserve the original bound origin.
- A fixture journey delivers resources, deploys ships, launches from the moon, recalls/returns, and displays an incoming lunar attack plus a lunar battle/spy report.
- Galaxy quick espionage/attack/transport and alliance-group selection retain moon identity; moon-based Harvest/Colonize use the right non-moon destination type.
- Lunar holdings can receive explicitly parent-funded supply without suggesting construction of a lunar depot.
- Desktop/mobile rendered review covers moon inventory, destination selection/review, Galaxy actions, incoming/held fleets, and report links. Capture and inspect final states and display labeled images in the implementation chat.

## Delivery and validation

Tasks 1–3 are separable review units, with Task 4 proving storage/lifecycle behavior and Task 5 completing player access. The full increment is ready when the existing mission matrix works end to end; do not publish a partial UI that offers unsupported lunar warfare or holding. No lunar construction unlock is required.

Use existing Make/npm commands for focused engine, application, PostgreSQL, client, and fixture-browser coverage. Record tested revision, measured phases, failures, and cleanup during implementation. Full-system recovery/container/acceptance suites require a separate explicit request.

Implemented 2026-11-03. Fleet operations are enabled; the excluded lunar progression and lifecycle features remain unavailable.


## Implementation validation — 2026-11-03

Tested base revision: `dc6cd74cb230984efa096da79928752b9acfec70`, plus the uncommitted implementation. SHA-256 of the sorted changed/new source and test file paths and contents (each path/content separated by NUL; excludes this plan): `eb72892b7f4efe1c8365db3b75e6ff24cdd141140bae88b9617ec656cfdc31b0`. No commit, push, release, or deployment was requested.

| Validation | Result | Measured phase timing |
| --- | --- | --- |
| `make test-moon-fleets`: engine mission binary | 145 passed | 0.57s build; 4.716s tests |
| Same target: application library | 86 passed | 1.08s build; 0.197s tests |
| `npm test`, final client rerun | 1,304 passed across 134 files | 4.53s |
| `make test-db DB_SUITES='moons holding attack_groups'` | All 6 tests passed | Moon 12.606s; holding 28.205s; groups 59.760s |
| Final `make test-db DB_SUITES=moons`, including lunar hold/supply and competing launches | Passed | 9.68s preparation/build; 5.094s tests |
| Fixture browser: moons + dispatch validation | 109 passed | 1.224s preparation; 2.1min browser suite |
| Fixture browser: moon fleets, alliance attacks/depot, coordinate links, report glances | 46 passed | 1.359s preparation; 52.8s browser suite |
| Final moon fleet visual run | 8 passed | 1.269s preparation; 11.5s browser suite |
| Supply viewport recapture | 2 passed | 5.9s browser suite |
| Clippy: engine/application/storage, all targets, warnings denied | Passed | 5.63s |
| Production web build | Passed | 3.98s client bundle; 0.232s prerender bundle |
| ESLint, TypeScript, contract generation/schema checks, boundary checks, diff whitespace | Passed | No separate phase timing captured |

Earlier failures were resolved: missing local npm dependencies; a Rust error conversion and test hash ownership error; incomplete new test fixture valuation/reservation facts; obsolete creation-only UI assertions; missing incoming fixture total; hidden review/popup controls in browser tests; the real client-side planet-only Hold/depot/coordinate restrictions; and report tests that needed to retain launch-known body kind while still excluding private defender names. Diagnostic browser runs waiting on obsolete hidden/disabled controls were explicitly stopped and the affected suites rerun to completion. No incomplete or interrupted run is counted as passing.

Inspected fresh rendered desktop (1440×900) and mobile (390×900) captures of Empire overview, lunar fleet inventory/incoming/holdings, depot review, dispatch destination and flight review, Galaxy actions and errors, creation notices, and delivery reports. Screenshots remain local under `test-results/moon-*.png` for inline delivery in the implementation chat. Ordinary toast dismissal was used before final fleet captures; no screenshot retouching.

Disposable PostgreSQL project `orbit-moon-fleets` used port 55439. Each suite removed its isolated database through the existing runner; the project container, network, and volume were removed with scoped Compose cleanup. Browser runners closed their Vite servers and browsers. No full-system acceptance, process-recovery, production-container, signup, or deployment validation was run.

Environment: Rust 1.99.0; local Node 24.14.0/npm 11.9.0. npm reported the repository's higher pinned Node/npm engine versions during installation; the client tests, browser tests, static checks, and production build completed successfully in this environment.

### PR #323 follow-through

The first PR head, `30ab553b5f4d793f3594a8329eaca2bbe5996869`, exposed a historical journal hash regression in routine CI. Optional endpoint metadata is now emitted only for moon endpoints; old planet-only reports retain their original serialized bytes. The existing historical replay hashes were preserved, not regenerated. `make test-server` then passed 675 workspace tests (24.606s), 46 configuration-bridge tests (0.787s), and 7 storage-library tests (0.029s).

Review thread `PRRT_kwDOVRgPYs6zHfZ7` correctly identified that dispatch observation warnings looked up only planet IDs. A shared pure lookup now resolves an observed moon by its own ID and applies its parent's public eligibility policy. Focused client coverage passed 108 tests; the two new desktop/mobile browser cases passed in 2.5s after correcting the test's overly broad live-region locator. The other eight moon browser cases passed in the preceding run. Fresh protection-warning screenshots were inspected at 1440×900 and 390×900. Static checks, TypeScript, and engine Clippy passed after these repairs.

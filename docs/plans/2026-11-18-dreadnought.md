# Dreadnought implementation plan

**Goal:** Let players unlock, build, fly, fight with and simulate the Dreadnought through the existing ship interfaces.

**Architecture:** Extend the standard universe rules with one mobile ship definition and its directed rapid-fire relationships. The existing manufacturing, fleet, battle, reporting and simulator code consumes that definition. Two Rust rules validators need to admit the ship.

**Tech stack:** Rust engine and application services, versioned JSON rules, PostgreSQL, React and TypeScript.

## Global constraints

- Baseline is main at `03fd2a62`, including Graviton Technology and standard content bundle 0.17.0.
- Use the existing `ShipType::Dreadnought`, wire ID, catalog slug and atlas art. Preserve the historical `Deathstar` reader, original rules hashes, accepted terms and inventory identity.
- Scope includes ordinary operations on planets and moons. Moon destruction is a separate mission outside this increment. Expeditions have no runtime mission today. Carry forward their eventual integration contract: 9,000 expedition points per ship, cargo contribution, no Dreadnought finds and no extension of the findable-ship chain.
- Compute gates, duration, movement, hull, incoming rapid fire and unlock displays from the active rules. Existing persisted payments and launch terms remain authoritative for accepted work.

---

### 1. Enable construction and propulsion

Create `rules/content/dreadnought.json`. Register it through the existing `unit()` in `crates/engine/src/standard_rules/content.rs`. Extend the mobile-ship allowlist in `crates/engine/src/progression_terms.rs` and the native Hyperspace Drive pairing in `crates/engine/src/rules.rs`. Advance `STANDARD_RULES_RELEASE` in `crates/engine/src/standard_rules/mod.rs` to 0.18.0 if this is the next content release.

| Rule | Standard value |
| --- | --- |
| Local prerequisite | Completed Shipyard 12 on the producing planet or moon |
| Player prerequisites | Completed Hyperspace Technology 6, Hyperspace Drive 7, Graviton Technology 1 |
| Unit cost | 5,000,000 metal, 4,000,000 crystal, 1,000,000 deuterium |
| Propulsion | Hyperspace Drive, base speed 100, coefficient 3/10, effective speed 310 at Drive 7 |
| Fuel and cargo | Flight coefficient 1, capacity 1,000,000, normal fuel reservation |
| Base combat | Hull 900,000, attack 200,000, shield 50,000 |

The Graviton energy check belongs to planetary research start. A player who earned the level can build at any qualifying yard, including a moon, after the original power supply is lost. Manufacturing uses local resources, the existing paid serial queue and local acceleration. At Shipyard 12, Nanite 0 and universe speed 5, one ship takes 199,384 seconds. Combat stores attack and shield in hundredths (20,000,000 and 5,000,000) and derives hull from metal plus crystal.

Exercise the unchanged `inspect_progression`, `StartManufacture` and `quote_fleet` entry points. Add focused vectors in `crates/engine/tests/dreadnought.rs` and `crates/engine/tests/missions/dreadnought.rs`, registered in `crates/engine/tests/missions.rs`. Prove each gate one level short, exact funding, failed payment without mutation, planet/moon locality, and once-only inventory credit at the accepted deadline. Verify mixed-fleet speed, net payload and committed fuel. Allied holding derives 0.1 deuterium per ship-hour with one rounding step for the fleet.

### 2. Complete the combat matrix and measure resolution cost

Install the following outgoing factors in the standard artifact through the ship content and the existing keyed rapid-fire patches. The satellite content already records 1,250 in `rules/content/solar-satellite.json`. Reuse it for that pair and emit the pair once.

| Factor | Target |
| ---: | --- |
| 1,250 | Espionage Probe, Solar Satellite |
| 250 | Small Cargo, Large Cargo, Colony Ship, Recycler |
| 200 | Light Fighter, Rocket Launcher, Light Laser |
| 100 | Heavy Fighter, Heavy Laser, Ion Cannon |
| 50 | Gauss Cannon |
| 33 | Cruiser |
| 30 | Battleship |
| 25 | Bomber |
| 15 | Battlecruiser |
| 5 | Destroyer |
| 1 (implicit) | Dreadnought, Plasma Turret, Small Shield Dome, Large Shield Dome |

Every incoming factor against a Dreadnought is 1. Check the complete row and column over the 22 combat types. Update current-bundle assertions for affected targets, including the Battleship, Battlecruiser, Bomber and Destroyer engine and PostgreSQL suites. Keep historical fixture expectations pinned to their own rules.

Use the shared `resolve_battle` in `crates/engine/src/combat.rs` and simulator in `crates/application/src/simulation.rs`. Cover a seeded high-factor fight and an ordinary raid through report, survivors, loot, return and asset accounting. With 30% fleet debris, one lost ship contributes 1,500,000 metal, 1,200,000 crystal and, when deuterium in debris is enabled, 300,000 deuterium. This reaches the existing 20% moon-creation cap on an eligible planet. An ordinary attack on an existing moon can destroy stationed units and leaves the body intact.

Measure release-build live battle resolution and the existing ten-sample simulator near its 2,000-unit limit with Dreadnoughts facing probes or satellites. Factor 1,250 is a continuation probability of 1,249/1,250 after each shot against those targets. Round-start targets remain selectable until round end. Record composition, seed, shot counts and elapsed time. If profiling shows excessive cost, optimize while preserving target selection, random draws, results and replay for identical inputs.

### 3. Verify existing gameplay and player-facing surfaces

Trace the ship through `crates/application/src/catalog_view.rs` and `crates/application/src/technical_data.rs` to the Shipyard, research unlocks and technical data. Cover locked, affordable and queued states at the canonical body-scoped shipyard detail route. Verify the factor lists in both directions, large prices and combat stats, including on a narrow screen. Reuse the existing ship art and description.

Exercise dispatch, mixed fleets, group attacks, allied holding, transport, deployment and jump-gate transfer with the normal eligibility rules. Specialist missions keep their existing required ships. Confirm that fleet manifests, espionage observations, combat reports and simulator inputs/results recognize the same ID. Use deterministic or component coverage for these cases. Capture and inspect desktop and mobile images of the changed player-visible states.

Update the standard-world expectations in `crates/engine/src/standard_rules/tests.rs` and the drive bonus assertions in `crates/application/src/technical_data.rs`. Extend relevant presentation coverage in `apps/web/tests/components/progression-detail.component.spec.ts`. The disabled-universe case in `apps/web/tests/catalog-pages.spec.ts` still describes a supported configuration. Retain it alongside enabled coverage.

### 4. Activate and verify retained worlds

Use `standard_signup_rules` for fresh worlds and `upgrade_standard_rules` for existing ones. Cover a 0.17.0 world with the exact disabled placeholder, a world with customized ship content and repeat activation. In `crates/storage-postgres/tests/rules_updates/dreadnought.rs` (register in `crates/storage-postgres/tests/rules_updates.rs`), verify committed production across disable/restart and subsequent audit. Keep the legacy spelling, collision and hash checks in `crates/engine/tests/persistence.rs` and `crates/storage-postgres/tests/rules_updates/compatibility.rs`. An otherwise current world needs no schema migration, inventory grants or new wire version.

Update `crates/storage-postgres/tests/rules_updates/standard.rs`, `docs/operations/rules-updates.md`, and the current guidance that describes Dreadnought relationships as deferred. Add `docs/operations/dreadnought.md` and a build note under `docs/news/changes/`. Clarify the historical identifier note in `docs/persistence-compatibility.md`.

Deploy compatible API, workers, CLI and web client first. Preview with `orbit rules upgrade --universe <id> --dry-run`, review the whole-bundle diff, then apply with `orbit rules upgrade --universe <id>`. Retain the effective rules revision/hash and run `orbit audit --universe <id>`. On a customized world, resolve reported conflicts explicitly. To stop new orders, forward-disable the catalog entry while retaining the definitions needed by paid batches, existing ships and launched fleets.

## Implementation evidence

The standard content release is 0.18.0. The ship reuses the existing Shipyard,
dispatch and simulator screens. A paid batch completed after disable and
restart in both PostgreSQL execution modes. Engine tests cover lunar construction
gates, jump transfers, mixed-fleet holding fuel, and manufacture through raid
and return.

On an Apple Silicon development machine, the release-build measurement used
1,900 Dreadnoughts versus 100 Solar Satellites, seed byte 42 repeated 32 times
and zero combat research. The first battle resolved 2,479,284 attacking shots.
Buffering HMAC blocks within a battle, using exact bounded integer sampling,
indexing rapid fire once and aggregating shot totals per shooter reduced its
elapsed time from 5.09 seconds to 0.27 seconds. The random cursor remained
at block 255441, byte 27. Ten real simulator samples fell from 48.95 seconds
to 2.88 seconds. These are local measurements, not CI timing assertions.

Reproduce the opt-in measurement with
`cargo test --release -p orbit-application --lib measure_dreadnought -- --ignored --nocapture`.

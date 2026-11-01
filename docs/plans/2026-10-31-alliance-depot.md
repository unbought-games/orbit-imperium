# Alliance Depot Implementation Plan

**Goal:** Ship planet-based allied holding and host-funded Alliance Depot resupply.

**Architecture:** Preserve fleet ownership throughout outbound, holding, and return legs. Extend the existing encounter adapter and ordered transaction pipeline; immutable launch terms and supply history are the sources for derived consumption and rolling budgets.

**Tech Stack:** Rust engine/application, PostgreSQL, OpenAPI, React/Zustand, Vitest/Playwright.

## Global Constraints

- Five defending owners including host; sixteen visiting fleets per body.
- Initial hours: 0, 1, 2, 4, 8, 16, 32; real time at every universe speed.
- Holding consumption is launch fuel coefficient / 10, rounded once per fleet payment.
- Depot budget is 10,000 deuterium per completed level per rolling real hour.
- Preserve paid commitments, ownership, historical serialization, and idempotent receipts.
- No derived state storage; no group-attack or lunar activation in this increment.

---

### Task 1: Fleet and supply domain
**Files:** create `crates/engine/src/holding.rs`; modify `world.rs`, `missions.rs`, `policy.rs`, `abandonment.rs`, standard rules; test `crates/engine/tests/missions/holding.rs`.
**Signatures:** `quote_depot_supply(&GameState, PlayerId, &DepotSupplyIntent, Timestamp, &Ruleset) -> Result<DepotSupplyQuote, GameError>`; `HoldingTerms`, `DepotSupplyIntent`, `DepotSupply`, `HoldingRelationships`.
**Behavior:** Commit rates and prepaid holding fuel with flight terms. Preserve fleet ownership and deadline through combat. Derive supply budget from immutable payments. Replace departure generation atomically on supply.
**Tests must prove:** exact rounding, capacity and relationship guards, zero-hour return, arrival capacity races, recall, stale events, rolling boundary, losses, level changes, and no refunds.

### Task 2: Encounter and durable integration
**Files:** modify `crates/engine/src/encounter.rs`, `scheduling.rs`; create PostgreSQL holding adapter/migration; modify storage fact, scope, commit, and world adapters.
**Signatures:** participant settlement extends existing `settle_encounter`; storage loaders return source relationship facts and supply history under complete coverage.
**Behavior:** Include current held defenders in combat/espionage. Update every owner and recipient. Revalidate social facts under the social transaction lock. Maintain scoped ordering as visiting participants change.
**Tests must prove:** owner-specific research/loss/cargo, report privacy, same-time events, concurrent supply, retry/restart, both runtimes, and host abandonment protection.

### Task 3: Contracts and player flows
**Files:** modify `contracts/openapi.json`, application world projections, client dispatch/mission/catalog features; create Depot controls and selector tests.
**Signatures:** `WorldQueryKind::DepotSupplyQuote`, `WorldAction::SupplyHoldingFleet`, visiting-fleet projection in `BoundView4`.
**Behavior:** Expose hold quotes, own recall, visiting fleet composition/departure, and exact supply costs/budget/extension. Keep private cargo/research out of host projections.
**Tests must prove:** producer/consumer compatibility, restored attempts, disabled/stale actions, desktop/mobile journeys and inspected screenshots.

### Task 4: Activation and release validation
**Files:** create `rules/content/alliance-depot.json`, `docs/operations/alliance-depot.md`; extend standard rules and retained-world tests.
**Behavior:** Fresh worlds include feature; retained worlds explicitly upgrade after compatible runtime deployment. Preserve custom definitions and existing commitments.
**Tests must prove:** preview/no-op/conflict semantics, durable zero initialization, historical readers and complete routine checks. Record exact source digest, timing, failures and cleanup.

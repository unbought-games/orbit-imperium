# Orbit World Management Implementation Plan

**Goal:** Build creation, inspection, editing, and reusable scenarios into the normal `orbit` binary, and make a rich local development world automatic.

**Architecture:** `orbit world` is a thin CLI over shared application, engine, and PostgreSQL operations. Gameplay and world editing share rules, calculations, construction of records, persistence, and notifications; explicit edits bypass gameplay admission requirements such as payment and waiting. Local Make targets supply configuration and invoke these same capabilities.

**Tech Stack:** Existing Rust workspace, PostgreSQL/SQLx, serde JSON, Node.js local launcher, Make, Docker Compose, and Vite.

## Global Constraints

- CLI only; no world-editor UI or new HTTP administration API.
- Include world commands in the normal production binary; do not require `test-support`.
- Database access is the authority. Do not introduce an admin role system, approval workflow, or separate operator service.
- Never store derived state. Preserve authoritative paid-value lineage; derive scores, capacity, eligibility, and other computed values from their sources.
- No user-facing validate/ready command, status ceremony, or manual consistency repair. Successful operations produce a usable world; rejected changes leave the affected world unchanged.
- Reuse current standard rules for new default worlds; use a retained world's active rules for edits. Do not implicitly upgrade retained production rules.
- Retire the `dev-seed` public command and its Make target. Repurpose `make dev-reset` to use the new scenario workflow.
- Default local credentials are exactly `user/password`.
- Planets are selected only by `galaxy:system:position` within the selected universe, in both CLI commands and JSON. Planet names are display labels; body UUIDs remain internal.
- Players are selected by username within the selected universe. Every applicable edit supports any selected user, not just the default account.
- Catalog identifiers (resources, ships, defenses, buildings, research), command vocabulary, presets, and enumerated option values are case-insensitive in CLI and JSON. Preserve free-text names, message text, and credentials.
- Routine CI scope and native no-limit settings remain unchanged. Full-system and container validation remain explicit-only.
- Keep test commands in Make/npm; no custom scheduler, process registry, or resource manifest.
- This document is a proposed implementation contract, not a claim that these commands exist.

---

## User-facing contract

### Local lifecycle

After the documented toolchain prerequisites are installed, `make dev` prepares missing dependencies, starts isolated PostgreSQL, builds what is needed, creates the default playground only if absent, and runs the backend and hot-reloading frontend. Repeating it resumes the same world. Print local URL, database/universe identity, and default playground credentials.

`make dev-reset` replaces only this worktree's playground with the current default scenario and current standard rules. If the local stack is running it observes the new epoch; otherwise the command starts it. No UUID or password-file preparation is required. Do not automatically destroy or adopt existing shared databases from another checkout.

Worktree identity determines the disposable Compose project/database; ports are allocated and wired together automatically. The backend origin and Vite proxy use the actual selected frontend/backend addresses. Retain an explicit LAN host/origin option for phone testing. The foreground launcher owns its children and cleanup; no PID registry or global process killing.

### World command interface

Representative interface:

```sh
orbit world show
orbit world show --user alice
orbit world show 1:50:8
orbit world set resources 1:50:8 metal=1000000 crystal=500000
orbit world set ships 1:50:8 cruiser=100 --user alice
orbit world set defenses 1:50:8 rocketlauncher=50
orbit world set building 1:50:8 shipyard=12
orbit world set research user Astrophysics=15
orbit world add planet --owner user --name colony
orbit world add bot --near 1:50:8 --preset strong --name strong-neighbor
orbit world set player strong-neighbor --activity inactive
orbit world attack 1:50:8 --from 1:51:4 --arrives-in 30s
orbit world spy 1:50:8 --from 1:51:4 --arrives-in 15s
orbit world finish queues 1:50:8
orbit world clear queues 1:50:8
orbit world set ships --user bob --all-planets cruiser=100
orbit world scenario save hud-testing
orbit world scenario load hud-testing
orbit world scenario apply tweaks.json
```

Use coordinates as the sole planet selector and usernames as player selectors. Names displayed in the UI are not alternative planet selectors, and display names are not substitutes for usernames. Resolve usernames through the existing account identity semantics and universe membership; reject missing or ambiguous membership rather than guessing. `show` lists coordinates, planet labels, owners' usernames, catalog items, current amounts, queues, neighbors, and events. Every command has help and supports structured JSON output.

Player-level edits take a username directly (for example `set research alice astrophysics=15`). Planet edits take coordinates; optional `--user alice` asserts ownership. To edit every planet owned by a user, require explicit `--user alice --all-planets`; never choose an arbitrary planet from a username. Reports/messages take recipient usernames, and fleet operations use explicit source/destination coordinates with ownership derived from those planets. These rules apply to every account, including bots, and to JSON batches spanning multiple users.

Normalize catalog identifiers and controlled vocabulary through one shared resolver used by CLI and JSON. `Cruiser`, `cruiser`, and `CRUISER` identify the same ship. Serialize canonical spellings in output. Reject duplicate keys that normalize to the same identifier within one edit (such as `Cruiser` and `cruiser`) and unknown identifiers with a useful error. Do not lowercase arbitrary names, usernames, passwords, or prose; username matching follows existing identity rules.

`set` assigns absolute values, preserving unspecified items; separate `give` operations add amounts. Resource inputs are whole game units, converted with existing fixed-point arithmetic. Commands return the changed targets and values, including identifiers for generated work. Grouped edits in a scenario patch are atomic.

In a checkout, `./orbit world ...` is a thin launcher that builds the binary when necessary, supplies the worktree connection, and forwards arguments to that same binary. It contains no separate command parser or editing logic. The binary's world semantics remain identical elsewhere. Outside that local context, use `orbit world ...` with existing `DATABASE_URL` and an explicit `--universe` (or existing `ORBIT_UNIVERSE_ID`). A sole universe may be inferred; multiple universes require selection. Explicit connection settings take precedence. A failed connection never falls back to another database.

### Editing semantics

- Edit player/planet names, resources, building/research levels, ships, defenses, activity/vacation state, and bot behavior/participation; add players, planets, and bots.
- Select an individual target or explicitly all of a player's planets. Edit stationed inventory independently from ships already in flight.
- Resource/building/research/ship edits do not charge resources or wait for construction. They still enforce representable state and use the active rules for catalog content and associated records.
- Add planets through shared colony generation, with valid coordinates, fields, temperature, genesis, and occupancy records. Choose legal defaults automatically; explicit contradictory values fail with a specific explanation.
- Decreases that conflict with existing colonies or paid/in-flight work fail atomically and identify the conflict. Do not silently delete colonies, queues, or fleets to make an edit fit.
- Queue controls add, finish, and cancel selected work. Completion uses the normal completion logic; cancellation uses the normal cancellation/refund logic. Do not advance the entire universe clock or double-apply a previously scheduled completion.
- Attack/spy/transport controls create real mission records and scheduled events. Timing overrides are intentional operator inputs; travel, arrival, combat, return, and report processing subsequently use normal gameplay code. Missing source assets yield a useful error; optional recipe preparation grants them explicitly.
- Report/message controls use shared typed report and social persistence routines. Support reusable report examples for inspecting presentation, as well as generating reports through real missions. Never fabricate unrelated combat losses or loot when inserting a presentation example.
- Every change coordinates with the existing serial/scoped runtime, due work, claims, ordering, and fencing. A simple SQL row lock alone is insufficient. Publish normal revisions and cross-process update notifications after commit.

### Scenarios

Scenarios are versioned, human-editable JSON recipes containing players referenced by username, planets referenced by coordinates, desired source facts, references between entities, and events with relative timing. Planet names remain editable labels. The same typed edits power individual commands and recipes. New scenarios use current standard rules by default; recipes can carry explicit compatible rules/configuration when needed.

A user or agent can author a JSON batch from scratch and apply it with a single command, `orbit world scenario apply tweaks.json`. No prior export or setup ceremony is necessary. The full CLI editing vocabulary is available through the JSON schema, including multi-user changes and event triggers. Publish the schema and examples alongside the scenarios. For example:

```json
{
  "version": 1,
  "edits": [
    {
      "op": "set",
      "user": "alice",
      "planet": "1:50:8",
      "ships": { "cruiser": 100 },
      "buildings": { "SHIPYARD": 12 }
    },
    {
      "op": "set",
      "user": "bob",
      "research": { "Astrophysics": 15 }
    }
  ]
}
```

The first edit asserts that Alice owns `1:50:8`; the second edits Bob's player-wide research. Apply the entire batch atomically and leave other users and unspecified fields unchanged. Return errors with the failing edit index and field path.

- `scenario load NAME_OR_PATH` creates a world in an empty selected target. With an existing selected world, replacement requires the explicit `--replace` option; there is no interactive approval sequence. `make dev-reset` supplies replacement for its isolated playground automatically.
- `scenario apply PATH` changes only the described entities/fields in the existing world. It is the iterative editing operation and never resets unspecified state.
- `scenario save NAME_OR_PATH` exports the selected world's supported editable facts to a reusable recipe with username/coordinate references and relative remaining event times. It includes the entities needed by fleet/report references. It does not copy sessions, tokens, password hashes, runtime claims, or internal journal tables.
- Save is a recipe export, not a database backup or byte-for-byte historical clone. Preserve custom paid-value provenance where replaying the recipe requires it; do not recalculate historical values from today's costs. Unsupported live records produce a specific export error rather than silent omission.
- Credentials are explicit recipe inputs for newly created local accounts. Export never extracts credentials; existing account identities/credentials are preserved when applying patches. Fresh imports can supply a credential map. The shipped playground recipe explicitly provides `user/password` for its local account.
- Whole-world replacement rotates the epoch, clears replaced-world pending work, and preserves unrelated worlds and accounts. It cannot leave other universes with dangling memberships. Serving workers discover the replacement without a manual restart.
- Stable entity declarations are repeatable; repeating `set` has absolute semantics. Event triggers are intentional actions, not an automatic watch loop. Re-executing an event command triggers another event; retrying a single operation ID returns the original result.

### Rich default playground

Create `user/password`, eight named planets including `home`, and sixteen named nearby bots. Include developed production, storage, shipyards, labs, defenses, fleets, colony research, and plentiful resources. Choose levels and placements compatible with each planet's generated field capacity.

Neighbors span weak/strong, active/inactive, vacation, sleeping, and retired participation states, using real engine definitions rather than labels alone. Include debris, construction/research/manufacturing work, outbound and incoming fleets, unread espionage/combat/transport reports, messages, and alliance context. Relative timings let the user observe events after launch. The world remains playable; default threats must not immediately destroy the user's playground.

Recipes are checked into `scenarios/`; a developer can edit JSON or issue CLI edits and save a variant. Running progress does not rewrite its source recipe.

## File structure and implementation tasks

### Task 1: Shared editing model and engine primitives

**Files:**
- Create: `crates/application/src/world_edit.rs`, `crates/engine/src/world_edit/mod.rs`, `crates/engine/src/world_edit/assets.rs`, `crates/engine/src/world_edit/events.rs`, `crates/engine/src/world_edit/tests.rs`.
- Modify: `crates/application/src/lib.rs`, `crates/engine/src/lib.rs`, `crates/engine/src/valuation.rs`, `crates/engine/src/colonization.rs`, `crates/engine/src/manufacturing.rs`, `crates/engine/src/progression.rs`, `crates/engine/src/transition.rs`.

**Signatures:**
- Application owns serializable `WorldEditRequest { operation_id: uuid::Uuid, universe: UniverseId, edits: Vec<WorldEdit> }`, `WorldEdit`, `WorldSelector`, `WorldEditOutcome`, and `WorldEditError`.
- `WorldEdit` is the typed command vocabulary covering the user-facing editing semantics above; `WorldSelector` selects planets by coordinates or players by username, with explicit all-planets scope and optional ownership assertions. Internal resolution produces typed IDs without exposing alternative planet selectors. Outcomes contain applied identity, affected targets, changed source values, and generated event IDs. Errors distinguish ambiguous/missing usernames, missing planets, owner mismatches, incompatible content, impossible values, conflicting work, and storage failures.
- Engine owns `ResolvedWorldEdit` (typed IDs and engine values only) and `WorldEditEffects` (authoritative changes plus normal scheduled effects).
- `plan_world_edit(state: &GameState, edits: &[ResolvedWorldEdit], at: Timestamp) -> Result<WorldEditEffects, GameError>`.

**Behavior:**
- Extract shared record-construction/calculation primitives from existing gameplay paths where needed; do not copy formulas into CLI code.
- Preserve paid-value provenance for existing assets and create explicit lineage for grants. Derive scores through the existing mechanism.
- Keep engine functions pure with controlled time/randomness, and preserve the runtime's ordinary completion and event behavior.
- Share case-insensitive catalog/vocabulary normalization between CLI and JSON; preserve the game's canonical engine types and free-text values.

**Tests must prove:**
- Grants/decreases, level changes, and colony creation preserve valuation, occupancy, fields, catalogs, and source-fact invariants.
- Invalid requests and incompatible pending work cannot produce partial effects.
- Mission timing overrides and queue completion/cancellation produce one normal downstream outcome, including refunds and reports.
- CLI and JSON accept mixed-case identifiers identically; normalized duplicates fail instead of silently overriding values.

### Task 2: Atomic database edits integrated with runtime

**Files:**
- Create: `crates/storage-postgres/src/world_edit/mod.rs`, `crates/storage-postgres/src/world_edit/resolve.rs`, `crates/storage-postgres/src/world_edit/apply.rs`, `crates/storage-postgres/src/world_edit/inspect.rs`, `crates/storage-postgres/tests/world_edit.rs`.
- Modify: `crates/storage-postgres/src/lib.rs`, `crates/storage-postgres/src/runtime_barriers.rs`, `crates/storage-postgres/src/ordering.rs`, `crates/storage-postgres/src/scoped_ordering.rs`, `crates/storage-postgres/src/commit.rs`, `crates/storage-postgres/src/enrollment.rs`, `crates/storage-postgres/src/updates.rs`, `crates/storage-postgres/src/update_signals.rs`, `crates/storage-postgres/Cargo.toml`.
- Create: next sequential SQL migration for edit receipts and ordered boundary support; never edit applied migrations.

**Signatures:**
- `PgStore::edit_world(&self, request: WorldEditRequest) -> Result<WorldEditOutcome, WorldEditError>`.
- Application defines serializable `WorldInspection` (current editable source facts and resolvable targets).
- `PgStore::inspect_world(&self, universe: UniverseId, target: Option<WorldSelector>) -> Result<WorldInspection, WorldEditError>`.

**Behavior:**
- Resolve targets and apply all effects against a consistent snapshot under the existing runtime's ordering boundary, in both serial and scoped modes. Preserve due-work ordering and fence stale calculations.
- Record operation IDs/results so transport retries do not duplicate grants/events; reject reuse of an operation ID with different contents.
- Reuse enrollment, social, asset persistence, and update publication. Support direct invocation with or without a serving process; do not depend on a private HTTP endpoint.
- Keep change receipts separate from derived game state. No new operator identity/permission framework.

**Tests must prove:**
- Concurrent CLI edits, gameplay commits, due events, and worker claims cannot overwrite one another or double-complete work.
- Atomic rollback, retry identity, and notification delivery work across separate database connections/process-local hubs.
- Target selection cannot cross universe boundaries accidentally; username membership and coordinate ownership assertions are enforced. Explicit all-planets edits target only the selected user's planets.

### Task 3: Scenario create, patch, replace, and export

**Files:**
- Create: `crates/application/src/world_scenario.rs`, `crates/storage-postgres/src/world_edit/scenario.rs`, `crates/storage-postgres/tests/world_scenarios.rs`, `scenarios/playground.json`, `scenarios/schema.json`, `scenarios/README.md`.
- Modify: `crates/application/src/lib.rs`, `crates/storage-postgres/src/universe_config/setup.rs`, `crates/storage-postgres/src/startup.rs`, `crates/server/src/runtime.rs`, `crates/server/src/universe_serving.rs`.

**Signatures:**
- `WorldScenario` is the versioned serializable recipe described above, with explicit entity identities, source facts/provenance, configuration, optional account-creation inputs, and relative event timing.
- `ScenarioMode { Create, Patch, Replace }`.
- `PgStore::apply_world_scenario(&self, universe: UniverseId, scenario: &WorldScenario, mode: ScenarioMode, operation_id: uuid::Uuid) -> Result<WorldEditOutcome, WorldEditError>`.
- `PgStore::export_world_scenario(&self, universe: UniverseId) -> Result<WorldScenario, WorldEditError>`.

**Behavior:**
- Build scenarios through the same edit operations, including real account creation and bot enrollment, with shared active/standard rule selection.
- Preserve unchanged entities on patch; replace only the selected universe and invalidate prior epoch work atomically.
- Export portable recipes with username/coordinate references and without authentication material; preserve source provenance needed to reconstruct supported state and use relative event times.
- Check in the rich default as ordinary editable data, not a second hardcoded Rust world.

**Tests must prove:**
- Default has eight usable planets, sixteen varied neighbors, valid current rules, working `user/password`, representative activity, and readable game projections.
- Save/load reconstructs supported source facts and relative event behavior without credentials leakage or changing preserved paid values.
- Patch preserves unspecified state, replacement preserves other worlds/accounts, and running workers discover new epochs.
- Invalid recipes leave existing worlds intact; export names unsupported records instead of dropping them.
- A handwritten mixed-case JSON batch can change multiple users in one command; a failure in any edit rolls back the whole batch and reports its field path. Published schema/examples match the actual parser and cover every CLI edit operation.

### Task 4: Production CLI and retirement of legacy dev entry points

**Files:**
- Create: `crates/server/src/world_cli/mod.rs`, `crates/server/src/world_cli/parse.rs`, `crates/server/src/world_cli/output.rs`, `crates/server/src/world_cli/tests.rs`.
- Modify: `crates/server/src/main.rs`, `crates/server/src/lab_support.rs`, `crates/storage-postgres/src/seed.rs`, `scripts/e2e.mjs`, `scripts/recovery.mjs`, `scripts/migrations-e2e.mjs`, `docs/operations/signup.md`, `docs/operations/mvp-v1-local-setup.md`, `docs/runbooks/development-server.md`.

**Signatures:**
- CLI owns `WorldCliCommand`, which carries inspection, editing, and scenario requests plus output options.
- `world_cli::parse(args: &[String]) -> Result<WorldCliCommand, String>`.
- `world_cli::run(store: &PgStore, command: WorldCliCommand) -> Result<(), String>`.

**Behavior:**
- Implement the full command vocabulary with help before opening a database, coordinate planet selectors, username player selectors, case-insensitive catalog inputs, readable errors, and JSON output.
- Use ordinary `DATABASE_URL`/universe configuration in production, with no `test-support` gate or new authentication service.
- Remove public `dev-seed` and old `orbit dev-reset` entry points. Keep necessary historical foundation fixtures internal to test support; update current test invocations to the test harness rather than exposing the old seed workflow. Preserve calls to old commands only when deliberately testing a pinned historical binary.
- Keep existing universe/rules/bots operator commands compatible and share their implementations rather than duplicating them.

**Tests must prove:**
- Normal production builds expose world commands; old dev commands are retired.
- Parse failures perform no database mutations; amounts, relative times, selectors, and replacement semantics are unambiguous.
- Legacy regression coverage retains its original meaning without becoming the default dev world.

### Task 5: One-command local development and documentation

**Files:**
- Modify: `Makefile`, `scripts/local.mjs`, `scripts/local.test.mjs`, `compose.yaml`, `apps/web/vite.config.ts`, `package.json`, `README.md`, `docs/development.md`, `docs/runbooks/development-server.md`.
- Create: `orbit` (thin executable launcher), `scripts/local-world.mjs`, `scripts/local-world.test.mjs`, `docs/operations/world-management.md`.

**Signatures:**
- `resolveLocalWorld(root: string, env: Record<string, string | undefined>): LocalWorldConfig`, where `LocalWorldConfig` carries worktree identity, Compose project/database selection, and explicit connection overrides.
- `runLocalWorld(action: 'start' | 'reset', config: LocalWorldConfig): Promise<void>`.

**Behavior:**
- Make owns build/dependency preparation; the launcher coordinates PostgreSQL, `orbit world`, backend, and Vite without implementing game mutations.
- Scope database/volume identity to the worktree, allocate usable ports, and pass actual proxy/origin settings. Explicit production connection settings never become a target for implicit local reset.
- Resume retained data by default, create only when missing, and reset through explicit scenario replacement. Never hide migration/content errors by wiping a database.
- Supply local binary discovery and connection defaults through `./orbit world ...` so editing does not require typing database URLs or UUIDs. Document this local invocation alongside the production `orbit world` interface.
- Document scenarios and handwritten JSON batches, coordinate planet targets, username player targets, case-insensitive identifiers, live edits, production selection, lifecycle, and removal of `dev-seed`; remove obsolete password-file setup instructions.

**Tests must prove:**
- Repeated starts preserve progress; reset restores current default rules/content only in the intended playground.
- Two worktrees do not share a world or conflict on ports; origin/proxy settings match allocated addresses and LAN overrides.
- Child failure/exit cleans up owned processes without touching another checkout. Connection failure cannot select an unrelated database.

## Delivery and evidence

Implement in the task order above; each task supplies a testable portion of the same feature. Run relevant engine/application tests, tooling tests, and isolated PostgreSQL suites through existing Make/npm entry points. Explicitly exercise fresh local startup, retained restart, live edits, scenario save/apply/load, reset, and two simultaneous worktrees. Report tested revision, actual failures, timings, and cleanup. There are no visual UI changes; screenshot requirements are not applicable.

The user-facing completion criterion is simple: start the game, sign in as `user/password`, change it with `orbit world`, and continue playing without SQL, bookkeeping repairs, or a separate validation step.

# Engineering principles

## Server authority

Browser input becomes named commands. The application validates identity and permissions; the engine validates game rules and computes transitions. Rendering consumes a player-visible projection and cannot change authoritative gameplay.

Keep authoritative facts serializable and durable: identities, resources, pending operations, committed terms, timestamps, and rule versions. Do not hide gameplay state in process globals, browser components, timers, or closures. Derive availability, totals, countdowns, and other computed values from their source facts.

## Deterministic transitions

Pass logical time and versioned rules explicitly into the engine. Resolve scheduled work at its logical deadline, using a stable ordering rule when inputs share a timestamp. Use checked arithmetic with named units and explicit rounding.

Gameplay randomness must be deterministic from the supplied state, with enough versioned generator state to reproduce outcomes. Keep gameplay seeds private. Authentication tokens use secure infrastructure randomness independently of gameplay.

## Boundaries and persistence

Keep the engine free of database, network, filesystem, environment, and implicit clock access. Application services own use cases and ports; adapters own transport and storage effects. The server wires these components together. See [engineering conventions](engineering-conventions.md) for dependency rules.

A transition commits its state changes, consumed and created events, command receipt, and player-visible results atomically. Stable command identities make retries safe after lost acknowledgments. Publish only committed state and preserve authorization boundaries in every projection.

Use stable entity identifiers and explicit lifecycle operations. Coordinates and collection order do not establish identity. Pending work and references must remain valid across deletion, replacement, restart, and recovery.

## Configuration and verification

Keep rule values in validated, versioned artifacts. Existing operations retain their committed terms when content changes. Universe speed changes use an ordered activation that preserves paid terms; see [universe speed](architecture/server-speed.md) and [configuration operations](operations/universe-configuration.md).

Test arithmetic boundaries, valid and rejected transitions, conservation, deterministic replay, authorization, concurrent spending, duplicate commands, and recovery. Use the cheapest test layer that proves the behavior. Follow the [project test policy](development.md#testing) and repository instructions for routine versus explicitly requested validation. Report observed results and remaining limitations accurately.

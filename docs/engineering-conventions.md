# Engineering conventions

These conventions apply the [engineering principles](engineering-principles.md) to implementation and review. Keep changes focused on their agreed requirements.

## Dependency direction

The Rust workspace is `engine <- application <- adapters`, with `server` wiring concrete adapters. The engine contains pure domain logic, application owns use cases and ports, `storage-postgres` owns SQL, `transport-http` owns HTTP, and `server` owns process startup/configuration. The frontend depends on public API contracts alone.

Engine public types contain plain data. No SQLx, Axum, Tokio handles, clocks, filesystem/network access, environment reads, runtime callbacks or ambient randomness enter engine code. Pure serialization, exact arithmetic and hashing libraries are permitted. Application public ports expose typed data and async results, not database connections or HTTP wrappers. The HTTP adapter cannot call engine transitions directly. Frontend components call the client model, which calls an injected transport port; fetch calls stay in adapters.

Enforce these boundaries with a Cargo metadata dependency check, source checks for forbidden engine APIs, and TypeScript import restrictions. Treat a new shared module as a responsibility decision: no miscellaneous `utils` dumping ground and no shared transport/storage structs that leak inward.

## State and rule ownership

- Use stable typed IDs, explicit body kinds and flat keyed collections. Coordinates are not IDs. A new body at old coordinates must not inherit old references.
- Create/remove entities through named domain operations. Keep state machines explicit and exhaustive; unknown operation variants fail validation.
- Store authoritative facts, paid/committed operation terms and restorable checkpoints. Derive totals, availability, countdowns, utilization and UI flags. Disposable projections must be rebuildable.
- Keep tunable numbers and catalog data in a validated versioned rules artifact. Hash canonical content; never reuse an identifier for changed rules.
- Give each formula one engine implementation, named units and rounding policy. The UI may format or estimate explicitly permitted data; it cannot reproduce authoritative spending or legality logic.
- Fixtures record the intended rule and expected result. Make assumptions explicit and verify them against the implemented contract.

## Time, arithmetic and randomness

Pass logical time into pure functions. Store due times durably and resolve late work at its original timestamp. Use the specified order key for ties, never collection iteration or thread scheduling. Engine tests use injected timestamps; normal unit/integration tests do not sleep for game progress.

Use checked integers/rationals and the specification's precision. Never cast authoritative balances through floating point, silently saturate an overflow, or truncate carry on a read. Browser quantities travel as decimal strings and use exact parsing.

Gameplay randomness uses an explicit versioned generator with restorable stream state and replay fixtures; a secret seed alone is insufficient. Authentication/security randomness belongs to the infrastructure layer and must not use the gameplay generator.

## Atomicity, retries and failures

One domain transition commits state changes, consumed/created events, receipt, journal and visible reports/revisions together. Validate the current fence at commit. Publish only committed state. Roll back the complete tentative transition on conflict; do not patch an old computed result with fresh inventory values.

Every player mutation has one command identity that survives retries. Canonical intent hash prevents reusing an ID for another action. A timeout is an uncertain outcome; resolve the receipt before creating another command. Logs distinguish malformed requests, ordinary game rejection, retryable infrastructure failures and invariant violations. Invariant violations stop that universe for investigation.

No generic event bus may mutate gameplay. Durable scheduled events drive named transitions; transient feedback is presentation only. Add an outbox only when a real delivery side effect requires it.

## Public contracts and security

Keep `contracts/openapi.json` as the public schema source, with generated TypeScript DTOs and response validation in the HTTP adapter. Do not hand-maintain competing API types in feature components. Contract tests compare actual responses with schema and exercise unknown/invalid inputs. Major incompatible wire changes change protocol version; disposable development data does not justify silently misreading an old client.

Authenticate and authorize at the application boundary and validate domain ownership inside rules. Scope reads/receipts by principal, universe and epoch; filter hidden information before serialization. No global game sequence, secret RNG material, opponent stockpile, session token or credential hash appears in player DTOs or logs. Validate CSRF/Origin, escape player text, parameterize SQL and rate-limit expensive unauthenticated work.

Use Argon2id with a unique random salt and initial parameters `m=19456 KiB, t=2, p=1`, encoded with the hash for later upgrades. These meet OWASP's published minimum profile; measure login resource usage before changing them. Session expiry, revocation, and CSRF behavior are covered by authentication tests and the [operations guide](operations/unbought-accounts.md). [Password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Code organization and reproducibility

Use focused domain modules (`economy`, `construction`, `fleets`) rather than one central handler containing all rules. A feature addition includes its state transitions, rule data, public projection and tests. Avoid speculative schemas for all future content; preserve stable boundaries and add the actual records when needed.

Use Rust formatting and Clippy, TypeScript strict mode and ESLint. No unexplained warning suppression, unchecked arithmetic, production `todo!()`/`unimplemented!()`, or `any` at domain boundaries. Errors carry stable typed codes; user-facing explanations stay separate from private diagnostics.

Use the Rust, Node, and npm versions pinned in repository tooling files and container builds; update them together when upgrading. Node 24 is an LTS line. Pin compatible dependency versions through lockfiles and a tested PostgreSQL 16 image digest; upgrades are deliberate reviewed changes. [Node release policy](https://nodejs.org/en/about/previous-releases)

No source, rules, fixtures, or credentials may depend on an agent's private directories. Record local commands in the game README. Keep the public website and unrelated umbrella files untouched. Inspect the game's existing Git branch/remotes before repository operations; do not reinitialize it or assume CI integration exists.

## Test and review gates

Use seeded test credentials and ordinary application flows for authentication tests. Keep credentials private and use isolated test worlds for destructive scenarios.

1. Engine examples and boundary tests prove each enabled rule. Property tests cover conservation, split-versus-combined accrual and deterministic replay, with bounded reproducible generators.
2. Application tests use an in-memory port implementation to exercise control flow; PostgreSQL tests prove real locking, atomicity, constraints and races. Mocks do not establish database correctness.
3. Client-model tests use fake ports and time. Browser tests exercise real APIs/DB for the critical two-account flow and uncertainty/reconnect behavior. Review keyboard access, labels, focus and privacy in network payloads.
4. Crash tests interrupt before/after commit and during claimed work; recovery must match uninterrupted outcomes. Failure hooks are test-only and unavailable from hosted HTTP routes.
5. Each rule/change names the acceptance scenario it satisfies. Fix source/contract inconsistencies before expanding scope. A milestone report includes observed checks and unresolved limits, not a blanket passing claim.

Keep iteration cycles short. Acceptance tests target high-risk failures: authorization/privacy leaks, stale quotes, duplicate payment or output, concurrency, lost acknowledgements, crash atomicity, and state isolation. Prepare the minimum valid state in a disposable database; do not replay mine levels, resource accumulation, or research trees as test setup. Rules, formulas, prerequisites, and bootstrap defaults belong in focused engine/application/storage tests. Fixture writes must stay in test harnesses, preserve engine invariants, and never add production grant APIs.

Run relevant routine checks for each change. Full-system and container acceptance remain explicitly requested; follow the [project test policy](development.md#testing) and Makefile targets. Keep stateful scenarios sequential inside each suite and give suites distinct database, port, and browser-output namespaces. Retain real HTTP/PostgreSQL and before/after-commit recovery checks. Record suite timings when changing test infrastructure. No arbitrary coverage percentage substitutes for the risk matrix. Keep performance claims separate from correctness evidence and measure capacity on the intended deployment.

## Development operations

Ordinary startup validates schema/rules and never erases data. Reset is an explicit operator command limited to a development-marked universe and requires its exact ID; no wildcard reset. Keep credentials out of command history by supporting secret files/stdin or generated values. Test fixtures use isolated databases.

Downtime and breaking development changes are allowed. Same-version persistence remains required. Hosted deployment follows the [deployment requirements](architecture/deployment.md); keep the scheduler awake while running and use explicit stop/start. No automatic production provisioning, live migration framework, or paid external service is needed merely to write or test the engine.

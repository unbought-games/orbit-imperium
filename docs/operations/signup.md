# Production signup setup

Create a production universe explicitly before starting the server. Players then choose an account name and password in the browser, receive one starter planet and enter the game immediately. No accounts file, seed file, email service, verification or manual enrollment is needed.

Follow [universe configuration operations](universe-configuration.md) for exact fresh-install commands, live policy edits, API routing and the required two-artifact bridge upgrade of retained worlds. A new universe defaults to 5× speed and 1×100×15 topology; historical worlds keep their saved values. `serve` prepares compatible schema migrations and validates existing worlds without creating or resetting them.

Set `ORBIT_ORIGIN` to the browser-facing origin. HTTPS origins always use Secure cookies, including behind a TLS-terminating proxy. To host over HTTP, explicitly set `ORBIT_ALLOW_INSECURE_HTTP=1` (the local wrapper does this). See [HTTP/HTTPS configuration and migration](../architecture/deployment.md#browser-origin-http-and-https) for valid origins, the retired flag and production implications.

## Configuration

Use `universe create` for speed and topology. Use `universe config export`, `diff` and `apply` for signup availability, optional player ceiling, signup rate and gameplay command rate. These policies are database-owned and update across serving instances without restart. Speed/topology remain immutable. The final release rejects the old universe environment variables; remove them before starting it. `ORBIT_UNIVERSE_ID` binds an API to an existing signup universe and is required when several exist. Workers discover all worlds at startup and must restart after creation before signup traffic is routed to a new world.

Signup defaults to enabled, geometric capacity, and five attempts per minute per source IP and normalized account name per API process; the process aggregate ceiling is ten times that value. Gameplay admission defaults to 60 per minute. The service-level `ORBIT_LOGIN_PER_MINUTE` (default 30) and `ORBIT_TRUSTED_FLY_PROXIES` remain environment inputs. Rate counters are process-local; uniqueness, planet placement and capacity are transactional in PostgreSQL.

No universe dimensions pre-create planets. Geometric homeworld capacity is `galaxies × systems_per_galaxy × 9`. An additional ceiling may be lower, and lowering it never removes players. These validation bounds do not claim support for 900,000 active players. Resizing remains unsupported.

### Starting-planet placement

New universes use versioned policy `oi-homeworld-balanced-v2`. Systems are ordered by galaxy, then system. The admission region is the smallest prefix containing the existing homeworlds with enough free positions in 4–12 to place the newcomer and still leave one free eligible expansion slot per homeworld. This is a space budget, not a reservation: ordinary planets can occupy those slots. Counts, actual occupancy, and region width are derived on each admission; no mutable population counters or placement cursor are stored.

Within that region, pick uniformly among eligible systems with the fewest homeworlds; then pick uniformly from the selected system's free positions in 4–12. Positions retain their existing temperature law, 163 fields, and 12,800 km diameter. Bots and humans follow the same path.

In a fresh universe with no other occupancy, the region uses `ceil(2 × player_count / 9)` systems, capped by the map size: two players use one system, five use two, ten use three, and 100 use 23. At 100 players there are 107 eligible slots free in the populated region, versus eight under the old nine-homeworlds-per-system policy. Interior systems normally have four or five homeworlds; the newest system may have fewer while filling. A new galaxy opens when the required region crosses the configured galaxy boundary. With ten systems per galaxy, the first 45 players remain in galaxy 1 and the 46th opens galaxy 2.

If the entire map cannot meet the expansion budget, admit into its remaining eligible slots and balance density across them. The budget must never cause a false `UniverseFull`. The 1:1 ratio is the explicit gameplay choice (space for a first colony), not a claim that a parameter-free optimal density exists. There is no fixed starting window, expansion step, or homeworlds-per-system threshold.

Existing legacy worlds retain their original placement policy. Current placement regressions live in `crates/engine/tests/universe.rs`. To emit actual allocations, run `cargo run -p orbit-engine --example placement_simulation -- 1 100 100 7`.
Allocation reads current planet occupancy under the universe transaction gate. The engine accepts additional unavailable slots for future tombstone integration; the current game has no colony-abandonment/tombstone storage. Edge positions 1–3 and 13–15 do not count toward homeworld capacity. Slot exhaustion or the configured account ceiling rejects admission atomically.

Randomness uses the existing private `homeworld` stream with a versioned per-admission input identifier. Saved coordinates are creation facts; restart validation checks those facts against the world rather than reallocating against current occupancy. Legacy worlds retain their original generator and replay validation.

## Signup behavior

The login screen offers **Create an account** while signup is enabled. Only account name and password are required. Names are trimmed and lowercased, must be nonempty, at most 80 UTF-8 bytes, and contain no control characters. Passwords are nonempty and at most 1024 bytes. Passwords are hashed; session cookies use the existing secure authentication flow.

Each new player receives 1,000 metal, 1,000 crystal, zero deuterium, a 163-field homeworld, zero building/research levels, and no ships or queued jobs. Existing players retain their current balances. Production starts at enrollment, not when the universe was created. Enrollment commits the account, planet, game records and session together. Duplicate names, full capacity and database failures create nothing. If the game is briefly processing earlier work, signup returns a retryable unavailable response. If a response is lost after account creation, the player can sign in with the chosen credentials.

No email verification or password recovery ships in this MVP. This explicitly supersedes the broader account-policy spec for MVP admission.

The old `mvp-*-bootstrap` and `dev-seed` commands are available only in builds with the `orbit-server/test-support` feature, for historical regression fixtures. Production builds never read five-account credential files.

## Verification

`make test-signup` starts a production binary against a disposable database and verifies explicit CLI setup, concurrent startup, live signup closure, mobile browser signup, construction, logout/login, duplicate/full/closed admission, restart and retained identities. `make test-container` verifies the same explicit-setup/signup path in the production image and checks that a gameplay command survives restart.

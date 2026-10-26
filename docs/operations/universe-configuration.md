# Universe configuration operations

Universes own their saved configuration in PostgreSQL. New production worlds default to **5× speed**, topology **1 galaxy × 100 systems × 15 positions**, open signup, no additional player ceiling, five signup attempts per minute and 60 gameplay commands per minute. Existing worlds keep their saved speed, identity, rules hashes, secrets and paid work.

Speed is one integer from 1 through 100; change it with the ordered [rules activation workflow](rules-updates.md#changing-universe-speed). Galaxies (1–100), systems per galaxy (1–1000) and positions per system (exactly 15) are creation-only. Signup availability, optional player ceiling, signup attempts and command admission limits support live policy edits. Capacity is derived as `galaxies × systems × 9`; only the optional ceiling is stored. Lowering the ceiling below the existing population prevents further admission without removing players.

## Universe names and browser addresses

Every universe receives an unused real-galaxy name automatically, including development worlds and retained worlds during migration. The pool starts with familiar names such as Andromeda, Triangulum and Whirlpool, followed by 500 NGC galaxy identifiers. The catalog uses Type G entries from [OpenNGC](https://github.com/mattiaverga/OpenNGC/blob/master/database_files/NGC.csv) (OpenNGC contributors, CC BY-SA 4.0). Selection and uniqueness are enforced transactionally in PostgreSQL. If all 512 names are occupied, creation fails; expand the pool with a migration before provisioning more worlds. The pool contains no numeric suffixes invented to resolve collisions.

Operators can update the name at any time:

```sh
orbit universe update --universe "$ORBIT_UNIVERSE_ID" --name "My Universe"
orbit universe show --universe "$ORBIT_UNIVERSE_ID"
```

Names may be arbitrary text with 1–80 characters, without surrounding spaces or control characters. Name and URL collisions are rejected, including ASCII case differences and space/hyphen equivalents. Updates preserve UUIDs, memberships, gameplay, rules, and policy revisions. Policy changes continue to use the revision-checked config export/diff/apply workflow.

Browser URLs use the name: `Andromeda` becomes `/u/andromeda/...` and `My Universe` becomes `/u/my-universe/...`. Other characters use `~hex~` escapes so punctuation, Unicode and slashes remain one unambiguous path segment. This URL form is derived, never stored separately. API requests and operator selection continue to use UUIDs.

Renaming is allowed after players join. On the next page load or session refresh, the new name appears throughout the UI. Previous name-based links and old UUID-based browser links are unavailable; there are **no redirects or saved aliases**. Share the new address after a rename. Deploy the matching frontend and backend together because session membership metadata now includes the name.

## Fresh installation

Provision the database and supply `DATABASE_URL` privately. Build the frontend and the final binary:

```sh
npm ci
npm run build
make build-universe-final
export ORBIT_ASSETS=apps/web/dist
export ORBIT_BIND=127.0.0.1:8080
export ORBIT_ORIGIN=http://localhost:8080
export ORBIT_ALLOW_INSECURE_HTTP=1 # explicit opt-in for this HTTP origin
target/universe-final/release/orbit setup --name "Friends" --speed 3
target/universe-final/release/orbit serve
```

### Repeatable setup

`orbit setup` requires only `DATABASE_URL`: provision the PostgreSQL database and
credentials first. Configure the browser-facing origin and other runtime settings
for `serve` as described in the [signup guide](signup.md). Setup does not start a
server, configure HTTPS, write environment files or create player accounts.

Without options, setup creates a universe with the defaults above, an automatic
galaxy name, and all standard content bundled in the installed binary. `--name` and
`--speed` customize it. It also accepts the topology and
policy options shown below. Run `orbit setup --help` without a database connection
to see every option. The command always prints JSON to stdout with `status`
(`created` or `already_initialized`), `universe`, `name`, and `configuration`;
diagnostics and the worker-restart reminder go to stderr.

On an empty database, setup applies migrations and atomically creates the world,
its name and policy. Concurrent setup calls serialize; a failed creation rolls
back and can be retried. Repeating setup without a UUID reuses the sole existing
universe, including after a lost response. Omitted options preserve saved values;
explicit options must match them. Conflicts fail without resetting player progress
or changing universe settings. Compatible schema migrations may already have run.
Live policy or name edits remain the responsibility of the explicit update commands.
To activate new standard content in an existing world after deploying a new image,
use `orbit rules upgrade`; see the [standard upgrade workflow](rules-updates.md#standard-release-upgrades).

Optionally select an installation-specific UUID with `--universe UUID` or
`ORBIT_UNIVERSE_ID`. When both are supplied they must agree. Multiple existing
universes require an explicit UUID; a missing UUID in a nonempty database fails
instead of creating an extra world. Use `universe create` for additional worlds.
Legacy worlds without a saved policy require the bridge upgrade below; setup does
not infer or import their configuration and is unavailable in bridge builds.

The lower-level `db-init` and `universe create` commands remain available. Unlike
setup, repeating `universe create` with the same UUID conflicts; omitting its UUID
creates a new world each time. `universe list` and `universe show --universe UUID`
expose safe JSON configuration summaries, including rules hashes/revisions and the
derived effective ceiling.

To select other creation settings, for example:

```sh
target/universe-final/release/orbit universe create \
  --universe 00000000-0000-4000-8000-000000000002 \
  --speed 10 --galaxies 2 --systems-per-galaxy 100 \
  --positions-per-system 15 --signup-enabled false --max-players 100 \
  --signup-per-minute 5 --commands-per-minute 60
```

After creating a world while processes are running, restart **every worker**, including combined processes, before routing signup traffic to it. Workers discover worlds only at startup. Readiness does not prove that every newly created world has a worker. API and combined roles bind signup with `ORBIT_UNIVERSE_ID`; with exactly one world they can infer it. With multiple worlds the binding is required and must name an existing world. A binding never creates a world or restricts other authorized game routes. Worker-only roles process all supported worlds and need no signup binding.

For local development, `make dev-setup` starts PostgreSQL, builds the server and runs repeatable setup. Optionally pass `UNIVERSE=UUID`. Then use `make dev` for ordinary starts/restarts. The default localhost database configuration is in [development guide](../development.md#running-locally).

## Live policy edits

Export the complete document, edit only `policy`, review the diff and apply:

```sh
target/universe-final/release/orbit universe config export --universe "$ORBIT_UNIVERSE_ID" --out universe.json
# Example: close signup without restarting any process.
node --input-type=module -e 'import fs from "node:fs"; const p="universe.json"; const d=JSON.parse(fs.readFileSync(p)); d.policy.signup_enabled=false; fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n")'
target/universe-final/release/orbit universe config diff --universe "$ORBIT_UNIVERSE_ID" --file universe.json
target/universe-final/release/orbit universe config apply --universe "$ORBIT_UNIVERSE_ID" --file universe.json
```

The version-1 document includes `universe`, `base_revision`, speed/topology context that is read-only to policy edits and all four policy fields: `signup_enabled`, `max_players`, `signup_per_minute`, `commands_per_minute`. Use `null` for `max_players` to restore geometric capacity. Its numeric ceiling must be 1 through geometric capacity; both rate limits must be integers 1–10000. Missing fields are errors, not resets. Changing this context or using another universe's file is rejected. After a speed activation, re-export policy documents so their speed context matches the current rules. The version-1 `immutable` field name is retained for compatibility; speed changes belong to rules activation.

A successful effective change advances revision once and records an audit entry. An unchanged retry returns `already_active`, even with an older base revision. A changed stale document conflicts: export again, reconcile the desired policy and review a fresh diff. Do not automatically retry a stale edit. Policy edits preserve gameplay hashes, queues and paid terms.

Registration metadata and new attempts read the current policy. Enrollment rechecks availability/capacity transactionally after hashing; a request that locked the previous policy may finish before closure commits. After closure commits, enrollment cannot commit under the old policy. Signup counters stay local to each API process and are preserved through rate changes. The aggregate signup budget remains ten times the per-source/account limit. Command admission uses each universe's current policy and preserves duplicate receipt recovery. Login remains available when signup is closed.

## Beginner protection multiplier

Beginner protection defaults to **5×** for both new and existing universes. Each universe can change its multiplier through the [gameplay rules workflow](rules-updates.md), which orders the change with gameplay. Deploy supporting binaries everywhere before applying a non-default multiplier.

```sh
orbit rules export --universe "$ORBIT_UNIVERSE_ID" --out rules.json
node --input-type=module -e 'import fs from "node:fs"; const p="rules.json"; const d=JSON.parse(fs.readFileSync(p)); d.artifact.world.beginner_protection_multiplier=10; fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n")'
orbit rules diff --universe "$ORBIT_UNIVERSE_ID" --file rules.json
orbit rules apply --universe "$ORBIT_UNIVERSE_ID" --file rules.json
```

`artifact.world.beginner_protection_multiplier` accepts positive integers from 1 through 4294967295. At 10, protection blocks attacks and espionage in either direction when the stronger player's completed-asset value is **strictly greater than 10 times** the weaker player's value. Equality is allowed. The existing exemptions remain: the weaker player must have fewer than 5,000 points and must not be inactive for seven days. Transport is unaffected.

Export a fresh document to change the value again. Set it to `5` or remove the field to restore the default. Default-valued exports omit the field to preserve historical rules hashes. Leave the existing `artifact.world.protection` identifier unchanged. Galaxy eligibility, mission quotes and launch validation use the active multiplier; paid flights retain their committed terms. Other universes keep their own settings.

## Two-artifact upgrade of retained production worlds

A pre-bridge binary can bypass database policy and reject configurable production speeds. Never activate policy or create configurable worlds while any such binary remains connected. This includes API, worker, combined and operator binaries. Verify the deployment inventory externally; the acknowledgement flag does not verify it for you.

Build and retain two distinct artifacts from this implementation:

```sh
make build-universe-bridge build-universe-final
# Bridge: target/universe-bridge/release/orbit
# Final:  target/universe-final/release/orbit
# Container equivalents, retained under distinct tags:
docker build --build-arg ORBIT_CARGO_FEATURES=universe-config-bridge -t orbit-imperium:config-bridge .
docker build -t orbit-imperium:config-final .
```

1. Back up the retained database and record the deployed binaries/settings. Apply the additive schema using `target/universe-bridge/release/orbit db-init`. It adds policy/audit tables without guessing policy, rewriting rules or changing saved worlds.
2. Roll **every** process and operator tool to the bridge artifact, retaining the actual legacy deployment environment until import. For a local process, the replacement command is `target/universe-bridge/release/orbit serve` with its existing `DATABASE_URL`, role, binding, process limits and legacy policy settings. Use the host's rolling process replacement procedure and confirm the entire inventory is bridge-aware before proceeding. An unactivated world retains the bridge's legacy behavior. An activated world uses database policy exclusively; old variables are ignored for it with a deprecation diagnostic.
3. For each universe, import under the actual intended deployment policy environment. The four assignments below are an example; substitute the deployment's reviewed values, or leave an input absent deliberately to select its documented old default:

   ```sh
   export ORBIT_UNIVERSE_ID=00000000-0000-4000-8000-000000000001
   ORBIT_SIGNUP_ENABLED=true ORBIT_MAX_PLAYERS=45 \
   ORBIT_SIGNUP_PER_MINUTE=5 ORBIT_COMMANDS_PER_MINUTE=60 \
   target/universe-bridge/release/orbit universe config import-env \
     --universe "$ORBIT_UNIVERSE_ID" --out policy.json
   cat policy.json
   ```

   Import is read-only. Its JSON output records each field's environment/default provenance. Defaults are true, null ceiling, 5 and 60; absent historical deployment values cannot be recovered from SQL. Resolve disagreements between replicas explicitly. Import copies saved speed and topology and never applies `ORBIT_SPEED` or topology overrides.
4. After reviewing the document and inventory, activate that universe:

   ```sh
   target/universe-bridge/release/orbit universe config initialize \
     --universe "$ORBIT_UNIVERSE_ID" --file policy.json --acknowledge-bridge-rollout
   target/universe-bridge/release/orbit universe show --universe "$ORBIT_UNIVERSE_ID"
   ```

   Initialization requires an absent policy and revision zero. Identical repeats return `already_initialized`; different existing policy requires export/diff/apply. Bridge creation also requires `--acknowledge-bridge-rollout`. Read-only import/export need no acknowledgement. Final fresh creation needs none.
5. Initialize every production universe, remove retired universe variables from **all deployment environments/secrets and operator shells**, retain API routing bindings, then roll every process to the final artifact. A local shell can remove them with:

   ```sh
   unset ORBIT_SPEED ORBIT_GALAXIES ORBIT_SYSTEMS_PER_GALAXY ORBIT_POSITIONS_PER_SYSTEM
   unset ORBIT_MAX_PLAYERS ORBIT_SIGNUP_ENABLED ORBIT_SIGNUP_PER_MINUTE ORBIT_COMMANDS_PER_MINUTE
   target/universe-final/release/orbit serve
   ```

Final `serve` applies compatible schema migrations but never provisions a universe. Empty databases fail with explicit setup guidance; missing policies fail before readiness. Retired variables are rejected even when their values match. The final CLI has no import/initialize commands. `DATABASE_URL`, role/pool/CPU/drain settings, bind/origin/assets/metrics/trusted-proxy settings and service-level `ORBIT_LOGIN_PER_MINUTE` remain deployment inputs.

For fresh container setup, run one-off CLI containers on the database network before starting the game container, using a private environment file:

```sh
docker run --rm --network GAME_NETWORK --env-file /private/orbit.env orbit-imperium:config-final setup --name "Friends" --speed 3
docker run -d --name orbit-game --network GAME_NETWORK --env-file /private/orbit.env -p 8080:8080 orbit-imperium:config-final
```

## Rollback boundary and verification

After policy activation, binary-only rollback supports the retained **configuration bridge**, using the same database and revisions. Replace final processes with `target/universe-bridge/release/orbit serve` under the same process configuration; database policies remain authoritative. Do not reconnect a pre-bridge binary. Returning to a pre-bridge release requires stopping all writers and restoring its matching pre-activation database backup and binary together through the deployment's restore procedure. That recovery loses later writes; it is not a policy-table deletion or manual SQL downgrade.

The routine server, PostgreSQL and fixture-browser classes cover the contracts. `make test-signup`, `make test-container` and `make test-rules-updates` remain explicit-only full-system validation. The rolling harness requires a configuration-aware bridge built with `test-support,universe-config-bridge`; use `ORBIT_RULES_PREVIOUS_REF=COMMIT make test-rules-updates` or supply `ORBIT_PREVIOUS_SERVER` explicitly. The same source revision can produce distinct bridge/final binaries, but identical binaries are refused. No rollout or explicit-only validation is implied by these instructions.

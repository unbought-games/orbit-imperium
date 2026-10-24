> Historical test-fixture guide. For current local or production setup, use [empty-server signup setup](signup.md). The five-account commands below require a test-support build and are not production setup.

# MVP v1 local setup

This creates one private five-player development universe. It does not deploy Fly or alter an existing world. This is a historical test-support fixture guide; use the [development guide](../development.md) for normal local setup.

## Profile and retained-world boundary

All supported game profiles use one SQLx-managed database schema. `serve` and explicit bootstrap commands create the baseline and apply pending migrations automatically. Bootstrap chooses game rules, not a storage version. The progression example below retains protocol 3 and ordered-input schema 3; fleet/attack examples retain protocol 4 and ordered-input schema 4.

This first migration-enabled release requires a fresh database. Legacy schema-1 through schema-5 databases are rejected unchanged; retain them with their matching old binary or deliberately discard disposable data. Later baseline-managed releases upgrade in place without changing a world's rules, identity, or epoch. The example progression ports below are separate from historical Slice 1 ports 55472/18175 and CI defaults. Reuse private credential files without overwriting them.

## Prerequisites and isolation

Use repository-pinned Rust 1.99.0 and Node 24.18.0/npm 11.16.0, Docker Compose and PostgreSQL 16.10. On the Mac mini, put the already installed rustup toolchain before Homebrew Rust: `export PATH="$HOME/.cargo/bin:$PATH"`. Run `npm ci`, `npm run build`, and `cargo build --release -p orbit-server --features test-support` from the checkout.

Create the target database and supply credentials with DDL privileges. There is no separate schema initialization step: run bootstrap before starting the server for a new world. A schema migration can run while older compatible servers keep serving, but initial world creation/reset retains the stopped-server requirement. Do not run `dev-reset` against an MVP world. The old `dev-seed` remains a two-player synthetic fixture, not the private MVP.

For isolation from the Mac mini's CI ports, create a separate Compose project using port 55482 (first check it is free). The following creates new private files only when absent:

```sh
mkdir -p .secrets
node --input-type=module <<'JS'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const files = {
  'mvp-accounts.json': JSON.stringify(
    ['owner', 'friend1', 'friend2', 'friend3', 'friend4'].map(name => ({
      name, password: randomBytes(24).toString('base64url'),
    })), null, 2),
  'mvp-progression-seed': randomBytes(32),
  'mvp-progression-universe': randomUUID(),
}
for (const [name, value] of Object.entries(files)) {
  try {
    writeFileSync(`.secrets/${name}`, value, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}
JS
export COMPOSE_PROJECT_NAME=orbit-mvp-slice2
export COMPOSE_FILE="$PWD/compose.yaml"
export ORBIT_DB_PUBLISHED_PORT=55482
docker compose up -d --wait db
# Run once; an existing database-name error means inspect/reuse, not drop it.
docker compose exec -T db createdb -U orbit orbit_mvp_v1_progression_local
```

The local database password defaults to `orbit`; set `ORBIT_DB_PASSWORD` to override it. A retained Compose volume keeps its original database role password. `.secrets` is ignored by Git. On shared hosts, also restrict directory access (`chmod 700 .secrets`). None of these files belongs in a PR, browser asset, log or chat message.

## Credentials and bootstrap

Edit `.secrets/mvp-accounts.json` privately before the first bootstrap if desired. Supply exactly five objects with only `name` and `password`. Names are unique lowercase ASCII letters/digits/hyphen/underscore, 1–80 bytes; passwords are 12–1024 UTF-8 bytes. Names are authentication identifiers, not public player biographies. The defaults are `owner`, `friend1`…`friend4`; no password is embedded in code. Each friend uses their own account through the real login form. Public signup and account recovery/administration are absent.

Set local environment values without placing passwords in command arguments/history:

```sh
export DATABASE_URL="postgres://orbit:$(node -p 'encodeURIComponent(process.env.ORBIT_DB_PASSWORD || "orbit")')@127.0.0.1:55482/orbit_mvp_v1_progression_local"
export ORBIT_MVP_ACCOUNTS_FILE="$PWD/.secrets/mvp-accounts.json"
export ORBIT_MVP_SEED_FILE="$PWD/.secrets/mvp-progression-seed"
export ORBIT_SPEED=10
target/release/orbit mvp-progression-bootstrap \
  --universe "$(cat .secrets/mvp-progression-universe)" \
  --at "$(node -e 'process.stdout.write(String(Date.now()))')"
```

Bootstrap validates the fixed 1×5×15 profile and S=10 before creation. Optional creation inputs `ORBIT_GALAXIES=1`, `ORBIT_SYSTEMS_PER_GALAXY=5` and `ORBIT_POSITIONS_PER_SYSTEM=15` must match exactly; omit them normally. Fractions, signs, leading zeros and whitespace in speed are invalid. There are no independent economy/fleet settings.

Creation is one transaction: immutable rules/profile, universe/epoch, five Argon2id credentials, memberships, homeworlds, starter grants, zero supported levels, collection heads and private generation manifest. Positions are selected without replacement from 4–12 in system 1, following G06's admission frontier; all five systems exist as coordinate capacity, with no wrapping travel.

**Exact rerun behavior:** use the same universe UUID, ordered account names and seed. A rerun checks the retained identities and generated homeworld attributes, then does nothing. It accepts a different valid `--at` and different valid password strings but ignores both on a retained world: no regrant, password rotation, duplicate membership, new epoch or gameplay reset. Changed names/order/seed/profile or damaged structural identity is rejected. To sign in after a rerun, use the original passwords. Keep the original files. Reruns may execute while serving; first creation requires stopped servers. A partial SQL failure rolls back the entire world and all five accounts. An existing account-name collision also rolls back; bootstrap does not attach arbitrary old accounts.

The seed file is 32 raw bytes. It is generation material, not an authentication credential. It and the private epoch-bound homeworld audit are persisted in PostgreSQL, never in public settings/overviews. There is no automatic or manual reset in this workflow.

## Start, stop and restart

```sh
unset ORBIT_GALAXIES ORBIT_SYSTEMS_PER_GALAXY ORBIT_POSITIONS_PER_SYSTEM
export ORBIT_BIND=127.0.0.1:18187
export ORBIT_ORIGIN=http://localhost:18187
export ORBIT_LOCAL_INSECURE=1
export ORBIT_TEST_SEEDED=1 # historical fixture mode; requires test-support build
export ORBIT_ASSETS="$PWD/apps/web/dist"
target/release/orbit serve
```

Open `http://localhost:18187`. Read the appropriate password privately from the account file. Insecure cookies are allowed only for local development origins; do not expose this configuration publicly. The frontend and API share the Rust server origin. Ctrl-C stops the server gracefully. Run the same `serve` command to restart; do not reseed. PostgreSQL volume, UUID, epoch, speed, topology, balances, deadlines, sessions and receipts remain. Omitting `ORBIT_SPEED` on restart loads retained values; explicit `ORBIT_SPEED=10` verifies them. Conflicting speed, incompatible migration history or altered stored artifact fails before scheduling. Topology variables are creation-only and must be absent on serve.

All ten buildings have upgrade/demolition quotes and cancellable active work. Production saves all six settings with a revision; four producers accept 10% steps and disabled Fusion/satellites remain 100. One player research project and one prepaid serial ship/defense FIFO per planet run alongside permitted construction. Units enter stationed inventory individually; manufacturing cannot be cancelled. Transport is disabled for this profile through Slice 4, including for newly built Small Cargos. R1 worlds retain their original transport behavior. Browser logout clears active view/settings/intent; login requires a new bound confirmation. An uncertain command is recovered using its original ID rather than repeated with a new one.

## Manual health and acceptance

```sh
curl --fail http://localhost:18187/health/live
curl --fail http://localhost:18187/health/ready
```

Readiness checks database/schema and scheduler invariant-block state; liveness alone does not prove playable persistence. Sign in to each account and confirm one distinct planet, fixed 10× and 1 galaxy/5 systems/15 positions, 1000/1000/0 starter balances, ten zero building levels, seven zero research levels and empty inventories/jobs. Quote a Metal Mine upgrade and confirm the server-issued cost/deadline. Reload while pending, then confirm exactly one outcome. Sign out/in to a second account and confirm the first player's body/actions disappear. Check 320px and desktop widths. Stop/restart and verify the same binding and state. Inspect server errors without copying private environment files into logs.

Automated acceptance uses disposable databases only:

```sh
export ORBIT_TEST_DB_PORT=55482
export ORBIT_TEST_HTTP_PORT=18183
export ORBIT_TEST_RECOVERY_PORT=18185
export ORBIT_TEST_MVP_PORT=18184
export ORBIT_TEST_PROGRESSION_PORT=18182
export ORBIT_TEST_CONTAINER_PORT=18188
make check
make test-db
make test-migrations
make test-e2e
make test-recovery
make test-mvp
make test-progression
make test-container
```

Keep frontend-build suites sequential because they share `apps/web/dist`. These port overrides preserve CI defaults and do not change runner infrastructure. Test commands create/remove their own randomly named databases. They do not touch `orbit_mvp_v1_progression_local`. `test-mvp` generates disposable credentials and verifies five browser logins, construction, fixture transport/recall, cross-account privacy, process kill/restart and bootstrap reruns.

Fly launch, hosted HTTPS/access configuration, hosted acceptance and final five-person playthrough belong to Slice 6. No Fly deployment, backup machinery, automated monitoring or admin portal is included here.

## Progression manual checks

Start with Solar Plant and mines, then build Robotics 2, Lab and Shipyard. Expand storage when a quote's payment exceeds capacity. Recycler requires Shipyard 4, Combustion 6 and Shielding 2; Shielding requires Lab 6 and Energy 3. The progression options panel lists exact missing prerequisites and funds. Production settings do not waive energy constraints. Inspect and confirm research, then manufacture Small Cargo, Light Fighter, Recycler, Espionage Probe, Rocket Launcher and one Small Shield Dome. Inventory counts mean completed units only.

Before due, construction/research cancellation returns stored payment; at due, completion wins. Lab work and research exclude each other. Any paid manufacturing locks Shipyard upgrades/demolition; other permitted work may overlap. Reload during simultaneous work and verify server outcomes. An elapsed countdown does not locally complete a job. Test logout/relogin on two accounts and 320px/desktop widths. No production time/grant endpoint exists: `make test-progression` uses a test-feature binary and a clock table in its own disposable database, with no privileged resource or unit grants for the starter journey.

## Slice 4 fresh fleet profile

Use `rules/mvp-v1-slice-4.json`, inputs 4 / protocol 4, on the shared SQLx baseline. Bootstrap is idempotent for its original manifest and never rotates passwords or regrants assets. Existing baseline-managed worlds keep their original rules; schema migration does not enable new missions in them.

Create a separately named database, for example `orbit_mvp_v1_fleets_local`, in a separate Compose project. The verified task used project `orbit-mvp-slice4` and PostgreSQL port `55512`; first check these names/ports are free on your host. Copy `compose.yaml` to a new ignored `.secrets/compose-fleets.yaml`, change only its published database port and point its password-file reference at the existing private file's absolute path. Start that project explicitly; do not stop or remove older projects/volumes.

Reuse the privately retained five-account JSON file, or create a new private five-account file using the earlier exclusive-create procedure. Create **new** `.secrets/mvp-fleets-seed` (32 random bytes) and `.secrets/mvp-fleets-universe` (UUID) with exclusive creation; never overwrite earlier seeds or IDs. Set `DATABASE_URL` privately to the new database, then:

```sh
export ORBIT_MVP_ACCOUNTS_FILE="$PWD/.secrets/mvp-accounts.json"
export ORBIT_MVP_SEED_FILE="$PWD/.secrets/mvp-fleets-seed"
export ORBIT_SPEED=10
target/release/orbit mvp-fleets-bootstrap \
  --universe "$(cat .secrets/mvp-fleets-universe)" \
  --at "$(node -e 'process.stdout.write(String(Date.now()))')"
export ORBIT_BIND=127.0.0.1:18217
export ORBIT_ORIGIN=http://localhost:18217
export ORBIT_LOCAL_INSECURE=1
export ORBIT_TEST_SEEDED=1 # historical fixture mode; requires test-support build
export ORBIT_ASSETS="$PWD/apps/web/dist"
target/release/orbit serve
```

Use ordinary `serve` for restarts. Flights, paid work, lots, policies, reports, RNG evidence and receipts persist. A killed worker's existing fenced lease can delay recovery for up to its 15-second lease; do not reseed or reset while waiting. Readiness and the client distinguish pending/temporarily unavailable from a terminal outcome.

Develop the same facilities and research closure as Slice 2, then manufacture ships. Galaxy has bounded systems 1–5 and free browsing. Prepare Transport/Espionage/Harvest from a galaxy card or enter coordinates in Dispatch; hidden eligible debris markers can be resolved manually. Choose mixed ships, whole cargo and a 10% speed step, review server fuel/duration/capacity, and activate Launch once. Transport returns its ships; probes contribute no payload. Fleet slots include returning missions. Recall spends no additional fuel and refunds none.

Espionage can enter normal combat, with escorts participating and no plunder. Read the observer and defender accounts separately: they receive different reports, and first-round attacker losses restrict combat detail. Historical observations never become live enemy data. Harvest a field created by that battle; a depleted marker stays eligible until its scheduled cleanup, with outbound/returning collectors protecting it. Reports can be marked read or hidden for the current recipient only.

Check phone Menu/Fleets/Reports, keyboard dispatch, reload after an interrupted launch reply and account isolation. The client preserves both presence and gameplay IDs; do not manually create a second launch to resolve uncertainty. Attack/Deploy/Colonize and other excluded routes remain unavailable. Physical touchscreen and screen-reader validation remain release checks.

Automated checks use random disposable database names and test-only controlled time/randomness, with no production cheat endpoint or grants to actual MVP accounts:

```sh
make check
make test-db
make test-migrations
make test-missions
make test-e2e
make test-recovery
make test-mvp
make test-progression
make test-container
```

`ORBIT_TEST_MISSIONS_PORT` overrides the fleet acceptance HTTP port (default 18212); existing database/HTTP/recovery/container overrides remain available. Run browser/build suites sequentially because they share `apps/web/dist` and Playwright output. The test binary's input-specific random evidence and commit fault tables are compiled out of production. Fly deployment and complete MVP launch remain later slices.

## Slice 5 fresh attack profile

The current attack profile is `rules/mvp-v1-slice-5.json`: inputs **4**, protocol **4**, on the shared SQLx baseline. Version numbers are independent: this enables a previously known mission under a new immutable rules hash, using existing evidence storage and optional compatible report fields. Slice 4 worlds continue rejecting Attack. No retained world, artifact, attempt, seed or credentials may be relabeled. The same binary serves each supported profile according to its saved rules; an older binary does not support Slice 5.

Create a new empty database such as `orbit_mvp_v1_raids_local` in a new Compose project, for example `orbit-mvp-slice5` on PostgreSQL port `55522`. Check availability first. Follow the earlier exclusive-create password/Compose procedure, naming the file `.secrets/compose-raids.yaml`; leave every retained project and volume running unchanged. Reuse the existing private five-account file without editing it. Exclusively create new `.secrets/mvp-raids-seed` and `.secrets/mvp-raids-universe`; do not overwrite existing files. Set `DATABASE_URL` privately to the new database, then from the repository:

```sh
export PATH="$HOME/.cargo/bin:$PATH"
export ORBIT_MVP_ACCOUNTS_FILE="$PWD/.secrets/mvp-accounts.json"
export ORBIT_MVP_SEED_FILE="$PWD/.secrets/mvp-raids-seed"
export ORBIT_SPEED=10
target/release/orbit mvp-raids-bootstrap \
  --universe "$(cat .secrets/mvp-raids-universe)" \
  --at "$(node -e 'process.stdout.write(String(Date.now()))')"
export ORBIT_BIND=127.0.0.1:18317
export ORBIT_ORIGIN=http://localhost:18317
export ORBIT_LOCAL_INSECURE=1
export ORBIT_TEST_SEEDED=1 # historical fixture mode; requires test-support build
export ORBIT_ASSETS="$PWD/apps/web/dist"
target/release/orbit serve
```

Schema preparation runs automatically before bootstrap or serving. The old `db-init*` CLI commands are optional aliases for the same migrator; none chooses a game profile. Bootstrap verifies the exact saved profile and five-account manifest on rerun; attempting to substitute Slice 4 for Slice 5 or vice versa is refused. Restart with ordinary `serve`, preserving the original database/epoch/seed. No `dev-reset`, volume deletion or credential rotation is part of this workflow.

Develop two accounts from the normal starter state through the earlier progression closure; keep their exact invested values within G10 protection eligibility through actual development. Manufacture cargo ships, fighters, probes, recyclers and defenses. Scout from Galaxy, read the observation, then select Prepare attack. A shortcut creates a draft, checks the observed target identity against current resolution, and obtains a fresh quote. Review origin, target, ships, cargo, fuel and estimated contact/return, then Launch once. A lost reply is recovered with the original paired IDs; do not send a replacement launch.

On the defender account inspect Fleets for incoming Attack with Espionage 2/4/8 visibility. Available stationed ships/resources may be moved with ordinary Transport before contact, or resources spent through ordinary progression. At contact, only completed stationed units and completed technology participate. There is no tactical retreat/intercept control. Read both combat reports independently: first-round attacker total loss hides defender facts from that attacker. Full reports distinguish gross losses, recovered defenses and permanent losses, with actual loot and own cargo loss. Surviving ships/loot return on committed travel time; raw loot adds no score. Prepare harvest from the historical debris report, obtain a fresh quote and return salvage before reinvesting. Debris is unreserved and may already have been collected.

Settings publishes the six qualifying contacts/rolling 24-hour active-target conduct rule. The seventh contact still resolves; no automatic sanctions or monitoring UI exist. Hidden reports cannot erase private evidence. Sign out/in, reload a detail route, test back/forward/new tabs and phone keyboard navigation. Physical touch and VoiceOver/Safari/NVDA checks remain Slice 6 release checks.

Run `make test-raiding` in addition to every earlier acceptance command. It creates a randomly named disposable database, normally removes it, and uses only test-build controlled time/faults. `ORBIT_TEST_RAIDING_PORT` sets its HTTP port (default 18222); `ORBIT_RAIDING_RETAIN=1` deliberately retains only that disposable test database and its temporary private seed/account files for debugging. It never grants assets in the earned journey or exposes a production clock/RNG/cheat route. Production container smoke now also exercises the raids profile. No Fly deployment is performed.

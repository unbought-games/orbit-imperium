# Deploy code, then activate content

Deploy the server/frontend across all instances sharing PostgreSQL before changing a universe's rules. A deployment applies compatible schema migrations, but preserves existing universe configurations. Newly supported content can stay disabled indefinitely.

Content additions must also preserve client and historical-report compatibility.
See the [content compatibility audit and regression checks](content-compatibility.md)
before changing shared vocabulary or response shapes.

Use the deployed `orbit` binary with the same `DATABASE_URL` as the service. These commands are operator CLI commands, not public HTTP endpoints. The database must already have been prepared by server startup.

## Standard release upgrades

Self-hosted and official hosted universes use the same commands, definitions and
conflict checks. Run these **after every API, worker and operator process has been
updated** to the new image:

```sh
orbit rules upgrade --dry-run # optional read-only preview
orbit rules upgrade
```

The command targets the standard content compiled into the installed binary; it
does not download anything or require Node.js, a source checkout, or a proposal
file. `--universe UUID` selects an existing world. Without it, the command uses
`ORBIT_UNIVERSE_ID`, or the sole universe if that environment variable is absent.
Conflicting CLI/environment IDs and ambiguous selection fail. `orbit rules upgrade
--help` works without a database. An empty database needs `orbit setup` first.

The bundled content release is currently **0.8.0**. This is the content bundle's
version, not a stored universe version or a claim about the deployed application.
The bundle contains the earlier Impulse Drive, Astrophysics/colonization, Heavy
Fighter, Laser/Light Laser, Ion, Cruiser and Ion Cannon additions, followed by
Large Cargo, Solar Satellite, Heavy Laser, Gauss Cannon, Large Shield Dome and
Plasma Technology. The current development bundle also includes
[Plasma Turrets](plasma-turret.md), requiring Shipyard 8 and Plasma Technology 7.
[Destroyers](destroyer.md) require Shipyard 9, Hyperspace Technology 5 and
Hyperspace Drive 6. They use native Hyperspace propulsion and rapid fire against
Light Lasers, Espionage Probes and Solar Satellites.
[Bombers](bomber.md) require Shipyard 8, Impulse Drive 6 and Plasma Technology 5;
they use Impulse propulsion until the Hyperspace Drive 8 switch. The current development bundle also includes [Fusion Reactor](fusion-reactor.md),
including fuel-aware production and level-zero initialization. The original signup
baseline, fully activated v0.3.0 worlds and partial activations can all be upgraded.
The development bundle also includes [Hyperspace Technology](hyperspace-technology.md),
requiring Research Lab 7, Energy Technology 5 and Shielding Technology 5. It is
prerequisite research without per-level bonuses. [Hyperspace Drive](hyperspace-drive.md)
requires Lab 7 and Hyperspace Technology 3 and includes the classic Bomber switch
at Drive 8. Other dependent systems remain unavailable.
Fresh `setup` and `universe create` use these same standard definitions immediately;
repeating setup or restarting does not upgrade existing rules.

Large Shield Dome requires Shipyard 6 on the planet and player Shielding Technology
6. Its prerequisite chain (Robotics Factory 2, Research Lab 6 and Energy Technology
3) is already supported. It costs 50,000 metal and 50,000 crystal, with base attack
1, shield 10,000 and hull 10,000 before technology bonuses. One completed or queued
dome of each type is allowed per planet; Small and Large Shield Domes coexist.
Shields protect their own unit, reset each round and use the existing weak-shot
bounce rule. Domes unlock no further technologies. Destroyed domes use the normal
defense recovery policy; an unrecovered dome can be rebuilt.

After deploying this binary to every API, worker and operator, use the same
`orbit rules upgrade --dry-run` and `orbit rules upgrade` commands above. No
per-content preparation script or manual database edit is needed. Fresh worlds
include the dome automatically; existing worlds keep their current rules until
explicit activation. Customized dome definitions produce conflicts, and an
intentionally disabled dome with retained definitions is not silently re-enabled.

The upgrade has an explicit list of owned fields: the named content's catalog
entries, research/ship definitions, unit costs, combat entries, related rapid fire,
Small Cargo's Impulse Drive alternative, colonization policy, satellite energy and Fusion Reactor building/production definitions.
Each owned field or keyed entry must be absent, match its recognized older baseline,
or already match the bundled value. Anything else produces a conflict with the
path, current value, recognized older value and proposed value. All conflicts are
reported before any activation. Definitions retained after deliberately disabling
content are not silently re-enabled. Disabled base prerequisites also fail.
Unrelated settings, including universe identity, speed, topology, base production,
mine costs and base Small Cargo stats, are retained. Customizing a bundle-owned
definition requires the explicit export/diff/apply workflow below; there is no
force-overwrite option or general automatic merge.

Preview reads the active rules and validates a proposal without changing the
database. Applying recomputes a proposal from the then-current rules and uses the
existing revision-checked atomic activation. It is not a saved approval of an
earlier preview. A concurrent edit after preparation fails stale; it is never
silently rebased. Existing payments and timing retain the guarantees below.

Output is JSON. Preview returns `status: Ready` with a diff, or `UpToDate`.
Application returns `outcome.status: Applied` or `AlreadyActive` with the rules hash
and revision. These outcomes exit successfully. Conflict, Rejected, Stale, Busy and
Pending outcomes exit nonzero. A `Pending` outcome includes `activation_id`: the
activation remains queued. Rerun the **same command with the same binary** to
observe it; deterministic preparation produces the same proposal until activation
finishes. A different pending proposal is never replaced. After activation,
repeating the command is a no-op. Successful activation does not run a full
game-state audit automatically; `orbit audit` remains an explicit inspection.

### Official production rollout

Deployment tooling owns the database credentials, image digest and rollout. Orbit
does not detect which versions other replicas are running. The release workflow
must verify every API and worker uses the chosen image before invoking that same
image as an operator process:

```sh
orbit rules upgrade --universe "$ORBIT_UNIVERSE_ID" --dry-run
orbit rules upgrade --universe "$ORBIT_UNIVERSE_ID"
```

Treat only confirmed `Applied` or `AlreadyActive` as complete, retain the reported
hash/revision, and verify serving readiness. If pending, keep workers running and
repeat the command until confirmed. Stop for conflicts or rejected/stale proposals;
do not report deployment as content activation. Use the same flow for a self-hosted
cluster. No additional production environment variable, migration, HTTPS change or
privileged override is required. The command does not deploy an image or certify
that the rollout has happened.

The per-content preparation scripts remain available for selective/custom
activation and older release workflows. Normal standard upgrades use the binary
command above; existing external deployment automation must explicitly switch to
it after the image containing this command is deployed.

For Plasma Technology prerequisites and activation, see [Plasma Technology](plasma-technology.md).

For Ion Technology prerequisites and activation, see [Ion Technology](ion-technology.md).

For the reviewed Laser Technology and Light Laser content patch, see
[Light Laser activation](light-laser.md).

For Heavy Fighter prerequisites, exact stats, and preparation commands, see the
[Heavy Fighter rollout](heavy-fighter.md).

## Export and edit

Find the universe ID in the game's Settings or the operator's existing database tooling. Save its current configuration:

```sh
orbit rules export --universe <id> --out rules-before.json
cp rules-before.json rules.json
```

The document contains `universe`, `base_revision`, `artifact`, and `speed`. Edit `artifact` for the intended content, costs, production, or combat values, or `speed` for a universe speed change. Preserve `universe` and `base_revision`; they identify the universe and the configuration you started editing. Do not calculate or edit a rules hash.

Enabled content needs complete definitions and prerequisites. A binary recognizing a content name does not mean its specialized mechanics are implemented. The validator rejects unsupported content and invalid references. Disabling a catalog entry prevents new production/research of it; retain definitions needed by owned assets and pending work.

This update command preserves topology, resource units, and protocol family. It does not perform destructive structural conversions or remove definitions still needed by the game. Specialized new features supply their initialization with their implementation.

## Changing universe speed

Deploy the supporting release to every API and worker before activation. Older
workers reject speed changes when processing a scoped activation. For a current
signup universe, export a fresh rules document and change only `speed`:

```sh
orbit rules export --universe <id> --out rules-before.json
node --input-type=module -e 'import fs from "node:fs"; const d=JSON.parse(fs.readFileSync("rules-before.json")); d.speed=3; fs.writeFileSync("rules.json",JSON.stringify(d,null,2)+"\n")'
orbit rules diff --universe <id> --file rules.json
orbit rules apply --universe <id> --file rules.json
orbit universe show --universe <id>
```

For a 5× to 3× change, the diff must contain only `/speed: 5 → 3`, with no
catalog initialization. Speed accepts integers 1–100. Pinned historical MVP
fixtures remain at 10×. Do not edit `universes.speed` or rules JSON directly in
SQL: the saved speed and rules hash must agree, and accrued production must be
settled at the old rate before changing either.

Existing building/research work, entire paid manufacturing batches and flight
travel/return/recall commitments keep their timing and payments. New work uses
3×, and production changes to 60% of the former rate after activation. New
travel/research/manufacturing durations are approximately 5/3 of their former
values; minimums, rounding and the building-duration adjustment still apply.
The epoch, players, admission policies and other universes stay unchanged.

After activation, verify both server roles remain ready and refreshed game
settings show 3×. A lost response is handled by retrying the same document;
an already-active retry does not settle twice. A stale competing edit needs a
fresh export. Keep the original export as evidence; reversing speed requires a
fresh export and another forward activation, not replaying that stale document.
Policy exports made before the change must also be refreshed. Never reconnect an
older worker while a speed activation remains pending.

Local validation: `make test-speed-updates` runs the real CLI, HTTP server,
workers and browser against a disposable database with controlled time and paid
work across a 5× → 3× cutover. PostgreSQL `rules_speed` tests cover serial and
scoped atomicity, rollback, production settlement and restart. This full-system
suite is explicit-only, not part of routine CI.

## Review and apply

```sh
orbit rules diff --universe <id> --file rules.json
orbit rules apply --universe <id> --file rules.json
```

`diff` is read-only and prints changed values and new level entries to initialize. `apply` updates one universe atomically. It settles production through the activation time using old rules, initializes required level-zero facts, selects the new configuration, and records the change. Players can refresh to see the new content.

In legacy serial/preparing mode, the command waits up to 30 seconds for an idle activation boundary; if it remains busy, no update is queued. In scoped mode, it durably queues an ordered boundary and observes it for up to 30 seconds. A pending activation ID means the update remains queued and workers will continue it. Future jobs beyond the boundary do not need to finish. Validation and stale-edit errors return immediately; a stale edit requires a fresh export and review.

An `Applied` result includes the new profile hash, revision, and effective timestamp. Reapplying the already-active configuration returns `AlreadyActive` without repeating initialization. If a connection is lost and the result is unknown, rerun the same file to confirm the result. Do not infer failure merely from a lost response.

Other universes retain their own configuration. Restarts never replace the active selection with the binary's default.

## What remains committed

- Existing building/research/manufacturing work keeps its payments and timing.
- Flights keep their paid fuel and committed travel/return terms.
- Battles use the combat rules active at arrival, for both sides.
- Production before activation uses old rates; production afterward uses new rates.
- Accounts, sessions, universe identity/epoch, receipts, historical reports, and paid asset values are preserved.

Existing algorithms normally change with a code deployment. A particular behavior that needs to remain off until activation uses an explicit feature setting; there is no general algorithm-version system.

## Deployment and rollback boundaries

The operator completes the rolling deployment before applying rules. There is no server capability registry or negotiation. Keep the exported snapshot as a record of the previous configuration. Automated rollback and reverse state migrations are deferred; this command does not certify that old binaries understand data created by newly enabled content.

For explicit local/CI acceptance, `make test-rules-updates` requires distinct configuration-aware bridge and final server builds and disposable PostgreSQL databases. The bridge must support `test-support,universe-config-bridge`; the harness imports/initializes the retained fixture policy before final startup. Follow [universe configuration operations](universe-configuration.md) for build and rollback boundaries.

## Fast startup and explicit integrity inspection

Restarting a populated universe checks schema history, the saved active rules and
required singleton state. It does not read player collections, inventory, queues,
asset lineage, enrollment manifests or historical events. Required runtime/world
rows and secrets are never reconstructed during restart. A missing row, invalid
rules binding or blocked universe refuses readiness with an operator diagnostic.

Schema preparation has one owner in `serve`. Already-applied compatible migrations
use a read-only history check without the migration advisory lock. Pending
transactional migrations still serialize through SQLx and recheck history under
its lock. Preparation has a 10-second deadline, 5-second statement timeout and
1-second DDL lock timeout. Waiting for SQLx's migration coordination lock permits
up to 5 seconds, then restores the 1-second DDL limit; the 10-second whole-operation
deadline still applies. Timeouts fail; they do not grant readiness or retry.
Population-dependent backfills or format conversions are explicit maintenance
work, never automatic startup migrations. `orbit db-init` can prepare the
schema before deployment, subject to the same bounds.

After schema preparation, final serving validates existing worlds, requires their
policies and resolves API signup routing before readiness. It never creates a
universe; use `orbit setup` (or `db-init` and `universe create`) explicitly. New creation remains a
separate database transaction, and workers must restart to discover it. Metadata
queries retain their bounded lock and statement timeouts. Shared operator guards continue preventing reset while a
server runs. Losing that guard session or the scheduler terminates the process.
Transient claim-resolution storage failures are logged and remain retryable;
unsupported persisted formats retain a distinct service error and terminate the
incompatible scheduler without a second database read. Both conditions remain
private HTTP 503 responses.

Readiness means this process can serve the active configuration and required
state; it is not a certification of all stored facts or an empty queue. Backlogged
work continues normally, and freshness checks still reject stale gameplay views.
Operation-time validators, authorization, fencing, database constraints and atomic
commits remain in force. A detected invalid transition blocks resolution without
advancing its cursor. Unsupported persisted vocabulary/formats refuse processing
locally rather than marking a universe corrupt for all other binaries.

For explicit current-state reconciliation, run:

```sh
orbit audit --universe <id>
```

This operator-only command requires an already prepared schema. It uses one
repeatable-read, read-only snapshot without the gameplay gate. It validates
required metadata, development bootstrap identity where applicable, progression
collections, world lineage and referenced rulesets. It supports progression/world profiles and explicitly refuses legacy profiles
whose gameplay records it does not examine. It does not replay all historical
reports or completed events. It performs no repairs, migrations or
unblocking, and is never scheduled or invoked by startup. A known blocked marker
is retained and does not prevent inspection. SQL statements have a 10-second
limit, lock waits a 250ms limit, and the command a 60-second limit. Large audits
still consume memory/I/O and retain an MVCC snapshot; choose an appropriate
maintenance window. A timeout/failure is an incomplete audit, not a pass.

Deploy compatible readers before activation. Deployment does not initialize new
content facts; `rules apply` remains the explicit atomic activation boundary.
Unknown formats do not trigger automatic downgrade or conversion, and rollback
after activation still requires a binary that understands the saved state.


## Scoped runtime activation

After the mode-aware bridge is deployed everywhere, run `orbit runtime prepare --universe UUID` and `orbit runtime activate --universe UUID` using the [retained-world rollout](concurrent-runtime.md). Preparation can be interrupted/repeated; activation fences serial processing and preserves accepted order identities and event times.

In scoped mode, `rules apply` durably queues a global boundary. Earlier conflicting gameplay completes under the previous rules; later commands execute under the rules active at their ordered position. Admission's profile hash is provenance, while quoted consent and paid commitments are still validated. Game orders and committed reads remain available; signup waits outside SQL until the configuration boundary is resolved.

If observation lasts longer than 30 seconds, the CLI reports a durable pending activation ID. The activation remains queued and workers continue it. Retrying the same file observes the same request; do not interpret a disconnected/pending CLI as cancellation. A different proposal cannot replace a pending boundary. Serial/preparing mode retains the older idle-boundary behavior until activation.

Process restarts do not need a gameplay audit or a caught-up simulation. Private lag metrics and blocked-scope diagnostics are operational signals, not readiness failures for an otherwise compatible API. Unsupported vocabulary still stops an incompatible process locally.

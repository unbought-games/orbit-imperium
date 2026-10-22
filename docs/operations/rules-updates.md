# Deploy code, then activate content

Deploy the server/frontend across all instances sharing PostgreSQL before changing a universe's rules. A deployment applies compatible schema migrations, but preserves existing universe configurations. Newly supported content can stay disabled indefinitely.

Use the deployed `orbit` binary with the same `DATABASE_URL` as the service. These commands are operator CLI commands, not public HTTP endpoints. The database must already have been prepared by server startup.

For Heavy Fighter prerequisites, exact stats, and preparation commands, see the
[Heavy Fighter rollout](heavy-fighter.md).

## Export and edit

Find the universe ID in the game's Settings or the operator's existing database tooling. Save its current configuration:

```sh
orbit rules export --universe <id> --out rules-before.json
cp rules-before.json rules.json
```

The document contains `universe`, `base_revision`, `artifact`, and `speed`. Edit `artifact` for the intended content, costs, production, or combat values. Preserve `universe` and `base_revision`; they identify the universe and the configuration you started editing. Do not calculate or edit a rules hash.

Enabled content needs complete definitions and prerequisites. A binary recognizing a content name does not mean its specialized mechanics are implemented. The validator rejects unsupported content and invalid references. Disabling a catalog entry prevents new production/research of it; retain definitions needed by owned assets and pending work.

This initial update command preserves speed, topology, resource units, and protocol family. It does not perform destructive structural conversions or remove definitions still needed by the game. Specialized new features supply their initialization with their implementation.

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
universe; use `db-init` and `universe create` explicitly. New creation remains a
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

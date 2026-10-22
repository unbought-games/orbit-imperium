# Colony Ships and colonization rollout

This is an implementation and operator plan, not a production deployment record.
No live universe, account, rules, or infrastructure was changed during this work.
The starting source revision is `cf0a8fe11b08a388cadaddcdf195dd1c7ae2e922`, containing
merged Impulse Drive (#17) and Astrophysics (#18).

## Implemented contract and evidence

Authoritative design references are in the private archive
`/Users/ethan/unbought/orbit-internal-docs/original-docs/`. These references identify
the decisions without republishing the archive:

| Reference and section | Implementation decision |
| --- | --- |
| `specs/manufacturing-inventories.md`, **Complete ship manufacturing catalog**, **Commitment, timing and observable prefix** | Colony Ship costs 10,000 metal / 20,000 crystal / 10,000 deuterium; requires completed local Shipyard 4 and player Impulse Drive 3; existing prepaid serial manufacturing and per-unit timing apply. At beta speed 5, Yard 4, Nanite 0: 1,728 seconds per ship. |
| `game/ships.md`, **Complete candidate catalog**, **Prerequisites and movement**; `specs/fleet-missions.md`, **Movement catalog and exact arithmetic** | Base impulse speed 2,500, +20% per completed level, capacity 7,500, fuel coefficient 1,000. Base hull 3,000, attack 50, shield 100; rapid fire 5 against probes. Existing exact travel, mixed-drive fuel and combat arithmetic remain authoritative. |
| `specs/galaxy-colonization.md` revision `g06-resolution-7`, **Astrophysics, race and colony rules** | Use the merged completed-research predicates. Position is checked at launch and arrival; full count capacity permits launch with a warning. No reservation. Arrival consumes exactly one ship only on success, deposits all cargo plus 500/500/0, returns all extras/escorts, or releases the fleet slot immediately when none remain. Failure returns all ships/cargo without refund or random draws. |
| Same document, **Approved profile oi-redesign-reconstructed-v1**, **Shared random primitive**, **Exact reconstructed-generator acceptance vectors** | Certified integer field weights, then uniform integer diameter within the selected field interval, then independent Tmax. Tmin is derived as Tmax−40. HMAC stream domain `colony`, stable arrival InputId, original universe/epoch secret, and atomic private cursor audit. Exact published weights hash and golden 230-field / 15,191 km / 24…64°C vector pass tests. |
| Same document, **Coverage, atomicity and acceptance**; `specs/shared-game-contracts.md` §§6, 9–10 | Proven empty occupancy and output-ID absence, complete owner membership, player/location execution scopes, deterministic IDs, fenced atomic creation/consumption/report/event commit. Existing due ordering determines competing arrivals and research effects. |
| `specs/fleet-missions.md`, **Approved cargo and fuel policy**, **Mission transitions**, **Recall, return, fleet saving and loss of origin** | Fuel occupies launch space and is spent once. Recall uses elapsed travel time; natural returns retain accepted duration. Deploy to another owned planet transfers ships/cargo and credits floor(paid fuel / 2) whole deuterium. Failed/recalled deployment has no fuel credit. |
| `specs/economy-construction.md`, **Production controls, rates and storage**, **Starter manifest**; later G06 homeworld amendment | Colonies start with every supported building at zero, no units/jobs, zero carry and all six settings at 100%, production starting at arrival. Existing storage overflow and temperature production rules apply. Homeworlds keep the later 1,000/1,000/0 admission grant. Research is shared, not reinitialized per colony. |
| `operations/signup.md`, **Starting-planet placement**; `superpowers/specs/2026-10-16-concurrent-game-runtime-design.md` §§5–7 | Preserve balanced homeworld allocation and immutable topology. Enrollment rechecks occupancy after its location gate and releases its transaction while earlier location work resolves; it then recalculates placement. No expansion-slot reservation or stored population count. Activated legacy development worlds use their frontier policy with actual occupancy; audit counts homeworlds and colonies separately. |
| `specs/responsive-game-ui.md`, **Fleet**, **Expansion, intelligence and later warfare**; `specs/reports-rankings-tools.md`, **Report identity, payload and authorization** | Empty-position action, typed resolver/quote, clear locks and count warning, existing durable attempt handling, owner-only reports and colony attributes. Arrival preserves the selected origin; the result links to the new stable body and offers transport/deployment from the original source. |
| `superpowers/specs/2026-10-16-deployment-content-activation-design.md`, **Activation**, **Existing work and effective rules**, **Rollback and scope limits**; `operations/rules-updates.md`, **Scoped runtime activation** | Deploy everywhere before explicit per-universe activation; preserve old artifacts, accepted work, sessions and epoch; initialize research only through existing activation logic. |

The generation profile is an approved reconstruction with inferred finite bounds
and widths, not the proprietary historical OGame algorithm. There are no modern
position-production bonuses, class bonuses, rerolls or fixed nine-planet cap.
The supplied secondary [Gameforge colonization page](https://gameforge.com/en-GB/games/ogame-colonization.html) was checked; its reversed
hot/cold position descriptions and modern class discussion do not override G06.

Abandonment/tombstones, moons, expeditions, IRN and allied holdings remain
unavailable existing capabilities. This release does not add those lifecycle
commands or pretend that a missing body is a replacement at the same coordinate.

## Rules, schema, and compatibility

`rules/content/colonization.json` and `scripts/prepare-colonization-rules.mjs`
provide the reviewed patch. It requires enabled Impulse Drive and Astrophysics,
adds the ship's construction/movement/combat definitions and prerequisites, and
sets `world.colonization={profile:"oi-redesign-reconstructed-v1",enabled:true}`.
That setting enables Colonize and owned-planet Deploy. It preserves the exported
universe, base revision, speed, topology, identity and unrelated customized rules.
The existing activation machinery initializes missing research levels once;
ship inventory remains sparse under complete coverage, so no zero-ship backfill
or progress reset is required. Subsequent signups use the same active catalog.
The immutable `mvp-v1-slice-6.json` fixture documents the full chain; existing
artifacts and new-world defaults are unchanged. Operators activate each world.

Migration `0013_colonies.sql` prepares an empty colony-genesis table, coordinate
lifecycle revision heads, an insert trigger compatible with previous writers,
and the additional terminal fleet states. It does not scan/backfill player or
fleet history. Existing occupied slots without a head have birth revision 1;
empty absent slots have revision 0. The previous validated fleet constraint
already proves all retained rows satisfy the wider predicate. Its replacement
uses PostgreSQL `NOT VALID` to avoid a startup scan, while enforcing every new
write. No manual SQL data rewrite or delayed backfill is needed. Schema preparation
still obeys the repository's bounded startup/DDL rules and can safely fail/retry.

Protocol 4 gains EmptyPosition/EmptyPositionAt and typed colony result payloads;
existing protocols/artifacts retain their encodings and hashes. Refresh clients
after activation. Existing flights keep accepted fuel, speeds, duration and
recall terms even if research or rules change. A stale quote requires a fresh
quote. Disabling new colony launches never confiscates an accepted flight;
its arrival still resolves. Generation profile removal/change is rejected.

## Beta target and release order

The sole retained beta is `d0cc4915-5e59-4b1b-a223-df1e2048ef18`: speed 5,
1 galaxy × 100 systems × 15 positions. Source:
`/Users/ethan/unbought/infra/environments/production/status.md`, **Initial closed
universe and launch gates (historical)** and **Current state: public open beta**.
The latter opened the same universe without resetting it. Reconfirm the current
name, runtime mode, configuration revision/hash and image digest immediately
before acting. Do not use retired Fly universe IDs or an old status-file digest.

1. Merge the implementation and require successful CI. The automatic **Release
   image** workflow publishes the exact successful current-main revision. Retain
   its `release-image.json` and immutable digest; see [image releases](image-releases.md).
2. In the current infra checkout, prepare a private release manifest selecting
   that Orbit commit/digest for both API and worker. Preserve Accounts, analytics,
   Caddy, hostnames, resource limits, open-beta policy and every unrelated service.
   Retain a verified database backup/recovery point and the prior release record.
3. Validate the manifest before the separately authorized deployment:

   ```sh
   python3 services/production/runtime/deploy.py /absolute/private/release.json --validate-only
   ```

   Save workflow input JSON with `action: "deploy"` and `manifest` set to the
   serialized manifest string. At the authorized release window:

   ```sh
   gh workflow run deploy-production.yml --repo unbought-games/infra --ref main --json < /absolute/private/workflow-inputs.json
   ```

   Follow that exact run and SSM verification through all role/HTTPS readiness
   checks. Confirm every API, worker and operator binary is compatible before
   activation. The current single-host service can have a restart window.
4. Normal startup prepares migration 13 while preserving saved rules. Deployment
   alone does not activate colonization. Do not drain future fleets/jobs or reset
   accounts. If migration preparation fails, diagnose it and retry the same
   release; do not edit migration history or bypass its bounded preparation.
5. Confirm Impulse Drive and Astrophysics are already supported and enabled. If
   either is missing, use their existing export/prepare/diff/apply procedure in
   that dependency order, refreshing the export after each successful boundary:
   `scripts/prepare-impulse-rules.mjs`, then `scripts/prepare-astrophysics-rules.mjs`.
   Prior detailed plans remain in the private archive's `implementation/` directory.

## Export, review, activate

The following host commands are a plan, requiring separate live operational
authorization. First reconcile any failed or in-progress release; the `current`
symlink records the last verified release, not proof that no newer attempt exists.
Do not print secret environment files or the full Compose configuration.

```sh
ORBIT_BETA=d0cc4915-5e59-4b1b-a223-df1e2048ef18
orbit_admin() {
  docker compose --project-name unbought \
    -f /var/lib/unbought/current/compose.json exec -T orbit-api orbit "$@"
}
orbit_admin universe list
orbit_admin universe show --universe "$ORBIT_BETA"
orbit_admin rules export --universe "$ORBIT_BETA" --out /tmp/rules-before-colony.json
docker compose --project-name unbought -f /var/lib/unbought/current/compose.json \
  cp orbit-api:/tmp/rules-before-colony.json /absolute/private/rules-before-colony.json
```

Save the export durably, then transfer that non-secret rules document to the
reviewed checkout through the operator's approved channel. On the workstation:

```sh
node scripts/prepare-colonization-rules.mjs \
  /absolute/private/rules-before-colony.json /absolute/private/rules-colony.json
```

Review the semantic diff against the intended values above, including customized
existing Colony Ship values if present. Transfer the proposal back to the host:

```sh
docker compose --project-name unbought -f /var/lib/unbought/current/compose.json \
  cp /absolute/private/rules-colony.json orbit-api:/tmp/rules-colony.json
orbit_admin rules diff --universe "$ORBIT_BETA" --file /tmp/rules-colony.json
# Live mutation: execute only at the separately authorized activation step.
orbit_admin rules apply --universe "$ORBIT_BETA" --file /tmp/rules-colony.json
orbit_admin rules export --universe "$ORBIT_BETA" --out /tmp/rules-after-colony.json
orbit_admin universe show --universe "$ORBIT_BETA"
orbit_admin audit --universe "$ORBIT_BETA"
docker compose --project-name unbought -f /var/lib/unbought/current/compose.json \
  cp orbit-api:/tmp/rules-after-colony.json /absolute/private/rules-after-colony.json
```

Save the diff, result, effective timestamp, rules revision/hash, after-export,
audit result, deployment record and backup reference. With both research
predecessors already active, initialization should add no research/building
keys. A stale proposal needs a new export, patch and review. In scoped mode a
pending activation remains durable: retry the identical file to observe Applied
or AlreadyActive; disconnection does not cancel it. Serial/preparing mode's busy
boundary queues nothing. Preserve the existing runtime mode.

## Post-activation checks and recovery

Refresh an existing account. Verify the complete graph: Lab 2/Energy 1 permits
Impulse; Lab 3/Espionage 4/Impulse 3 permits Astrophysics; Yard 4/Impulse 3 permits
Colony Ship construction. Existing completed levels and paid queues survive.
A normal subsequent signup has explicit zero research, the original homeworld
grant, and the same enabled catalog. Do not create test accounts, grant progress,
or spend a player's resources without separate authorization.

During authorized normal play, verify galaxy position locks and capacity warning,
quote fuel/cargo, one accepted launch, recall, one colony/result, origin-preserving
body selection, usable colony resources and transport/deployment. Check successful
ship consumption, extra-ship return and failure returns. Confirm old active
flights retain their deadlines and payments. The local validation record supplies
controlled race/replay evidence; it is not a claim that live journeys were run.

Containment is a new current-revision export with
`world.colonization.enabled=false`; optionally disable the ColonyShip catalog
entry to stop new construction. Keep its definitions, generation profile,
research levels, existing colonies and genesis records. This stops new Colonize
and Deploy launches while accepted flights and paid batches still resolve.
It does not reverse consumed ships, grants or established colonies.

Do not restore the pre-feature rules export by removing definitions, or downgrade
to a binary that cannot read EmptyPosition, ColonyShip drive terms, colony
metadata or the new terminal states. Prefer a compatible forward fix. A full
restore requires separately approved maintenance: fence every writer, restore a
matching pre-activation database backup and compatible images, follow epoch,
session and receipt restore procedures, and disclose lost post-backup progress.
There is no automatic rollback or reverse migration. Clean up only temporary
operator files after durable evidence is saved; never reset the beta.

Local results and exact source revisions: [colonization validation](../verification/colonization.md).

# Hyperspace Technology

Hyperspace Technology is player-wide research using the existing quote, payment,
cancellation and completion machinery. Its ID, artwork and wire vocabulary
already exist; no schema migration or protocol change is required.

The initiating planet needs a completed Research Lab 7. The player needs completed
Energy Technology 5 and Shielding Technology 5. Level 1 costs 0 metal, 4,000 crystal
and 2,000 deuterium; costs double each level. At universe speed 5 and Lab 7,
levels 1–3 take 360, 720 and 1,440 seconds. The initiating planet pays, and the
completed level applies throughout the player's universe. Paid or queued levels
do not satisfy prerequisites. Existing research/Lab exclusion, exact cancellation
refunds and completion-at-deadline rules apply.

This is prerequisite research with no per-level cargo, speed, combat, production
or construction bonus. It unlocks [Hyperspace Drive](hyperspace-drive.md) at level 3
and [Destroyers](destroyer.md) at level 5 with Shipyard 9 and Hyperspace Drive 6
in the standard bundle. Higher levels remain researchable within numeric limits. Hyperspace Technology itself does not
change Bomber propulsion.

## Prepare and activate

`rules/content/hyperspace-technology.json` supplies the reviewed costs and gates
to the standard bundle. Fresh `orbit setup` and `orbit universe create` include
the technology. Existing universes retain their saved rules across deployment
and restart until explicit activation.

After deploying the supporting image to every API, worker and operator process,
use that image's binary with the service database configuration:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

This upgrades the entire standard bundle, including any missing earlier content.
On an otherwise current standard world, the technology addition initializes Hyperspace
Technology level 0 for existing players; the current bundle also initializes
Hyperspace Drive as described in its activation guide. New signups receive level 0 too. Existing
levels, payments, timings, balances, inventories, sessions and universe identity
are preserved. Retain the diff, effective revision/hash and audit result. Refresh
clients after activation. A repeated successful upgrade is a no-op; if pending,
rerun the same binary's command to observe the queued activation.

Customized bundle-owned costs or prerequisites, intentionally disabled content
and disabled base prerequisites produce conflicts rather than silent overwrites.
Use the existing export/diff/apply workflow for selective or custom activation.
See [Rules updates](rules-updates.md) for the full operational contract.

To stop new research, disable its catalog entry and its Hyperspace Drive and Destroyer dependents
using a fresh export and forward apply. Retain its definition and earned levels. Already-paid work keeps its
accepted payment and completion time; cancellation refunds its original payment.
A standard upgrade will not silently re-enable deliberately disabled technology.
Removing its definition or replaying an older export is not a rollback.

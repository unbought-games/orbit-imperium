# Plasma Turrets

Plasma Turrets use the existing defense manufacturing, inventory and combat paths.
Their ID, wire vocabulary and artwork already exist; no schema migration or
protocol change is required.

The selected classic rules require completed Shipyard 8 on the producing planet
and completed player-wide Plasma Technology 7. Plasma's transitive prerequisites
remain Research Lab 4, Energy Technology 8, Laser Technology 10 and Ion Technology 5.
A turret costs 50,000 metal, 50,000 crystal and 30,000 deuterium. Base attack is
3,000, shield is 300 and hull is derived as one tenth of metal plus crystal: 10,000.
Weapons, Shielding and Armour Technology apply their ordinary combat bonuses;
additional Plasma levels do not improve turret stats or manufacturing time.

At universe speed 5 and Shipyard 8, each turret takes 3,200 seconds. Ships and
defenses share the normal FIFO queue, with costs paid for the entire accepted
batch. Turrets use no building fields and have no one-per-planet restriction.
They are stationary and cannot join fleets. The selected classic rapid-fire
matrix has no outgoing or incoming rapid fire for Plasma Turrets. Destroyed
turrets use the ordinary independent 70% defense recovery rule and generate no
defense debris. Combat, espionage reports and the simulator use the same unit ID.

## Activation

`rules/content/plasma-turret.json` defines the standard bundle's reviewed costs,
gates and combat values. Fresh `orbit setup` and `orbit universe create` include
turrets. Existing universes keep their saved rules until explicitly upgraded.
After deploying the supporting image to every API, worker and operator process,
use that image's binary and the service database configuration:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

This upgrades the entire standard bundle, including missing prerequisites and
earlier content. It requires no per-content script or manual database edit.
Turrets need no zero-count inventory initialization. Existing research, inventory,
paid work, balances and universe identity are preserved. Retain the diff,
effective revision/hash and audit result; refresh clients after activation.
A repeated successful upgrade is a no-op. If pending, rerun the same binary's
command to observe the queued activation. Customized definitions and deliberately
disabled content produce conflicts rather than being overwritten.
See [Rules updates](rules-updates.md) for the complete operational contract.

To stop new turret orders, disable only its catalog entry with a fresh export and
forward apply. Retain its costs, combat definition and inventories. Already-paid
batches retain their accepted costs and completion times, and existing turrets
remain valid combat units. Standard upgrade will not silently re-enable this
intentionally disabled content. Removing definitions or applying an old export
is not a rollback.

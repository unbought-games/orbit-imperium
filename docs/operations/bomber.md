# Bomber

Bombers require completed Shipyard 8 on the producing planet and player-wide
Impulse Drive 6 and Plasma Technology 5. Plasma requires Research Lab 4, Energy 8,
Laser 10 and Ion 5; there is no redundant Laser gate on the ship itself.

This release implements Impulse propulsion at every research level. Hyperspace
Technology, Hyperspace Drive and the later Bomber drive switch remain unavailable.

## Selected rules

`rules/content/bomber.json` supplies the standard bundle's gates, costs,
propulsion, combat and rapid fire. The selected classic values follow the private
reference archive's `original-docs/game/ships.md`,
`specs/manufacturing-inventories.md`, `specs/fleet-missions.md` and
`specs/combat-raiding.md`.

| Property | Value |
| --- | --- |
| Cost | 50,000 metal, 25,000 crystal, 15,000 deuterium |
| Base hull / attack / shield | 7,500 / 1,000 / 500 |
| Cargo | 500, shared with mission fuel |
| Base speed | 4,000; Impulse adds 20% of base per completed level |
| Speed at Impulse 6 | 8,800 |
| Fuel coefficient | 1,000; actual fuel depends on the flight |
| Rapid fire | Rocket Launchers and Light Lasers 20; Heavy Lasers and Ion Cannons 10; Espionage Probes and Solar Satellites 5 |

There is no rapid fire against Gauss Cannons, Plasma Turrets or shield domes.
Relationships involving unsupported future ships are not activated. Hull derives
from metal plus crystal cost; Weapons, Shielding and Armour improve the usual
combat stats. Plasma only unlocks construction. At Shipyard 8 and economy speed 5,
one Bomber takes 2,400 seconds; deuterium is charged but does not add build time.

## Activation and retained work

Fresh setup and universe creation include Bombers. Deploy the supporting server,
worker, operator binary and client before activating an existing universe:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

This upgrades the entire standard bundle. On an otherwise current world, adding
Bomber needs no research initialization, inventory backfill, database migration
or protocol change. Retain the diff, effective revision/hash and audit result;
refresh clients after activation. Repeating the upgrade is a no-op. Customized
or intentionally disabled bundle content produces conflicts for review, rather
than being silently overwritten. See [Rules updates](rules-updates.md).

To block new construction, disable Bomber's catalog entry using a fresh export
and forward apply. Keep its ship, manufacturing and combat definitions. Paid
batches finish with their accepted costs and deadlines, existing Bombers can fly
and fight, and running flights retain their committed terms. Disabling Plasma or
Impulse research also requires disabling dependent construction catalog entries.

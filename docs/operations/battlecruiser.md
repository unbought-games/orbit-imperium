# Battlecruiser

Battlecruisers require completed Shipyard 8 on the producing planet and
player-wide Laser Technology 12, Hyperspace Technology 5 and Hyperspace Drive 5.
All prerequisites already exist. The research chain requires Research Lab 7,
Energy Technology 5 and Shielding Technology 5; Laser itself requires Lab 1 and
Energy 2. Queued research does not satisfy these gates.

`rules/content/battlecruiser.json` owns the standard bundle's gates, price,
propulsion, combat and rapid fire. Values follow the private reference archive's
`original-docs/game/ships.md`, `specs/manufacturing-inventories.md`,
`specs/fleet-missions.md` and `specs/combat-raiding.md`, using the released
Battlecruiser values rather than its superseded beta statistics.

| Property | Value |
| --- | --- |
| Cost | 30,000 metal, 40,000 crystal, 15,000 deuterium |
| Base hull / attack / shield | 7,000 / 700 / 400 |
| Cargo | 750, shared with resources and mission fuel |
| Base speed | 10,000; Hyperspace Drive adds 30% of base per completed level |
| Speed at Hyperspace Drive 5 | 25,000 |
| Fuel coefficient | 250; actual fuel depends on the flight |
| Rapid fire | Small Cargo and Large Cargo 3; Heavy Fighters and Cruisers 4; Espionage Probes and Solar Satellites 5 |

Battleships, Destroyers and Dreadnoughts remain unavailable. Their rapid-fire
relationships belong with their content additions. Battlecruisers have no rapid
fire against Light Fighters, Bombers or defenses. Hull derives from metal plus
crystal cost. Weapons, Shielding and Armour improve combat stats; Laser and
Hyperspace Technology only unlock construction. Drive bonuses do not stack.
At Shipyard 8 and economy speed 5, each Battlecruiser takes 2,240 seconds.
Deuterium is charged but does not add build time.

## Activation and retained work

Fresh setup and universe creation include Battlecruisers. Existing universes
keep saved rules until explicitly upgraded. Deploy the supporting API, worker,
operator binary and frontend before activation:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

This upgrades the entire standard bundle. On an otherwise current world,
Battlecruiser activation adds no research facts, inventories, database migration,
endpoint or protocol version. Existing ship IDs and art are reused. Older worlds
receive prerequisite content through the same bundle. Retain the reviewed diff,
effective revision/hash and audit result; refresh clients after activation.
Repeating the upgrade is a no-op. Customized or intentionally disabled content
produces conflicts for review, rather than being overwritten. See
[Rules updates](rules-updates.md).

To stop new construction, disable the Battlecruiser catalog entry with a fresh
export and forward apply. Keep its movement, manufacturing and combat definitions.
Paid batches finish at their accepted prices and deadlines; existing ships still
fly and fight. Launched fleets keep committed timing and fuel across research and
rules changes. Disabling Laser, Hyperspace Technology or Hyperspace Drive also
requires disabling their dependent construction entries. Removing definitions or
applying an older export is not a compatible rollback.

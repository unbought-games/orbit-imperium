# Battleship

Battleships require completed Shipyard 7 on the producing planet and player-wide
Hyperspace Drive 4. The prerequisite chain is already available: Robotics Factory 2
for the Shipyard; Research Lab 7 and Hyperspace Technology 3 for the Drive;
Energy Technology 5 and Shielding Technology 5 for Hyperspace Technology.

`rules/content/battleship.json` owns the gates, cost, propulsion, combat and rapid
fire, following the private reference archive's `original-docs/game/ships.md`,
`specs/manufacturing-inventories.md`, `specs/fleet-missions.md` and
`specs/combat-raiding.md`.

| Property | Value |
| --- | --- |
| Cost | 45,000 metal, 15,000 crystal, no deuterium |
| Base hull / attack / shield | 6,000 / 1,000 / 200 |
| Cargo | 1,500, shared with mission fuel |
| Base speed | 10,000; Hyperspace Drive adds 30% of base per completed level |
| Speed at Hyperspace Drive 4 | 22,000 |
| Fuel coefficient | 500; actual fuel depends on the flight |
| Rapid fire | Espionage Probes and Solar Satellites: 5 |

Hull derives from metal plus crystal cost. Weapons, Shielding and Armour apply
normal combat bonuses. Other drives and Hyperspace Technology add no speed or
cargo bonus. At Shipyard 7 and economy speed 5, one Battleship takes 2,160 seconds.
Battlecruisers have rapid fire 7 against Battleships. Relationships involving
unsupported Dreadnoughts remain inactive.

## Activation and retained work

Standard content bundle 0.8.0 includes Battleships for fresh setup and universe
creation. Existing worlds retain their saved rules until activation. Deploy the
supporting API, worker, operator binary and client everywhere before running:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

On the preceding Hyperspace Drive bundle, this adds only Battleship definitions;
no migration, protocol change, research initialization or inventory backfill is
needed. Older worlds also receive preceding bundle additions. Preserve the diff,
effective revision/hash and audit result, and refresh clients after activation.
Repeated upgrades are no-ops. Customized or intentionally disabled content yields
conflicts instead of being overwritten. See [Rules updates](rules-updates.md).

To stop new construction, disable the Battleship catalog entry with a fresh export
and forward apply. Retain its ship, manufacturing and combat definitions. Paid
batches finish at their accepted costs and deadlines; existing Battleships still
fly and fight. Flights retain committed terms across research changes and restart.
Disabling Hyperspace Drive research also requires disabling dependent Battleship,
Battlecruiser and Destroyer construction.

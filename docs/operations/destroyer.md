# Destroyer

Destroyers require completed Shipyard 9 on the producing planet and player-wide
Hyperspace Technology 5 and Hyperspace Drive 6. Both research prerequisites already
exist. The research chain needs Research Lab 7, Energy Technology 5 and Shielding
Technology 5; Shipyard requires Robotics Factory 2. Queued levels do not qualify.

## Selected rules

`rules/content/destroyer.json` supplies the standard bundle's gates, costs,
propulsion, combat and rapid fire. Values follow the private reference archive's
`original-docs/game/ships.md`, `specs/manufacturing-inventories.md`,
`specs/fleet-missions.md` and `specs/combat-raiding.md`.

| Property | Value |
| --- | --- |
| Cost | 60,000 metal, 50,000 crystal, 15,000 deuterium |
| Base hull / attack / shield | 11,000 / 2,000 / 500 |
| Cargo | 2,000, shared with mission fuel |
| Base speed | 5,000; Hyperspace Drive adds 30% of base per completed level |
| Speed at Hyperspace Drive 6 | 14,000 |
| Fuel coefficient | 1,000; actual fuel depends on the flight |
| Rapid fire | Light Lasers 10; Battlecruisers 2; Espionage Probes and Solar Satellites 5 |

This is native Hyperspace propulsion with no drive switch. Impulse, Combustion
and Hyperspace Technology levels do not add speed. Hull derives from metal plus
crystal cost; Weapons, Shielding and Armour apply the usual combat bonuses.
At Shipyard 9, no Nanite Factory and economy speed 5, one Destroyer takes 3,168
seconds. Deuterium is charged but does not add manufacturing time.

The reference's Destroyer → Battlecruiser factor 2 is active. Dreadnought →
Destroyer factor 5 remains deferred until Dreadnoughts are supported. No unrelated ships,
missions or combat bonuses are enabled by this addition.

## Activation and retained work

The standard content bundle is 0.8.0. Fresh setup and universe creation include
Destroyers. Existing universes retain their saved rules until explicit activation.
Deploy the supporting server, worker, operator binary and client everywhere first:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

This upgrades the entire standard bundle. On an otherwise current world, Destroyer
needs no research initialization, inventory backfill, database migration or protocol
change. Existing IDs, artwork, catalog, manufacturing, fleet and combat interfaces
are reused. Retain the diff, effective revision/hash and audit result; refresh
clients after activation. Repeating the upgrade is a no-op. Customized or
intentionally disabled bundle content produces conflicts for review.
See [Rules updates](rules-updates.md).

To stop new construction, disable the Destroyer catalog entry using a fresh export
and forward apply. Retain its ship, manufacturing and combat definitions. Paid
batches complete at their accepted costs and deadlines, existing Destroyers can
fly and fight, and running fleets retain their committed terms. Disabling either
Hyperspace research also requires disabling dependent construction entries.

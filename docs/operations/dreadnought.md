# Dreadnought

Build Dreadnoughts at Shipyard 12 on a planet or moon with completed Hyperspace
Technology 6, Hyperspace Drive 7 and Graviton Technology 1. The producing body
pays 5,000,000 metal, 4,000,000 crystal and 1,000,000 deuterium per ship. The
power threshold applies when starting Graviton research. Once earned, Graviton
qualifies every eligible yard in the empire.

At universe speed 5, Shipyard 12 and Nanite 0, one ship takes 199,384 seconds.
Its base hull is 900,000, attack 200,000 and shield 50,000. Base speed is 100,
with 30% of base added per Hyperspace Drive level. At Drive 7 its speed is 310.
Cargo capacity is 1,000,000, shared with flight fuel. The fuel coefficient is 1.
A Dreadnought on allied hold consumes 0.1 deuterium per hour before fleet rounding.

| Rapid-fire factor | Targets |
| ---: | --- |
| 1,250 | Espionage Probes, Solar Satellites |
| 250 | Small Cargo, Large Cargo, Colony Ships, Recyclers |
| 200 | Light Fighters, Rocket Launchers, Light Lasers |
| 100 | Heavy Fighters, Heavy Lasers, Ion Cannons |
| 50 | Gauss Cannons |
| 33 | Cruisers |
| 30 | Battleships |
| 25 | Bombers |
| 15 | Battlecruisers |
| 5 | Destroyers |

Shots against Plasma Turrets, both shield domes and other Dreadnoughts end the
firing sequence. Ordinary battles on moons can destroy stationed units. The moon
survives. The combat simulator uses the same rules and shot resolution as a raid.

## Activation

Fresh universes receive this ship in standard content bundle 0.18.0. Deploy
compatible API, workers, operator CLI and web client before activating a retained
universe. Preview the whole-bundle diff, apply it and record the effective
revision, hash and audit result.

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

The ship reuses the existing inventory, fleet and report identifiers. The upgrade
preserves customized rules through the normal conflict checks. To stop new
orders, disable the catalog entry through a fresh export and forward apply.
Keep ship, cost and combat definitions so paid batches can finish and existing
ships can fly and fight. See [Rules updates](rules-updates.md).

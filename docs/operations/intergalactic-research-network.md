# Intergalactic Research Network

Intergalactic Research Network (IRN) links completed Research Labs on a player's
planets in one universe. Each completed level permits one additional lab. It does
not create another research slot or share resources between planets.

The initiating planet requires Research Lab 10, and the player needs Computer
Technology 8 and Hyperspace Technology 8. Level 1 costs 240,000 metal, 400,000
crystal and 160,000 deuterium. Costs double each level.

## Selection and timing

The origin always participates and must independently meet the technology's lab
requirement. Other owned planets must individually meet that same requirement.
Moons and foreign planets never contribute. The server selects up to the completed
IRN level in remote labs, ordered by completed lab level descending, then body ID
ascending. No player selection or cached effective lab level is stored.

Research time in seconds is:

```text
max(1, floor(3600 × (metal + crystal) / (1000 × (1 + sum of lab levels) × universe speed)))
```

Costs in this formula are whole resource units. Deuterium, Robotics and Nanite
levels do not enter the formula. There is one +1 for the entire network. For
example, Hyperspace Technology 1 with origin Lab 7, remote Lab 12 and IRN 1 takes
720 seconds at speed 1. A remote Lab 6 is ineligible for that technology.

The operation stores the selected lab IDs and completed levels as immutable
historical inputs, together with the accepted payment and deadline. The effective
total is derived from those inputs. Researching IRN itself uses the old completed
network level. Changing the network, labs or rules does not retime paid research.
Only the origin pays; cancellation before completion returns its exact original
payment, including above storage capacity.

Research blocks every Lab upgrade/demolition in the player's universe. Any active
Lab construction blocks research. Other construction remains available. The
origin and contributing colonies cannot be abandoned until research finishes or
is cancelled. The inspector shows the server-selected labs, including the fixed
snapshot for active work viewed from another planet.

## Activate in an existing universe

The standard content bundle 0.16.0 includes
`rules/content/intergalactic-research-network.json`. Fresh setup and universe
creation include IRN. Deployment alone does not change an existing universe's
saved rules. No database migration or wire protocol change is needed.

Deploy the supporting binary to every API, worker and operator process before
activating the bundle with that binary:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

Retain the reviewed diff, effective revision/hash and audit result. The upgrade
initializes existing players at level 0; new players also receive level 0. Already
paid research keeps its payment, labs and deadline. Repeating a successful
upgrade is a no-op. Customized bundle-owned costs or prerequisites and deliberately
disabled content produce conflicts; use export/diff/apply for selective changes.
Refresh clients after activation. See [Rules updates](rules-updates.md).

To stop new IRN upgrades, disable its catalog entry with a forward rules update.
Keep its definition and completed levels. Earned network levels continue to
accelerate future research, and active operations retain their accepted terms.
Removing the research definition or applying an older export is not a rollback.

Operator-created research uses the same lab selector. Cost valuation for granted
research levels is independent of laboratory selection.

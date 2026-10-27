# Laser Technology and Light Laser

This addition uses the existing research, shared shipyard queue, inventory,
combat and rules-activation machinery. It introduces no schema migration or wire
protocol change. Deployment preserves each universe's saved rules. Activation is
an explicit per-universe operation; this document is not a deployment record.

## Reference values

The private reference archive is `orbit-internal-docs/original-docs/`.
`specs/research-progression.md` (complete research catalog),
`specs/manufacturing-inventories.md` (complete defense catalog), and
`specs/combat-raiding.md` (unit statistics, rapid fire and recovery) specify:

| Content | Cost (metal / crystal / deuterium) | Completed prerequisites |
| --- | --- | --- |
| Laser Technology level 1 | 200 / 100 / 0, doubling each level | Local Research Lab 1; player Energy Technology 2 |
| Light Laser, each | 1,500 / 500 / 0 | Local Shipyard 2; player Energy Technology 1 and Laser Technology 3 |

Shipyard requires local Robotics Factory 2. Energy Technology requires Lab 1.
Thus the reachable chain requires Energy 2, despite the defense's direct Energy 1
gate. Laser levels 1–3 cost 1,400 / 700 / 0 in total. Research is player-wide;
facilities belong to their planet. Only completed levels satisfy prerequisites.
Laser Technology is an unlock technology; Weapons Technology controls damage.

At speed 5 and Lab 1, Laser levels 1–3 take 108, 216 and 432 seconds. A Light
Laser at Shipyard 2 takes 192 seconds. Higher completed facilities and the
universe's speed feed the existing integer duration formulas. Full batch payment
occurs at append, units finish individually in the existing FIFO, and there is no
ordinary manufacturing cancellation or refund. Light Lasers use no building
fields and have no dome-style uniqueness limit.

Base hull / attack / shield are 200 / 100 / 25. Hull is derived from metal plus
crystal; the combat artifact records attack 10,000 and shield 2,500 in hundredths.
Existing Armour, Weapons and Shielding bonuses apply. Lasers have no outgoing
rapid fire. The [Bomber bundle](bomber.md) supplies rapid fire 20 against them.
The reference's Destroyer 10 and Deathstar 200 pairs belong with those future ships. Existing defense recovery (default independent 70% per destroyed
unit), no defense debris, report and valuation behavior apply unchanged.

## Prepare and activate

`rules/content/light-laser.json` contains the reviewed feature data.
`scripts/prepare-light-laser-rules.mjs` enables both entries together, adds their
research/manufacturing/combat definitions, and preserves export identity, speed,
topology and unrelated custom values. It deliberately replaces existing values
for these two entries; inspect that diff if the universe already customized them.
`rules/mvp-v1-slice-8.json` is the immutable complete fixture following Heavy Fighter slice 7;
it is not a replacement for a live universe export or a new-world default.

Deploy the reviewed release across API and worker instances, then follow the
[normal rules activation workflow](rules-updates.md). Using the deployed operator
binary and the intended universe:

```sh
orbit rules export --universe <id> --out rules-before.json
node scripts/prepare-light-laser-rules.mjs rules-before.json rules-light-laser.json
orbit rules diff --universe <id> --file rules-light-laser.json
orbit rules apply --universe <id> --file rules-light-laser.json
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

The preparation script runs from this checkout on the exported file. Transfer
that proposal through the normal operator channel if the binary is on another
host. Output files are exclusive: use a fresh path rather than overwriting prior
evidence. Review and retain the before/after exports, semantic diff, effective
revision/hash and audit result. A stale proposal requires a new export and diff;
a pending scoped activation is observed by retrying the identical proposal.

The expected initialization delta is only Laser Technology at level 0 for
existing players (or no delta if already defined). New signups also receive it
at 0. Inventory stays sparse; do not insert zero-defense rows or reset accounts.
Existing completed research, units, sessions, epoch and paid jobs are retained.
Refresh the client after activation and verify prerequisites, prices, artwork,
completed inventory and queue behavior. Local tests provide controlled research,
manufacturing and combat evidence without spending live players' resources.

To contain a problem, export the current revision and disable the LightLaser
catalog entry. To also stop new laser research, disable LaserTechnology in the
same proposal. Keep both definitions, costs and combat data. Existing research
and inventories remain, paid jobs complete using their accepted terms, and
stationed lasers still fight. Removing the definitions or restoring an older
export is rejected; use a compatible forward fix.

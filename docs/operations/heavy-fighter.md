# Heavy Fighter rollout

Heavy Fighters require Shipyard 3 on the producing planet, Armour Technology 2,
and Impulse Drive 2. Shipyard requires Robotics Factory 2; both research paths
need Research Lab 2, and Impulse Drive also requires Energy Technology 1.
These buildings and technologies already have implementations.

## Selected numbers

The original reference documents in `orbit-internal-docs/original-docs` specify
these values: `game/ships.md` (catalog and movement),
`specs/manufacturing-inventories.md` (construction gates),
`specs/fleet-missions.md` (propulsion), and `specs/combat-raiding.md` (combat and
rapid fire). The checked-in content is `rules/content/heavy-fighter.json`.

| Property | Value |
| --- | --- |
| Cost, metal/crystal/deuterium | 6,000 / 4,000 / 0 |
| Base combat hull / attack / shield | 1,000 / 150 / 25 |
| Cargo capacity | 100, shared with mission fuel |
| Base speed | 10,000, Impulse Drive +20% of base per level |
| Flight fuel coefficient | 75, not a flat mission cost or hourly rate |
| Rapid fire | 3 against Small Cargo; 5 against Espionage Probes |

Hull and researched stats are derived by the existing combat engine. At the
minimum Armour 2 / Impulse 2, hull is 1,200 and speed is 14,000. The existing
manufacturing formula applies: at Shipyard 3, one ship takes 3,600 seconds at
1× economy speed or 360 seconds at 10×.

The historical matrix also contains relationships involving Solar Satellites,
Battlecruisers, and Deathstars. Those ships remain unsupported; their eventual
content additions must add the corresponding relationships. References to
undefined combat units are rejected by the rules validator.

## Activate an existing universe

Deploy the compatible server and frontend to every instance first. New-world
defaults and retained immutable artifacts are unchanged. No database migration,
inventory backfill, reset, or new protocol is required.

Export the active configuration with the deployed operator binary:

```sh
orbit rules export --universe <id> --out rules-before.json
```

If Impulse Drive is not yet enabled, prepare its existing package first. It
includes the required Small Cargo propulsion switch at Impulse 5:

```sh
node scripts/prepare-impulse-rules.mjs rules-before.json rules-impulse.json
node scripts/prepare-heavy-fighter-rules.mjs rules-impulse.json rules-heavy-fighter.json
```

If Impulse Drive is already enabled, preserve its customized costs and settings:

```sh
node scripts/prepare-heavy-fighter-rules.mjs rules-before.json rules-heavy-fighter.json
```

The Heavy Fighter patch requires enabled, defined Armour Technology and Impulse
Drive. It preserves universe identity, base revision, speed, other ships,
research, and unrelated rules. It replaces only Heavy Fighter's catalog gates,
ship/cost/combat definition and its two supported rapid-fire pairs. Output files
must not already exist. Review and apply:

```sh
orbit rules diff --universe <id> --file rules-heavy-fighter.json
orbit rules apply --universe <id> --file rules-heavy-fighter.json
```

Refresh clients after activation. The generic rules activation initializes any
new research facts; inventories remain sparse. `mvp-v1-slice-7.json` is a test
fixture for the combined colony/Heavy Fighter profile, not an automatic rollout.

Disabling the Heavy Fighter catalog entry blocks new manufacture. Keep its
movement, costs and combat definitions: paid batches still complete, owned ships
can fly and fight, and accepted flights preserve committed terms. Rollback after
activation requires a binary that understands Heavy Fighter definitions. Follow
[rules updates](rules-updates.md) for activation ordering and retained work.

## Validation

`make check` covers tooling, client/server tests, lint, contracts, and the web
build. `npm run test:ui -- heavy-fighter.spec.ts` covers fixture-based shipyard
and dispatch behavior. Engine tests cover all three construction gates, payment
and completion, propulsion, combat technology bonuses, rapid fire, retained
production, combat reports, and return conservation. The preparation-script tests
verify idempotence, preservation of custom settings, prerequisite rejection, and
agreement between the content patch and the complete fixture.

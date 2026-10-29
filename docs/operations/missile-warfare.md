# Missile warfare

Missile Silos, Anti-Ballistic Missiles and Interplanetary Missiles are one standard
content addition. Missile inventory uses the shared paid manufacturing queue,
but missiles never participate in fleet battles, cargo, fleet slots or defense
recovery. Existing atlas artwork is reused.

## Rules

`rules/content/missile-warfare.json` owns the profile and catalog definitions.

| Item | Requirements | Metal | Crystal | Deuterium |
| --- | --- | ---: | ---: | ---: |
| Missile Silo level 1 | Shipyard 1 | 20,000 | 20,000 | 1,000 |
| Anti-Ballistic Missile | Shipyard 1, Silo 2 | 8,000 | 0 | 2,000 |
| Interplanetary Missile | Shipyard 1, Silo 4, Impulse Drive 1 | 12,500 | 2,500 | 10,000 |

Silo costs double per level. Standard capacity is 10 slots per completed silo
level; interceptors occupy one slot and offensive missiles occupy two. Occupancy
and reservations derive from completed inventory and unfinished paid batches.
Completion converts reserved slots to occupied slots without double counting.
Upgrades do not grant capacity early; existing missiles stay operational during
construction. Demolition requires no completed or queued missiles, and missile
manufacturing is blocked during demolition. Scrapping removes completed missiles
with no refund. It does not cancel paid manufacturing.

Launch range is `5 × completed Impulse Drive − 1` systems in the same galaxy,
using linear system distance. Different positions in one system have distance
zero. Flight time is `max(1, ceil(1000 × (30 + 60 × distance) / speed))`
milliseconds. There is no additional fuel charge or recall. Weapons Technology,
missile rules, speed and arrival deadline are fixed at launch. Later universe
speed changes affect new launches only, following the current game's commitment
policy rather than the older specification's immutable-speed assumption.

At impact, each then-available Anti-Ballistic Missile stops one incoming missile.
Interception consumes the interceptor and incoming missile. Remaining missiles
pool their attack, with 12,000 base attack and +10% per launch-time Weapons level.
Current defender Armour Technology increases defense hull by 10% per level.
Shields, Shielding Technology, rapid fire and ordinary combat rounds do not apply.

A present primary defense is visited first. Other initially nonempty defense
types start in lexical key order and receive one Fisher–Yates permutation from
the private `missile-target` random stream. Each type loses
`min(count, floor(remaining_power / full_hull))` units; residual power carries to
the next type. Surviving units retain no partial damage. Missiles can destroy
ordinary defenses and both shield domes, but never ships, satellites, buildings,
resources or stored missiles. There is no repair, debris, plunder or moon roll.
Separate volleys never pool their damage.

The timing coefficient and pooled/random allocation are selected adjustable
compatibility rules, not a claim of exact historical proprietary implementation.
The algorithm is versioned as `oi-classic-missile-v1`. New algorithms must retain
replay compatibility; do not change the meaning of an existing version.

## Runtime and privacy

`MissileFlight` is distinct from fleet missions. Launch atomically debits completed
inventory and its valuation lineage, records immutable terms and creates an
ordered impact event. Impacts atomically debit interceptors, remove defenses,
record the random cursor, terminalize the flight, publish recipient snapshots
and invalidate affected views. Terminal or stale-generation retries are inert.
Ordinary raids exclude missile inventory at battle assembly.

Launch applies the existing self-target, vacation, lifecycle and beginner
protection checks. Quotes disclose the bound target, distance, range and travel
terms, never enemy interceptor or defense inventory. Selecting an absent primary
is allowed and cannot probe hidden defenses. Protection is not rechecked at
impact. A removed or transferred target resolves as `NoTarget` with no retarget,
interceptor consumption or refund. Removing the origin does not cancel a flight.

Incoming views disclose count, attacker, coordinates, body kind and arrival only.
The Fleets screen merges missile attacks into its outgoing and incoming lists,
ordered by arrival alongside ship missions. Empire uses the same fleet movement
board and body traffic counts; missiles still consume no fleet slots and have no
recall action.
Attacker reports disclose sent/intercepted/penetrating counts and destroyed
defenses, not surviving defenders, Armour or remaining interceptors. Defender
reports include their remaining interceptors. Reports use the existing recipient
archive and retention rules. Espionage missile stock disclosure remains disabled;
this addition does not silently expand intelligence visibility.

## Moon integration

Live moon targeting and lunar manufacturing remain unavailable. A flight stores
its target identity separately from its interceptor body. The helper
`missile_interceptor_body` consumes an authoritative parent relationship, checks
kind/owner/coordinates, and identifies the shared planetary stock. Future moon
creation/lifecycle code must supply that relationship when binding launches;
coordinates alone must never infer parent identity. Moon sources remain invalid.

Synthetic lunar tests exercise shared parent interception, same-time ordered
planet/moon consumption and removed-moon `NoTarget` behavior. Enabling moons must
also load the authoritative parent relationship and neutral/abandoned lifecycle
facts; retained neutral targets are not enabled by this release. Parent ownership
and target binding must be revalidated without redirecting to replacement bodies.

Future phalanx projection should consume the separate flight records: expose
planet-targeted arrivals when scanning that planet, never moon-targeted flights
through the parent's scan. No missile return leg exists.

## Activation and tooling

Deploy the supporting binary/frontend to every API, worker and operator first.
Migration 0024 adds missile flight storage and active-owner/target indexes. Fresh
worlds include the feature; existing universes keep saved rules until activation:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

The standard upgrade initializes silo level zero and preserves all paid work,
resources, inventory and universe identity. Customized or deliberately disabled
bundle content produces conflicts. Disabling new missile construction/launches
must retain definitions for completed inventory and in-flight commitments. A
custom capacity change that cannot hold existing inventory and reservations is
rejected atomically.

World scenario `set`, `give` and `queue` edits accept a `missiles` map, and CLI
inventory commands accept the `missiles` category. Scenario export includes
completed and queued missiles with valuation. Export refuses active missile
flights explicitly rather than silently losing commitments; wait for impact.

## Validation

Engine fixtures cover capacity, completion, demolition guards, deterministic
interception/damage, private reports, duplicate events, changed rules, ordinary
raids and future parent/moon behavior. `make _db-missile_warfare` uses the existing
disposable database runner for manufacture → launch → speed change → restart →
impact → audit in serial and scoped modes. Client tests check capacity previews,
quote binding and incoming warnings. `npm run test:ui -- missile-warfare.spec.ts`
checks manufacturing, scrap, launch review, incoming flights and impact reports
at desktop and mobile sizes. Set `ORBIT_TEST_SCREENSHOTS=1` to retain captures.

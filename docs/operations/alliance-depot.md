# Allied holding and Alliance Depot

Players can send Hold missions to another player's planet when they share an
alliance or an accepted friendship. The host's block vetoes new holds and supply.
Holding does not require a Depot. Ships and cargo stay owned by the sender and
consume that sender's fleet slot throughout outbound, holding and return.

Choose 0, 1, 2, 4, 8, 16 or 32 real hours. Zero hours is a round trip without
participating in defense. Travel scales with universe speed; holding does not.
Holding consumes one tenth of each ship's launch fuel coefficient per hour,
rounded up to whole deuterium once across the complete fleet. Small Cargos use
1 deuterium/hour before Impulse Drive 5 and 2 afterward; Heavy Fighters use 7.5.
Travel and holding fuel are prepaid, reserve launch capacity, and are never
refunded. Later research does not change accepted rates or flight times.

At arrival, each planet admits at most five defending owners including its owner,
and sixteen visiting fleets. Inbound holds do not reserve capacity. An arrival
that cannot fit returns intact with a failure report. Relationship changes do
not revoke accepted inbound or current holds. Recall while holding and natural
expiry both return using the original one-way flight duration.

Held fleets fight with their owners' current combat research. Losses preserve
paid departure times; destroyed fleets release their slot once. Espionage includes
present held ships without revealing their owners' private research or cargo.
The host sees visiting owners, ship composition and departure times. Participants
receive authorized combat reports; alliance membership alone grants no reports or
access to the host's incoming movements or stockpiles.

## Depot supply

Alliance Depot is a planetary building with no direct prerequisite. Level one
costs 20,000 metal and 40,000 crystal; subsequent levels double the cost. Normal
construction, fields, cancellation and demolition rules apply.

The host can supply whole deuterium units to a currently held fleet. Fuel comes
from the host planet. Each completed Depot level permits 10,000 deuterium per
rolling real hour, calculated from committed payments. Idle hours do not bank
capacity. Supply extends the current departure immediately by:

`floor(supplied_micro_deuterium * 3_600_000 / surviving_fleet_micro_deuterium_per_hour)`

The rates remain those committed at launch. One Heavy Fighter supplied 1 deuterium
receives 480,000 milliseconds; 1,000 Light Fighters supplied 4,000 receive two hours.
Zero-millisecond extensions and numeric overflow reject without payment.

There is no extra fleet slot, flying rocket, hourly action cooldown, sender
permission toggle or maximum supplied lifetime. The sender can always recall.
Recall, losses and destruction restore neither fuel nor rolling budget. A later
supply prices the surviving fleet. Completed upgrades immediately increase the
budget; demolition may leave zero remaining budget until old usage expires.
Already paid time remains committed.

Supply requires an eligible current relationship, an enabled completed Depot,
active host and visitor accounts, and no vacation restriction. A pending deletion
for either player blocks new supply. Supply at the departure deadline is too late:
due departures precede commands. Command retries never debit or extend twice.

Planet abandonment rejects inbound and currently held allied fleets. Moon holding and
moon supply are not activated by this release. Coordinated attacks are available
through the separate [Alliance attacks](alliance-attacks.md) feature.

## Deployment and activation

Deploy compatible API, worker, frontend and operator binaries before activation.
Migration 0028 admits the Holding fleet leg, updates active-fleet indexing and adds
immutable Depot supply history. An older binary cannot process active Hold fleets;
do not roll back to it after activation.

Fresh setup and universe creation include the feature. Existing worlds retain
their selected rules until explicitly upgraded:

```sh
orbit rules upgrade --universe <uuid> --dry-run
orbit rules upgrade --universe <uuid>
```

Preview does not mutate gameplay. Apply initializes Depot level zero on retained
planets without changing paid work; repetition is a no-op. Custom definitions or
deliberately disabled content conflict instead of being overwritten. Preserve
holding rules and building definitions for accepted commitments when disabling
new construction. Disabling Depot construction also disables new supply, without
revoking time already paid.

Supply budgets are derived from immutable history; no replenishing balance or
cooldown is stored. Existing scoped scheduler indexes are extended when a visiting
fleet launches, so previously scheduled encounters include later defenders.
Relationship authorization is revalidated under the social transaction lock.

Scenario export rejects active Hold missions and unexpired supply budgets instead
of losing fleet commitments or restoring spent budget. Database backups retain
all fleet and supply history.

Focused checks: `make _db-holding`, `make _db-rules_updates`, engine holding tests,
and `npm run test:ui -- alliance-depot.spec.ts`. Routine CI uses the existing test
classes; no new scheduled or full-system validation job is required.

# Jump Gates

Jump Gates instantly transfer selected stationed mobile ships between two distinct
moons owned by the same player. Both moons need a completed gate. Construction
requires Lunar Base 1 and player Hyperspace Technology 7; level one costs
2,000,000 metal, 4,000,000 crystal and 2,000,000 deuterium, doubling per level.
Construction uses the ordinary lunar fields, queue, payments and timing rules.

`jump-gates-v1` commits a cooldown of `ceil(3600000 / speed)` milliseconds to
both endpoints. Gate level does not reduce it. Transfers carry no resources,
charge no fuel, create no flight or scheduled event, and occupy no fleet slot.
Parent inventories, allied holdings, unfinished ships, satellites and defenses
cannot be transferred. The destination needs its own fuel for later launches.

## Command and consistency

`JumpQuote { intent }` and `JumpShips { intent, expected_terms_hash }` use the
existing protocol-4 query and foreground-command envelopes. The source moon is
the foreground body. Terms bind the exact manifest, endpoints, cooldown and active
rules. Execution revalidates ownership, complete inventory and gate coverage,
completed levels, current readiness and player vacation/deletion policy.

The pure resolver changes source and destination inventories, relocates their
original asset lots, and records both gate uses in the same changeset. Asset
valuation and score are conserved. Player and both location scopes order jumps
against launches, combat and removal. Existing fact-hash validation rechecks the
snapshot before commit; due events retain normal scheduler precedence. The
ordinary command receipt and viewer update commit with the changeset. Repeating
the original command ID returns its receipt without another transfer or cooldown.

`GateUse` stores the last accepted input, use time, committed cooldown duration
and rules hash for one moon. Readiness is derived from that commitment. Neither
remaining seconds nor an eligibility flag is stored. Building upgrades and later
rules changes cannot shorten a previously committed cooldown. The two rows use
stable body IDs; planet abandonment and empire deletion remove them with the
body. New moons start with no prior use.

The owner projection includes derived `jump_gate` status on moons when enabled.
Other players receive no cooldown state. No mission is fabricated for phalanx
observation. The client derives pending source reservations and gate conflicts
from submitted commands; destination ships come from the authoritative refresh.
The facility form reviews the manifest and cooldown before submission, retains
uncertain attempts for receipt recovery, and never sends a jump on navigation.

## Deployment

See [Jump Gate operations](../operations/jump-gates.md). New fields default to
absent/empty and empty fields are omitted from historical serialization. Existing
snapshots and rules retain their old shape. Migration 0047 creates an empty table;
there is no startup backfill or traversal of journals. Normal deployment followed
by the existing rules upgrade enables construction and operation together.

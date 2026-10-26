# Espionage report combat simulation

An explicit **Simulate combat** action opens an editable draft from the player's
report-visible espionage snapshot. Forces and combat technology retain their
observation time; no target lookup occurs. Known empty sections mean zero, while
unknown sections remain blank until the player enters assumptions or explicitly
assumes zero. Edits are separate from report facts. Own technology defaults come
from the existing game view; attacking ship counts start at zero. The selected
planet's stationed inventory appears beside each attacker ship input as a live
reference, without restricting hypothetical counts.

The authenticated, CSRF-protected `POST /api/v4/universes/{universe}/combat-simulation`
endpoint accepts a bound context and two hypothetical forces. It validates the
binding/epoch, takes combat rules from that universe's current rules artifact,
and invokes `orbit_engine::resolve_battle` ten times. Fresh simulation randomness
has no connection to the universe's secret random stream. It does not admit a
command, mutate gameplay, consult target facts, or return player/body identifiers
from a battle. It is available to every protocol-4 player.

The initial interactive service supports 2,000 total units and technology 0–100,
with two CPU workers and no unbounded queue. Excess values are rejected, never
clamped. Empty known defenses are supported. Results are sample outcomes and mean
attacker losses alongside survivors, and defender survivors before repairs.
They exclude missiles, repair rolls and debris recovery. For each battle sample,
the server uses the universe's ship capacities and the same `payload_capacity`
and `raid_loot` functions as actual attacks. Only attacker victories can loot;
draws, defeats, mutual destruction and zero capacity yield zero. The UI aggregates
those samples into average/range cargo capacity and estimated resource haul,
including losing samples. It never calculates loot from an average fleet.

Only report-observed resource amounts are submitted; missing observations remain
unknown and yield no loot estimate. The report time/age remains visible and no
resource production or spending is forecast. Raiding-disabled universes return no
loot estimate. The estimate assumes empty arrival cargo and uses whole-unit,
five-pass loot allocation capped at half the observed stock of each resource.
Launch fuel is paid up front; surviving arrival capacity has no fuel deduction.
Fuel cost and launch feasibility are not computed, so the estimate is gross loot,
not profit or a guarantee. Resource values retain exact micro-unit arithmetic and
are displayed with canonical resource icons, rounded down to whole units. Scope
changes or input edits invalidate results. Large actual fleets can be explored only by explicitly editing the scenario, not by quietly
scaling down a report.

## Community simulator investigation

On 2026-10-25, the published Orbit Combat Desk page and its `app.mjs` module at
https://orbit-combat-desk.brian-making-things.chatgpt.site/ were inspected. Its
form creates defender values as zero, reads only attacker technology from local
storage, and has no URL/message/file import handler. Its page explicitly says
its OGame-style model may differ from Orbit Imperium. An ordinary external link
would lose the report data, and undocumented URL parameters would not work.
The native integration therefore reuses the game's combat implementation rather
than copying or modifying that independently owned simulator.

Coverage includes pure visibility/mapping and input validation tests, Rust engine
reuse with custom rule statistics, an authenticated HTTP integration test, and
fixture browser tests covering prefill, explicit unknown assumptions, request
contents, result invalidation, mobile widths and Escape/focus restoration.
